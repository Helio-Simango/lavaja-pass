// Conversão dos dados da aplicação para o formato JSON da API (inclui textos de apresentação).
import { DATA_QUALITY_INDICATORS, INDICATORS } from '../../domain/indicators.js';
import { ISSUE_LABELS } from '../../domain/reconciliation.js';
import { APPOINTMENT_STATUS_LABELS } from '../../domain/scheduling.js';
import { SECTION_LABELS } from '../../domain/sharing.js';
import { formatMoney } from '../../domain/money.js';
import { formatPhone } from '../../domain/phone.js';
import { formatPlate } from '../../domain/plate.js';
import { WASH_STATUS_LABELS, washCode, WashPaymentState } from '../../domain/wash.js';

const PAYMENT_STATE_LABELS = Object.freeze({
  [WashPaymentState.NOT_REQUIRED]: 'Sem valor a pagar',
  [WashPaymentState.UNPAID]: 'Por pagar',
  [WashPaymentState.PENDING]: 'Pendente · digital',
  [WashPaymentState.PAID_DIGITAL]: 'Pago · digital (sim.)',
  [WashPaymentState.PAID_CASH]: 'Numerário declarado',
  [WashPaymentState.REFUNDED]: 'Reembolsado',
  [WashPaymentState.DELIVERED_UNPAID]: 'Entregue sem pagamento',
});

// Como cada origem aparece (cap. 13.1): o declarado nunca aparece como comprovado.
const PAYMENT_ORIGIN_LABELS = Object.freeze({
  digital: 'Digital confirmado (simulado)',
  cash: 'Numerário declarado',
});

export const presentMoney = (cents, currency) => ({ cents, currency, display: formatMoney(cents, currency) });

export const presentVehicleClass = ({ id, code, name, description }) => ({ id, code, name, description });

export function presentPlan(plan) {
  const presented = {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    baseDurationMin: plan.baseDurationMin,
    active: plan.active,
    prices: plan.prices.map((price) => ({
      classId: price.classId,
      classCode: price.classCode,
      price: presentMoney(price.priceCents, price.currency),
    })),
  };
  if ('priceForClass' in plan) {
    presented.price = plan.priceForClass ? presentMoney(plan.priceForClass.priceCents, plan.priceForClass.currency) : null;
  }
  if ('unavailableReason' in plan) {
    presented.available = plan.unavailableReason === null;
    presented.unavailableReason = plan.unavailableReason;
  }
  return presented;
}

export function presentVehicle(vehicle) {
  return {
    id: vehicle.id,
    customerId: vehicle.customerId,
    jurisdiction: vehicle.jurisdiction,
    plate: vehicle.plate,
    plateDisplay: formatPlate(vehicle.plate),
    class: { id: vehicle.classId, code: vehicle.classCode },
    description: vehicle.description,
    createdAt: vehicle.createdAt,
  };
}

export function presentVehicleWithOwner(vehicle) {
  return {
    ...presentVehicle(vehicle),
    customer: { id: vehicle.customerId, name: vehicle.customerName, phoneDisplay: formatPhone(vehicle.customerPhone) },
  };
}

export function presentCustomer(customer) {
  return {
    id: customer.id,
    phone: customer.phone,
    phoneDisplay: formatPhone(customer.phone),
    name: customer.name,
    createdAt: customer.createdAt,
    vehicles: customer.vehicles.map(presentVehicle),
  };
}

export function presentStation(station) {
  return {
    id: station.id,
    code: station.code,
    name: station.name,
    active: station.active,
    state: station.state,
    wash: station.occupiedBy
      ? { id: station.occupiedBy.id, status: station.occupiedBy.status, plateDisplay: formatPlate(station.occupiedBy.plate) }
      : null,
  };
}

