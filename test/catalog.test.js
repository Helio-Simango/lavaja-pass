import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServices } from '../src/services/index.js';
import { createTestDb, startTestServer } from './helpers.js';

describe('catálogo (I-1)', () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('lista exactamente as classes A, B e C', async () => {
    const res = await t.api('GET', '/api/vehicle-classes');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.classes.map((c) => c.code), ['A', 'B', 'C']);
  });

  it('não existe rota para criar classes', async () => {
    const res = await t.api('POST', '/api/vehicle-classes', { code: 'D' });
    assert.equal(res.status, 404);
  });

  it('lista planos com preços por classe em centavos', async () => {
    const res = await t.api('GET', '/api/plans');
    const simples = res.body.plans.find((p) => p.code === 'SIMPLES');
    assert.deepEqual(
      simples.prices.map((p) => [p.classCode, p.price.cents]),
      [['A', 25000], ['B', 35000], ['C', 45000]],
    );
  });

  it('indica a disponibilidade para uma classe (id ou código)', async () => {
    for (const classId of ['C', 'c', '3']) {
      const res = await t.api('GET', `/api/plans?classId=${classId}`);
      assert.equal(res.status, 200);
      const pol = res.body.plans.find((p) => p.code === 'POLIMENTO');
      assert.equal(pol.available, false);
      assert.equal(pol.price, null);
      assert.equal(pol.unavailableReason, 'PLAN_INACTIVE');
      const motor = res.body.plans.find((p) => p.code === 'COMPLETA_MOTOR');
      assert.equal(motor.available, true);
      assert.equal(motor.price.display, '1.100,00 MZN');
    }
  });

  it('recusa uma classe inexistente', async () => {
    for (const classId of ['D', '9', 'xx']) {
      const res = await t.api('GET', `/api/plans?classId=${classId}`);
      assert.equal(res.status, 400, classId);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('altera um plano e regista quem alterou', async () => {
    const res = await t.api('PATCH', '/api/plans/1', { name: 'Simples exterior', baseDurationMin: 35 }, { 'X-Actor': 'Gestora' });
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.name, 'Simples exterior');
    assert.equal(res.body.plan.baseDurationMin, 35);
    const log = t.db.prepare("SELECT * FROM change_log WHERE entity = 'wash_plan' AND entity_id = '1' ORDER BY id").all();
    assert.deepEqual(log.map((l) => [l.field, l.old_value, l.new_value, l.actor]), [
      ['name', 'Simples', 'Simples exterior', 'Gestora'],
      ['baseDurationMin', '30', '35', 'Gestora'],
    ]);
  });

  it('não regista nada quando o valor não muda', async () => {
    const before = t.db.prepare('SELECT COUNT(*) AS n FROM change_log').get().n;
    await t.api('PATCH', '/api/plans/2', { name: 'Completa' });
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM change_log').get().n, before);
  });

  it('valida as alterações ao plano', async () => {
    assert.equal((await t.api('PATCH', '/api/plans/1', {})).status, 400);
    assert.equal((await t.api('PATCH', '/api/plans/1', { active: 'sim' })).status, 400);
    assert.equal((await t.api('PATCH', '/api/plans/1', { baseDurationMin: 0 })).status, 400);
    assert.equal((await t.api('PATCH', '/api/plans/999', { active: true })).status, 404);
    assert.equal((await t.api('PATCH', '/api/plans/abc', { active: true })).status, 400);
  });

  it('define o preço de uma classe e regista a alteração', async () => {
    const res = await t.api('PUT', '/api/plans/4/prices/C', { priceCents: 250000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.price.cents, 250000);
    const log = t.db.prepare("SELECT * FROM change_log WHERE entity = 'class_plan_price' AND entity_id = '4:C'").get();
    assert.equal(log.old_value, null);
    assert.equal(log.new_value, '250000');
  });

  it('recusa preços negativos ou não inteiros', async () => {
    for (const priceCents of [-1, 10.5, '100', null]) {
      const res = await t.api('PUT', '/api/plans/1/prices/A', { priceCents });
      assert.equal(res.status, 400, String(priceCents));
    }
  });
});

describe('resolução de preço (regra de aceitação de serviço)', () => {
  it('recusa plano inactivo e plano sem preço para a classe', () => {
    const db = createTestDb();
    const { catalog } = createServices({ db });
    const cls = (code) => catalog.getClass(code).id;
    const plan = (code) => db.prepare('SELECT id FROM wash_plans WHERE code = ?').get(code).id;

    assert.throws(() => catalog.resolvePrice(plan('POLIMENTO'), cls('A')), { code: 'PLAN_INACTIVE', status: 409 });
    catalog.updatePlan(plan('POLIMENTO'), { active: true }, 'teste');
    assert.equal(catalog.resolvePrice(plan('POLIMENTO'), cls('A')).priceCents, 150000);
    assert.throws(() => catalog.resolvePrice(plan('POLIMENTO'), cls('C')), { code: 'PRICE_NOT_DEFINED', status: 409 });
    db.close();
  });
});
