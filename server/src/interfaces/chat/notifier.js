// Avisos automáticos ao cliente na conversa (cap. 8.1): aparecem como mensagens do sistema,
// distintas das respostas do assistente. Implementa a porta CustomerNotifier da aplicação.
import { isWalkIn } from '../../domain/customer.js';
import { WashPaymentState, washCode } from '../../domain/wash.js';
import { date, money, plate, time } from './format.js';

const PAID_STATES = [WashPaymentState.PAID_DIGITAL, WashPaymentState.PAID_CASH, WashPaymentState.NOT_REQUIRED];

export class ConversationNotifier {
  #conversationService;
  #loyaltyService;
  #catalogService;
  #paymentLinks;
  #publicUrl;

  /**
   * @param paymentLinks emite o token do link de pagamento (M3 → M4); sem ele, só a opção 5 da conversa
   * @param publicUrl endereço público do servidor
   */
  constructor({ conversationService, loyaltyService, catalogService, paymentLinks = null, publicUrl = '' }) {
    this.#conversationService = conversationService;
    this.#loyaltyService = loyaltyService;
    this.#catalogService = catalogService;
    this.#paymentLinks = paymentLinks;
    this.#publicUrl = publicUrl.replace(/\/$/, '');
  }

  washStarted(wash) {
    const end = wash.estimate?.estimatedEndAt ? ` Conclusão estimada: ${time(wash.estimate.estimatedEndAt)}.` : '';
    this.#notify(wash, `🧽 Começámos a lavar ${plate(wash.plate)} na baia ${wash.stationCode} (${washCode(wash.id)}).${end}`);
  }

  /** Aviso de pronto (M3): com o valor e o link de pagamento (checkout M4, simulado). */
  washReady(wash) {
    if (PAID_STATES.includes(wash.paymentState)) {
      this.#notify(wash, `✨ ${plate(wash.plate)} está pronto na baia ${wash.stationCode}! Já está pago: pode levantar a viatura.`);
      return;
    }
    const lines = [`✨ ${plate(wash.plate)} está pronto na baia ${wash.stationCode}!`, `Total: ${money(wash.finalPriceCents, wash.currency)}`];
    if (this.#paymentLinks) {
      const token = this.#paymentLinks.issuePaymentLink({ customerId: wash.customerId, customerName: wash.customerName, washId: wash.id });
      lines.push(`Pague aqui com a sua carteira (simulado): ${this.#publicUrl}/pagar/${wash.id}#t=${token}`);
    }
    lines.push('Ou responda *5* para pagar aqui, ou pague em numerário ao operador na entrega.');
    this.#notify(wash, lines.join('\n'));
  }

  paymentReceived(wash, payment) {
    const amount = `${money(payment.amountCents, payment.currency)} · ${washCode(wash.id)}`;
    const text = payment.method === 'cash'
      ? `💵 Numerário declarado por ${payment.declaredBy}: ${amount}.`
      : `💳 Pagamento digital confirmado (simulado): ${amount}. Não é uma transacção real.`;
    this.#notify(wash, text);
  }

  /** @param loyaltyMovements movimentos registados pela conclusão (vazio se não contou) */
  washCompleted(wash, loyaltyMovements) {
    const lines = [`Obrigado! ${washCode(wash.id)} entregue.`];
    if (loyaltyMovements.length > 0) lines.push(...this.#loyaltyLines(wash, loyaltyMovements));
    this.#notify(wash, lines.join('\n'));
  }

  appointmentBooked(appointment) {
    const pending = appointment.status === 'requested' ? ' Aguarda confirmação da lavadora.' : '';
    this.#notifyAppointment(appointment, `📅 Marcação registada: ${this.#slot(appointment)}.${pending}`);
  }

  appointmentConfirmed(appointment) {
    this.#notifyAppointment(appointment, `📅 Marcação confirmada: ${this.#slot(appointment)}.`);
  }

  /** A proposta nunca muda a marcação sozinha: o cliente responde ACEITAR ou MANTER (cap. 12.4). */
  appointmentOffer(appointment, offer) {
    this.#notifyAppointment(
      appointment,
      `⏰ Temos um horário mais cedo para ${plate(appointment.plate)}: ${time(offer.proposedStartsAt)} em vez de ${time(appointment.startsAt)} (${date(appointment.startsAt)}).
Responda *ACEITAR* para mudar ou *MANTER* para ficar com o horário actual. Sem resposta até às ${time(offer.expiresAt)}, mantém-se ${time(appointment.startsAt)}.`,
    );
  }

  appointmentRescheduled(appointment, previousStartsAt) {
    this.#notifyAppointment(appointment, `📅 Marcação alterada a seu pedido: ${time(previousStartsAt)} → ${this.#slot(appointment)}.`);
  }

  #slot(appointment) {
    return `${date(appointment.startsAt)} às ${time(appointment.startsAt)} · ${plate(appointment.plate)} · ${appointment.planName}`;
  }

  #notifyAppointment(appointment, text) {
    this.#conversationService.notifyPhone(appointment.customerPhone, text);
  }

  #loyaltyLines(wash, movements) {
    const card = this.#loyaltyService.card(wash.customerId);
    const progress = card.classes.find((c) => c.classId === wash.classId);
    const lines = [`Fidelização classe ${progress.classCode}: ${progress.progressInCycle}/${progress.cycleSize} lavagens.`];
    const granted = movements.find((m) => m.type === 'grant');
    if (granted) lines.push(`🎁 Ganhou ${granted.benefitsDelta} benefício(s): ${this.#benefitLabel(card.rules.params)}.`);
    return lines;
  }

  #benefitLabel(params) {
    if (params.benefit.type !== 'free_wash') return 'crédito numa próxima lavagem';
    const plan = this.#catalogService.listPlans().find((candidate) => candidate.code === params.benefit.planCode);
    return `lavagem ${plan?.name ?? params.benefit.planCode} gratuita`;
  }

  /** O cliente de balcão (sem telefone) não recebe avisos. */
  #notify(wash, text) {
    if (isWalkIn(wash.customerPhone)) return;
    this.#conversationService.notifyPhone(wash.customerPhone, text);
  }
}
