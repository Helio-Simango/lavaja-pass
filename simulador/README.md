# Simulador de WhatsApp (marco I-5)

Interface web que simula uma conversa de WhatsApp entre o cliente final e a lavadora. Não há integração real com o WhatsApp nem IA paga (DEC-12, cap. 10.6).

- **Endereço:** um por número, `/simulador/whatsapp/258841234567`. O servidor já encaminha esta rota para `simulador/index.html` quando o ficheiro existir.
- **Conversas:** ficam guardadas na base (`message_threads` e `messages`), isoladas por número e por ordem cronológica estável.
- **Assistente:** é uma máquina de estados guardada na conversa (cap. 15.6), com o menu:
  1. Planos e preços
  2. Entrar na fila
  3. Marcar horário
  4. Estado
  5. Pagar (simulado)
  6. Histórico
  7. Fidelização

  `MENU` volta ao início a qualquer momento.
- **Regras:** o assistente usa os mesmos casos de uso e regras do Pátio. A lógica fica em `server/src/application`; esta pasta só tem a interface.
- **Avisos:** os avisos do sistema (serviço iniciado, pronto) aparecem distintos das respostas do assistente.

## Estrutura prevista

```
simulador/
├─ index.html      página da conversa (servida em /simulador/whatsapp/:telefone)
├─ css/            estilo próprio (cores do WhatsApp: --wa-bg, --wa-in, --wa-out, --wa-head)
└─ js/             cliente da conversa (consulta a API a cada 3 s)
```

Os ficheiros estáticos desta pasta são servidos em `/simulador/…`. Pode reutilizar `client/js/core/` (cliente da API e utilitários de interface), que está disponível em `/js/core/…`.
