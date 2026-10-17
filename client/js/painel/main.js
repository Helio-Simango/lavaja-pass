// Painel do gestor (M11–M13): indicadores com definição e origem, gráficos, viaturas e histórico.
import { api } from '../core/api-client.js';
import { renderBarChart } from '../core/charts.js';
import { $, escapeHtml } from '../core/dom.js';
import { bindOperatorInput } from '../core/operator.js';
import { renderCapacity } from './capacity-view.js';
import { createClosingView } from './closing-view.js';

const state = { days: 30, classCode: 'A', classes: [], dayOffset: 0 };
const closingView = createClosingView({ actor: bindOperatorInput($('#manager')) });

const formatCount = (value) => new Intl.NumberFormat('pt-PT').format(value);
const formatMzn = (cents) => `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(cents / 100)} MZN`;
const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '—');

// ---------- Indicadores ----------

function indicatorValue(indicator) {
  if (indicator.value === null) return '—';
  if (typeof indicator.value === 'object') return indicator.value.display;
  if (indicator.key === 'returningCustomers') return `${Math.round(indicator.value * 100)}%`;
  return formatCount(indicator.value);
}

function indicatorSub(indicator) {
  if (indicator.key === 'receivable') return `${indicator.count} serviço(s) · não é receita`;
  if (indicator.key === 'returningCustomers') return `${indicator.returning} de ${indicator.customers} clientes`;
  return '';
}

function tileHtml(indicator) {
  return `<article class="tile">
    <div class="label">${escapeHtml(indicator.label)}</div>
    <div class="value">${escapeHtml(indicatorValue(indicator))}</div>
    <div class="sub">${escapeHtml(indicatorSub(indicator))}</div>
    <span class="pill">${escapeHtml(indicator.origin)}</span>
    <details><summary>ⓘ Definição</summary><p>${escapeHtml(indicator.definition)}</p></details>
  </article>`;
}

function yardTileHtml(yard) {
  const total = yard.queued + yard.in_progress + yard.ready;
  return `<article class="tile">
    <div class="label">Agora no pátio</div>
    <div class="value">${total}</div>
    <div class="sub">${yard.queued} em fila · ${yard.in_progress} em execução · ${yard.ready} pronto(s)</div>
    <span class="pill">Registado</span>
  </article>`;
}

async function loadDashboard() {
  const summary = await api('GET', `/dashboard/summary?days=${state.days}`);
  const sharing = summary.activeSharingAuthorizations;
  $('#sharing-status').innerHTML = `<a class="pill ${sharing > 0 ? 'green' : ''}" href="/banco">${sharing} autorização(ões) activa(s)</a>`;
  $('#period-line').textContent = `Últimos ${state.days} dias · calculado a partir dos registos da base de demonstração`;
  $('#tiles').innerHTML = summary.indicators.map(tileHtml).join('') + yardTileHtml(summary.yardNow);

  renderBarChart($('#weekday-chart'), {
    title: 'Serviços concluídos por dia da semana',
    categories: summary.byWeekday.map((d) => d.label),
    series: [{ label: 'Concluídos', color: 'var(--series-1)', values: summary.byWeekday.map((d) => d.completed) }],
    format: formatCount,
  });
  renderBarChart($('#receipts-chart'), {
    title: 'Recebimentos por semana, por origem',
    categories: summary.weeklyReceipts.map((w) => w.label),
    series: [
      { label: 'Digital confirmado (simulado)', color: 'var(--series-1)', values: summary.weeklyReceipts.map((w) => w.digital.cents) },
      { label: 'Numerário declarado', color: 'var(--series-2)', values: summary.weeklyReceipts.map((w) => w.cash.cents) },
    ],
    format: formatMzn,
    axisFormat: (cents) => (cents >= 100_000 ? `${Math.round(cents / 100_000)}k` : formatCount(cents / 100)),
  });
}

