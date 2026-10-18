// Assistente da conversa (cap. 15.6): máquina de estados guardada na conversa.
// É um canal de entrada, como a API HTTP: usa os mesmos casos de uso e regras do Pátio.
// Uma regra violada (ex.: matrícula de outro cliente) é respondida na conversa, sem perder o estado.
import { BotState, ConsentType, globalCommandOf, isGreeting, optionNumber, yesNo } from '../../domain/conversation.js';
import { parseCustomerName } from '../../domain/customer.js';
import { addDays, localDateOf } from '../../domain/business-time.js';
import { DomainError, NotFoundError } from '../../domain/errors.js';
import { parsePlate } from '../../domain/plate.js';
import { ACTIVE_WASH_STATUSES, WashPaymentState, WashStatus } from '../../domain/wash.js';
import { date, MENU_TEXT, money, numberedList, plate, time, washStatusLine, washSummary } from './format.js';

const CHANNEL = 'simulador';
const SLOTS_SHOWN = 8;
const Intent = Object.freeze({ QUEUE: 'queue', APPOINTMENT: 'appointment' });
const HISTORY_SIZE = 5;
const PAYABLE_STATES = [WashPaymentState.UNPAID, WashPaymentState.DELIVERED_UNPAID];
const CLASS_OPTIONS = [
  ['A', 'ligeiros (hatchback, sedan)'],
  ['B', 'SUV, 4x4, pickups'],
  ['C', 'vans e minibus'],
];

const outcome = (state, context, ...replies) => ({ state, context, replies: replies.flat().filter(Boolean) });

export class WhatsAppAssistant {
  #services;
  #businessName;

  constructor(services) {
    this.#services = services;
    this.#businessName = services.settingsService.get('business.name', 'Lava Já');
  }

  /** @returns {{ replies: string[], state: string, context: object, customerId?: number }} */
  respond(thread, text) {
    const customer = this.#customerOf(thread);
    const session = { thread, text, context: thread.botContext ?? {}, customer };
    let result;
    try {
      result = this.#dispatch(session);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      result = outcome(thread.botState, session.context, `⚠️ ${error.message}`, 'Tente de novo ou escreva *MENU*.');
    }
    return { customerId: customer?.id, ...result };
  }

  #dispatch(session) {
    const command = globalCommandOf(session.text);
    if (command === 'STOP_MARKETING' && session.customer) return this.#stopMarketing(session);
    if (command === 'JOIN_LOYALTY' && session.customer) return this.#joinLoyalty(session);
    if (command === 'MENU' && session.customer) return this.#menu();
    if (command === 'START_WASH' && session.customer) return this.#startQueue(session, Intent.QUEUE);
    if (command === 'STATUS' && session.customer) return this.#status(session);
    if ((command === 'ACCEPT_OFFER' || command === 'KEEP_OFFER') && session.customer) {
      return this.#answerOffer(session, command === 'ACCEPT_OFFER');
    }

    const handlers = {
      [BotState.START]: () => this.#start(session),
      [BotState.ASK_NAME]: () => this.#askName(session),
      [BotState.ASK_CONSENTS]: () => this.#askConsents(session),
      [BotState.MENU]: () => this.#menuOption(session),
      [BotState.CHOOSE_VEHICLE]: () => this.#chooseVehicle(session),
      [BotState.ASK_PLATE]: () => this.#askPlate(session),
      [BotState.ASK_CLASS]: () => this.#askClass(session),
      [BotState.CHOOSE_PLAN]: () => this.#choosePlan(session),
      [BotState.CONFIRM_BENEFIT]: () => this.#confirmBenefit(session),
      [BotState.CHOOSE_DAY]: () => this.#chooseDay(session),
      [BotState.CHOOSE_SLOT]: () => this.#chooseSlot(session),
      [BotState.CHOOSE_PAY]: () => this.#choosePay(session),
      [BotState.CONFIRM_PAY]: () => this.#confirmPay(session),
    };
    const handler = session.customer || this.#isOnboarding(session.thread) ? handlers[session.thread.botState] : null;
    return (handler ?? (() => this.#start(session)))();
  }

  // ---------- Boas-vindas e registo ----------

  #start({ customer }) {
    if (customer) return outcome(BotState.MENU, {}, `Olá, ${customer.name}! Bem-vindo de volta à ${this.#businessName}.`, MENU_TEXT);
    return outcome(
      BotState.ASK_NAME,
      {},
      `Olá! Bem-vindo à *${this.#businessName}* 🚗💧`,
      'Esta conversa é uma *simulação*: não há mensagens nem pagamentos reais.',
      'Como se chama?',
    );
  }

