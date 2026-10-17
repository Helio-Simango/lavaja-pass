import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, SIMULATOR_DIR } from '../../config.js';
import { systemClock } from '../../infrastructure/clock.js';
import { apiNotFound, createErrorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes.js';

const JSON_BODY_LIMIT = '100kb';

/**
 * A aplicação HTTP só conhece os casos de uso; não sabe que a persistência é SQLite.
 * Serve apenas client/ e simulador/ (a base de dados fica em server/data/).
 */
export function createHttpApp({ services, clock = systemClock, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', createApiRouter({ services, clock }), apiNotFound);
  mountSimulator(app);
  app.use(express.static(CLIENT_DIR, { extensions: ['html'] })); // /patio -> patio.html

  app.use(createErrorHandler({ logger }));
  return app;
}

// Simulador de WhatsApp (I-5): um endereço por número, /simulador/whatsapp/258841234567.
// Só os recursos da interface são públicos (não, por exemplo, o README da pasta).
function mountSimulator(app) {
  const page = path.join(SIMULATOR_DIR, 'index.html');
  for (const assets of ['css', 'js']) {
    app.use(`/simulador/${assets}`, express.static(path.join(SIMULATOR_DIR, assets)));
  }
  app.get('/simulador/whatsapp/:phone', (req, res, next) => (fs.existsSync(page) ? res.sendFile(page) : next()));
}
