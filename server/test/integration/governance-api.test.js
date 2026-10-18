import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { demoIds, startTestServer } from '../helpers.js';

describe('Consentimentos, registo de alterações e fecho do dia (I-9)', () => {
  let t;
  let ids;
  const amelia = () => ids.customer('258845550101');
  const card = async (id) => (await t.api('GET', `/api/customers/${id}/loyalty`)).body.loyalty;
  const freeStation = async () => (await t.api('GET', '/api/stations')).body.stations.find((s) => s.state === 'free').id;

  before(async () => {
    t = await startTestServer();
    ids = demoIds(t.db);
  });
  after(() => t.close());

  describe('consentimentos (cap. 14.2)', () => {
    it('mostra os consentimentos em vigor, separados', async () => {
      const res = await t.api('GET', `/api/customers/${amelia()}/consents`);
      assert.deepEqual([res.body.consents.loyalty.granted, res.body.consents.marketing.granted], [true, true]);
      assert.equal(res.body.consents.loyalty.source, 'balcão');
    });

    it('sem consentimento de fidelização não se usa benefício nem se acumula; o histórico mantém-se', async () => {
      await t.api('POST', `/api/customers/${amelia()}/consents`, { type: 'loyalty', granted: false });
      const before = await card(amelia());
      assert.equal(before.consent.granted, false);

      const refused = await t.api('POST', '/api/washes', { vehicleId: ids.vehicle('ACX731MC'), planId: ids.plan('SIMPLES'), useBenefit: true });
      assert.equal(refused.body.error.code, 'NO_LOYALTY_CONSENT');

      const { wash } = (await t.api('POST', '/api/washes', { vehicleId: ids.vehicle('ACX731MC'), planId: ids.plan('SIMPLES') })).body;
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'in_progress', stationId: await freeStation() });
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'ready' });
      await t.api('POST', `/api/washes/${wash.id}/payments/cash`, { amountCents: 35000, confirm: true }, { 'Idempotency-Key': 'gov-1', ...t.as('operator', 'Bento') });
      await t.api('POST', `/api/washes/${wash.id}/transitions`, { to: 'completed' });

      const after = await card(amelia());
      const b = (c) => c.classes.find((x) => x.classCode === 'B');
      assert.equal(b(after).eligibleWashes, b(before).eligibleWashes);
      assert.equal(b(after).benefitsAvailable, 1); // o saldo anterior mantém-se
    });

    it('o cliente adere pela conversa com ADERIR', async () => {
      await t.api('POST', '/api/simulator/threads/258845550101/messages', { text: 'Olá' });
      const res = await t.api('POST', '/api/simulator/threads/258845550101/messages', { text: 'ADERIR' });
      assert.match(res.body.messages.at(-1).body, /Bem-vindo ao programa de fidelização/);
      assert.equal((await card(amelia())).consent.granted, true);
    });

    it('um cliente registado sem consentimento não acumula', async () => {
      const { customer } = (await t.api('POST', '/api/customers', { phone: '84 777 0001', name: 'Sem Consentimento', vehicles: [{ plate: 'AAA 777 MP', classId: 'A' }] })).body;
      assert.equal((await card(customer.id)).consent.granted, false);
    });

    it('valida o pedido', async () => {
      assert.equal((await t.api('POST', `/api/customers/${amelia()}/consents`, { type: 'banco', granted: true })).status, 400);
      assert.equal((await t.api('POST', `/api/customers/${amelia()}/consents`, { type: 'loyalty', granted: 'sim' })).status, 400);
      assert.equal((await t.api('GET', '/api/customers/9999/consents')).status, 404);
    });
  });

  describe('registo de alterações', () => {
    it('mostra as alterações de preços, mais recentes primeiro', async () => {
      await t.api('PUT', `/api/plans/${ids.plan('SIMPLES')}/prices/A`, { priceCents: 27500 });
      const { changes } = (await t.api('GET', '/api/change-log')).body;
      assert.deepEqual([changes[0].entityLabel, changes[0].oldValue, changes[0].newValue, changes[0].actor], ['Preço', '25000', '27500', 'Z. Cossa']);
      assert.ok((await t.api('GET', '/api/change-log?entity=loyalty_rules')).body.changes.every((c) => c.entity === 'loyalty_rules'));
    });

    it('desactivar um posto fica registado e tira-o da capacidade', async () => {
      const p4 = ids.station('P4');
      const res = await t.api('PATCH', `/api/stations/${p4}`, { active: false });
      assert.equal(res.body.station.state, 'inactive');
      const [change] = (await t.api('GET', '/api/change-log?entity=station')).body.changes;
      assert.deepEqual([change.entityId, change.newValue], ['P4', 'false']);
      const slots = (await t.api('GET', `/api/availability?date=2026-10-23&planId=${ids.plan('SIMPLES')}&classId=A`)).body.slots;
      assert.ok(slots.every((slot) => slot.stationId !== p4));
      await t.api('PATCH', `/api/stations/${p4}`, { active: true });
    });
  });

  describe('fecho do dia (cap. 13.3)', () => {
    const day = '2026-10-22';
    const reconciliation = async () => (await t.api('GET', `/api/reconciliation?date=${day}`)).body;

    it('mostra o numerário declarado por operador e as inconsistências', async () => {
      const ready = ids.yardWash('AGB550MP');
      await t.api('POST', `/api/washes/${ready}/transitions`, { to: 'completed', allowUnpaid: true });
      const body = await reconciliation();
      assert.ok(body.operators.some((o) => o.operator === 'Bento' && o.declared.cents === 35000));
      const issue = body.issues.find((i) => i.code === 'delivered_unpaid' && i.washId === ready);
      assert.equal(issue.label, 'Concluído sem pagamento');
      assert.equal(issue.plateDisplay, 'AGB 550 MP');
    });

    it('uma diferença no fecho exige nota, fica como inconsistência e o dia fecha uma vez', async () => {
      const missingNote = await t.api('POST', '/api/reconciliation/closings', { date: day, operator: 'Bento', countedCents: 30000 });
      assert.equal(missingNote.status, 400);
      const closed = await t.api('POST', '/api/reconciliation/closings', { date: day, operator: 'Bento', countedCents: 30000, note: 'Troco dado a mais' });
      assert.equal(closed.status, 201);
      const bento = closed.body.operators.find((o) => o.operator === 'Bento');
      assert.deepEqual([bento.closing.difference.cents, bento.closing.closedBy], [-5000, 'Z. Cossa']);
      assert.ok(closed.body.issues.some((i) => i.code === 'cash_difference' && i.operator === 'Bento'));
      const again = await t.api('POST', '/api/reconciliation/closings', { date: day, operator: 'Bento', countedCents: 35000 });
      assert.equal(again.body.error.code, 'ALREADY_CLOSED');
    });

    it('as correcções ficam registadas e contam na qualidade dos dados', async () => {
      const ready = ids.yardWash('AGB550MP') ?? (await reconciliation()).issues.find((i) => i.code === 'delivered_unpaid').washId;
      const res = await t.api(
        'POST',
        '/api/reconciliation/corrections',
        { date: day, washId: ready, issueCode: 'delivered_unpaid', note: 'Cliente paga amanhã' },
      );
      assert.equal(res.status, 201);
      const issue = res.body.issues.find((i) => i.code === 'delivered_unpaid' && i.washId === ready);
      assert.deepEqual(issue.corrections.map((c) => [c.note, c.actor]), [['Cliente paga amanhã', 'Z. Cossa']]);
      const report = (await t.api('GET', '/api/bank/reports/activity?authorizationId=2', undefined, t.as('bank_analyst'))).body.report;
      assert.equal(report.sections.dataQuality.find((q) => q.label === 'Correcções').value, '1');
      assert.throws(() => t.db.prepare('DELETE FROM reconciliation_notes').run(), /só aceita novos registos/);
      assert.throws(() => t.db.prepare('UPDATE cash_closings SET counted_cents = 0').run(), /só aceita novos registos/);
    });

    it('valida os pedidos', async () => {
      assert.equal((await t.api('GET', '/api/reconciliation?date=22/10')).status, 400);
      assert.equal((await t.api('POST', '/api/reconciliation/closings', { date: day, operator: 'Ninguém', countedCents: 0 })).status, 404);
      assert.equal((await t.api('POST', '/api/reconciliation/corrections', { date: day, issueCode: 'outro', note: 'x x x' })).status, 400);
    });
  });
});
