import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAmountToCents } from '../js/patio/cash-dialog.js';

describe('valor do numerário escrito pelo operador', () => {
  it('aceita os formatos usados em Moçambique', () => {
    const cases = [['450,00', 45000], ['450', 45000], ['450.5', 45050], ['1.100,00', 110000], [' 1 100,00 ', 110000], ['0,05', 5]];
    for (const [text, cents] of cases) assert.equal(parseAmountToCents(text), cents, text);
  });

  it('recusa texto que não é um valor', () => {
    for (const text of ['', 'abc', '450,000', '-10', '4,5,0', null]) assert.equal(parseAmountToCents(text), null, String(text));
  });
});
