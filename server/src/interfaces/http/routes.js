import { Router } from 'express';
import { createAppointmentController } from './controllers/appointment-controller.js';
import { createBankController } from './controllers/bank-controller.js';
import { createCatalogController } from './controllers/catalog-controller.js';
import { createCustomerController } from './controllers/customer-controller.js';
import { createDashboardController } from './controllers/dashboard-controller.js';
import { createLoyaltyController } from './controllers/loyalty-controller.js';
import { createPaymentController } from './controllers/payment-controller.js';
import { createSimulatorController } from './controllers/simulator-controller.js';
import { createWashController } from './controllers/wash-controller.js';

export function createApiRouter({ services, clock }) {
  const catalog = createCatalogController(services);
  const customers = createCustomerController(services);
  const washes = createWashController({ ...services, clock });
  const payments = createPaymentController(services);
  const loyalty = createLoyaltyController(services);
  const simulator = createSimulatorController(services);
  const dashboard = createDashboardController(services);
  const bank = createBankController(services);
  const appointments = createAppointmentController(services);
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
  router.get('/vehicles', dashboard.listVehicles);
  router.get('/vehicles/:id', customers.getVehicle);
  router.patch('/vehicles/:id', customers.reclassifyVehicle);
  router.get('/vehicles/:id/wash-history/summary', dashboard.historySummary);
  router.get('/vehicles/:id/wash-history', dashboard.history);

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

  // Fidelização
  router.get('/loyalty/rules', loyalty.getRules);
  router.put('/loyalty/rules', loyalty.publishRules);
  router.get('/customers/:id/loyalty', loyalty.card);
  router.get('/customers/:id/loyalty/movements', loyalty.movements);

  // Marcações e capacidade
  router.get('/availability', appointments.availability);
  router.get('/capacity', appointments.capacity);
  router.get('/appointments', appointments.list);
  router.post('/appointments', appointments.book);
  router.get('/appointments/:id', appointments.get);
  router.post('/appointments/:id/transitions', appointments.transition);
  router.post('/appointments/:id/offers', appointments.propose);
  router.post('/appointment-offers/:id/respond', appointments.respond);

  // Painel
  router.get('/dashboard/summary', dashboard.summary);
  router.get('/dashboard/weekly', dashboard.weekly);

  // Vertente Lavadora–Banco (demonstrativa, D-16)
  router.get('/institutions', bank.listInstitutions);
  router.get('/institutions/:id/reports/activity', bank.activityReport);
  router.get('/sharing/authorizations', bank.listAuthorizations);
  router.post('/sharing/authorizations', bank.grant);
  router.post('/sharing/authorizations/:id/revoke', bank.revoke);
  router.get('/sharing/access-logs', bank.accessLogs);

  // Simulador de WhatsApp
  router.get('/simulator/threads', simulator.listThreads);
  router.get('/simulator/threads/:phone/messages', simulator.listMessages);
  router.post('/simulator/threads/:phone/messages', simulator.sendMessage);

  return router;
}
