const toCustomer = (row) => ({
  id: row.id,
  phone: row.phone,
  name: row.name,
  createdAt: row.created_at,
});

export class SqliteCustomerRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return row ? toCustomer(row) : null;
  }

  findByPhone(phone) {
    const row = this.#db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    return row ? toCustomer(row) : null;
  }

  list({ limit }) {
    return this.#db.prepare('SELECT * FROM customers ORDER BY name, id LIMIT ?').all(limit).map(toCustomer);
  }

  count() {
    return this.#db.prepare('SELECT COUNT(*) AS total FROM customers').get().total;
  }

  insert({ phone, name }, now) {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO customers (phone, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(phone, name, now, now);
    return Number(lastInsertRowid);
  }
}
