// Conversas do simulador (uma por telefone) e as suas mensagens, por ordem de id.

const toThread = (row) => ({
  id: row.id,
  phone: row.phone,
  customerId: row.customer_id,
  botState: row.bot_state,
  botContext: JSON.parse(row.bot_context_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMessage = (row) => ({
  id: row.id,
  threadId: row.thread_id,
  direction: row.direction,
  kind: row.kind,
  body: row.body,
  createdAt: row.created_at,
});

export class SqliteConversationRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  findThreadByPhone(phone) {
    const row = this.#db.prepare('SELECT * FROM message_threads WHERE phone = ?').get(phone);
    return row ? toThread(row) : null;
  }

  insertThread({ phone, customerId, botState }, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO message_threads (phone, customer_id, bot_state, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`)
      .run(phone, customerId ?? null, botState, now, now);
    return Number(lastInsertRowid);
  }

  updateThread(id, { customerId, botState, botContext }, now) {
    this.#db
      .prepare(`UPDATE message_threads SET customer_id = ?, bot_state = ?, bot_context_json = ?, updated_at = ?
        WHERE id = ?`)
      .run(customerId ?? null, botState, JSON.stringify(botContext ?? {}), now, id);
  }

  /** Conversas com a última mensagem, as mais recentes primeiro. */
  listThreads() {
    return this.#db
      .prepare(`SELECT t.*, cu.name AS customer_name, m.body AS last_body, m.kind AS last_kind, m.created_at AS last_at
        FROM message_threads t
        LEFT JOIN customers cu ON cu.id = t.customer_id
        LEFT JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE thread_id = t.id)
        ORDER BY COALESCE(m.id, 0) DESC, t.id DESC`)
      .all()
      .map((row) => ({
        ...toThread(row),
        customerName: row.customer_name,
        lastMessage: row.last_body ? { body: row.last_body, kind: row.last_kind, createdAt: row.last_at } : null,
      }));
  }

  insertMessage(threadId, { direction, kind, body }, now) {
    const { lastInsertRowid } = this.#db
      .prepare('INSERT INTO messages (thread_id, direction, kind, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(threadId, direction, kind, body, now);
    this.#db.prepare('UPDATE message_threads SET updated_at = ? WHERE id = ?').run(now, threadId);
    return Number(lastInsertRowid);
  }

  listMessages(threadId, { afterId = 0 } = {}) {
    return this.#db
      .prepare('SELECT * FROM messages WHERE thread_id = ? AND id > ? ORDER BY id')
      .all(threadId, afterId)
      .map(toMessage);
  }
}
