# Roteiro da demonstração

Segue o guião de 5 minutos do cap. 19 do documento de referência. Usa dois ecrãs:
- **Ecrã do cliente:** o simulador de WhatsApp, o telemóvel do cliente.
- **Ecrã da lavadora:** o Pátio, o Painel, o Catálogo e o Banco.

## Antes de subir ao palco

1. Node.js ≥ 22.13 instalado e `npm install` feito em todos os portáteis (e no portátil de reserva).
2. `npm run db:reset && npm start`.
   - Se correr o reset de manhã, antes das 11:00 em Maputo, as marcações de demonstração ficam para hoje; depois disso, para amanhã.
3. Abrir os separadores:
   - `http://localhost:3000/simulador/whatsapp/258825550102` (Carlos, cliente da classe A, a uma lavagem de fechar o ciclo);
   - `http://localhost:3000/patio`;
   - `http://localhost:3000/painel`;
   - `http://localhost:3000/catalogo`;
   - `http://localhost:3000/banco#relatorio`.
4. Escrever o nome do operador no Pátio ("Amílcar").
5. Plano B: o vídeo de 2 minutos gravado no dia 23 de manhã.

Para repor os dados sem reiniciar (por exemplo, entre ensaios), arranque com um token e use:

```bash
DEMO_RESET_TOKEN=ensaio npm start
curl -X POST localhost:3000/api/admin/demo/reset -H 'Content-Type: application/json' \
  -H 'X-Demo-Token: ensaio' -d '{"confirm":"REPOR"}'
```

## Guião

| Tempo | O que se diz | O que se faz |
|---|---|---|
| 0:00 | O desafio: tráfego e fidelização num car wash comunitário. O que vimos no terreno. | Foto do pátio |
| 0:40 | "O Carlos entra na fila pela conversa; o preço é o da classe do carro dele." | Simulador: "Olá" → **2** → **1** (AHM 482 MP) → **1** (Simples). A resposta mostra a posição e o início estimado. No Pátio, o cartão aparece na fila |
| 1:10 | "Outro cliente marca para mais tarde." | Pátio: "Marcações de hoje" (ou Painel › Capacidade › Amanhã). Mostrar a marcação das 15:00 com a proposta das 12:00 recusada |
| 1:40 | "Ficou livre um horário: o sistema propõe, o cliente decide. Nunca mudamos uma marcação sem aceitação." | Pátio: **Cancelar** a marcação das 14:00 (motivo). O horário é proposto à marcação seguinte. No simulador do Carlos chega "⏰ Temos um horário mais cedo…": responder **MANTER** e mostrar que o horário não mudou |
| 2:10 | "Pronto, pago (simulado), concluído: a fidelização da classe A avança. Repetir o pedido não duplica." | Pátio: **▶ Iniciar** num posto → **✓ Marcar pronto**. Simulador: **5** → **1** (pagamento digital simulado). Pátio: **Concluir…**. Na conversa chega "🎁 Ganhou 1 benefício" (o Carlos fechou o ciclo) |
| 2:50 | "Pagamento em numerário: fica declarado em nome do operador, separado do digital." | Pátio: num serviço por pagar, **Numerário…** → confirmar. Painel: os cartões "Digital confirmado" e "Numerário declarado" separados, e o gráfico lado a lado |
| 3:20 | "Mudamos um preço: o histórico não muda." | Catálogo: **Editar** a Simples, classe A, para 275,00. Painel › Viaturas por classe › AHM 482 MP › **Histórico**: os serviços antigos mantêm 250,00. O Registo de alterações mostra quem mudou |
| 3:50 | "E o banco? A lavadora autoriza, o banco vê actividade agregada com a origem de cada valor, e cada acesso fica registado. Não é uma pontuação de crédito." | Banco › Relatório (AUT-002, Moza Banco): indicadores com a origem, qualidade dos dados, notas. Banco › Autorizações: o registo de acessos tem a consulta que acabou de ser feita; **Revogar** e voltar ao relatório, que deixa de estar disponível |
| 4:30 | O pedido: um piloto com várias lavadoras e conversas com bancos para validar o modelo. | Slide final |

**Frase de fecho (proposta):** «O LavaJá Pass ajuda as lavadoras a organizar o pátio e a fidelizar clientes e, com a sua autorização, transforma essa actividade em informação que os bancos podem considerar. Propomos um piloto com várias lavadoras para validar, com dados reais, o valor para as lavadoras e para os bancos.»

## O que não dizer (cap. 5.2)

- "Garante acesso ao crédito." / "Prova a capacidade de reembolso." / "Substitui a avaliação de risco do banco."
- "O Moza Banco é nosso parceiro" ou "já temos bancos interessados" (sem evidência).
- "Integra com o WhatsApp e com pagamentos reais" (no protótipo, é tudo simulado).

## Perguntas prováveis do júri

| Pergunta | Resposta curta | Onde mostrar |
|---|---|---|
| "Isto dá crédito às lavadoras?" | Não. Organiza e regista a actividade; com autorização, o banco recebe informação adicional. A decisão e o modelo de risco são do banco. | Banco › Relatório › Notas |
| "Quem paga?" | A hipótese principal é o licenciamento ou subscrição institucional pelos bancos. Ainda não está validada: é um dos objectivos do piloto. | — |
| "Os dados são fiáveis?" | Cada valor indica a origem: o digital confirmado e o numerário declarado nunca se misturam, e os indicadores de qualidade mostram as lacunas. Há fecho diário por operador. | Painel (ⓘ), Painel › Fecho do dia, Banco › Qualidade dos dados |
| "E a privacidade?" | Os consentimentos são separados. O banco só vê dados agregados da lavadora, com autorização revogável e cada acesso registado. O enquadramento legal vai ser validado (D-18). | Banco › Autorizações |
| "Isto envia WhatsApp e processa pagamentos?" | No protótipo, não: é um simulador. As integrações reais são uma fase seguinte, com custos e aprovações. | Simulador (aviso no topo) |
| "A fidelização é sustentável?" | Ainda não sabemos. Os parâmetros são configuráveis e o nível 3 está desligado até à análise de custos (cap. 11.5). | Catálogo › Fidelização |
| "E se o cliente marcado chegar tarde?" | A tolerância está por decidir com as lavadoras (D-10; na demo, 15 min). Já está definido que nunca antecipamos uma marcação sem aceitação. | Painel › Capacidade › Regras |

## Números da demonstração

| Telefone | Cliente | Para mostrar |
|---|---|---|
| 84 555 0101 | Amélia Macuácua | 1 benefício na classe B (lavagem Simples gratuita) |
| 82 555 0102 | Carlos Sitoe | 9/10 na classe A: a próxima lavagem paga fecha o ciclo; marcação às 15:00 com proposta recusada |
| 84 555 0106 | Paulo Mabunda | Duas viaturas (classes A e C); serviço em fila já pago em digital |
| Qualquer outro | — | Registo de um cliente novo pela conversa (nome e consentimentos) |
