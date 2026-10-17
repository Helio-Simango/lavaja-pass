import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import {
  assertBenefitAvailable,
  benefitValueCents,
  classProgress,
  isEligibleForProgress,
  levelOf,
  parseLoyaltyRules,
  planEarn,
  planRevert,
} from '../../src/domain/loyalty.js';

const NOW = '2026-10-22T10:00:00.000Z';
const CLASS_A = 1;
const CLASS_B = 2;

const rules = (overrides = {}) =>
  parseLoyaltyRules({
    cycleSize: 10,
    levels: [{ benefitsPerCycle: 1 }, { benefitsPerCycle: 2 }, { benefitsPerCycle: 3 }],
    maxActiveLevel: 3,
    levelUp: { mode: 'cycles', cyclesPerLevel: 1 },
    levelScope: 'class',
    benefit: { type: 'free_wash', planCode: 'SIMPLES' },
    ...overrides,
  });

const earn = (count, classId = CLASS_A, createdAt = NOW) =>
  Array.from({ length: count }, () => ({ type: 'earn', classId, washesDelta: 1, benefitsDelta: 0, createdAt }));
const grant = (benefits, classId = CLASS_A) => ({ type: 'grant', classId, washesDelta: 0, benefitsDelta: benefits, createdAt: NOW });
const redeem = (classId = CLASS_A) => ({ type: 'redeem', classId, washesDelta: 0, benefitsDelta: -1, createdAt: NOW });

describe('regras de fidelização', () => {
  it('normaliza os parâmetros e aplica os valores por omissão', () => {
    const parsed = rules();
    assert.equal(parsed.levels[2].level, 3);
    assert.equal(parsed.freeWashCountsTowardsProgress, false);
    assert.equal(parsed.stacksWithPromotions, false);
  });

  it('recusa parâmetros inválidos', () => {
    const invalid = [
      { cycleSize: 0 },
      { levels: [] },
      { levels: [{ benefitsPerCycle: 11 }] },
      { maxActiveLevel: 4 },
      { levelUp: { mode: 'magia' } },
      { levelUp: { mode: 'cycles' } },
      { levelUp: { mode: 'period', thresholds: [5] } },
      { levelScope: 'loja' },
      { benefit: { type: 'free_wash' } },
      { benefit: { type: 'credit', creditCapCents: { A: 25000 } } },
      { freeWashCountsTowardsProgress: 'sim' },
    ];
    for (const overrides of invalid) assert.throws(() => rules(overrides), ValidationError, JSON.stringify(overrides));
  });

  it('aceita o crédito com limite por classe (D-02)', () => {
    const parsed = rules({ benefit: { type: 'credit', creditCapCents: { A: 25000, B: 35000, C: 45000 } } });
    assert.deepEqual(parsed.benefit.creditCapCents, { A: 25000, B: 35000, C: 45000 });
  });
});

describe('níveis (alternativas da D-01)', () => {
  const level = (overrides, movements, classId = CLASS_A) => levelOf(rules(overrides), movements, { classId, now: NOW });

  it('A · literal: 10 ciclos (100 lavagens) por nível', () => {
    assert.equal(level({ levelUp: { mode: 'literal' } }, earn(99)), 1);
    assert.equal(level({ levelUp: { mode: 'literal' } }, earn(100)), 2);
  });

  it('B/C · N ciclos por nível', () => {
    assert.equal(level({}, earn(9)), 1);
    assert.equal(level({}, earn(10)), 2);
    assert.equal(level({ levelUp: { mode: 'cycles', cyclesPerLevel: 3 } }, earn(29)), 1);
    assert.equal(level({ levelUp: { mode: 'cycles', cyclesPerLevel: 3 } }, earn(30)), 2);
  });

  it('D · frequência num período móvel', () => {
    const period = { levelUp: { mode: 'period', periodDays: 30, thresholds: [4, 8] } };
    const old = earn(10, CLASS_A, '2026-08-01T10:00:00.000Z');
    assert.equal(level(period, [...old, ...earn(3)]), 1);
    assert.equal(level(period, [...old, ...earn(4)]), 2);
    assert.equal(level(period, earn(8)), 3);
  });

  it('nunca passa do nível máximo activo', () => {
    assert.equal(level({ maxActiveLevel: 2 }, earn(50)), 2);
  });

  it('o nível pode ser por classe ou por cliente (D-04)', () => {
    const movements = [...earn(6, CLASS_A), ...earn(6, CLASS_B)];
    assert.equal(level({ levelScope: 'class' }, movements), 1);
    assert.equal(level({ levelScope: 'customer' }, movements), 2);
  });
});

