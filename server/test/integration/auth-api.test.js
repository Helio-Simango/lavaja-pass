import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from '../helpers.js';

// Contas de demonstração: operadores com PIN (Amílcar 1234…), gestor e analista com email e senha.
const NONE = { Authorization: null };

describe('Autenticação e perfis (I-11, D-16)', () => {
  let t;
  const post = (path, body, headers = NONE) => t.api('POST', path, body, headers);
  const operatorId = async (name) => (await t.api('GET', '/api/auth/operators', undefined, NONE)).body.operators.find((o) => o.name === name).id;
  const systemMessages = async (phone) =>
    (await t.api('GET', `/api/simulator/threads/${phone}/messages`, undefined, NONE)).body.messages.filter((m) => m.kind === 'system').map((m) => m.body);

  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  describe('entrada', () => {
    it('sem sessão as rotas protegidas respondem 401; as públicas continuam abertas', async () => {
      for (const path of ['/api/washes', '/api/dashboard/summary', '/api/me', '/api/bank/authorizations']) {
        const res = await t.api('GET', path, undefined, NONE);
        assert.equal(res.status, 401, path);
        assert.equal(res.body.error.code, 'UNAUTHENTICATED');
      }
      assert.equal((await t.api('GET', '/api/plans', undefined, NONE)).status, 200);
      assert.equal((await t.api('GET', '/api/health', undefined, NONE)).status, 200);
    });

    it('a lista de operadores (M6) só tem id e nome', async () => {
      const { operators } = (await t.api('GET', '/api/auth/operators', undefined, NONE)).body;
      assert.deepEqual(operators.map((o) => o.name), ['Amílcar', 'Bento', 'Délcio', 'Fátima']);
      assert.deepEqual(Object.keys(operators[0]).sort(), ['id', 'name']);
    });

    it('o operador entra com nome + PIN e recebe um cookie HttpOnly do seu perfil', async () => {
      const res = await post('/api/auth/operator', { operatorId: await operatorId('Amílcar'), pin: '1234' });
      assert.equal(res.status, 200);
      assert.deepEqual([res.body.session.role, res.body.session.name, res.body.profile, res.body.home], ['operator', 'Amílcar', 'operador', '/operador']);
      const cookie = res.headers.get('set-cookie');
      assert.match(cookie, /^lj_operador=/);
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);

      // O cookie só é usado para o perfil indicado pela página.
      const token = cookie.split(';')[0];
      const withCookie = await t.api('GET', '/api/auth/session', undefined, { ...NONE, Cookie: token, 'X-Session-Profile': 'operador' });
      assert.equal(withCookie.body.session.name, 'Amílcar');
      assert.ok(withCookie.body.session.permissions.includes('cash.declare'));
      const wrongProfile = await t.api('GET', '/api/washes', undefined, { ...NONE, Cookie: token, 'X-Session-Profile': 'gestor' });
      assert.equal(wrongProfile.status, 401);
    });

    it('o gestor e o analista entram com email e senha; o analista fica ligado à instituição', async () => {
      const manager = await post('/api/auth/staff', { email: 'GESTOR@lavaja.demo', password: 'LavaJa-2026' });
      assert.deepEqual([manager.body.session.role, manager.body.home], ['manager', '/gestor']);
      const analyst = await post('/api/auth/staff', { email: 'analista@moza.demo', password: 'MozaDemo-2026' });
      assert.deepEqual([analyst.body.session.role, analyst.body.session.institutionName, analyst.body.home], ['bank_analyst', 'Moza Banco', '/moza']);
    });

    it('as falhas não dizem o que está errado e 5 seguidas bloqueiam a conta', async () => {
      const unknown = await post('/api/auth/staff', { email: 'ninguem@lavaja.demo', password: 'qualquer-1' });
      const wrong = await post('/api/auth/staff', { email: 'gestor@lavaja.demo', password: 'errada-123' });
      assert.deepEqual([unknown.status, unknown.body.error.message], [401, 'Credenciais inválidas.']);
      assert.deepEqual([wrong.status, wrong.body.error.message], [401, 'Credenciais inválidas.']);

      const id = await operatorId('Fátima');
      for (let attempt = 1; attempt < 5; attempt += 1) {
        assert.equal((await post('/api/auth/operator', { operatorId: id, pin: '0000' })).body.error.code, 'INVALID_CREDENTIALS');
      }
      assert.equal((await post('/api/auth/operator', { operatorId: id, pin: '0000' })).body.error.code, 'ACCOUNT_LOCKED');
      // Bloqueada, nem o PIN certo entra; passado o prazo, entra.
      assert.equal((await post('/api/auth/operator', { operatorId: id, pin: '4567' })).body.error.code, 'ACCOUNT_LOCKED');
      t.clock.advanceMinutes(15);
      assert.equal((await post('/api/auth/operator', { operatorId: id, pin: '4567' })).status, 200);
      const events = t.services.authService.recentEvents().map((e) => e.event);
      assert.ok(events.includes('locked') && events.includes('login_failed'));
    });

    it('um token adulterado ou de outro perfil não serve', async () => {
      const { token } = (await post('/api/auth/operator', { operatorId: await operatorId('Bento'), pin: '2345' })).body;
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url'));
      const forged = Buffer.from(JSON.stringify({ ...claims, role: 'manager' })).toString('base64url');
      assert.equal((await t.api('GET', '/api/dashboard/summary', undefined, { Authorization: `Bearer ${header}.${forged}.${signature}` })).status, 401);
      assert.equal((await t.api('GET', '/api/dashboard/summary', undefined, { Authorization: `Bearer ${token}` })).status, 403);
    });

    it('sair apaga o cookie do perfil e fica registado', async () => {
      const res = await post('/api/auth/logout', {}, { ...t.as('operator', 'Délcio'), 'X-Session-Profile': 'operador' });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('set-cookie'), /lj_operador=;/);
      assert.equal(t.services.authService.recentEvents()[0].event, 'logout');
    });
  });

  describe('cliente', () => {
    const PHONE = '258825550102'; // Carlos

    it('pede um código, recebe-o na conversa e entra com ele (uma só vez)', async () => {
      const sent = await post('/api/auth/customer/code', { phone: '82 555 0102' });
      assert.deepEqual([sent.status, sent.body.sent], [202, true]);
      const message = (await systemMessages(PHONE)).at(-1);
      const code = message.match(/\*(\d{6})\*/)[1];

      assert.equal((await post('/api/auth/customer/verify', { phone: PHONE, code: code === '000000' ? '111111' : '000000' })).status, 401);
      const res = await post('/api/auth/customer/verify', { phone: PHONE, code });
      assert.deepEqual([res.status, res.body.session.role, res.body.session.name, res.body.home], [200, 'customer', 'Carlos Sitoe', '/cliente']);
      assert.equal((await post('/api/auth/customer/verify', { phone: PHONE, code })).body.error.code, 'INVALID_CODE');
    });

    it('um telefone desconhecido recebe a mesma resposta, sem mensagem', async () => {
      const res = await post('/api/auth/customer/code', { phone: '84 999 9999' });
      assert.deepEqual([res.status, res.body.sent], [202, true]);
      assert.equal((await t.api('GET', '/api/simulator/threads/258849999999/messages', undefined, NONE)).body.thread, null);
    });

    it('vê só os seus serviços e a sua fidelização', async () => {
      const carlos = t.as('customer', PHONE);
      const me = (await t.api('GET', '/api/me', undefined, carlos)).body;
      assert.equal(me.customer.name, 'Carlos Sitoe');
      const { washes } = (await t.api('GET', '/api/me/washes', undefined, carlos)).body;
      assert.ok(washes.length > 0 && washes.every((w) => w.customer.name === 'Carlos Sitoe'));
      assert.equal((await t.api('GET', '/api/me/loyalty', undefined, carlos)).status, 200);

      // O serviço de outro cliente responde como inexistente; as rotas da lavadora são proibidas.
      const other = t.db.prepare("SELECT id FROM washes WHERE plate = 'ACX731MC' LIMIT 1").get().id;
      assert.equal((await t.api('GET', `/api/me/washes/${other}`, undefined, carlos)).status, 404);
      assert.equal((await t.api('GET', '/api/washes', undefined, carlos)).status, 403);
      assert.equal((await t.api('GET', `/api/customers/${me.customer.id}`, undefined, carlos)).status, 403);
    });

    it('paga o seu serviço no checkout (M4): o valor é o do servidor e a confirmação é simulada', async () => {
      const wash = t.db.prepare("SELECT id FROM washes WHERE plate = 'AGB550MP' AND status = 'ready'").get();
      const luisa = t.as('customer', '258875550105');
      const started = await t.api('POST', `/api/me/washes/${wash.id}/payments`, { amountCents: 1 }, { ...luisa, 'Idempotency-Key': 'checkout-1' });
      assert.equal(started.status, 201);
      assert.equal(started.body.payment.amount.cents, 45000);
      const confirmed = await t.api('POST', `/api/me/washes/${wash.id}/payments/${started.body.payment.id}/confirm`, {}, luisa);
      assert.equal(confirmed.body.payment.status, 'confirmed');
      assert.match((await systemMessages('258875550105')).at(-1), /💳 Pagamento digital confirmado/);
      // Outro cliente não paga nem confirma o serviço da Luísa.
      assert.equal((await t.api('POST', `/api/me/washes/${wash.id}/payments`, {}, { ...t.as('customer', PHONE), 'Idempotency-Key': 'x-1' })).status, 404);
    });

    it('o link de pagamento abre uma sessão do cliente', async () => {
      const customerId = t.db.prepare("SELECT id FROM customers WHERE phone = '258825550102'").get().id;
      const token = t.services.authService.issuePaymentLink({ customerId, customerName: 'Carlos Sitoe', washId: 7 });
      const res = await post('/api/auth/link', { token });
      assert.deepEqual([res.status, res.body.session.name, res.body.washId], [200, 'Carlos Sitoe', 7]);
      assert.match(res.headers.get('set-cookie'), /^lj_cliente=/);
      // O token do link não serve directamente como sessão.
      assert.equal((await t.api('GET', '/api/me', undefined, { Authorization: `Bearer ${token}` })).status, 401);
      assert.equal((await post('/api/auth/link', { token: 'inválido' })).body.error.code, 'INVALID_LINK');
    });
  });

  describe('segregação por perfil', () => {
    it('o operador trabalha no pátio mas não altera preços, nem vê o painel, nem gere partilhas', async () => {
      const operator = t.as('operator', 'Amílcar');
      assert.equal((await t.api('GET', '/api/washes?active=true', undefined, operator)).status, 200);
      assert.equal((await t.api('GET', '/api/stations', undefined, operator)).status, 200);
      assert.equal((await t.api('PUT', '/api/plans/1/prices/A', { priceCents: 1 }, operator)).status, 403);
      assert.equal((await t.api('GET', '/api/dashboard/summary', undefined, operator)).status, 403);
      assert.equal((await t.api('POST', '/api/sharing/authorizations', {}, operator)).status, 403);
      assert.equal((await t.api('POST', '/api/payments/1/refund', {}, operator)).status, 403);
      assert.equal((await t.api('GET', '/api/bank/authorizations', undefined, operator)).status, 403);
    });

    it('o autor das acções é sempre o da sessão, nunca o declarado no pedido', async () => {
      const wash = t.db.prepare("SELECT id FROM washes WHERE status = 'queued' LIMIT 1").get();
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'cancelled', reason: 'Teste de autor', actor: 'Outra pessoa' }, {
        ...t.as('operator', 'Bento'),
        'X-Actor': 'Outra pessoa',
      });
      const { events } = (await t.api('GET', `/api/washes/${wash.id}`)).body;
      assert.equal(events.at(-1).actor, 'Bento');
    });

    it('a base guarda só hashes e o registo de entradas não se altera', () => {
      const users = t.db.prepare('SELECT pin_hash, password_hash FROM users').all();
      assert.ok(users.every((u) => (u.pin_hash ?? u.password_hash).startsWith('scrypt$')));
      assert.ok(!JSON.stringify(users).includes('1234'));
      assert.throws(() => t.db.prepare('DELETE FROM auth_events').run(), /só aceita novos registos/);
    });
  });
});
