// Módulo do analista (perfil Analista bancário, M12). Só a sua instituição e só o que a lavadora
// autorizou. Cada consulta e exportação fica registada e é visível para a lavadora.
import { api } from '../core/api-client.js';
import { renderBarChart } from '../core/charts.js';
import { $, $$, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { fullDate, mzn, shortDate } from '../core/format.js';
import { bindLogout, requireSession } from '../core/session.js';

const PROFILE = 'analista';
const session = await requireSession(PROFILE);
$('#who-name').textContent = session.name;
$('#who-org').textContent = session.institutionName ?? '';
bindLogout($('#logout'), PROFILE);

const state = { authorizations: [], current: null, report: null, view: null };

async function loadAuthorizations() {
  const { authorizations } = await api('GET', '/bank/authorizations');
  state.authorizations = authorizations;
  const active = authorizations.filter((a) => a.status === 'active');
  state.current = active[0] ?? null;
  $('#merchant-count').textContent = `(${active.length ? 1 : 0})`;
  $('#merchants').innerHTML = `<tr><th>Autorização</th><th>Finalidade</th><th>Âmbito</th><th>Validade</th><th>Estado</th><th></th></tr>${authorizations
    .map((a) => `<tr><td class="mono">${escapeHtml(a.reference)}</td><td>${escapeHtml(a.purpose)}</td><td class="small">${escapeHtml(a.sections.map((s) => s.label).join(', '))}</td>
      <td>${fullDate(a.validUntil)}</td><td><span class="pill ${a.status === 'active' ? 'g' : ''}">${escapeHtml(a.statusLabel)}</span></td>
      <td>${a.status === 'active' ? `<button class="btn link" data-open="${a.id}">Abrir →</button>` : ''}</td></tr>`)
    .join('') || '<tr><td colspan="6" class="muted">Nenhum comerciante autorizou a partilha.</td></tr>'}`;
}

$('#merchants').addEventListener('click', (event) => {
  const button = event.target.closest('[data-open]');
  if (!button) return;
  state.current = state.authorizations.find((a) => a.id === Number(button.dataset.open));
  location.hash = 'comerciante';
});

async function loadReport() {
  hideMessage($('#report-error'));
  if (!state.current) {
    $('#report-body').hidden = true;
    showMessage($('#report-error'), 'Não há autorizações activas: sem autorização da lavadora, não há dados.');
    return;
  }
  try {
    const path = `/bank/reports/activity?authorizationId=${state.current.id}`;
    state.report = (await api('GET', path)).report;
    $('#export').href = `/api${path}&format=csv`;
    $('#report-body').hidden = false;
    renderMerchant(state.report);
    renderExtracts(state.report);
  } catch (error) {
    $('#report-body').hidden = true;
    showMessage($('#report-error'), error.message);
  }
}

function kpi(label, value, extra = '') {
  return `<div class="kpi"><span>${label}</span><b>${value}</b>${extra}</div>`;
}

function renderMerchant(report) {
  const score = report.sections.prequalification;
  $('#merchant-name').textContent = report.business;
  $('#nav-merchant').textContent = report.business;
  const holder = [report.holder && `Titular: ${report.holder}`, report.bankAccount, `Partilha autorizada em ${fullDate(report.authorization.grantedAt)}`, `Histórico: ${report.historyDays} dias`].filter(Boolean);
  $('#merchant-line').textContent = holder.join(' · ');
  if (!score) {
    $('#report-kpis').innerHTML = '';
    $('#score-total').textContent = '—';
    showMessage($('#report-error'), 'Esta autorização não inclui a pré-qualificação. Veja os extratos autorizados.');
    return;
  }
  const s = score.summary;
  const pct = (part) => (s.revenue30d.value.cents ? Math.round((part / s.revenue30d.value.cents) * 100) : 0);
  $('#report-kpis').innerHTML = [
    kpi('Receita 30 dias', mzn(s.revenue30d.value.cents), '<em>MZN</em><small>digital + numerário declarado</small>'),
    kpi('Verificado (digital)', mzn(s.digital30d.value.cents), `<em>${pct(s.digital30d.value.cents)}%</em><small>${escapeHtml(s.digital30d.origin)}</small>`),
    kpi('Numerário declarado', mzn(s.cash30d.value.cents), `<em>${pct(s.cash30d.value.cents)}%</em><small>não verificado</small>`),
    kpi('Retenção 30 dias', `${Math.round(s.retention.value ?? 0)}%`, `<em>${s.customers} clientes</em>`),
  ].join('');

  $('#score-class').textContent = `Classe ${score.scoreClass}`;
  $('#score-total').textContent = score.total;
  $('#score-ring').style.background = `conic-gradient(var(--blue) 0 ${score.total}%, var(--line) ${score.total}% 100%)`;
  $('#score-ring').setAttribute('aria-label', `Score ${score.total} de 100, classe ${score.scoreClass}`);
  $('#score-components').innerHTML = score.components
    .map((c) => `<div class="comp"><span>${escapeHtml(c.label)}</span><div class="mbar"><i class="${c.key === score.weakest.key ? 'weak' : ''}" style="width:${Math.round(c.ratio * 100)}%"></i></div><b>${c.points}/${c.weight}</b></div>`)
    .join('');
  const projection = score.projection.scoreClass !== score.scoreClass || score.projection.total !== score.total
    ? ` Com ${score.projection.days} dias ao ritmo actual, estimativa de classe ${score.projection.scoreClass} (${score.projection.total}).`
    : '';
  $('#score-note').innerHTML = `<b>${escapeHtml(score.classLabel)}.</b> Ponto fraco: ${escapeHtml(score.weakest.label.toLowerCase())}.${escapeHtml(projection)}`;
  $('#score-definitions').innerHTML = `<tr><th>Componente</th><th class="num">Peso</th><th>Como se calcula</th></tr>${score.components
    .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${c.weight}</td><td class="small">${escapeHtml(c.definition)}</td></tr>`)
    .join('')}`;

  const i = score.indicative;
  $('#amount').innerHTML = `${mzn(i.amount.cents)}<em>MZN</em>`;
  $('#purpose').textContent = `Finalidade: ${report.authorization.purpose}`;
  const line = (label, value) => `<div class="line-item"><span>${label}</span><b>${value}</b></div>`;
  $('#amount-lines').innerHTML = [
    line('Prazo', `${i.termMonths} meses`),
    line('Amortização', `${Math.round(i.retentionShare * 100)}% dos recebim. digitais`),
    line('Retenção estimada', `≈ ${mzn(i.monthlyRetention.cents)} MZN/mês`),
    line('Taxa', escapeHtml(i.rate)),
  ].join('');
  $('#disclaimer').textContent = score.disclaimer;
  $('#request-analysis').disabled = score.scoreClass === 'C';
}

function renderExtracts(report) {
  const { receipts, activity, dataQuality } = report.sections;
  $('#extract-line').textContent = `${report.business} · ${report.authorization.reference} · dados de ${fullDate(report.period.from)} a ${fullDate(report.period.to)} · consulta registada`;
  if (receipts) {
    renderBarChart($('#report-receipts'), {
      title: 'Recebimentos por semana, por origem',
      categories: receipts.byWeek.map((w) => w.label),
      series: [
        { label: 'Digital confirmado (simulado)', color: 'var(--series-1)', values: receipts.byWeek.map((w) => w.digital.cents) },
        { label: 'Numerário declarado', color: 'var(--series-2)', values: receipts.byWeek.map((w) => w.cash.cents) },
      ],
      format: (cents) => `${mzn(cents)} MZN`,
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
    $('#report-mix').textContent = `Por classe: ${activity.byClass.map((c) => `${c.key} ${c.completed}`).join(' · ')} · por plano: ${activity.byPlan.map((p) => `${p.key} ${p.completed}`).join(' · ')}`;
  }
  $('#report-quality').innerHTML = dataQuality
    ? `<tr><th>Indicador</th><th>Valor</th><th>Origem</th><th>Definição</th></tr>${dataQuality
        .map((q) => `<tr><td>${escapeHtml(q.label)}</td><td>${escapeHtml(q.value)}</td><td>${escapeHtml(q.origin)}</td><td class="muted small">${escapeHtml(q.definition)}</td></tr>`)
        .join('')}`
    : '<tr><td class="muted">Secção não autorizada.</td></tr>';
  $('#report-notes').innerHTML = report.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
}

async function loadMyRequests() {
  const { requests } = await api('GET', '/bank/credit-requests');
  $('#my-requests').innerHTML = requests.length
    ? requests.map((r) => `<div class="line-item"><span>${shortDate(r.createdAt)} · ${escapeHtml(r.authorizationReference)}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</span><b>${r.score.total}/100 · ${mzn(r.indicativeAmount.cents)} MZN</b></div>`).join('')
    : '<p class="muted small">Ainda não pediu análises.</p>';
}

$('#request-analysis').addEventListener('click', async () => {
  hideMessage($('#request-error'));
  const note = prompt('Nota para o pedido de análise (opcional):', 'Encaminhado para análise PME');
  if (note === null) return;
  try {
    await api('POST', '/bank/credit-requests', { authorizationId: state.current.id, note });
    $('#request-analysis').textContent = 'Análise pedida ✓';
    $('#request-analysis').disabled = true;
    await loadMyRequests();
  } catch (error) {
    showMessage($('#request-error'), error.message);
  }
});

// A exportação leva o cabeçalho do perfil (o cookie sozinho não basta): descarrega por fetch.
$('#export').addEventListener('click', async (event) => {
  event.preventDefault();
  const response = await fetch($('#export').getAttribute('href'), { headers: { 'X-Session-Profile': PROFILE } });
  if (!response.ok) return showMessage($('#request-error'), 'Não foi possível exportar o extrato.');
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: `extrato-${state.current.reference}.csv` });
  link.click();
  URL.revokeObjectURL(url);
});

async function show(view) {
  state.view = ['comerciantes', 'comerciante', 'extratos'].includes(view) ? view : 'comerciante';
  for (const section of $$('[data-view]')) section.classList.toggle('on', section.dataset.view === state.view);
  for (const link of $$('[data-nav]')) {
    if (link.dataset.nav === state.view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (state.view === 'comerciantes') return loadAuthorizations();
  if (!state.report || state.report.authorization.id !== state.current?.id) await loadReport();
  if (state.view === 'extratos') await loadMyRequests();
}

window.addEventListener('hashchange', () => show(location.hash.slice(1)));
await loadAuthorizations();
await show(location.hash.slice(1));
