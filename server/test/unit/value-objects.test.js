import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCustomerName, parseVehicleDescription } from '../../src/domain/customer.js';
import { formatMoney } from '../../src/domain/money.js';
import { formatPhone, normalizePhone, parsePhone } from '../../src/domain/phone.js';
import { formatPlate, normalizePlate, parseJurisdiction } from '../../src/domain/plate.js';
import { parseClassRef } from '../../src/domain/vehicle-class.js';
import { ValidationError } from '../../src/domain/errors.js';

describe('telefone', () => {
  it('normaliza os formatos aceites para 2588XXXXXXXX', () => {
    for (const input of ['84 123 4567', '+258 84 123 4567', '258841234567', '00258841234567', '84-123-4567', 841234567]) {
      assert.equal(normalizePhone(input), '258841234567', String(input));
    }
  });

  it('aceita os prefixos 82 a 87 e recusa os outros', () => {
    for (const prefix of ['82', '83', '84', '85', '86', '87']) assert.ok(normalizePhone(`${prefix} 123 4567`));
    for (const prefix of ['80', '81', '88', '21']) assert.equal(normalizePhone(`${prefix} 123 4567`), null);
  });

  it('recusa valores inválidos', () => {
    for (const input of ['', 'abc', '84 123 456', '84 123 45678', '+351 912 345 678', null, undefined, {}]) {
      assert.equal(normalizePhone(input), null, String(input));
    }
    assert.throws(() => parsePhone('123'), ValidationError);
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
    assert.equal(parseJurisdiction(undefined), 'MZ');
    assert.equal(parseJurisdiction('za'), 'ZA');
    assert.throws(() => parseJurisdiction('MOZ'), ValidationError);
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

describe('cliente', () => {
  it('normaliza o nome e exige 2 a 80 caracteres', () => {
    assert.equal(parseCustomerName('  Teresa   Langa '), 'Teresa Langa');
    for (const name of ['', 'X', 'A'.repeat(81), null, 42]) assert.throws(() => parseCustomerName(name), ValidationError);
  });

  it('a descrição da viatura é opcional', () => {
    assert.equal(parseVehicleDescription(undefined), null);
    assert.equal(parseVehicleDescription(' Toyota  Hiace '), 'Toyota Hiace');
    assert.throws(() => parseVehicleDescription(12), ValidationError);
  });
});

describe('referência de classe', () => {
  it('aceita o código ou o id', () => {
    assert.deepEqual(parseClassRef('b'), { code: 'B' });
    assert.deepEqual(parseClassRef('2'), { id: 2 });
    assert.deepEqual(parseClassRef(3), { id: 3 });
  });

  it('recusa referências mal formadas', () => {
    for (const input of [undefined, '', 'xx', '-1']) assert.throws(() => parseClassRef(input), ValidationError);
  });
});
