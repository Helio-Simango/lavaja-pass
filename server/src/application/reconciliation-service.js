// Fecho do dia (I-9): numerário declarado vs. contado por operador e inconsistências do dia,
// cada uma com as correcções registadas (nunca apagadas). As correcções entram na qualidade dos dados.
import { addDays, localDateOf, localToIso } from '../domain/business-time.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import {
  dayInconsistencies,
  declaredCashByOperator,
  IssueCode,
  parseCorrectionNote,
  parseIssueCode,
  planClosing,
} from '../domain/reconciliation.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReconciliationService {
  #reconciliation;
  #reporting;
  #washes;
  #unitOfWork;
  #clock;

  constructor({ reconciliationRepository, reportingRepository, washRepository, unitOfWork, clock }) {
    this.#reconciliation = reconciliationRepository;
    this.#reporting = reportingRepository;
    this.#washes = washRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  day(date) {
    const businessDate = this.#parseDate(date);
    const { from, to } = dayRange(businessDate);
    const payments = this.#reconciliation.paymentsBetween(from, to);
    const declaredToday = payments.filter((p) => p.declaredAt && p.declaredAt >= from && p.declaredAt < to);
    const closings = this.#reconciliation.listClosings(businessDate);
    const notes = this.#reconciliation.listNotes(businessDate);
    const washes = this.#reporting.washesBetween(from, to);
    const issues = dayInconsistencies({ washes, payments, now: this.#clock.nowIso() });
    for (const closing of closings.filter((c) => c.differenceCents !== 0)) {
      issues.push({ code: IssueCode.CASH_DIFFERENCE, washId: null, amountCents: closing.differenceCents, operator: closing.operator });
    }
    return {
      date: businessDate,
      operators: declaredCashByOperator(declaredToday).map((entry) => ({
        ...entry,
        closing: closings.find((c) => c.operator === entry.operator) ?? null,
      })),
      issues: issues.map((issue) => ({
        ...issue,
        plate: issue.washId ? this.#washes.findById(issue.washId)?.plate ?? null : null,
        corrections: notes.filter((n) => n.issueCode === issue.code && (n.washId ?? null) === (issue.washId ?? null)),
      })),
      notes,
    };
  }

  close({ date, operator, countedCents, note, actor }) {
    return this.#unitOfWork.run(() => {
      const summary = this.day(date);
      const entry = summary.operators.find((o) => o.operator === operator);
      if (!entry) throw new NotFoundError(`Sem numerário declarado por ${operator} neste dia.`);
      const closing = planClosing({
        operator,
        declaredCents: entry.declaredCents,
        countedCents,
        note,
        alreadyClosed: Boolean(entry.closing),
      });
      this.#reconciliation.insertClosing(summary.date, closing, actor, this.#clock.nowIso());
      return this.day(summary.date);
    });
  }

  /** Correcção registada sobre uma inconsistência do dia. Nunca apaga nem altera registos anteriores. */
  addCorrection({ date, washId, issueCode, note, actor }) {
    return this.#unitOfWork.run(() => {
      const businessDate = this.#parseDate(date);
      const code = parseIssueCode(issueCode);
      if (washId !== undefined && washId !== null && !this.#washes.findById(washId)) throw new NotFoundError('Serviço não encontrado.');
      this.#reconciliation.insertNote(
        { businessDate, washId: washId ?? null, issueCode: code, note: parseCorrectionNote(note), actor },
        this.#clock.nowIso(),
      );
      return this.day(businessDate);
    });
  }

  #parseDate(date) {
    const value = date ?? localDateOf(this.#clock.nowIso());
    if (!DATE.test(value)) throw new ValidationError('"date" deve estar no formato AAAA-MM-DD.', { field: 'date' });
    return value;
  }
}

function dayRange(date) {
  return { from: localToIso(date, '00:00'), to: localToIso(addDays(date, 1), '00:00') };
}
