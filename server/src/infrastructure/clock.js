// Relógio injectável: permite gerar histórico de demonstração e testar regras dependentes de datas.

export const systemClock = Object.freeze({
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
});

export function createFixedClock(startIso = '2026-10-22T08:00:00.000Z') {
  let currentMs = Date.parse(startIso);
  return {
    now: () => new Date(currentMs),
    nowIso: () => new Date(currentMs).toISOString(),
    set(iso) {
      currentMs = Date.parse(iso);
    },
    advanceMinutes(minutes) {
      currentMs += minutes * 60_000;
    },
  };
}
