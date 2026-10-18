// Sessões HTTP (I-11). O token JWT viaja num cookie HttpOnly + SameSite=Strict, um por perfil, para
// que o operador, o gestor, o analista e o cliente possam estar abertos no mesmo browser durante a
// demonstração. A página indica o perfil no cabeçalho X-Session-Profile; quem autoriza é sempre o
// perfil gravado no token. Clientes da API podem usar "Authorization: Bearer <token>".
import { assertPermission, Role } from '../../domain/access.js';
import { UnauthenticatedError } from '../../domain/errors.js';

export const SESSION_PROFILES = Object.freeze({
  operador: { role: Role.OPERATOR, cookie: 'lj_operador', home: '/operador' },
  gestor: { role: Role.MANAGER, cookie: 'lj_gestor', home: '/gestor' },
  analista: { role: Role.BANK_ANALYST, cookie: 'lj_analista', home: '/moza' },
  cliente: { role: Role.CUSTOMER, cookie: 'lj_cliente', home: '/cliente' },
});

const PROFILE_HEADER = 'x-session-profile';

export function profileOfRole(role) {
  return Object.keys(SESSION_PROFILES).find((profile) => SESSION_PROFILES[profile].role === role);
}

/** Lê a sessão de cada pedido; não recusa nada (isso é com allow). Um token inválido fica registado. */
export function createAuthenticator(authService) {
  return function authenticate(req, res, next) {
    req.session = null;
    const token = tokenOf(req);
    if (token) {
      try {
        req.session = authService.authenticate(token);
      } catch (error) {
        req.sessionError = error;
      }
    }
    next();
  };
}

/** Só deixa passar sessões cujo perfil tem a permissão. */
export function allow(permission) {
  return function authorize(req, res, next) {
    if (!req.session && req.sessionError) throw req.sessionError;
    assertPermission(req.session, permission);
    next();
  };
}

/** Sessão de uma página (sem cabeçalhos): o cookie do perfil indicado. */
export function pageSession(req, authService, profile) {
  const token = readCookies(req)[SESSION_PROFILES[profile].cookie];
  if (!token) return null;
  try {
    const session = authService.authenticate(token);
    return session.role === SESSION_PROFILES[profile].role ? session : null;
  } catch {
    return null;
  }
}

/**
 * O JWT só vive neste cookie: HttpOnly (o JavaScript da página não o lê), SameSite=Strict (não segue
 * pedidos vindos de outros sites), Secure atrás de HTTPS e com a duração da sessão. A duração vai em
 * Max-Age (relativa), para não depender do relógio do browser; Expires fica para browsers antigos.
 */
export function setSessionCookie(res, role, { token, expiresAt }, { secure, now }) {
  const profile = profileOfRole(role);
  res.cookie(SESSION_PROFILES[profile].cookie, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/',
    maxAge: Math.max(0, Date.parse(expiresAt) - now.getTime()),
    priority: 'high',
  });
  return profile;
}

export function clearSessionCookie(res, profile, { secure }) {
  res.clearCookie(SESSION_PROFILES[profile].cookie, { httpOnly: true, sameSite: 'strict', secure, path: '/' });
}

export function requestedProfile(req) {
  const profile = req.get(PROFILE_HEADER);
  return Object.hasOwn(SESSION_PROFILES, profile ?? '') ? profile : null;
}

function tokenOf(req) {
  const header = req.get('authorization');
  if (header) {
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) throw new UnauthenticatedError('Cabeçalho Authorization inválido.');
    return value;
  }
  const profile = requestedProfile(req);
  return profile ? readCookies(req)[SESSION_PROFILES[profile].cookie] ?? null : null;
}

function readCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // cookie mal formado: ignorado
    }
  }
  return cookies;
}
