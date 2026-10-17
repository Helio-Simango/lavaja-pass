import { validationError } from '../lib/errors.js';
import { actorFrom, optionalBool, optionalId, parseId, requireBody } from '../lib/validate.js';
import { ACTIVE_STATUSES, WASH_STATUSES } from '../services/washes.js';

export function createWashesController({ washes, stations }) {
  return {
    // ?status=queued,ready · ?active=true · ?date=AAAA-MM-DD
    list(req, res) {
      let statuses;
      if (req.query.active === 'true') statuses = ACTIVE_STATUSES;
      else if (req.query.status) {
        statuses = String(req.query.status).split(',');
        const invalid = statuses.filter((s) => !WASH_STATUSES.includes(s));
        if (invalid.length) throw validationError(`Estado desconhecido: ${invalid.join(', ')}.`, { field: 'status' });
      }
      const date = req.query.date === undefined ? undefined : String(req.query.date);
      if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw validationError('"date" deve estar no formato AAAA-MM-DD.', { field: 'date' });
      }
      res.json({ washes: washes.list({ statuses, date }), generatedAt: new Date().toISOString() });
    },

    get(req, res) {
      const id = parseId(req.params.id);
      res.json({ wash: washes.get(id), events: washes.events(id) });
    },

    create(req, res) {
      const body = requireBody(req);
      const wash = washes.create({
        vehicleId: parseId(body.vehicleId, 'vehicleId'),
        planId: parseId(body.planId, 'planId'),
        source: body.source,
        actor: actorFrom(req, 'operador'),
      });
      res.status(201).json({ wash });
    },

    transition(req, res) {
      const body = requireBody(req);
      const { wash, changed } = washes.transition(parseId(req.params.id), {
        to: body.to,
        stationId: optionalId(body.stationId, 'stationId'),
        reason: body.reason,
        allowUnpaid: optionalBool(body.allowUnpaid, 'allowUnpaid'),
        actor: actorFrom(req, 'operador'),
      });
      res.json({ wash, changed });
    },

    listStations(req, res) {
      res.json({ stations: stations.list() });
    },
  };
}
