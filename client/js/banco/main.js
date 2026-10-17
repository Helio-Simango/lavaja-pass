// Vertente Lavadora–Banco (M15, M16). Demonstração sem autenticação (D-16).
import { api } from '../core/api-client.js';
import { renderBarChart } from '../core/charts.js';
import { $, enableCloseButtons, escapeHtml, hideMessage, showMessage } from '../core/dom.js';

const SECTIONS = [
  ['activity', 'Actividade'],
  ['receipts', 'Recebimentos por origem'],
  ['data_quality', 'Qualidade dos dados'],
  ['customers', 'Clientes (agregado)'],
];
const VIEWS = {
  autorizacoes: ['Partilha com instituições', 'Só o que autorizar, a quem autorizar, pelo tempo que autorizar. Pode revogar a qualquer momento.'],
  relatorio: ['Relatórios autorizados', 'Vista do analista: só o âmbito autorizado, com a origem de cada valor e sem dados pessoais dos clientes finais.'],
};
const ANALYST = 'analista.demo';
const state = { institutions: [], authorizations: [], revoking: null };

const formatDate = (iso) => new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const formatDateTime = (iso) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const formatMzn = (cents) => `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(cents / 100)} MZN`;

// ---------- Vistas ----------

function showView(view) {
  const name = VIEWS[view] ? view : 'autorizacoes';
  for (const section of document.querySelectorAll('.bank-view')) section.hidden = section.id !== name;
  for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-selected', String(tab.dataset.view === name));
  for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab.dataset.view === name));
  [$('#view-title').textContent, $('#view-subtitle').textContent] = VIEWS[name];
  if (name === 'relatorio') loadReportPicker();
}

document.querySelector('[role="tablist"]').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-view]');
  if (tab) location.hash = tab.dataset.view;
});
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

// ---------- Lavadora: autorizações (M15) ----------

async function loadAuthorizations() {
  const [{ authorizations }, { accessLogs }] = await Promise.all([
    api('GET', '/sharing/authorizations'),
    api('GET', '/sharing/access-logs'),
  ]);
  state.authorizations = authorizations;
  const tone = { active: 'green', revoked: '', expired: 'amber' };
  $('#authorizations').innerHTML = authorizations
    .map((a) => {
      const until = a.status === 'revoked' ? `Revogada ${formatDate(a.revokedAt)}` : `${a.statusLabel} até ${formatDate(a.validUntil)}`;
      const revoke = a.status === 'active' ? `<button class="link-button" data-revoke="${a.id}">Revogar ${escapeHtml(a.reference)}</button>` : '';
      return `<article class="authorization">
        <header><strong>${escapeHtml(a.reference)} · ${escapeHtml(a.institution.name)}</strong><span class="pill ${tone[a.status]}">${escapeHtml(until)}</span></header>
        <p>${escapeHtml(a.purpose)}</p>
        <p class="muted">Âmbito: ${escapeHtml(a.sections.map((s) => s.label).join(', '))} · dados dos últimos ${a.dataMonths} meses · ${a.accessCount} acesso(s)</p>
        ${revoke}
      </article>`;
    })
    .join('') || '<p class="muted">Ainda não autorizou nenhuma instituição.</p>';
  $('#access-logs').innerHTML = `<tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Autorização</th></tr>${accessLogs
    .map((log) => `<tr><td>${escapeHtml(formatDateTime(log.createdAt))}</td><td>${escapeHtml(log.actor)}</td><td>${escapeHtml(log.actionLabel)}</td><td>${escapeHtml(log.authorizationReference)}</td></tr>`)
    .join('') || '<tr><td colspan="4" class="muted">Sem acessos.</td></tr>'}`;
}

async function loadInstitutions() {
  state.institutions = (await api('GET', '/institutions')).institutions;
  $('#grant-institution').innerHTML = state.institutions.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
  $('#grant-sections').innerHTML = SECTIONS.map(
    ([key, label]) => `<label><input type="checkbox" value="${key}" checked> ${escapeHtml(label)}</label>`,
  ).join('');
}

$('#grant-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage($('#grant-error'));
  try {
    await api(
      'POST',
      '/sharing/authorizations',
      {
        institutionId: Number($('#grant-institution').value),
        purpose: $('#grant-purpose').value,
        sections: [...document.querySelectorAll('#grant-sections input:checked')].map((input) => input.value),
        dataMonths: Number($('#grant-months').value),
        validDays: Number($('#grant-days').value),
        confirm: $('#grant-confirm').checked,
      },
      { actor: 'Gestor da lavadora' },
    );
    $('#grant-confirm').checked = false;
    await loadAuthorizations();
  } catch (error) {
    showMessage($('#grant-error'), error.message);
  }
});

const revokeDialog = $('#revoke-dialog');
enableCloseButtons(revokeDialog);
$('#authorizations').addEventListener('click', (event) => {
  const button = event.target.closest('[data-revoke]');
  if (!button) return;
  state.revoking = state.authorizations.find((a) => a.id === Number(button.dataset.revoke));
  $('#revoke-title').textContent = `Revogar ${state.revoking.reference}`;
  $('#revoke-reason').value = '';
  revokeDialog.showModal();
});
$('form', revokeDialog).addEventListener('submit', async (event) => {
  event.preventDefault();
  await api('POST', `/sharing/authorizations/${state.revoking.id}/revoke`, { reason: $('#revoke-reason').value }, { actor: 'Gestor da lavadora' });
  revokeDialog.close();
  await loadAuthorizations();
});

