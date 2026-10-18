// Clientes e viaturas por classe, com o histórico de cada matrícula (valores guardados em cada serviço).
import { api } from '../core/api-client.js';
import { $, $$, escapeHtml } from '../core/dom.js';
import { dateTime, shortDate } from '../core/format.js';

export function createCustomersView() {
  const state = { classCode: 'A', classes: [] };

  $('#class-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-class]');
    if (!button) return;
    state.classCode = button.dataset.class;
    for (const other of $$('#class-tabs [data-class]')) other.setAttribute('aria-pressed', String(other === button));
    $('#history').hidden = true;
    loadVehicles();
  });

  $('#vehicles-table').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-history]');
    if (button) showHistory(button.dataset.history);
  });

  async function load() {
    if (state.classes.length === 0) {
      state.classes = (await api('GET', '/vehicle-classes')).classes;
      $('#class-tabs').innerHTML = state.classes
        .map((c) => `<button type="button" data-class="${c.code}" aria-pressed="${c.code === state.classCode}">Classe ${c.code}</button>`)
        .join('');
    }
    await loadVehicles();
  }

  async function loadVehicles() {
    const vehicleClass = state.classes.find((c) => c.code === state.classCode);
    $('#class-description').textContent = `${vehicleClass.name} — ${vehicleClass.description}`;
    const { vehicles } = await api('GET', `/vehicles?classId=${state.classCode}`);
    $('#vehicles-table').innerHTML = `<tr><th>Matrícula</th><th>Cliente</th><th class="num">Concluídas</th><th>Última concluída</th><th></th></tr>${vehicles
      .map((v) => `<tr><td class="mono">${escapeHtml(v.plateDisplay)}</td><td>${escapeHtml(v.customer.name)}</td><td class="num">${v.completedCount}</td>
        <td>${escapeHtml(dateTime(v.lastCompletedAt))}</td><td><button class="btn link" data-history="${v.id}">Histórico →</button></td></tr>`)
      .join('') || '<tr><td colspan="5" class="muted">Sem viaturas nesta classe.</td></tr>'}`;
  }

  async function showHistory(vehicleId) {
    const { vehicle, washes } = await api('GET', `/vehicles/${vehicleId}/wash-history`);
    $('#history-title').textContent = `${vehicle.plateDisplay} · ${vehicle.customerName} · classe actual ${vehicle.class.code}`;
    const amount = (money) => escapeHtml(money.display.replace(/\s[A-Z]{3}$/, ''));
    $('#history-table').innerHTML = `<tr><th>Data</th><th>Serviço</th><th>Plano</th><th>Cl.</th><th>Estado</th><th class="num">Base</th><th class="num">Benefício</th><th class="num">Final</th><th>Pagamento</th><th>Fidelização</th></tr>${washes
      .map((w) => `<tr><td>${shortDate(w.completedAt ?? w.cancelledAt ?? w.queuedAt)}</td><td class="mono">${escapeHtml(w.code)}</td><td>${escapeHtml(w.planName)}</td>
        <td>${escapeHtml(w.classCode)}</td><td>${escapeHtml(w.statusLabel)}</td><td class="num">${amount(w.price.base)}</td><td class="num">${amount(w.price.loyaltyBenefit)}</td>
        <td class="num">${amount(w.price.final)}</td><td>${escapeHtml(w.payment.label)}</td><td>${escapeHtml(w.loyaltyEffect.label)}</td></tr>`)
      .join('')}`;
    $('#history').hidden = false;
    $('#history').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { load };
}
