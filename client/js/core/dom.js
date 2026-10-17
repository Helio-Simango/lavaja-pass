// Utilitários de interface partilhados pelas páginas.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Todo o texto vindo da API passa por aqui antes de entrar em innerHTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

export function minutesSince(iso) {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
}

/** "450,00 MZN" -> "450,00" (a moeda já está implícita no ecrã). */
export function withoutCurrency(display) {
  return display.replace(/\s[A-Z]{3}$/, '');
}

export function showMessage(element, message) {
  element.textContent = message;
  element.hidden = false;
}

export function hideMessage(element) {
  element.hidden = true;
}

/** Fecha o diálogo ao clicar num elemento com [data-close]. */
export function enableCloseButtons(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) dialog.close();
  });
}
