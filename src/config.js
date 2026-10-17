import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
export const MIGRATIONS_DIR = path.join(ROOT_DIR, 'src', 'db', 'migrations');

const dbPath = process.env.DB_PATH
  ? path.resolve(ROOT_DIR, process.env.DB_PATH)
  : path.join(ROOT_DIR, 'data', 'lavaja.db');

// A base de dados nunca pode ficar dentro da pasta servida ao browser.
if (dbPath === PUBLIC_DIR || dbPath.startsWith(PUBLIC_DIR + path.sep)) {
  throw new Error(`DB_PATH não pode ficar dentro de public/: ${dbPath}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  dbPath,
};
