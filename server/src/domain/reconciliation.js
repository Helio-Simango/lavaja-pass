// Fecho diário e reconciliação (cap. 13.3). Funções puras.
// Numerário declarado vs. contado por operador; inconsistências do dia com correcção registada.
import { ConflictError, ValidationError } from './errors.js';

export const IssueCode = Object.freeze({
  DELIVERED_UNPAID: 'delivered_unpaid',
  STALE_PENDING: 'stale_pending_payment',
  REFUND: 'refund',
  CASH_DIFFERENCE: 'cash_difference',
});

export const ISSUE_LABELS = Object.freeze({
  delivered_unpaid: 'Concluído sem pagamento',
  stale_pending_payment: 'Pagamento digital pendente há muito tempo',
  refund: 'Reembolso',
  cash_difference: 'Diferença no fecho de caixa',
});

const STALE_PENDING_MINUTES = 30;
const NOTE_MIN = 3;
const NOTE_MAX = 300;

/** Numerário declarado no dia, por operador (só o que não foi reembolsado). */
export function declaredCashByOperator(payments) {
  const byOperator = new Map();
  for (const payment of payments.filter((p) => p.method === 'cash' && p.status === 'declared')) {
    const entry = byOperator.get(payment.declaredBy) ?? { operator: payment.declaredBy, count: 0, declaredCents: 0 };
    entry.count += 1;
    entry.declaredCents += payment.amountCents;
    byOperator.set(payment.declaredBy, entry);
  }
  return [...byOperator.values()].sort((a, b) => a.operator.localeCompare(b.operator));
}

/**
 * Inconsistências de um dia: concluídos sem pagamento, digitais pendentes antigos, reembolsos.
 * @param washes serviços do dia; @param payments pagamentos desses serviços
 */
export function dayInconsistencies({ washes, payments, now }) {
  const issues = [];
  for (const wash of washes.filter((w) => w.status === 'completed' && w.completedUnpaid)) {
    issues.push({ code: IssueCode.DELIVERED_UNPAID, washId: wash.id, amountCents: wash.finalPriceCents });
  }
  const staleLimit = Date.parse(now) - STALE_PENDING_MINUTES * 60_000;
  for (const payment of payments.filter((p) => p.status === 'pending' && Date.parse(p.createdAt) < staleLimit)) {
    issues.push({ code: IssueCode.STALE_PENDING, washId: payment.washId, amountCents: payment.amountCents });
  }
  for (const payment of payments.filter((p) => p.status === 'refunded')) {
    issues.push({ code: IssueCode.REFUND, washId: payment.washId, amountCents: payment.amountCents, reason: payment.refundReason });
  }
  return issues;
}

/** Fecho de caixa de um operador. Uma diferença exige uma nota. Um dia só fecha uma vez por operador. */
export function planClosing({ operator, declaredCents, countedCents, note, alreadyClosed }) {
  if (alreadyClosed) throw new ConflictError('ALREADY_CLOSED', `O dia já foi fechado para ${operator}.`);
  if (!Number.isSafeInteger(countedCents) || countedCents < 0) {
    throw new ValidationError('"countedCents" deve ser um inteiro ≥ 0.', { field: 'countedCents' });
  }
  const difference = countedCents - declaredCents;
  const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : '';
  if (difference !== 0 && text.length < NOTE_MIN) {
    throw new ValidationError('Há uma diferença entre o declarado e o contado: explique-a numa nota.', { field: 'note' });
  }
  return { operator, declaredCents, countedCents, differenceCents: difference, note: text || null };
}

export function parseCorrectionNote(note) {
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length < NOTE_MIN || text.length > NOTE_MAX) {
    throw new ValidationError(`A correcção deve ter entre ${NOTE_MIN} e ${NOTE_MAX} caracteres.`, { field: 'note' });
  }
  return text;
}

export function parseIssueCode(code) {
  if (!Object.values(IssueCode).includes(code)) {
    throw new ValidationError(`"issueCode" deve ser um de: ${Object.values(IssueCode).join(', ')}.`, { field: 'issueCode' });
  }
  return code;
}
