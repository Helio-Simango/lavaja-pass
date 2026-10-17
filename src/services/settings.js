// Parâmetros configuráveis. Os valores marcados "por validar" são de demonstração.

const mapSetting = (r) => ({
  key: r.key,
  value: JSON.parse(r.value_json),
  description: r.description,
  toValidate: r.to_validate === 1,
  updatedAt: r.updated_at,
});

export function createSettingsService({ db, clock }) {
  return {
    list() {
      return db.prepare('SELECT * FROM settings ORDER BY key').all().map(mapSetting);
    },

    get(key, fallback) {
      const row = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
      return row ? JSON.parse(row.value_json) : fallback;
    },

    define({ key, value, description, toValidate = true }) {
      db.prepare(`INSERT INTO settings (key, value_json, description, to_validate, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (key) DO NOTHING`).run(key, JSON.stringify(value), description, toValidate ? 1 : 0, clock.nowIso());
    },
  };
}
