// Telefones móveis de Moçambique: 2588XXXXXXXX, prefixos 82–87.
// Aceita "84 123 4567", "+258 84 123 4567", "00258841234567" ou "258841234567".

const NORMALIZED = /^2588[2-7]\d{7}$/;

export function normalizePhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let s = String(input).trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  if (!/^\d+$/.test(s)) return null;
  if (s.length === 9) s = `258${s}`;
  return NORMALIZED.test(s) ? s : null;
}

export function isNormalizedPhone(value) {
  return typeof value === 'string' && NORMALIZED.test(value);
}

// "258841234567" -> "+258 84 123 4567"
export function formatPhone(normalized) {
  if (!isNormalizedPhone(normalized)) return normalized;
  return `+258 ${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8)}`;
}
