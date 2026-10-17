// Cliente da API: JSON in, JSON out. Os erros chegam como { error: { code, message, details? } }.

export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message ?? `Erro ${status}`);
    this.status = status;
    this.code = error?.code;
    this.details = error?.details;
  }
}

export async function api(method, path, body, { actor } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (actor) headers['X-Actor'] = actor;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error);
  return data;
}
