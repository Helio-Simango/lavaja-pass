import { NotFoundError } from '../domain/errors.js';
import { WashStatus } from '../domain/wash.js';

export const StationState = Object.freeze({
  FREE: 'free',
  BUSY: 'busy',
  READY: 'ready',
  INACTIVE: 'inactive',
});

export class StationService {
  #stations;
  #changeLog;
  #unitOfWork;
  #clock;

  constructor({ stationRepository, changeLogRepository, unitOfWork, clock }) {
    this.#stations = stationRepository;
    this.#changeLog = changeLogRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  /**
   * Activa ou desactiva um posto (ex.: avaria). Um posto inactivo sai da capacidade das marcações
   * e das estimativas; a alteração fica registada. Os serviços já em curso não mudam.
   */
  setActive(id, active, actor) {
    return this.#unitOfWork.run(() => {
      const station = this.#stations.findById(id);
      if (!station) throw new NotFoundError('Posto não encontrado.');
      if (station.active !== active) {
        const now = this.#clock.nowIso();
        this.#stations.setActive(id, active);
        this.#changeLog.append({ entity: 'station', entityId: station.code, field: 'active', oldValue: station.active, newValue: active, actor }, now);
      }
      return this.list().find((candidate) => candidate.id === id);
    });
  }

  /** Postos com o estado actual: livre, ocupado (em execução), pronto ou inactivo. */
  list() {
    return this.#stations.listWithOccupancy().map((station) => ({ ...station, state: stateOf(station) }));
  }
}

function stateOf(station) {
  if (!station.active) return StationState.INACTIVE;
  if (!station.occupiedBy) return StationState.FREE;
  return station.occupiedBy.status === WashStatus.IN_PROGRESS ? StationState.BUSY : StationState.READY;
}