describe('progresso por classe', () => {
  it('resulta dos movimentos e é separado por classe', () => {
    const movements = [...earn(12, CLASS_A), grant(1, CLASS_A), redeem(CLASS_A), ...earn(3, CLASS_B)];
    const a = classProgress(rules(), movements, { classId: CLASS_A, now: NOW });
    assert.deepEqual(
      [a.eligibleWashes, a.progressInCycle, a.completedCycles, a.level, a.benefitsPerCycle, a.benefitsAvailable],
      [12, 2, 1, 2, 2, 0],
    );
    const b = classProgress(rules(), movements, { classId: CLASS_B, now: NOW });
    assert.deepEqual([b.eligibleWashes, b.benefitsAvailable], [3, 0]);
  });
});

describe('elegibilidade (DEC-06)', () => {
  const completed = (overrides) => ({ status: 'completed', completedUnpaid: false, loyaltyBenefitCents: 0, finalPriceCents: 45000, ...overrides });

  it('só conta concluída e paga (confirmado ou declarado)', () => {
    assert.equal(isEligibleForProgress(completed(), { hasEffectivePayment: true, rules: rules() }), true);
    assert.equal(isEligibleForProgress(completed(), { hasEffectivePayment: false, rules: rules() }), false);
    assert.equal(isEligibleForProgress(completed({ status: 'ready' }), { hasEffectivePayment: true, rules: rules() }), false);
    assert.equal(isEligibleForProgress(completed({ completedUnpaid: true }), { hasEffectivePayment: true, rules: rules() }), false);
  });

  it('um serviço gratuito só conta se as regras o permitirem (D-03)', () => {
    const free = completed({ loyaltyBenefitCents: 45000, finalPriceCents: 0 });
    assert.equal(isEligibleForProgress(free, { hasEffectivePayment: false, rules: rules() }), false);
    assert.equal(
      isEligibleForProgress(free, { hasEffectivePayment: false, rules: rules({ freeWashCountsTowardsProgress: true }) }),
      true,
    );
  });
});

describe('ganhar progresso', () => {
  const wash = { id: 7, classId: CLASS_A };

  it('soma uma lavagem com referência única por serviço', () => {
    assert.deepEqual(planEarn(rules(), earn(3), { wash, now: NOW }), [
      { type: 'earn', washesDelta: 1, benefitsDelta: 0, reference: 'earn:wash:7' },
    ]);
  });

  it('ao fechar um ciclo atribui os benefícios do nível em que estava', () => {
    const [, firstCycle] = planEarn(rules(), earn(9), { wash, now: NOW });
    assert.deepEqual([firstCycle.type, firstCycle.benefitsDelta, firstCycle.details.level], ['grant', 1, 1]);
    const [, secondCycle] = planEarn(rules(), earn(19), { wash, now: NOW });
    assert.deepEqual([secondCycle.benefitsDelta, secondCycle.details.level], [2, 2]);
  });
});

describe('usar benefícios', () => {
  it('a lavagem gratuita vale o plano de referência e nunca mais do que o serviço', () => {
    const value = (basePriceCents) => benefitValueCents(rules(), { classCode: 'B', basePriceCents, referencePriceCents: 35000 });
    assert.equal(value(60000), 35000); // escolheu a Completa: paga a diferença
    assert.equal(value(20000), 20000);
  });

  it('o crédito vale até ao limite da classe', () => {
    const credit = rules({ benefit: { type: 'credit', creditCapCents: { A: 25000, B: 0, C: 45000 } } });
    assert.equal(benefitValueCents(credit, { classCode: 'A', basePriceCents: 45000 }), 25000);
    assert.throws(() => benefitValueCents(credit, { classCode: 'B', basePriceCents: 45000 }), { code: 'BENEFIT_NOT_APPLICABLE' });
  });

  it('exige saldo na classe', () => {
    assert.throws(() => assertBenefitAvailable({ benefitsAvailable: 0 }), { code: 'NO_BENEFIT_AVAILABLE' });
    assertBenefitAvailable({ benefitsAvailable: 1 });
  });
});

describe('reverter por reembolso (cap. 11.6)', () => {
  const wash = { id: 7, classId: CLASS_A };

  it('reverte a lavagem a meio de um ciclo', () => {
    assert.deepEqual(planRevert(rules(), earn(4), { wash }), {
      type: 'revert',
      washesDelta: -1,
      benefitsDelta: 0,
      reference: 'revert:wash:7',
    });
  });

  it('se fechou um ciclo ainda por usar, retira também o benefício', () => {
    const revert = planRevert(rules(), [...earn(10), grant(1)], { wash });
    assert.deepEqual([revert.type, revert.washesDelta, revert.benefitsDelta], ['revert', -1, -1]);
  });

  it('se o benefício já foi usado, regista só uma reversão não aplicada (saldo nunca negativo)', () => {
    const revert = planRevert(rules(), [...earn(10), grant(1), redeem()], { wash });
    assert.deepEqual([revert.type, revert.washesDelta, revert.benefitsDelta], ['revert_not_applied', 0, 0]);
  });
});
