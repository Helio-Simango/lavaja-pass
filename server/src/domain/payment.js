// Pagamentos simulados (cap. 10.4 e 13). Funções puras: decidem, não gravam.
// O digital confirmado e o numerário declarado nunca são a mesma coisa (DEC-07).
import { ConflictError, ValidationError } from './errors.js';
import { WashStatus } from './wash.js';

export const PaymentMethod = Object.freeze({ DIGITAL: 'digital', CASH: 'cash' });

export const PaymentStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DECLARED: 'declared',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

/** Pagamentos que contam como recebidos (o confirmado na simulação e o numerário declarado). */
export const EFFECTIVE_PAYMENT_STATUSES = Object.freeze([PaymentStatus.CONFIRMED, PaymentStatus.DECLARED]);

export const SimulationOutcome = Object.freeze({ CONFIRMED: 'confirmed', FAILED: 'failed' });

const IDEMPOTENCY_KEY_MAX = 100;
const DECLARED_BY_MAX = 60;
const REFUND_REASON_MIN = 3;
const REFUND_REASON_MAX = 200;

export const isEffective = (payment) => EFFECTIVE_PAYMENT_STATUSES.includes(payment.status);

export function parseIdempotencyKey(key) {
  const text = typeof key === 'string' ? key.trim() : '';
  if (!text || text.length > IDEMPOTENCY_KEY_MAX) {
    throw new ValidationError('O cabeçalho "Idempotency-Key" é obrigatório (até 100 caracteres).', {
      field: 'Idempotency-Key',
    });
  }
  return text;
}

/**
 * Verifica se um serviço pode receber um pagamento deste valor.
 * @param payments todos os pagamentos já registados para o serviço
 */
export function assertCanReceivePayment(wash, payments, amountCents) {
  if (wash.status === WashStatus.CANCELLED) {
    throw new ConflictError('WASH_CANCELLED', 'Um serviço cancelado não recebe pagamentos.');
  }
  if (wash.finalPriceCents === 0) {
    throw new ConflictError('NOTHING_TO_PAY', 'Este serviço não tem valor a pagar.');
  }
  if (payments.some(isEffective)) {
    throw new ConflictError('ALREADY_PAID', 'Este serviço já tem um pagamento efectivo.');
  }
  if (amountCents !== wash.finalPriceCents) {
    throw new ConflictError('AMOUNT_MISMATCH', 'O valor tem de ser igual ao valor final em dívida.', {
      amountDueCents: wash.finalPriceCents,
      currency: wash.currency,
    });
  }
}

export function newDigitalPayment({ wash, amountCents, idempotencyKey, actor, now }) {
  return {
    washId: wash.id,
    method: PaymentMethod.DIGITAL,
    status: PaymentStatus.PENDING,
    amountCents,
    currency: wash.currency,
    idempotencyKey,
    declaredBy: null,
    createdBy: actor,
    createdAt: now,
  };
}

/** O numerário só entra por uma declaração explícita de um operador identificado (M9). */
export function newCashDeclaration({ wash, amountCents, declaredBy, confirmed, idempotencyKey, actor, now }) {
  const operator = typeof declaredBy === 'string' ? declaredBy.trim() : '';
  if (!operator || operator.length > DECLARED_BY_MAX) {
    throw new ValidationError('Indique quem recebeu o numerário ("declaredBy").', { field: 'declaredBy' });
  }
  if (confirmed !== true) {
    throw new ValidationError('Confirme explicitamente que recebeu o valor em numerário ("confirm": true).', {
      field: 'confirm',
    });
  }
  return {
    washId: wash.id,
    method: PaymentMethod.CASH,
    status: PaymentStatus.DECLARED,
    amountCents,
    currency: wash.currency,
    idempotencyKey,
    declaredBy: operator,
    createdBy: actor,
    createdAt: now,
    declaredAt: now,
  };
}

/** Um pedido repetido com a mesma chave tem de ser o mesmo pedido. */
export function assertSameRequest(existing, { washId, method, amountCents }) {
  if (existing.washId !== washId || existing.method !== method || existing.amountCents !== amountCents) {
    throw new ConflictError('IDEMPOTENCY_KEY_REUSED', 'Esta chave de idempotência já foi usada noutro pedido.');
  }
}

/** Resultado da simulação de um pagamento digital pendente. Repetir o mesmo resultado não tem efeitos. */
export function planSimulation(payment, outcome, now) {
  if (!Object.values(SimulationOutcome).includes(outcome)) {
    throw new ValidationError('"outcome" deve ser "confirmed" ou "failed".', { field: 'outcome' });
  }
  if (payment.status === outcome) return { changed: false };
  if (payment.method !== PaymentMethod.DIGITAL || payment.status !== PaymentStatus.PENDING) {
    throw invalidState(payment, 'simular');
  }
  return outcome === SimulationOutcome.CONFIRMED
    ? { changed: true, changes: { status: PaymentStatus.CONFIRMED, confirmedAt: now } }
    : { changed: true, changes: { status: PaymentStatus.FAILED, failedAt: now, failureReason: 'Simulação falhada' } };
}

/** Um pagamento pendente fica sem efeito quando é substituído (numerário) ou o serviço é cancelado. */
export function failPending(reason, now) {
  return { status: PaymentStatus.FAILED, failedAt: now, failureReason: reason };
}

export function planRefund(payment, { reason, idempotencyKey, actor, now }) {
  if (payment.status === PaymentStatus.REFUNDED) {
    if (payment.refundIdempotencyKey === idempotencyKey) return { changed: false };
    throw new ConflictError('ALREADY_REFUNDED', 'Este pagamento já foi reembolsado.');
  }
  if (!isEffective(payment)) throw invalidState(payment, 'reembolsar');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < REFUND_REASON_MIN) {
    throw new ValidationError('O motivo do reembolso é obrigatório.', { field: 'reason' });
  }
  return {
    changed: true,
    changes: {
      status: PaymentStatus.REFUNDED,
      refundedAt: now,
      refundedBy: actor,
      refundReason: text.slice(0, REFUND_REASON_MAX),
      refundIdempotencyKey: idempotencyKey,
    },
  };
}

function invalidState(payment, action) {
  return new ConflictError('INVALID_PAYMENT_STATE', `Não é possível ${action} um pagamento no estado "${payment.status}".`, {
    status: payment.status,
  });
}
