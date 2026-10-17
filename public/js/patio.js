import { api, escapeHtml, formatTime, minutesSince } from './api.js';

const REFRESH_MS = 3000;
const $ = (sel) => document.querySelector(sel);

const state = {
  stations: [],
  washes: [],
  stationChoice: new Map(), // posto escolhido por serviço em fila, preservado entre actualizações
};

// ---------- Operador (sem autenticação: o nome fica registado como autor) ----------

const operatorInput = $('#operator');
try {
  operatorInput.value = localStorage.getItem('lavaja.operator') ?? '';
} catch {}
operatorInput.addEventListener('change', () => {
  try {
    localStorage.setItem('lavaja.operator', operatorInput.value.trim());
  } catch {}
});
const actor = () => operatorInput.value.trim() || 'operador';

// ---------- Quadro ----------

async function refresh() {
  try {
    const [{ stations }, { washes }] = await Promise.all([api('GET', '/stations'), api('GET', '/washes?active=true')]);
    $('#board-error').hidden = true;
    state.stations = stations;
    state.washes = washes;
    // Não redesenhar enquanto o operador escolhe um posto (fecharia a lista aberta).
    if (document.activeElement?.matches('.board select')) return;
    render();
  } catch (err) {
    showBoardError(`Não foi possível actualizar o pátio: ${err.message}`);
  }
}

function showBoardError(message) {
  const box = $('#board-error');
  box.textContent = message;
  box.hidden = false;
}

function render() {
  const labels = { free: 'livre', busy: 'ocupado', ready: 'pronto', inactive: 'inactivo' };
  const parts = state.stations.map((s) => `${s.code} ${labels[s.state]}`);
  $('#stations-line').textContent = `Postos: ${parts.join(' · ')} · actualiza a cada 3 s`;

  for (const status of ['queued', 'in_progress', 'ready']) {
    const list = state.washes.filter((w) => w.status === status);
    document.querySelector(`[data-count="${status}"]`).textContent = list.length;
    const container = document.querySelector(`[data-list="${status}"]`);
    container.innerHTML = list.length ? list.map(cardHtml).join('') : '<p class="empty">Nenhum serviço.</p>';
  }
}

function paymentPill(w) {
  const tone = w.payment.status === 'not_required' ? 'green' : 'amber';
  return `<span class="pill ${tone}">${escapeHtml(w.payment.label)}</span>`;
}

function cardHtml(w) {
  const head = `
    <div class="card-top">
      <span class="plate">${escapeHtml(w.vehicle.plateDisplay)}</span>
      <span class="pill blue">Classe ${escapeHtml(w.vehicle.classCode)}</span>
    </div>
    <div class="card-line">
      <span>${escapeHtml(w.plan.name)} · <strong>${escapeHtml(w.price.final.display.replace(' MZN', ''))}</strong></span>
      ${paymentPill(w)}
    </div>
    <div class="card-meta">${escapeHtml(w.code)} · ${escapeHtml(w.customer.name)}</div>`;

  if (w.status === 'queued') {
    const free = state.stations.filter((s) => s.state === 'free');
    const chosen = state.stationChoice.get(w.id);
    const options = free
      .map((s) => `<option value="${s.id}" ${String(s.id) === chosen ? 'selected' : ''}>${escapeHtml(s.code)}</option>`)
      .join('');
    const est = w.estimate?.estimatedStartAt
      ? `Estimativa: início ${formatTime(w.estimate.estimatedStartAt)} · ${w.estimate.position}.º na fila`
      : `${w.estimate?.position ?? '?'}.º na fila · sem postos activos para estimar`;
    return `<article class="card">${head}
      <div class="card-meta">${est}</div>
      <div class="card-actions">
        ${free.length
          ? `<select data-station-for="${w.id}" aria-label="Posto">${options}</select>
             <button class="btn small success" data-action="start" data-id="${w.id}">▶ Iniciar</button>`
          : '<span class="muted">Sem postos livres</span>'}
        <button class="btn small ghost" data-action="cancel" data-id="${w.id}">Cancelar</button>
      </div></article>`;
  }

  if (w.status === 'in_progress') {
    const elapsed = minutesSince(w.startedAt);
    const overdue = w.estimate?.overdueMin > 0;
    return `<article class="card ${overdue ? 'overdue' : ''}">${head}
      <div class="card-meta">${escapeHtml(w.station?.code)} · ${elapsed} de ${w.durationMin} min ·
        ${overdue ? `atrasado ${w.estimate.overdueMin} min` : `conclusão estimada ${formatTime(w.estimate?.estimatedEndAt)}`}</div>
      <div class="card-actions">
        <button class="btn small success" data-action="ready" data-id="${w.id}">✓ Marcar pronto</button>
      </div></article>`;
  }

  return `<article class="card">${head}
    <div class="card-meta">${escapeHtml(w.station?.code)} · pronto há ${minutesSince(w.readyAt)} min</div>
    <div class="card-actions">
      <button class="btn small primary" data-action="complete" data-id="${w.id}">Concluir…</button>
    </div></article>`;
}