// ---------- Banco: relatório (M16) ----------

async function loadReportPicker() {
  const { authorizations } = await api('GET', '/sharing/authorizations');
  const active = authorizations.filter((a) => a.status === 'active');
  $('#report-authorization').innerHTML = active
    .map((a) => `<option value="${a.id}" data-institution="${a.institution.id}">${escapeHtml(a.reference)} · ${escapeHtml(a.institution.name)} · ${escapeHtml(a.purpose)}</option>`)
    .join('');
  if (active.length === 0) {
    $('#report').innerHTML = '<p class="panel muted">Não há autorizações activas: sem autorização, não há relatório.</p>';
    $('#export-csv').hidden = true;
    return;
  }
  $('#export-csv').hidden = false;
  await loadReport();
}

$('#report-authorization').addEventListener('change', loadReport);

async function loadReport() {
  const option = $('#report-authorization').selectedOptions[0];
  const path = `/institutions/${option.dataset.institution}/reports/activity?authorizationId=${option.value}`;
  $('#export-csv').href = `/api${path}&format=csv`;
  try {
    const { report } = await api('GET', path, undefined, { actor: ANALYST });
    renderReport(report);
  } catch (error) {
    $('#report').innerHTML = `<p class="error-box">${escapeHtml(error.message)}</p>`;
  }
}

$('#export-csv').addEventListener('click', () => setTimeout(loadAuthorizations, 500));

function tile(label, value, origin) {
  return `<article class="tile"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div><span class="pill">${escapeHtml(origin)}</span></article>`;
}

function renderReport(report) {
  const { activity, receipts, customers, dataQuality } = report.sections;
  const tiles = [
    activity && tile(activity.completed.label, String(activity.completed.value), activity.completed.origin),
    receipts && tile(receipts.digitalConfirmed.label, receipts.digitalConfirmed.value.display, receipts.digitalConfirmed.origin),
    receipts && tile(receipts.cashDeclared.label, receipts.cashDeclared.value.display, receipts.cashDeclared.origin),
    customers && tile(customers.returningCustomers.label, customers.returningCustomers.value === null ? '—' : `${Math.round(customers.returningCustomers.value)}%`, `${customers.returningCustomers.origin} · agregado`),
  ].filter(Boolean);

  $('#report').innerHTML = `
    <div class="report-head panel">
      <h2>${escapeHtml(report.business)} · relatório de actividade</h2>
      <p class="muted">Autorização ${escapeHtml(report.authorization.reference)} · finalidade: ${escapeHtml(report.authorization.purpose)} ·
        dados de ${formatDate(report.period.from)} a ${formatDate(report.period.to)} · emitido ${formatDateTime(report.issuedAt)} · consulta registada</p>
    </div>
    <div class="tiles">${tiles.join('')}</div>
    <div class="panels two">
      ${receipts ? `<article class="panel"><h2>Recebimentos por semana · por origem</h2><div id="report-receipts"></div>
        <p class="muted small">Reembolsado: ${escapeHtml(receipts.refunded.value.display)} · por receber: ${escapeHtml(receipts.receivable.value.display)} (não é receita).</p></article>` : ''}
      ${activity ? `<article class="panel"><h2>Serviços concluídos por semana</h2><div id="report-activity"></div>
        <p class="muted small">Por classe: ${escapeHtml(activity.byClass.map((c) => `${c.key} ${c.completed}`).join(' · '))} · por plano: ${escapeHtml(activity.byPlan.map((p) => `${p.key} ${p.completed}`).join(' · '))}</p></article>` : ''}
    </div>
    ${dataQuality ? `<article class="panel"><h2>Qualidade dos dados</h2><table class="data-table">
      <tr><th>Indicador</th><th>Valor</th><th>Origem</th><th>Definição</th></tr>
      ${dataQuality.map((q) => `<tr><td>${escapeHtml(q.label)}</td><td>${escapeHtml(q.value)}</td><td>${escapeHtml(q.origin)}</td><td class="muted">${escapeHtml(q.definition)}</td></tr>`).join('')}
      </table><p class="muted small">Indicadores descritivos para o banco interpretar; o LavaJá Pass não os converte numa nota nem numa recomendação.</p></article>` : ''}
    <article class="panel"><h2>Notas</h2><ul class="notes">${report.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></article>`;

  if (receipts) {
    renderBarChart($('#report-receipts'), {
      title: 'Recebimentos por semana, por origem',
      categories: receipts.byWeek.map((w) => w.label),
      series: [
        { label: 'Digital confirmado (simulado)', color: 'var(--series-1)', values: receipts.byWeek.map((w) => w.digital.cents) },
        { label: 'Numerário declarado', color: 'var(--series-2)', values: receipts.byWeek.map((w) => w.cash.cents) },
      ],
      format: formatMzn,
      axisFormat: (cents) => (cents >= 100_000 ? `${Math.round(cents / 100_000)}k` : String(Math.round(cents / 100))),
    });
  }
  if (activity) {
    renderBarChart($('#report-activity'), {
      title: 'Serviços concluídos por semana',
      categories: activity.byWeek.map((w) => w.label),
      series: [{ label: 'Concluídos', color: 'var(--series-1)', values: activity.byWeek.map((w) => w.completed) }],
      format: (value) => String(value),
    });
  }
}

// ---------- Arranque ----------

await loadInstitutions();
await loadAuthorizations();
showView(location.hash.slice(1));
