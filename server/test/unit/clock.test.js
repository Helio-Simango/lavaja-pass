import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDbPath, resolveJwtSecret } from '../../src/config.js';
import { createFixedClock } from '../../src/infrastructure/clock.js';

describe('relógio injectável', () => {
  it('avança no tempo de forma controlada', () => {
    const clock = createFixedClock('2026-10-22T08:00:00.000Z');
    clock.advanceMinutes(90);
    assert.equal(clock.nowIso(), '2026-10-22T09:30:00.000Z');
  });
});

describe('configuração', () => {
  it('a base de dados fica por omissão em server/data/', () => {
    assert.match(resolveDbPath({}), /server[\\/]data[\\/]lavaja\.db$/);
  });

  it('recusa uma base de dados numa pasta servida ao browser', () => {
    assert.throws(() => resolveDbPath({ DB_PATH: 'client/lavaja.db' }), /client/);
    assert.throws(() => resolveDbPath({ DB_PATH: 'simulador/x.db' }), /simulador/);
  });

  it('JWT_SECRET: ausente dá segredo aleatório; curto é recusado com a forma de o gerar', () => {
    assert.equal(resolveJwtSecret({}), null);
    assert.equal(resolveJwtSecret({ JWT_SECRET: '  ' }), null);
    assert.throws(() => resolveJwtSecret({ JWT_SECRET: 'curto-11b!!' }), /11 bytes.*32.*randomBytes/);
    assert.equal(resolveJwtSecret({ JWT_SECRET: 'x'.repeat(32) }), 'x'.repeat(32));
  });
});
