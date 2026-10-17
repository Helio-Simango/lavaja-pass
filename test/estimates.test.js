import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEstimates } from '../src/services/estimates.js';

const now = new Date('2026-10-22T10:00:00.000Z');
const at = (min) => new Date(now.getTime() + min * 60_000).toISOString();
const queued = (id, queuedMin, durationMin = 30) => ({ id, status: 'queued', queuedAt: at(queuedMin), durationMin });

describe('estimativas da fila', () => {
  it('distribui a fila pelos postos livres por ordem de chegada', () => {
    const est = computeEstimates({
      now,
      stations: [{ id: 1, active: true }, { id: 2, active: true }],
      washes: [queued(12, -1), queued(10, -10), queued(11, -5)],
    });
    assert.deepEqual(
      [10, 11, 12].map((id) => [est.get(id).position, est.get(id).estimatedStartAt]),
      [[1, at(0)], [2, at(0)], [3, at(30)]],
    );
    assert.equal(est.get(12).waitMin, 30);
  });

  it('conta com o fim previsto dos serviços em execução', () => {
    const est = computeEstimates({
      now,
      stations: [{ id: 1, active: true }],
      washes: [
        { id: 1, status: 'in_progress', stationId: 1, startedAt: at(-10), durationMin: 30 },
        queued(2, -5, 50),
      ],
    });
    assert.deepEqual(est.get(1), { estimatedEndAt: at(20), overdueMin: 0 });
    assert.equal(est.get(2).estimatedStartAt, at(20));
    assert.equal(est.get(2).estimatedEndAt, at(70));
  });

  it('um serviço atrasado não empurra a estimativa para o passado', () => {
    const est = computeEstimates({
      now,
      stations: [{ id: 1, active: true }],
      washes: [
        { id: 1, status: 'in_progress', stationId: 1, startedAt: at(-45), durationMin: 30 },
        queued(2, -5),
      ],
    });
    assert.equal(est.get(1).overdueMin, 15);
    assert.equal(est.get(2).estimatedStartAt, at(0));
  });

  it('ignora postos inactivos e não estima sem postos', () => {
    const est = computeEstimates({ now, stations: [{ id: 1, active: false }], washes: [queued(1, 0)] });
    assert.deepEqual(est.get(1), { position: 1, estimatedStartAt: null, estimatedEndAt: null });
  });
});
