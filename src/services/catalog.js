import { conflict, notFound, validationError } from '../lib/errors.js';
import { money } from '../lib/money.js';
import { transaction } from '../db/tx.js';

export const mapClass = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
});

export function createCatalogService({ db, clock, history }) {
  const priceRows = db.prepare(`SELECT p.plan_id, p.class_id, c.code AS class_code, p.price_cents, p.currency
    FROM class_plan_prices p JOIN vehicle_classes c ON c.id = p.class_id
    WHERE p.plan_id = ? ORDER BY c.sort_order`);

  function mapPlan(row, cls) {
    const prices = priceRows.all(row.id).map((p) => ({
      classId: p.class_id,
      classCode: p.class_code,
      price: money(p.price_cents, p.currency),
    }));
    const plan = {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      baseDurationMin: row.base_duration_min,
      active: row.active === 1,
      prices,
    };
    if (cls) {
      const forClass = prices.find((p) => p.classId === cls.id);
      plan.price = forClass ? forClass.price : null;
      plan.available = plan.active && Boolean(forClass);
      plan.unavailableReason = !plan.active ? 'PLAN_INACTIVE' : forClass ? null : 'PRICE_NOT_DEFINED';
    }
    return plan;
  }

  // Aceita o id (2, "2") ou o código ("B", "b") da classe.
  function getClass(ref, field = 'classId') {
    let row;
    if (typeof ref === 'string' && /^[A-Za-z]$/.test(ref.trim())) {
      row = db.prepare('SELECT * FROM vehicle_classes WHERE code = ?').get(ref.trim().toUpperCase());
    } else if (/^\d+$/.test(String(ref ?? '').trim())) {
      row = db.prepare('SELECT * FROM vehicle_classes WHERE id = ?').get(Number(ref));
    } else {
      throw validationError(`"${field}" é obrigatório: indique a classe (A, B ou C).`, { field });
    }
    if (!row) throw validationError('Classe desconhecida. Só existem as classes A, B e C.', { field });
    return row;
  }

  function getPlanRow(id) {
    const row = db.prepare('SELECT * FROM wash_plans WHERE id = ?').get(id);
    if (!row) throw notFound('Plano não encontrado.');
    return row;
  }

  return {
    getClass,

    listClasses() {
      return db.prepare('SELECT * FROM vehicle_classes ORDER BY sort_order').all().map(mapClass);
    },

    listPlans({ classRef } = {}) {
      const cls = classRef === undefined ? null : getClass(classRef);
      return db
        .prepare('SELECT * FROM wash_plans ORDER BY sort_order, id')
        .all()
        .map((r) => mapPlan(r, cls));
    },

    getPlan(id) {
      return mapPlan(getPlanRow(id));
    },

    updatePlan(id, patch, actor) {
      return transaction(db, () => {
        const row = getPlanRow(id);
        const fields = {
          name: ['name', patch.name],
          description: ['description', patch.description],
          baseDurationMin: ['base_duration_min', patch.baseDurationMin],
          active: ['active', patch.active === undefined ? undefined : patch.active ? 1 : 0],
        };
        for (const [field, [column, value]] of Object.entries(fields)) {
          if (value === undefined || value === row[column]) continue;
          db.prepare(`UPDATE wash_plans SET ${column} = ?, updated_at = ? WHERE id = ?`).run(
            value,
            clock.nowIso(),
            id,
          );
          history.logChange({ entity: 'wash_plan', entityId: id, field, oldValue: row[column], newValue: value, actor });
        }
        return mapPlan(getPlanRow(id));
      });
    },

    setPrice(planId, classRef, priceCents, actor) {
      return transaction(db, () => {
        getPlanRow(planId);
        const cls = getClass(classRef);
        const old = db
          .prepare('SELECT price_cents FROM class_plan_prices WHERE plan_id = ? AND class_id = ?')
          .get(planId, cls.id);
        if (old?.price_cents !== priceCents) {
          db.prepare(`INSERT INTO class_plan_prices (plan_id, class_id, price_cents, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (plan_id, class_id) DO UPDATE SET price_cents = excluded.price_cents, updated_at = excluded.updated_at`)
            .run(planId, cls.id, priceCents, clock.nowIso());
          history.logChange({
            entity: 'class_plan_price',
            entityId: `${planId}:${cls.code}`,
            field: 'price_cents',
            oldValue: old?.price_cents ?? null,
            newValue: priceCents,
            actor,
          });
        }
        return mapPlan(getPlanRow(planId), cls);
      });
    },

    // Um serviço só é aceite se o plano estiver activo e tiver preço para a classe da viatura.
    resolvePrice(planId, classId) {
      const plan = getPlanRow(planId);
      if (plan.active !== 1) {
        throw conflict('PLAN_INACTIVE', `O plano "${plan.name}" está indisponível.`, { planId });
      }
      const price = db
        .prepare(`SELECT p.price_cents, p.currency, c.code FROM class_plan_prices p
          JOIN vehicle_classes c ON c.id = p.class_id WHERE p.plan_id = ? AND p.class_id = ?`)
        .get(planId, classId);
      if (!price) {
        throw conflict('PRICE_NOT_DEFINED', `O plano "${plan.name}" não tem preço para esta classe.`, {
          planId,
          classId,
        });
      }
      return { plan, classCode: price.code, priceCents: price.price_cents, currency: price.currency };
    },
  };
}
