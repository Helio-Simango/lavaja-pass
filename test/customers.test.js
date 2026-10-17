import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.js';

describe('clientes e viaturas (I-1)', () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('cria um cliente com telefone e matrícula normalizados', async () => {
    const res = await t.api('POST', '/api/customers', {
      phone: '+258 84 700 0001',
      name: '  Teresa   Langa ',
      vehicles: [{ plate: 'abc-999 mp', classId: 'A' }],
    });
    assert.equal(res.status, 201);
    const c = res.body.customer;
    assert.equal(c.phone, '258847000001');
    assert.equal(c.phoneDisplay, '+258 84 700 0001');
    assert.equal(c.name, 'Teresa Langa');
    assert.equal(c.vehicles[0].plate, 'ABC999MP');
    assert.equal(c.vehicles[0].plateDisplay, 'ABC 999 MP');
    assert.equal(c.vehicles[0].jurisdiction, 'MZ');
    assert.equal(c.vehicles[0].class.code, 'A');
  });

  it('recusa um telefone repetido, em qualquer formato', async () => {
    const res = await t.api('POST', '/api/customers', { phone: '84 700 0001', name: 'Outra pessoa' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PHONE_TAKEN');
  });

  it('encontra o cliente pelo telefone em qualquer formato', async () => {
    for (const phone of ['847000001', '258847000001', '+258 84 700 0001']) {
      const res = await t.api('GET', `/api/customers?phone=${encodeURIComponent(phone)}`);
      assert.equal(res.status, 200, phone);
      assert.equal(res.body.customer.name, 'Teresa Langa');
    }
    assert.equal((await t.api('GET', '/api/customers?phone=849999999')).status, 404);
    assert.equal((await t.api('GET', '/api/customers?phone=123')).status, 400);
  });

  it('valida os dados do cliente', async () => {
    const cases = [
      { name: 'Sem telefone' },
      { phone: '81 123 4567', name: 'Prefixo inválido' },
      { phone: '84 700 0002' },
      { phone: '84 700 0002', name: 'X' },
      { phone: '84 700 0002', name: 'Classe D', vehicles: [{ plate: 'AAA111MC', classId: 'D' }] },
      { phone: '84 700 0002', name: 'Sem matrícula', vehicles: [{ classId: 'A' }] },
      { phone: '84 700 0002', name: 'Lista inválida', vehicles: 'ABC' },
    ];
    for (const body of cases) {
      const res = await t.api('POST', '/api/customers', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    // Nenhum dos pedidos inválidos deixou um cliente a meio.
    assert.equal((await t.api('GET', '/api/customers?phone=847000002')).status, 404);
  });

  it('um cliente pode ter várias viaturas', async () => {
    const { body } = await t.api('GET', '/api/customers?phone=847000001');
    const res = await t.api('POST', `/api/customers/${body.customer.id}/vehicles`, {
      plate: 'AFT 321 MC',
      classId: 'C',
      description: 'Toyota Hiace',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.created, true);
    const again = await t.api('GET', `/api/customers/${body.customer.id}`);
    assert.equal(again.body.customer.vehicles.length, 2);
  });

  it('a mesma matrícula no mesmo cliente não é duplicada', async () => {
    const { body } = await t.api('GET', '/api/customers?phone=847000001');
    const res = await t.api('POST', `/api/customers/${body.customer.id}/vehicles`, { plate: 'aft321mc', classId: 'C' });
    assert.equal(res.status, 200);
    assert.equal(res.body.created, false);
  });

  it('recusa uma matrícula registada noutro cliente', async () => {
    const res = await t.api('POST', '/api/customers', {
      phone: '84 700 0003',
      name: 'Rui Bila',
      vehicles: [{ plate: 'ABC 999 MP', classId: 'A' }],
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PLATE_TAKEN');
    // A transacção desfez a criação do cliente.
    assert.equal((await t.api('GET', '/api/customers?phone=847000003')).status, 404);
  });

  it('a mesma matrícula noutra jurisdição é outra viatura', async () => {
    const { body } = await t.api('GET', '/api/customers?phone=847000001');
    const res = await t.api('POST', `/api/customers/${body.customer.id}/vehicles`, {
      plate: 'ABC 999 MP',
      jurisdiction: 'ZA',
      classId: 'B',
    });
    assert.equal(res.status, 201);
  });

  it('lista viaturas por classe', async () => {
    const res = await t.api('GET', '/api/vehicles?classId=C');
    assert.equal(res.status, 200);
    assert.ok(res.body.vehicles.length >= 2);
    assert.ok(res.body.vehicles.every((v) => v.class.code === 'C'));
    assert.ok(res.body.vehicles.every((v) => v.customer.name));
  });

  it('reclassifica uma viatura e regista a alteração', async () => {
    const list = await t.api('GET', '/api/vehicles?classId=A');
    const v = list.body.vehicles.find((x) => x.plate === 'ABC999MP');
    const res = await t.api('PATCH', `/api/vehicles/${v.id}`, { classId: 'B' }, { 'X-Actor': 'Gestora' });
    assert.equal(res.status, 200);
    assert.equal(res.body.vehicle.class.code, 'B');
    const log = t.db.prepare("SELECT * FROM change_log WHERE entity = 'vehicle' AND entity_id = ?").get(String(v.id));
    assert.deepEqual([log.old_value, log.new_value, log.actor], ['A', 'B', 'Gestora']);
  });

  it('devolve 404 para cliente ou viatura inexistentes', async () => {
    assert.equal((await t.api('GET', '/api/customers/9999')).status, 404);
    assert.equal((await t.api('POST', '/api/customers/9999/vehicles', { plate: 'XYZ123MC', classId: 'A' })).status, 404);
    assert.equal((await t.api('GET', '/api/vehicles/9999')).status, 404);
  });
});
