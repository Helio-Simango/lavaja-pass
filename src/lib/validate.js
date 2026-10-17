import { validationError } from './errors.js';

export function requireBody(req) {
  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('O corpo do pedido deve ser um objecto JSON.');
  }
  return body;
}

export function parseId(value, field = 'id') {
  const n = typeof value === 'number' ? value : /^\d+$/.test(String(value ?? '')) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw validationError(`"${field}" deve ser um identificador inteiro positivo.`, { field });
  }
  return n;
}

export function optionalId(value, field) {
  return value === undefined || value === null || value === '' ? undefined : parseId(value, field);
}

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') {
    throw validationError(`"${field}" é obrigatório e deve ser texto.`, { field });
  }
  const s = value.trim().replace(/\s+/g, ' ');
  if (s.length < min || s.length > max) {
    throw validationError(`"${field}" deve ter entre ${min} e ${max} caracteres.`, { field });
  }
  return s;
}

export function optionalString(value, field, options) {
  if (value === undefined || value === null) return undefined;
  if (value === '') return null;
  return requireString(value, field, options);
}

export function requireInt(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw validationError(`"${field}" deve ser um inteiro entre ${min} e ${max}.`, { field });
  }
  return value;
}

export function optionalBool(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw validationError(`"${field}" deve ser true ou false.`, { field });
  return value;
}

export function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw validationError(`"${field}" deve ser um de: ${allowed.join(', ')}.`, { field, allowed });
  }
  return value;
}

// Sem autenticação no protótipo (D-16): o autor é declarado no pedido e fica registado.
export function actorFrom(req, fallback) {
  const raw = req.body?.actor ?? req.get('x-actor');
  if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 80);
  return fallback;
}
