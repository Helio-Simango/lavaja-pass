// Raiz de composição: o único ponto que liga as implementações concretas (SQLite, relógio)
// aos casos de uso. Nenhuma outra camada instancia repositórios.
import { CatalogService } from './application/catalog-service.js';
import { CustomerService } from './application/customer-service.js';
import { SettingsService } from './application/settings-service.js';
import { StationService } from './application/station-service.js';
import { WashService } from './application/wash-service.js';
import { systemClock } from './infrastructure/clock.js';
import { SqliteCatalogRepository } from './infrastructure/database/repositories/catalog-repository.js';
import { SqliteChangeLogRepository } from './infrastructure/database/repositories/change-log-repository.js';
import { SqliteCustomerRepository } from './infrastructure/database/repositories/customer-repository.js';
import { SqliteSettingsRepository } from './infrastructure/database/repositories/settings-repository.js';
import { SqliteStationRepository } from './infrastructure/database/repositories/station-repository.js';
import { SqliteVehicleRepository } from './infrastructure/database/repositories/vehicle-repository.js';
import { SqliteWashRepository } from './infrastructure/database/repositories/wash-repository.js';
import { SqliteUnitOfWork } from './infrastructure/database/unit-of-work.js';

export function createContainer({ db, clock = systemClock }) {
  const unitOfWork = new SqliteUnitOfWork(db);
  const repositories = {
    catalogRepository: new SqliteCatalogRepository(db),
    changeLogRepository: new SqliteChangeLogRepository(db),
    customerRepository: new SqliteCustomerRepository(db),
    settingsRepository: new SqliteSettingsRepository(db),
    stationRepository: new SqliteStationRepository(db),
    vehicleRepository: new SqliteVehicleRepository(db),
    washRepository: new SqliteWashRepository(db),
  };
  const shared = { ...repositories, unitOfWork, clock };

  const catalogService = new CatalogService(shared);
  const customerService = new CustomerService({ ...shared, catalogService });
  const washService = new WashService({ ...shared, catalogService });
  const stationService = new StationService(shared);
  const settingsService = new SettingsService(shared);

  return {
    unitOfWork,
    repositories,
    services: { catalogService, customerService, washService, stationService, settingsService },
  };
}