document.querySelector('.board').addEventListener('change', (e) => {
  const id = e.target.dataset.stationFor;
  if (id) state.stationChoice.set(Number(id), e.target.value);
});

document.querySelector('.board').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const wash = state.washes.find((w) => w.id === id);
  if (!wash) return;

  if (btn.dataset.action === 'start') {
    const select = document.querySelector(`[data-station-for="${id}"]`);
    await transition(id, { to: 'in_progress', stationId: Number(select.value) }, btn);
    state.stationChoice.delete(id);
  } else if (btn.dataset.action === 'ready') {
    await transition(id, { to: 'ready' }, btn);
  } else if (btn.dataset.action === 'cancel') {
    confirmAction({
      title: `Cancelar ${wash.code}`,
      text: `${wash.vehicle.plateDisplay} · ${wash.plan.name}. O cancelamento fica registado com o motivo.`,
      askReason: true,
      okLabel: 'Cancelar serviço',
      run: (reason) => transition(id, { to: 'cancelled', reason }),
    });
  } else if (btn.dataset.action === 'complete') {
    const unpaid = wash.payment.status === 'unpaid';
    confirmAction({
      title: `Concluir ${wash.code}`,
      text: unpaid
        ? `Este serviço não tem pagamento registado (${wash.price.final.display}). Entregar sem pagamento fica registado em seu nome e não conta para a fidelização.`
        : 'Confirmar a entrega da viatura ao cliente.',
      okLabel: unpaid ? 'Entregar sem pagamento' : 'Concluir',
      run: () => transition(id, { to: 'completed', allowUnpaid: unpaid }),
    });
  }
});

async function transition(id, body, btn) {
  if (btn) btn.disabled = true;
  try {
    await api('POST', `/washes/${id}/transitions`, body, { actor: actor() });
    await refresh();
  } catch (err) {
    if (!btn) throw err;
    showBoardError(err.message);
    btn.disabled = false;
  }
}

// ---------- Diálogo de confirmação ----------

const confirmDialog = $('#confirm-dialog');
let pendingConfirm = null;

function confirmAction({ title, text, askReason = false, okLabel, run }) {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-reason-block').hidden = !askReason;
  $('#confirm-reason').value = '';
  $('#confirm-error').hidden = true;
  $('#confirm-ok').textContent = okLabel;
  pendingConfirm = { askReason, run };
  confirmDialog.showModal();
  if (askReason) $('#confirm-reason').focus();
}

$('#confirm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingConfirm) return;
  const reason = $('#confirm-reason').value.trim();
  if (pendingConfirm.askReason && reason.length < 3) {
    showError('#confirm-error', 'Indique o motivo.');
    return;
  }
  $('#confirm-ok').disabled = true;
  try {
    await pendingConfirm.run(reason);
    confirmDialog.close();
  } catch (err) {
    showError('#confirm-error', err.message);
  } finally {
    $('#confirm-ok').disabled = false;
  }
});

// ---------- Registar serviço (M8) ----------

const reg = {
  dialog: $('#register-dialog'),
  customer: null,
  classes: [],
  plans: [],
  planId: null,
};

function showError(sel, message) {
  const box = $(sel);
  box.textContent = message;
  box.hidden = false;
}

function resetRegister() {
  reg.customer = null;
  reg.planId = null;
  $('#reg-phone').value = '';
  $('#reg-name').value = '';
  $('#reg-plate').value = '';
  $('#reg-customer').textContent = '';
  $('#reg-new-customer').hidden = true;
  $('#reg-vehicle-block').hidden = true;
  $('#reg-error').hidden = true;
  $('#reg-submit').disabled = true;
}

$('#open-register').addEventListener('click', async () => {
  resetRegister();
  if (!reg.classes.length) {
    const { classes } = await api('GET', '/vehicle-classes');
    reg.classes = classes;
    $('#reg-class').innerHTML = classes
      .map((c) => `<option value="${c.code}">${escapeHtml(c.code)} · ${escapeHtml(c.description.split(',')[0])}</option>`)
      .join('');
  }
  reg.dialog.showModal();
  $('#reg-phone').focus();
});

