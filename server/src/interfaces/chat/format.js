// Formatação das mensagens da conversa (estilo WhatsApp: *negrito*, linhas curtas).
import { formatMoney } from '../../domain/money.js';
import { formatPlate } from '../../domain/plate.js';
import { WASH_STATUS_LABELS, washCode } from '../../domain/wash.js';

export const BUSINESS_TIME_ZONE = 'Africa/Maputo';

export const money = (cents, currency) => formatMoney(cents, currency);
export const plate = (value) => formatPlate(value);

export function time(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: BUSINESS_TIME_ZONE });
}

export function date(iso) {
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', timeZone: BUSINESS_TIME_ZONE });
}

export function numberedList(items) {
  return items.map((item, index) => `*${index + 1}* ${item}`).join('\n');
}

export function washSummary(wash) {
  return `${washCode(wash.id)} · ${plate(wash.plate)} · ${wash.planName} · ${money(wash.finalPriceCents, wash.currency)}`;
}

/** Estado de um serviço activo, com estimativas apresentadas sempre como estimativas. */
export function washStatusLine(wash) {
  const label = WASH_STATUS_LABELS[wash.status];
  const estimate = wash.estimate;
  if (wash.status === 'queued' && estimate?.estimatedStartAt) {
    return `${washSummary(wash)}\n${label}: posição ${estimate.position} · início estimado ${time(estimate.estimatedStartAt)}`;
  }
  if (wash.status === 'in_progress' && estimate?.estimatedEndAt) {
    return `${washSummary(wash)}\n${label} no posto ${wash.stationCode} · conclusão estimada ${time(estimate.estimatedEndAt)}`;
  }
  return `${washSummary(wash)}\n${label}`;
}

export const MENU_TEXT = [
  '*Menu*',
  numberedList(['Planos e preços', 'Entrar na fila', 'Marcar horário', 'Estado', 'Pagar (simulado)', 'Histórico', 'Fidelização']),
  'Responda com o número. Escreva *MENU* para voltar aqui.',
].join('\n');
