// Utilizadores da lavadora e do banco (operador, gestor, analista), códigos de acesso dos clientes
// e registo de entradas. Os segredos só existem como hash.

const toUser = (row) => ({
  id: row.id,
  role: row.role,
  name: row.name,
  email: row.email,
  pinHash: row.pin_hash,
  passwordHash: row.password_hash,
  institutionId: row.institution_id,
  institutionName: row.institution_name ?? null,
  active: row.active === 1,
  failedAttempts: row.failed_attempts,
  lockedUntil: row.locked_until,
  sessionVersion: row.session_version,
});

const SELECT_USER = `SELECT u.*, i.name AS institution_name FROM users u LEFT JOIN institutions i ON i.id = u.institution_id`;

export class SqliteUserRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findById(id) {
    const row = this.#db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id);
    return row ? toUser(row) : null;
  }

  findByEmail(email) {
    const row = this.#db.prepare(`${SELECT_USER} WHERE u.email = ?`).get(email);
    return row ? toUser(row) : null;
  }

  listOperators() {
    return this.#db.prepare(`${SELECT_USER} WHERE u.role = 'operator' AND u.active = 1 ORDER BY u.name`).all().map(toUser);
  }

  insert({ role, name, email = null, pinHash = null, passwordHash = null, institutionId = null }, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO users (role, name, email, pin_hash, password_hash, institution_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(role, name, email, pinHash, passwordHash, institutionId, now, now);
    return Number(lastInsertRowid);
  }

  recordAttempt(id, { failedAttempts, lockedUntil }, now) {
    this.#db
      .prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .run(failedAttempts, lockedUntil, now, id);
  }

  insertCustomerCode({ customerId, codeHash, expiresAt }, now) {
    this.#db
      .prepare('INSERT INTO customer_login_codes (customer_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(customerId, codeHash, expiresAt, now);
  }

  latestCustomerCode(customerId) {
    const row = this.#db
      .prepare('SELECT * FROM customer_login_codes WHERE customer_id = ? ORDER BY id DESC LIMIT 1')
      .get(customerId);
    return row
      ? { id: row.id, codeHash: row.code_hash, expiresAt: row.expires_at, attempts: row.attempts, usedAt: row.used_at, createdAt: row.created_at }
      : null;
  }

  countCodeAttempt(id) {
    this.#db.prepare('UPDATE customer_login_codes SET attempts = attempts + 1 WHERE id = ?').run(id);
  }

  markCodeUsed(id, now) {
    this.#db.prepare('UPDATE customer_login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, id);
  }

  appendAuthEvent({ role, subject, event, detail = null }, now) {
    this.#db
      .prepare('INSERT INTO auth_events (role, subject, event, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(role, String(subject), event, detail, now);
  }

  listAuthEvents({ limit = 50 } = {}) {
    return this.#db
      .prepare('SELECT * FROM auth_events ORDER BY id DESC LIMIT ?')
      .all(limit)
      .map((row) => ({ id: row.id, role: row.role, subject: row.subject, event: row.event, detail: row.detail, createdAt: row.created_at }));
  }
}