document.querySelector('#indicadores .segmented').addEventListener('click', (event) => {
  const button = event.target.closest('[data-days]');
  if (!button) return;
  state.days = Number(button.dataset.days);
  for (const b of event.currentTarget.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
  loadDashboard();
});

// ---------- Capacidade e agenda (M10) ----------

function localDate(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toLocaleDateString('en-CA', { timeZone: 'Africa/Maputo' });
}

async function loadCapacity() {
  const capacity = await api('GET', `/capacity?date=${localDate(state.dayOffset)}`);
  renderCapacity(
    { agenda: $('#agenda'), table: $('#agenda-table'), policyTable: $('#policy-table'), line: $('#capacity-line') },
    capacity,
    new Date().toISOString(),
  );
}

$('#capacity-days').addEventListener('click', (event) => {
  const button = event.target.closest('[data-offset]');
  if (!button) return;
  state.dayOffset = Number(button.dataset.offset);
  for (const b of $('#capacity-days').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
  loadCapacity();
});

// ---------- Viaturas por classe e histórico ----------

async function loadClasses() {
  const { classes } = await api('GET', '/vehicle-classes');
  state.classes = classes;
  $('#class-tabs').innerHTML = classes
    .map((c) => `<button type="button" data-class="${c.code}" aria-pressed="${c.code === state.classCode}">Classe ${c.code}</button>`)
    .join('');
}

async function loadVehicles() {
  const vehicleClass = state.classes.find((c) => c.code === state.classCode);
  $('#class-description').textContent = `${vehicleClass.name} — ${vehicleClass.description}`;
  const { vehicles } = await api('GET', `/vehicles?classId=${state.classCode}`);
  $('#vehicles-table').innerHTML = `<tr><th>Matrícula</th><th>Cliente</th><th class="num">Concluídas</th><th>Última concluída</th><th></th></tr>${vehicles
    .map(
      (v) => `<tr><td class="mono">${escapeHtml(v.plateDisplay)}</td><td>${escapeHtml(v.customer.name)}</td>
        <td class="num">${v.completedCount}</td><td>${escapeHtml(formatDateTime(v.lastCompletedAt))}</td>
        <td><button class="link-button" data-history="${v.id}">Histórico →</button></td></tr>`,
    )
    .join('') || '<tr><td colspan="5" class="muted">Sem viaturas nesta classe.</td></tr>'}`;
}

$('#class-tabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-class]');
  if (!button) return;
  state.classCode = button.dataset.class;
  for (const b of $('#class-tabs').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b === button));
  $('#history').hidden = true;
  loadVehicles();
});

$('#vehicles-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-history]');
  if (!button) return;
  const { vehicle, washes } = await api('GET', `/vehicles/${button.dataset.history}/wash-history`);
  $('#history-title').textContent = `${vehicle.plateDisplay} · ${vehicle.customerName} · classe actual ${vehicle.class.code}`;
  const header = '<tr><th>Data</th><th>Serviço</th><th>Plano</th><th>Cl.</th><th>Estado</th><th class="num">Base</th><th class="num">Desc.</th><th class="num">Benefício</th><th class="num">Final</th><th>Pagamento</th><th>Fidelização</th></tr>';
  const amount = (money) => escapeHtml(money.display.replace(/\s[A-Z]{3}$/, ''));
  $('#history-table').innerHTML = header + washes
    .map(
      (w) => `<tr><td>${escapeHtml(formatDate(w.completedAt ?? w.cancelledAt ?? w.queuedAt))}</td><td class="mono">${escapeHtml(w.code)}</td>
        <td>${escapeHtml(w.planName)}</td><td>${escapeHtml(w.classCode)}</td><td>${escapeHtml(w.statusLabel)}</td>
        <td class="num">${amount(w.price.base)}</td><td class="num">${amount(w.price.discount)}</td><td class="num">${amount(w.price.loyaltyBenefit)}</td>
        <td class="num">${amount(w.price.final)}</td><td>${escapeHtml(w.payment.label)}</td><td>${escapeHtml(w.loyaltyEffect.label)}</td></tr>`,
    )
    .join('');
  $('#history').hidden = false;
  $('#history').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- Arranque ----------

await Promise.all([loadDashboard(), loadClasses(), loadCapacity(), closingView.load()]);
await loadVehicles();
