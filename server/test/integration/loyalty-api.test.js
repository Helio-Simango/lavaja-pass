import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

// Demonstração: a Amélia (ACX 731 MC, classe B) fechou um ciclo e tem 1 benefício;
// o Carlos (AHM 482 MP, classe A) tem 9 lavagens elegíveis e não está no pátio.
describe('API de fidelização (I-4)', () => {
  let t;
  let ids;
  let amelia;
  let carlos;
  const card = async (customerId) => (await t.api('GET', `/api/customers/${customerId}/loyalty`)).body.loyalty;
  const classOf = (loyalty, code) => loyalty.classes.find((c) => c.classCode === code);
  const transition = (washId, body) => t.api('POST', `/api/washes/${washId}/transitions`, body);
  const register = (plate, planCode, extra = {}) =>
    t.api('POST', '/api/washes', { vehicleId: ids.vehicle(plate), planId: ids.plan(planCode), ...extra });
  const payCash = (wash, key) =>
    t.api(
      'POST',
      `/api/washes/${wash.id}/payments/cash`,
      { amountCents: wash.price.final.cents, declaredBy: 'Amílcar', confirm: true },
      { 'Idempotency-Key': key },
    );
  const freeStation = async () => (await t.api('GET', '/api/stations')).body.stations.find((s) => s.state === 'free').id;

  /** Faz um serviço completo: fila, posto livre, pronto, pagamento opcional e conclusão. */
  async function washAndComplete(plate, planCode, { pay = true, key, ...extra } = {}) {
    const { wash } = (await register(plate, planCode, extra)).body;
    await transition(wash.id, { to: 'in_progress', stationId: await freeStation() });
    await transition(wash.id, { to: 'ready' });
    if (pay) await payCash(wash, key);
    const done = await transition(wash.id, { to: 'completed', allowUnpaid: !pay && wash.price.final.cents > 0 });
    return done.body.wash;
  }

  before(async () => {
    t = await startTestServer();
    ids = demoIds(t.db);
    amelia = ids.customer('258845550101');
    carlos = ids.customer('258825550102');
  });
  after(() => t.close());

  it('mostra as regras em vigor, marcadas por validar', async () => {
    const res = await t.api('GET', '/api/loyalty/rules');
    assert.equal(res.status, 200);
    assert.equal(res.body.rules.version, 1);
    assert.equal(res.body.rules.toValidate, true);
    assert.equal(res.body.rules.summary.benefit, '1 lavagem Simples gratuita');
    assert.deepEqual(res.body.rules.summary.levels.map((l) => l.active), [true, true, false]);
  });

  it('um único cartão por cliente, com progresso por classe', async () => {
    const loyalty = await card(amelia);
    assert.deepEqual(loyalty.classes.map((c) => c.classCode), ['A', 'B', 'C']);
    const b = classOf(loyalty, 'B');
    assert.deepEqual([b.eligibleWashes, b.progressInCycle, b.level, b.benefitsAvailable], [10, 0, 2, 1]);
    assert.equal(b.benefit, '1 lavagem Simples gratuita');
    assert.equal(classOf(loyalty, 'A').benefitsAvailable, 0);
  });

  it('a lavagem que fecha um ciclo atribui o benefício na mesma transacção', async () => {
    const wash = await washAndComplete('AHM482MP', 'SIMPLES', { key: 'k-carlos-10' });
    assert.equal(wash.status, 'completed');
    const a = classOf(await card(carlos), 'A');
    assert.deepEqual([a.eligibleWashes, a.completedCycles, a.benefitsAvailable], [10, 1, 1]);

    const { movements } = (await t.api('GET', `/api/customers/${carlos}/loyalty/movements`)).body;
    const last = movements.slice(-2).map((m) => [m.type, m.reference]);
    assert.deepEqual(last, [
      ['earn', `earn:wash:${wash.id}`],
      ['grant', `grant:wash:${wash.id}`],
    ]);
  });

  it('o reembolso reverte o progresso e o benefício ainda por usar', async () => {
    const [lastWash] = (await t.api('GET', '/api/washes?status=completed')).body.washes.filter((w) => w.vehicle.plate === 'AHM482MP').slice(-1);
    const payment = (await t.api('GET', `/api/washes/${lastWash.id}/payments`)).body.payments[0];
    const res = await t.api('POST', `/api/payments/${payment.id}/refund`, { reason: 'Reclamação' }, { 'Idempotency-Key': 'r-carlos' });
    assert.equal(res.status, 200);
    const a = classOf(await card(carlos), 'A');
    assert.deepEqual([a.eligibleWashes, a.benefitsAvailable], [9, 0]);
  });

  it('uma lavagem entregue sem pagamento não conta', async () => {
    await washAndComplete('AHM482MP', 'SIMPLES', { pay: false });
    assert.equal(classOf(await card(carlos), 'A').eligibleWashes, 9);
  });

  it('usar o benefício aplica a lavagem gratuita no retrato do preço', async () => {
    const res = await register('ACX731MC', 'COMPLETA', { useBenefit: true });
    assert.equal(res.status, 201);
    const { wash } = res.body;
    assert.deepEqual([wash.price.base.cents, wash.price.loyaltyBenefit.cents, wash.price.final.cents], [60000, 35000, 25000]);
    assert.equal(classOf(await card(amelia), 'B').benefitsAvailable, 0);

    // Cancelar devolve o benefício.
    await transition(wash.id, { to: 'cancelled', reason: 'Cliente desistiu' });
    assert.equal(classOf(await card(amelia), 'B').benefitsAvailable, 1);
  });

  it('sem saldo na classe o benefício é recusado (não se usa noutra classe)', async () => {
    const res = await register('ANT145MC', 'SIMPLES', { useBenefit: true });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NO_BENEFIT_AVAILABLE');
  });

  it('a lavagem gratuita conclui sem pagamento e não conta para o progresso (D-03)', async () => {
    const wash = await washAndComplete('ACX731MC', 'SIMPLES', { pay: false, useBenefit: true });
    assert.equal(wash.price.final.cents, 0);
    assert.equal(wash.payment.status, 'not_required');
    assert.equal(wash.completedUnpaid, false);
    const b = classOf(await card(amelia), 'B');
    assert.deepEqual([b.eligibleWashes, b.benefitsAvailable], [10, 0]);
  });

  it('publica uma nova versão das regras e regista a alteração', async () => {
    const { rules } = (await t.api('GET', '/api/loyalty/rules')).body;
    const params = { ...rules.params, benefit: { type: 'credit', creditCapCents: { A: 20000, B: 30000, C: 40000 } } };
    const res = await t.api('PUT', '/api/loyalty/rules', { params }, { 'X-Actor': 'Gestora' });
    assert.equal(res.status, 201);
    assert.equal(res.body.rules.version, 2);
    assert.equal(res.body.rules.summary.benefit, 'Crédito com limite por classe');
    assert.equal(classOf(await card(amelia), 'B').benefit, 'Crédito até 300,00 MZN');

    const versions = (await t.api('GET', '/api/loyalty/rules')).body.versions;
    assert.deepEqual(versions.map((v) => v.version), [1, 2]);
    const [entry] = t.repositories.changeLogRepository.listFor('loyalty_rules', 2);
    assert.equal(entry.actor, 'Gestora');
  });

  it('recusa regras inválidas sem criar versão', async () => {
    const res = await t.api('PUT', '/api/loyalty/rules', { params: { cycleSize: 0 } });
    assert.equal(res.status, 400);
    assert.equal((await t.api('GET', '/api/loyalty/rules')).body.versions.length, 2);
  });

  it('devolve 404 para um cliente inexistente', async () => {
    assert.equal((await t.api('GET', '/api/customers/9999/loyalty')).status, 404);
  });
});
