# Roteiro da demonstração

Segue o guião de 5 minutos da proposta v1 (secção 12.1), com os ecrãs M1–M12. Usa dois ecrãs:
- **Ecrã 1 (telemóvel espelhado):** o simulador de WhatsApp e o checkout, o telemóvel do cliente.
- **Ecrã 2 (portátil):** o pátio do operador, o painel do gestor e o módulo Moza.

## Antes de subir ao palco

1. Node.js ≥ 22.13 instalado e `npm install` feito em todos os portáteis (e no portátil de reserva).
2. `npm run db:reset && JWT_SECRET=<segredo com 32+ caracteres> npm start`.
   - O reset carrega a base da proposta v1: 212 clientes e ~350 lavagens em 30 dias.
   - Antes das 11:00 em Maputo, as marcações de demonstração ficam para hoje; depois disso, para amanhã.
   - Com `JWT_SECRET` fixo, as sessões sobrevivem a um reinício do servidor.
3. Entrar em cada perfil (cada um no seu separador; as sessões são independentes):

   | Separador | Endereço | Entrar com |
   |---|---|---|
   | Cartaz (M1) | `/cartaz` | público |
   | Telemóvel 1: Carlos | `/simulador/whatsapp/258825550102` | público (é o telemóvel) |
   | Telemóvel 2: campanha | `/simulador/whatsapp/258846000001` | público (Abel, cliente inactivo com consentimento) |
   | Pátio (M7) | `/operador` | Amílcar · PIN `1234` |
   | Gestor (M10) | `/gestor` | `gestor@lavaja.demo` · `LavaJa-2026` |
   | Moza (M12) | `/moza` | `analista@moza.demo` · `MozaDemo-2026` |

4. Plano B: o vídeo de 2 minutos gravado no dia 23 de manhã.

Para repor os dados sem reiniciar (por exemplo, entre ensaios), arranque com um token e use:

```bash
DEMO_RESET_TOKEN=ensaio npm start
curl -X POST localhost:3000/api/admin/demo/reset -H 'Content-Type: application/json' \
  -H 'X-Demo-Token: ensaio' -d '{"confirm":"REPOR"}'
```

## Guião

| Tempo | O que se diz | Ecrã 1 (telemóvel) | Ecrã 2 (portátil) |
|---|---|---|---|
| 0:00 | O problema, com os dados da visita: tráfego desigual, espera no pátio, fidelização que não funciona, negócio invisível para o banco. | Foto do pátio | Slide do problema |
| 0:40 | "O Carlos chega e lê o QR. Check-in em 20 segundos." | Cartaz → simulador do Carlos: **LAVAR** → **1** (AHM 482 MP) → **1** (Simples). Resposta com a posição e a hora prevista | Pátio (M7): o carro aparece na fila |
| 1:30 | "O Amílcar inicia e marca pronto. O Carlos não teve de esperar no pátio." | Chegam "🧽 Começámos a lavar…" e "✨ … está pronto", com o link de pagamento (M3) | Pátio: no cartão do AHM 482 MP (3.º, há dois carros à frente), **Outra baia** → **Baia 3** → **✓ Pronto** |
| 2:10 | "Paga com a carteira que usa (simulado). Cada lavagem paga conta para a fidelização." | Tocar no link → checkout (M4): **M-Pesa** → **Pagar 250,00 MZN** → "Pagamento recebido"; na conversa, o recibo | Pátio: **Entregar** → "Pago · digital" → **Entregar e libertar**. Na conversa chega "🎁 Ganhou 1 benefício" (o Carlos fechou o ciclo). Gestor (M10): o recebido de hoje sobe |
| 2:50 | "Terça e quarta estão a 21–25% da capacidade. Um clique, e o gestor confirma." | Telemóvel 2 recebe a campanha (M5); responder **LAVAR** entra na fila | Gestor M10: alerta → **Criar campanha fora de pico** (M11) → **Enviar agora a N clientes** |
| 3:30 | "E o que ganha o Moza? A lavadora autorizou: o analista vê o score indicativo, os seis componentes e o que é verificado ou declarado. O pagamento de há pouco já está na receita verificada." | — | Moza (M12): score (≈ 64, classe B), ponto fraco "antiguidade", montante indicativo (≈ 90.000 MZN) com retenção de 10% → **Pedir análise de crédito**. Gestor › Crédito: o pedido e o acesso aparecem |
| 4:30 | O pedido: um piloto com várias lavadoras e conversas com o Moza Banco para validar o modelo e os parâmetros do score. | — | Slide final |

