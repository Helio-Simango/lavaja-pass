// Conciliação: indicadores do período com definição e origem, recebimentos por origem (lado a lado,
// nunca somados) e o fecho do dia por operador.
import { api } from '../core/api-client.js';
import { renderBarChart } from '../core/charts.js';
import { $, $$, escapeHtml } from '../core/dom.js';
import { mzn } from '../core/format.js';
import { createClosingView } from './closing-view.js';

const formatCount = (value) => new Intl.NumberFormat('pt-PT').format(value);

export function createReconciliationView() {
  const closing = createClosingView();
  let days = 30;

  $('#period').addEventListener('click', (event) => {
    const button = event.target.closest('[data-days]');
    if (!button) return;
    days = Number(button.dataset.days);
    for (const other of $$('#period [data-days]')) other.setAttribute('aria-pressed', String(other === button));
    loadIndicators();
  });

  async function load() {
    await Promise.all([loadIndicators(), closing.load()]);
  }

  async function loadIndicators() {
    const summary = await api('GET', `/dashboard/summary?days=${days}`);
    $('#period-line').textContent = `Últimos ${days} dias · calculado a partir dos registos. Cada indicador mostra a definição e a origem (ⓘ).`;
    $('#tiles').innerHTML = summary.indicators.map(tileHtml).join('');
    renderBarChart($('#receipts-chart'), {
      title: 'Recebimentos por semana, por origem',
      categories: summary.weeklyReceipts.map((w) => w.label),
      series: [
        { label: 'Digital confirmado (simulado)', color: 'var(--series-1)', values: summary.weeklyReceipts.map((w) => w.digital.cents) },
        { label: 'Numerário declarado', color: 'var(--series-2)', values: summary.weeklyReceipts.map((w) => w.cash.cents) },
      ],
      format: (cents) => `${mzn(cents)} MZN`,
      axisFormat: (cents) => (cents >= 100_000 ? `${Math.round(cents / 100_000)}k` : formatCount(cents / 100)),
    });
    renderBarChart($('#weekday-chart'), {
      title: 'Serviços concluídos por dia da semana',
      categories: summary.byWeekday.map((d) => d.label),
      series: [{ label: 'Concluídos', color: 'var(--series-1)', values: summary.byWeekday.map((d) => d.completed) }],
      format: formatCount,
    });
  }

  return { load };
}

function indicatorValue(indicator) {
  if (indicator.value === null) return '—';
  if (typeof indicator.value === 'object') return `${mzn(indicator.value.cents)} MZN`;
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
