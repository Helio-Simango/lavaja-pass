-- I-11 · Autenticação e perfis (D-16 decidida): operador (nome + PIN), gestor e analista bancário
-- (email + senha). O cliente entra pelo telefone, com um código enviado na conversa.

CREATE TABLE users (
  id               INTEGER PRIMARY KEY,
  role             TEXT NOT NULL CHECK (role IN ('operator', 'manager', 'bank_analyst')),
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  email            TEXT UNIQUE,
  pin_hash         TEXT,
  password_hash    TEXT,
  institution_id   INTEGER REFERENCES institutions (id),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TEXT,
  session_version  INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  -- O operador entra com PIN; o gestor e o analista com email e senha.
  CHECK ((role = 'operator') = (pin_hash IS NOT NULL)),
  CHECK ((role = 'operator') OR (email IS NOT NULL AND password_hash IS NOT NULL)),
  -- O analista pertence a uma instituição; só vê os relatórios que a lavadora lhe autorizou.
  CHECK ((role = 'bank_analyst') = (institution_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_users_operator_name ON users (name) WHERE role = 'operator';

-- Códigos de acesso do cliente: guardados só como hash; uso único, validade curta e tentativas limitadas.
CREATE TABLE customer_login_codes (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers (id),
  code_hash    TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  used_at      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_customer_login_codes ON customer_login_codes (customer_id, id);

-- Registo de entradas, falhas, bloqueios e saídas. Só acrescenta registos.
CREATE TABLE auth_events (
  id           INTEGER PRIMARY KEY,
  role         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  event        TEXT NOT NULL CHECK (event IN ('login', 'login_failed', 'locked', 'logout', 'code_sent', 'link_used')),
  detail       TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_auth_events_subject ON auth_events (role, subject, id);

CREATE TRIGGER auth_events_no_update BEFORE UPDATE ON auth_events
BEGIN SELECT RAISE(ABORT, 'auth_events só aceita novos registos'); END;

CREATE TRIGGER auth_events_no_delete BEFORE DELETE ON auth_events
BEGIN SELECT RAISE(ABORT, 'auth_events só aceita novos registos'); END;
