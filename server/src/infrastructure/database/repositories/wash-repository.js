const SELECT_WASH = `SELECT w.*, cu.name AS customer_name, cu.phone AS customer_phone, s.code AS station_code
  FROM washes w
  JOIN customers cu ON cu.id = w.customer_id
  LEFT JOIN stations s ON s.id = w.station_id`;

const ACTIVE = `('queued', 'in_progress', 'ready')`;
const OCCUPYING = `('in_progress', 'ready')`;

// Campos que uma transição pode alterar -> coluna.
const TRANSITION_COLUMNS = Object.freeze({
  status: 'status',
  stationId: 'station_id',
  startedAt: 'started_at',
  readyAt: 'ready_at',
  completedAt: 'completed_at',
  completedUnpaid: 'completed_unpaid',
  cancelledAt: 'cancelled_at',
  cancelReason: 'cancel_reason',
});

const toWash = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  vehicleId: row.vehicle_id,
  plate: row.plate,
  classId: row.class_id,
  classCode: row.class_code,
  planId: row.plan_id,
  planName: row.plan_name,
  durationMin: row.duration_min,
  basePriceCents: row.base_price_cents,
  discountCents: row.discount_cents,
  loyaltyBenefitCents: row.loyalty_benefit_cents,
  finalPriceCents: row.final_price_cents,
  currency: row.currency,
  status: row.status,
  stationId: row.station_id,
  stationCode: row.station_code,
  source: row.source,
  queuedAt: row.queued_at,
  startedAt: row.started_at,
  readyAt: row.ready_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  cancelReason: row.cancel_reason,
  completedUnpaid: row.completed_unpaid === 1,
  createdBy: row.created_by,
});

const toEvent = (row) => ({
  id: row.id,
  from: row.from_status,
  to: row.to_status,
  stationCode: row.station_code,
  actor: row.actor,
  reason: row.reason,
  details: row.details_json ? JSON.parse(row.details_json) : null,
  createdAt: row.created_at,
});

export class SqliteWashRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare(`${SELECT_WASH} WHERE w.id = ?`).get(id);
    return row ? toWash(row) : null;
  }

  findActiveByVehicle(vehicleId) {
    const row = this.#db.prepare(`${SELECT_WASH} WHERE w.vehicle_id = ? AND w.status IN ${ACTIVE}`).get(vehicleId);
    return row ? toWash(row) : null;
  }

  findOccupyingStation(stationId) {
    const row = this.#db.prepare(`${SELECT_WASH} WHERE w.station_id = ? AND w.status IN ${OCCUPYING}`).get(stationId);
    return row ? toWash(row) : null;
  }

  listActive() {
    return this.#db.prepare(`${SELECT_WASH} WHERE w.status IN ${ACTIVE} ORDER BY w.queued_at, w.id`).all().map(toWash);
  }

  /** @param filter { statuses?: string[], date?: 'AAAA-MM-DD', customerId?, limit } */
  list({ statuses, date, customerId, limit }) {
    const conditions = [];
    const params = [];
    if (customerId !== undefined) {
      conditions.push('w.customer_id = ?');
      params.push(customerId);
    }
    if (statuses?.length) {
      conditions.push(`w.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
    if (date) {
      conditions.push('substr(w.queued_at, 1, 10) = ?');
      params.push(date);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.#db
      .prepare(`${SELECT_WASH} ${where} ORDER BY w.queued_at, w.id LIMIT ?`)
      .all(...params, limit)
      .map(toWash);
  }

  insert(wash, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO washes (customer_id, vehicle_id, plate, class_id, class_code, plan_id, plan_name,
          duration_min, base_price_cents, discount_cents, loyalty_benefit_cents, final_price_cents, currency,
          status, source, queued_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        wash.customerId,
        wash.vehicleId,
        wash.plate,
        wash.classId,
        wash.classCode,
        wash.planId,
        wash.planName,
        wash.durationMin,
        wash.basePriceCents,
        wash.discountCents,
        wash.loyaltyBenefitCents,
        wash.finalPriceCents,
        wash.currency,
        wash.status,
        wash.source,
        wash.queuedAt,
        wash.createdBy,
        now,
        now,
      );
    return Number(lastInsertRowid);
  }

  /**
   * Aplica as alterações só se o estado ainda for o esperado (protege contra pedidos concorrentes).
   * @returns true se o serviço foi alterado
   */
  applyTransition(id, expectedStatus, changes, now) {
    const entries = Object.entries(changes).map(([field, value]) => {
      const column = TRANSITION_COLUMNS[field];
      if (!column) throw new Error(`Campo de serviço desconhecido: ${field}`);
      return [column, typeof value === 'boolean' ? Number(value) : value];
    });
    const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
    const { changes: affected } = this.#db
      .prepare(`UPDATE washes SET ${assignments}, updated_at = ? WHERE id = ? AND status = ?`)
      .run(...entries.map(([, value]) => value), now, id, expectedStatus);
    return affected === 1;
  }

  appendEvent(washId, { from, to, stationId, actor, reason, details }, now) {
    this.#db
      .prepare(`INSERT INTO wash_status_events
        (wash_id, from_status, to_status, station_id, actor, reason, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(washId, from, to, stationId ?? null, actor, reason ?? null, details ? JSON.stringify(details) : null, now);
  }

  listEvents(washId) {
    return this.#db
      .prepare(`SELECT e.*, s.code AS station_code FROM wash_status_events e
        LEFT JOIN stations s ON s.id = e.station_id WHERE e.wash_id = ? ORDER BY e.id`)
      .all(washId)
      .map(toEvent);
  }
}
