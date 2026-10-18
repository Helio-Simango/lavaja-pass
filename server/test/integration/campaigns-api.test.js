import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from '../helpers.js';

// Na base compacta, aceitam ofertas a Amélia, a Fátima e o Paulo; o Carlos, o Jorge e a Luísa não.
// O relógio avança 20 dias para todos ficarem sem lavar há 14+ dias.
describe('Campanhas fora de pico (M11 → M5)', () => {
  let t;
  const AMELIA = '258845550101';
  const messages = async (phone) => (await t.api('GET', `/api/simulator/threads/${phone}/messages`)).body.messages;
  const say = (phone, text) => t.api('POST', `/api/simulator/threads/${phone}/messages`, { text });

  before(async () => {
    t = await startTestServer();
    t.clock.advanceMinutes(20 * 24 * 60);
  });
  after(() => t.close());

  it('a pré-visualização propõe o segmento e a mensagem, sem telefones', async () => {
    const res = await t.api('GET', '/api/campaigns/preview');
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 3);
    assert.equal(res.body.excluded.noConsent, 3);
    assert.deepEqual(res.body.policy, { minInactiveDays: 14, cooldownDays: 7, attributionDays: 7 });
    assert.deepEqual(res.body.offers.filter((o) => o.available).map((o) => o.type), ['off_peak_invitation']);
    assert.ok(!JSON.stringify(res.body).includes('2588'));
  });

  it('só o gestor envia, e só com confirmação explícita', async () => {
    assert.equal((await t.api('POST', '/api/campaigns', { confirm: true }, t.as('operator', 'Amílcar'))).status, 403);
    assert.equal((await t.api('GET', '/api/campaigns/preview', undefined, t.as('bank_analyst'))).status, 403);
    assert.equal((await t.api('POST', '/api/campaigns', {})).body.error.details.field, 'confirm');
    assert.equal((await t.api('POST', '/api/campaigns', { offerType: 'price_discount', confirm: true })).status, 400);
  });

  it('envia a cada cliente do segmento uma mensagem na conversa, com forma de sair', async () => {
    const res = await t.api('POST', '/api/campaigns', { confirm: true });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.campaign.recipientsCount, res.body.campaign.sentBy], [3, 'Z. Cossa']);
    const last = (await messages(AMELIA)).at(-1);
    assert.equal(last.kind, 'text');
    assert.match(last.body, /^Olá Amélia! Já lá vão \d+ dias desde a última lavagem do ACX 731 MC/);
    assert.match(last.body, /\*LAVAR\*[\s\S]*\*PARAR\*/);
    assert.equal((await messages('258825550102')).some((m) => /Já lá vão/.test(m.body)), false); // o Carlos não aceitou ofertas
  });

  it('não repete a campanha ao mesmo cliente em 7 dias', async () => {
    const res = await t.api('POST', '/api/campaigns', { confirm: true });
    assert.equal(res.body.error.code, 'EMPTY_SEGMENT');
    assert.equal((await t.api('GET', '/api/campaigns/preview')).body.excluded.recentlyContacted, 3);
  });

  it('LAVAR na resposta entra na fila; o resultado conta as lavagens até 7 dias depois', async () => {
    const reply = await say(AMELIA, 'LAVAR');
    assert.match(reply.body.messages.at(-1).body, /Que viatura\?[\s\S]*ACX 731 MC/);
    await say(AMELIA, '1'); // viatura
    await say(AMELIA, '1'); // plano Simples
    const queued = await say(AMELIA, '2'); // não usa o benefício agora
    assert.match(queued.body.messages.map((m) => m.body).join('\n'), /posição/i);
    const [campaign] = (await t.api('GET', '/api/campaigns')).body.campaigns;
    assert.deepEqual([campaign.result.washes, campaign.result.customers], [1, 1]);
  });

  it('PARAR retira o consentimento: deixa de entrar nos segmentos', async () => {
    await say('258845550106', 'PARAR');
    t.clock.advanceMinutes(8 * 24 * 60);
    const preview = (await t.api('GET', '/api/campaigns/preview')).body;
    assert.equal(preview.excluded?.noConsent, 4, JSON.stringify(preview));
  });

  it('uma campanha enviada não se altera', () => {
    assert.throws(() => t.db.prepare("UPDATE campaigns SET sent_by = 'outro'").run(), /só aceita novos registos/);
    assert.throws(() => t.db.prepare('DELETE FROM campaign_recipients').run(), /só aceita novos registos/);
  });
});
