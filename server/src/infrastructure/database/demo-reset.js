// Reposição da demonstração com o servidor a correr: apaga todas as tabelas deste projecto,
// volta a aplicar as migrações e carrega os dados de demonstração.
// As tabelas de auditoria só aceitam novos registos (triggers); DROP TABLE não dispara triggers.
import { migrate } from './migrator.js';
import { seedDemo } from './seed/demo-seeder.js';

export function resetDemoDatabase(db, { clock, passwordHasher }) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const table of tables) db.exec(`DROP TABLE IF EXISTS "${table}"`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
  migrate(db);
  seedDemo(db, { clock, passwordHasher });
}
