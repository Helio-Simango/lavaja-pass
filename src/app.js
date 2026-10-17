import express from 'express';
import { PUBLIC_DIR } from './config.js';
import { systemClock } from './lib/clock.js';
import { apiNotFound, errorHandler } from './middleware/errors.js';
import { createApiRouter } from './routes/api.js';
import { createServices } from './services/index.js';

export function createApp({ db, clock = systemClock }) {
  const services = createServices({ db, clock });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', createApiRouter(services), apiNotFound);

  // express.static só serve public/ (a base de dados fica em data/). /patio -> patio.html
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}
