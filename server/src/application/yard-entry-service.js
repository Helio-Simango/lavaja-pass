// Entrada manual no pátio (M8, proposta v1): matrícula + serviço, com o telefone opcional.
// - Matrícula conhecida: usa a viatura e o cliente que já existem.
// - Matrícula nova com telefone: usa ou regista o cliente (consentimentos só se o cliente os der).
// - Sem telefone: a viatura fica no cliente de balcão (sem avisos nem fidelização).
// O preço é sempre calculado pelo servidor; a estimativa é mostrada antes de confirmar.
import { defaultCustomerName, WALK_IN_CUSTOMER } from '../domain/customer.js';
import { ValidationError } from '../domain/errors.js';
import { formatPhone, parsePhone } from '../domain/phone.js';
import { parsePlate } from '../domain/plate.js';

const DEFAULT_JURISDICTION = 'MZ';

export class YardEntryService {
  #customers;
  #vehicles;
  #customerService;
  #catalogService;
  #washService;
  #unitOfWork;

  constructor({ customerRepository, vehicleRepository, customerService, catalogService, washService, unitOfWork }) {
    this.#customers = customerRepository;
    this.#vehicles = vehicleRepository;
    this.#customerService = customerService;
    this.#catalogService = catalogService;
    this.#washService = washService;
    this.#unitOfWork = unitOfWork;
  }

  /** O que o operador vê ao escrever a matrícula e escolher o serviço: viatura conhecida, preço e estimativa. */
  preview({ plate: rawPlate, planId, classRef }) {
    const vehicle = rawPlate ? this.#findVehicle(rawPlate) : null;
    const vehicleClass = this.#catalogService.getClass(vehicle ? vehicle.classId : classRef ?? 'A');
    const quote = planId ? this.#catalogService.quote(planId, vehicleClass.id) : null;
    const estimate = quote ? this.#washService.previewQueue(quote.plan.baseDurationMin) : null;
    return {
      vehicle: vehicle && { id: vehicle.id, plate: vehicle.plate, classCode: vehicle.classCode, customerName: this.#customers.findById(vehicle.customerId)?.name },
      classCode: vehicleClass.code,
      quote,
      estimate,
    };
  }

  register({ plate: rawPlate, classId, planId, phone, name, consents, actor }) {
    return this.#unitOfWork.run(() => {
      const plate = parsePlate(rawPlate);
      const vehicleId = this.#findVehicle(plate)?.id ?? this.#newVehicle({ plate, classId, phone, name, consents });
      return this.#washService.register({ vehicleId, planId, source: 'patio', actor });
    });
  }

  #findVehicle(rawPlate) {
    return this.#vehicles.findByPlate(DEFAULT_JURISDICTION, parsePlate(rawPlate));
  }

  #newVehicle({ plate, classId, phone, name, consents }) {
    if (!classId) throw new ValidationError('Matrícula nova: indique a classe da viatura.', { field: 'classId' });
    const customer = phone ? this.#customerByPhone(phone, name, consents) : this.#walkInCustomer();
    return this.#customerService.addVehicle(customer.id, { plate, classId }).vehicle.id;
  }

  #customerByPhone(rawPhone, name, consents) {
    const phone = parsePhone(rawPhone);
    const existing = this.#customers.findByPhone(phone);
    if (existing) return existing;
    return this.#customerService.register({
      phone,
      name: typeof name === 'string' && name.trim() ? name : defaultCustomerName(formatPhone(phone)),
      consents: { loyalty: consents?.loyalty === true, marketing: consents?.marketing === true, source: 'pátio' },
    });
  }

  #walkInCustomer() {
    return (
      this.#customers.findByPhone(WALK_IN_CUSTOMER.phone) ??
      this.#customerService.register({ ...WALK_IN_CUSTOMER, consents: { loyalty: false, marketing: false, source: 'pátio' } })
    );
  }
}
