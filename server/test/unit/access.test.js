import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  afterFailedAttempt,
  assertPermission,
  assertStrongPassword,
  can,
  codeUsable,
  isLocked,
  parseCustomerCode,
  parseEmail,
  parsePin,
  Permission,
  Role,
} from '../../src/domain/access.js';
import { createFixedClock } from '../../src/infrastructure/clock.js';
import { HmacJwtTokenService } from '../../src/infrastructure/security/jwt.js';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/password-hasher.js';

describe('perfis e permissões (D-16)', () => {
  it('cada perfil só tem as permissões da matriz', () => {
    assert.ok(can(Role.OPERATOR, Permission.CASH_DECLARE));
    assert.ok(!can(Role.OPERATOR, Permission.CATALOG_MANAGE));
    assert.ok(!can(Role.OPERATOR, Permission.BUSINESS_READ));
    assert.ok(can(Role.MANAGER, Permission.YARD_OPERATE)); // o dono também trabalha no pátio
    assert.ok(can(Role.MANAGER, Permission.SHARING_MANAGE));
    assert.ok(!can(Role.MANAGER, Permission.BANK_REPORTS));
    assert.ok(can(Role.BANK_ANALYST, Permission.BANK_REPORTS));
    assert.ok(!can(Role.BANK_ANALYST, Permission.CUSTOMERS_READ));
    assert.ok(can(Role.CUSTOMER, Permission.SELF_SERVICE));
    assert.ok(!can(Role.CUSTOMER, Permission.YARD_READ));
    assert.ok(!can('admin', Permission.YARD_READ));
  });

  it('sem sessão é 401; sem permissão é 403', () => {
    assert.throws(() => assertPermission(null, Permission.YARD_READ), { code: 'UNAUTHENTICATED' });
    assert.throws(() => assertPermission({ role: Role.BANK_ANALYST }, Permission.YARD_READ), { code: 'FORBIDDEN' });
    assert.doesNotThrow(() => assertPermission({ role: Role.OPERATOR }, Permission.YARD_READ));
  });
});

describe('credenciais', () => {
  it('valida PIN, email, código e força da senha', () => {
    assert.equal(parsePin(' 1234 '), '1234');
    assert.throws(() => parsePin('12a4'), { code: 'VALIDATION_ERROR' });
    assert.equal(parseEmail(' Gestor@Lavaja.Demo '), 'gestor@lavaja.demo');
    assert.throws(() => parseEmail('gestor'), { code: 'VALIDATION_ERROR' });
    assert.equal(parseCustomerCode('123 456'), '123456');
    assert.throws(() => parseCustomerCode('12345'), { code: 'VALIDATION_ERROR' });
    assert.throws(() => assertStrongPassword('curta1'), { code: 'VALIDATION_ERROR' });
    assert.throws(() => assertStrongPassword('semalgarismos'), { code: 'VALIDATION_ERROR' });
    assert.doesNotThrow(() => assertStrongPassword('LavaJa-2026'));
  });

  it('bloqueia 15 min à quinta tentativa falhada', () => {
    const now = '2026-10-22T08:00:00.000Z';
    let user = { failedAttempts: 3, lockedUntil: null };
    user = { ...user, ...afterFailedAttempt(user, now) };
    assert.deepEqual([user.failedAttempts, user.locked], [4, false]);
    user = { ...user, ...afterFailedAttempt(user, now) };
    assert.deepEqual([user.failedAttempts, user.lockedUntil, user.locked], [0, '2026-10-22T08:15:00.000Z', true]);
    assert.ok(isLocked(user, '2026-10-22T08:14:59.000Z'));
    assert.ok(!isLocked(user, '2026-10-22T08:15:00.000Z'));
  });

  it('um código de cliente serve uma vez, dentro do prazo e das tentativas', () => {
    const code = { expiresAt: '2026-10-22T08:05:00.000Z', attempts: 0, usedAt: null };
    assert.ok(codeUsable(code, '2026-10-22T08:04:00.000Z'));
    assert.ok(!codeUsable(code, '2026-10-22T08:05:00.000Z'));
    assert.ok(!codeUsable({ ...code, attempts: 5 }, '2026-10-22T08:01:00.000Z'));
    assert.ok(!codeUsable({ ...code, usedAt: '2026-10-22T08:01:00.000Z' }, '2026-10-22T08:02:00.000Z'));
    assert.ok(!codeUsable(null, '2026-10-22T08:01:00.000Z'));
  });
});

describe('tokens JWT (HS256)', () => {
  const clock = createFixedClock('2026-10-22T08:00:00.000Z');
  const tokens = new HmacJwtTokenService({ secret: 'x'.repeat(40), clock });

  it('emite e valida, com validade', () => {
    const { token, expiresAt } = tokens.issue({ sub: 'user:1', role: 'manager' }, 60);
    assert.equal(expiresAt, '2026-10-22T09:00:00.000Z');
    assert.equal(tokens.verify(token).role, 'manager');
    clock.advanceMinutes(61);
    assert.equal(tokens.verify(token), null);
    clock.set('2026-10-22T08:00:00.000Z');
  });

  it('recusa tokens adulterados, de outro segredo ou com outro algoritmo', () => {
    const { token } = tokens.issue({ sub: 'user:1', role: 'operator' }, 60);
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), role: 'manager' })).toString('base64url');
    assert.equal(tokens.verify(`${header}.${forged}.${signature}`), null);
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    assert.equal(tokens.verify(`${none}.${payload}.`), null);
    const other = new HmacJwtTokenService({ secret: 'y'.repeat(40), clock });
    assert.equal(other.verify(token), null);
    assert.equal(tokens.verify('lixo'), null);
  });

  it('exige um segredo com pelo menos 32 bytes', () => {
    assert.throws(() => new HmacJwtTokenService({ secret: 'curto', clock }), /32 bytes/);
  });
});

describe('hash de senhas (scrypt)', () => {
  it('verifica a senha certa e recusa as outras; o sal muda o hash', () => {
    const hasher = new ScryptPasswordHasher({ cost: 1024 });
    const stored = hasher.hash('LavaJa-2026');
    assert.match(stored, /^scrypt\$1024\$8\$1\$/);
    assert.notEqual(hasher.hash('LavaJa-2026'), stored);
    assert.ok(hasher.verify('LavaJa-2026', stored));
    assert.ok(!hasher.verify('LavaJa-2027', stored));
    assert.ok(!hasher.verify('LavaJa-2026', 'texto-em-claro'));
  });
});
