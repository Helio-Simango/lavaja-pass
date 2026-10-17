// Marcações e capacidade (cap. 12). Funções puras: decidem a partir do estado já carregado.
// Regra obrigatória (DEC-10): uma marcação confirmada nunca é antecipada automaticamente;
// só uma proposta aceite pelo cliente muda o horário. Sem resposta, mantém-se o original.
import { localToIso } from './business-time.js';
import { ConflictError, ValidationError } from './errors.js';

export const AppointmentStatus = Object.freeze({
  REQUESTED: 'requested',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
});

export const APPOINTMENT_STATUS_LABELS = Object.freeze({
  requested: 'Por confirmar',
  confirmed: 'Confirmada',
  checked_in: 'Chegou',
  cancelled: 'Cancelada',
  no_show: 'Faltou',
});

/** Marcações que ocupam capacidade (um pedido por confirmar também reserva, para não haver duplicados). */
export const RESERVING_STATUSES = Object.freeze([AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED]);

export const ConfirmationPolicy = Object.freeze({ AUTOMATIC: 'automatic', MANUAL: 'manual' }); // D-09
export const OfferStatus = Object.freeze({ PENDING: 'pending', ACCEPTED: 'accepted', DECLINED: 'declined', EXPIRED: 'expired' });

const TRANSITIONS = Object.freeze({
  requested: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  confirmed: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  checked_in: [],
  cancelled: [],
  no_show: [],
});

const MINUTE_MS = 60_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------- Política (parâmetros por validar) ----------

export function parseSchedulingPolicy(raw = {}) {
  const hours = raw.openingHours ?? {};
  if (!TIME.test(hours.open ?? '') || !TIME.test(hours.close ?? '') || hours.open >= hours.close) {
    throw new ValidationError('Horário de funcionamento inválido (ex.: { open: "07:00", close: "18:00" }).', { field: 'openingHours' });
  }
  const int = (value, field, min, max) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new ValidationError(`"${field}" deve ser um inteiro entre ${min} e ${max}.`, { field });
    }
    return value;
  };
  if (!Object.values(ConfirmationPolicy).includes(raw.confirmation)) {
    throw new ValidationError('"confirmation" deve ser "automatic" ou "manual".', { field: 'confirmation' });
  }
  return {
    openingHours: { open: hours.open, close: hours.close },
    slotMinutes: int(raw.slotMinutes, 'slotMinutes', 5, 120),
    safetyMarginMin: int(raw.safetyMarginMin, 'safetyMarginMin', 0, 60),
    workers: int(raw.workers, 'workers', 1, 50),
    confirmation: raw.confirmation,
    lateToleranceMin: int(raw.lateToleranceMin, 'lateToleranceMin', 0, 120),
    reservedStationsForQueue: int(raw.reservedStationsForQueue, 'reservedStationsForQueue', 0, 20),
    offerResponseMinutes: int(raw.offerResponseMinutes, 'offerResponseMinutes', 1, 240),
    autoOffers: raw.autoOffers === true,
  };
}

export function initialStatus(policy) {
  return policy.confirmation === ConfirmationPolicy.AUTOMATIC ? AppointmentStatus.CONFIRMED : AppointmentStatus.REQUESTED;
}

// ---------- Capacidade ----------

/** Bloco de tempo que uma marcação ocupa num posto: duração + margem de segurança. */
export function blockOf(appointment) {
  return {
    appointmentId: appointment.id,
    stationId: appointment.stationId,
    startMs: Date.parse(appointment.startsAt),
    endMs: Date.parse(appointment.endsAt),
  };
}

const overlaps = (a, b) => a.startMs < b.endMs && b.startMs < a.endMs;

/**
 * Posto livre para o intervalo, respeitando os trabalhadores disponíveis e a reserva para a fila (D-12).
 * @param busyUntil Map<stationId, ms> até quando cada posto está ocupado pelo pátio (hoje)
 * @returns id do posto, ou null se não houver capacidade
 */
export function findStation({ startMs, endMs, stations, blocks, policy, busyUntil = new Map(), excludeAppointmentId }) {
  const interval = { startMs, endMs };
  const overlapping = blocks.filter((b) => b.appointmentId !== excludeAppointmentId && overlaps(b, interval));
  if (overlapping.length >= policy.workers) return null;
  const active = stations.filter((s) => s.active);
  const withoutBookings = active.filter((s) => !overlapping.some((b) => b.stationId === s.id));
  if (withoutBookings.length - 1 < policy.reservedStationsForQueue) return null;
  const free = withoutBookings.find((s) => (busyUntil.get(s.id) ?? 0) <= startMs);
  return free?.id ?? null;
}

/** Horários disponíveis num dia (hora local), a partir de agora. */
export function availableSlots({ date, durationMin, policy, stations, blocks, busyUntil, now }) {
  const openMs = Date.parse(localToIso(date, policy.openingHours.open));
  const closeMs = Date.parse(localToIso(date, policy.openingHours.close));
  // Antecedência mínima de um intervalo: a fila que já está no pátio não é ultrapassada de imediato.
  const earliestMs = Date.parse(now) + policy.slotMinutes * MINUTE_MS;
  const slots = [];
  for (let startMs = openMs; startMs + durationMin * MINUTE_MS <= closeMs; startMs += policy.slotMinutes * MINUTE_MS) {
    if (startMs < earliestMs) continue;
    const endMs = startMs + (durationMin + policy.safetyMarginMin) * MINUTE_MS;
    const stationId = findStation({ startMs, endMs, stations, blocks, policy, busyUntil });
    if (stationId) slots.push({ startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString(), stationId });
  }
  return slots;
}

