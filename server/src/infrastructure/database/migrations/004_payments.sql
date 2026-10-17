-- I-3 · Pagamentos simulados e numerário declarado (cap. 10.4).
-- Nenhum pagamento é uma transacção real: o digital é simulado e o numerário é declarado.

CREATE TABLE payments (
  id                      INTEGER PRIMARY KEY,
  wash_id                 INTEGER NOT NULL REFERENCES washes (id),
  method                  TEXT NOT NULL CHECK (method IN ('digital', 'cash')),
  status                  TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'declared', 'failed', 'refunded')),
  amount_cents            INTEGER NOT NULL CHECK (amount_cents > 0),
  currency                TEXT NOT NULL,
  idempotency_key         TEXT NOT NULL UNIQUE,
  declared_by             TEXT,
  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  confirmed_at            TEXT,
  declared_at             TEXT,
  failed_at               TEXT,
  failure_reason          TEXT,
  refunded_at             TEXT,
  refunded_by             TEXT,
  refund_reason           TEXT,
  refund_idempotency_key  TEXT UNIQUE,
  updated_at              TEXT NOT NULL,
  -- O numerário tem sempre um operador identificado; o digital nunca.
  CHECK ((method = 'cash') = (declared_by IS NOT NULL)),
  CHECK (status <> 'declared' OR method = 'cash'),
  CHECK (status NOT IN ('pending', 'confirmed') OR method = 'digital'),
  CHECK (status <> 'refunded' OR (refunded_at IS NOT NULL AND refund_reason IS NOT NULL AND refunded_by IS NOT NULL))
);
CREATE INDEX idx_payments_wash ON payments (wash_id, id);

-- No máximo um pagamento pendente e um efectivo por serviço.
CREATE UNIQUE INDEX uq_payments_pending ON payments (wash_id) WHERE status = 'pending';
CREATE UNIQUE INDEX uq_payments_effective ON payments (wash_id) WHERE status IN ('confirmed', 'declared');
