// Telefones móveis de Moçambique: 2588XXXXXXXX, prefixos 82–87.
// Aceita "84 123 4567", "+258 84 123 4567", "00258841234567" ou "258841234567".
import { ValidationError } from './errors.js';

const NORMALIZED_PHONE = /^2588[2-7]\d{7}$/;
const LOCAL_NUMBER_LENGTH = 9;
const COUNTRY_CODE = '258';

export function normalizePhone(input) {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let digits = String(input).trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === LOCAL_NUMBER_LENGTH) digits = COUNTRY_CODE + digits;
  return NORMALIZED_PHONE.test(digits) ? digits : null;
}

export function parsePhone(input) {
  const phone = normalizePhone(input);
  if (!phone) {
    throw new ValidationError('Telefone inválido. Use um móvel de Moçambique (82–87), ex.: 84 123 4567.', {
      field: 'phone',
    });
  }
  return phone;
}

/** "258841234567" -> "+258 84 123 4567" */
export function formatPhone(phone) {
  if (!NORMALIZED_PHONE.test(phone ?? '')) return phone;
  return `+${COUNTRY_CODE} ${phone.slice(3, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
}
