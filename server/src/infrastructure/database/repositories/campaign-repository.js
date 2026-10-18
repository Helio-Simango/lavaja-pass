// Campanhas fora de pico: candidatos (consentimento, última lavagem, último contacto), envios e resultados.

export class SqliteCampaignRepository {
  #db;

  constructor(db) {
    this.#db = db;
  }

  /** Um registo por cliente, com o estado actual do consentimento de ofertas e a última lavagem concluída. */
  candidates() {
    return this.#db
      .prepare(`SELECT c.id, c.name, c.phone,
          (SELECT granted FROM consents WHERE customer_id = c.id AND type = 'marketing' ORDER BY id DESC LIMIT 1) AS marketing,
          (SELECT MAX(completed_at) FROM washes WHERE customer_id = c.id AND status = 'completed') AS last_completed_at,
          (SELECT plate FROM washes WHERE customer_id = c.id AND status = 'completed' ORDER BY completed_at DESC, id DESC LIMIT 1) AS last_plate,
          (SELECT MAX(sent_at) FROM campaign_recipients WHERE customer_id = c.id) AS last_campaign_at
        FROM customers c ORDER BY c.id`)
      .all()
      .map((row) => ({
        customerId: row.id,
        name: row.name,
        phone: row.phone,
        marketingConsent: row.marketing === 1,
        lastCompletedAt: row.last_completed_at,
        lastPlate: row.last_plate,
        lastCampaignAt: row.last_campaign_at,
      }));
  }

  insertCampaign({ offerType, template, policy, recipientsCount, sentBy }, now) {
    const { lastInsertRowid } = this.#db
      .prepare(`INSERT INTO campaigns (offer_type, message_template, policy_json, recipients_count, sent_by, sent_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
      .run(offerType, template, JSON.stringify(policy), recipientsCount, sentBy, now);
    return Number(lastInsertRowid);
  }

  insertRecipient({ campaignId, customerId, message }, now) {
    this.#db
      .prepare('INSERT INTO campaign_recipients (campaign_id, customer_id, message, sent_at) VALUES (?, ?, ?, ?)')
      .run(campaignId, customerId, message, now);
  }

  list() {
    const recipients = this.#db.prepare('SELECT campaign_id, customer_id FROM campaign_recipients ORDER BY id').all();
    return this.#db
      .prepare('SELECT * FROM campaigns ORDER BY id DESC')
      .all()
      .map((row) => ({
        id: row.id,
        offerType: row.offer_type,
        template: row.message_template,
        policy: JSON.parse(row.policy_json),
        recipientsCount: row.recipients_count,
        sentBy: row.sent_by,
        sentAt: row.sent_at,
        recipientCustomerIds: recipients.filter((r) => r.campaign_id === row.id).map((r) => r.customer_id),
      }));
  }

  /** Serviços registados desde uma data (para a atribuição de resultados). */
  washesQueuedSince(from) {
    return this.#db
      .prepare('SELECT customer_id, status, queued_at FROM washes WHERE queued_at >= ? ORDER BY id')
      .all(from)
      .map((row) => ({ customerId: row.customer_id, status: row.status, queuedAt: row.queued_at }));
  }
}
