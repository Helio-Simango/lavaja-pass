import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../src/domain/errors.js';
import { estimateQueue } from '../../src/domain/queue-estimates.js';
import {
  appointmentWindow,
  availableSlots,
  findStation,
  initialStatus,
  offerStateOf,
  parseSchedulingPolicy,
  planAppointmentTransition,
  planOffer,
  planOfferResponse,
} from '../../src/domain/scheduling.js';

const NOW = '2026-10-22T08:00:00.000Z'; // 10:00 em Maputo
const MIN = 60_000;
const at = (iso) => Date.parse(iso);
const policy = (overrides = {}) =>
  parseSchedulingPolicy({
    openingHours: { open: '07:00', close: '18:00' },
    slotMinutes: 30,
    safetyMarginMin: 10,
    workers: 3,
    confirmation: 'manual',
    lateToleranceMin: 15,
    reservedStationsForQueue: 0,
    offerResponseMinutes: 15,
    autoOffers: true,
    ...overrides,
  });
const stations = [1, 2, 3].map((id) => ({ id, active: true }));
const block = (stationId, start, end, appointmentId = stationId * 100) => ({ stationId, startMs: at(start), endMs: at(end), appointmentId });

describe('política de marcações (D-09 a D-14)', () => {
  it('valida os parâmetros', () => {
    assert.throws(() => policy({ openingHours: { open: '18:00', close: '07:00' } }), ValidationError);
    assert.throws(() => policy({ confirmation: 'talvez' }), ValidationError);
    assert.throws(() => policy({ workers: 0 }), ValidationError);
  });

  it('a confirmação manual deixa a marcação por confirmar (D-09)', () => {
    assert.equal(initialStatus(policy()), 'requested');
    assert.equal(initialStatus(policy({ confirmation: 'automatic' })), 'confirmed');
  });
});

describe('capacidade', () => {
  const interval = { startMs: at('2026-10-22T12:00:00Z'), endMs: at('2026-10-22T13:00:00Z') };

  it('escolhe um posto sem marcações sobrepostas', () => {
    const blocks = [block(1, '2026-10-22T12:30:00Z', '2026-10-22T13:30:00Z')];
    assert.equal(findStation({ ...interval, stations, blocks, policy: policy() }), 2);
  });

  it('limita pelas pessoas disponíveis', () => {
    const blocks = [block(1, '2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z'), block(2, '2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z')];
    assert.equal(findStation({ ...interval, stations, blocks, policy: policy({ workers: 2 }) }), null);
    assert.equal(findStation({ ...interval, stations, blocks, policy: policy({ workers: 3 }) }), 3);
  });

  it('respeita os postos reservados para a fila (D-12)', () => {
    const blocks = [block(1, '2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z')];
    assert.equal(findStation({ ...interval, stations, blocks, policy: policy({ reservedStationsForQueue: 1 }) }), 2);
    const two = [...blocks, block(2, '2026-10-22T12:00:00Z', '2026-10-22T13:00:00Z')];
    assert.equal(findStation({ ...interval, stations, blocks: two, policy: policy({ reservedStationsForQueue: 1 }) }), null);
  });

  it('não marca num posto ainda ocupado pelo pátio', () => {
    const busyUntil = new Map([[1, at('2026-10-22T12:20:00Z')]]);
    assert.equal(findStation({ ...interval, stations, blocks: [], policy: policy(), busyUntil }), 2);
  });

  it('lista horários do dia a partir de agora, com antecedência de um intervalo', () => {
    const slots = availableSlots({ date: '2026-10-22', durationMin: 50, policy: policy(), stations, blocks: [], busyUntil: new Map(), now: NOW });
    assert.equal(slots[0].startsAt, '2026-10-22T08:30:00.000Z');
    assert.equal(slots.at(-1).startsAt, '2026-10-22T15:00:00.000Z'); // 17:00 + 50 min cabe antes das 18:00
    assert.equal(slots[0].endsAt, '2026-10-22T09:30:00.000Z'); // 50 min + 10 de margem
  });

  it('recusa horários fora do funcionamento ou no passado', () => {
    assert.throws(() => appointmentWindow({ startsAt: '2026-10-22T15:30:00Z', durationMin: 50, policy: policy(), now: NOW }), { code: 'OUTSIDE_OPENING_HOURS' });
    assert.throws(() => appointmentWindow({ startsAt: '2026-10-22T07:00:00Z', durationMin: 50, policy: policy(), now: NOW }), { code: 'SLOT_IN_PAST' });
  });

  it('a fila sem marcação não ocupa os blocos reservados', () => {
    const estimates = estimateQueue({
      now: new Date(NOW),
      stations: [{ id: 1, active: true }],
      washes: [{ id: 9, status: 'queued', queuedAt: NOW, durationMin: 50 }],
      reservations: [block(1, '2026-10-22T08:30:00Z', '2026-10-22T09:30:00Z')],
    });
    assert.equal(estimates.get(9).estimatedStartAt, '2026-10-22T09:30:00.000Z');
  });

  it('quem chega com marcação passa à frente da fila', () => {
    const estimates = estimateQueue({
      now: new Date(NOW),
      stations: [{ id: 1, active: true }],
      washes: [
        { id: 1, status: 'queued', queuedAt: '2026-10-22T07:00:00Z', durationMin: 30 },
        { id: 2, status: 'queued', queuedAt: NOW, durationMin: 30, appointmentId: 5 },
      ],
    });
    assert.deepEqual([estimates.get(2).position, estimates.get(1).position], [1, 2]);
  });
});

