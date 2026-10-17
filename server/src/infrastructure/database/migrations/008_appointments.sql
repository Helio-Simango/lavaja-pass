-- I-8 · Marcações e capacidade (cap. 12). Uma marcação confirmada reserva um bloco num posto
-- (duração + margem de segurança) e nunca é antecipada sem aceitação do cliente (DEC-10).

CREATE TABLE appointments (
  id             INTEGER PRIMARY KEY,
  customer_id    INTEGER NOT NULL,
  vehicle_id     INTEGER NOT NULL,
  plate          TEXT NOT NULL,
  class_id       INTEGER NOT NULL REFERENCES vehicle_classes (id),
  class_code     TEXT NOT NULL CHECK (class_code IN ('A', 'B', 'C')),
  plan_id        INTEGER NOT NULL REFERENCES wash_plans (id),
  plan_name      TEXT NOT NULL,
  duration_min   INTEGER NOT NULL CHECK (duration_min > 0),
  starts_at      TEXT NOT NULL,
  ends_at        TEXT NOT NULL,
  station_id     INTEGER NOT NULL REFERENCES stations (id),
  status         TEXT NOT NULL CHECK (status IN ('requested', 'confirmed', 'checked_in', 'cancelled', 'no_show')),
  source         TEXT NOT NULL CHECK (source IN ('patio', 'simulador', 'demo')),
  wash_id        INTEGER REFERENCES washes (id),
  cancel_reason  TEXT,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicles (id, customer_id),
  CHECK (ends_at > starts_at),
  CHECK (status <> 'checked_in' OR wash_id IS NOT NULL)
);
CREATE INDEX idx_appointments_day ON appointments (starts_at);
CREATE INDEX idx_appointments_customer ON appointments (customer_id);

CREATE TRIGGER appointments_final_states BEFORE UPDATE OF status ON appointments
WHEN OLD.status IN ('checked_in', 'cancelled', 'no_show') AND NEW.status <> OLD.status
BEGIN SELECT RAISE(ABORT, 'marcação em estado final'); END;

-- Auditoria: criação, transições e remarcações (com o horário anterior e o novo).
CREATE TABLE appointment_events (
  id               INTEGER PRIMARY KEY,
  appointment_id   INTEGER NOT NULL REFERENCES appointments (id),
  kind             TEXT NOT NULL CHECK (kind IN ('created', 'transition', 'rescheduled')),
  from_status      TEXT,
  to_status        TEXT,
  from_starts_at   TEXT,
  to_starts_at     TEXT,
  actor            TEXT NOT NULL,
  reason           TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_appointment_events ON appointment_events (appointment_id, id);

CREATE TRIGGER appointment_events_no_update BEFORE UPDATE ON appointment_events
BEGIN SELECT RAISE(ABORT, 'appointment_events só aceita novos registos'); END;

CREATE TRIGGER appointment_events_no_delete BEFORE DELETE ON appointment_events
BEGIN SELECT RAISE(ABORT, 'appointment_events só aceita novos registos'); END;

-- Propostas de antecipação: só mudam a marcação se o cliente aceitar (cap. 12.4).
CREATE TABLE appointment_offers (
  id                   INTEGER PRIMARY KEY,
  appointment_id       INTEGER NOT NULL REFERENCES appointments (id),
  original_starts_at   TEXT NOT NULL,
  proposed_starts_at   TEXT NOT NULL,
  proposed_station_id  INTEGER NOT NULL REFERENCES stations (id),
  status               TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at           TEXT NOT NULL,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  responded_at         TEXT,
  CHECK (proposed_starts_at < original_starts_at)
);
CREATE UNIQUE INDEX uq_offers_pending ON appointment_offers (appointment_id) WHERE status = 'pending';

-- O serviço criado na chegada fica ligado à marcação (tem prioridade no seu posto).
ALTER TABLE washes ADD COLUMN appointment_id INTEGER REFERENCES appointments (id);
