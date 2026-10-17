import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import { dayInconsistencies, declaredCashByOperator, parseIssueCode, planClosing } from '../../src/domain/reconciliation.js';

const NOW = '2026-10-22T12:00:00.000Z';

describe('fecho diário e reconciliação (cap. 13.3)', () => {
  it('soma o numerário declarado por operador, sem os reembolsados', () => {
    const payments = [
      { method: 'cash', status: 'declared', declaredBy: 'Bento', amountCents: 25000 },
      { method: 'cash', status: 'declared', declaredBy: 'Amílcar', amountCents: 45000 },
      { method: 'cash', status: 'declared', declaredBy: 'Bento', amountCents: 35000 },
      { method: 'cash', status: 'refunded', declaredBy: 'Bento', amountCents: 99900 },
      { method: 'digital', status: 'confirmed', declaredBy: null, amountCents: 60000 },
    ];
    assert.deepEqual(declaredCashByOperator(payments), [
      { operator: 'Amílcar', count: 1, declaredCents: 45000 },
      { operator: 'Bento', count: 2, declaredCents: 60000 },
    ]);
  });

  it('encontra as inconsistências do dia', () => {
    const issues = dayInconsistencies({
      washes: [
        { id: 1, status: 'completed', completedUnpaid: true, finalPriceCents: 25000 },
        { id: 2, status: 'completed', completedUnpaid: false, finalPriceCents: 25000 },
      ],
      payments: [
        { washId: 3, status: 'pending', amountCents: 45000, createdAt: '2026-10-22T11:00:00.000Z' },
        { washId: 4, status: 'pending', amountCents: 45000, createdAt: '2026-10-22T11:50:00.000Z' },
        { washId: 5, status: 'refunded', amountCents: 35000, refundReason: 'Reclamação' },
      ],
      now: NOW,
    });
    assert.deepEqual(issues.map((i) => [i.code, i.washId]), [
      ['delivered_unpaid', 1],
      ['stale_pending_payment', 3],
      ['refund', 5],
    ]);
  });

  it('o fecho calcula a diferença e exige nota quando ela existe', () => {
    assert.equal(planClosing({ operator: 'Bento', declaredCents: 60000, countedCents: 60000 }).differenceCents, 0);
    assert.throws(() => planClosing({ operator: 'Bento', declaredCents: 60000, countedCents: 55000 }), ValidationError);
    const short = planClosing({ operator: 'Bento', declaredCents: 60000, countedCents: 55000, note: 'Troco dado a mais' });
    assert.deepEqual([short.differenceCents, short.note], [-5000, 'Troco dado a mais']);
  });

  it('um dia fecha uma vez por operador', () => {
    assert.throws(() => planClosing({ operator: 'Bento', declaredCents: 0, countedCents: 0, alreadyClosed: true }), { code: 'ALREADY_CLOSED' });
  });

  it('só aceita tipos de inconsistência conhecidos', () => {
    assert.throws(() => parseIssueCode('outro'), ValidationError);
  });
});
