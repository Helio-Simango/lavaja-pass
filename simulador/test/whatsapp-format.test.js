import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPhone, messageToHtml, phoneFromPath, splitReplies } from '../js/whatsapp-format.js';

describe('formatação das mensagens do simulador', () => {
  it('aplica negrito e itálico ao estilo WhatsApp', () => {
    assert.equal(messageToHtml('*Menu*'), '<strong>Menu</strong>');
    assert.equal(messageToHtml('_Regras por validar._'), '<em>Regras por validar.</em>');
    assert.equal(messageToHtml('preço 2*3*4'), 'preço 2<strong>3</strong>4');
  });

  it('escapa o HTML antes da marcação', () => {
    assert.equal(messageToHtml('<script>*x*</script>'), '&lt;script&gt;<strong>x</strong>&lt;/script&gt;');
  });

  it('torna clicáveis só os links http(s), sem mostrar o token', () => {
    const html = messageToHtml('Pague aqui: http://localhost:3000/pagar/42#t=abc.def.ghi');
    assert.match(html, /<a href="http:\/\/localhost:3000\/pagar\/42#t=abc\.def\.ghi" target="_blank" rel="noopener noreferrer">localhost:3000\/pagar\/42<\/a>/);
    assert.ok(!messageToHtml('javascript:alert(1)').includes('<a'));
  });

  it('separa as opções numeradas e as palavras de resposta em botões', () => {
    const { body, replies } = splitReplies('Lavar o carro?\n*1* Sim\n*2* Outra matrícula');
    assert.equal(body, 'Lavar o carro?');
    assert.deepEqual(replies, [{ send: '1', label: '1 · Sim' }, { send: '2', label: '2 · Outra matrícula' }]);
    assert.deepEqual(splitReplies('Responda *LAVAR* ou *PARAR*.').replies.map((r) => r.send), ['LAVAR', 'PARAR']);
  });

  it('lê o telefone do endereço', () => {
    assert.equal(phoneFromPath('/simulador/whatsapp/258841234567'), '258841234567');
    assert.equal(phoneFromPath('/simulador'), null);
    assert.equal(formatPhone('258841234567'), '+258 84 123 4567');
  });
});
