// Estimativas da fila (cap. 12.3). No protótipo usam só a duração do plano e os postos ocupados;
// a duração por classe (D-20), trabalhadores, pausas e marcações entram depois (I-8).
// O resultado é sempre uma estimativa, nunca uma garantia.

const MINUTE = 60_000;

// stations: [{ id, active }]; washes: serviços activos com status, stationId, startedAt, queuedAt, durationMin.
export function computeEstimates({ now, stations, washes }) {
  const nowMs = now.getTime();
  const freeAt = new Map(stations.filter((s) => s.active).map((s) => [s.id, nowMs]));
  const result = new Map();

  for (const w of washes) {
    if (w.status === 'in_progress') {
      const endMs = new Date(w.startedAt).getTime() + w.durationMin * MINUTE;
      result.set(w.id, {
        estimatedEndAt: new Date(endMs).toISOString(),
        overdueMin: endMs < nowMs ? Math.floor((nowMs - endMs) / MINUTE) : 0,
      });
      if (freeAt.has(w.stationId)) freeAt.set(w.stationId, Math.max(nowMs, endMs));
    }
    // Um serviço pronto ocupa o posto até à entrega; considera-se que liberta o posto agora.
  }

  const queue = washes
    .filter((w) => w.status === 'queued')
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.id - b.id);

  queue.forEach((w, index) => {
    const estimate = { position: index + 1, estimatedStartAt: null, estimatedEndAt: null };
    if (freeAt.size > 0) {
      let [stationId, startMs] = [...freeAt.entries()].reduce((best, cur) => (cur[1] < best[1] ? cur : best));
      const endMs = startMs + w.durationMin * MINUTE;
      freeAt.set(stationId, endMs);
      estimate.estimatedStartAt = new Date(startMs).toISOString();
      estimate.estimatedEndAt = new Date(endMs).toISOString();
      estimate.waitMin = Math.round((startMs - nowMs) / MINUTE);
    }
    result.set(w.id, estimate);
  });

  return result;
}
