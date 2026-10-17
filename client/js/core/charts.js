// Gráfico de barras em SVG (sem bibliotecas): uma ou mais séries lado a lado, nunca empilhadas,
// para que valores de origens diferentes não pareçam somados. Inclui tooltip (rato e teclado),
// legenda quando há duas ou mais séries e uma tabela com os mesmos dados.
import { escapeHtml } from './dom.js';

const WIDTH = 440;
const HEIGHT = 200;
const MARGIN = { top: 10, right: 6, bottom: 24, left: 44 };
const BAR_GAP = 2; // espaço de superfície entre barras adjacentes
const MAX_BAR_WIDTH = 28;
const RADIUS = 4;
const TICKS = 4;

/**
 * @param container elemento onde desenhar
 * @param options {
 *   title: string (nome acessível),
 *   categories: string[],
 *   series: [{ label, color: 'var(--series-1)', values: number[] }],
 *   format: (value) => string,
 *   axisFormat?: (value) => string
 * }
 */
export function renderBarChart(container, { title, categories, series, format, axisFormat = format }) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const y = (value) => MARGIN.top + plotHeight - (value / max) * plotHeight;
  const columnWidth = plotWidth / categories.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, (columnWidth * 0.7 - BAR_GAP * (series.length - 1)) / series.length);
  const groupWidth = barWidth * series.length + BAR_GAP * (series.length - 1);

  const grid = Array.from({ length: TICKS + 1 }, (_, i) => {
    const value = (max / TICKS) * i;
    return `<line class="grid-line" x1="${MARGIN.left}" x2="${WIDTH - MARGIN.right}" y1="${y(value)}" y2="${y(value)}"/>
      <text class="axis-label" x="${MARGIN.left - 8}" y="${y(value) + 4}" text-anchor="end">${escapeHtml(axisFormat(value))}</text>`;
  }).join('');

  const columns = categories
    .map((category, index) => {
      const x0 = MARGIN.left + columnWidth * index;
      const groupStart = x0 + (columnWidth - groupWidth) / 2;
      const bars = series
        .map((s, k) => roundedBar(groupStart + k * (barWidth + BAR_GAP), y(s.values[index]), barWidth, y(0), s.color))
        .join('');
      return `<g class="column" data-index="${index}">
        <rect class="hit" x="${x0}" y="${MARGIN.top}" width="${columnWidth}" height="${plotHeight}" tabindex="0"
          aria-label="${escapeHtml(describe(category, index, series, format))}"/>
        ${bars}
        <text class="axis-label" x="${x0 + columnWidth / 2}" y="${HEIGHT - 8}" text-anchor="middle">${escapeHtml(category)}</text>
      </g>`;
    })
    .join('');

  const legend = series.length > 1
    ? `<ul class="chart-legend">${series.map((s) => `<li><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</li>`).join('')}</ul>`
    : '';

  container.classList.add('chart');
  container.innerHTML = `${legend}
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(title)}">${grid}${columns}</svg>
    <div class="chart-tooltip" hidden></div>
    <details><summary>Ver tabela</summary>${tableHtml(categories, series, format)}</details>`;

  bindTooltip(container, categories, series, format);
}

function roundedBar(x, top, width, base, color) {
  const height = base - top;
  if (height <= 0) return '';
  const r = Math.min(RADIUS, height, width / 2);
  const d = `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${base} Z`;
  return `<path d="${d}" fill="${color}"/>`;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude * TICKS >= value) * magnitude;
  return step * TICKS;
}

function describe(category, index, series, format) {
  return `${category}: ${series.map((s) => `${s.label} ${format(s.values[index])}`).join(', ')}`;
}

function tableHtml(categories, series, format) {
  const head = `<tr><th></th>${series.map((s) => `<th class="num">${escapeHtml(s.label)}</th>`).join('')}</tr>`;
  const rows = categories
    .map((category, i) => `<tr><td>${escapeHtml(category)}</td>${series.map((s) => `<td class="num">${escapeHtml(format(s.values[i]))}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="data-table">${head}${rows}</table>`;
}

function bindTooltip(container, categories, series, format) {
  const tooltip = container.querySelector('.chart-tooltip');
  const show = (column) => {
    container.querySelectorAll('.column.active').forEach((c) => c.classList.remove('active'));
    column.classList.add('active');
    const index = Number(column.dataset.index);
    tooltip.innerHTML = `<strong>${escapeHtml(categories[index])}</strong>${series
      .map((s) => `<span class="row"><span class="swatch" style="background:${s.color};width:8px;height:8px;border-radius:2px;display:inline-block"></span>${escapeHtml(s.label)}: ${escapeHtml(format(s.values[index]))}</span>`)
      .join('')}`;
    tooltip.hidden = false;
    const box = column.querySelector('.hit').getBoundingClientRect();
    const host = container.getBoundingClientRect();
    const left = Math.min(box.left - host.left + box.width / 2, host.width - tooltip.offsetWidth / 2);
    tooltip.style.left = `${Math.max(tooltip.offsetWidth / 2, left) - tooltip.offsetWidth / 2}px`;
    tooltip.style.top = `${box.top - host.top - tooltip.offsetHeight - 6 + 30}px`;
  };
  const hide = () => {
    tooltip.hidden = true;
    container.querySelectorAll('.column.active').forEach((c) => c.classList.remove('active'));
  };
  container.querySelectorAll('.column').forEach((column) => {
    column.addEventListener('mouseenter', () => show(column));
    column.addEventListener('focusin', () => show(column));
  });
  container.querySelector('svg').addEventListener('mouseleave', hide);
  container.addEventListener('focusout', hide);
}
