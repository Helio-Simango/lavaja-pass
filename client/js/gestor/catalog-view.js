// Catálogo e regras (M14): planos e preços por classe, classes, fidelização, baias e alterações.
// Cada alteração fica registada em nome do gestor da sessão.
import { api } from '../core/api-client.js';
import { $, enableCloseButtons, escapeHtml, hideMessage, showMessage, withoutCurrency } from '../core/dom.js';
import { parseAmountToCents } from '../core/format.js';

const state = { plans: [], classes: [], editing: null };

// Parâmetros de fidelização e a decisão pendente a que cada um corresponde (cap. 11).
const RULE_ROWS = [
  ['Ciclo', (p) => `${p.cycleSize} lavagens elegíveis`, 'proposto'],
  ['Benefícios por nível', (p) => p.levels.map((l) => l.benefitsPerCycle).join(' · ') + ' por ciclo', 'proposto'],
  ['Nível máximo activo', (p) => `Nível ${p.maxActiveLevel}`, 'D-07'],
  ['Passagem de nível', (p) => ({ literal: '10 ciclos por nível', cycles: `${p.levelUp.cyclesPerLevel} ciclo(s) por nível`, period: `frequência em ${p.levelUp.periodDays} dias` })[p.levelUp.mode], 'D-01'],
  ['Nível por', (p) => (p.levelScope === 'class' ? 'classe' : 'cliente'), 'D-04'],
  ['Tipo de benefício', (p, summary) => summary.benefit, 'D-02'],
  ['Gratuito conta para progresso', (p) => (p.freeWashCountsTowardsProgress ? 'sim' : 'não'), 'D-03'],
  ['Acumula com promoções', (p) => (p.stacksWithPromotions ? 'sim' : 'não'), 'D-06'],
];

async function loadPlans() {
  const { plans } = await api('GET', '/plans');
  state.plans = plans;
  const header = `<tr><th>Plano</th><th class="num">Duração</th>${state.classes.map((c) => `<th class="num">${c.code}</th>`).join('')}<th>Estado</th><th></th></tr>`;
  $('#plans-table').innerHTML = header + plans
    .map((plan) => {
      const prices = state.classes
        .map((c) => {
          const price = plan.prices.find((p) => p.classCode === c.code);
          return `<td class="num">${price ? escapeHtml(withoutCurrency(price.price.display)) : '<span class="muted">sem preço</span>'}</td>`;
        })
        .join('');
      const status = plan.active ? '<span class="pill g">Activo</span>' : '<span class="pill">Indisponível</span>';
      return `<tr><td>${escapeHtml(plan.name)}<div class="muted small">${escapeHtml(plan.description ?? '')}</div></td>
        <td class="num">${plan.baseDurationMin} min</td>${prices}<td>${status}</td>
        <td><button class="btn link" data-edit="${plan.id}">Editar</button></td></tr>`;
    })
    .join('');
}

async function loadClasses() {
  const { classes } = await api('GET', '/vehicle-classes');
  state.classes = classes;
  $('#classes-table').innerHTML = classes.map((c) => `<tr><td><strong>${c.code}</strong></td><td>${escapeHtml(c.description)}</td></tr>`).join('');
}

