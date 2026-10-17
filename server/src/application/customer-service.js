import { parseCustomerName, parseVehicleDescription } from '../domain/customer.js';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { parsePhone } from '../domain/phone.js';
import { parseJurisdiction, parsePlate } from '../domain/plate.js';

const DEFAULT_LIST_LIMIT = 100;

export class CustomerService {
  #customers;
  #vehicles;
  #catalogService;
  #changeLog;
  #unitOfWork;
  #clock;

  constructor({ customerRepository, vehicleRepository, catalogService, changeLogRepository, unitOfWork, clock }) {
    this.#customers = customerRepository;
    this.#vehicles = vehicleRepository;
    this.#catalogService = catalogService;
    this.#changeLog = changeLogRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  get(id) {
    const customer = this.#customers.findById(id);
    if (!customer) throw new NotFoundError('Cliente não encontrado.');
    return this.#withVehicles(customer);
  }

  findByPhone(rawPhone) {
    const customer = this.#customers.findByPhone(parsePhone(rawPhone));
    if (!customer) throw new NotFoundError('Não existe nenhum cliente com este telefone.');
    return this.#withVehicles(customer);
  }

  list({ limit = DEFAULT_LIST_LIMIT } = {}) {
    return this.#customers.list({ limit }).map((customer) => this.#withVehicles(customer));
  }

  /** Regista um cliente e, opcionalmente, as suas viaturas, tudo ou nada. */
  register({ phone: rawPhone, name: rawName, vehicles = [] }) {
    return this.#unitOfWork.run(() => {
      const phone = parsePhone(rawPhone);
      const name = parseCustomerName(rawName);
      if (!Array.isArray(vehicles)) throw new ValidationError('"vehicles" deve ser uma lista.', { field: 'vehicles' });
      if (this.#customers.findByPhone(phone)) {
        throw new ConflictError('PHONE_TAKEN', 'Já existe um cliente com este telefone.', { phone });
      }
      const customerId = this.#customers.insert({ phone, name }, this.#clock.nowIso());
      for (const vehicle of vehicles) this.addVehicle(customerId, vehicle ?? {});
      return this.get(customerId);
    });
  }

  /**
   * A mesma matrícula no mesmo cliente não é duplicada; noutro cliente é recusada
   * (a transferência de viaturas fica fora do protótipo).
   * @returns {{ vehicle: object, created: boolean }}
   */
  addVehicle(customerId, { plate: rawPlate, jurisdiction: rawJurisdiction, classId, description }) {
    return this.#unitOfWork.run(() => {
      this.get(customerId);
      const plate = parsePlate(rawPlate);
      const jurisdiction = parseJurisdiction(rawJurisdiction);
      const vehicleClass = this.#catalogService.getClass(classId);

      const existing = this.#vehicles.findByPlate(jurisdiction, plate);
      if (existing && existing.customerId !== customerId) {
        throw new ConflictError('PLATE_TAKEN', 'Esta matrícula já está registada noutro cliente.', { plate });
      }
      if (existing) return { vehicle: existing, created: false };

      const vehicleId = this.#vehicles.insert(
        {
          customerId,
          jurisdiction,
          plate,
          classId: vehicleClass.id,
          description: parseVehicleDescription(description),
        },
        this.#clock.nowIso(),
      );
      return { vehicle: this.getVehicle(vehicleId), created: true };
    });
  }

  getVehicle(id) {
    const vehicle = this.#vehicles.findById(id);
    if (!vehicle) throw new NotFoundError('Viatura não encontrada.');
    return vehicle;
  }

  listVehicles({ classRef } = {}) {
    const classId = classRef === undefined ? undefined : this.#catalogService.getClass(classRef).id;
    return this.#vehicles.list({ classId });
  }

  /** Reclassificação permitida; os serviços já registados guardam a classe usada no momento. */
  reclassifyVehicle(id, classRef, actor) {
    return this.#unitOfWork.run(() => {
      const vehicle = this.getVehicle(id);
      const newClass = this.#catalogService.getClass(classRef);
      if (newClass.id !== vehicle.classId) {
        const now = this.#clock.nowIso();
        this.#vehicles.updateClass(id, newClass.id, now);
        this.#changeLog.append(
          { entity: 'vehicle', entityId: id, field: 'class', oldValue: vehicle.classCode, newValue: newClass.code, actor },
          now,
        );
      }
      return this.getVehicle(id);
    });
  }

  #withVehicles(customer) {
    return { ...customer, vehicles: this.#vehicles.listByCustomer(customer.id) };
  }
}
