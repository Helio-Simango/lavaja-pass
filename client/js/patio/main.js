// Página do Pátio: liga o quadro, as acções dos cartões e os diálogos.
import { api } from '../core/api-client.js';
import { $, formatTime, hideMessage, showMessage } from '../core/dom.js';
import { bindOperatorInput } from '../core/operator.js';
import { renderAppointments } from './appointments-view.js';
import { renderBoard, renderStationsLine } from './board-view.js';
import { createCashDialog } from './cash-dialog.js';
import { createConfirmDialog } from './confirm-dialog.js';
import { createRegisterDialog } from './register-dialog.js';

const REFRESH_INTERVAL_MS = 3000;

const board = $('.board');
const boardError = $('#board-error');
const stationsLine = $('#stations-line');
const actor = bindOperatorInput($('#operator'));
const confirmDialog = createConfirmDialog($('#confirm-dialog'));
const registerDialog = createRegisterDialog($('#register-dialog'), { actor, onRegistered: announceRegistered });
const cashDialog = createCashDialog($('#cash-dialog'), { actor, onDeclared: () => refresh() });

const state = {
  washes: [],
  stations: [],
  appointments: [],
  chosenStations: new Map(), // posto escolhido por serviço em fila, preservado entre actualizações
};

async function refresh() {
  try {
    const [{ stations }, { washes }, agenda] = await Promise.all([
      api('GET', '/stations'),
      api('GET', '/washes?active=true'),
      loadAgenda(),
    ]);
    Object.assign(state, { stations, washes, appointments: agenda.appointments });
    hideMessage(boardError);
    $('#appointments-title').textContent = agenda.title;
    renderAppointments($('#appointments-list'), $('#appointments-count'), agenda.appointments, { isToday: agenda.isToday });
    if (isChoosingStation()) return; // redesenhar fecharia a lista aberta
    renderStationsLine(stationsLine, stations);
    renderBoard(board, state);
  } catch (error) {
    showMessage(boardError, `Não foi possível actualizar o pátio: ${error.message}`);
  }
}

/** Marcações de hoje; se não houver nenhuma activa, as de amanhã (para preparar o dia seguinte). */
async function loadAgenda() {
  const today = (await api('GET', '/appointments')).appointments;
  if (today.some((a) => a.status !== 'cancelled')) return { title: 'Marcações de hoje', appointments: today, isToday: true };
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Maputo' });
  const next = (await api('GET', `/appointments?date=${tomorrow}`)).appointments;
  return next.length
    ? { title: 'Marcações de amanhã', appointments: next, isToday: false }
    : { title: 'Marcações de hoje', appointments: today, isToday: true };
}

function isChoosingStation() {
  return document.activeElement?.matches('.board select') ?? false;
}

async function transition(washId, body) {
  await api('POST', `/washes/${washId}/transitions`, body, { actor: actor() });
  await refresh();
}

const cardActions = {
  async start(wash, button) {
    const stationId = Number($(`[data-station-for="${wash.id}"]`).value);
    await runFromButton(button, () => transition(wash.id, { to: 'in_progress', stationId }));
    state.chosenStations.delete(wash.id);
  },

  async ready(wash, button) {
    await runFromButton(button, () => transition(wash.id, { to: 'ready' }));
  },

  cash(wash) {
    cashDialog.open(wash);
  },

  cancel(wash) {
    confirmDialog.open({
      title: `Cancelar ${wash.code}`,
      text: `${wash.vehicle.plateDisplay} · ${wash.plan.name}. O cancelamento fica registado com o motivo.`,
      okLabel: 'Cancelar serviço',
      askReason: true,
      onConfirm: (reason) => transition(wash.id, { to: 'cancelled', reason }),
    });
  },

  complete(wash) {
    const unpaid = ['unpaid', 'pending'].includes(wash.payment.status);
    confirmDialog.open({
      title: `Concluir ${wash.code}`,
      text: unpaid
        ? `Este serviço não tem pagamento efectivo (${wash.price.final.display}). Entregar sem pagamento fica registado em seu nome e não conta para a fidelização.`
        : `Confirmar a entrega da viatura ao cliente (${wash.payment.label}).`,
      okLabel: unpaid ? 'Entregar sem pagamento' : 'Concluir',
      onConfirm: () => transition(wash.id, { to: 'completed', allowUnpaid: unpaid }),
    });
  },
};

async function runFromButton(button, action) {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    showMessage(boardError, error.message);
    button.disabled = false;
  }
}

function announceRegistered(wash) {
  refresh().then(() => {
    const start = wash.estimate?.estimatedStartAt ? `, início estimado ${formatTime(wash.estimate.estimatedStartAt)}` : '';
    stationsLine.textContent = `${wash.code} entrou na fila (${wash.price.final.display}${start}).`;
  });
}

board.addEventListener('change', (event) => {
  const washId = event.target.dataset.stationFor;
  if (washId) state.chosenStations.set(Number(washId), event.target.value);
});

board.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  const wash = button && state.washes.find((w) => w.id === Number(button.dataset.id));
  if (wash) cardActions[button.dataset.action](wash, button);
});

$('#appointments-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-appointment-action]');
  if (!button) return;
  const appointment = state.appointments.find((a) => a.id === Number(button.dataset.id));
  const to = button.dataset.appointmentAction;
  const send = (reason) => api('POST', `/appointments/${appointment.id}/transitions`, { to, reason }, { actor: actor() }).then(refresh);
  if (to === 'cancelled') {
    confirmDialog.open({
      title: `Cancelar a marcação das ${formatTime(appointment.startsAt)}`,
      text: `${appointment.vehicle.plateDisplay} · ${appointment.plan.name}. O horário libertado pode ser proposto a outra marcação (D-14).`,
      okLabel: 'Cancelar marcação',
      askReason: true,
      onConfirm: send,
    });
    return;
  }
  await runFromButton(button, () => send());
});

$('#open-register').addEventListener('click', () => registerDialog.open());

refresh();
setInterval(() => {
  if (document.visibilityState === 'visible') refresh();
}, REFRESH_INTERVAL_MS);
