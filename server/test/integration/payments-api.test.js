import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

// LJ-0001 (AGB 550 MP, Completa A, 450,00) está pronto no P2; LJ-0003 (ABC 123 MC, Completa B, 600,00) em fila.
const READY_WASH = 1;
const QUEUED_WASH = 3;

describe('API de pagamentos simulados (I-3)', () => {
  let t;
  const withKey = (key, actor = 'Teste') => ({ 'Idempotency-Key': key, 'X-Actor': actor });
  const payDigital = (washId, amountCents, key) =>
    t.api('POST', `/api/washes/${washId}/payments/digital`, { amountCents }, withKey(key));
  const declareCash = (washId, body, key) =>
    t.api('POST', `/api/washes/${washId}/payments/cash`, { amountCents: 45000, declaredBy: 'Amílcar', confirm: true, ...body }, withKey(key));
  const simulate = (paymentId, outcome) => t.api('POST', `/api/payments/${paymentId}/simulate`, { outcome });
  const wash = async (id) => (await t.api('GET', `/api/washes/${id}`)).body.wash;

  before(async () => {
    t = await startTestServer();
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

  it('o numerário exige operador e confirmação explícita', async () => {
    assert.equal((await declareCash(QUEUED_WASH, { amountCents: 60000, declaredBy: '' }, 'k-c1')).status, 400);
    assert.equal((await declareCash(QUEUED_WASH, { amountCents: 60000, confirm: false }, 'k-c2')).status, 400);
  });

  it('o numerário substitui um digital pendente e fica em nome do operador', async () => {
    const pending = await payDigital(QUEUED_WASH, 60000, 'k-q-digital');
    const res = await declareCash(QUEUED_WASH, { amountCents: 60000 }, 'k-q-cash');
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
    assert.equal((await t.api('POST', `/api/payments/${cash.id}/refund`, { reason: 'x' }, withKey('r-short'))).status, 400);

    res = await t.api('POST', `/api/payments/${cash.id}/refund`, { reason: 'Cliente desistiu' }, withKey('r-1', 'Gestora'));
    assert.equal(res.status, 200);
    assert.equal(res.body.payment.status, 'refunded');
    assert.equal(res.body.payment.refundedBy, 'Gestora');
    const replay = await t.api('POST', `/api/payments/${cash.id}/refund`, { reason: 'Cliente desistiu' }, withKey('r-1'));
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
        created_by, created_at, updated_at) VALUES (1, 'cash', 'declared', 45000, 'MZN', 'raw', 'x', 'x', 'now', 'now')`).run(),
    );
  });

  it('devolve 404 para serviço ou pagamento inexistentes', async () => {
    assert.equal((await payDigital(9999, 100, 'k-404')).status, 404);
    assert.equal((await simulate(9999, 'confirmed')).status, 404);
  });
});
