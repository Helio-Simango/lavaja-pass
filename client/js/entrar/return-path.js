// Para onde voltar depois de entrar: só caminhos deste site (evita redireccionamentos para fora)
// e só dentro da área do perfil que entrou. Quem pediu /cliente e acabou por entrar como gestor
// vai para /gestor; seguir o /cliente devolvia-o à entrada, sem sessão de cliente.

/** @returns o caminho pedido se for interno e da área do perfil (ex.: "/gestor#campanhas"), senão a página do perfil */
export function safeReturnPath(requested, home) {
  const path = typeof requested === 'string' ? requested.trim() : '';
  const internal = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') && !/[\r\n]/.test(path);
  return internal && belongsTo(path, home) ? path : home;
}

function belongsTo(path, home) {
  return path === home || ['/', '?', '#'].some((separator) => path.startsWith(home + separator));
}