export function presentPayment(payment) {
  return {
    id: payment.id,
    washId: payment.washId,
    method: payment.method,
    status: payment.status,
    amount: presentMoney(payment.amountCents, payment.currency),
    origin: PAYMENT_ORIGIN_LABELS[payment.method],
    declaredBy: payment.declaredBy,
    createdBy: payment.createdBy,
    createdAt: payment.createdAt,
    confirmedAt: payment.confirmedAt,
    declaredAt: payment.declaredAt,
    failedAt: payment.failedAt,
    failureReason: payment.failureReason,
    refundedAt: payment.refundedAt,
    refundedBy: payment.refundedBy,
    refundReason: payment.refundReason,
  };
}

function presentWashPayment(wash) {
  const { effectivePayment: effective, paymentState } = wash;
  const label = effective?.method === 'cash'
    ? `${PAYMENT_STATE_LABELS[paymentState]} por ${effective.declaredBy}`
    : PAYMENT_STATE_LABELS[paymentState];
  return {
    status: paymentState,
    label,
    effective: effective
      ? { id: effective.id, method: effective.method, declaredBy: effective.declaredBy, at: effective.confirmedAt ?? effective.declaredAt ?? null }
      : null,
  };
}

export function presentWash(wash) {
  const money = (cents) => presentMoney(cents, wash.currency);
  return {
    id: wash.id,
    code: washCode(wash.id),
    status: wash.status,
    statusLabel: WASH_STATUS_LABELS[wash.status],
    customer: { id: wash.customerId, name: wash.customerName, phoneDisplay: formatPhone(wash.customerPhone) },
    vehicle: { id: wash.vehicleId, plate: wash.plate, plateDisplay: formatPlate(wash.plate), classCode: wash.classCode },
    plan: { id: wash.planId, name: wash.planName },
    durationMin: wash.durationMin,
    price: {
      base: money(wash.basePriceCents),
      discount: money(wash.discountCents),
      loyaltyBenefit: money(wash.loyaltyBenefitCents),
      final: money(wash.finalPriceCents),
    },
    payment: presentWashPayment(wash),
    station: wash.stationId ? { id: wash.stationId, code: wash.stationCode } : null,
    source: wash.source,
    queuedAt: wash.queuedAt,
    startedAt: wash.startedAt,
    startedBy: wash.startedBy ?? null,
    readyAt: wash.readyAt,
    completedAt: wash.completedAt,
    cancelledAt: wash.cancelledAt,
    cancelReason: wash.cancelReason,
    completedUnpaid: wash.completedUnpaid,
    createdBy: wash.createdBy,
    estimate: wash.estimate ?? null,
  };
}

export function presentWashEvent(event) {
  return {
    id: event.id,
    from: event.from,
    to: event.to,
    station: event.stationCode,
    actor: event.actor,
    reason: event.reason,
    details: event.details,
    createdAt: event.createdAt,
  };
}

// ---------- Fidelização ----------

const LEVEL_UP_LABELS = Object.freeze({
  literal: 'Sobe de nível a cada 10 ciclos completos (D-01 A)',
  cycles: 'Sobe de nível a cada N ciclos completos (D-01 B/C)',
  period: 'Nível segundo as lavagens num período móvel (D-01 D)',
});

/** Texto do benefício, que depende da D-02 (lavagem gratuita ou crédito). */
function benefitLabel(params, plans, classCode) {
  if (params.benefit.type === 'free_wash') {
    const plan = plans.find((candidate) => candidate.code === params.benefit.planCode);
    return `1 lavagem ${plan?.name ?? params.benefit.planCode} gratuita`;
  }
  return `Crédito até ${formatMoney(params.benefit.creditCapCents[classCode])}`;
}

export function presentLoyaltyRules(rules, plans) {
  const { params } = rules;
  return {
    version: rules.version,
    effectiveFrom: rules.effectiveFrom,
    toValidate: rules.toValidate,
    createdBy: rules.createdBy,
    params,
    summary: {
      cycle: `${params.cycleSize} lavagens elegíveis por ciclo`,
      levels: params.levels.map((level) => ({
        level: level.level,
        benefitsPerCycle: level.benefitsPerCycle,
        active: level.level <= params.maxActiveLevel,
      })),
      levelUp: LEVEL_UP_LABELS[params.levelUp.mode],
      benefit: params.benefit.type === 'free_wash' ? benefitLabel(params, plans) : 'Crédito com limite por classe',
    },
  };
}

