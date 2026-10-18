# LavaJá Pass

Protótipo para o **Hackathon Moza xLab – UEM** (1.ª edição, 22 e 23 de Outubro de 2026), caso **"Lava Já – Matola"**: como aumentar o tráfego e a fidelização de um car wash comunitário.

O LavaJá Pass organiza a actividade das pequenas lavadoras: clientes, viaturas, serviços, filas, marcações, recebimentos e fidelização. **Com autorização explícita da lavadora**, essa actividade torna-se informação estruturada que uma instituição bancária pode considerar na sua própria análise. Na demonstração, a instituição é o **Moza Banco**, que trouxe o desafio e patrocina o hackathon. Não existe parceria formal (ver [docs/decisoes.md](docs/decisoes.md)).

> **Protótipo.** Tem autenticação e autorização por perfil (JWT, D-16), mas as conversas e os pagamentos são simulados e todos os dados são fictícios. Não usar com dados reais.

Desde a versão 2.0.0, os ecrãs seguem os mocks M1–M12 da [proposta v1](docs/referencia/LavaJa-Pass-Proposta-Final-v1.html), com quatro perfis separados: **cliente**, **operador**, **gestor** e **analista Moza**.

## Requisitos

- Node.js **22.13 ou superior** (usa `node:sqlite`, sem compilação nativa)
- npm

## Comandos

```bash
npm install               # Express (única dependência de execução)
npm run db:reset          # apaga server/data/lavaja.db, aplica as migrações e carrega a demonstração
npm start                 # http://localhost:3000
npm run dev               # o mesmo, reiniciando quando o código muda
npm test                  # suite completa (servidor, cliente e simulador)
npm run test:client       # só a lógica pura do cliente e do simulador
npm run test:unit         # só domínio e arquitectura
npm run test:integration  # base de dados e API HTTP
npm run db:migrate        # aplica só as migrações em falta
npm run db:seed           # carrega a demonstração numa base vazia
```

Configuração opcional num `.env` (ver [.env.example](.env.example)):
- `PORT`, `HOST` e `DB_PATH`. A base de dados nunca pode ficar dentro de `client/` nem de `simulador/`.
- `JWT_SECRET`: segredo das sessões (pelo menos 32 caracteres). Sem ele, o servidor gera um aleatório e as sessões terminam ao reiniciar.
- `COOKIE_SECURE=true` quando o servidor estiver atrás de HTTPS.
- `PUBLIC_URL`: endereço usado nos links da conversa (pagamento). Para um telemóvel na mesma rede, use o IP da máquina e `HOST=0.0.0.0`.
- `DEMO_RESET_TOKEN`: activa a reposição da demonstração pela API (`POST /api/admin/demo/reset`, com o cabeçalho `X-Demo-Token`, `{ "confirm": "REPOR" }` e acesso local).

## Demonstração

`npm run db:reset && npm start`, e depois seguir o [roteiro da demonstração](docs/demo.md), alinhado com o guião de 5 minutos do pitch, com as perguntas prováveis do júri e os números de teste. O `db:reset` carrega a base da proposta v1 (212 clientes, ~350 lavagens em 30 dias).

Contas de demonstração (públicas, só para a demonstração):

| Perfil | Entrada | Credenciais |
|---|---|---|
| Operador | `/entrar?perfil=operador` | Amílcar `1234` · Bento `2345` · Délcio `3456` · Fátima `4567` |
| Gestor | `/entrar?perfil=gestor` | `gestor@lavaja.demo` · `LavaJa-2026` |
| Analista Moza | `/entrar?perfil=analista` | `analista@moza.demo` · `MozaDemo-2026` |
| Cliente | `/entrar?perfil=cliente` ou o link de pagamento da conversa | telefone (ex.: `82 555 0102`) + código de 6 dígitos que chega ao simulador |

## Estrutura

