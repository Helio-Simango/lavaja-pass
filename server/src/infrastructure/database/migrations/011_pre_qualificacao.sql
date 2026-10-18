-- I-11 · Pré-qualificação (proposta v1, secção 8): o analista pede uma análise de crédito formal a
-- partir do relatório autorizado. Fica registado com o score e o montante indicativo desse momento.
-- O pedido não é uma decisão: a análise e a decisão são do banco.

CREATE TABLE credit_analysis_requests (
  id                       INTEGER PRIMARY KEY,
  authorization_id         INTEGER NOT NULL REFERENCES data_sharing_authorizations (id),
  institution_id           INTEGER NOT NULL REFERENCES institutions (id),
  requested_by             TEXT NOT NULL,
  score_total              INTEGER NOT NULL CHECK (score_total BETWEEN 0 AND 100),
  score_class              TEXT NOT NULL CHECK (score_class IN ('A', 'B', 'C')),
  indicative_amount_cents  INTEGER NOT NULL CHECK (indicative_amount_cents >= 0),
  note                     TEXT,
  created_at               TEXT NOT NULL
);
CREATE INDEX idx_credit_requests_authorization ON credit_analysis_requests (authorization_id, id);

CREATE TRIGGER credit_requests_no_update BEFORE UPDATE ON credit_analysis_requests
BEGIN SELECT RAISE(ABORT, 'credit_analysis_requests só aceita novos registos'); END;

CREATE TRIGGER credit_requests_no_delete BEFORE DELETE ON credit_analysis_requests
BEGIN SELECT RAISE(ABORT, 'credit_analysis_requests só aceita novos registos'); END;
