// npm run db:reset — apaga a base deste projecto, aplica as migrações e carrega a demonstração.
import { loadConfig } from '../src/config.js';
import { openDatabase, removeDatabaseFiles } from '../src/infrastructure/database/connection.js';
import { migrate } from '../src/infrastructure/database/migrator.js';
import { seedDemo } from '../src/infrastructure/database/seed/demo-seeder.js';

const { dbPath } = loadConfig();
removeDatabaseFiles(dbPath);
const db = openDatabase(dbPath);
const applied = migrate(db);
seedDemo(db);
db.close();
console.log(`Base reposta em ${dbPath} (${applied.length} migrações, dados de demonstração carregados).`);
