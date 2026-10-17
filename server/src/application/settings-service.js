// Parâmetros configuráveis. Os valores marcados "por validar" são de demonstração.

export class SettingsService {
  #settings;
  #clock;

  constructor({ settingsRepository, clock }) {
    this.#settings = settingsRepository;
    this.#clock = clock;
  }

  list() {
    return this.#settings.list();
  }

  get(key, fallback) {
    return this.#settings.find(key)?.value ?? fallback;
  }

  /** Define o parâmetro só se ainda não existir (não sobrepõe valores já configurados). */
  define({ key, value, description, toValidate = true }) {
    this.#settings.insertIfMissing({ key, value, description, toValidate }, this.#clock.nowIso());
  }
}
