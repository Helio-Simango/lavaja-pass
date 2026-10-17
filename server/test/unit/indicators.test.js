import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activityIndicators, completedBy, completedByWeekday, receiptsByWeek } from '../../src/domain/indicators.js';
import { loyaltyEffectOf } from '../../src/domain/loyalty-effect.js';

const period = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-22T08:00:00.000Z' };
const wash = (id, overrides = {}) => ({
  id,
  customerId: 1,
  classCode: 'A',
  planName: 'Simples',
  status: 'completed',
  queuedAt: '2026-10-10T08:00:00.000Z',
  completedAt: '2026-10-10T09:00:00.000Z',
  cancelledAt: null,
  finalPriceCents: 25000,
  ...overrides,
});
const payment = (washId, status, at, amountCents = 25000) => ({
  washId,
  method: status === 'declared' ? 'cash' : 'digital',
  status,
  amountCents,
  confirmedAt: status === 'confirmed' || status === 'refunded' ? at : null,
  declaredAt: status === 'declared' ? at : null,
  refundedAt: status === 'refunded' ? at : null,
});

describe('indicadores de actividade (cap. 13.4)', () => {
  const washes = [
    wash(1),
    wash(2, { customerId: 2 }),
    wash(3, { customerId: 1, completedAt: '2026-10-12T09:00:00.000Z' }),
    wash(4, { status: 'cancelled', completedAt: null, cancelledAt: '2026-10-11T08:00:00.000Z' }),
    wash(5, { status: 'queued', completedAt: null }),
    wash(6, { completedAt: '2026-09-01T09:00:00.000Z', queuedAt: '2026-09-01T08:00:00.000Z' }),
  ];
  const payments = [
    payment(1, 'confirmed', '2026-10-10T09:10:00.000Z'),
    payment(2, 'declared', '2026-10-10T09:10:00.000Z'),
    payment(3, 'refunded', '2026-10-13T09:00:00.000Z'),
  ];
  const result = activityIndicators({ washes, payments, earnedWashIds: new Set([1, 2]), period });

  it('só o estado concluído conta, dentro do período', () => {
    assert.equal(result.completed, 3);
    assert.equal(result.cancelled, 1);
  });

  it('separa o digital confirmado do numerário declarado e exclui os reembolsados', () => {
    assert.deepEqual([result.digitalConfirmedCents, result.cashDeclaredCents, result.refundedCents], [25000, 25000, 25000]);
  });

  it('o valor por receber são serviços não cancelados sem pagamento efectivo', () => {
    assert.deepEqual([result.receivableCount, result.receivableCents], [2, 50000]); // 3 (reembolsado) e 5 (em fila)
  });

  it('conta as elegíveis e os clientes que regressam', () => {
    assert.equal(result.eligibleForLoyalty, 2);
    assert.deepEqual([result.distinctCustomers, result.returningCustomers, result.returningRate], [2, 1, 0.5]);
  });

  it('sem clientes, a taxa de regresso fica indefinida', () => {
    assert.equal(activityIndicators({ washes: [], payments: [], earnedWashIds: new Set(), period }).returningRate, null);
  });

  it('agrupa por dia da semana no fuso da lavadora', () => {
    // 2026-10-11 é domingo; 23:30 UTC já é segunda-feira em Maputo (UTC+2).
    const late = wash(9, { completedAt: '2026-10-11T23:30:00.000Z' });
    const days = completedByWeekday([late], period, 'Africa/Maputo');
    assert.equal(days.find((d) => d.label === 'Seg').completed, 1);
    assert.equal(days.find((d) => d.label === 'Dom').completed, 0);
  });

  it('agrupa por classe e por plano', () => {
    assert.deepEqual(completedBy(washes, period, 'classCode'), [{ key: 'A', completed: 3 }]);
  });

  it('recebimentos por semana, sempre por origem', () => {
    const weeks = receiptsByWeek(payments, period, 3);
    assert.deepEqual(weeks.map((w) => w.label), ['Sem −2', 'Sem −1', 'Últimos 7 d']);
    assert.deepEqual(weeks.map((w) => [w.digitalCents, w.cashCents]), [[0, 0], [25000, 25000], [0, 0]]);
  });
});

describe('efeito na fidelização por serviço (M13)', () => {
  const m = (type) => ({ type });
  it('distingue cada caso', () => {
    assert.equal(loyaltyEffectOf(wash(1), [m('earn')]), 'counted');
    assert.equal(loyaltyEffectOf(wash(1), [m('earn'), m('grant')]), 'counted');
    assert.equal(loyaltyEffectOf(wash(1), [m('earn'), m('revert')]), 'reverted');
    assert.equal(loyaltyEffectOf(wash(1), [m('redeem')]), 'benefit_used');
    assert.equal(loyaltyEffectOf(wash(1, { status: 'cancelled' }), [m('redeem'), m('restore')]), 'benefit_restored');
    assert.equal(loyaltyEffectOf(wash(1), []), 'not_counted');
    assert.equal(loyaltyEffectOf(wash(1, { status: 'queued' }), []), 'none');
  });
});
