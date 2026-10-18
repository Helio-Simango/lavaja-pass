// Campanha fora de pico (M11): o sistema propõe o segmento e a mensagem; o gestor revê e confirma.
// O rascunho fica só neste browser (conveniência); o envio fica registado no servidor.
import { api } from '../core/api-client.js';
import { $, escapeHtml, hideMessage, showMessage } from '../core/dom.js';
import { dateTime } from '../core/format.js';

const DRAFT_KEY = 'lavaja.campaignDraft';

export function createCampaignsView() {
  const state = { preview: null, offerType: 'off_peak_invitation' };

  $('#campaign-offers').addEventListener('click', (event) => {
    const option = event.target.closest('[data-offer]');
    if (!option || option.disabled) return;
    state.offerType = option.dataset.offer;
    renderOffers();
  });
  $('#campaign-template').addEventListener('input', renderPreview);
  $('#campaign-draft').addEventListener('click', () => {
    writeDraft($('#campaign-template').value);
    $('#campaign-draft').textContent = 'Rascunho guardado';
    setTimeout(() => ($('#campaign-draft').textContent = 'Guardar rascunho'), 1500);
  });
  $('#campaign-form').addEventListener('submit', send);

  async function load() {
    const [preview, { campaigns }] = await Promise.all([api('GET', '/campaigns/preview'), api('GET', '/campaigns')]);
    state.preview = preview;
    if (!$('#campaign-template').value) $('#campaign-template').value = readDraft() ?? preview.template;
    $('#campaign-segment').innerHTML = `Clientes com consentimento, sem lavar há <b>${preview.policy.minInactiveDays}+ dias</b>`;
    $('#campaign-count').textContent = `${preview.count} clientes`;
    $('#campaign-excluded').textContent = `Exclui quem recebeu uma campanha nos últimos ${preview.policy.cooldownDays} dias (${preview.excluded.recentlyContacted}) e quem não aceitou ofertas (${preview.excluded.noConsent}).`;
    $('#campaign-send').textContent = `Enviar agora a ${preview.count} clientes`;
    $('#campaign-send').disabled = preview.count === 0;
    renderOffers();
    renderPreview();
    renderSent(campaigns);
  }

  function renderOffers() {
    $('#campaign-offers').innerHTML = state.preview.offers
      .map((offer) => `<button type="button" class="radio" role="radio" data-offer="${offer.type}" aria-checked="${offer.type === state.offerType}" ${offer.available ? '' : 'disabled'}>
        <i></i><span><b>${escapeHtml(offer.label)}</b><small>${escapeHtml(offer.description)}</small></span></button>`)
      .join('');
  }

  function renderPreview() {
    const sample = state.preview?.sample[0];
    const values = { nome: sample?.firstName ?? '{nome}', dias: sample?.inactiveDays ?? '{dias}', matricula: sample ? sample.message.match(/do ([A-Z]{3} \d{3} [A-Z]{2})/)?.[1] ?? '{matricula}' : '{matricula}' };
    const body = $('#campaign-template').value.replaceAll('{nome}', values.nome).replaceAll('{dias}', values.dias).replaceAll('{matricula}', values.matricula);
    // Negrito ao estilo WhatsApp (*LAVAR*), sobre texto já escapado.
    $('#campaign-preview').innerHTML = escapeHtml(`${body}\n\n${state.preview?.footer ?? ''}`).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  }

  async function send(event) {
    event.preventDefault();
    hideMessage($('#campaign-error'));
    if (!confirm(`Enviar a campanha a ${state.preview.count} clientes? Cada um recebe a mensagem na conversa.`)) return;
    $('#campaign-send').disabled = true;
    try {
      await api('POST', '/campaigns', { offerType: state.offerType, message: $('#campaign-template').value, confirm: true });
      writeDraft(null);
      await load();
    } catch (error) {
      showMessage($('#campaign-error'), error.message);
      $('#campaign-send').disabled = false;
    }
  }

  function renderSent(campaigns) {
    $('#campaigns-sent').innerHTML = campaigns.length
      ? campaigns.map((c) => `<div class="line-item"><span>${escapeHtml(dateTime(c.sentAt))} · ${escapeHtml(c.offer.label)}<br><span class="muted small">por ${escapeHtml(c.sentBy)} · ${c.recipientsCount} clientes</span></span>
          <b>${c.result.washes} lavagem(ns)<br><span class="muted small">em ${c.result.attributionDays} dias</span></b></div>`).join('')
      : '<p class="muted small">Ainda não enviou campanhas.</p>';
  }

  return { load };
}

function readDraft() {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function writeDraft(text) {
  try {
    if (text === null) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, text);
  } catch {
    // Armazenamento indisponível: o rascunho vale só nesta página.
  }
}
