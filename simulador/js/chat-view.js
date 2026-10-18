// Desenho da conversa (M2, M3, M5): bolhas do cliente (direita) e da lavadora (esquerda), com os
// avisos automáticos marcados e as opções como botões de resposta.
import { messageToHtml, splitReplies } from './whatsapp-format.js';

const TIME_ZONE = 'Africa/Maputo';
const QUICK_REPLIES = ['LAVAR', 'MENU', 'ESTADO', '1', '2', '3', '4', '5'];

const dayOf = (iso) => new Date(iso).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', timeZone: TIME_ZONE });
const timeOf = (iso) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

export function createChatView(container, { onReply }) {
  let lastDay = null;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reply]');
    if (button) onReply(button.dataset.reply);
  });

  function bubbleHtml(message) {
    const incoming = message.direction === 'in';
    const { body, replies } = incoming ? { body: message.body, replies: [] } : splitReplies(message.body);
    const buttons = replies.length
      ? `<div class="wa-btns">${replies.map((r) => `<button type="button" data-reply="${r.send}">${messageToHtml(r.label)}</button>`).join('')}</div>`
      : '';
    const kind = message.kind === 'system' ? 'out system' : message.direction;
    return `<div class="wa-bubble ${kind}" data-id="${message.id}">${messageToHtml(body)}${buttons}<span class="wa-time">${timeOf(message.createdAt)}</span></div>`;
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
