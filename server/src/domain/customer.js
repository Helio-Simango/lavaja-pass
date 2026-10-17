import { ValidationError } from './errors.js';

const NAME_MIN = 2;
const NAME_MAX = 80;
const VEHICLE_DESCRIPTION_MAX = 120;

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
