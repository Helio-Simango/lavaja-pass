// Para onde voltar depois de entrar: só caminhos deste site (evita redireccionamentos para fora).

/** @returns o caminho pedido se for interno (ex.: "/gestor#campanhas"), senão a página do perfil */
export function safeReturnPath(requested, fallback) {
  const path = typeof requested === 'string' ? requested.trim() : '';
  const internal = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') && !/[\r\n]/.test(path);
  return internal && !path.startsWith('/entrar') ? path : fallback;
}
