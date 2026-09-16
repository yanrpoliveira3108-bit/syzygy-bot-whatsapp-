# Flood Presets (load-test)

Sistema de presets do flood do SYZYGY. **Não** usa prefixo (`!pix` / `{prefix}pix` não existem).

Comandos (parser existente):

- `floodpresets` — menu
- `texttest` · `mentiontest` · `mediatest` · `paymenttest`
- `floodstop` / `floodstart` — kill switch
- `flooddryrun` — toggle dry-run
- Rápido: `2/preset/<nome>`
- Payload payment: `2/preset/payment-test/Pagamento do pedido|25.90|BRL`
- Menu do grupo: opção **5 · FLOOD PRESETS**
- Dono: `5/36` presets · `5/37` dry-run · `5/38` allowlist · `5/39` kill

O flood clássico (`2`, `2/01/Oi/20/1`, painel 2) permanece igual.

## Preset: payment-test

```
Type: payment
Max messages: 3
Interval: 3000 ms
Concurrency: 1
Cooldown: 30 s
Target mode: allowlist
```

Payload:

```
Texto:
Pagamento de teste

Valor:
25.90

Moeda:
BRL
```

API Baileys (`@innovatorssoft/baileys` 7.4.7):

```
sock.sendMessage(jid, { payment: { note, currency, amount, offset, from } })
```

mapeia para `requestPaymentMessage` (`amount1000 = valor * 1000`).

`paymentInvite` existe no fork, mas **não** carrega valor/moeda — não é usado neste preset.

## Segurança

- Allowlist obrigatória (`floodAllowlist` no `config.json`)
- Destino fora da lista → `BLOCKED_TARGET`
- Dry-run padrão (`floodDryRun: true`) — não envia
- `maxMessages` / interval / concurrency / cooldown / timeout
- Kill switch global `FLOOD_KILL_SWITCH` (`floodstop`)
- Sem modos `allContacts` / `allGroups` / `everyone`
- Mentions sem imprimir números no texto
- Logs mascaram JID; não registram sessão/credenciais

## Engine

preset → validação → allowlist → queue → limiter → envio → métricas

Todos os presets compartilham a mesma fila, limiter, retry curto, timeout, cancelamento e métricas (`started`, `queued`, `sent`, `failed`, `cancelled`, `duration`, `averageLatency`).
