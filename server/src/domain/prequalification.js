// Pré-qualificação de crédito (proposta v1, secção 8; decisão da equipa de 18/10/2026).
// Um score de 0 a 100 que indica se vale a pena o banco analisar o comerciante e com que montante
// de partida. NÃO aprova crédito: a decisão é sempre do banco, pelos seus processos.
// Princípios: pesa o que é verificado (volume e % digital só com pagamentos confirmados); é honesto
// sobre o tempo (antiguidade); é explicável (cada componente aparece com o seu valor).

const clamp01 = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/** Parâmetros de demonstração, por validar com o banco (configuráveis em settings). */
export const DEFAULT_PREQUALIFICATION_PARAMS = Object.freeze({
  volumeReferenceCents: 10_000_000, // 100.000 MZN de receita digital em 30 dias = componente cheio
  historyReferenceDays: 180,
  trendSensitivity: 2.5,
  classAMin: 75,
  classBMin: 60,
  retentionShare: 0.1, // retenção automática sobre os recebimentos digitais
  termMonths: 12,
  costFactor: 1.25, // ilustrativo: juros e margem são definidos pelo banco
  roundingCents: 500_000, // múltiplos de 5.000 MZN, arredondado para baixo
  projectionDays: 90,
});

export const PREQUALIFICATION_COMPONENTS = Object.freeze([
  { key: 'volume', label: 'Volume verif.', weight: 25, definition: 'mín(1, receita digital confirmada em 30 dias ÷ valor de referência)' },
  { key: 'regularity', label: 'Regularidade', weight: 20, definition: '1 − coeficiente de variação da receita semanal (4 semanas, digital + numerário)' },
  { key: 'trend', label: 'Tendência', weight: 15, definition: '0,5 + crescimento em 4 semanas × 2,5, limitado a [0, 1]' },
  { key: 'digitalShare', label: '% digital', weight: 20, definition: 'receita digital confirmada ÷ receita total (30 dias)' },
  { key: 'retention', label: 'Retenção', weight: 10, definition: '% de clientes que voltaram em 30 dias' },
  { key: 'history', label: 'Antiguidade', weight: 10, definition: 'mín(1, dias de histórico ÷ 180)' },
]);

export const SCORE_CLASS_LABELS = Object.freeze({
  A: 'Pré-qualificado: montante indicativo completo',
  B: 'Elegível para análise',
  C: 'Histórico insuficiente: continuar a registar',
});

/**
 * @param metrics {
 *   digitalCents30d, totalCents30d,        // receita dos últimos 30 dias (digital confirmado; digital + numerário)
 *   weeklyTotalsCents: number[],          // 4 semanas, da mais antiga para a mais recente
 *   retentionRate: number|null,           // 0..1
 *   historyDays: number,
 * }
 */
export function prequalify(metrics, params = DEFAULT_PREQUALIFICATION_PARAMS) {
  const p = { ...DEFAULT_PREQUALIFICATION_PARAMS, ...params };
  const ratios = componentRatios(metrics, p);
  const components = PREQUALIFICATION_COMPONENTS.map((component) => {
    const raw = component.weight * ratios[component.key];
    return { ...component, ratio: ratios[component.key], raw, points: Math.round(raw) };
  });
  const total = Math.round(components.reduce((sum, component) => sum + component.raw, 0));
  const scoreClass = classOf(total, p);
  const weakest = components.reduce((low, component) => (component.ratio < low.ratio ? component : low));
  const projected = scoreOnly({ ...metrics, historyDays: Math.max(metrics.historyDays, p.projectionDays) }, p);

  return {
    total,
    scoreClass,
    classLabel: SCORE_CLASS_LABELS[scoreClass],
    components: components.map(({ raw, ...component }) => component),
    weakest: { key: weakest.key, label: weakest.label },
    projection: { days: p.projectionDays, total: projected, scoreClass: classOf(projected, p) },
    indicative: indicativeAmount(metrics.digitalCents30d, scoreClass, p),
    params: p,
  };
}

function componentRatios({ digitalCents30d, totalCents30d, weeklyTotalsCents, retentionRate, historyDays }, p) {
  const weeks = weeklyTotalsCents.length ? weeklyTotalsCents : [0];
  const mean = weeks.reduce((sum, value) => sum + value, 0) / weeks.length;
  const deviation = Math.sqrt(weeks.reduce((sum, value) => sum + (value - mean) ** 2, 0) / weeks.length);
  const growth = weeks[0] > 0 ? (weeks.at(-1) - weeks[0]) / weeks[0] : 0;
  return {
    volume: clamp01(digitalCents30d / p.volumeReferenceCents),
    regularity: mean > 0 ? clamp01(1 - deviation / mean) : 0,
    trend: clamp01(0.5 + growth * p.trendSensitivity),
    digitalShare: totalCents30d > 0 ? clamp01(digitalCents30d / totalCents30d) : 0,
    retention: clamp01(retentionRate ?? 0),
    history: clamp01(historyDays / p.historyReferenceDays),
  };
}

function scoreOnly(metrics, p) {
  const ratios = componentRatios(metrics, p);
  return Math.round(PREQUALIFICATION_COMPONENTS.reduce((sum, c) => sum + c.weight * ratios[c.key], 0));
}

function classOf(total, p) {
  if (total >= p.classAMin) return 'A';
  return total >= p.classBMin ? 'B' : 'C';
}

/**
 * Montante indicativo pela capacidade de retenção (revenue-based financing): a prestação acompanha
 * o movimento. Classe C: sem montante.
 */
export function indicativeAmount(digitalCents30d, scoreClass, p = DEFAULT_PREQUALIFICATION_PARAMS) {
  const monthlyRetentionCents = Math.round(digitalCents30d * p.retentionShare);
  const capacityCents = monthlyRetentionCents * p.termMonths;
  const amountCents = scoreClass === 'C' ? 0 : Math.floor(capacityCents / p.costFactor / p.roundingCents) * p.roundingCents;
  return {
    amountCents,
    monthlyRetentionCents,
    capacityCents,
    termMonths: p.termMonths,
    retentionShare: p.retentionShare,
    costFactor: p.costFactor,
  };
}
