import { conflict, notFound, validationError } from '../lib/errors.js';
import { formatPhone, normalizePhone } from '../lib/phone.js';
import { formatPlate, normalizeJurisdiction, normalizePlate } from '../lib/plate.js';
import { requireString, optionalString } from '../lib/validate.js';
import { transaction } from '../db/tx.js';

export function mapVehicle(r) {
  return {
    id: r.id,
    customerId: r.customer_id,
    jurisdiction: r.jurisdiction,
    plate: r.plate,
    plateDisplay: formatPlate(r.plate),
    class: { id: r.class_id, code: r.class_code },
    description: r.description,
    createdAt: r.created_at,
  };
}

const VEHICLE_SELECT = `SELECT v.*, c.code AS class_code FROM vehicles v
  JOIN vehicle_classes c ON c.id = v.class_id`;

export function createCustomersService({ db, clock, catalog, history }) {
  function vehiclesOf(customerId) {
    return db.prepare(`${VEHICLE_SELECT} WHERE v.customer_id = ? ORDER BY v.id`).all(customerId).map(mapVehicle);
  }

  function mapCustomer(r) {
    return {
      id: r.id,
      phone: r.phone,
      phoneDisplay: formatPhone(r.phone),
      name: r.name,
      createdAt: r.created_at,
      vehicles: vehiclesOf(r.id),
    };
  }

  function getRow(id) {
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!row) throw notFound('Cliente não encontrado.');
    return row;
  }

  function parsePhone(raw) {
    const phone = normalizePhone(raw);
    if (!phone) {
      throw validationError('Telefone inválido. Use um móvel de Moçambique (82–87), ex.: 84 123 4567.', {
        field: 'phone',
      });
    }
    return phone;
  }

  function getVehicleRow(id) {
    const row = db.prepare(`${VEHICLE_SELECT} WHERE v.id = ?`).get(id);
    if (!row) throw notFound('Viatura não encontrada.');
    return row;
  }

  // Devolve { vehicle, created }. A mesma matrícula no mesmo cliente não é duplicada;
  // noutro cliente é recusada (a transferência de viaturas fica fora do protótipo).
  function addVehicle(customerId, input) {
    return transaction(db, () => {
      getRow(customerId);
      const plate = normalizePlate(input.plate);
      if (!plate) throw validationError('Matrícula inválida.', { field: 'plate' });
      const jurisdiction = normalizeJurisdiction(input.jurisdiction);
      if (!jurisdiction) throw validationError('Jurisdição inválida (ex.: MZ).', { field: 'jurisdiction' });
      const cls = catalog.getClass(input.classId);
      const description = optionalString(input.description, 'description', { max: 120 }) ?? null;

      const existing = db.prepare('SELECT * FROM vehicles WHERE jurisdiction = ? AND plate = ?').get(jurisdiction, plate);
      if (existing) {
        if (existing.customer_id !== customerId) {
          throw conflict('PLATE_TAKEN', 'Esta matrícula já está registada noutro cliente.', { plate });
        }
        return { vehicle: mapVehicle(getVehicleRow(existing.id)), created: false };
      }
      const now = clock.nowIso();
      const { lastInsertRowid } = db
        .prepare(`INSERT INTO vehicles (customer_id, jurisdiction, plate, class_id, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(customerId, jurisdiction, plate, cls.id, description, now, now);
      return { vehicle: mapVehicle(getVehicleRow(Number(lastInsertRowid))), created: true };
    });
  }

  return {
    normalizePhoneOrThrow: parsePhone,

    get(id) {
      return mapCustomer(getRow(id));
    },

    findByPhone(raw) {
      const row = db.prepare('SELECT * FROM customers WHERE phone = ?').get(parsePhone(raw));
      if (!row) throw notFound('Não existe nenhum cliente com este telefone.');
      return mapCustomer(row);
    },

    list({ limit = 100 } = {}) {
      return db.prepare('SELECT * FROM customers ORDER BY name, id LIMIT ?').all(limit).map(mapCustomer);
    },

    create(input) {
      return transaction(db, () => {
        const phone = parsePhone(input.phone);
        const name = requireString(input.name, 'name', { min: 2, max: 80 });
        if (db.prepare('SELECT 1 FROM customers WHERE phone = ?').get(phone)) {
          throw conflict('PHONE_TAKEN', 'Já existe um cliente com este telefone.', { phone });
        }
        const vehicles = input.vehicles ?? [];
        if (!Array.isArray(vehicles)) throw validationError('"vehicles" deve ser uma lista.', { field: 'vehicles' });

        const now = clock.nowIso();
        const { lastInsertRowid } = db
          .prepare('INSERT INTO customers (phone, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run(phone, name, now, now);
        const id = Number(lastInsertRowid);
        for (const v of vehicles) addVehicle(id, v ?? {});
        return mapCustomer(getRow(id));
      });
    },

    addVehicle,

    getVehicle(id) {
      return mapVehicle(getVehicleRow(id));
    },

    listVehicles({ classRef } = {}) {
      const cls = classRef === undefined ? null : catalog.getClass(classRef);
      return db
        .prepare(`SELECT v.*, c.code AS class_code, cu.name AS customer_name, cu.phone AS customer_phone
          FROM vehicles v JOIN vehicle_classes c ON c.id = v.class_id JOIN customers cu ON cu.id = v.customer_id
          WHERE (? IS NULL OR v.class_id = ?) ORDER BY v.plate`)
        .all(cls?.id ?? null, cls?.id ?? null)
        .map((r) => ({
          ...mapVehicle(r),
          customer: { id: r.customer_id, name: r.customer_name, phoneDisplay: formatPhone(r.customer_phone) },
        }));
    },

    // Reclassificação permitida; os serviços já registados guardam a classe usada no momento.
    reclassifyVehicle(id, classRef, actor) {
      return transaction(db, () => {
        const row = getVehicleRow(id);
        const cls = catalog.getClass(classRef);
        if (cls.id !== row.class_id) {
          db.prepare('UPDATE vehicles SET class_id = ?, updated_at = ? WHERE id = ?').run(cls.id, clock.nowIso(), id);
          history.logChange({
            entity: 'vehicle',
            entityId: id,
            field: 'class',
            oldValue: row.class_code,
            newValue: cls.code,
            actor,
          });
        }
        return mapVehicle(getVehicleRow(id));
      });
    },
  };
}
