// Carrega a demonstração. Os dados de referência (classes, planos, postos) entram directamente;
// clientes e serviços passam pelos casos de uso, para respeitarem as mesmas regras do Pátio.
import { createContainer } from '../../../container.js';
import { addDays, localDateOf, localTimeOf, localToIso } from '../../../domain/business-time.js';
import { createFixedClock, systemClock } from '../../clock.js';
import {
  CASH_OPERATORS,
  CUSTOMERS,
  DEMO_ANALYST,
  DEMO_APPOINTMENTS,
  DEMO_AUTHORIZATIONS,
  DEMO_BUSINESS_OWNER,
  DEMO_INSTITUTION,
  DEMO_LOYALTY_RULES,
  DEMO_USERS,
  HISTORY_DAYS,
  LATEST_LOCAL_HOUR_FOR_SAME_DAY,
  SETTINGS,
  STATIONS,
  VEHICLE_CLASSES,
  WASH_HISTORY_PLAN,
  WASH_PLANS,
  YARD_START_OFFSET_MIN,
  YARD_TIMELINE,
} from './demo-data.js';
import {
  pick,
  PITCH_CUSTOMERS_TOTAL,
  PITCH_DIGITAL_SHARE,
  PITCH_OPERATORS,
  PITCH_PLAN_MIX,
  PITCH_UNPAID_SHARE,
  PITCH_WEEKDAY_WASHES,
  pitchCustomers,
  pitchVisits,
  seededRandom,
  shuffle,
} from './pitch-data.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const SEED_ACTOR = 'demonstração';

/** @returns false se a base já tinha dados (nada é alterado). */
/** Volumes: "pitch" = base da proposta v1 (212 clientes, ~365 lavagens); "compact" = só os clientes do roteiro. */
export const SeedVolume = Object.freeze({ PITCH: 'pitch', COMPACT: 'compact' });

/**
 * @param passwordHasher para os testes usarem um custo de hash mais baixo
 * @param volume SeedVolume (os testes usam "compact")
 */
export function seedDemo(db, { clock = systemClock, passwordHasher, volume = SeedVolume.PITCH } = {}) {
  if (hasReferenceData(db)) return false;

  // O relógio da demonstração começa 30 dias antes de "agora" e avança até ao pátio actual.
  const nowMs = clock.now().getTime();
  const demoClock = createFixedClock(new Date(nowMs - HISTORY_DAYS * DAY_MS).toISOString());
  const { services, repositories, unitOfWork } = createContainer({ db, clock: demoClock, security: { passwordHasher } });

  unitOfWork.run(() => {
    insertReferenceData(db, repositories.stationRepository, demoClock.nowIso());
    SETTINGS.forEach((setting) => services.settingsService.define(setting));
    services.loyaltyService.publishRules(DEMO_LOYALTY_RULES, { actor: SEED_ACTOR, toValidate: true });
    CUSTOMERS.forEach((customer) => services.customerService.register(customer));
    playHistory(db, services, demoClock, nowMs);
    if (volume === SeedVolume.PITCH) playPitchHistory(db, services, demoClock, nowMs);
    seedSharing(repositories.sharingRepository, services, demoClock, nowMs);
    seedUsers(db, services.authService);
    demoClock.set(new Date(nowMs - YARD_START_OFFSET_MIN * MINUTE_MS).toISOString());
    playYardTimeline(db, services, demoClock);
    demoClock.set(new Date(nowMs).toISOString());
    seedAppointments(db, services, demoClock);
  });
  return true;
}

function hasReferenceData(db) {
  return db.prepare('SELECT COUNT(*) AS total FROM vehicle_classes').get().total > 0;
}

