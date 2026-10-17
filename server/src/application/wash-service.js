import { ConflictError, NotFoundError } from '../domain/errors.js';
import { estimateQueue } from '../domain/queue-estimates.js';
import { isEffective } from '../domain/payment.js';
import { isActive, newQueuedWash, parseWashSource, paymentStateOf, planTransition, WashStatus } from '../domain/wash.js';

const DEFAULT_LIST_LIMIT = 200;

export class WashService {
  #washes;
  #vehicles;
  #stations;
  #payments;
  #catalogService;
  #paymentService;
  #loyaltyService;
  #unitOfWork;
  #clock;

  constructor({
    washRepository,
    vehicleRepository,
    stationRepository,
    paymentRepository,
    catalogService,
    paymentService,
    loyaltyService,
    unitOfWork,
    clock,
  }) {
    this.#washes = washRepository;
    this.#vehicles = vehicleRepository;
    this.#stations = stationRepository;
    this.#payments = paymentRepository;
    this.#catalogService = catalogService;
    this.#paymentService = paymentService;
    this.#loyaltyService = loyaltyService;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  /**
   * Coloca uma viatura na fila. O preço é sempre calculado aqui, a partir da classe actual da viatura.
   * Com useBenefit, usa um benefício de fidelização da classe da viatura (fica no retrato do preço).
   */
  register({ vehicleId, planId, source, useBenefit = false, actor }) {
    const washId = this.#unitOfWork.run(() => {
      const washSource = parseWashSource(source);
      const vehicle = this.#vehicles.findById(vehicleId);
      if (!vehicle) throw new NotFoundError('Viatura não encontrada.');
      this.#assertVehicleNotInYard(vehicleId);

      const { plan, price } = this.#catalogService.quote(planId, vehicle.classId);
      const loyaltyBenefitCents = useBenefit
        ? this.#loyaltyService.benefitFor({ customerId: vehicle.customerId, vehicle, priceCents: price.priceCents })
        : 0;
      const now = this.#clock.nowIso();
      const wash = newQueuedWash({ vehicle, plan, price, loyaltyBenefitCents, source: washSource, actor, now });
      const id = this.#washes.insert(wash, now);
      this.#washes.appendEvent(id, { from: null, to: WashStatus.QUEUED, actor }, now);
      if (loyaltyBenefitCents > 0) this.#loyaltyService.redeem({ ...wash, id }, actor);
      return id;
    });
    return this.get(washId);
  }

  /** @returns {{ wash: object, changed: boolean }} */
  transition(id, command) {
    const changed = this.#unitOfWork.run(() => {
      const wash = this.#getWash(id);
      const context = this.#transitionContext(wash, command);
      const decision = planTransition(wash, command, context);
      if (!decision.changed) return false;

      const now = this.#clock.nowIso();
      const applied = this.#washes.applyTransition(id, wash.status, decision.changes, now);
      if (!applied) throw new ConflictError('CONCURRENT_UPDATE', 'O serviço foi alterado entretanto. Tente de novo.');
      this.#washes.appendEvent(id, decision.event, now);
      this.#afterTransition({ ...wash, ...decision.changes }, context, command.actor);
      return true;
    });
    return { wash: this.get(id), changed };
  }

  /** Efeitos de uma transição noutras áreas, na mesma unidade de trabalho. */
  #afterTransition(wash, context, actor) {
    if (wash.status === WashStatus.COMPLETED) {
      this.#loyaltyService.recordCompletion(wash, { hasEffectivePayment: context.hasEffectivePayment, actor });
    }
    if (wash.status === WashStatus.CANCELLED) {
      this.#paymentService.failPendingForCancelledWash(wash.id);
      this.#loyaltyService.restoreForCancellation(wash, actor);
    }
  }

  get(id) {
    return this.#withDetails([this.#getWash(id)])[0];
  }

  list({ statuses, date, limit = DEFAULT_LIST_LIMIT } = {}) {
    return this.#withDetails(this.#washes.list({ statuses, date, limit }));
  }

  history(id) {
    this.#getWash(id);
    return this.#washes.listEvents(id);
  }

  #getWash(id) {
    const wash = this.#washes.findById(id);
    if (!wash) throw new NotFoundError('Serviço não encontrado.');
    return wash;
  }

  #assertVehicleNotInYard(vehicleId) {
    const active = this.#washes.findActiveByVehicle(vehicleId);
    if (active) {
      throw new ConflictError('VEHICLE_ALREADY_ACTIVE', 'Esta viatura já tem um serviço activo no pátio.', {
        washId: active.id,
        status: active.status,
      });
    }
  }

  /** Acrescenta a estimativa (serviços activos) e o estado do pagamento. */
  #withDetails(washes) {
    const estimates = washes.some(isActive) ? this.#currentEstimates() : new Map();
    const paymentsByWash = this.#payments.listByWashes(washes.map((wash) => wash.id));
    return washes.map((wash) => {
      const payments = paymentsByWash.get(wash.id);
      return {
        ...wash,
        estimate: isActive(wash) ? estimates.get(wash.id) ?? null : null,
        paymentState: paymentStateOf(wash, payments),
        effectivePayment: payments.find(isEffective) ?? null,
      };
    });
  }

  #transitionContext(wash, { to, stationId }) {
    const context = {
      now: this.#clock.nowIso(),
      hasEffectivePayment: this.#payments.listByWash(wash.id).some(isEffective),
    };
    if (to === WashStatus.IN_PROGRESS && stationId !== undefined && stationId !== null) {
      context.station = this.#stations.findById(stationId);
      context.stationOccupiedBy = this.#washes.findOccupyingStation(stationId)?.id ?? null;
    }
    return context;
  }

  #currentEstimates() {
    return estimateQueue({
      now: this.#clock.now(),
      stations: this.#stations.list(),
      washes: this.#washes.listActive(),
    });
  }
}
