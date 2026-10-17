import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

const NEW_PHONE = '258849990001';
const AMELIA_PHONE = '258845550101';

describe('API do simulador de WhatsApp (I-5)', () => {
  let t;
  const messages = (phone, after = 0) => t.api('GET', `/api/simulator/threads/${phone}/messages?after=${after}`);
  /** Envia uma mensagem e devolve o texto das respostas (sem a mensagem enviada). */
  async function say(phone, text) {
    const res = await t.api('POST', `/api/simulator/threads/${phone}/messages`, { text });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.messages.filter((m) => m.direction === 'out').map((m) => m.body).join('\n');
  }
  const threadState = async (phone) => (await messages(phone)).body.thread.state;

  before(async () => {
    t = await startTestServer();
  });
  after(() => t.close());

  describe('conversas', () => {
    it('um número sem conversa devolve uma conversa vazia', async () => {
      const res = await messages('258849990001');
      assert.equal(res.status, 200);
      assert.equal(res.body.thread, null);
      assert.deepEqual(res.body.messages, []);
    });

    it('normaliza o número do endereço', async () => {
      const res = await t.api('GET', `/api/simulator/threads/${encodeURIComponent('84 999 0001')}/messages`);
      assert.equal(res.body.phone, '258849990001');
    });

    it('recusa um número inválido', async () => {
      const res = await messages('12345');
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details.field, 'phone');
    });

    it('lista as conversas', async () => {
      const res = await t.api('GET', '/api/simulator/threads');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.threads));
    });
  });

  describe('assistente (cap. 15.6)', () => {
    it('regista um cliente novo com nome e consentimentos separados', async () => {
      assert.match(await say(NEW_PHONE, 'Olá'), /simulação[\s\S]*Como se chama/);
      assert.match(await say(NEW_PHONE, 'X'), /⚠️ O nome deve ter/);
      assert.equal(await threadState(NEW_PHONE), 'ASK_NAME');
      assert.match(await say(NEW_PHONE, 'Teresa Langa'), /programa de fidelização/);
      assert.match(await say(NEW_PHONE, 'talvez'), /Responda \*1\*/);
      assert.match(await say(NEW_PHONE, '1'), /ofertas/);
      const done = await say(NEW_PHONE, '2');
      assert.match(done, /Obrigado, Teresa Langa[\s\S]*\*Menu\*/);

      const customerId = demoIds(t.db).customer(NEW_PHONE);
      assert.ok(customerId);
      const consents = t.services.consentService.current(customerId);
      assert.deepEqual([consents.loyalty.granted, consents.marketing.granted], [true, false]);
      assert.equal(consents.loyalty.source, 'simulador');
    });

    it('mostra os planos e preços por classe', async () => {
      const reply = await say(NEW_PHONE, '1');
      assert.match(reply, /\*Completa\* \(50 min\)\nA 450,00 MZN · B 600,00 MZN · C 750,00 MZN/);
      assert.doesNotMatch(reply, /Polimento/);
    });

    it('entra na fila com uma viatura nova', async () => {
      assert.match(await say(NEW_PHONE, '2'), /matrícula/);
      assert.match(await say(NEW_PHONE, 'abc 999 mp'), /classe de ABC 999 MP/);
      assert.match(await say(NEW_PHONE, '1'), /Planos para ABC 999 MP \(classe A\)[\s\S]*\*1\* Simples · 250,00 MZN/);
      const reply = await say(NEW_PHONE, '1');
      assert.match(reply, /Está na fila ✅\nLJ-\d{4} · ABC 999 MP · Simples · 250,00 MZN\nEm fila: posição \d+ · início estimado \d{2}:\d{2}/);
      const [wash] = t.services.washService.list({ customerId: demoIds(t.db).customer(NEW_PHONE) });
      assert.deepEqual([wash.source, wash.createdBy], ['simulador', 'Teresa Langa']);
    });

    it('mostra o estado dos serviços em curso', async () => {
      assert.match(await say(NEW_PHONE, '4'), /\*Os seus serviços\*[\s\S]*ABC 999 MP[\s\S]*Em fila/);
    });

    it('paga em digital simulado, com confirmação', async () => {
      assert.match(await say(NEW_PHONE, '5'), /Pagar \*250,00 MZN\*[\s\S]*simulado/);
      assert.equal(await threadState(NEW_PHONE), 'CONFIRM_PAY');
      assert.match(await say(NEW_PHONE, '1'), /💳 Pagamento digital confirmado \(simulado\): 250,00 MZN[\s\S]*Obrigado!/);
      const [wash] = t.services.washService.list({ customerId: demoIds(t.db).customer(NEW_PHONE) });
      assert.equal(wash.paymentState, 'paid_digital');
      assert.match(await say(NEW_PHONE, '5'), /Não tem serviços por pagar/);
    });

    it('mostra o cartão de fidelização', async () => {
      assert.match(await say(NEW_PHONE, '7'), /cartão de fidelização[\s\S]*\*Classe A\*: 0\/10 lavagens · nível 1 · benefícios: 0[\s\S]*por validar/);
    });

    it('MENU volta ao início em qualquer ponto; opções desconhecidas são explicadas', async () => {
      await say(NEW_PHONE, '2');
      assert.equal(await threadState(NEW_PHONE), 'CHOOSE_VEHICLE');
      assert.match(await say(NEW_PHONE, 'menu'), /\*Menu\*/);
      assert.equal(await threadState(NEW_PHONE), 'MENU');
      assert.match(await say(NEW_PHONE, '9'), /Não percebi/);
    });

    it('uma regra violada é respondida na conversa sem perder o passo', async () => {
      await say(NEW_PHONE, '2');
      await say(NEW_PHONE, '2'); // outra viatura
      await say(NEW_PHONE, 'ACX 731 MC'); // é da Amélia
      const reply = await say(NEW_PHONE, '2');
      assert.match(reply, /⚠️ Esta matrícula já está registada noutro cliente/);
      assert.equal(await threadState(NEW_PHONE), 'ASK_CLASS');
      await say(NEW_PHONE, 'MENU');
    });

    it('PARAR retira o consentimento de marketing', async () => {
      assert.match(await say(NEW_PHONE, 'PARAR'), /Não vai receber mais ofertas/);
      assert.equal(t.services.consentService.current(demoIds(t.db).customer(NEW_PHONE)).marketing.granted, false);
    });

    it('reconhece um cliente existente e oferece o benefício disponível', async () => {
      assert.match(await say(AMELIA_PHONE, 'Olá'), /Olá, Amélia Macuácua![\s\S]*\*Menu\*/);
      assert.match(await say(AMELIA_PHONE, '2'), /\*1\* ACX 731 MC \(classe B\)/);
      await say(AMELIA_PHONE, '1');
      assert.match(await say(AMELIA_PHONE, '2'), /Tem 1 benefício\(s\) de fidelização na classe B/);
      const reply = await say(AMELIA_PHONE, '1');
      assert.match(reply, /Completa · 250,00 MZN[\s\S]*Benefício aplicado: −350,00 MZN/);
    });

    it('as conversas ficam isoladas por número e por ordem estável', async () => {
      const own = (await messages(NEW_PHONE)).body.messages;
      const other = (await messages(AMELIA_PHONE)).body.messages;
      assert.ok(own.every((m) => !/Amélia/.test(m.body)));
      assert.ok(other.every((m) => !/Teresa/.test(m.body)));
      const ids = own.map((m) => m.id);
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
      const lastId = ids.at(-1);
      assert.deepEqual((await messages(NEW_PHONE, lastId)).body.messages, []);
    });

    it('recusa mensagens vazias', async () => {
      const res = await t.api('POST', `/api/simulator/threads/${NEW_PHONE}/messages`, { text: '   ' });
      assert.equal(res.status, 400);
    });
  });

  describe('avisos automáticos (cap. 8.1)', () => {
    const PHONE = '258869990002';
    const systemMessages = async (phone, after) =>
      (await messages(phone, after)).body.messages.filter((m) => m.kind === 'system').map((m) => m.body);
    const lastId = async (phone) => (await messages(phone)).body.messages.at(-1).id;

    it('acompanha um serviço do Pátio até à entrega, com progresso de fidelização', async () => {
      // Cliente e serviço registados no Pátio; a conversa é criada pelo primeiro aviso.
      const { customer } = (
        await t.api('POST', '/api/customers', { phone: PHONE, name: 'Rui Bila', vehicles: [{ plate: 'AFR 100 MP', classId: 'A' }] })
      ).body;
      const { wash } = (await t.api('POST', '/api/washes', { vehicleId: customer.vehicles[0].id, planId: demoIds(t.db).plan('SIMPLES') })).body;
      const station = demoIds(t.db).station('P3');

      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'in_progress', stationId: station });
      assert.match((await systemMessages(PHONE)).at(-1), new RegExp(`🚿 AFR 100 MP começou a ser lavado no posto P3 \\(${wash.code}\\)\\. Conclusão estimada: \\d{2}:\\d{2}`));

      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'ready' });
      assert.match((await systemMessages(PHONE)).at(-1), /✅ AFR 100 MP está pronto! Valor: 250,00 MZN\. Pode pagar aqui/);

      await t.api(
        'POST',
        `/api/washes/${wash.id}/payments/cash`,
        { amountCents: 25000, declaredBy: 'Bento', confirm: true },
        { 'Idempotency-Key': 'aviso-cash' },
      );
      assert.equal((await systemMessages(PHONE)).at(-1), `💵 Numerário declarado por Bento: 250,00 MZN · ${wash.code}.`);

      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'completed' });
      assert.equal((await systemMessages(PHONE)).at(-1), `Obrigado! ${wash.code} entregue.\nFidelização classe A: 1/10 lavagens.`);
    });

    it('os avisos são mensagens do sistema, distintas das respostas', async () => {
      const all = (await messages(PHONE)).body.messages;
      assert.ok(all.length >= 4);
      assert.ok(all.every((m) => m.kind === 'system' && m.direction === 'out'));
      assert.equal((await messages(PHONE)).body.thread.state, 'START');
    });

    it('o cliente que chega por um aviso é cumprimentado pelo nome', async () => {
      assert.match(await say(PHONE, 'Olá'), /Olá, Rui Bila!/);
    });

    it('o pagamento feito na conversa também é avisado, uma única vez', async () => {
      const { customer } = (await t.api('GET', `/api/customers?phone=${PHONE}`)).body;
      await t.api('POST', '/api/washes', { vehicleId: customer.vehicles[0].id, planId: demoIds(t.db).plan('SIMPLES') });
      const before = await lastId(PHONE);
      await say(PHONE, '5');
      const reply = await say(PHONE, '1');
      assert.match(reply, /💳 Pagamento digital confirmado \(simulado\): 250,00 MZN[\s\S]*Obrigado!/);
      const confirmations = (await systemMessages(PHONE, before)).filter((body) => body.startsWith('💳'));
      assert.equal(confirmations.length, 1);
    });

    it('a lavagem que fecha um ciclo anuncia o benefício ganho', async () => {
      const ids = demoIds(t.db);
      const carlosPhone = '258825550102';
      const { wash } = (await t.api('POST', '/api/washes', { vehicleId: ids.vehicle('AHM482MP'), planId: ids.plan('SIMPLES') })).body;
      const free = (await t.api('GET', '/api/stations')).body.stations.find((s) => s.state === 'free').id;
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'in_progress', stationId: free });
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'ready' });
      await t.api(
        'POST',
        `/api/washes/${wash.id}/payments/cash`,
        { amountCents: 25000, declaredBy: 'Amílcar', confirm: true },
        { 'Idempotency-Key': 'aviso-carlos' },
      );
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'completed' });
      assert.match((await systemMessages(carlosPhone)).at(-1), /Fidelização classe A: 0\/10 lavagens\.\n🎁 Ganhou 1 benefício\(s\): lavagem Simples gratuita\./);
    });
  });

  describe('marcações pela conversa (I-8)', () => {
    const PHONE = '258849990003';
    const register = async () => {
      await say(PHONE, 'Olá');
      await say(PHONE, 'Sónia Pires');
      await say(PHONE, '1');
      await say(PHONE, '1');
    };

    it('marca um horário: viatura, plano, dia e horário livre', async () => {
      await register();
      assert.match(await say(PHONE, '3'), /matrícula/);
      await say(PHONE, 'AKL 300 MP');
      await say(PHONE, '1'); // classe A
      assert.match(await say(PHONE, '2'), /Para que dia/); // Completa
      const slots = await say(PHONE, '2'); // amanhã
      assert.match(slots, /Horários livres \(23\/10\):\n\*1\* 07:00/);
      const reply = await say(PHONE, '1');
      assert.match(reply, /📅 Marcação registada: 23\/10 às 07:00 · AKL 300 MP · Completa\. Aguarda confirmação[\s\S]*Obrigado!/);
      assert.match(await say(PHONE, '4'), /\*As suas marcações\*\n23\/10 às 07:00 · AKL 300 MP · Completa · por confirmar/);
    });

    it('responde a uma proposta mais cedo com ACEITAR ou MANTER', async () => {
      const [appointment] = (await t.api('GET', '/api/appointments?date=2026-10-23')).body.appointments.filter((a) => a.vehicle.plate === 'AKL300MP');
      await t.api('POST', `/api/appointments/${appointment.id}/transitions`, { to: 'confirmed' });
      // Remarca para mais tarde só para o teste ter um horário mais cedo a propor: cancelar e marcar de novo.
      await t.api('POST', `/api/appointments/${appointment.id}/transitions`, { to: 'cancelled', reason: 'Teste: remarcar' });
      const later = (
        await t.api('POST', '/api/appointments', { vehicleId: appointment.vehicle.id, planId: appointment.plan.id, startsAt: '2026-10-23T10:00:00.000Z' })
      ).body.appointment;
      await t.api('POST', `/api/appointments/${later.id}/transitions`, { to: 'confirmed' });

      await t.api('POST', `/api/appointments/${later.id}/offers`, { proposedStartsAt: '2026-10-23T06:00:00.000Z' });
      assert.match(await say(PHONE, 'MANTER'), /Mantém-se a marcação às 12:00 de 23\/10/);
      assert.equal((await t.api('GET', `/api/appointments/${later.id}`)).body.appointment.startsAt, '2026-10-23T10:00:00.000Z');

      await t.api('POST', `/api/appointments/${later.id}/offers`, { proposedStartsAt: '2026-10-23T06:30:00.000Z' });
      assert.match(await say(PHONE, 'aceitar'), /Marcação alterada a seu pedido: 12:00 → 23\/10 às 08:30[\s\S]*Feito/);
      assert.match(await say(PHONE, 'ACEITAR'), /⚠️ Não tem propostas de horário/);
    });
  });
});
