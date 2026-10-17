// Serviço de lavagem: retrato de preços e ciclo de vida (cap. 10.3).
// Funções puras: recebem o estado e o contexto já carregados e decidem; não acedem à base.
import { ConflictError, NotFoundError, ValidationError } from './errors.js';

export const WashStatus = Object.freeze({
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const WASH_STATUSES = Object.freeze(Object.values(WashStatus));
export const ACTIVE_WASH_STATUSES = Object.freeze([WashStatus.QUEUED, WashStatus.IN_PROGRESS, WashStatus.READY]);
/** Um posto está ocupado enquanto tem um serviço em execução ou pronto. */
export const STATION_OCCUPYING_STATUSES = Object.freeze([WashStatus.IN_PROGRESS, WashStatus.READY]);

export const WASH_STATUS_LABELS = Object.freeze({
  queued: 'Em fila',
  in_progress: 'Em execução',
  ready: 'Pronto',
  completed: 'Concluído',
  cancelled: 'Cancelado',
});

export const WASH_SOURCES = Object.freeze(['patio', 'simulador', 'demo']);

export const PaymentStatus = Object.freeze({
  NOT_REQUIRED: 'not_required',
  UNPAID: 'unpaid',
  DELIVERED_UNPAID: 'delivered_unpaid',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  queued: [WashStatus.IN_PROGRESS, WashStatus.CANCELLED],
  in_progress: [WashStatus.READY],
  ready: [WashStatus.COMPLETED],
  completed: [],
  cancelled: [],
});

const CANCEL_REASON_MIN = 3;
const CANCEL_REASON_MAX = 200;

export const washCode = (id) => `LJ-${String(id).padStart(4, '0')}`;

export function isActive(wash) {
  return ACTIVE_WASH_STATUSES.includes(wash.status);
}

export function parseWashSource(source = 'patio') {
  if (!WASH_SOURCES.includes(source)) {
    throw new ValidationError(`"source" deve ser um de: ${WASH_SOURCES.join(', ')}.`, { field: 'source' });
  }
  return source;
}

export function parseWashStatus(status, field = 'status') {
  if (!WASH_STATUSES.includes(status)) {
    throw new ValidationError(`"${field}" deve ser um de: ${WASH_STATUSES.join(', ')}.`, { field });
  }
  return status;
}

/** Até ao I-3 não há pagamentos registados: só um valor final 0 dispensa o pagamento. */
export function paymentStatusOf(wash) {
  if (wash.finalPriceCents === 0) return PaymentStatus.NOT_REQUIRED;
  if (wash.status === WashStatus.COMPLETED && wash.completedUnpaid) return PaymentStatus.DELIVERED_UNPAID;
  return PaymentStatus.UNPAID;
}

/**
 * Cria o retrato de um novo serviço em fila. O preço vem sempre do catálogo, nunca do pedido;
 * alterar o catálogo depois não muda este retrato.
 */
export function newQueuedWash({ vehicle, plan, price, source, actor, now }) {
  const discountCents = 0;
  const loyaltyBenefitCents = 0; // fidelização: marco I-4
  return {
    customerId: vehicle.customerId,
    vehicleId: vehicle.id,
    plate: vehicle.plate,
    classId: vehicle.classId,
    classCode: vehicle.classCode,
    planId: plan.id,
    planName: plan.name,
    durationMin: plan.baseDurationMin,
    basePriceCents: price.priceCents,
    discountCents,
    loyaltyBenefitCents,
    finalPriceCents: price.priceCents - discountCents - loyaltyBenefitCents,
    currency: price.currency,
    status: WashStatus.QUEUED,
    source,
    queuedAt: now,
    createdBy: actor,
  };
}

/**
 * Decide uma transição de estado.
 * @param wash serviço actual
 * @param command { to, stationId?, reason?, allowUnpaid?, actor }
 * @param context { now, station?, stationOccupiedBy? } — posto pedido e o serviço que o ocupa, se houver
 * @returns {{ changed: false } | { changed: true, changes: object, event: object }}
 */
export function planTransition(wash, command, context) {
  const to = parseWashStatus(command.to, 'to');
  if (wash.status === to) return { changed: false }; // repetir o pedido não tem efeitos
  assertTransitionAllowed(wash.status, to);

  const event = { from: wash.status, to, actor: command.actor, stationId: wash.stationId ?? null };
  const changes = { status: to };

  switch (to) {
    case WashStatus.IN_PROGRESS:
      assertStationAvailable(command.stationId, context);
      changes.stationId = command.stationId;
      changes.startedAt = context.now;
      event.stationId = command.stationId;
      break;
    case WashStatus.READY:
      changes.readyAt = context.now; // aviso ao cliente: simulador, marco I-5
      break;
    case WashStatus.COMPLETED:
      Object.assign(changes, completion(wash, command, context, event));
      break;
    case WashStatus.CANCELLED:
      event.reason = parseCancelReason(command.reason);
      changes.cancelledAt = context.now;
      changes.cancelReason = event.reason;
      break;
  }
  return { changed: true, changes, event };
}

function assertTransitionAllowed(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ConflictError(
      'INVALID_TRANSITION',
      `Não é possível passar de "${WASH_STATUS_LABELS[from]}" para "${WASH_STATUS_LABELS[to]}".`,
      { from, to, allowed },
    );
  }
}

function assertStationAvailable(stationId, { station, stationOccupiedBy }) {
  if (stationId === undefined || stationId === null) {
    throw new ValidationError('Indique o posto ("stationId").', { field: 'stationId' });
  }
  if (!station) throw new NotFoundError('Posto não encontrado.');
  if (!station.active) throw new ConflictError('STATION_INACTIVE', `O posto ${station.code} está inactivo.`);
  if (stationOccupiedBy) {
    throw new ConflictError('STATION_BUSY', `O posto ${station.code} está ocupado.`, { washId: stationOccupiedBy });
  }
}

// Concluir sem pagamento exige confirmação explícita, que fica registada (cap. 10.3).
function completion(wash, command, context, event) {
  const paid = paymentStatusOf(wash) === PaymentStatus.NOT_REQUIRED;
  if (!paid && command.allowUnpaid !== true) {
    throw new ConflictError(
      'PAYMENT_REQUIRED',
      'O serviço não tem pagamento registado. Para entregar sem pagamento, confirme explicitamente (allowUnpaid).',
      { amountDueCents: wash.finalPriceCents, currency: wash.currency },
    );
  }
  if (!paid) event.details = { allowUnpaid: true, amountDueCents: wash.finalPriceCents };
  return { completedAt: context.now, completedUnpaid: !paid };
}

function parseCancelReason(reason) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < CANCEL_REASON_MIN) {
    throw new ValidationError('O motivo do cancelamento é obrigatório.', { field: 'reason' });
  }
  return text.slice(0, CANCEL_REASON_MAX);
}