```
├─ client/        páginas web (HTML, CSS, JS puro em módulos ES), servidas em /
│  ├─ css/        app.css (sistema visual da v1) · gestor.css · entrar.css
│  ├─ js/         core/ (API, sessão, DOM, formatação, gráficos) · entrar/ · operador/ · gestor/ · moza/ · cliente/
│  └─ test/       testes da lógica pura do cliente
├─ simulador/     simulador de WhatsApp (I-5), servido em /simulador · js/ · css/ · test/
├─ server/
│  ├─ src/
│  │  ├─ domain/          regras puras: valores, ciclo de vida do serviço, estimativas, erros
│  │  ├─ application/     casos de uso e portas (contratos dos repositórios)
│  │  ├─ infrastructure/  SQLite: ligação, migrações, unidade de trabalho, repositórios, seed · relógio · security/ (JWT, scrypt)
│  │  ├─ interfaces/http/ Express: rotas com permissões, sessões, controladores, presenters, erros
│  │  ├─ interfaces/chat/ assistente da conversa e avisos ao cliente
│  │  ├─ container.js     raiz de composição
│  │  └─ main.js          arranque
│  ├─ scripts/    db-migrate · db-seed · db-reset
│  ├─ test/       unit/ · integration/
│  └─ data/       lavaja.db (gerado; não versionado)
├─ docs/          demo.md · arquitectura.md · decisoes.md · referencia/ (documento de referência v3 e proposta v1)
├─ CLAUDE.md      regras do projecto para o Claude Code
├─ changelog.md
└─ README.md
```

A arquitectura e a regra de dependências entre camadas estão em [docs/arquitectura.md](docs/arquitectura.md).

## Estado da implementação

| Marco | Entregável | Estado |
|---|---|---|
| I-0 | Monorepositório, Express, SQLite, migrações, dados de demonstração, testes | ✅ |
| I-1 | Catálogo, clientes e viaturas | ✅ |
| I-2 | Serviços, fila, postos e estimativas; ecrã Pátio | ✅ |
| I-3 | Pagamentos simulados e numerário declarado | ✅ |
| I-4 | Motor de fidelização parametrizável (valores por omissão por validar: D-01, D-02) | ✅ |
| I-5 | Simulador de WhatsApp e assistente | ✅ |
| I-6 | Painel, viaturas por classe, histórico por matrícula, catálogo | ✅ |
| I-7 | Vertente Banco, só para demonstração (Moza Banco; D-16: demonstrativo com aviso) | ✅ |
| I-8 | Marcações e capacidade (políticas D-09 a D-14 por validar) | ✅ |
| I-9 | Consentimentos, registo de alterações, reconciliação | ✅ |
| I-10 | Documentação, changelog, roteiro da demonstração, reposição protegida | ✅ |
| I-11 | Autenticação JWT e quatro perfis (D-16), telas da proposta v1 (M1–M12), score de pré-qualificação, campanhas fora de pico | ✅ |

O histórico de alterações está em [changelog.md](changelog.md).

## Ecrãs

| Endereço | Perfil | Ecrã (mock da proposta v1) |
|---|---|---|
| `/` | público | Início, com os quatro perfis |
| `/entrar` | público | Entrada: operador com nome + PIN (M6), gestor e analista com email + senha, cliente com código pela conversa |
| `/cartaz` | público | Cartaz do pátio com o QR que abre a conversa com "LAVAR" (M1) |
| `/simulador` · `/simulador/whatsapp/:telefone` | público (faz de telemóvel) | Conversa do cliente: check-in e fila (M2), pronto, pagamento e fidelização (M3), campanha recebida (M5) |
| `/pagar/:serviço` | cliente | Checkout com a carteira, simulado (M4); aberto pelo link do aviso de pronto |
| `/cliente` | cliente | Os meus serviços: no pátio, marcações, fidelização e histórico |
| `/operador` | operador | Quadro de baias (M7), entrada manual (M8), entrega e cobrança (M9), marcações do dia |
| `/gestor` | gestor | Visão geral (M10), pátio ao vivo e agenda, clientes, campanhas (M11), conciliação, catálogo e regras, crédito · Moza Banco |
| `/moza` | analista | Comerciantes, pré-qualificação (M12) e extratos |

