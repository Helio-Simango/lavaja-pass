import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

// Relógio fixo: 2026-10-22 08:00 UTC (10:00 em Maputo). Amanhã (23/10) a agenda começa vazia.
const TOMORROW = '2026-10-23';
const local = (time, date = TOMORROW) => new Date(`${date}T${time}:00+02:00`).toISOString();

describe('API de marcações e capacidade (I-8)', () => {
  let t;
  let ids;
  const book = (plate, time, planCode = 'COMPLETA', date) =>
    t.api('POST', '/api/appointments', { vehicleId: ids.vehicle(plate), planId: ids.plan(planCode), startsAt: local(time, date) });
  const go = (id, to, extra = {}) => t.api('POST', `/api/appointments/${id}/transitions`, { to, ...extra });
  const systemMessages = async (phone) =>
    (await t.api('GET', `/api/simulator/threads/${phone}/messages`)).body.messages.filter((m) => m.kind === 'system').map((m) => m.body);

  before(async () => {
    t = await startTestServer();
    ids = demoIds(t.db);
  });
  after(() => t.close());

  it('lista horários disponíveis para o plano e a classe', async () => {
    const res = await t.api('GET', `/api/availability?date=${TOMORROW}&planId=${ids.plan('COMPLETA')}&classId=B`);
    assert.equal(res.status, 200);
    assert.equal(res.body.slots[0].startsAt, local('07:00'));
    assert.equal(res.body.slots.at(-1).startsAt, local('17:00'));
  });

  it('com confirmação manual (D-09) a marcação fica por confirmar, e o cliente é avisado', async () => {
    const res = await book('ACX731MC', '14:00');
    assert.equal(res.status, 201);
    assert.equal(res.body.appointment.status, 'requested');
    assert.equal(res.body.appointment.endsAt, local('15:00')); // 50 min + 10 de margem
    assert.match((await systemMessages('258845550101')).at(-1), /📅 Marcação registada: 23\/10 às 14:00 · ACX 731 MC · Completa\. Aguarda confirmação/);

    const confirmed = await go(res.body.appointment.id, 'confirmed', {});
    assert.equal(confirmed.body.appointment.statusLabel, 'Confirmada');
    assert.match((await systemMessages('258845550101')).at(-1), /Marcação confirmada/);
  });

  it('a capacidade limita pelas pessoas disponíveis', async () => {
    assert.equal((await book('AHM482MP', '14:00')).status, 201);
    assert.equal((await book('ABC123MC', '14:00')).status, 201);
    const full = await book('ANT145MC', '14:00');
    assert.equal(full.status, 409);
    assert.equal(full.body.error.code, 'NO_CAPACITY');
    const slots = (await t.api('GET', `/api/availability?date=${TOMORROW}&planId=${ids.plan('COMPLETA')}&classId=C`)).body.slots;
    assert.ok(!slots.some((slot) => slot.startsAt === local('14:00')));
  });

  it('recusa horários fora do funcionamento', async () => {
    const res = await book('ANT145MC', '17:30');
    assert.equal(res.body.error.code, 'OUTSIDE_OPENING_HOURS');
  });

  it('uma proposta mais cedo não muda a marcação sem aceitação (DEC-10)', async () => {
    const [appointment] = (await t.api('GET', `/api/appointments?date=${TOMORROW}`)).body.appointments;
    const res = await t.api('POST', `/api/appointments/${appointment.id}/offers`, { proposedStartsAt: local('09:00') });
    assert.equal(res.status, 201);
    assert.equal(res.body.offer.status, 'pending');
    const unchanged = (await t.api('GET', `/api/appointments/${appointment.id}`)).body.appointment;
    assert.equal(unchanged.startsAt, local('14:00'));
    assert.match((await systemMessages('258845550101')).at(-1), /⏰ Temos um horário mais cedo[\s\S]*ACEITAR[\s\S]*MANTER/);
    assert.equal((await t.api('POST', `/api/appointments/${appointment.id}/offers`, { proposedStartsAt: local('10:00') })).body.error.code, 'OFFER_PENDING');
  });

  it('sem resposta no prazo a proposta expira e o horário mantém-se', async () => {
    const [appointment] = (await t.api('GET', `/api/appointments?date=${TOMORROW}`)).body.appointments;
    const offer = appointment.offers[0];
    t.clock.advanceMinutes(16);
    const res = await t.api('POST', `/api/appointment-offers/${offer.id}/respond`, { accept: true });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'OFFER_EXPIRED');
    const after = (await t.api('GET', `/api/appointments/${appointment.id}`)).body.appointment;
    assert.equal(after.startsAt, local('14:00'));
    assert.equal(after.offers[0].status, 'expired');
  });

  it('aceitar dentro do prazo remarca, com auditoria e aviso', async () => {
    const [appointment] = (await t.api('GET', `/api/appointments?date=${TOMORROW}`)).body.appointments;
    const { offer } = (await t.api('POST', `/api/appointments/${appointment.id}/offers`, { proposedStartsAt: local('09:00') })).body;
    const res = await t.api('POST', `/api/appointment-offers/${offer.id}/respond`, { accept: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.appointment.startsAt, local('09:00'));
    const { events } = (await t.api('GET', `/api/appointments/${appointment.id}`)).body;
    assert.deepEqual(events.at(-1).kind, 'rescheduled');
    assert.equal(events.at(-1).fromStartsAt, local('14:00'));
    assert.match((await systemMessages('258845550101')).at(-1), /Marcação alterada a seu pedido: 14:00 → 23\/10 às 09:00/);
  });

  it('cancelar liberta o horário e propõe-no à marcação confirmada seguinte (D-14)', async () => {
    const list = (await t.api('GET', `/api/appointments?date=${TOMORROW}`)).body.appointments;
    const early = list.find((a) => a.vehicle.plate === 'ACX731MC');
    const later = list.find((a) => a.vehicle.plate === 'AHM482MP');
    await go(later.id, 'confirmed');
    const res = await go(early.id, 'cancelled', { reason: 'Cliente pediu' });
    assert.equal(res.body.appointment.status, 'cancelled');
    const offered = (await t.api('GET', `/api/appointments/${later.id}`)).body.appointment;
    assert.equal(offered.startsAt, local('14:00'));
    assert.equal(offered.offers.at(-1).status, 'pending');
    assert.equal(offered.offers.at(-1).proposedStartsAt, local('09:00'));
  });

  it('a chegada cria o serviço, que passa à frente da fila', async () => {
    const res = await book('ANT145MC', '11:00', 'SIMPLES', '2026-10-22');
    const id = res.body.appointment.id;
    await go(id, 'confirmed');
    assert.equal((await go(id, 'no_show')).body.error.code, 'TOO_EARLY_FOR_NO_SHOW');
    const arrived = await go(id, 'checked_in', {});
    assert.equal(arrived.body.appointment.status, 'checked_in');
    const wash = (await t.api('GET', `/api/washes/${arrived.body.appointment.washId}`)).body.wash;
    assert.equal(wash.status, 'queued');
    assert.equal(wash.estimate.position, 1);
  });

  it('a capacidade do dia mostra marcações e pátio por posto (M10)', async () => {
    const res = await t.api('GET', `/api/capacity?date=${TOMORROW}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.policy.confirmation, 'manual');
    assert.ok(res.body.stations.some((s) => s.appointments.length > 0));
    const today = await t.api('GET', '/api/capacity');
    assert.ok(today.body.stations.some((s) => s.yard.length > 0));
  });

  it('valida os pedidos', async () => {
    assert.equal((await t.api('GET', '/api/availability?date=23-10-2026&planId=1&classId=A')).status, 400);
    assert.equal((await t.api('POST', '/api/appointments', { vehicleId: 9999, planId: 1, startsAt: local('10:00') })).status, 404);
    assert.equal((await t.api('GET', '/api/appointments/9999')).status, 404);
  });
});
