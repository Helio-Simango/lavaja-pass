// Portas da camada de aplicação: os contratos que a infraestrutura implementa.
// Os casos de uso dependem só destes contratos; as implementações SQLite estão em
// infrastructure/database/repositories e são ligadas em container.js.

/**
 * @typedef {object} Clock
 * @property {() => Date} now
 * @property {() => string} nowIso
 */

/**
 * @typedef {object} UnitOfWork
 * @property {<T>(work: () => T) => T} run  confirma ou desfaz tudo em conjunto
 */

/**
 * @typedef {object} CatalogRepository
 * @property {() => object[]} listClasses
 * @property {(ref: {id:number}|{code:string}) => object|null} findClass
 * @property {() => object[]} listPlans
 * @property {(id: number) => object|null} findPlan
 * @property {(id: number, fields: object, now: string) => void} updatePlan
 * @property {(price: {planId:number, classId:number, priceCents:number}, now: string) => void} upsertPrice
 */

/**
 * @typedef {object} CustomerRepository
 * @property {(id: number) => object|null} findById
 * @property {(phone: string) => object|null} findByPhone
 * @property {(options: {limit:number}) => object[]} list
 * @property {(customer: {phone:string, name:string}, now: string) => number} insert
 */

/**
 * @typedef {object} VehicleRepository
 * @property {(id: number) => object|null} findById
 * @property {(jurisdiction: string, plate: string) => object|null} findByPlate
 * @property {(customerId: number) => object[]} listByCustomer
 * @property {(filter: {classId?:number}) => object[]} list
 * @property {(vehicle: object, now: string) => number} insert
 * @property {(id: number, classId: number, now: string) => void} updateClass
 */

/**
 * @typedef {object} StationRepository
 * @property {(id: number) => object|null} findById
 * @property {() => object[]} list
 * @property {() => object[]} listWithOccupancy
 */

/**
 * @typedef {object} WashRepository
 * @property {(id: number) => object|null} findById
 * @property {(vehicleId: number) => object|null} findActiveByVehicle
 * @property {(stationId: number) => object|null} findOccupyingStation
 * @property {() => object[]} listActive
 * @property {(filter: object) => object[]} list
 * @property {(wash: object, now: string) => number} insert
 * @property {(id: number, expectedStatus: string, changes: object, now: string) => boolean} applyTransition
 * @property {(washId: number, event: object, now: string) => void} appendEvent
 * @property {(washId: number) => object[]} listEvents
 */

/**
 * @typedef {object} PaymentRepository
 * @property {(id: number) => object|null} findById
 * @property {(key: string) => object|null} findByIdempotencyKey
 * @property {(washId: number) => object[]} listByWash
 * @property {(washIds: number[]) => Map<number, object[]>} listByWashes
 * @property {(payment: object, now: string) => number} insert
 * @property {(id: number, expectedStatus: string, changes: object, now: string) => boolean} update
 */

/**
 * @typedef {object} LoyaltyRepository
 * @property {(now: string) => object|null} findRulesInForce
 * @property {() => object[]} listRuleVersions
 * @property {(rules: object, now: string) => number} insertRules  devolve a versão criada
 * @property {(customerId: number) => number|null} findAccountId
 * @property {(customerId: number, now: string) => number} createAccount
 * @property {(accountId: number) => object[]} listMovements
 * @property {(reference: string) => boolean} hasReference
 * @property {(accountId: number, movement: object, now: string) => void} insertMovement
 */

/**
 * @typedef {object} ConversationRepository
 * @property {(phone: string) => object|null} findThreadByPhone
 * @property {(thread: object, now: string) => number} insertThread
 * @property {(id: number, state: object, now: string) => void} updateThread
 * @property {() => object[]} listThreads
 * @property {(threadId: number, message: object, now: string) => number} insertMessage
 * @property {(threadId: number, options: {afterId?: number}) => object[]} listMessages
 */

/**
 * @typedef {object} ConsentRepository
 * @property {(consent: object, now: string) => void} insert
 * @property {(customerId: number) => object} currentFor
 */

/**
 * Leituras agregadas para indicadores e relatórios (sem dados pessoais).
 * @typedef {object} ReportingRepository
 * @property {(from: string, to: string) => object[]} washesBetween
 * @property {(to: string) => object[]} paymentsUpTo
 * @property {() => Set<number>} earnedWashIds
 * @property {() => string|null} firstWashAt
 * @property {(from: string, to: string) => number} correctionsBetween
 */

/**
 * @typedef {object} SharingRepository
 * @property {() => object[]} listInstitutions
 * @property {(id: number) => object|null} findInstitution
 * @property {() => number} nextAuthorizationSequence
 * @property {(authorization: object) => number} insertAuthorization
 * @property {(id: number) => object|null} findAuthorization
 * @property {() => object[]} listAuthorizations
 * @property {(id: number, changes: object) => void} revokeAuthorization
 * @property {(now: string) => number} countActive
 * @property {(log: object, now: string) => void} insertAccessLog
 * @property {(filter: {authorizationId?: number}) => object[]} listAccessLogs
 */

/**
 * @typedef {object} ChangeLogRepository
 * @property {(entry: object, now: string) => void} append
 * @property {(entity: string, entityId: string|number) => object[]} listFor
 * @property {(filter: {entity?: string, limit: number}) => object[]} listRecent
 */

/**
 * @typedef {object} ReconciliationRepository
 * @property {(from: string, to: string) => object[]} paymentsBetween
 * @property {(businessDate: string) => object[]} listClosings
 * @property {(businessDate: string, closing: object, closedBy: string, now: string) => void} insertClosing
 * @property {(businessDate: string) => object[]} listNotes
 * @property {(note: object, now: string) => void} insertNote
 */

/**
 * @typedef {object} SettingsRepository
 * @property {() => object[]} list
 * @property {(key: string) => object|null} find
 * @property {(setting: object, now: string) => void} insertIfMissing
 */

/**
 * Avisos ao cliente (no protótipo, mensagens do sistema na conversa do simulador).
 * @typedef {object} CustomerNotifier
 * @property {(wash: object) => void} washStarted
 * @property {(wash: object) => void} washReady
 * @property {(wash: object, loyaltyMovements: object[]) => void} washCompleted
 * @property {(wash: object, payment: object) => void} paymentReceived
 * @property {(appointment: object) => void} appointmentBooked
 * @property {(appointment: object) => void} appointmentConfirmed
 * @property {(appointment: object, offer: object) => void} appointmentOffer
 * @property {(appointment: object, previousStartsAt: string) => void} appointmentRescheduled
 */

/**
 * @typedef {object} AppointmentRepository
 * @property {(id: number) => object|null} findById
 * @property {(from: string, to: string, filter?: object) => object[]} listBetween
 * @property {(appointment: object, now: string) => number} insert
 * @property {(id: number, expectedStatus: string, changes: object, now: string) => boolean} update
 * @property {(appointmentId: number, event: object, now: string) => void} appendEvent
 * @property {(offer: object, actor: string, now: string) => number} insertOffer
 * @property {(id: number) => object|null} findOffer
 * @property {(appointmentId: number) => object[]} listOffers
 * @property {(filter?: object) => object[]} listPendingOffers
 * @property {(id: number, changes: object) => void} updateOffer
 */

/** @type {CustomerNotifier} Usado quando não há canal de avisos. */
export const silentNotifier = Object.freeze({
  washStarted() {},
  washReady() {},
  washCompleted() {},
  paymentReceived() {},
  appointmentBooked() {},
  appointmentConfirmed() {},
  appointmentOffer() {},
  appointmentRescheduled() {},
});
