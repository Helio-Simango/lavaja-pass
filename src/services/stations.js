import { formatPlate } from '../lib/plate.js';

// Ocupado = serviço em execução ou pronto nesse posto.
export function createStationsService({ db }) {
  return {
    list() {
      return db
        .prepare(`SELECT s.*, w.id AS wash_id, w.status AS wash_status, w.plate
          FROM stations s
          LEFT JOIN washes w ON w.station_id = s.id AND w.status IN ('in_progress', 'ready')
          ORDER BY s.sort_order, s.id`)
        .all()
        .map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          active: r.active === 1,
          state: r.active !== 1 ? 'inactive' : r.wash_status === 'in_progress' ? 'busy' : r.wash_status ?? 'free',
          wash: r.wash_id ? { id: r.wash_id, status: r.wash_status, plateDisplay: formatPlate(r.plate) } : null,
        }));
    },
  };
}
