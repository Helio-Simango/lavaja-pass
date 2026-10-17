// npm run db:migrate — aplica só as migrações em falta.
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/infrastructure/database/connection.js';
import { migrate } from '../src/infrastructure/database/migrator.js';

const db = openDatabase(loadConfig().dbPath);
const applied = migrate(db);
db.close();
console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Base de dados já actualizada.');
