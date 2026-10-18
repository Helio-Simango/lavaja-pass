// Cliente da API: JSON in, JSON out. Os erros chegam como { error: { code, message, details? } }.
// A sessão viaja num cookie HttpOnly por perfil; a página diz qual com useSession(perfil).

export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message ?? `Erro ${status}`);
    this.status = status;
    this.code = error?.code;
    this.details = error?.details;
  }
}

let sessionProfile = null;

/** A partir daqui, os pedidos usam a sessão deste perfil; sem sessão válida, volta à entrada. */
export function useSession(profile) {
  sessionProfile = profile;
}

export function loginUrl(profile, back = location.pathname + location.search + location.hash) {
  return `/entrar?perfil=${encodeURIComponent(profile)}&volta=${encodeURIComponent(back)}`;
}

/** @param options { idempotencyKey? } */
export async function api(method, path, body, { idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionProfile) headers['X-Session-Profile'] = sessionProfile;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (response.status === 401 && sessionProfile && !path.startsWith('/auth/')) {
    location.assign(loginUrl(sessionProfile));
  }
  if (!response.ok) throw new ApiError(response.status, data?.error);
  return data;
}

/** Uma chave por intenção do utilizador: repetir o envio (duplo clique, rede) não duplica o registo. */
export function newIdempotencyKey() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
