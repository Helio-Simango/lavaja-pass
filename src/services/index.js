import { systemClock } from '../lib/clock.js';
import { createCatalogService } from './catalog.js';
import { createCustomersService } from './customers.js';
import { createHistoryService } from './history.js';
import { createSettingsService } from './settings.js';
import { createStationsService } from './stations.js';
import { createWashesService } from './washes.js';

export function createServices({ db, clock = systemClock }) {
  const history = createHistoryService({ db, clock });
  const settings = createSettingsService({ db, clock });
  const catalog = createCatalogService({ db, clock, history });
  const customers = createCustomersService({ db, clock, catalog, history });
  const stations = createStationsService({ db });
  const washes = createWashesService({ db, clock, catalog });
  return { history, settings, catalog, customers, stations, washes };
}
