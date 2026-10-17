import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import {
  assertCanReceivePayment,
  assertSameRequest,
  newCashDeclaration,
  parseIdempotencyKey,
  planRefund,
  planSimulation,
} from '../../src/domain/payment.js';

const NOW = '2026-10-22T10:00:00.000Z';
const wash = (overrides = {}) => ({ id: 1, status: 'ready', finalPriceCents: 45000, currency: 'MZN', ...overrides });
const payment = (overrides = {}) => ({ id: 9, washId: 1, method: 'digital', status: 'pending', amountCents: 45000, ...overrides });

describe('pagamentos simulados', () => {
  describe('chave de idempotência', () => {
    it('é obrigatória e limitada', () => {
      assert.equal(parseIdempotencyKey(' abc-1 '), 'abc-1');
      for (const key of [undefined, '', '   ', 'x'.repeat(101)]) assert.throws(() => parseIdempotencyKey(key), ValidationError);
    });

    it('um pedido repetido tem de ser igual ao original', () => {
      const existing = payment();
      assertSameRequest(existing, { washId: 1, method: 'digital', amountCents: 45000 });
      for (const request of [
        { washId: 2, method: 'digital', amountCents: 45000 },
        { washId: 1, method: 'cash', amountCents: 45000 },
        { washId: 1, method: 'digital', amountCents: 1 },
      ]) {
        assert.throws(() => assertSameRequest(existing, request), { code: 'IDEMPOTENCY_KEY_REUSED' });
      }
    });
  });

  describe('aceitação de um pagamento', () => {
    it('exige o valor exacto em dívida', () => {
      assertCanReceivePayment(wash(), [], 45000);
      assert.throws(() => assertCanReceivePayment(wash(), [], 40000), { code: 'AMOUNT_MISMATCH' });
    });

    it('recusa serviços cancelados, sem valor ou já pagos', () => {
      assert.throws(() => assertCanReceivePayment(wash({ status: 'cancelled' }), [], 45000), { code: 'WASH_CANCELLED' });
      assert.throws(() => assertCanReceivePayment(wash({ finalPriceCents: 0 }), [], 0), { code: 'NOTHING_TO_PAY' });
      for (const status of ['confirmed', 'declared']) {
        assert.throws(() => assertCanReceivePayment(wash(), [payment({ status })], 45000), { code: 'ALREADY_PAID' });
      }
    });

    it('um pagamento reembolsado ou falhado não impede um novo', () => {
      assertCanReceivePayment(wash(), [payment({ status: 'refunded' }), payment({ status: 'failed' })], 45000);
    });
  });

  describe('numerário declarado', () => {
    const declare = (overrides) =>
      newCashDeclaration({ wash: wash(), amountCents: 45000, declaredBy: 'Amílcar', confirmed: true, idempotencyKey: 'k', actor: 'a', now: NOW, ...overrides });

    it('fica em nome do operador, com data', () => {
      const declaration = declare();
      assert.equal(declaration.status, 'declared');
      assert.equal(declaration.declaredBy, 'Amílcar');
      assert.equal(declaration.declaredAt, NOW);
    });

    it('exige o operador e a confirmação explícita', () => {
      assert.throws(() => declare({ declaredBy: ' ' }), ValidationError);
      assert.throws(() => declare({ confirmed: 'true' }), ValidationError);
      assert.throws(() => declare({ confirmed: undefined }), ValidationError);
    });
  });

  describe('simulação do digital', () => {
    it('confirma ou falha um pagamento pendente', () => {
      assert.deepEqual(planSimulation(payment(), 'confirmed', NOW).changes, { status: 'confirmed', confirmedAt: NOW });
      assert.equal(planSimulation(payment(), 'failed', NOW).changes.status, 'failed');
    });

    it('repetir o mesmo resultado não tem efeitos', () => {
      assert.deepEqual(planSimulation(payment({ status: 'confirmed' }), 'confirmed', NOW), { changed: false });
    });

    it('não altera pagamentos que já não estão pendentes', () => {
      assert.throws(() => planSimulation(payment({ status: 'failed' }), 'confirmed', NOW), { code: 'INVALID_PAYMENT_STATE' });
      assert.throws(() => planSimulation(payment({ method: 'cash', status: 'declared' }), 'failed', NOW), {
        code: 'INVALID_PAYMENT_STATE',
      });
      assert.throws(() => planSimulation(payment(), 'talvez', NOW), ValidationError);
    });
  });

  describe('reembolso', () => {
    const refund = (subject, overrides) =>
      planRefund(subject, { reason: 'Serviço mal feito', idempotencyKey: 'r1', actor: 'Gestora', now: NOW, ...overrides });

    it('reembolsa um pagamento efectivo com motivo e autor', () => {
      const decision = refund(payment({ status: 'confirmed' }));
      assert.equal(decision.changes.status, 'refunded');
      assert.equal(decision.changes.refundedBy, 'Gestora');
      assert.equal(decision.changes.refundIdempotencyKey, 'r1');
    });

    it('exige motivo', () => {
      assert.throws(() => refund(payment({ status: 'declared', method: 'cash' }), { reason: ' ' }), ValidationError);
    });

    it('repetir com a mesma chave não tem efeitos; com outra é recusado', () => {
      const refunded = payment({ status: 'refunded', refundIdempotencyKey: 'r1' });
      assert.deepEqual(refund(refunded), { changed: false });
      assert.throws(() => refund(refunded, { idempotencyKey: 'r2' }), { code: 'ALREADY_REFUNDED' });
    });

    it('não reembolsa pagamentos que não foram recebidos', () => {
      for (const status of ['pending', 'failed']) {
        assert.throws(() => refund(payment({ status })), { code: 'INVALID_PAYMENT_STATE' });
      }
    });
  });
});
