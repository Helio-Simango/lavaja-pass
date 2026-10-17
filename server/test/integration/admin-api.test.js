import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from '../helpers.js';

describe('reposição da demonstração (cap. 15.5)', () => {
  it('está desactivada por omissão', async () => {
    const t = await startTestServer();
    const res = await t.api('POST', '/api/admin/demo/reset', { confirm: 'REPOR' }, { 'X-Demo-Token': 'x' });
    assert.equal(res.status, 404);
    await t.close();
  });

  describe('com token configurado', () => {
    let t;
    before(async () => {
      t = await startTestServer({ demoResetToken: 'segredo-demo' });
    });
    after(() => t.close());

    it('recusa um token errado e exige a confirmação escrita', async () => {
      assert.equal((await t.api('POST', '/api/admin/demo/reset', { confirm: 'REPOR' }, { 'X-Demo-Token': 'errado' })).status, 403);
      const res = await t.api('POST', '/api/admin/demo/reset', { confirm: 'sim' }, { 'X-Demo-Token': 'segredo-demo' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details.field, 'confirm');
    });

    it('repõe os dados de demonstração, incluindo as tabelas de auditoria', async () => {
      await t.api('POST', '/api/customers', { phone: '84 888 0001', name: 'Cliente Temporário' });
      assert.equal((await t.api('GET', '/api/customers?phone=848880001')).status, 200);
      const res = await t.api('POST', '/api/admin/demo/reset', { confirm: 'REPOR' }, { 'X-Demo-Token': 'segredo-demo' });
      assert.equal(res.status, 200);
      assert.equal((await t.api('GET', '/api/customers?phone=848880001')).status, 404);
      assert.equal((await t.api('GET', '/api/customers')).body.customers.length, 6);
      assert.deepEqual((await t.api('GET', '/api/washes?active=true')).body.washes.length, 4);
    });
  });
});
