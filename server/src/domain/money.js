// Valores monetários em centavos inteiros (450,00 MZN = 45000).

export const DEFAULT_CURRENCY = 'MZN';

export function isValidCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/** 110000 -> "1.100,00 MZN" */
export function formatMoney(cents, currency = DEFAULT_CURRENCY) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents deve ser um inteiro');
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const units = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(absolute % 100).padStart(2, '0');
  return `${sign}${units},${decimals}${currency ? ` ${currency}` : ''}`;
}
