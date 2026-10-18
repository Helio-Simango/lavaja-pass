// Vertente Lavadora–Banco (I-7). A lavadora (gestor) autoriza; o analista só vê a sua instituição (I-11).
import { AccessAction } from '../../../application/bank-report-service.js';
import {
  activityReportToCsv,
  presentAccessLog,
  presentCreditRequest,
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

    /** Autorizações dadas à instituição do analista (nunca as de outras instituições). */
    analystAuthorizations(req, res) {
      const own = sharingService.listAuthorizations().filter((a) => a.institutionId === req.session.institutionId);
      res.json({ institution: { id: req.session.institutionId, name: req.session.institutionName }, authorizations: own.map(presentAuthorization) });
    },

    /** O analista consulta (M12/M16); ?format=csv exporta. Ambos ficam registados. A instituição vem da sessão. */
    activityReport(req, res) {
      const exporting = optionalQuery(req, 'format') === 'csv';
      const report = presentActivityReport(
        bankReportService.activityReport({
          institutionId: req.session.institutionId,
          authorizationId: parseId(optionalQuery(req, 'authorizationId'), 'authorizationId'),
          actor: actorOf(req),
          action: exporting ? AccessAction.EXPORT : AccessAction.VIEW,
        }),
      );
      if (!exporting) return res.json({ report });
      res
        .type('text/csv; charset=utf-8')
        .attachment(`relatorio-${report.authorization.reference}.csv`)
        .send(`﻿${activityReportToCsv(report)}`);
    },

    /** O analista pede uma análise de crédito formal (M12). */
    requestCreditAnalysis(req, res) {
      const body = bodyOf(req);
      const request = bankReportService.requestCreditAnalysis({
        institutionId: req.session.institutionId,
        authorizationId: parseId(body.authorizationId, 'authorizationId'),
        note: body.note,
        actor: actorOf(req),
      });
      res.status(201).json({ request: presentCreditRequest(request) });
    },

    analystCreditRequests(req, res) {
      res.json({ requests: bankReportService.creditRequests({ institutionId: req.session.institutionId }).map(presentCreditRequest) });
    },

    /** A lavadora vê os pedidos de análise feitos a partir das suas autorizações. */
    creditRequests(req, res) {
      res.json({ requests: bankReportService.creditRequests().map(presentCreditRequest) });
    },
  };
}
