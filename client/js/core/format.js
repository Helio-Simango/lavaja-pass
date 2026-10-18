// Formatação para o ecrã (fuso da lavadora, português). Sem DOM: testável em Node.

export const TIME_ZONE = 'Africa/Maputo';

/** 185000 -> "1.850" (MZN sem casas decimais e com ponto nos milhares, como nos mocks). */
export function mzn(cents) {
  const units = Math.round((cents ?? 0) / 100);
  const grouped = String(Math.abs(units)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return units < 0 ? `−${grouped}` : grouped;
}

export function time(iso) {
  return iso ? new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }) : '—';
}

export function shortDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', timeZone: TIME_ZONE }) : '—';
}

export function fullDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TIME_ZONE }) : '—';
}

export function dateTime(iso) {
  return iso
    ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE })
    : '—';
}

/** "Quinta-feira, 22 de outubro · 10:40" */
export function longToday(now = new Date()) {
  const day = now.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time(now.toISOString())}`;
}

/** "Qui 22/10" */
export function shortToday(now = new Date()) {
  const weekday = now.toLocaleDateString('pt-PT', { weekday: 'short', timeZone: TIME_ZONE }).replace('.', '');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1, 3)} ${shortDate(now.toISOString())}`;
}

export function minutesSince(iso, now = Date.now()) {
  return iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : 0;
}

/** Saudação pela hora local. */
export function greeting(now = new Date()) {
  const hour = Number(now.toLocaleTimeString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).slice(0, 2));
  if (hour < 12) return 'Bom dia';
  return hour < 19 ? 'Boa tarde' : 'Boa noite';
}

/** "84 555 0102" mascarado: "+258 84 ••• ••02" */
export function maskPhone(display) {
  const digits = String(display ?? '').replace(/\D/g, '');
  if (digits.length < 9) return display ?? '';
  const local = digits.slice(-9);
  return `+258 ${local.slice(0, 2)} ••• ••${local.slice(-2)}`;
}

/** "450,00" / "450.00" / "450" -> 45000; null se não for um valor válido. */
export function parseAmountToCents(text) {
  const normalized = String(text ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