As páginas de perfil só abrem com a sessão desse perfil; sem ela, vão para `/entrar`. Os endereços antigos (`/patio`, `/painel`, `/catalogo`, `/banco`) redireccionam para os novos.

## API (JSON)

Os erros chegam sempre no formato `{ "error": { "code", "message", "details?" } }`:

| Código | Quando |
|---|---|
| 400 | Dados inválidos |
| 401 | Sem sessão, ou sessão inválida ou expirada |
| 403 | O perfil não tem acesso, ou a autorização do banco foi revogada ou expirou |
| 404 | Não encontrado |
| 409 | Conflito com uma regra de negócio |
| 500 | Erro interno, sem detalhes |

### Sessões e perfis

A sessão é um JWT (HS256) num cookie HttpOnly + SameSite=Strict, um por perfil. A página indica o perfil no cabeçalho `X-Session-Profile` (`operador`, `gestor`, `analista`, `cliente`); clientes da API podem usar `Authorization: Bearer <token>`. O autor de cada acção é sempre o utilizador da sessão.

| Método e rota | Descrição |
|---|---|
| `GET /api/auth/operators` | Nomes dos operadores para o ecrã de entrada (M6) |
| `POST /api/auth/operator` | `{ operatorId, pin }` |
| `POST /api/auth/staff` | `{ email, password }`: gestor ou analista |
| `POST /api/auth/customer/code` | `{ phone }`: envia um código para a conversa (a resposta é igual exista ou não o número) |
| `POST /api/auth/customer/verify` | `{ phone, code }` |
| `POST /api/auth/link` | `{ token }`: troca o token do link de pagamento por uma sessão do cliente |
| `GET /api/auth/session` · `POST /api/auth/logout` | Sessão actual (com as permissões) e saída |

Permissões por perfil (`server/src/domain/access.js`):

| Perfil | Pode |
|---|---|
| Cliente | Os seus serviços, fidelização, checkout e resposta às propostas de horário (`/api/me/...`) |
| Operador | Pátio: fila, baias, serviços, entrada manual, marcações do dia, numerário em seu nome, pedido de pagamento digital, clientes |
| Gestor | Tudo o que o operador pode, mais painel, catálogo e regras, reembolsos, fecho do dia, campanhas e partilha com bancos |
| Analista bancário | Só as autorizações e os relatórios da sua instituição (`/api/bank/...`), e pedidos de análise |

São públicas: saúde, entrada, `GET /api/vehicle-classes`, `GET /api/plans`, `GET /api/public/business` e o simulador (que faz de telemóvel do cliente).

| Método e rota | Descrição |
|---|---|
| `GET /api/health` | Estado do servidor |
| `GET /api/settings` | Parâmetros, com a marca "por validar" |
| `GET /api/vehicle-classes` | Classes A, B e C |
| `GET /api/plans?classId=` | Planos e preços. Com `classId` (id ou código), indica `available` e `unavailableReason` |
| `PATCH /api/plans/:id` | `name`, `description`, `baseDurationMin`, `active` (fica no registo de alterações) |
| `PUT /api/plans/:id/prices/:classId` | `{ priceCents }` (fica no registo de alterações) |
| `GET /api/customers?phone=` | Procura pelo telefone, em qualquer formato aceite |
| `GET /api/customers` · `GET /api/customers/:id` | Lista e detalhe, com as viaturas |
| `POST /api/customers` | `{ phone, name, vehicles?: [{ plate, classId, jurisdiction?, description? }] }` |
| `POST /api/customers/:id/vehicles` | Acrescenta uma viatura. Devolve 200 se a matrícula já for desse cliente |
| `GET /api/vehicles?classId=` · `GET /api/vehicles/:id` | Viaturas |
| `PATCH /api/vehicles/:id` | `{ classId }`: reclassificação (fica no registo de alterações) |
| `GET /api/stations` | Postos e estado (`free`, `busy`, `ready`, `inactive`) |
| `GET /api/washes?active=true` · `?status=a,b` · `?date=AAAA-MM-DD` | Serviços, com estimativas |
| `POST /api/washes` | `{ vehicleId, planId }`. O preço é calculado no servidor |
| `GET /api/washes/:id` | Serviço e auditoria de transições |
| `POST /api/washes/:id/transitions` | Ver a tabela de transições abaixo |
| `GET /api/yard/entries/preview?plate=&planId=&classId=` | Entrada manual (M8): viatura conhecida, preço e hora prevista, sem registar |
| `POST /api/yard/entries` | `{ plate, planId, classId?, phone?, name?, consents? }`: sem telefone, fica no cliente de balcão |

