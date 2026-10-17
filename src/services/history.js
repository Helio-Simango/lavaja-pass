// Registo de alterações de preços e parâmetros (só acrescenta).

const asText = (v) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));

export function createHistoryService({ db, clock }) {
  const insert = db.prepare(`INSERT INTO change_log
    (entity, entity_id, field, old_value, new_value, actor, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  return {
    logChange({ entity, entityId, field, oldValue, newValue, actor, reason = null }) {
      insert.run(entity, String(entityId), field, asText(oldValue), asText(newValue), actor, reason, clock.nowIso());
    },

    listChanges({ entity, entityId } = {}) {
      return db
        .prepare(`SELECT * FROM change_log
          WHERE (? IS NULL OR entity = ?) AND (? IS NULL OR entity_id = ?)
          ORDER BY id`)
        .all(entity ?? null, entity ?? null, entityId ?? null, entityId === undefined ? null : String(entityId))
        .map((r) => ({
          id: r.id,
          entity: r.entity,
          entityId: r.entity_id,
          field: r.field,
          oldValue: r.old_value,
          newValue: r.new_value,
          actor: r.actor,
          reason: r.reason,
          createdAt: r.created_at,
        }));
    },
  };
}
