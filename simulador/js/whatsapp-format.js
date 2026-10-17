// Formatação das mensagens ao estilo WhatsApp: *negrito*, _itálico_ e quebras de linha.
// Sem dependências do DOM, para poder ser testada em Node.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Converte o texto da mensagem em HTML seguro (o texto é escapado antes de aplicar a marcação). */
export function messageToHtml(text) {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
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
