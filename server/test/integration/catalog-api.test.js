import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestContext, demoIds, startTestServer } from '../helpers.js';

describe('API do catálogo (I-1)', () => {
  let t;
  const changeLog = (entity, entityId) => t.repositories.changeLogRepository.listFor(entity, entityId);

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
    assert.equal((await t.api('POST', '/api/vehicle-classes', { code: 'D' })).status, 404);
  });

  it('lista planos com preços por classe em centavos', async () => {
    const res = await t.api('GET', '/api/plans');
    const simple = res.body.plans.find((p) => p.code === 'SIMPLES');
    assert.deepEqual(
      simple.prices.map((p) => [p.classCode, p.price.cents]),
      [['A', 25000], ['B', 35000], ['C', 45000]],
    );
    assert.equal('available' in simple, false);
  });

  it('indica a disponibilidade para uma classe (id ou código)', async () => {
    for (const classId of ['C', 'c', '3']) {
      const res = await t.api('GET', `/api/plans?classId=${classId}`);
      assert.equal(res.status, 200);
      const polishing = res.body.plans.find((p) => p.code === 'POLIMENTO');
      assert.equal(polishing.available, false);
      assert.equal(polishing.price, null);
      assert.equal(polishing.unavailableReason, 'PLAN_INACTIVE');
      const fullWithEngine = res.body.plans.find((p) => p.code === 'COMPLETA_MOTOR');
      assert.equal(fullWithEngine.available, true);
      assert.equal(fullWithEngine.price.display, '1.100,00 MZN');
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
    assert.deepEqual(
      changeLog('wash_plan', 1).map((entry) => [entry.field, entry.oldValue, entry.newValue, entry.actor]),
      [
        ['name', 'Simples', 'Simples exterior', 'Gestora'],
        ['baseDurationMin', '30', '35', 'Gestora'],
      ],
    );
  });

  it('não regista nada quando o valor não muda', async () => {
    await t.api('PATCH', '/api/plans/2', { name: 'Completa' });
    assert.equal(changeLog('wash_plan', 2).length, 0);
  });

  it('valida as alterações ao plano', async () => {
    const cases = [
      [1, {}, 400],
      [1, { active: 'sim' }, 400],
      [1, { baseDurationMin: 0 }, 400],
      [1, { name: '' }, 400],
      [999, { active: true }, 404],
      ['abc', { active: true }, 400],
    ];
    for (const [id, body, status] of cases) {
      assert.equal((await t.api('PATCH', `/api/plans/${id}`, body)).status, status, JSON.stringify(body));
    }
  });

  it('define o preço de uma classe e regista a alteração', async () => {
    const res = await t.api('PUT', '/api/plans/4/prices/C', { priceCents: 250000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.price.cents, 250000);
    const [entry] = changeLog('class_plan_price', '4:C');
    assert.equal(entry.oldValue, null);
    assert.equal(entry.newValue, '250000');
  });

  it('recusa preços negativos ou não inteiros', async () => {
    for (const priceCents of [-1, 10.5, '100', null]) {
      assert.equal((await t.api('PUT', '/api/plans/1/prices/A', { priceCents })).status, 400, String(priceCents));
    }
  });
});

describe('cotação de um serviço (caso de uso)', () => {
  it('recusa plano inactivo e plano sem preço para a classe', () => {
    const { db, services } = createTestContext();
    const { catalogService } = services;
    const polishing = demoIds(db).plan('POLIMENTO');
    const classId = (code) => catalogService.getClass(code).id;

    assert.throws(() => catalogService.quote(polishing, classId('A')), { code: 'PLAN_INACTIVE' });
    catalogService.updatePlan(polishing, { active: true }, 'teste');
    assert.equal(catalogService.quote(polishing, classId('A')).price.priceCents, 150000);
    assert.throws(() => catalogService.quote(polishing, classId('C')), { code: 'PRICE_NOT_DEFINED' });
    db.close();
  });
});
