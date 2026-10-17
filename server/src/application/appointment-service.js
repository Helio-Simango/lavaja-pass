// Marcações e capacidade (I-8). Dois fluxos — fila e marcações — coordenados pela capacidade
// (postos, trabalhadores, reserva para a fila). Uma marcação confirmada só muda de horário se o
// cliente aceitar uma proposta (DEC-10).
import { addDays, localDateOf, localToIso } from '../domain/business-time.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import {
  AppointmentStatus,
  appointmentWindow,
  availableSlots,
  blockOf,
  findStation,
  initialStatus,
  OfferStatus,
  offerStateOf,
  parseSchedulingPolicy,
  planAppointmentTransition,
  planOffer,
  planOfferResponse,
  RESERVING_STATUSES,
} from '../domain/scheduling.js';
import { WashStatus } from '../domain/wash.js';
import { silentNotifier } from './ports.js';

const MINUTE_MS = 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AppointmentService {
  #appointments;
  #vehicles;
  #stations;
  #washes;
  #catalogService;
  #washService;
  #settingsService;
  #notifier;
  #unitOfWork;
  #clock;

  constructor({
    appointmentRepository,
    vehicleRepository,
    stationRepository,
    washRepository,
    catalogService,
    washService,
    settingsService,
    notifier = silentNotifier,
    unitOfWork,
    clock,
  }) {
    this.#appointments = appointmentRepository;
    this.#vehicles = vehicleRepository;
    this.#stations = stationRepository;
    this.#washes = washRepository;
    this.#catalogService = catalogService;
    this.#washService = washService;
    this.#settingsService = settingsService;
    this.#notifier = notifier;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  /** Política em vigor (parâmetros por validar: D-09 a D-14). */
  policy() {
    return parseSchedulingPolicy(this.#settingsService.get('scheduling.policy', {}));
  }

  today() {
    return localDateOf(this.#clock.nowIso());
  }

  // ---------- Disponibilidade ----------

  availability({ date, planId, classRef }) {
    const day = parseDate(date);
    const vehicleClass = this.#catalogService.getClass(classRef);
    const { plan } = this.#catalogService.quote(planId, vehicleClass.id);
    return availableSlots({
      date: day,
      durationMin: plan.baseDurationMin,
      policy: this.policy(),
      stations: this.#stations.list(),
      blocks: this.#blocksOfDay(day),
      busyUntil: this.#yardBusyUntil(day),
      now: this.#clock.nowIso(),
    });
  }

  // ---------- Marcar ----------

  book({ vehicleId, planId, startsAt, source = 'patio', actor }) {
    const id = this.#unitOfWork.run(() => {
      const vehicle = this.#vehicles.findById(vehicleId);
      if (!vehicle) throw new NotFoundError('Viatura não encontrada.');
      const { plan } = this.#catalogService.quote(planId, vehicle.classId);
      const policy = this.policy();
      const now = this.#clock.nowIso();
      const window = appointmentWindow({ startsAt, durationMin: plan.baseDurationMin, policy, now });
      const day = localDateOf(window.startsAt);
      const stationId = findStation({
        ...window,
        stations: this.#stations.list(),
        blocks: this.#blocksOfDay(day),
        policy,
        busyUntil: this.#yardBusyUntil(day),
      });
      if (!stationId) throw new ConflictError('NO_CAPACITY', 'Não há capacidade nesse horário. Escolha outro.');
      const status = initialStatus(policy);
      const appointmentId = this.#appointments.insert(
        {
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          plate: vehicle.plate,
          classId: vehicle.classId,
          classCode: vehicle.classCode,
          planId: plan.id,
          planName: plan.name,
          durationMin: plan.baseDurationMin,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          stationId,
          status,
          source: ['patio', 'simulador', 'demo'].includes(source) ? source : 'patio',
          createdBy: actor,
        },
        now,
      );
      this.#appointments.appendEvent(appointmentId, { kind: 'created', toStatus: status, toStartsAt: window.startsAt, actor }, now);
      this.#notifier.appointmentBooked(this.#getAppointment(appointmentId));
      return appointmentId;
    });
    return this.get(id);
  }

  get(id) {
    return this.#withOffers(this.#getAppointment(id));
  }

  /** Marcações de um dia (hora local). */
  listForDay(date) {
    const day = parseDate(date ?? this.today());
    return this.#appointments.listBetween(localToIso(day, '00:00'), localToIso(addDays(day, 1), '00:00')).map((a) => this.#withOffers(a));
  }

  /** Próximas marcações activas de um cliente. */
  upcomingForCustomer(customerId) {
    const now = this.#clock.nowIso();
    const until = new Date(Date.parse(now) + 60 * 86_400_000).toISOString();
    const from = new Date(Date.parse(now) - 3 * 3_600_000).toISOString();
    return this.#appointments
      .listBetween(from, until, { customerId, statuses: [...RESERVING_STATUSES] })
      .map((a) => this.#withOffers(a));
  }

  history(id) {
    this.#getAppointment(id);
    return this.#appointments.listEvents(id);
  }

  // ---------- Ciclo de vida ----------

  /** @returns {{ appointment, changed }} */
  transition(id, { to, reason, actor }) {
    const changed = this.#unitOfWork.run(() => {
      const appointment = this.#getAppointment(id);
      const policy = this.policy();
      const now = this.#clock.nowIso();
      const decision = planAppointmentTransition(appointment, { to, reason, now, policy });
      if (!decision.changed) return false;

      const changes = { ...decision.changes };
      if (to === AppointmentStatus.CHECKED_IN) {
        // A chegada cria o serviço, já com prioridade no seu posto; o preço é o do catálogo de hoje.
        changes.washId = this.#washService.register({
          vehicleId: appointment.vehicleId,
          planId: appointment.planId,
          source: appointment.source === 'simulador' ? 'simulador' : 'patio',
          appointmentId: appointment.id,
          actor,
        }).id;
      }
      if (!this.#appointments.update(id, appointment.status, changes, now)) {
        throw new ConflictError('CONCURRENT_UPDATE', 'A marcação foi alterada entretanto. Tente de novo.');
      }
      this.#appointments.appendEvent(id, { kind: 'transition', fromStatus: appointment.status, toStatus: to, actor, reason: changes.cancelReason }, now);
      this.#afterTransition({ ...appointment, ...changes }, policy, actor);
      return true;
    });
    return { appointment: this.get(id), changed };
  }

  #afterTransition(appointment, policy, actor) {
    if (appointment.status === AppointmentStatus.CONFIRMED) this.#notifier.appointmentConfirmed(appointment);
    const freed = [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW].includes(appointment.status);
    if (freed && policy.autoOffers) this.#offerFreedSlot(appointment, actor);
  }

  /** D-14 (proposta): o horário libertado é proposto à marcação confirmada seguinte do mesmo posto e dia. */
  #offerFreedSlot(freed, actor) {
    const now = this.#clock.nowIso();
    if (freed.startsAt < now) return;
    const day = localDateOf(freed.startsAt);
    const next = this.#appointments
      .listBetween(freed.startsAt, localToIso(addDays(day, 1), '00:00'), { statuses: [AppointmentStatus.CONFIRMED] })
      .find((candidate) => candidate.id !== freed.id && candidate.startsAt > freed.startsAt && !this.#hasPendingOffer(candidate.id));
    if (next) this.#createOffer(next, freed.startsAt, actor);
  }

  // ---------- Propostas de antecipação ----------

  propose(id, { proposedStartsAt, actor }) {
    const offerId = this.#unitOfWork.run(() => this.#createOffer(this.#getAppointment(id), proposedStartsAt, actor));
    return this.get(id).offers.find((offer) => offer.id === offerId);
  }

  #createOffer(appointment, proposedStartsAt, actor) {
    const policy = this.policy();
    const now = this.#clock.nowIso();
    const window = appointmentWindow({ startsAt: proposedStartsAt, durationMin: appointment.durationMin, policy, now });
    const stationId = findStation({
      ...window,
      stations: this.#stations.list(),
      blocks: this.#blocksOfDay(localDateOf(window.startsAt)),
      policy,
      busyUntil: this.#yardBusyUntil(localDateOf(window.startsAt)),
      excludeAppointmentId: appointment.id,
    });
    if (!stationId) throw new ConflictError('NO_CAPACITY', 'Não há capacidade nesse horário.');
    this.#recordExpiredOffers(appointment.id, now);
    const offer = planOffer(appointment, {
      proposedStartsAt: window.startsAt,
      proposedEndsAt: window.endsAt,
      stationId,
      now,
      policy,
      hasPendingOffer: this.#hasPendingOffer(appointment.id),
    });
    const offerId = this.#appointments.insertOffer(offer, actor, now);
    this.#notifier.appointmentOffer(appointment, this.#appointments.findOffer(offerId));
    return offerId;
  }

  /** O cliente aceita ou recusa. Aceitar só muda o horário se ainda houver capacidade. */
  respondToOffer(offerId, { accept, actor }) {
    return this.#unitOfWork.run(() => {
      const offer = this.#appointments.findOffer(offerId);
      if (!offer) throw new NotFoundError('Proposta não encontrada.');
      const now = this.#clock.nowIso();
      const response = planOfferResponse(offer, { accept, now });
      const appointment = this.#getAppointment(offer.appointmentId);
      if (response.status === OfferStatus.ACCEPTED) this.#reschedule(appointment, offer, actor, now);
      this.#appointments.updateOffer(offer.id, response);
      return this.get(appointment.id);
    });
  }

  /** Resposta do cliente pela conversa ("ACEITAR" / "MANTER") à sua proposta pendente. */
  respondToPendingOffer(customerId, { accept, actor }) {
    const now = this.#clock.nowIso();
    const pending = this.#appointments
      .listPendingOffers({ customerId })
      .find((offer) => offerStateOf(offer, now) === OfferStatus.PENDING);
    if (!pending) throw new NotFoundError('Não tem propostas de horário à espera de resposta.');
    return this.respondToOffer(pending.id, { accept, actor });
  }

  #reschedule(appointment, offer, actor, now) {
    const policy = this.policy();
    const window = appointmentWindow({ startsAt: offer.proposedStartsAt, durationMin: appointment.durationMin, policy, now });
    const stationId = findStation({
      ...window,
      stations: this.#stations.list(),
      blocks: this.#blocksOfDay(localDateOf(window.startsAt)),
      policy,
      busyUntil: this.#yardBusyUntil(localDateOf(window.startsAt)),
      excludeAppointmentId: appointment.id,
    });
    if (!stationId) throw new ConflictError('NO_CAPACITY', 'Esse horário já não está disponível: mantém-se o original.');
    const changes = { startsAt: window.startsAt, endsAt: window.endsAt, stationId };
    if (!this.#appointments.update(appointment.id, AppointmentStatus.CONFIRMED, changes, now)) {
      throw new ConflictError('NOT_CONFIRMED', 'A marcação já não está confirmada.');
    }
    this.#appointments.appendEvent(
      appointment.id,
      { kind: 'rescheduled', fromStartsAt: appointment.startsAt, toStartsAt: window.startsAt, actor, reason: 'Proposta aceite pelo cliente' },
      now,
    );
    this.#notifier.appointmentRescheduled(this.#getAppointment(appointment.id), appointment.startsAt);
  }

  // ---------- Capacidade do dia (M10) ----------

  capacity(date) {
    const day = parseDate(date ?? this.today());
    const policy = this.policy();
    const appointments = this.listForDay(day).filter((a) => a.status !== AppointmentStatus.CANCELLED);
    const yard = this.#washService.list({ statuses: [WashStatus.QUEUED, WashStatus.IN_PROGRESS, WashStatus.READY] });
    return {
      date: day,
      policy,
      stations: this.#stations.list().map((station) => ({
        ...station,
        appointments: appointments.filter((a) => a.stationId === station.id),
        yard: day === this.today() ? yard.filter((w) => yardStationOf(w) === station.id) : [],
      })),
      unassignedQueue: day === this.today() ? yard.filter((w) => w.status === WashStatus.QUEUED && !w.estimate?.estimatedStartAt) : [],
    };
  }

  // ---------- Auxiliares ----------

  #getAppointment(id) {
    const appointment = this.#appointments.findById(id);
    if (!appointment) throw new NotFoundError('Marcação não encontrada.');
    return appointment;
  }

  #withOffers(appointment) {
    const now = this.#clock.nowIso();
    const offers = this.#appointments.listOffers(appointment.id).map((offer) => ({ ...offer, status: offerStateOf(offer, now) }));
    return { ...appointment, offers };
  }

  #hasPendingOffer(appointmentId) {
    const now = this.#clock.nowIso();
    return this.#appointments.listOffers(appointmentId).some((offer) => offerStateOf(offer, now) === OfferStatus.PENDING);
  }

  /** A expiração é calculada; antes de uma nova proposta, as expiradas ficam gravadas como tal. */
  #recordExpiredOffers(appointmentId, now) {
    for (const offer of this.#appointments.listOffers(appointmentId)) {
      if (offer.status === OfferStatus.PENDING && offerStateOf(offer, now) === OfferStatus.EXPIRED) {
        this.#appointments.updateOffer(offer.id, { status: OfferStatus.EXPIRED, respondedAt: null });
      }
    }
  }

  #blocksOfDay(day) {
    const from = localToIso(day, '00:00');
    const to = localToIso(addDays(day, 1), '00:00');
    return this.#appointments.listBetween(from, to, { statuses: [...RESERVING_STATUSES] }).map(blockOf);
  }

  /** Até quando o pátio ocupa cada posto hoje (serviço em execução: fim estimado; pronto: agora). */
  #yardBusyUntil(day) {
    const busy = new Map();
    if (day !== this.today()) return busy;
    const nowMs = this.#clock.now().getTime();
    for (const wash of this.#washes.listActive()) {
      if (!wash.stationId) continue;
      const end = wash.status === WashStatus.IN_PROGRESS ? Date.parse(wash.startedAt) + wash.durationMin * MINUTE_MS : nowMs;
      busy.set(wash.stationId, Math.max(nowMs, end));
    }
    return busy;
  }
}

function parseDate(date) {
  if (!DATE.test(date ?? '')) throw new ValidationError('"date" deve estar no formato AAAA-MM-DD.', { field: 'date' });
  return date;
}

/** Posto em que um serviço do pátio está ou para onde se estima que vá. */
function yardStationOf(wash) {
  return wash.stationId ?? wash.estimate?.stationId ?? null;
}
