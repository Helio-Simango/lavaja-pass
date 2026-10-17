# Decisões

Complementa o capítulo 21 do [documento de referência v3](referencia/LavaJa-Pass-Documento-Referencia-v3.pdf). Regista as decisões tomadas depois da v3 e as decisões de implementação. Nada marcado como pendente fica fixo no código: fica configurável.

## Decisões da equipa posteriores à v3

### Foco no Moza Banco (17/10/2026)

A solução continua a ser **para instituições bancárias** (DEC-01). No contexto do hackathon, a vertente Lavadora–Banco e o pitch **dirigem-se ao Moza Banco**, que trouxe o desafio e patrocina o evento.

Consequências:

- **Demonstração:** na vertente Banco (I-7), a instituição autorizada é o Moza Banco. Fica definida no parâmetro `demo.institution`, marcado como "por validar".
- **Código:** o modelo de dados continua multi-instituição. O foco é de apresentação, não de arquitectura.
- **Pitch:**
  - abre pelo desafio do Moza (tráfego e fidelização da Lava Já – Matola);
  - depois mostra o valor para o Moza Banco: um canal para pequenos comerciantes informais, com a actividade registada e autorizada.
- **Hipótese de negócio:** o Moza Banco como primeiro cliente institucional e parceiro de um piloto. Continua por validar (cap. 6).
- **No evento:** usar os mentores do Moza para as perguntas da secção 6.4.

Limites que se mantêm:

- Não afirmar parceria, interesse ou compromisso do Moza Banco sem evidência (DEC-14).
- Não usar o logótipo nem a identidade visual do Moza sem confirmar no regulamento.
- O relatório não é uma avaliação de crédito (DEC-03).

> A actualização do documento de referência para v4, com este foco, está adiada por decisão da equipa.

## Decisões de implementação (I-0 a I-2)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-01 | `node:sqlite` (Node ≥ 22.13) em vez de better-sqlite3 | Sem compilação nativa nos portáteis da equipa |
| IMP-02 | Migrações numeradas, uma por marco (`001_foundation`, `002_catalog_customers`, `003_washes`) | Rastreabilidade por marco |
| IMP-03 | `classId` aceita o id ou o código (`A`, `B`, `C`) | URLs legíveis (`/api/plans?classId=B`) |
| IMP-04 | Postos numa tabela `stations` (P1–P4 na demonstração) | O I-2 precisa de postos. Trabalhadores, pausas e indisponibilidades ficam para o I-8 (`capacity_resources`) |
| IMP-05 | Uma viatura só pode ter um serviço activo (índice único parcial) | Evita registos duplicados no pátio (relacionado com D-08) |
| IMP-06 | Um serviço "pronto" ocupa o posto até à entrega. Para a estimativa, considera-se que liberta o posto já | Coerente com a regra "ocupado = em execução ou pronto" sem penalizar a fila |
| IMP-07 | ~~Até ao I-3, concluir exige `allowUnpaid: true`, excepto se o valor final for 0~~ Substituída pela IMP-11 | — |
| IMP-08 | O autor das acções vem do cabeçalho `X-Actor` (ou do campo `actor`) | Não há autenticação (D-16). O autor é declarado e fica registado |
| IMP-09 | Os registos de alterações e de transições são protegidos por triggers contra `UPDATE` e `DELETE` | "Só acrescenta registos" é garantido na base de dados, não só no código |
| IMP-10 | O aviso ao cliente em `in_progress → ready` fica para o I-5 (simulador) | Ainda não existe o canal de conversa |

## Decisões de implementação (I-3)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-11 | Concluir sem `allowUnpaid` só com um pagamento efectivo (`confirmed` ou `declared`) ou com valor final 0 | Cap. 10.3 |
| IMP-12 | Um serviço com pagamento efectivo só é cancelado depois do reembolso (`REFUND_REQUIRED`) | Cap. 10.3: o cancelamento é "sem pagamento efectivo"; o reembolso fica registado com motivo e autor |
| IMP-13 | O numerário declarado substitui um digital pendente, que passa a `failed` ("Substituído por numerário") | Cap. 10.4: `failed` inclui o "pagamento pendente substituído por numerário" |
| IMP-14 | A chave de idempotência é obrigatória e única. A mesma chave noutro pedido (serviço, método ou valor diferentes) é recusada | Evita que um erro do cliente apague a protecção contra duplicados |
| IMP-15 | Um serviço reembolsado pode voltar a receber um pagamento | O índice de "um efectivo por serviço" exclui os reembolsados |
| IMP-16 | O reembolso fica, por agora, só na API. O Pátio não o oferece | É uma acção do gestor; o ecrã do gestor é o Painel (I-6) |

