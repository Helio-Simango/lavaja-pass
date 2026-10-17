import { WashStatus } from '../domain/wash.js';

export const StationState = Object.freeze({
  FREE: 'free',
  BUSY: 'busy',
  READY: 'ready',
  INACTIVE: 'inactive',
});

export class StationService {
  #stations;

  constructor({ stationRepository }) {
    this.#stations = stationRepository;
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
