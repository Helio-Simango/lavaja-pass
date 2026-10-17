# Changelog

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
