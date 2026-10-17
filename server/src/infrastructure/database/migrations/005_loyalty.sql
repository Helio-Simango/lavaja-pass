-- I-4 · Motor de fidelização parametrizável (cap. 11).
-- Uma conta por cliente; progresso separado por classe; tudo resulta de um livro de movimentos.

-- Parâmetros do programa, em versões com data de vigência. Uma versão publicada não muda.
CREATE TABLE loyalty_rules (
  id              INTEGER PRIMARY KEY,
  version         INTEGER NOT NULL UNIQUE,
  params_json     TEXT NOT NULL CHECK (json_valid(params_json)),
  effective_from  TEXT NOT NULL,
  to_validate     INTEGER NOT NULL DEFAULT 1 CHECK (to_validate IN (0, 1)),
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TRIGGER loyalty_rules_no_update BEFORE UPDATE ON loyalty_rules
BEGIN SELECT RAISE(ABORT, 'loyalty_rules só aceita novos registos'); END;

CREATE TRIGGER loyalty_rules_no_delete BEFORE DELETE ON loyalty_rules
BEGIN SELECT RAISE(ABORT, 'loyalty_rules só aceita novos registos'); END;

CREATE TABLE loyalty_accounts (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL UNIQUE REFERENCES customers (id),
  created_at   TEXT NOT NULL
);

-- Livro de movimentos. A referência é única por serviço e tipo: repetir um pedido nunca duplica.
--   earn                lavagem elegível (+1 lavagem)
--   grant               benefícios atribuídos ao completar um ciclo (+N benefícios)
--   redeem              benefício usado num serviço (−1 benefício)
--   restore             benefício devolvido por cancelamento (+1 benefício)
--   revert              progresso revertido por reembolso
--   revert_not_applied  reembolso cujo progresso já tinha sido consumido (só auditoria)
CREATE TABLE loyalty_transactions (
  id                   INTEGER PRIMARY KEY,
  account_id           INTEGER NOT NULL REFERENCES loyalty_accounts (id),
  class_id             INTEGER NOT NULL REFERENCES vehicle_classes (id),
  type                 TEXT NOT NULL
                       CHECK (type IN ('earn', 'grant', 'redeem', 'restore', 'revert', 'revert_not_applied')),
  wash_id              INTEGER REFERENCES washes (id),
  reference            TEXT NOT NULL UNIQUE,
  washes_delta         INTEGER NOT NULL DEFAULT 0,
  benefits_delta       INTEGER NOT NULL DEFAULT 0,
  benefit_value_cents  INTEGER CHECK (benefit_value_cents IS NULL OR benefit_value_cents >= 0),
  rules_version        INTEGER NOT NULL,
  actor                TEXT NOT NULL,
  details_json         TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at           TEXT NOT NULL
);
CREATE INDEX idx_loyalty_tx_account_class ON loyalty_transactions (account_id, class_id, id);
CREATE INDEX idx_loyalty_tx_wash ON loyalty_transactions (wash_id);

CREATE TRIGGER loyalty_tx_no_update BEFORE UPDATE ON loyalty_transactions
BEGIN SELECT RAISE(ABORT, 'loyalty_transactions só aceita novos registos'); END;

CREATE TRIGGER loyalty_tx_no_delete BEFORE DELETE ON loyalty_transactions
BEGIN SELECT RAISE(ABORT, 'loyalty_transactions só aceita novos registos'); END;

-- O saldo de benefícios e a contagem de lavagens nunca ficam negativos.
CREATE TRIGGER loyalty_balance_never_negative AFTER INSERT ON loyalty_transactions
WHEN (SELECT SUM(benefits_delta) FROM loyalty_transactions
        WHERE account_id = NEW.account_id AND class_id = NEW.class_id) < 0
  OR (SELECT SUM(washes_delta) FROM loyalty_transactions
        WHERE account_id = NEW.account_id AND class_id = NEW.class_id) < 0
BEGIN SELECT RAISE(ABORT, 'saldo de fidelização negativo'); END;
