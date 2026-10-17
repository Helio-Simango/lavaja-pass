// Exactamente três classes na versão inicial (DEC-05); não existe Classe D.
import { ValidationError } from './errors.js';

export const VEHICLE_CLASS_CODES = Object.freeze(['A', 'B', 'C']);

/**
 * Interpreta uma referência a uma classe: o código ("B", "b") ou o id (2, "2").
 * @returns {{ code: string } | { id: number }}
 */
export function parseClassRef(input, field = 'classId') {
  const text = String(input ?? '').trim();
  if (/^[A-Za-z]$/.test(text)) return { code: text.toUpperCase() };
  if (/^\d+$/.test(text)) return { id: Number(text) };
  throw new ValidationError(`"${field}" é obrigatório: indique a classe (A, B ou C).`, { field });
}

export function unknownClassError(field = 'classId') {
  return new ValidationError('Classe desconhecida. Só existem as classes A, B e C.', { field });
}