Corpo de cada transição:

| Transição | Corpo |
|---|---|
| Iniciar | `{ to: "in_progress", stationId }` |
| Marcar pronto | `{ to: "ready" }` |
| Concluir | `{ to: "completed", allowUnpaid? }` |
| Cancelar | `{ to: "cancelled", reason }` |

Pagamentos simulados. Todos os pedidos de criação e de reembolso exigem o cabeçalho `Idempotency-Key`: repetir o pedido com a mesma chave devolve o mesmo pagamento (200) e não cria outro.

| Método e rota | Descrição |
|---|---|
| `GET /api/washes/:id/payments` | Pagamentos do serviço, com a origem de cada um |
| `POST /api/washes/:id/payments/digital` | `{ amountCents }`: inicia um pagamento digital simulado (fica `pending`) |
| `POST /api/payments/:id/simulate` | `{ outcome: "confirmed" \| "failed" }`: resultado da simulação |
| `POST /api/washes/:id/payments/cash` | `{ amountCents, confirm: true }`: numerário declarado em nome do operador da sessão |
| `POST /api/payments/:id/refund` | `{ reason }`: reembolso de um pagamento confirmado ou declarado |

Fidelização:

| Método e rota | Descrição |
|---|---|
| `GET /api/loyalty/rules` | Regras em vigor (parâmetros e resumo) e todas as versões |
| `PUT /api/loyalty/rules` | `{ params, toValidate? }`: publica uma nova versão, em vigor a partir de agora |
| `GET /api/customers/:id/loyalty` | Cartão do cliente: progresso, nível e benefícios por classe |
| `GET /api/customers/:id/loyalty/movements` | Livro de movimentos (`earn`, `grant`, `redeem`, `restore`, `revert`, `revert_not_applied`) |

`POST /api/washes` aceita `useBenefit: true` para usar um benefício da classe da viatura.

Governação (consentimentos, alterações, postos, fecho do dia):

| Método e rota | Descrição |
|---|---|
| `GET /api/customers/:id/consents` · `POST` | Consentimentos de fidelização e de marketing, separados. `{ type, granted }`: vale o último |
| `GET /api/change-log?entity=` | Registo de alterações de preços, planos, viaturas, regras e postos |
| `PATCH /api/stations/:id` | `{ active }`: um posto inactivo sai da capacidade (fica registado) |
| `GET /api/reconciliation?date=` | Fecho do dia: numerário declarado por operador, fechos e inconsistências com correcções |
| `POST /api/reconciliation/closings` | `{ date, operator, countedCents, note? }`: uma diferença exige nota; um fecho por operador e dia |
| `POST /api/reconciliation/corrections` | `{ date, washId?, issueCode, note }`: correcção registada, nunca apagada |

`POST /api/customers` aceita `consents: { loyalty, marketing }`.

Marcações e capacidade:

| Método e rota | Descrição |
|---|---|
| `GET /api/availability?date=&planId=&classId=` | Horários livres do dia (capacidade por posto e por pessoas, reserva para a fila) |
| `GET /api/appointments?date=` · `GET /api/appointments/:id` | Marcações do dia (hora de Maputo); detalhe com auditoria e propostas |
| `POST /api/appointments` | `{ vehicleId, planId, startsAt }`: fica `requested` ou `confirmed` conforme a política D-09 |
| `POST /api/appointments/:id/transitions` | `{ to: "confirmed" \| "checked_in" \| "cancelled" \| "no_show", reason? }`. A chegada cria o serviço |
| `POST /api/appointments/:id/offers` | `{ proposedStartsAt }`: propõe um horário mais cedo (só muda se o cliente aceitar) |
| `POST /api/me/appointment-offers/:id/respond` | `{ accept }`: resposta do próprio cliente; uma proposta expirada mantém o horário original |
| `GET /api/capacity?date=` | Agenda por posto (marcações e pátio) e regras de capacidade |

