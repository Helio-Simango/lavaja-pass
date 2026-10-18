// Área do cliente (perfil Cliente): só os seus serviços, marcações e fidelização.
import { api } from '../core/api-client.js';
import { $, escapeHtml } from '../core/dom.js';
import { mzn, shortDate, time } from '../core/format.js';
import { bindLogout, requireSession } from '../core/session.js';

const PROFILE = 'cliente';
const ACTIVE = ['queued', 'in_progress', 'ready'];
const PAID = ['paid_digital', 'paid_cash', 'not_required'];

const session = await requireSession(PROFILE);
bindLogout($('#logout'), PROFILE);

async function load() {
  const [{ customer, appointments }, { washes }, { loyalty }, business] = await Promise.all([
    api('GET', '/me'),
    api('GET', '/me/washes'),
    api('GET', '/me/loyalty'),
    api('GET', '/public/business'),
  ]);
  $('#business').textContent = business.name;
  $('#who').textContent = `${session.name} · ${customer.phoneDisplay}`;
  $('#chat-link').href = `/simulador/whatsapp/${customer.phone}`;
  renderActive(washes.filter((w) => ACTIVE.includes(w.status)));
  renderAppointments(appointments);
  renderLoyalty(loyalty);
  renderHistory(washes.filter((w) => !ACTIVE.includes(w.status)));
}

function renderActive(washes) {
  $('#active').innerHTML = washes.length
    ? washes.map((wash) => {
        const paid = PAID.includes(wash.payment.status);
        const eta = wash.estimate?.estimatedEndAt ? ` · pronto por volta das ${time(wash.estimate.estimatedEndAt)} (estimativa)` : '';
        const position = wash.status === 'queued' && wash.estimate?.position ? `${wash.estimate.position}.º na fila` : wash.statusLabel;
        return `<article class="car ${wash.status === 'ready' ? 'ready' : wash.status === 'in_progress' ? 'wash' : 'queue'}">
          <div class="top"><span class="plate">${escapeHtml(wash.vehicle.plateDisplay)}</span><span class="pill ${paid ? 'g' : 'a'}">${paid ? 'PAGO' : 'POR PAGAR'}</span></div>
          <div class="row"><span>${escapeHtml(wash.plan.name)} · ${mzn(wash.price.final.cents)} MZN · ${escapeHtml(position)}${eta}</span></div>
          ${paid ? '' : `<a class="btn p" href="/pagar/${wash.id}">Pagar com a carteira (simulado)</a>`}
        </article>`;
      }).join('')
    : '<p class="empty">Nenhuma viatura no pátio.</p>';
}

function renderAppointments(appointments) {
  $('#appointments').innerHTML = appointments.length
    ? appointments.map((a) => `<article class="car queue"><div class="top"><span class="plate">${shortDate(a.startsAt)} ${time(a.startsAt)}</span><span class="pill b">${escapeHtml(a.statusLabel)}</span></div>
        <div class="row"><span>${escapeHtml(a.vehicle.plateDisplay)} · ${escapeHtml(a.plan.name)}</span></div></article>`).join('')
    : '<p class="empty">Sem marcações.</p>';
}

function renderLoyalty(loyalty) {
  if (!loyalty.consent?.granted) {
    $('#loyalty').innerHTML = '<p class="empty">Não participa no programa. Para aderir, escreva <b>ADERIR</b> na conversa.</p>';
    return;
  }
  const classes = loyalty.classes.filter((c) => c.eligibleWashes > 0 || c.benefitsAvailable > 0);
  $('#loyalty').innerHTML = classes.length
    ? classes.map((c) => {
        const stamps = Array.from({ length: c.cycleSize }, (_, i) => `<i class="${i < c.progressInCycle ? '' : 'e'}">★</i>`).join('');
        const benefits = c.benefitsAvailable ? `<span class="pill g">🎁 ${c.benefitsAvailable} × ${escapeHtml(c.benefit)}</span>` : '';
        return `<article class="car"><div class="top"><b>Classe ${escapeHtml(c.classCode)} · nível ${c.level}</b>${benefits}</div>
          <div class="stamps" aria-label="${c.progressInCycle} de ${c.cycleSize}">${stamps}</div>
          <div class="row"><span>${c.progressInCycle} de ${c.cycleSize} lavagens pagas para o próximo benefício</span></div></article>`;
      }).join('')
    : '<p class="empty">Ainda sem lavagens que contem. Cada lavagem paga avança o cartão.</p>';
}

function renderHistory(washes) {
  $('#history').innerHTML = washes.length
    ? `<div class="phone-pad" style="padding-top:4px"><table class="data"><tr><th>Data</th><th>Serviço</th><th class="num">MZN</th></tr>${washes
        .map((w) => `<tr><td>${shortDate(w.completedAt ?? w.cancelledAt ?? w.queuedAt)}</td><td>${escapeHtml(w.plan.name)} · ${escapeHtml(w.statusLabel)}</td><td class="num">${mzn(w.price.final.cents)}</td></tr>`)
        .join('')}</table></div>`
    : '<p class="empty">Sem histórico.</p>';
}

await load();
setInterval(() => document.visibilityState === 'visible' && load(), 5000);
