import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

// Entrada manual no pátio (M8): matrícula + serviço, telefone opcional, estimativa antes de confirmar.
describe('Entrada manual no pátio (M8)', () => {
  let t;
  let ids;
  let operator;
  const preview = (query) => t.api('GET', `/api/yard/entries/preview?${new URLSearchParams(query)}`, undefined, operator);
  const enter = (body) => t.api('POST', '/api/yard/entries', body, operator);

  before(async () => {
    t = await startTestServer();
    ids = demoIds(t.db);
    operator = t.as('operator', 'Amílcar');
  });
  after(() => t.close());

  it('reconhece a matrícula, dá o preço da classe e a estimativa sem registar nada', async () => {
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM washes').get().n;
    const res = await preview({ plate: 'ahm 482 mp', planId: ids.plan('SIMPLES') });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.vehicle.plateDisplay, res.body.vehicle.customerName, res.body.classCode], ['AHM 482 MP', 'Carlos Sitoe', 'A']);
    assert.equal(res.body.price.cents, 25000);
    assert.equal(res.body.estimate.position, 3); // há duas viaturas em fila
    assert.ok(res.body.estimate.estimatedEndAt);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM washes').get().n, before);
  });

  it('matrícula nova sem telefone: fica no cliente de balcão e não gera avisos', async () => {
    const res = await enter({ plate: 'AAZ 220 MP', classId: 'A', planId: ids.plan('COMPLETA') });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.wash.customer.name, res.body.wash.price.final.cents, res.body.wash.status], ['Cliente sem telefone (balcão)', 45000, 'queued']);
    const thread = (await t.api('GET', '/api/simulator/threads/258870000000/messages')).body.thread;
    assert.equal(thread, null);
  });

  it('matrícula nova com telefone novo: regista o cliente, sem consentimentos que não deu', async () => {
    const res = await enter({ plate: 'ABD 300 MP', classId: 'B', planId: ids.plan('SIMPLES'), phone: '84 700 1234' });
    assert.equal(res.status, 201);
    assert.equal(res.body.wash.customer.name, 'Cliente +258 84 700 1234');
    const customerId = ids.customer('258847001234');
    const consents = (await t.api('GET', `/api/customers/${customerId}/consents`)).body.consents;
    assert.equal(consents.loyalty.granted, false);
  });

  it('valida a classe de uma matrícula nova e o perfil de quem regista', async () => {
    assert.equal((await enter({ plate: 'ABE 301 MP', planId: ids.plan('SIMPLES') })).body.error.details.field, 'classId');
    const analyst = await t.api('POST', '/api/yard/entries', { plate: 'ABE 301 MP', classId: 'A', planId: 1 }, t.as('bank_analyst'));
    assert.equal(analyst.status, 403);
  });
});
