-- I-1 · Catálogo, clientes e viaturas.

-- Exactamente três classes (A, B, C); não existe Classe D nem rota para criar classes.
CREATE TABLE vehicle_classes (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE CHECK (code IN ('A', 'B', 'C')),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  sort_order   INTEGER NOT NULL
);

CREATE TABLE wash_plans (
  id                 INTEGER PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  base_duration_min  INTEGER NOT NULL CHECK (base_duration_min > 0),
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Preço por plano e classe, em centavos. Sem linha = sem preço para essa classe.
CREATE TABLE class_plan_prices (
  plan_id      INTEGER NOT NULL REFERENCES wash_plans (id),
  class_id     INTEGER NOT NULL REFERENCES vehicle_classes (id),
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents = CAST(price_cents AS INTEGER)),
  currency     TEXT NOT NULL DEFAULT 'MZN',
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (plan_id, class_id)
);

-- O telefone normalizado é o identificador de negócio; a chave primária é interna.
CREATE TABLE customers (
  id          INTEGER PRIMARY KEY,
  phone       TEXT NOT NULL UNIQUE CHECK (phone GLOB '2588[2-7][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE vehicles (
  id            INTEGER PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers (id),
  jurisdiction  TEXT NOT NULL DEFAULT 'MZ',
  plate         TEXT NOT NULL,
  class_id      INTEGER NOT NULL REFERENCES vehicle_classes (id),
  description   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (jurisdiction, plate),
  UNIQUE (id, customer_id)  -- alvo da FK composta (viatura, cliente) dos serviços
);
CREATE INDEX idx_vehicles_customer ON vehicles (customer_id);
CREATE INDEX idx_vehicles_class ON vehicles (class_id);
