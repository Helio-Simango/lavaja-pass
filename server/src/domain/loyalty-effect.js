// Efeito de cada serviço na fidelização, para o histórico por matrícula (M13).
import { MovementType } from './loyalty.js';

export const LoyaltyEffect = Object.freeze({
  COUNTED: 'counted',
  REVERTED: 'reverted',
  BENEFIT_USED: 'benefit_used',
  BENEFIT_RESTORED: 'benefit_restored',
  NOT_COUNTED: 'not_counted',
  NONE: 'none',
});

/** @param movements movimentos de fidelização deste serviço */
export function loyaltyEffectOf(wash, movements) {
  const types = new Set(movements.map((movement) => movement.type));
  if (types.has(MovementType.REDEEM)) {
    return types.has(MovementType.RESTORE) ? LoyaltyEffect.BENEFIT_RESTORED : LoyaltyEffect.BENEFIT_USED;
  }
  if (types.has(MovementType.EARN)) {
    return types.has(MovementType.REVERT) || types.has(MovementType.REVERT_NOT_APPLIED)
      ? LoyaltyEffect.REVERTED
      : LoyaltyEffect.COUNTED;
  }
  return wash.status === 'completed' ? LoyaltyEffect.NOT_COUNTED : LoyaltyEffect.NONE;
}
