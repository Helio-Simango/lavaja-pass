// Entrega e cobrança (M9). Pago em digital: só falta entregar. Por pagar: o cliente paga pelo link
// ou o operador regista o numerário recebido, que fica declarado em seu nome na conciliação.
import { api, newIdempotencyKey } from '../core/api-client.js';
import { $, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { maskPhone, mzn, parseAmountToCents, time } from '../core/format.js';
import { isPaid } from './board-view.js';

const WALK_IN_PHONE = '+258 87 000 0000';

export function createDeliveryView(screen, { operatorName, onDelivered }) {
  const body = $('#delivery-body', screen);
  let current = null;

  screen.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-delivery]')) close();
  });
  body.addEventListener('click', onClick);
  body.addEventListener('input', (event) => {
    if (event.target.id === 'cash-received') updateChange();
  });

  async function open(wash) {
    current = { wash, method: 'cash', idempotencyKey: newIdempotencyKey(), loyalty: null };
    $('#delivery-sub', screen).textContent = `${wash.station?.code ? `Baia ${wash.station.code.replace(/\D/g, '')}` : ''} · ${wash.plan.name}`;
    screen.hidden = false;
    current.loyalty = await loyaltyLine(wash).catch(() => null);
    render();
  }

  function close() {
    screen.hidden = true;
    current = null;
  }

  /** Actualização periódica: se o cliente pagar pelo link, o ecrã passa a "Pago". */
  function refresh(washes) {
    if (!current || screen.hidden) return;
    const latest = washes.find((w) => w.id === current.wash.id);
    if (!latest) return close();
    const changed = isPaid(latest) !== isPaid(current.wash);
    current.wash = latest;
    if (changed) render();
  }

  function render() {
    const { wash } = current;
    const head = `<div class="delivery-plate"><div class="plate">${escapeHtml(wash.vehicle.plateDisplay)}</div>
      <div class="muted small">Ref. ${escapeHtml(wash.code)} · ${escapeHtml(wash.price.final.display)}</div></div>`;
    body.innerHTML = head + (isPaid(wash) ? paidHtml(wash) : unpaidHtml(wash));
    updateChange();
  }

  function paidHtml(wash) {
    const effective = wash.payment.effective;
    const how = wash.payment.status === 'paid_cash' ? `Numerário · declarado por ${escapeHtml(effective?.declaredBy ?? '')}` : 'Pago · digital (simulado)';
    const when = effective?.at ? `Confirmado às ${time(effective.at)}${wash.payment.status === 'paid_digital' ? ' · verificado' : ' · declarado'}` : '';
    return `<div class="paid-box"><span class="tick">✓</span><b>${how}</b><span class="small">${when}</span></div>
      <div class="info-box">Cliente: <b>${escapeHtml(maskPhone(wash.customer.phoneDisplay))}</b>${current.loyalty ? `<br>${current.loyalty}` : ''}</div>
      <button class="btn p block" data-deliver>Entregar e libertar ${escapeHtml(wash.station ? `a baia ${wash.station.code}` : 'a viatura')}</button>`;
  }

  function unpaidHtml(wash) {
    const walkIn = wash.customer.phoneDisplay === WALK_IN_PHONE;
    const notice = walkIn
      ? '<b>Pagamento ainda não recebido.</b><br>Cliente sem telefone: cobre na entrega.'
      : `<b>Pagamento ainda não recebido.</b><br>Link enviado ao cliente às ${time(wash.readyAt)}.`;
    const option = (method, label) =>
      `<button type="button" class="radio" role="radio" data-method="${method}" aria-checked="${current.method === method}" ${method === 'link' && walkIn ? 'disabled' : ''}><i></i><span>${label}</span></button>`;
    const cashBlock = current.method === 'cash'
      ? `<label class="lbl" for="cash-received">Valor recebido</label>
        <div class="input" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <input id="cash-received" inputmode="decimal" value="${mzn(wash.price.final.cents).replace('.', '')}" style="border:0;outline:0;font-weight:700;font-size:16px;width:60%" aria-describedby="cash-change">
          <span class="muted small" id="cash-change"></span>
        </div>
        <p class="hint">Fica registado em teu nome (${escapeHtml(operatorName)}) na conciliação do dia, como numerário declarado.</p>
        <button class="btn p block" data-confirm-cash>Confirmar e entregar</button>`
      : '<p class="callout blue small">À espera da confirmação da carteira. Este ecrã muda sozinho quando o pagamento chegar.</p>';
    return `<div class="warn-box">${notice}</div>
      <span class="lbl">Como pagou?</span>
      ${option('link', 'Vai pagar pelo link agora')}
      ${option('cash', 'Recebi em numerário')}
      ${cashBlock}
      <p class="error-box" id="delivery-error" hidden></p>
      <button class="btn link small" style="margin-top:12px" data-unpaid>Entregar sem pagamento…</button>`;
  }

  function updateChange() {
    const input = $('#cash-received', body);
    if (!input || !current) return;
    const received = parseAmountToCents(input.value);
    const due = current.wash.price.final.cents;
    $('#cash-change', body).textContent = received === null ? 'valor?' : received < due ? 'falta' : `troco ${mzn(received - due)}`;
  }

  async function onClick(event) {
    const method = event.target.closest('[data-method]');
    if (method && !method.disabled) {
      current.method = method.dataset.method;
      render();
      return;
    }
    if (event.target.closest('[data-deliver]')) return run(event.target, () => complete(false));
    if (event.target.closest('[data-confirm-cash]')) return run(event.target, confirmCash);
    if (event.target.closest('[data-unpaid]')) {
      if (confirm('Entregar sem pagamento fica registado em teu nome e não conta para a fidelização. Continuar?')) {
        return run(event.target, () => complete(true));
      }
    }
  }

  async function confirmCash() {
    const received = parseAmountToCents($('#cash-received', body).value);
    const due = current.wash.price.final.cents;
    if (received === null || received < due) throw new Error(`O valor recebido tem de cobrir ${current.wash.price.final.display}.`);
    await api('POST', `/washes/${current.wash.id}/payments/cash`, { amountCents: due, confirm: true }, { idempotencyKey: current.idempotencyKey });
    await complete(false);
  }

  async function complete(allowUnpaid) {
    await api('POST', `/washes/${current.wash.id}/transitions`, { to: 'completed', allowUnpaid });
    close();
    onDelivered();
  }

  async function run(button, action) {
    const target = button.closest('button');
    target.disabled = true;
    hideMessage($('#delivery-error', body) ?? document.createElement('p'));
    try {
      await action();
    } catch (error) {
      const box = $('#delivery-error', body);
      if (box) showMessage(box, error.message);
      else alert(error.message);
      target.disabled = false;
    }
  }

  return { open, refresh, isOpen: () => !screen.hidden };
}

/** "Fidelização classe A: 6/10 → 7/10" quando o cliente participa (M9: "Selos 2 → 3"). */
async function loyaltyLine(wash) {
  const { loyalty } = await api('GET', `/customers/${wash.customer.id}/loyalty`);
  if (!loyalty.consent?.granted) return null;
  const progress = loyalty.classes.find((c) => c.classCode === wash.vehicle.classCode);
  if (!progress) return null;
  const next = Math.min(progress.progressInCycle + 1, progress.cycleSize);
  return `Fidelização classe ${progress.classCode}: ${progress.progressInCycle}/${progress.cycleSize} → ${next}/${progress.cycleSize}`;
}
