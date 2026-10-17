import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, MIGRATIONS_DIR } from '../config.js';
import { openDatabase } from './connection.js';
import { transaction } from './tx.js';

// Aplica, por ordem, os ficheiros NNN_nome.sql ainda não aplicados. Devolve os aplicados agora.
export function migrate(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version),
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();

  const done = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    transaction(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    });
    done.push(file);
  }
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDatabase(config.dbPath);
  const done = migrate(db);
  db.close();
  console.log(done.length ? `Migrações aplicadas: ${done.join(', ')}` : 'Base de dados já actualizada.');
}
