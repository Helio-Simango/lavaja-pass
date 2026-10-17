import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.js';

// Estado da demonstração (relógio fixo em 2026-10-22 08:00 UTC):
// LJ-0001 AGB 550 MP pronto no P2 · LJ-0002 MMC 552 MP em execução no P1 ·
// LJ-0003 ABC 123 MC e LJ-0004 AAZ 219 MP em fila · P3 e P4 livres.

describe('serviços, fila e postos (I-2)', () => {
  let t;
  const ids = {};
  const transition = (id, body, headers) => t.api('POST', `/api/washes/${id}/transitions`, body, headers);
  const vehicleId = (plate) => t.db.prepare('SELECT id FROM vehicles WHERE plate = ?').get(plate).id;
  const planId = (code) => t.db.prepare('SELECT id FROM wash_plans WHERE code = ?').get(code).id;
  const stationId = (code) => t.db.prepare('SELECT id FROM stations WHERE code = ?').get(code).id;

  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  it('mostra o pátio de demonstração com estimativas', async () => {
    const res = await t.api('GET', '/api/washes?active=true');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.washes.map((w) => [w.code, w.status, w.station?.code ?? null]),
      [
        ['LJ-0001', 'ready', 'P2'],
        ['LJ-0002', 'in_progress', 'P1'],
        ['LJ-0003', 'queued', null],
        ['LJ-0004', 'queued', null],
      ],
    );
    const queued = res.body.washes.filter((w) => w.status === 'queued');
    assert.deepEqual(queued.map((w) => w.estimate.position), [1, 2]);
    assert.ok(queued.every((w) => w.estimate.estimatedStartAt));
    const running = res.body.washes.find((w) => w.status === 'in_progress');
    assert.equal(running.estimate.estimatedEndAt, '2026-10-22T08:50:00.000Z');
  });

  it('mostra o estado de cada posto', async () => {
    const res = await t.api('GET', '/api/stations');
    assert.deepEqual(
      res.body.stations.map((s) => [s.code, s.state]),
      [['P1', 'busy'], ['P2', 'ready'], ['P3', 'free'], ['P4', 'free']],
    );
  });

  it('regista um serviço com o preço calculado no servidor e o retrato aplicado', async () => {
    const res = await t.api(
      'POST',
      '/api/washes',
      { vehicleId: vehicleId('ACX731MC'), planId: planId('COMPLETA'), finalPriceCents: 1 },
      { 'X-Actor': 'Amílcar' },
    );
    assert.equal(res.status, 201);
    const w = res.body.wash;
    ids.acx = w.id;
    assert.equal(w.status, 'queued');
    assert.equal(w.vehicle.classCode, 'B');
    assert.equal(w.plan.name, 'Completa');
    assert.equal(w.durationMin, 50);
    assert.equal(w.price.base.cents, 60000);
    assert.equal(w.price.final.cents, 60000); // o valor enviado pelo cliente é ignorado
    assert.equal(w.payment.status, 'unpaid');
    assert.equal(w.createdBy, 'Amílcar');
    assert.equal(w.estimate.position, 3);
  });

  it('recusa um plano inactivo ou sem preço para a classe', async () => {
    let res = await t.api('POST', '/api/washes', { vehicleId: vehicleId('ANT145MC'), planId: planId('POLIMENTO') });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PLAN_INACTIVE');

    await t.api('PATCH', `/api/plans/${planId('POLIMENTO')}`, { active: true });
    res = await t.api('POST', '/api/washes', { vehicleId: vehicleId('ANT145MC'), planId: planId('POLIMENTO') });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PRICE_NOT_DEFINED');
    await t.api('PATCH', `/api/plans/${planId('POLIMENTO')}`, { active: false });
  });

  it('recusa uma viatura que já está no pátio', async () => {
    const res = await t.api('POST', '/api/washes', { vehicleId: vehicleId('ACX731MC'), planId: planId('SIMPLES') });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'VEHICLE_ALREADY_ACTIVE');
  });

  it('valida o pedido de registo', async () => {
    assert.equal((await t.api('POST', '/api/washes', { planId: 1 })).status, 400);
    assert.equal((await t.api('POST', '/api/washes', { vehicleId: 'x', planId: 1 })).status, 400);
    assert.equal((await t.api('POST', '/api/washes', { vehicleId: 9999, planId: 1 })).status, 404);
    assert.equal((await t.api('POST', '/api/washes', { vehicleId: vehicleId('ANT145MC'), planId: 9999 })).status, 404);
    assert.equal(
      (await t.api('POST', '/api/washes', { vehicleId: vehicleId('ANT145MC'), planId: 1, source: 'outro' })).status,
      400,
    );
  });

  it('alterar o catálogo não muda o retrato dos serviços já registados', async () => {
    await t.api('PUT', `/api/plans/${planId('COMPLETA')}/prices/B`, { priceCents: 65000 });
    const res = await t.api('GET', `/api/washes/${ids.acx}`);
    assert.equal(res.body.wash.price.final.cents, 60000);
  });

  it('iniciar exige um posto livre e activo', async () => {
    let res = await transition(ids.acx, { to: 'in_progress' });
    assert.equal(res.status, 400);
    res = await transition(ids.acx, { to: 'in_progress', stationId: stationId('P1') });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'STATION_BUSY');
    res = await transition(ids.acx, { to: 'in_progress', stationId: stationId('P2') });
    assert.equal(res.body.error.code, 'STATION_BUSY'); // pronto também ocupa o posto
    res = await transition(ids.acx, { to: 'in_progress', stationId: 9999 });
    assert.equal(res.status, 404);

    t.db.prepare("UPDATE stations SET active = 0 WHERE code = 'P4'").run();
    res = await transition(ids.acx, { to: 'in_progress', stationId: stationId('P4') });
    assert.equal(res.body.error.code, 'STATION_INACTIVE');
    t.db.prepare("UPDATE stations SET active = 1 WHERE code = 'P4'").run();
  });

  it('inicia num posto livre; repetir o pedido não tem efeitos', async () => {
    t.clock.advanceMinutes(5);
    let res = await transition(ids.acx, { to: 'in_progress', stationId: stationId('P3') }, { 'X-Actor': 'Amílcar' });
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, true);
    assert.equal(res.body.wash.station.code, 'P3');
    assert.equal(res.body.wash.startedAt, '2026-10-22T08:05:00.000Z');
    assert.equal(res.body.wash.estimate.estimatedEndAt, '2026-10-22T08:55:00.000Z');

    res = await transition(ids.acx, { to: 'in_progress', stationId: stationId('P4') });
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, false);
    assert.equal(res.body.wash.station.code, 'P3');
  });

  it('recusa transições fora do ciclo de vida', async () => {
    for (const to of ['queued', 'completed', 'cancelled']) {
      const res = await transition(ids.acx, { to });
      assert.equal(res.status, 409, to);
      assert.equal(res.body.error.code, 'INVALID_TRANSITION');
      assert.deepEqual(res.body.error.details.allowed, ['ready']);
    }
    assert.equal((await transition(ids.acx, { to: 'lavado' })).status, 400);
  });

  it('concluir sem pagamento exige confirmação explícita, que fica registada', async () => {
    t.clock.advanceMinutes(45);
    assert.equal((await transition(ids.acx, { to: 'ready' })).status, 200);

    let res = await transition(ids.acx, { to: 'completed' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PAYMENT_REQUIRED');

    res = await transition(ids.acx, { to: 'completed', allowUnpaid: 'sim' });
    assert.equal(res.status, 400);

    res = await transition(ids.acx, { to: 'completed', allowUnpaid: true }, { 'X-Actor': 'Amílcar' });
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.status, 'completed');
    assert.equal(res.body.wash.completedUnpaid, true);
    assert.equal(res.body.wash.payment.status, 'delivered_unpaid');
    assert.equal(res.body.wash.estimate, null);
  });

  it('audita todas as transições com autor e data', async () => {
    const res = await t.api('GET', `/api/washes/${ids.acx}`);
    assert.deepEqual(
      res.body.events.map((e) => [e.from, e.to, e.actor]),
      [
        [null, 'queued', 'Amílcar'],
        ['queued', 'in_progress', 'Amílcar'],
        ['in_progress', 'ready', 'operador'],
        ['ready', 'completed', 'Amílcar'],
      ],
    );
    assert.deepEqual(res.body.events[3].details, { allowUnpaid: true, amountDueCents: 60000 });
    assert.equal(res.body.events[1].station, 'P3');
  });

  it('um serviço concluído é final e liberta o posto', async () => {
    const res = await transition(ids.acx, { to: 'cancelled', reason: 'engano' });
    assert.equal(res.status, 409);
    const stations = await t.api('GET', '/api/stations');
    assert.equal(stations.body.stations.find((s) => s.code === 'P3').state, 'free');
    assert.throws(() => t.db.prepare("UPDATE washes SET status = 'queued' WHERE id = ?").run(ids.acx), /estado final/);
  });

  it('a viatura pode voltar à fila depois de concluída', async () => {
    const res = await t.api('POST', '/api/washes', { vehicleId: vehicleId('ACX731MC'), planId: planId('SIMPLES') });
    assert.equal(res.status, 201);
    ids.acx2 = res.body.wash.id;
  });

  it('cancelar exige motivo e é final', async () => {
    let res = await transition(ids.acx2, { to: 'cancelled' });
    assert.equal(res.status, 400);
    res = await transition(ids.acx2, { to: 'cancelled', reason: '  ' });
    assert.equal(res.status, 400);
    res = await transition(ids.acx2, { to: 'cancelled', reason: 'Cliente desistiu' }, { 'X-Actor': 'Bento' });
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.cancelReason, 'Cliente desistiu');
    res = await transition(ids.acx2, { to: 'in_progress', stationId: stationId('P3') });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.error.details.allowed, []);
  });

  it('um serviço de valor 0 conclui sem confirmação de pagamento', async () => {
    await t.api('PUT', `/api/plans/${planId('SIMPLES')}/prices/C`, { priceCents: 0 });
    const created = await t.api('POST', '/api/washes', { vehicleId: vehicleId('ANT145MC'), planId: planId('SIMPLES') });
    const id = created.body.wash.id;
    assert.equal(created.body.wash.payment.status, 'not_required');
    await transition(id, { to: 'in_progress', stationId: stationId('P4') });
    await transition(id, { to: 'ready' });
    const res = await transition(id, { to: 'completed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.completedUnpaid, false);
  });

  it('filtra por estado e por data', async () => {
    let res = await t.api('GET', '/api/washes?status=completed,cancelled');
    assert.ok(res.body.washes.length >= 3);
    assert.ok(res.body.washes.every((w) => ['completed', 'cancelled'].includes(w.status)));
    res = await t.api('GET', '/api/washes?date=2026-10-22');
    assert.ok(res.body.washes.length >= 4);
    res = await t.api('GET', '/api/washes?date=2020-01-01');
    assert.equal(res.body.washes.length, 0);
    assert.equal((await t.api('GET', '/api/washes?status=lavado')).status, 400);
    assert.equal((await t.api('GET', '/api/washes?date=22-10-2026')).status, 400);
    assert.equal((await t.api('GET', '/api/washes/9999')).status, 404);
  });
});
