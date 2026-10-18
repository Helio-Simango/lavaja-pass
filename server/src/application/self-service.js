// Área do cliente (perfil Cliente): só os seus próprios dados. Cada operação confirma que o serviço,
// o pagamento ou a proposta pertencem ao cliente da sessão; se não pertencer, responde como inexistente.
import { NotFoundError } from '../domain/errors.js';

const RECENT_WASHES = 10;

export class SelfService {
  #customerService;
  #consentService;
  #washService;
  #paymentService;
  #loyaltyService;
  #appointmentService;

  constructor({ customerService, consentService, washService, paymentService, loyaltyService, appointmentService }) {
    this.#customerService = customerService;
    this.#consentService = consentService;
    this.#washService = washService;
    this.#paymentService = paymentService;
    this.#loyaltyService = loyaltyService;
    this.#appointmentService = appointmentService;
  }

  profile({ customerId }) {
    return {
      customer: this.#customerService.get(customerId),
      consents: this.#consentService.current(customerId),
      appointments: this.#appointmentService.upcomingForCustomer(customerId),
    };
  }

  washes({ customerId }) {
    return this.#washService.list({ customerId, limit: RECENT_WASHES });
  }

  wash(session, washId) {
    return this.#ownWash(session, washId);
  }

  loyalty({ customerId }) {
    return this.#loyaltyService.card(customerId);
  }

  /** Checkout (M4): o valor é sempre o do serviço, calculado no servidor. */
  startPayment(session, washId, { idempotencyKey }) {
    const wash = this.#ownWash(session, washId);
    return this.#paymentService.startDigital(wash.id, { amountCents: wash.finalPriceCents, idempotencyKey, actor: session.name });
  }

  /** Resposta simulada da carteira (M-Pesa, e-Mola, mKesh…): não há transacção real. */
  confirmPayment(session, washId, paymentId, outcome) {
    this.#ownWash(session, washId);
    const payment = this.#paymentService.listForWash(washId).find((candidate) => candidate.id === paymentId);
    if (!payment) throw new NotFoundError('Pagamento não encontrado.');
    return this.#paymentService.simulate(paymentId, outcome);
  }

  respondToOffer(session, offerId, accept) {
    return this.#appointmentService.respondToOwnOffer(session.customerId, offerId, { accept, actor: session.name });
  }

  #ownWash({ customerId }, washId) {
    const wash = this.#washService.get(washId);
    if (wash.customerId !== customerId) throw new NotFoundError('Serviço não encontrado.');
    return wash;
  }
}
