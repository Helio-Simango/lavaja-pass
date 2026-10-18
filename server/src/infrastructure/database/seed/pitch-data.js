// Volume "pitch": a base única de demonstração da proposta v1 (secção 2.1), gerada de forma
// determinística. 30 dias com a semana média 8·6·7·8·14·24·18 (seg → dom), mix de serviços
// 45% Simples / 45% Completa / 10% Motor, ~62% digital, 212 clientes e ~48% de retorno.
// Todos os nomes, telefones e matrículas são fictícios.

export const PITCH_CUSTOMERS_TOTAL = 212;
export const PITCH_RETURN_SHARE = 0.48;
export const PITCH_WEEKDAY_WASHES = [8, 6, 7, 8, 14, 24, 18]; // segunda … domingo
export const PITCH_PLAN_MIX = [
  ['SIMPLES', 0.45],
  ['COMPLETA', 0.45],
  ['COMPLETA_MOTOR', 0.1],
];
export const PITCH_CLASS_MIX = [
  ['A', 0.85],
  ['B', 0.12],
  ['C', 0.03],
];
export const PITCH_DIGITAL_SHARE = 0.62;
export const PITCH_UNPAID_SHARE = 0.02;
export const PITCH_MARKETING_CONSENT_SHARE = 0.7;
export const PITCH_OPERATORS = ['Amílcar', 'Bento', 'Délcio', 'Fátima'];

const FIRST_NAMES = [
  'Abel', 'Acácio', 'Adelina', 'Alberto', 'Alda', 'Anabela', 'Armando', 'Arsénio', 'Benedita', 'Benvinda',
  'Celso', 'Cidália', 'Dércio', 'Dina', 'Edson', 'Elsa', 'Ernesto', 'Esperança', 'Felizardo', 'Flávia',
  'Gervásio', 'Graça', 'Hélder', 'Hortência', 'Ilídio', 'Isabel', 'Joaquim', 'Júlia', 'Lourenço', 'Lurdes',
  'Manuel', 'Marta', 'Nelson', 'Nilza', 'Orlando', 'Olga', 'Pedro', 'Rosa', 'Sérgio', 'Telma',
];
const LAST_NAMES = [
  'Bila', 'Chauque', 'Chissano', 'Cumbe', 'Langa', 'Macamo', 'Machava', 'Magaia', 'Maluleque', 'Manhiça',
  'Matsinhe', 'Mondlane', 'Muianga', 'Mungoi', 'Nhaca', 'Nhamuave', 'Novela', 'Sambo', 'Sitoe', 'Zandamela',
];

/** Gerador pseudo-aleatório com semente (mulberry32): a mesma base em cada reposição. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick(random, weighted) {
  let roll = random();
  for (const [value, weight] of weighted) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return weighted.at(-1)[0];
}

/** Clientes de fundo (além dos clientes de demonstração com nome do roteiro). */
export function pitchCustomers(count, random) {
  return Array.from({ length: count }, (_, index) => {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length + index) % LAST_NAMES.length];
    const letters = String.fromCharCode(65 + (index % 26), 65 + (Math.floor(index / 26) % 26));
    return {
      phone: `84 600 ${String(index + 1).padStart(4, '0')}`,
      name: `${first} ${last}`,
      consents: { loyalty: random() < 0.9, marketing: random() < PITCH_MARKETING_CONSENT_SHARE, source: 'balcão' },
      vehicles: [{ plate: `A${letters} ${String(100 + index).padStart(3, '0')} MP`, classId: pick(random, PITCH_CLASS_MIX) }],
    };
  });
}

/**
 * Visitas por cliente: ~52% vêm uma vez, os restantes duas ou três (retorno ~48%).
 * @returns lista de índices de cliente, uma entrada por visita, com tamanho = slots
 */
export function pitchVisits(customers, slots) {
  const repeat = Math.round(customers * PITCH_RETURN_SHARE);
  const once = customers - repeat;
  const visits = [];
  for (let c = 0; c < customers; c += 1) visits.push(c);
  for (let c = once; c < customers && visits.length < slots; c += 1) visits.push(c);
  for (let c = once; c < customers && visits.length < slots; c += 1) visits.push(c);
  return visits.slice(0, slots);
}

export function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
