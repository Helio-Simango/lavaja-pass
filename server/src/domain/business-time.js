// Fuso horário da lavadora: dias da semana, horas e datas apresentadas seguem este fuso.
// Moçambique não tem hora de Verão: o desvio é sempre UTC+2.
export const BUSINESS_TIME_ZONE = 'Africa/Maputo';
export const BUSINESS_UTC_OFFSET = '+02:00';

/** Data local (AAAA-MM-DD) de um instante. */
export function localDateOf(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BUSINESS_TIME_ZONE });
}

/** "2026-10-22" + "14:30" (hora local) -> ISO em UTC. */
export function localToIso(date, time) {
  return new Date(`${date}T${time}:00${BUSINESS_UTC_OFFSET}`).toISOString();
}

/** Hora local HH:MM de um instante. */
export function localTimeOf(iso) {
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE });
}

export function addDays(date, days) {
  const base = new Date(`${date}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