export function presentLoyaltyCard(card, plans) {
  const { params } = card.rules;
  return {
    customerId: card.customerId,
    consent: card.consent,
    rulesVersion: card.rules.version,
    toValidate: card.rules.toValidate,
    classes: card.classes.map((progress) => ({
      classId: progress.classId,
      classCode: progress.classCode,
      eligibleWashes: progress.eligibleWashes,
      progressInCycle: progress.progressInCycle,
      cycleSize: progress.cycleSize,
      completedCycles: progress.completedCycles,
      level: progress.level,
      benefitsPerCycle: progress.benefitsPerCycle,
      benefitsAvailable: progress.benefitsAvailable,
      benefit: benefitLabel(params, plans, progress.classCode),
    })),
  };
}

export function presentLoyaltyMovement(movement) {
  return {
    id: movement.id,
    classCode: movement.classCode,
    type: movement.type,
    washId: movement.washId,
    washCode: movement.washId ? washCode(movement.washId) : null,
    reference: movement.reference,
    washesDelta: movement.washesDelta,
    benefitsDelta: movement.benefitsDelta,
    benefitValueCents: movement.benefitValueCents,
    rulesVersion: movement.rulesVersion,
    actor: movement.actor,
    details: movement.details,
    createdAt: movement.createdAt,
  };
}

// ---------- Simulador ----------

export function presentThread(thread) {
  return {
    id: thread.id,
    phone: thread.phone,
    phoneDisplay: formatPhone(thread.phone),
    customerId: thread.customerId,
    customerName: thread.customerName ?? null,
    state: thread.botState,
    lastMessage: thread.lastMessage ?? null,
    updatedAt: thread.updatedAt,
  };
}

export function presentMessage(message) {
  return {
    id: message.id,
    direction: message.direction,
    kind: message.kind,
    body: message.body,
    createdAt: message.createdAt,
  };
}

// ---------- Painel e histórico ----------

const indicator = (key, value, extra = {}) => ({ key, ...INDICATORS[key], value, ...extra });

export function presentDashboard(summary) {
  const { indicators: i, period } = summary;
  const currency = 'MZN';
  return {
    period,
    indicators: [
      indicator('completed', i.completed),
      indicator('eligibleForLoyalty', i.eligibleForLoyalty),
      indicator('digitalConfirmed', presentMoney(i.digitalConfirmedCents, currency)),
      indicator('cashDeclared', presentMoney(i.cashDeclaredCents, currency)),
      indicator('receivable', presentMoney(i.receivableCents, currency), { count: i.receivableCount }),
      indicator('refunded', presentMoney(i.refundedCents, currency)),
      indicator('cancelled', i.cancelled),
      indicator('returningCustomers', i.returningRate, {
        returning: i.returningCustomers,
        customers: i.distinctCustomers,
      }),
    ],
    byWeekday: summary.byWeekday,
    weeklyReceipts: summary.weeklyReceipts.map((week) => ({
      label: week.label,
      from: week.from,
      to: week.to,
      digital: presentMoney(week.digitalCents, currency),
      cash: presentMoney(week.cashCents, currency),
    })),
    yardNow: summary.yardNow,
    activeSharingAuthorizations: summary.activeSharingAuthorizations,
    capacity: summary.capacity,
    occupancy: summary.occupancy.map((day) => ({ ...day, occupancyPercent: day.occupancy === null ? null : Math.round(day.occupancy * 100) })),
    lowOccupancy: summary.lowOccupancy.map((day) => ({ label: day.label, occupancyPercent: Math.round(day.occupancy * 100) })),
  };
}

export function presentToday(today) {
  const mzn = (cents) => presentMoney(cents, 'MZN');
  const received = today.digitalCents + today.cashCents;
  return {
    date: today.date,
    washes: today.washes,
    completed: today.completed,
    received: mzn(received),
    digital: { ...mzn(today.digitalCents), origin: 'Confirmado em simulação' },
    cash: { ...mzn(today.cashCents), origin: 'Declarado por operador' },
    digitalSharePercent: received ? Math.round((today.digitalCents / received) * 100) : null,
    cashByOperator: today.cashByOperator.map(({ operator, cents }) => ({ operator, amount: mzn(cents) })),
    receivable: { ...mzn(today.receivableCents), count: today.receivableCount },
    yardNow: today.yardNow,
  };
}

