import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { indicativeAmount, prequalify } from '../../src/domain/prequalification.js';

// Exemplo da proposta v1 (secção 8.2 e 8.3): 66/100, classe B, 80.000 MZN.
const V1_EXAMPLE = {
  digitalCents30d: 8_712_600, // 87.126 MZN (0,87 do valor de referência)
  totalCents30d: 14_052_500, // 140.525 MZN → 62% digital
  weeklyTotalsCents: [3_400_000, 2_600_000, 4_500_000, 3_536_000], // regularidade ≈ 0,81; crescimento 4% → tendência 0,6
  retentionRate: 0.48,
  historyDays: 30,
};

describe('pré-qualificação (score v1)', () => {
  it('reproduz os seis componentes e o total do exemplo da proposta', () => {
    const result = prequalify(V1_EXAMPLE);
    const points = Object.fromEntries(result.components.map((c) => [c.key, c.points]));
    assert.equal(points.volume, 22);
    assert.equal(points.regularity, 16);
    assert.equal(points.trend, 9);
    assert.equal(points.digitalShare, 12);
    assert.equal(points.retention, 5);
    assert.equal(points.history, 2);
    assert.equal(result.components.reduce((sum, c) => sum + c.weight, 0), 100);
    assert.equal(result.total, 66);
    assert.deepEqual([result.scoreClass, result.classLabel], ['B', 'Elegível para análise']);
    assert.equal(result.weakest.key, 'history'); // o ponto fraco é a antiguidade do histórico
  });

  it('o montante indicativo vem da retenção de 10% dos recebimentos digitais (80.000 MZN)', () => {
    const amount = indicativeAmount(8_712_600, 'B');
    assert.equal(amount.monthlyRetentionCents, 871_260); // ≈ 8.713 MZN/mês
    assert.equal(amount.capacityCents, 10_455_120); // ≈ 104.551 MZN em 12 meses
    assert.equal(amount.amountCents, 8_000_000); // ÷ 1,25 e arredondado para baixo a 5.000
    assert.equal(indicativeAmount(8_712_600, 'C').amountCents, 0);
  });

  it('é honesto sobre o tempo: com 90 dias ao mesmo ritmo só a antiguidade sobe', () => {
    const result = prequalify(V1_EXAMPLE);
    assert.equal(result.projection.days, 90);
    assert.equal(result.projection.total - result.total, 3);
  });

  it('sem receita nem histórico fica em C, sem montante, e nunca dá valores fora de [0, 100]', () => {
    const empty = prequalify({ digitalCents30d: 0, totalCents30d: 0, weeklyTotalsCents: [0, 0, 0, 0], retentionRate: null, historyDays: 0 });
    assert.equal(empty.scoreClass, 'C');
    assert.equal(empty.indicative.amountCents, 0);
    const huge = prequalify({ digitalCents30d: 1e12, totalCents30d: 1e12, weeklyTotalsCents: [1, 1e9, 1, 1e9], retentionRate: 2, historyDays: 9999 });
    assert.ok(huge.total >= 0 && huge.total <= 100);
    assert.ok(huge.components.every((c) => c.ratio >= 0 && c.ratio <= 1));
  });

  it('os limiares e os parâmetros são configuráveis (por validar)', () => {
    assert.equal(prequalify(V1_EXAMPLE, { classBMin: 70 }).scoreClass, 'C');
    assert.equal(prequalify(V1_EXAMPLE, { costFactor: 1 }).indicative.amountCents, 10_000_000);
  });
});
