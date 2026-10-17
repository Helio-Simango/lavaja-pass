// Capacidade e agenda do dia (M10): blocos das marcações e do pátio por posto, numa linha temporal
// entre a abertura e o fecho. As horas do pátio são estimativas.
import { escapeHtml, formatTime } from '../core/dom.js';

const MAPUTO_OFFSET = '+02:00';
const POLICY_ROWS = [
  ['Postos activos', (_, stations) => `${stations.filter((s) => s.active).length}`, 'registado'],
  ['Trabalhadores', (p) => `${p.workers}`, 'declarado'],
  ['Horário', (p) => `${p.openingHours.open}–${p.openingHours.close}`, 'declarado'],
  ['Margem de segurança', (p) => `${p.safetyMarginMin} min`, 'proposta'],
  ['Confirmação de marcações', (p) => (p.confirmation === 'manual' ? 'manual pela lavadora' : 'automática'), 'D-09'],
  ['Tolerância para atrasos', (p) => `${p.lateToleranceMin} min`, 'D-10'],
  ['Postos reservados para a fila', (p) => `${p.reservedStationsForQueue}`, 'D-12'],
  ['Horário libertado', (p) => (p.autoOffers ? 'proposto à marcação seguinte' : 'não é proposto'), 'D-14'],
];

export function renderCapacity({ agenda, table, policyTable, line }, capacity, now) {
  const { policy } = capacity;
  const openMs = Date.parse(`${capacity.date}T${policy.openingHours.open}:00${MAPUTO_OFFSET}`);
  const closeMs = Date.parse(`${capacity.date}T${policy.openingHours.close}:00${MAPUTO_OFFSET}`);
  const position = (iso) => Math.min(100, Math.max(0, ((Date.parse(iso) - openMs) / (closeMs - openMs)) * 100));
  const block = (kind, startsAt, endsAt, label, extra = '') => {
    if (!startsAt || !endsAt) return '';
    const left = position(startsAt);
    const width = Math.max(1.5, position(endsAt) - left);
    const title = `${formatTime(startsAt)}–${formatTime(endsAt)} · ${label}`;
    return `<div class="block ${kind} ${extra}" style="left:${left}%;width:${width}%" title="${escapeHtml(title)}">${escapeHtml(label)}</div>`;
  };

  const rows = [];
  agenda.innerHTML =
    capacity.stations
      .map((station) => {
        const appointments = station.appointments.filter((a) => a.status !== 'no_show');
        appointments.forEach((a) => rows.push([station.code, a.startsAt, a.endsAt, 'Marcação', a.vehicle.plateDisplay, a.statusLabel]));
        station.yard.forEach((w) => rows.push([station.code, w.startsAt, w.endsAt, 'Pátio (estimativa)', w.plateDisplay, w.status]));
        const nowMs = Date.parse(now);
        const nowMarker = nowMs > openMs && nowMs < closeMs ? `<div class="now" style="left:${position(now)}%" title="Agora"></div>` : '';
        return `<div class="station">${escapeHtml(station.code)}</div><div class="track">${nowMarker}
          ${appointments.map((a) => block('appointment', a.startsAt, a.endsAt, `${formatTime(a.startsAt)} ${a.vehicle.plateDisplay}`, a.status)).join('')}
          ${station.yard.map((w) => block('yard', w.startsAt, w.endsAt, w.plateDisplay)).join('')}
        </div>`;
      })
      .join('') + `<div class="hours"><span>${policy.openingHours.open}</span><span>${policy.openingHours.close}</span></div>`;

  table.innerHTML = `<tr><th>Posto</th><th>Início</th><th>Fim</th><th>Tipo</th><th>Matrícula</th><th>Estado</th></tr>${rows
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .map((r) => `<tr><td>${escapeHtml(r[0])}</td><td>${formatTime(r[1])}</td><td>${formatTime(r[2])}</td><td>${escapeHtml(r[3])}</td><td class="mono">${escapeHtml(r[4])}</td><td>${escapeHtml(r[5])}</td></tr>`)
    .join('') || '<tr><td colspan="6" class="muted">Sem marcações nem serviços.</td></tr>'}`;

  policyTable.innerHTML = POLICY_ROWS.map(
    ([label, value, origin]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value(policy, capacity.stations))}</td>
      <td><span class="pill ${origin.startsWith('D-') ? 'amber' : ''}">${escapeHtml(origin)}</span></td></tr>`,
  ).join('');
  line.textContent = `${capacity.stations.filter((s) => s.active).length} postos · ${policy.workers} trabalhadores (declarado) · margem de ${policy.safetyMarginMin} min (proposta) · horas do pátio são estimativas`;
}
