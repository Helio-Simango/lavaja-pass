// Desenho da conversa: bolhas do cliente (direita), da lavadora (esquerda) e avisos (centro).
import { messageToHtml } from './whatsapp-format.js';

const TIME_ZONE = 'Africa/Maputo';
const QUICK_REPLIES = ['1', '2', '3', '4', '5', '6', '7', 'MENU'];

const dayOf = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', timeZone: TIME_ZONE });
const timeOf = (iso) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

export function createChatView(container) {
  let lastDay = null;

  function bubbleHtml(message) {
    const kind = message.kind === 'system' ? 'system' : message.direction;
    return `<div class="wa-bubble ${kind}" data-id="${message.id}">${messageToHtml(message.body)}<span class="wa-time">${timeOf(message.createdAt)}</span></div>`;
  }

  return {
    clear() {
      container.innerHTML = '';
      lastDay = null;
    },

    /** Acrescenta mensagens novas, com separadores de dia, e desce até à última. */
    append(messages) {
      const html = messages
        .map((message) => {
          const day = dayOf(message.createdAt);
          const separator = day === lastDay ? '' : `<div class="wa-day">${day}</div>`;
          lastDay = day;
          return separator + bubbleHtml(message);
        })
        .join('');
      if (!html) return;
      container.insertAdjacentHTML('beforeend', html);
      container.scrollTop = container.scrollHeight;
    },
  };
}

export function renderQuickReplies(container, onPick) {
  container.innerHTML = QUICK_REPLIES.map((text) => `<button type="button" data-reply="${text}">${text}</button>`).join('');
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reply]');
    if (button) onPick(button.dataset.reply);
  });
}
