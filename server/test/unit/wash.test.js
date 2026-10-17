import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError, NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { newQueuedWash, paymentStatusOf, planTransition, washCode, WashStatus } from '../../src/domain/wash.js';

const NOW = '2026-10-22T10:00:00.000Z';
const freeStation = { station: { id: 3, code: 'P3', active: true }, stationOccupiedBy: null };

const wash = (overrides = {}) => ({
  id: 7,
  status: WashStatus.QUEUED,
  stationId: null,
  finalPriceCents: 60000,
  currency: 'MZN',
  completedUnpaid: false,
  ...overrides,
});

describe('retrato de um novo serviço', () => {
  it('copia a classe, o plano, a duração e o preço do catálogo', () => {
    const created = newQueuedWash({
      vehicle: { id: 4, customerId: 2, plate: 'ACX731MC', classId: 2, classCode: 'B' },
      plan: { id: 2, name: 'Completa', baseDurationMin: 50 },
      price: { priceCents: 60000, currency: 'MZN' },
      source: 'patio',
      actor: 'Amílcar',
      now: NOW,
    });
    assert.equal(created.status, WashStatus.QUEUED);
    assert.equal(created.classCode, 'B');
    assert.equal(created.durationMin, 50);
    assert.equal(created.finalPriceCents, created.basePriceCents - created.discountCents - created.loyaltyBenefitCents);
    assert.equal(created.queuedAt, NOW);
  });

  it('tem um código legível', () => {
    assert.equal(washCode(139), 'LJ-0139');
  });
});

describe('ciclo de vida do serviço', () => {
  it('repetir o pedido para o estado actual não tem efeitos', () => {
    assert.deepEqual(planTransition(wash(), { to: 'queued', actor: 'x' }, { now: NOW }), { changed: false });
  });

  it('recusa estados desconhecidos', () => {
    assert.throws(() => planTransition(wash(), { to: 'lavado' }, { now: NOW }), ValidationError);
  });

  it('só aceita as transições do cap. 10.3', () => {
    const invalid = [
      ['queued', 'ready'],
      ['queued', 'completed'],
      ['in_progress', 'queued'],
      ['in_progress', 'cancelled'],
      ['ready', 'in_progress'],
      ['completed', 'cancelled'],
      ['cancelled', 'queued'],
    ];
    for (const [from, to] of invalid) {
      assert.throws(
        () => planTransition(wash({ status: from, stationId: 1 }), { to, reason: 'motivo', allowUnpaid: true }, { now: NOW }),
        (error) => error instanceof ConflictError && error.code === 'INVALID_TRANSITION',
        `${from} -> ${to}`,
      );
    }
  });

  describe('iniciar', () => {
    it('ocupa o posto e regista a hora de início', () => {
      const decision = planTransition(wash(), { to: 'in_progress', stationId: 3, actor: 'Amílcar' }, { now: NOW, ...freeStation });
      assert.deepEqual(decision.changes, { status: 'in_progress', stationId: 3, startedAt: NOW });
      assert.deepEqual(decision.event, { from: 'queued', to: 'in_progress', actor: 'Amílcar', stationId: 3 });
    });

    it('exige um posto existente, activo e livre', () => {
      const start = (context, stationId = 3) => () => planTransition(wash(), { to: 'in_progress', stationId }, { now: NOW, ...context });
      assert.throws(start({}, null), ValidationError);
      assert.throws(start({ station: null }), NotFoundError);
      assert.throws(start({ station: { id: 3, code: 'P3', active: false } }), { code: 'STATION_INACTIVE' });
      assert.throws(start({ ...freeStation, stationOccupiedBy: 5 }), { code: 'STATION_BUSY' });
    });
  });

  it('marcar pronto regista a hora', () => {
    const decision = planTransition(wash({ status: 'in_progress', stationId: 3 }), { to: 'ready' }, { now: NOW });
    assert.deepEqual(decision.changes, { status: 'ready', readyAt: NOW });
  });

  describe('concluir', () => {
    const ready = (overrides) => wash({ status: 'ready', stationId: 3, ...overrides });

    it('sem pagamento exige confirmação explícita', () => {
      assert.throws(() => planTransition(ready(), { to: 'completed' }, { now: NOW }), { code: 'PAYMENT_REQUIRED' });
      assert.throws(() => planTransition(ready(), { to: 'completed', allowUnpaid: 'sim' }, { now: NOW }), {
        code: 'PAYMENT_REQUIRED',
      });
    });

    it('a entrega sem pagamento fica registada no evento', () => {
      const decision = planTransition(ready(), { to: 'completed', allowUnpaid: true, actor: 'Bento' }, { now: NOW });
      assert.deepEqual(decision.changes, { status: 'completed', completedAt: NOW, completedUnpaid: true });
      assert.deepEqual(decision.event.details, { allowUnpaid: true, amountDueCents: 60000 });
    });

    it('um serviço de valor 0 conclui sem confirmação', () => {
      const decision = planTransition(ready({ finalPriceCents: 0 }), { to: 'completed' }, { now: NOW });
      assert.equal(decision.changes.completedUnpaid, false);
      assert.equal(decision.event.details, undefined);
    });
  });

  describe('cancelar', () => {
    it('exige motivo', () => {
      for (const reason of [undefined, '', '  ', 'ok']) {
        assert.throws(() => planTransition(wash(), { to: 'cancelled', reason }, { now: NOW }), ValidationError);
      }
    });

    it('guarda o motivo no serviço e no evento', () => {
      const decision = planTransition(wash(), { to: 'cancelled', reason: ' Cliente desistiu ' }, { now: NOW });
      assert.equal(decision.changes.cancelReason, 'Cliente desistiu');
      assert.equal(decision.event.reason, 'Cliente desistiu');
    });
  });
});

describe('estado do pagamento', () => {
  it('distingue por pagar, entregue sem pagamento e sem valor', () => {
    assert.equal(paymentStatusOf(wash()), 'unpaid');
    assert.equal(paymentStatusOf(wash({ status: 'completed', completedUnpaid: true })), 'delivered_unpaid');
    assert.equal(paymentStatusOf(wash({ finalPriceCents: 0 })), 'not_required');
  });
});
