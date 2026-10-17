// Conversão dos dados da aplicação para o formato JSON da API (inclui textos de apresentação).
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
    effective: effective ? { id: effective.id, method: effective.method, declaredBy: effective.declaredBy } : null,
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