**Frase de fecho (proposta):** «Com o LavaJá Pass, o Lava Já enche os dias vazios e fideliza os clientes. Cada lavagem paga constrói um histórico que, com autorização da lavadora, o banco pode considerar. Propomos um piloto para o validar com dados reais.»

## Segregação de perfis (se o júri perguntar "quem vê o quê?")

- Abrir `/gestor` no separador do analista: vai para a entrada (sem sessão de gestor).
- No módulo Moza não há nomes nem telefones de clientes; só dados agregados e o que a lavadora autorizou.
- Gestor › Crédito › **Revogar AUT-002** e voltar ao Moza: o relatório deixa de estar disponível.
- O operador não vê o painel nem os preços para editar; o numerário que declara fica sempre em seu nome.

## O que não dizer (cap. 5.2)

- "Garante acesso ao crédito." / "O score aprova crédito." / "Prova a capacidade de reembolso." / "Substitui a avaliação de risco do banco." O score é **indicativo**: a decisão é do banco.
- "O Moza Banco é nosso parceiro" ou "já temos bancos interessados" (sem evidência).
- "Integra com o WhatsApp e com pagamentos reais" (no protótipo, é tudo simulado; o dinheiro não vai para nenhuma conta).

## Perguntas prováveis do júri

| Pergunta | Resposta curta | Onde mostrar |
|---|---|---|
| "Isto dá crédito às lavadoras?" | Não. O score indica se vale a pena o banco analisar e com que montante de partida; a análise, o modelo de risco e a decisão são do banco. | Moza › nota do montante; Extratos › Notas |
| "Como se calcula o score?" | Seis componentes da proposta v1, explicáveis; pesa o verificado: o numerário declarado não conta para o volume nem para a % digital. Os parâmetros são por validar com o banco. | Moza › Como se calcula |
| "Quem paga?" | A hipótese principal é o licenciamento ou subscrição institucional pelos bancos. Ainda não está validada: é um dos objectivos do piloto. | — |
| "Os dados são fiáveis?" | Cada valor indica a origem: o digital confirmado e o numerário declarado nunca se misturam, e os indicadores de qualidade mostram as lacunas. Há fecho diário por operador, e cada acção fica em nome de quem a fez. | Gestor › Conciliação; Moza › Extratos › Qualidade dos dados |
| "E a privacidade e a segurança?" | Quatro perfis com acesso separado; sessões assinadas; senhas e PINs só como hash. O banco só vê dados agregados, com autorização revogável e cada acesso registado. O enquadramento legal vai ser validado (D-18). | Gestor › Crédito |
| "Isto envia WhatsApp e processa pagamentos?" | No protótipo, não: é um simulador. As integrações reais são uma fase seguinte, com custos e aprovações. | Simulador (aviso no topo) |
| "As campanhas não são spam?" | Só para quem aceitou ofertas, no máximo uma em 7 dias, sempre confirmadas pelo gestor e com PARAR em cada mensagem. | Gestor › Campanhas |
| "A fidelização é sustentável?" | Ainda não sabemos. Os parâmetros são configuráveis e o nível 3 está desligado até à análise de custos (cap. 11.5). | Gestor › Catálogo e regras |

## Números da demonstração

| Telefone | Cliente | Para mostrar |
|---|---|---|
| 82 555 0102 | Carlos Sitoe | 9/10 na classe A: a próxima lavagem paga fecha o ciclo; marcação às 15:00 com proposta recusada |
| 84 555 0101 | Amélia Macuácua | 1 benefício na classe B (lavagem Simples gratuita) |
| 84 555 0106 | Paulo Mabunda | Duas viaturas (classes A e C); serviço em fila já pago em digital |
| 84 600 0001 | Abel (cliente de fundo) | Inactivo há 14+ dias e com consentimento: recebe a campanha (telemóvel 2) |
| Qualquer outro | — | Registo de um cliente novo pela conversa (nome e consentimentos) |

Para entrar na área do cliente (`/cliente`): telefone + código de 6 dígitos, que chega à conversa desse número no simulador.