## Decisões de implementação (I-4)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-17 | Valores por omissão da demonstração, **por validar**:<ul><li>ciclo de 10 lavagens;</li><li>D-01: alternativa C com N = 1 (equivale à B);</li><li>nível máximo activo 2;</li><li>D-02: lavagem gratuita do plano Simples;</li><li>D-03: o serviço gratuito não conta;</li><li>D-04: nível por classe;</li><li>D-06: não acumula</li></ul> | O cap. 11.6 pede parâmetros escolhidos pela equipa. O nível 3 fica inactivo até à análise de custos (cap. 11.5, D-07). **A equipa deve confirmar ou alterar estes valores** com `PUT /api/loyalty/rules` |
| IMP-18 | A "lavagem gratuita" vale o preço do plano de referência na classe da viatura. Se o cliente escolher um plano mais caro, paga a diferença | Junta as duas leituras da D-02 num só mecanismo: um benefício com valor máximo |
| IMP-19 | O nível usado para atribuir benefícios é o que o cliente tinha antes de fechar o ciclo | Evita que a mesma lavagem suba o nível e beneficie logo do nível novo |
| IMP-20 | As regras são versões imutáveis. Uma nova versão vale a partir da publicação; os movimentos guardam a versão aplicada | Auditabilidade (cap. 13.3) |
| IMP-21 | O progresso é sempre calculado a partir do livro de movimentos; não há tabela `loyalty_progress` | O cap. 11.1 exige que o progresso mostrado resulte dos movimentos; evita duas fontes de verdade |
| IMP-22 | O consentimento de fidelização (cap. 14.2) ainda não condiciona a acumulação | Os consentimentos são do marco I-9 |

## Decisões de implementação (I-8)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-43 | Política de demonstração, **por validar** (`scheduling.policy`):<ul><li>funcionamento das 07:00 às 18:00, com 3 trabalhadores (declarados);</li><li>margem de 10 min (proposta);</li><li>D-09: confirmação manual;</li><li>D-10: tolerância de 15 min;</li><li>D-12: sem postos reservados para a fila;</li><li>D-14: o horário libertado é proposto à marcação seguinte;</li><li>D-11 e D-13: sem penalizações nem depósitos</li></ul> | Nenhuma política foi escolhida (cap. 12.6). A confirmação manual corresponde ao mock M7 ("Por confirmar") |
| IMP-44 | Um pedido por confirmar também reserva capacidade | Evita dois pedidos no mesmo bloco enquanto a lavadora não confirma |
| IMP-45 | A remarcação é um evento auditado sobre a marcação confirmada; não há estado `rescheduled` | O cap. 12.5 propõe o estado. Um evento guarda o horário anterior e o novo sem duplicar a marcação |
| IMP-46 | A expiração das propostas é calculada (`offerStateOf`) e gravada antes de uma nova proposta | Sem tarefas agendadas no protótipo; o resultado é o mesmo: sem resposta, mantém-se o horário |
| IMP-47 | A disponibilidade exige uma antecedência mínima de um intervalo (30 min) | A fila já no pátio não é ultrapassada de imediato |
| IMP-48 | Quem chega com marcação passa à frente da fila sem marcação | Cap. 12.2: as marcações confirmadas reservam capacidade |
| IMP-49 | Avarias e ausências (D-14) ainda não têm registo próprio; desactivar um posto retira-o da capacidade | O cap. 12.6 deixa a política pendente |
| IMP-50 | A marcação no Pátio e no Painel (pelo gestor) faz-se pela API; a interface de marcação é a conversa (opção 3) | Prioridade da demonstração |

## Decisões de implementação (I-7)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-36 | **D-16**: adoptada a proposta do cap. 9.6, uma vertente Banco demonstrativa, sem autenticação e com aviso visível. **Por confirmar pela equipa** | Rápido e coerente com o protótipo. A matriz de perfis do cap. 7.1 continua proposta |
| IMP-37 | O período de dados é dado em meses e conta a partir do momento da consulta; o relatório não começa antes do primeiro registo | M15: "dados dos últimos 6 meses" |
| IMP-38 | Uma autorização não pode ser alterada, só revogada uma vez (triggers). Para mudar o âmbito, cria-se uma nova | Auditabilidade: cada acesso fica ligado a um âmbito que não muda |
| IMP-39 | O relatório tem sempre a identificação e as notas; as restantes secções só se autorizadas | Cap. 9.3 e menor privilégio (cap. 14.1) |
| IMP-40 | Os dias de funcionamento são um parâmetro declarado pela lavadora (`business.openWeekdays`, por validar) | Necessário para "dias com registo" (cap. 9.4) |
| IMP-41 | O Moza Banco é a única instituição de demonstração. Não há logótipo nem identidade visual | Foco da equipa (17/10/2026), sem afirmar parceria (DEC-14) |
| IMP-42 | Os indicadores de maturidade operacional (D-17) não foram implementados | Pendentes. Nunca combinados numa pontuação |

