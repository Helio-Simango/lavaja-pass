import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.js';

describe('aplicação (I-0)', () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('responde ao estado de saúde', async () => {
    const res = await t.api('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('devolve 404 no formato único para rotas inexistentes', async () => {
    const res = await t.api('GET', '/api/nao-existe');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(typeof res.body.error.message, 'string');
  });

  it('recusa JSON inválido com 400', async () => {
    const res = await t.api('POST', '/api/customers', '{"phone":');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });

  it('serve as páginas de public/ e não a base de dados', async () => {
    const home = await fetch(`${t.base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /LavaJá/);
    const patio = await fetch(`${t.base}/patio`);
    assert.equal(patio.status, 200);
    for (const p of ['/data/lavaja.db', '/../data/lavaja.db', '/src/app.js', '/package.json']) {
      const res = await fetch(`${t.base}${p}`);
      assert.notEqual(res.status, 200, p);
    }
  });

  it('não expõe o cabeçalho X-Powered-By', async () => {
    const res = await t.api('GET', '/api/health');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('lista os parâmetros com a marca "por validar"', async () => {
    const res = await t.api('GET', '/api/settings');
    const inst = res.body.settings.find((s) => s.key === 'demo.institution');
    assert.equal(inst.value, 'Moza Banco');
    assert.equal(inst.toValidate, true);
  });
});
