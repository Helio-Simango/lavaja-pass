// Nome do operador. Sem autenticação (D-16): é declarado, fica registado como autor e é
// lembrado neste browser por conveniência.

const STORAGE_KEY = 'lavaja.operator';
const FALLBACK = 'operador';

export function bindOperatorInput(input) {
  input.value = readStored();
  input.addEventListener('change', () => store(input.value.trim()));
  return () => input.value.trim() || FALLBACK;
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function store(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Armazenamento indisponível (janela privada): o nome vale só para esta sessão.
  }
}
