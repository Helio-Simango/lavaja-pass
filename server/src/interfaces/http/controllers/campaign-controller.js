// Campanhas fora de pico (M11): pré-visualização do segmento e envio confirmado pelo gestor.
import { presentCampaign, presentCampaignPreview } from '../presenters.js';
import { actorOf, bodyOf } from '../request.js';

export function createCampaignController({ campaignService }) {
  return {
    preview(req, res) {
      res.json(presentCampaignPreview(campaignService.preview()));
    },

    list(req, res) {
      res.json({ campaigns: campaignService.list().map(presentCampaign) });
    },

    send(req, res) {
      const body = bodyOf(req);
      const campaign = campaignService.send({ offerType: body.offerType, message: body.message, confirmed: body.confirm }, actorOf(req));
      res.status(201).json({ campaign: presentCampaign(campaign) });
    },
  };
}
