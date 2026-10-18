// Quadro do pátio (M7): baias no topo, cartões por estado e um botão de acção por cartão.
// Só produz HTML (todo o texto da API passa por escapeHtml); main.js liga os eventos.
import { escapeHtml } from '../core/dom.js';
import { minutesSince, mzn, time } from '../core/format.js';

const STATE_LABELS = { free: 'Livre', busy: 'A lavar', ready: 'Pronto', inactive: 'Inactiva' };
const SOURCE_LABELS = { simulador: 'WhatsApp', patio: 'Pátio', demo: 'Pátio' };
const PAID = ['paid_digital', 'paid_cash', 'not_required'];
export const COLUMNS = [
  ['queued', 'Na fila'],
  ['in_progress', 'A lavar'],
  ['ready', 'Pronto'],
];

export function baysHtml(stations) {
  return stations
    .map((s) => `<div class="${s.active ? s.state : 'inactive'}" title="${escapeHtml(s.name)}">${escapeHtml(s.code)}<br>${STATE_LABELS[s.active ? s.state : 'inactive']}</div>`)
    .join('');
}

export function isPaid(wash) {
  return PAID.includes(wash.payment.status);
}

export function paymentPill(wash) {
  if (wash.payment.status === 'paid_digital') return '<span class="pill g">PAGO · digital</span>';
  if (wash.payment.status === 'paid_cash') return '<span class="pill g">PAGO · numerário</span>';
  if (wash.payment.status === 'not_required') return '<span class="pill g">SEM VALOR</span>';
  if (wash.payment.status === 'pending') return '<span class="pill b">A PAGAR · link</span>';
  return '';
}

/** @param filter 'all' | 'queued' | 'in_progress' | 'ready' */
export function boardHtml({ washes, stations, filter, now = Date.now() }) {
  const freeBays = stations.filter((s) => s.active && s.state === 'free');
  const columns = COLUMNS.filter(([status]) => filter === 'all' || filter === status);
  return columns
    .map(([status, title]) => {
      const cards = washes
        .filter((w) => w.status === status)
        .sort((a, b) => (a.estimate?.position ?? 0) - (b.estimate?.position ?? 0) || a.id - b.id)
        .map((wash, index) => cardHtml(wash, { freeBays, bay: freeBays[index], now }))
        .join('');
      return `<div class="colhead">${title}</div>${cards || '<p class="empty">Nenhum carro.</p>'}`;
    })
    .join('');
}

function cardHtml(wash, context) {
  if (wash.status === 'queued') return queuedCard(wash, context);
  if (wash.status === 'in_progress') return washingCard(wash, context);
  return readyCard(wash, context);
}

/** Cada carro da fila, pela ordem, fica com a baia livre seguinte; os restantes aguardam. */
function queuedCard(wash, { freeBays, bay, now }) {
  const position = wash.estimate?.position ? `<span class="pill a">${wash.estimate.position}.º</span>` : '';
  const source = SOURCE_LABELS[wash.source] ?? 'Pátio';
  const eta = wash.estimate?.estimatedEndAt ? ` · pronto ~${time(wash.estimate.estimatedEndAt)}` : '';
  const start = bay
    ? `<button class="btn p" data-action="start" data-id="${wash.id}" data-station="${bay.id}">▶ Iniciar na ${escapeHtml(bay.name)}</button>`
    : `<button class="btn o" disabled>${freeBays.length ? 'Aguarda a vez' : 'Sem baias livres'}</button>`;
  const more = freeBays.length > 1 || (!bay && freeBays.length) ? `<button class="btn link" data-action="choose-bay" data-id="${wash.id}">Outra baia</button>` : '';
  return `<article class="car queue">
    <div class="top"><span class="plate">${escapeHtml(wash.vehicle.plateDisplay)}</span><span>${paymentPill(wash)} ${position}</span></div>
    <div class="row"><span>${escapeHtml(wash.plan.name)} · ${mzn(wash.price.final.cents)} MZN · ${source} há ${minutesSince(wash.queuedAt, now)} min${eta}</span></div>
    ${start}
    <div class="links">${more}<button class="btn link" data-action="cancel" data-id="${wash.id}">Cancelar</button></div>
  </article>`;
}

