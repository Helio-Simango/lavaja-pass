// npm run db:reset — apaga a base deste projecto, aplica as migrações e carrega a demonstração.
import fs from 'node:fs';
import { config } from '../config.js';
import { openDatabase } from './connection.js';
import { migrate } from './migrate.js';
import { seedDemo } from './seed-demo.js';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(config.dbPath + suffix, { force: true });
}
const db = openDatabase(config.dbPath);
const applied = migrate(db);
seedDemo(db);
db.close();
console.log(`Base reposta em ${config.dbPath} (${applied.length} migrações, dados de demonstração carregados).`);
