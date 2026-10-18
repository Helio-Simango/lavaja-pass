-- I-11 · Campanhas fora de pico (proposta v1, secção 7.5), sempre com envio confirmado pelo gestor.
-- Uma campanha enviada não muda: fica o modelo, quem enviou, quando e a quem.

CREATE TABLE campaigns (
  id                 INTEGER PRIMARY KEY,
  offer_type         TEXT NOT NULL,
  message_template   TEXT NOT NULL,
  policy_json        TEXT NOT NULL CHECK (json_valid(policy_json)),
  recipients_count   INTEGER NOT NULL CHECK (recipients_count >= 0),
  sent_by            TEXT NOT NULL,
  sent_at            TEXT NOT NULL
);

CREATE TABLE campaign_recipients (
  id           INTEGER PRIMARY KEY,
  campaign_id  INTEGER NOT NULL REFERENCES campaigns (id),
  customer_id  INTEGER NOT NULL REFERENCES customers (id),
  message      TEXT NOT NULL,
  sent_at      TEXT NOT NULL,
  UNIQUE (campaign_id, customer_id)
);
CREATE INDEX idx_campaign_recipients_customer ON campaign_recipients (customer_id, sent_at);

CREATE TRIGGER campaigns_no_update BEFORE UPDATE ON campaigns
BEGIN SELECT RAISE(ABORT, 'campaigns só aceita novos registos'); END;

CREATE TRIGGER campaigns_no_delete BEFORE DELETE ON campaigns
BEGIN SELECT RAISE(ABORT, 'campaigns só aceita novos registos'); END;

CREATE TRIGGER campaign_recipients_no_update BEFORE UPDATE ON campaign_recipients
BEGIN SELECT RAISE(ABORT, 'campaign_recipients só aceita novos registos'); END;

CREATE TRIGGER campaign_recipients_no_delete BEFORE DELETE ON campaign_recipients
BEGIN SELECT RAISE(ABORT, 'campaign_recipients só aceita novos registos'); END;
