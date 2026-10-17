import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from '../helpers.js';

// Demonstração: Moza Banco (instituição 1); AUT-001 revogada; AUT-002 activa e já consultada.
describe('API da vertente Banco (I-7)', () => {
  let t;
  const report = (authorizationId, query = '', headers) =>
    t.api('GET', `/api/institutions/1/reports/activity?authorizationId=${authorizationId}${query}`, undefined, headers);

  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('lista a instituição de demonstração e as autorizações', async () => {
    assert.deepEqual((await t.api('GET', '/api/institutions')).body.institutions.map((i) => i.name), ['Moza Banco']);
    const { authorizations } = (await t.api('GET', '/api/sharing/authorizations')).body;
    assert.deepEqual(authorizations.map((a) => [a.reference, a.status]), [['AUT-002', 'active'], ['AUT-001', 'revoked']]);
  });

  it('o relatório tem identificação, só as secções autorizadas e as notas', async () => {
    const res = await report(2, '', { 'X-Actor': 'analista.moza' });
    assert.equal(res.status, 200);
    const { report: body } = res.body;
    assert.equal(body.business, 'Lava Já – Matola');
    assert.equal(body.authorization.reference, 'AUT-002');
    assert.deepEqual(Object.keys(body.sections), ['activity', 'receipts', 'customers', 'dataQuality']);
    assert.equal(body.sections.receipts.digitalConfirmed.origin, 'Confirmado em simulação');
    assert.equal(body.sections.receipts.cashDeclared.origin, 'Declarado por operador');
    assert.ok(body.notes.some((note) => /não é uma avaliação nem uma pontuação de crédito/i.test(note)));
  });

  it('não inclui dados pessoais dos clientes finais', async () => {
    const text = JSON.stringify((await report(2)).body);
    for (const personal of ['Amélia', 'Carlos', '2588', 'ACX', 'AHM']) assert.ok(!text.includes(personal), personal);
  });

  it('cada consulta e exportação fica registada', async () => {
    const before = (await t.api('GET', '/api/sharing/access-logs?authorizationId=2')).body.accessLogs.length;
    const csv = await fetch(`${t.base}/api/institutions/1/reports/activity?authorizationId=2&format=csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(await csv.text(), /recebimentos;Digital confirmado;[\d.,]+ MZN;Confirmado em simulação/);
    const logs = (await t.api('GET', '/api/sharing/access-logs?authorizationId=2')).body.accessLogs;
    assert.equal(logs.length, before + 1);
    assert.deepEqual([logs[0].action, logs[0].actor], ['export', 'analista.demo']);
    assert.ok(logs.some((log) => log.actor === 'analista.moza' && log.action === 'view'));
  });

  it('uma autorização revogada não dá acesso', async () => {
    const res = await report(1);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'AUTHORIZATION_REVOKED');
  });

  it('a lavadora autoriza com âmbito limitado e pode revogar', async () => {
    const created = await t.api(
      'POST',
      '/api/sharing/authorizations',
      { institutionId: 1, purpose: 'Abertura de conta de comerciante', sections: ['activity'], dataMonths: 3, validDays: 15, confirm: true },
      { 'X-Actor': 'Dono da lavadora' },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.authorization.reference, 'AUT-003');
    const id = created.body.authorization.id;
    assert.deepEqual(Object.keys((await report(id)).body.report.sections), ['activity']);

    const revoked = await t.api('POST', `/api/sharing/authorizations/${id}/revoke`, { reason: 'Mudei de ideias' });
    assert.equal(revoked.body.authorization.status, 'revoked');
    assert.equal((await t.api('POST', `/api/sharing/authorizations/${id}/revoke`, {})).body.changed, false);
    assert.equal((await report(id)).status, 403);
  });

  it('valida o pedido de autorização', async () => {
    const res = await t.api('POST', '/api/sharing/authorizations', { institutionId: 1, purpose: 'Financiamento de equipamento', sections: ['activity'], dataMonths: 3, validDays: 15 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details.field, 'confirm');
    assert.equal((await t.api('GET', '/api/institutions/9/reports/activity?authorizationId=2')).status, 404);
  });

  it('o Painel mostra as autorizações activas', async () => {
    assert.equal((await t.api('GET', '/api/dashboard/summary')).body.activeSharingAuthorizations, 1);
  });

  it('a base não deixa alterar uma autorização dada', () => {
    assert.throws(() => t.db.prepare("UPDATE data_sharing_authorizations SET purpose = 'outra' WHERE id = 2").run(), /só revogada/);
  });
});
