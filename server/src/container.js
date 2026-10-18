// Raiz de composição: o único ponto que liga as implementações concretas (SQLite, relógio,
// avisos na conversa) aos casos de uso. Nenhuma outra camada instancia repositórios.
import { AppointmentService } from './application/appointment-service.js';
import { AuthService } from './application/auth-service.js';
import { BankReportService } from './application/bank-report-service.js';
import { CatalogService } from './application/catalog-service.js';
import { ChangeLogService } from './application/change-log-service.js';
import { ConsentService } from './application/consent-service.js';
import { ConversationService } from './application/conversation-service.js';
import { CustomerService } from './application/customer-service.js';
import { DashboardService } from './application/dashboard-service.js';
import { LoyaltyService } from './application/loyalty-service.js';
import { PaymentService } from './application/payment-service.js';
import { ReconciliationService } from './application/reconciliation-service.js';
import { SelfService } from './application/self-service.js';
import { SettingsService } from './application/settings-service.js';
import { SharingService } from './application/sharing-service.js';
import { StationService } from './application/station-service.js';
import { VehicleHistoryService } from './application/vehicle-history-service.js';
import { WashService } from './application/wash-service.js';
import { systemClock } from './infrastructure/clock.js';
import { SqliteAppointmentRepository } from './infrastructure/database/repositories/appointment-repository.js';
import { SqliteCatalogRepository } from './infrastructure/database/repositories/catalog-repository.js';
import { SqliteChangeLogRepository } from './infrastructure/database/repositories/change-log-repository.js';
import { SqliteConsentRepository } from './infrastructure/database/repositories/consent-repository.js';
import { SqliteConversationRepository } from './infrastructure/database/repositories/conversation-repository.js';
import { SqliteCustomerRepository } from './infrastructure/database/repositories/customer-repository.js';
import { SqliteLoyaltyRepository } from './infrastructure/database/repositories/loyalty-repository.js';
import { SqlitePaymentRepository } from './infrastructure/database/repositories/payment-repository.js';
import { SqliteReconciliationRepository } from './infrastructure/database/repositories/reconciliation-repository.js';
import { SqliteReportingRepository } from './infrastructure/database/repositories/reporting-repository.js';
import { SqliteSettingsRepository } from './infrastructure/database/repositories/settings-repository.js';
import { SqliteSharingRepository } from './infrastructure/database/repositories/sharing-repository.js';
import { SqliteUserRepository } from './infrastructure/database/repositories/user-repository.js';
import { SqliteStationRepository } from './infrastructure/database/repositories/station-repository.js';
import { SqliteVehicleRepository } from './infrastructure/database/repositories/vehicle-repository.js';
import { SqliteWashRepository } from './infrastructure/database/repositories/wash-repository.js';
import { SqliteUnitOfWork } from './infrastructure/database/unit-of-work.js';
import { resetDemoDatabase } from './infrastructure/database/demo-reset.js';
import { HmacJwtTokenService, randomSecret } from './infrastructure/security/jwt.js';
import { ScryptPasswordHasher, secureRandom } from './infrastructure/security/password-hasher.js';
import { ConversationNotifier } from './interfaces/chat/notifier.js';

/**
 * @param security { tokenSecret?, passwordHasher? } — sem segredo, as sessões valem só até reiniciar
 */
export function createContainer({ db, clock = systemClock, security = {} }) {
  const unitOfWork = new SqliteUnitOfWork(db);
  const passwordHasher = security.passwordHasher ?? new ScryptPasswordHasher();
  const tokenService = new HmacJwtTokenService({ secret: security.tokenSecret ?? randomSecret(), clock });
  const repositories = {
    appointmentRepository: new SqliteAppointmentRepository(db),
    catalogRepository: new SqliteCatalogRepository(db),
    changeLogRepository: new SqliteChangeLogRepository(db),
    consentRepository: new SqliteConsentRepository(db),
    conversationRepository: new SqliteConversationRepository(db),
    customerRepository: new SqliteCustomerRepository(db),
    loyaltyRepository: new SqliteLoyaltyRepository(db),
    paymentRepository: new SqlitePaymentRepository(db),
    reconciliationRepository: new SqliteReconciliationRepository(db),
    reportingRepository: new SqliteReportingRepository(db),
    settingsRepository: new SqliteSettingsRepository(db),
    sharingRepository: new SqliteSharingRepository(db),
    stationRepository: new SqliteStationRepository(db),
    userRepository: new SqliteUserRepository(db),
    vehicleRepository: new SqliteVehicleRepository(db),
    washRepository: new SqliteWashRepository(db),
  };
  const shared = { ...repositories, unitOfWork, clock };

  const settingsService = new SettingsService(shared);
  const catalogService = new CatalogService(shared);
  const conversationService = new ConversationService(shared);
  const consentService = new ConsentService(shared);
  const customerService = new CustomerService({ ...shared, catalogService, consentService });
  const loyaltyService = new LoyaltyService(shared);
  const notifier = new ConversationNotifier({ conversationService, loyaltyService, catalogService });
  const paymentService = new PaymentService({ ...shared, loyaltyService, notifier });
  const washService = new WashService({ ...shared, catalogService, paymentService, loyaltyService, notifier });
  const appointmentService = new AppointmentService({ ...shared, catalogService, washService, settingsService, notifier });
  const stationService = new StationService(shared);
  const vehicleHistoryService = new VehicleHistoryService({ ...shared, catalogService });
  const sharingService = new SharingService(shared);
  const bankReportService = new BankReportService({ ...shared, sharingService, settingsService });
  const dashboardService = new DashboardService({ ...shared, sharingService });
  const reconciliationService = new ReconciliationService(shared);
  const changeLogService = new ChangeLogService(shared);
  const authService = new AuthService({ ...shared, tokenService, passwordHasher, random: secureRandom, conversationService });
  const selfService = new SelfService({ customerService, consentService, washService, paymentService, loyaltyService, appointmentService });

  return {
    unitOfWork,
    repositories,
    security: { tokenService, passwordHasher },
    services: {
      // Reposição da demonstração (só exposta com token, confirmação e acesso local)
      demoResetService: { reset: () => resetDemoDatabase(db, { clock, passwordHasher }) },
      appointmentService,
      authService,
      bankReportService,
      catalogService,
      changeLogService,
      consentService,
      conversationService,
      customerService,
      dashboardService,
      loyaltyService,
      paymentService,
      reconciliationService,
      selfService,
      washService,
      stationService,
      settingsService,
      sharingService,
      vehicleHistoryService,
    },
  };
}
