import { ACTIVE_WASH_STATUSES, parseWashStatus } from '../../../domain/wash.js';
import { presentStation, presentWash, presentWashEvent } from '../presenters.js';
import { actorOf, bodyOf, optionalBoolean, optionalId, optionalQuery, parseId, parseIsoDate } from '../request.js';

export function createWashController({ washService, stationService, clock }) {
  return {
    /** Filtros: ?active=true · ?status=queued,ready · ?date=AAAA-MM-DD */
    list(req, res) {
      const washes = washService.list({
        statuses: parseStatusFilter(req),
        date: parseIsoDate(optionalQuery(req, 'date')),
      });
      res.json({ washes: washes.map(presentWash), generatedAt: clock.nowIso() });
    },

    get(req, res) {
      const id = parseId(req.params.id);
      res.json({ wash: presentWash(washService.get(id)), events: washService.history(id).map(presentWashEvent) });
    },

    register(req, res) {
      const body = bodyOf(req);
      const wash = washService.register({
        vehicleId: parseId(body.vehicleId, 'vehicleId'),
        planId: parseId(body.planId, 'planId'),
        source: body.source,
        actor: actorOf(req, 'operador'),
      });
      res.status(201).json({ wash: presentWash(wash) });
    },

    transition(req, res) {
      const body = bodyOf(req);
      const { wash, changed } = washService.transition(parseId(req.params.id), {
        to: body.to,
        stationId: optionalId(body.stationId, 'stationId'),
        reason: body.reason,
        allowUnpaid: optionalBoolean(body.allowUnpaid, 'allowUnpaid'),
        actor: actorOf(req, 'operador'),
      });
      res.json({ wash: presentWash(wash), changed });
    },

    listStations(req, res) {
      res.json({ stations: stationService.list().map(presentStation) });
    },
  };
}

function parseStatusFilter(req) {
  if (optionalQuery(req, 'active') === 'true') return [...ACTIVE_WASH_STATUSES];
  const status = optionalQuery(req, 'status');
  return status ? status.split(',').map((value) => parseWashStatus(value)) : undefined;
}
