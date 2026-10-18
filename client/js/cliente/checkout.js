// Checkout (M4): aberto pelo link da conversa (M3). O token do link vem no fragmento (#t=…), não
// chega aos registos do servidor; troca-se por uma sessão do cliente e sai do endereço.
// O cliente escolhe a carteira e confirma; a confirmação da carteira é simulada (não há transacção real).
import { api, loginUrl, newIdempotencyKey, useSession } from '../core/api-client.js';
import { $, escapeHtml } from '../core/dom.js';
import { maskPhone, time } from '../core/format.js';

const PROFILE = 'cliente';
const WALLETS = ['M-Pesa', 'e-Mola', 'mKesh', 'App Moza'];
const WALLET_DELAY_MS = 2000;
const washId = Number(location.pathname.split('/').pop());
const state = { wash: null, wallet: WALLETS[0], business: 'Lava Já', key: newIdempotencyKey() };

async function start() {
  useSession(PROFILE);
  const token = new URLSearchParams(location.hash.slice(1)).get('t');
  if (token) {
    history.replaceState({}, '', location.pathname); // o token não fica no histórico nem é partilhado
    try {
      await api('POST', '/auth/link', { token });
    } catch (error) {
      return showError(`${error.message}`);
    }
  }
  try {
    state.business = (await api('GET', '/public/business')).name;
    state.wash = (await api('GET', `/me/washes/${washId}`)).wash;
  } catch (error) {
    if (error.status === 401) return location.assign(loginUrl(PROFILE));
    return showError(error.message);
  }
  render();
}

function render() {
  const { wash } = state;
  const paid = ['paid_digital', 'paid_cash', 'not_required'].includes(wash.payment.status);
  if (paid) return renderPaid();
  $('#checkout').innerHTML = `
    <p class="muted small" style="margin:0">Pagar a</p>
    <h2 style="font-size:20px;margin-bottom:12px">${escapeHtml(state.business)}</h2>
    <div class="info-box" style="margin-top:0">
      <div style="display:flex;justify-content:space-between;gap:8px"><span>${escapeHtml(wash.plan.name)} · ${escapeHtml(wash.vehicle.plateDisplay)}</span><span class="mono small">${escapeHtml(wash.code)}</span></div>
      <div class="amount" style="margin-top:6px">${escapeHtml(wash.price.final.display.replace(/\sMZN$/, ''))}<em>MZN</em></div>
    </div>
    <span class="lbl">Pagar com</span>
    <div role="radiogroup" aria-label="Carteira">
      ${WALLETS.map((w) => `<button type="button" class="radio" role="radio" data-wallet="${w}" aria-checked="${w === state.wallet}"><i></i><b>${w}</b></button>`).join('')}
    </div>
    <span class="lbl">Número</span>
    <div class="input" style="display:flex;justify-content:space-between"><span>${escapeHtml(maskPhone(wash.customer.phoneDisplay))}</span><span class="muted small">da sua conta</span></div>
    <p class="error-box" id="pay-error" hidden></p>
    <button class="btn p block" id="pay" style="margin-top:14px">Pagar ${escapeHtml(wash.price.final.display)}</button>
    <p class="hint" style="text-align:center">Valor liquidado na conta do comerciante. Ambiente de demonstração: pagamento simulado, sem transacção real.</p>
    <p style="text-align:center"><a href="/cliente" class="small">Os meus serviços</a></p>`;
}

function renderPaid(wallet) {
  const { wash } = state;
  const when = wash.payment.effective?.at ? ` às ${time(wash.payment.effective.at)}` : '';
  $('#checkout').innerHTML = `
    <div class="paid-box"><span class="tick">✓</span><b>Pagamento recebido</b>
      <span class="small">${escapeHtml(wash.price.final.display)}${wallet ? ` · ${escapeHtml(wallet)} (simulado)` : ''}${when} · ${escapeHtml(wash.code)}</span></div>
    <p class="info-box">O recibo e o progresso da fidelização chegam à sua conversa com o ${escapeHtml(state.business)}.</p>
    <a class="btn o block" href="/cliente">Os meus serviços</a>`;
}

function showError(message) {
  $('#checkout').innerHTML = `<p class="error-box">${escapeHtml(message)}</p><a class="btn o block" href="${loginUrl(PROFILE, location.pathname)}">Entrar com o telefone</a>`;
}

$('#checkout').addEventListener('click', async (event) => {
  const wallet = event.target.closest('[data-wallet]');
  if (wallet) {
    state.wallet = wallet.dataset.wallet;
    for (const option of document.querySelectorAll('[data-wallet]')) option.setAttribute('aria-checked', String(option === wallet));
    return;
  }
  if (!event.target.closest('#pay')) return;
  const button = $('#pay');
  button.disabled = true;
  try {
    const { payment } = await api('POST', `/me/washes/${washId}/payments`, {}, { idempotencyKey: state.key });
    button.textContent = `A aguardar a confirmação da ${state.wallet}…`;
    await new Promise((resolve) => setTimeout(resolve, WALLET_DELAY_MS));
    await api('POST', `/me/washes/${washId}/payments/${payment.id}/confirm`, { outcome: 'confirmed' });
    state.wash = (await api('GET', `/me/washes/${washId}`)).wash;
    renderPaid(state.wallet);
  } catch (error) {
    const box = $('#pay-error');
    box.textContent = error.message;
    box.hidden = false;
    button.disabled = false;
    button.textContent = `Pagar ${state.wash.price.final.display}`;
  }
});

start();
