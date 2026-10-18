// Sessão da página: confirma o perfil (o servidor também protege cada página e cada rota),
// mostra quem está e trata da saída.
import { api, loginUrl, useSession } from './api-client.js';

/** @returns a sessão do perfil, ou redirecciona para a entrada */
export async function requireSession(profile) {
  useSession(profile);
  try {
    return (await api('GET', '/auth/session')).session;
  } catch {
    location.assign(loginUrl(profile));
    return new Promise(() => {}); // a página vai mudar
  }
}

export function bindLogout(button, profile) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api('POST', '/auth/logout', {});
    } finally {
      location.assign(`/entrar?perfil=${profile}`);
    }
  });
}

/** "Z. Cossa" -> "Z. Cossa"; "Amílcar" -> "Amílcar" (sem inventar tratamentos). */
export function firstName(name) {
  return String(name ?? '').split(' ')[0];
}
