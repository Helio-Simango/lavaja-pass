import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { openDatabase } from './infrastructure/database/connection.js';
import { migrate } from './infrastructure/database/migrator.js';
import { createHttpApp } from './interfaces/http/app.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const applied = migrate(db);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);

const { services } = createContainer({ db });
const server = createHttpApp({ services, demoResetToken: config.demoResetToken }).listen(config.port, config.host, () => {
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`LavaJá Pass em http://${host}:${config.port}`);
  console.log('Protótipo sem autenticação: não usar com dados reais.');
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeAllConnections();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
