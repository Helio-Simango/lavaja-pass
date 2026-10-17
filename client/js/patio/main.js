// Página do Pátio: liga o quadro, as acções dos cartões e os diálogos.
import { api } from '../core/api-client.js';
import { $, formatTime, hideMessage, showMessage } from '../core/dom.js';
import { bindOperatorInput } from '../core/operator.js';
import { renderBoard, renderStationsLine } from './board-view.js';
import { createConfirmDialog } from './confirm-dialog.js';
import { createRegisterDialog } from './register-dialog.js';

const REFRESH_INTERVAL_MS = 3000;

const board = $('.board');
const boardError = $('#board-error');
const stationsLine = $('#stations-line');
const actor = bindOperatorInput($('#operator'));
const confirmDialog = createConfirmDialog($('#confirm-dialog'));
const registerDialog = createRegisterDialog($('#register-dialog'), { actor, onRegistered: announceRegistered });

const state = {
  washes: [],
  stations: [],
  chosenStations: new Map(), // posto escolhido por serviço em fila, preservado entre actualizações
};

async function refresh() {
  try {
    const [{ stations }, { washes }] = await Promise.all([api('GET', '/stations'), api('GET', '/washes?active=true')]);
    Object.assign(state, { stations, washes });
    hideMessage(boardError);
    if (isChoosingStation()) return; // redesenhar fecharia a lista aberta
    renderStationsLine(stationsLine, stations);
    renderBoard(board, state);
  } catch (error) {
    showMessage(boardError, `Não foi possível actualizar o pátio: ${error.message}`);
  }
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
    const unpaid = wash.payment.status === 'unpaid';
    confirmDialog.open({
      title: `Concluir ${wash.code}`,
      text: unpaid
        ? `Este serviço não tem pagamento registado (${wash.price.final.display}). Entregar sem pagamento fica registado em seu nome e não conta para a fidelização.`
        : 'Confirmar a entrega da viatura ao cliente.',
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

$('#open-register').addEventListener('click', () => registerDialog.open());

refresh();
setInterval(() => {
  if (document.visibilityState === 'visible') refresh();
}, REFRESH_INTERVAL_MS);
