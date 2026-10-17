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
    key: 'demo.institution',
    value: 'Moza Banco',
    description:
      'Instituição usada na demonstração da vertente Banco (I-7): dono do desafio e patrocinador do hackathon. Sem parceria formal.',
  },
];

// Clientes fictícios; matrículas dos mocks do documento de referência.
export const CUSTOMERS = [
  { phone: '84 555 0101', name: 'Amélia Macuácua', vehicles: [{ plate: 'ACX 731 MC', classId: 'B', description: 'Toyota Hilux' }] },
  { phone: '82 555 0102', name: 'Carlos Sitoe', vehicles: [{ plate: 'AHM 482 MP', classId: 'A', description: 'Toyota Corolla' }] },
  { phone: '85 555 0103', name: 'Fátima Nhantumbo', vehicles: [{ plate: 'ABC 123 MC', classId: 'B', description: 'Toyota RAV4' }] },
  { phone: '86 555 0104', name: 'Jorge Cossa', vehicles: [{ plate: 'MMC 552 MP', classId: 'C', description: 'Toyota Hiace' }] },
  { phone: '87 555 0105', name: 'Luísa Tembe', vehicles: [{ plate: 'AGB 550 MP', classId: 'A', description: 'Honda Fit' }] },
  {
    phone: '84 555 0106',
    name: 'Paulo Mabunda',
    vehicles: [
      { plate: 'AAZ 219 MP', classId: 'A', description: 'Mazda Demio' },
      { plate: 'ANT 145 MC', classId: 'C', description: 'Nissan Caravan' },
    ],
  },
];

// Pátio coerente com o mock M7, construído ao longo de 90 min antes de "agora":
// P1 em execução, P2 pronto, dois serviços em fila.
export const YARD_TIMELINE = [
  { atMin: 0, register: { key: 'ready', plate: 'AGB550MP', plan: 'COMPLETA' } },
  { atMin: 0, transition: { key: 'ready', to: 'in_progress', station: 'P2', actor: 'Amílcar' } },
  { atMin: 20, register: { key: 'running', plate: 'MMC552MP', plan: 'COMPLETA_MOTOR' } },
  { atMin: 65, transition: { key: 'running', to: 'in_progress', station: 'P1', actor: 'Bento' } },
  { atMin: 80, register: { key: 'queued1', plate: 'ABC123MC', plan: 'COMPLETA' } },
  { atMin: 87, transition: { key: 'ready', to: 'ready', actor: 'Amílcar' } },
  { atMin: 88, register: { key: 'queued2', plate: 'AAZ219MP', plan: 'SIMPLES' } },
];

export const YARD_START_OFFSET_MIN = 90;
