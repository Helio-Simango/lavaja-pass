// Conversas do simulador: uma por telefone, mensagens guardadas por ordem e isoladas por número.
// Não há envio real de mensagens (DEC-12).
import { BotState, MessageDirection, MessageKind } from '../domain/conversation.js';
import { parsePhone } from '../domain/phone.js';

export class ConversationService {
  #conversations;
  #customers;
  #clock;

  constructor({ conversationRepository, customerRepository, clock }) {
    this.#conversations = conversationRepository;
    this.#customers = customerRepository;
    this.#clock = clock;
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
    this.#conversations.insertThread(
      { phone, customerId: customer?.id ?? null, botState: customer ? BotState.MENU : BotState.START },
      this.#clock.nowIso(),
    );
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

  /** Aviso automático ao cliente (serviço iniciado, pronto, pagamento…). */
  notifyPhone(phone, body) {
    return this.#append(this.threadFor(phone), { direction: MessageDirection.OUT, kind: MessageKind.SYSTEM, body });
  }

  #append(thread, message) {
    return this.#conversations.insertMessage(thread.id, message, this.#clock.nowIso());
  }
}