export function presentVehicleWithStats(vehicle) {
  return { ...presentVehicleWithOwner(vehicle), completedCount: vehicle.completedCount, lastCompletedAt: vehicle.lastCompletedAt };
}

const LOYALTY_EFFECT_LABELS = Object.freeze({
  counted: 'Contou',
  reverted: 'Revertido (reembolso)',
  benefit_used: 'Benefício usado',
  benefit_restored: 'Benefício devolvido',
  not_counted: 'Não contou',
  none: '—',
});

export function presentHistoryEntry(wash) {
  const effective = wash.effectivePayment;
  const payment = effective
    ? { method: effective.method, label: effective.method === 'cash' ? `Numerário (decl. ${effective.declaredBy})` : 'Digital (sim.)' }
    : { method: null, label: wash.refunded ? 'Reembolsado' : '—' };
  const money = (cents) => presentMoney(cents, wash.currency);
  return {
    id: wash.id,
    code: washCode(wash.id),
    queuedAt: wash.queuedAt,
    completedAt: wash.completedAt,
    cancelledAt: wash.cancelledAt,
    status: wash.status,
    statusLabel: WASH_STATUS_LABELS[wash.status],
    planName: wash.planName,
    classCode: wash.classCode,
    price: {
      base: money(wash.basePriceCents),
      discount: money(wash.discountCents),
      loyaltyBenefit: money(wash.loyaltyBenefitCents),
      final: money(wash.finalPriceCents),
    },
    payment,
    loyaltyEffect: { code: wash.loyaltyEffect, label: LOYALTY_EFFECT_LABELS[wash.loyaltyEffect] },
  };
}

// ---------- Vertente Banco ----------

const AUTHORIZATION_STATUS_LABELS = Object.freeze({ active: 'Activa', revoked: 'Revogada', expired: 'Expirada' });
const ACCESS_ACTION_LABELS = Object.freeze({ view: 'consultou o relatório', export: 'exportou o relatório' });

export function presentAuthorization(authorization) {
  return {
    id: authorization.id,
    reference: authorization.reference,
    institution: { id: authorization.institutionId, name: authorization.institutionName },
    purpose: authorization.purpose,
    sections: authorization.sections.map((key) => ({ key, label: SECTION_LABELS[key] })),
    dataMonths: authorization.dataMonths,
    validUntil: authorization.validUntil,
    grantedBy: authorization.grantedBy,
    grantedAt: authorization.grantedAt,
    revokedAt: authorization.revokedAt,
    revokedBy: authorization.revokedBy,
    revokeReason: authorization.revokeReason,
    status: authorization.status,
    statusLabel: AUTHORIZATION_STATUS_LABELS[authorization.status],
    accessCount: authorization.accessCount,
  };
}

export function presentAccessLog(log) {
  return {
    id: log.id,
    authorizationReference: log.reference,
    institutionName: log.institutionName,
    actor: log.actor,
    action: log.action,
    actionLabel: ACCESS_ACTION_LABELS[log.action],
    sections: log.sections.map((key) => SECTION_LABELS[key]),
    dataFrom: log.dataFrom,
    dataTo: log.dataTo,
    createdAt: log.createdAt,
  };
}

const share = (value) => (value === null || value === undefined ? null : Math.round(value * 1000) / 10);
const withMeta = (meta, value) => ({ ...meta, value });