function washingCard(wash, { now }) {
  const elapsed = minutesSince(wash.startedAt, now);
  const overdue = wash.estimate?.overdueMin > 0;
  const progress = Math.min(100, Math.round((elapsed / wash.durationMin) * 100));
  return `<article class="car wash ${overdue ? 'overdue' : ''}">
    <div class="top"><span class="plate">${escapeHtml(wash.vehicle.plateDisplay)}</span><span class="pill b">${escapeHtml(wash.station?.code ?? '')}</span></div>
    <div class="row"><span>${escapeHtml(wash.plan.name)} · ${Math.min(elapsed, 999)} de ${wash.durationMin} min${overdue ? ` · atrasado ${wash.estimate.overdueMin} min` : ''}</span><span>${escapeHtml(wash.startedBy ?? '')}</span></div>
    <div class="mbar"><i style="width:${progress}%"></i></div>
    <button class="btn k" data-action="ready" data-id="${wash.id}">✓ Pronto</button>
  </article>`;
}

function readyCard(wash, { now }) {
  const pill = paymentPill(wash) || '<span class="pill a">POR PAGAR</span>';
  return `<article class="car ready">
    <div class="top"><span class="plate">${escapeHtml(wash.vehicle.plateDisplay)}</span>${pill}</div>
    <div class="row"><span>${escapeHtml(wash.plan.name)} · ${escapeHtml(wash.station?.code ?? '')} · pronto há ${minutesSince(wash.readyAt, now)} min</span></div>
    <button class="btn p" data-action="deliver" data-id="${wash.id}">Entregar</button>
  </article>`;
}

const APPOINTMENT_TONES = { requested: 'a', confirmed: 'b', checked_in: 'g', no_show: 'r', cancelled: '' };

export function appointmentsHtml(appointments, { isToday }) {
  const active = appointments.filter((a) => a.status !== 'cancelled');
  if (active.length === 0) return '<p class="empty">Sem marcações. As marcações reservam capacidade nas baias.</p>';
  return active
    .map((a) => {
      const declined = a.offers.filter((o) => o.status === 'declined').map((o) => `proposta das ${time(o.proposedStartsAt)} recusada`);
      return `<article class="car ${a.status === 'checked_in' ? 'ready' : 'queue'}">
        <div class="top"><span class="plate">${time(a.startsAt)} · ${escapeHtml(a.vehicle.plateDisplay)}</span><span class="pill ${APPOINTMENT_TONES[a.status]}">${escapeHtml(a.statusLabel)}</span></div>
        <div class="row"><span>${escapeHtml(a.plan.name)} · ${escapeHtml(a.customer.name)} · ${escapeHtml(a.station.code)}</span></div>
        ${declined.length ? `<div class="row"><span>${escapeHtml(declined.join(' · '))}</span></div>` : ''}
        <div class="actions">${appointmentActions(a, isToday)}</div>
      </article>`;
    })
    .join('');
}

function appointmentActions({ id, status }, isToday) {
  const button = (to, label, tone) => `<button class="btn sm ${tone}" data-appointment="${id}" data-to="${to}">${label}</button>`;
  if (status === 'requested') return button('confirmed', 'Confirmar', 'k') + button('cancelled', 'Cancelar', 'o');
  if (status === 'confirmed' && !isToday) return button('cancelled', 'Cancelar', 'o');
  if (status === 'confirmed') return button('checked_in', 'Chegou', 'p') + button('no_show', 'Faltou', 'o') + button('cancelled', 'Cancelar', 'o');
  return '';
}
