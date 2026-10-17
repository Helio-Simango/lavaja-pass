// Registo de alterações de preços e parâmetros (cap. 13.3): consulta, mais recentes primeiro.
const DEFAULT_LIMIT = 100;

export class ChangeLogService {
  #changeLog;

  constructor({ changeLogRepository }) {
    this.#changeLog = changeLogRepository;
  }

  recent({ entity, limit = DEFAULT_LIMIT } = {}) {
    return this.#changeLog.listRecent({ entity, limit });
  }
}
