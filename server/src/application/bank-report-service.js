// Relatório de actividade para a instituição (M12/M16, cap. 9.3). Só com autorização activa, só as
// secções autorizadas, só dados agregados; cada consulta e exportação fica registada.
// A secção de pré-qualificação (I-11) calcula o score indicativo da proposta v1 (secção 8).
import { BUSINESS_TIME_ZONE } from '../domain/business-time.js';
import {
  activityIndicators,
  completedBy,
  completedByWeek,
  completedByWeekday,
  dataQuality,
  receiptsByWeek,
} from '../domain/indicators.js';
import { ConflictError } from '../domain/errors.js';
import { DEFAULT_PREQUALIFICATION_PARAMS, prequalify } from '../domain/prequalification.js';
import { assertCanAccess, authorizedPeriod, REPORT_NOTES, ReportSection } from '../domain/sharing.js';

const DAY_MS = 86_400_000;
const MAX_WEEKS = 26;
const DEFAULT_OPEN_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const SCORE_WINDOW_DAYS = 30;
const SCORE_WEEKS = 4;
const NOTE_MAX = 300;

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
        holder: this.#settingsService.get('business.owner', null),
        bankAccount: this.#settingsService.get('business.bankAccount', null),
        firstRecordAt: this.#reporting.firstWashAt(),
        institution,
        authorization: {
          id: authorization.id,
          reference: authorization.reference,
          purpose: authorization.purpose,
          sections: authorization.sections,
          grantedAt: authorization.grantedAt,
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

  /**
   * O analista pede uma análise de crédito formal (M12). Exige a pré-qualificação autorizada; fica
   * registado com o score e o montante indicativo do momento, visível para a lavadora.
   */
  requestCreditAnalysis({ institutionId, authorizationId, note, actor }) {
    return this.#unitOfWork.run(() => {
      const report = this.activityReport({ institutionId, authorizationId, actor });
      const score = report.sections[ReportSection.PREQUALIFICATION];
      if (!score) {
        throw new ConflictError('PREQUALIFICATION_NOT_AUTHORIZED', 'A lavadora não autorizou a pré-qualificação nesta autorização.');
      }
      const text = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : '';
      const id = this.#sharing.insertCreditRequest(
        {
          authorizationId,
          institutionId,
          requestedBy: actor,
          scoreTotal: score.total,
          scoreClass: score.scoreClass,
          indicativeAmountCents: score.indicative.amountCents,
          note: text || null,
        },
        this.#clock.nowIso(),
      );
      return this.#sharing.listCreditRequests({ institutionId }).find((request) => request.id === id);
    });
  }

  creditRequests({ institutionId } = {}) {
    return this.#sharing.listCreditRequests({ institutionId });
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
    builders[ReportSection.PREQUALIFICATION] = () => this.#prequalification(period.to);
    return Object.fromEntries(allowed.map((section) => [section, builders[section]()]));
  }

  /** Score sobre os últimos 30 dias (e 4 semanas), independentemente do período do relatório. */
  #prequalification(now) {
    const window = { from: new Date(Date.parse(now) - SCORE_WINDOW_DAYS * DAY_MS).toISOString(), to: now };
    const washes = this.#reporting.washesBetween(window.from, window.to);
    const payments = this.#reporting.paymentsUpTo(now);
    const indicators = activityIndicators({ washes, payments, earnedWashIds: this.#reporting.earnedWashIds(), period: window });
    const weekly = receiptsByWeek(payments, window, SCORE_WEEKS);
    const firstWashAt = this.#reporting.firstWashAt();
    const metrics = {
      digitalCents30d: indicators.digitalConfirmedCents,
      totalCents30d: indicators.digitalConfirmedCents + indicators.cashDeclaredCents,
      weeklyTotalsCents: weekly.map((week) => week.digitalCents + week.cashCents),
      retentionRate: indicators.returningRate,
      historyDays: firstWashAt ? Math.floor((Date.parse(now) - Date.parse(firstWashAt)) / DAY_MS) : 0,
    };
    const params = { ...DEFAULT_PREQUALIFICATION_PARAMS, ...this.#settingsService.get('prequalification.params', {}) };
    return {
      ...prequalify(metrics, params),
      metrics: { ...metrics, cashCents30d: indicators.cashDeclaredCents, customers: indicators.distinctCustomers, returning: indicators.returningCustomers },
    };
  }
}
