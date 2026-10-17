// Programa de fidelização (cap. 11). Uma conta por cliente, progresso por classe.
// Tudo o que é pendente (D-01 a D-07) é um parâmetro das regras; nada fica fixo aqui.
// O progresso mostrado resulta sempre dos movimentos do livro.
import { ConflictError, ValidationError } from './errors.js';
import { WashStatus } from './wash.js';

export const LevelUpMode = Object.freeze({
  LITERAL: 'literal', // D-01 A: 10 ciclos completos por nível
  CYCLES: 'cycles', // D-01 B/C: N ciclos por nível (N = 1 equivale a B)
  PERIOD: 'period', // D-01 D: lavagens num período móvel
});

export const LevelScope = Object.freeze({ CLASS: 'class', CUSTOMER: 'customer' }); // D-04
export const BenefitType = Object.freeze({ FREE_WASH: 'free_wash', CREDIT: 'credit' }); // D-02

export const MovementType = Object.freeze({
  EARN: 'earn',
  GRANT: 'grant',
  REDEEM: 'redeem',
  RESTORE: 'restore',
  REVERT: 'revert',
  REVERT_NOT_APPLIED: 'revert_not_applied',
});

const LITERAL_CYCLES_PER_LEVEL = 10;
const MAX_LEVELS = 5;
const DAY_MS = 86_400_000;

// ---------- Regras ----------

/** Valida e normaliza os parâmetros do programa. */
export function parseLoyaltyRules(input) {
  const rules = input && typeof input === 'object' ? input : {};
  const cycleSize = integer(rules.cycleSize, 'cycleSize', 1, 100);
  const levels = parseLevels(rules.levels, cycleSize);
  return {
    cycleSize,
    levels,
    maxActiveLevel: integer(rules.maxActiveLevel ?? levels.length, 'maxActiveLevel', 1, levels.length),
    levelUp: parseLevelUp(rules.levelUp),
    levelScope: oneOf(rules.levelScope ?? LevelScope.CLASS, 'levelScope', Object.values(LevelScope)),
    benefit: parseBenefit(rules.benefit),
    freeWashCountsTowardsProgress: boolean(rules.freeWashCountsTowardsProgress ?? false, 'freeWashCountsTowardsProgress'),
    stacksWithPromotions: boolean(rules.stacksWithPromotions ?? false, 'stacksWithPromotions'),
  };
}

function parseLevels(levels, cycleSize) {
  if (!Array.isArray(levels) || levels.length === 0 || levels.length > MAX_LEVELS) {
    throw new ValidationError(`"levels" deve ter entre 1 e ${MAX_LEVELS} níveis.`, { field: 'levels' });
  }
  return levels.map((level, index) => ({
    level: index + 1,
    benefitsPerCycle: integer(level?.benefitsPerCycle, `levels[${index}].benefitsPerCycle`, 0, cycleSize),
  }));
}

function parseLevelUp(levelUp = {}) {
  const mode = oneOf(levelUp.mode, 'levelUp.mode', Object.values(LevelUpMode));
  if (mode === LevelUpMode.CYCLES) {
    return { mode, cyclesPerLevel: integer(levelUp.cyclesPerLevel, 'levelUp.cyclesPerLevel', 1, 100) };
  }
  if (mode === LevelUpMode.PERIOD) {
    const thresholds = Array.isArray(levelUp.thresholds) ? levelUp.thresholds : [];
    return {
      mode,
      periodDays: integer(levelUp.periodDays, 'levelUp.periodDays', 1, 730),
      thresholds: thresholds.map((value, index) => integer(value, `levelUp.thresholds[${index}]`, 1, 10_000)),
    };
  }
  return { mode };
}

function parseBenefit(benefit = {}) {
  const type = oneOf(benefit.type, 'benefit.type', Object.values(BenefitType));
  if (type === BenefitType.FREE_WASH) {
    const planCode = typeof benefit.planCode === 'string' ? benefit.planCode.trim() : '';
    if (!planCode) throw new ValidationError('Indique o plano da lavagem gratuita ("benefit.planCode").', { field: 'benefit.planCode' });
    return { type, planCode };
  }
  const caps = benefit.creditCapCents ?? {};
  return {
    type,
    creditCapCents: Object.fromEntries(
      ['A', 'B', 'C'].map((code) => [code, integer(caps[code], `benefit.creditCapCents.${code}`, 0, 100_000_000)]),
    ),
  };
}

// ---------- Cartão (progresso por classe) ----------

/** @param movements [{ classId, washesDelta, benefitsDelta, createdAt }] da conta */
export function levelOf(rules, movements, { classId, now }) {
  const relevant = rules.levelScope === LevelScope.CLASS ? movements.filter((m) => m.classId === classId) : movements;
  const completedCycles = Math.floor(sum(relevant, 'washesDelta') / rules.cycleSize);
  let level;
  switch (rules.levelUp.mode) {
    case LevelUpMode.LITERAL:
      level = 1 + Math.floor(completedCycles / LITERAL_CYCLES_PER_LEVEL);
      break;
    case LevelUpMode.CYCLES:
      level = 1 + Math.floor(completedCycles / rules.levelUp.cyclesPerLevel);
      break;
    case LevelUpMode.PERIOD: {
      const since = Date.parse(now) - rules.levelUp.periodDays * DAY_MS;
      const recent = sum(relevant.filter((m) => Date.parse(m.createdAt) >= since), 'washesDelta');
      level = 1 + rules.levelUp.thresholds.filter((threshold) => recent >= threshold).length;
      break;
    }
  }
  return Math.min(level, rules.maxActiveLevel);
}

