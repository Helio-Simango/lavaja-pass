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

### Perfis, autenticação e telas da proposta v1 (18/10/2026)

Decisões da equipa para o marco I-11 (versão 2.0.0). Revêem pontos da v3, assinalados abaixo.

| ID | Decisão | Relação com a v3 |
|---|---|---|
| EQ-01 | **D-16 decidida:** autenticação e autorização por perfil, com sessões JWT, mesmo na demonstração | Fecha a D-16 (alternativa b do cap. 7.1) |
| EQ-02 | Quatro perfis, como na proposta v1 (secção 5): **cliente** (telefone, sem senha), **operador** (nome + PIN), **gestor** e **analista Moza** (email + senha) | O "administrador da plataforma" do cap. 7.1 não tem ecrã; a reposição da demonstração continua protegida por token |
| EQ-03 | Os ecrãs seguem os mocks **M1–M12 da proposta v1** (`docs/referencia/LavaJa-Pass-Proposta-Final-v1.html`), em estilo painel, com os perfis separados | Substitui os ecrãs Pátio, Painel, Catálogo e Banco da v1.0.0 |
| EQ-04 | O módulo do analista (M12) mostra o **score de pré-qualificação** (0–100, seis componentes) e o **montante indicativo**, como na v1 (secção 8) | **Revê o DEC-03 e a contradição C11 da v3.** Limites que se mantêm: é indicativo; a decisão de crédito é do banco; só com autorização da lavadora (secção própria do âmbito); o numerário declarado não conta para o volume nem para a % digital; parâmetros por validar com o banco |
| EQ-05 | **Campanhas fora de pico** (M11 → M5) com envio confirmado pelo gestor, nunca automático | **Revê o DEC-13** ("reservado"). Só o convite fora de pico; o selo a dobrar e o desconto ficam indisponíveis (dependem de D-01, D-06) |
| EQ-06 | A fidelização mantém as regras do I-4 (ciclo por classe, configurável) | O "5 selos = 1 Simples" e o "selo a dobrar" da v1 não foram adoptados |
| EQ-07 | Na interface, os postos chamam-se **baias** (B1–B4), como na v1 | Só nomenclatura; no código continuam a ser `stations` |

## Decisões de implementação (I-0 a I-2)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-01 | `node:sqlite` (Node ≥ 22.13) em vez de better-sqlite3 | Sem compilação nativa nos portáteis da equipa |
| IMP-02 | Migrações numeradas, uma por marco (`001_foundation`, `002_catalog_customers`, `003_washes`) | Rastreabilidade por marco |
| IMP-03 | `classId` aceita o id ou o código (`A`, `B`, `C`) | URLs legíveis (`/api/plans?classId=B`) |
| IMP-04 | Postos numa tabela `stations` (P1–P4 na demonstração; B1–B4 desde o I-11, EQ-07) | O I-2 precisa de postos. Trabalhadores, pausas e indisponibilidades ficam para o I-8 (`capacity_resources`) |
| IMP-05 | Uma viatura só pode ter um serviço activo (índice único parcial) | Evita registos duplicados no pátio (relacionado com D-08) |
| IMP-06 | Um serviço "pronto" ocupa o posto até à entrega. Para a estimativa, considera-se que liberta o posto já | Coerente com a regra "ocupado = em execução ou pronto" sem penalizar a fila |
| IMP-07 | ~~Até ao I-3, concluir exige `allowUnpaid: true`, excepto se o valor final for 0~~ Substituída pela IMP-11 | — |
| IMP-08 | ~~O autor das acções vem do cabeçalho `X-Actor` (ou do campo `actor`)~~ Substituída pela IMP-62 | — |
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
| IMP-22 | ~~O consentimento de fidelização ainda não condiciona a acumulação~~ Substituída pela IMP-51 | — |

