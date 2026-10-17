-- I-7 · Vertente Lavadora–Banco (cap. 9 e 14): autorização explícita da lavadora, com finalidade,
-- âmbito, período de dados e validade; revogável; cada consulta registada.

CREATE TABLE institutions (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE data_sharing_authorizations (
  id              INTEGER PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,
  institution_id  INTEGER NOT NULL REFERENCES institutions (id),
  purpose         TEXT NOT NULL,
  scope_json      TEXT NOT NULL CHECK (json_valid(scope_json)),
  data_months     INTEGER NOT NULL CHECK (data_months BETWEEN 1 AND 24),
  valid_until     TEXT NOT NULL,
  granted_by      TEXT NOT NULL,
  granted_at      TEXT NOT NULL,
  revoked_at      TEXT,
  revoked_by      TEXT,
  revoke_reason   TEXT,
  CHECK (valid_until > granted_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

-- Uma autorização não muda depois de dada: só pode ser revogada, uma vez.
CREATE TRIGGER sharing_authorizations_immutable
BEFORE UPDATE OF reference, institution_id, purpose, scope_json, data_months, valid_until, granted_by, granted_at
ON data_sharing_authorizations
BEGIN SELECT RAISE(ABORT, 'uma autorização não pode ser alterada, só revogada'); END;

CREATE TRIGGER sharing_authorizations_revoke_once BEFORE UPDATE ON data_sharing_authorizations
WHEN OLD.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'autorização já revogada'); END;

CREATE TRIGGER sharing_authorizations_no_delete BEFORE DELETE ON data_sharing_authorizations
BEGIN SELECT RAISE(ABORT, 'data_sharing_authorizations só aceita novos registos'); END;

-- Registo de consultas e exportações: quem, quando, o quê e ao abrigo de que autorização.
CREATE TABLE access_logs (
  id                INTEGER PRIMARY KEY,
  authorization_id  INTEGER NOT NULL REFERENCES data_sharing_authorizations (id),
  institution_id    INTEGER NOT NULL REFERENCES institutions (id),
  actor             TEXT NOT NULL,
  action            TEXT NOT NULL CHECK (action IN ('view', 'export')),
  sections_json     TEXT NOT NULL CHECK (json_valid(sections_json)),
  data_from         TEXT NOT NULL,
  data_to           TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_access_logs_authorization ON access_logs (authorization_id, id);

CREATE TRIGGER access_logs_no_update BEFORE UPDATE ON access_logs
BEGIN SELECT RAISE(ABORT, 'access_logs só aceita novos registos'); END;

CREATE TRIGGER access_logs_no_delete BEFORE DELETE ON access_logs
BEGIN SELECT RAISE(ABORT, 'access_logs só aceita novos registos'); END;
