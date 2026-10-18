// Nova entrada (M8): matrícula + serviço, telefone opcional. Antes de confirmar mostra a viatura
// conhecida, o preço da classe e a hora prevista (estimativa). O preço é sempre do servidor.
import { api } from '../core/api-client.js';
import { $, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { mzn, time } from '../core/format.js';

const PREVIEW_DELAY_MS = 350;

export function createEntrySheet(sheet, { onRegistered }) {
  const field = (id) => $(`#${id}`, sheet);
  const state = { plans: [], classes: [], planId: null, classCode: null, known: null, timer: null, phoneTimer: null, customerKnown: false };

  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('[data-close-sheet]')) close();
  });
  field('entry-plate').addEventListener('input', schedulePreview);
  field('entry-phone').addEventListener('input', schedulePhoneCheck);
  field('entry-plans').addEventListener('click', (event) => pick(event, 'plan'));
  field('entry-classes').addEventListener('click', (event) => pick(event, 'class'));
  field('entry-form').addEventListener('submit', submit);

  async function open() {
    if (state.plans.length === 0) {
      const [{ plans }, { classes }] = await Promise.all([api('GET', '/plans'), api('GET', '/vehicle-classes')]);
      state.plans = plans.filter((plan) => plan.active);
      state.classes = classes;
    }
    Object.assign(state, { planId: null, classCode: 'A', known: null, customerKnown: false });
    for (const id of ['entry-plate', 'entry-phone', 'entry-name']) field(id).value = '';
    field('entry-loyalty').checked = false;
    field('entry-marketing').checked = false;
    field('entry-known').textContent = '';
    field('entry-new-customer').hidden = true;
    hideMessage(field('entry-error'));
    render();
    sheet.hidden = false;
    field('entry-plate').focus();
  }

  function close() {
    sheet.hidden = true;
  }

  function render() {
    const classCode = state.known?.classCode ?? state.classCode;
    field('entry-class-block').hidden = Boolean(state.known) || !field('entry-plate').value.trim();
    field('entry-classes').innerHTML = state.classes
      .map((c) => `<button type="button" class="chip" role="radio" data-class="${c.code}" aria-checked="${c.code === state.classCode}">Classe ${c.code}</button>`)
      .join('');
    field('entry-plans').innerHTML = state.plans
      .map((plan) => {
        const price = plan.prices.find((p) => p.classCode === classCode);
        const label = price ? `${escapeHtml(plan.name)} · ${mzn(price.price.cents)}` : `${escapeHtml(plan.name)} · sem preço`;
        return `<button type="button" class="chip" role="radio" data-plan="${plan.id}" aria-checked="${plan.id === state.planId}" ${price ? '' : 'disabled'}>${label}</button>`;
      })
      .join('');
    field('entry-submit').disabled = !(state.planId && field('entry-plate').value.trim());
  }

  function pick(event, kind) {
    const chip = event.target.closest(kind === 'plan' ? '[data-plan]' : '[data-class]');
    if (!chip || chip.disabled) return;
    if (kind === 'plan') state.planId = Number(chip.dataset.plan);
    else state.classCode = chip.dataset.class;
    render();
    preview();
  }

  function schedulePreview() {
    clearTimeout(state.timer);
    state.timer = setTimeout(preview, PREVIEW_DELAY_MS);
    render();
  }

  async function preview() {
    const plate = field('entry-plate').value.trim();
    const query = new URLSearchParams({ classId: state.classCode });
    if (plate.replace(/\s/g, '').length >= 6) query.set('plate', plate);
    if (state.planId) query.set('planId', state.planId);
    try {
      const result = await api('GET', `/yard/entries/preview?${query}`);
      state.known = result.vehicle;
      field('entry-known').textContent = result.vehicle ? `Viatura conhecida: ${result.vehicle.customerName} · classe ${result.vehicle.classCode}` : plate ? 'Matrícula nova: escolha a classe.' : '';
      field('entry-phone').disabled = Boolean(result.vehicle); // viatura conhecida: o cliente já existe
      const estimate = result.estimate;
      field('entry-estimate').innerHTML = estimate
        ? `Fila: <b>${estimate.position}.º</b> · Pronto por volta das <b>${time(estimate.estimatedEndAt)}</b> <span class="muted">(estimativa)</span>`
        : 'Escolha o serviço para ver a hora prevista.';
      hideMessage(field('entry-error'));
    } catch (error) {
      if (error.details?.field === 'plate') field('entry-known').textContent = 'Matrícula ainda incompleta.';
      else showMessage(field('entry-error'), error.message);
    }
    render();
  }

  function schedulePhoneCheck() {
    clearTimeout(state.phoneTimer);
    state.phoneTimer = setTimeout(checkPhone, PREVIEW_DELAY_MS);
  }

  /** Telefone novo: pede o nome e os consentimentos (o cliente decide; nada vem marcado). */
  async function checkPhone() {
    const phone = field('entry-phone').value.trim();
    if (phone.replace(/\D/g, '').length < 9) {
      field('entry-new-customer').hidden = true;
      return;
    }
    try {
      await api('GET', `/customers?phone=${encodeURIComponent(phone)}`);
      state.customerKnown = true;
    } catch (error) {
      state.customerKnown = error.code !== 'NOT_FOUND';
    }
    field('entry-new-customer').hidden = state.customerKnown;
  }

  async function submit(event) {
    event.preventDefault();
    hideMessage(field('entry-error'));
    field('entry-submit').disabled = true;
    try {
      const body = { plate: field('entry-plate').value, planId: state.planId, classId: state.known ? undefined : state.classCode };
      const phone = field('entry-phone').value.trim();
      if (phone && !state.known) {
        Object.assign(body, {
          phone,
          name: field('entry-name').value,
          consents: { loyalty: field('entry-loyalty').checked, marketing: field('entry-marketing').checked },
        });
      }
      const { wash } = await api('POST', '/yard/entries', body);
      close();
      onRegistered(wash);
    } catch (error) {
      showMessage(field('entry-error'), error.message);
      field('entry-submit').disabled = false;
    }
  }

  return { open, isOpen: () => !sheet.hidden };
}
