import { ConflictError, NotFoundError } from '../domain/errors.js';
import { estimateQueue } from '../domain/queue-estimates.js';
import { isActive, newQueuedWash, parseWashSource, planTransition, WashStatus } from '../domain/wash.js';

const DEFAULT_LIST_LIMIT = 200;

export class WashService {
  #washes;
  #vehicles;
  #stations;
  #catalogService;
  #unitOfWork;
  #clock;

  constructor({ washRepository, vehicleRepository, stationRepository, catalogService, unitOfWork, clock }) {
    this.#washes = washRepository;
    this.#vehicles = vehicleRepository;
    this.#stations = stationRepository;
    this.#catalogService = catalogService;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  /** Coloca uma viatura na fila. O preço é sempre calculado aqui, a partir da classe actual da viatura. */
  register({ vehicleId, planId, source, actor }) {
    const washId = this.#unitOfWork.run(() => {
      const washSource = parseWashSource(source);
      const vehicle = this.#vehicles.findById(vehicleId);
      if (!vehicle) throw new NotFoundError('Viatura não encontrada.');
      this.#assertVehicleNotInYard(vehicleId);

      const { plan, price } = this.#catalogService.quote(planId, vehicle.classId);
      const now = this.#clock.nowIso();
      const wash = newQueuedWash({ vehicle, plan, price, source: washSource, actor, now });
      const id = this.#washes.insert(wash, now);
      this.#washes.appendEvent(id, { from: null, to: WashStatus.QUEUED, actor }, now);
      return id;
    });
    return this.get(washId);
  }

  /** @returns {{ wash: object, changed: boolean }} */
  transition(id, command) {
    const changed = this.#unitOfWork.run(() => {
      const wash = this.#getWash(id);
      const decision = planTransition(wash, command, this.#transitionContext(command));
      if (!decision.changed) return false;

      const now = this.#clock.nowIso();
      const applied = this.#washes.applyTransition(id, wash.status, decision.changes, now);
      if (!applied) throw new ConflictError('CONCURRENT_UPDATE', 'O serviço foi alterado entretanto. Tente de novo.');
      this.#washes.appendEvent(id, decision.event, now);
      return true;
    });
    return { wash: this.get(id), changed };
  }

  get(id) {
    const wash = this.#getWash(id);
    return { ...wash, estimate: isActive(wash) ? this.#currentEstimates().get(id) ?? null : null };
  }

  list({ statuses, date, limit = DEFAULT_LIST_LIMIT } = {}) {
    const estimates = this.#currentEstimates();
    return this.#washes
      .list({ statuses, date, limit })
      .map((wash) => ({ ...wash, estimate: estimates.get(wash.id) ?? null }));
  }

  history(id) {
    this.#getWash(id);
    return this.#washes.listEvents(id);
  }

  #getWash(id) {
    const wash = this.#washes.findById(id);
    if (!wash) throw new NotFoundError('Serviço não encontrado.');
    return wash;
  }

  #assertVehicleNotInYard(vehicleId) {
    const active = this.#washes.findActiveByVehicle(vehicleId);
    if (active) {
      throw new ConflictError('VEHICLE_ALREADY_ACTIVE', 'Esta viatura já tem um serviço activo no pátio.', {
        washId: active.id,
        status: active.status,
      });
    }
  }

  #transitionContext({ to, stationId }) {
    const context = { now: this.#clock.nowIso() };
    if (to === WashStatus.IN_PROGRESS && stationId !== undefined && stationId !== null) {
      context.station = this.#stations.findById(stationId);
      context.stationOccupiedBy = this.#washes.findOccupyingStation(stationId)?.id ?? null;
    }
    return context;
  }

  #currentEstimates() {
    return estimateQueue({
      now: this.#clock.now(),
      stations: this.#stations.list(),
      washes: this.#washes.listActive(),
    });
  }
}
