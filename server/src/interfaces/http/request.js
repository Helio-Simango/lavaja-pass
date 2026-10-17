// Leitura e validação de tipos dos pedidos HTTP. As regras de negócio ficam no domínio.
import { ValidationError } from '../../domain/errors.js';

const ACTOR_MAX = 80;

export function bodyOf(req) {
  const { body } = req;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('O corpo do pedido deve ser um objecto JSON.');
  }
  return body;
}

export function parseId(value, field = 'id') {
  const isDigits = /^\d+$/.test(String(value ?? ''));
  const id = typeof value === 'number' ? value : isDigits ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ValidationError(`"${field}" deve ser um identificador inteiro positivo.`, { field });
  }
  return id;
}

export function optionalId(value, field) {
  return isAbsent(value) ? undefined : parseId(value, field);
}

export function parseInteger(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`"${field}" deve ser um inteiro entre ${min} e ${max}.`, { field });
  }
  return value;
}

export function optionalInteger(value, field, range) {
  return value === undefined ? undefined : parseInteger(value, field, range);
}

export function parseText(value, field, { min = 1, max = 200 } = {}) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : null;
  if (text === null || text.length < min || text.length > max) {
    throw new ValidationError(`"${field}" deve ser texto com ${min} a ${max} caracteres.`, { field });
  }
  return text;
}

/** undefined = não alterar; "" ou null = limpar. */
export function optionalText(value, field, options) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return parseText(value, field, options);
}

export function optionalBoolean(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(`"${field}" deve ser true ou false.`, { field });
  return value;
}

export function optionalQuery(req, name) {
  const value = req.query[name];
  return value === undefined ? undefined : String(value);
}

export function parseIsoDate(value, field = 'date') {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`"${field}" deve estar no formato AAAA-MM-DD.`, { field });
  }
  return value;
}

/** Sem autenticação no protótipo (D-16): o autor é declarado no pedido e fica registado. */
export function actorOf(req, fallback) {
  const declared = req.body?.actor ?? req.get('x-actor');
  return typeof declared === 'string' && declared.trim() ? declared.trim().slice(0, ACTOR_MAX) : fallback;
}

function isAbsent(value) {
  return value === undefined || value === null || value === '';
}
