import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/connection.js';
import { migrate } from './db/migrate.js';

const db = openDatabase(config.dbPath);
const applied = migrate(db);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);

const server = createApp({ db }).listen(config.port, config.host, () => {
  console.log(`LavaJá Pass em http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log('Protótipo sem autenticação: não usar com dados reais.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeAllConnections();
  });
}
