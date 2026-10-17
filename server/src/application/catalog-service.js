import { NotFoundError } from '../domain/errors.js';
import { findPriceForClass, requirePriceForClass, unavailabilityReason } from '../domain/plan.js';
import { parseClassRef, unknownClassError } from '../domain/vehicle-class.js';

export class CatalogService {
  #catalog;
  #changeLog;
  #unitOfWork;
  #clock;

  /**
   * @param {{ catalogRepository: import('./ports.js').CatalogRepository,
   *           changeLogRepository: import('./ports.js').ChangeLogRepository,
   *           unitOfWork: import('./ports.js').UnitOfWork, clock: import('./ports.js').Clock }} deps
   */
  constructor({ catalogRepository, changeLogRepository, unitOfWork, clock }) {
    this.#catalog = catalogRepository;
    this.#changeLog = changeLogRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  listClasses() {
    return this.#catalog.listClasses();
  }

  /** Aceita o id (2, "2") ou o código ("B", "b") da classe. */
  getClass(input, field = 'classId') {
    const vehicleClass = this.#catalog.findClass(parseClassRef(input, field));
    if (!vehicleClass) throw unknownClassError(field);
    return vehicleClass;
  }

  /** Sem classe: todos os planos. Com classe: indica também o preço e a disponibilidade para essa classe. */
  listPlans({ classRef } = {}) {
    const plans = this.#catalog.listPlans();
    if (classRef === undefined) return plans;
    const { id: classId } = this.getClass(classRef);
    return plans.map((plan) => ({
      ...plan,
      priceForClass: findPriceForClass(plan, classId),
      unavailableReason: unavailabilityReason(plan, classId),
    }));
  }

  getPlan(id) {
    const plan = this.#catalog.findPlan(id);
    if (!plan) throw new NotFoundError('Plano não encontrado.');
    return plan;
  }

  /** Altera só os campos que mudam e regista cada alteração (quem, quando, antes e depois). */
  updatePlan(id, patch, actor) {
    return this.#unitOfWork.run(() => {
      const plan = this.getPlan(id);
      const changed = Object.fromEntries(
        Object.entries(patch).filter(([field, value]) => value !== undefined && value !== plan[field]),
      );
      const now = this.#clock.nowIso();
      this.#catalog.updatePlan(id, changed, now);
      for (const [field, newValue] of Object.entries(changed)) {
        this.#changeLog.append({ entity: 'wash_plan', entityId: id, field, oldValue: plan[field], newValue, actor }, now);
      }
      return this.getPlan(id);
    });
  }

  setPrice(planId, classRef, priceCents, actor) {
    return this.#unitOfWork.run(() => {
      const plan = this.getPlan(planId);
      const vehicleClass = this.getClass(classRef);
      const current = findPriceForClass(plan, vehicleClass.id);
      if (current?.priceCents !== priceCents) {
        const now = this.#clock.nowIso();
        this.#catalog.upsertPrice({ planId, classId: vehicleClass.id, priceCents }, now);
        this.#changeLog.append(
          {
            entity: 'class_plan_price',
            entityId: `${planId}:${vehicleClass.code}`,
            field: 'priceCents',
            oldValue: current?.priceCents ?? null,
            newValue: priceCents,
            actor,
          },
          now,
        );
      }
      const updated = this.getPlan(planId);
      return { ...updated, priceForClass: findPriceForClass(updated, vehicleClass.id) };
    });
  }

  /** Preço a aplicar a um novo serviço. Recusa planos inactivos ou sem preço para a classe. */
  quote(planId, classId) {
    const plan = this.getPlan(planId);
    return { plan, price: requirePriceForClass(plan, classId) };
  }
}
