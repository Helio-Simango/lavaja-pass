# Changelog

## [Unreleased]

### I-3 · Pagamentos simulados e numerário declarado

- Migração `004_payments`:
  - métodos `digital` e `cash`;
  - estados `pending`, `confirmed`, `declared`, `failed` e `refunded`;
  - índices únicos parciais: um pagamento pendente e um efectivo por serviço;
  - o numerário tem sempre um operador e o digital nunca tem.
- Domínio `payment.js`:
  - aceitação: valor exacto, serviço não cancelado, sem pagamento efectivo;
  - simulação do digital;
  - declaração de numerário com operador e confirmação explícita;
  - reembolso com motivo e autor.
- Idempotência obrigatória (`Idempotency-Key`) ao pagar e ao reembolsar. Uma chave reutilizada noutro pedido é recusada (`IDEMPOTENCY_KEY_REUSED`).
- Ciclo de vida do serviço:
  - concluir com pagamento efectivo dispensa `allowUnpaid`;
  - cancelar um serviço pago exige reembolso (`REFUND_REQUIRED`);
  - cancelar deixa sem efeito o digital pendente.
- O estado do pagamento de cada serviço fica disponível na API: `unpaid`, `pending`, `paid_digital`, `paid_cash`, `refunded`, `delivered_unpaid` ou `not_required`.
- Pátio: diálogo "Declarar numerário" (M9) e origem do pagamento em cada cartão.
- Demonstração: um serviço em fila já pago em digital (simulado), como no mock M7.
- Testes do cliente em `client/test` (`npm run test:client`), incluídos no `npm test`.

## [0.2.0] — 2026-10-17

Refactor de estrutura e de arquitectura. **Sem alterações de comportamento:** a API, as regras e o ecrã do Pátio mantêm-se.

### Estrutura do repositório

- `client/` (ex-`public/`): páginas web servidas em `/`.
- `simulador/`: lugar da interface do simulador de WhatsApp (I-5), servida em `/simulador`. O servidor já encaminha `/simulador/whatsapp/:telefone` quando `simulador/index.html` existir.
- `server/`: API, regras, scripts, testes e base de dados (`server/data/lavaja.db`).
- `CLAUDE.md`: regras de arquitectura, de negócio e de código para trabalhar com o Claude Code.
- `changelog.md` (ex-`changelogs.md`) e `docs/arquitectura.md`.

### Servidor: clean architecture

- **`domain/`:** regras puras sem I/O.
  - Valores: telefone, matrícula, dinheiro, nome, classe.
  - Aceitação de planos.
  - Ciclo de vida do serviço (`planTransition` decide e devolve as alterações e o evento de auditoria).
  - Estimativas da fila.
  - Erros de domínio sem códigos HTTP.
- **`application/`:** casos de uso (`CatalogService`, `CustomerService`, `WashService`, `StationService`, `SettingsService`) que dependem de portas (`ports.js`), não do SQLite.
- **`infrastructure/`:**
  - repositórios SQLite;
  - unidade de trabalho (`SqliteUnitOfWork`, com `SAVEPOINT` para chamadas aninhadas);
  - migrador, relógio e dados de demonstração. A cronologia do pátio passou a ser declarada em `demo-data.js`.
- **`interfaces/http/`:**
  - controladores finos;
  - `request.js` para a leitura de pedidos;
  - `presenters.js` para a formatação da API;
  - tradução dos erros de domínio para 400, 404 e 409.
- **Composição:** `container.js` é a raiz de composição e `main.js` o arranque.

### Cliente

- `client/js/core/`: `api-client.js`, `dom.js` (inclui `escapeHtml`) e `operator.js`.
- `client/js/patio/`: `main.js`, `board-view.js`, `register-dialog.js` e `confirm-dialog.js` (antes, um único `patio.js`).

### Testes

- 98 testes (`npm test`), separados em `server/test/unit` (`npm run test:unit`) e `server/test/integration` (`npm run test:integration`).
- Novos testes unitários do domínio: valores, aceitação de planos e ciclo de vida do serviço sem base de dados.
- Novo teste de arquitectura: falha se uma camada importar uma camada mais externa.

