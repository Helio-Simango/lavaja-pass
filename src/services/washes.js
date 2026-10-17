import { conflict, notFound, validationError } from '../lib/errors.js';
import { money } from '../lib/money.js';
import { formatPhone } from '../lib/phone.js';
import { formatPlate } from '../lib/plate.js';
import { transaction } from '../db/tx.js';
import { computeEstimates } from './estimates.js';

export const WASH_STATUSES = ['queued', 'in_progress', 'ready', 'completed', 'cancelled'];
export const ACTIVE_STATUSES = ['queued', 'in_progress', 'ready'];

export const STATUS_LABELS = {
  queued: 'Em fila',
  in_progress: 'Em execução',
  ready: 'Pronto',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

// Transições aceites (cap. 10.3). Tudo o resto é recusado com 409.
const TRANSITIONS = {
  queued: ['in_progress', 'cancelled'],
  in_progress: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

const SOURCES = ['patio', 'simulador', 'demo'];

const WASH_SELECT = `SELECT w.*, cu.name AS customer_name, cu.phone AS customer_phone, s.code AS station_code
  FROM washes w
  JOIN customers cu ON cu.id = w.customer_id
  LEFT JOIN stations s ON s.id = w.station_id`;

export const washCode = (id) => `LJ-${String(id).padStart(4, '0')}`;

export function createWashesService({ db, clock, catalog }) {
  function mapWash(r, estimate) {
    const unpaidCompleted = r.status === 'completed' && r.completed_unpaid === 1;
    return {
      id: r.id,
      code: washCode(r.id),
      status: r.status,
      statusLabel: STATUS_LABELS[r.status],
      customer: { id: r.customer_id, name: r.customer_name, phoneDisplay: formatPhone(r.customer_phone) },
      vehicle: { id: r.vehicle_id, plate: r.plate, plateDisplay: formatPlate(r.plate), classCode: r.class_code },
      plan: { id: r.plan_id, name: r.plan_name },
      durationMin: r.duration_min,
      price: {
        base: money(r.base_price_cents, r.currency),
        discount: money(r.discount_cents, r.currency),
        loyaltyBenefit: money(r.loyalty_benefit_cents, r.currency),
        final: money(r.final_price_cents, r.currency),
      },
      // Pagamentos simulados e numerário declarado chegam no marco I-3.
      payment: {
        status: r.final_price_cents === 0 ? 'not_required' : unpaidCompleted ? 'delivered_unpaid' : 'unpaid',
        label: r.final_price_cents === 0 ? 'Sem valor a pagar' : unpaidCompleted ? 'Entregue sem pagamento' : 'Por pagar',
      },
      station: r.station_id ? { id: r.station_id, code: r.station_code } : null,
      source: r.source,
      queuedAt: r.queued_at,
      startedAt: r.started_at,
      readyAt: r.ready_at,
      completedAt: r.completed_at,
      cancelledAt: r.cancelled_at,
      cancelReason: r.cancel_reason,
      completedUnpaid: r.completed_unpaid === 1,
      createdBy: r.created_by,
      estimate: estimate ?? null,
    };
  }

  function getRow(id) {
    const row = db.prepare(`${WASH_SELECT} WHERE w.id = ?`).get(id);
    if (!row) throw notFound('Serviço não encontrado.');
    return row;
  }

  function activeEstimates() {
    const stations = db.prepare('SELECT id, active FROM stations').all().map((s) => ({ id: s.id, active: s.active === 1 }));
    const washes = db
      .prepare(`SELECT id, status, station_id, started_at, queued_at, duration_min FROM washes
        WHERE status IN ('queued', 'in_progress', 'ready')`)
      .all()
      .map((w) => ({
        id: w.id,
        status: w.status,
        stationId: w.station_id,
        startedAt: w.started_at,
        queuedAt: w.queued_at,
        durationMin: w.duration_min,
      }));
    return computeEstimates({ now: clock.now(), stations, washes });
  }

  function addEvent(washId, fromStatus, toStatus, { actor, reason = null, stationId = null, details = null }) {
    db.prepare(`INSERT INTO wash_status_events
      (wash_id, from_status, to_status, station_id, actor, reason, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      washId,
      fromStatus,
      toStatus,
      stationId,
      actor,
      reason,
      details ? JSON.stringify(details) : null,
      clock.nowIso(),
    );
  }

  function get(id) {
    const row = getRow(id);
    const estimate = ACTIVE_STATUSES.includes(row.status) ? activeEstimates().get(id) : undefined;
    return mapWash(row, estimate);
  }

  function create({ vehicleId, planId, source = 'patio', actor }) {
    if (!SOURCES.includes(source)) throw validationError(`"source" deve ser um de: ${SOURCES.join(', ')}.`);
    const id = transaction(db, () => {
      const vehicle = db
        .prepare(`SELECT v.*, c.code AS class_code FROM vehicles v
          JOIN vehicle_classes c ON c.id = v.class_id WHERE v.id = ?`)
        .get(vehicleId);
      if (!vehicle) throw notFound('Viatura não encontrada.');
      const active = db
        .prepare(`SELECT id, status FROM washes WHERE vehicle_id = ? AND status IN ('queued', 'in_progress', 'ready')`)
        .get(vehicleId);
      if (active) {
        throw conflict('VEHICLE_ALREADY_ACTIVE', 'Esta viatura já tem um serviço activo no pátio.', {
          washId: active.id,
          status: active.status,
        });
      }
      // O preço é sempre calculado no servidor, a partir da classe actual da viatura.
      const { plan, priceCents, currency } = catalog.resolvePrice(planId, vehicle.class_id);
      const now = clock.nowIso();
      const { lastInsertRowid } = db
        .prepare(`INSERT INTO washes (customer_id, vehicle_id, plate, class_id, class_code, plan_id, plan_name,
            duration_min, base_price_cents, discount_cents, loyalty_benefit_cents, final_price_cents, currency,
            status, source, queued_at, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'queued', ?, ?, ?, ?, ?)`)
        .run(
          vehicle.customer_id,
          vehicle.id,
          vehicle.plate,
          vehicle.class_id,
          vehicle.class_code,
          plan.id,
          plan.name,
          plan.base_duration_min,
          priceCents,
          priceCents,
          currency,
          source,
          now,
          actor,
          now,
          now,
        );
      const washId = Number(lastInsertRowid);
      addEvent(washId, null, 'queued', { actor });
      return washId;
    });
    return get(id);
  }

  // Devolve { wash, changed }. Repetir o pedido para o estado actual não tem efeitos.
  function transition(id, { to, stationId, reason, allowUnpaid = false, actor }) {
    if (!WASH_STATUSES.includes(to)) {
      throw validationError(`"to" deve ser um de: ${WASH_STATUSES.join(', ')}.`, { field: 'to' });
    }
    const changed = transaction(db, () => {
      const wash = getRow(id);
      if (wash.status === to) return false;
      if (!TRANSITIONS[wash.status].includes(to)) {
        throw conflict(
          'INVALID_TRANSITION',
          `Não é possível passar de "${STATUS_LABELS[wash.status]}" para "${STATUS_LABELS[to]}".`,
          { from: wash.status, to, allowed: TRANSITIONS[wash.status] },
        );
      }
      const now = clock.nowIso();
      const event = { actor };
      let update;

      if (to === 'in_progress') {
        if (stationId === undefined) throw validationError('Indique o posto ("stationId").', { field: 'stationId' });
        const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(stationId);
        if (!station) throw notFound('Posto não encontrado.');
        if (station.active !== 1) throw conflict('STATION_INACTIVE', `O posto ${station.code} está inactivo.`);
        const busy = db
          .prepare(`SELECT id FROM washes WHERE station_id = ? AND status IN ('in_progress', 'ready')`)
          .get(stationId);
        if (busy) {
          throw conflict('STATION_BUSY', `O posto ${station.code} está ocupado.`, { washId: busy.id });
        }
        update = ['station_id = ?, started_at = ?', [stationId, now]];
        event.stationId = stationId;
      } else if (to === 'ready') {
        // O aviso ao cliente na conversa chega com o simulador (I-5).
        update = ['ready_at = ?', [now]];
        event.stationId = wash.station_id;
      } else if (to === 'completed') {
        // Até ao I-3 não há pagamentos registados: só um valor final 0 dispensa a confirmação.
        const paid = wash.final_price_cents === 0;
        if (!paid && allowUnpaid !== true) {
          throw conflict(
            'PAYMENT_REQUIRED',
            'O serviço não tem pagamento registado. Para entregar sem pagamento, confirme explicitamente (allowUnpaid).',
            { finalPrice: money(wash.final_price_cents, wash.currency) },
          );
        }
        update = ['completed_at = ?, completed_unpaid = ?', [now, paid ? 0 : 1]];
        event.stationId = wash.station_id;
        if (!paid) event.details = { allowUnpaid: true, amountDueCents: wash.final_price_cents };
      } else if (to === 'cancelled') {
        if (typeof reason !== 'string' || reason.trim().length < 3) {
          throw validationError('O motivo do cancelamento é obrigatório.', { field: 'reason' });
        }
        event.reason = reason.trim().slice(0, 200);
        update = ['cancelled_at = ?, cancel_reason = ?', [now, event.reason]];
      }

      const result = db
        .prepare(`UPDATE washes SET status = ?, ${update[0]}, updated_at = ? WHERE id = ? AND status = ?`)
        .run(to, ...update[1], now, id, wash.status);
      if (result.changes !== 1) throw conflict('CONCURRENT_UPDATE', 'O serviço foi alterado entretanto. Tente de novo.');
      addEvent(id, wash.status, to, event);
      return true;
    });
    return { wash: get(id), changed };
  }

  function list({ statuses, date, limit = 200 } = {}) {
    const filters = [];
    const params = [];
    if (statuses?.length) {
      filters.push(`w.status IN (${statuses.map(() => '?').join(', ')})`);
      params.push(...statuses);
    }
    if (date) {
      filters.push('substr(w.queued_at, 1, 10) = ?');
      params.push(date);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const estimates = activeEstimates();
    return db
      .prepare(`${WASH_SELECT} ${where} ORDER BY w.queued_at, w.id LIMIT ?`)
      .all(...params, limit)
      .map((r) => mapWash(r, estimates.get(r.id)));
  }

  function events(id) {
    getRow(id);
    return db
      .prepare(`SELECT e.*, s.code AS station_code FROM wash_status_events e
        LEFT JOIN stations s ON s.id = e.station_id WHERE e.wash_id = ? ORDER BY e.id`)
      .all(id)
      .map((e) => ({
        id: e.id,
        from: e.from_status,
        to: e.to_status,
        station: e.station_code,
        actor: e.actor,
        reason: e.reason,
        details: e.details_json ? JSON.parse(e.details_json) : null,
        createdAt: e.created_at,
      }));
  }

  return { create, get, list, transition, events };
}
