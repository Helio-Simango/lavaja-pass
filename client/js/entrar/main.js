// Entrada nos quatro perfis. Depois de entrar, volta à página pedida (se for deste site) ou à do perfil.
import { api } from '../core/api-client.js';
import { $, $$, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { safeReturnPath } from './return-path.js';

const params = new URLSearchParams(location.search);
const STAFF_TEXT = {
  gestor: ['Gestor do Lava Já', 'Painel da lavadora: operação, receita, conciliação, campanhas e partilha com o banco.'],
  analista: ['Analista Moza Banco', 'Módulo do banco: só os comerciantes que autorizaram a partilha, no âmbito autorizado.'],
};
const state = { profile: null, operatorId: null, pin: '' };

function showProfile(profile) {
  state.profile = ['operador', 'gestor', 'analista', 'cliente'].includes(profile) ? profile : 'operador';
  for (const button of $$('[data-profile]')) button.setAttribute('aria-pressed', String(button.dataset.profile === state.profile));
  for (const panel of $$('[data-panel]')) panel.hidden = !panel.dataset.panel.split(' ').includes(state.profile);
  if (STAFF_TEXT[state.profile]) [$('#staff-title').textContent, $('#staff-sub').textContent] = STAFF_TEXT[state.profile];
  history.replaceState({}, '', `/entrar?perfil=${state.profile}${params.get('volta') ? `&volta=${encodeURIComponent(params.get('volta'))}` : ''}`);
  if (state.profile === 'operador') loadOperators();
}

function goHome(result) {
  location.assign(safeReturnPath(params.get('volta'), result.home));
}

$('.profile-switch').addEventListener('click', (event) => {
  const button = event.target.closest('[data-profile]');
  if (button) showProfile(button.dataset.profile);
});

// ---------- Operador (M6) ----------

async function loadOperators() {
  if ($('#operators').children.length) return;
  const { operators } = await api('GET', '/auth/operators');
  $('#operators').innerHTML = operators
    .map((o) => `<button type="button" class="chip" role="radio" aria-checked="false" data-operator="${o.id}">${escapeHtml(o.name)}</button>`)
    .join('');
}

function renderPin() {
  $$('#pin-dots i').forEach((dot, index) => dot.classList.toggle('f', index < state.pin.length));
}

$('#operators').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-operator]');
  if (!chip) return;
  state.operatorId = Number(chip.dataset.operator);
  for (const other of $$('#operators [data-operator]')) other.setAttribute('aria-checked', String(other === chip));
});

$('#keypad').addEventListener('click', (event) => {
  const key = event.target.closest('[data-key]')?.dataset.key;
  if (!key) return;
  state.pin = key === 'back' ? state.pin.slice(0, -1) : (state.pin + key).slice(0, 4);
  renderPin();
});

document.addEventListener('keydown', (event) => {
  if (state.profile !== 'operador' || document.activeElement?.matches('input')) return;
  if (/^\d$/.test(event.key)) state.pin = (state.pin + event.key).slice(0, 4);
  else if (event.key === 'Backspace') state.pin = state.pin.slice(0, -1);
  else return;
  renderPin();
});

$('#operator-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage($('#operator-error'));
  if (!state.operatorId) return showMessage($('#operator-error'), 'Escolha o seu nome.');
  if (state.pin.length !== 4) return showMessage($('#operator-error'), 'Escreva o PIN de 4 dígitos.');
  $('#operator-submit').disabled = true;
  try {
    goHome(await api('POST', '/auth/operator', { operatorId: state.operatorId, pin: state.pin }));
  } catch (error) {
    state.pin = '';
    renderPin();
    showMessage($('#operator-error'), error.message);
    $('#operator-submit').disabled = false;
  }
});

// ---------- Gestor e analista ----------

$('#staff-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage($('#staff-error'));
  try {
    const result = await api('POST', '/auth/staff', { email: $('#staff-email').value, password: $('#staff-password').value });
    const expected = { gestor: 'manager', analista: 'bank_analyst' }[state.profile];
    if (result.session.role !== expected) {
      showMessage($('#staff-error'), `Esta conta é de outro perfil (${result.session.roleLabel}). A abrir o seu painel…`);
      setTimeout(() => location.assign(result.home), 1200);
      return;
    }
    goHome(result);
  } catch (error) {
    showMessage($('#staff-error'), error.message);
  }
});

// ---------- Cliente ----------

$('#code-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage($('#customer-error'));
  $('#code-submit').disabled = true;
  try {
    const phone = $('#customer-phone').value;
    const { ttlMinutes } = await api('POST', '/auth/customer/code', { phone });
    const digits = phone.replace(/\D/g, '').replace(/^(?!258)/, '258');
    $('#code-sent').innerHTML = `Se o número estiver registado, o código chega à sua conversa com o Lava Já (válido ${ttlMinutes} min).
      <a href="/simulador/whatsapp/${encodeURIComponent(digits)}" target="_blank" rel="noopener">Abrir a conversa no simulador ↗</a>`;
    $('#verify-form').hidden = false;
    $('#customer-code').focus();
  } catch (error) {
    showMessage($('#customer-error'), error.message);
  } finally {
    $('#code-submit').disabled = false;
  }
});

$('#verify-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage($('#customer-error'));
  try {
    goHome(await api('POST', '/auth/customer/verify', { phone: $('#customer-phone').value, code: $('#customer-code').value }));
  } catch (error) {
    showMessage($('#customer-error'), error.message);
  }
});

showProfile(params.get('perfil'));
