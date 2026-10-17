import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccessDeniedError, ValidationError } from '../../src/domain/errors.js';
import { dataQuality } from '../../src/domain/indicators.js';
import {
  assertCanAccess,
  authorizationStatus,
  authorizedPeriod,
  newAuthorization,
  parseAuthorizationRequest,
  planRevoke,
} from '../../src/domain/sharing.js';

const NOW = '2026-10-22T08:00:00.000Z';
const request = (overrides = {}) => ({
  purpose: 'Análise de oportunidade de financiamento',
  sections: ['receipts', 'activity'],
  dataMonths: 6,
  validDays: 30,
  confirmed: true,
  ...overrides,
});
const authorization = (overrides = {}) => ({
  ...newAuthorization(parseAuthorizationRequest(request()), { institution: { id: 1 }, sequence: 3, actor: 'Gestor', now: NOW }),
  revokedAt: null,
  ...overrides,
});

describe('autorização de partilha (cap. 9.1)', () => {
  it('normaliza o pedido e ordena o âmbito', () => {
    const parsed = parseAuthorizationRequest(request());
    assert.deepEqual(parsed.sections, ['activity', 'receipts']);
  });

  it('exige finalidade, âmbito, período, validade e confirmação explícita', () => {
    const invalid = [
      { purpose: 'curta' },
      { sections: [] },
      { sections: ['dados_pessoais'] },
      { dataMonths: 0 },
      { dataMonths: 25 },
      { validDays: 0 },
      { confirmed: 'sim' },
    ];
    for (const overrides of invalid) assert.throws(() => parseAuthorizationRequest(request(overrides)), ValidationError, JSON.stringify(overrides));
  });

  it('tem referência e validade', () => {
    const created = authorization();
    assert.equal(created.reference, 'AUT-003');
    assert.equal(created.validUntil, '2026-11-21T08:00:00.000Z');
  });

  it('o estado é activa, revogada ou expirada', () => {
    assert.equal(authorizationStatus(authorization(), NOW), 'active');
    assert.equal(authorizationStatus(authorization({ revokedAt: NOW }), NOW), 'revoked');
    assert.equal(authorizationStatus(authorization(), '2026-12-01T00:00:00.000Z'), 'expired');
  });

  it('só a instituição autorizada acede, enquanto a autorização estiver activa', () => {
    assertCanAccess(authorization(), 1, NOW);
    assert.throws(() => assertCanAccess(authorization(), 2, NOW), { code: 'AUTHORIZATION_OTHER_INSTITUTION' });
    assert.throws(() => assertCanAccess(authorization({ revokedAt: NOW }), 1, NOW), AccessDeniedError);
    assert.throws(() => assertCanAccess(authorization(), 1, '2026-12-01T00:00:00.000Z'), { code: 'AUTHORIZATION_EXPIRED' });
  });

  it('o período de dados conta a partir de agora', () => {
    assert.equal(authorizedPeriod(authorization({ dataMonths: 1 }), NOW).from, '2026-09-22T08:00:00.000Z');
  });

  it('revogar é final e repetir não tem efeitos', () => {
    const decision = planRevoke(authorization(), { reason: ' Já não ', actor: 'Gestor', now: NOW });
    assert.deepEqual(decision.changes, { revokedAt: NOW, revokedBy: 'Gestor', revokeReason: 'Já não' });
    assert.deepEqual(planRevoke(authorization({ revokedAt: NOW }), { now: NOW }), { changed: false });
  });
});

describe('qualidade dos dados (cap. 9.4)', () => {
  const period = { from: '2026-10-19T00:00:00.000Z', to: '2026-10-22T08:00:00.000Z' };
  const wash = (id, overrides) => ({
    id,
    status: 'completed',
    queuedAt: '2026-10-20T08:00:00.000Z',
    completedAt: '2026-10-20T09:00:00.000Z',
    finalPriceCents: 25000,
    completedUnpaid: false,
    ...overrides,
  });
  const quality = dataQuality({
    washes: [wash(1), wash(2, { completedUnpaid: true }), wash(3, { status: 'cancelled', completedAt: null })],
    payments: [
      { washId: 1, status: 'confirmed', amountCents: 30000, confirmedAt: '2026-10-20T09:00:00.000Z' },
      { washId: 9, status: 'declared', amountCents: 10000, declaredAt: '2026-10-21T09:00:00.000Z' },
    ],
    period,
    firstWashAt: '2026-10-01T08:00:00.000Z',
    openWeekdays: [1, 2, 3, 4, 5, 6],
    timeZone: 'Africa/Maputo',
    corrections: 2,
  });

  it('calcula cada indicador descritivo', () => {
    assert.equal(quality.historyAgeDays, 21);
    assert.equal(quality.daysWithRecords.days, 1);
    assert.equal(quality.daysWithRecords.operatingDays, 4); // segunda 19/10 a quinta 22/10
    assert.deepEqual([quality.completedWithPayment.count, quality.completedWithPayment.of], [1, 2]);
    assert.equal(quality.digitalShare, 0.75);
    assert.equal(quality.deliveredUnpaid.count, 1);
    assert.equal(quality.cancellationsAndRefunds.cancelled, 1);
    assert.equal(quality.corrections, 2);
  });
});
