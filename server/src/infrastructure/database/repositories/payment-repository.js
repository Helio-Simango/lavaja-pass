const COLUMNS = Object.freeze({
  status: 'status',
  confirmedAt: 'confirmed_at',
  declaredAt: 'declared_at',
  failedAt: 'failed_at',
  failureReason: 'failure_reason',
  refundedAt: 'refunded_at',
  refundedBy: 'refunded_by',
  refundReason: 'refund_reason',
  refundIdempotencyKey: 'refund_idempotency_key',
});

const toPayment = (row) => ({
  id: row.id,
  washId: row.wash_id,
  method: row.method,
  status: row.status,
  amountCents: row.amount_cents,
  currency: row.currency,
  idempotencyKey: row.idempotency_key,
  declaredBy: row.declared_by,
  createdBy: row.created_by,
  createdAt: row.created_at,
  confirmedAt: row.confirmed_at,
  declaredAt: row.declared_at,
  failedAt: row.failed_at,
  failureReason: row.failure_reason,
  refundedAt: row.refunded_at,
  refundedBy: row.refunded_by,
  refundReason: row.refund_reason,
  refundIdempotencyKey: row.refund_idempotency_key,
});

export class SqlitePaymentRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    return row ? toPayment(row) : null;
  }

  findByIdempotencyKey(key) {
    const row = this.#db.prepare('SELECT * FROM payments WHERE idempotency_key = ?').get(key);
    return row ? toPayment(row) : null;
  }

  listByWash(washId) {
    return this.#db.prepare('SELECT * FROM payments WHERE wash_id = ? ORDER BY id').all(washId).map(toPayment);
  }

  /** @returns Map<washId, payment[]> para vários serviços de uma vez (quadro do Pátio). */
  listByWashes(washIds) {
    const byWash = new Map(washIds.map((id) => [id, []]));
    if (washIds.length === 0) return byWash;
    const placeholders = washIds.map(() => '?').join(', ');
    const rows = this.#db.prepare(`SELECT * FROM payments WHERE wash_id IN (${placeholders}) ORDER BY id`).all(...washIds);
    for (const row of rows) byWash.get(row.wash_id).push(toPayment(row));
    return byWash;
  }

  insert(payment, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO payments (wash_id, method, status, amount_cents, currency, idempotency_key, declared_by,
          created_by, created_at, declared_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        payment.washId,
        payment.method,
        payment.status,
        payment.amountCents,
        payment.currency,
        payment.idempotencyKey,
        payment.declaredBy,
        payment.createdBy,
        payment.createdAt,
        payment.declaredAt ?? null,
        now,
      );
    return Number(lastInsertRowid);
  }

  /** Aplica as alterações só se o estado ainda for o esperado. @returns true se alterou */
  update(id, expectedStatus, changes, now) {
    const entries = Object.entries(changes).map(([field, value]) => {
      const column = COLUMNS[field];
      if (!column) throw new Error(`Campo de pagamento desconhecido: ${field}`);
      return [column, value];
    });
    const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
    const { changes: affected } = this.#db
      .prepare(`UPDATE payments SET ${assignments}, updated_at = ? WHERE id = ? AND status = ?`)
      .run(...entries.map(([, value]) => value), now, id, expectedStatus);
    return affected === 1;
  }
}
