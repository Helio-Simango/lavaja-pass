import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateQueue } from '../../src/domain/queue-estimates.js';

const now = new Date('2026-10-22T10:00:00.000Z');
const at = (minutes) => new Date(now.getTime() + minutes * 60_000).toISOString();
const queued = (id, queuedMin, durationMin = 30) => ({ id, status: 'queued', queuedAt: at(queuedMin), durationMin });
const running = (id, stationId, startedMin, durationMin) => ({
  id,
  status: 'in_progress',
  stationId,
  startedAt: at(startedMin),
  durationMin,
});

describe('estimativas da fila', () => {
  it('distribui a fila pelos postos livres por ordem de chegada', () => {
    const estimates = estimateQueue({
      now,
      stations: [{ id: 1, active: true }, { id: 2, active: true }],
      washes: [queued(12, -1), queued(10, -10), queued(11, -5)],
    });
    assert.deepEqual(
      [10, 11, 12].map((id) => [estimates.get(id).position, estimates.get(id).estimatedStartAt]),
      [[1, at(0)], [2, at(0)], [3, at(30)]],
    );
    assert.equal(estimates.get(12).waitMin, 30);
  });

  it('conta com o fim previsto dos serviços em execução', () => {
    const estimates = estimateQueue({
      now,
      stations: [{ id: 1, active: true }],
      washes: [running(1, 1, -10, 30), queued(2, -5, 50)],
    });
    assert.deepEqual(estimates.get(1), { estimatedEndAt: at(20), overdueMin: 0 });
    assert.equal(estimates.get(2).estimatedStartAt, at(20));
    assert.equal(estimates.get(2).estimatedEndAt, at(70));
  });

  it('um serviço atrasado não empurra a estimativa para o passado', () => {
    const estimates = estimateQueue({
      now,
      stations: [{ id: 1, active: true }],
      washes: [running(1, 1, -45, 30), queued(2, -5)],
    });
    assert.equal(estimates.get(1).overdueMin, 15);
    assert.equal(estimates.get(2).estimatedStartAt, at(0));
  });

  it('ignora postos inactivos e não estima sem postos', () => {
    const estimates = estimateQueue({ now, stations: [{ id: 1, active: false }], washes: [queued(1, 0)] });
    assert.deepEqual(estimates.get(1), { position: 1, estimatedStartAt: null, estimatedEndAt: null });
  });
});
