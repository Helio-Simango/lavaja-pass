// Cliente da API: JSON in, JSON out. Os erros chegam como { error: { code, message, details? } }.

export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message ?? `Erro ${status}`);
    this.status = status;
    this.code = error?.code;
    this.details = error?.details;
  }
}

/** @param options { actor?, idempotencyKey? } */
export async function api(method, path, body, { actor, idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (actor) headers['X-Actor'] = actor;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error);
  return data;
}

/** Uma chave por intenção do utilizador: repetir o envio (duplo clique, rede) não duplica o registo. */
export function newIdempotencyKey() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
