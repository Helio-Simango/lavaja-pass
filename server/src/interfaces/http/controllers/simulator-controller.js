import { presentMessage, presentThread } from '../presenters.js';
import { parsePhone } from '../../../domain/phone.js';
import { WhatsAppAssistant } from '../../chat/assistant.js';
import { bodyOf, optionalQuery } from '../request.js';

export function createSimulatorController(services) {
  const { conversationService } = services;
  const assistant = new WhatsAppAssistant(services);

  return {
    listThreads(req, res) {
      res.json({ threads: conversationService.listThreads().map(presentThread) });
    },

    /** Mensagens de uma conversa; ?after=<id> devolve só as novas (consulta periódica). */
    listMessages(req, res) {
      const phone = parsePhone(req.params.phone);
      const thread = conversationService.findThread(phone);
      const afterId = Number(optionalQuery(req, 'after') ?? 0) || 0;
      const messages = thread ? conversationService.messages(thread, { afterId }) : [];
      res.json({ phone, thread: thread ? presentThread(thread) : null, messages: messages.map(presentMessage) });
    },

    /** Mensagem escrita pelo cliente; devolve-a com as respostas do assistente e os avisos gerados. */
    sendMessage(req, res) {
      const { thread, messages } = conversationService.handleIncoming(req.params.phone, bodyOf(req).text, (current, text) =>
        assistant.respond(current, text),
      );
      res.status(201).json({ thread: presentThread(thread), messages: messages.map(presentMessage) });
    },
  };
}
