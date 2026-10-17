// npm run db:seed — carrega a demonstração numa base vazia.
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/infrastructure/database/connection.js';
import { migrate } from '../src/infrastructure/database/migrator.js';
import { seedDemo } from '../src/infrastructure/database/seed/demo-seeder.js';

const db = openDatabase(loadConfig().dbPath);
migrate(db);
const seeded = seedDemo(db);
db.close();
console.log(seeded ? 'Dados de demonstração carregados.' : 'A base já tem dados; nada foi alterado.');
