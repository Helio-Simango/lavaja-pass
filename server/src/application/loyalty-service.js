// Fidelização (I-4). Os casos de uso de serviços e pagamentos chamam este serviço dentro da
// mesma unidade de trabalho: concluir, atribuir progresso e reembolsar acontecem juntos.
import { ConflictError, NotFoundError } from '../domain/errors.js';
import {
  assertBenefitAvailable,
  benefitValueCents,
  BenefitType,
  classProgress,
  isEligibleForProgress,
  parseLoyaltyRules,
  planEarn,
  planRedeem,
  planRestore,
  planRevert,
} from '../domain/loyalty.js';
import { findPriceForClass } from '../domain/plan.js';

export class LoyaltyService {
  #loyalty;
  #catalog;
  #customers;
  #changeLog;
  #consents;
  #unitOfWork;
  #clock;

  constructor({ loyaltyRepository, catalogRepository, customerRepository, changeLogRepository, consentRepository, unitOfWork, clock }) {
    this.#loyalty = loyaltyRepository;
    this.#catalog = catalogRepository;
    this.#customers = customerRepository;
    this.#changeLog = changeLogRepository;
    this.#consents = consentRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  // ---------- Regras ----------

  rulesInForce() {
    const rules = this.#loyalty.findRulesInForce(this.#clock.nowIso());
    if (!rules) throw new ConflictError('LOYALTY_RULES_MISSING', 'O programa de fidelização ainda não tem regras.');
    return rules;
  }

  listRuleVersions() {
    return this.#loyalty.listRuleVersions();
  }

  /** Publica uma nova versão das regras, em vigor a partir de agora. As versões anteriores não mudam. */
  publishRules(input, { actor, toValidate = true }) {
    return this.#unitOfWork.run(() => {
      const params = parseLoyaltyRules(input);
      const previous = this.#loyalty.findRulesInForce(this.#clock.nowIso());
      const now = this.#clock.nowIso();
      const version = this.#loyalty.insertRules({ params, effectiveFrom: now, toValidate, createdBy: actor }, now);
      this.#changeLog.append(
        { entity: 'loyalty_rules', entityId: version, field: 'params', oldValue: previous?.params ?? null, newValue: params, actor },
        now,
      );
      return this.rulesInForce();
    });
  }

  // ---------- Cartão do cliente ----------

  /** Um único cartão por cliente, com o progresso de cada classe. */
  card(customerId) {
    this.#assertCustomerExists(customerId);
    const rules = this.rulesInForce();
    const movements = this.#movementsOf(customerId);
    const now = this.#clock.nowIso();
    return {
      customerId,
      rules,
      consent: this.#consentOf(customerId),
      classes: this.#catalog.listClasses().map((vehicleClass) => ({
        classId: vehicleClass.id,
        classCode: vehicleClass.code,
        ...classProgress(rules.params, movements, { classId: vehicleClass.id, now }),
      })),
    };
  }

  movements(customerId) {
    this.#assertCustomerExists(customerId);
    return this.#movementsOf(customerId);
  }

  // ---------- Integração com serviços e pagamentos ----------

  /** Valor do benefício para um novo serviço; recusa se não houver saldo na classe da viatura. */
  benefitFor({ customerId, vehicle, priceCents }) {
    this.#assertConsent(customerId);
    const { params } = this.rulesInForce();
    const progress = classProgress(params, this.#movementsOf(customerId), {
      classId: vehicle.classId,
      now: this.#clock.nowIso(),
    });
    assertBenefitAvailable(progress);
    return benefitValueCents(params, {
      classCode: vehicle.classCode,
      basePriceCents: priceCents,
      referencePriceCents: this.#referencePrice(params, vehicle.classId),
    });
  }

  redeem(wash, actor) {
    this.#record(wash, planRedeem(wash, wash.loyaltyBenefitCents), actor);
  }

  /**
   * Atribui progresso a uma lavagem concluída, se for elegível e o cliente tiver consentido
   * (cap. 14.2). @returns movimentos registados
   */
  recordCompletion(wash, { hasEffectivePayment, actor }) {
    if (!this.#consentOf(wash.customerId).granted) return [];
    const rules = this.rulesInForce();
    if (!isEligibleForProgress(wash, { hasEffectivePayment, rules: rules.params })) return [];
    const plan = planEarn(rules.params, this.#movementsOf(wash.customerId), { wash, now: this.#clock.nowIso() });
    const recorded = [];
    for (const movement of plan) {
      if (this.#record(wash, movement, actor, rules.version)) recorded.push(movement);
    }
    return recorded;
  }

  restoreForCancellation(wash, actor) {
    if (wash.loyaltyBenefitCents > 0 && this.#loyalty.hasReference(`redeem:wash:${wash.id}`)) {
      this.#record(wash, planRestore(wash), actor);
    }
  }

  revertForRefund(wash, actor) {
    if (!this.#loyalty.hasReference(`earn:wash:${wash.id}`)) return;
    const rules = this.rulesInForce();
    this.#record(wash, planRevert(rules.params, this.#movementsOf(wash.customerId), { wash }), actor, rules.version);
  }

  // ---------- Auxiliares ----------

  /** Grava o movimento uma única vez (referência única). @returns true se gravou */
  #record(wash, movement, actor, rulesVersion = this.rulesInForce().version) {
    if (this.#loyalty.hasReference(movement.reference)) return false;
    const now = this.#clock.nowIso();
    const accountId = this.#loyalty.findAccountId(wash.customerId) ?? this.#loyalty.createAccount(wash.customerId, now);
    this.#loyalty.insertMovement(accountId, { ...movement, classId: wash.classId, washId: wash.id, rulesVersion, actor }, now);
    return true;
  }

  /** Consentimento de fidelização em vigor (o último registado). Sem registo: não consentiu. */
  #consentOf(customerId) {
    const consent = this.#consents.currentFor(customerId).loyalty;
    return { granted: consent?.granted === true, at: consent?.at ?? null, source: consent?.source ?? null };
  }

  #assertConsent(customerId) {
    if (!this.#consentOf(customerId).granted) {
      throw new ConflictError('NO_LOYALTY_CONSENT', 'O cliente não deu consentimento para o programa de fidelização.');
    }
  }

  #movementsOf(customerId) {
    const accountId = this.#loyalty.findAccountId(customerId);
    return accountId ? this.#loyalty.listMovements(accountId) : [];
  }

  #referencePrice(params, classId) {
    if (params.benefit.type !== BenefitType.FREE_WASH) return null;
    const plan = this.#catalog.listPlans().find((candidate) => candidate.code === params.benefit.planCode);
    return plan ? findPriceForClass(plan, classId)?.priceCents ?? null : null;
  }

  #assertCustomerExists(customerId) {
    if (!this.#customers.findById(customerId)) throw new NotFoundError('Cliente não encontrado.');
  }
}