describe('ciclo de vida da marcação (cap. 12.5)', () => {
  const appointment = (overrides = {}) => ({ id: 1, status: 'confirmed', startsAt: '2026-10-22T13:00:00.000Z', ...overrides });
  const go = (subject, to, extra = {}) => planAppointmentTransition(subject, { to, now: NOW, policy: policy(), ...extra });

  it('pedido -> confirmada -> chegou; repetir não tem efeitos', () => {
    assert.deepEqual(go(appointment({ status: 'requested' }), 'confirmed').changes, { status: 'confirmed' });
    assert.deepEqual(go(appointment(), 'confirmed'), { changed: false });
    assert.equal(go(appointment(), 'checked_in').changes.status, 'checked_in');
  });

  it('um pedido por confirmar não pode chegar directamente', () => {
    assert.throws(() => go(appointment({ status: 'requested' }), 'checked_in'), { code: 'INVALID_TRANSITION' });
  });

  it('a falta só depois da tolerância (D-10)', () => {
    assert.throws(() => go(appointment(), 'no_show', { now: '2026-10-22T13:10:00.000Z' }), { code: 'TOO_EARLY_FOR_NO_SHOW' });
    assert.equal(go(appointment(), 'no_show', { now: '2026-10-22T13:15:00.000Z' }).changes.status, 'no_show');
  });

  it('cancelar exige motivo e é final', () => {
    assert.throws(() => go(appointment(), 'cancelled'), ValidationError);
    assert.equal(go(appointment(), 'cancelled', { reason: 'Cliente pediu' }).changes.cancelReason, 'Cliente pediu');
    assert.throws(() => go(appointment({ status: 'cancelled' }), 'confirmed'), { code: 'INVALID_TRANSITION' });
  });
});

describe('antecipação só com aceitação (DEC-10)', () => {
  const appointment = { id: 1, status: 'confirmed', startsAt: '2026-10-22T13:00:00.000Z' };
  const offer = (overrides = {}) => ({
    ...planOffer(appointment, {
      proposedStartsAt: '2026-10-22T10:00:00.000Z',
      proposedEndsAt: '2026-10-22T11:00:00.000Z',
      stationId: 2,
      now: NOW,
      policy: policy(),
      hasPendingOffer: false,
    }),
    ...overrides,
  });

  it('a proposta é mais cedo, tem prazo e fica pendente', () => {
    const created = offer();
    assert.equal(created.status, 'pending');
    assert.equal(created.expiresAt, '2026-10-22T08:15:00.000Z');
    assert.equal(created.originalStartsAt, appointment.startsAt);
  });

  it('não se propõe horários mais tarde, a marcações por confirmar, nem duas de cada vez', () => {
    const base = { proposedEndsAt: 'x', stationId: 2, now: NOW, policy: policy(), hasPendingOffer: false };
    assert.throws(() => planOffer(appointment, { ...base, proposedStartsAt: '2026-10-22T14:00:00.000Z' }), { code: 'NOT_EARLIER' });
    assert.throws(() => planOffer({ ...appointment, status: 'requested' }, { ...base, proposedStartsAt: '2026-10-22T10:00:00.000Z' }), { code: 'NOT_CONFIRMED' });
    assert.throws(() => planOffer(appointment, { ...base, proposedStartsAt: '2026-10-22T10:00:00.000Z', hasPendingOffer: true }), { code: 'OFFER_PENDING' });
  });

  it('sem resposta dentro do prazo expira e mantém-se o horário original', () => {
    assert.equal(offerStateOf(offer(), '2026-10-22T08:16:00.000Z'), 'expired');
    assert.throws(() => planOfferResponse(offer(), { accept: true, now: '2026-10-22T08:16:00.000Z' }), { code: 'OFFER_EXPIRED' });
  });

  it('o cliente aceita ou recusa, uma vez', () => {
    assert.equal(planOfferResponse(offer(), { accept: true, now: NOW }).status, 'accepted');
    assert.equal(planOfferResponse(offer(), { accept: false, now: NOW }).status, 'declined');
    assert.throws(() => planOfferResponse(offer({ status: 'declined' }), { accept: true, now: NOW }), { code: 'OFFER_CLOSED' });
    assert.throws(() => planOfferResponse(offer(), { accept: 'sim', now: NOW }), ValidationError);
  });
});
