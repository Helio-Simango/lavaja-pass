// JSON Web Tokens HS256 (RFC 7519) com node:crypto, sem dependências. Implementa a porta TokenService.
// A verificação recusa qualquer algoritmo que não seja HS256 (incluindo "none") e compara a
// assinatura em tempo constante. Validade, emissor e audiência são sempre verificados.
import crypto from 'node:crypto';

const HEADER = { alg: 'HS256', typ: 'JWT' };
const ENCODED_HEADER = base64url(JSON.stringify(HEADER));
const ISSUER = 'lavaja-pass';
const AUDIENCE = 'lavaja-pass-api';
const CLOCK_SKEW_SECONDS = 30;
export const MIN_SECRET_BYTES = 32;

export class HmacJwtTokenService {
  #key;
  #clock;

  /** @param secret pelo menos 32 bytes (JWT_SECRET) */
  constructor({ secret, clock }) {
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < MIN_SECRET_BYTES) {
      throw new Error(`O segredo dos tokens deve ter pelo menos ${MIN_SECRET_BYTES} bytes.`);
    }
    this.#key = crypto.createSecretKey(Buffer.from(secret));
    this.#clock = clock;
  }

  /** @returns {{ token: string, expiresAt: string }} */
  issue(claims, ttlMinutes) {
    const now = Math.floor(this.#clock.now().getTime() / 1000);
    const exp = now + Math.round(ttlMinutes * 60);
    const payload = { ...claims, iss: ISSUER, aud: AUDIENCE, iat: now, exp, jti: crypto.randomUUID() };
    const unsigned = `${ENCODED_HEADER}.${base64url(JSON.stringify(payload))}`;
    return { token: `${unsigned}.${this.#sign(unsigned)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** @returns as claims, ou null se o token for inválido, adulterado ou estiver expirado */
  verify(token) {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== ENCODED_HEADER) return null;
    const expected = Buffer.from(this.#sign(`${parts[0]}.${parts[1]}`));
    const given = Buffer.from(parts[2]);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

    const payload = parseJson(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || payload.iss !== ISSUER || payload.aud !== AUDIENCE) return null;
    const now = Math.floor(this.#clock.now().getTime() / 1000);
    if (!Number.isInteger(payload.exp) || payload.exp <= now) return null;
    if (!Number.isInteger(payload.iat) || payload.iat > now + CLOCK_SKEW_SECONDS) return null;
    return payload;
  }

  #sign(unsigned) {
    return crypto.createHmac('sha256', this.#key).update(unsigned).digest('base64url');
  }
}

/** Segredo aleatório quando JWT_SECRET não está definido: as sessões terminam ao reiniciar. */
export function randomSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

function base64url(text) {
  return Buffer.from(text).toString('base64url');
}

function parseJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
