// Instituições, autorizações de partilha dadas pela lavadora e registo de acessos.

const toInstitution = (row) => ({ id: row.id, code: row.code, name: row.name });

const toAuthorization = (row) => ({
  id: row.id,
  reference: row.reference,
  institutionId: row.institution_id,
  institutionName: row.institution_name,
  purpose: row.purpose,
  sections: JSON.parse(row.scope_json),
  dataMonths: row.data_months,
  validUntil: row.valid_until,
  grantedBy: row.granted_by,
  grantedAt: row.granted_at,
  revokedAt: row.revoked_at,
  revokedBy: row.revoked_by,
  revokeReason: row.revoke_reason,
  accessCount: row.access_count ?? 0,
});

const toAccessLog = (row) => ({
  id: row.id,
  authorizationId: row.authorization_id,
  reference: row.reference,
  institutionName: row.institution_name,
  actor: row.actor,
  action: row.action,
  sections: JSON.parse(row.sections_json),
  dataFrom: row.data_from,
  dataTo: row.data_to,
  createdAt: row.created_at,
});

const SELECT_AUTHORIZATION = `SELECT a.*, i.name AS institution_name,
    (SELECT COUNT(*) FROM access_logs l WHERE l.authorization_id = a.id) AS access_count
  FROM data_sharing_authorizations a JOIN institutions i ON i.id = a.institution_id`;

export class SqliteSharingRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  listInstitutions() {
    return this.#db.prepare('SELECT * FROM institutions ORDER BY name').all().map(toInstitution);
  }

  findInstitution(id) {
    const row = this.#db.prepare('SELECT * FROM institutions WHERE id = ?').get(id);
    return row ? toInstitution(row) : null;
  }

  insertInstitution({ code, name }, now) {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO institutions (code, name, created_at) VALUES (?, ?, ?)')
      .run(code, name, now);
    return Number(lastInsertRowid);
  }

  nextAuthorizationSequence() {
    return this.#db.prepare('SELECT COUNT(*) + 1 AS next FROM data_sharing_authorizations').get().next;
  }

  insertAuthorization(authorization) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO data_sharing_authorizations
          (reference, institution_id, purpose, scope_json, data_months, valid_until, granted_by, granted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        authorization.reference,
        authorization.institutionId,
        authorization.purpose,
        JSON.stringify(authorization.sections),
        authorization.dataMonths,
        authorization.validUntil,
        authorization.grantedBy,
        authorization.grantedAt,
      );
    return Number(lastInsertRowid);
  }

  findAuthorization(id) {
    const row = this.#db.prepare(`${SELECT_AUTHORIZATION} WHERE a.id = ?`).get(id);
    return row ? toAuthorization(row) : null;
  }

  listAuthorizations() {
    return this.#db.prepare(`${SELECT_AUTHORIZATION} ORDER BY a.id DESC`).all().map(toAuthorization);
  }

  revokeAuthorization(id, { revokedAt, revokedBy, revokeReason }) {
    this.#db
      .prepare('UPDATE data_sharing_authorizations SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?')
      .run(revokedAt, revokedBy, revokeReason, id);
  }

  countActive(now) {
    return this.#db
      .prepare('SELECT COUNT(*) AS total FROM data_sharing_authorizations WHERE revoked_at IS NULL AND valid_until > ?')
      .get(now).total;
  }

  insertAccessLog({ authorizationId, institutionId, actor, action, sections, dataFrom, dataTo }, now) {
    this.#db
      .prepare(`INSERT INTO access_logs (authorization_id, institution_id, actor, action, sections_json, data_from, data_to, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(authorizationId, institutionId, actor, action, JSON.stringify(sections), dataFrom, dataTo, now);
  }

  listAccessLogs({ authorizationId } = {}) {
    return this.#db
      .prepare(`SELECT l.*, a.reference, i.name AS institution_name FROM access_logs l
        JOIN data_sharing_authorizations a ON a.id = l.authorization_id
        JOIN institutions i ON i.id = l.institution_id
        WHERE (:authorizationId IS NULL OR l.authorization_id = :authorizationId)
        ORDER BY l.id DESC`)
      .all({ authorizationId: authorizationId ?? null })
      .map(toAccessLog);
  }
}
