# LavaJá Pass

Protótipo para o **Hackathon Moza xLab – UEM** (1.ª edição, 22 e 23 de Outubro de 2026), caso **"Lava Já – Matola"**: como aumentar o tráfego e a fidelização de um car wash comunitário.

O LavaJá Pass organiza a actividade das pequenas lavadoras: clientes, viaturas, serviços, filas, marcações, recebimentos e fidelização. **Com autorização explícita da lavadora**, essa actividade torna-se informação estruturada que uma instituição bancária pode considerar na sua própria análise. Na demonstração, a instituição é o **Moza Banco**, que trouxe o desafio e patrocina o hackathon. Não existe parceria formal (ver [docs/decisoes.md](docs/decisoes.md)).

> **Protótipo.** Não tem autenticação (D-16), as conversas e os pagamentos são simulados e todos os dados são fictícios. Não usar com dados reais.

## Requisitos

- Node.js **22.13 ou superior** (usa `node:sqlite`, sem compilação nativa)
- npm

## Comandos

```bash
npm install        # Express (única dependência de execução)
npm run db:reset   # apaga data/lavaja.db, aplica as migrações e carrega os dados de demonstração
npm start          # http://localhost:3000
npm run dev        # o mesmo, reiniciando quando o código muda
npm test           # suite completa (base em memória)
npm run db:migrate # aplica só as migrações em falta
npm run db:seed    # carrega a demonstração numa base vazia
```

Configuração opcional num `.env` (ver [.env.example](.env.example)): `PORT`, `HOST` e `DB_PATH`. A base de dados nunca pode ficar dentro de `public/`.

## Estado da implementação

| Marco | Entregável | Estado |
|---|---|---|
| I-0 | Monorepositório, Express, SQLite, migrações, dados de demonstração, testes | ✅ |
| I-1 | Catálogo, clientes e viaturas | ✅ |
| I-2 | Serviços, fila, postos e estimativas; ecrã Pátio | ✅ |
| I-3 | Pagamentos simulados e numerário declarado | — |
| I-4 | Motor de fidelização parametrizável (depende de D-01, D-02) | — |
| I-5 | Simulador de WhatsApp e assistente | — |
| I-6 | Painel, viaturas por classe, histórico por matrícula, catálogo | — |
| I-7 | Vertente Banco, só para demonstração (Moza Banco; depende de D-16) | — |
| I-8 | Marcações e capacidade | — |
| I-9 | Consentimentos, registo de alterações, reconciliação | — |
| I-10 | Documentação e changelog | em curso |

O histórico de alterações está em [changelogs.md](changelogs.md).

## Ecrãs

| Endereço | Ecrã | Estado |
|---|---|---|
| `/` | Início, com os módulos | ✅ |
| `/patio` | Pátio: fila, em execução, pronto, postos, registo de serviço (M7, M8) | ✅ |
| `/painel`, `/catalogo`, `/banco`, `/simulador/whatsapp/:tel` | — | próximos marcos |

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
- **Entrega sem pagamento:** exige `allowUnpaid: true`, fica registada e marca o serviço como "entregue sem pagamento". Os pagamentos chegam no I-3.
- **Estimativas:** usam a duração do plano e os postos ocupados, e são sempre apresentadas como estimativas.
- **Dinheiro:** em centavos inteiros.
- **Registos que só acrescentam:** o registo de alterações e a auditoria de transições não aceitam `UPDATE` nem `DELETE`.

## Estrutura

```
├─ package.json · README.md · changelogs.md · .env.example
├─ src/
│  ├─ server.js · app.js · config.js
│  ├─ db/           connection · migrate · tx · seed-demo · reset · migrations/*.sql
│  ├─ lib/          errors · money · phone · plate · clock · validate
│  ├─ services/     catalog · customers · stations · washes · estimates · history · settings
│  ├─ controllers/  catalog · customers · washes
│  ├─ routes/       api
│  └─ middleware/   errors
├─ public/          index.html · patio.html · css/ · js/
├─ data/            lavaja.db (gerado; fora de public/; não versionado)
├─ test/            *.test.js (node:test)
└─ docs/            decisoes.md · referencia/ (documento de referência v3, HTML e PDF)
```

## Documentação

- [Documento de referência v3](docs/referencia/LavaJa-Pass-Documento-Referencia-v3.pdf): especificação completa. Os capítulos 10 a 15 servem o desenvolvimento.
- [docs/decisoes.md](docs/decisoes.md): decisões tomadas desde a v3 e decisões pendentes que afectam o código.
