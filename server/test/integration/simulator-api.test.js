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
      assert.match(await say(NEW_PHONE, '1'), /Pedido de pagamento enviado/);
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
});
