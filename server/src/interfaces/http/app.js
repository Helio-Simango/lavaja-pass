import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_DIR, SIMULATOR_DIR } from '../../config.js';
import { systemClock } from '../../infrastructure/clock.js';
import { apiNotFound, createErrorHandler } from './middleware/error-handler.js';
import { createApiRouter } from './routes.js';
import { pageSession } from './session.js';

const JSON_BODY_LIMIT = '100kb';

// Páginas de cada perfil (I-11): só abrem com a sessão desse perfil; sem ela, vão para a entrada.
const PROFILE_PAGES = Object.freeze({
  operador: { file: 'operador.html', profile: 'operador' },
  gestor: { file: 'gestor.html', profile: 'gestor' },
  moza: { file: 'moza.html', profile: 'analista' },
  cliente: { file: 'cliente.html', profile: 'cliente' },
});

// Endereços dos ecrãs anteriores ao I-11.
const LEGACY_REDIRECTS = Object.freeze({
  '/patio': '/operador',
  '/painel': '/gestor',
  '/catalogo': '/gestor#catalogo',
  '/banco': '/gestor#credito',
});

/**
 * A aplicação HTTP só conhece os casos de uso; não sabe que a persistência é SQLite.
 * Serve apenas client/ e simulador/ (a base de dados fica em server/data/).
 */
export function createHttpApp({ services, clock = systemClock, logger = console, demoResetToken = null, secureCookies = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', createApiRouter({ services, clock, demoResetToken, secureCookies }), apiNotFound);
  mountSimulator(app);
  mountProfilePages(app, services.authService);
  app.use('/test', (req, res) => res.sendStatus(404)); // os testes do cliente não são públicos
  app.use(express.static(CLIENT_DIR, { extensions: ['html'] })); // /entrar -> entrar.html

  app.use(createErrorHandler({ logger }));
  return app;
}

function mountProfilePages(app, authService) {
  for (const [route, page] of Object.entries(PROFILE_PAGES)) {
    app.get([`/${route}`, `/${route}.html`], (req, res) => {
      if (!pageSession(req, authService, page.profile)) {
        res.redirect(302, `/entrar?perfil=${page.profile}&volta=${encodeURIComponent(`/${route}`)}`);
        return;
      }
      res.set('Cache-Control', 'no-store');
      res.sendFile(path.join(CLIENT_DIR, page.file));
    });
  }
  // Checkout (M4): a página troca o token do link (no fragmento) por uma sessão do cliente.
  app.get('/pagar/:washId', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'pagar.html')));
  for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) app.get([from, `${from}.html`], (req, res) => res.redirect(301, to));
}

// Simulador de WhatsApp (I-5): um endereço por número, /simulador/whatsapp/258841234567.
// Só os recursos da interface são públicos (não, por exemplo, o README da pasta).
function mountSimulator(app) {
  const page = path.join(SIMULATOR_DIR, 'index.html');
  for (const assets of ['css', 'js']) {
    app.use(`/simulador/${assets}`, express.static(path.join(SIMULATOR_DIR, assets)));
  }
  app.get(['/simulador', '/simulador/whatsapp/:phone'], (req, res, next) => (fs.existsSync(page) ? res.sendFile(page) : next()));
}

/** Cabeçalhos de segurança básicos: sem framing por outros sites, sem adivinhar tipos, sem referer externo. */
function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
  });
  next();
}