for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) d.close();
  });
}

async function lookupCustomer() {
  $('#reg-error').hidden = true;
  const phone = $('#reg-phone').value.trim();
  if (!phone) return;
  try {
    const { customer } = await api('GET', `/customers?phone=${encodeURIComponent(phone)}`);
    reg.customer = customer;
    $('#reg-customer').textContent = `Cliente encontrado: ${customer.name} (${customer.phoneDisplay})`;
    $('#reg-new-customer').hidden = true;
  } catch (err) {
    if (err.code !== 'NOT_FOUND') {
      showError('#reg-error', err.message);
      return;
    }
    reg.customer = null;
    $('#reg-customer').textContent = 'Cliente novo: indique o nome e a viatura.';
    $('#reg-new-customer').hidden = false;
  }
  const vehicles = reg.customer?.vehicles ?? [];
  $('#reg-vehicle').innerHTML =
    vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.plateDisplay)} · ${escapeHtml(v.class.code)}</option>`).join('') +
    '<option value="new">+ Nova viatura</option>';
  $('#reg-vehicle-block').hidden = false;
  await onVehicleChange();
}

$('#reg-lookup').addEventListener('click', lookupCustomer);
$('#reg-phone').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    lookupCustomer();
  }
});

function selectedClassCode() {
  const value = $('#reg-vehicle').value;
  if (value === 'new') return $('#reg-class').value;
  return reg.customer.vehicles.find((v) => String(v.id) === value)?.class.code;
}

async function onVehicleChange() {
  $('#reg-new-vehicle').hidden = $('#reg-vehicle').value !== 'new';
  const classCode = selectedClassCode();
  $('#reg-plan-class').textContent = `(preços da classe ${classCode})`;
  const { plans } = await api('GET', `/plans?classId=${classCode}`);
  reg.plans = plans;
  if (!plans.some((p) => p.id === reg.planId && p.available)) reg.planId = null;
  $('#reg-plans').innerHTML = plans
    .map(
      (p) => `<button type="button" class="plan-option" role="radio" data-plan="${p.id}"
        aria-checked="${p.id === reg.planId}" ${p.available ? '' : 'disabled'}
        title="${p.available ? '' : p.unavailableReason === 'PLAN_INACTIVE' ? 'Plano indisponível' : 'Sem preço para esta classe'}">
        ${escapeHtml(p.name)} · ${p.price ? escapeHtml(p.price.display.replace(' MZN', '')) : '—'}</button>`,
    )
    .join('');
  $('#reg-submit').disabled = reg.planId === null;
}

$('#reg-vehicle').addEventListener('change', onVehicleChange);
$('#reg-class').addEventListener('change', onVehicleChange);
$('#reg-plans').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-plan]');
  if (!btn || btn.disabled) return;
  reg.planId = Number(btn.dataset.plan);
  for (const b of document.querySelectorAll('#reg-plans [data-plan]')) {
    b.setAttribute('aria-checked', String(b === btn));
  }
  $('#reg-submit').disabled = false;
});

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#reg-error').hidden = true;
  $('#reg-submit').disabled = true;
  const who = { actor: actor() };
  try {
    let vehicleId = $('#reg-vehicle').value;
    const newVehicle = { plate: $('#reg-plate').value, classId: $('#reg-class').value };
    if (!reg.customer) {
      const { customer } = await api(
        'POST',
        '/customers',
        { phone: $('#reg-phone').value, name: $('#reg-name').value, vehicles: [newVehicle] },
        who,
      );
      reg.customer = customer;
      vehicleId = customer.vehicles[0].id;
    } else if (vehicleId === 'new') {
      const { vehicle } = await api('POST', `/customers/${reg.customer.id}/vehicles`, newVehicle, who);
      vehicleId = vehicle.id;
    }
    const { wash } = await api('POST', '/washes', { vehicleId: Number(vehicleId), planId: reg.planId }, who);
    reg.dialog.close();
    await refresh();
    const est = wash.estimate?.estimatedStartAt ? `, início estimado ${formatTime(wash.estimate.estimatedStartAt)}` : '';
    $('#stations-line').textContent = `${wash.code} entrou na fila (${wash.price.final.display}${est}).`;
  } catch (err) {
    showError('#reg-error', err.message);
    $('#reg-submit').disabled = false;
  }
});

refresh();
setInterval(() => {
  if (document.visibilityState === 'visible') refresh();
}, REFRESH_MS);
