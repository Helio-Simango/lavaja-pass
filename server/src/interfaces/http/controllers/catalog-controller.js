import { ValidationError } from '../../../domain/errors.js';
import { presentPlan, presentVehicleClass } from '../presenters.js';
import {
  actorOf,
  bodyOf,
  optionalBoolean,
  optionalInteger,
  optionalQuery,
  optionalText,
  parseId,
  parseInteger,
} from '../request.js';

const MAX_PRICE_CENTS = 100_000_000;

export function createCatalogController({ catalogService }) {
  return {
    listClasses(req, res) {
      res.json({ classes: catalogService.listClasses().map(presentVehicleClass) });
    },

    listPlans(req, res) {
      const plans = catalogService.listPlans({ classRef: optionalQuery(req, 'classId') });
      res.json({ plans: plans.map(presentPlan) });
    },

    updatePlan(req, res) {
      const patch = parsePlanPatch(bodyOf(req));
      const plan = catalogService.updatePlan(parseId(req.params.id), patch, actorOf(req, 'gestor'));
      res.json({ plan: presentPlan(plan) });
    },

    setPrice(req, res) {
      const priceCents = parseInteger(bodyOf(req).priceCents, 'priceCents', { min: 0, max: MAX_PRICE_CENTS });
      const plan = catalogService.setPrice(parseId(req.params.id), req.params.classId, priceCents, actorOf(req, 'gestor'));
      res.json({ plan: presentPlan(plan) });
    },
  };
}

function parsePlanPatch(body) {
  const name = optionalText(body.name, 'name', { max: 60 });
  if (name === null) throw new ValidationError('"name" não pode ficar vazio.', { field: 'name' });
  const patch = {
    name,
    description: optionalText(body.description, 'description', { max: 200 }),
    baseDurationMin: optionalInteger(body.baseDurationMin, 'baseDurationMin', { min: 5, max: 600 }),
    active: optionalBoolean(body.active, 'active'),
  };
  if (Object.values(patch).every((value) => value === undefined)) {
    throw new ValidationError('Nada para alterar: use name, description, baseDurationMin ou active.');
  }
  return patch;
}
