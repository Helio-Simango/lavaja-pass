import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { globalCommandOf, isGreeting, optionNumber, parseIncomingText, yesNo } from '../../src/domain/conversation.js';
import { ValidationError } from '../../src/domain/errors.js';

describe('conversa', () => {
  it('reconhece os comandos globais', () => {
    assert.equal(globalCommandOf(' menu '), 'MENU');
    assert.equal(globalCommandOf('Parar'), 'STOP_MARKETING');
    assert.equal(globalCommandOf('menus'), null);
  });

  it('reconhece cumprimentos', () => {
    for (const text of ['Olá', 'olá!', 'Ola', 'oi', 'Bom dia', 'boa tarde, tudo bem?']) assert.ok(isGreeting(text), text);
    for (const text of ['olhe', 'oito', '2']) assert.ok(!isGreeting(text), text);
  });

  it('lê opções numeradas dentro do intervalo', () => {
    assert.equal(optionNumber(' 3 ', 7), 3);
    for (const text of ['0', '8', 'três', '3a', '']) assert.equal(optionNumber(text, 7), null, text);
  });

  it('lê respostas sim/não', () => {
    for (const text of ['1', 'Sim', 's']) assert.equal(yesNo(text), true, text);
    for (const text of ['2', 'Não', 'nao', 'N']) assert.equal(yesNo(text), false, text);
    assert.equal(yesNo('talvez'), null);
  });

  it('limita o tamanho das mensagens', () => {
    assert.equal(parseIncomingText('  olá  '), 'olá');
    for (const text of ['', '   ', 'x'.repeat(1001), 42]) assert.throws(() => parseIncomingText(text), ValidationError);
  });
});
