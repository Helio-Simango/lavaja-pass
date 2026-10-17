import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFixedClock } from '../src/lib/clock.js';
import { formatMoney } from '../src/lib/money.js';
import { formatPhone, normalizePhone } from '../src/lib/phone.js';
import { formatPlate, normalizeJurisdiction, normalizePlate } from '../src/lib/plate.js';

describe('telefone', () => {
  it('normaliza os formatos aceites para 2588XXXXXXXX', () => {
    for (const input of ['84 123 4567', '+258 84 123 4567', '258841234567', '00258841234567', '84-123-4567', 841234567]) {
      assert.equal(normalizePhone(input), '258841234567', String(input));
    }
  });

  it('aceita os prefixos 82 a 87 e recusa os outros', () => {
    for (const p of ['82', '83', '84', '85', '86', '87']) assert.ok(normalizePhone(`${p} 123 4567`));
    for (const p of ['80', '81', '88', '21']) assert.equal(normalizePhone(`${p} 123 4567`), null);
  });

  it('recusa valores inválidos', () => {
    for (const input of ['', 'abc', '84 123 456', '84 123 45678', '+351 912 345 678', null, undefined, {}]) {
      assert.equal(normalizePhone(input), null, String(input));
    }
  });

  it('formata para apresentação', () => {
    assert.equal(formatPhone('258841234567'), '+258 84 123 4567');
  });
});

describe('matrícula', () => {
  it('normaliza para maiúsculas sem espaços nem hífens', () => {
    assert.equal(normalizePlate(' abc 123-mc '), 'ABC123MC');
    assert.equal(normalizePlate('ABC-123-MC'), 'ABC123MC');
  });

  it('recusa valores inválidos', () => {
    for (const input of ['', 'AB', 'ABC#123', 'A'.repeat(13), null, 123]) assert.equal(normalizePlate(input), null);
  });

  it('jurisdição MZ por omissão', () => {
    assert.equal(normalizeJurisdiction(undefined), 'MZ');
    assert.equal(normalizeJurisdiction('za'), 'ZA');
    assert.equal(normalizeJurisdiction('MOZ'), null);
  });

  it('formata matrículas moçambicanas', () => {
    assert.equal(formatPlate('ABC123MC'), 'ABC 123 MC');
    assert.equal(formatPlate('XYZ99'), 'XYZ99');
  });
});

describe('dinheiro', () => {
  it('formata centavos em MZN', () => {
    assert.equal(formatMoney(45000), '450,00 MZN');
    assert.equal(formatMoney(110000), '1.100,00 MZN');
    assert.equal(formatMoney(5), '0,05 MZN');
    assert.equal(formatMoney(123456789), '1.234.567,89 MZN');
  });

  it('recusa valores não inteiros', () => {
    assert.throws(() => formatMoney(1.5));
  });
});

describe('relógio injectável', () => {
  it('avança no tempo de forma controlada', () => {
    const clock = createFixedClock('2026-10-22T08:00:00.000Z');
    clock.advanceMinutes(90);
    assert.equal(clock.nowIso(), '2026-10-22T09:30:00.000Z');
  });
});
