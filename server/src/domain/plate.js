// Matrículas: maiúsculas, sem espaços nem hífens. A unicidade é por jurisdição + matrícula.
import { ValidationError } from './errors.js';

export const DEFAULT_JURISDICTION = 'MZ';

export function normalizePlate(input) {
  if (typeof input !== 'string') return null;
  const plate = input.trim().toUpperCase().replace(/[\s\-.]/g, '');
  return /^[A-Z0-9]{3,12}$/.test(plate) ? plate : null;
}

export function parsePlate(input) {
  const plate = normalizePlate(input);
  if (!plate) throw new ValidationError('Matrícula inválida.', { field: 'plate' });
  return plate;
}

export function parseJurisdiction(input) {
  if (input === undefined || input === null || input === '') return DEFAULT_JURISDICTION;
  const jurisdiction = typeof input === 'string' ? input.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(jurisdiction)) {
    throw new ValidationError('Jurisdição inválida (ex.: MZ).', { field: 'jurisdiction' });
  }
  return jurisdiction;
}

/** "ABC123MC" -> "ABC 123 MC" (formato moçambicano comum); outros ficam como estão. */
export function formatPlate(plate) {
  const match = /^([A-Z]{3})(\d{3})([A-Z]{2})$/.exec(plate ?? '');
  return match ? `${match[1]} ${match[2]} ${match[3]}` : plate;
}
