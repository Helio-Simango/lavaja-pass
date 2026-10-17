// Classes de viatura, planos e preços por classe.

const toVehicleClass = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
});

const toPrice = (row) => ({
  classId: row.class_id,
  classCode: row.class_code,
  priceCents: row.price_cents,
  currency: row.currency,
});

const PLAN_COLUMNS = Object.freeze({
  name: 'name',
  description: 'description',
  baseDurationMin: 'base_duration_min',
  active: 'active',
});

export class SqliteCatalogRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  listClasses() {
    return this.#db.prepare('SELECT * FROM vehicle_classes ORDER BY sort_order').all().map(toVehicleClass);
  }

  /** @param ref { id } ou { code } */
  findClass(ref) {
    const row = 'code' in ref
      ? this.#db.prepare('SELECT * FROM vehicle_classes WHERE code = ?').get(ref.code)
      : this.#db.prepare('SELECT * FROM vehicle_classes WHERE id = ?').get(ref.id);
    return row ? toVehicleClass(row) : null;
  }

  listPlans() {
    return this.#db
      .prepare('SELECT * FROM wash_plans ORDER BY sort_order, id')
      .all()
      .map((row) => this.#toPlan(row));
  }

  findPlan(id) {
    const row = this.#db.prepare('SELECT * FROM wash_plans WHERE id = ?').get(id);
    return row ? this.#toPlan(row) : null;
  }

  /** @param fields subconjunto de { name, description, baseDurationMin, active } */
  updatePlan(id, fields, now) {
    for (const [field, value] of Object.entries(fields)) {
      const column = PLAN_COLUMNS[field];
      if (!column) throw new Error(`Campo de plano desconhecido: ${field}`);
      const stored = field === 'active' ? Number(value) : value;
      this.#db.prepare(`UPDATE wash_plans SET ${column} = ?, updated_at = ? WHERE id = ?`).run(stored, now, id);
    }
  }

  upsertPrice({ planId, classId, priceCents }, now) {
    this.#db
      .prepare(`INSERT INTO class_plan_prices (plan_id, class_id, price_cents, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (plan_id, class_id) DO UPDATE SET price_cents = excluded.price_cents, updated_at = excluded.updated_at`)
      .run(planId, classId, priceCents, now);
  }

  #toPlan(row) {
    const prices = this.#db
      .prepare(`SELECT p.class_id, c.code AS class_code, p.price_cents, p.currency
        FROM class_plan_prices p JOIN vehicle_classes c ON c.id = p.class_id
        WHERE p.plan_id = ? ORDER BY c.sort_order`)
      .all(row.id)
      .map(toPrice);
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      baseDurationMin: row.base_duration_min,
      active: row.active === 1,
      prices,
    };
  }
}