  #askName({ text }) {
    const name = parseCustomerName(text);
    return outcome(BotState.ASK_CONSENTS, { name, step: ConsentType.LOYALTY }, this.#consentQuestion(ConsentType.LOYALTY, name));
  }

  #consentQuestion(type, name) {
    if (type === ConsentType.LOYALTY) {
      return `Prazer, ${name}! Quer participar no *programa de fidelização*? Acumula lavagens e ganha benefícios.\n*1* Sim\n*2* Não`;
    }
    return 'Aceita receber *ofertas* da lavadora por aqui? Pode responder *PARAR* a qualquer momento.\n*1* Sim\n*2* Não';
  }

  #askConsents({ thread, text, context }) {
    const answer = yesNo(text);
    if (answer === null) return outcome(BotState.ASK_CONSENTS, context, 'Responda *1* (Sim) ou *2* (Não).');
    if (context.step === ConsentType.LOYALTY) {
      return outcome(BotState.ASK_CONSENTS, { ...context, loyalty: answer, step: ConsentType.MARKETING }, this.#consentQuestion(ConsentType.MARKETING));
    }
    const { customerService } = this.#services;
    const customer = customerService.register({
      phone: thread.phone,
      name: context.name,
      consents: { loyalty: context.loyalty, marketing: answer, source: CHANNEL },
    });
    return { ...outcome(BotState.MENU, {}, `Obrigado, ${customer.name}! O seu registo está feito.`, MENU_TEXT), customerId: customer.id };
  }

  #stopMarketing({ thread, customer, context }) {
    this.#services.consentService.record(customer.id, { type: ConsentType.MARKETING, granted: false, source: CHANNEL });
    return outcome(thread.botState, context, 'Não vai receber mais ofertas. Pode continuar a usar o menu normalmente.');
  }

  #joinLoyalty({ thread, customer, context }) {
    this.#services.consentService.record(customer.id, { type: ConsentType.LOYALTY, granted: true, source: CHANNEL });
    return outcome(thread.botState, context, 'Bem-vindo ao programa de fidelização! As próximas lavagens pagas já contam.');
  }

  // ---------- Menu ----------

  #menu() {
    return outcome(BotState.MENU, {}, MENU_TEXT);
  }

  #menuOption(session) {
    const options = [
      () => this.#plansAndPrices(),
      () => this.#startQueue(session, Intent.QUEUE),
      () => this.#startQueue(session, Intent.APPOINTMENT),
      () => this.#status(session),
      () => this.#startPayment(session),
      () => this.#history(session),
      () => this.#loyalty(session),
    ];
    const option = optionNumber(session.text, options.length);
    if (option) return options[option - 1]();
    if (isGreeting(session.text)) return this.#start(session);
    return outcome(BotState.MENU, {}, 'Não percebi. Responda com o número da opção.', MENU_TEXT);
  }

  #plansAndPrices() {
    const lines = this.#services.catalogService
      .listPlans()
      .filter((plan) => plan.active)
      .map((plan) => {
        const prices = plan.prices.map((p) => `${p.classCode} ${money(p.priceCents, p.currency)}`).join(' · ');
        return `*${plan.name}* (${plan.baseDurationMin} min)\n${prices}`;
      });
    return outcome(BotState.MENU, {}, ['*Planos e preços* (por classe de viatura)', ...lines].join('\n\n'), 'Escreva *2* para entrar na fila.');
  }

  // ---------- Entrar na fila ----------

  /** Entrar na fila (2) ou marcar horário (3): escolhe a viatura e depois o plano. */
  #startQueue({ customer }, intent) {
    if (customer.vehicles.length === 0) return outcome(BotState.ASK_PLATE, { intent }, 'Qual é a matrícula da viatura?');
    const vehicles = customer.vehicles.map((v) => `${plate(v.plate)} (classe ${v.classCode})`);
    return outcome(
      BotState.CHOOSE_VEHICLE,
      { intent, vehicleIds: customer.vehicles.map((v) => v.id) },
      `Que viatura?\n${numberedList([...vehicles, 'Outra viatura'])}`,
    );
  }

  #chooseVehicle({ text, context, customer }) {
    const option = optionNumber(text, context.vehicleIds.length + 1);
    if (!option) return outcome(BotState.CHOOSE_VEHICLE, context, 'Responda com o número da viatura.');
    if (option > context.vehicleIds.length) return outcome(BotState.ASK_PLATE, { intent: context.intent }, 'Qual é a matrícula da viatura?');
    const vehicle = customer.vehicles.find((v) => v.id === context.vehicleIds[option - 1]);
    return this.#offerPlans(vehicle, context.intent);
  }

  #askPlate({ text, context }) {
    const plateNumber = parsePlate(text);
    const options = CLASS_OPTIONS.map(([code, label]) => `Classe ${code} — ${label}`);
    return outcome(
      BotState.ASK_CLASS,
      { intent: context.intent, plate: plateNumber },
      `Qual é a classe de ${plate(plateNumber)}?\n${numberedList(options)}`,
    );
  }

  #askClass({ text, context, customer }) {
    const option = optionNumber(text, CLASS_OPTIONS.length);
    if (!option) return outcome(BotState.ASK_CLASS, context, 'Responda *1*, *2* ou *3*.');
    const { vehicle } = this.#services.customerService.addVehicle(customer.id, {
      plate: context.plate,
      classId: CLASS_OPTIONS[option - 1][0],
    });
    return this.#offerPlans(vehicle, context.intent);
  }

  #offerPlans(vehicle, intent = Intent.QUEUE) {
    const plans = this.#services.catalogService.listPlans({ classRef: vehicle.classCode }).filter((plan) => plan.unavailableReason === null);
    const lines = plans.map((plan) => `${plan.name} · ${money(plan.priceForClass.priceCents, plan.priceForClass.currency)}`);
    return outcome(
      BotState.CHOOSE_PLAN,
      { intent, vehicleId: vehicle.id, classCode: vehicle.classCode, planIds: plans.map((plan) => plan.id) },
      `Planos para ${plate(vehicle.plate)} (classe ${vehicle.classCode}):\n${numberedList(lines)}`,
    );
  }

  #choosePlan({ text, context, customer }) {
    const option = optionNumber(text, context.planIds.length);
    if (!option) return outcome(BotState.CHOOSE_PLAN, context, 'Responda com o número do plano.');
    const chosen = { ...context, planId: context.planIds[option - 1] };
    if (context.intent === Intent.APPOINTMENT) {
      return outcome(BotState.CHOOSE_DAY, chosen, `Para que dia?\n${numberedList(['Hoje', 'Amanhã'])}`);
    }
    const card = this.#services.loyaltyService.card(customer.id);
    const progress = card.consent.granted ? card.classes.find((c) => c.classCode === context.classCode) : null;
    if (progress?.benefitsAvailable > 0) {
      return outcome(
        BotState.CONFIRM_BENEFIT,
        chosen,
        `Tem ${progress.benefitsAvailable} benefício(s) de fidelização na classe ${context.classCode}. Usar agora?\n*1* Sim\n*2* Não`,
      );
    }
    return this.#enqueue(customer, chosen, false);
  }

  #confirmBenefit({ text, context, customer }) {
    const answer = yesNo(text);
    if (answer === null) return outcome(BotState.CONFIRM_BENEFIT, context, 'Responda *1* (Sim) ou *2* (Não).');
    return this.#enqueue(customer, context, answer);
  }

  #enqueue(customer, { vehicleId, planId }, useBenefit) {
    const wash = this.#services.washService.register({ vehicleId, planId, useBenefit, source: CHANNEL, actor: customer.name });
    const benefit = wash.loyaltyBenefitCents > 0 ? `Benefício aplicado: −${money(wash.loyaltyBenefitCents, wash.currency)}` : null;
    return outcome(BotState.MENU, {}, ['Está na fila ✅', washStatusLine(wash), benefit].filter(Boolean).join('\n'), 'Avisamos quando começar e quando estiver pronto. As horas são estimativas.');
  }

  // ---------- Marcar horário (cap. 12) ----------

  #chooseDay({ text, context, customer }) {
    const option = optionNumber(text, 2);
    if (!option) return outcome(BotState.CHOOSE_DAY, context, 'Responda *1* (Hoje) ou *2* (Amanhã).');
    const { appointmentService } = this.#services;
    const day = addDays(appointmentService.today(), option - 1);
    const slots = appointmentService
      .availability({ date: day, planId: context.planId, classRef: context.classCode })
      .slice(0, SLOTS_SHOWN);
    if (slots.length === 0) {
      return outcome(BotState.CHOOSE_DAY, context, `Não há horários livres ${option === 1 ? 'hoje' : 'amanhã'}. Escolha outro dia ou escreva *MENU*.`);
    }
    return outcome(
      BotState.CHOOSE_SLOT,
      { ...context, slots: slots.map((slot) => slot.startsAt) },
      `Horários livres (${date(slots[0].startsAt)}):\n${numberedList(slots.map((slot) => time(slot.startsAt)))}`,
    );
  }

  #chooseSlot({ text, context, customer }) {
    const option = optionNumber(text, context.slots.length);
    if (!option) return outcome(BotState.CHOOSE_SLOT, context, 'Responda com o número do horário.');
    // O aviso "Marcação registada" chega como mensagem do sistema.
    this.#services.appointmentService.book({
      vehicleId: context.vehicleId,
      planId: context.planId,
      startsAt: context.slots[option - 1],
      source: CHANNEL,
      actor: customer.name,
    });
    return outcome(BotState.MENU, {}, 'Obrigado! Se surgir um horário mais cedo, perguntamos antes de mudar.');
  }

  #answerOffer({ customer }, accept) {
    const appointment = this.#services.appointmentService.respondToPendingOffer(customer.id, { accept, actor: customer.name });
    const reply = accept ? 'Feito ✅' : `Mantém-se a marcação às ${time(appointment.startsAt)} de ${date(appointment.startsAt)}.`;
    return outcome(BotState.MENU, {}, reply);
  }

  // ---------- Estado, pagamento, histórico, fidelização ----------

  #status({ customer }) {
    const active = this.#services.washService.list({ customerId: customer.id, statuses: [...ACTIVE_WASH_STATUSES] });
    const appointments = this.#services.appointmentService.upcomingForCustomer(customer.id);
    if (active.length === 0 && appointments.length === 0) {
      return outcome(BotState.MENU, {}, 'Não tem serviços em curso nem marcações. Escreva *2* para entrar na fila ou *3* para marcar.');
    }
    const sections = [];
    if (active.length) sections.push(['*Os seus serviços*', ...active.map(washStatusLine)].join('\n\n'));
    if (appointments.length) {
      const lines = appointments.map(
        (a) => `${date(a.startsAt)} às ${time(a.startsAt)} · ${plate(a.plate)} · ${a.planName} · ${a.status === 'requested' ? 'por confirmar' : 'confirmada'}`,
      );
      sections.push(['*As suas marcações*', ...lines].join('\n'));
    }
    return outcome(BotState.MENU, {}, sections.join('\n\n'));
  }

  #startPayment({ customer }) {
    const payable = this.#payableWashes(customer.id);
    if (payable.length === 0) return outcome(BotState.MENU, {}, 'Não tem serviços por pagar.');
    if (payable.length === 1) return this.#askPaymentConfirmation(payable[0]);
    return outcome(
      BotState.CHOOSE_PAY,
      { washIds: payable.map((wash) => wash.id) },
      `Que serviço quer pagar?\n${numberedList(payable.map(washSummary))}`,
    );
  }

  #choosePay({ text, context, customer }) {
    const option = optionNumber(text, context.washIds.length);
    if (!option) return outcome(BotState.CHOOSE_PAY, context, 'Responda com o número do serviço.');
    const wash = this.#payableWashes(customer.id).find((candidate) => candidate.id === context.washIds[option - 1]);
    return wash ? this.#askPaymentConfirmation(wash) : outcome(BotState.MENU, {}, 'Esse serviço já não está por pagar.');
  }

  #askPaymentConfirmation(wash) {
    return outcome(
      BotState.CONFIRM_PAY,
      { washId: wash.id },
      `Pagar *${money(wash.finalPriceCents, wash.currency)}* de ${washSummary(wash)}?\n(pagamento digital *simulado*)\n*1* Confirmar\n*2* Cancelar`,
    );
  }

  #confirmPay({ thread, text, context, customer }) {
    const answer = yesNo(text);
    if (answer === null) return outcome(BotState.CONFIRM_PAY, context, 'Responda *1* (Confirmar) ou *2* (Cancelar).');
    if (!answer) return outcome(BotState.MENU, {}, 'Pagamento cancelado.');
    const { washService, paymentService } = this.#services;
    const wash = washService.get(context.washId);
    const { payment } = paymentService.startDigital(wash.id, {
      amountCents: wash.finalPriceCents,
      // Uma chave por pedido de confirmação: a mesma resposta repetida não paga duas vezes.
      idempotencyKey: `simulador:${thread.id}:${wash.id}:${thread.updatedAt}`,
      actor: customer.name,
    });
    paymentService.simulate(payment.id, 'confirmed');
    // A confirmação chega como aviso do sistema (antes desta resposta).
    return outcome(BotState.MENU, {}, 'Obrigado! Escreva *MENU* para voltar ao menu.');
  }

  /** Por pagar: primeiro os serviços em curso, depois os entregues sem pagamento, mais recentes primeiro. */
  #payableWashes(customerId) {
    const inYard = (wash) => ACTIVE_WASH_STATUSES.includes(wash.status);
    return this.#services.washService
      .list({ customerId })
      .filter((wash) => wash.status !== WashStatus.CANCELLED && PAYABLE_STATES.includes(wash.paymentState))
      .sort((a, b) => Number(inYard(b)) - Number(inYard(a)) || b.queuedAt.localeCompare(a.queuedAt));
  }

  #history({ customer }) {
    const done = this.#services.washService
      .list({ customerId: customer.id, statuses: [WashStatus.COMPLETED] })
      .slice(-HISTORY_SIZE)
      .reverse();
    if (done.length === 0) return outcome(BotState.MENU, {}, 'Ainda não tem lavagens concluídas.');
    const lines = done.map((wash) => `${date(wash.completedAt)} · ${plate(wash.plate)} · ${wash.planName} · ${money(wash.finalPriceCents, wash.currency)}`);
    return outcome(BotState.MENU, {}, [`*Últimas ${done.length} lavagens*`, ...lines].join('\n'));
  }

  #loyalty({ customer }) {
    const card = this.#services.loyaltyService.card(customer.id);
    if (!card.consent.granted) {
      return outcome(BotState.MENU, {}, 'Não participa no programa de fidelização. Para aderir, escreva *ADERIR*.');
    }
    const classesInUse = new Set(customer.vehicles.map((v) => v.classCode));
    const lines = card.classes
      .filter((c) => classesInUse.has(c.classCode) || c.eligibleWashes > 0 || c.benefitsAvailable > 0)
      .map((c) => `*Classe ${c.classCode}*: ${c.progressInCycle}/${c.cycleSize} lavagens · nível ${c.level} · benefícios: ${c.benefitsAvailable}`);
    const note = card.rules.toValidate ? '_Regras de demonstração, por validar._' : null;
    return outcome(BotState.MENU, {}, ['*O seu cartão de fidelização*', ...(lines.length ? lines : ['Ainda sem lavagens elegíveis.']), note].filter(Boolean).join('\n'));
  }

  // ---------- Auxiliares ----------

  /** O cliente da conversa; reconhece pelo telefone quem foi registado no Pátio depois de a conversa começar. */
  #customerOf(thread) {
    const { customerService } = this.#services;
    if (thread.customerId) return customerService.get(thread.customerId);
    try {
      return customerService.findByPhone(thread.phone);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  #isOnboarding(thread) {
    return [BotState.ASK_NAME, BotState.ASK_CONSENTS].includes(thread.botState);
  }

}
