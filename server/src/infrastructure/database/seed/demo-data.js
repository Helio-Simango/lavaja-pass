// Dados de demonstração. Todos os valores são ilustrativos e estão por validar (D-19, D-20).

export const VEHICLE_CLASSES = [
  { code: 'A', name: 'Classe A', description: 'Viaturas ligeiras de passageiros, como hatchbacks e sedans' },
  {
    code: 'B',
    name: 'Classe B',
    description: 'Viaturas de maiores dimensões, como SUVs, 4x4 e determinadas carrinhas de caixa aberta (pickups)',
  },
  { code: 'C', name: 'Classe C', description: 'Viaturas de maiores dimensões ou comerciais ligeiras, como vans e minibus' },
];

// Preços em MZN por classe (null = sem preço). O Polimento está indisponível e sem preço
// na classe C de propósito: demonstra as duas recusas.
export const WASH_PLANS = [
  { code: 'SIMPLES', name: 'Simples', description: 'Exterior', durationMin: 30, active: true, prices: { A: 250, B: 350, C: 450 } },
  { code: 'COMPLETA', name: 'Completa', description: 'Exterior e interior', durationMin: 50, active: true, prices: { A: 450, B: 600, C: 750 } },
  {
    code: 'COMPLETA_MOTOR',
    name: 'Completa + Motor',
    description: 'Exterior, interior e motor',
    durationMin: 75,
    active: true,
    prices: { A: 700, B: 900, C: 1100 },
  },
  { code: 'POLIMENTO', name: 'Polimento', description: 'Polimento da pintura', durationMin: 120, active: false, prices: { A: 1500, B: 2000, C: null } },
];

export const STATIONS = ['P1', 'P2', 'P3', 'P4'];

export const SETTINGS = [
  { key: 'business.name', value: 'Lava Já – Matola', description: 'Lavadora do caso do hackathon (dados de demonstração)' },
  { key: 'business.currency', value: 'MZN', description: 'Moeda dos preços', toValidate: false },
  {
    key: 'business.openWeekdays',
    value: [1, 2, 3, 4, 5, 6, 7],
    description: 'Dias de funcionamento declarados pela lavadora (1 = segunda … 7 = domingo)',
  },
  {
    key: 'scheduling.policy',
    value: {
      openingHours: { open: '07:00', close: '18:00' },
      slotMinutes: 30,
      safetyMarginMin: 10,
      workers: 3,
      confirmation: 'manual',
      lateToleranceMin: 15,
      reservedStationsForQueue: 0,
      offerResponseMinutes: 15,
      autoOffers: true,
    },
    description:
      'Marcações (por validar): horário e trabalhadores declarados; margem de segurança (proposta); D-09 confirmação manual; D-10 tolerância de 15 min; D-12 sem reserva para a fila; D-14 propor o horário libertado; D-11 e D-13 sem penalizações nem depósitos',
  },
  { key: 'business.owner', value: 'Z. Cossa', description: 'Titular da lavadora (fictício, dados de demonstração)' },
  {
    key: 'business.bankAccount',
    value: 'Conta Moza 0023-****-01',
    description: 'Conta do comerciante mostrada ao analista (fictícia e mascarada, dados de demonstração)',
  },
  {
    key: 'prequalification.params',
    value: {
      volumeReferenceCents: 10_000_000,
      historyReferenceDays: 180,
      classAMin: 75,
      classBMin: 60,
      retentionShare: 0.1,
      termMonths: 12,
      costFactor: 1.25,
      roundingCents: 500_000,
    },
    description:
      'Score de pré-qualificação (proposta v1, secção 8), por validar com o banco: volume de referência 100.000 MZN, antiguidade de referência 180 dias, classes A ≥ 75 e B ≥ 60, retenção de 10% dos recebimentos digitais, 12 meses, factor de custo ilustrativo 1,25',
  },
  {
    key: 'campaigns.policy',
    value: { minInactiveDays: 14, cooldownDays: 7, attributionDays: 7 },
    description:
      'Campanhas fora de pico (proposta v1, secção 7.5), por validar: clientes sem lavar há 14+ dias, no máximo uma campanha em 7 dias, resultado medido até 7 dias após o envio. Envio sempre confirmado pelo gestor.',
  },
  {
    key: 'demo.institution',
    value: 'Moza Banco',
    description:
      'Instituição usada na demonstração da vertente Banco (I-7): dono do desafio e patrocinador do hackathon. Sem parceria formal.',
  },
];

