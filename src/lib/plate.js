// Matrículas: maiúsculas, sem espaços nem hífens. A unicidade é por jurisdição + matrícula.

export const DEFAULT_JURISDICTION = 'MZ';

export function normalizePlate(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase().replace(/[\s\-.]/g, '');
  return /^[A-Z0-9]{3,12}$/.test(s) ? s : null;
}

export function normalizeJurisdiction(input) {
  if (input === undefined || input === null || input === '') return DEFAULT_JURISDICTION;
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

// "ABC123MC" -> "ABC 123 MC" (formato moçambicano comum); outros ficam como estão.
export function formatPlate(normalized) {
  const m = /^([A-Z]{3})(\d{3})([A-Z]{2})$/.exec(normalized ?? '');
  return m ? `${m[1]} ${m[2]} ${m[3]}` : normalized;
}
