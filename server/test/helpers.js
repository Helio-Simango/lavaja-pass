// Cada teste de integração usa uma base em memória, com migrações e dados de demonstração.
import { createContainer } from '../src/container.js';
import { createFixedClock } from '../src/infrastructure/clock.js';
import { IN_MEMORY, openDatabase } from '../src/infrastructure/database/connection.js';
import { migrate } from '../src/infrastructure/database/migrator.js';
import { DEMO_USERS } from '../src/infrastructure/database/seed/demo-data.js';
import { seedDemo } from '../src/infrastructure/database/seed/demo-seeder.js';
import { ScryptPasswordHasher } from '../src/infrastructure/security/password-hasher.js';
import { createHttpApp } from '../src/interfaces/http/app.js';

/** Estado inicial da demonstração: 2026-10-22 08:00 UTC. */
export const DEMO_NOW = '2026-10-22T08:00:00.000Z';
export const TEST_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!';

const silentLogger = { error() {} };
// Custo de hash baixo: os testes não medem a resistência do scrypt, só o comportamento.
export const fastHasher = new ScryptPasswordHasher({ cost: 1024 });
const security = { tokenSecret: TEST_TOKEN_SECRET, passwordHasher: fastHasher };

export function createTestDb({ clock = createFixedClock(DEMO_NOW), seed = true } = {}) {
  const db = openDatabase(IN_MEMORY);
  migrate(db);
  if (seed) seedDemo(db, { clock, passwordHasher: fastHasher, volume: 'compact' });
  return db;
}

export function createTestContext() {
  const clock = createFixedClock(DEMO_NOW);
  const db = createTestDb({ clock });
  return { db, clock, ...createContainer({ db, clock, security, demoVolume: 'compact' }) };
}

/**
 * Servidor HTTP real numa porta livre. Os pedidos levam, por omissão, a sessão do gestor;
 * t.as(perfil) dá os cabeçalhos de outro perfil e { Authorization: null } envia sem sessão.
 */
export async function startTestServer({ demoResetToken = null } = {}) {
  const context = createTestContext();
  const app = createHttpApp({ services: context.services, clock: context.clock, logger: silentLogger, demoResetToken });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const sessions = new Map();

  /**
   * @param role 'manager' | 'operator' | 'bank_analyst' | 'customer'
   * @param who nome do operador ou telefone do cliente
   */
  function as(role, who) {
    const key = `${role}:${who ?? ''}`;
    if (!sessions.has(key)) sessions.set(key, `Bearer ${tokenFor(context, role, who)}`);
    return { Authorization: sessions.get(key) };
  }

  async function api(method, path, body, headers = {}) {
    const merged = { 'Content-Type': 'application/json', ...as('manager'), ...headers };
    if (merged.Authorization === null) delete merged.Authorization;
    const res = await fetch(base + path, {
      method,
      headers: merged,
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

  return { ...context, base, api, as, close };
}

/** Entra com as credenciais de demonstração (o cliente recebe uma sessão emitida directamente). */
function tokenFor({ services, security: { tokenService }, db }, role, who) {
  const { authService } = services;
  if (role === 'operator') {
    const name = who ?? 'Amílcar';
    const { pin } = DEMO_USERS.find((user) => user.role === 'operator' && user.name === name);
    const operatorId = authService.operatorRoster().find((operator) => operator.name === name).id;
    return authService.loginOperator({ operatorId, pin }).token;
  }
  if (role === 'manager' || role === 'bank_analyst') {
    const { email, password } = DEMO_USERS.find((user) => user.role === role);
    return authService.loginStaff({ email, password }).token;
  }
  const customer = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(who);
  const claims = { sub: `customer:${customer.id}`, role: 'customer', name: customer.name, cid: customer.id, purpose: 'session' };
  return tokenService.issue(claims, 30).token;
}

/** Atalhos para encontrar ids pelos códigos dos dados de demonstração. */
export function demoIds(db) {
  const idOf = (sql, value) => db.prepare(sql).get(value)?.id;
  return {
    vehicle: (plate) => idOf('SELECT id FROM vehicles WHERE plate = ?', plate),
    plan: (code) => idOf('SELECT id FROM wash_plans WHERE code = ?', code),
    station: (code) => idOf('SELECT id FROM stations WHERE code = ?', code),
    /** Serviço activo (em fila, em execução ou pronto) de uma viatura do pátio de demonstração. */
    yardWash: (plate) =>
      idOf("SELECT id FROM washes WHERE plate = ? AND status IN ('queued', 'in_progress', 'ready')", plate),
    customer: (phone) => idOf('SELECT id FROM customers WHERE phone = ?', phone),
  };
}
