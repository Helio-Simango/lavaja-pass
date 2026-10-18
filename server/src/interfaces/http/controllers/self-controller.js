// Área do cliente (perfil Cliente): os seus serviços, a fidelização e o checkout (M4).
import {
  presentAppointment,
  presentConsents,
  presentCustomer,
  presentLoyaltyCard,
  presentPayment,
  presentWash,
} from '../presenters.js';
import { bodyOf, idempotencyKeyOf, optionalBoolean, parseId } from '../request.js';

export function createSelfController({ selfService, catalogService }) {
  return {
    profile(req, res) {
      const { customer, consents, appointments } = selfService.profile(req.session);
      res.json({
        customer: presentCustomer(customer),
        consents: presentConsents(consents),
        appointments: appointments.map(presentAppointment),
      });
    },

    washes(req, res) {
      res.json({ washes: selfService.washes(req.session).map(presentWash) });
    },

    wash(req, res) {
      res.json({ wash: presentWash(selfService.wash(req.session, parseId(req.params.id))) });
    },

    loyalty(req, res) {
      res.json({ loyalty: presentLoyaltyCard(selfService.loyalty(req.session), catalogService.listPlans()) });
    },

    startPayment(req, res) {
      const { payment, created, changed } = selfService.startPayment(req.session, parseId(req.params.id), {
        idempotencyKey: idempotencyKeyOf(req),
      });
      res.status(created ? 201 : 200).json({ payment: presentPayment(payment), created: created ?? false, changed });
    },

    confirmPayment(req, res) {
      const { payment, changed } = selfService.confirmPayment(
        req.session,
        parseId(req.params.id),
        parseId(req.params.paymentId, 'paymentId'),
        bodyOf(req).outcome ?? 'confirmed',
      );
      res.json({ payment: presentPayment(payment), changed });
    },

    respondToOffer(req, res) {
      const appointment = selfService.respondToOffer(req.session, parseId(req.params.id), optionalBoolean(bodyOf(req).accept, 'accept'));
      res.json({ appointment: presentAppointment(appointment) });
    },
  };
}
