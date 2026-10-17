// Regra de aceitação de um serviço (cap. 10.2): o plano tem de estar activo
// e ter preço para a classe da viatura.
import { ConflictError } from './errors.js';

export const PlanUnavailability = Object.freeze({
  INACTIVE: 'PLAN_INACTIVE',
  NO_PRICE: 'PRICE_NOT_DEFINED',
});

export function findPriceForClass(plan, classId) {
  return plan.prices.find((price) => price.classId === classId) ?? null;
}

/** @returns {string | null} o motivo pelo qual o plano não está disponível para a classe. */
export function unavailabilityReason(plan, classId) {
  if (!plan.active) return PlanUnavailability.INACTIVE;
  if (!findPriceForClass(plan, classId)) return PlanUnavailability.NO_PRICE;
  return null;
}

export function requirePriceForClass(plan, classId) {
  const reason = unavailabilityReason(plan, classId);
  if (reason === PlanUnavailability.INACTIVE) {
    throw new ConflictError(reason, `O plano "${plan.name}" está indisponível.`, { planId: plan.id });
  }
  if (reason === PlanUnavailability.NO_PRICE) {
    throw new ConflictError(reason, `O plano "${plan.name}" não tem preço para esta classe.`, {
      planId: plan.id,
      classId,
    });
  }
  return findPriceForClass(plan, classId);
}
