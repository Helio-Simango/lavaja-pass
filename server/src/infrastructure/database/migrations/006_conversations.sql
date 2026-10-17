-- I-5 · Simulador de WhatsApp: conversas persistentes, isoladas por número (cap. 10.6),
-- e consentimentos do cliente pedidos pelo assistente (cap. 14.2).

CREATE TABLE message_threads (
  id                 INTEGER PRIMARY KEY,
  phone              TEXT NOT NULL UNIQUE CHECK (phone GLOB '2588[2-7][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  customer_id        INTEGER REFERENCES customers (id),
  bot_state          TEXT NOT NULL,
  bot_context_json   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(bot_context_json)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- direction: 'in' = escrita pelo cliente; 'out' = enviada pela lavadora.
-- kind: 'text' = conversa; 'system' = aviso automático (serviço iniciado, pronto, pagamento…).
CREATE TABLE messages (
  id          INTEGER PRIMARY KEY,
  thread_id   INTEGER NOT NULL REFERENCES message_threads (id),
  direction   TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  kind        TEXT NOT NULL CHECK (kind IN ('text', 'system')),
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at  TEXT NOT NULL,
  CHECK (kind = 'text' OR direction = 'out')
);
-- Ordem cronológica estável: por id.
CREATE INDEX idx_messages_thread ON messages (thread_id, id);

CREATE TRIGGER messages_no_update BEFORE UPDATE ON messages
BEGIN SELECT RAISE(ABORT, 'messages só aceita novos registos'); END;

CREATE TRIGGER messages_no_delete BEFORE DELETE ON messages
BEGIN SELECT RAISE(ABORT, 'messages só aceita novos registos'); END;

-- Histórico de consentimentos: o último registo de cada tipo é o que vale. A partilha com bancos
-- é um consentimento da lavadora e fica para a vertente Banco (I-7).
CREATE TABLE consents (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers (id),
  type         TEXT NOT NULL CHECK (type IN ('loyalty', 'marketing')),
  granted      INTEGER NOT NULL CHECK (granted IN (0, 1)),
  source       TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_consents_customer ON consents (customer_id, type, id);

CREATE TRIGGER consents_no_update BEFORE UPDATE ON consents
BEGIN SELECT RAISE(ABORT, 'consents só aceita novos registos'); END;

CREATE TRIGGER consents_no_delete BEFORE DELETE ON consents
BEGIN SELECT RAISE(ABORT, 'consents só aceita novos registos'); END;