function insertReferenceData(db, stationRepository, now) {
  const insertClass = db.prepare('INSERT INTO vehicle_classes (code, name, description, sort_order) VALUES (?, ?, ?, ?)');
  VEHICLE_CLASSES.forEach(({ code, name, description }, index) => insertClass.run(code, name, description, index + 1));

  const insertPlan = db.prepare(`INSERT INTO wash_plans
    (code, name, description, base_duration_min, active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertPrice = db.prepare(`INSERT INTO class_plan_prices (plan_id, class_id, price_cents, updated_at)
    SELECT ?, id, ?, ? FROM vehicle_classes WHERE code = ?`);
  WASH_PLANS.forEach((plan, index) => {
    const { lastInsertRowid } = insertPlan.run(
      plan.code,
      plan.name,
      plan.description,
      plan.durationMin,
      Number(plan.active),
      index + 1,
      now,
      now,
    );
    for (const [classCode, mzn] of Object.entries(plan.prices)) {
      if (mzn !== null) insertPrice.run(Number(lastInsertRowid), mzn * 100, now, classCode);
    }
  });

  STATIONS.forEach((code, index) => stationRepository.insert({ code, name: `Posto ${index + 1}`, sortOrder: index + 1 }));
}

function seedAppointments(db, { appointmentService }, demoClock) {
  const now = demoClock.nowIso();
  const sameDay = Number(localTimeOf(now).slice(0, 2)) < LATEST_LOCAL_HOUR_FOR_SAME_DAY;
  const day = sameDay ? localDateOf(now) : addDays(localDateOf(now), 1);
  const idOf = (sql, value) => db.prepare(sql).get(value).id;
  for (const demo of DEMO_APPOINTMENTS) {
    const appointment = appointmentService.book({
      vehicleId: idOf('SELECT id FROM vehicles WHERE plate = ?', demo.plate),
      planId: idOf('SELECT id FROM wash_plans WHERE code = ?', demo.plan),
      startsAt: localToIso(day, demo.time),
      source: 'demo',
      actor: SEED_ACTOR,
    });
    if (demo.confirm) appointmentService.transition(appointment.id, { to: 'confirmed', actor: SEED_ACTOR });
    if (demo.declinedOffer) {
      const offer = appointmentService.propose(appointment.id, { proposedStartsAt: localToIso(day, demo.declinedOffer), actor: SEED_ACTOR });
      appointmentService.respondToOffer(offer.id, { accept: false, actor: appointment.customerName });
    }
  }
}

function seedUsers(db, authService) {
  for (const { institution, ...user } of DEMO_USERS) {
    const institutionId = institution ? db.prepare('SELECT id FROM institutions WHERE code = ?').get(institution).id : undefined;
    authService.createUser({ ...user, institutionId });
  }
}

/** Autorizações da lavadora ao Moza Banco: uma revogada e uma activa, já consultada. */
function seedSharing(sharingRepository, { sharingService, bankReportService }, demoClock, nowMs) {
  const at = (daysAgo) => demoClock.set(new Date(nowMs - daysAgo * DAY_MS).toISOString());
  const institutionId = sharingRepository.insertInstitution(DEMO_INSTITUTION, demoClock.nowIso());
  for (const demo of DEMO_AUTHORIZATIONS) {
    at(demo.daysAgo);
    const authorization = sharingService.grant({ institutionId, ...demo, confirmed: true }, DEMO_BUSINESS_OWNER);
    if (demo.revoke) {
      at(demo.revoke.daysAgo);
      sharingService.revoke(authorization.id, { reason: demo.revoke.reason, actor: DEMO_BUSINESS_OWNER });
    }
    if (demo.viewedDaysAgo) {
      at(demo.viewedDaysAgo);
      bankReportService.activityReport({ institutionId, authorizationId: authorization.id, actor: DEMO_ANALYST });
    }
  }
}

/** Lavagens passadas, uma de cada vez no P1, espalhadas pelos últimos dias de forma determinística. */
function playHistory(db, { washService, paymentService }, demoClock, nowMs) {
  const idOf = (sql, value) => db.prepare(sql).get(value).id;
  const stationId = idOf('SELECT id FROM stations WHERE code = ?', 'P1');
  const todayStartMs = nowMs - (nowMs % DAY_MS);

  historyEntries().forEach((entry, index) => {
    demoClock.set(new Date(todayStartMs - entry.daysAgo * DAY_MS + entry.hourUtc * 60 * MINUTE_MS).toISOString());
    const wash = washService.register({
      vehicleId: idOf('SELECT id FROM vehicles WHERE plate = ?', entry.plate),
      planId: idOf('SELECT id FROM wash_plans WHERE code = ?', entry.plan),
      source: 'demo',
      actor: SEED_ACTOR,
    });
    const operator = CASH_OPERATORS[index % CASH_OPERATORS.length];
    washService.transition(wash.id, { to: 'in_progress', stationId, actor: operator });
    demoClock.advanceMinutes(wash.durationMin);
    washService.transition(wash.id, { to: 'ready', actor: operator });
    if (entry.paid) payHistoricWash(paymentService, wash, index, operator);
    washService.transition(wash.id, { to: 'completed', allowUnpaid: !entry.paid, actor: operator });
  });
}

/**
 * Base da proposta v1 (secção 2.1): clientes de fundo e lavagens dos últimos 29 dias com a semana
 * média 8·6·7·8·14·24·18, distribuídas pelos 4 postos. Passa pelos casos de uso, como o resto.
 */
function playPitchHistory(db, { customerService, washService, paymentService }, demoClock, nowMs) {
  const random = seededRandom(20_261_022);
  const vehicleIds = pitchCustomers(PITCH_CUSTOMERS_TOTAL - CUSTOMERS.length, random).map(
    (customer) => customerService.register(customer).vehicles[0].id,
  );
  const stationIds = STATIONS.map((code) => db.prepare('SELECT id FROM stations WHERE code = ?').get(code).id);
  const planIds = Object.fromEntries(PITCH_PLAN_MIX.map(([code]) => [code, db.prepare('SELECT id FROM wash_plans WHERE code = ?').get(code).id]));

  const slots = pitchSlots(nowMs);
  const visits = shuffle(pitchVisits(vehicleIds.length, slots.length), random);
  slots.forEach((slot, n) => {
    demoClock.set(localToIso(slot.date, slot.time));
    const wash = washService.register({ vehicleId: vehicleIds[visits[n]], planId: planIds[pick(random, PITCH_PLAN_MIX)], source: 'demo', actor: SEED_ACTOR });
    const operator = PITCH_OPERATORS[n % PITCH_OPERATORS.length];
    washService.transition(wash.id, { to: 'in_progress', stationId: stationIds[slot.index % stationIds.length], actor: operator });
    demoClock.advanceMinutes(wash.durationMin);
    washService.transition(wash.id, { to: 'ready', actor: operator });
    const roll = random();
    const paid = roll >= PITCH_UNPAID_SHARE;
    if (paid) payPitchWash(paymentService, wash, operator, roll < PITCH_UNPAID_SHARE + PITCH_DIGITAL_SHARE);
    demoClock.advanceMinutes(5);
    washService.transition(wash.id, { to: 'completed', allowUnpaid: !paid, actor: operator });
  });
}

/** Um lugar por lavagem: dia, posição no dia e hora local, já descontadas as lavagens do roteiro. */
function pitchSlots(nowMs) {
  const today = localDateOf(new Date(nowMs).toISOString());
  const scripted = new Map();
  for (const entry of historyEntries()) scripted.set(entry.daysAgo, (scripted.get(entry.daysAgo) ?? 0) + 1);
  const slots = [];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 1; daysAgo -= 1) {
    const date = addDays(today, -daysAgo);
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const count = Math.max(0, PITCH_WEEKDAY_WASHES[weekday] - (scripted.get(daysAgo) ?? 0));
    const rounds = Math.ceil(count / STATIONS.length);
    const spacingMin = Math.floor((10 * 60) / Math.max(1, rounds));
    for (let index = 0; index < count; index += 1) {
      const minutes = 7 * 60 + Math.floor(index / STATIONS.length) * spacingMin + (index % STATIONS.length) * 7;
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      slots.push({ date, index, time });
    }
  }
  return slots;
}

function payPitchWash(paymentService, wash, operator, digital) {
  const idempotencyKey = `demo-pitch-${wash.id}`;
  if (!digital) {
    paymentService.declareCash(wash.id, { amountCents: wash.finalPriceCents, declaredBy: operator, confirmed: true, idempotencyKey, actor: operator });
    return;
  }
  const { payment } = paymentService.startDigital(wash.id, { amountCents: wash.finalPriceCents, idempotencyKey, actor: wash.customerName });
  paymentService.simulate(payment.id, 'confirmed');
}

function historyEntries() {
  const entries = WASH_HISTORY_PLAN.flatMap(({ plate, plan, paid, unpaid }, vehicleIndex) =>
    Array.from({ length: paid + unpaid }, (_, n) => ({
      plate,
      plan,
      paid: n < paid,
      daysAgo: 1 + ((n * 3 + vehicleIndex * 2) % (HISTORY_DAYS - 2)),
      hourUtc: 6 + ((n + vehicleIndex * 2) % 9),
    })),
  );
  return entries.sort((a, b) => b.daysAgo - a.daysAgo || a.hourUtc - b.hourUtc || a.plate.localeCompare(b.plate));
}

// Alterna entre numerário declarado e digital simulado.
function payHistoricWash(paymentService, wash, index, operator) {
  const idempotencyKey = `demo-history-${wash.id}`;
  if (index % 2 === 0) {
    paymentService.declareCash(wash.id, {
      amountCents: wash.finalPriceCents,
      declaredBy: operator,
      confirmed: true,
      idempotencyKey,
      actor: operator,
    });
    return;
  }
  const { payment } = paymentService.startDigital(wash.id, {
    amountCents: wash.finalPriceCents,
    idempotencyKey,
    actor: wash.customerName,
  });
  paymentService.simulate(payment.id, 'confirmed');
}

function playYardTimeline(db, { washService, paymentService }, demoClock) {
  const idOf = (sql, value) => db.prepare(sql).get(value).id;
  const washIds = {};
  let elapsedMin = 0;

  for (const step of YARD_TIMELINE) {
    demoClock.advanceMinutes(step.atMin - elapsedMin);
    elapsedMin = step.atMin;

    if (step.register) {
      const { key, plate, plan } = step.register;
      washIds[key] = washService.register({
        vehicleId: idOf('SELECT id FROM vehicles WHERE plate = ?', plate),
        planId: idOf('SELECT id FROM wash_plans WHERE code = ?', plan),
        source: 'demo',
        actor: SEED_ACTOR,
      }).id;
    } else if (step.payDigital) {
      const wash = washService.get(washIds[step.payDigital.key]);
      const { payment } = paymentService.startDigital(wash.id, {
        amountCents: wash.finalPriceCents,
        idempotencyKey: `demo-digital-${wash.id}`,
        actor: wash.customerName,
      });
      paymentService.simulate(payment.id, 'confirmed');
    } else {
      const { key, to, station, actor } = step.transition;
      const stationId = station ? idOf('SELECT id FROM stations WHERE code = ?', station) : undefined;
      washService.transition(washIds[key], { to, stationId, actor });
    }
  }
}
