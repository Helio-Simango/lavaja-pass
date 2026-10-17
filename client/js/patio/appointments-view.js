// Marcações de hoje no Pátio (M7): confirmar (D-09), registar a chegada, a falta ou cancelar.
import { escapeHtml, formatTime } from '../core/dom.js';

const STATUS_TONES = { requested: 'amber', confirmed: 'blue', checked_in: 'green', no_show: 'red', cancelled: '' };

export function renderAppointments(list, countElement, appointments) {
  const active = appointments.filter((a) => a.status !== 'cancelled');
  const confirmed = active.filter((a) => a.status === 'confirmed').length;
  countElement.textContent = active.length ? `${confirmed} confirmada(s) · ${active.length} no total` : '';
  list.innerHTML = active.length
    ? active.map(appointmentHtml).join('')
    : '<li class="muted">Sem marcações para hoje. As marcações reservam capacidade nos postos.</li>';
}

function appointmentHtml(appointment) {
  const declined = appointment.offers.filter((o) => o.status === 'declined').map((o) => `proposta ${formatTime(o.proposedStartsAt)} recusada`);
  const pending = appointment.offers.filter((o) => o.status === 'pending').map((o) => `proposta ${formatTime(o.proposedStartsAt)} à espera`);
  const notes = [...declined, ...pending].map((note) => ` · ${escapeHtml(note)}`).join('');
  return `<li>
    <span class="when">${formatTime(appointment.startsAt)}</span>
    <span class="grow"><span class="mono">${escapeHtml(appointment.vehicle.plateDisplay)}</span> · ${escapeHtml(appointment.plan.name)} (${escapeHtml(appointment.vehicle.classCode)}) · ${escapeHtml(appointment.customer.name)} · ${escapeHtml(appointment.station.code)}</span>
    <span class="pill ${STATUS_TONES[appointment.status]}">${escapeHtml(appointment.statusLabel)}${appointment.status === 'requested' ? ' (D-09)' : ''}</span>
    <span class="muted small">${notes}</span>
    <span class="actions">${actionsHtml(appointment)}</span>
  </li>`;
}

function actionsHtml({ id, status }) {
  const button = (action, label, tone = '') => `<button class="btn small ${tone}" data-appointment-action="${action}" data-id="${id}">${label}</button>`;
  if (status === 'requested') return button('confirmed', 'Confirmar', 'primary') + button('cancelled', 'Cancelar', 'ghost');
  if (status === 'confirmed') return button('checked_in', 'Chegou', 'success') + button('no_show', 'Faltou', 'ghost') + button('cancelled', 'Cancelar', 'ghost');
  return '';
}
