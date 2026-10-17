// Consentimentos do cliente (cap. 14.2): fidelização e marketing, separados e revogáveis.
import { ConsentType } from '../domain/conversation.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';

export class ConsentService {
  #consents;
  #customers;
  #clock;

  constructor({ consentRepository, customerRepository, clock }) {
    this.#consents = consentRepository;
    this.#customers = customerRepository;
    this.#clock = clock;
  }

  record(customerId, { type, granted, source }) {
    if (!Object.values(ConsentType).includes(type)) {
      throw new ValidationError(`Tipo de consentimento desconhecido: ${type}.`, { field: 'type' });
    }
    if (!this.#customers.findById(customerId)) throw new NotFoundError('Cliente não encontrado.');
    this.#consents.insert({ customerId, type, granted: granted === true, source }, this.#clock.nowIso());
  }

  current(customerId) {
    return this.#consents.currentFor(customerId);
  }
}