/** Relatório com a origem e a definição de cada valor; só as secções autorizadas. */
export function presentActivityReport(report) {
  const mzn = (cents) => presentMoney(cents, 'MZN');
  const { activity, receipts, customers, data_quality: quality, prequalification } = report.sections;
  const sections = {};
  if (prequalification) sections.prequalification = presentPrequalification(prequalification);
  if (activity) {
    sections.activity = {
      completed: withMeta(INDICATORS.completed, activity.completed),
      cancelled: withMeta(INDICATORS.cancelled, activity.cancelled),
      byWeek: activity.byWeek,
      byWeekday: activity.byWeekday,
      byClass: activity.byClass,
      byPlan: activity.byPlan,
    };
  }
  if (receipts) {
    sections.receipts = {
      digitalConfirmed: withMeta(INDICATORS.digitalConfirmed, mzn(receipts.digitalConfirmedCents)),
      cashDeclared: withMeta(INDICATORS.cashDeclared, mzn(receipts.cashDeclaredCents)),
      refunded: withMeta(INDICATORS.refunded, mzn(receipts.refundedCents)),
      receivable: withMeta(INDICATORS.receivable, mzn(receipts.receivableCents)),
      byWeek: receipts.byWeek.map((week) => ({ label: week.label, from: week.from, to: week.to, digital: mzn(week.digitalCents), cash: mzn(week.cashCents) })),
    };
  }
  if (customers) {
    sections.customers = {
      distinctCustomers: customers.distinctCustomers,
      returningCustomers: withMeta(INDICATORS.returningCustomers, share(customers.returningRate)),
      returningCount: customers.returningCustomers,
    };
  }
  if (quality) {
    const q = DATA_QUALITY_INDICATORS;
    sections.dataQuality = [
      withMeta(q.historyAgeDays, `${quality.historyAgeDays} dias`),
      withMeta(q.daysWithRecords, `${quality.daysWithRecords.days} de ${quality.daysWithRecords.operatingDays}`),
      withMeta(q.completedWithPayment, percent(quality.completedWithPayment.share)),
      withMeta(q.digitalShare, percent(quality.digitalShare)),
      withMeta(q.deliveredUnpaid, `${quality.deliveredUnpaid.count} (${percent(quality.deliveredUnpaid.share)})`),
      withMeta(
        q.cancellationsAndRefunds,
        `${quality.cancellationsAndRefunds.cancelled} cancelados (${percent(quality.cancellationsAndRefunds.cancelledShare)}) · ${quality.cancellationsAndRefunds.refunds} reembolsos`,
      ),
      withMeta(q.corrections, String(quality.corrections)),
    ];
  }
  return {
    business: report.business,
    holder: report.holder,
    bankAccount: report.bankAccount,
    historyDays: report.firstRecordAt ? Math.floor((Date.parse(report.issuedAt) - Date.parse(report.firstRecordAt)) / 86_400_000) : 0,
    institution: report.institution,
    authorization: {
      ...report.authorization,
      sections: report.authorization.sections.map((key) => ({ key, label: SECTION_LABELS[key] })),
    },
    period: report.period,
    issuedAt: report.issuedAt,
    sections,
    notes: report.notes,
  };
}

/** Score indicativo (M12): cada componente com o peso, os pontos e a definição. */
function presentPrequalification(score) {
  const mzn = (cents) => presentMoney(cents, 'MZN');
  const { metrics, indicative } = score;
  return {
    total: score.total,
    scoreClass: score.scoreClass,
    classLabel: score.classLabel,
    components: score.components.map(({ key, label, weight, points, ratio, definition }) => ({ key, label, weight, points, ratio, definition })),
    weakest: score.weakest,
    projection: score.projection,
    summary: {
      revenue30d: withMeta({ label: 'Receita 30 dias', origin: 'Digital confirmado + numerário declarado' }, mzn(metrics.totalCents30d)),
      digital30d: withMeta({ label: 'Verificado (digital)', origin: 'Confirmado em simulação' }, mzn(metrics.digitalCents30d)),
      cash30d: withMeta({ label: 'Numerário declarado', origin: 'Declarado por operador' }, mzn(metrics.cashCents30d)),
      digitalShare: share(metrics.totalCents30d ? metrics.digitalCents30d / metrics.totalCents30d : null),
      retention: withMeta({ label: 'Retenção 30 dias', origin: 'Calculado' }, share(metrics.retentionRate)),
      customers: metrics.customers,
    },
    indicative: {
      amount: mzn(indicative.amountCents),
      termMonths: indicative.termMonths,
      retentionShare: indicative.retentionShare,
      monthlyRetention: mzn(indicative.monthlyRetentionCents),
      costFactor: indicative.costFactor,
      rate: 'a definir pelo banco',
    },
    disclaimer: 'Indicativo. A decisão de crédito é do banco, segundo os seus processos de análise.',
  };
}

