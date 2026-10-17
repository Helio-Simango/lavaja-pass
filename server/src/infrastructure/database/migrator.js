import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR } from '../../config.js';
import { SqliteUnitOfWork } from './unit-of-work.js';

const MIGRATION_FILE = /^\d{3}_[\w-]+\.sql$/;

/** Aplica, por ordem, os ficheiros NNN_nome.sql ainda não aplicados. Devolve os aplicados agora. */
export function migrate(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  const pending = fs
    .readdirSync(dir)
    .filter((file) => MIGRATION_FILE.test(file) && !applied.has(file))
    .sort();

  const unitOfWork = new SqliteUnitOfWork(db);
  for (const file of pending) {
    unitOfWork.run(() => {
      db.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    });
  }
  return pending;
}