### Correcções

- O registo de alterações do preço passou a usar o nome de campo `priceCents` (antes `price_cents`), coerente com os restantes campos.

## [0.1.0] — 2026-10-17

Marcos **I-0**, **I-1** e **I-2** do plano de implementação (capítulo 17 do documento de referência v3).

### I-0 · Fundação

- Monorepositório Node.js com Express 4 (única dependência de execução) e SQLite via `node:sqlite`.
- Camadas rotas → controladores → serviços → SQLite, com erros centralizados no formato `{ error: { code, message, details? } }`.
- Base de dados:
  - ficheiro em `data/lavaja.db`, fora de `public/` (o arranque recusa um `DB_PATH` dentro de `public/`);
  - migrações SQL numeradas;
  - chaves estrangeiras e modo WAL;
  - transacções com `SAVEPOINT` para chamadas aninhadas.
- Relógio injectável para dados de demonstração e testes.
- Tabelas `settings` (parâmetros com a marca "por validar") e `change_log` (só acrescenta registos).
- Comandos `npm start`, `npm run dev`, `npm test`, `npm run db:migrate`, `npm run db:seed` e `npm run db:reset`.
- Página inicial com o aviso de protótipo e os módulos por marco.
- Parâmetro `demo.institution = "Moza Banco"`, que dá o foco da vertente Banco na demonstração (ver `docs/decisoes.md`).

### I-1 · Catálogo, clientes e viaturas

- Exactamente três classes (A, B, C), garantidas por `CHECK` na base e sem rota de criação.
- Planos com preço por classe em centavos. O Polimento de demonstração está inactivo e sem preço na classe C, para mostrar as duas recusas.
- Telefones normalizados para `2588XXXXXXXX` (móveis 82–87) e únicos.
- Matrículas normalizadas e únicas por jurisdição. Uma matrícula noutro cliente é recusada (`PLATE_TAKEN`).
- Um cliente pode ter várias viaturas. A reclassificação fica no registo de alterações.
- As alterações a planos e preços ficam registadas (quem, quando, valor anterior e novo).
- Regra de aceitação `resolvePrice`: recusa planos inactivos (`PLAN_INACTIVE`) e planos sem preço para a classe (`PRICE_NOT_DEFINED`).

### I-2 · Serviços, fila, postos e estimativas; Pátio

- Serviços com o retrato do preço (classe, plano, duração, preço base, desconto, benefício, preço final). Restrição na base: `final = base − desconto − benefício ≥ 0`.
- Ciclo de vida do cap. 10.3:
  - transições inválidas → `409 INVALID_TRANSITION`;
  - repetir o pedido não tem efeitos;
  - estados finais protegidos por trigger.
- Postos P1–P4. Um posto só tem um serviço activo e uma viatura só tem um serviço activo no pátio (índices únicos parciais).
- Concluir sem pagamento exige `allowUnpaid: true`, que fica registado na auditoria. O cancelamento exige motivo.
- Auditoria de todas as transições em `wash_status_events` (só acrescenta registos).
- Estimativas de início e conclusão a partir da duração do plano e dos postos ocupados, com posição na fila e atraso dos serviços em execução.
- Ecrã **Pátio** (`/patio`, mocks M7 e M8):
  - quadro Em fila / Em execução / Pronto e estado dos postos;
  - registo de serviço a partir do telefone, com cliente e viatura novos;
  - confirmação explícita para entregar sem pagamento;
  - actualização a cada 3 s.
- Dados de demonstração coerentes com o mock M7 (P1 em execução, P2 pronto, dois em fila).

### Testes

- 69 testes (`node:test` + `fetch`), cobrindo as bibliotecas, a base de dados, a API, as regras e as estimativas.

### Limitações conhecidas

- Sem autenticação (D-16): o autor é declarado pelo cabeçalho `X-Actor`.
- Sem pagamentos (I-3), fidelização (I-4), simulador e avisos ao cliente (I-5), painel (I-6), vertente Banco (I-7) nem marcações (I-8).
- Preços e durações ilustrativos (D-19, D-20).
