import { Router } from 'express';
import { createCatalogController } from '../controllers/catalog.js';
import { createCustomersController } from '../controllers/customers.js';
import { createWashesController } from '../controllers/washes.js';

export function createApiRouter(services) {
  const router = Router();
  const catalog = createCatalogController(services);
  const customers = createCustomersController(services);
  const washes = createWashesController(services);

  router.get('/health', (req, res) => res.json({ status: 'ok', name: 'LavaJá Pass', prototype: true }));
  router.get('/settings', (req, res) => res.json({ settings: services.settings.list() }));

  // Catálogo
  router.get('/vehicle-classes', catalog.listClasses);
  router.get('/plans', catalog.listPlans);
  router.patch('/plans/:id', catalog.updatePlan);
  router.put('/plans/:id/prices/:classId', catalog.setPrice);

  // Clientes e viaturas
  router.get('/customers', customers.list);
  router.post('/customers', customers.create);
  router.get('/customers/:id', customers.get);
  router.post('/customers/:id/vehicles', customers.addVehicle);
  router.get('/vehicles', customers.listVehicles);
  router.get('/vehicles/:id', customers.getVehicle);
  router.patch('/vehicles/:id', customers.updateVehicle);

  // Serviços, fila e postos
  router.get('/stations', washes.listStations);
  router.get('/washes', washes.list);
  router.post('/washes', washes.create);
  router.get('/washes/:id', washes.get);
  router.post('/washes/:id/transitions', washes.transition);

  return router;
}
