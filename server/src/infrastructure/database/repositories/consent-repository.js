// Histórico de consentimentos do cliente. O último registo de cada tipo é o que vale.

export class SqliteConsentRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  insert({ customerId, type, granted, source }, now) {
    this.#db
      .prepare('INSERT INTO consents (customer_id, type, granted, source, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, type, granted ? 1 : 0, source, now);
  }

  /** @returns { [type]: { granted, source, at } } com o estado actual de cada consentimento dado */
  currentFor(customerId) {
    const rows = this.#db
      .prepare(`SELECT c.* FROM consents c
        WHERE c.customer_id = ? AND c.id = (SELECT MAX(id) FROM consents WHERE customer_id = c.customer_id AND type = c.type)`)
      .all(customerId);
    return Object.fromEntries(
      rows.map((row) => [row.type, { granted: row.granted === 1, source: row.source, at: row.created_at }]),
    );
  }
}