## Decisões de implementação (I-11)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-59 | JWT HS256 com `node:crypto`, sem dependências. A verificação aceita só o cabeçalho HS256 exacto (recusa `none` e outros algoritmos), compara a assinatura em tempo constante e exige emissor, audiência e validade | DEC-12 (só o Express como dependência) e os erros clássicos de JWT |
| IMP-60 | O token viaja num cookie **HttpOnly + SameSite=Strict**, um por perfil (`lj_operador`, `lj_gestor`, `lj_analista`, `lj_cliente`); a página indica o perfil no cabeçalho `X-Session-Profile`. Quem autoriza é o perfil gravado no token. Também aceita `Authorization: Bearer` | Os quatro perfis abertos no mesmo portátil durante a demonstração; o JavaScript nunca lê o token; o cabeçalho próprio impede pedidos de outros sites |
| IMP-61 | Cada rota declara a permissão (matriz em `domain/access.js`); sem sessão 401, sem permissão 403. As páginas de perfil também só abrem com a sessão certa | Menor privilégio (cap. 14.1) também na interface |
| IMP-62 | O autor de cada acção, e o nome do numerário declarado, vêm sempre da sessão; o que vier no pedido é ignorado | Responsabilização: ninguém declara em nome de outro |
| IMP-63 | Senhas, PINs e códigos guardados só como hash scrypt com sal; 5 tentativas falhadas bloqueiam 15 min; as respostas não dizem qual dos dados falhou; entradas, falhas, bloqueios e saídas ficam em `auth_events` (só acrescenta) | Boas práticas mínimas para um sistema com dados financeiros |
| IMP-64 | Durações das sessões: cliente 30 min, analista 2 h, gestor 8 h, operador 10 h (um turno). A conta tem `session_version` para revogar sessões | O acesso bancário é o mais curto |
| IMP-65 | O cliente entra com um código de 6 dígitos enviado na conversa (válido 5 min, uso único, 5 tentativas, reenvio após 30 s); a resposta é igual exista ou não o número | Proposta v1: "telefone, sem conta nem senha" |
| IMP-66 | O aviso de pronto (M3) leva um link de pagamento com um token próprio (24 h) no fragmento do endereço; a página troca-o por uma sessão do cliente de 30 min e retira-o do endereço | O fragmento não chega aos registos do servidor nem ao `Referer` |
| IMP-67 | O analista só vê a sua instituição: a instituição vem da sessão, nunca do pedido (`/api/bank/...`) | Evita aceder a autorizações de outro banco mudando um número |
| IMP-68 | Score: fórmula da v1 (secção 8.2) em `domain/prequalification.js`, sobre os últimos 30 dias, com os parâmetros em `prequalification.params` (por validar); o montante é a retenção de 10% dos recebimentos digitais × 12 ÷ 1,25, arredondado a 5.000 MZN; classe C não tem montante | Explicável e honesto sobre o tempo (antiguidade, projecção a 90 dias) |
| IMP-69 | O pedido de análise de crédito é um registo imutável com o score e o montante desse momento, visível para a lavadora | Não é uma decisão; dá rasto ao que o banco viu |
| IMP-70 | Campanhas: segmento = consentimento de ofertas + 14 dias sem lavar + nenhuma campanha nos últimos 7 dias (`campaigns.policy`, por validar); a mensagem leva sempre LAVAR e PARAR; resultado = lavagens dos destinatários até 7 dias depois | Proposta v1, secção 7.5 |
| IMP-71 | Entrada manual (M8): sem telefone, a viatura fica num **cliente de balcão** com um número reservado (fictício), sem avisos nem fidelização | O modelo exige um cliente por viatura; o balcão fica visível nos dados em vez de inventar clientes |
| IMP-72 | Volume "pitch" da demonstração: a base da v1 (212 clientes, ~350 lavagens, semana 8·6·7·8·14·24·18, ~62% digital), gerada de forma determinística pelos casos de uso e sem avisos na conversa. Os testes usam o volume compacto | O painel e o score precisam de volume realista |
| IMP-73 | Ocupação por dia (M10) = lavagens concluídas por dia ÷ capacidade prática (28/dia, declarada, por validar); abaixo de 27% é "capacidade parada" | Proposta v1, secção 2.1 |
| IMP-74 | "Recebido hoje" mostra o total com a separação ao lado (% digital, numerário por operador) e a origem de cada parte | O M10 pede o total; o DEC-07 continua cumprido porque a origem nunca se perde |
| IMP-75 | O QR do cartaz (M1) é ilustrativo (não é lido por câmaras) e abre o simulador com "LAVAR" | Um QR verdadeiro exigiria uma biblioteca ou o número real |
| IMP-76 | Migrações do I-11: uma por funcionalidade (`010_autenticacao`, `011_pre_qualificacao`, `012_campanhas`) | Cada uma entrou numa branch própria |

## Decisões de implementação (I-10)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-57 | A reposição da demonstração pela API fica desactivada por omissão. Exige token, confirmação "REPOR" e acesso local | Cap. 14.4 |
| IMP-58 | A reposição apaga as tabelas (DROP TABLE não dispara os triggers de auditoria) e volta a migrar e a semear | É a única forma de repor tabelas que só aceitam novos registos. Só existe para a demonstração |

## Decisões de implementação (I-9)

