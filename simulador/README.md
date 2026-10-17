# Simulador de WhatsApp (I-5)

Interface web que simula a conversa de WhatsApp entre o cliente final e a lavadora. Não há integração real com o WhatsApp, IA paga nem pagamentos reais (DEC-12, cap. 10.6).

## Como usar

1. `npm run db:reset && npm start`
2. Abrir `http://localhost:3000/simulador` e escrever um número (ex.: `84 123 4567`), ou ir directamente a `/simulador/whatsapp/258841234567`.
3. Escrever "Olá". Um número novo é registado (nome e consentimentos); um cliente existente é cumprimentado pelo nome.

Números da demonstração:
- `84 555 0101`: Amélia, com 1 benefício na classe B.
- `82 555 0102`: Carlos, a uma lavagem de fechar o ciclo na classe A.

## O que o assistente faz

Menu (cap. 15.6), com `MENU` para voltar, `PARAR` para deixar de receber ofertas, `ADERIR` para entrar no programa de fidelização, e `ACEITAR` / `MANTER` para responder a uma proposta de horário:

1. **Planos e preços:** preços por classe.
2. **Entrar na fila:** viatura existente ou nova (matrícula e classe), plano e uso do benefício de fidelização.
3. **Marcar horário:** viatura, plano, dia (hoje ou amanhã) e horário livre. Uma marcação confirmada só muda de horário se o cliente aceitar uma proposta (**ACEITAR** / **MANTER**).
4. **Estado:** serviços em curso, com posição e horas estimadas.
5. **Pagar (simulado):** pagamento digital simulado, com confirmação.
6. **Histórico:** últimas lavagens.
7. **Fidelização:** cartão com progresso, nível e benefícios por classe.

Os avisos automáticos (serviço iniciado, pronto, pagamento recebido, entregue com progresso de fidelização; marcação registada, confirmada, proposta e remarcada) aparecem destacados, distintos das respostas do assistente. Mover um serviço no Pátio gera os avisos na conversa do cliente.

## Estrutura

```
simulador/
├─ index.html          servida em /simulador e /simulador/whatsapp/:telefone
├─ css/simulador.css   cores do WhatsApp (--wa-bg, --wa-in, --wa-out, --wa-head), claro e escuro
├─ js/
│  ├─ main.js          lista de conversas, endereço por número, envio e consulta a cada 3 s
│  ├─ chat-view.js     bolhas, avisos, separadores de dia, respostas rápidas
│  └─ whatsapp-format.js  *negrito* e _itálico_ sobre texto escapado (testado em Node)
└─ test/               testes da formatação (não servidos ao browser)
```

A lógica da conversa fica no servidor: `server/src/interfaces/chat/` (assistente e avisos) e `server/src/application/conversation-service.js`. Esta pasta só tem a interface e reutiliza `client/js/core/`.
