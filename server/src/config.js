import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');
export const CLIENT_DIR = path.join(ROOT_DIR, 'client');
export const SIMULATOR_DIR = path.join(ROOT_DIR, 'simulador');
export const MIGRATIONS_DIR = path.join(SERVER_DIR, 'src', 'infrastructure', 'database', 'migrations');

const PUBLIC_DIRS = [CLIENT_DIR, SIMULATOR_DIR];

export function resolveDbPath(env = process.env) {
  const dbPath = env.DB_PATH ? path.resolve(ROOT_DIR, env.DB_PATH) : path.join(SERVER_DIR, 'data', 'lavaja.db');
  // A base de dados nunca pode ficar numa pasta servida ao browser.
  const servedDir = PUBLIC_DIRS.find((dir) => dbPath === dir || dbPath.startsWith(dir + path.sep));
  if (servedDir) throw new Error(`DB_PATH não pode ficar dentro de ${path.relative(ROOT_DIR, servedDir)}/: ${dbPath}`);
  return dbPath;
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '127.0.0.1',
    dbPath: resolveDbPath(env),
  });
}