async function loadRules() {
  const { rules } = await api('GET', '/loyalty/rules');
  $('#rules-version').textContent = `v${rules.version}${rules.toValidate ? ' · por validar' : ''}`;
  $('#rules-table').innerHTML = RULE_ROWS.map(
    ([label, value, decision]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value(rules.params, rules.summary))}</td>
      <td><span class="pill ${decision.startsWith('D-') ? 'a' : ''}">${escapeHtml(decision)}</span></td></tr>`,
  ).join('');
}

// ---------- Postos e registo de alterações ----------

const formatDateTime = (iso) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const CHANGE_FORMATS = { priceCents: (v) => (v === null ? 'sem preço' : withoutCurrency(`${(Number(v) / 100).toFixed(2).replace('.', ',')} MZN`)) };

async function loadStations() {
  const { stations } = await api('GET', '/stations');
  $('#stations-table').innerHTML = stations
    .map((s) => `<tr><td><strong>${escapeHtml(s.code)}</strong></td><td>${s.active ? '<span class="pill g">Activa</span>' : '<span class="pill">Inactiva</span>'}</td>
      <td><button class="btn link" data-station="${s.id}" data-active="${!s.active}">${s.active ? 'Desactivar' : 'Activar'}</button></td></tr>`)
    .join('');
}

async function loadChanges() {
  const { changes } = await api('GET', '/change-log');
  const show = (field, value) => (value === null ? '—' : CHANGE_FORMATS[field] ? CHANGE_FORMATS[field](value) : value.length > 40 ? `${value.slice(0, 40)}…` : value);
  $('#changes-table').innerHTML = `<tr><th>Quando</th><th>O quê</th><th>Antes</th><th>Depois</th><th>Quem</th></tr>${changes
    .slice(0, 30)
    .map((c) => `<tr><td>${escapeHtml(formatDateTime(c.createdAt))}</td><td>${escapeHtml(`${c.entityLabel} ${c.entityId} · ${c.field}`)}</td>
      <td>${escapeHtml(show(c.field, c.oldValue))}</td><td>${escapeHtml(show(c.field, c.newValue))}</td><td>${escapeHtml(c.actor)}</td></tr>`)
    .join('') || '<tr><td colspan="5" class="muted">Sem alterações.</td></tr>'}`;
}

/** Liga os eventos uma vez (a vista é criada uma só vez). */
function bindEvents(dialog) {
  $('#stations-table').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-station]');
    if (!button) return;
    await api('PATCH', `/stations/${button.dataset.station}`, { active: button.dataset.active === 'true' });
    await Promise.all([loadStations(), loadChanges()]);
  });

  // ---------- Editar plano ----------

  enableCloseButtons(dialog);
  $('#plans-table').addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit]');
    if (!button) return;
    const plan = state.plans.find((p) => p.id === Number(button.dataset.edit));
    state.editing = plan;
    $('#plan-dialog-title').textContent = `Editar ${plan.name}`;
    $('#plan-name').value = plan.name;
    $('#plan-duration').value = plan.baseDurationMin;
    $('#plan-active').checked = plan.active;
    $('#plan-prices').innerHTML = state.classes
      .map((c) => {
        const price = plan.prices.find((p) => p.classCode === c.code);
        return `<div><label class="lbl" for="price-${c.code}">Classe ${c.code}</label>
          <input class="input" id="price-${c.code}" data-class="${c.code}" inputmode="decimal" value="${price ? escapeHtml(withoutCurrency(price.price.display)) : ''}"></div>`;
      })
      .join('');
    hideMessage($('#plan-error'));
    dialog.showModal();
  });

  $('form', dialog).addEventListener('submit', async (event) => {
    event.preventDefault();
    const plan = state.editing;
    try {
      const patch = { name: $('#plan-name').value, baseDurationMin: Number($('#plan-duration').value), active: $('#plan-active').checked };
      await api('PATCH', `/plans/${plan.id}`, patch);
      for (const input of dialog.querySelectorAll('[data-class]')) {
        if (!input.value.trim()) continue;
        const priceCents = parseAmountToCents(input.value);
        if (priceCents === null) throw new Error(`Preço inválido para a classe ${input.dataset.class}.`);
        await api('PUT', `/plans/${plan.id}/prices/${input.dataset.class}`, { priceCents });
      }
      dialog.close();
      await Promise.all([loadPlans(), loadChanges()]);
    } catch (error) {
      showMessage($('#plan-error'), error.message);
    }
  });
}

export function createCatalogView() {
  bindEvents($('#plan-dialog'));
  return {
    async load() {
      await loadClasses();
      await Promise.all([loadPlans(), loadRules(), loadStations(), loadChanges()]);
    },
  };
}
