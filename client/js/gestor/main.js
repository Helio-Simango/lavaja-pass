// Painel do gestor (perfil Gestor): barra lateral com as secções e navegação por endereço (#visao…).
// Cada vista carrega os seus dados ao abrir; a visão geral e o pátio actualizam-se sozinhos.
import { api } from '../core/api-client.js';
import { $, $$ } from '../core/dom.js';
import { bindLogout, requireSession } from '../core/session.js';
import { createCampaignsView } from './campaigns-view.js';
import { createCatalogView } from './catalog-view.js';
import { createCreditView } from './credit-view.js';
import { createCustomersView } from './customers-view.js';
import { createOverviewView } from './overview-view.js';
import { createReconciliationView } from './reconciliation-view.js';
import { createYardView } from './yard-view.js';

const PROFILE = 'gestor';
const REFRESH_INTERVAL_MS = 5000;

const session = await requireSession(PROFILE);
$('#who-name').textContent = session.name;
$('#who-role').textContent = session.roleLabel;
bindLogout($('#logout'), PROFILE);

const views = {
  visao: createOverviewView({ session }),
  patio: createYardView(),
  clientes: createCustomersView(),
  campanhas: createCampaignsView(),
  conciliacao: createReconciliationView(),
  catalogo: createCatalogView(),
  credito: createCreditView(),
};
let current = null;

async function show(name) {
  current = Object.hasOwn(views, name) ? name : 'visao';
  for (const section of $$('[data-view]')) section.classList.toggle('on', section.dataset.view === current);
  for (const link of $$('[data-nav]')) {
    if (link.dataset.nav === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  try {
    await views[current].load();
  } catch (error) {
    console.error(error);
  }
}

window.addEventListener('hashchange', () => show(location.hash.slice(1)));

api('GET', '/public/business').then(({ name }) => ($('#org').textContent = name));
api('GET', '/customers').then(({ total }) => ($('#nav-customers').textContent = `(${total})`)).catch(() => {});

await show(location.hash.slice(1));
setInterval(() => {
  if (document.visibilityState === 'visible' && views[current].refresh) views[current].refresh().catch(() => {});
}, REFRESH_INTERVAL_MS);
