// Valores monetários em centavos inteiros (450,00 MZN = 45000).

export const DEFAULT_CURRENCY = 'MZN';

export function isCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

// 110000 -> "1.100,00 MZN"
export function formatMoney(cents, currency = DEFAULT_CURRENCY) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('cents deve ser um inteiro');
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(abs % 100).padStart(2, '0');
  return `${sign}${units},${decimals}${currency ? ` ${currency}` : ''}`;
}

export function money(cents, currency = DEFAULT_CURRENCY) {
  return { cents, currency, display: formatMoney(cents, currency) };
}