/** Intervalo de uma nova marcação; tem de caber no horário de funcionamento e não estar no passado. */
export function appointmentWindow({ startsAt, durationMin, policy, now }) {
  const startMs = Date.parse(startsAt);
  if (Number.isNaN(startMs)) throw new ValidationError('"startsAt" deve ser uma data e hora ISO.', { field: 'startsAt' });
  if (startMs < Date.parse(now)) throw new ConflictError('SLOT_IN_PAST', 'Esse horário já passou.');
  const date = new Date(startMs + 2 * 3_600_000).toISOString().slice(0, 10); // dia local (UTC+2)
  const openMs = Date.parse(localToIso(date, policy.openingHours.open));
  const closeMs = Date.parse(localToIso(date, policy.openingHours.close));
  if (startMs < openMs || startMs + durationMin * MINUTE_MS > closeMs) {
    throw new ConflictError('OUTSIDE_OPENING_HOURS', `Fora do horário de funcionamento (${policy.openingHours.open}–${policy.openingHours.close}).`);
  }
  return {
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + (durationMin + policy.safetyMarginMin) * MINUTE_MS).toISOString(),
    startMs,
    endMs: startMs + (durationMin + policy.safetyMarginMin) * MINUTE_MS,
  };
}

// ---------- Ciclo de vida da marcação (cap. 12.5) ----------

export function planAppointmentTransition(appointment, { to, reason, now, policy }) {
  if (!Object.values(AppointmentStatus).includes(to)) {
    throw new ValidationError(`"to" deve ser um de: ${Object.values(AppointmentStatus).join(', ')}.`, { field: 'to' });
  }
  if (appointment.status === to) return { changed: false };
  if (!TRANSITIONS[appointment.status].includes(to)) {
    throw new ConflictError(
      'INVALID_TRANSITION',
      `Não é possível passar de "${APPOINTMENT_STATUS_LABELS[appointment.status]}" para "${APPOINTMENT_STATUS_LABELS[to]}".`,
      { from: appointment.status, to, allowed: TRANSITIONS[appointment.status] },
    );
  }
  const changes = { status: to };
  if (to === AppointmentStatus.NO_SHOW) {
    const limitMs = Date.parse(appointment.startsAt) + policy.lateToleranceMin * MINUTE_MS;
    if (Date.parse(now) < limitMs) {
      throw new ConflictError('TOO_EARLY_FOR_NO_SHOW', `Só se marca a falta depois da tolerância de ${policy.lateToleranceMin} min (D-10).`);
    }
  }
  if (to === AppointmentStatus.CANCELLED) {
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (text.length < 3) throw new ValidationError('O motivo do cancelamento é obrigatório.', { field: 'reason' });
    changes.cancelReason = text.slice(0, 200);
  }
  return { changed: true, changes };
}

// ---------- Propostas de antecipação (cap. 12.4) ----------

export function planOffer(appointment, { proposedStartsAt, proposedEndsAt, stationId, now, policy, hasPendingOffer }) {
  if (appointment.status !== AppointmentStatus.CONFIRMED) {
    throw new ConflictError('NOT_CONFIRMED', 'Só se propõe um horário mais cedo a marcações confirmadas.');
  }
  if (hasPendingOffer) throw new ConflictError('OFFER_PENDING', 'Já existe uma proposta à espera de resposta.');
  if (proposedStartsAt >= appointment.startsAt) {
    throw new ConflictError('NOT_EARLIER', 'A proposta tem de ser mais cedo do que o horário confirmado.');
  }
  if (proposedStartsAt < now) throw new ConflictError('SLOT_IN_PAST', 'Esse horário já passou.');
  const expiresMs = Math.min(Date.parse(now) + policy.offerResponseMinutes * MINUTE_MS, Date.parse(proposedStartsAt));
  return {
    appointmentId: appointment.id,
    originalStartsAt: appointment.startsAt,
    proposedStartsAt,
    proposedEndsAt,
    proposedStationId: stationId,
    status: OfferStatus.PENDING,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/** Uma proposta sem resposta dentro do prazo expira; a marcação mantém o horário original. */
export function offerStateOf(offer, now) {
  return offer.status === OfferStatus.PENDING && offer.expiresAt <= now ? OfferStatus.EXPIRED : offer.status;
}

export function planOfferResponse(offer, { accept, now }) {
  if (typeof accept !== 'boolean') throw new ValidationError('"accept" deve ser true ou false.', { field: 'accept' });
  const state = offerStateOf(offer, now);
  if (state === OfferStatus.EXPIRED) throw new ConflictError('OFFER_EXPIRED', 'A proposta expirou: mantém-se o horário original.');
  if (state !== OfferStatus.PENDING) throw new ConflictError('OFFER_CLOSED', 'Esta proposta já foi respondida.');
  return { status: accept ? OfferStatus.ACCEPTED : OfferStatus.DECLINED, respondedAt: now };
}
