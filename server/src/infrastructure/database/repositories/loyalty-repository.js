const toRules = (row) => ({
  version: row.version,
  params: JSON.parse(row.params_json),
  effectiveFrom: row.effective_from,
  toValidate: row.to_validate === 1,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const toMovement = (row) => ({
  id: row.id,
  accountId: row.account_id,
  classId: row.class_id,
  classCode: row.class_code,
  type: row.type,
  washId: row.wash_id,
  reference: row.reference,
  washesDelta: row.washes_delta,
  benefitsDelta: row.benefits_delta,
  benefitValueCents: row.benefit_value_cents,
  rulesVersion: row.rules_version,
  actor: row.actor,
  details: row.details_json ? JSON.parse(row.details_json) : null,
  createdAt: row.created_at,
});

export class SqliteLoyaltyRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  /** Versão em vigor: a mais recente com data de vigência até "agora". */
  findRulesInForce(now) {
    const row = this.#db
      .prepare('SELECT * FROM loyalty_rules WHERE effective_from <= ? ORDER BY effective_from DESC, version DESC LIMIT 1')
      .get(now);
    return row ? toRules(row) : null;
  }

  listRuleVersions() {
    return this.#db.prepare('SELECT * FROM loyalty_rules ORDER BY version').all().map(toRules);
  }

  insertRules({ params, effectiveFrom, toValidate, createdBy }, now) {
    const { next } = this.#db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM loyalty_rules').get();
    this.#db
      .prepare(`INSERT INTO loyalty_rules (version, params_json, effective_from, to_validate, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(next, JSON.stringify(params), effectiveFrom, toValidate ? 1 : 0, createdBy, now);
    return next;
  }

  findAccountId(customerId) {
    return this.#db.prepare('SELECT id FROM loyalty_accounts WHERE customer_id = ?').get(customerId)?.id ?? null;
  }

  createAccount(customerId, now) {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO loyalty_accounts (customer_id, created_at) VALUES (?, ?)')
      .run(customerId, now);
    return Number(lastInsertRowid);
  }

  listMovements(accountId) {
    return this.#db
      .prepare(`SELECT t.*, c.code AS class_code FROM loyalty_transactions t
        JOIN vehicle_classes c ON c.id = t.class_id WHERE t.account_id = ? ORDER BY t.id`)
      .all(accountId)
      .map(toMovement);
  }

  /** Movimentos ligados a estes serviços (efeito de cada lavagem na fidelização). */
  listByWashIds(washIds) {
    if (washIds.length === 0) return [];
    const placeholders = washIds.map(() => '?').join(', ');
    return this.#db
      .prepare(`SELECT t.*, c.code AS class_code FROM loyalty_transactions t
        JOIN vehicle_classes c ON c.id = t.class_id WHERE t.wash_id IN (${placeholders}) ORDER BY t.id`)
      .all(...washIds)
      .map(toMovement);
  }

  hasReference(reference) {
    return Boolean(this.#db.prepare('SELECT 1 FROM loyalty_transactions WHERE reference = ?').get(reference));
  }

  insertMovement(accountId, movement, now) {
    this.#db
      .prepare(`INSERT INTO loyalty_transactions (account_id, class_id, type, wash_id, reference, washes_delta,
          benefits_delta, benefit_value_cents, rules_version, actor, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        accountId,
        movement.classId,
        movement.type,
        movement.washId ?? null,
        movement.reference,
        movement.washesDelta,
        movement.benefitsDelta,
        movement.benefitValueCents ?? null,
        movement.rulesVersion,
        movement.actor,
        movement.details ? JSON.stringify(movement.details) : null,
        now,
      );
  }
}
