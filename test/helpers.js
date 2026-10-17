// Cada teste usa uma base em memória, com migrações e dados de demonstração.
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seedDemo } from '../src/db/seed-demo.js';
import { createFixedClock } from '../src/lib/clock.js';

process.env.NODE_ENV = 'test';

export function createTestDb({ clock = createFixedClock(), seed = true } = {}) {
  const db = openDatabase(':memory:');
  migrate(db);
  if (seed) seedDemo(db, { clock });
  return db;
}

export async function startTestServer({ seed = true } = {}) {
  const clock = createFixedClock();
  const db = createTestDb({ clock, seed });
  const server = await new Promise((resolve) => {
    const s = createApp({ db, clock }).listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  return {
    db,
    clock,
    base,
    api,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}
