// Relógio injectável: permite gerar histórico de demonstração e testar regras dependentes de datas.

export const systemClock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
};

export function createFixedClock(start = '2026-10-22T08:00:00.000Z') {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    nowIso: () => new Date(current).toISOString(),
    set(iso) {
      current = new Date(iso).getTime();
    },
    advanceMinutes(minutes) {
      current += minutes * 60_000;
    },
  };
}
