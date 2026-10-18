// App do operador (perfil Operador): quadro de baias (M7), entrada manual (M8) e entrega (M9).
// Actualiza a cada 3 s; cada acção fica registada em nome do operador da sessão.
import { api } from '../core/api-client.js';
import { $, $$, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { shortToday } from '../core/format.js';
import { bindLogout, requireSession } from '../core/session.js';
import { appointmentsHtml, baysHtml, boardHtml } from './board-view.js';
import { createDeliveryView } from './delivery-view.js';
import { createEntrySheet } from './entry-sheet.js';

const PROFILE = 'operador';
const REFRESH_INTERVAL_MS = 3000;

const session = await requireSession(PROFILE);
const state = { washes: [], stations: [], appointments: [], appointmentsToday: true, filter: 'all', mine: 0 };

const entrySheet = createEntrySheet($('#entry-sheet'), { onRegistered: () => refresh() });
const delivery = createDeliveryView($('#delivery'), { operatorName: session.name, onDelivered: () => refresh() });
bindLogout($('#logout'), PROFILE);

async function refresh() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Maputo' });
    const [{ stations }, { washes }, todays, agenda] = await Promise.all([
      api('GET', '/stations'),
      api('GET', '/washes?active=true'),
      api('GET', `/washes?date=${today}`),
      loadAgenda(today),
    ]);
    state.mine = todays.washes.filter((w) => w.startedBy === session.name && w.status !== 'cancelled').length;
    Object.assign(state, { stations, washes, appointments: agenda.appointments, appointmentsToday: agenda.isToday });
    $('#online').textContent = 'ONLINE';
    hideMessage($('#board-error'));
    render();
    delivery.refresh(washes);
  } catch (error) {
    $('#online').textContent = 'SEM REDE';
    showMessage($('#board-error'), `Não foi possível actualizar: ${error.message}`);
  }
}

/** Marcações de hoje; se não houver nenhuma activa, as de amanhã (para preparar o dia seguinte). */
async function loadAgenda(today) {
  const list = (await api('GET', `/appointments?date=${today}`)).appointments;
  if (list.some((a) => a.status !== 'cancelled')) return { appointments: list, isToday: true };
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Maputo' });
  const next = (await api('GET', `/appointments?date=${tomorrow}`)).appointments;
  return next.length ? { appointments: next, isToday: false } : { appointments: list, isToday: true };
}

function render() {
  $('#op-sub').textContent = `${shortToday()} · ${session.name} · ${state.mine} ${state.mine === 1 ? 'lavagem tua' : 'lavagens tuas'} hoje`;
  $('#baias').innerHTML = baysHtml(state.stations);
  const count = (status) => state.washes.filter((w) => w.status === status).length;
  const counts = { all: state.washes.length, queued: count('queued'), in_progress: count('in_progress'), ready: count('ready'), appointments: state.appointments.filter((a) => a.status !== 'cancelled').length };
  for (const [key, value] of Object.entries(counts)) $(`[data-count="${key}"]`).textContent = `(${value})`;
  if (document.activeElement?.closest('#board') && document.activeElement.matches('select, input')) return;
  $('#board').innerHTML = state.filter === 'appointments'
    ? `<div class="colhead">${state.appointmentsToday ? 'Marcações de hoje' : 'Marcações de amanhã'}</div>${appointmentsHtml(state.appointments, { isToday: state.appointmentsToday })}`
    : boardHtml({ washes: state.washes, stations: state.stations, filter: state.filter });
}

$('#tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-filter]');
  if (!tab) return;
  state.filter = tab.dataset.filter;
  for (const other of $$('#tabs [data-filter]')) other.setAttribute('aria-selected', String(other === tab));
  render();
});

// ---------- Acções dos cartões ----------

const washById = (id) => state.washes.find((w) => w.id === Number(id));
const transition = (id, body) => api('POST', `/washes/${id}/transitions`, body);

$('#board').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action], button[data-appointment]');
  if (!button) return;
  if (button.dataset.appointment) return appointmentAction(button);
  const wash = washById(button.dataset.id);
  if (!wash) return;
  const actions = {
    start: () => run(button, () => transition(wash.id, { to: 'in_progress', stationId: Number(button.dataset.station) })),
    ready: () => run(button, () => transition(wash.id, { to: 'ready' })),
    deliver: () => delivery.open(wash),
    'choose-bay': () => chooseBay(wash),
    cancel: () => cancelWash(wash),
  };
  actions[button.dataset.action]?.();
});

async function run(button, action) {
  button.disabled = true;
  try {
    await action();
    await refresh();
  } catch (error) {
    showMessage($('#board-error'), error.message);
    button.disabled = false;
  }
}

function actionSheet(html, onClick) {
  const sheet = $('#action-sheet');
  $('#action-body').innerHTML = `<div class="grab"></div>${html}<p class="error-box" id="action-error" hidden></p>
    <button class="btn o block" data-sheet-close>Voltar</button>`;
  sheet.hidden = false;
  sheet.onclick = async (event) => {
    if (event.target === sheet || event.target.closest('[data-sheet-close]')) return (sheet.hidden = true);
    try {
      if (await onClick(event)) sheet.hidden = true;
    } catch (error) {
      showMessage($('#action-error'), error.message);
    }
  };
}

function chooseBay(wash) {
  const free = state.stations.filter((s) => s.active && s.state === 'free');
  actionSheet(
    `<h3>Iniciar ${escapeHtml(wash.vehicle.plateDisplay)}</h3><span class="lbl">Baia livre</span>
     <div class="chips">${free.map((s) => `<button class="chip" data-bay="${s.id}">${escapeHtml(s.name)}</button>`).join('')}</div>`,
    async (event) => {
      const chip = event.target.closest('[data-bay]');
      if (!chip) return false;
      await transition(wash.id, { to: 'in_progress', stationId: Number(chip.dataset.bay) });
      await refresh();
      return true;
    },
  );
}

function cancelWash(wash) {
  actionSheet(
    `<h3>Cancelar ${escapeHtml(wash.vehicle.plateDisplay)}</h3>
     <label class="lbl" for="cancel-reason">Motivo</label><input class="input" id="cancel-reason" maxlength="200">
     <button class="btn r block" data-confirm-cancel>Cancelar serviço</button>`,
    async (event) => {
      if (!event.target.closest('[data-confirm-cancel]')) return false;
      await transition(wash.id, { to: 'cancelled', reason: $('#cancel-reason').value });
      await refresh();
      return true;
    },
  );
}

function appointmentAction(button) {
  const id = Number(button.dataset.appointment);
  const to = button.dataset.to;
  const send = (reason) => api('POST', `/appointments/${id}/transitions`, { to, reason }).then(refresh);
  if (to !== 'cancelled') return run(button, () => send());
  actionSheet(
    `<h3>Cancelar a marcação</h3><p class="small muted">O horário libertado pode ser proposto a outra marcação (D-14); o cliente decide.</p>
     <label class="lbl" for="cancel-reason">Motivo</label><input class="input" id="cancel-reason" maxlength="200">
     <button class="btn r block" data-confirm-cancel>Cancelar marcação</button>`,
    async (event) => {
      if (!event.target.closest('[data-confirm-cancel]')) return false;
      await send($('#cancel-reason').value);
      return true;
    },
  );
}

$('#open-entry').addEventListener('click', () => entrySheet.open());

await refresh();
setInterval(() => {
  if (document.visibilityState === 'visible' && !entrySheet.isOpen()) refresh();
}, REFRESH_INTERVAL_MS);
