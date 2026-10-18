// Campanhas fora de pico (proposta v1, secção 7.5; decisão da equipa de 18/10/2026: envio manual).
// O gestor revê o segmento e a mensagem e confirma; o sistema nunca envia sozinho (DEC-13 revista).
// - Só clientes com consentimento de ofertas; PARAR retira-o.
// - Segmento por omissão: sem lavar há 14 dias ou mais; no máximo uma campanha por cliente em 7 dias.
// - Atribuição: uma lavagem conta para a campanha se o cliente a registou até 7 dias depois do envio.
// - A oferta não muda preços nem a fidelização (D-01/D-02/D-06 continuam pendentes).
import { ValidationError } from './errors.js';

const DAY_MS = 86_400_000;
const MESSAGE_MIN = 20;
const MESSAGE_MAX = 600;

export const DEFAULT_CAMPAIGN_POLICY = Object.freeze({ minInactiveDays: 14, cooldownDays: 7, attributionDays: 7 });

export const CampaignOffer = Object.freeze({
  INVITATION: 'off_peak_invitation',
  DOUBLE_STAMP: 'double_stamp',
  DISCOUNT: 'price_discount',
});

/** Ofertas do M11. Só o convite está disponível: as outras dependem de decisões pendentes. */
export const CAMPAIGN_OFFERS = Object.freeze([
  {
    type: CampaignOffer.INVITATION,
    label: 'Convite fora de pico · Ter–Qui, 07:00–12:00',
    description: 'Recomendado: não baixa o preço nem mexe na fidelização; lembra o cliente quando há menos fila.',
    available: true,
  },
  {
    type: CampaignOffer.DOUBLE_STAMP,
    label: 'Selo a dobrar',
    description: 'Indisponível: a fidelização mantém as regras actuais (D-01, D-06 por decidir).',
    available: false,
  },
  {
    type: CampaignOffer.DISCOUNT,
    label: 'Desconto de preço',
    description: 'Indisponível: reduz a receita de quem viria de qualquer forma; exige decisão da lavadora.',
    available: false,
  },
]);

export const DEFAULT_TEMPLATE =
  'Olá {nome}! Já lá vão {dias} dias desde a última lavagem do {matricula} 🚗\n⭐ De terça a quinta, até às 12h, há menos fila: é entrar e sair.';

export const CAMPAIGN_FOOTER = 'Responda *LAVAR* para entrar na fila ou *PARAR* para não receber mais ofertas.';

/**
 * @param candidates [{ customerId, name, phone, marketingConsent, lastCompletedAt, lastPlate, lastCampaignAt }]
 * @returns { recipients, excluded: { noConsent, recentlyActive, recentlyContacted } }
 */
export function selectSegment(candidates, now, policy = DEFAULT_CAMPAIGN_POLICY) {
  const nowMs = Date.parse(now);
  const excluded = { noConsent: 0, recentlyActive: 0, recentlyContacted: 0 };
  const recipients = [];
  for (const candidate of candidates) {
    if (!candidate.lastCompletedAt) continue; // só clientes que já lavaram (inactivos)
    if (!candidate.marketingConsent) {
      excluded.noConsent += 1;
      continue;
    }
    const inactiveDays = Math.floor((nowMs - Date.parse(candidate.lastCompletedAt)) / DAY_MS);
    if (inactiveDays < policy.minInactiveDays) {
      excluded.recentlyActive += 1;
      continue;
    }
    if (candidate.lastCampaignAt && nowMs - Date.parse(candidate.lastCampaignAt) < policy.cooldownDays * DAY_MS) {
      excluded.recentlyContacted += 1;
      continue;
    }
    recipients.push({ ...candidate, inactiveDays });
  }
  return { recipients, excluded };
}

export function parseCampaignRequest({ offerType, message, confirmed }) {
  const offer = CAMPAIGN_OFFERS.find((candidate) => candidate.type === (offerType ?? CampaignOffer.INVITATION));
  if (!offer) throw new ValidationError('Oferta desconhecida.', { field: 'offerType' });
  if (!offer.available) throw new ValidationError(`A oferta "${offer.label}" não está disponível. ${offer.description}`, { field: 'offerType' });
  const template = message === undefined || message === null || message === '' ? DEFAULT_TEMPLATE : String(message).trim();
  if (template.length < MESSAGE_MIN || template.length > MESSAGE_MAX) {
    throw new ValidationError(`A mensagem deve ter entre ${MESSAGE_MIN} e ${MESSAGE_MAX} caracteres.`, { field: 'message' });
  }
  if (confirmed !== true) {
    throw new ValidationError('O envio tem de ser confirmado explicitamente pelo gestor ("confirm": true).', { field: 'confirm' });
  }
  return { offerType: offer.type, template };
}

/** Mensagem de cada cliente: o modelo com os seus dados e sempre a forma de sair (PARAR). */
export function renderCampaignMessage(template, { name, inactiveDays, plate }) {
  const firstName = String(name).split(' ')[0];
  const body = template.replaceAll('{nome}', firstName).replaceAll('{dias}', String(inactiveDays)).replaceAll('{matricula}', plate);
  return `${body}\n\n${CAMPAIGN_FOOTER}`;
}

/** Lavagens registadas pelos destinatários até N dias depois do envio (canceladas não contam). */
export function attributedWashes(campaign, washes, policy = DEFAULT_CAMPAIGN_POLICY) {
  const from = campaign.sentAt;
  const until = new Date(Date.parse(from) + policy.attributionDays * DAY_MS).toISOString();
  const recipients = new Set(campaign.recipientCustomerIds);
  return washes.filter((w) => recipients.has(w.customerId) && w.status !== 'cancelled' && w.queuedAt >= from && w.queuedAt <= until);
}
