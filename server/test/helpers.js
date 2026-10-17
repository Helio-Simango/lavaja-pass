// Cada teste de integração usa uma base em memória, com migrações e dados de demonstração.
import { createContainer } from '../src/container.js';
import { createFixedClock } from '../src/infrastructure/clock.js';
import { IN_MEMORY, openDatabase } from '../src/infrastructure/database/connection.js';
import { migrate } from '../src/infrastructure/database/migrator.js';
import { seedDemo } from '../src/infrastructure/database/seed/demo-seeder.js';
import { createHttpApp } from '../src/interfaces/http/app.js';

/** Estado inicial da demonstração: 2026-10-22 08:00 UTC. */
export const DEMO_NOW = '2026-10-22T08:00:00.000Z';

const silentLogger = { error() {} };

export function createTestDb({ clock = createFixedClock(DEMO_NOW), seed = true } = {}) {
  const db = openDatabase(IN_MEMORY);
  migrate(db);
  if (seed) seedDemo(db, { clock });
  return db;
}

export function createTestContext() {
  const clock = createFixedClock(DEMO_NOW);
  const db = createTestDb({ clock });
  return { db, clock, ...createContainer({ db, clock }) };
}

export async function startTestServer() {
  const context = createTestContext();
  const app = createHttpApp({ services: context.services, clock: context.clock, logger: silentLogger });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  function close() {
    return new Promise((resolve) => {
      server.close(() => {
        context.db.close();
        resolve();
      });
      server.closeAllConnections();
    });
  }

  return { ...context, base, api, close };
}

/** Atalhos para encontrar ids pelos códigos dos dados de demonstração. */
export function demoIds(db) {
  const idOf = (sql, value) => db.prepare(sql).get(value)?.id;
  return {
    vehicle: (plate) => idOf('SELECT id FROM vehicles WHERE plate = ?', plate),
    plan: (code) => idOf('SELECT id FROM wash_plans WHERE code = ?', code),
    station: (code) => idOf('SELECT id FROM stations WHERE code = ?', code),
  };
}
