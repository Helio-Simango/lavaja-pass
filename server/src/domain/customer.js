import { ValidationError } from './errors.js';

const NAME_MIN = 2;
const NAME_MAX = 80;
const VEHICLE_DESCRIPTION_MAX = 120;

/**
 * Cliente sem telefone registado no pátio (M8, proposta v1): as viaturas ficam num cliente de balcão
 * com um número reservado (fictício). Não recebe avisos nem acumula fidelização (sem consentimento).
 */
export const WALK_IN_CUSTOMER = Object.freeze({ phone: '258870000000', name: 'Cliente sem telefone (balcão)' });

export function isWalkIn(phone) {
  return phone === WALK_IN_CUSTOMER.phone;
}

/** Nome por omissão de um cliente registado no pátio só com o telefone. */
export function defaultCustomerName(phoneDisplay) {
  return `Cliente ${phoneDisplay}`;
}

export function parseCustomerName(input) {
  const name = typeof input === 'string' ? collapseSpaces(input) : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new ValidationError(`O nome deve ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`, { field: 'name' });
  }
  return name;
}

export function parseVehicleDescription(input) {
  if (input === undefined || input === null || input === '') return null;
  const description = typeof input === 'string' ? collapseSpaces(input) : null;
  if (description === null || description.length > VEHICLE_DESCRIPTION_MAX) {
    throw new ValidationError(`A descrição deve ser texto até ${VEHICLE_DESCRIPTION_MAX} caracteres.`, {
      field: 'description',
    });
  }
  return description || null;
}

function collapseSpaces(text) {
  return text.trim().replace(/\s+/g, ' ');
}
