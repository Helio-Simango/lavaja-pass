import { Router } from 'express';
import { createCatalogController } from './controllers/catalog-controller.js';
import { createCustomerController } from './controllers/customer-controller.js';
import { createPaymentController } from './controllers/payment-controller.js';
import { createWashController } from './controllers/wash-controller.js';

export function createApiRouter({ services, clock }) {
  const catalog = createCatalogController(services);
  const customers = createCustomerController(services);
  const washes = createWashController({ ...services, clock });
  const payments = createPaymentController(services);
  const router = Router();

  router.get('/health', (req, res) => res.json({ status: 'ok', name: 'LavaJá Pass', prototype: true }));
  router.get('/settings', (req, res) => res.json({ settings: services.settingsService.list() }));

  // Catálogo
  router.get('/vehicle-classes', catalog.listClasses);
  router.get('/plans', catalog.listPlans);
  router.patch('/plans/:id', catalog.updatePlan);
  router.put('/plans/:id/prices/:classId', catalog.setPrice);

  // Clientes e viaturas
  router.get('/customers', customers.list);
  router.post('/customers', customers.register);
  router.get('/customers/:id', customers.get);
  router.post('/customers/:id/vehicles', customers.addVehicle);
  router.get('/vehicles', customers.listVehicles);
  router.get('/vehicles/:id', customers.getVehicle);
  router.patch('/vehicles/:id', customers.reclassifyVehicle);

  // Serviços, fila e postos
  router.get('/stations', washes.listStations);
  router.get('/washes', washes.list);
  router.post('/washes', washes.register);
  router.get('/washes/:id', washes.get);
  router.post('/washes/:id/transitions', washes.transition);

  // Pagamentos simulados (com Idempotency-Key)
  router.get('/washes/:id/payments', payments.listForWash);
  router.post('/washes/:id/payments/digital', payments.startDigital);
  router.post('/washes/:id/payments/cash', payments.declareCash);
  router.post('/payments/:id/simulate', payments.simulate);
  router.post('/payments/:id/refund', payments.refund);

  return router;
}
