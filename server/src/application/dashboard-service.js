// Painel do gestor (M11): indicadores calculados a partir dos registos, com definição e origem.
import { BUSINESS_TIME_ZONE } from '../domain/business-time.js';
import { ValidationError } from '../domain/errors.js';
import { activityIndicators, completedByWeekday, receiptsByWeek } from '../domain/indicators.js';
import { ACTIVE_WASH_STATUSES } from '../domain/wash.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 365;
const WEEKS_SHOWN = 4;

export class DashboardService {
  #reporting;
  #washes;
  #sharingService;
  #clock;

  constructor({ reportingRepository, washRepository, sharingService, clock }) {
    this.#reporting = reportingRepository;
    this.#washes = washRepository;
    this.#sharingService = sharingService;
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
    };
  }

  #yardNow() {
    const active = this.#washes.listActive();
    return Object.fromEntries(ACTIVE_WASH_STATUSES.map((status) => [status, active.filter((w) => w.status === status).length]));
  }
}