// Clientes fictícios; matrículas dos mocks do documento de referência.
export const CUSTOMERS = [
  { phone: '84 555 0101', name: 'Amélia Macuácua', consents: { loyalty: true, marketing: true, source: 'balcão' }, vehicles: [{ plate: 'ACX 731 MC', classId: 'B', description: 'Toyota Hilux' }] },
  { phone: '82 555 0102', name: 'Carlos Sitoe', consents: { loyalty: true, marketing: false, source: 'balcão' }, vehicles: [{ plate: 'AHM 482 MP', classId: 'A', description: 'Toyota Corolla' }] },
  { phone: '85 555 0103', name: 'Fátima Nhantumbo', consents: { loyalty: true, marketing: true, source: 'balcão' }, vehicles: [{ plate: 'ABC 123 MC', classId: 'B', description: 'Toyota RAV4' }] },
  { phone: '86 555 0104', name: 'Jorge Cossa', consents: { loyalty: true, marketing: false, source: 'balcão' }, vehicles: [{ plate: 'MMC 552 MP', classId: 'C', description: 'Toyota Hiace' }] },
  { phone: '87 555 0105', name: 'Luísa Tembe', consents: { loyalty: true, marketing: false, source: 'balcão' }, vehicles: [{ plate: 'AGB 550 MP', classId: 'A', description: 'Honda Fit' }] },
  {
    phone: '84 555 0106',
    name: 'Paulo Mabunda',
    consents: { loyalty: true, marketing: true, source: 'balcão' },
    vehicles: [
      { plate: 'AAZ 219 MP', classId: 'A', description: 'Mazda Demio' },
      { plate: 'ANT 145 MC', classId: 'C', description: 'Nissan Caravan' },
    ],
  },
];

// Parâmetros de demonstração do programa de fidelização, por validar (D-01 a D-07):
// - D-01: alternativa C com N = 1 ciclo por nível (equivale à B);
// - nível 3 inactivo (maxActiveLevel 2) até à análise de custos (cap. 11.5, D-07);
// - D-02: lavagem gratuita do plano Simples (o cliente paga a diferença se escolher outro plano);
// - D-03: o serviço gratuito não conta para o progresso; D-04: nível por classe; D-06: não acumula.
export const DEMO_LOYALTY_RULES = {
  cycleSize: 10,
  levels: [{ benefitsPerCycle: 1 }, { benefitsPerCycle: 2 }, { benefitsPerCycle: 3 }],
  maxActiveLevel: 2,
  levelUp: { mode: 'cycles', cyclesPerLevel: 1 },
  levelScope: 'class',
  benefit: { type: 'free_wash', planCode: 'SIMPLES' },
  freeWashCountsTowardsProgress: false,
  stacksWithPromotions: false,
};

// Histórico dos últimos 30 dias: lavagens concluídas e pagas (contam para a fidelização) e
// algumas entregues sem pagamento (não contam). A Amélia fecha um ciclo na classe B (1 benefício);
// o Carlos fica a uma lavagem de fechar o ciclo na classe A.
export const HISTORY_DAYS = 30;
export const WASH_HISTORY_PLAN = [
  { plate: 'ACX731MC', plan: 'COMPLETA', paid: 10, unpaid: 0 },
  { plate: 'AHM482MP', plan: 'SIMPLES', paid: 9, unpaid: 1 },
  { plate: 'ABC123MC', plan: 'COMPLETA', paid: 4, unpaid: 0 },
  { plate: 'AAZ219MP', plan: 'SIMPLES', paid: 5, unpaid: 1 },
  { plate: 'MMC552MP', plan: 'COMPLETA_MOTOR', paid: 3, unpaid: 0 },
  { plate: 'AGB550MP', plan: 'COMPLETA', paid: 2, unpaid: 0 },
  { plate: 'ANT145MC', plan: 'SIMPLES', paid: 1, unpaid: 0 },
];
export const CASH_OPERATORS = ['Amílcar', 'Bento'];

