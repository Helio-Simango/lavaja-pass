import { validationError } from '../lib/errors.js';
import { actorFrom, optionalBool, optionalString, parseId, requireBody, requireInt, requireString } from '../lib/validate.js';

export function createCatalogController({ catalog }) {
  return {
    listClasses(req, res) {
      res.json({ classes: catalog.listClasses() });
    },

    listPlans(req, res) {
      const classRef = req.query.classId === undefined ? undefined : String(req.query.classId);
      res.json({ plans: catalog.listPlans({ classRef }) });
    },

    updatePlan(req, res) {
      const body = requireBody(req);
      const patch = {
        name: body.name === undefined ? undefined : requireString(body.name, 'name', { max: 60 }),
        description: optionalString(body.description, 'description', { max: 200 }),
        baseDurationMin:
          body.baseDurationMin === undefined
            ? undefined
            : requireInt(body.baseDurationMin, 'baseDurationMin', { min: 5, max: 600 }),
        active: optionalBool(body.active, 'active'),
      };
      if (Object.values(patch).every((v) => v === undefined)) {
        throw validationError('Nada para alterar: use name, description, baseDurationMin ou active.');
      }
      res.json({ plan: catalog.updatePlan(parseId(req.params.id), patch, actorFrom(req, 'gestor')) });
    },

    setPrice(req, res) {
      const body = requireBody(req);
      const priceCents = requireInt(body.priceCents, 'priceCents', { min: 0, max: 100_000_000 });
      const plan = catalog.setPrice(parseId(req.params.id), req.params.classId, priceCents, actorFrom(req, 'gestor'));
      res.json({ plan });
    },
  };
}
