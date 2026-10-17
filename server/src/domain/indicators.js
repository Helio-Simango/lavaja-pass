// Indicadores calculados a partir dos registos (cap. 13.4). Funções puras, partilhadas pelo Painel
// e pelo relatório de actividade da vertente Banco. Cada indicador tem definição e origem.
// O digital confirmado e o numerário declarado nunca são somados (DEC-07); o valor por receber
// nunca é receita.

export const Origin = Object.freeze({
  REGISTERED: 'Registado',
  REGISTERED_AND_PAID: 'Registado + pagamento',
  SIMULATED: 'Confirmado em simulação',
  DECLARED: 'Declarado por operador',
  DECLARED_BY_BUSINESS: 'Declarado pela lavadora',
  CALCULATED: 'Calculado',
});

export const INDICATORS = Object.freeze({
  completed: {
    label: 'Serviços concluídos',
    definition: 'Serviços no estado "concluído" no período. Fila, execução, pronto, cancelados e marcações não contam.',
    origin: Origin.REGISTERED,
  },
  eligibleForLoyalty: {
    label: 'Elegíveis para fidelização',
    definition: 'Concluídos no período com pagamento confirmado ou declarado que contaram para a fidelização.',
    origin: Origin.REGISTERED_AND_PAID,
  },
  digitalConfirmed: {
    label: 'Digital confirmado',
    definition: 'Soma dos pagamentos digitais confirmados no período, sem os reembolsados. Simulação: não são transacções reais.',
    origin: Origin.SIMULATED,
  },
  cashDeclared: {
    label: 'Numerário declarado',
    definition: 'Soma do numerário declarado pelos operadores no período, sem os reembolsados. Não verificado por fonte externa.',
    origin: Origin.DECLARED,
  },
  receivable: {
    label: 'Por receber',
    definition: 'Serviços do período não cancelados, com valor a pagar e sem pagamento efectivo. Não é receita.',
    origin: Origin.CALCULATED,
  },
  refunded: {
    label: 'Reembolsado',
    definition: 'Soma dos pagamentos reembolsados no período. Fica fora da receita.',
    origin: Origin.REGISTERED,
  },
  cancelled: {
    label: 'Cancelados',
    definition: 'Serviços cancelados no período, com motivo registado.',
    origin: Origin.REGISTERED,
  },
  returningCustomers: {
    label: 'Clientes que regressam',
    definition: 'Clientes com mais de um serviço concluído no período ÷ clientes com serviços concluídos no período.',
    origin: Origin.CALCULATED,
  },
});

export const WEEKDAY_LABELS = Object.freeze(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
const DAY_MS = 86_400_000;

const inPeriod = (iso, { from, to }) => Boolean(iso) && iso >= from && iso <= to;
const sumOf = (items, field) => items.reduce((total, item) => total + item[field], 0);

/**
 * @param washes [{ id, customerId, status, queuedAt, completedAt, cancelledAt, finalPriceCents }]
 * @param payments [{ washId, method, status, amountCents, confirmedAt, declaredAt, refundedAt }]
 * @param earnedWashIds Set dos serviços que contaram para a fidelização (sem reversão)
 * @param period { from, to } em ISO
 */
export function activityIndicators({ washes, payments, earnedWashIds, period }) {
  const completed = washes.filter((w) => w.status === 'completed' && inPeriod(w.completedAt, period));
  const effectiveWashIds = new Set(payments.filter((p) => p.status === 'confirmed' || p.status === 'declared').map((p) => p.washId));
  const receivable = washes.filter(
    (w) => w.status !== 'cancelled' && w.finalPriceCents > 0 && !effectiveWashIds.has(w.id) && inPeriod(w.queuedAt, period),
  );
  const completedPerCustomer = countBy(completed, (w) => w.customerId);
  const customers = completedPerCustomer.size;
  const returning = [...completedPerCustomer.values()].filter((count) => count > 1).length;

  return {
    completed: completed.length,
    eligibleForLoyalty: completed.filter((w) => earnedWashIds.has(w.id)).length,
    digitalConfirmedCents: sumOf(payments.filter((p) => p.status === 'confirmed' && inPeriod(p.confirmedAt, period)), 'amountCents'),
    cashDeclaredCents: sumOf(payments.filter((p) => p.status === 'declared' && inPeriod(p.declaredAt, period)), 'amountCents'),
    refundedCents: sumOf(payments.filter((p) => p.status === 'refunded' && inPeriod(p.refundedAt, period)), 'amountCents'),
    receivableCents: sumOf(receivable, 'finalPriceCents'),
    receivableCount: receivable.length,
    cancelled: washes.filter((w) => w.status === 'cancelled' && inPeriod(w.cancelledAt, period)).length,
    distinctCustomers: customers,
    returningCustomers: returning,
    returningRate: customers === 0 ? null : returning / customers,
  };
}

/** Serviços concluídos por dia da semana (segunda a domingo), no fuso da lavadora. */
export function completedByWeekday(washes, period, timeZone) {
  const counts = new Array(7).fill(0);
  for (const wash of washes) {
    if (wash.status === 'completed' && inPeriod(wash.completedAt, period)) counts[weekdayIndex(wash.completedAt, timeZone)] += 1;
  }
  return WEEKDAY_LABELS.map((label, index) => ({ weekday: index + 1, label, completed: counts[index] }));
}

/** Concluídos agrupados por um campo (classe, plano). */
export function completedBy(washes, period, field) {
  const completed = washes.filter((w) => w.status === 'completed' && inPeriod(w.completedAt, period));
  return [...countBy(completed, (w) => w[field]).entries()]
    .map(([key, count]) => ({ key, completed: count }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

/**
 * Recebimentos por semana, sempre separados por origem. A última semana termina em period.to.
 * @returns [{ label, from, to, digitalCents, cashCents }] da mais antiga para a mais recente
 */
export function receiptsByWeek(payments, { to }, weeks) {
  const endMs = Date.parse(to);
  return Array.from({ length: weeks }, (_, index) => {
    const offset = weeks - 1 - index;
    const bucket = {
      from: new Date(endMs - (offset + 1) * 7 * DAY_MS).toISOString(),
      to: new Date(endMs - offset * 7 * DAY_MS).toISOString(),
    };
    const within = (iso) => Boolean(iso) && iso > bucket.from && iso <= bucket.to;
    return {
      label: offset === 0 ? 'Últimos 7 d' : `Sem −${offset}`,
      ...bucket,
      digitalCents: sumOf(payments.filter((p) => p.status === 'confirmed' && within(p.confirmedAt)), 'amountCents'),
      cashCents: sumOf(payments.filter((p) => p.status === 'declared' && within(p.declaredAt)), 'amountCents'),
    };
  });
}

function weekdayIndex(iso, timeZone) {
  const name = new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', timeZone });
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name);
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return counts;
}
