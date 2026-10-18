// Formatação das mensagens ao estilo WhatsApp: *negrito*, _itálico_, quebras de linha, links e
// botões de resposta (as opções "*1* Sim" e as palavras LAVAR / PARAR, como nos mocks M2 e M5).
// Sem dependências do DOM, para poder ser testada em Node.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const OPTION_LINE = /^\*(\d{1,2})\* (.+)$/;
const KEYWORDS = [
  ['LAVAR', 'LAVAR'],
  ['PARAR', 'PARAR ofertas'],
  ['ACEITAR', 'ACEITAR'],
  ['MANTER', 'MANTER'],
];
// Os links só podem ser http(s): nunca javascript: nem outros esquemas.
const URL_PATTERN = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g;

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Converte o texto da mensagem em HTML seguro (o texto é escapado antes de aplicar a marcação). */
export function messageToHtml(text) {
  return escapeHtml(text)
    .replace(URL_PATTERN, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${shortUrl(url)}</a>`)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
}

/** O link do pagamento é longo (leva um token): mostra só o endereço e o serviço. */
function shortUrl(url) {
  const withoutFragment = url.split('#')[0];
  return withoutFragment.replace(/^https?:\/\//, '');
}

/**
 * Separa as opções numeradas e as palavras de resposta, para aparecerem como botões.
 * @returns {{ body: string, replies: { send: string, label: string }[] }}
 */
export function splitReplies(text) {
  const lines = String(text ?? '').split('\n');
  const options = [];
  const body = [];
  for (const line of lines) {
    const match = OPTION_LINE.exec(line.trim());
    if (match) options.push({ send: match[1], label: `${match[1]} · ${match[2].replace(/\*/g, '')}` });
    else body.push(line);
  }
  const keywords = KEYWORDS.filter(([word]) => new RegExp(`\\*${word}\\*`).test(text)).map(([send, label]) => ({ send, label }));
  return { body: options.length ? body.join('\n').trimEnd() : String(text ?? ''), replies: [...options, ...keywords] };
}

/** "258841234567" -> "+258 84 123 4567" */
export function formatPhone(phone) {
  return /^258\d{9}$/.test(phone) ? `+258 ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}` : phone;
}

/** Telefone do endereço /simulador/whatsapp/:telefone, ou null. */
export function phoneFromPath(pathname) {
  const match = /^\/simulador\/whatsapp\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}
