// Pátio ao vivo (gestor): viaturas no pátio, baias e a agenda por baia (marcações e fila).
import { api } from '../core/api-client.js';
import { $, $$, escapeHtml } from '../core/dom.js';
import { minutesSince, mzn, time } from '../core/format.js';
import { renderCapacity } from './capacity-view.js';

const BAY_TONES = { busy: 'b', ready: 'g', free: 'a', inactive: '' };
const BAY_LABELS = { busy: 'A lavar', ready: 'Pronto', free: 'Livre', inactive: 'Inactiva' };

export function createYardView() {
  let dayOffset = 0;

  $('#capacity-days').addEventListener('click', (event) => {
    const button = event.target.closest('[data-offset]');
    if (!button) return;
    dayOffset = Number(button.dataset.offset);
    for (const other of $$('#capacity-days [data-offset]')) other.setAttribute('aria-pressed', String(other === button));
    loadCapacity();
  });

  async function load() {
    const [{ washes }, { stations }] = await Promise.all([api('GET', '/washes?active=true'), api('GET', '/stations')]);
    $('#yard-table').innerHTML = `<tr><th>Matrícula</th><th>Estado</th><th>Plano</th><th>Cliente</th><th class="num">MZN</th><th>Pagamento</th><th>Previsão</th></tr>${washes
      .sort((a, b) => a.id - b.id)
      .map((w) => {
        const when = w.status === 'queued' ? `${w.estimate?.position ?? '?'}.º · pronto ~${time(w.estimate?.estimatedEndAt)}` : w.status === 'in_progress' ? `${w.station?.code} · ${minutesSince(w.startedAt)} de ${w.durationMin} min` : `${w.station?.code} · pronto há ${minutesSince(w.readyAt)} min`;
        return `<tr><td class="mono">${escapeHtml(w.vehicle.plateDisplay)}</td><td>${escapeHtml(w.statusLabel)}</td><td>${escapeHtml(w.plan.name)}</td>
          <td>${escapeHtml(w.customer.name)}</td><td class="num">${mzn(w.price.final.cents)}</td><td>${escapeHtml(w.payment.label)}</td><td>${escapeHtml(when)}</td></tr>`;
      })
      .join('') || '<tr><td colspan="7" class="muted">Pátio vazio.</td></tr>'}`;
    $('#yard-bays').innerHTML = stations
      .map((s) => {
        const state = s.active ? s.state : 'inactive';
        return `<div class="bayrow"><span><b>${escapeHtml(s.code)}</b> ${s.wash ? `<span class="mono">${escapeHtml(s.wash.plateDisplay)}</span>` : '—'}</span><span class="pill ${BAY_TONES[state]}">${BAY_LABELS[state]}</span></div>`;
      })
      .join('');
    await loadCapacity();
  }

  async function loadCapacity() {
    const date = new Date(Date.now() + dayOffset * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Maputo' });
    const capacity = await api('GET', `/capacity?date=${date}`);
    renderCapacity({ agenda: $('#agenda'), table: $('#agenda-table'), policyTable: $('#policy-table'), line: $('#capacity-line') }, capacity, new Date().toISOString());
  }

  return { load, refresh: load };
}
