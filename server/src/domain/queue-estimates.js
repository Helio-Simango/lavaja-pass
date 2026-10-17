// Estimativas da fila (cap. 12.3). No protótipo usam só a duração do plano e os postos ocupados;
// a duração por classe (D-20), trabalhadores, pausas e marcações entram no marco I-8.
// O resultado é sempre uma estimativa, nunca uma garantia.
import { WashStatus } from './wash.js';

const MINUTE_MS = 60_000;

/**
 * @param now Date
 * @param stations [{ id, active }]
 * @param washes serviços activos: [{ id, status, stationId, startedAt, queuedAt, durationMin }]
 * @returns Map<washId, estimate>
 */
export function estimateQueue({ now, stations, washes }) {
  const nowMs = now.getTime();
  const stationFreeAt = new Map(stations.filter((s) => s.active).map((s) => [s.id, nowMs]));
  const estimates = new Map();

  for (const wash of washes.filter((w) => w.status === WashStatus.IN_PROGRESS)) {
    const endMs = Date.parse(wash.startedAt) + wash.durationMin * MINUTE_MS;
    estimates.set(wash.id, {
      estimatedEndAt: new Date(endMs).toISOString(),
      overdueMin: Math.max(0, Math.floor((nowMs - endMs) / MINUTE_MS)),
    });
    if (stationFreeAt.has(wash.stationId)) stationFreeAt.set(wash.stationId, Math.max(nowMs, endMs));
  }
  // Um serviço pronto ocupa o posto até à entrega; considera-se que liberta o posto já.

  queueInArrivalOrder(washes).forEach((wash, index) => {
    estimates.set(wash.id, estimateQueuedWash(wash, index + 1, stationFreeAt, nowMs));
  });
  return estimates;
}

function queueInArrivalOrder(washes) {
  return washes
    .filter((w) => w.status === WashStatus.QUEUED)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.id - b.id);
}

function estimateQueuedWash(wash, position, stationFreeAt, nowMs) {
  if (stationFreeAt.size === 0) return { position, estimatedStartAt: null, estimatedEndAt: null };
  const [stationId, startMs] = earliestFreeStation(stationFreeAt);
  const endMs = startMs + wash.durationMin * MINUTE_MS;
  stationFreeAt.set(stationId, endMs);
  return {
    position,
    estimatedStartAt: new Date(startMs).toISOString(),
    estimatedEndAt: new Date(endMs).toISOString(),
    waitMin: Math.round((startMs - nowMs) / MINUTE_MS),
  };
}

function earliestFreeStation(stationFreeAt) {
  return [...stationFreeAt.entries()].reduce((best, current) => (current[1] < best[1] ? current : best));
}
