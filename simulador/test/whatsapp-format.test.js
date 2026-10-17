import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPhone, messageToHtml, phoneFromPath } from '../js/whatsapp-format.js';

describe('formatação das mensagens do simulador', () => {
  it('aplica negrito e itálico ao estilo WhatsApp', () => {
    assert.equal(messageToHtml('*Menu*'), '<strong>Menu</strong>');
    assert.equal(messageToHtml('_Regras por validar._'), '<em>Regras por validar.</em>');
    assert.equal(messageToHtml('preço 2*3*4'), 'preço 2<strong>3</strong>4');
  });

  it('escapa o HTML antes da marcação', () => {
    assert.equal(messageToHtml('<script>*x*</script>'), '&lt;script&gt;<strong>x</strong>&lt;/script&gt;');
  });

  it('lê o telefone do endereço', () => {
    assert.equal(phoneFromPath('/simulador/whatsapp/258841234567'), '258841234567');
    assert.equal(phoneFromPath('/simulador'), null);
    assert.equal(formatPhone('258841234567'), '+258 84 123 4567');
  });
});
