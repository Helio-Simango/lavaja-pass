import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError } from '../../src/domain/errors.js';
import { PlanUnavailability, requirePriceForClass, unavailabilityReason } from '../../src/domain/plan.js';

const plan = (overrides = {}) => ({
  id: 1,
  name: 'Polimento',
  active: true,
  prices: [{ classId: 1, classCode: 'A', priceCents: 150000, currency: 'MZN' }],
  ...overrides,
});

describe('aceitação de um plano para uma classe', () => {
  it('aceita um plano activo com preço para a classe', () => {
    assert.equal(unavailabilityReason(plan(), 1), null);
    assert.equal(requirePriceForClass(plan(), 1).priceCents, 150000);
  });

  it('recusa um plano inactivo', () => {
    assert.equal(unavailabilityReason(plan({ active: false }), 1), PlanUnavailability.INACTIVE);
    assert.throws(() => requirePriceForClass(plan({ active: false }), 1), { name: 'ConflictError', code: 'PLAN_INACTIVE' });
  });

  it('recusa um plano sem preço para a classe', () => {
    assert.equal(unavailabilityReason(plan(), 3), PlanUnavailability.NO_PRICE);
    assert.throws(() => requirePriceForClass(plan(), 3), (error) => error instanceof ConflictError && error.code === 'PRICE_NOT_DEFINED');
  });

  it('um plano inactivo e sem preço indica primeiro a inactividade', () => {
    assert.equal(unavailabilityReason(plan({ active: false }), 3), PlanUnavailability.INACTIVE);
  });
});
