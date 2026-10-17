# CLAUDE.md

Guia para trabalhar neste repositório com o Claude Code.

## O projecto

**LavaJá Pass** é um protótipo para o Hackathon Moza xLab – UEM (22 e 23/10/2026), caso "Lava Já – Matola". Organiza a actividade das pequenas lavadoras (clientes, viaturas, serviços, filas, pagamentos e fidelização). Com autorização da lavadora, essa actividade torna-se informação estruturada que um banco pode usar. Na demonstração, o banco é o **Moza Banco**.

- **Especificação:** `docs/referencia/LavaJa-Pass-Documento-Referencia-v3.pdf`. Os capítulos 10 a 15 são a especificação de desenvolvimento e o capítulo 17 o plano de marcos (I-0 a I-10).
- **Decisões:** decisões e pendentes posteriores à v3 em `docs/decisoes.md`; arquitectura em `docs/arquitectura.md`.

## Comandos

```bash
npm install
npm run db:reset          # apaga server/data/lavaja.db, migra e carrega a demonstração
npm start                 # http://localhost:3000 (Pátio em /patio)
npm run dev               # com reinício automático
npm test                  # toda a suite; test:unit e test:integration em separado
```

Requer Node.js ≥ 22.13 (`node:sqlite`). A única dependência de execução é o Express 4.

## Estrutura

```
client/      páginas web (HTML, CSS, JS puro em módulos ES), servidas em /
simulador/   interface do simulador de WhatsApp (I-5), servida em /simulador
server/      API e regras de negócio (clean architecture), testes e scripts
docs/        decisões, arquitectura e documento de referência
```

## Regras de arquitectura (server/src)

As dependências apontam sempre para dentro. O teste `server/test/unit/architecture.test.js` falha se a regra for violada.

| Camada | Pode importar | Conteúdo |
|---|---|---|
| `domain/` | só `domain/` | Regras puras: valores (telefone, matrícula, dinheiro), ciclo de vida do serviço, estimativas, erros de domínio. Sem I/O, sem datas do sistema |
| `application/` | `domain/` | Casos de uso (`*-service.js`). Dependem de portas (`ports.js`), nunca do SQLite nem do Express |
| `infrastructure/` | `domain/`, `application/` | SQLite (ligação, migrações, unidade de trabalho, repositórios), relógio, dados de demonstração |
| `interfaces/http/` | `domain/`, `application/` | Express: rotas, controladores (finos), leitura de pedidos (`request.js`), apresentação (`presenters.js`), erros |
| `container.js` · `main.js` | tudo | Raiz de composição: o único sítio que liga repositórios aos casos de uso |

**Onde pôr cada coisa:**
- **Regra de negócio nova:** uma função pura em `domain/` com teste unitário. O caso de uso só carrega dados, chama o domínio e grava.
- **Erros:** usar `ValidationError`, `NotFoundError` e `ConflictError` (de `domain/errors.js`). A interface HTTP traduz para 400, 404 e 409. Nunca escrever códigos HTTP fora de `interfaces/http`.
- **Escrita em várias tabelas:** fica dentro de `unitOfWork.run(...)`, que aceita chamadas aninhadas.
- **Formatação (`display`, `plateDisplay`, rótulos):** só nos presenters. Os casos de uso devolvem dados, não texto de ecrã.
- **Tabela ou coluna nova:** uma nova migração `NNN_nome.sql`, uma por marco. Nunca editar uma migração já aplicada.

## Regras de negócio que não se negociam

- **Pendentes:** nada marcado como pendente no documento (D-01…D-21) fica fixo no código. Fica configurável (`settings`, marca "por validar").
- **Dinheiro:** em centavos inteiros. O preço é sempre calculado no servidor e cada serviço guarda o retrato do preço aplicado.
- **Contagens:** só `completed` conta como lavagem. Para a fidelização é preciso também o pagamento confirmado (simulado) ou o numerário declarado.
- **Origem dos dados:** o digital confirmado e o numerário declarado nunca se somam como a mesma coisa. Os dados declarados nunca aparecem como comprovados.
- **Marcações:** uma marcação confirmada nunca é antecipada sem aceitação do cliente.
- **Partilha com bancos:** só com autorização explícita da lavadora, com dados agregados e cada acesso registado.
- **Registos de auditoria** (`change_log`, `wash_status_events`): só acrescentam registos (protegidos por triggers).
- **Moza Banco:** não afirmar parceria, interesse ou compromisso do Moza Banco, nem usar a sua marca sem confirmação. O relatório nunca é uma avaliação de crédito.
- **Restrições técnicas (DEC-12):** frontend em JS puro, sem frameworks nem build. Sem integrações reais com o WhatsApp nem com pagamentos.

## Convenções de código

- **Idiomas:**
  - textos para o utilizador, comentários e documentação em português (norma europeia/moçambicana: "actividade", "registo");
  - identificadores em inglês;
  - API JSON em camelCase; SQL em snake_case.
- **Módulos ES e funções:** funções pequenas, com nomes que dizem o que fazem. Comentários só para o porquê (regra, referência ao documento), não para o quê.
- **Dependências:**
  - classes com campos privados (`#`) para serviços e repositórios;
  - dependências injectadas pelo construtor;
  - nada de singletons nem de `new Date()` nas regras: usar o `clock` injectado.
- **Testes:** com `node:test`.
  - **Unitários** (`server/test/unit`): domínio puro, sem base de dados.
  - **Integração** (`server/test/integration`): base em memória e servidor HTTP real (`helpers.js`), com o relógio fixo em 2026-10-22 08:00 UTC.
- **Cliente:** `client/js/core` tem o que é partilhado (API, DOM, operador). Cada página tem a sua pasta, com `main.js` a ligar as partes. Todo o texto vindo da API passa por `escapeHtml` antes de entrar em `innerHTML`.

## Fluxo de trabalho por marco

1. Ler os capítulos 10 a 15 do documento e o marco em curso (cap. 17).
2. Implementar as regras no domínio, os casos de uso, a infraestrutura e a interface, com testes.
3. `npm test` verde.
4. Actualizar o `README.md`, o `changelog.md` e o `docs/decisoes.md` (decisões de implementação tomadas).
5. Fazer commit no git, com uma tag por versão.

## Cuidados

- Não correr comandos que afectem processos ou recursos fora deste projecto (ex.: `pkill -f` com padrões genéricos). Parar o servidor pelo seu PID.
- O protótipo não tem autenticação (D-16). O autor das acções vem do cabeçalho `X-Actor`. Não usar com dados reais.
