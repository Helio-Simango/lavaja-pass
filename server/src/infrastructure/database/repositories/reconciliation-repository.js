// Fecho de caixa por operador e correcções da reconciliação (só acrescentam).

const toClosing = (row) => ({
  id: row.id,
  businessDate: row.business_date,
  operator: row.operator,
  declaredCents: row.declared_cents,
  countedCents: row.counted_cents,
  differenceCents: row.difference_cents,
  note: row.note,
  closedBy: row.closed_by,
  createdAt: row.created_at,
});

const toNote = (row) => ({
  id: row.id,
  businessDate: row.business_date,
  washId: row.wash_id,
  issueCode: row.issue_code,
  note: row.note,
  actor: row.actor,
  createdAt: row.created_at,
});

export class SqliteReconciliationRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  /** Pagamentos com movimento no dia (declarado, criado ou reembolsado), com o estado actual. */
  paymentsBetween(from, to) {
    return this.#db
      .prepare(`SELECT * FROM payments
        WHERE declared_at BETWEEN :from AND :to OR created_at BETWEEN :from AND :to OR refunded_at BETWEEN :from AND :to
        ORDER BY id`)
      .all({ from, to })
      .map((row) => ({
        id: row.id,
        washId: row.wash_id,
        method: row.method,
        status: row.status,
        amountCents: row.amount_cents,
        declaredBy: row.declared_by,
        declaredAt: row.declared_at,
        createdAt: row.created_at,
        refundedAt: row.refunded_at,
        refundReason: row.refund_reason,
      }));
  }

  listClosings(businessDate) {
    return this.#db.prepare('SELECT * FROM cash_closings WHERE business_date = ? ORDER BY operator').all(businessDate).map(toClosing);
  }

  insertClosing(businessDate, closing, closedBy, now) {
    this.#db
      .prepare(`INSERT INTO cash_closings (business_date, operator, declared_cents, counted_cents, difference_cents, note, closed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(businessDate, closing.operator, closing.declaredCents, closing.countedCents, closing.differenceCents, closing.note, closedBy, now);
  }

  listNotes(businessDate) {
    return this.#db.prepare('SELECT * FROM reconciliation_notes WHERE business_date = ? ORDER BY id').all(businessDate).map(toNote);
  }

  insertNote({ businessDate, washId, issueCode, note, actor }, now) {
    this.#db
      .prepare('INSERT INTO reconciliation_notes (business_date, wash_id, issue_code, note, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(businessDate, washId ?? null, issueCode, note, actor, now);
  }
}
