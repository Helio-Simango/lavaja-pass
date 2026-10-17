// Dados de demonstração. Todos os valores são ilustrativos e estão por validar (D-19, D-20).
import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { createFixedClock, systemClock } from '../lib/clock.js';
import { createServices } from '../services/index.js';
import { openDatabase } from './connection.js';
import { migrate } from './migrate.js';
import { transaction } from './tx.js';

const CLASSES = [
  ['A', 'Classe A', 'Viaturas ligeiras de passageiros, como hatchbacks e sedans'],
  ['B', 'Classe B', 'Viaturas de maiores dimensões, como SUVs, 4x4 e determinadas carrinhas de caixa aberta (pickups)'],
  ['C', 'Classe C', 'Viaturas de maiores dimensões ou comerciais ligeiras, como vans e minibus'],
];

// [código, nome, descrição, duração base (min), activo, preços A/B/C em MZN (null = sem preço)]
// O Polimento está indisponível e sem preço na classe C de propósito: demonstra as duas recusas.
const PLANS = [
  ['SIMPLES', 'Simples', 'Exterior', 30, true, [250, 350, 450]],
  ['COMPLETA', 'Completa', 'Exterior e interior', 50, true, [450, 600, 750]],
  ['COMPLETA_MOTOR', 'Completa + Motor', 'Exterior, interior e motor', 75, true, [700, 900, 1100]],
  ['POLIMENTO', 'Polimento', 'Polimento da pintura', 120, false, [1500, 2000, null]],
];

const STATIONS = ['P1', 'P2', 'P3', 'P4'];

const SETTINGS = [
  {
    key: 'business.name',
    value: 'Lava Já – Matola',
    description: 'Lavadora do caso do hackathon (dados de demonstração)',
  },
  { key: 'business.currency', value: 'MZN', description: 'Moeda dos preços', toValidate: false },
  {
    key: 'demo.institution',
    value: 'Moza Banco',
    description:
      'Instituição usada na demonstração da vertente Banco (I-7): dono do desafio e patrocinador do hackathon. Sem parceria formal.',
  },
];

// Clientes fictícios; matrículas dos mocks do documento de referência.
const CUSTOMERS = [
  ['84 555 0101', 'Amélia Macuácua', [['ACX 731 MC', 'B', 'Toyota Hilux']]],
  ['82 555 0102', 'Carlos Sitoe', [['AHM 482 MP', 'A', 'Toyota Corolla']]],
  ['85 555 0103', 'Fátima Nhantumbo', [['ABC 123 MC', 'B', 'Toyota RAV4']]],
  ['86 555 0104', 'Jorge Cossa', [['MMC 552 MP', 'C', 'Toyota Hiace']]],
  ['87 555 0105', 'Luísa Tembe', [['AGB 550 MP', 'A', 'Honda Fit']]],
  ['84 555 0106', 'Paulo Mabunda', [['AAZ 219 MP', 'A', 'Mazda Demio'], ['ANT 145 MC', 'C', 'Nissan Caravan']]],
];

const ACTOR = 'demonstração';

export function seedDemo(db, { clock = systemClock } = {}) {
  if (db.prepare('SELECT COUNT(*) AS n FROM vehicle_classes').get().n > 0) return false;

  // O pátio de demonstração começa 90 min antes de "agora" e avança no tempo.
  const now = clock.now().getTime();
  const seedClock = createFixedClock(new Date(now - 90 * 60_000).toISOString());
  const services = createServices({ db, clock: seedClock });
  const t = seedClock.nowIso();

  transaction(db, () => {
    CLASSES.forEach(([code, name, description], i) => {
      db.prepare('INSERT INTO vehicle_classes (code, name, description, sort_order) VALUES (?, ?, ?, ?)').run(
        code,
        name,
        description,
        i + 1,
      );
    });

    PLANS.forEach(([code, name, description, duration, active, prices], i) => {
      const { lastInsertRowid } = db
        .prepare(`INSERT INTO wash_plans (code, name, description, base_duration_min, active, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(code, name, description, duration, active ? 1 : 0, i + 1, t, t);
      prices.forEach((mzn, j) => {
        if (mzn === null) return;
        db.prepare('INSERT INTO class_plan_prices (plan_id, class_id, price_cents, updated_at) VALUES (?, ?, ?, ?)').run(
          Number(lastInsertRowid),
          j + 1,
          mzn * 100,
          t,
        );
      });
    });

    STATIONS.forEach((code, i) => {
      db.prepare('INSERT INTO stations (code, name, sort_order) VALUES (?, ?, ?)').run(code, `Posto ${i + 1}`, i + 1);
    });

    for (const s of SETTINGS) services.settings.define(s);

    const vehicleByPlate = {};
    for (const [phone, name, vehicles] of CUSTOMERS) {
      const customer = services.customers.create({
        phone,
        name,
        vehicles: vehicles.map(([plate, classId, description]) => ({ plate, classId, description })),
      });
      for (const v of customer.vehicles) vehicleByPlate[v.plateDisplay] = v.id;
    }

    // Pátio coerente com o mock M7: P1 em execução, P2 pronto, dois em fila.
    const plan = (code) => db.prepare('SELECT id FROM wash_plans WHERE code = ?').get(code).id;
    const station = (code) => db.prepare('SELECT id FROM stations WHERE code = ?').get(code).id;
    const wash = (plate, planCode) =>
      services.washes.create({ vehicleId: vehicleByPlate[plate], planId: plan(planCode), source: 'demo', actor: ACTOR })
        .id;

    const ready = wash('AGB 550 MP', 'COMPLETA');
    services.washes.transition(ready, { to: 'in_progress', stationId: station('P2'), actor: 'Amílcar' });
    seedClock.advanceMinutes(20);
    const running = wash('MMC 552 MP', 'COMPLETA_MOTOR');
    seedClock.advanceMinutes(45);
    services.washes.transition(running, { to: 'in_progress', stationId: station('P1'), actor: 'Bento' });
    seedClock.advanceMinutes(15);
    wash('ABC 123 MC', 'COMPLETA');
    seedClock.advanceMinutes(7);
    services.washes.transition(ready, { to: 'ready', actor: 'Amílcar' });
    seedClock.advanceMinutes(1);
    wash('AAZ 219 MP', 'SIMPLES');
  });
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDatabase(config.dbPath);
  migrate(db);
  const seeded = seedDemo(db);
  db.close();
  console.log(seeded ? 'Dados de demonstração carregados.' : 'A base já tem dados; nada foi alterado.');
}
