// Visão geral do gestor (M10): o que está a acontecer agora, onde está a capacidade parada e a
// conciliação de hoje por origem e por operador.
import { api } from '../core/api-client.js';
import { $, escapeHtml } from '../core/dom.js';
import { greeting, longToday, minutesSince, mzn } from '../core/format.js';

export function createOverviewView({ session }) {
  async function load() {
    const [{ today }, summary, { stations }, { washes }, preview] = await Promise.all([
      api('GET', '/dashboard/today'),
      api('GET', '/dashboard/summary?days=30'),
      api('GET', '/stations'),
      api('GET', '/washes?active=true'),
      api('GET', '/campaigns/preview').catch(() => null),
    ]);
    $('#greeting').textContent = `${greeting()}, ${session.name}`;
    $('#today-line').textContent = `${longToday()} · dados de demonstração`;
    renderKpis(today, stations);
    renderOccupancy(summary, preview);
    renderBays(stations, washes, today);
    renderReconciliation(today);
  }

  return { load, refresh: load };
}

function kpi(label, value, extra = '') {
  return `<div class="kpi"><span>${label}</span><b>${value}</b>${extra}</div>`;
}

function renderKpis(today, stations) {
  const active = stations.filter((s) => s.active);
  const occupied = active.filter((s) => s.state === 'busy' || s.state === 'ready').length;
  const share = active.length ? Math.round((occupied / active.length) * 100) : 0;
  $('#kpis').innerHTML = [
    kpi('Lavagens hoje', today.washes, `<em>+${today.yardNow.queued} na fila</em>`),
    kpi('Recebido hoje', mzn(today.received.cents), '<em>MZN</em><small>digital + numerário declarado</small>'),
    kpi('Recebido digital', today.digitalSharePercent === null ? '—' : `${today.digitalSharePercent}%`, '<em>do valor</em><small>confirmado em simulação</small>'),
    kpi('Baias ocupadas', `${occupied} / ${active.length}`, `<em>${share}%</em>`),
  ].join('');
}

function renderOccupancy(summary, preview) {
  const days = summary.occupancy;
  const max = Math.max(...days.map((d) => d.occupancyPercent ?? 0), 1);
  const peak = days.reduce((best, d) => ((d.occupancyPercent ?? 0) > (best.occupancyPercent ?? 0) ? d : best), days[0]);
  const lowLabels = new Set(summary.lowOccupancy.map((d) => d.label));
  const scale = Math.max(100, max);
  $('#occupancy').innerHTML = days
    .map((d) => {
      const tone = d === peak ? 'hi' : lowLabels.has(d.label) ? 'low' : '';
      const height = Math.round(((d.occupancyPercent ?? 0) / scale) * 100);
      return `<div title="${escapeHtml(d.label)}: ${d.occupancyPercent}% (${d.averagePerDay.toFixed(1)} lavagens/dia)"><small>${d.occupancyPercent ?? '—'}%</small><i class="${tone}" style="height:${height}%"></i></div>`;
    })
    .join('');
  $('#occupancy-labels').innerHTML = days.map((d) => `<span>${escapeHtml(d.label)}</span>`).join('');
  $('#occupancy-table').innerHTML = `<tr><th>Dia</th><th class="num">Dias no período</th><th class="num">Lavagens/dia</th><th class="num">Ocupação</th></tr>${days
    .map((d) => `<tr><td>${escapeHtml(d.label)}</td><td class="num">${d.days}</td><td class="num">${d.averagePerDay.toFixed(1)}</td><td class="num">${d.occupancyPercent}%</td></tr>`)
    .join('')}`;
  $('#low-threshold').textContent = `< ${Math.round(summary.capacity.lowOccupancyThreshold * 100)}`;
  $('#occupancy-def').textContent = `Lavagens concluídas por dia ÷ capacidade prática de ${summary.capacity.practicalWashesPerDay} lavagens/dia (declarada, por validar). Só dias completos.`;

  const alert = $('#occupancy-alert');
  if (summary.lowOccupancy.length === 0) {
    alert.hidden = true;
    return;
  }
  const values = summary.lowOccupancy.map((d) => d.occupancyPercent);
  const range = Math.min(...values) === Math.max(...values) ? `${values[0]}%` : `${Math.min(...values)}–${Math.max(...values)}%`;
  const names = joinPt(summary.lowOccupancy.map((d) => WEEKDAY_NAMES[d.label] ?? d.label));
  const segment = preview ? ` ${preview.count} clientes com consentimento não lavam há ${preview.policy.minInactiveDays}+ dias.` : '';
  alert.innerHTML = `<b>${escapeHtml(capitalize(names))} só a ${range}.</b>${escapeHtml(segment)} <a href="#campanhas" style="color:var(--red);font-weight:700">→ Criar campanha fora de pico</a>`;
  alert.hidden = false;
}

const WEEKDAY_NAMES = { Seg: 'segunda', Ter: 'terça', Qua: 'quarta', Qui: 'quinta', Sex: 'sexta', Sáb: 'sábado', Dom: 'domingo' };

function joinPt(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderBays(stations, washes, today) {
  $('#bays-now').innerHTML = stations
    .map((s) => {
      const wash = washes.find((w) => w.station?.id === s.id && (w.status === 'in_progress' || w.status === 'ready'));
      let state;
      if (!s.active) state = '<span class="pill">Inactiva</span>';
      else if (!wash) state = `<span class="pill a">Livre · ${today.yardNow.queued} na fila</span>`;
      else if (wash.status === 'in_progress') state = `<span class="pill b">A lavar ${minutesSince(wash.startedAt)}m</span>`;
      else state = `<span class="pill g">Pronto · ${wash.payment.status.startsWith('paid') ? 'pago' : 'por pagar'}</span>`;
      return `<div class="bayrow"><span><b>${escapeHtml(s.code)}</b> ${wash ? `<span class="mono">${escapeHtml(wash.vehicle.plateDisplay)}</span>` : '—'}</span>${state}</div>`;
    })
    .join('');
}

function renderReconciliation(today) {
  const rows = [
    ['Carteiras/app (verificado)', today.digital.cents],
    ...today.cashByOperator.map((o) => [`Numerário · ${o.operator} (declarado)`, o.amount.cents]),
    [`Por cobrar (em curso · ${today.receivable.count})`, today.receivable.cents],
  ];
  $('#today-reconciliation').innerHTML = rows
    .map(([label, cents]) => `<div class="line-item"><span>${escapeHtml(label)}</span><b>${mzn(cents)} MZN</b></div>`)
    .join('');
}
