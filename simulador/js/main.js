// Simulador de WhatsApp: o utilizador faz de cliente da lavadora. Um endereço por número.
import { api } from '/js/core/api-client.js';
import { $, escapeHtml, hideMessage, showMessage } from '/js/core/dom.js';
import { createChatView, renderQuickReplies } from './chat-view.js';
import { formatPhone, phoneFromPath } from './whatsapp-format.js';

const REFRESH_INTERVAL_MS = 3000;
const SIMULATOR_PATH = '/simulador';

const app = $('.wa-app');
const chatView = createChatView($('#messages'), { onReply: (text) => send(text) });
const state = { phone: null, lastId: 0, sending: false };
const initialText = new URLSearchParams(location.search).get('texto') ?? '';

// ---------- Conversas ----------

async function refreshThreads() {
  const { threads } = await api('GET', '/simulator/threads');
  $('#threads').innerHTML = threads
    .map((thread) => {
      const title = thread.customerName ? `${thread.customerName} · ${thread.phoneDisplay}` : thread.phoneDisplay;
      const preview = thread.lastMessage ? thread.lastMessage.body.split('\n')[0] : 'Sem mensagens';
      return `<li><a href="${SIMULATOR_PATH}/whatsapp/${thread.phone}" data-phone="${thread.phone}"
        aria-current="${thread.phone === state.phone}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(preview)}</span></a></li>`;
    })
    .join('');
}

$('#threads').addEventListener('click', (event) => {
  const link = event.target.closest('a[data-phone]');
  if (!link) return;
  event.preventDefault();
  openConversation(link.dataset.phone);
});

$('#open-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage($('#open-error'));
  try {
    // A API valida e normaliza o número (ex.: "84 123 4567" -> 258841234567).
    const { phone } = await api('GET', `/simulator/threads/${encodeURIComponent($('#open-phone').value.trim())}/messages`);
    openConversation(phone);
  } catch (error) {
    showMessage($('#open-error'), error.message);
  }
});

// ---------- Conversa aberta ----------

function openConversation(phone, { push = true } = {}) {
  if (push) history.pushState({}, '', `${SIMULATOR_PATH}/whatsapp/${phone}`);
  Object.assign(state, { phone, lastId: 0 });
  chatView.clear();
  $('#chat-subtitle').textContent = `a conversar como ${formatPhone(phone)}`;
  $('#text').value = initialText; // ex.: o QR do cartaz abre a conversa com "LAVAR" já escrito
  $('#chat').hidden = false;
  $('#empty').hidden = true;
  app.classList.add('chat-open');
  refreshMessages();
  refreshThreads();
  $('#text').focus();
}

function closeConversation() {
  history.pushState({}, '', SIMULATOR_PATH);
  Object.assign(state, { phone: null, lastId: 0 });
  $('#chat').hidden = true;
  $('#empty').hidden = false;
  app.classList.remove('chat-open');
}

async function refreshMessages() {
  if (!state.phone) return;
  const phone = state.phone;
  const { messages } = await api('GET', `/simulator/threads/${phone}/messages?after=${state.lastId}`);
  if (phone !== state.phone) return; // mudou de conversa entretanto
  showNew(messages);
}

function showNew(messages) {
  const fresh = messages.filter((message) => message.id > state.lastId);
  if (fresh.length === 0) return;
  state.lastId = fresh.at(-1).id;
  chatView.append(fresh);
}

async function send(text) {
  if (!state.phone || state.sending || !text.trim()) return;
  state.sending = true;
  $('.wa-send').disabled = true;
  try {
    const { messages } = await api('POST', `/simulator/threads/${state.phone}/messages`, { text });
    $('#text').value = '';
    showNew(messages);
    refreshThreads();
  } catch (error) {
    chatView.append([{ id: state.lastId, kind: 'system', direction: 'out', body: `⚠️ ${error.message}`, createdAt: new Date().toISOString() }]);
  } finally {
    state.sending = false;
    $('.wa-send').disabled = false;
    $('#text').focus();
  }
}

$('#composer').addEventListener('submit', (event) => {
  event.preventDefault();
  send($('#text').value);
});
renderQuickReplies($('#quick'), send);
$('#back').addEventListener('click', closeConversation);
window.addEventListener('popstate', () => {
  const phone = phoneFromPath(location.pathname);
  if (phone) openConversation(phone, { push: false });
  else closeConversation();
});

// ---------- Arranque ----------

api('GET', '/public/business').then(({ name }) => {
  $('#business-name').textContent = name;
});

const initialPhone = phoneFromPath(location.pathname);
if (initialPhone) openConversation(initialPhone, { push: false });
refreshThreads();
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  refreshMessages();
  refreshThreads();
}, REFRESH_INTERVAL_MS);
