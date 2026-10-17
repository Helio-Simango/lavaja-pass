// Quadro do Pátio (M7): colunas Em fila / Em execução / Pronto e linha de estado dos postos.
import { $, escapeHtml, formatTime, minutesSince, withoutCurrency } from '../core/dom.js';

const STATION_LABELS = { free: 'livre', busy: 'ocupado', ready: 'pronto', inactive: 'inactivo' };
const COLUMNS = ['queued', 'in_progress', 'ready'];

export function renderStationsLine(element, stations) {
  const summary = stations.map((station) => `${station.code} ${STATION_LABELS[station.state]}`).join(' · ');
  element.textContent = `Postos: ${summary} · actualiza a cada 3 s`;
}

/** @param chosenStations Map<washId, stationId> escolhas do operador ainda não confirmadas */
export function renderBoard(board, { washes, stations, chosenStations }) {
  const freeStations = stations.filter((station) => station.state === 'free');
  for (const status of COLUMNS) {
    const column = washes.filter((wash) => wash.status === status);
    $(`[data-count="${status}"]`, board).textContent = column.length;
    $(`[data-list="${status}"]`, board).innerHTML = column.length
      ? column.map((wash) => cardHtml(wash, { freeStations, chosenStation: chosenStations.get(wash.id) })).join('')
      : '<p class="empty">Nenhum serviço.</p>';
  }
}

function cardHtml(wash, context) {
  const body = {
    queued: queuedBody,
    in_progress: inProgressBody,
    ready: readyBody,
  }[wash.status](wash, context);
  const overdue = wash.status === 'in_progress' && wash.estimate?.overdueMin > 0;
  return `<article class="card ${overdue ? 'overdue' : ''}">${cardHeader(wash)}${body}</article>`;
}

function cardHeader(wash) {
  const paymentTone = wash.payment.status === 'not_required' ? 'green' : 'amber';
  return `
    <div class="card-top">
      <span class="plate">${escapeHtml(wash.vehicle.plateDisplay)}</span>
      <span class="pill blue">Classe ${escapeHtml(wash.vehicle.classCode)}</span>
    </div>
    <div class="card-line">
      <span>${escapeHtml(wash.plan.name)} · <strong>${escapeHtml(withoutCurrency(wash.price.final.display))}</strong></span>
      <span class="pill ${paymentTone}">${escapeHtml(wash.payment.label)}</span>
    </div>
    <div class="card-meta">${escapeHtml(wash.code)} · ${escapeHtml(wash.customer.name)}</div>`;
}

function queuedBody(wash, { freeStations, chosenStation }) {
  const { estimate } = wash;
  const estimateText = estimate?.estimatedStartAt
    ? `Estimativa: início ${formatTime(estimate.estimatedStartAt)} · ${estimate.position}.º na fila`
    : `${estimate?.position ?? '?'}.º na fila · sem postos activos para estimar`;
  const startControls = freeStations.length
    ? `<select data-station-for="${wash.id}" aria-label="Posto">${stationOptions(freeStations, chosenStation)}</select>
       <button class="btn small success" data-action="start" data-id="${wash.id}">▶ Iniciar</button>`
    : '<span class="muted">Sem postos livres</span>';
  return `
    <div class="card-meta">${estimateText}</div>
    <div class="card-actions">
      ${startControls}
      <button class="btn small ghost" data-action="cancel" data-id="${wash.id}">Cancelar</button>
    </div>`;
}

function stationOptions(stations, chosenStation) {
  return stations
    .map((station) => {
      const selected = String(station.id) === chosenStation ? 'selected' : '';
      return `<option value="${station.id}" ${selected}>${escapeHtml(station.code)}</option>`;
    })
    .join('');
}

function inProgressBody(wash) {
  const { estimate } = wash;
  const timing = estimate?.overdueMin > 0
    ? `atrasado ${estimate.overdueMin} min`
    : `conclusão estimada ${formatTime(estimate?.estimatedEndAt)}`;
  return `
    <div class="card-meta">${escapeHtml(wash.station?.code)} · ${minutesSince(wash.startedAt)} de ${wash.durationMin} min · ${timing}</div>
    <div class="card-actions">
      <button class="btn small success" data-action="ready" data-id="${wash.id}">✓ Marcar pronto</button>
    </div>`;
}

function readyBody(wash) {
  return `
    <div class="card-meta">${escapeHtml(wash.station?.code)} · pronto há ${minutesSince(wash.readyAt)} min</div>
    <div class="card-actions">
      <button class="btn small primary" data-action="complete" data-id="${wash.id}">Concluir…</button>
    </div>`;
}