Painel e histórico:

| Método e rota | Descrição |
|---|---|
| `GET /api/dashboard/summary?days=30` | Indicadores (valor, definição e origem), concluídos e ocupação por dia da semana, recebimentos por semana e por origem, pátio agora |
| `GET /api/dashboard/weekly` | Recebimentos das últimas 4 semanas, por origem |
| `GET /api/dashboard/today` | O dia de hoje (M10): lavagens, recebido por origem, numerário por operador, por cobrar |
| `GET /api/vehicles?classId=` | Viaturas com o número de serviços concluídos e a data do último |
| `GET /api/vehicles/:id/wash-history` | Histórico por matrícula: valores guardados, origem do pagamento, efeito na fidelização |
| `GET /api/vehicles/:id/wash-history/summary` | Resumo: concluídas, canceladas, última, contaram para a fidelização |

Vertente Lavadora–Banco. A lavadora (gestor):

| Método e rota | Descrição |
|---|---|
| `GET /api/institutions` | Instituições (na demonstração, o Moza Banco) |
| `GET /api/sharing/authorizations` | Autorizações da lavadora, com estado (`active`, `revoked`, `expired`) e número de acessos |
| `POST /api/sharing/authorizations` | `{ institutionId, purpose, sections, dataMonths, validDays, confirm: true }`; `sections` inclui `prequalification` para o score |
| `POST /api/sharing/authorizations/:id/revoke` | `{ reason? }`: termina as novas consultas |
| `GET /api/sharing/access-logs?authorizationId=` | Registo de consultas e exportações |
| `GET /api/sharing/credit-requests` | Pedidos de análise feitos pelo banco |

O analista (só a instituição da sessão):

| Método e rota | Descrição |
|---|---|
| `GET /api/bank/authorizations` | Autorizações dadas à sua instituição |
| `GET /api/bank/reports/activity?authorizationId=` | Relatório (M12): pré-qualificação, actividade, recebimentos, clientes, qualidade dos dados; `?format=csv` exporta. Cada consulta fica registada |
| `GET /api/bank/credit-requests` · `POST` | Pedidos de análise de crédito: `{ authorizationId, note? }` |

Campanhas fora de pico (gestor):

| Método e rota | Descrição |
|---|---|
| `GET /api/campaigns/preview` | Segmento proposto, ofertas e pré-visualização da mensagem (sem telefones) |
| `POST /api/campaigns` | `{ offerType?, message?, confirm: true }`: envia a cada cliente do segmento, na conversa |
| `GET /api/campaigns` | Campanhas enviadas, com o resultado (lavagens até 7 dias depois) |

Área do cliente:

| Método e rota | Descrição |
|---|---|
| `GET /api/me` · `GET /api/me/washes` · `GET /api/me/washes/:id` · `GET /api/me/loyalty` | Os seus dados, serviços e fidelização |
| `POST /api/me/washes/:id/payments` | Inicia o pagamento digital do seu serviço (o valor é o do servidor; `Idempotency-Key`) |
| `POST /api/me/washes/:id/payments/:paymentId/confirm` | Confirmação simulada da carteira |

Simulador de WhatsApp:

| Método e rota | Descrição |
|---|---|
| `GET /api/simulator/threads` | Conversas, com a última mensagem |
| `GET /api/simulator/threads/:phone/messages?after=` | Mensagens de um número (só as novas com `after`) e o número normalizado |
| `POST /api/simulator/threads/:phone/messages` | `{ text }`: mensagem do cliente; devolve-a com as respostas do assistente e os avisos gerados |

## Regras principais já aplicadas

