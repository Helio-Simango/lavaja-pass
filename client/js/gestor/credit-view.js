// Crédito · partilha com o Moza Banco (lado da lavadora): autorizar com finalidade, âmbito e validade,
// revogar, ver cada acesso do banco e os pedidos de análise. O banco nunca vê nomes nem telefones.
import { api } from '../core/api-client.js';
import { $, enableCloseButtons, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { dateTime, fullDate, mzn } from '../core/format.js';

const SECTIONS = [
  ['prequalification', 'Pré-qualificação (score indicativo)'],
  ['activity', 'Actividade'],
  ['receipts', 'Recebimentos por origem'],
  ['data_quality', 'Qualidade dos dados'],
  ['customers', 'Clientes (agregado)'],
];
const TONES = { active: 'g', revoked: '', expired: 'a' };

export function createCreditView() {
  const state = { authorizations: [], revoking: null, institutionsLoaded: false };
  const revokeDialog = $('#revoke-dialog');
  enableCloseButtons(revokeDialog);

  $('#grant-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage($('#grant-error'));
    try {
      await api('POST', '/sharing/authorizations', {
        institutionId: Number($('#grant-institution').value),
        purpose: $('#grant-purpose').value,
        sections: [...document.querySelectorAll('#grant-sections input:checked')].map((input) => input.value),
        dataMonths: Number($('#grant-months').value),
        validDays: Number($('#grant-days').value),
        confirm: $('#grant-confirm').checked,
      });
      $('#grant-confirm').checked = false;
      await load();
    } catch (error) {
      showMessage($('#grant-error'), error.message);
    }
  });

  $('#authorizations').addEventListener('click', (event) => {
    const button = event.target.closest('[data-revoke]');
    if (!button) return;
    state.revoking = state.authorizations.find((a) => a.id === Number(button.dataset.revoke));
    $('#revoke-title').textContent = `Revogar ${state.revoking.reference}`;
    $('#revoke-reason').value = '';
    revokeDialog.showModal();
  });

  revokeDialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await api('POST', `/sharing/authorizations/${state.revoking.id}/revoke`, { reason: $('#revoke-reason').value });
    revokeDialog.close();
    await load();
  });

  async function load() {
    if (!state.institutionsLoaded) {
      const { institutions } = await api('GET', '/institutions');
      $('#grant-institution').innerHTML = institutions.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
      $('#grant-sections').innerHTML = SECTIONS.map(([key, label]) => `<label class="check" style="margin-top:4px"><input type="checkbox" value="${key}" checked><span>${escapeHtml(label)}</span></label>`).join('');
      state.institutionsLoaded = true;
    }
    const [{ authorizations }, { accessLogs }, { requests }] = await Promise.all([
      api('GET', '/sharing/authorizations'),
      api('GET', '/sharing/access-logs'),
      api('GET', '/sharing/credit-requests'),
    ]);
    state.authorizations = authorizations;
    $('#authorizations').innerHTML = authorizations
      .map((a) => {
        const until = a.status === 'revoked' ? `Revogada ${fullDate(a.revokedAt)}` : `${a.statusLabel} até ${fullDate(a.validUntil)}`;
        const revoke = a.status === 'active' ? `<button class="btn link" data-revoke="${a.id}">Revogar ${escapeHtml(a.reference)}</button>` : '';
        return `<article class="authorization">
          <header><b>${escapeHtml(a.reference)} · ${escapeHtml(a.institution.name)}</b><span class="pill ${TONES[a.status]}">${escapeHtml(until)}</span></header>
          <p>${escapeHtml(a.purpose)}</p>
          <p class="muted">Âmbito: ${escapeHtml(a.sections.map((s) => s.label).join(', '))} · dados dos últimos ${a.dataMonths} meses · ${a.accessCount} acesso(s)</p>
          ${revoke}
        </article>`;
      })
      .join('') || '<p class="muted small">Ainda não autorizou nenhuma instituição.</p>';
    $('#credit-requests').innerHTML = requests.length
      ? requests.map((r) => `<div class="line-item"><span>${escapeHtml(dateTime(r.createdAt))} · ${escapeHtml(r.institutionName)} (${escapeHtml(r.authorizationReference)})<br>
          <span class="muted small">${escapeHtml(r.requestedBy)}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</span></span>
          <b>${r.score.total}/100 · ${escapeHtml(r.score.scoreClass)}<br><span class="muted small">${mzn(r.indicativeAmount.cents)} MZN indicativo</span></b></div>`).join('')
      : '<p class="muted small">Sem pedidos. Um pedido de análise não é uma decisão: a decisão de crédito é do banco.</p>';
    $('#access-logs').innerHTML = `<tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Autorização</th></tr>${accessLogs
      .map((log) => `<tr><td>${escapeHtml(dateTime(log.createdAt))}</td><td>${escapeHtml(log.actor)}</td><td>${escapeHtml(log.actionLabel)}</td><td>${escapeHtml(log.authorizationReference)}</td></tr>`)
      .join('') || '<tr><td colspan="4" class="muted">Sem acessos.</td></tr>'}`;
  }

  return { load };
}
