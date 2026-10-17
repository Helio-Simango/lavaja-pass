-- I-9 · Reconciliação (cap. 13.3): fecho diário por operador — numerário declarado vs. contado —
-- e correcções registadas sobre as inconsistências, nunca apagadas.

CREATE TABLE cash_closings (
  id                INTEGER PRIMARY KEY,
  business_date     TEXT NOT NULL CHECK (business_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  operator          TEXT NOT NULL,
  declared_cents    INTEGER NOT NULL CHECK (declared_cents >= 0),
  counted_cents     INTEGER NOT NULL CHECK (counted_cents >= 0),
  difference_cents  INTEGER NOT NULL,
  note              TEXT,
  closed_by         TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  UNIQUE (business_date, operator),
  CHECK (difference_cents = counted_cents - declared_cents),
  CHECK (difference_cents = 0 OR note IS NOT NULL)
);

CREATE TRIGGER cash_closings_no_update BEFORE UPDATE ON cash_closings
BEGIN SELECT RAISE(ABORT, 'cash_closings só aceita novos registos'); END;

CREATE TRIGGER cash_closings_no_delete BEFORE DELETE ON cash_closings
BEGIN SELECT RAISE(ABORT, 'cash_closings só aceita novos registos'); END;

CREATE TABLE reconciliation_notes (
  id             INTEGER PRIMARY KEY,
  business_date  TEXT NOT NULL,
  wash_id        INTEGER REFERENCES washes (id),
  issue_code     TEXT NOT NULL,
  note           TEXT NOT NULL CHECK (length(note) >= 3),
  actor          TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_reconciliation_notes_date ON reconciliation_notes (business_date, id);

CREATE TRIGGER reconciliation_notes_no_update BEFORE UPDATE ON reconciliation_notes
BEGIN SELECT RAISE(ABORT, 'reconciliation_notes só aceita novos registos'); END;

CREATE TRIGGER reconciliation_notes_no_delete BEFORE DELETE ON reconciliation_notes
BEGIN SELECT RAISE(ABORT, 'reconciliation_notes só aceita novos registos'); END;
