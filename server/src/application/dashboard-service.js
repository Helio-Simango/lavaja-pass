// Painel do gestor (M10/M11): indicadores calculados a partir dos registos, com definição e origem.
import { BUSINESS_TIME_ZONE, localDateOf, localToIso } from '../domain/business-time.js';
import { ValidationError } from '../domain/errors.js';
import { activityIndicators, completedByWeekday, lowOccupancyDays, occupancyByWeekday, receiptsByWeek } from '../domain/indicators.js';
import { ACTIVE_WASH_STATUSES, WashStatus } from '../domain/wash.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 365;
const WEEKS_SHOWN = 4;
// Capacidade prática da proposta v1 (4 baias, 07:00–18:00): declarada, por validar.
const DEFAULT_CAPACITY = { practicalWashesPerDay: 28, lowOccupancyThreshold: 0.3 };

export class DashboardService {
  #reporting;
  #washes;
  #sharingService;
  #settingsService;
  #clock;

  constructor({ reportingRepository, washRepository, sharingService, settingsService, clock }) {
    this.#reporting = reportingRepository;
    this.#washes = washRepository;
    this.#sharingService = sharingService;
    this.#settingsService = settingsService;
    this.#clock = clock;
  }

  summary({ days = 30 } = {}) {
    if (!Number.isSafeInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new ValidationError(`"days" deve ser um inteiro entre 1 e ${MAX_DAYS}.`, { field: 'days' });
    }
    const to = this.#clock.nowIso();
    const period = { from: new Date(Date.parse(to) - days * DAY_MS).toISOString(), to, days };
    const washes = this.#reporting.washesBetween(period.from, period.to);
    const payments = this.#reporting.paymentsUpTo(period.to);
    return {
      period,
      indicators: activityIndicators({ washes, payments, earnedWashIds: this.#reporting.earnedWashIds(), period }),
      byWeekday: completedByWeekday(washes, period, BUSINESS_TIME_ZONE),
      weeklyReceipts: receiptsByWeek(payments, period, WEEKS_SHOWN),
      yardNow: this.#yardNow(),
      activeSharingAuthorizations: this.#sharingService.countActive(),
      ...this.#occupancy(washes, period),
    };
  }

  /** O dia de hoje (M10): lavagens, recebido por origem, numerário por operador e o que está por cobrar. */
  today() {
    const now = this.#clock.nowIso();
    const date = localDateOf(now);
    const from = localToIso(date, '00:00');
    const washes = this.#reporting.washesBetween(from, now).filter((w) => w.queuedAt >= from);
    const payments = this.#reporting.paymentsUpTo(now);
    const digital = payments.filter((p) => p.status === 'confirmed' && p.confirmedAt >= from);
    const cash = payments.filter((p) => p.status === 'declared' && p.declaredAt >= from);
    const paidWashIds = new Set(payments.filter((p) => p.status === 'confirmed' || p.status === 'declared').map((p) => p.washId));
    const unpaidActive = this.#washes.listActive().filter((w) => w.finalPriceCents > 0 && !paidWashIds.has(w.id));
    const byOperator = new Map();
    for (const payment of cash) byOperator.set(payment.declaredBy, (byOperator.get(payment.declaredBy) ?? 0) + payment.amountCents);
    return {
      date,
      washes: washes.filter((w) => w.status !== WashStatus.CANCELLED).length,
      completed: washes.filter((w) => w.status === WashStatus.COMPLETED).length,
      digitalCents: sum(digital),
      cashCents: sum(cash),
      cashByOperator: [...byOperator].map(([operator, cents]) => ({ operator, cents })),
      receivableCents: unpaidActive.reduce((total, w) => total + w.finalPriceCents, 0),
      receivableCount: unpaidActive.length,
      yardNow: this.#yardNow(),
    };
  }

  #occupancy(washes, period) {
    const capacity = { ...DEFAULT_CAPACITY, ...this.#settingsService?.get('capacity.practical', {}) };
    const occupancy = occupancyByWeekday(washes, period, { dailyCapacity: capacity.practicalWashesPerDay, timeZone: BUSINESS_TIME_ZONE });
    return { capacity, occupancy, lowOccupancy: lowOccupancyDays(occupancy, capacity.lowOccupancyThreshold) };
  }

  #yardNow() {
    const active = this.#washes.listActive();
    return Object.fromEntries(ACTIVE_WASH_STATUSES.map((status) => [status, active.filter((w) => w.status === status).length]));
  }
}

function sum(payments) {
  return payments.reduce((total, payment) => total + payment.amountCents, 0);
}
