// Conversas do simulador: uma por telefone, mensagens guardadas por ordem e isoladas por número.
// Não há envio real de mensagens (DEC-12).
import { BotState, MessageDirection, MessageKind, parseIncomingText } from '../domain/conversation.js';
import { parsePhone } from '../domain/phone.js';

export class ConversationService {
  #conversations;
  #customers;
  #unitOfWork;
  #clock;

  constructor({ conversationRepository, customerRepository, unitOfWork, clock }) {
    this.#conversations = conversationRepository;
    this.#customers = customerRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  /**
   * Trata uma mensagem do cliente numa única transacção: guarda-a, pede a resposta ao assistente,
   * guarda as respostas e o novo estado da conversa.
   * @param respond (thread, text) => { replies: string[], state, context, customerId? }
   * @returns a conversa e as mensagens novas (incluindo avisos gerados entretanto)
   */
  handleIncoming(rawPhone, rawText, respond) {
    return this.#unitOfWork.run(() => {
      const text = parseIncomingText(rawText);
      const thread = this.threadFor(rawPhone);
      const incomingId = this.appendIncoming(thread, text);
      const outcome = respond(thread, text);
      for (const reply of outcome.replies) this.appendReply(thread, reply);
      this.saveState(thread, {
        customerId: outcome.customerId ?? thread.customerId,
        botState: outcome.state,
        botContext: outcome.context,
      });
      return {
        thread: this.#conversations.findThreadByPhone(thread.phone),
        messages: this.messages(thread, { afterId: incomingId - 1 }),
      };
    });
  }

  listThreads() {
    return this.#conversations.listThreads();
  }

  findThread(rawPhone) {
    return this.#conversations.findThreadByPhone(parsePhone(rawPhone));
  }

  /** A conversa do número; criada se ainda não existir, já ligada ao cliente se o telefone for conhecido. */
  threadFor(rawPhone) {
    const phone = parsePhone(rawPhone);
    const existing = this.#conversations.findThreadByPhone(phone);
    if (existing) return existing;
    const customer = this.#customers.findByPhone(phone);
    // Começa sempre em START: o assistente cumprimenta (pelo nome, se o telefone for conhecido).
    this.#conversations.insertThread({ phone, customerId: customer?.id ?? null, botState: BotState.START }, this.#clock.nowIso());
    return this.#conversations.findThreadByPhone(phone);
  }

  messages(thread, { afterId } = {}) {
    return this.#conversations.listMessages(thread.id, { afterId });
  }

  saveState(thread, { customerId, botState, botContext }) {
    this.#conversations.updateThread(thread.id, { customerId, botState, botContext }, this.#clock.nowIso());
  }

  appendIncoming(thread, body) {
    return this.#append(thread, { direction: MessageDirection.IN, kind: MessageKind.TEXT, body });
  }

  appendReply(thread, body) {
    return this.#append(thread, { direction: MessageDirection.OUT, kind: MessageKind.TEXT, body });
  }

  /** Mensagem da lavadora iniciada por ela (ex.: campanha confirmada pelo gestor). */
  sendToPhone(phone, body) {
    return this.appendReply(this.threadFor(phone), body);
  }

  /** Aviso automático ao cliente (serviço iniciado, pronto, pagamento…). */
  notifyPhone(phone, body) {
    return this.#append(this.threadFor(phone), { direction: MessageDirection.OUT, kind: MessageKind.SYSTEM, body });
  }

  #append(thread, message) {
    return this.#conversations.insertMessage(thread.id, message, this.#clock.nowIso());
  }
}
