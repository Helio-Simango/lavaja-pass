import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { niceMax } from '../js/core/charts.js';
import { greeting, maskPhone, mzn, parseAmountToCents } from '../js/core/format.js';
import { safeReturnPath } from '../js/entrar/return-path.js';

describe('formatação dos ecrãs', () => {
  it('MZN sem casas decimais e com ponto nos milhares, como nos mocks', () => {
    assert.equal(mzn(185_000), '1.850');
    assert.equal(mzn(14_052_500), '140.525');
    assert.equal(mzn(45_000), '450');
    assert.equal(mzn(0), '0');
  });

  it('o eixo dos gráficos acaba logo acima do máximo, em passos redondos', () => {
    assert.equal(niceMax(120), 120);
    assert.equal(niceMax(115), 120);
    assert.equal(niceMax(2_430_000), 3_200_000);
    assert.equal(niceMax(0), 1);
  });

  it('mascara o telefone do cliente', () => {
    assert.equal(maskPhone('+258 84 555 0177'), '+258 84 ••• ••77');
  });

  it('cumprimenta pela hora de Maputo', () => {
    assert.equal(greeting(new Date('2026-10-22T08:40:00Z')), 'Bom dia');
    assert.equal(greeting(new Date('2026-10-22T12:00:00Z')), 'Boa tarde');
  });
});

describe('valor do numerário escrito pelo operador', () => {
  it('aceita os formatos usados em Moçambique', () => {
    const cases = [['450,00', 45000], ['450', 45000], ['450.5', 45050], ['1.100,00', 110000], [' 1 100,00 ', 110000], ['0,05', 5]];
    for (const [text, cents] of cases) assert.equal(parseAmountToCents(text), cents, text);
  });

  it('recusa texto que não é um valor', () => {
    for (const text of ['', 'abc', '450,000', '-10', '4,5,0', null]) assert.equal(parseAmountToCents(text), null, String(text));
  });
});

describe('regresso depois de entrar', () => {
  it('só aceita caminhos deste site', () => {
    assert.equal(safeReturnPath('/gestor#campanhas', '/gestor'), '/gestor#campanhas');
    for (const bad of ['https://mau.example', '//mau.example', '/\\mau.example', 'javascript:alert(1)', '/entrar?perfil=x', null]) {
      assert.equal(safeReturnPath(bad, '/operador'), '/operador', String(bad));
    }
  });
});
