// Leituras para indicadores e relatórios: só os dados necessários, já sem dados pessoais.

export class SqliteReportingRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  /** Serviços registados, concluídos ou cancelados no período. */
  washesBetween(from, to) {
    return this.#db
      .prepare(`SELECT id, customer_id, class_code, plan_name, status, queued_at, completed_at, cancelled_at,
          final_price_cents, completed_unpaid
        FROM washes
        WHERE queued_at BETWEEN :from AND :to OR completed_at BETWEEN :from AND :to OR cancelled_at BETWEEN :from AND :to
        ORDER BY id`)
      .all({ from, to })
      .map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        classCode: row.class_code,
        planName: row.plan_name,
        status: row.status,
        queuedAt: row.queued_at,
        completedAt: row.completed_at,
        cancelledAt: row.cancelled_at,
        finalPriceCents: row.final_price_cents,
        completedUnpaid: row.completed_unpaid === 1,
      }));
  }

  /** Pagamentos de serviços registados até ao fim do período (o estado actual de cada um). */
  paymentsUpTo(to) {
    return this.#db
      .prepare(`SELECT wash_id, method, status, amount_cents, confirmed_at, declared_at, refunded_at
        FROM payments WHERE created_at <= ? ORDER BY id`)
      .all(to)
      .map((row) => ({
        washId: row.wash_id,
        method: row.method,
        status: row.status,
        amountCents: row.amount_cents,
        confirmedAt: row.confirmed_at,
        declaredAt: row.declared_at,
        refundedAt: row.refunded_at,
      }));
  }

  /** Serviços que contaram para a fidelização e não foram revertidos. */
  earnedWashIds() {
    const rows = this.#db
      .prepare(`SELECT wash_id FROM loyalty_transactions WHERE type = 'earn'
        AND wash_id NOT IN (SELECT wash_id FROM loyalty_transactions WHERE type = 'revert')`)
      .all();
    return new Set(rows.map((row) => row.wash_id));
  }

  firstWashAt() {
    return this.#db.prepare('SELECT MIN(queued_at) AS first FROM washes').get().first;
  }

  /** Correcções registadas no fecho diário. */
  correctionsBetween(from, to) {
    return this.#db.prepare('SELECT COUNT(*) AS total FROM reconciliation_notes WHERE created_at BETWEEN ? AND ?').get(from, to).total;
  }
}
