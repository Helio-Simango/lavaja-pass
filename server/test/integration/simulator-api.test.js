import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from '../helpers.js';

describe('API do simulador de WhatsApp (I-5)', () => {
  let t;
  const messages = (phone, after = 0) => t.api('GET', `/api/simulator/threads/${phone}/messages?after=${after}`);

  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  describe('conversas', () => {
    it('um número sem conversa devolve uma conversa vazia', async () => {
      const res = await messages('258849990001');
      assert.equal(res.status, 200);
      assert.equal(res.body.thread, null);
      assert.deepEqual(res.body.messages, []);
    });

    it('recusa um número inválido', async () => {
      const res = await messages('12345');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details.field, 'phone');
    });

    it('lista as conversas', async () => {
      const res = await t.api('GET', '/api/simulator/threads');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.threads));
    });
  });
});
