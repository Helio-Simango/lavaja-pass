# Arquitectura

## Visão geral

```
┌────────────── Browser (HTML + CSS + JS puro) ──────────────┐
│  client/  (/ · /patio · …)        simulador/  (/simulador)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch JSON (consulta a cada 3 s)
┌──────────────────────────▼──────────────────────────────────┐
│ server/src/interfaces/http   Express: rotas → controladores │
│                              request.js · presenters.js     │
├─────────────────────────────────────────────────────────────┤
│ server/src/application       casos de uso (*-service.js)    │
│                              portas (ports.js)              │
├─────────────────────────────────────────────────────────────┤
│ server/src/domain            regras puras e erros de domínio│
└─────────────────────────────────────────────────────────────┘
        ▲ implementa as portas
┌───────┴─────────────────────────────────────────────────────┐
│ server/src/infrastructure    SQLite (node:sqlite): ligação, │
│                              migrações, unidade de trabalho,│
│                              repositórios · relógio · seed  │
└─────────────────────────────────────────────────────────────┘
  server/src/container.js  liga tudo · server/src/main.js  arranca
```

**Regra de dependências:** cada camada só conhece as camadas mais internas. O domínio não sabe que existe base de dados nem HTTP. Os casos de uso não sabem que a base é SQLite. A interface HTTP não acede a repositórios. O teste `server/test/unit/architecture.test.js` garante esta regra.

## Camadas

### Domínio (`server/src/domain`)

Funções puras, testáveis sem base de dados:

| Módulo | Responsabilidade |
|---|---|
| `errors.js` | `ValidationError`, `NotFoundError`, `ConflictError` (sem códigos HTTP) |
| `phone.js` · `plate.js` · `money.js` · `customer.js` | Valores: normalização, validação e formatação |
| `vehicle-class.js` | Classes A, B e C; referência por código ou id |
| `plan.js` | Regra de aceitação: plano activo e com preço para a classe |
| `wash.js` | Retrato do preço de um novo serviço e decisão de cada transição (`planTransition`) |
| `queue-estimates.js` | Estimativas de início e fim da fila |

`planTransition` recebe o serviço e o contexto já carregado (posto, ocupação, hora). Devolve as alterações e o evento de auditoria, ou lança o erro da regra violada. Não grava nada.

### Aplicação (`server/src/application`)

Um serviço por área (catálogo, clientes, serviços, postos, parâmetros). Cada caso de uso:

1. lê o que precisa através dos repositórios (portas);
2. chama o domínio para decidir;
3. grava dentro de `unitOfWork.run(...)`;
4. devolve dados (sem formatação de ecrã).

### Infraestrutura (`server/src/infrastructure`)

- **`database/connection.js`:** abre o SQLite com chaves estrangeiras, WAL e `busy_timeout`.
- **`database/migrator.js` e `migrations/NNN_*.sql`:** uma migração por marco, aplicadas por ordem e uma única vez.
- **`database/unit-of-work.js`:** transacção; as chamadas aninhadas usam `SAVEPOINT`.
- **`database/repositories/`:** SQL e conversão entre linhas `snake_case` e objectos `camelCase`.
- **`database/seed/`:** dados de demonstração (`demo-data.js`) e carregamento (`demo-seeder.js`). Os clientes e serviços passam pelos casos de uso.
- **`clock.js`:** relógio do sistema e relógio fixo para testes e demonstração.

### Interface HTTP (`server/src/interfaces/http`)

- **`request.js`:** leitura e validação de tipos (ids, inteiros, booleanos, texto, `X-Actor`).
- **`controllers/`:** finos; lêem o pedido, chamam um caso de uso e apresentam o resultado.
- **`presenters.js`:** formato da API (`display`, `plateDisplay`, rótulos de estado e pagamento).
- **`middleware/error-handler.js`:** traduz os erros para 400, 404, 409 ou 500, no formato `{ error: { code, message, details? } }`.
- **`app.js`:** monta `/api`, serve `client/` e `simulador/`.

## Cliente (`client/`)

- **`js/core/`:**
  - `api-client.js` faz as chamadas à API;
  - `dom.js` tem os utilitários de interface e o `escapeHtml`;
  - `operator.js` guarda o nome do operador.
- **`js/patio/`:**
  - `main.js` faz a ligação e a actualização a cada 3 s;
  - `board-view.js` desenha o quadro;
  - `register-dialog.js` trata o registo de serviço (M8);
  - `confirm-dialog.js` trata as confirmações.

## Testes (`server/test`)

- **`unit/`:** domínio, configuração e regra de arquitectura.
- **`integration/`:** base de dados (restrições, triggers, unidade de trabalho) e API HTTP real sobre uma base em memória, com o relógio fixo em 2026-10-22 08:00 UTC.
