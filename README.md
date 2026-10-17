# LavaJá Pass

Protótipo para o **Hackathon Moza xLab – UEM** (1.ª edição, 22 e 23 de Outubro de 2026), caso **"Lava Já – Matola"**: como aumentar o tráfego e a fidelização de um car wash comunitário.

O LavaJá Pass organiza a actividade das pequenas lavadoras: clientes, viaturas, serviços, filas, marcações, recebimentos e fidelização. **Com autorização explícita da lavadora**, essa actividade torna-se informação estruturada que uma instituição bancária pode considerar na sua própria análise. Na demonstração, a instituição é o **Moza Banco**, que trouxe o desafio e patrocina o hackathon. Não existe parceria formal (ver [docs/decisoes.md](docs/decisoes.md)).

> **Protótipo.** Não tem autenticação (D-16), as conversas e os pagamentos são simulados e todos os dados são fictícios. Não usar com dados reais.

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

Configuração opcional num `.env` (ver [.env.example](.env.example)): `PORT`, `HOST` e `DB_PATH`. A base de dados nunca pode ficar dentro de `client/` nem de `simulador/`.

## Estrutura

```
├─ client/        páginas web (HTML, CSS, JS puro em módulos ES), servidas em /
│  ├─ css/
│  ├─ js/         core/ (API, DOM, operador) · patio/ (quadro, diálogos)
│  └─ test/       testes da lógica pura do cliente
├─ simulador/     simulador de WhatsApp (I-5), servido em /simulador · js/ · css/ · test/
├─ server/
│  ├─ src/
│  │  ├─ domain/          regras puras: valores, ciclo de vida do serviço, estimativas, erros
│  │  ├─ application/     casos de uso e portas (contratos dos repositórios)
│  │  ├─ infrastructure/  SQLite: ligação, migrações, unidade de trabalho, repositórios, seed · relógio
│  │  ├─ interfaces/http/ Express: rotas, controladores, presenters, erros
│  │  ├─ interfaces/chat/ assistente da conversa e avisos ao cliente
│  │  ├─ container.js     raiz de composição
│  │  └─ main.js          arranque
│  ├─ scripts/    db-migrate · db-seed · db-reset
│  ├─ test/       unit/ · integration/
│  └─ data/       lavaja.db (gerado; não versionado)
├─ docs/          arquitectura.md · decisoes.md · referencia/ (documento de referência v3)
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
| I-9 | Consentimentos, registo de alterações, reconciliação | — |
| I-10 | Documentação e changelog | em curso |

O histórico de alterações está em [changelog.md](changelog.md).

## Ecrãs

| Endereço | Ecrã | Estado |
|---|---|---|
| `/` | Início, com os módulos | ✅ |
| `/patio` | Pátio: marcações de hoje, fila, em execução, pronto, postos, registo de serviço, numerário declarado (M7, M8, M9) | ✅ |
| `/simulador` · `/simulador/whatsapp/:telefone` | Simulador de WhatsApp: o utilizador faz de cliente (M1–M6) | ✅ |
| `/painel` | Painel: indicadores com definição e origem, gráficos, capacidade e agenda, viaturas por classe, histórico por matrícula (M10–M13) | ✅ |
| `/catalogo` | Catálogo: planos e preços por classe, classes, parâmetros de fidelização (M14) | ✅ |
| `/banco` | Vertente Banco: autorizações e registo de acessos (lavadora, M15); relatório autorizado e exportação (banco, M16) | ✅ |

O Pátio actualiza-se a cada 3 s. O nome do operador escrito no topo fica registado como autor de cada acção. Como não há autenticação, esse nome é declarado e não verificado.

## API (JSON)

Os erros chegam sempre no formato `{ "error": { "code", "message", "details?" } }`:

| Código | Quando |
|---|---|
| 400 | Dados inválidos |
| 404 | Não encontrado |
| 409 | Conflito com uma regra de negócio |
| 500 | Erro interno, sem detalhes |

O autor de cada alteração é indicado no cabeçalho `X-Actor` (ou no campo `actor`).

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
| `POST /api/washes/:id/payments/cash` | `{ amountCents, declaredBy, confirm: true }`: numerário declarado por um operador |
| `POST /api/payments/:id/refund` | `{ reason }`: reembolso de um pagamento confirmado ou declarado |

Fidelização:

| Método e rota | Descrição |
|---|---|
| `GET /api/loyalty/rules` | Regras em vigor (parâmetros e resumo) e todas as versões |
| `PUT /api/loyalty/rules` | `{ params, toValidate? }`: publica uma nova versão, em vigor a partir de agora |
| `GET /api/customers/:id/loyalty` | Cartão do cliente: progresso, nível e benefícios por classe |
| `GET /api/customers/:id/loyalty/movements` | Livro de movimentos (`earn`, `grant`, `redeem`, `restore`, `revert`, `revert_not_applied`) |

`POST /api/washes` aceita `useBenefit: true` para usar um benefício da classe da viatura.

Marcações e capacidade:

| Método e rota | Descrição |
|---|---|
| `GET /api/availability?date=&planId=&classId=` | Horários livres do dia (capacidade por posto e por pessoas, reserva para a fila) |
| `GET /api/appointments?date=` · `GET /api/appointments/:id` | Marcações do dia (hora de Maputo); detalhe com auditoria e propostas |
| `POST /api/appointments` | `{ vehicleId, planId, startsAt }`: fica `requested` ou `confirmed` conforme a política D-09 |
| `POST /api/appointments/:id/transitions` | `{ to: "confirmed" \| "checked_in" \| "cancelled" \| "no_show", reason? }`. A chegada cria o serviço |
| `POST /api/appointments/:id/offers` | `{ proposedStartsAt }`: propõe um horário mais cedo (só muda se o cliente aceitar) |
| `POST /api/appointment-offers/:id/respond` | `{ accept }`: resposta do cliente; uma proposta expirada mantém o horário original |
| `GET /api/capacity?date=` | Agenda por posto (marcações e pátio) e regras de capacidade |

Painel e histórico:

| Método e rota | Descrição |
|---|---|
| `GET /api/dashboard/summary?days=30` | Indicadores (valor, definição e origem), concluídos por dia da semana, recebimentos por semana e por origem, pátio agora |
| `GET /api/dashboard/weekly` | Recebimentos das últimas 4 semanas, por origem |
| `GET /api/vehicles?classId=` | Viaturas com o número de serviços concluídos e a data do último |
| `GET /api/vehicles/:id/wash-history` | Histórico por matrícula: valores guardados, origem do pagamento, efeito na fidelização |
| `GET /api/vehicles/:id/wash-history/summary` | Resumo: concluídas, canceladas, última, contaram para a fidelização |

Vertente Lavadora–Banco (demonstrativa, sem autenticação — D-16):

| Método e rota | Descrição |
|---|---|
| `GET /api/institutions` | Instituições (na demonstração, o Moza Banco) |
| `GET /api/sharing/authorizations` | Autorizações da lavadora, com estado (`active`, `revoked`, `expired`) e número de acessos |
| `POST /api/sharing/authorizations` | `{ institutionId, purpose, sections, dataMonths, validDays, confirm: true }` |
| `POST /api/sharing/authorizations/:id/revoke` | `{ reason? }`: termina as novas consultas |
| `GET /api/institutions/:id/reports/activity?authorizationId=` | Relatório de actividade (só com autorização activa; `?format=csv` exporta). Cada consulta fica registada |
| `GET /api/sharing/access-logs?authorizationId=` | Registo de consultas e exportações |

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
- **Postos:** um posto só tem um serviço activo (em execução ou pronto). Uma viatura só pode estar uma vez no pátio.
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
  - o relatório não é uma avaliação nem uma pontuação de crédito.
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

## Documentação

- [Documento de referência v3](docs/referencia/LavaJa-Pass-Documento-Referencia-v3.pdf): especificação completa. Os capítulos 10 a 15 servem o desenvolvimento.
- [docs/arquitectura.md](docs/arquitectura.md): camadas, regra de dependências e onde fica cada coisa.
- [docs/decisoes.md](docs/decisoes.md): decisões tomadas desde a v3 e decisões pendentes que afectam o código.
- [CLAUDE.md](CLAUDE.md): regras de arquitectura, de negócio e de código para quem trabalha no repositório.
- [simulador/README.md](simulador/README.md): como usar o simulador de WhatsApp e o que o assistente faz.
