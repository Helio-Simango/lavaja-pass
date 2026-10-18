import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');
export const CLIENT_DIR = path.join(ROOT_DIR, 'client');
export const SIMULATOR_DIR = path.join(ROOT_DIR, 'simulador');
export const MIGRATIONS_DIR = path.join(SERVER_DIR, 'src', 'infrastructure', 'database', 'migrations');

const PUBLIC_DIRS = [CLIENT_DIR, SIMULATOR_DIR];

export function resolveDbPath(env = process.env) {
  const dbPath = env.DB_PATH ? path.resolve(ROOT_DIR, env.DB_PATH) : path.join(SERVER_DIR, 'data', 'lavaja.db');
  // A base de dados nunca pode ficar numa pasta servida ao browser.
  const servedDir = PUBLIC_DIRS.find((dir) => dbPath === dir || dbPath.startsWith(dir + path.sep));
  if (servedDir) throw new Error(`DB_PATH não pode ficar dentro de ${path.relative(ROOT_DIR, servedDir)}/: ${dbPath}`);
  return dbPath;
}

const MIN_JWT_SECRET_BYTES = 32;

/** Segredo das sessões: ausente (aleatório) ou com 32+ bytes. Falha logo no arranque, com a forma de o gerar. */
export function resolveJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET?.trim() || null;
  if (secret && Buffer.byteLength(secret) < MIN_JWT_SECRET_BYTES) {
    throw new Error(
      `JWT_SECRET tem ${Buffer.byteLength(secret)} bytes; são precisos pelo menos ${MIN_JWT_SECRET_BYTES}. ` +
        'Gere um com: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return secret;
}

export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  return Object.freeze({
    port,
    // Endereço usado nos links enviados na conversa (ex.: pagamento). Num telemóvel, use o IP da máquina.
    publicUrl: env.PUBLIC_URL?.trim() || `http://localhost:${port}`,
    host: env.HOST ?? '127.0.0.1',
    dbPath: resolveDbPath(env),
    // Reposição da demonstração pela API: desactivada se não houver token (cap. 14.4).
    demoResetToken: env.DEMO_RESET_TOKEN?.trim() || null,
    // Assinatura das sessões (I-11). Sem JWT_SECRET, um segredo aleatório: as sessões terminam ao reiniciar.
    jwtSecret: resolveJwtSecret(env),
    // Cookies só por HTTPS: ligar quando o servidor estiver atrás de HTTPS.
    secureCookies: env.COOKIE_SECURE === 'true',
  });
}
