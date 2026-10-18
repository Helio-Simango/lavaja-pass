import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

describe('API do Painel, viaturas por classe e histórico (I-6)', () => {
  let t;
  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('cada indicador tem valor, definição e origem', async () => {
    const res = await t.api('GET', '/api/dashboard/summary?days=30');
    assert.equal(res.status, 200);
    assert.equal(res.body.period.days, 30);
    for (const indicator of res.body.indicators) {
      assert.ok(indicator.label && indicator.definition && indicator.origin, indicator.key);
    }
    const byKey = Object.fromEntries(res.body.indicators.map((i) => [i.key, i]));
    assert.equal(byKey.digitalConfirmed.origin, 'Confirmado em simulação');
    assert.equal(byKey.cashDeclared.origin, 'Declarado por operador');
    assert.match(byKey.receivable.definition, /Não é receita/);
    assert.ok(byKey.completed.value >= 30);
  });

  it('o digital e o numerário nunca aparecem somados', async () => {
    const { body } = await t.api('GET', '/api/dashboard/summary');
    assert.ok(body.indicators.every((i) => !/total/i.test(i.key)));
    for (const week of body.weeklyReceipts) assert.ok('digital' in week && 'cash' in week && !('total' in week));
  });

  it('mostra o pátio agora e os concluídos por dia da semana', async () => {
    const { body } = await t.api('GET', '/api/dashboard/summary');
    assert.deepEqual(body.yardNow, { queued: 2, in_progress: 1, ready: 1 });
    assert.deepEqual(body.byWeekday.map((d) => d.label), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
  });

  it('a ocupação por dia da semana usa a capacidade prática (por validar) e assinala os dias fracos', async () => {
    const { body } = await t.api('GET', '/api/dashboard/summary');
    assert.equal(body.capacity.practicalWashesPerDay, 28);
    assert.equal(body.occupancy.length, 7);
    for (const day of body.occupancy) {
      assert.equal(day.occupancyPercent, Math.round((day.completed / day.days / 28) * 100));
    }
    assert.ok(body.lowOccupancy.every((day) => day.occupancyPercent < 27));
  });

  it('o dia de hoje (M10) separa o digital confirmado do numerário declarado, por operador', async () => {
    const res = await t.api('GET', '/api/dashboard/today');
    assert.equal(res.status, 200);
    const { today } = res.body;
    assert.equal(today.date, '2026-10-22');
    assert.equal(today.washes, 4); // o pátio de demonstração
    assert.equal(today.digital.origin, 'Confirmado em simulação');
    assert.equal(today.cash.origin, 'Declarado por operador');
    assert.equal(today.received.cents, today.digital.cents + today.cash.cents);
    assert.equal(today.receivable.count, 3); // na fila (1), a lavar (1) e pronto (1) sem pagamento
    assert.equal((await t.api('GET', '/api/dashboard/today', undefined, t.as('operator', 'Amílcar'))).status, 403);
  });

  it('valida o período', async () => {
    assert.equal((await t.api('GET', '/api/dashboard/summary?days=0')).status, 400);
    assert.equal((await t.api('GET', '/api/dashboard/summary?days=abc')).status, 400);
  });

  it('lista viaturas por classe com as concluídas (M12)', async () => {
    const res = await t.api('GET', '/api/vehicles?classId=B');
    assert.equal(res.status, 200);
    const acx = res.body.vehicles.find((v) => v.plate === 'ACX731MC');
    assert.equal(acx.completedCount, 10);
    assert.ok(acx.lastCompletedAt);
    assert.ok(res.body.vehicles.every((v) => v.class.code === 'B'));
  });

  it('histórico por matrícula com os valores guardados, a origem do pagamento e o efeito na fidelização (M13)', async () => {
    const ids = demoIds(t.db);
    const vehicleId = ids.vehicle('AHM482MP');
    // O preço do catálogo muda; o histórico não.
    await t.api('PUT', `/api/plans/${ids.plan('SIMPLES')}/prices/A`, { priceCents: 30000 });
    const res = await t.api('GET', `/api/vehicles/${vehicleId}/wash-history`);
    assert.equal(res.status, 200);
    assert.equal(res.body.vehicle.plateDisplay, 'AHM 482 MP');
    const counted = res.body.washes.filter((w) => w.loyaltyEffect.code === 'counted');
    const notCounted = res.body.washes.filter((w) => w.loyaltyEffect.code === 'not_counted');
    assert.equal(counted.length, 9);
    assert.equal(notCounted.length, 1); // a entregue sem pagamento
    assert.ok(res.body.washes.every((w) => w.price.final.cents === 25000));
    assert.ok(counted.every((w) => /Digital \(sim\.\)|Numerário \(decl\./.test(w.payment.label)));

    const summary = await t.api('GET', `/api/vehicles/${vehicleId}/wash-history/summary`);
    assert.deepEqual([summary.body.completed, summary.body.loyaltyCounted], [10, 9]);
    assert.equal((await t.api('GET', '/api/vehicles/9999/wash-history')).status, 404);
  });
});
