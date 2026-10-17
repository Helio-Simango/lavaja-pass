import { presentLoyaltyCard, presentLoyaltyMovement, presentLoyaltyRules } from '../presenters.js';
import { actorOf, bodyOf, parseId } from '../request.js';

export function createLoyaltyController({ loyaltyService, catalogService }) {
  const describe = (rules) => presentLoyaltyRules(rules, catalogService.listPlans());

  return {
    getRules(req, res) {
      res.json({ rules: describe(loyaltyService.rulesInForce()), versions: loyaltyService.listRuleVersions().map(describe) });
    },

    /** Publica uma nova versão das regras (gestor). Os parâmetros pendentes ficam marcados "por validar". */
    publishRules(req, res) {
      const body = bodyOf(req);
      const rules = loyaltyService.publishRules(body.params, { actor: actorOf(req, 'gestor'), toValidate: body.toValidate !== false });
      res.status(201).json({ rules: describe(rules) });
    },

    card(req, res) {
      const card = loyaltyService.card(parseId(req.params.id));
      res.json({ loyalty: presentLoyaltyCard(card, catalogService.listPlans()) });
    },

    movements(req, res) {
      res.json({ movements: loyaltyService.movements(parseId(req.params.id)).map(presentLoyaltyMovement) });
    },
  };
}
