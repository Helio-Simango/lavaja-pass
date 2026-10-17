import { presentPayment } from '../presenters.js';
import { actorOf, bodyOf, idempotencyKeyOf, parseId, parseInteger } from '../request.js';

const MAX_AMOUNT_CENTS = 100_000_000;

export function createPaymentController({ paymentService }) {
  // 201 quando o pedido criou o pagamento; 200 quando é a repetição de um pedido já feito.
  const respond = (res, { payment, created, changed }) =>
    res.status(created ? 201 : 200).json({ payment: presentPayment(payment), created: created ?? false, changed });

  const amountOf = (body) => parseInteger(body.amountCents, 'amountCents', { min: 1, max: MAX_AMOUNT_CENTS });

  return {
    listForWash(req, res) {
      const payments = paymentService.listForWash(parseId(req.params.id));
      res.json({ payments: payments.map(presentPayment) });
    },

    startDigital(req, res) {
      const result = paymentService.startDigital(parseId(req.params.id), {
        amountCents: amountOf(bodyOf(req)),
        idempotencyKey: idempotencyKeyOf(req),
        actor: actorOf(req, 'cliente'),
      });
      respond(res, result);
    },

    declareCash(req, res) {
      const body = bodyOf(req);
      const result = paymentService.declareCash(parseId(req.params.id), {
        amountCents: amountOf(body),
        declaredBy: body.declaredBy,
        confirmed: body.confirm,
        idempotencyKey: idempotencyKeyOf(req),
        actor: actorOf(req, 'operador'),
      });
      respond(res, result);
    },

    simulate(req, res) {
      respond(res, paymentService.simulate(parseId(req.params.id), bodyOf(req).outcome));
    },

    refund(req, res) {
      const result = paymentService.refund(parseId(req.params.id), {
        reason: bodyOf(req).reason,
        idempotencyKey: idempotencyKeyOf(req),
        actor: actorOf(req, 'gestor'),
      });
      respond(res, result);
    },
  };
}
