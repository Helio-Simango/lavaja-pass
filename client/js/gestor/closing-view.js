// Fecho do dia (cap. 13.3): caixa por operador e inconsistências com correcções registadas.
import { api } from '../core/api-client.js';
import { $, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { parseAmountToCents } from '../core/format.js';

const formatTime = (iso) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

export function createClosingView() {
  const errorBox = $('#closing-error');
  let date = null;

  async function load() {
    render(await api('GET', '/reconciliation'));
  }

  function render(day) {
    date = day.date;
    $('#closings-table').innerHTML = `<tr><th>Operador</th><th class="num">Declarado</th><th>Contado</th><th>Diferença</th></tr>${day.operators
      .map((o) => {
        const closing = o.closing
          ? `<td>${escapeHtml(o.closing.counted.display)}</td><td>${escapeHtml(o.closing.difference.display)}${o.closing.note ? ` · ${escapeHtml(o.closing.note)}` : ''}</td>`
          : `<td colspan="2"><input class="counted" data-counted="${escapeHtml(o.operator)}" inputmode="decimal" placeholder="Contado">
              <input class="counted" data-note="${escapeHtml(o.operator)}" placeholder="Nota (se houver diferença)">
              <button class="btn sm k" data-close="${escapeHtml(o.operator)}">Fechar</button></td>`;
        return `<tr><td>${escapeHtml(o.operator)}</td><td class="num">${escapeHtml(o.declared.display)} <span class="muted">(${o.count})</span></td>${closing}</tr>`;
      })
      .join('') || '<tr><td colspan="4" class="muted">Sem numerário declarado hoje.</td></tr>'}`;

    $('#issues').innerHTML = day.issues
      .map((issue, index) => {
        const subject = [issue.washCode, issue.plateDisplay, issue.operator].filter(Boolean).join(' · ');
        const corrections = issue.corrections.map((c) => `<li>${escapeHtml(c.note)} — ${escapeHtml(c.actor)}, ${formatTime(c.createdAt)}</li>`).join('');
        return `<div class="issue"><strong>${escapeHtml(issue.label)}</strong> · ${escapeHtml(subject)} · ${escapeHtml(issue.amount.display)}
          ${issue.reason ? `<div class="muted small">Motivo: ${escapeHtml(issue.reason)}</div>` : ''}
          ${corrections ? `<ul class="corrections">${corrections}</ul>` : ''}
          <form data-issue="${index}"><input placeholder="Registar correcção ou nota" maxlength="300"><button class="btn sm o" type="submit">Registar</button></form></div>`;
      })
      .join('') || '<p class="muted">Sem inconsistências hoje.</p>';
    $('#issues').dataset.issues = JSON.stringify(day.issues.map((i) => ({ code: i.code, washId: i.washId })));
  }

  $('#closings-table').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-close]');
    if (!button) return;
    hideMessage(errorBox);
    const operator = button.dataset.close;
    const countedCents = parseAmountToCents(document.querySelector(`[data-counted="${CSS.escape(operator)}"]`).value);
    if (countedCents === null) return showMessage(errorBox, 'Indique o valor contado, ex.: 450,00.');
    try {
      const note = document.querySelector(`[data-note="${CSS.escape(operator)}"]`).value;
      render(await api('POST', '/reconciliation/closings', { date, operator, countedCents, note }));
    } catch (error) {
      showMessage(errorBox, error.message);
    }
  });

  $('#issues').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideMessage(errorBox);
    const form = event.target.closest('[data-issue]');
    const issue = JSON.parse($('#issues').dataset.issues)[Number(form.dataset.issue)];
    try {
      render(
        await api('POST', '/reconciliation/corrections', { date, washId: issue.washId, issueCode: issue.code, note: form.querySelector('input').value }),
      );
    } catch (error) {
      showMessage(errorBox, error.message);
    }
  });

  return { load };
}