## Decisões de implementação (I-6)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-31 | Os indicadores são calculados por funções puras do domínio (`indicators.js`), usadas pelo Painel e pelo relatório do banco | A mesma definição em todo o lado; testável sem base de dados |
| IMP-32 | Nos gráficos, o digital e o numerário aparecem lado a lado e nunca empilhados | Uma barra empilhada sugere uma soma, e o DEC-07 proíbe somá-los |
| IMP-33 | "Por receber" considera os serviços registados no período, não cancelados, com valor e sem pagamento efectivo (inclui os entregues sem pagamento) | Cap. 13.4. O valor aparece sempre com a nota "não é receita" |
| IMP-34 | Os gráficos são SVG feitos à mão (`client/js/core/charts.js`), sem bibliotecas | Cumpre DEC-12 (sem dependências nem build no frontend) |
| IMP-35 | O tempo de serviço e a ocupação (cap. 13.4) ficam para o I-8, com a capacidade | Precisam dos postos, horários e trabalhadores declarados |

## Decisões de implementação (I-5)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-23 | O assistente fica em `interfaces/chat`, como um canal de entrada ao lado da API HTTP, e chama os mesmos casos de uso | Cap. 15.6: "usa os mesmos serviços e regras do Pátio". Os textos da conversa são apresentação |
| IMP-24 | Os avisos ao cliente passam por uma porta (`CustomerNotifier`); a implementação escreve mensagens do sistema na conversa | Os casos de uso não dependem do canal. Uma integração real (fora do protótipo) só substitui a implementação |
| IMP-25 | Os avisos são gravados na mesma transacção da operação que os origina | Uma operação desfeita não deixa avisos falsos |
| IMP-26 | Os consentimentos de fidelização e de marketing são pedidos no registo pela conversa e guardados com histórico. Ainda não condicionam a acumulação nem as campanhas | Cap. 14.2. A aplicação dos consentimentos e o consentimento de partilha com bancos ficam para o I-9 e o I-7 |
| IMP-27 | Uma conversa nova começa sempre em `START`: o assistente cumprimenta pelo nome quem já é cliente (por exemplo, registado no Pátio) | Evita pedir o registo a quem já existe |
| IMP-28 | O pagamento pela conversa é digital simulado e confirmado logo; a chave de idempotência depende da conversa e do serviço | Demonstração do fluxo M5. Repetir a confirmação não paga duas vezes |
| IMP-29 | As horas na conversa usam o fuso de Maputo (`Africa/Maputo`) | O texto é gerado no servidor e não depende do fuso do browser |
| IMP-30 | A opção 3 (marcar horário) responde que as marcações ainda não estão disponíveis | As marcações e as suas políticas são do I-8 (D-09 a D-14) |

## Decisões de estrutura e arquitectura (v0.2.0)

| ID | Decisão | Motivo |
|---|---|---|
| ARQ-01 | Repositório em `client/`, `server/`, `simulador/` e `docs/`, em vez da estrutura do cap. 15.7 (`src/` e `public/`) | Separação clara entre o que corre no browser, o servidor e o simulador. Continua a ser um monorepositório e cumpre o cap. 15.1 (DEC-12) |
| ARQ-02 | Clean architecture no servidor: `domain` ← `application` ← `infrastructure` / `interfaces` ← `container` | Regras testáveis sem base de dados; o SQLite e o Express podem ser trocados sem tocar nas regras |
| ARQ-03 | A regra de dependências é verificada por um teste (`server/test/unit/architecture.test.js`) | Evita que a arquitectura se degrade com a pressa do hackathon |
| ARQ-04 | Erros de domínio sem códigos HTTP; a tradução para 400, 404 e 409 está só em `interfaces/http` | O domínio não conhece o transporte |
| ARQ-05 | A formatação para o ecrã (`display`, rótulos) fica nos presenters, não nos casos de uso | Os casos de uso devolvem dados; o mesmo caso de uso serve o Pátio e o simulador |
| ARQ-06 | A base de dados passa para `server/data/lavaja.db` | É um recurso do servidor; continua fora das pastas servidas ao browser |

## Pendentes que bloqueiam os próximos marcos

| ID | Questão | Bloqueia |
|---|---|---|
| D-01 | Passagem de nível na fidelização (alternativas A–D) | Valores por omissão do I-4 |
| D-02 | Lavagem gratuita ou crédito com limite | Valores por omissão do I-4 |
| D-16 | Vertente Banco só como demonstração, ou com autenticação simples | I-7 |
| D-09 a D-14 | Políticas de marcação | I-8 |
| D-19, D-20 | Preços reais e duração por classe | Dados de demonstração (actualmente ilustrativos) |
