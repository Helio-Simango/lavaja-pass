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
 * @typedef {object} ChangeLogRepository
 * @property {(entry: object, now: string) => void} append
 * @property {(entity: string, entityId: string|number) => object[]} listFor
 */

/**
 * @typedef {object} SettingsRepository
 * @property {() => object[]} list
 * @property {(key: string) => object|null} find
 * @property {(setting: object, now: string) => void} insertIfMissing
 */

export {};
