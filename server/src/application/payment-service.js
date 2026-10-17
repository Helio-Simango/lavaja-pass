// Pagamentos simulados (I-3). Cada operação é idempotente: repetir o pedido com a mesma
// chave devolve o mesmo resultado e nunca cria um segundo registo.
import { ConflictError, NotFoundError } from '../domain/errors.js';
import {
  assertCanReceivePayment,
  assertSameRequest,
  failPending,
  newCashDeclaration,
  newDigitalPayment,
  parseIdempotencyKey,
  PaymentMethod,
  PaymentStatus,
  planRefund,
  planSimulation,
} from '../domain/payment.js';

export class PaymentService {
  #payments;
  #washes;
  #unitOfWork;
  #clock;

  constructor({ paymentRepository, washRepository, unitOfWork, clock }) {
    this.#payments = paymentRepository;
    this.#washes = washRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  listForWash(washId) {
    this.#getWash(washId);
    return this.#payments.listByWash(washId);
  }

  /** Inicia um pagamento digital simulado (fica pendente até à simulação). */
  startDigital(washId, { amountCents, idempotencyKey, actor }) {
    return this.#createOnce(washId, PaymentMethod.DIGITAL, amountCents, idempotencyKey, (wash, key, now) =>
      newDigitalPayment({ wash, amountCents, idempotencyKey: key, actor, now }),
    );
  }

  /** Declara numerário recebido por um operador. Um pagamento digital pendente fica sem efeito. */
  declareCash(washId, { amountCents, declaredBy, confirmed, idempotencyKey, actor }) {
    return this.#createOnce(washId, PaymentMethod.CASH, amountCents, idempotencyKey, (wash, key, now, existing) => {
      const declaration = newCashDeclaration({ wash, amountCents, declaredBy, confirmed, idempotencyKey: key, actor, now });
      const pending = existing.find((p) => p.status === PaymentStatus.PENDING);
      if (pending) this.#payments.update(pending.id, PaymentStatus.PENDING, failPending('Substituído por numerário', now), now);
      return declaration;
    });
  }

  /** Resultado da simulação de um pagamento digital: confirmado ou falhado. */
  simulate(paymentId, outcome) {
    return this.#unitOfWork.run(() => {
      const payment = this.#getPayment(paymentId);
      const now = this.#clock.nowIso();
      const decision = planSimulation(payment, outcome, now);
      if (decision.changed) this.#applyOrFail(payment, decision.changes, now);
      return { payment: this.#getPayment(paymentId), changed: decision.changed };
    });
  }

  refund(paymentId, { reason, idempotencyKey, actor }) {
    return this.#unitOfWork.run(() => {
      const payment = this.#getPayment(paymentId);
      const now = this.#clock.nowIso();
      const decision = planRefund(payment, { reason, idempotencyKey: parseIdempotencyKey(idempotencyKey), actor, now });
      if (decision.changed) this.#applyOrFail(payment, decision.changes, now);
      return { payment: this.#getPayment(paymentId), changed: decision.changed };
    });
  }

  /** Um serviço cancelado não deixa pagamentos digitais pendentes. */
  failPendingForCancelledWash(washId) {
    const now = this.#clock.nowIso();
    for (const payment of this.#payments.listByWash(washId)) {
      if (payment.status === PaymentStatus.PENDING) {
        this.#payments.update(payment.id, PaymentStatus.PENDING, failPending('Serviço cancelado', now), now);
      }
    }
  }

  #createOnce(washId, method, amountCents, rawKey, build) {
    return this.#unitOfWork.run(() => {
      const idempotencyKey = parseIdempotencyKey(rawKey);
      const replay = this.#payments.findByIdempotencyKey(idempotencyKey);
      if (replay) {
        assertSameRequest(replay, { washId, method, amountCents });
        return { payment: replay, created: false };
      }
      const wash = this.#getWash(washId);
      const existing = this.#payments.listByWash(washId);
      assertCanReceivePayment(wash, existing, amountCents);
      if (method === PaymentMethod.DIGITAL && existing.some((p) => p.status === PaymentStatus.PENDING)) {
        throw new ConflictError('PAYMENT_PENDING', 'Já existe um pagamento digital pendente para este serviço.');
      }
      const now = this.#clock.nowIso();
      const id = this.#payments.insert(build(wash, idempotencyKey, now, existing), now);
      return { payment: this.#getPayment(id), created: true };
    });
  }

  #applyOrFail(payment, changes, now) {
    if (!this.#payments.update(payment.id, payment.status, changes, now)) {
      throw new ConflictError('CONCURRENT_UPDATE', 'O pagamento foi alterado entretanto. Tente de novo.');
    }
  }

  #getWash(id) {
    const wash = this.#washes.findById(id);
    if (!wash) throw new NotFoundError('Serviço não encontrado.');
    return wash;
  }

  #getPayment(id) {
    const payment = this.#payments.findById(id);
    if (!payment) throw new NotFoundError('Pagamento não encontrado.');
    return payment;
  }
}