// Pátio coerente com o mock M7, construído ao longo de 90 min antes de "agora":
// P1 em execução, P2 pronto (por pagar), dois serviços em fila, um deles já pago em digital (simulado).
export const YARD_TIMELINE = [
  { atMin: 0, register: { key: 'ready', plate: 'AGB550MP', plan: 'COMPLETA' } },
  { atMin: 0, transition: { key: 'ready', to: 'in_progress', station: 'P2', actor: 'Amílcar' } },
  { atMin: 20, register: { key: 'running', plate: 'MMC552MP', plan: 'COMPLETA_MOTOR' } },
  { atMin: 65, transition: { key: 'running', to: 'in_progress', station: 'P1', actor: 'Bento' } },
  { atMin: 80, register: { key: 'queued1', plate: 'ABC123MC', plan: 'COMPLETA' } },
  { atMin: 87, transition: { key: 'ready', to: 'ready', actor: 'Amílcar' } },
  { atMin: 88, register: { key: 'queued2', plate: 'AAZ219MP', plan: 'SIMPLES' } },
  { atMin: 89, payDigital: { key: 'queued2' } },
];

export const YARD_START_OFFSET_MIN = 90;

// Vertente Banco (I-7): o Moza Banco, dono do desafio e patrocinador do hackathon, como instituição
// de demonstração. Não existe parceria formal nem compromisso do banco (DEC-14).
export const DEMO_INSTITUTION = { code: 'MOZA', name: 'Moza Banco' };

export const DEMO_AUTHORIZATIONS = [
  {
    daysAgo: 20,
    purpose: 'Demonstração inicial do relatório de actividade',
    sections: ['activity', 'receipts'],
    dataMonths: 3,
    validDays: 30,
    revoke: { daysAgo: 12, reason: 'Demonstração concluída' },
  },
  {
    daysAgo: 2,
    purpose: 'Financiamento de equipamento: compressor de alta pressão e aspirador industrial',
    sections: ['activity', 'receipts', 'customers', 'data_quality', 'prequalification'],
    dataMonths: 6,
    validDays: 30,
    viewedDaysAgo: 1,
  },
];
// Contas de demonstração (I-11, D-16): credenciais públicas, só para a demonstração.
// Operadores entram com nome + PIN (M6); o gestor e o analista com email + senha.
export const DEMO_BUSINESS_OWNER = 'Z. Cossa';
export const DEMO_ANALYST = 'Analista PME · Agência Matola';
export const DEMO_USERS = [
  { role: 'operator', name: 'Amílcar', pin: '1234' },
  { role: 'operator', name: 'Bento', pin: '2345' },
  { role: 'operator', name: 'Délcio', pin: '3456' },
  { role: 'operator', name: 'Fátima', pin: '4567' },
  { role: 'manager', name: DEMO_BUSINESS_OWNER, email: 'gestor@lavaja.demo', password: 'LavaJa-2026' },
  { role: 'bank_analyst', name: DEMO_ANALYST, email: 'analista@moza.demo', password: 'MozaDemo-2026', institution: 'MOZA' },
];

// Marcações de demonstração (mock M7/M10), no dia de hoje se ainda for de manhã, senão amanhã.
// A do Carlos teve uma proposta de antecipação recusada: mantém-se às 15:00 (DEC-10).
export const DEMO_APPOINTMENTS = [
  { plate: 'ACX731MC', plan: 'COMPLETA', time: '14:00', confirm: true },
  { plate: 'AHM482MP', plan: 'COMPLETA', time: '15:00', confirm: true, declinedOffer: '12:00' },
  { plate: 'ANT145MC', plan: 'SIMPLES', time: '16:30', confirm: false },
];
export const LATEST_LOCAL_HOUR_FOR_SAME_DAY = 11;
