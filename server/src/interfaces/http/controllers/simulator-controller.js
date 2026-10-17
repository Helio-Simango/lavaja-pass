import { presentMessage, presentThread } from '../presenters.js';
import { optionalQuery } from '../request.js';

export function createSimulatorController({ conversationService }) {
  return {
    listThreads(req, res) {
      res.json({ threads: conversationService.listThreads().map(presentThread) });
    },

    /** Mensagens de uma conversa; ?after=<id> devolve só as novas (consulta periódica). */
    listMessages(req, res) {
      const thread = conversationService.findThread(req.params.phone);
      const afterId = Number(optionalQuery(req, 'after') ?? 0) || 0;
      const messages = thread ? conversationService.messages(thread, { afterId }) : [];
      res.json({ thread: thread ? presentThread(thread) : null, messages: messages.map(presentMessage) });
    },
  };
}