| ID | Decisão | Motivo |
|---|---|---|
| IMP-51 | Sem consentimento de fidelização (o último registo), o cliente não acumula progresso nem usa benefícios; o saldo e o histórico mantêm-se | Cap. 14.2: o consentimento é "para acumular progresso e receber benefícios" |
| IMP-52 | Um cliente sem nenhum registo de consentimento é tratado como "não consentiu" | Minimização: o consentimento tem de ser explícito |
| IMP-53 | O fecho de caixa é um registo imutável por operador e dia. Uma diferença exige nota e aparece como inconsistência | Cap. 13.3: correcções registadas, nunca apagadas |
| IMP-54 | Um pagamento digital pendente há mais de 30 min é uma inconsistência | Proposta para o fecho; o valor é ajustável no código (`STALE_PENDING_MINUTES`) |
| IMP-55 | Os sinais de fraude (D-08) não foram implementados | Pendentes. Os controlos básicos (idempotência, unicidade, auditoria) existem |
| IMP-56 | ~~O consentimento de marketing é guardado mas não é usado~~ Substituída pela EQ-05: é o filtro das campanhas | — |

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
| IMP-36 | ~~**D-16**: vertente Banco demonstrativa, sem autenticação e com aviso visível~~ Substituída pela EQ-01 | — |
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
| IMP-26 | Os consentimentos de fidelização e de marketing são pedidos no registo pela conversa e guardados com histórico | Cap. 14.2. A aplicação está na IMP-51; a partilha com bancos é a autorização do I-7 |
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

## Registo das decisões pendentes (D-01 a D-22)

Estado a 18/10/2026, depois do I-11. "Por validar" = valor de demonstração configurável, à espera da equipa ou do terreno.

| ID | Questão | Estado na v3 | No protótipo | Onde mudar |
|---|---|---|---|---|
| D-01 | Passagem de nível na fidelização | Pendente | Por validar: 1 ciclo por nível (IMP-17) | `PUT /api/loyalty/rules` |
| D-02 | Lavagem gratuita ou crédito com limite | Pendente | Por validar: Simples gratuita, paga a diferença (IMP-18) | Regras de fidelização |
| D-03 | O gratuito conta para o progresso? | Pendente | Por validar: não | Regras de fidelização |
| D-04 | Nível por classe ou por cliente | Pendente | Por validar: por classe | Regras de fidelização |
| D-05 | Cancelamentos e reembolsos na fidelização | Proposto | Implementada a proposta do cap. 11.6 (reversão auditada) | Código (`loyalty`) |
| D-06 | Acumulação com outras promoções | Pendente | Por validar: não acumula; o selo a dobrar das campanhas fica indisponível | Regras de fidelização |
| D-07 | Custo real dos benefícios | A validar | Nível 3 inactivo até à análise | Regras de fidelização |
| D-08 | Controlos anti-fraude adicionais | Pendente | Só os básicos (idempotência, unicidade, auditoria, bloqueio de contas) | — |
| D-09 | Confirmação de marcações | Pendente | Por validar: manual | `scheduling.policy` |
| D-10 | Tolerância para atrasos | Pendente | Por validar: 15 min | `scheduling.policy` |
| D-11 | Cancelamentos, faltas e remarcações | Pendente | Por validar: sem penalizações | `scheduling.policy` |
| D-12 | Capacidade reservada para a fila | Pendente | Por validar: nenhuma | `scheduling.policy` |
| D-13 | Pagamentos antecipados ou depósitos | Pendente | Por validar: nenhum | `scheduling.policy` |
| D-14 | Avarias e indisponibilidade | Pendente | Desactivar a baia; o horário libertado é proposto (IMP-49) | Catálogo › Baias |
| D-15 | Modelo comercial | A validar | Fora do protótipo | — |
| D-16 | Âmbito da vertente Banco e autenticação | Pendente | **Decidida (EQ-01):** autenticação JWT com quatro perfis | — |
| D-17 | Indicadores de maturidade operacional | Pendente | Não implementados (IMP-42); o score do M12 é a pré-qualificação da v1 (EQ-04) | — |
| D-18 | Enquadramento legal e contratual | A validar | Consentimentos separados, autorização revogável e registo de acessos; parecer jurídico por obter | — |
| D-19 | Preços reais por plano e classe | A validar | Ilustrativos | Catálogo |
| D-20 | Durações; baias e trabalhadores | A validar | Ilustrativos; capacidade prática 28/dia (IMP-73) | Catálogo, `scheduling.policy`, `capacity.practical` |
| D-21 | Critérios de classificação (pickups) | Pendente | Classes A/B/C com descrições; sem critério fino | Catálogo |
| D-22 | Piloto: amostra, duração e critérios | A validar | Fora do protótipo | — |

Decisões já tomadas na v3 (DEC-01 a DEC-14): ver o cap. 21.1 do documento de referência. O DEC-03 e o DEC-13 foram revistos pelas EQ-04 e EQ-05.