export function presentCreditRequest(request) {
  return {
    id: request.id,
    authorizationReference: request.authorizationReference,
    institutionName: request.institutionName,
    requestedBy: request.requestedBy,
    score: { total: request.scoreTotal, scoreClass: request.scoreClass },
    indicativeAmount: presentMoney(request.indicativeAmountCents, 'MZN'),
    note: request.note,
    createdAt: request.createdAt,
  };
}

function percent(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

/** Exportação: uma linha por indicador, com a origem; separador ";" (Excel em português). */
export function activityReportToCsv(presented) {
  const rows = [['secção', 'indicador', 'valor', 'origem']];
  const add = (section, label, value, origin = '') => rows.push([section, label, value, origin]);
  add('identificação', 'lavadora', presented.business);
  add('identificação', 'instituição', presented.institution.name);
  add('identificação', 'autorização', `${presented.authorization.reference} · ${presented.authorization.purpose}`);
  add('identificação', 'período', `${presented.period.from} a ${presented.period.to}`);
  add('identificação', 'emitido', presented.issuedAt);
  const { activity, receipts, customers, dataQuality: quality } = presented.sections;
  if (activity) {
    add('actividade', activity.completed.label, activity.completed.value, activity.completed.origin);
    add('actividade', activity.cancelled.label, activity.cancelled.value, activity.cancelled.origin);
    for (const week of activity.byWeek) add('actividade', `concluídos · ${week.label}`, week.completed, 'Registado');
  }
  if (receipts) {
    for (const key of ['digitalConfirmed', 'cashDeclared', 'refunded', 'receivable']) {
      add('recebimentos', receipts[key].label, receipts[key].value.display, receipts[key].origin);
    }
  }
  if (customers) {
    add('clientes', 'clientes distintos', customers.distinctCustomers, 'Registado');
    add('clientes', customers.returningCustomers.label, `${customers.returningCustomers.value ?? '—'}%`, customers.returningCustomers.origin);
  }
  if (quality) for (const item of quality) add('qualidade dos dados', item.label, item.value, item.origin);
  const score = presented.sections.prequalification;
  if (score) {
    add('pré-qualificação', 'score', `${score.total}/100 · classe ${score.scoreClass} · ${score.classLabel}`, 'Calculado (indicativo)');
    for (const c of score.components) add('pré-qualificação', c.label, `${c.points}/${c.weight}`, c.definition);
    add('pré-qualificação', 'montante indicativo', score.indicative.amount.display, `${score.indicative.termMonths} meses · ${Math.round(score.indicative.retentionShare * 100)}% dos recebimentos digitais`);
    add('pré-qualificação', 'nota', score.disclaimer);
  }
  for (const note of presented.notes) add('notas', '', note);
  return rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// ---------- Marcações e capacidade ----------

const OFFER_STATUS_LABELS = Object.freeze({ pending: 'À espera de resposta', accepted: 'Aceite', declined: 'Recusada', expired: 'Expirada' });

export const appointmentCode = (id) => `MC-${String(id).padStart(4, '0')}`;

export function presentOffer(offer) {
  return {
    id: offer.id,
    originalStartsAt: offer.originalStartsAt,
    proposedStartsAt: offer.proposedStartsAt,
    status: offer.status,
    statusLabel: OFFER_STATUS_LABELS[offer.status],
    expiresAt: offer.expiresAt,
    respondedAt: offer.respondedAt,
  };
}

export function presentAppointment(appointment) {
  return {
    id: appointment.id,
    code: appointmentCode(appointment.id),
    status: appointment.status,
    statusLabel: APPOINTMENT_STATUS_LABELS[appointment.status],
    customer: { id: appointment.customerId, name: appointment.customerName, phoneDisplay: formatPhone(appointment.customerPhone) },
    vehicle: { id: appointment.vehicleId, plate: appointment.plate, plateDisplay: formatPlate(appointment.plate), classCode: appointment.classCode },
    plan: { id: appointment.planId, name: appointment.planName },
    durationMin: appointment.durationMin,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    station: { id: appointment.stationId, code: appointment.stationCode },
    source: appointment.source,
    washId: appointment.washId,
    washCode: appointment.washId ? washCode(appointment.washId) : null,
    cancelReason: appointment.cancelReason,
    offers: (appointment.offers ?? []).map(presentOffer),
  };
}

export function presentCapacity(capacity) {
  return {
    date: capacity.date,
    policy: capacity.policy,
    stations: capacity.stations.map((station) => ({
      id: station.id,
      code: station.code,
      active: station.active,
      appointments: station.appointments.map(presentAppointment),
      yard: station.yard.map((wash) => ({
        id: wash.id,
        code: washCode(wash.id),
        plateDisplay: formatPlate(wash.plate),
        status: wash.status,
        startsAt: wash.startedAt ?? wash.estimate?.estimatedStartAt ?? null,
        endsAt: wash.status === 'in_progress' ? wash.estimate?.estimatedEndAt : wash.estimate?.estimatedEndAt ?? null,
        isEstimate: true,
      })),
    })),
  };
}

// ---------- Registo de alterações, consentimentos e fecho do dia ----------

const CHANGE_ENTITY_LABELS = Object.freeze({
  wash_plan: 'Plano',
  class_plan_price: 'Preço',
  vehicle: 'Viatura',
  loyalty_rules: 'Regras de fidelização',
  station: 'Baia',
});

export function presentChange(entry) {
  return { ...entry, entityLabel: CHANGE_ENTITY_LABELS[entry.entity] ?? entry.entity };
}

export function presentConsents(current) {
  const consent = (type) => {
    const value = current[type];
    return value ? { granted: value.granted, source: value.source, at: value.at } : { granted: false, source: null, at: null };
  };
  return { loyalty: consent('loyalty'), marketing: consent('marketing') };
}

export function presentReconciliation(day) {
  const mzn = (cents) => presentMoney(cents, 'MZN');
  return {
    date: day.date,
    operators: day.operators.map((entry) => ({
      operator: entry.operator,
      count: entry.count,
      declared: mzn(entry.declaredCents),
      closing: entry.closing
        ? {
            counted: mzn(entry.closing.countedCents),
            difference: { cents: entry.closing.differenceCents, display: formatMoney(entry.closing.differenceCents, 'MZN') },
            note: entry.closing.note,
            closedBy: entry.closing.closedBy,
            closedAt: entry.closing.createdAt,
          }
        : null,
    })),
    issues: day.issues.map((issue) => ({
      code: issue.code,
      label: ISSUE_LABELS[issue.code],
      washId: issue.washId,
      washCode: issue.washId ? washCode(issue.washId) : null,
      plateDisplay: issue.plate ? formatPlate(issue.plate) : null,
      operator: issue.operator ?? null,
      amount: { cents: issue.amountCents, display: formatMoney(issue.amountCents, 'MZN') },
      reason: issue.reason ?? null,
      corrections: issue.corrections.map((n) => ({ id: n.id, note: n.note, actor: n.actor, createdAt: n.createdAt })),
    })),
  };
}

// ---------- Campanhas (M11) ----------

export function presentCampaignPreview(preview) {
  return {
    policy: preview.policy,
    offers: preview.offers,
    template: preview.template,
    footer: preview.footer,
    count: preview.count,
    excluded: preview.excluded,
    sample: preview.sample,
  };
}

export function presentCampaign(campaign) {
  return {
    id: campaign.id,
    offer: { type: campaign.offerType, label: campaign.offer?.label ?? campaign.offerType },
    template: campaign.template,
    recipientsCount: campaign.recipientsCount,
    sentBy: campaign.sentBy,
    sentAt: campaign.sentAt,
    result: campaign.result,
  };
}
