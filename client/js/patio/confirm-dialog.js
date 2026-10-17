// Diálogo de confirmação, com motivo opcional (cancelamentos, entregas sem pagamento).
import { $, enableCloseButtons, hideMessage, showMessage } from '../core/dom.js';

const MIN_REASON_LENGTH = 3;

export function createConfirmDialog(dialog) {
  const form = $('form', dialog);
  const reasonBlock = $('#confirm-reason-block', dialog);
  const reasonInput = $('#confirm-reason', dialog);
  const errorBox = $('#confirm-error', dialog);
  const okButton = $('#confirm-ok', dialog);
  let pending = null;

  enableCloseButtons(dialog);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!pending) return;
    const reason = reasonInput.value.trim();
    if (pending.askReason && reason.length < MIN_REASON_LENGTH) {
      showMessage(errorBox, 'Indique o motivo.');
      return;
    }
    okButton.disabled = true;
    try {
      await pending.onConfirm(reason);
      dialog.close();
    } catch (error) {
      showMessage(errorBox, error.message);
    } finally {
      okButton.disabled = false;
    }
  });

  return {
    /** @param options { title, text, okLabel, askReason?, onConfirm(reason) } */
    open({ title, text, okLabel, askReason = false, onConfirm }) {
      $('#confirm-title', dialog).textContent = title;
      $('#confirm-text', dialog).textContent = text;
      okButton.textContent = okLabel;
      reasonBlock.hidden = !askReason;
      reasonInput.value = '';
      hideMessage(errorBox);
      pending = { askReason, onConfirm };
      dialog.showModal();
      if (askReason) reasonInput.focus();
    },
  };
}
