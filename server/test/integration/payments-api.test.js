import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

// AGB 550 MP (Completa A, 450,00) está pronto no P2; ABC 123 MC (Completa B, 600,00) está em fila.
describe('API de pagamentos simulados (I-3)', () => {
  let t;
  let READY_WASH;
  let QUEUED_WASH;
  const withKey = (key, session = t.as('operator', 'Amílcar')) => ({ 'Idempotency-Key': key, ...session });
  const payDigital = (washId, amountCents, key) =>
    t.api('POST', `/api/washes/${washId}/payments/digital`, { amountCents }, withKey(key));
  const declareCash = (washId, body, key) =>
    t.api('POST', `/api/washes/${washId}/payments/cash`, { amountCents: 45000, confirm: true, ...body }, withKey(key));
  const simulate = (paymentId, outcome) => t.api('POST', `/api/payments/${paymentId}/simulate`, { outcome });
  const wash = async (id) => (await t.api('GET', `/api/washes/${id}`)).body.wash;

  before(async () => {
    t = await startTestServer();
    READY_WASH = demoIds(t.db).yardWash('AGB550MP');
    QUEUED_WASH = demoIds(t.db).yardWash('ABC123MC');
  });
  after(() => t.close());

  it('exige a chave de idempotência', async () => {
    const res = await t.api('POST', `/api/washes/${READY_WASH}/payments/digital`, { amountCents: 45000 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details.field, 'Idempotency-Key');
  });

  it('recusa um valor diferente do valor em dívida', async () => {
    const res = await payDigital(READY_WASH, 40000, 'k-mismatch');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'AMOUNT_MISMATCH');
    assert.equal(res.body.error.details.amountDueCents, 45000);
  });

  it('inicia um pagamento digital pendente; repetir o pedido não cria outro', async () => {
    const first = await payDigital(READY_WASH, 45000, 'k-digital-1');
    assert.equal(first.status, 201);
    assert.equal(first.body.payment.status, 'pending');
    assert.equal(first.body.payment.origin, 'Digital confirmado (simulado)');

    const replay = await payDigital(READY_WASH, 45000, 'k-digital-1');
    assert.equal(replay.status, 200);
    assert.equal(replay.body.created, false);
    assert.equal(replay.body.payment.id, first.body.payment.id);

    assert.equal((await wash(READY_WASH)).payment.status, 'pending');
    const other = await payDigital(READY_WASH, 45000, 'k-digital-2');
    assert.equal(other.body.error.code, 'PAYMENT_PENDING');
  });

  it('a mesma chave noutro pedido é recusada', async () => {
    const res = await payDigital(QUEUED_WASH, 60000, 'k-digital-1');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  it('a simulação confirma o pagamento e o serviço passa a pago', async () => {
    const { payments } = (await t.api('GET', `/api/washes/${READY_WASH}/payments`)).body;
    const res = await simulate(payments[0].id, 'confirmed');
    assert.equal(res.status, 200);
    assert.equal(res.body.payment.status, 'confirmed');
    assert.equal((await simulate(payments[0].id, 'confirmed')).body.changed, false);
    assert.equal((await simulate(payments[0].id, 'failed')).body.error.code, 'INVALID_PAYMENT_STATE');

    const paid = await wash(READY_WASH);
    assert.equal(paid.payment.status, 'paid_digital');
    assert.equal(paid.payment.label, 'Pago · digital (sim.)');
  });

  it('não aceita um segundo pagamento efectivo', async () => {
    const res = await declareCash(READY_WASH, {}, 'k-cash-dup');
    assert.equal(res.body.error.code, 'ALREADY_PAID');
  });

  it('com pagamento efectivo, concluir não exige confirmação', async () => {
    const res = await t.api('POST', `/api/washes/${READY_WASH}/transitions`, { to: 'completed' });
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.completedUnpaid, false);
  });

  it('o numerário exige confirmação explícita e só o declara quem tem a sessão', async () => {
    assert.equal((await declareCash(QUEUED_WASH, { amountCents: 60000, confirm: false }, 'k-c2')).status, 400);
    const analyst = await t.api('POST', `/api/washes/${QUEUED_WASH}/payments/cash`, { amountCents: 60000, confirm: true }, withKey('k-c3', t.as('bank_analyst')));
    assert.equal(analyst.status, 403);
  });

  it('o numerário substitui um digital pendente e fica em nome do operador', async () => {
    const pending = await payDigital(QUEUED_WASH, 60000, 'k-q-digital');
    // O nome escrito no pedido é ignorado: fica o operador da sessão.
    const res = await declareCash(QUEUED_WASH, { amountCents: 60000, declaredBy: 'Outra pessoa' }, 'k-q-cash');
    assert.equal(res.status, 201);
    assert.equal(res.body.payment.status, 'declared');
    assert.equal(res.body.payment.declaredBy, 'Amílcar');
    assert.equal(res.body.payment.origin, 'Numerário declarado');

    const { payments } = (await t.api('GET', `/api/washes/${QUEUED_WASH}/payments`)).body;
    const replaced = payments.find((p) => p.id === pending.body.payment.id);
    assert.equal(replaced.status, 'failed');
    assert.equal(replaced.failureReason, 'Substituído por numerário');
    assert.equal((await wash(QUEUED_WASH)).payment.label, 'Numerário declarado por Amílcar');
  });

  it('um serviço pago só é cancelado depois do reembolso', async () => {
    let res = await t.api('POST', `/api/washes/${QUEUED_WASH}/transitions`, { to: 'cancelled', reason: 'Cliente desistiu' });
    assert.equal(res.body.error.code, 'REFUND_REQUIRED');

    const { payments } = (await t.api('GET', `/api/washes/${QUEUED_WASH}/payments`)).body;
    const cash = payments.find((p) => p.status === 'declared');
    assert.equal((await t.api('POST', `/api/payments/${cash.id}/refund`, { reason: 'x' }, withKey('r-short', t.as('manager')))).status, 400);

    res = await t.api('POST', `/api/payments/${cash.id}/refund`, { reason: 'Cliente desistiu' }, withKey('r-1', t.as('manager')));
    assert.equal(res.status, 200);
    assert.equal(res.body.payment.status, 'refunded');
    assert.equal(res.body.payment.refundedBy, 'Z. Cossa');
    const replay = await t.api('POST', `/api/payments/${cash.id}/refund`, { reason: 'Cliente desistiu' }, withKey('r-1', t.as('manager')));
    assert.equal(replay.body.changed, false);

    res = await t.api('POST', `/api/washes/${QUEUED_WASH}/transitions`, { to: 'cancelled', reason: 'Cliente desistiu' });
    assert.equal(res.status, 200);
    assert.equal(res.body.wash.payment.status, 'refunded');
  });

  it('cancelar um serviço deixa sem efeito o digital pendente', async () => {
    const ids = demoIds(t.db);
    const created = await t.api('POST', '/api/washes', { vehicleId: ids.vehicle('ACX731MC'), planId: ids.plan('SIMPLES') });
    const washId = created.body.wash.id;
    const pending = await payDigital(washId, 35000, 'k-cancel');
    await t.api('POST', `/api/washes/${washId}/transitions`, { to: 'cancelled', reason: 'Engano no registo' });
    const { payments } = (await t.api('GET', `/api/washes/${washId}/payments`)).body;
    assert.equal(payments.find((p) => p.id === pending.body.payment.id).status, 'failed');
    assert.equal((await payDigital(washId, 35000, 'k-cancel-2')).body.error.code, 'WASH_CANCELLED');
  });

  it('a base garante no máximo um pagamento efectivo por serviço', () => {
    assert.throws(() =>
      t.db.prepare(`INSERT INTO payments (wash_id, method, status, amount_cents, currency, idempotency_key, declared_by,
        created_by, created_at, updated_at) VALUES (?, 'cash', 'declared', 45000, 'MZN', 'raw', 'x', 'x', 'now', 'now')`).run(READY_WASH),
    );
  });

  it('devolve 404 para serviço ou pagamento inexistentes', async () => {
    assert.equal((await payDigital(9999, 100, 'k-404')).status, 404);
    assert.equal((await simulate(9999, 'confirmed')).status, 404);
  });
});