- **Telefone:** normalizado para `2588XXXXXXXX` (móveis 82–87) e único por cliente.
- **Matrícula:** normalizada e única por jurisdição (MZ por omissão). Uma matrícula registada noutro cliente é recusada.
- **Classes:** exactamente A, B e C. A base recusa outros códigos e não há rota para criar classes.
- **Aceitação de um serviço:** só com o plano activo e com preço para a classe da viatura. Caso contrário, devolve `PLAN_INACTIVE` ou `PRICE_NOT_DEFINED`.
- **Retrato do preço:** cada serviço guarda classe, plano, duração, preço base, desconto, benefício e preço final. Alterar o catálogo não muda o histórico.
- **Ciclo de vida do serviço:**
  - `queued → in_progress → ready → completed`, ou `queued → cancelled`;
  - `completed` e `cancelled` são estados finais (garantido também por um trigger);
  - repetir um pedido para o estado actual não tem efeitos;
  - todas as transições ficam auditadas.
- **Baias (postos):** uma baia só tem um serviço activo (em execução ou pronto). Uma viatura só pode estar uma vez no pátio.
- **Pagamentos:**
  - o valor tem de ser igual ao valor final em dívida;
  - no máximo um pagamento pendente e um efectivo por serviço (garantido também por índices únicos);
  - o digital confirmado (simulado) e o numerário declarado ficam sempre identificados e separados;
  - o numerário exige o operador e a confirmação explícita, e substitui um digital pendente;
  - um serviço pago só pode ser cancelado depois do reembolso; cancelar deixa sem efeito o digital pendente.
- **Fidelização:**
  - uma conta por cliente, com progresso separado por classe;
  - só contam as lavagens concluídas e com pagamento confirmado ou declarado;
  - concluir, atribuir progresso e reembolsar acontecem na mesma transacção;
  - cada movimento tem uma referência única por serviço, por isso repetir um pedido nunca duplica progresso nem benefícios;
  - o saldo nunca é negativo (trigger);
  - um benefício de uma classe não se usa noutra;
  - cancelar devolve o benefício usado; reembolsar reverte o progresso ou regista uma "reversão não aplicada";
  - todos os parâmetros pendentes (D-01 a D-07) são configuráveis em `loyalty_rules`, em versões.
- **Indicadores:** são sempre calculados a partir dos registos, cada um com a sua definição e origem (cap. 13.4). O digital confirmado e o numerário declarado nunca são somados (também nos gráficos, onde aparecem lado a lado). O valor por receber nunca é receita.
- **Consentimentos:** fidelização e marketing são separados, com histórico (vale o último). Sem consentimento de fidelização não se acumula progresso nem se usa benefício, mas o histórico mantém-se. Na conversa: `ADERIR` e `PARAR`.
- **Fecho do dia:** numerário declarado vs. contado por operador (uma diferença exige nota) e inconsistências do dia (concluído sem pagamento, digital pendente antigo, reembolsos, diferenças de caixa). As correcções são registadas, nunca apagadas, e contam na qualidade dos dados.
- **Marcações:**
  - uma marcação reserva um bloco (duração + margem de segurança) num posto, respeitando os trabalhadores disponíveis e a reserva para a fila (D-12);
  - uma marcação confirmada **nunca é antecipada sem aceitação do cliente** (DEC-10): a lavadora propõe, o cliente aceita ou recusa (ACEITAR/MANTER na conversa); sem resposta no prazo, mantém-se o horário;
  - a falta só se regista depois da tolerância (D-10);
  - cancelar ou faltar propõe o horário à marcação seguinte (D-14);
  - quem chega com marcação passa à frente da fila, e a fila não ocupa os blocos reservados.
- **Partilha com bancos:**
  - só com autorização explícita da lavadora, para uma instituição, com finalidade, âmbito, período de dados e validade;
  - a autorização não pode ser alterada, só revogada (triggers);
  - o relatório tem só as secções autorizadas e dados agregados, sem nomes nem telefones;
  - cada consulta e exportação fica registada e é visível para a lavadora;
  - o score de pré-qualificação (M12) é indicativo, só com a secção autorizada, e o numerário declarado não conta para o volume nem para a % digital; a decisão de crédito é sempre do banco.
