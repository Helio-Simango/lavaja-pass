// Declarar numerário (M9): só por esta acção explícita, com o operador identificado e o valor validado.
import { api, newIdempotencyKey } from '../core/api-client.js';
import { $, enableCloseButtons, hideMessage, showMessage } from '../core/dom.js';

/** "450,00" / "450.00" / "450" -> 45000; null se não for um valor válido. */
export function parseAmountToCents(text) {
  const normalized = String(text ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function createCashDialog(dialog, { actor, onDeclared }) {
  const field = (id) => $(`#${id}`, dialog);
  let current = null;

  enableCloseButtons(dialog);
  field('cash-amount').addEventListener('input', updateAmountHint);
  $('form', dialog).addEventListener('submit', submit);

  function open(wash) {
    // Uma chave por abertura do diálogo: repetir o envio não cria um segundo registo.
    current = { wash, idempotencyKey: newIdempotencyKey() };
    field('cash-plate').textContent = wash.vehicle.plateDisplay;
    field('cash-wash').textContent = `${wash.code} · ${wash.plan.name} · Classe ${wash.vehicle.classCode}`;
    field('cash-due').textContent = wash.price.final.display;
    field('cash-amount').value = wash.price.final.display.replace(/\s[A-Z]{3}$/, '');
    field('cash-declared-by').value = actor() === 'operador' ? '' : actor();
    field('cash-confirm').checked = false;
    hideMessage(field('cash-error'));
    updateAmountHint();
    dialog.showModal();
    field(field('cash-declared-by').value ? 'cash-amount' : 'cash-declared-by').focus();
  }

  function updateAmountHint() {
    if (!current) return;
    const cents = parseAmountToCents(field('cash-amount').value);
    const matches = cents === current.wash.price.final.cents;
    field('cash-amount-hint').textContent = matches ? 'Igual ao valor em dívida.' : 'Tem de ser igual ao valor em dívida.';
    field('cash-submit').textContent = matches ? `Declarar ${current.wash.price.final.display}` : 'Declarar';
  }

  async function submit(event) {
    event.preventDefault();
    hideMessage(field('cash-error'));
    const amountCents = parseAmountToCents(field('cash-amount').value);
    if (amountCents === null) {
      showMessage(field('cash-error'), 'Indique um valor válido, ex.: 450,00.');
      return;
    }
    field('cash-submit').disabled = true;
    try {
      const body = {
        amountCents,
        declaredBy: field('cash-declared-by').value,
        confirm: field('cash-confirm').checked,
      };
      await api('POST', `/washes/${current.wash.id}/payments/cash`, body, {
        actor: actor(),
        idempotencyKey: current.idempotencyKey,
      });
      dialog.close();
      onDeclared();
    } catch (error) {
      showMessage(field('cash-error'), error.message);
    } finally {
      field('cash-submit').disabled = false;
    }
  }

  return { open };
}
