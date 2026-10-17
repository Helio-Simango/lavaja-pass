// Marcações, a sua auditoria e as propostas de antecipação.

const SELECT_APPOINTMENT = `SELECT a.*, cu.name AS customer_name, cu.phone AS customer_phone, s.code AS station_code
  FROM appointments a
  JOIN customers cu ON cu.id = a.customer_id
  JOIN stations s ON s.id = a.station_id`;

const APPOINTMENT_COLUMNS = Object.freeze({
  status: 'status',
  cancelReason: 'cancel_reason',
  washId: 'wash_id',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  stationId: 'station_id',
});

const toAppointment = (row) => ({
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
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  stationId: row.station_id,
  stationCode: row.station_code,
  status: row.status,
  source: row.source,
  washId: row.wash_id,
  cancelReason: row.cancel_reason,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

const toOffer = (row) => ({
  id: row.id,
  appointmentId: row.appointment_id,
  originalStartsAt: row.original_starts_at,
  proposedStartsAt: row.proposed_starts_at,
  proposedStationId: row.proposed_station_id,
  status: row.status,
  expiresAt: row.expires_at,
  createdBy: row.created_by,
  createdAt: row.created_at,
  respondedAt: row.responded_at,
});

export class SqliteAppointmentRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare(`${SELECT_APPOINTMENT} WHERE a.id = ?`).get(id);
    return row ? toAppointment(row) : null;
  }

  /** Marcações que começam no intervalo, opcionalmente só em certos estados ou de um cliente. */
  listBetween(from, to, { statuses, customerId } = {}) {
    const conditions = ['a.starts_at >= ?', 'a.starts_at < ?'];
    const params = [from, to];
    if (statuses?.length) {
      conditions.push(`a.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
    if (customerId !== undefined) {
      conditions.push('a.customer_id = ?');
      params.push(customerId);
    }
    return this.#db
      .prepare(`${SELECT_APPOINTMENT} WHERE ${conditions.join(' AND ')} ORDER BY a.starts_at, a.id`)
      .all(...params)
      .map(toAppointment);
  }

  insert(appointment, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO appointments (customer_id, vehicle_id, plate, class_id, class_code, plan_id, plan_name,
          duration_min, starts_at, ends_at, station_id, status, source, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        appointment.customerId,
        appointment.vehicleId,
        appointment.plate,
        appointment.classId,
        appointment.classCode,
        appointment.planId,
        appointment.planName,
        appointment.durationMin,
        appointment.startsAt,
        appointment.endsAt,
        appointment.stationId,
        appointment.status,
        appointment.source,
        appointment.createdBy,
        now,
        now,
      );
    return Number(lastInsertRowid);
  }

  /** Aplica as alterações só se o estado ainda for o esperado. @returns true se alterou */
  update(id, expectedStatus, changes, now) {
    const entries = Object.entries(changes).map(([field, value]) => {
      const column = APPOINTMENT_COLUMNS[field];
      if (!column) throw new Error(`Campo de marcação desconhecido: ${field}`);
      return [column, value];
    });
    const assignments = entries.map(([column]) => `${column} = ?`).join(', ');
    const { changes: affected } = this.#db
      .prepare(`UPDATE appointments SET ${assignments}, updated_at = ? WHERE id = ? AND status = ?`)
      .run(...entries.map(([, value]) => value), now, id, expectedStatus);
    return affected === 1;
  }

  appendEvent(appointmentId, { kind, fromStatus, toStatus, fromStartsAt, toStartsAt, actor, reason }, now) {
    this.#db
      .prepare(`INSERT INTO appointment_events
          (appointment_id, kind, from_status, to_status, from_starts_at, to_starts_at, actor, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(appointmentId, kind, fromStatus ?? null, toStatus ?? null, fromStartsAt ?? null, toStartsAt ?? null, actor, reason ?? null, now);
  }

  listEvents(appointmentId) {
    return this.#db
      .prepare('SELECT * FROM appointment_events WHERE appointment_id = ? ORDER BY id')
      .all(appointmentId)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        fromStartsAt: row.from_starts_at,
        toStartsAt: row.to_starts_at,
        actor: row.actor,
        reason: row.reason,
        createdAt: row.created_at,
      }));
  }

  insertOffer(offer, actor, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO appointment_offers (appointment_id, original_starts_at, proposed_starts_at, proposed_station_id,
          status, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(offer.appointmentId, offer.originalStartsAt, offer.proposedStartsAt, offer.proposedStationId, offer.status, offer.expiresAt, actor, now);
    return Number(lastInsertRowid);
  }

  findOffer(id) {
    const row = this.#db.prepare('SELECT * FROM appointment_offers WHERE id = ?').get(id);
    return row ? toOffer(row) : null;
  }

  listOffers(appointmentId) {
    return this.#db.prepare('SELECT * FROM appointment_offers WHERE appointment_id = ? ORDER BY id').all(appointmentId).map(toOffer);
  }

  /** Propostas ainda marcadas como pendentes (podem já ter expirado; o estado real é calculado). */
  listPendingOffers({ customerId } = {}) {
    return this.#db
      .prepare(`SELECT o.* FROM appointment_offers o JOIN appointments a ON a.id = o.appointment_id
        WHERE o.status = 'pending' AND (:customerId IS NULL OR a.customer_id = :customerId) ORDER BY o.id`)
      .all({ customerId: customerId ?? null })
      .map(toOffer);
  }

  updateOffer(id, { status, respondedAt }) {
    this.#db.prepare('UPDATE appointment_offers SET status = ?, responded_at = ? WHERE id = ?').run(status, respondedAt ?? null, id);
  }
}
