import { Router } from 'express';
import { Permission } from '../../domain/access.js';
import { createAdminController } from './controllers/admin-controller.js';
import { createAppointmentController } from './controllers/appointment-controller.js';
import { createAuthController } from './controllers/auth-controller.js';
import { createBankController } from './controllers/bank-controller.js';
import { createCampaignController } from './controllers/campaign-controller.js';
import { createCatalogController } from './controllers/catalog-controller.js';
import { createCustomerController } from './controllers/customer-controller.js';
import { createDashboardController } from './controllers/dashboard-controller.js';
import { createGovernanceController } from './controllers/governance-controller.js';
import { createLoyaltyController } from './controllers/loyalty-controller.js';
import { createPaymentController } from './controllers/payment-controller.js';
import { createSelfController } from './controllers/self-controller.js';
import { createSimulatorController } from './controllers/simulator-controller.js';
import { createWashController } from './controllers/wash-controller.js';
import { allow, createAuthenticator } from './session.js';

const P = Permission;

/**
 * Cada rota declara a permissão que exige (matriz em domain/access.js). Sem permissão declarada,
 * a rota é pública: saúde, entrada, catálogo de preços e o simulador (o "telemóvel" do cliente).
 */
export function createApiRouter({ services, clock, demoResetToken = null, secureCookies = false }) {
  const auth = createAuthController(services, { secureCookies });
  const catalog = createCatalogController(services);
  const customers = createCustomerController(services);
  const washes = createWashController({ ...services, clock });
  const payments = createPaymentController(services);
  const loyalty = createLoyaltyController(services);
  const simulator = createSimulatorController(services);
  const dashboard = createDashboardController(services);
  const bank = createBankController(services);
  const appointments = createAppointmentController(services);
  const governance = createGovernanceController(services);
  const self = createSelfController(services);
  const campaigns = createCampaignController(services);
  const admin = createAdminController(services, { demoResetToken });
  const router = Router();

  router.use(createAuthenticator(services.authService));

  router.get('/health', (req, res) => res.json({ status: 'ok', name: 'LavaJá Pass', prototype: true }));
  // Dados públicos da lavadora (cartaz M1, simulador): só o nome.
  router.get('/public/business', (req, res) => res.json({ name: services.settingsService.get('business.name', 'Lava Já') }));

  // Entrada e sessão (I-11)
  router.get('/auth/operators', auth.operators);
  router.post('/auth/operator', auth.loginOperator);
  router.post('/auth/staff', auth.loginStaff);
  router.post('/auth/customer/code', auth.requestCustomerCode);
  router.post('/auth/customer/verify', auth.verifyCustomerCode);
  router.post('/auth/link', auth.redeemLink);
  router.get('/auth/session', auth.current);
  router.post('/auth/logout', auth.logout);

  router.get('/settings', allow(P.BUSINESS_READ), (req, res) => res.json({ settings: services.settingsService.list() }));

  // Catálogo (os preços são públicos, como no cartaz do pátio)
  router.get('/vehicle-classes', catalog.listClasses);
  router.get('/plans', catalog.listPlans);
  router.patch('/plans/:id', allow(P.CATALOG_MANAGE), catalog.updatePlan);
  router.put('/plans/:id/prices/:classId', allow(P.CATALOG_MANAGE), catalog.setPrice);

  // Clientes e viaturas
  router.get('/customers', allow(P.CUSTOMERS_READ), customers.list);
  router.post('/customers', allow(P.YARD_OPERATE), customers.register);
  router.get('/customers/:id', allow(P.CUSTOMERS_READ), customers.get);
  router.post('/customers/:id/vehicles', allow(P.YARD_OPERATE), customers.addVehicle);
  router.get('/vehicles', allow(P.BUSINESS_READ), dashboard.listVehicles);
  router.get('/vehicles/:id', allow(P.CUSTOMERS_READ), customers.getVehicle);
  router.patch('/vehicles/:id', allow(P.CATALOG_MANAGE), customers.reclassifyVehicle);
  router.get('/vehicles/:id/wash-history/summary', allow(P.BUSINESS_READ), dashboard.historySummary);
  router.get('/vehicles/:id/wash-history', allow(P.BUSINESS_READ), dashboard.history);

  // Serviços, fila e postos
  router.get('/stations', allow(P.YARD_READ), washes.listStations);
  router.get('/washes', allow(P.YARD_READ), washes.list);
  router.post('/washes', allow(P.YARD_OPERATE), washes.register);
  router.get('/washes/:id', allow(P.YARD_READ), washes.get);
  router.post('/washes/:id/transitions', allow(P.YARD_OPERATE), washes.transition);
  router.get('/yard/entries/preview', allow(P.YARD_OPERATE), washes.previewEntry);
  router.post('/yard/entries', allow(P.YARD_OPERATE), washes.registerEntry);

  // Pagamentos simulados (com Idempotency-Key)
  router.get('/washes/:id/payments', allow(P.YARD_READ), payments.listForWash);
  router.post('/washes/:id/payments/digital', allow(P.DIGITAL_START), payments.startDigital);
  router.post('/washes/:id/payments/cash', allow(P.CASH_DECLARE), payments.declareCash);
  router.post('/payments/:id/simulate', allow(P.PAYMENTS_MANAGE), payments.simulate);
  router.post('/payments/:id/refund', allow(P.PAYMENTS_MANAGE), payments.refund);

  // Fidelização
  router.get('/loyalty/rules', allow(P.YARD_READ), loyalty.getRules);
  router.put('/loyalty/rules', allow(P.CATALOG_MANAGE), loyalty.publishRules);
  router.get('/customers/:id/loyalty', allow(P.CUSTOMERS_READ), loyalty.card);
  router.get('/customers/:id/loyalty/movements', allow(P.CUSTOMERS_READ), loyalty.movements);

  // Marcações e capacidade
  router.get('/availability', allow(P.YARD_READ), appointments.availability);
  router.get('/capacity', allow(P.BUSINESS_READ), appointments.capacity);
  router.get('/appointments', allow(P.YARD_READ), appointments.list);
  router.post('/appointments', allow(P.YARD_OPERATE), appointments.book);
  router.get('/appointments/:id', allow(P.YARD_READ), appointments.get);
  router.post('/appointments/:id/transitions', allow(P.YARD_OPERATE), appointments.transition);
  router.post('/appointments/:id/offers', allow(P.YARD_OPERATE), appointments.propose);

  // Governação: consentimentos, alterações, postos, fecho do dia
  router.get('/customers/:id/consents', allow(P.CUSTOMERS_READ), governance.consents);
  router.post('/customers/:id/consents', allow(P.YARD_OPERATE), governance.recordConsent);
  router.get('/change-log', allow(P.BUSINESS_READ), governance.changeLog);
  router.patch('/stations/:id', allow(P.CATALOG_MANAGE), governance.setStationActive);
  router.get('/reconciliation', allow(P.BUSINESS_READ), governance.reconciliation);
  router.post('/reconciliation/closings', allow(P.RECONCILIATION_MANAGE), governance.closeCash);
  router.post('/reconciliation/corrections', allow(P.RECONCILIATION_MANAGE), governance.addCorrection);

  // Painel do gestor
  router.get('/dashboard/summary', allow(P.BUSINESS_READ), dashboard.summary);
  router.get('/dashboard/weekly', allow(P.BUSINESS_READ), dashboard.weekly);
  router.get('/dashboard/today', allow(P.BUSINESS_READ), dashboard.today);

  // Campanhas fora de pico: o gestor revê e confirma cada envio (nunca automático)
  router.get('/campaigns', allow(P.CAMPAIGNS_MANAGE), campaigns.list);
  router.get('/campaigns/preview', allow(P.CAMPAIGNS_MANAGE), campaigns.preview);
  router.post('/campaigns', allow(P.CAMPAIGNS_MANAGE), campaigns.send);

  // Partilha com bancos: a lavadora (gestor) autoriza e revoga
  router.get('/institutions', allow(P.SHARING_MANAGE), bank.listInstitutions);
  router.get('/sharing/authorizations', allow(P.SHARING_MANAGE), bank.listAuthorizations);
  router.post('/sharing/authorizations', allow(P.SHARING_MANAGE), bank.grant);
  router.post('/sharing/authorizations/:id/revoke', allow(P.SHARING_MANAGE), bank.revoke);
  router.get('/sharing/access-logs', allow(P.SHARING_MANAGE), bank.accessLogs);
  router.get('/sharing/credit-requests', allow(P.SHARING_MANAGE), bank.creditRequests);

  // Analista bancário: só a sua instituição e só o que a lavadora autorizou
  router.get('/bank/authorizations', allow(P.BANK_REPORTS), bank.analystAuthorizations);
  router.get('/bank/reports/activity', allow(P.BANK_REPORTS), bank.activityReport);
  router.get('/bank/credit-requests', allow(P.BANK_REPORTS), bank.analystCreditRequests);
  router.post('/bank/credit-requests', allow(P.BANK_REPORTS), bank.requestCreditAnalysis);

  // Área do cliente
  router.get('/me', allow(P.SELF_SERVICE), self.profile);
  router.get('/me/washes', allow(P.SELF_SERVICE), self.washes);
  router.get('/me/washes/:id', allow(P.SELF_SERVICE), self.wash);
  router.get('/me/loyalty', allow(P.SELF_SERVICE), self.loyalty);
  router.post('/me/washes/:id/payments', allow(P.SELF_SERVICE), self.startPayment);
  router.post('/me/washes/:id/payments/:paymentId/confirm', allow(P.SELF_SERVICE), self.confirmPayment);
  router.post('/me/appointment-offers/:id/respond', allow(P.SELF_SERVICE), self.respondToOffer);

  // Simulador de WhatsApp: faz de telemóvel do cliente (não existe em produção)
  router.get('/simulator/threads', simulator.listThreads);
  router.get('/simulator/threads/:phone/messages', simulator.listMessages);
  router.post('/simulator/threads/:phone/messages', simulator.sendMessage);

  // Demonstração
  router.post('/admin/demo/reset', admin.resetDemo);

  return router;
}
