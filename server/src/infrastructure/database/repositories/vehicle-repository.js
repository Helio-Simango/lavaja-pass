const SELECT_VEHICLE = `SELECT v.*, c.code AS class_code, cu.name AS customer_name, cu.phone AS customer_phone
  FROM vehicles v
  JOIN vehicle_classes c ON c.id = v.class_id
  JOIN customers cu ON cu.id = v.customer_id`;

const toVehicle = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  jurisdiction: row.jurisdiction,
  plate: row.plate,
  classId: row.class_id,
  classCode: row.class_code,
  description: row.description,
  createdAt: row.created_at,
});

export class SqliteVehicleRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare(`${SELECT_VEHICLE} WHERE v.id = ?`).get(id);
    return row ? toVehicle(row) : null;
  }

  findByPlate(jurisdiction, plate) {
    const row = this.#db.prepare(`${SELECT_VEHICLE} WHERE v.jurisdiction = ? AND v.plate = ?`).get(jurisdiction, plate);
    return row ? toVehicle(row) : null;
  }

  listByCustomer(customerId) {
    return this.#db.prepare(`${SELECT_VEHICLE} WHERE v.customer_id = ? ORDER BY v.id`).all(customerId).map(toVehicle);
  }

  list({ classId } = {}) {
    return this.#db
      .prepare(`${SELECT_VEHICLE} WHERE (? IS NULL OR v.class_id = ?) ORDER BY v.plate`)
      .all(classId ?? null, classId ?? null)
      .map(toVehicle);
  }

  /** Viaturas com a contagem de serviços concluídos e a data do último (M12). */
  listWithStats({ classId } = {}) {
    return this.#db
      .prepare(`SELECT v.*, c.code AS class_code, cu.name AS customer_name, cu.phone AS customer_phone,
          COUNT(w.id) AS completed_count, MAX(w.completed_at) AS last_completed_at
        FROM vehicles v
        JOIN vehicle_classes c ON c.id = v.class_id
        JOIN customers cu ON cu.id = v.customer_id
        LEFT JOIN washes w ON w.vehicle_id = v.id AND w.status = 'completed'
        WHERE (:classId IS NULL OR v.class_id = :classId)
        GROUP BY v.id
        ORDER BY completed_count DESC, v.plate`)
      .all({ classId: classId ?? null })
      .map((row) => ({ ...toVehicle(row), completedCount: row.completed_count, lastCompletedAt: row.last_completed_at }));
  }

  insert({ customerId, jurisdiction, plate, classId, description }, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO vehicles (customer_id, jurisdiction, plate, class_id, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(customerId, jurisdiction, plate, classId, description, now, now);
    return Number(lastInsertRowid);
  }

  updateClass(id, classId, now) {
    this.#db.prepare('UPDATE vehicles SET class_id = ?, updated_at = ? WHERE id = ?').run(classId, now, id);
  }
}
