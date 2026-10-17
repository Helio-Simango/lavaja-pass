// Carrega a demonstração. Os dados de referência (classes, planos, postos) entram directamente;
// clientes e serviços passam pelos casos de uso, para respeitarem as mesmas regras do Pátio.
import { createContainer } from '../../../container.js';
import { createFixedClock, systemClock } from '../../clock.js';
import { CUSTOMERS, SETTINGS, STATIONS, VEHICLE_CLASSES, WASH_PLANS, YARD_START_OFFSET_MIN, YARD_TIMELINE } from './demo-data.js';

const SEED_ACTOR = 'demonstração';

/** @returns false se a base já tinha dados (nada é alterado). */
export function seedDemo(db, { clock = systemClock } = {}) {
  if (hasReferenceData(db)) return false;

  const yardClock = createFixedClock(new Date(clock.now().getTime() - YARD_START_OFFSET_MIN * 60_000).toISOString());
  const { services, repositories, unitOfWork } = createContainer({ db, clock: yardClock });

  unitOfWork.run(() => {
    insertReferenceData(db, repositories.stationRepository, yardClock.nowIso());
    SETTINGS.forEach((setting) => services.settingsService.define(setting));
    CUSTOMERS.forEach((customer) => services.customerService.register(customer));
    playYardTimeline(db, services.washService, yardClock);
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

function playYardTimeline(db, washService, yardClock) {
  const idOf = (sql, value) => db.prepare(sql).get(value).id;
  const washIds = {};
  let elapsedMin = 0;

  for (const step of YARD_TIMELINE) {
    yardClock.advanceMinutes(step.atMin - elapsedMin);
    elapsedMin = step.atMin;

    if (step.register) {
      const { key, plate, plan } = step.register;
      washIds[key] = washService.register({
        vehicleId: idOf('SELECT id FROM vehicles WHERE plate = ?', plate),
        planId: idOf('SELECT id FROM wash_plans WHERE code = ?', plan),
        source: 'demo',
        actor: SEED_ACTOR,
      }).id;
    } else {
      const { key, to, station, actor } = step.transition;
      const stationId = station ? idOf('SELECT id FROM stations WHERE code = ?', station) : undefined;
      washService.transition(washIds[key], { to, stationId, actor });
    }
  }
}
