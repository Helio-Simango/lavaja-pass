// Viaturas por classe (M12) e histórico por matrícula (M13), com os valores guardados em cada serviço.
import { NotFoundError } from '../domain/errors.js';
import { loyaltyEffectOf } from '../domain/loyalty-effect.js';
import { isEffective } from '../domain/payment.js';

const HISTORY_LIMIT = 500;

export class VehicleHistoryService {
  #vehicles;
  #washes;
  #payments;
  #loyalty;
  #catalogService;

  constructor({ vehicleRepository, washRepository, paymentRepository, loyaltyRepository, catalogService }) {
    this.#vehicles = vehicleRepository;
    this.#washes = washRepository;
    this.#payments = paymentRepository;
    this.#loyalty = loyaltyRepository;
    this.#catalogService = catalogService;
  }

  /** "Concluídas" conta apenas o estado concluído. */
  listByClass({ classRef } = {}) {
    const classId = classRef === undefined ? undefined : this.#catalogService.getClass(classRef).id;
    return this.#vehicles.listWithStats({ classId });
  }

  history(vehicleId) {
    const vehicle = this.#getVehicle(vehicleId);
    const washes = this.#washes.list({ vehicleId, limit: HISTORY_LIMIT });
    const ids = washes.map((wash) => wash.id);
    const paymentsByWash = this.#payments.listByWashes(ids);
    const movements = this.#loyalty.listByWashIds(ids);
    return {
      vehicle,
      washes: washes.map((wash) => {
        const payments = paymentsByWash.get(wash.id);
        return {
          ...wash,
          effectivePayment: payments.find(isEffective) ?? null,
          refunded: payments.some((p) => p.status === 'refunded'),
          loyaltyEffect: loyaltyEffectOf(wash, movements.filter((m) => m.washId === wash.id)),
        };
      }),
    };
  }

  summary(vehicleId) {
    const { vehicle, washes } = this.history(vehicleId);
    const completed = washes.filter((wash) => wash.status === 'completed');
    return {
      vehicle,
      completed: completed.length,
      cancelled: washes.filter((wash) => wash.status === 'cancelled').length,
      lastCompletedAt: completed.at(-1)?.completedAt ?? null,
      loyaltyCounted: washes.filter((wash) => wash.loyaltyEffect === 'counted').length,
    };
  }

  #getVehicle(id) {
    const vehicle = this.#vehicles.findById(id);
    if (!vehicle) throw new NotFoundError('Viatura não encontrada.');
    return vehicle;
  }
}
