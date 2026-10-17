// Vertente Lavadora–Banco (I-7). Sem autenticação no protótipo (D-16): demonstração com aviso.
import { AccessAction } from '../../../application/bank-report-service.js';
import {
  activityReportToCsv,
  presentAccessLog,
  presentActivityReport,
  presentAuthorization,
} from '../presenters.js';
import { actorOf, bodyOf, optionalId, optionalQuery, parseId } from '../request.js';

export function createBankController({ sharingService, bankReportService }) {
  return {
    listInstitutions(req, res) {
      res.json({ institutions: sharingService.listInstitutions() });
    },

    listAuthorizations(req, res) {
      res.json({ authorizations: sharingService.listAuthorizations().map(presentAuthorization) });
    },

    /** A lavadora autoriza (M15). */
    grant(req, res) {
      const body = bodyOf(req);
      const authorization = sharingService.grant(
        {
          institutionId: parseId(body.institutionId, 'institutionId'),
          purpose: body.purpose,
          sections: body.sections,
          dataMonths: body.dataMonths,
          validDays: body.validDays,
          confirmed: body.confirm,
        },
        actorOf(req, 'lavadora'),
      );
      res.status(201).json({ authorization: presentAuthorization(authorization) });
    },

    revoke(req, res) {
      const { authorization, changed } = sharingService.revoke(parseId(req.params.id), {
        reason: bodyOf(req).reason,
        actor: actorOf(req, 'lavadora'),
      });
      res.json({ authorization: presentAuthorization(authorization), changed });
    },

    accessLogs(req, res) {
      const authorizationId = optionalId(optionalQuery(req, 'authorizationId'), 'authorizationId');
      res.json({ accessLogs: sharingService.accessLogs({ authorizationId }).map(presentAccessLog) });
    },

    /** O analista consulta (M16); ?format=csv exporta. Ambos ficam registados. */
    activityReport(req, res) {
      const exporting = optionalQuery(req, 'format') === 'csv';
      const report = presentActivityReport(
        bankReportService.activityReport({
          institutionId: parseId(req.params.id),
          authorizationId: parseId(optionalQuery(req, 'authorizationId'), 'authorizationId'),
          actor: actorOf(req, 'analista.demo'),
          action: exporting ? AccessAction.EXPORT : AccessAction.VIEW,
        }),
      );
      if (!exporting) return res.json({ report });
      res
        .type('text/csv; charset=utf-8')
        .attachment(`relatorio-${report.authorization.reference}.csv`)
        .send(`﻿${activityReportToCsv(report)}`);
    },
  };
}
