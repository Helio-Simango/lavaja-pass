// Registar serviço (M8): procura o cliente pelo telefone, escolhe ou cria a viatura e escolhe o plano.
// O preço é sempre calculado pelo servidor.
import { api } from '../core/api-client.js';
import { $, enableCloseButtons, escapeHtml, hideMessage, showMessage, withoutCurrency } from '../core/dom.js';

const NEW_VEHICLE = 'new';

export function createRegisterDialog(dialog, { actor, onRegistered }) {
  const field = (id) => $(`#${id}`, dialog);
  const state = { customer: null, loyalty: null, classesLoaded: false, planId: null };

  enableCloseButtons(dialog);
  field('reg-lookup').addEventListener('click', lookupCustomer);
  field('reg-phone').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    lookupCustomer();
  });
  field('reg-vehicle').addEventListener('change', loadPlansForSelectedClass);
  field('reg-class').addEventListener('change', loadPlansForSelectedClass);
  field('reg-plans').addEventListener('click', selectPlan);
  $('form', dialog).addEventListener('submit', submit);

  async function open() {
    reset();
    await loadClassesOnce();
    dialog.showModal();
    field('reg-phone').focus();
  }

  function reset() {
    Object.assign(state, { customer: null, loyalty: null, planId: null });
    for (const id of ['reg-phone', 'reg-name', 'reg-plate']) field(id).value = '';
    field('reg-customer').textContent = '';
    field('reg-new-customer').hidden = true;
    field('reg-vehicle-block').hidden = true;
    hideMessage(field('reg-error'));
    field('reg-submit').disabled = true;
  }

  async function loadClassesOnce() {
    if (state.classesLoaded) return;
    const { classes } = await api('GET', '/vehicle-classes');
    field('reg-class').innerHTML = classes
      .map((c) => `<option value="${c.code}">${escapeHtml(c.code)} · ${escapeHtml(c.description.split(',')[0])}</option>`)
      .join('');
    state.classesLoaded = true;
  }

  async function lookupCustomer() {
    hideMessage(field('reg-error'));
    const phone = field('reg-phone').value.trim();
    if (!phone) return;
    try {
      state.customer = (await api('GET', `/customers?phone=${encodeURIComponent(phone)}`)).customer;
      state.loyalty = (await api('GET', `/customers/${state.customer.id}/loyalty`)).loyalty;
      field('reg-customer').textContent = `Cliente encontrado: ${state.customer.name} (${state.customer.phoneDisplay})`;
      field('reg-new-customer').hidden = true;
    } catch (error) {
      if (error.code !== 'NOT_FOUND') {
        showMessage(field('reg-error'), error.message);
        return;
      }
      Object.assign(state, { customer: null, loyalty: null });
      field('reg-customer').textContent = 'Cliente novo: indique o nome e a viatura.';
      field('reg-new-customer').hidden = false;
    }
    renderVehicleOptions(state.customer?.vehicles ?? []);
    field('reg-vehicle-block').hidden = false;
    await loadPlansForSelectedClass();
  }

  function renderVehicleOptions(vehicles) {
    const options = vehicles.map(
      (v) => `<option value="${v.id}">${escapeHtml(v.plateDisplay)} · ${escapeHtml(v.class.code)}</option>`,
    );
    field('reg-vehicle').innerHTML = [...options, `<option value="${NEW_VEHICLE}">+ Nova viatura</option>`].join('');
  }

  function selectedClassCode() {
    const vehicleId = field('reg-vehicle').value;
    if (vehicleId === NEW_VEHICLE) return field('reg-class').value;
    return state.customer.vehicles.find((v) => String(v.id) === vehicleId)?.class.code;
  }

  async function loadPlansForSelectedClass() {
    field('reg-new-vehicle').hidden = field('reg-vehicle').value !== NEW_VEHICLE;
    const classCode = selectedClassCode();
    field('reg-plan-class').textContent = `(preços da classe ${classCode})`;
    const { plans } = await api('GET', `/plans?classId=${classCode}`);
    if (!plans.some((plan) => plan.id === state.planId && plan.available)) state.planId = null;
    field('reg-plans').innerHTML = plans.map(planOptionHtml).join('');
    field('reg-submit').disabled = state.planId === null;
    renderBenefitOption(classCode);
  }

  /** O benefício é por classe: só aparece se o cliente tiver saldo na classe da viatura escolhida. */
  function renderBenefitOption(classCode) {
    const progress = state.loyalty?.classes.find((c) => c.classCode === classCode);
    const available = progress?.benefitsAvailable ?? 0;
    field('reg-benefit-block').hidden = available === 0;
    field('reg-benefit').checked = false;
    if (available > 0) {
      field('reg-benefit-text').textContent = `Usar benefício de fidelização: ${progress.benefit} (${available} disponível na classe ${classCode})`;
    }
  }

  function planOptionHtml(plan) {
    const why = plan.unavailableReason === 'PLAN_INACTIVE' ? 'Plano indisponível' : 'Sem preço para esta classe';
    const price = plan.price ? escapeHtml(withoutCurrency(plan.price.display)) : '—';
    return `<button type="button" class="plan-option" role="radio" data-plan="${plan.id}"
      aria-checked="${plan.id === state.planId}" ${plan.available ? '' : 'disabled'} title="${plan.available ? '' : why}">
      ${escapeHtml(plan.name)} · ${price}</button>`;
  }

  function selectPlan(event) {
    const button = event.target.closest('[data-plan]');
    if (!button || button.disabled) return;
    state.planId = Number(button.dataset.plan);
    for (const option of field('reg-plans').querySelectorAll('[data-plan]')) {
      option.setAttribute('aria-checked', String(option === button));
    }
    field('reg-submit').disabled = false;
  }

  async function submit(event) {
    event.preventDefault();
    hideMessage(field('reg-error'));
    field('reg-submit').disabled = true;
    try {
      const vehicleId = await ensureVehicle();
      const useBenefit = !field('reg-benefit-block').hidden && field('reg-benefit').checked;
      const { wash } = await api('POST', '/washes', { vehicleId, planId: state.planId, useBenefit }, { actor: actor() });
      dialog.close();
      onRegistered(wash);
    } catch (error) {
      showMessage(field('reg-error'), error.message);
      field('reg-submit').disabled = false;
    }
  }

  /** Cria o cliente e/ou a viatura quando são novos; devolve o id da viatura. */
  async function ensureVehicle() {
    const who = { actor: actor() };
    const newVehicle = { plate: field('reg-plate').value, classId: field('reg-class').value };
    if (!state.customer) {
      const body = { phone: field('reg-phone').value, name: field('reg-name').value, vehicles: [newVehicle] };
      state.customer = (await api('POST', '/customers', body, who)).customer;
      return state.customer.vehicles[0].id;
    }
    const selected = field('reg-vehicle').value;
    if (selected !== NEW_VEHICLE) return Number(selected);
    return (await api('POST', `/customers/${state.customer.id}/vehicles`, newVehicle, who)).vehicle.id;
  }

  return { open };
}
