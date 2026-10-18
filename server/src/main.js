import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { openDatabase } from './infrastructure/database/connection.js';
import { migrate } from './infrastructure/database/migrator.js';
import { createHttpApp } from './interfaces/http/app.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(`Configuração inválida (.env): ${error.message}`);
  process.exit(1);
}
const db = openDatabase(config.dbPath);
const applied = migrate(db);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);

if (!config.jwtSecret) console.warn('JWT_SECRET não definido: segredo aleatório, as sessões terminam ao reiniciar.');
const { services } = createContainer({ db, publicUrl: config.publicUrl, security: { tokenSecret: config.jwtSecret ?? undefined } });
const app = createHttpApp({ services, demoResetToken: config.demoResetToken, secureCookies: config.secureCookies });
const server = app.listen(config.port, config.host, () => {
  const host = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`LavaJá Pass em http://${host}:${config.port}`);
  console.log('Protótipo com dados de demonstração: não usar com dados reais.');
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
