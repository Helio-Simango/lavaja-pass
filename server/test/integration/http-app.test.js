import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from '../helpers.js';

describe('aplicação HTTP', () => {
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

  it('recusa um corpo que não é um objecto', async () => {
    const res = await t.api('POST', '/api/customers', '[1, 2]');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('serve o cliente web e não o servidor nem a base de dados', async () => {
    const home = await fetch(`${t.base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /LavaJá/);
    assert.equal((await fetch(`${t.base}/entrar`)).status, 200);
    for (const path of ['/server/data/lavaja.db', '/data/lavaja.db', '/server/src/main.js', '/package.json', '/CLAUDE.md', '/simulador/README.md', '/test/client-format.test.js']) {
      assert.notEqual((await fetch(`${t.base}${path}`)).status, 200, path);
    }
  });

  it('cada página de perfil só abre com a sessão desse perfil; sem ela vai para a entrada', async () => {
    const page = (path, cookie) => fetch(`${t.base}${path}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
    const manager = t.services.authService.loginStaff({ email: 'gestor@lavaja.demo', password: 'LavaJa-2026' }).token;
    const noSession = await page('/gestor');
    assert.equal(noSession.status, 302);
    assert.equal(noSession.headers.get('location'), '/entrar?perfil=gestor&volta=%2Fgestor');
    const ok = await page('/gestor', `lj_gestor=${manager}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    // O cookie de outro perfil não abre esta página, mesmo com o token certo noutro nome.
    assert.equal((await page('/moza', `lj_gestor=${manager}`)).status, 302);
    assert.equal((await page('/moza', `lj_analista=${manager}`)).status, 302);
    assert.equal((await page('/gestor.html')).status, 302);
  });

  it('os endereços antigos levam aos ecrãs novos e o checkout é público', async () => {
    const old = await fetch(`${t.base}/patio`, { redirect: 'manual' });
    assert.deepEqual([old.status, old.headers.get('location')], [301, '/operador']);
    assert.equal((await fetch(`${t.base}/catalogo`, { redirect: 'manual' })).headers.get('location'), '/gestor#catalogo');
    assert.equal((await fetch(`${t.base}/pagar/12`)).status, 200);
  });

  it('envia cabeçalhos de segurança', async () => {
    const res = await fetch(`${t.base}/entrar`);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('serve o simulador num endereço por número, mas não os seus ficheiros internos', async () => {
    for (const path of ['/simulador', '/simulador/whatsapp/258841234567']) {
      const res = await fetch(`${t.base}${path}`);
      assert.equal(res.status, 200, path);
      assert.match(await res.text(), /Simulador de WhatsApp/);
    }
    assert.equal((await fetch(`${t.base}/simulador/js/main.js`)).status, 200);
    assert.equal((await fetch(`${t.base}/simulador/test/whatsapp-format.test.js`)).status, 404);
  });

  it('não expõe o cabeçalho X-Powered-By', async () => {
    const res = await t.api('GET', '/api/health');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('lista os parâmetros com a marca "por validar"', async () => {
    const res = await t.api('GET', '/api/settings');
    const institution = res.body.settings.find((s) => s.key === 'demo.institution');
    assert.equal(institution.value, 'Moza Banco');
    assert.equal(institution.toValidate, true);
  });
});