- **Autenticação e perfis:**
  - quatro perfis com permissões separadas; sem sessão 401, sem permissão 403;
  - senhas, PINs e códigos só como hash scrypt; 5 falhas bloqueiam 15 min; entradas e falhas registadas;
  - o autor de cada acção e o numerário declarado vêm da sessão.
- **Campanhas:** só para quem aceitou ofertas, sem lavar há 14+ dias, no máximo uma em 7 dias; envio sempre confirmado pelo gestor; `LAVAR` entra na fila e `PARAR` retira o consentimento.
- **Simulador e assistente:**
  - uma conversa por número, guardada e isolada, por ordem estável;
  - o assistente é uma máquina de estados (cap. 15.6) que usa os mesmos casos de uso do Pátio;
  - `MENU` e `PARAR` valem em qualquer ponto;
  - os consentimentos de fidelização e de marketing ficam separados e com histórico;
  - os avisos automáticos (iniciado, pronto, pagamento, entregue com progresso de fidelização) são mensagens do sistema, criadas na mesma transacção da operação;
  - não há mensagens nem pagamentos reais.
- **Entrega sem pagamento efectivo:** exige `allowUnpaid: true`, fica registada e marca o serviço como "entregue sem pagamento".
- **Estimativas:** usam a duração do plano e os postos ocupados, e são sempre apresentadas como estimativas.
- **Dinheiro:** em centavos inteiros.
- **Registos que só acrescentam:** o registo de alterações e a auditoria de transições não aceitam `UPDATE` nem `DELETE`.

## Limitações e pendências

O que o protótipo **não** é, e o que ainda está por decidir:

- **Autenticação de demonstração:** as contas e as senhas de demonstração são públicas; não há gestão de utilizadores no ecrã nem recuperação de senha. Não usar com dados reais.
- **Simulações:**
  - conversas simuladas, sem WhatsApp real;
  - pagamentos digitais simulados, sem gateway;
  - numerário declarado, não verificado.
- **Dados fictícios:** dados de demonstração; os preços, as durações e os parâmetros estão marcados "por validar" (D-19, D-20).
- **Decisões pendentes, todas configuráveis e com valores por omissão de demonstração:**
  - fidelização: D-01 a D-07 (`PUT /api/loyalty/rules`);
  - marcações: D-09 a D-14 (parâmetro `scheduling.policy`);
  - classificação de pickups: D-21.
- **Não implementado:**
  - sinais de fraude (D-08);
  - indicadores de maturidade (D-17);
  - registo de avarias e ausências com remarcação (D-14 completo);
  - duração por classe (D-20);
  - selo a dobrar e descontos nas campanhas (dependem de D-01 e D-06);
  - QR verdadeiro no cartaz (o actual é ilustrativo).
- **A validar fora do código:**
  - modelo comercial (D-15);
  - enquadramento legal da partilha de dados em Moçambique (D-18);
  - interesse e requisitos dos bancos;
  - o Moza Banco aparece só como instituição de demonstração, sem parceria; os parâmetros do score têm de ser validados com o banco.

O registo completo das decisões tomadas durante a implementação está em [docs/decisoes.md](docs/decisoes.md).

## Documentação

- [Documento de referência v3](docs/referencia/LavaJa-Pass-Documento-Referencia-v3.pdf): especificação completa. Os capítulos 10 a 15 servem o desenvolvimento.
- [Proposta v1](docs/referencia/LavaJa-Pass-Proposta-Final-v1.html): modelo visual dos ecrãs (secção 10, M1–M12) e a fórmula do score (secção 8).
- [docs/demo.md](docs/demo.md): roteiro da demonstração e perguntas do júri.
- [docs/arquitectura.md](docs/arquitectura.md): camadas, regra de dependências e onde fica cada coisa.
- [docs/decisoes.md](docs/decisoes.md): decisões tomadas desde a v3 e decisões pendentes que afectam o código.
- [CLAUDE.md](CLAUDE.md): regras de arquitectura, de negócio e de código para quem trabalha no repositório.
- [simulador/README.md](simulador/README.md): como usar o simulador de WhatsApp e o que o assistente faz.
