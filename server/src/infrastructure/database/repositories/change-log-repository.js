// Registo de alterações de preços e parâmetros. A tabela só aceita novos registos (triggers).

const asText = (value) =>
  value === undefined || value === null ? null : typeof value === 'string' ? value : JSON.stringify(value);

const toEntry = (row) => ({
  id: row.id,
  entity: row.entity,
  entityId: row.entity_id,
  field: row.field,
  oldValue: row.old_value,
  newValue: row.new_value,
  actor: row.actor,
  reason: row.reason,
  createdAt: row.created_at,
});

export class SqliteChangeLogRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  append({ entity, entityId, field, oldValue, newValue, actor, reason = null }, now) {
    this.#db
      .prepare(`INSERT INTO change_log (entity, entity_id, field, old_value, new_value, actor, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entity, String(entityId), field, asText(oldValue), asText(newValue), actor, reason, now);
  }

  /** Alterações mais recentes primeiro; opcionalmente de uma só entidade. */
  listRecent({ entity, limit }) {
    return this.#db
      .prepare('SELECT * FROM change_log WHERE (:entity IS NULL OR entity = :entity) ORDER BY id DESC LIMIT :limit')
      .all({ entity: entity ?? null, limit })
      .map(toEntry);
  }

  listFor(entity, entityId) {
    return this.#db
      .prepare('SELECT * FROM change_log WHERE entity = ? AND entity_id = ? ORDER BY id')
      .all(entity, String(entityId))
      .map(toEntry);
  }
}
