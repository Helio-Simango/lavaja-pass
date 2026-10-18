// Campanhas fora de pico (M11 → M5): o sistema propõe o segmento e a mensagem; o gestor confirma.
// Cada mensagem chega à conversa do cliente (simulador). Nunca há envios automáticos.
import {
  attributedWashes,
  CAMPAIGN_FOOTER,
  CAMPAIGN_OFFERS,
  DEFAULT_CAMPAIGN_POLICY,
  DEFAULT_TEMPLATE,
  parseCampaignRequest,
  renderCampaignMessage,
  selectSegment,
} from '../domain/campaigns.js';
import { ConflictError } from '../domain/errors.js';
import { formatPlate } from '../domain/plate.js';

const SAMPLE_SIZE = 3;

export class CampaignService {
  #campaigns;
  #conversationService;
  #settingsService;
  #unitOfWork;
  #clock;

  constructor({ campaignRepository, conversationService, settingsService, unitOfWork, clock }) {
    this.#campaigns = campaignRepository;
    this.#conversationService = conversationService;
    this.#settingsService = settingsService;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  policy() {
    return { ...DEFAULT_CAMPAIGN_POLICY, ...this.#settingsService.get('campaigns.policy', {}) };
  }

  /** Segmento proposto e pré-visualização, sem enviar nada. Só números e exemplos sem telefone. */
  preview() {
    const policy = this.policy();
    const { recipients, excluded } = selectSegment(this.#campaigns.candidates(), this.#clock.nowIso(), policy);
    return {
      policy,
      offers: CAMPAIGN_OFFERS,
      template: DEFAULT_TEMPLATE,
      footer: CAMPAIGN_FOOTER,
      count: recipients.length,
      excluded,
      sample: recipients.slice(0, SAMPLE_SIZE).map((r) => ({
        firstName: r.name.split(' ')[0],
        inactiveDays: r.inactiveDays,
        message: renderCampaignMessage(DEFAULT_TEMPLATE, { name: r.name, inactiveDays: r.inactiveDays, plate: formatPlate(r.lastPlate) }),
      })),
    };
  }

  /** Envio confirmado pelo gestor: regista a campanha e envia uma mensagem a cada cliente do segmento. */
  send({ offerType, message, confirmed }, actor) {
    const request = parseCampaignRequest({ offerType, message, confirmed });
    return this.#unitOfWork.run(() => {
      const now = this.#clock.nowIso();
      const policy = this.policy();
      const { recipients } = selectSegment(this.#campaigns.candidates(), now, policy);
      if (recipients.length === 0) throw new ConflictError('EMPTY_SEGMENT', 'Não há clientes no segmento: nada foi enviado.');
      const campaignId = this.#campaigns.insertCampaign(
        { offerType: request.offerType, template: request.template, policy, recipientsCount: recipients.length, sentBy: actor },
        now,
      );
      for (const recipient of recipients) {
        const text = renderCampaignMessage(request.template, {
          name: recipient.name,
          inactiveDays: recipient.inactiveDays,
          plate: formatPlate(recipient.lastPlate),
        });
        this.#campaigns.insertRecipient({ campaignId, customerId: recipient.customerId, message: text }, now);
        this.#conversationService.sendToPhone(recipient.phone, text);
      }
      return this.list().find((campaign) => campaign.id === campaignId);
    });
  }

  /** Campanhas enviadas, com o resultado medido: lavagens dos destinatários até 7 dias depois. */
  list() {
    const policy = this.policy();
    const campaigns = this.#campaigns.list();
    if (campaigns.length === 0) return [];
    const oldest = campaigns.at(-1).sentAt;
    const washes = this.#campaigns.washesQueuedSince(oldest);
    return campaigns.map(({ recipientCustomerIds, ...campaign }) => {
      const attributed = attributedWashes({ ...campaign, recipientCustomerIds }, washes, campaign.policy ?? policy);
      return {
        ...campaign,
        offer: CAMPAIGN_OFFERS.find((offer) => offer.type === campaign.offerType),
        result: { washes: attributed.length, customers: new Set(attributed.map((w) => w.customerId)).size, attributionDays: policy.attributionDays },
      };
    });
  }
}
