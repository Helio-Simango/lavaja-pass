# Arquitectura

## Visão geral

```
┌────────────── Browser (HTML + CSS + JS puro) ──────────────┐
│  client/  (/operador · /gestor · /moza · /cliente · /entrar)│
│  simulador/  (/simulador: o "telemóvel" do cliente)         │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch JSON + cookie da sessão do perfil
┌──────────────────────────▼──────────────────────────────────┐
│ server/src/interfaces/http   Express: sessão → allow(perm.) │
│                              → controladores · presenters   │
│ server/src/interfaces/chat   assistente da conversa · avisos│
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
│                              security/: JWT HS256 · scrypt  │
└─────────────────────────────────────────────────────────────┘
  server/src/container.js  liga tudo · server/src/main.js  arranca
```

**Regra de dependências:** cada camada só conhece as camadas mais internas. O domínio não sabe que existe base de dados nem HTTP. Os casos de uso não sabem que a base é SQLite. A interface HTTP não acede a repositórios. O teste `server/test/unit/architecture.test.js` garante esta regra.

## Camadas

### Domínio (`server/src/domain`)

Funções puras, testáveis sem base de dados:

| Módulo | Responsabilidade |
|---|---|
| `errors.js` | `ValidationError`, `UnauthenticatedError`, `AccessDeniedError`, `NotFoundError`, `ConflictError` (sem códigos HTTP) |
| `access.js` | Perfis, matriz de permissões, regras de PIN, senha, bloqueio, códigos de acesso e conteúdo do token |
| `prequalification.js` | Score de pré-qualificação da proposta v1 (seis componentes, classes, montante indicativo) |
| `campaigns.js` | Segmento, ofertas disponíveis, mensagem e atribuição das campanhas fora de pico |
| `phone.js` · `plate.js` · `money.js` · `customer.js` | Valores: normalização, validação e formatação |
| `vehicle-class.js` | Classes A, B e C; referência por código ou id |
| `plan.js` | Regra de aceitação: plano activo e com preço para a classe |
| `wash.js` | Retrato do preço de um novo serviço e decisão de cada transição (`planTransition`) |
| `queue-estimates.js` | Estimativas de início e fim da fila (respeitando os blocos das marcações) |
| `payment.js` | Pagamentos simulados: aceitação, simulação, numerário declarado, reembolso, idempotência |
| `loyalty.js` · `loyalty-effect.js` | Motor de fidelização parametrizável e efeito de cada serviço |
| `conversation.js` | Estados do assistente e leitura das respostas |
| `indicators.js` | Indicadores com definição e origem; qualidade dos dados |
| `sharing.js` | Autorizações de partilha, acesso e notas do relatório |
| `scheduling.js` | Capacidade, horários livres, ciclo de vida das marcações e propostas (DEC-10) |
| `reconciliation.js` | Fecho de caixa e inconsistências do dia |
| `business-time.js` | Fuso de Maputo (UTC+2) e conversões de datas |

`planTransition` recebe o serviço e o contexto já carregado (posto, ocupação, hora). Devolve as alterações e o evento de auditoria, ou lança o erro da regra violada. Não grava nada.

### Aplicação (`server/src/application`)

Um serviço por área: catálogo, clientes, serviços, baias (postos), entrada manual no pátio, pagamentos, fidelização, conversas, consentimentos, painel, histórico, partilha, relatório do banco (com a pré-qualificação e os pedidos de análise), campanhas, marcações, fecho do dia, registo de alterações, parâmetros, autenticação (`auth-service.js`) e área do cliente (`self-service.js`, que confirma que cada serviço, pagamento ou proposta é do cliente da sessão). Cada caso de uso:

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
- **`database/seed/pitch-data.js`:** volume "pitch" (base da proposta v1), gerado de forma determinística.
- **`security/jwt.js`:** tokens HS256 com `node:crypto` (porta `TokenService`).
- **`security/password-hasher.js`:** scrypt com sal (porta `PasswordHasher`) e números aleatórios seguros.
- **`clock.js`:** relógio do sistema e relógio fixo para testes e demonstração.

### Interface HTTP (`server/src/interfaces/http`)

- **`session.js`:** lê o token (cookie do perfil indicado em `X-Session-Profile`, ou `Authorization: Bearer`), valida-o com o `AuthService` e expõe `allow(permissão)`; protege também as páginas de perfil. O token só é entregue no cookie (`HttpOnly`, `SameSite=Strict`, `Max-Age`, `Secure` com HTTPS), nunca no corpo da resposta.
- **`routes.js`:** cada rota declara a permissão que exige.
- **`request.js`:** leitura e validação de tipos (ids, inteiros, booleanos, texto) e o autor (`actorOf`, sempre da sessão).
- **`controllers/`:** finos; lêem o pedido, chamam um caso de uso e apresentam o resultado.
- **`presenters.js`:** formato da API (`display`, `plateDisplay`, rótulos de estado e pagamento).
- **`middleware/error-handler.js`:** traduz os erros para 400, 401, 403, 404, 409 ou 500, no formato `{ error: { code, message, details? } }`.
- **`app.js`:** cabeçalhos de segurança, `/api`, páginas por perfil (só com a sessão certa), checkout `/pagar/:id`, redireccionamentos dos endereços antigos, `client/` e `simulador/`.

### Interface de conversa (`server/src/interfaces/chat`)

- **`assistant.js`:** máquina de estados do cap. 15.6. É um canal de entrada como a API HTTP e chama os mesmos casos de uso. Uma regra violada é respondida na conversa.
- **`notifier.js`:** implementa a porta `CustomerNotifier`. Os avisos ao cliente são mensagens do sistema na conversa.
- **`format.js`:** textos da conversa (dinheiro, matrículas, horas de Maputo).

`ConversationService.handleIncoming` (aplicação) guarda a mensagem, pede a resposta ao assistente e guarda as respostas e o novo estado, numa só transacção.

## Cliente (`client/`)

Uma pasta por perfil; o sistema visual é `css/app.css` (tokens e componentes dos mocks da proposta v1).

- **`js/core/`:**
  - `api-client.js` faz as chamadas à API com a sessão do perfil (`useSession`) e volta à entrada se a sessão expirar;
  - `session.js` confirma a sessão da página e trata da saída;
  - `format.js` formata dinheiro, horas e datas de Maputo; `dom.js` tem o `escapeHtml`; `charts.js` desenha os gráficos de barras.
- **`js/entrar/`:** entrada dos quatro perfis (M6 para o operador).
- **`js/operador/`:** quadro de baias (M7), entrada manual (M8) e entrega (M9).
- **`js/gestor/`:** uma vista por secção (visão geral M10, pátio, clientes, campanhas M11, conciliação, catálogo, crédito).
- **`js/moza/`:** módulo do analista (M12) e extratos.
- **`js/cliente/`:** área do cliente e checkout (M4).

## Simulador (`simulador/`)

- **`js/main.js`:** lista de conversas, endereço por número e consulta a cada 3 s.
- **`js/chat-view.js`:** bolhas, avisos, opções como botões de resposta (M2, M5) e respostas rápidas.
- **`js/whatsapp-format.js`:** marcação `*negrito*` e `_itálico_` sobre texto já escapado, links só http(s) e separação das opções.

Reutiliza `client/js/core/`, servido em `/js/core/`.

## Testes (`server/test`, `client/test`, `simulador/test`)

- **`unit/`:** domínio, configuração e regra de arquitectura.
- **`integration/`:** base de dados (restrições, triggers, unidade de trabalho) e API HTTP real sobre uma base em memória, com o relógio fixo em 2026-10-22 08:00 UTC.
