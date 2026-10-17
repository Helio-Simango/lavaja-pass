const toSetting = (row) => ({
  key: row.key,
  value: JSON.parse(row.value_json),
  description: row.description,
  toValidate: row.to_validate === 1,
  updatedAt: row.updated_at,
});

export class SqliteSettingsRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  list() {
    return this.#db.prepare('SELECT * FROM settings ORDER BY key').all().map(toSetting);
  }

  find(key) {
    const row = this.#db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
    return row ? toSetting(row) : null;
  }

  insertIfMissing({ key, value, description, toValidate }, now) {
    this.#db
      .prepare(`INSERT INTO settings (key, value_json, description, to_validate, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (key) DO NOTHING`)
      .run(key, JSON.stringify(value), description, toValidate ? 1 : 0, now);
  }
}
