import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attributedWashes, CampaignOffer, parseCampaignRequest, renderCampaignMessage, selectSegment } from '../../src/domain/campaigns.js';

const NOW = '2026-10-22T08:00:00.000Z';
const daysAgo = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
const candidate = (overrides) => ({ customerId: 1, name: 'Bento Cossa', phone: '258845550199', marketingConsent: true, lastCompletedAt: daysAgo(16), lastPlate: 'ACX731MC', lastCampaignAt: null, ...overrides });

describe('campanhas fora de pico (v1, secção 7.5)', () => {
  it('só clientes com consentimento, sem lavar há 14+ dias e sem campanha nos últimos 7 dias', () => {
    const { recipients, excluded } = selectSegment(
      [
        candidate({ customerId: 1 }),
        candidate({ customerId: 2, marketingConsent: false }),
        candidate({ customerId: 3, lastCompletedAt: daysAgo(13) }),
        candidate({ customerId: 4, lastCampaignAt: daysAgo(6) }),
        candidate({ customerId: 5, lastCampaignAt: daysAgo(8) }),
        candidate({ customerId: 6, lastCompletedAt: null }),
      ],
      NOW,
    );
    assert.deepEqual(recipients.map((r) => [r.customerId, r.inactiveDays]), [[1, 16], [5, 16]]);
    assert.deepEqual(excluded, { noConsent: 1, recentlyActive: 1, recentlyContacted: 1 });
  });

  it('a mensagem usa o primeiro nome, os dias e a matrícula, e diz sempre como sair', () => {
    const text = renderCampaignMessage('Olá {nome}! Já lá vão {dias} dias desde a última lavagem do {matricula} 🚗', {
      name: 'Bento Cossa',
      inactiveDays: 16,
      plate: 'ACX 731 MC',
    });
    assert.match(text, /^Olá Bento! Já lá vão 16 dias desde a última lavagem do ACX 731 MC/);
    assert.match(text, /\*PARAR\*/);
  });

  it('o envio exige confirmação e uma oferta disponível (sem mexer em preços nem na fidelização)', () => {
    assert.throws(() => parseCampaignRequest({ confirmed: false }), { code: 'VALIDATION_ERROR' });
    assert.throws(() => parseCampaignRequest({ offerType: CampaignOffer.DOUBLE_STAMP, confirmed: true }), /não está disponível/);
    assert.throws(() => parseCampaignRequest({ offerType: CampaignOffer.INVITATION, message: 'curta', confirmed: true }), { code: 'VALIDATION_ERROR' });
    assert.equal(parseCampaignRequest({ confirmed: true }).offerType, CampaignOffer.INVITATION);
  });

  it('conta as lavagens dos destinatários até 7 dias depois do envio', () => {
    const campaign = { sentAt: daysAgo(10), recipientCustomerIds: [1, 2] };
    const washes = [
      { customerId: 1, status: 'completed', queuedAt: daysAgo(8) },
      { customerId: 2, status: 'cancelled', queuedAt: daysAgo(8) },
      { customerId: 2, status: 'completed', queuedAt: daysAgo(2) }, // depois dos 7 dias
      { customerId: 3, status: 'completed', queuedAt: daysAgo(8) }, // não recebeu
    ];
    assert.equal(attributedWashes(campaign, washes).length, 1);
  });
});
