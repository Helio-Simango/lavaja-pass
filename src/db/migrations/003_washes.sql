-- I-2 · Serviços, fila, postos e auditoria de transições.

-- Postos de lavagem (P1, P2, ...). A capacidade completa (trabalhadores, pausas) é do marco I-8.
CREATE TABLE stations (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Cada serviço guarda o retrato do que foi aplicado; alterar o catálogo não muda o histórico.
CREATE TABLE washes (
  id                     INTEGER PRIMARY KEY,
  customer_id            INTEGER NOT NULL,
  vehicle_id             INTEGER NOT NULL,
  plate                  TEXT NOT NULL,
  class_id               INTEGER NOT NULL REFERENCES vehicle_classes (id),
  class_code             TEXT NOT NULL CHECK (class_code IN ('A', 'B', 'C')),
  plan_id                INTEGER NOT NULL REFERENCES wash_plans (id),
  plan_name              TEXT NOT NULL,
  duration_min           INTEGER NOT NULL CHECK (duration_min > 0),
  base_price_cents       INTEGER NOT NULL CHECK (base_price_cents >= 0),
  discount_cents         INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  loyalty_benefit_cents  INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_benefit_cents >= 0),
  final_price_cents      INTEGER NOT NULL CHECK (final_price_cents >= 0),
  currency               TEXT NOT NULL DEFAULT 'MZN',
  status                 TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'in_progress', 'ready', 'completed', 'cancelled')),
  station_id             INTEGER REFERENCES stations (id),
  source                 TEXT NOT NULL DEFAULT 'patio' CHECK (source IN ('patio', 'simulador', 'demo')),
  queued_at              TEXT NOT NULL,
  started_at             TEXT,
  ready_at               TEXT,
  completed_at           TEXT,
  cancelled_at           TEXT,
  cancel_reason          TEXT,
  completed_unpaid       INTEGER NOT NULL DEFAULT 0 CHECK (completed_unpaid IN (0, 1)),
  created_by             TEXT NOT NULL,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicles (id, customer_id),
  CHECK (final_price_cents = base_price_cents - discount_cents - loyalty_benefit_cents),
  CHECK (status NOT IN ('in_progress', 'ready') OR station_id IS NOT NULL),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX idx_washes_status ON washes (status, queued_at);
CREATE INDEX idx_washes_vehicle ON washes (vehicle_id);
CREATE INDEX idx_washes_customer ON washes (customer_id);

-- Um posto só tem um serviço activo (ocupado = em execução ou pronto).
CREATE UNIQUE INDEX uq_washes_station_busy ON washes (station_id)
  WHERE status IN ('in_progress', 'ready');

-- Uma viatura não pode estar duas vezes no pátio ao mesmo tempo.
CREATE UNIQUE INDEX uq_washes_vehicle_active ON washes (vehicle_id)
  WHERE status IN ('queued', 'in_progress', 'ready');

-- Auditoria de todas as transições (data, estado anterior e novo, autor, motivo).
CREATE TABLE wash_status_events (
  id            INTEGER PRIMARY KEY,
  wash_id       INTEGER NOT NULL REFERENCES washes (id),
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  station_id    INTEGER REFERENCES stations (id),
  actor         TEXT NOT NULL,
  reason        TEXT,
  details_json  TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_wash_events_wash ON wash_status_events (wash_id, id);

CREATE TRIGGER wash_events_no_update BEFORE UPDATE ON wash_status_events
BEGIN SELECT RAISE(ABORT, 'wash_status_events só aceita novos registos'); END;

CREATE TRIGGER wash_events_no_delete BEFORE DELETE ON wash_status_events
BEGIN SELECT RAISE(ABORT, 'wash_status_events só aceita novos registos'); END;

-- Estados finais: um serviço concluído ou cancelado não volta a um estado activo.
CREATE TRIGGER washes_final_states BEFORE UPDATE OF status ON washes
WHEN OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status
BEGIN SELECT RAISE(ABORT, 'serviço em estado final'); END;
