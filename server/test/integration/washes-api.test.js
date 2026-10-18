import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

// Pátio da demonstração (relógio fixo em 2026-10-22 08:00 UTC):
// AGB 550 MP pronto no P2 · MMC 552 MP em execução no P1 · ABC 123 MC e AAZ 219 MP em fila · P3 e P4 livres.

describe('API de serviços, fila e postos (I-2)', () => {
  let t;
  let ids;
  const washIds = {};
  const transition = (id, body, headers) => t.api('POST', `/api/washes/${id}/transitions`, body, headers);
  const register = (plate, planCode, headers) =>
    t.api('POST', '/api/washes', { vehicleId: ids.vehicle(plate), planId: ids.plan(planCode) }, headers);

  before(async () => {
    t = await startTestServer();
    ids = demoIds(t.db);
  });
  after(() => t.close());

  it('mostra o pátio de demonstração com estimativas', async () => {
    const res = await t.api('GET', '/api/washes?active=true');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.washes.map((w) => [w.vehicle.plate, w.status, w.station?.code ?? null]),
      [
        ['AGB550MP', 'ready', 'B2'],
        ['MMC552MP', 'in_progress', 'B1'],
        ['ABC123MC', 'queued', null],
        ['AAZ219MP', 'queued', null],
      ],
    );
    assert.match(res.body.washes[0].code, /^LJ-\d{4}$/);
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
      [['B1', 'busy'], ['B2', 'ready'], ['B3', 'free'], ['B4', 'free']],
    );
  });

  it('regista um serviço com o preço calculado no servidor e o retrato aplicado', async () => {
    const res = await t.api(
      'POST',
      '/api/washes',
      { vehicleId: ids.vehicle('ACX731MC'), planId: ids.plan('COMPLETA'), finalPriceCents: 1 },
      t.as('operator', 'Amílcar'),
    );
    assert.equal(res.status, 201);
    const { wash } = res.body;
    washIds.acx = wash.id;
    assert.equal(wash.status, 'queued');
    assert.equal(wash.vehicle.classCode, 'B');
    assert.equal(wash.plan.name, 'Completa');
    assert.equal(wash.durationMin, 50);
    assert.equal(wash.price.base.cents, 60000);
    assert.equal(wash.price.final.cents, 60000); // o valor enviado pelo cliente é ignorado
    assert.equal(wash.payment.status, 'unpaid');
    assert.equal(wash.createdBy, 'Amílcar');
    assert.equal(wash.estimate.position, 3);
  });

  it('recusa um plano inactivo ou sem preço para a classe', async () => {
    let res = await register('ANT145MC', 'POLIMENTO');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PLAN_INACTIVE');

    await t.api('PATCH', `/api/plans/${ids.plan('POLIMENTO')}`, { active: true });
    res = await register('ANT145MC', 'POLIMENTO');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PRICE_NOT_DEFINED');
    await t.api('PATCH', `/api/plans/${ids.plan('POLIMENTO')}`, { active: false });
  });

  it('recusa uma viatura que já está no pátio', async () => {
    const res = await register('ACX731MC', 'SIMPLES');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'VEHICLE_ALREADY_ACTIVE');
  });

  it('valida o pedido de registo', async () => {
    const vehicleId = ids.vehicle('ANT145MC');
    const cases = [
      [{ planId: 1 }, 400],
      [{ vehicleId: 'x', planId: 1 }, 400],
      [{ vehicleId: 9999, planId: 1 }, 404],
      [{ vehicleId, planId: 9999 }, 404],
      [{ vehicleId, planId: 1, source: 'outro' }, 400],
    ];
    for (const [body, status] of cases) {
      assert.equal((await t.api('POST', '/api/washes', body)).status, status, JSON.stringify(body));
    }
  });

  it('alterar o catálogo não muda o retrato dos serviços já registados', async () => {
    await t.api('PUT', `/api/plans/${ids.plan('COMPLETA')}/prices/B`, { priceCents: 65000 });
    const res = await t.api('GET', `/api/washes/${washIds.acx}`);
    assert.equal(res.body.wash.price.final.cents, 60000);
  });

  it('iniciar exige um posto livre e activo', async () => {
    const start = (stationId) => transition(washIds.acx, { to: 'in_progress', stationId });
    assert.equal((await start(undefined)).status, 400);
    assert.equal((await start(ids.station('B1'))).body.error.code, 'STATION_BUSY');
    assert.equal((await start(ids.station('B2'))).body.error.code, 'STATION_BUSY'); // pronto também ocupa o posto
    assert.equal((await start(9999)).status, 404);

    t.db.prepare("UPDATE stations SET active = 0 WHERE code = 'B4'").run();
    assert.equal((await start(ids.station('B4'))).body.error.code, 'STATION_INACTIVE');
    t.db.prepare("UPDATE stations SET active = 1 WHERE code = 'B4'").run();
  });

  it('inicia num posto livre; repetir o pedido não tem efeitos', async () => {
    t.clock.advanceMinutes(5);
    let res = await transition(washIds.acx, { to: 'in_progress', stationId: ids.station('B3') }, t.as('operator', 'Amílcar'));
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, true);
    assert.equal(res.body.wash.station.code, 'B3');
    assert.equal(res.body.wash.startedAt, '2026-10-22T08:05:00.000Z');
    assert.equal(res.body.wash.estimate.estimatedEndAt, '2026-10-22T08:55:00.000Z');

    res = await transition(washIds.acx, { to: 'in_progress', stationId: ids.station('B4') });
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, false);
    assert.equal(res.body.wash.station.code, 'B3');
  });

  it('recusa transições fora do ciclo de vida', async () => {
    for (const to of ['queued', 'completed', 'cancelled']) {
      const res = await transition(washIds.acx, { to });
      assert.equal(res.status, 409, to);
      assert.equal(res.body.error.code, 'INVALID_TRANSITION');
      assert.deepEqual(res.body.error.details.allowed, ['ready']);
    }
    assert.equal((await transition(washIds.acx, { to: 'lavado' })).status, 400);
  });

  it('concluir sem pagamento exige confirmação explícita, que fica registada', async () => {
    t.clock.advanceMinutes(45);
    assert.equal((await transition(washIds.acx, { to: 'ready' })).status, 200);

    let res = await transition(washIds.acx, { to: 'completed' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PAYMENT_REQUIRED');
    assert.equal((await transition(washIds.acx, { to: 'completed', allowUnpaid: 'sim' })).status, 400);

    res = await transition(washIds.acx, { to: 'completed', allowUnpaid: true }, t.as('operator', 'Amílcar'));
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.status, 'completed');
    assert.equal(res.body.wash.completedUnpaid, true);
    assert.equal(res.body.wash.payment.status, 'delivered_unpaid');
    assert.equal(res.body.wash.estimate, null);
  });

  it('audita todas as transições com autor e data', async () => {
    const res = await t.api('GET', `/api/washes/${washIds.acx}`);
    assert.deepEqual(
      res.body.events.map((e) => [e.from, e.to, e.actor]),
      [
        [null, 'queued', 'Amílcar'],
        ['queued', 'in_progress', 'Amílcar'],
        ['in_progress', 'ready', 'Z. Cossa'],
        ['ready', 'completed', 'Amílcar'],
      ],
    );
    assert.deepEqual(res.body.events[3].details, { allowUnpaid: true, amountDueCents: 60000 });
    assert.equal(res.body.events[1].station, 'B3');
  });

  it('um serviço concluído é final e liberta o posto', async () => {
    assert.equal((await transition(washIds.acx, { to: 'cancelled', reason: 'engano' })).status, 409);
    const stations = await t.api('GET', '/api/stations');
    assert.equal(stations.body.stations.find((s) => s.code === 'B3').state, 'free');
  });

  it('a viatura pode voltar à fila depois de concluída', async () => {
    const res = await register('ACX731MC', 'SIMPLES');
    assert.equal(res.status, 201);
    washIds.acxAgain = res.body.wash.id;
  });

  it('cancelar exige motivo e é final', async () => {
    assert.equal((await transition(washIds.acxAgain, { to: 'cancelled' })).status, 400);
    assert.equal((await transition(washIds.acxAgain, { to: 'cancelled', reason: '  ' })).status, 400);
    let res = await transition(washIds.acxAgain, { to: 'cancelled', reason: 'Cliente desistiu' }, t.as('operator', 'Bento'));
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.cancelReason, 'Cliente desistiu');
    res = await transition(washIds.acxAgain, { to: 'in_progress', stationId: ids.station('B3') });
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.error.details.allowed, []);
  });

  it('um serviço de valor 0 conclui sem confirmação de pagamento', async () => {
    await t.api('PUT', `/api/plans/${ids.plan('SIMPLES')}/prices/C`, { priceCents: 0 });
    const created = await register('ANT145MC', 'SIMPLES');
    const id = created.body.wash.id;
    assert.equal(created.body.wash.payment.status, 'not_required');
    await transition(id, { to: 'in_progress', stationId: ids.station('B4') });
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
