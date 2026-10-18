// Hash de senhas, PINs e códigos com scrypt (node:crypto). Implementa a porta PasswordHasher.
// Formato guardado: scrypt$N$r$p$sal$hash (base64url), para poder subir o custo sem invalidar os existentes.
import crypto from 'node:crypto';

const KEY_LENGTH = 32;
const SALT_BYTES = 16;
const DEFAULT_COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

export class ScryptPasswordHasher {
  #cost;

  /** @param cost N do scrypt (potência de 2). Os testes usam um custo baixo para correr depressa. */
  constructor({ cost = DEFAULT_COST } = {}) {
    this.#cost = cost;
  }

  hash(secret) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const key = derive(secret, salt, this.#cost, BLOCK_SIZE, PARALLELISM);
    return ['scrypt', this.#cost, BLOCK_SIZE, PARALLELISM, salt.toString('base64url'), key.toString('base64url')].join('$');
  }

  verify(secret, stored) {
    const [scheme, n, r, p, salt, hash] = String(stored ?? '').split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const actual = derive(secret, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
}

function derive(secret, salt, N, r, p) {
  return crypto.scryptSync(String(secret).normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY });
}

/** Números aleatórios criptograficamente seguros (códigos de acesso). */
export const secureRandom = Object.freeze({
  digits(length) {
    return Array.from({ length }, () => crypto.randomInt(0, 10)).join('');
  },
});
