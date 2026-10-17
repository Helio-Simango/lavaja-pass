// Governação (I-9): consentimentos, registo de alterações, postos e fecho do dia.
import { ValidationError } from '../../../domain/errors.js';
import { presentChange, presentConsents, presentReconciliation, presentStation } from '../presenters.js';
import { actorOf, bodyOf, optionalId, optionalQuery, parseId, parseInteger } from '../request.js';

const CHANGE_LOG_LIMIT = 100;
const MAX_CENTS = 100_000_000;

export function createGovernanceController({ consentService, customerService, reconciliationService, stationService, changeLogService }) {
  return {
    consents(req, res) {
      const id = parseId(req.params.id);
      customerService.get(id);
      res.json({ consents: presentConsents(consentService.current(id)) });
    },

    /** Dar ou retirar um consentimento; fica no histórico (vale o último). */
    recordConsent(req, res) {
      const id = parseId(req.params.id);
      const body = bodyOf(req);
      if (typeof body.granted !== 'boolean') throw new ValidationError('"granted" deve ser true ou false.', { field: 'granted' });
      consentService.record(id, { type: body.type, granted: body.granted, source: actorOf(req, 'patio') });
      res.status(201).json({ consents: presentConsents(consentService.current(id)) });
    },

    changeLog(req, res) {
      const entries = changeLogService.recent({ entity: optionalQuery(req, 'entity'), limit: CHANGE_LOG_LIMIT });
      res.json({ changes: entries.map(presentChange) });
    },

    setStationActive(req, res) {
      const { active } = bodyOf(req);
      if (typeof active !== 'boolean') throw new ValidationError('"active" deve ser true ou false.', { field: 'active' });
      res.json({ station: presentStation(stationService.setActive(parseId(req.params.id), active, actorOf(req, 'gestor'))) });
    },

    reconciliation(req, res) {
      res.json(presentReconciliation(reconciliationService.day(optionalQuery(req, 'date'))));
    },

    closeCash(req, res) {
      const body = bodyOf(req);
      const day = reconciliationService.close({
        date: body.date,
        operator: typeof body.operator === 'string' ? body.operator.trim() : '',
        countedCents: parseInteger(body.countedCents, 'countedCents', { min: 0, max: MAX_CENTS }),
        note: body.note,
        actor: actorOf(req, 'gestor'),
      });
      res.status(201).json(presentReconciliation(day));
    },

    addCorrection(req, res) {
      const body = bodyOf(req);
      const day = reconciliationService.addCorrection({
        date: body.date,
        washId: optionalId(body.washId, 'washId'),
        issueCode: body.issueCode,
        note: body.note,
        actor: actorOf(req, 'gestor'),
      });
      res.status(201).json(presentReconciliation(day));
    },
  };
}