export function classProgress(rules, movements, { classId, now }) {
  const ofClass = movements.filter((m) => m.classId === classId);
  const eligibleWashes = sum(ofClass, 'washesDelta');
  const level = levelOf(rules, movements, { classId, now });
  return {
    eligibleWashes,
    cycleSize: rules.cycleSize,
    progressInCycle: eligibleWashes % rules.cycleSize,
    completedCycles: Math.floor(eligibleWashes / rules.cycleSize),
    level,
    benefitsPerCycle: rules.levels[level - 1].benefitsPerCycle,
    benefitsAvailable: sum(ofClass, 'benefitsDelta'),
  };
}

// ---------- Ganhar progresso ----------

/**
 * Uma lavagem só conta se estiver concluída e com pagamento confirmado ou declarado (DEC-06).
 * Um serviço que usou benefício só conta se as regras o permitirem (D-03).
 */
export function isEligibleForProgress(wash, { hasEffectivePayment, rules }) {
  if (wash.status !== WashStatus.COMPLETED || wash.completedUnpaid) return false;
  const usedBenefit = wash.loyaltyBenefitCents > 0;
  if (usedBenefit && !rules.freeWashCountsTowardsProgress) return false;
  return hasEffectivePayment || (usedBenefit && wash.finalPriceCents === 0);
}

/** Movimentos a registar por uma lavagem elegível: +1 lavagem e, se fechar um ciclo, os benefícios do nível. */
export function planEarn(rules, movements, { wash, now }) {
  const before = classProgress(rules, movements, { classId: wash.classId, now });
  const plan = [{ type: MovementType.EARN, washesDelta: 1, benefitsDelta: 0, reference: `earn:wash:${wash.id}` }];
  const closesCycle = (before.eligibleWashes + 1) % rules.cycleSize === 0;
  if (closesCycle && before.benefitsPerCycle > 0) {
    plan.push({
      type: MovementType.GRANT,
      washesDelta: 0,
      benefitsDelta: before.benefitsPerCycle,
      reference: `grant:wash:${wash.id}`,
      details: { level: before.level, cycle: (before.eligibleWashes + 1) / rules.cycleSize },
    });
  }
  return plan;
}

// ---------- Usar e devolver benefícios ----------

/**
 * Valor do benefício num serviço: uma lavagem gratuita vale o preço do plano de referência na classe;
 * um crédito vale até ao limite da classe. Nunca ultrapassa o valor do serviço.
 */
export function benefitValueCents(rules, { classCode, basePriceCents, discountCents = 0, referencePriceCents }) {
  const cap = rules.benefit.type === BenefitType.FREE_WASH ? referencePriceCents : rules.benefit.creditCapCents[classCode];
  if (!cap) {
    throw new ConflictError('BENEFIT_NOT_APPLICABLE', 'O benefício de fidelização não se aplica a esta classe.', { classCode });
  }
  return Math.min(cap, basePriceCents - discountCents);
}

/** Um benefício de uma classe não pode ser usado noutra classe: o saldo é por classe. */
export function assertBenefitAvailable(progress) {
  if (progress.benefitsAvailable < 1) {
    throw new ConflictError('NO_BENEFIT_AVAILABLE', 'O cliente não tem benefícios disponíveis nesta classe.');
  }
}

export function planRedeem(wash, benefitCents) {
  return {
    type: MovementType.REDEEM,
    washesDelta: 0,
    benefitsDelta: -1,
    benefitValueCents: benefitCents,
    reference: `redeem:wash:${wash.id}`,
  };
}

/** Cancelar um serviço que usou benefício devolve-o (cap. 11.6). */
export function planRestore(wash) {
  return { type: MovementType.RESTORE, washesDelta: 0, benefitsDelta: 1, reference: `restore:wash:${wash.id}` };
}

/**
 * Reembolso de uma lavagem que contou para o progresso (cap. 11.6): reverte o progresso se ainda existir.
 * Se fechou um ciclo cujos benefícios já foram usados, regista só uma "reversão não aplicada".
 * @param movements movimentos da conta (todas as classes)
 */
export function planRevert(rules, movements, { wash }) {
  const ofClass = movements.filter((m) => m.classId === wash.classId);
  const eligibleWashes = sum(ofClass, 'washesDelta');
  const benefitsAvailable = sum(ofClass, 'benefitsDelta');
  const reference = `revert:wash:${wash.id}`;

  if (eligibleWashes % rules.cycleSize !== 0) {
    return { type: MovementType.REVERT, washesDelta: -1, benefitsDelta: 0, reference };
  }
  const lastGrant = ofClass.findLast((m) => m.type === MovementType.GRANT);
  const grantedBenefits = lastGrant?.benefitsDelta ?? 0;
  if (benefitsAvailable >= grantedBenefits) {
    return { type: MovementType.REVERT, washesDelta: -1, benefitsDelta: -grantedBenefits, reference };
  }
  return {
    type: MovementType.REVERT_NOT_APPLIED,
    washesDelta: 0,
    benefitsDelta: 0,
    reference,
    details: { reason: 'O benefício do ciclo já foi usado; o saldo nunca fica negativo.' },
  };
}

// ---------- Auxiliares ----------

function sum(movements, field) {
  return movements.reduce((total, movement) => total + movement[field], 0);
}

function integer(value, field, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`"${field}" deve ser um inteiro entre ${min} e ${max}.`, { field });
  }
  return value;
}

function boolean(value, field) {
  if (typeof value !== 'boolean') throw new ValidationError(`"${field}" deve ser true ou false.`, { field });
  return value;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`"${field}" deve ser um de: ${allowed.join(', ')}.`, { field });
  }
  return value;
}
