import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDbPath } from '../../src/config.js';
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
});
