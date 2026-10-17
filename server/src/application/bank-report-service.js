// Relatório de actividade para a instituição (M16, cap. 9.3). Só com autorização activa, só as
// secções autorizadas, só dados agregados; cada consulta e exportação fica registada.
import { BUSINESS_TIME_ZONE } from '../domain/business-time.js';
import {
  activityIndicators,
  completedBy,
  completedByWeek,
  completedByWeekday,
  dataQuality,
  receiptsByWeek,
} from '../domain/indicators.js';
import { assertCanAccess, authorizedPeriod, REPORT_NOTES, ReportSection } from '../domain/sharing.js';

const DAY_MS = 86_400_000;
const MAX_WEEKS = 26;
const DEFAULT_OPEN_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export const AccessAction = Object.freeze({ VIEW: 'view', EXPORT: 'export' });

export class BankReportService {
  #reporting;
  #sharing;
  #sharingService;
  #settingsService;
  #unitOfWork;
  #clock;

  constructor({ reportingRepository, sharingRepository, sharingService, settingsService, unitOfWork, clock }) {
    this.#reporting = reportingRepository;
    this.#sharing = sharingRepository;
    this.#sharingService = sharingService;
    this.#settingsService = settingsService;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  activityReport({ institutionId, authorizationId, actor, action = AccessAction.VIEW }) {
    return this.#unitOfWork.run(() => {
      const institution = this.#sharingService.getInstitution(institutionId);
      const authorization = this.#sharingService.getAuthorization(authorizationId);
      const now = this.#clock.nowIso();
      assertCanAccess(authorization, institution.id, now);

      const period = this.#effectivePeriod(authorization, now);
      const report = {
        business: this.#settingsService.get('business.name', 'Lavadora'),
        institution,
        authorization: {
          reference: authorization.reference,
          purpose: authorization.purpose,
          sections: authorization.sections,
          validUntil: authorization.validUntil,
        },
        period,
        issuedAt: now,
        sections: this.#sections(authorization.sections, period),
        notes: REPORT_NOTES,
      };
      this.#sharing.insertAccessLog(
        {
          authorizationId: authorization.id,
          institutionId: institution.id,
          actor,
          action,
          sections: authorization.sections,
          dataFrom: period.from,
          dataTo: period.to,
        },
        now,
      );
      return report;
    });
  }

  /** O período autorizado, sem começar antes do primeiro registo. */
  #effectivePeriod(authorization, now) {
    const authorized = authorizedPeriod(authorization, now);
    const first = this.#reporting.firstWashAt();
    const from = first && first > authorized.from ? first : authorized.from;
    return { from, to: now, days: Math.max(1, Math.ceil((Date.parse(now) - Date.parse(from)) / DAY_MS)) };
  }

  #sections(allowed, period) {
    const washes = this.#reporting.washesBetween(period.from, period.to);
    const payments = this.#reporting.paymentsUpTo(period.to);
    const indicators = activityIndicators({ washes, payments, earnedWashIds: this.#reporting.earnedWashIds(), period });
    const weeks = Math.min(MAX_WEEKS, Math.ceil(period.days / 7));
    const builders = {
      [ReportSection.ACTIVITY]: () => ({
        completed: indicators.completed,
        cancelled: indicators.cancelled,
        byWeek: completedByWeek(washes, period, weeks),
        byWeekday: completedByWeekday(washes, period, BUSINESS_TIME_ZONE),
        byClass: completedBy(washes, period, 'classCode'),
        byPlan: completedBy(washes, period, 'planName'),
      }),
      [ReportSection.RECEIPTS]: () => ({
        digitalConfirmedCents: indicators.digitalConfirmedCents,
        cashDeclaredCents: indicators.cashDeclaredCents,
        refundedCents: indicators.refundedCents,
        receivableCents: indicators.receivableCents,
        byWeek: receiptsByWeek(payments, period, weeks),
      }),
      [ReportSection.CUSTOMERS]: () => ({
        distinctCustomers: indicators.distinctCustomers,
        returningCustomers: indicators.returningCustomers,
        returningRate: indicators.returningRate,
      }),
      [ReportSection.DATA_QUALITY]: () =>
        dataQuality({
          washes,
          payments,
          period,
          firstWashAt: this.#reporting.firstWashAt(),
          openWeekdays: this.#settingsService.get('business.openWeekdays', DEFAULT_OPEN_WEEKDAYS),
          timeZone: BUSINESS_TIME_ZONE,
          corrections: this.#reporting.correctionsBetween(period.from, period.to),
        }),
    };
    return Object.fromEntries(allowed.map((section) => [section, builders[section]()]));
  }
}
