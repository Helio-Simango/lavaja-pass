-- I-0 · Fundação: parâmetros configuráveis e registo de alterações.

-- Parâmetros configuráveis. "to_validate" = 1 marca valores de demonstração por validar.
CREATE TABLE settings (
  key          TEXT PRIMARY KEY,
  value_json   TEXT NOT NULL CHECK (json_valid(value_json)),
  description  TEXT NOT NULL,
  to_validate  INTEGER NOT NULL DEFAULT 1 CHECK (to_validate IN (0, 1)),
  updated_at   TEXT NOT NULL
);

-- Alterações de preços e parâmetros (quem, quando, valor anterior e novo). Só acrescenta registos.
CREATE TABLE change_log (
  id          INTEGER PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  actor       TEXT NOT NULL,
  reason      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_change_log_entity ON change_log (entity, entity_id);

CREATE TRIGGER change_log_no_update BEFORE UPDATE ON change_log
BEGIN SELECT RAISE(ABORT, 'change_log só aceita novos registos'); END;

CREATE TRIGGER change_log_no_delete BEFORE DELETE ON change_log
BEGIN SELECT RAISE(ABORT, 'change_log só aceita novos registos'); END;
