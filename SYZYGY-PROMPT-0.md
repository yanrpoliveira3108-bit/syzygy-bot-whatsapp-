# SYZYGY 2.0 — PROMPT DE BUILD DO ZERO

Você vai implementar, do zero, um bot de WhatsApp em Node.js. Este arquivo é o
prompt **inteiro**: especificação + comandos + contratos + o código real de
referência. Não existe repositório para consultar, não procure git, não peça
link. Se faltar alguma coisa, escreva o módulo faltante e marque com
`// TODO(nao-especificado):` no topo e no relatório final.

## 0. Como trabalhar (leia antes de escrever qualquer linha)

1. **Ordem:** Fase 0 (esqueleto instala e importa) → 1 (conexão + texto puro) →
   2 (permissões/config) → 3 (menus numerados) → 4 (flood clássico) → 5 (wizard
   e presets) → 6 (shopping) → 7 (payment) → 8 (ataques de grupo) → 9 (extras:
   ViewOnce, Status, Inspector, agenda) → 10 (scripts de deploy) → 11 (aceite).
   Termine cada fase com a verificação dela e **pare para eu testar** só quando
   eu pedir; caso contrário, siga até o fim.
2. **Não inicie o bot.** Não há WhatsApp pareado aqui. Rode `node --check`, as
   suítes de teste e os `--dry-run`. Render de card de loja, pagamento e
   visualização única **não tem como provar sem aparelho**: reporte como
   "payload conforme proto, render não testado" — nunca "funciona".
3. **Não dispare flood/nuke/roubo real.** Todo teste usa `dryRun` + socket falso.
4. **Nada de dependência nova**: nem `dotenv`, nem framework de bot, nem
   Redis/BullMQ, nem TypeScript, nem ORM, nem Docker. Estado é JSON em disco.
5. **Nomes, ids e números são o produto.** Cada atalho, cada `actionId`, cada
   número de menu (`12`-`47`, `1`-`11`) e cada chave de `config.json` tem que ser
   **idêntico** ao que está nas tabelas abaixo. Engine interno você pode
   reorganizar; superfície, não.
6. **Um único `sock.sendMessage`** com o wrap de "Ler Mais" já embutido na
   conexão. Segundo atalho de send = defeito.
7. **Se um contrato não fechar** (API que o fork não tem, payload que o cliente
   rejeita), detecte no runtime, avise no chat e deposite no relatório — não
   finja sucesso e não troque a Baileys por outra para "testar".
8. **Segredo:** os números `5519000000000` e
   `150000000000000000-1000000000@g.us` são placeholders intencionais. Peça o
   número real ao usuário; não invente número de teste "de verdade".

## 1. Stack exata (e a Baileys deste build)

```json
{
  "name": "syzygy",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "build:prompt": "node tools/gerar-prompt-build.mjs",
    "verify:prompt": "node tools/gerar-prompt-build.mjs --verify",
    "prompt": "node tools/gerar-prompt-0.mjs",
    "prompt:full": "node tools/gerar-prompt-build.mjs",
    "prompt:verify": "node tools/gerar-prompt-build.mjs --verify"
  },
  "dependencies": {
    "@lucasmod/boruto-vk7-baileys": "2.1.0",
    "@boruto_vk7/libsignal-node": "npm:@itsukichan/libsignal-node@1.0.1",
    "jimp": "^1.6.0",
    "pino": "^10.3.1"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- **Runtime:** Node `>=20` (testado em 22), ESM puro (`"type": "module"`), sem build step.
- **Único logger:** `pino` com `{ level: "silent" }` — o resto imprime com
  `utils/logger.js` + `utils/terminalUI.js` (ANSI).
- **Imagem:** `jimp ^1.6` só para resize/formato do `menuImage` e da foto de grupo.
- **WhatsApp:** `@lucasmod/boruto-vk7-baileys@2.1.0` — fork não-oficial do Baileys
  (repo `Otakump4/boruto_vk7-baileys`). É **este** o pacote do projeto; não use
  `@whiskeysockets`, não use `@innovatorssoft` (era o anterior), não use o
  Baileys do npm oficial. Ele é a única fonte dos tipos `shop` (card de loja) e
  `payment` que o bot usa.

### 1.1 Instalação (4 armadilhas do empacotamento — verificadas em ambiente real)

```bash
# com o .npmrc deste projeto, basta:
npm i
# do zero, sem .npmrc (as flags são obrigatórias, não cosméticas):
npm i @lucasmod/boruto-vk7-baileys@2.1.0 --ignore-scripts --legacy-peer-deps
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps
```

| # | o que acontece | por quê |
|---|---|---|
| 1 | `npm i` aborta com `Cannot find module '.../engine-requirements.js'` | o `package.json` publicado roda `preinstall` apontando para arquivo que só existe em `baileys/` no tarball ⇒ precisa de `ignore-scripts=true` |
| 2 | `MODULE_NOT_FOUND` no import da raiz | o `main` (`lib/index.js`) não existe na raiz: o tarball é o monorepo, a lib vive em `baileys/lib/` |
| 3 | `ERR_UNSUPPORTED_DIR_IMPORT` no `import ".../boruto-vk7-baileys"` | sem `exports` map, ESM não resolve diretório ⇒ caminho explícito do arquivo |
| 4 | `Cannot find module '@boruto_vk7/libsignal-node'` (7 usos em `lib/Signal/`) | o fork renomeou o pacote e não publicou o nome ⇒ alias npm para `@itsukichan/libsignal-node@1.0.1` |

**Especificador canônico** (o único que resolve): `@lucasmod/boruto-vk7-baileys/baileys/lib/index.js`.
**Default export é o namespace, não a função** ⇒ use named import, ou (é o que o
projeto faz) importe só pelo shim:

```js
// ❌ import makeWASocket from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"   → makeWASocket vira objeto
// ✅ import { makeWASocket, useMultiFileAuthState, proto } from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"
// ✅✅ projeto real: import makeWASocket, { ... } from "../connection/baileysCompat.js"
```

`connection/baileysCompat.js` é o **único** arquivo que conhece o nome do pacote
(hoje 11 arquivos citam o pacote, mas **só** `baileysCompat.js` o importa — as
duas linhas `import *` e `export *`; os outros 10 são comentários/âncoras de
linha). Trocar de fork é uma linha nele. Rode `grep -rn "boruto-vk7" --include=*.js
. | grep -c from` e confirme que dá 1 arquivo.)

### 1.2 O que o pacote entrega (e o que você é proibido de chamar)

Contratos de payload verificados em `baileys/lib/Utils/messages.js` deste fork:

| comportamento | onde | regra que o SYZYGY segue |
|---|---|---|
| `shop` → `interactiveMessage.shopStorefrontMessage { surface, id }` | `messages.js:1020` | o card de loja é **exatamente** `{ text, title?, subtitle?, footer?, shop: { surface, id } }` |
| `viewOnce: true` → embrulho | `messages.js:1197` | **nunca** mande `viewOnce` junto do `shop` (o wrap mata o card no celular) |
| `payment` → `requestPaymentMessage` | `messages.js:725-753` (monta), `1247-1249` (lê) | `{ payment: { note, currency, amount, offset, from } }`, `amount` em milésimos (`25.90` → `25900`) |
| ramo combinado `nativeFlow + shop` | **NÃO EXISTE** aqui (`interactiveButtons` em `:973` é `else if` excludente) | o modo de entrega `flow` degenera no `puro`; `messageVersion` fica no default do proto. Reporte, não finja |

Métodos que **existem** e o projeto usa (25/25 ✓): `sendMessage`, `query`,
`sendNode`, `relayMessage`, `groupMetadata`, `groupFetchAllParticipating`,
`groupSettingUpdate`, `groupParticipantsUpdate`, `groupUpdateSubject`,
`groupUpdateDescription`, `groupGetInviteInfo`, `updateProfilePicture`,
`removeProfilePicture`, `profilePictureUrl`, `getCatalog`, `getCollections`,
`updateStatusPrivacy`, `getPrivacyTokens`, `refreshMediaConn`,
`presenceSubscribe`, `sendPresenceUpdate`, `getUSyncDevices`,
`requestPairingCode`, `generateMessageTag`, `end`.

Que **não** existem — não chame, não tente "polyfill com query crua":
`statusUpdate`, `updateStatus`, `fetchStatusSessions`, `groupLeave`,
`groupAdd`, `jids`, `Delay`, `prepareMessageToEncode`, `fetchLatestWAVersion`.
Consequências: story = `sendMessage("status@broadcast", ...)` +
`updateStatusPrivacy`; sair/remover do grupo = `groupParticipantsUpdate`; se
precisar de delay, `const Delay = ms => new Promise(r => setTimeout(r, ms))`.

Versionamento interno do fork: WhatsApp `[2, 3000, 1026924051]`
(`lib/Defaults/baileys-version.json`), `pino ^9.6` como dependência própria dele
(não alinhe com o `pino ^10` do projeto — cada um usa o seu), peer `jimp ^0.22`
(ignorado; o resize é nosso), `engines.node >= 20`.

Smoke test da fase 0 — tem que imprimir `function` (e ~252 chaves no segundo
comando; o número de exports não é contrato, é só prova de vida do pacote):

```bash
node --input-type=module -e 'import("@lucasmod/boruto-vk7-baileys/baileys/lib/index.js").then(m=>console.log(typeof m.makeWASocket, Object.keys(m).length))'
node --input-type=module -e 'import("./connection/baileysCompat.js").then(m=>console.log("shim:",typeof m.default))'
```

## 2. Árvore

```
index.js                      boot: config → logger → terminal UI → conexão (10 passos)
connection/  baileysCompat.js shim único da lib · whatsapp.js socket+wrap "Ler Mais"+eventos
             sessionRecovery.js reconexão/backoff · pairing.js --pair <numero> (QR opcional)
commands/    commandMap.js mapa texto→actionId (a superfície abaixo) · commandRouter.js dispatcher
handlers/    messageHandler.js pipeline dos 10 passos · stateHandler.js wizard (~74 actions)
             antiTakeover.js · helpHandler.js
services/    groupService.js executores (flood/nuke/roubo/foto) · fastParser.js modo rápido
             interactiveService.js/list.js/buttons.js UI · lidResolver.js · agendaService.js
             serverInspector.js · mediaService.js · bloksTransport.js
menus/       menu.js (roteador número→ação) · mainMenu.js · groupMenu.js · configMenu.js (1-11/12-47)
features/    flood/ (engine, shopping, payment, presets, allowlist, limiter, router, xray,
              customStore, queue, commerce, presetEngine, config, index)
              viewOnce/ · statusManager/ · inspector.js · agenda.js · restart.js
utils/       config.js (CONFIG, MAX_FLOOD, FLOOD_MODOS, uiMode) · permissions.js · stateManager.js
             lerMais.js · logger.js · botoes.js · terminalUI.js
dono/        estado do dono (fila, kill switch, histórico, presets gravados, lid_map) — criado em runtime
config.json  único estado de configuração · sessao/ auth da Baileys (gitignored)
start.sh · update.sh · recover.sh   deploy não-destrutivo (backup antes de qualquer escrita)
```

LOC reais do projeto (sem `node_modules`/`legacy`): implementação `13.710` linhas em 61 arquivos; suítes de teste separadas.

## 2.1 Inventário (o que existe no projeto e o que este prompt traz)

| arquivo | linhas | no prompt |
|---|---|---|
| `actions/configActions.js` | 57 | descrito (§10) |
| `actions/floodActions.js` | 20 | descrito (§10) |
| `actions/groupActions.js` | 48 | descrito (§10) |
| `commands/commandMap.js` | 58 | anexado (§9) |
| `commands/commandRouter.js` | 716 | anexado (§9) |
| `connection/baileysCompat.js` | 46 | anexado (§9) |
| `connection/pairing.js` | 52 | anexado (§9) |
| `connection/sessionRecovery.js` | 122 | anexado (§9) |
| `connection/socket.js` | 97 | descrito (§10) |
| `connection/whatsapp.js` | 329 | anexado (§9) |
| `features/flood/README.md` | 489 | descrito (§10) |
| `features/flood/allowlist.js` | 165 | anexado (§9) |
| `features/flood/commerce.js` | 125 | descrito (§10) |
| `features/flood/config.js` | 288 | anexado (§9) |
| `features/flood/customStore.js` | 140 | descrito (§10) |
| `features/flood/doctor.mjs` | 105 | descrito (§10) |
| `features/flood/engine.js` | 152 | anexado (§9) |
| `features/flood/groups.js` | 62 | descrito (§10) |
| `features/flood/index.js` | 386 | descrito (§10) |
| `features/flood/killswitch.js` | 67 | descrito (§10) |
| `features/flood/limiter.js` | 167 | anexado (§9) |
| `features/flood/payment.js` | 135 | anexado (§9) |
| `features/flood/presetEngine.js` | 430 | descrito (§10) |
| `features/flood/presets/custom.js` | 56 | anexado (§9) |
| `features/flood/presets/index.js` | 112 | anexado (§9) |
| `features/flood/presets/media.js` | 84 | anexado (§9) |
| `features/flood/presets/mention.js` | 68 | anexado (§9) |
| `features/flood/presets/payment.js` | 44 | anexado (§9) |
| `features/flood/presets/shopping.js` | 51 | anexado (§9) |
| `features/flood/presets/shoppingBuilder.js` | 68 | anexado (§9) |
| `features/flood/presets/text.js` | 25 | anexado (§9) |
| `features/flood/queue.js` | 141 | descrito (§10) |
| `features/flood/router.js` | 225 | anexado (§9) |
| `features/flood/shopping.js` | 374 | anexado (§9) |
| `features/flood/speed.js` | 112 | descrito (§10) |
| `features/flood/tests-infra.js` | 567 | suíte (rode, não reescreva) |
| `features/flood/tests-menu.js` | 250 | suíte (rode, não reescreva) |
| `features/flood/tests.js` | 455 | suíte (rode, não reescreva) |
| `features/statusManager/config.js` | 85 | descrito (§10) |
| `features/statusManager/index.js` | 421 | descrito (§10) |
| `features/statusManager/presets.js` | 105 | descrito (§10) |
| `features/statusManager/service.js` | 558 | descrito (§10) |
| `features/viewOnce/config.js` | 36 | descrito (§10) |
| `features/viewOnce/destinations.js` | 151 | descrito (§10) |
| `features/viewOnce/handler.js` | 127 | descrito (§10) |
| `features/viewOnce/index.js` | 30 | descrito (§10) |
| `features/viewOnce/permissions.js` | 39 | descrito (§10) |
| `features/viewOnce/service.js` | 248 | descrito (§10) |
| `features/viewOnce/tests.js` | 95 | suíte (rode, não reescreva) |
| `handlers/interactionHandler.js` | 30 | descrito (§10) |
| `handlers/messageHandler.js` | 315 | anexado (§9) |
| `handlers/stateHandler.js` | 1803 | descrito (§10) |
| `handlers/terminal.js` | 69 | descrito (§10) |
| `index.js` | 45 | anexado (§9) |
| `menus/adminMenu.js` | 12 | descrito (§10) |
| `menus/configMenu.js` | 261 | anexado (§9) |
| `menus/groupMenu.js` | 243 | descrito (§10) |
| `menus/mainMenu.js` | 138 | descrito (§10) |
| `menus/menu.js` | 281 | descrito (§10) |
| `menus/menutest.js` | 132 | descrito (§10) |
| `package.json` | 24 | anexado (§9) |
| `recover.sh` | 130 | descrito (§10) |
| `services/agendaService.js` | 250 | descrito (§10) |
| `services/antiTakeoverService.js` | 76 | descrito (§10) |
| `services/bloksTransport.js` | 110 | descrito (§10) |
| `services/buttons.js` | 68 | descrito (§10) |
| `services/fastParser.js` | 725 | descrito (§10) |
| `services/groupService.js` | 669 | anexado (§9) |
| `services/historicoService.js` | 85 | descrito (§10) |
| `services/interactiveList.js` | 8 | descrito (§10) |
| `services/interactiveService.js` | 278 | descrito (§10) |
| `services/lidResolver.js` | 171 | descrito (§10) |
| `services/list.js` | 212 | descrito (§10) |
| `services/mediaService.js` | 120 | descrito (§10) |
| `services/notificationService.js` | 76 | descrito (§10) |
| `services/presetService.js` | 89 | descrito (§10) |
| `services/serverInspector.js` | 410 | descrito (§10) |
| `start.sh` | 121 | descrito (§10) |
| `update.sh` | 477 | descrito (§10) |
| `utils/botoes.js` | 123 | descrito (§10) |
| `utils/config.js` | 132 | anexado (§9) |
| `utils/lerMais.js` | 47 | anexado (§9) |
| `utils/logger.js` | 73 | anexado (§9) |
| `utils/permissions.js` | 353 | anexado (§9) |
| `utils/stateManager.js` | 25 | anexado (§9) |
| `utils/terminalUI.js` | 94 | descrito (§10) |
| **total** | **17.058** | 33 anexados · 28 descritos · suítes citadas |

## 3. Comandos que existem (o usuário só digita isto)

### 3.1 Texto → `actionId` (fonte: `commands/commandMap.js`, export `TEXT_TO_ACTION`)

| o que o usuário digita | ação interna (`actionId`) | o que faz |
|---|---|---|
| `0` | `owner_sair` | 0 — desconecta/termina sessão |
| `1` | `painel_listar_grupos` | 1 — lista os grupos autenticados |
| `2` | `painel_flood` | 2 — painel de flood (escolha de grupo/modo) |
| `3` | `painel_tudo` | 3 — flood em todos os grupos autorizados |
| `4` | `painel_roubar` | 4 — painel de roubo/troca de dono |
| `5` | `painel_dono` | 5 — `Comandos do Dono` (faixa 12-47) |
| `6` | `painel_config` | 6 — `Configurações` (faixa 1-11) |
| `7` | `status_menu` | 7 — Status Manager (histórias) |
| `8` | `painel_multi` | 8 — flood multi-grupo por lote |
| `cancelar` | `menu_cancel` | sai do wizard/painel corrente (também `cancelar`) |
| `voltar` | `menu_inicial` | reabre o menu principal |
| `menu` | `menu_inicial` | reabre o menu principal |
| `menutest` | `menu_inicial` | reabre o menu principal |
| `01` | `painel_listar_grupos` | 1 — lista os grupos autenticados |
| `02` | `painel_flood` | 2 — painel de flood (escolha de grupo/modo) |
| `03` | `painel_tudo` | 3 — flood em todos os grupos autorizados |
| `04` | `painel_roubar` | 4 — painel de roubo/troca de dono |
| `05` | `painel_dono` | 5 — `Comandos do Dono` (faixa 12-47) |
| `06` | `painel_config` | 6 — `Configurações` (faixa 1-11) |
| `07` | `status_menu` | 7 — Status Manager (histórias) |
| `08` | `painel_multi` | 8 — flood multi-grupo por lote |
| `00` | `owner_sair` | 0 — desconecta/termina sessão |
| `multi` | `painel_multi` | 8 — flood multi-grupo por lote |
| `lote` | `painel_multi` | 8 — flood multi-grupo por lote |
| `historico` | `cfg_historico` | ver §contratos |
| `relatorio` | `cfg_relatorio` | ver §contratos |
| `agendamentos` | `cfg_agendamentos` | ver §contratos |
| `limpar_fantasmas` | `cfg_limpar_fantasmas` | ver §contratos |
| `limpar_agendamentos` | `cfg_limpar_agendamentos` | ver §contratos |
| `botstatus` | `cfg_status` | ver §contratos |
| `bloks` | `server_inspector` | ver §contratos |
| `floodpresets` | `painel_flood_presets` | ver §contratos |
| `floodpreset` | `painel_flood_presets` | ver §contratos |
| `paymenttest` | `flood_preset_payment_test` | roda o preset `?` (dry-run do tipo) |
| `shoppingtest` | `flood_preset_shopping_test` | roda o preset `?` (dry-run do tipo) |
| `texttest` | `flood_preset_text_test` | roda o preset `?` (dry-run do tipo) |
| `mentiontest` | `flood_preset_mention_test` | roda o preset `?` (dry-run do tipo) |
| `mediatest` | `flood_preset_media_test` | roda o preset `?` (dry-run do tipo) |
| `floodstop` | `flood_kill_on` | para QUALQUER flood em andamento (kill switch) |
| `floodstart` | `flood_kill_off` | desliga o kill switch |
| `flooddryrun` | `cfg_flood_dryrun` | alterna dry-run do flood |

Todo item acima funciona **com e sem** `!` onde o próprio mapa já traz as duas
formas; o roteador normaliza caixa/trim e aceita o `actionId` cru também. O
`commandRouter` devolve `{ actionId, args }` e quem decide permissão é
`utils/permissions.js` antes de qualquer efeito.

### 3.2 Menus numerados

**Painel Configurações — ADM (1-11)** (também por `6>n` e `01`…`11`)

| nº | rótulo no menu | `actionId` roteado |
|---|---|---|
| 1 | Ver proprietario | `cfg_owner` |
| 2 | Numero conectado | `cfg_number` |
| 3 | Status da conexao | `cfg_status` |
| 4 | Historico | `cfg_historico` |
| 5 | Relatorio completo | `cfg_relatorio` |
| 6 | Agendamentos | `cfg_agendamentos` |
| 7 | Listar ADMs do bot | `cfg_list_users` |
| 8 | Listar grupos autz | `cfg_list_groups` |
| 9 | Listar donos | `cfg_list_owners` |
| 10 | Marcar fantasma | `cfg_fantasma` |
| 11 | Voltar ao menu | `abrir_painel` |

**Painel Comandos do Dono (12-47)** (também por `5>n`; 35 = voltar, 47 = voltar ao menu)

| nº | rótulo no menu | `actionId` roteado |
|---|---|---|
| 12 | Criar preset | `cfg_criar_preset` |
| 13 | Apagar preset | `cfg_apagar_preset` |
| 14 | Imagem do menu | `cfg_menuImage` |
| 15 | Link de divulgacao | `cfg_link` |
| 16 | Ler mais | `cfg_ler_mais` |
| 17 | Modo do flood | `cfg_flood_modo` |
| 18 | Intervalo do flood | `cfg_flood_interval` |
| 19 | Lote do flood | `cfg_flood_lote` |
| 20 | Auto-limpeza | `cfg_autolimpeza` |
| 21 | Anti-takeover | `cfg_antitakeover` |
| 22 | Limpar fantasmas | `cfg_limpar_fantasmas` |
| 23 | Limpar agendamentos | `cfg_limpar_agendamentos` |
| 24 | + Add ADM do bot | `cfg_add_user` |
| 25 | - Remover ADM | `cfg_remove_user` |
| 26 | + Add grupo autz | `cfg_add_group` |
| 27 | - Remover grupo | `cfg_remove_group` |
| 28 | + Add dono extra | `cfg_add_owner` |
| 29 | - Remover dono | `cfg_remove_owner` |
| 30 | ViewOnce ON/OFF | `cfg_viewonce_toggle` |
| 31 | VO -> grupos | `cfg_viewonce_groups` |
| 32 | VO -> owner | `cfg_viewonce_owner` |
| 33 | VO -> ADMs | `cfg_viewonce_admins` |
| 34 | VO salvar | `cfg_viewonce_save` |
| 36 | Flood presets (load-test) | `painel_flood_presets` |
| 37 | Flood dry-run | `cfg_flood_dryrun` |
| 38 | Escolher grupos (1,3,5) | `cfg_flood_allowlist` |
| 39 | Kill switch do flood | `cfg_flood_kill` |
| 40 | Allowlist: listar | `cfg_flood_allowlist_view` |
| 41 | Allowlist: + grupo | `cfg_flood_allowlist_add` |
| 42 | Allowlist: - grupo | `cfg_flood_allowlist_remove` |
| 43 | Velocidade do flood (presets) | `cfg_flood_speed` |
| 44 | Modo teste (payment/loja) | `cfg_flood_testmode` |
| 45 | Loja: preview do card | `cfg_flood_loja` |
| 46 | Raio-X do flood | `cfg_flood_xray` |
| 47 | Voltar ao menu | `abrir_painel` |

- `0`/`11`/`35`/`47` → `abrir_painel` (voltar). Números com rótulo mas sem ação no mapa = erro de paridade — os testes do projeto proíbem isso.
- Atalho derivado: `numeroNavegacao(id)` → `NUM_CONFIG[id] >= 12 ? "5>"+n : "6>"+n` (fonte: `menus/menu.js:111-117`).

### 3.3 Atalhos de flood/preset (fonte: `features/flood/router.js`)

| atalho | o que faz |
|---|---|
| `floodpresets` | painel_flood_presets |
| `floodpreset` | painel_flood_presets |
| `texttest` | flood_preset_text_test |
| `mentiontest` | flood_preset_mention_test |
| `mediatest` | flood_preset_media_test |
| `paymenttest` | flood_preset_payment_test |
| `shoppingtest` | flood_preset_shopping_test |
| `floodstop` | flood_kill_on |
| `floodstart` | flood_kill_off |
| `flooddryrun` | cfg_flood_dryrun |
| `2/preset/<id>` | carrega e roda o preset `<id>` no grupo do painel (atalho direto, sem menu) |
| `15>` | submenu de velocidade/intervalo do flood |
| `36>4` | dentro do menu 36: rodar o preset nº 4 |

### 3.4 Presets e modos de flood

| preset (`id`) | tipo | texto/caption | alvo | máx | intervalo | cooldown | onde está definido |
|---|---|---|---|---|---|---|---|
| `text-test` | text | SYZYGY text-test | selected | 3 | 2000 ms | 15000 ms | `features/flood/config.js` |
| `mention-test` | mention | SYZYGY mention-test | selected | 2 | 2500 ms | 20000 ms | `features/flood/config.js` |
| `media-test` | media | SYZYGY media-test | selected | 2 | 3000 ms | 20000 ms | `features/flood/config.js` |
| `payment-test` | payment | Pagamento de teste | selected | 3 | 3000 ms | 30000 ms | `features/flood/config.js` |
| `shopping-test` | shopping | 🛍️ SYZYGY SHOP — novidades da semana | selected | — | — ms | — ms | `features/flood/presets/shopping.js` (surface 1 · delivery puro) |

Tipos aceitos: `text`, `mention`, `media`, `payment`, `shopping`, `custom`. Tetos por tipo (`FLOOD_PRESET_HARD_CAP`): `maxMessages`=10 · `minInterval`=1000 · `maxConcurrency`=2 · `minCooldown`=5000 · `minTimeout`=3000 · `maxTimeout`=30000 · `maxRetries`=2. Teto global do flood: `MAX_FLOOD = 1000`.

| `floodModo` | rótulo no menu | `intervalo` (ms) | `lote` |
|---|---|---|---|
| `rapido` | Rápido 50ms/lote8 | 50 | 8 |
| `normal` | Normal 100ms/lote6 | 100 | 6 |
| `lento` | Lento 250ms/lote4 | 250 | 4 |
| `seguro` | Seguro 500ms/lote3 + jitter | 500 | 3 |

`floodJitter` vira `true` automaticamente só no modo `seguro`. `LOTE` efetivo no engine = `max(1, min(floodLote, 10))`. `uiMode`: `text` (default) | `buttons` | `list` | `bloks`, com `txt` aceito como alias; `uiModoEfetivo()` trata `bloks` como `text` para os menus (só o Server Inspector usa o transporte bloks).

### 3.5 Estados do wizard (cada um `st.action` precisa de handler + `cancelar`)

**`waiting_*` (17)** — `waiting_bio`, `waiting_both_bio`, `waiting_both_name`, `waiting_flood_amount`, `waiting_flood_message`, `waiting_flood_modo`, `waiting_group`, `waiting_group_image`, `waiting_image_url`, `waiting_menu_image`, `waiting_name`, `waiting_roubar_preset`, `waiting_tudo_bio`, `waiting_tudo_image`, `waiting_tudo_msg`, `waiting_tudo_name`, `waiting_tudo_preset`

**`config_*` (16)** — `config_add_group`, `config_add_owner`, `config_add_user`, `config_menu`, `config_remove_group`, `config_remove_owner`, `config_remove_user`, `config_set_flood_allowlist_add`, `config_set_flood_allowlist_pick`, `config_set_flood_allowlist_remove`, `config_set_flood_interval`, `config_set_flood_loja`, `config_set_flood_lote`, `config_set_flood_modo`, `config_set_flood_speed`, `config_set_link`

**`multi_*` (14)** — `multi_agendar_flood_amount`, `multi_agendar_flood_message`, `multi_agendar_flood_modo`, `multi_agendar_roubar_preset`, `multi_agendar_tempo`, `multi_agendar_tipo`, `multi_agendar_tudo_msg`, `multi_agendar_tudo_preset`, `multi_flood_amount`, `multi_flood_message`, `multi_flood_modo`, `multi_roubar_preset`, `multi_tudo_msg`, `multi_tudo_preset`

**`status_*` (13)** — `status_audiencia_menu`, `status_menu_st`, `status_preset_apagar`, `status_preset_criar_nome`, `status_preset_criar_texto`, `status_preset_menu`, `status_preset_select`, `status_priv_menu`, `status_waiting_audience`, `status_waiting_group_import`, `status_waiting_image`, `status_waiting_text`, `status_waiting_video`

**`agendar_*` (8)** — `agendar_cancelar`, `agendar_flood_amount`, `agendar_flood_message`, `agendar_flood_modo`, `agendar_roubar_preset`, `agendar_tempo`, `agendar_tudo_msg`, `agendar_tudo_preset`

**`preset_*` (5)** — `preset_apagar`, `preset_novo_bio`, `preset_novo_img`, `preset_novo_msg`, `preset_novo_nome`

**`group_*` (4)** — `group_action_menu`, `group_agendar_tipo`, `group_menu`, `group_multi_action`

São 77 ações roteadas por `handlers/stateHandler.js` (extraído dos
`st.action === "…"` reais). Quem cai fora do mapa tem que cair em "não entendi",
nunca em silêncio.

## 4. `config.json` — o único estado de configuração

Forma (números mascarados; **não** versionado em git):

```json
{
  "nome": "SYZYGY",
  "bio": "⚔️ SYZYGY ⚡",
  "menuImage": "./dono/menus/Foto-menu/img-menu.jpg",
  "ownerOverride": "",
  "uiMode": "text",
  "grupoOficial": "",
  "linkDivulgacao": "",
  "lerMais": true,
  "marcarFantasma": true,
  "floodModo": "normal",
  "floodInterval": 100,
  "floodLote": 6,
  "floodJitter": false,
  "autoLimpeza": true,
  "antiTakeover": true,
  "usuariosAutorizados": [],
  "gruposAutorizados": [],
  "lidsAutorizados": [],
  "donosExtras": [],
  "uiDebug": false
}
```

Regras: chave desconhecida em `SET_KEYS` → warning, não exceção; arrays são
substituídos por completo (sem merge profundo); `salvarConfig()` é o único ponto
de escrita (com snapshot para o `recover.sh`); o bot lê no boot e o wizard
escreve. `uiMode` aceita `"text"` | `"interactive"` e decide qual renderer de
menu roda (`uiModoEfetivo` cai para `text` se o socket não suportar interactive).

## 5. Contratos que você não pode improvisar

Estes são os pontos onde a reimplementação "parecida" quebra o bot. Os arquivos
completos estão no apêndice; aqui vai a obrigação funcional:

- **`executarFlood(jid, msg, qtd, intervaloOuOpts = 100, buildContent = null)`**
  (`services/groupService.js`): corpo = `msg + "\u200b".repeat((idx % 6) + 1)`;
  `LOTE = max(1, min(lote, 10))`; gate de cooldown; `null` de `buildContent` =
  flood clássico de texto, função = flood com conteúdo por índice (shopping).
  Sem `buildContent`, **nada** de montar payload.
- **Shopping é TIPO de preset do flood**, não segundo sistema: o mesmo
  `runPresetJob` → `executarFlood` → `buildSendContent`. Existe um único
  `SHOP_SEND_KEYS` (portão de chaves) e 15 códigos de erro `SHOPPING_ERROR`;
  conteúdo inválido = erro digitado, nunca "jeito jeitoso".
- **Card de loja** = `{ text, title?, subtitle?, footer?, shop: { surface, id } }`
  com `surface ∈ {1,2,3}` (`4` vira `3` + warning; o README do fork antigo
  inventou o 4). `viewOnce` omitido sempre. `puro|flow` é escolha de
  diagnóstico, não requisito (`flow` não muda o wire neste fork — §1.2).
- **Payment** = `{ payment: { note, currency, amount, offset, from } }`;
  `parsePaymentArgs("Pedido|25.90|BRL")`; `amount` em milésimos; gates
  `PAYMENT_TEST_DISABLED` / `PAYMENT_NOT_ALLOWED`; nunca `.png` de recibo, nunca
  "pagamento confirmado" sem o `retryReqId` do WhatsApp.
- **Ataques de grupo** (`executarNuke`, `roubarGrupo`): sequência exata e
  `demote|remove` **por último** (inverter = perder o controle antes de terminar);
  throttling de `groupMetadata` compartilhado; allowlist explícita nunca ampliada
  sozinha.
- **Pipeline** (`handlers/messageHandler.js`): ordem dos 10 passos — filtro de
  fromMe/status → `baileysCompat` → normalização de JID (LID antes de telefone!) →
  permissão → fastParser → `commandRouter` → stateHandler → efeito → log →
  histórico do dono. Trocar a ordem = comando que para de funcionar.
- **Wizard** (`handlers/stateHandler.js`): cada `state.action` tem handler e
  mensagem de saída própria; `cancelar`/`voltar` em todo passo; `setConfig` só
  pelo `SET_KEYS`.
- **Permissões** (`utils/permissions.js`): dono → ADM → grupo autorizado →
  allowlist do flood. Sem dono configurado, **nada** de painel abre.

## 6. Segurança (não negociável)

- `MAX_FLOOD = 1000`; teto por tipo (`FLOOD_PRESET_HARD_CAP`); preset
  acima do teto é **cercado**, não recusado em silêncio.
- Kill switch persistido (`dono/flood_state.json`) e checado **por lote** — parar
  leva no máximo 1 lote.
- `dryRun` não envia e **não** escreve histórico; `testMode` gate de
  payment/shopping.
- Allowlist de grupos de flood é lista explícita; `addAllowlistJid` normaliza
  para `@s.whatsapp.net`/`@g.us` e não aceita ampliação automática por
  mensagem.
- Scripts de deploy nunca fazem `reset --hard`/`checkout -f`/`stash drop`; toda
  escrita vem precedida de backup em `.syzygy-backup/<ts>/`.
- `sessao/`, `config.json`, `dono/*` fora do git.

## 7. Aceite (o que "pronto" quer dizer aqui)

```bash
for f in $(find . -name "*.js" -not -path "./node_modules/*"); do node --check "$f"; done
node features/flood/tests.js        # FLOOD · SHOPPING: 184 ok · 0 falhas · 0 skip
node features/flood/tests-menu.js   # FLOOD · MENU:     83 ok · 0 falhas · 0 skip
node features/flood/tests-infra.js  # FLOOD · INFRA:   228 ok · 0 falhas · 0 skip
node features/viewOnce/tests.js     # TODOS TESTES VIEW-ONCE PASSARAM
npm start                            # (você NÃO roda isto; é o passo do usuário)
```

`tests-payment.js` não existe: o payment é coberto pela suíte de infra. As
suítes acima são offline por construção (socket falso, `config.json`
snapshot/restaurado, `persist:false`) — se o seu código fizer elas escreverem em
disco, o teste falha de propósito. **Não enfraqueça asserção para passar.**

Relatório final obrigatório: o que foi implementado por fase, saída das 4 suítes,
lista de `TODO(nao-especificado)`, e a frase honesta "render de card de loja,
pagamento e viewOnce não testados em aparelho".

## 8. Proibições (as 12 que já queimaram alguém)

1. trocar a Baileys por `@whiskeysockets`/"oficial" para "testar mais rápido"
2. segundo `sock.sendMessage` ou encurtador paralelo ao wrap de Ler Mais
3. `viewOnce: true` no card de loja
4. `surface: 4`
5. `shop` com `messageVersion` "para forçar render"
6. payment com `.png`/recibo falso ou "confirmado" sem `retryReqId`
7. flood com allowlist ampliada automaticamente (ou por mensagem recebida)
8. `demote`/`remove` antes de concluir a sequência de ataque
9. `salvarConfig()` dentro de teste
10. `reset --hard`/`stash` em script de deploy
11. restaurar arquivos de `legacy/` "porque existiam"
12. dizer que renderizou sem aparelho

---

# 9. APÊNDICE — código-fonte de referência

Prioridade: Tier 1 (contrato/superfície) sempre entra; Tier 2 (implementações) entra
enquanto couber no orçamento de 260 KB. O que ficou de fora está listado com a
assinatura exata de cada exportação — reimplementar a partir delas é suportado.

**Incluídos (33):** `package.json` · `.npmrc` · `.gitignore` · `index.js` · `connection/baileysCompat.js` · `connection/whatsapp.js` · `connection/sessionRecovery.js` · `connection/pairing.js` · `utils/config.js` · `utils/permissions.js` · `utils/stateManager.js` · `utils/lerMais.js` · `utils/logger.js` · `commands/commandMap.js` · `commands/commandRouter.js` · `handlers/messageHandler.js` · `features/flood/config.js` · `features/flood/engine.js` · `features/flood/shopping.js` · `features/flood/payment.js` · `features/flood/allowlist.js` · `features/flood/limiter.js` · `features/flood/router.js` · `features/flood/presets/index.js` · `features/flood/presets/text.js` · `features/flood/presets/mention.js` · `features/flood/presets/media.js` · `features/flood/presets/payment.js` · `features/flood/presets/shopping.js` · `features/flood/presets/shoppingBuilder.js` · `features/flood/presets/custom.js` · `menus/configMenu.js` · `services/groupService.js`

### package.json — 24 linhas (0.6 KB)

```json
{
  "name": "syzygy",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "build:prompt": "node tools/gerar-prompt-build.mjs",
    "verify:prompt": "node tools/gerar-prompt-build.mjs --verify",
    "prompt": "node tools/gerar-prompt-0.mjs",
    "prompt:full": "node tools/gerar-prompt-build.mjs",
    "prompt:verify": "node tools/gerar-prompt-build.mjs --verify"
  },
  "dependencies": {
    "@lucasmod/boruto-vk7-baileys": "2.1.0",
    "@boruto_vk7/libsignal-node": "npm:@itsukichan/libsignal-node@1.0.1",
    "jimp": "^1.6.0",
    "pino": "^10.3.1"
  },
  "engines": {
    "node": ">=20"
  }
}

```

### .npmrc — 11 linhas (0.6 KB)

```js
; .npmrc — necessário por causa do EMPACOTAMENTO do fork de Baileys.
; ignore-scripts: o package.json publicado do @lucasmod/boruto-vk7-baileys declara
;   "preinstall": "node ./engine-requirements.js", mas o arquivo só existe em
;   baileys/engine-requirements.js dentro do tarball → sem esta linha o `npm i`
;   aborta com MODULE_NOT_FOUND (verificado em Node 22 / npm 10).
; legacy-peer-deps: o peer do fork pede jimp ^0.22 e o projeto usa jimp ^1.6
;   (o jimp do peer só é usado em updateProfilePicture; o resize do SYZYGY é próprio).
; Não remova sem re-verificar a instalação da lib.
ignore-scripts=true
legacy-peer-deps=true

```

### .gitignore — 28 linhas (0.2 KB)

```js
node_modules/
.env
.env.*
!.env.example

auth/
auth_info/
session/
sessions/
baileys_auth/
creds.json
*.session

*.log
logs/
cache/
tmp/
temp/

*.db
*.sqlite
*.sqlite3

.DS_Store

# backups locais criados por ./update.sh (nunca versionar)
.syzygy-backup/

```

### index.js — 45 linhas (2.1 KB)

```js
// index.js
// [REORGANIZAÇÃO] Ponto de entrada do SYZYGY. Apenas COORDENA:
//   config -> conexão -> handlers -> terminal.
// Toda a lógica operacional vive nos módulos. O index.js gigante foi separado.

import { instalarSilenciador, origLog } from "./utils/logger.js"
import { carregarConfig } from "./utils/config.js"
import { bannerSYZYGY, boot, ok, err, credLine } from "./utils/terminalUI.js"

import { instalarHandlersProcesso } from "./connection/sessionRecovery.js"
import { iniciarConexao, setAsk } from "./connection/whatsapp.js"
import { menuTerminal, ask } from "./handlers/terminal.js"

// 1) Silenciador de logs sensíveis (mantém proteção de sessão).
instalarSilenciador()

// 2) Configuração persistida (config.json + ownerOverride).
carregarConfig()

// 3) Handlers de processo (recuperação de sessão em erros de Signal).
instalarHandlersProcesso()

// 4) Compartilha o readline do terminal com a conexão (pergunta do número).
setAsk(ask)

// 5) Bootstrap.
console.clear()
process.stdout.write(bannerSYZYGY())
origLog(boot("Inicializando SYZYGY..."))
    origLog(ok("BUILD: v58 — FOTO DOS GRUPOS COM RETRY + TERMINAL LIMPO: causa da foto parar de mudar = bug do fork que envenena o cache da conexão de mídia após UMA falha de media_conn (todo upload morre até reconectar; nome/bio seguem OK); trocarFotoComRetry (3 tentativas + backoff + refreshMediaConn + motivo REAL) em TODOS os caminhos de foto (roubar/nuke/preset/arquivo/URL/buffer); catch vazio de alterarTudoGrupo removido; relatórios de roubar/nuke agora mostram o MOTIVO dos erros (fim do '1 erro(s)' sem explicação) + resumo [ROUBAR]/[NUKE] no terminal; terminal com carimbo HH:MM:SS em todas as linhas e [UI] de 5 linhas → 1 (verboso via uiDebug) [2026-08-29 v58]"))
origLog(ok("Configurações carregadas"))
origLog(ok("Carregando autenticação..."))

try {
    await iniciarConexao()
    origLog(ok("Conexão WhatsApp estabelecida com sucesso"))
    origLog("")
    origLog(credLine())
    origLog("")
    await menuTerminal()
} catch (e) {
    origLog(err(`Falha crítica: ${e.message}`))
    process.exit(1)
}

```

### connection/baileysCompat.js — 46 linhas (2.8 KB)

```js
// connection/baileysCompat.js
// [v48→v51] CAMADA DE COMPATIBILIDADE BAILEYS — ÚNICO ponto de import da lib.
//
// [v51] Migração @innovatorssoft/baileys 7.4.7 → @lucasmod/boruto-vk7-baileys
// 2.1.0 (repo Otakump4/boruto_vk7-baileys). O que DOEU e como este arquivo
// absorve:
//  - O pacote publicado é o monorepo inteiro: a lib real está em `baileys/lib/`,
//    então o `main: lib/index.js` da raiz não existe. O specifier canônico é
//    `@lucasmod/boruto-vk7-baileys/baileys/lib/index.js` (ESM não resolve
//    diretório: `.../baileys` dá ERR_UNSUPPORTED_DIR_IMPORT).
//  - Default export é o NAMESPACE, não a função — o mesmo sintoma do
//    innovatorssoft, e é para isto que o `typeof === "function"` abaixo existe.
//  - Ele exige `@boruto_vk7/libsignal-node`, nome que não existe no npm; o
//    package.json do projeto resolve via npm alias para
//    @itsukichan/libsignal-node@1.0.1 (mesmo código, nome publicado).
//  - `npm i` precisa de --ignore-scripts (preinstall aponta para arquivo
//    ausente na raiz do tarball) — fixado no .npmrc do projeto.
//  - Contratos de payload preservados no fork novo (verificados no lib dele):
//    `shop` em Utils/messages.js:1020, embrulho de `viewOnce` em :1197,
//    payment em :725-753 (montagem) e :1247-1249 (leitura).
//    Exceção: o ramo COMBINADO nativeFlow+shop (que punha messageVersion=1)
//    NÃO existe aqui — `interactiveButtons` (:973) monta só nativeFlowMessage e
//    é `else if` exclusivo. Ver features/flood/shopping.js.
//
// Migração @whiskeysockets/baileys 7.0.0-rc14 → @innovatorssoft/baileys 7.4.7:
//  - Todas as APIs usadas pelo projeto existem no fork com os mesmos nomes
//    (verificado em runtime: makeWASocket, useMultiFileAuthState,
//    fetchLatestBaileysVersion, DisconnectReason, jidNormalizedUser,
//    areJidsSameUser, downloadMediaMessage, normalizeMessageContent,
//    getContentType, generateWAMessageFromContent, prepareWAMessageMedia,
//    generateForwardMessageContent, generateWAMessage, proto, ...).
//  - DIFERENÇA REAL corrigida aqui: no whiskeysockets o default export É a
//    função makeWASocket; no innovatorssoft o default export é o NAMESPACE
//    (objeto). O projeto faz `import makeWASocket from ...` — sem esta camada
//    ele receberia um objeto e quebraria ao conectar. Aqui o default volta a
//    ser a função, preservando o contrato original.
//  - Para trocar de fork no futuro, mude SOMENTE este arquivo.
import * as baileys from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"

const makeWASocketFn = typeof baileys.default === "function"
    ? baileys.default               // whiskeysockets: default = função
    : baileys.makeWASocket         // innovatorssoft: default = namespace

export default makeWASocketFn
export * from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"

```

### connection/whatsapp.js — 329 linhas (13.2 KB)

```js
// connection/whatsapp.js
// [v24] LID resolver + grupos autorizados blindados + anti-takeover

import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "./baileysCompat.js"

import pino from "pino"
import fs from "fs"
import path from "path"

import { rt, setSock, getSock, instalarRastreioDeEnvios } from "./socket.js"
import {
    SESSAO_PATH, MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY
} from "../utils/config.js"
import { boot, ok, err, warn, COLORS as C } from "../utils/terminalUI.js"
import {
    normalizeNumber, getSenderJid, setDetectedOwner, getOwnerNumber, ownerJidForSending,
    isAuthorizedGroup
} from "../utils/permissions.js"
import { isGroupJid } from "../utils/permissions.js"

import {
    encerrarSocketAtual, isSessionError, tentarRecuperacaoSessao, setIniciarConexao
} from "./sessionRecovery.js"
import { pedirNumeroPairing, solicitarPairingCode } from "./pairing.js"

import { registrarMessageHandler } from "../handlers/messageHandler.js"
import { atualizarGrupos, limparCacheFantasmas, throttledGroupMetadata } from "../services/groupService.js"
import { enviarNotifNovoGrupo, notificarBotOnline } from "../services/notificationService.js"
import { CONFIG } from "../utils/config.js"

let _ask = async () => ""
export function setAsk(fn) { _ask = fn }

export async function iniciarConexao() {
    const r = rt()
    if (r.isConnecting || r.connectionLock) return
    r.isConnecting = true
    r.connectionLock = true
    try {
        await conectar()
    } catch (e) {
        console.log(err(`[AUTH] Falha: ${e.message}`))
        if (isSessionError(e.message)) {
            await tentarRecuperacaoSessao(e.message)
        }
        throw e
    } finally {
        r.isConnecting = false
        r.connectionLock = false
    }
}

setIniciarConexao(iniciarConexao)

async function conectar() {
    const r = rt()
    await encerrarSocketAtual()

    let jaRegistrado = false
    const credsPath = path.join(SESSAO_PATH, "creds.json")
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"))
            jaRegistrado = !!creds.registered
        } catch {}
    }

    if (!jaRegistrado) {
        try {
            fs.rmSync(SESSAO_PATH, { recursive: true, force: true })
            fs.mkdirSync(SESSAO_PATH, { recursive: true })
        } catch {}
    }

    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`${C.gray}[AUTH] Baileys: ${version.join(".")} (latest: ${isLatest})${C.reset}`)

    const { state, saveCreds } = await useMultiFileAuthState(SESSAO_PATH)

    let numeroParaPairing = null
    if (!jaRegistrado && !r.pairingCodeRequested) {
        try {
            numeroParaPairing = await pedirNumeroPairing(_ask)
        } catch (e) {
            console.log(err(`[AUTH] Entrada inválida: ${e.message}`))
            throw e
        }
    }

    console.log(boot("[AUTH] Conectando aos servidores do WhatsApp..."))

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: false,
        getMessage: async () => ({ conversation: "" }),
        cachedGroupMetadata: async (jid) => {
            try {
                const { cachedGroupMetadata } = await import("../services/groupService.js")
                return await cachedGroupMetadata(jid)
            } catch { return undefined }
        }
    })
    setSock(sock)

    instalarRastreioDeEnvios(sock)

    sock.ev.on("creds.update", saveCreds)

    // [v42] Registro de contatos para o STATUS MANAGER (modo "contatos" real):
    // contacts.upsert entrega os contatos conhecidos da conta; o módulo normaliza
    // e persiste em dono/status_config.json (contatosConhecidos).
    sock.ev.on("contacts.upsert", async (contatos) => {
        try {
            if (!Array.isArray(contatos) || !contatos.length) return
            const { registrarContatos } = await import("../features/statusManager/service.js")
            const novos = registrarContatos(contatos)
            if (novos > 0) console.log(ok(`[STATUS] +${novos} contato(s) no registro (${contatos.length} sincronizados)`))
        } catch {}
    })

    sock.ev.on("groups.upsert", async (grupos) => {
        try {
            const { atualizarMapaDeParticipantes } = await import("../services/lidResolver.js")
            for (const g of grupos) {
                const jid = g.id
                const subject = g.subject || "-"
                const botNum = normalizeNumber(getSock()?.user?.id)
                let isAdmin = false
                if (Array.isArray(g.participants)) {
                    const me = g.participants.find(p => normalizeNumber(p.id) === botNum)
                    if (me && (me.admin === "admin" || me.admin === "superadmin")) isAdmin = true
                    try { atualizarMapaDeParticipantes(g.participants) } catch {}
                }
                rt().cachedGroups[jid] = { subject, isAdmin }
                const oj = ownerJidForSending()
                if (oj) try { await enviarNotifNovoGrupo(oj, { subject, groupJid: jid, isAdmin }) } catch {}
            }
        } catch {}
    })

    sock.ev.on("groups.update", async (updates) => {
        try {
            for (const upd of updates) {
                const jid = upd.id
                if (!jid) continue
                const cache = rt().cachedGroups[jid]
                if (cache) {
                    if (upd.subject) cache.subject = upd.subject
                    if (CONFIG.antiTakeover && upd.announce === "true") {
                        const { registrarAcao } = await import("../services/historicoService.js")
                        registrarAcao("grupo_fechado", { id: jid, subject: upd.subject || cache.subject })
                    }
                }
            }
        } catch {}
    })

    sock.ev.on("group-participants.update", async (evt) => {
        try {
            const { id: groupJid, participants, action } = evt
            const botNum = normalizeNumber(getSock()?.user?.id)
            const botLid = normalizeNumber(getSock()?.user?.lid)
            const bateBot = (x) => {
                const n = normalizeNumber(x)
                return (botNum && n === botNum) || (botLid && n === botLid)
            }
            const meAfetado = Array.isArray(participants) && participants.some(bateBot)

            if (action === "remove" && meAfetado) {
                // [v40] Captura o subject ANTES de deletar do cache (antes: notificação
                // de remoção sempre mostrava o JID porque o cache já tinha sido apagado).
                const subjRemovido = rt().cachedGroups[groupJid]?.subject || groupJid
                delete rt().cachedGroups[groupJid]
                try {
                    const { handleRemovidoDoGrupo } = await import("../services/antiTakeoverService.js")
                    await handleRemovidoDoGrupo(groupJid, subjRemovido)
                } catch {}
                return
            }

            let meta = null
            for (let i = 0; i < 3 && !meta; i++) {
                try { meta = await throttledGroupMetadata(groupJid) } catch { await new Promise(r => setTimeout(r, 400)) }
            }
            if (!meta) { console.log(warn(`[GRUPO] metadata indisponível para ${groupJid}`)); return }

            // Atualiza mapa LID
            try {
                const { atualizarMapaDeParticipantes } = await import("../services/lidResolver.js")
                atualizarMapaDeParticipantes(meta.participants)
            } catch {}

            const me = meta.participants.find(p => bateBot(p.id) || bateBot(p.jid) || bateBot(p.lid))
            const isAdminAgora = !!(me && (me.admin === "admin" || me.admin === "superadmin"))
            const eraAdmin = !!rt().cachedGroups[groupJid]?.isAdmin
            rt().cachedGroups[groupJid] = { subject: meta.subject || "Sem nome", isAdmin: isAdminAgora }

            const oj = ownerJidForSending()

            if (action === "add" && meAfetado && oj) {
                try { await enviarNotifNovoGrupo(oj, { subject: meta.subject || "Sem nome", groupJid, isAdmin: isAdminAgora }) } catch (e) { console.log(err(`[NOTIF entrada] ${e.message}`)) }
            }

            const promoveuBot = action === "promote" && meAfetado
            if ((promoveuBot || (isAdminAgora && !eraAdmin))) {
                const { enviarNotifAdminRecebido } = await import("../services/notificationService.js")
                try {
                    await enviarNotifAdminRecebido(normalizeNumber(getOwnerNumber()), groupJid, meta.subject || "Sem nome")
                    console.log(ok(`[NOTIF] ADMIN recebido em ${meta.subject || groupJid}`))
                } catch (e) { console.log(err(`[NOTIF admin] ${e.message}`)) }
            }

            if (action === "demote" && meAfetado) {
                try {
                    const { handlePerdaAdmin } = await import("../services/antiTakeoverService.js")
                    await handlePerdaAdmin(groupJid, meta.subject || "Sem nome")
                } catch {}
            }

            if (action === "promote" && !meAfetado && Array.isArray(participants) && participants.length >= 3) {
                try {
                    const { handlePromocaoSuspeita } = await import("../services/antiTakeoverService.js")
                    await handlePromocaoSuspeita(groupJid, meta.subject || "Sem nome", participants)
                } catch {}
            }
        } catch (e) {
            console.log(err(`[group-participants] ${e.message}`))
        }
    })

    registrarMessageHandler(sock)

    if (numeroParaPairing && !r.pairingCodeRequested) {
        await solicitarPairingCode(sock, numeroParaPairing)
    }

    await new Promise((resolve, reject) => {
        let settled = false
        const finalizar = (fn, valor) => { if (settled) return; settled = true; fn(valor) }

        sock.ev.on("connection.update", async (u) => {
            const { connection, lastDisconnect } = u

            if (connection === "connecting") {
                console.log(boot("[AUTH] Conectando..."))
            }

            if (connection === "open") {
                r.isConnected = true
                r.reconnectAttempts = 0
                r.sessionErrorLog = []
                r.pairingCodeRequested = true
                setDetectedOwner(getSock().user)
                console.log(ok(`[AUTH] Conexão aberta com sucesso`))
                console.log(ok(`[AUTH] Dispositivo conectado: ${getOwnerNumber()}`))
                setTimeout(async () => {
                    try {
                        await atualizarGrupos()
                        if (CONFIG.autoLimpeza) {
                            try {
                                const res = await limparCacheFantasmas(true)
                                if (res.removidos > 0) console.log(ok(`[LIMPEZA] ${res.removidos} grupos fantasmas removidos`))
                            } catch {}
                        }
                        try {
                            const { iniciarAgendamentos } = await import("../services/agendaService.js")
                            const ag = iniciarAgendamentos()
                            if (ag.pendentes > 0) console.log(ok(`[AGENDA] ${ag.pendentes} agendamentos pendentes carregados`))
                        } catch {}
                        await notificarBotOnline()
                    } catch {}
                }, 2000)
                finalizar(resolve)
                return
            }

            if (connection === "close") {
                r.isConnected = false
                const sc = lastDisconnect?.error?.output?.statusCode
                const reason = lastDisconnect?.error?.message || "-"

                console.log(warn(`[AUTH] Conexão fechada: ${reason} (code=${sc || "n/a"})`))

                if (sc === DisconnectReason.loggedOut) {
                    console.log(err(`[AUTH] Sessão deslogada.`))
                    r.notificacaoOnlineEnviada = false
                    r.pairingCodeRequested = false
                    await tentarRecuperacaoSessao("loggedOut")
                    finalizar(reject, new Error("Sessão inválida"))
                    return
                }

                if (r.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.log(err(`[AUTH] Limite de reconexões atingido.`))
                    finalizar(reject, new Error("Falha ao reconectar"))
                    return
                }

                r.reconnectAttempts++
                const delay = RECONNECT_BASE_DELAY * r.reconnectAttempts
                console.log(warn(`[AUTH] Reconectando em ${delay}ms (${r.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`))

                await new Promise(res => setTimeout(res, delay))
                r.connectionLock = false
                r.isConnecting = false
                iniciarConexao()
                    .then(() => finalizar(resolve))
                    .catch(e => finalizar(reject, e))
                return
            }
        })
    })
}

export { isGroupJid }

```

### connection/sessionRecovery.js — 122 linhas (4.1 KB)

```js
// connection/sessionRecovery.js
// [REORGANIZAÇÃO] Detecção de erros de Signal/Session + recuperação de sessão.
// Constantes e comportamento preservados 1:1 do index.js.

import fs from "fs"
import { rt, setSock } from "./socket.js"
import { SESSAO_PATH, MAX_SESSION_ERRORS, SESSION_ERROR_WINDOW_MS, SESSION_RECOVERY_COOLDOWN_MS } from "../utils/config.js"
import { err, warn } from "../utils/terminalUI.js"

export function isSessionError(msg) {
    if (!msg) return false
    const s = String(msg).toLowerCase()
    return s.includes("bad mac")
        || s.includes("failed to decrypt message")
        || s.includes("session error")
        || s.includes("sessioncipher")
        || s.includes("libsignal")
        || s.includes("decrypted message with closed session")
        || s.includes("no matching sessions found")
        || s.includes("no session for user")
        || s.includes("invalid pdu")
}

export function registrarSessionError() {
    const r = rt()
    const now = Date.now()
    r.sessionErrorLog = r.sessionErrorLog.filter(t => now - t < SESSION_ERROR_WINDOW_MS)
    r.sessionErrorLog.push(now)
    return r.sessionErrorLog.length
}

export async function encerrarSocketAtual() {
    const sock = rt().sock
    if (!sock) return
    try {
        if (typeof sock.ev?.removeAllListeners === "function") {
            sock.ev.removeAllListeners()
        }
        if (typeof sock.end === "function") {
            try { sock.end(new Error("Reinicializando socket")) } catch {}
        }
        if (typeof sock.ws?.close === "function") {
            try { sock.ws.close() } catch {}
        }
    } catch {}
    setSock(null)
}

// iniciarConexao é injetado para evitar dependência circular com whatsapp.js.
let _iniciarConexao = null
export function setIniciarConexao(fn) { _iniciarConexao = fn }

export async function tentarRecuperacaoSessao(motivo = "sessão instável") {
    const r = rt()
    if (r.sessionRecoveryInProgress) return false
    const now = Date.now()
    if (now - r.lastSessionRecovery < SESSION_RECOVERY_COOLDOWN_MS) return false

    r.sessionRecoveryInProgress = true
    r.lastSessionRecovery = now
    r.sessionRecoveryCount++

    try {
        console.log(err(`[AUTH] Sessão corrompida detectada: ${motivo}`))
        await encerrarSocketAtual()

        try {
            await fs.promises.rm(SESSAO_PATH, { recursive: true, force: true })
        } catch {}

        r.sessionErrorLog = []
        r.pairingCodeRequested = false
        r.notificacaoOnlineEnviada = false
        r.isConnected = false
        r.reconnectAttempts = 0

        console.log(warn(`[AUTH] Nova sessão necessária. Reiniciando pareamento...`))

        setTimeout(() => {
            r.sessionRecoveryInProgress = false
            if (_iniciarConexao) {
                _iniciarConexao().catch(e => {
                    console.log(err(`[AUTH] Falha ao reiniciar: ${e.message}`))
                })
            }
        }, 2500)

        return true
    } catch (e) {
        r.sessionRecoveryInProgress = false
        return false
    }
}

export function instalarHandlersProcesso() {
    process.on("uncaughtException", (e) => {
        const msg = e?.message || String(e)
        if (isSessionError(msg)) {
            const total = registrarSessionError()
            console.log(warn(`[AUTH] Session error (${total}/${MAX_SESSION_ERRORS}): ${msg}`))
            if (total >= MAX_SESSION_ERRORS) {
                tentarRecuperacaoSessao(`Bad MAC/Signal recorrente (${total})`)
            }
            return
        }
        console.error(err(`[UNCAUGHT] ${msg}`))
    })

    process.on("unhandledRejection", (reason) => {
        const msg = reason?.message || String(reason)
        if (isSessionError(msg)) {
            const total = registrarSessionError()
            console.log(warn(`[AUTH] Session error (promise) (${total}/${MAX_SESSION_ERRORS}): ${msg}`))
            if (total >= MAX_SESSION_ERRORS) {
                tentarRecuperacaoSessao(`Bad MAC/Signal recorrente (${total})`)
            }
            return
        }
        console.error(err(`[REJECTION] ${msg}`))
    })
}

```

### connection/pairing.js — 52 linhas (2.3 KB)

```js
// connection/pairing.js
// [REORGANIZAÇÃO] Fluxo de PAIRING CODE (não QR). Preservado 1:1 do index.js:
//   até 3 tentativas, espera inicial de 4s, intervalo de 3s entre tentativas.

import { rt } from "./socket.js"
import { boot, ok, err, warn, COLORS as C } from "../utils/terminalUI.js"

// Pergunta o número ao operador (via readline injetado) quando não registrado.
export async function pedirNumeroPairing(ask) {
    console.log(warn("[AUTH] Aguardando número de telefone..."))
    let num = await ask(`${C.cyan}[+] Número (5599...): ${C.reset}`)
    num = String(num).replace(/\D/g, "").trim()
    if (!num || num.length < 10) throw new Error("Número inválido")
    console.log(ok(`[AUTH] Número recebido: ${num}`))
    return num
}

// Solicita e exibe o código de pareamento.
export async function solicitarPairingCode(sock, numeroParaPairing) {
    const r = rt()
    r.pairingCodeRequested = true
    console.log(boot("[AUTH] Aguardando inicialização do socket..."))

    let attempts = 0
    let code = null

    while (attempts < 3) {
        try {
            attempts++
            console.log(boot(`[AUTH] Solicitando código de pareamento (tentativa ${attempts}/3)...`))
            await new Promise(res => setTimeout(res, 4000))
            code = await sock.requestPairingCode(numeroParaPairing)
            break
        } catch (e) {
            console.log(err(`[AUTH] Tentativa ${attempts} falhou: ${e.message}`))
            if (attempts >= 3) {
                r.pairingCodeRequested = false
                throw e
            }
            await new Promise(res => setTimeout(res, 3000))
        }
    }

    const formatado = code?.match(/.{1,4}/g)?.join("-") || code
    console.log(`\n${C.yellow}┌────────────────────────────┐${C.reset}`)
    console.log(`${C.yellow}│ ${C.white}${C.bold}CÓDIGO: ${formatado}${C.reset}${C.yellow}${" ".repeat(Math.max(0, 18 - String(formatado).length))}│${C.reset}`)
    console.log(`${C.yellow}└────────────────────────────┘${C.reset}\n`)
    console.log(ok(`[AUTH] Código de pareamento: ${formatado}`))
    console.log(warn(`[AUTH] Abra WhatsApp → Aparelhos conectados → Conectar com número`))
    return formatado
}

```

### utils/config.js — 132 linhas (5.8 KB)

```js
// utils/config.js
// [v28] Config com donos extras, ADMs, grupos autorizados, LIDs

import fs from "fs"
import { setConfigOwner, setAuthorizedUsers, setAuthorizedGroups, setAuthorizedLids, setExtraOwners, getAuthorizedUsers, getAuthorizedGroups, getAuthorizedLids, getExtraOwners } from "./permissions.js"
import { err } from "./terminalUI.js"

export const CONFIG_PATH = "./config.json"
export const SESSAO_PATH = "./sessao"
export const MENU_IMAGE_PATH = "./dono/menus/Foto-menu/img-menu.jpg"

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
// [v48] Modo de UI (config.json → "uiMode"):
//   "text"    → TXT (tudo texto — modo de compatibilidade, inalterado)
//   "buttons" → mensagens interativas com botões (camada existente)
//   "list"    → listas interativas (camada existente)
//   "bloks"   → menu/botões seguem em TXT (identidade preservada) e o
//               SERVER INSPECTOR (!bloks) é enviado como BLOKS/A2UI
// uiModoEfetivo() trata "bloks" como "text" para os fluxos existentes —
// apenas o transporte do Server Inspector enxerga o modo "bloks".
export function uiModoEfetivo() {
    const m = (CONFIG.uiMode || "text").toLowerCase()
    // [v55] "txt" é aceito como alias de "text" (config.json); "bloks" segue
    // tratado como "text" para os fluxos de menu (só o Inspector enxerga bloks).
    if (m === "txt" || m === "bloks") return "text"
    return m
}

export const MAX_FLOOD = 1000 // [v47] limite de flood por comando (era 100)
export const HTTP_UA =
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

export const MAX_RECONNECT_ATTEMPTS = 5
export const RECONNECT_BASE_DELAY = 3000
export const MAX_SESSION_ERRORS = 8
export const SESSION_ERROR_WINDOW_MS = 60 * 1000
export const SESSION_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000

export const FLOOD_MODOS = {
    rapido: { intervalo: 50, lote: 8, label: "Rápido 50ms/lote8" },
    normal: { intervalo: 100, lote: 6, label: "Normal 100ms/lote6" },
    lento: { intervalo: 250, lote: 4, label: "Lento 250ms/lote4" },
    seguro: { intervalo: 500, lote: 3, label: "Seguro 500ms/lote3 + jitter" }
}

export const CONFIG = {
    nome: "๛ղվx 𝖅𝖚𝖈𝖐𝖊𝖗𝖇𝖊𝖗𝖌",
    bio: "⚔️ SYZYGY ⚡",
    menuImage: MENU_IMAGE_PATH,
    ownerOverride: "5519000000000",
    uiMode: "text",
    grupoOficial: "",
    linkDivulgacao: "",
    lerMais: false,
    marcarFantasma: true,
    floodModo: "normal",
    floodInterval: 150,
    floodLote: 5,
    floodJitter: false,
    autoLimpeza: true,
    antiTakeover: true,
    usuariosAutorizados: [],
    gruposAutorizados: [],
    lidsAutorizados: [],
    donosExtras: [],
    // [FLOOD · presets] chaves da infraestrutura de flood (recuperadas da arena
    // 01a0aaae). Defaults conservadores: dry-run LIGADO (nada sai até o operador
    // desligar) e kill switch desligado. floodAllowlist é vazia de propósito: sem
    // destino explicitamente autorizado, preset nenhum dispara.
    floodKillSwitch: false,
    floodDryRun: true,
    floodTestMode: true,
    floodAllowlist: [],
    floodMaxRetries: 1,
    floodTimeoutMs: 15000,
    floodCustomPresets: []
}

export function carregarConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, "utf-8")
            const parsed = JSON.parse(data)
            Object.assign(CONFIG, parsed)
            if (typeof CONFIG.lerMais !== "boolean") CONFIG.lerMais = false
            if (!CONFIG.floodModo) CONFIG.floodModo = "normal"
            if (!CONFIG.floodInterval) {
                const modo = FLOOD_MODOS[CONFIG.floodModo] || FLOOD_MODOS.normal
                CONFIG.floodInterval = modo.intervalo
            }
            if (!CONFIG.floodLote) {
                const modo = FLOOD_MODOS[CONFIG.floodModo] || FLOOD_MODOS.normal
                CONFIG.floodLote = modo.lote
            }
            if (typeof CONFIG.autoLimpeza !== "boolean") CONFIG.autoLimpeza = true
            if (typeof CONFIG.antiTakeover !== "boolean") CONFIG.antiTakeover = true
            if (typeof CONFIG.floodJitter !== "boolean") CONFIG.floodJitter = CONFIG.floodModo === "seguro"
            if (!Array.isArray(CONFIG.usuariosAutorizados)) CONFIG.usuariosAutorizados = []
            if (!Array.isArray(CONFIG.gruposAutorizados)) CONFIG.gruposAutorizados = []
            if (!Array.isArray(CONFIG.lidsAutorizados)) CONFIG.lidsAutorizados = []
            if (!Array.isArray(CONFIG.donosExtras)) CONFIG.donosExtras = []
            if (typeof CONFIG.floodKillSwitch !== "boolean") CONFIG.floodKillSwitch = false
            if (typeof CONFIG.floodDryRun !== "boolean") CONFIG.floodDryRun = true
            if (typeof CONFIG.floodTestMode !== "boolean") CONFIG.floodTestMode = true
            if (!Array.isArray(CONFIG.floodAllowlist)) CONFIG.floodAllowlist = []
            if (!CONFIG.floodMaxRetries) CONFIG.floodMaxRetries = 1
            if (!CONFIG.floodTimeoutMs) CONFIG.floodTimeoutMs = 15000
            if (!Array.isArray(CONFIG.floodCustomPresets)) CONFIG.floodCustomPresets = []
        }
    } catch {}
    if (CONFIG.ownerOverride) setConfigOwner(CONFIG.ownerOverride)
    setAuthorizedUsers(CONFIG.usuariosAutorizados)
    setAuthorizedGroups(CONFIG.gruposAutorizados)
    setAuthorizedLids(CONFIG.lidsAutorizados)
    setExtraOwners(CONFIG.donosExtras)
    return CONFIG
}

export function salvarConfig() {
    try {
        try {
            CONFIG.usuariosAutorizados = getAuthorizedUsers()
            CONFIG.gruposAutorizados = getAuthorizedGroups()
            CONFIG.lidsAutorizados = getAuthorizedLids()
            CONFIG.donosExtras = getExtraOwners()
        } catch {}
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2), "utf-8")
    } catch (e) {
        console.log(err(`Salvar config: ${e.message}`))
    }
}

```

### utils/permissions.js — 353 linhas (12.3 KB)

```js
// utils/permissions.js
// [v28] Permissões: donos (multi), ADMs (users), grupos autorizados, LID resolver

import fs from "fs"

let DETECTED_PHONE = null
let DETECTED_LID = null
let CONFIG_OWNER_NUM = null
let EXTRA_OWNERS = [] // donos extras
let AUTHORIZED_USERS = []
let AUTHORIZED_GROUPS = []
let AUTHORIZED_LIDS = []

export function setDetectedOwner(sockUser) {
    if (!sockUser) return
    if (typeof sockUser === "object") {
        if (sockUser.id) {
            const pNum = normalizeNumber(sockUser.id)
            if (pNum) DETECTED_PHONE = pNum
        }
        if (sockUser.lid) {
            const lNum = normalizeNumber(sockUser.lid)
            if (lNum) DETECTED_LID = lNum
        }
    } else {
        const num = normalizeNumber(sockUser)
        if (num) DETECTED_PHONE = num
    }
}

export function setConfigOwner(num) {
    if (!num) { CONFIG_OWNER_NUM = null; return }
    CONFIG_OWNER_NUM = normalizeNumber(num)
}

export function setExtraOwners(list) {
    EXTRA_OWNERS = (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean)
    EXTRA_OWNERS = [...new Set(EXTRA_OWNERS)]
}

export function getOwnerNumber() {
    return CONFIG_OWNER_NUM || DETECTED_PHONE || "5519000000000"
}

export function getExtraOwners() {
    return [...EXTRA_OWNERS]
}

export function getAllOwners() {
    const all = [getOwnerNumber(), ...EXTRA_OWNERS].map(normalizeNumber).filter(Boolean)
    return [...new Set(all)]
}

export function normalizeNumber(value) {
    if (!value) return ""
    let s = String(value)
    if (s.includes("@")) s = s.split("@")[0]
    if (s.includes(":")) s = s.split(":")[0]
    return s.replace(/\D/g, "")
}

export function getSenderJid(m) {
    if (!m || !m.key) return null
    // Usa Alt primeiro (LID resolver) - fix para @lid
    if (m.key.participantAlt) return m.key.participantAlt
    if (m.key.remoteJidAlt) return m.key.remoteJidAlt
    if (m.key.participant) return m.key.participant
    return m.key.remoteJid
}

export function getChatJid(m) {
    if (!m || !m.key) return null
    // Para envio, usa remoteJidAlt se existir (fix @lid)
    if (m.key.remoteJidAlt) return m.key.remoteJidAlt
    if (m.key.remoteJid) return m.key.remoteJid
    return null
}

export function isOwner(jidOrNumber) {
    if (!jidOrNumber) return false
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (CONFIG_OWNER_NUM && n === CONFIG_OWNER_NUM) return true
    if (EXTRA_OWNERS.includes(n)) return true
    if (DETECTED_PHONE && n === DETECTED_PHONE) return true
    if (DETECTED_LID && n === DETECTED_LID) return true
    return n === "5519000000000"
}

export function isGroupJid(jid) {
    return typeof jid === "string" && jid.endsWith("@g.us")
}

export function ownerJidForSending() {
    const num = getOwnerNumber()
    return `${num}@s.whatsapp.net`
}

export function setAuthorizedUsers(list) {
    AUTHORIZED_USERS = (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean)
    AUTHORIZED_USERS = [...new Set(AUTHORIZED_USERS)]
}

export function setAuthorizedGroups(list) {
    AUTHORIZED_GROUPS = (Array.isArray(list) ? list : []).filter(j => typeof j === "string" && j.endsWith("@g.us"))
    AUTHORIZED_GROUPS = [...new Set(AUTHORIZED_GROUPS)]
}

export function setAuthorizedLids(list) {
    AUTHORIZED_LIDS = (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean)
    AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
}

export function getAuthorizedUsers() {
    return [...AUTHORIZED_USERS]
}

export function getAuthorizedGroups() {
    return [...AUTHORIZED_GROUPS]
}

export function getAuthorizedLids() {
    return [...AUTHORIZED_LIDS]
}

function carregarLidMapSync() {
    try {
        if (fs.existsSync("./dono/lid_map.json")) {
            const data = JSON.parse(fs.readFileSync("./dono/lid_map.json", "utf-8"))
            return data.lidToPhone || {}
        }
    } catch {}
    return {}
}

export function isAuthorizedUser(jidOrNumber) {
    if (isOwner(jidOrNumber)) return true
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (AUTHORIZED_USERS.includes(n)) return true
    if (AUTHORIZED_LIDS.includes(n)) return true
    return false
}

export function isAuthorizedUserWithMap(jidOrNumber, lidMap) {
    if (isOwner(jidOrNumber)) return true
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (AUTHORIZED_USERS.includes(n)) return true
    if (AUTHORIZED_LIDS.includes(n)) return true
    let map = lidMap
    if (!map) {
        const raw = carregarLidMapSync()
        map = { lidToPhone: raw }
        const phoneToLid = {}
        for (const [lid, phone] of Object.entries(raw)) {
            phoneToLid[phone] = lid
        }
        map.phoneToLid = phoneToLid
    }
    const phone = map.lidToPhone?.[n]
    if (phone && AUTHORIZED_USERS.includes(phone)) return true
    const lid = map.phoneToLid?.[n]
    if (lid && AUTHORIZED_LIDS.includes(lid)) return true
    if (map.phoneToLid?.[n] && AUTHORIZED_LIDS.includes(map.phoneToLid[n])) return true
    if (map.lidToPhone) {
        for (const [lid, phone] of Object.entries(map.lidToPhone)) {
            if (phone === n && AUTHORIZED_LIDS.includes(lid)) return true
        }
    }
    return false
}

export async function isAuthorizedUserAsync(jidOrNumber) {
    if (isOwner(jidOrNumber)) return true
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (AUTHORIZED_USERS.includes(n)) return true
    if (AUTHORIZED_LIDS.includes(n)) return true
    const map = carregarLidMapSync()
    if (map[n] && AUTHORIZED_USERS.includes(map[n])) return true
    for (const [lid, phone] of Object.entries(map)) {
        if (phone === n && AUTHORIZED_LIDS.includes(lid)) return true
        if (lid === n && AUTHORIZED_USERS.includes(phone)) return true
    }
    if (String(jidOrNumber).includes("@lid") || n.length > 15) {
        try {
            const { buscarPhonePorLid } = await import("../services/lidResolver.js")
            const phone = await buscarPhonePorLid(jidOrNumber)
            if (phone && AUTHORIZED_USERS.includes(phone)) {
                if (!AUTHORIZED_LIDS.includes(n)) {
                    AUTHORIZED_LIDS.push(n)
                    AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
                }
                return true
            }
        } catch {}
    } else {
        try {
            const { buscarLidPorPhone } = await import("../services/lidResolver.js")
            const lid = await buscarLidPorPhone(jidOrNumber)
            if (lid && AUTHORIZED_LIDS.includes(lid)) return true
        } catch {}
    }
    return false
}

export function isAuthorizedGroup(jid) {
    if (!jid) return false
    return AUTHORIZED_GROUPS.includes(jid)
}

export function addAuthorizedUser(num) {
    const n = normalizeNumber(num)
    if (!n) return null
    if (n.length < 10 || n.length > 20) return null
    if (isOwner(n)) return { alreadyOwner: true, num: n }
    const isLid = String(num).includes("@lid") || n.length > 15
    if (isLid) {
        if (AUTHORIZED_LIDS.includes(n)) return { already: true, num: n, isLid: true }
        AUTHORIZED_LIDS.push(n)
        AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
        return { added: true, num: n, isLid: true, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
    }
    if (AUTHORIZED_USERS.includes(n)) return { already: true, num: n }
    AUTHORIZED_USERS.push(n)
    AUTHORIZED_USERS = [...new Set(AUTHORIZED_USERS)]
    try {
        const map = carregarLidMapSync()
        for (const [lid, phone] of Object.entries(map)) {
            if (phone === n && !AUTHORIZED_LIDS.includes(lid)) {
                AUTHORIZED_LIDS.push(lid)
            }
        }
        AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
    } catch {}
    return { added: true, num: n, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
}

export function removeAuthorizedUser(numOrIndex) {
    const str = String(numOrIndex).trim()
    const idx = parseInt(str.replace(/\D/g, ""))
    if (!isNaN(idx) && str.match(/^0*\d+$/)) {
        if (idx >= 1 && idx <= AUTHORIZED_USERS.length) {
            const removed = AUTHORIZED_USERS.splice(idx - 1, 1)
            return { removed: removed[0], byIndex: true, list: getAuthorizedUsers() }
        }
        if (idx > AUTHORIZED_USERS.length && idx <= AUTHORIZED_USERS.length + AUTHORIZED_LIDS.length) {
            const lidIdx = idx - AUTHORIZED_USERS.length - 1
            const removed = AUTHORIZED_LIDS.splice(lidIdx, 1)
            return { removed: removed[0], byIndex: true, isLid: true, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
        }
    }
    const n = normalizeNumber(numOrIndex)
    if (!n) return null
    let pos = AUTHORIZED_USERS.indexOf(n)
    if (pos >= 0) {
        AUTHORIZED_USERS.splice(pos, 1)
        try {
            const map = carregarLidMapSync()
            for (const [lid, phone] of Object.entries(map)) {
                if (phone === n) {
                    const p2 = AUTHORIZED_LIDS.indexOf(lid)
                    if (p2 >= 0) AUTHORIZED_LIDS.splice(p2, 1)
                }
            }
        } catch {}
        return { removed: n, byIndex: false, list: getAuthorizedUsers() }
    }
    pos = AUTHORIZED_LIDS.indexOf(n)
    if (pos >= 0) {
        AUTHORIZED_LIDS.splice(pos, 1)
        return { removed: n, byIndex: false, isLid: true, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
    }
    return null
}

export function addExtraOwner(num) {
    const n = normalizeNumber(num)
    if (!n) return null
    if (n.length < 10 || n.length > 15) return null
    if (CONFIG_OWNER_NUM && n === CONFIG_OWNER_NUM) return { alreadyOwner: true, num: n }
    if (n === "5519000000000") return { alreadyOwner: true, num: n }
    if (EXTRA_OWNERS.includes(n)) return { already: true, num: n }
    // Se era ADM, remove de ADM e promove a dono
    const idxUser = AUTHORIZED_USERS.indexOf(n)
    if (idxUser >= 0) AUTHORIZED_USERS.splice(idxUser, 1)
    EXTRA_OWNERS.push(n)
    EXTRA_OWNERS = [...new Set(EXTRA_OWNERS)]
    return { added: true, num: n, list: getExtraOwners() }
}

export function removeExtraOwner(numOrIndex) {
    const str = String(numOrIndex).trim()
    const idx = parseInt(str.replace(/\D/g, ""))
    if (!isNaN(idx) && str.match(/^0*\d+$/)) {
        if (idx >= 1 && idx <= EXTRA_OWNERS.length) {
            const removed = EXTRA_OWNERS.splice(idx - 1, 1)
            return { removed: removed[0], byIndex: true, list: getExtraOwners() }
        }
    }
    const n = normalizeNumber(numOrIndex)
    if (!n) return null
    const pos = EXTRA_OWNERS.indexOf(n)
    if (pos < 0) return null
    EXTRA_OWNERS.splice(pos, 1)
    return { removed: n, byIndex: false, list: getExtraOwners() }
}

export function addAuthorizedGroup(jid) {
    if (!jid || !isGroupJid(jid)) return null
    if (AUTHORIZED_GROUPS.includes(jid)) return { already: true, jid }
    AUTHORIZED_GROUPS.push(jid)
    AUTHORIZED_GROUPS = [...new Set(AUTHORIZED_GROUPS)]
    return { added: true, jid, list: getAuthorizedGroups() }
}

export function removeAuthorizedGroup(jidOrIndex) {
    const str = String(jidOrIndex).trim()
    const idx = parseInt(str.replace(/\D/g, ""))
    if (!isNaN(idx) && str.match(/^0*\d+$/) && idx >= 1 && idx <= AUTHORIZED_GROUPS.length) {
        const removed = AUTHORIZED_GROUPS.splice(idx - 1, 1)
        return { removed: removed[0], byIndex: true, list: getAuthorizedGroups() }
    }
    if (!isGroupJid(jidOrIndex)) return null
    const pos = AUTHORIZED_GROUPS.indexOf(jidOrIndex)
    if (pos < 0) return null
    AUTHORIZED_GROUPS.splice(pos, 1)
    return { removed: jidOrIndex, byIndex: false, list: getAuthorizedGroups() }
}

export function formatAuthorizedUsersTexto() {
    const all = [...AUTHORIZED_USERS, ...AUTHORIZED_LIDS]
    if (!all.length) return "Nenhum usuário autorizado extra (só o dono)."
    return all.map((n, i) => {
        const isLid = AUTHORIZED_LIDS.includes(n)
        return `  ${i + 1} · ${n}${isLid ? " (LID)" : ""}`
    }).join("\n")
}

export function formatAuthorizedGroupsTexto(cachedGroups = {}) {
    if (!AUTHORIZED_GROUPS.length) return "Nenhum grupo autorizado (bot só no PV)."
    return AUTHORIZED_GROUPS.map((jid, i) => {
        const subj = cachedGroups[jid]?.subject || jid
        return `  ${i + 1} · ${subj}\n     ${jid}`
    }).join("\n\n")
}

export function formatExtraOwnersTexto() {
    if (!EXTRA_OWNERS.length) return "Nenhum dono extra (só você)."
    return EXTRA_OWNERS.map((n, i) => `  ${i + 1} · ${n}`).join("\n")
}

```

### utils/stateManager.js — 25 linhas (0.6 KB)

```js
// utils/stateManager.js
const STATE_TIMEOUT = 5 * 60 * 1000
const userStates = new Map()

export function setState(key, patch) {
    const cur = userStates.get(key) || {}
    const next = { ...cur, ...patch, expiresAt: Date.now() + STATE_TIMEOUT }
    userStates.set(key, next)
    return next
}

export function getState(key) {
    const st = userStates.get(key)
    if (!st) return null
    if (Date.now() > st.expiresAt) {
        userStates.delete(key)
        return null
    }
    return st
}

export function clearState(key) {
    userStates.delete(key)
}

```

### utils/lerMais.js — 47 linhas (2.5 KB)

```js
// utils/lerMais.js
// [v46.1] 📖 "LER MAIS" — dobra mensagens logo após o título (⚡ SYZYGY).
//
// MECANISMO REAL (sem invenção de API):
// O app do WhatsApp só cria o botão "Ler mais"/"Ler tudo" quando a mensagem
// excede o LIMITE DE CARACTERES do cliente (varia por versão/aparelho — na
// prática fica entre ~1.000 e ~2.200). Linhas em branco NÃO bastam: aparecem
// como espaço visível e nem sempre passam do limite (foi o que aconteceu na
// v46). O que funciona (confirmado empiricamente no Android) é preencher com
// um CARACTERE INVISÍVEL — U+034F COMBINING GRAPHEME JOINER (bytes CD 8F) —
// até a mensagem passar do limite: a prévia mostra só a 1ª linha (o título)
// e o restante fica atrás do "Ler mais".
//
// LIMITAÇÕES INFORMADAS (mostradas no menu do dono):
//  • O corte exato e o limite são decisão do app (sem API) — variação por
//    versão/aparelho.
//  • Relatos apontam que em IPHONE o truque do caractere invisível não dobra.
//  • Mensagens de 1 linha só (ex.: "✅ Feito") não são alteradas.
//  • DESLIGADO = nada é acrescentado; mensagens MUITO longas ainda podem ser
//    dobradas pelo próprio app (comportamento do WhatsApp, sem API p/ veto).
//  • Quem COPIAR a mensagem cola os caracteres invisíveis junto (inofensivo).

import { CONFIG } from "./config.js"

const INV = "\u034F"          // U+034F — invisível no WhatsApp Android (2 bytes UTF-8)
const ALVO_CHARS = 4000       // total p/ passar do limite de exibição com folga
const MIN_RESTO = 4           // só aplica em mensagens com algo após a 1ª linha

export function aplicarLerMais(texto) {
    try {
        if (!CONFIG.lerMais || typeof texto !== "string") return texto
        // [FLOOD] O prompt do wizard da loja e a prévia de payment são multi-linha
        // DE PROPÓSITO. Expandi-los com U+034F é o que faz o card de loja nascer com
        // entulho invisível no corpo (e o corpo do card tem limite de 2048).
        if (texto.startsWith("\u{1F6CD}️") || texto.startsWith("💳 CONTEÚDO")) return texto
        const i = texto.indexOf("\n")
        if (i < 0) return texto                       // 1 linha só: não mexe
        if (texto.slice(i + 1).trim().length < MIN_RESTO) return texto
        if (texto.includes(INV.repeat(64))) return texto // já aplicado (idempotente)
        const falta = Math.max(0, ALVO_CHARS - texto.length)
        const pad = INV.repeat(falta) + "\n"
        return texto.slice(0, i + 1) + pad + texto.slice(i + 1)
    } catch {
        return texto
    }
}

```

### utils/logger.js — 73 linhas (2.8 KB)

```js
// utils/logger.js
// [REORGANIZAÇÃO] Silenciador de logs sensíveis de sessão, extraído do index.js.
// Mantém a MESMA proteção: filtra termos de Signal/Session e objetos de sessão,
// sem silenciar indiscriminadamente todos os erros.
//
// Guarda as referências originais ANTES de sobrescrever, e as reexporta para que
// o restante do sistema possa logar de forma garantida (origLog etc).

export const origLog = console.log
export const origWarn = console.warn
export const origError = console.error
const origStdoutWrite = process.stdout.write.bind(process.stdout)
const origStderrWrite = process.stderr.write.bind(process.stderr)

export function isSessionObject(arg) {
    if (!arg) return false
    if (typeof arg === "string") {
        return arg.includes("SessionEntry") || arg.includes("Closing session")
            || arg.includes("privKey") || arg.includes("rootKey")
            || arg.includes("chainKey") || arg.includes("remoteIdentityKey")
            || arg.includes("registrationId") || arg.includes("currentRatchet")
            || arg.includes("Bad MAC") || arg.includes("Failed to decrypt")
            || arg.includes("Session error") || arg.includes("SessionCipher")
            || arg.includes("closed session") || arg.includes("No session found")
            || arg.includes("No matching sessions") || arg.includes("decryptMessage")
    }
    if (typeof arg === "object") {
        const name = arg.constructor?.name || ""
        if (name === "SessionEntry" || name === "SessionState" || name.includes("Session")) return true
        if ("_chains" in arg || "currentRatchet" in arg || "indexInfo" in arg) return true
    }
    return false
}

function shouldSilence(args) {
    try {
        for (const a of args) {
            if (isSessionObject(a)) return true
        }
    } catch {}
    return false
}

let installed = false

// Instala os filtros. Idempotente: chamar mais de uma vez não empilha wrappers.
export function instalarSilenciador() {
    if (installed) return
    installed = true

    process.stdout.write = function (chunk, encoding, callback) {
        const s = typeof chunk === "string" ? chunk : chunk?.toString?.() || ""
        if (isSessionObject(s)) {
            if (callback) callback()
            return true
        }
        return origStdoutWrite(chunk, encoding, callback)
    }

    process.stderr.write = function (chunk, encoding, callback) {
        const s = typeof chunk === "string" ? chunk : chunk?.toString?.() || ""
        if (isSessionObject(s)) {
            if (callback) callback()
            return true
        }
        return origStderrWrite(chunk, encoding, callback)
    }

    console.log = (...args) => { if (!shouldSilence(args)) origLog(...args) }
    console.warn = (...args) => { if (!shouldSilence(args)) origWarn(...args) }
    console.error = (...args) => { if (!shouldSilence(args)) origError(...args) }
}

```

### commands/commandMap.js — 58 linhas (2.2 KB)

```js
// commands/commandMap.js
// [v45] Mapa alinhado ao menu: 5=Comandos do Dono, 6=Configurações, 7=Status, 8=Multi. Sem alias textual "status" (só número).

export const TEXT_TO_ACTION = {
    "cancelar": "menu_cancel",
    "!cancelar": "menu_cancel",
    "voltar": "menu_inicial",
    "!voltar": "menu_inicial",
    "menu": "menu_inicial",
    "!menu": "menu_inicial",
    "menutest": "menu_inicial",
    "!menutest": "menu_inicial",

    "01": "painel_listar_grupos", "1": "painel_listar_grupos",
    "02": "painel_flood", "2": "painel_flood",
    "03": "painel_tudo", "3": "painel_tudo",
    "04": "painel_roubar", "4": "painel_roubar",
    "05": "painel_dono", "5": "painel_dono",
    "06": "painel_config", "6": "painel_config",
    "07": "status_menu", "7": "status_menu",
    "08": "painel_multi", "8": "painel_multi",
    "00": "owner_sair", "0": "owner_sair",

    "multi": "painel_multi",
    "!multi": "painel_multi",
    "lote": "painel_multi",
    "!lote": "painel_multi",

    "historico": "cfg_historico",
    "!historico": "cfg_historico",
    "relatorio": "cfg_relatorio",
    "!relatorio": "cfg_relatorio",
    "agendamentos": "cfg_agendamentos",
    "!agendamentos": "cfg_agendamentos",
    "limpar_fantasmas": "cfg_limpar_fantasmas",
    "!limpar_fantasmas": "cfg_limpar_fantasmas",
    "limpar_agendamentos": "cfg_limpar_agendamentos",
    "!limpar_agendamentos": "cfg_limpar_agendamentos",
    "botstatus": "cfg_status",
    "!botstatus": "cfg_status",
    "bloks": "server_inspector",
    "!bloks": "server_inspector",

    // [RESTAURAÇÃO 01a0aaae] atalhos de flood que existiam lá e não vieram na AB7.
    // Os nomes são os MESMOS que você já digitava; a implementação é a fachada
    // features/flood/router.js sobre o runPresetJob da AB7.
    "floodpresets": "painel_flood_presets",
    "floodpreset": "painel_flood_presets",
    "paymenttest": "flood_preset_payment_test",
    "shoppingtest": "flood_preset_shopping_test",
    "texttest": "flood_preset_text_test",
    "mentiontest": "flood_preset_mention_test",
    "mediatest": "flood_preset_media_test",
    "floodstop": "flood_kill_on",
    "floodstart": "flood_kill_off",
    "flooddryrun": "cfg_flood_dryrun"
}

```

### commands/commandRouter.js — 716 linhas (40.7 KB)

```js
// commands/commandRouter.js
// [v27] Owner-only para foto menu, add/remove ADM, add/remove grupo, flood config, etc.

import { rt } from "../connection/socket.js"
import { getSock } from "../connection/socket.js"
import { setState, getState, clearState } from "../utils/stateManager.js"

import { enviarPainelInicial } from "../menus/mainMenu.js"
import { enviarPainelAdmin } from "../menus/adminMenu.js"
import { enviarSubmenuConfig, enviarPainelDono } from "../menus/configMenu.js"
import {
    listarGruposInterativo, enviarMenuAcoesGrupo, enviarVoltar, enviarCancelavel
} from "../menus/groupMenu.js"

import { processarSelecaoGrupo } from "../handlers/stateHandler.js"
import { listarGruposTexto, confirmarNuke, confirmarRemoverFoto } from "../actions/groupActions.js"
import { confirmarFlood } from "../actions/floodActions.js"
import {
    cfgMenuImage, cfgOwner, cfgNumber, cfgStatus, cfgRestart
} from "../actions/configActions.js"
import { isOwner } from "../utils/permissions.js"

// Ações que só o dono pode fazer (ADMs não)
export const OWNER_ONLY = new Set([
    "painel_dono",
    "cfg_menuImage",
    "cfg_criar_preset",
    "cfg_apagar_preset",
    "cfg_link",
    "cfg_ler_mais",
    "cfg_flood_modo",
    "cfg_flood_interval",
    "cfg_flood_lote",
    "cfg_autolimpeza",
    "cfg_antitakeover",
    "cfg_limpar_fantasmas",
    "cfg_limpar_agendamentos",
    "cfg_add_user",
    "cfg_remove_user",
    "cfg_add_group",
    "cfg_remove_group",
    "cfg_add_owner",
    "cfg_remove_owner",
    "cfg_viewonce_toggle",
    "cfg_viewonce_groups",
    "cfg_viewonce_owner",
    "cfg_viewonce_admins",
    "cfg_viewonce_save",
    // [FLOOD v2] controles da feature features/flood/ (só dono)
    "cfg_flood_kill",
    "cfg_flood_dryrun",
    "cfg_flood_testmode",
    "cfg_flood_allowlist",
    "cfg_flood_allowlist_view",
    "cfg_flood_allowlist_add",
    "cfg_flood_allowlist_remove",
    "cfg_flood_speed",
    "cfg_flood_presets",
    "cfg_flood_loja",
    "cfg_flood_xray",
    // atalhos restaurados da arena 01a0aaae (floodpresets/paymenttest/… no commandMap)
    "painel_flood_presets",
    "flood_preset_text_test",
    "flood_preset_mention_test",
    "flood_preset_media_test",
    "flood_preset_payment_test",
    "flood_preset_shopping_test",
    "flood_kill_on",
    "flood_kill_off"
])

export async function roteadorAcoes(chatJid, ownerKey, actionId) {
    if (actionId === "menu_inicial") {
        clearState(ownerKey)
        await enviarPainelInicial(chatJid)
        return
    }
    if (actionId === "menu_cancel") {
        clearState(ownerKey)
        await enviarVoltar(chatJid, "❌ Operação cancelada.")
        return
    }
    if (actionId === "owner_panel" || actionId === "abrir_painel") {
        clearState(ownerKey)
        await enviarPainelInicial(chatJid)
        return
    }

    // [v55] PARIDADE BOTÃO = TEXTO no menu de ações de grupo: com o painel de
    // ações aberto (estado group_action_menu), os ids painel_* executam a
    // MESMA ação que digitar 1/2/3/4 no TXT — via processarSelecaoGrupo, a
    // mesma função do caminho numérico (nenhuma lógica duplicada).
    const stGA = getState(ownerKey)
    const GA_DIRETO = {
        painel_flood: "waiting_flood_message",
        painel_tudo: "waiting_tudo_name",
        painel_roubar: "roubar_grupo",
        painel_so_nome: "waiting_name",
        painel_so_bio: "waiting_bio",
        painel_nome_bio: "waiting_both_name",
        painel_foto_grupo: "waiting_group_image",
        painel_foto_link: "waiting_image_url"
    }
    if (stGA?.action === "group_action_menu" && stGA.selectedGroup && GA_DIRETO[actionId]) {
        setState(ownerKey, {
            action: GA_DIRETO[actionId],
            groupJid: stGA.selectedGroup.id,
            selectedGroup: stGA.selectedGroup
        })
        await processarSelecaoGrupo(chatJid, ownerKey, GA_DIRETO[actionId], stGA.selectedGroup)
        return
    }
    if (actionId === "painel_agendar" && stGA?.action === "group_action_menu" && stGA.selectedGroup) {
        // Mesmo handler do TXT "4" (estado group_agendar_tipo + mesmo texto)
        setState(ownerKey, { action: "group_agendar_tipo", groupJid: stGA.selectedGroup.id, selectedGroup: stGA.selectedGroup })
        await enviarCancelavel(chatJid, `⏰ AGENDAR AÇÃO\nGrupo: ${stGA.selectedGroup.subject}\n\nO que agendar?\n  1 · FLOOD\n  2 · PRESET + NUKE\n  3 · ROUBAR GRUPO\n\n0 = voltar`)
        return
    }

    // Verifica owner-only
    if (OWNER_ONLY.has(actionId) && !isOwner(ownerKey)) {
        await getSock().sendMessage(chatJid, { text: `❌ Apenas o dono pode usar este comando.\nComando: ${actionId}\nSeu ID: ${ownerKey}` })
        return
    }

    const pedirGrupo = async (next) => {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "waiting_group", next })
    }

    // Comandos ATIVOS
    if (actionId === "owner_grupos" || actionId === "painel_listar_grupos") { await listarGruposTexto(chatJid, ownerKey); return }

    // [v40] Botões OFICIAIS do painel (menutest.js / adminMenu.js) — restaurados
    // conforme MAPA DE BOTÕES da AUDITORIA. Os estados waiting_*/confirm_* já
    // existiam no stateHandler; faltava o despacho no roteador (clique não fazia nada).
    if (actionId === "painel_registrar_nome" || actionId === "painel_so_nome" || actionId === "owner_nome" || actionId === "owner_so_nome") { await pedirGrupo("waiting_name"); return }
    if (actionId === "painel_registrar_bio" || actionId === "painel_so_bio" || actionId === "owner_bio" || actionId === "owner_so_bio") { await pedirGrupo("waiting_bio"); return }
    if (actionId === "painel_nome_bio" || actionId === "owner_nome_bio") { await pedirGrupo("waiting_both_name"); return }
    if (actionId === "painel_nuke" || actionId === "owner_nuke") { await pedirGrupo("confirm_nuke"); return }
    if (actionId === "painel_foto_grupo" || actionId === "owner_foto_arquivo") { await pedirGrupo("waiting_group_image"); return }
    if (actionId === "painel_foto_link" || actionId === "owner_foto_link") { await pedirGrupo("waiting_image_url"); return }
    if (actionId === "painel_remover_foto" || actionId === "owner_remover_foto") { await pedirGrupo("confirm_rmfoto"); return }

    if (actionId === "owner_flood" || actionId === "painel_flood") { await pedirGrupo("waiting_flood_message"); return }
    if (actionId === "owner_tudo" || actionId === "painel_tudo") { await pedirGrupo("waiting_tudo_name"); return }
    if (actionId === "owner_roubar" || actionId === "painel_roubar") { await pedirGrupo("roubar_grupo"); return }
    if (actionId === "owner_config" || actionId === "painel_config") { await enviarSubmenuConfig(chatJid, ownerKey, "adm"); return }
    if (actionId === "painel_dono" || actionId === "owner_area") { await enviarPainelDono(chatJid, ownerKey); return }
    if (actionId === "owner_multi" || actionId === "painel_multi") {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "group_menu" })
        await getSock().sendMessage(chatJid, { text: `🔢 MODO MULTI ATIVO\nDigite vários números: 1,3,5 ou 1-5 ou 1 3 5\n\nPara ação em um único grupo, digite só um número.` })
        return
    }
    if (actionId === "owner_sair") { clearState(ownerKey); await getSock().sendMessage(chatJid, { text: "Painel fechado." }); return }

    // [v47] 🖥️ SERVER INSPECTOR (!bloks) — painel A2UI (im_a2ui) com dados REAIS
    // do servidor. UI fixa em services/serverInspector.js; falha isolada não
    // derruba o painel nem a conexão (fallback de texto abaixo).
    // [v52] "Mostrar lista" — toque no botão do menu sem row selecionada
    if (actionId === "mostrar_lista") {
        try {
            const { enviarListaComandos } = await import("../menus/menu.js")
            await enviarListaComandos(chatJid)
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ Falha ao gerar a lista: ${e.message}` }).catch(() => {})
        }
        return
    }
    if (actionId === "server_inspector") {
        try {
            const { sendServerInspector } = await import("../services/serverInspector.js")
            await sendServerInspector(getSock(), chatJid)
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ Falha ao gerar o Server Inspector: ${e.message}` }).catch(() => {})
        }
        return
    }

    // [v41] 🫥 STATUS MANAGER — delega TODAS as ações status_* ao módulo.
    // Autorização (dono/ADM) é verificada dentro do módulo, além do gate global.
    if (actionId.startsWith("status_")) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        await statusRouter(chatJid, ownerKey, actionId)
        return
    }

    // [v33] Categorias do menu interativo com listas (paginação para 100+ comandos)
    if (actionId.startsWith("cat_")) {
        // cat_grupos, cat_ataque, etc ou cat_grupos_page_2
        const pageMatch = actionId.match(/^cat_(.+)_page_(\d+)$/)
        if (pageMatch) {
            const catId = pageMatch[1]
            const pageNum = parseInt(pageMatch[2])
            const { CATEGORIAS } = await import("../menus/menu.js")
            const cat = CATEGORIAS[catId]
            if (cat) {
                const { paginateRows, chunkRowsToSections } = await import("../services/interactiveList.js")
                const { sendInteractiveList } = await import("../services/interactiveList.js")
                const { getSock } = await import("../connection/socket.js")
                const pages = paginateRows(cat.rows, 100)
                const pageIdx = Math.max(0, Math.min(pageNum - 1, pages.length - 1))
                const pageRows = pages[pageIdx]
                const sections = chunkRowsToSections(pageRows, cat.titulo)
                const navRows = []
                if (pageIdx + 1 < pages.length) navRows.push({ title: "➡️ Próxima", description: `Página ${pageIdx + 2}/${pages.length}`, id: `cat_${catId}_page_${pageIdx + 2}` })
                if (pageIdx > 0) navRows.push({ title: "⬅️ Anterior", description: `Página ${pageIdx}/${pages.length}`, id: `cat_${catId}_page_${pageIdx}` })
                navRows.push({ title: "⬅️ Voltar ao Menu", description: "Menu principal", id: "menu_inicial" })
                sections.push({ title: "Navegação", rows: navRows })
                await sendInteractiveList(getSock(), chatJid, {
                    title: `${cat.titulo} P${pageIdx + 1}/${pages.length}`,
                    body: `${cat.titulo} - Página ${pageIdx + 1}/${pages.length}\n${cat.descricao}`,
                    footer: "© SYZYGY",
                    buttonText: "Selecionar",
                    sections
                })
            }
            return
        }

        const catId = actionId.replace("cat_", "")
        if (catId === "rapido") {
            const { sendFastHelpMenu } = await import("../menus/menu.js")
            await sendFastHelpMenu(chatJid)
            return
        }
        const { sendCategoryInteractiveMenu } = await import("../menus/menu.js")
        await sendCategoryInteractiveMenu(chatJid, catId)
        return
    }

    // Ajuda modo rápido clicada
    if (actionId.startsWith("fast_")) {
        const { safeSendMessage } = await import("../services/groupService.js")
        let help = ""
        if (actionId === "fast_flood_preset_help") help = `🌊 FLOOD PRESETS (restaurado da arena 01a0aaae)\n2/preset/<nome>[/conteúdo]\nNomes: text-test, mention-test, media-test, payment-test, shopping-test\nEx: 2/preset/payment-test/Pagamento do pedido|25.90|BRL\nEx: 2/preset/shopping-test/Produto|SYZYGY SHOP|wa\n\nAtalhos de texto: floodpresets · paymenttest · shoppingtest · texttest · mentiontest · mediatest\n         floodstop = kill switch ON · floodstart = OFF · flooddryrun = alterna dry-run\nAlvos: painel 38 (allowlist) · envio real: painel 37 desligado`
        else if (actionId === "fast_flood_help") help = `⚡ FLOOD RÁPIDO\nFormato: 2/<grupo>/<msg>/<qtd>[/<modo>][@tempo]\nEx: 2/01/Oi/20/1\nModos: 1 rapido 50ms/lote8, 2 normal 100ms/lote6, 3 lento 250ms/lote4, 4 seguro 500ms/lote3\nCom @ agenda: 2/01/Oi/20/1@10m`
        else if (actionId === "fast_nuke_help") help = `💣 NUKE RÁPIDO\nFormato: 3/<grupo>/<preset>[/<msg|pular>][@tempo]\nEx: 3/01/2/Oi\nEx: 3/01/0/pular (0=config padrão)\nEx: 3/01/2/Oi@1h (agenda 1h)`
        else if (actionId === "fast_roubar_help") help = `⚡ ROUBAR RÁPIDO\nFormato: 4/<grupo>/<preset>[@tempo]\nEx: 4/01/2\nEx: 4/Kk/0@20:30`
        else if (actionId === "fast_multi_flood_help") help = `🔢 MULTI FLOOD\nFormato: 6/<grupos>/1/<msg>/<qtd>[/<modo>][@tempo]\nEx: 6/1,3,5/1/Oi/20/1\nEx: 6/1-5/1/Oi/20/1@10m`
        else if (actionId === "fast_multi_nuke_help") help = `🔢 MULTI NUKE\nFormato: 6/<grupos>/2/<preset>[/<msg>][@tempo]\nEx: 6/1,3,5/2/2/Oi\nEx: 6/1-5/2/0/pular`
        else if (actionId === "fast_config_help") help = `⚙️ CONFIG RÁPIDO\n5/16/1 → ler mais (liga/desliga)\n5/17/rapido → flood modo\n5/18/200 → intervalo\n5/19/8 → lote\n5/24/5511... → add ADM\n5/26/01 → add grupo autorizado\n5/28/5511... → add dono extra\n(números = menu 5 · Comandos do Dono)`
        else if (actionId === "fast_agendar_help") help = `⏰ AGENDAR RÁPIDO\nUse @ no final:\n3/01/2/Oi@10m → nuke em 10m\n2/01/Oi/20/1@1h → flood em 1h\n4/01/2@20:30 → roubar 20:30\nFormatos tempo: 10s, 5m, 2h, 1d, 20:30, 25/08 20:00`
        else help = `⚡ MODO RÁPIDO\nUse / para comandos diretos e @ para agendar`
        await safeSendMessage(chatJid, { text: help }, 0)
        return
    }

    // Config submenu
    if (actionId === "cfg_menuImage") { await cfgMenuImage(chatJid, ownerKey); return }
    if (actionId === "cfg_owner")     { await cfgOwner(chatJid); return }
    if (actionId === "cfg_number")    { await cfgNumber(chatJid); return }
    if (actionId === "cfg_status")    { await cfgStatus(chatJid); return }
    if (actionId === "cfg_restart")   { await cfgRestart(chatJid, ownerKey, clearState); return }
    if (actionId === "cfg_criar_preset") {
        setState(ownerKey, { action: "preset_novo_nome" })
        await getSock().sendMessage(chatJid, { text: "NOVO PRESET\n\nDigite o nome do grupo (ou cancelar):" })
        return
    }
    // [v40] Listar presets: existia no menu interativo (categoria Presets) mas não tinha handler.
    if (actionId === "cfg_list_presets") {
        const { listarPresetsTexto, carregarPresets } = await import("../services/presetService.js")
        const total = carregarPresets().length
        await getSock().sendMessage(chatJid, {
            text: total === 0
                ? `🎨 PRESETS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\nNenhum preset salvo.\n\nUse 6 (Criar preset) no config para criar.`
                : `🎨 PRESETS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n${listarPresetsTexto()}\n\nUse 12 para criar, 13 para apagar (menu 5).`
        })
        return
    }
    if (actionId === "cfg_apagar_preset") {
        const { listarPresetsTexto, carregarPresets } = await import("../services/presetService.js")
        if (carregarPresets().length === 0) {
            await getSock().sendMessage(chatJid, { text: "Nenhum preset salvo." })
            return
        }
        setState(ownerKey, { action: "preset_apagar" })
        await getSock().sendMessage(chatJid, { text: `APAGAR PRESET\n\n${listarPresetsTexto()}\n\nDigite o numero do preset para apagar (ou cancelar):` })
        return
    }
    if (actionId === "cfg_fantasma") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.marcarFantasma = !CONFIG.marcarFantasma
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `Marcar fantasma agora: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}\n\n(marca todos sem mostrar os @ no nuke, flood e roubo)` })
        return
    }
    if (actionId === "cfg_link") {
        const { CONFIG } = await import("../utils/config.js")
        setState(ownerKey, { action: "config_set_link" })
        await getSock().sendMessage(chatJid, {
            text: `LINK / NUMERO DE DIVULGACAO\n\nAtual: ${CONFIG.linkDivulgacao || "(nenhum)"}\n\nEnvie o link do grupo/canal ou o numero.\nDigite REMOVER para apagar.\n(cancelar para sair)`
        })
        return
    }
    if (actionId === "cfg_flood_modo") {
        const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
        setState(ownerKey, { action: "config_set_flood_modo" })
        await getSock().sendMessage(chatJid, {
            text: `🌊 MODO FLOOD\nAtual: ${CONFIG.floodModo} (${FLOOD_MODOS[CONFIG.floodModo]?.intervalo}ms/lote${FLOOD_MODOS[CONFIG.floodModo]?.lote})\n\nDigite:\n  rapido - 80ms/lote6 (arriscado)\n  normal - 150ms/lote5\n  lento - 400ms/lote3\n  seguro - 800ms/lote2 + jitter\n\n(cancelar para sair)`
        })
        return
    }
    if (actionId === "cfg_flood_interval") {
        setState(ownerKey, { action: "config_set_flood_interval" })
        await getSock().sendMessage(chatJid, { text: `Intervalo flood atual: ${ (await import("../utils/config.js")).CONFIG.floodInterval}ms\n\nDigite novo intervalo (20-5000ms):\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_flood_lote") {
        setState(ownerKey, { action: "config_set_flood_lote" })
        await getSock().sendMessage(chatJid, { text: `Lote flood atual: ${ (await import("../utils/config.js")).CONFIG.floodLote}\n\nDigite novo lote (1-10):\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_ler_mais") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.lerMais = !CONFIG.lerMais
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `📖 Ler mais agora: ${CONFIG.lerMais ? "LIGADO" : "DESLIGADO"}\n\nLIGADO → mensagens dobram logo após\no título (⚡ SYZYGY), usando caracteres\ninvisíveis que estouram o limite do app.\nDESLIGADO → mostra tudo inteiro.\n\n⚠️ O corte exato é do app do WhatsApp\n(sem API) e pode não dobrar no iPhone.` })
        return
    }
    if (actionId === "cfg_autolimpeza") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.autoLimpeza = !CONFIG.autoLimpeza
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `Auto-limpeza agora: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}\n\nRemove automaticamente grupos fantasmas do cache.` })
        return
    }
    if (actionId === "cfg_antitakeover") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.antiTakeover = !CONFIG.antiTakeover
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `Anti-takeover agora: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}\n\nDetecta perda de admin, remoção e promoções suspeitas.` })
        return
    }
    // ══ [RESTAURAÇÃO 01a0aaae] atalhos de flood → fachada features/flood/router.js
    // (painel de presets, *_test, kill switch on/off, escolha de grupos). A fachada
    // só usa runPresetJob/executarFlood; ela não abre segundo caminho de envio.
    if (
        actionId === "painel_flood_presets" ||
        actionId === "flood_presets_menu" ||
        actionId === "cfg_flood_allowlist" ||
        actionId === "flood_pick_groups" ||
        actionId.startsWith("flood_preset_") ||
        actionId === "flood_kill_on" ||
        actionId === "flood_kill_off"
    ) {
        try {
            const { floodRouter } = await import("../features/flood/index.js")
            await floodRouter(chatJid, ownerKey, actionId)
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ flood: ${e?.message || e}` })
        }
        return
    }

    // ══ [FLOOD v2] 🛡️ FLOOD · CONTROLES (37-46) ════════════════════════════
    // Tudo aqui LÊ/MUTA o estado da feature features/flood/ pela API pública do
    // barrel (../features/flood/index.js). Nenhum caminho daqui chama
    // sock.sendMessage() para enviar flood: os toggles só gravam config e os
    // previews montam payload sem enviar.
    if (actionId === "cfg_flood_kill") {
        try {
            const fx = await import("../features/flood/index.js")
            const agora = fx.toggleKillSwitch({ persist: true })
            await getSock().sendMessage(chatJid, {
                text: `${agora ? "🛑 Flood BLOQUEADO (kill switch ligado)" : "▶️ Flood liberado"}\n\n${fx.killSwitchStatusTexto()}\n\n_Efeito: jobs de preset param na fronteira do lote e o flood clássico do wizard também._`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ kill switch: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_flood_dryrun") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        const novo = !(CONFIG.floodDryRun === true)
        CONFIG.floodDryRun = novo
        salvarConfig()
        await getSock().sendMessage(chatJid, {
            text: `🧪 Dry-run do flood: ${novo ? "LIGADO" : "DESLIGADO"}\n\n${novo
                ? "Monta conteúdo, alvos e métricas, mas NÃO envia nada.\nÉ o padrão da feature — deixa ligado até você validar o card."
                : "⚠️ Agora os disparos SAEM de verdade para os alvos da allowlist.\nRecomendado: 1 destino de teste, qtd 1, e o kill switch por perto (39)."}`
        })
        return
    }
    if (actionId === "cfg_flood_testmode") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        const novo = !(CONFIG.floodTestMode !== false)
        CONFIG.floodTestMode = novo
        salvarConfig()
        await getSock().sendMessage(chatJid, {
            text: `🎯 Modo teste: ${novo ? "LIGADO" : "DESLIGADO"}\n\n${novo
                ? "Permite payment e loja (o card de loja é montado a partir de um preset, com aviso)."
                : "⚠️ Com modo teste DESLIGADO o preset engine responde PAYMENT_TEST_DISABLED / SHOPPING_TEST_DISABLED — loja e pagamento ficam bloqueados."}`
        })
        return
    }
    if (actionId === "cfg_flood_allowlist_view") {
        try {
            const fx = await import("../features/flood/index.js")
            await getSock().sendMessage(chatJid, {
                text: `${fx.formatAllowlistTexto()}\n\n_Sem allowlist, TODO destino é barrado (ALLOWLIST_EMPTY / BLOCKED_TARGET)._\n38 = escolher grupos (1,3,5) · 41 = adicionar · 42 = remover · 43 = velocidade · 36 = presets`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ allowlist: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_flood_allowlist_add") {
        const { CONFIG } = await import("../utils/config.js")
        const grupos = CONFIG.gruposAutorizados || []
        let t = `🛡️ ADD NA ALLOWLIST DO FLOOD\n\nEnvie UMA linha com:\n  • o número do grupo autorizado (abaixo), OU\n  • o JID completo (150000000000000000-1000000000@g.us)\n\n`
        t += grupos.length
            ? grupos.slice(0, 20).map((g, i) => `  ${i + 1} · ${g}`).join("\n")
            : "_nenhum grupo autorizado ainda — mande o JID_"
        t += `\n\n_Nada é enviado ao adicionar; allowlist é só a porta de saída do flood._\n(cancelar para sair)`
        setState(ownerKey, { action: "config_set_flood_allowlist_add" })
        await getSock().sendMessage(chatJid, { text: t })
        return
    }
    if (actionId === "cfg_flood_allowlist_remove") {
        try {
            const fx = await import("../features/flood/index.js")
            setState(ownerKey, { action: "config_set_flood_allowlist_remove" })
            await getSock().sendMessage(chatJid, {
                text: `${fx.formatAllowlistTexto()}\n\nDigite o NÚMERO da linha a remover (1-based) ou o JID.\n(cancelar para sair)`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ allowlist: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_flood_speed") {
        try {
            const fx = await import("../features/flood/index.js")
            setState(ownerKey, { action: "config_set_flood_speed" })
            await getSock().sendMessage(chatJid, {
                text: `${fx.formatFloodSpeedMenu()}\n\n_o valor escolhido vale para o flood clássico (config.json) e é o overlay de velocidade dos presets (concorrência nunca sobe acima do preset; payment/loja ficam em 1 por vez)._\n(cancelar para sair)`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ velocidade: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_flood_presets") {
        try {
            const fx = await import("../features/flood/index.js")
            const cap = fx.FLOOD_PRESET_HARD_CAP
            await getSock().sendMessage(chatJid, {
                text: `${fx.listPresetsTexto()}\n\n${fx.formatCustomPresetsTexto()}\n\n_Teto por job: ${cap.maxMessages} msg · intervalo mín. ${cap.minInterval}ms · ${cap.maxConcurrency} por vez · cooldown mín. ${cap.minCooldown}ms.\nPara usar: menu → 🌊 FLOOD → grupo → qtd → modo → conteúdo (loja:… para o card)._`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ presets: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_flood_loja") {
        setState(ownerKey, { action: "config_set_flood_loja" })
        await getSock().sendMessage(chatJid, {
            text: `🛍️ PREVIEW DA LOJA (não envia nada)\n\nEnvie o overlay do card:\n  0                                  → preset padrão\n  texto livre                        → corpo livre\n  texto|titulo|wa                    → texto|title|surface (fb|ig|wa ou 1|2|3)\n  texto|titulo|wa|meu-shop-id        → com shop.id\n  loja flow                          → mesmo card pelo ramo nativeFlow\n\n_O preview mostra as chaves do send e o ramo do wire — é assim que se confere se o card existe de fato no payload._\n(cancelar para sair)`
        })
        return
    }
    if (actionId === "cfg_flood_xray") {
        try {
            const fx = await import("../features/flood/index.js")
            const { CONFIG } = await import("../utils/config.js")
            const rc = fx.getFloodRuntimeConfig()
            const cap = fx.FLOOD_PRESET_HARD_CAP
            const defId = fx.DEFAULT_FLOOD_PRESET_ID
            const def = fx.getPresetDef(defId)
            const cd = def ? fx.remainingCooldown(defId, def.cooldownMs || 0) : 0
            const job = fx.currentJobInfo()
            const t = [
                "🩺 RAIO-X DO FLOOD",
                `• kill switch: ${rc.killSwitch ? "LIGADO (bloqueado)" : "desligado"}`,
                `• dry-run: ${rc.dryRun ? "LIGADO (nada sai)" : "DESLIGADO (envia de verdade!)"}`,
                `• modo teste: ${rc.testMode ? "LIGADO (payment/loja permitidos)" : "DESLIGADO (payment/loja barrados)"}`,
                `• allowlist: ${rc.allowlist.length} destino(s)${rc.allowlist.length ? "" : " → todo disparo morre em ALLOWLIST_EMPTY (porta de saída, não bug)"}`,
                `• config do flood clássico: ${CONFIG.floodModo} ${CONFIG.floodInterval}ms/lote${CONFIG.floodLote}`,
                `• timeout por send: ${rc.timeoutMs}ms · retries: ${rc.maxRetries}`,
                `• teto de preset: ${cap.maxMessages} msg · mín ${cap.minInterval}ms · conc ${cap.maxConcurrency} · cooldown mín ${cap.minCooldown}ms`,
                `• cooldown do preset "${defId}": ${cd > 0 ? `${cd}ms restantes` : "livre"}`,
                `• job em andamento: ${job ? `${job.presetId} (${job.type}) há ${Math.round(job.elapsedMs / 1000)}s · ${job.targets.length} alvo(s)${job.cancelled ? " · CANCELANDO" : ""}` : "nenhum"}`,
                `• presets ligados: ${fx.listPresetIds().length} + ${fx.listCustomPresets().length} custom`,
                "",
                "_quer parar um job agora? 36 (kill switch) — a fila para na fronteira do lote._"
            ].join("\n")
            await getSock().sendMessage(chatJid, { text: t })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ raio-x: ${e.message}` })
        }
        return
    }

    if (actionId === "cfg_limpar_fantasmas") {
        await getSock().sendMessage(chatJid, { text: "Limpando grupos fantasmas..." })
        try {
            const { limparCacheFantasmas } = await import("../services/groupService.js")
            const r = await limparCacheFantasmas(true)
            await getSock().sendMessage(chatJid, { text: `Limpeza concluída.\nVerificados: ${r.verificados}\nRemovidos: ${r.removidos}\nReais: ${r.totalReais || "?"}\n${r.lista.length ? "\nRemovidos:\n" + r.lista.slice(0, 10).map(x => `• ${x.subject}`).join("\n") : ""}` })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_historico") {
        try {
            const { formatarHistoricoTexto } = await import("../services/historicoService.js")
            await getSock().sendMessage(chatJid, { text: formatarHistoricoTexto(20) })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_relatorio") {
        try {
            const { gerarRelatorio } = await import("../services/historicoService.js")
            const { carregarPresets } = await import("../services/presetService.js")
            const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
            const { rt } = await import("../connection/socket.js")
            const rel = gerarRelatorio()
            const grupos = Object.values(rt().cachedGroups || {})
            const admin = grupos.filter(g => g.isAdmin).length
            const modo = FLOOD_MODOS[CONFIG.floodModo] || {}
            const { listarAgendamentos } = await import("../services/agendaService.js")
            const ag = listarAgendamentos()
            const pendentes = ag.filter(j => j.status === "pendente").length
            const { getAuthorizedUsers, getAuthorizedGroups } = await import("../utils/permissions.js")
            let txt = `📊 RELATÓRIO SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n`
            txt += `👥 Grupos: ${grupos.length} (👑 ${admin} admin / 👤 ${grupos.length - admin} membro)\n`
            txt += `🎨 Presets: ${carregarPresets().length}\n`
            txt += `🌊 Flood: ${CONFIG.floodModo} ${modo.intervalo}ms/lote${modo.lote} ${CONFIG.floodJitter ? "+jitter" : ""}\n`
            txt += `👻 Fantasma: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}\n`
            txt += `🧹 Auto-limpeza: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}\n`
            txt += `🛡️ Anti-takeover: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}\n`
            txt += `👤 ADMs bot: ${getAuthorizedUsers().length} | 👥 Grupos autorizados: ${getAuthorizedGroups().length}\n`
            txt += `📜 Histórico: ${rel.total} ações (${rel.ultimas24h} nas últimas 24h)\n`
            txt += `⏰ Agendamentos: ${ag.length} (${pendentes} pendentes)\n`
            txt += `━━━━━━━━━━━━━━━━━━━━\n`
            txt += `Por tipo: ${Object.entries(rel.porTipo).map(([k, v]) => `${k}:${v}`).join(" ") || "nenhum"}\n\n`
            txt += `Últimas ações:\n`
            rel.lista.slice(0, 5).forEach(h => {
                const d = new Date(h.ts)
                txt += `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${h.tipo} ${h.subject || ""}\n`
            })
            await getSock().sendMessage(chatJid, { text: txt })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro relatório: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_agendamentos") {
        try {
            const { formatarAgendamentosTexto } = await import("../services/agendaService.js")
            await getSock().sendMessage(chatJid, { text: formatarAgendamentosTexto() })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_limpar_agendamentos") {
        try {
            const { limparConcluidos } = await import("../services/agendaService.js")
            const n = limparConcluidos()
            await getSock().sendMessage(chatJid, { text: `Removidos ${n} agendamentos concluídos/com erro.` })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_add_user") {
        setState(ownerKey, { action: "config_add_user" })
        await getSock().sendMessage(chatJid, { text: `➕ ADD ADM DO BOT\n\nEnvie o número do usuário com DDD (ex: 5519000000000)\nPode enviar vários separados por vírgula ou espaço.\nSe o usuário usar @lid, envie o LID também.\n\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_remove_user") {
        const { getAuthorizedUsers, formatAuthorizedUsersTexto } = await import("../utils/permissions.js")
        const users = getAuthorizedUsers()
        if (!users.length) {
            await getSock().sendMessage(chatJid, { text: "Nenhum usuário autorizado extra." })
            return
        }
        setState(ownerKey, { action: "config_remove_user" })
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER ADM DO BOT\n\n${formatAuthorizedUsersTexto()}\n\nDigite o número ou o índice (ex: 1 ou 5519000000000)\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_list_users") {
        const { formatAuthorizedUsersTexto, getAuthorizedUsers, getAuthorizedLids } = await import("../utils/permissions.js")
        const { getOwnerNumber } = await import("../utils/permissions.js")
        const owner = getOwnerNumber()
        let txt = `👤 ADMs DO BOT SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n`
        txt += `👑 Dono: ${owner}\n\n`
        txt += `Autorizados extras (${getAuthorizedUsers().length} tel + ${getAuthorizedLids().length} LID):\n`
        txt += formatAuthorizedUsersTexto()
        txt += `\n\nUse 24 para adicionar, 25 para remover (menu 5).`
        await getSock().sendMessage(chatJid, { text: txt })
        return
    }
    if (actionId === "cfg_add_group") {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "config_add_group" })
        await getSock().sendMessage(chatJid, { text: `➕ ADD GRUPO AUTORIZADO\n\nDigite o número do grupo da lista acima (ex: 01)\nOu envie link de convite / ID do grupo.\n\nPara multi: 1,3,5 ou 1-5\nGrupo autorizado fica blindado contra nuke/flood/roubar\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_remove_group") {
        const { getAuthorizedGroups, formatAuthorizedGroupsTexto } = await import("../utils/permissions.js")
        const groups = getAuthorizedGroups()
        if (!groups.length) {
            await getSock().sendMessage(chatJid, { text: "Nenhum grupo autorizado." })
            return
        }
        setState(ownerKey, { action: "config_remove_group" })
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER GRUPO AUTORIZADO\n\n${formatAuthorizedGroupsTexto(rt().cachedGroups)}\n\nDigite o índice (ex: 1) ou o ID do grupo\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_list_groups") {
        const { getAuthorizedGroups, formatAuthorizedGroupsTexto } = await import("../utils/permissions.js")
        const txt = `👥 GRUPOS AUTORIZADOS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n${formatAuthorizedGroupsTexto(rt().cachedGroups)}\n\nTotal: ${getAuthorizedGroups().length}\nBlindados contra nuke/flood/roubar\n\nUse 26 para adicionar, 27 para remover (menu 5).`
        await getSock().sendMessage(chatJid, { text: txt })
        return
    }
    if (actionId === "cfg_add_owner") {
        setState(ownerKey, { action: "config_add_owner" })
        await getSock().sendMessage(chatJid, { text: `👑 ADD DONO EXTRA\n\nEnvie o número com DDD (ex: 5519000000000)\nDono extra tem TODAS permissões, igual você (pode add ADM, mudar foto, etc).\n\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_remove_owner") {
        const { getExtraOwners, formatExtraOwnersTexto } = await import("../utils/permissions.js")
        if (!getExtraOwners().length) {
            await getSock().sendMessage(chatJid, { text: "Nenhum dono extra." })
            return
        }
        setState(ownerKey, { action: "config_remove_owner" })
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER DONO EXTRA\n\n${formatExtraOwnersTexto()}\n\nDigite índice ou número\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_list_owners") {
        const { formatExtraOwnersTexto, getExtraOwners, getOwnerNumber, getAllOwners } = await import("../utils/permissions.js")
        let txt = `👑 DONOS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n`
        txt += `Principal: ${getOwnerNumber()}\n\n`
        txt += `Extras (${getExtraOwners().length}):\n${formatExtraOwnersTexto()}\n\n`
        txt += `Todos com poder total: ${getAllOwners().join(", ")}`
        await getSock().sendMessage(chatJid, { text: txt })
        return
    }
    if (actionId === "cfg_viewonce_toggle") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.enabled = !VIEW_ONCE_CONFIG.enabled
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce agora: ${VIEW_ONCE_CONFIG.enabled ? "LIGADO" : "DESLIGADO"}` })
        return
    }
    if (actionId === "cfg_viewonce_groups") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.sendToAuthorizedGroups = !VIEW_ONCE_CONFIG.sendToAuthorizedGroups
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce → grupos autorizados: ${VIEW_ONCE_CONFIG.sendToAuthorizedGroups ? "SIM" : "NAO"}` })
        return
    }
    if (actionId === "cfg_viewonce_owner") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.sendToOwner = !VIEW_ONCE_CONFIG.sendToOwner
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce → owner: ${VIEW_ONCE_CONFIG.sendToOwner ? "SIM" : "NAO"}` })
        return
    }
    if (actionId === "cfg_viewonce_admins") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.sendToAdmins = !VIEW_ONCE_CONFIG.sendToAdmins
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce → ADMs: ${VIEW_ONCE_CONFIG.sendToAdmins ? "SIM" : "NAO"}` })
        return
    }
    if (actionId === "cfg_viewonce_save") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.saveToDisk = !VIEW_ONCE_CONFIG.saveToDisk
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce salvar: ${VIEW_ONCE_CONFIG.saveToDisk ? "DISCO (salva, envia e apaga)" : "SÓ BUFFER (não salva no celular)"}\n\n${VIEW_ONCE_CONFIG.saveToDisk ? "Salva em temp/ e apaga após enviar" : "Só em memória, não fica arquivo no seu celular"}` })
        return
    }

    if (actionId === "nuke_confirm_yes")   { await confirmarNuke(chatJid, ownerKey); return }
    if (actionId === "rmfoto_confirm_yes") { await confirmarRemoverFoto(chatJid, ownerKey); return }
    if (actionId === "flood_confirm_yes")  { await confirmarFlood(chatJid, ownerKey); return }

    if (actionId.startsWith("grp_page_")) {
        const nPag = parseInt(actionId.replace("grp_page_", ""))
        const novoCache = await listarGruposInterativo(chatJid, nPag)
        if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
        return
    }

    if (actionId.startsWith("grp_select_")) {
        const n = parseInt(actionId.replace("grp_select_", ""))
        const entry = (rt().groupSelectionCache[ownerKey] || {})[n]
        if (!entry) { await enviarVoltar(chatJid, "⚠️ Seleção expirada."); return }
        const st = getState(ownerKey)
        if (!st || st.action !== "waiting_group") {
            await enviarMenuAcoesGrupo(chatJid, entry, ownerKey)
            return
        }
        setState(ownerKey, {
            action: st.next,
            groupJid: entry.id,
            selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: n }
        })
        await processarSelecaoGrupo(chatJid, ownerKey, st.next, entry)
        return
    }

    // [v40] Fallback: nenhum handler para o ID (evita clique de botão sem resposta).
    await getSock().sendMessage(chatJid, { text: `⚠️ Comando não reconhecido: ${actionId}\nDigite *menu* para abrir o painel.` })
}

```

### handlers/messageHandler.js — 315 linhas (16.5 KB)

```js
// handlers/messageHandler.js
// [v33] ViewOnce antes de auth + ADM LID imediato + grupos autorizados blindados + owner-only

import { getSock, rt, foiEnviadoPeloBot } from "../connection/socket.js"
import {
    isOwner, isGroupJid, normalizeNumber, getSenderJid, getChatJid,
    isAuthorizedUser, isAuthorizedGroup, isAuthorizedUserWithMap,
    getAuthorizedUsers, getAuthorizedGroups, ownerJidForSending
} from "../utils/permissions.js"
import { getState } from "../utils/stateManager.js"
import { CONFIG } from "../utils/config.js"
import { err, warn } from "../utils/terminalUI.js"
import { getLidMap } from "../services/lidResolver.js"

import { getInteractiveId, tratarInteracao } from "./interactionHandler.js"
import { handleEstado } from "./stateHandler.js"
import { detectarImagem } from "../services/mediaService.js"
import { TEXT_TO_ACTION } from "../commands/commandMap.js"
import { roteadorAcoes } from "../commands/commandRouter.js"
import { info } from "../utils/terminalUI.js"
import { getListId } from "../services/interactiveList.js"

function buscarPhoneDeLidEmCache(lidNum) {
    const cache = rt().cachedGroups || {}
    for (const g of Object.values(cache)) {
        const parts = g.participants || g._fullMeta?.participants || []
        if (!Array.isArray(parts)) continue
        for (const p of parts) {
            const pLid = normalizeNumber(p.lid || "")
            const pPhone = normalizeNumber(p.id || "")
            if (pLid === lidNum && pPhone) return pPhone
        }
    }
    return null
}

// [v52] Registro de interações JÁ processadas (dedupe anti-execução-dupla)
const interacoesProcessadas = new Set()
const INTERACOES_MAX = 500
function registrarInteracaoProcessada(id) {
    if (!id) return
    interacoesProcessadas.add(id)
    if (interacoesProcessadas.size > INTERACOES_MAX) {
        const first = interacoesProcessadas.values().next().value
        interacoesProcessadas.delete(first)
    }
}
function foiInteracaoProcessada(id) {
    return !!id && interacoesProcessadas.has(id)
}

// [v53] Última vez que cada (conversa|opção) foi processada — dedupe semântico
const ultimaInteracaoSemantica = new Map()

export function registrarMessageHandler(sock) {
    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            if (chatUpdate.type && chatUpdate.type !== "notify") return

            const m = chatUpdate.messages[0]
            if (!m || !m.message) return
            // [v41] Status (stories) recebidos não são input de comando — ignora.
            // Evita resposta automática a status de contatos (ex.: status com texto "menu").
            if (m.key?.remoteJid === "status@broadcast") return
            // CORREÇÃO JID: usa remoteJidAlt se tiver (fix @lid)
            const chatJid = getChatJid(m) || m.key.remoteJid
            if (!chatJid) return

            const fromMe = !!m.key.fromMe
            // [v55] DEDUPE GLOBAL POR key.id: o WhatsApp pode entregar a MESMA
            // mensagem 2x (retry/eco) com o MESMO id — seja texto, botão ou lista.
            // Um evento = uma execução, para qualquer tipo de mensagem.
            if (foiInteracaoProcessada(m.key?.id)) return
            registrarInteracaoProcessada(m.key?.id)
            // [v52] Parser ÚNICO de interações (getListId — lista/botões/template/
            // native flow). Antes: getInteractiveId(m) || getListId(m) — dois
            // parsers quase iguais podiam divergir e causar duplo caminho.
            let interactionId = getListId(m)
            // [v52] Tap no BOTÃO ("Mostrar lista") sem row selecionada: clientes
            // que não abrem o picker nativo devolvem a interactiveResponse SEM id
            // → o toque significa "quero a lista" (mostrar_lista).
            if (!interactionId && m.message?.interactiveResponseMessage) interactionId = "mostrar_lista"
            // [v52] DEDUPE: o WhatsApp pode entregar a mesma interação 2x (retry/
            // reenvio) → execuções duplicadas. Registro o id da mensagem e ignoro
            // repetições (cap 500, igual ao registro de envios).
            if (interactionId) {
                // (b) [v53] o mesmo TOQUE entregue 2x com key.ids DIFERENTES
                // (retry/eco do WhatsApp — causa global das respostas duplicadas):
                // mesma conversa + mesma opção dentro de 1,5s = a MESMA interação.
                const semKey = `${chatJid}|${interactionId}`
                const agora = Date.now()
                const ultima = ultimaInteracaoSemantica.get(semKey)
                if (ultima != null && agora - ultima < 1500) {
                    console.log(info("MENU", `interação duplicada ignorada (${interactionId} em ${chatJid})`))
                    return
                }
                ultimaInteracaoSemantica.set(semKey, agora)
                if (ultimaInteracaoSemantica.size > 500) {
                    for (const [k, ts] of ultimaInteracaoSemantica) {
                        if (agora - ts > 60000) ultimaInteracaoSemantica.delete(k)
                    }
                }
            }
            // [v51][DEBUG gated] Resposta interativa que NÃO gerou id → dump
            // das chaves p/ descobrir o formato real (ativa com "uiDebug": true).
            if (!interactionId && /interactive|list|buttons|template/i.test(Object.keys(m.message || {}).join(","))) {
                try {
                    const { CONFIG } = await import("../utils/config.js")
                    if (CONFIG.uiDebug) console.log(info("MENU-DEBUG", JSON.stringify(m.message).slice(0, 1500)))
                } catch {}
            }
            if (fromMe && !interactionId && foiEnviadoPeloBot(m.key.id)) return

            const isGroup = isGroupJid(chatJid)
            let sender = fromMe ? getSock().user?.id : getSenderJid(m)
            const senderNum = normalizeNumber(sender)
            const chatNum = normalizeNumber(chatJid)

            // [v33] ViewOnce - detecta ANTES de checar autorização, para qualquer viewOnce recebido pelo bot ser encaminhado
            try {
                const { detectViewOnce, handleViewOnceMessage } = await import("../features/viewOnce/index.js")
                const vo = detectViewOnce(m)
                if (vo) {
                    console.log(info("VIEW-ONCE", `Detectada tipo=${vo.mediaType} origem=${chatJid} sender=${senderNum} isGroup=${isGroup}`))
                    const res = await handleViewOnceMessage({ chatJid, senderJid: sender, isGroup, webMessageInfo: m })
                    if (res && res.processed) {
                        console.log(info("VIEW-ONCE", `ok tipo=${res.mediaType} destinos=${res.destinations.total} (grupos:${res.destinations.groups} owner:${res.destinations.owner} admins:${res.destinations.admins}) falhas=${res.failed || 0}`))
                        try {
                            const { safeSendMessage } = await import("../services/groupService.js")
                            await safeSendMessage(chatJid, { text: `✅ ViewOnce ${res.mediaType} → ${res.destinations.total} destinos (grupos:${res.destinations.groups} owner:${res.destinations.owner})${res.failed ? ` falhas:${res.failed}` : ""}` }, 0)
                        } catch {}
                    } else if (res && res.reason && res.reason !== "DISABLED" && res.reason !== "DUPLICATED") {
                        // [v43] Motivo da falha AGORA aparece no TERMINAL também (diagnóstico)
                        const dets = res.logs?.filter(l => String(l).includes("failed") || String(l).includes("download")).slice(0, 2).join(" | ")
                        console.log(warn(`[VIEW-ONCE] NÃO encaminhado: motivo=${res.reason} tipo=${res.mediaType} origem=${chatJid}${dets ? ` · ${dets}` : ""}`))
                        try {
                            const { safeSendMessage } = await import("../services/groupService.js")
                            await safeSendMessage(chatJid, { text: `⚠️ ViewOnce não encaminhado: ${res.reason}` }, 0)
                        } catch {}
                    }
                    return
                }
            } catch (e) {
                console.log(err(`[VIEW-ONCE] handler erro ${e.message}`))
            }

            let lidMap = null
            try { lidMap = getLidMap() } catch {}

            let isOwnerSender = isOwner(sender)
            let isAuthUserSender = isAuthorizedUserWithMap(sender, lidMap)
            let isOwnerChat = isOwner(chatJid)
            let isAuthUserChat = isAuthorizedUserWithMap(chatJid, lidMap)
            const isAuthGroup = isGroup && isAuthorizedGroup(chatJid)

            if (!isAuthUserSender && !isOwnerSender) {
                const phoneFromCache = buscarPhoneDeLidEmCache(senderNum)
                if (phoneFromCache && getAuthorizedUsers().includes(phoneFromCache)) {
                    isAuthUserSender = true
                }
            }
            if (!isAuthUserChat && !isOwnerChat && !isGroup) {
                const phoneFromCache2 = buscarPhoneDeLidEmCache(chatNum)
                if (phoneFromCache2 && getAuthorizedUsers().includes(phoneFromCache2)) {
                    isAuthUserChat = true
                }
            }

            const authorizedPV = !isGroup && (fromMe || isOwnerSender || isAuthUserSender || isOwnerChat || isAuthUserChat)
            const authorizedGroup = isGroup && isAuthGroup && (fromMe || isOwnerSender || isAuthUserSender)
            const authorized = authorizedPV || authorizedGroup

            const textRaw = (
                m.message.conversation ||
                m.message.extendedTextMessage?.text ||
                m.message.imageMessage?.caption ||
                m.message.documentMessage?.caption || ""
            ).trim()
            const textLower = textRaw.toLowerCase()

            if ((CONFIG.uiDebug || process.env.SYZYGY_UI_DEBUG === "1") && authorized) {
                console.log(`[AUTH] grupo=${isGroup} authGroup=${isAuthGroup} sender=${sender} senderNum=${senderNum} isOwner=${isOwnerSender} isAuth=${isAuthUserSender} chat=${chatJid} text=${textRaw.slice(0,40)}`)
            }

            if (!authorized) {
                if (!isGroup && (textLower === "!menu" || textLower === "menu" || textLower === "5" || textLower === "1")) {
                    try {
                        const lidInfo = sender ? `\nSeu ID: ${sender}\nNum: ${senderNum}` : ""
                        await getSock().sendMessage(chatJid, { text: `❌ Acesso negado.${lidInfo}\n\nAvisando o dono...` })
                    } catch {}
                    try {
                        const oj = ownerJidForSending()
                        if (oj && chatJid !== oj) {
                            await getSock().sendMessage(oj, { text: `⚠️ Tentativa negada\nDe: ${chatJid}\nSender: ${sender}\nNum: ${senderNum}\nTexto: ${textRaw}\n\nPara liberar imediato (dono):\n5 > 24 > ${senderNum}\nSe for LID:\n5 > 24 > ${sender}` })
                        }
                    } catch {}
                }
                return
            }

            if (interactionId) {
                await tratarInteracao(chatJid, senderNum, interactionId)
                return
            }

            // [v57] DEDUPE SEMÂNTICO DE COMANDO DE TEXTO: o mesmo comando pode
            // chegar 2x com key.ids DIFERENTES (eco multi-device do WhatsApp) —
            // mesma conversa + mesmo comando roteado dentro de 1,5s = 1 execução
            // (mesma política já aplicada às interações desde a v53).
            if (TEXT_TO_ACTION[textLower]) {
                const semCmdKey = `${chatJid}|cmd:${textLower}`
                const agoraCmd = Date.now()
                const ultimaCmd = ultimaInteracaoSemantica.get(semCmdKey)
                if (ultimaCmd != null && agoraCmd - ultimaCmd < 1500) {
                    console.log(info("MENU", `comando duplicado ignorado ("${textRaw}" em ${chatJid})`))
                    return
                }
                ultimaInteracaoSemantica.set(semCmdKey, agoraCmd)
                if (ultimaInteracaoSemantica.size > 500) {
                    for (const [k, ts] of ultimaInteracaoSemantica) {
                        if (agoraCmd - ts > 60000) ultimaInteracaoSemantica.delete(k)
                    }
                }
            }

            const st = getState(senderNum)
            const imgInfo = detectarImagem(m)

            const GLOBAIS = new Set(["menu_cancel", "abrir_painel", "menu_inicial", "owner_panel"])
            const acaoGlobal = TEXT_TO_ACTION[textLower]
            if (acaoGlobal && GLOBAIS.has(acaoGlobal)) {
                console.log(info("COMMAND", `Input="${textRaw}" -> ${acaoGlobal} grupo=${isGroup} sender=${senderNum}`))
                await roteadorAcoes(chatJid, senderNum, acaoGlobal)
                return
            }

            const mCancelarAg = textLower.match(/^(?:cancelar(?:_agendamento)?)\s+([a-z0-9]+)$/i)
            if (mCancelarAg) {
                const id = mCancelarAg[1]
                try {
                    const { listarAgendamentos, cancelarAgendamento } = await import("../services/agendaService.js")
                    let removido = cancelarAgendamento(id)
                    if (!removido) {
                        const lista = listarAgendamentos()
                        const found = lista.find(j => j.id.startsWith(id))
                        if (found) removido = cancelarAgendamento(found.id)
                    }
                    if (removido) {
                        await getSock().sendMessage(chatJid, { text: `✅ Agendamento ${removido.id.slice(0, 8)} cancelado.` })
                    } else {
                        await getSock().sendMessage(chatJid, { text: `⚠️ ID ${id} não encontrado.` })
                    }
                } catch (e) {
                    await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
                }
                return
            }

            const mAcaoRapida = textLower.match(/^a\s*([1-4])$/i)
            if (mAcaoRapida) {
                const alvo = (rt().grupoAlvo || {})[normalizeNumber(getSock().user?.id)] ||
                             (rt().grupoAlvo || {})["owner"] ||
                             Object.values(rt().grupoAlvo || {})[0]
                const chave = mAcaoRapida[1]
                if (chave === "1") {
                    await roteadorAcoes(chatJid, senderNum, "painel_listar_grupos")
                    return
                }
                if (!alvo) {
                    await getSock().sendMessage(chatJid, { text: "Nenhum grupo-alvo. Ganhe admin em um grupo primeiro, ou digite: menu" })
                    return
                }
                const mapaRapido = { "2": "waiting_flood_message", "3": "waiting_tudo_name", "4": "roubar_grupo" }
                const next = mapaRapido[chave]
                if (next) {
                    const { processarSelecaoGrupo } = await import("./stateHandler.js")
                    console.log(info("COMMAND", `AcaoRapida A${chave} -> ${next} em ${alvo.subject}`))
                    await processarSelecaoGrupo(chatJid, senderNum, next, { id: alvo.id, subject: alvo.subject, isAdmin: true })
                    return
                }
            }

            if (st && await handleEstado(chatJid, senderNum, st, textRaw, imgInfo, m)) return

            // [v53] DESPACHO ÚNICO DE INTERAÇÕES: o bloco v36 (handleListClick +
            // fallback inline, um SEGUNDO sistema de despacho com lógica própria)
            // foi REMOVIDO — interações fluem EXCLUSIVAMENTE por tratarInteracao
            // (interactionHandler → roteadorAcoes), no return lá em cima.
            // Uma interação = uma execução = uma resposta.

            if (textRaw.includes("/")) {
                try {
                    const { handleFastCommand } = await import("../services/fastParser.js")
                    const handled = await handleFastCommand(chatJid, senderNum, textRaw)
                    if (handled) return
                } catch (e) {
                    console.log(err(`[FAST] erro ${e.message}`))
                }
            }

            const actionText = TEXT_TO_ACTION[textLower]
            if (actionText) {
                console.log(info("COMMAND", `Input="${textRaw}" -> ${actionText} grupo=${isGroup} sender=${senderNum}`))
                await roteadorAcoes(chatJid, senderNum, actionText)
                return
            }

            // [v45] "status" textual removido — Status Manager é a opção 7;
            // status do bot continua em: botstatus / menu 6 > 3 / relatorio
        } catch (e) {
            console.log(err(`Handler erro: ${e.message}\n${e.stack}`))
        }
    })
}

```

### features/flood/config.js — 288 linhas (14.0 KB)

```js
// features/flood/config.js
// [SHOPPING] Registro de TIPO/PRESET de conteúdo do flood SYZYGY.
//
// IMPORTANTE (arquitetura): isto NÃO é um segundo flood. Não há fila, timer,
// lote, throttle, permissões ou executor aqui. O laço real continua sendo
// executarFlood()/executarFloodLote() em services/groupService.js — shopping é
// apenas um CONTEÚDO que o laço existente envia via defaultSend (engine.js).
//
// FONTE DA VERDADE: @lucasmod/boruto-vk7-baileys@2.1.0 (verificado com npm pack,
// 2026-09-16), arquivos:
//   • lib/Utils/messages.js  → generateWAMessageContent
//   • WAProto/E2E/E2E.proto  → Message.InteractiveMessage.ShopMessage
// Nenhum campo é inventado: o que o adapter monta é exatamente o atalho que o
// fork sabe ler.

import { CONFIG, MAX_FLOOD } from "../../utils/config.js"
import { SHOPPING_PRESETS, SHOPPING_PRESET_TEST } from "./presets/shopping.js"
import { getCustomPreset, listCustomPresets } from "./customStore.js"

// ─── Limite de caracteres do payload de send ────────────────────────────────
// Validamos ANTES de enviar. Não truncamos em silêncio: conteúdo cortado sem
// aviso é o tipo de bug que faz "o envio funcionar" e o card sair errado.
export const SHOPPING_LIMITS = {
    body: 2048,      // → interactiveMessage.body.text
    title: 100,      // → header.title
    subtitle: 100,   // → header.subtitle
    footer: 100,     // → footer.text
    shopId: 512      // → shopStorefrontMessage.id
}

// ─── Superfícies que EXISTEM no proto deste fork ────────────────────────────
//   message ShopMessage {
//     optional string id = 1;
//     optional Surface surface = 2;
//     optional int32 messageVersion = 3;
//     enum Surface { UNKNOWN_SURFACE=0; FB=1; IG=2; WA=3; }
//   }
// O README do fork documenta `surface: 1, // 2 | 3 | 4`, mas 4 NÃO existe no
// enum. E o protobufjs gerado NÃO valida enum no fromObject (o `default:` aceita
// qualquer número) — então surface 4 é codificado no wire tal como veio e o app
// do destinatário não decodifica: notificação "mensagem indisponível" + tela
// "sua versão do WhatsApp não é compatível / Atualizar", sem atualização existir.
// É um dos sintomas que este adapter elimina.
export const SURFACE_VALID = [1, 2, 3]
export const SURFACE_NAMES = { 1: "FB", 2: "IG", 3: "WA" }
export const SURFACE_TOKENS = { fb: 1, ig: 2, wa: 3 }

// 4 aparece no README; no proto equivale, na prática de catálogo WA, a 3 (WA).
// Decisão do projeto: MAPEAR 4 → 3 com aviso explícito (nunca enviar 4).
export const SURFACE_README_ALIAS = { 4: 3 }

export const SURFACE_INVALID_HINT =
    "use 1 (FB), 2 (IG) ou 3 (WA). O valor 4 do README do fork não existe no proto deste pacote."

// Nomes de tipos aceitos como conteúdo do flood. "text" = flood clássico.
export const FLOOD_CONTENT_KINDS = ["text", "shopping"]

// ─── Defaults do tipo shopping ──────────────────────────────────────────────
// viewOnce: false por padrão. Motivo: em lib/Utils/messages.js (~1631)
//   else if ('viewOnce' in message && !!message.viewOnce) { m = { viewOnceMessage: { message: m } } }
// ou seja, QUALQUER viewOnce verdadeiro coloca o interactiveMessage DENTRO de um
// viewOnceMessage. Tipo de visualização única com card de loja dentro não é
// decodificado pelo app comum — é literalmente "mensagem indisponível".
// A chave é OMITIDA quando não é true (não mandamos viewOnce: false).
export const SHOPPING_DEFAULTS = {
    title: "",
    subtitle: "",
    footer: "",
    surface: 1,
    viewOnce: false
}

// ─── [INFRA FLOOD] Tipos de preset aceitos pelo registry ────────────────────
// "shopping" é o TIPO já existente no AB7; os outros vieram da arena 01a0aaae.
export const FLOOD_PRESET_TYPES = ["text", "mention", "media", "payment", "shopping", "custom"]

// ─── Hard caps do sistema de TESTE CONTROLADO ───────────────────────────────
// Nada de preset (nem overlay, nem custom, nem config.json) passa disto.
// É o que impede o "sistema de presets" de virar ferramenta de massa:
// teto de mensagens, intervalo mínimo, concorrência, cooldown, timeout e retry.
export const FLOOD_PRESET_HARD_CAP = {
    maxMessages: 10,
    minInterval: 1000,
    maxConcurrency: 2,
    minCooldown: 5000,
    minTimeout: 3000,
    maxTimeout: 30000,
    maxRetries: 2
}

// ─── Presets gerais (recuperados da arena 01a0aaae, limites idênticos) ──────
export const FLOOD_GENERAL_PRESETS = {
    "text-test": {
        id: "text-test", type: "text", text: "SYZYGY text-test", targetMode: "selected",
        maxMessages: 3, interval: 2000, concurrency: 1, cooldown: 15000, timeout: 15000
    },
    "mention-test": {
        id: "mention-test", type: "mention", text: "SYZYGY mention-test", targetMode: "selected",
        maxMessages: 2, interval: 2500, concurrency: 1, cooldown: 20000, timeout: 15000
    },
    "media-test": {
        id: "media-test", type: "media", caption: "SYZYGY media-test", targetMode: "selected",
        maxMessages: 2, interval: 3000, concurrency: 1, cooldown: 20000, timeout: 20000
    },
    "payment-test": {
        id: "payment-test", type: "payment", text: "Pagamento de teste", amount: 25.9, currency: "BRL",
        targetMode: "selected", maxMessages: 3, interval: 3000, concurrency: 1, cooldown: 30000, timeout: 15000
    }
}

// Defaults de runtime para o preset de loja (o AB7 não os tinha porque o laço do
// flood clássico é quem manda no ritmo; aqui eles viram cooldown/teto do job).
export const SHOPPING_PRESET_RUNTIME = {
    targetMode: "selected", maxMessages: 3, interval: 3000, concurrency: 1, cooldown: 30000, timeout: 15000
}

// ─── Presets registrados ────────────────────────────────────────────────────
// FLOOD_PRESETS continua sendo a tabela que o wizard da loja lê (getFloodPreset),
// agora ALSO com os presets gerais. Os de shopping mantêm o MESMO objeto: nada do
// contrato (viewOnce/surface/delivery) foi reescrito aqui.
export const FLOOD_PRESETS = { ...FLOOD_GENERAL_PRESETS }
for (const p of SHOPPING_PRESETS) FLOOD_PRESETS[p.id] = p

export const DEFAULT_SHOPPING_PRESET_ID = SHOPPING_PRESET_TEST.id
export const DEFAULT_FLOOD_PRESET_ID = "text-test"

export function getFloodPreset(id) {
    if (!id) return null
    return FLOOD_PRESETS[String(id).trim()] || null
}

export function listShoppingPresets() {
    return Object.values(FLOOD_PRESETS).filter(p => p.type === "shopping")
}

export function listShoppingPresetsTexto() {
    const l = listShoppingPresets()
    if (!l.length) return "_(nenhum preset shopping cadastrado)_"
    return l
        .map(p => `  *${p.id}* · ${p.label || p.title || "shop"} — surface ${p.shop?.surface} · viewOnce ${p.viewOnce === true ? "SIM" : "não"}`)
        .join("\n")
}

// ─── Entrega do card: "puro" vs "flow" (A/B com evidência no proto) ─────────
// Os DOIS modos produzem interactiveMessage.shopStorefrontMessage { surface, id }
// a partir do atalho { shop } — nunca proto cru, nunca payment.
//
//   puro → ramo `else if ('shop' in message && !!message.shop)` (messages.js
//          messages.js:1020). Gera o card SEM `messageVersion`.
//   flow → ramo `interactiveButtons/nativeFlow + message.shop`. No fork ANTIGO
//          (innovatorssoft 7.4.7, ~1306) esse ramo combinado era o ÚNICO que
//          setava `shopStorefrontMessage.messageVersion = 1`. No fork DESTE build
//          (@lucasmod 2.1.0) NÃO há ramo combinado: `interactiveButtons` (:973)
//          monta só nativeFlowMessage e `shop` (:1020) é `else if` exclusivo, e
//          nenhum dos dois toca em messageVersion ⇒ flow produz o MESMO wire do que
//          puro (o nativeFlow do payload é ignorado) e o card continua íntegro.
//          O modo flow ficou como opção histórica/diagnóstico, não como requisito.
//          Exige um nativeFlowMessage válido junto (é o envelope que os menus
//          deste repo já usam e que, segundo os comentários de
//          services/interactiveService.js, é o que renderiza no app real).
//
// Evidência (gerada com o pacote real, 2026-09-16): shop puro → mv:null;
// flow → mv:1. Se o app do destinatário só aceita a VITRINE versionada, "puro"
// é exatamente o que cai em "mensagem indisponível" mesmo com payload limpo.
// Padrão conservador: "puro" (contrato do README do fork). Use loja:flow: para
// testar o outro sem mexer em código.
export const SHOPPING_DELIVERY = { PURE: "puro", FLOW: "flow" }
export const SHOPPING_DELIVERY_DEFAULT = SHOPPING_DELIVERY.PURE
export const SHOPPING_FLOW_BUTTON = {
    name: "cta_url",
    label: "Ver catálogo",
    // buttonParamsJson do atalho cta_url (ramo nativeFlow do fork)
    build(url) {
        return JSON.stringify({ display_text: this.label, url, mobile_url: url, webview_url: url })
    }
}

// ════════════════════════════════════════════════════════════════════════════
// [INFRA FLOOD · parte geral recuperada da arena 01a0aaae]
// Tudo abaixo é CONFIGURAÇÃO/VALIDAÇÃO: sem socket, sem envio, sem fila.
// ════════════════════════════════════════════════════════════════════════════

function clampInt(n, min, max, fallback) {
    const v = Number(n)
    if (!Number.isFinite(v)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(v)))
}

/**
 * Runtime do flood de presets, lido do CONFIG do projeto (utils/config.js).
 * Defaults são CONSERVADORES por desenho:
 *   • dryRun: ligado enquanto o operador não desligar de propósito;
 *   • testMode: ligado por padrão (payment/shopping só rodam em modo de teste);
 *   • maxRetries/timeoutMs: clampados pelo hard cap — config não afrouxa teto.
 */
export function getFloodRuntimeConfig() {
    return {
        killSwitch: CONFIG.floodKillSwitch === true,
        dryRun: CONFIG.floodDryRun !== false,
        testMode: CONFIG.floodTestMode !== false,
        allowlist: Array.isArray(CONFIG.floodAllowlist) ? [...CONFIG.floodAllowlist] : [],
        maxRetries: clampInt(CONFIG.floodMaxRetries, 0, FLOOD_PRESET_HARD_CAP.maxRetries, 1),
        timeoutMs: clampInt(CONFIG.floodTimeoutMs, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    }
}

/**
 * Definição crua de um preset: built-in (geral ou shopping) ou custom.
 * O overlay do wizard é aplicado depois, em loadPreset (que clampa).
 */
export function getPresetDef(id) {
    if (!id) return null
    const key = String(id).trim().toLowerCase()
    if (FLOOD_PRESETS[key]) {
        const base = { ...FLOOD_PRESETS[key] }
        // preset de loja não carrega limites (é arquivo de dados) → aplica os defaults
        if (base.type === "shopping") base.maxMessages = base.maxMessages ?? SHOPPING_PRESET_RUNTIME.maxMessages
        return base.type === "shopping" ? { ...SHOPPING_PRESET_RUNTIME, ...base } : base
    }
    const custom = getCustomPreset(key)
    if (!custom) return null
    return {
        id: custom.id,
        type: custom.type || "payment",
        customType: custom.customType,
        text: custom.text,
        amount: custom.amount,
        currency: custom.currency,
        caption: custom.caption,
        title: custom.title,
        subtitle: custom.subtitle,
        footer: custom.footer,
        shop: custom.shop,
        viewOnce: custom.viewOnce,
        delivery: custom.delivery,
        format: custom.format,
        mentions: Array.isArray(custom.mentions) ? [...custom.mentions] : undefined,
        // mídia/atalhos conhecidos do fork (o builder do tipo decide o que usar)
        image: custom.image,
        video: custom.video,
        document: custom.document,
        location: custom.location,
        product: custom.product,
        mimetype: custom.mimetype,
        targetMode: "selected",
        maxMessages: 10,
        interval: 3000,
        concurrency: 1,
        cooldown: 5000,
        timeout: 15000,
        modo: custom.modo
    }
}

export function listPresetIds() {
    const ids = Object.keys(FLOOD_PRESETS)
    for (const p of listCustomPresets()) {
        if (p && p.id && !ids.includes(p.id)) ids.push(p.id)
    }
    return ids
}

/**
 * ÚNICO ponto que aplica os tetos. Preset nenhum (nem custom, nem overlay, nem
 * config.json) consegue maxMessages/intervalo/concorrência/cooldown/timeout
 * fora de FLOOD_PRESET_HARD_CAP — é isto que mantém o sistema de presets como
 * teste controlado em vez de disparo de massa.
 */
export function clampPresetLimits(preset) {
    const src = preset && typeof preset === "object" ? preset : {}
    const maxMessages = clampInt(src.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const interval = clampInt(src.interval, FLOOD_PRESET_HARD_CAP.minInterval, 60000, 3000)
    const concurrency = clampInt(src.concurrency, 1, FLOOD_PRESET_HARD_CAP.maxConcurrency, 1)
    const cooldown = clampInt(src.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, 300000, 30000)
    const timeout = clampInt(src.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    return { ...src, maxMessages, interval, concurrency, cooldown, timeout }
}

/** Limite de mensagens por alvo de um job (hard cap ∧ MAX_FLOOD do projeto). */
export function clampJobQtd(qtd, preset = {}) {
    const wanted = clampInt(qtd, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 1)
    const perPreset = clampInt(preset.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const classic = Number.isFinite(MAX_FLOOD) ? MAX_FLOOD : FLOOD_PRESET_HARD_CAP.maxMessages
    return Math.max(1, Math.min(wanted, perPreset, classic))
}

export { FLOOD_PRESET_HARD_CAP as PRESET_HARD_CAP }

```

### features/flood/engine.js — 152 linhas (7.9 KB)

```js
// features/flood/engine.js
// [SHOPPING] Camada de ENVIO do conteúdo do flood. Continua sendo UM envio só:
// `sock.sendMessage(jid, content)`. Este módulo NÃO cria fila, timer, lote,
// throttle, permissões nem "executor de loja" — quem chama é o executarFlood
// existente (services/groupService.js), que passa a poder receber um builder de
// conteúdo por iteração.
//
// O que o engine garante:
//  • quando o conteúdo tem `shop`, o objeto enviado contém SOMENTE as chaves
//    que o atalho do fork lê ({ text, title, subtitle, footer, shop:{surface,id},
//    viewOnce? } + mentions/linkPreview opcionais) — sem chave undefined, sem
//    hasMediaAttachment, sem proto cru, sem payment;
//  • surface fora de 1..3 NUNCA sai (a última porteira é aqui, mesmo que o
//    conteúdo tenha sido montado fora do adapter);
//  • viewOnce só existe se for true explicitamente (sem wrap = sem
//    "mensagem indisponível").

import { SURFACE_VALID, SHOPPING_LIMITS, SURFACE_README_ALIAS } from "./config.js"
import { isShoppingContent, SHOPPING_ERROR, ShoppingPayloadError } from "./shopping.js"

/** Chaves aceitas no atalho de send do shopping (nenhuma é inventada: todas são
 *  lidas por generateWAMessageContent no ramo 'shop'/'text' do fork 7.4.7). */
export const SHOP_SEND_KEYS = ["text", "title", "subtitle", "footer", "shop", "nativeFlow", "viewOnce", "mentions", "linkPreview"]

export { isShoppingContent }

/**
 * Filtra/valida o conteúdo ANTES de ir para o socket.
 * Conteúdo de shop → objeto limpo do contrato. Conteúdo comum (flood clássico)
 * → passado sem alteração de comportamento.
 */
export function buildSendContent(content = {}) {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SRC_INVALID, "conteúdo de send inválido.")
    }

    // Porteiras duras, inclusive para conteúdo montado por fora do adapter.
    if (content.payment !== undefined || content.requestPaymentMessage !== undefined) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.PAYMENT_NOT_ALLOWED,
            "engine de shopping não envia payment; o fluxo de pagamento tem caminho próprio.")
    }
    if (!isShoppingContent(content)) return { ...content }

    for (const k of ["interactiveMessage", "shopStorefrontMessage", "viewOnceMessage", "viewOnceV2", "hasMediaAttachment"]) {
        if (content[k] !== undefined) {
            throw new ShoppingPayloadError(SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED,
                `shopping: '${k}' é proto cru/wrap — o contrato é o atalho { text, shop:{surface,id} }.`)
        }
    }

    const text = typeof content.text === "string" ? content.text : ""
    if (!text) throw new ShoppingPayloadError(SHOPPING_ERROR.TEXT_REQUIRED, "shopping precisa de 'text' no conteúdo de send.")
    if (text.length > SHOPPING_LIMITS.body) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.TEXT_TOO_LONG, `corpo do shopping tem ${text.length} caracteres (máx ${SHOPPING_LIMITS.body}).`)
    }

    const out = { text }

    for (const k of ["title", "subtitle", "footer"]) {
        const v = content[k]
        if (typeof v === "string" && v.trim()) out[k] = v
    }

    const surface = content.shop && content.shop.surface
    const id = content.shop && content.shop.id
    if (typeof id !== "string" || !id.trim()) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_ID_REQUIRED, "shopping precisa de shop.id no conteúdo de send.")
    }
    if (!Number.isInteger(surface) || !SURFACE_VALID.includes(surface)) {
        const alias = SURFACE_README_ALIAS[surface]
        throw new ShoppingPayloadError(SHOPPING_ERROR.SURFACE_INVALID,
            `surface ${JSON.stringify(surface)} não pode ser enviado (só 1=FB, 2=IG, 3=WA${alias ? `; o 4 do README é normalizado pelo adapter para ${alias}` : ""}).`)
    }
    out.shop = { surface, id }

    // nativeFlow SÓ é aceito como envelope do modo flow (ramo do fork que seta
    // shopStorefrontMessage.messageVersion = 1). Fora disso o adapter já recusa.
    if (Array.isArray(content.nativeFlow) && content.nativeFlow.length) {
        out.nativeFlow = content.nativeFlow.map((b, i) => {
            if (!b || typeof b.name !== "string" || !b.name.trim()) {
                throw new ShoppingPayloadError(SHOPPING_ERROR.NATIVEFLOW_INVALID, `nativeFlow[${i}].name inválido.`)
            }
            const json = typeof b.buttonParamsJson === "string" ? b.buttonParamsJson : "{}"
            try { JSON.parse(json) } catch {
                throw new ShoppingPayloadError(SHOPPING_ERROR.NATIVEFLOW_INVALID, `nativeFlow[${i}].buttonParamsJson precisa ser JSON (o cliente faz parse).`)
            }
            return { name: b.name.trim(), buttonParamsJson: json }
        })
    }

    if (content.viewOnce === true) out.viewOnce = true
    if (Array.isArray(content.mentions) && content.mentions.length) out.mentions = content.mentions
    // linkPreview:false é campo real do ramo 'text' do fork; como o resultado do
    // preview é DESCARTADO pelo ramo shop, desligar evita um fetch de URL por
    // mensagem de flood. Só entra quando explicitamente false.
    if (content.linkPreview === false) out.linkPreview = false

    return out
}

/** Envio único, sem fila: o que o flood já fazia, com o filtro acima no meio. */
export async function defaultSend(sock, jid, content, opts = {}) {
    const payload = buildSendContent(content)
    return sock.sendMessage(jid, payload, opts)
}

/**
 * Builder de conteúdo POR ITERAÇÃO do executarFlood.
 * O flood clássico continua `{ text: corpo }`. Com conteúdo de shop, cada
 * iteração leva o mesmo card com o corpo já incrementado pelo flood (os
 * \u200b de unicidade são PRESERVADOS de propósito — re-normalizar aqui
 * deixaria todas as mensagens idênticas).
 */
export function makeFloodContentBuilder(baseContent) {
    if (!baseContent || typeof baseContent !== "object") return null
    const shop = isShoppingContent(baseContent)
    const base = shop
        ? { ...baseContent, shop: { surface: baseContent.shop.surface, id: baseContent.shop.id } }
        : { ...baseContent }

    return (ctx = {}) => {
        const body = typeof ctx.body === "string" && ctx.body.length ? ctx.body : (typeof ctx === "string" ? ctx : base.text)
        const t = typeof body === "string" ? body : base.text
        // Corpo acima do limite do card → volta para o corpo válido do preset
        // (NUNCA truncar na faca: truncar dentro do loop do proto é como nasce
        // mensagem que o cliente não decodifica).
        const safeText = t && t.length <= SHOPPING_LIMITS.body ? t : String(base.text || "").slice(0, SHOPPING_LIMITS.body)
        if (!shop) return buildSendContent({ ...base, text: safeText })

        const out = { text: safeText }
        for (const k of ["title", "subtitle", "footer"]) {
            if (typeof base[k] === "string" && base[k].trim()) out[k] = base[k]
        }
        out.shop = { surface: base.shop.surface, id: base.shop.id }
        if (Array.isArray(base.nativeFlow) && base.nativeFlow.length) out.nativeFlow = base.nativeFlow
        if (base.viewOnce === true) out.viewOnce = true
        if (base.linkPreview === false) out.linkPreview = false
        // MESMA porteira do envio pontual: o laço do flood nunca leva conteúdo
        // não validado para o socket.
        return buildSendContent(out)
    }
}

/** O que de fato vai no wire (log do terminal / confirmação do wizard). */
export function describeSendWire(content) {
    const c = buildSendContent(content)
    const keys = Object.keys(c).sort()
    if (!isShoppingContent(c)) return `type: text · chaves: ${keys.join(", ")}`
    const flow = Array.isArray(c.nativeFlow) && c.nativeFlow.length
    return `type: interactiveMessage.shopStorefrontMessage${flow ? " + nativeFlowMessage (messageVersion:1)" : " (shop puro)"} · chaves: ${keys.join(", ")} · surface=${c.shop.surface} · viewOnce=${c.viewOnce === true ? "SIM" : "omitido"}`
}

```

### features/flood/shopping.js — 374 linhas (19.3 KB)

```js
// features/flood/shopping.js
// ADAPTER shopping — camada PURA (sem socket, sem fs, sem fila, sem timer).
// Responsabilidade única: transformar o que o dono digitou/salvou no flood em
// UM objeto de conteúdo que o atalho `sock.sendMessage(jid, content)` do fork
// @lucasmod/boruto-vk7-baileys@2.1.0 sabe converter em
//   interactiveMessage.shopStorefrontMessage { surface, id }
// e nada além disso.
//
// ── O que este adapter CORRIGE (fatos verificados no pacote empacotado) ──
// 1) viewOnce. O padrão antigo (`viewOnce = src.viewOnce !== false`) deixava
//    viewOnce SEMPRE true → o fork embrulha em viewOnceMessage { interactiveMessage }
//    (lib/Utils/messages.js ~1631: `else if ('viewOnce' in message && !!message.viewOnce)`).
//    O app do destinatário não decodifica: "mensagem indisponível" + "sua versão
//    do WhatsApp não é compatível". Agora: a chave só existe quando o operador
//    pede true EXPLICITAMENTE; caso contrário é OMITIDA (não enviamos false).
// 2) surface. O proto só conhece 0..3; o README do fork lista 4 e o protobufjs
//    gerado NÃO valida enum no fromObject (há um `default:` que aceita número),
//    então 4 ia cru no wire. Agora: 1..3 passa, 4 é mapeado para 3 (WA) com
//    aviso, qualquer outro valor vira SURFACE_INVALID com mensagem clara.
// 3) header com title/subtitle undefined. No ramo shop, havendo 'text' o fork
//    cria header = { title, subtitle, hasMediaAttachment:false } sempre.
//    Espalhar chave vazia/undefined no conteúdo é o que gera header vazio.
//    Agora: title/subtitle/footer só entram quando são string não vazia, e
//    hasMediaAttachment NUNCA é enviado por nós (decisão do fork).
// 4) messageVersion existe no proto (campo 3) e o ramo nativeFlow+shop o seta
//    com 1, mas o atalho `shop` puro NÃO expõe esse campo. Como não montamos
//    proto na mão (nunca { interactiveMessage: { shopStorefrontMessage } }),
//    NÃO inventamos messageVersion.
//
// Payment: outro proto (requestPaymentMessage) e outro caminho. Este adapter
// RECUSA conteúdo de payment — shopping não é, e não vira, pagamento.

import {
    SHOPPING_LIMITS,
    SHOPPING_DEFAULTS,
    SHOPPING_DELIVERY,
    SHOPPING_DELIVERY_DEFAULT,
    SHOPPING_FLOW_BUTTON,
    SURFACE_VALID,
    SURFACE_NAMES,
    SURFACE_TOKENS,
    SURFACE_README_ALIAS,
    SURFACE_INVALID_HINT
} from "./config.js"

export const SHOPPING_ERROR = {
    SRC_INVALID: "SRC_INVALID",
    TEXT_REQUIRED: "TEXT_REQUIRED",
    TEXT_TOO_LONG: "TEXT_TOO_LONG",
    FIELD_TOO_LONG: "FIELD_TOO_LONG",
    SHOP_INVALID: "SHOP_INVALID",
    SHOP_ID_REQUIRED: "SHOP_ID_REQUIRED",
    SHOP_ID_TOO_LONG: "SHOP_ID_TOO_LONG",
    SHOP_ID_INVALID: "SHOP_ID_INVALID",
    SURFACE_INVALID: "SURFACE_INVALID",
    VIEW_ONCE_INVALID: "VIEW_ONCE_INVALID",
    PAYMENT_NOT_ALLOWED: "PAYMENT_NOT_ALLOWED",
    RAW_PROTO_NOT_ALLOWED: "RAW_PROTO_NOT_ALLOWED",
    MEDIA_NOT_SUPPORTED: "MEDIA_NOT_SUPPORTED",
    DELIVERY_INVALID: "DELIVERY_INVALID",
    NATIVEFLOW_INVALID: "NATIVEFLOW_INVALID"
}

export class ShoppingPayloadError extends Error {
    constructor(code, message, extra = {}) {
        super(message)
        this.name = "ShoppingPayloadError"
        this.code = code
        Object.assign(this, extra)
    }
}

// Campos recusados antes de qualquer coisa: cada um desvia o fork do ramo
// 'shop' puro (payment) ou monta proto cru por fora do atalho.
const FORBIDDEN_KEYS = {
    payment: [SHOPPING_ERROR.PAYMENT_NOT_ALLOWED,
        "shopping não é payment. Pagamento continua { payment:{note,currency,amount,offset,from} } → requestPaymentMessage, caminho separado e intocado."],
    requestPaymentMessage: [SHOPPING_ERROR.PAYMENT_NOT_ALLOWED,
        "não envie proto cru de pagamento; use o caminho de payment existente."],
    interactiveMessage: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED,
        "não monte { interactiveMessage: { shopStorefrontMessage } } na mão — o contrato é o atalho { shop }."],
    shopStorefrontMessage: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED,
        "shopStorefrontMessage é proto cru; o atalho aceito é shop:{surface,id}."],
    viewOnceMessage: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "use a chave viewOnce booleana (ou nada); nunca o wrap cru."],
    viewOnceV2: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "não existe 'viewOnceV2' no contrato do shop — não inventar wrap."],
    viewOnceMessageV2: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "não inventar wrap de visualização única."],
    viewOnceExt: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "não inventar wrap de visualização única."],
    viewOnceV2Extension: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "não inventar wrap de visualização única."],
    hasMediaAttachment: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "no ramo text do shop o próprio fork seta hasMediaAttachment:false."],
    buttons: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "buttons cai em outro ramo do fork; aqui é shop puro."],
    interactiveButtons: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "interactiveButtons+shop é outro ramo (esse sim seta messageVersion:1)."],
    nativeFlow: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "nativeFlow é outro ramo do fork."],
    list: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "list é outro ramo do fork."],
    sections: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "sections é outro ramo do fork."],
    cards: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "cards é outro ramo do fork."],
    productList: [SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "productList é outro ramo do fork."]
}

// Mídia + shop cai no OUTRO ramo do fork (o `else` com caption, que faz
// Object.assign(interactiveMessage, m) e depende de upload). Este adapter é o
// formato "text"; mídia no shopping fica para fora do contrato.
const MEDIA_KEYS = ["image", "video", "audio", "ptt", "sticker", "document", "location", "contact", "contacts", "poll", "product", "order", "reaction", "react"]

// Invisíveis de "Ler mais"/colagem. 6+ seguidos = entulho, não formatação.
const INVISIBLE_RUN = /[\u200B\u200C\u200D\u2060\u034F\uFEFF]{6,}/g
const INVISIBLE_ANY = /[\u200B\u200C\u200D\u2060\u034F\uFEFF]/

export function isFilledString(v) {
    return typeof v === "string" && v.trim() !== ""
}

/** Campo opcional: devolve a string limpa ou undefined (a chave NÃO vai no
 *  payload quando vazia — nunca undefined espalhado no objeto enviado). */
export function cleanOptionalField(value, max, label, code = SHOPPING_ERROR.FIELD_TOO_LONG) {
    if (value === undefined || value === null) return undefined
    if (typeof value !== "string") {
        throw new ShoppingPayloadError(code, `${label} precisa ser texto (recebido: ${typeof value}).`)
    }
    const t = value.replace(INVISIBLE_RUN, "").replace(/\s+/g, " ").trim()
    if (!t) return undefined
    if (t.length > max) {
        throw new ShoppingPayloadError(code, `${label} tem ${t.length} caracteres (máx ${max}). Encurte.`)
    }
    return t
}

/**
 * Normaliza `surface` para o que EXISTE no proto deste fork.
 * @returns {{surface:number|null, mapped:boolean, warning:string|null}}
 *   surface === null → não veio valor (o chamador aplica o default).
 */
export function normalizeSurface(raw) {
    if (raw === undefined || raw === null) return { surface: null, mapped: false, warning: null }
    if (typeof raw === "string" && raw.trim() === "") return { surface: null, mapped: false, warning: null }

    let n = NaN
    if (typeof raw === "number") n = raw
    else if (typeof raw === "string") {
        const t = raw.trim().toLowerCase()
        if (Object.prototype.hasOwnProperty.call(SURFACE_TOKENS, t)) n = SURFACE_TOKENS[t]
        else if (/^\d+$/.test(t)) n = parseInt(t, 10)
    }
    if (!Number.isInteger(n)) {
        throw new ShoppingPayloadError(
            SHOPPING_ERROR.SURFACE_INVALID,
            `surface inválido: ${JSON.stringify(raw)}. ${SURFACE_INVALID_HINT}`
        )
    }
    if (SURFACE_VALID.includes(n)) return { surface: n, mapped: false, warning: null }

    const alias = SURFACE_README_ALIAS[n]
    if (alias) {
        return {
            surface: alias,
            mapped: true,
            warning: `surface ${n} só existe no README do fork, não no proto (ShopMessage.Surface = 0..3) — enviado como ${alias} (${SURFACE_NAMES[alias]}).`
        }
    }
    throw new ShoppingPayloadError(
        SHOPPING_ERROR.SURFACE_INVALID,
        `surface ${n} não existe no proto deste pacote (1=FB, 2=IG, 3=WA; 0 é UNKNOWN_SURFACE e não renderiza nada). ${SURFACE_INVALID_HINT}`
    )
}

/**
 * Modo de entrega do card. Os DOIS usam o atalho { shop } e produzem
 * interactiveMessage.shopStorefrontMessage; a diferença é que 'flow' cai no ramo
 * nativeFlow+shop do fork, o único que seta shopStorefrontMessage.messageVersion = 1.
 */
export function normalizeDelivery(raw) {
    if (raw === undefined || raw === null || raw === "") return SHOPPING_DELIVERY_DEFAULT
    const t = String(raw).trim().toLowerCase()
    if (t === SHOPPING_DELIVERY.PURE || t === "pure" || t === "puro") return SHOPPING_DELIVERY.PURE
    if (t === SHOPPING_DELIVERY.FLOW || t === "flow" || t === "nativo") return SHOPPING_DELIVERY.FLOW
    throw new ShoppingPayloadError(
        SHOPPING_ERROR.DELIVERY_INVALID,
        `modo de entrega '${raw}' inválido. Use '${SHOPPING_DELIVERY.PURE}' (shop puro) ou '${SHOPPING_DELIVERY.FLOW}' (shop + nativeFlow, com messageVersion:1).`
    )
}

function normalizeFlowButtons(raw, shopId, warnings) {
    if (Array.isArray(raw) && raw.length) {
        return raw.map((b, i) => {
            if (!b || typeof b.name !== "string" || !b.name.trim()) {
                throw new ShoppingPayloadError(SHOPPING_ERROR.NATIVEFLOW_INVALID, `nativeFlow[${i}].name é obrigatório (ex.: 'cta_url', 'quick_reply').`)
            }
            const json = typeof b.buttonParamsJson === "string" ? b.buttonParamsJson : JSON.stringify(b.params || {})
            try {
                JSON.parse(json)
            } catch {
                // O cliente parseia isso como JSON; string inválida = flow quebrado
                // (é o mesmo tipo de erro que messageParamsJson:"" causa no menu).
                throw new ShoppingPayloadError(SHOPPING_ERROR.NATIVEFLOW_INVALID, `nativeFlow[${i}].buttonParamsJson precisa ser JSON válido.`)
            }
            return { name: b.name.trim(), buttonParamsJson: json }
        })
    }
    if (!/^https?:\/\//i.test(shopId || "")) {
        warnings.push("modo flow sem shop.id http(s): botão cta_url sem URL não abre nada — prefira o modo puro ou informe uma URL.")
    }
    return [{ name: SHOPPING_FLOW_BUTTON.name, buttonParamsJson: SHOPPING_FLOW_BUTTON.build(shopId || "") }]
}

function normalizeShopId(raw) {
    if (raw === undefined || raw === null) return null
    if (typeof raw !== "string") {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_INVALID, "shop.id precisa ser texto (URL/id do catálogo).")
    }
    const t = raw.replace(/[\r\n]+/g, " ").trim()
    if (!t) return null
    if (t.includes("|")) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_ID_INVALID, "shop.id não pode conter '|' (é o separador do overlay do wizard).")
    }
    if (INVISIBLE_ANY.test(t)) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_ID_INVALID, "shop.id tem caracteres invisíveis (colado de mensagem com 'Ler mais'). Cole a URL limpa.")
    }
    if (t.length > SHOPPING_LIMITS.shopId) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_ID_TOO_LONG, `shop.id tem ${t.length} caracteres (máx ${SHOPPING_LIMITS.shopId}).`)
    }
    return t
}

/**
 * Monta o conteúdo de send do shopping (o objeto que vai em sock.sendMessage).
 * @param {object} src  { text, title, subtitle, footer, shop:{surface,id}, viewOnce }
 * @param {object} [opts] { defaults } — defaults (preset) para campos omitidos
 * @returns {{content:object, warnings:string[], meta:object}}
 */
export function createShoppingPayload(src = {}, opts = {}) {
    const warnings = []
    if (src === null || typeof src !== "object" || Array.isArray(src)) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SRC_INVALID, "conteúdo shopping precisa ser um objeto.")
    }

    const defaults0 = opts.defaults && typeof opts.defaults === "object" ? opts.defaults : {}
    const delivery = normalizeDelivery(src.delivery !== undefined ? src.delivery : defaults0.delivery)
    const flow = delivery === SHOPPING_DELIVERY.FLOW

    // 1) Recusas duras.
    for (const key of Object.keys(src)) {
        // No modo flow o nativeFlow é o ENVELOPE exigido pelo ramo que seta
        // messageVersion:1 — ali ele é permitido (e só ali).
        if (flow && (key === "nativeFlow" || key === "interactiveButtons") && src[key]) continue
        const forbid = FORBIDDEN_KEYS[key]
        if (forbid && src[key] !== undefined && src[key] !== null) {
            throw new ShoppingPayloadError(forbid[0], `shopping: campo '${key}' não é permitido. ${forbid[1]}`)
        }
        if (MEDIA_KEYS.includes(key) && src[key] !== undefined && src[key] !== null) {
            throw new ShoppingPayloadError(
                SHOPPING_ERROR.MEDIA_NOT_SUPPORTED,
                `shopping aqui é o formato text ({ text, title, subtitle, footer, shop }); '${key}' mudaria de ramo no fork e não é suportado por este adapter.`
            )
        }
    }

    const defaults = opts.defaults && typeof opts.defaults === "object" ? opts.defaults : {}
    const pick = (name) => (src[name] !== undefined ? src[name] : defaults[name])

    // 2) viewOnce: SÓ quando true explícito. false/null/undefined → chave omitida.
    const voRaw = pick("viewOnce")
    if (voRaw !== undefined && voRaw !== null && typeof voRaw !== "boolean") {
        throw new ShoppingPayloadError(SHOPPING_ERROR.VIEW_ONCE_INVALID, "viewOnce do shopping só aceita true ou false (o wrap é decisão do fork).")
    }
    const viewOnce = voRaw === true

    // 3) Corpo. Entulho invisível é removido e o corpo vira UMA linha: o hook
    //    global de Ler Mais (connection/socket.js → aplicarLerMais) expande
    //    QUALQUER content.text multi-linha para ~4000 U+034F, e isso não pode
    //    entrar no corpo de um card de loja.
    const rawText = src.text !== undefined && src.text !== null ? src.text : defaults.text
    if (typeof rawText !== "string") {
        throw new ShoppingPayloadError(SHOPPING_ERROR.TEXT_REQUIRED, "shopping precisa de um texto (corpo do card).")
    }
    const text = rawText
        .replace(INVISIBLE_RUN, "")
        .replace(/[\r\n]+/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    if (!text) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.TEXT_REQUIRED, "shopping precisa de um texto não vazio (corpo do card).")
    }
    if (text.length > SHOPPING_LIMITS.body) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.TEXT_TOO_LONG, `corpo do shopping tem ${text.length} caracteres (máx ${SHOPPING_LIMITS.body}).`)
    }
    if (/\n/.test(rawText)) {
        warnings.push("quebras de linha do corpo viraram espaço: evita o hook global de 'Ler Mais' (4000 U+034F) dentro do card.")
    }

    // 4) Header/footer SÓ quando existem.
    const title = cleanOptionalField(pick("title"), SHOPPING_LIMITS.title, "título do card")
    const subtitle = cleanOptionalField(pick("subtitle"), SHOPPING_LIMITS.subtitle, "subtítulo do card")
    const footer = cleanOptionalField(pick("footer"), SHOPPING_LIMITS.footer, "rodapé do card")
    if (title && subtitle && title === subtitle) {
        warnings.push("título e subtítulo idênticos no card de loja.")
    }

    // 5) shop = { surface, id } — exatamente as duas chaves que o fork lê.
    const shopRaw = src.shop !== undefined && src.shop !== null ? src.shop : (defaults.shop || {})
    if (typeof shopRaw !== "object" || Array.isArray(shopRaw)) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_INVALID, "shop precisa ser { surface, id }.")
    }
    const surf = normalizeSurface(
        shopRaw.surface !== undefined
            ? shopRaw.surface
            : (defaults.shop && defaults.shop.surface !== undefined ? defaults.shop.surface : defaults.surface)
    )
    let surface = surf.surface
    if (surface === null) {
        surface = SHOPPING_DEFAULTS.surface
        warnings.push(`surface não informado → default ${surface} (${SURFACE_NAMES[surface]}).`)
    }
    if (surf.warning) warnings.push(surf.warning)

    const hasOwnId = shopRaw.id !== undefined && shopRaw.id !== null && String(shopRaw.id).trim() !== ""
    const id = normalizeShopId(hasOwnId ? shopRaw.id : (defaults.shop && defaults.shop.id))
    if (!id) {
        throw new ShoppingPayloadError(SHOPPING_ERROR.SHOP_ID_REQUIRED, "shop.id é obrigatório (URL/id do catálogo).")
    }
    for (const k of Object.keys(shopRaw)) {
        if (k !== "surface" && k !== "id") warnings.push(`shop.${k} ignorado: o atalho do fork só lê shop.surface e shop.id.`)
    }

    // 6) Payload final: chaves do contrato, nada de undefined.
    const content = { text }
    if (title) content.title = title
    if (subtitle) content.subtitle = subtitle
    if (footer) content.footer = footer
    content.shop = { surface, id }
    if (flow) content.nativeFlow = normalizeFlowButtons(Array.isArray(src.nativeFlow) ? src.nativeFlow : null, id, warnings)
    if (viewOnce) content.viewOnce = true

    const meta = {
        kind: "shopping",
        surface,
        surfaceName: SURFACE_NAMES[surface],
        surfaceMappedFrom: surf.mapped
            ? (Object.keys(SURFACE_README_ALIAS).find(k => SURFACE_README_ALIAS[k] === surface) || null)
            : null,
        hasHeader: !!(title || subtitle),
        hasFooter: !!footer,
        delivery,
        messageVersion: flow ? 1 : null,
        viewOnce: content.viewOnce === true,
        shopId: id,
        bodyLength: text.length,
        proto: "interactiveMessage.shopStorefrontMessage { surface, id }"
    }

    return { content, warnings, meta }
}

/** Resumo HONESTO para o prompt da loja — nunca promete card visível. */
export function describeShoppingPayload(content, meta) {
    const m = meta || {}
    const l = []
    l.push(`• tipo: shop puro → ${m.proto || "interactiveMessage.shopStorefrontMessage"}`)
    l.push(`• corpo: ${String(content.text).length} caracteres`)
    if (content.title) l.push(`• título: ${content.title}`)
    if (content.subtitle) l.push(`• subtítulo: ${content.subtitle}`)
    if (content.footer) l.push(`• rodapé: ${content.footer}`)
    l.push(`• surface: ${content.shop.surface} (${SURFACE_NAMES[content.shop.surface] || "?"})`)
    l.push(`• id: ${content.shop.id}`)
    l.push(`• viewOnce: ${content.viewOnce === true ? "SIM → o fork embrulha o card (viewOnceMessage no innovatorssoft, viewOnceMessageV2 no @lucasmod 2.1.0) = risco alto de 'mensagem indisponível'" : "não (sem wrap de visualização única)"}`)
    l.push(`• messageVersion: ${m.delivery === SHOPPING_DELIVERY.FLOW ? "só sai 1 se o fork tiver o ramo combinado nativeFlow+shop — no @lucasmod/boruto-vk7-baileys 2.1.0 ele NÃO existe (shop :1020 e interactiveButtons :973 são else if excludentes), então fica no default do proto e o wire é idêntico ao do modo puro" : "não enviado (ramo shop puro não expõe o campo)"}`)
    l.push(`• entrega: ${m.delivery === SHOPPING_DELIVERY.FLOW ? "flow (nativeFlow + shop)" : "puro (só shop)"}`)
    l.push(`• payment: não (é outro proto, outro caminho)`)
    return l.join("\n")
}

/** Guard do engine: isto é conteúdo de shop? */
export function isShoppingContent(c) {
    return !!c && typeof c === "object" && !!c.shop && typeof c.shop === "object"
}

```

### features/flood/payment.js — 135 linhas (6.0 KB)

```js
// features/flood/payment.js
// [INFRA FLOOD · recuperada da arena 01a0aaae]
// Adaptador da Payment Message REAL do pacote instalado (@lucasmod/boruto-vk7-baileys
// 7.4.7): sock.sendMessage(jid, { payment: PaymentInfo }) → requestPaymentMessage
// { amount1000, currencyCodeIso4217, noteMessage, requestFrom }.
//
// Por que este arquivo está aqui e não no engine de shopping:
// payment é OUTRO proto e OUTRO caminho. O adapter de shopping (shopping.js /
// engine.js do AB7) RECUSA payment de propósito — os dois nunca se misturam.
// O contrato de payload não foi alterado: { payment: { note, currency, amount,
// offset, from } }. Também NÃO existe mais "sendPaymentMessage" aqui: quem envia
// é o laço do flood (safeSendMessage / executarFlood), para não haver um segundo
// sock.sendMessage espalhado pelo sistema.
//
// paymentInvite existe no fork mas NÃO carrega valor/moeda — não é o payload de
// pagamento. Nada aqui é inventado.

const ISO4217 = new Set([
    "BRL", "USD", "EUR", "GBP", "JPY", "ARS", "MXN", "CLP", "COP", "PEN",
    "UYU", "PYG", "BOB", "CAD", "AUD", "CHF", "CNY", "INR", "IDR", "ZAR",
    "KRW", "NZD", "SEK", "NOK", "DKK", "PLN", "TRY", "RUB", "AED", "SAR"
])

export function getPaymentApiInfo() {
    return {
        library: "@lucasmod/boruto-vk7-baileys@2.1.0",
        available: true,
        sendShape: "sock.sendMessage(jid, { payment: { note, currency, amount, offset, from, expiry } })",
        proto: "requestPaymentMessage",
        amountField: "amount1000 = valor * 1000",
        mentions: "via content.mentions → noteMessage.extendedTextMessage.contextInfo.mentionedJid",
        alsoPresent: ["paymentInvite (sem valor — NÃO usado neste preset)"]
    }
}

export function parseAmount(raw) {
    if (raw == null) return { ok: false, error: "AMOUNT_MISSING" }
    let s = String(raw).trim()
    if (!s) return { ok: false, error: "AMOUNT_MISSING" }
    if (/^-/.test(s)) return { ok: false, error: "AMOUNT_NEGATIVE" }
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".")
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: "AMOUNT_INVALID" }
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "AMOUNT_INVALID" }
    if (!Number.isFinite(n * 1000)) return { ok: false, error: "AMOUNT_INVALID" }
    return { ok: true, value: n, amount1000: Math.round(n * 1000), display: n.toFixed(2) }
}

export function parseCurrency(raw) {
    if (raw == null || String(raw).trim() === "") return { ok: false, error: "CURRENCY_MISSING" }
    const code = String(raw).trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) return { ok: false, error: "CURRENCY_INVALID" }
    if (!ISO4217.has(code)) return { ok: false, error: "CURRENCY_UNSUPPORTED" }
    return { ok: true, value: code }
}

export function parsePaymentArgs(raw) {
    const src = String(raw == null ? "" : raw).trim()
    if (!src) {
        return { ok: false, error: "USAGE", usage: usageTexto() }
    }
    const parts = src.split("|").map(s => s.trim())
    if (parts.length < 3) {
        return { ok: false, error: "USAGE", usage: usageTexto() }
    }
    const text = parts[0]
    if (!text) return { ok: false, error: "TEXT_MISSING", usage: usageTexto() }
    const amount = parseAmount(parts[1])
    if (!amount.ok) return { ...amount, usage: usageTexto() }
    const currency = parseCurrency(parts[2])
    if (!currency.ok) return { ...currency, usage: usageTexto() }
    return createPaymentPayload({ text, amount: amount.value, currency: currency.value })
}

export function createPaymentPayload({ text, amount, currency } = {}) {
    const note = String(text == null ? "" : text).trim()
    if (!note) return { ok: false, error: "TEXT_MISSING", usage: usageTexto() }
    const amt = typeof amount === "object" && amount && amount.ok ? amount : parseAmount(amount)
    if (!amt.ok) return { ...amt, usage: usageTexto() }
    const cur = typeof currency === "object" && currency && currency.ok ? currency : parseCurrency(currency)
    if (!cur.ok) return { ...cur, usage: usageTexto() }
    return {
        ok: true,
        text: note,
        amount: amt.value,
        amount1000: amt.amount1000,
        currency: cur.value,
        display: `${amt.display} ${cur.value}`,
        content: {
            note,
            currency: cur.value,
            amount: amt.amount1000,
            offset: 0
        }
    }
}

export function usageTexto() {
    return "Uso: texto|valor|moeda\nExemplo: Pagamento do pedido|25.90|BRL"
}

export function formatPaymentError(code) {
    const map = {
        USAGE: usageTexto(),
        TEXT_MISSING: `Texto obrigatório.\n${usageTexto()}`,
        AMOUNT_MISSING: `Valor obrigatório.\n${usageTexto()}`,
        AMOUNT_INVALID: `Valor inválido. Use 10, 10.5, 10.50, 1000.99 — sem negativo/NaN.\n${usageTexto()}`,
        AMOUNT_NEGATIVE: `Valor não pode ser negativo.\n${usageTexto()}`,
        CURRENCY_MISSING: `Moeda obrigatória (BRL, USD, EUR...).\n${usageTexto()}`,
        CURRENCY_INVALID: `Moeda inválida. Use código ISO de 3 letras (ex: BRL).\n${usageTexto()}`,
        CURRENCY_UNSUPPORTED: `Moeda não suportada neste teste.\n${usageTexto()}`,
        PAYMENT_UNAVAILABLE: "Payment Message indisponível nesta versão do Baileys.",
        PAYMENT_TEST_DISABLED: "payment-test só funciona com floodTestMode ligado."
    }
    return map[code] || `Erro de pagamento: ${code}\n${usageTexto()}`
}

export function buildPaymentContent(payload, { from, mentions, expiry } = {}) {
    if (!payload?.ok || !payload.content) {
        throw Object.assign(new Error("PAYMENT_PAYLOAD_INVALID"), { code: "PAYMENT_PAYLOAD_INVALID" })
    }
    const content = {
        payment: {
            note: payload.content.note,
            currency: payload.content.currency,
            amount: payload.content.amount,
            offset: payload.content.offset || 0,
            expiry: expiry || 0
        }
    }
    if (from) content.payment.from = from
    if (Array.isArray(mentions) && mentions.length) content.mentions = mentions
    return content
}

```

### features/flood/allowlist.js — 165 linhas (6.2 KB)

```js
// features/flood/allowlist.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Destinos de teste controlado: SOMENTE JIDs explicitamente autorizados.
//
// REGRA (não negociável, e é ela que mantém isto um sistema de TESTE):
//   destino explicitamente autorizado → permitido
//   destino não autorizado            → bloqueado
// NÃO existe "allGroups", "allContacts", "everyone", "todos os participantes".
// Quem adiciona na allowlist é o dono; o flood de preset nunca adiciona sozinho.
//
// Reuso do AB7 (sem duplicar normalização/permissão):
//   normalizeNumber / isGroupJid / isAuthorizedGroup  ← utils/permissions.js
// O bloco de GRUPO PROTEGIDO continua sendo o do projeto (isAuthorizedGroup):
// aqui ele é aplicado em filterTargets(), para preset nenhum "esquecer" a porteira.

import { CONFIG } from "../../utils/config.js"
import { normalizeNumber, isGroupJid, isAuthorizedGroup } from "../../utils/permissions.js"

export const BLOCKED_TARGET = "BLOCKED_TARGET"
export const ALLOWLIST_EMPTY = "ALLOWLIST_EMPTY"
export const PROTECTED_GROUP_BLOCKED = "PROTECTED_GROUP_BLOCKED"

const KNOWN_DOMAINS = ["g.us", "s.whatsapp.net", "lid"]

export function getAllowlist() {
    const raw = Array.isArray(CONFIG.floodAllowlist) ? CONFIG.floodAllowlist : []
    const out = []
    const seen = new Set()
    for (const item of raw) {
        const jid = normalizeTargetJid(item)
        if (!jid || seen.has(jid)) continue
        seen.add(jid)
        out.push(jid)
    }
    return out
}

/**
 * Aceita jid completo (`x@g.us`, `x@s.whatsapp.net`, `x@lid`), `user@dominio`
 * desconhecido (recusado) ou número puro (→ @s.whatsapp.net).
 * @returns {string|null}
 */
export function normalizeTargetJid(value) {
    if (!value) return null
    const s = String(value).trim()
    if (!s) return null
    if (KNOWN_DOMAINS.some(d => s.endsWith(`@${d}`))) return s
    if (s.includes("@")) {
        const [user, domain] = s.split("@")
        if (!user) return null
        return KNOWN_DOMAINS.includes(domain) ? s : null
    }
    const n = normalizeNumber(s)
    if (!n) return null
    if (n.length < 10 || n.length > 20) return null
    return `${n}@s.whatsapp.net`
}

export function isOnAllowlist(jid) {
    const target = normalizeTargetJid(jid)
    if (!target) return false
    const list = getAllowlist()
    const tNum = normalizeNumber(target)
    for (const a of list) {
        if (a === target) return true
        if (tNum && normalizeNumber(a) === tNum) return true
    }
    return false
}

/**
 * Particiona uma lista de destinos em permitidos/bloqueados.
 * `jids` vazio NUNCA significa "todo mundo": significa "a própria allowlist".
 */
export function filterAllowlist(jids) {
    const list = getAllowlist()
    if (!list.length) return { ok: false, error: ALLOWLIST_EMPTY, allowed: [], blocked: [] }
    const allowed = []
    const blocked = []
    const seen = new Set()
    const incoming = Array.isArray(jids) && jids.length ? jids : list
    for (const raw of incoming) {
        const jid = normalizeTargetJid(raw)
        if (!jid) {
            blocked.push({ jid: String(raw || ""), reason: BLOCKED_TARGET })
            continue
        }
        if (!isOnAllowlist(jid)) {
            blocked.push({ jid, reason: BLOCKED_TARGET })
            continue
        }
        if (seen.has(jid)) continue
        seen.add(jid)
        allowed.push(jid)
    }
    return { ok: true, allowed, blocked, empty: !list.length }
}

/**
 * Allowlist + grupo protegido num passo só (é a porteira que o engine de presets usa).
 * @param {string[]} jids
 * @param {{isProtected?: (jid:string)=>boolean}} [opts]
 */
export function filterTargets(jids, opts = {}) {
    const isProtected = typeof opts.isProtected === "function"
        ? opts.isProtected
        : (jid) => {
            try { return isAuthorizedGroup(jid) } catch { return false }
        }
    const base = filterAllowlist(jids)
    if (!base.ok) return { ...base, allowed: [], blocked: [], protectedBlocked: [] }
    const allowed = []
    const protectedBlocked = []
    for (const jid of base.allowed) {
        if (isGroupJid(jid) && isProtected(jid)) protectedBlocked.push(jid)
        else allowed.push(jid)
    }
    const blocked = [...base.blocked, ...protectedBlocked.map(jid => ({ jid, reason: PROTECTED_GROUP_BLOCKED }))]
    return { ok: true, allowed, blocked, protectedBlocked }
}

export function addAllowlistJid(value) {
    const jid = normalizeTargetJid(value)
    if (!jid) return { ok: false, error: "JID_INVALID" }
    if (!Array.isArray(CONFIG.floodAllowlist)) CONFIG.floodAllowlist = []
    if (isOnAllowlist(jid)) return { ok: true, already: true, jid }
    CONFIG.floodAllowlist.push(jid)
    return { ok: true, added: true, jid, list: getAllowlist() }
}

export function removeAllowlistJid(valueOrIndex) {
    if (!Array.isArray(CONFIG.floodAllowlist)) CONFIG.floodAllowlist = []
    const str = String(valueOrIndex || "").trim()
    const idx = parseInt(str.replace(/\D/g, ""), 10)
    if (!Number.isNaN(idx) && /^\d+$/.test(str) && idx >= 1 && idx <= CONFIG.floodAllowlist.length) {
        const removed = CONFIG.floodAllowlist.splice(idx - 1, 1)[0]
        return { ok: true, removed, byIndex: true, list: getAllowlist() }
    }
    const jid = normalizeTargetJid(str)
    if (!jid) return { ok: false, error: "NOT_FOUND" }
    const n = normalizeNumber(jid)
    const pos = CONFIG.floodAllowlist.findIndex(a => a === jid || normalizeNumber(a) === n)
    if (pos < 0) return { ok: false, error: "NOT_FOUND" }
    const removed = CONFIG.floodAllowlist.splice(pos, 1)[0]
    return { ok: true, removed, byIndex: false, list: getAllowlist() }
}

/** Nunca imprime o número inteiro: destino de teste também é dado sensível. */
export function maskJid(jid) {
    if (!jid) return "(none)"
    const s = String(jid)
    const [user, domain] = s.split("@")
    if (!user) return "***"
    if (user.length <= 4) return `****@${domain || "?"}`
    return `${user.slice(0, 4)}****${user.slice(-2)}@${domain || "?"}`
}

export function formatAllowlistTexto() {
    const list = getAllowlist()
    if (!list.length) return "Allowlist vazia — nenhum destino autorizado."
    return list
        .map((jid, i) => `  ${i + 1} · ${maskJid(jid)}${isGroupJid(jid) ? " (grupo)" : ""}`)
        .join("\n")
}

```

### features/flood/limiter.js — 167 linhas (6.3 KB)

```js
// features/flood/limiter.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Intervalo, concorrência, cooldown e timeout COMPARTILHADOS por todos os presets.
//
// Arquitetura: este módulo é infra pura — não conhece socket, não conhece
// WhatsApp e NÃO envia nada. Quem executa envio continua sendo o
// executarFlood()/executarFloodLote() de services/groupService.js (AB7).
// O limiter só responde "quando posso", "quantos ao mesmo tempo" e "até quando
// esperar". É por isso que ele é reutilizável pelo sistema de presets e por
// qualquer outro laço, sem virar um segundo executor.
//
// Limites de segurança (não são otimizáveis por preset): os valores máximos
// vêm de FLOOD_PRESET_HARD_CAP (features/flood/config.js) e são aplicados em
// clampPresetLimits ANTES de chegar aqui. Nada neste módulo remove throttle,
// jitter ou cooldown — e nada aqui tenta "contornar" rate limit: o que existe é
// ESPERA (waitInterval) e backoff nos retries da fila.

/**
 * Estado de cooldown por preset (em memória de propósito): cooldown de teste
 * controlado não precisa sobreviver a restart — se precisasse, seria config,
 * não estado. `clearCooldown` existe para o operador resetar manualmente.
 */
const lastJobEnd = new Map()
const lastSendAt = new Map()

/** Quanto falta (ms) para o cooldown de `presetId` terminar. 0 = pode rodar. */
export function remainingCooldown(presetId, cooldownMs) {
    const last = lastJobEnd.get(presetId) || 0
    const need = Math.max(0, Number(cooldownMs) || 0)
    const left = need - (Date.now() - last)
    return left > 0 ? left : 0
}

/** Registra o fim do job → abre o cooldown do preset. */
export function markJobEnd(presetId) {
    if (!presetId) return
    lastJobEnd.set(presetId, Date.now())
}

/** Reset manual do cooldown (um preset, ou todos se omitido). */
export function clearCooldown(presetId) {
    if (presetId) lastJobEnd.delete(presetId)
    else lastJobEnd.clear()
}

export function sleep(ms) {
    const t = Math.max(0, Number(ms) || 0)
    return new Promise(r => setTimeout(r, t))
}

/**
 * Timeout com erro tipificado ({ code: "TIMEOUT" }) — classifyError trata como
 * retryável, então um timeout não derruba o job inteiro.
 */
export function withTimeout(fn, timeoutMs) {
    const ms = Math.max(1, Number(timeoutMs) || 15000)
    return new Promise((resolve, reject) => {
        let done = false
        const t = setTimeout(() => {
            if (done) return
            done = true
            reject(Object.assign(new Error("TIMEOUT"), { code: "TIMEOUT" }))
        }, ms)
        Promise.resolve()
            .then(() => (typeof fn === "function" ? fn() : fn))
            .then(v => {
                if (done) return
                done = true
                clearTimeout(t)
                resolve(v)
            })
            .catch(e => {
                if (done) return
                done = true
                clearTimeout(t)
                reject(e)
            })
    })
}

/**
 * Limiter de um laço: concorrência + intervalo mínimo (+ jitter opcional).
 * O intervalo é GLOBAL por `key` (não por chamada) — é isso que faz um lote de
 * N alvos continuar respeitando o mesmo ritmo, em vez de virar rajada.
 */
export function createLimiter({ interval = 3000, concurrency = 1, timeout = 15000, key = "default", jitter = false } = {}) {
    const minInterval = Math.max(0, Number(interval) || 0)
    const maxInflight = Math.max(1, Number(concurrency) || 1)
    let inflight = 0
    const waiters = []

    function wake() {
        while (waiters.length && inflight < maxInflight) {
            // O slot é reservado AQUI, antes de acordar o waiter. Se deixar para o
            // `inflight++` depois do await, um acquire() que rodar nesse intervalo
            // de microtask vê espaço livre e passa também — a concorrência real
            // estoura o teto (bug que veio da arena 01a0aaae e que o teste pega).
            inflight++
            const next = waiters.shift()
            next()
        }
    }

    async function acquire() {
        if (inflight < maxInflight) {
            inflight++
            return
        }
        await new Promise(resolve => waiters.push(resolve))
        // já reservado por wake()
    }

    function release() {
        inflight = Math.max(0, inflight - 1)
        wake()
    }

    async function waitInterval() {
        const last = lastSendAt.get(key) || 0
        let wait = minInterval - (Date.now() - last)
        // Jitter é para PARECER humano / diluir rajada. Ele só AUMENTA a espera:
        // nunca é usado para encurtar intervalo nem para driblar proteção.
        if (jitter && last) wait += Math.floor(Math.random() * 250) + 50
        if (wait > 0) await sleep(wait)
        lastSendAt.set(key, Date.now())
    }

    async function schedule(fn) {
        await acquire()
        try {
            await waitInterval()
            return await withTimeout(fn, timeout)
        } finally {
            release()
        }
    }

    return {
        schedule,
        inflight: () => inflight,
        pending: () => waiters.length,
        /** Intervalo/timeout efetivos — usado no resumo do job e nos testes. */
        limits: () => ({ interval: minInterval, concurrency: maxInflight, timeout, key, jitter: !!jitter })
    }
}

/**
 * Classifica erro do envio para decidir retry/abort.
 * - timeout / rate limit  → retryável (com backoff na fila), NUNCA "contorna"
 * - disconnect            → aborta o job (não adianta martelar sessão caída)
 * - forbidden/blocked      → permanente, aborta
 */
export function classifyError(e) {
    const msg = String(e?.message || e || "").toLowerCase()
    const data = e?.data
    const code = e?.code
    if (code === "TIMEOUT" || msg.includes("timeout")) return { kind: "timeout", retry: true, abort: false }
    if (msg.includes("rate-overlimit") || msg.includes("rate") || data === 429) return { kind: "rate_limit", retry: true, abort: false }
    if (msg.includes("disconnect") || msg.includes("connection closed") || msg.includes("not connected") || msg.includes("logged out")) {
        return { kind: "disconnect", retry: false, abort: true }
    }
    if (msg.includes("forbidden") || msg.includes("not-authorized") || msg.includes("blocked")) {
        return { kind: "permanent", retry: false, abort: true }
    }
    return { kind: "error", retry: false, abort: true }
}

```

### features/flood/router.js — 225 linhas (11.3 KB)

```js
// features/flood/router.js
// [RESTAURAÇÃO] Fachada de comandos da arena 01a0aaae, reconstruída sobre a API da AB7.
//
// A arena antiga tinha 10 comandos de texto (`floodpresets`, `paymenttest`,
// `shoppingtest`, `floodstop`, …) e as opções 36-39 do painel do dono apontando para
// um `floodRouter` dentro de features/flood/index.js. A migração para a AB7 trouxe a
// infra (queue/limiter/kill switch/allowlist/preset engine) mas NÃO trouxe essa
// fachada — foi isso que fez "os comandos sumirem".
//
// O que mudou de lá para cá, de propósito:
//   • Não existe wizard paralelo: os `*test` disparam pelo MESMO runPresetJob da AB7,
//     que por sua vez chama o executarFlood clássico (services/groupService.js). Nada
//     aqui chama sock.sendMessage() para mandar flood.
//   • Dry-run é o default: só sai de verdade se CONFIG.floodDryRun estiver DESLIGADO
//     (painel 37) — o comando nunca "esconde" o envio.
//   • Alvos = allowlist da feature (a porta de saída). `38 · Escolher grupos` escreve
//     nela a partir da lista de grupos autorizados; nada é ampliado sozinho.
//   • O preset de loja vem daqui só como DADO de preset (overlay texto|title|surface|id),
//     com surface ≤ 3 e viewOnce off — as chaves do card são as do builder da AB7.

import { CONFIG } from "../../utils/config.js"
import { getSock } from "../../connection/socket.js"
import { isOwner } from "../../utils/permissions.js"
import { setState } from "../../utils/stateManager.js"
import { runPresetJob, formatPresetJobResult, currentJobInfo, cancelRunningJob } from "./presetEngine.js"
import { setKillSwitch, killSwitchStatusTexto, KILL_SWITCH_REASON } from "./killswitch.js"
import { getAllowlist, addAllowlistJid, formatAllowlistTexto, maskJid } from "./allowlist.js"
import { listPresetsTexto } from "./presets/index.js"
import { formatCustomPresetsTexto } from "./customStore.js"
import { normalizeSurface } from "./shopping.js"
import { listShoppingPresetsTexto, DEFAULT_SHOPPING_PRESET_ID } from "./config.js"
import { parseAmount, parseCurrency } from "./payment.js"
import { getFloodRuntimeConfig, FLOOD_PRESET_HARD_CAP } from "./config.js"

/**
 * Nomes de comando público → id de ação. É a fonte única dos atalhos de texto
 * (commands/commandMap.js) e da ajuda: renumerar/renomear aqui, não lá.
 */
export const FLOOD_PRESET_COMMANDS = {
    floodpresets: "painel_flood_presets",
    floodpreset: "painel_flood_presets",
    texttest: "flood_preset_text_test",
    mentiontest: "flood_preset_mention_test",
    mediatest: "flood_preset_media_test",
    paymenttest: "flood_preset_payment_test",
    shoppingtest: "flood_preset_shopping_test",
    floodstop: "flood_kill_on",
    floodstart: "flood_kill_off",
    flooddryrun: "cfg_flood_dryrun"
}

/** Ação de atalho → preset que ela roda (null = painel/toggle, não roda job). */
export const FLOOD_TEST_ACTION_PRESET = {
    flood_preset_text_test: "text-test",
    flood_preset_mention_test: "mention-test",
    flood_preset_media_test: "media-test",
    flood_preset_payment_test: "payment-test",
    flood_preset_shopping_test: "shopping-test"
}

async function send(chatJid, text) {
    try {
        const sock = getSock()
        if (!sock || typeof sock.sendMessage !== "function") return { sent: false, reason: "sem sock" }
        await sock.sendMessage(chatJid, { text })
        return { sent: true }
    } catch (e) {
        return { sent: false, error: e?.message || String(e) }
    }
}

/** Painel 36: o que existe de preset, como rodar, e os atalhos. */
export function floodPresetsMenuTexto() {
    const rc = getFloodRuntimeConfig()
    const atalhos = Object.entries(FLOOD_PRESET_COMMANDS).map(([c, a]) => `  ${c} → ${a}`)
    return [
        "🌊 FLOOD · PRESETS (load-test)",
        "",
        listPresetsTexto(),
        "",
        formatCustomPresetsTexto(),
        `• teto por job: ${FLOOD_PRESET_HARD_CAP.maxMessages} msg · mín ${FLOOD_PRESET_HARD_CAP.minInterval}ms · ${FLOOD_PRESET_HARD_CAP.maxConcurrency} por vez`,
        `• dry-run agora: ${rc.dryRun ? "LIGADO (nada sai)" : "⚠️ DESLIGADO (sai de verdade)"}`,
        `• allowlist: ${rc.allowlist.length} destino(s)${rc.allowlist.length ? "" : " → sem destino, todo job morre em ALLOWLIST_EMPTY"}`,
        "",
        "Rodar rapidinho (usa a allowlist como alvo, 1 msg por destino):",
        ...Object.keys(FLOOD_TEST_ACTION_PRESET).map(a => `  ${a.replace("flood_preset_", "").replace("_test", "")}test`),
        `  2/preset/<id>[/conteúdo]      ex: 2/preset/payment-test/Pagamento do pedido|25.90|BRL`,
        `  2/preset/${DEFAULT_SHOPPING_PRESET_ID}/Produto|SYZYGY SHOP|wa`,
        "",
        "Atalhos:",
        ...atalhos,
        "",
        "_nenhum destes caminhos cria um segundo executor: o envio é o executarFlood do AB7_"
    ].join("\n")
}

/** Overlay de payment a partir de "texto|25.90|BRL" (formato que já existia). */
export function paymentOverlayFromRest(rest) {
    const src = String(rest || "").trim()
    if (!src) return { ok: true, overlay: {} }
    const parts = src.split("|").map(s => s.trim())
    const text = parts[0]
    if (!text) return { ok: false, error: "TEXT_MISSING" }
    const amt = parseAmount(parts[1])
    if (!amt.ok) return { ok: false, error: amt.error, usage: amt.usage }
    const cur = parseCurrency(parts[2] || "BRL")
    if (!cur.ok) return { ok: false, error: cur.error, usage: cur.usage }
    return { ok: true, overlay: { text, amount: amt.value, currency: cur.value } }
}

/**
 * Overlay de shopping a partir de "texto|title|surface|id" — MESMAS regras do
 * wizard (index.js:parseShoppingOverlay), reimplementadas aqui porque o router não
 * pode importar o barrel que o exporta (ciclo ESM). 4 campos no máximo; surface
 * passada por normalizeSurface (o "4" do README do fork vira 3 com aviso do próprio
 * normalizador); qualquer outra coisa é texto livre, pipes inclusos.
 */
export function shoppingOverlayFromRest(rest) {
    const raw = String(rest || "").trim()
    const overlay = {}
    if (!raw || /^(0|default|padr[õo]o)$/i.test(raw)) return { ok: true, overlay, kind: "default" }
    const parts = raw.split("|").map(x => x.trim())
    if (parts.length >= 3 && /^(\d+|fb|ig|wa)$/i.test(parts[2])) {
        if (parts.length > 4) return { ok: false, error: "OVERLAY_TOO_MANY_FIELDS", message: "máximo 4 campos: texto|title|surface|id" }
        overlay.text = parts[0]
        if (parts[1]) overlay.title = parts[1]
        const shop = {}
        try {
            const r = normalizeSurface(parts[2])
            if (r && r.surface != null) shop.surface = r.surface
        } catch (e) {
            return { ok: false, error: e.code || "SURFACE_INVALID", message: e.message }
        }
        if (parts[3]) shop.id = parts[3]
        if (Object.keys(shop).length) overlay.shop = shop
        return { ok: true, overlay, kind: "spec" }
    }
    overlay.text = raw
    return { ok: true, overlay, kind: "plain" }
}

async function runTestJob(chatJid, ownerKey, { presetId, rest = "", tipo = null, dryRun = null } = {}) {
    const alvo = getAllowlist()
    if (!alvo.length) {
        return send(chatJid, `⚠️ ALLOWLIST_EMPTY — nenhum destino liberado.\n\nUse 38 · Escolher grupos (1,3,5) do painel do dono, ou 41 para adicionar um JID.\nNada foi enviado.`)
    }
    let overlay = {}
    if (tipo === "payment") {
        const p = paymentOverlayFromRest(rest)
        if (!p.ok) return send(chatJid, `❌ ${p.error}\n${p.usage || "formato: texto|25.90|BRL"}`)
        overlay = p.overlay
    } else if (tipo === "shopping") {
        const s = shoppingOverlayFromRest(rest)
        if (!s.ok) return send(chatJid, `❌ ${s.error}\n${s.message || "formato: texto|title|surface|id (surface: 1/fb, 2/ig, 3/wa)"}`)
        overlay = s.overlay
    } else if (rest) {
        overlay = { text: rest }
    }

    const res = await runPresetJob({
        presetId,
        overlay,
        targets: alvo,
        qtd: 1,
        dryRun: dryRun == null ? (CONFIG.floodDryRun !== false) : !!dryRun
    })
    // Só job que mandou de verdade entra no histórico: dry-run é ensaio, e registrar
    // ensaio transforma dono/historico.json em log de teste.
    if (!res.dryRun) {
        try {
            const { registrarAcao } = await import("../../services/historicoService.js")
            registrarAcao("flood_preset", {
                preset: presetId, dryRun: false, ok: !!res.ok, sent: res.metrics?.sent,
                erro: res.error || undefined, via: "router"
            })
        } catch { /* histórico é opcional aqui */ }
    }
    const rodape = res.dryRun
        ? "\n\n_DRY-RUN: nada saiu. Para o 1º envio real, desligue o 37 (e mantenha o 39 por perto)._"
        : ""
    return send(chatJid, `${formatPresetJobResult(res)}${rodape}`)
}

/**
 * Roteador público. Idempotente e sem estado próprio: os únicos estados criados
 * são os de digitação (38 · grupos), tratados em handlers/stateHandler.js.
 */
export async function floodRouter(chatJid, ownerKey, actionId, extra = {}) {
    if (actionId === "painel_flood_presets" || actionId === "flood_presets_menu") {
        return send(chatJid, floodPresetsMenuTexto())
    }
    if (actionId === "flood_kill_on" || actionId === "flood_kill_off") {
        if (!isOwner(ownerKey)) return send(chatJid, "❌ Apenas o dono mexe no kill switch.")
        const on = actionId === "flood_kill_on"
        setKillSwitch(on, { persist: true })
        if (on && currentJobInfo()) cancelRunningJob(KILL_SWITCH_REASON)
        return send(chatJid, `${on ? "🛑 FLOOD_KILL_SWITCH LIGADO" : "▶️ FLOOD_KILL_SWITCH desligado"}\n${on ? "Fila interrompida na fronteira do lote; novos jobs barrados." : "Novos jobs liberados (respeitando cooldown)."}\n\n${killSwitchStatusTexto()}`)
    }
    if (actionId === "cfg_flood_allowlist" || actionId === "flood_pick_groups") {
        const grupos = CONFIG.gruposAutorizados || []
        let t = `🛡️ ESCOLHER GRUPOS DO FLOOD (allowlist)\n\nDigite os números separados por vírgula:\n  1        → só o grupo 1\n  1,3,5    → três destinos\n  todos    → tudo que está autorizado\n  limpar   → fecha a porta (allowlist vazia)\n\n`
        t += grupos.length
            ? grupos.slice(0, 30).map((g, i) => `  ${i + 1} · ${maskJid(g)}`).join("\n")
            : "_nenhum grupo autorizado — autorize primeiro no painel (26)_"
        t += `\n\n_A allowlist é a porta de saída do flood: sem ela, TODO destino é barrado._\n(cancelar para sair)`
        setState(ownerKey, { action: "config_set_flood_allowlist_pick" })
        return send(chatJid, t)
    }
    const presetId = FLOOD_TEST_ACTION_PRESET[actionId]
    if (presetId) {
        return runTestJob(chatJid, ownerKey, { presetId, rest: extra.rest || "", tipo: presetId.includes("payment") ? "payment" : presetId.includes("shopping") ? "shopping" : null })
    }
    if (actionId === "run") {
        // 2/preset/<id>[/conteúdo] — id livre (built-in ou custom)
        const id = String(extra.presetId || "").trim().toLowerCase()
        if (!id) return send(chatJid, `❌ 2/preset/<nome>\n${listPresetsTexto()}\n\n${listShoppingPresetsTexto()}`)
        const tipo = /payment/.test(id) ? "payment" : /shop|loja/.test(id) ? "shopping" : null
        return runTestJob(chatJid, ownerKey, { presetId: id, rest: extra.rest || extra.paymentArgs || extra.shoppingArgs || "", tipo })
    }
    return send(chatJid, `⚠️ ação de flood desconhecida: ${actionId}\n\n${floodPresetsMenuTexto()}`)
}

export default floodRouter

```

### features/flood/presets/index.js — 112 linhas (4.5 KB)

```js
// features/flood/presets/index.js
// [PRESET · recuperado da arena 01a0aaae e adaptado ao AB7]
// Registry: id → definição (config.js, com limites clamped) → builder do tipo.
// É o único lugar que sabe "qual tipo usa qual builder". Não envia, não fila,
// não conhece socket: produção de conteúdo validado.
//
// Tipos finais: text · mention · media · payment · shopping · custom
// (shopping = builder ATUAL do AB7, via presets/shoppingBuilder.js).

import { getPresetDef, clampPresetLimits, listPresetIds, FLOOD_PRESET_TYPES, FLOOD_PRESET_HARD_CAP } from "../config.js"
import { buildSendContent as buildText, makeIterationBuilder as iterText } from "./text.js"
import { buildSendContent as buildMention, makeIterationBuilder as iterMention } from "./mention.js"
import { buildSendContent as buildMedia, makeIterationBuilder as iterMedia } from "./media.js"
import { buildSendContent as buildPayment, makeIterationBuilder as iterPayment } from "./payment.js"
import { buildSendContent as buildShopping, makeIterationBuilder as iterShopping } from "./shoppingBuilder.js"
import { buildSendContent as buildCustom, makeIterationBuilder as iterCustom } from "./custom.js"

export const BUILDERS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment,
    shopping: buildShopping,
    custom: buildCustom
}

export const ITER_BUILDERS = {
    text: iterText,
    mention: iterMention,
    media: iterMedia,
    payment: iterPayment,
    shopping: iterShopping,
    custom: iterCustom
}

export const PRESET_TYPES = FLOOD_PRESET_TYPES

function typeOf(preset) {
    return String(preset?.type || "text").toLowerCase()
}

/**
 * @param {string} id  preset built-in ou custom (customStore)
 * @param {object} [overlay] campos digitados no wizard (nunca sobem limites)
 */
export function loadPreset(id, overlay = {}) {
    const def = getPresetDef(id)
    if (!def) return { ok: false, error: "PRESET_UNKNOWN" }
    // clamp DEPOIS do overlay: é o hard cap quem manda, o overlay não afrouxa.
    const merged = clampPresetLimits({ ...def, ...(overlay && typeof overlay === "object" ? overlay : {}), id: def.id, type: overlay?.type || def.type })
    // O preset é o TETO de mensagens dele: overlay/config só pode REDUZIR. Sem
    // isto, um overlay conseguiria transformar um preset de "3x de teste" em 10x
    // — dentro do hard cap, mas fora do que o preset representa.
    const tetoDoPreset = Math.min(Number(def.maxMessages) || FLOOD_PRESET_HARD_CAP.maxMessages, FLOOD_PRESET_HARD_CAP.maxMessages)
    merged.maxMessages = Math.min(merged.maxMessages, Math.max(1, tetoDoPreset))
    if (!["selected", "single"].includes(merged.targetMode)) merged.targetMode = "selected"
    const type = typeOf(merged)
    if (!BUILDERS[type]) return { ok: false, error: "PRESET_TYPE_UNSUPPORTED", type }
    return { ok: true, preset: merged, type }
}

/** Conteúdo de send já validado pelo builder do tipo. */
export function buildContent(preset = {}, ctx = {}) {
    const builder = BUILDERS[typeOf(preset)] || BUILDERS.text
    return builder(preset, ctx)
}

/** Builder por iteração para o executarFlood do AB7 (mesmo laço, mesmo ritmo). */
export function makeIterationBuilder(preset = {}, ctx = {}) {
    const builder = ITER_BUILDERS[typeOf(preset)] || ITER_BUILDERS.text
    return builder(preset, ctx)
}

export function listPresets() {
    return listPresetIds()
        .map(id => {
            const def = getPresetDef(id)
            return def ? clampPresetLimits(def) : null
        })
        .filter(Boolean)
}

/** Resumo sem segredo: id, tipo, limites e chaves do payload (não o conteúdo). */
export function describePreset(preset = {}) {
    const type = typeOf(preset)
    return {
        id: preset.id,
        type,
        maxMessages: preset.maxMessages,
        interval: preset.interval,
        concurrency: preset.concurrency,
        cooldown: preset.cooldown,
        timeout: preset.timeout,
        targetMode: preset.targetMode,
        floodModo: preset.floodModo || null
    }
}

/** O que o dry-run mostra: chaves do payload, sem enviar nada. */
export function previewContentKeys(preset = {}, ctx = {}) {
    const content = buildContent(preset, ctx)
    return { keys: Object.keys(content).sort(), type: typeOf(preset) }
}

export function listPresetsTexto() {
    const l = listPresets()
    if (!l.length) return "_(nenhum preset de flood cadastrado)_"
    return l
        .map(p => `  *${p.id}* · ${p.type} · ${p.maxMessages}x · ${p.interval}ms · cooldown ${Math.round(p.cooldown / 1000)}s`)
        .join("\n")
}

```

### features/flood/presets/text.js — 25 linhas (0.9 KB)

```js
// features/flood/presets/text.js
// [PRESET · recuperado da arena 01a0aaae]
// O mais simples de todos: só { text }. Os limites (maxMessages/interval/
// cooldown) continuam sendo os do config.js — o builder não tem poder de
// aumentar nada, e é assim que o sistema continua sendo teste controlado.

export const TYPE = "text"

export function buildSendContent(preset = {}) {
    const text = String(preset?.text || "SYZYGY text-test")
    return { text }
}

/**
 * Builder por iteração do executarFlood (AB7): o laço já incrementa o corpo com
 * os \u200b de unicidade — aqui é só reaproveitar esse corpo.
 */
export function makeIterationBuilder(preset = {}) {
    const base = buildSendContent(preset)
    return (ctx = {}) => {
        const body = typeof ctx?.body === "string" && ctx.body.length ? ctx.body : base.text
        return { text: body }
    }
}

```

### features/flood/presets/mention.js — 68 linhas (2.8 KB)

```js
// features/flood/presets/mention.js
// [PRESET · recuperado da arena 01a0aaae — com a regra de segurança preservada]
// "Hidetag" de teste. Regras duras, e são elas que impedem isto de virar
// marcação indiscriminada:
//   • mentions VÊM DE UMA LISTA EXPLÍCITA (quem chama passou a lista);
//   • o texto NÃO pode conter telefones visíveis (nada de "@5519…" no corpo);
//   • NUNCA injetamos números no texto para simular marcação;
//   • NUNCA caímos para "todos os participantes" quando a lista vem vazia.
// O AB7 tem `mencionarTodosFantasma()` (marcar todos) — ele NÃO é usado por este
// preset. Quando o projeto precisar resolver participantes, quem decide a lista
// é o chamador (ex.: cache de grupo do stateHandler), e o teto é MENTION_MAX.

export const TYPE = "mention"
export const MENTION_MAX = 20
const JID_LIKE = /^[^@\s]+@(?:g\.us|s\.whatsapp\.net|lid)$/

/** Telefones visíveis no corpo = o operador montou a marcação na mão. Recusado. */
export function visibleTextHasPhones(text) {
    return /@\d{8,}/.test(String(text || ""))
}

export function looksLikePhoneRun(text) {
    return /(?:^|\D)\+?\d{10,15}(?:\D|$)/.test(String(text || ""))
}

/**
 * Aceita somente jids válidos, sem duplicatas e até MENTION_MAX.
 * Entrada não-array → lista vazia (e o builder NÃO marca ninguém).
 */
export function sanitizeMentions(list, { max = MENTION_MAX } = {}) {
    const out = []
    const seen = new Set()
    if (!Array.isArray(list)) return out
    const cap = Math.max(1, Math.min(Number(max) || MENTION_MAX, MENTION_MAX))
    for (const raw of list) {
        const s = String(raw || "").trim()
        if (!JID_LIKE.test(s) || seen.has(s)) continue
        seen.add(s)
        out.push(s)
        if (out.length >= cap) break
    }
    return out
}

export function buildSendContent(preset = {}, { mentions } = {}) {
    const text = String(preset?.text || "SYZYGY mention-test")
    if (visibleTextHasPhones(text)) {
        throw Object.assign(new Error("MENTION_LEAK"), { code: "MENTION_LEAK", message: "o texto do preset contém telefones visíveis" })
    }
    const content = { text }
    const list = sanitizeMentions(mentions !== undefined ? mentions : preset?.mentions)
    if (list.length) content.mentions = list
    return content
}

export function makeIterationBuilder(preset = {}, ctx = {}) {
    const base = buildSendContent(preset, ctx)
    return (iterCtx = {}) => {
        const body = typeof iterCtx?.body === "string" && iterCtx.body.length ? iterCtx.body : base.text
        if (visibleTextHasPhones(body)) {
            throw Object.assign(new Error("MENTION_LEAK"), { code: "MENTION_LEAK", message: "corpo da iteração contém telefones visíveis" })
        }
        const out = { text: body }
        if (base.mentions) out.mentions = base.mentions
        return out
    }
}

```

### features/flood/presets/media.js — 84 linhas (3.4 KB)

```js
// features/flood/presets/media.js
// [PRESET · recuperado da arena 01a0aaae]
// Mídia de teste controlado. Fonte do buffer, nesta ordem:
//   1) buffer fornecido por quem executa (o executor do AB7 já tem o arquivo em
//      mão — ex.: mídia baixada/preparada no wizard);
//   2) caminho configurado no preset (mediaPath / image);
//   3) imagem de menu do projeto (CONFIG.menuImage → MENU_IMAGE_PATH).
// Se nenhuma existir: ERRO ESTRUTURADO MEDIA_UNAVAILABLE — o job reporta o item
// bloqueado e segue (dry-run apenas descreve o que faltou). Nada aqui "cria"
// mídia fake nem troca por texto para parecer que funcionou.

import fs from "fs"
import { CONFIG, MENU_IMAGE_PATH, MAX_IMAGE_BYTES } from "../../../utils/config.js"

export const TYPE = "media"

function readIfPresent(path) {
    try {
        if (!path || typeof path !== "string") return null
        if (!fs.existsSync(path)) return null
        const st = fs.statSync(path)
        if (!st.isFile() || st.size <= 0 || st.size > MAX_IMAGE_BYTES) return null
        const buf = fs.readFileSync(path)
        return buf && buf.length ? buf : null
    } catch {
        return null
    }
}

/** @returns {Buffer|null} */
export function resolveMediaBuffer(preset = {}, ctx = {}) {
    if (ctx?.buffer && Buffer.isBuffer(ctx.buffer) && ctx.buffer.length) return ctx.buffer
    if (preset?.buffer && Buffer.isBuffer(preset.buffer) && preset.buffer.length) return preset.buffer
    const candidates = [
        preset?.mediaPath,
        typeof preset?.image === "string" ? preset.image : null
    ]
    // Fallback para a imagem de menu SÓ quando o preset não disse o contrário:
    // um preset de mídia que aponta para arquivo inexistente tem de dar
    // MEDIA_UNAVAILABLE, não enviar a foto do bot sem avisar.
    if (preset?.menuFallback !== false) {
        candidates.push(CONFIG.menuImage, MENU_IMAGE_PATH)
    }
    for (const p of candidates) {
        const buf = readIfPresent(p)
        if (buf) return buf
    }
    return null
}

export function mediaCaption(preset = {}) {
    return String(preset?.caption || preset?.text || "SYZYGY media-test")
}

export function buildSendContent(preset = {}, ctx = {}) {
    const img = resolveMediaBuffer(preset, ctx)
    if (!img) {
        throw Object.assign(new Error("MEDIA_UNAVAILABLE"), {
            code: "MEDIA_UNAVAILABLE",
            message: "nenhuma mídia encontrada (buffer, preset.mediaPath, CONFIG.menuImage ou MENU_IMAGE_PATH)"
        })
    }
    const content = { image: img, caption: mediaCaption(preset) }
    if (typeof preset?.mimetype === "string" && preset.mimetype.trim()) content.mimetype = preset.mimetype.trim()
    return content
}

/**
 * Mídia é o mesmo arquivo em toda iteração (caption com os \u200b do laço para
 * unicidade visual). Não fazemos upload por iteração: o fork cuida disso.
 */
export function makeIterationBuilder(preset = {}, ctx = {}) {
    const base = buildSendContent(preset, ctx)
    return (iterCtx = {}) => {
        const out = { image: base.image, caption: mediaCaption(preset) }
        if (base.mimetype) out.mimetype = base.mimetype
        const body = typeof iterCtx?.body === "string" ? iterCtx.body : ""
        // só usa o corpo do laço se o preset não definiu caption (evita caption
        // duplicada/diferente do que foi validado)
        if (!preset?.caption && body) out.caption = body
        return out
    }
}

```

### features/flood/presets/payment.js — 44 linhas (1.7 KB)

```js
// features/flood/presets/payment.js
// [PRESET · recuperado da arena 01a0aaae]
// Payment continua sendo o payload do fork (requestPaymentMessage), e continua
// num caminho SEPARADO do shopping: o adapter de shopping recusa payment.
// Campos do preset: texto (note) · valor · moeda · from · mentions (quando aplicável).
// O "modo de teste" é checagem do engine (PAYMENT_TEST_DISABLED), não daqui.

import { createPaymentPayload, buildPaymentContent, parsePaymentArgs } from "../payment.js"

export const TYPE = "payment"

export function buildPayload(preset = {}) {
    return createPaymentPayload({
        text: preset?.text || "Pagamento de teste",
        amount: preset?.amount ?? 25.9,
        currency: preset?.currency || "BRL"
    })
}

export { parsePaymentArgs }

export function buildSendContent(preset = {}, { from, mentions } = {}) {
    const payload = buildPayload(preset)
    if (!payload.ok) {
        throw Object.assign(new Error(payload.error), { code: payload.error, usage: payload.usage, payload })
    }
    return buildPaymentContent(payload, { from, mentions })
}

/**
 * Por iteração: o valor/moeda/note são os validados do preset (não entra o
 * "\u200b" do laço dentro do note — nota de cobrança é dado do pagamento).
 */
export function makeIterationBuilder(preset = {}, ctx = {}) {
    const base = buildSendContent(preset, ctx)
    return () => ({ ...base, payment: { ...base.payment } })
}

export function describePaymentPreset(preset = {}) {
    const payload = buildPayload(preset)
    if (!payload.ok) return { ok: false, error: payload.error }
    return { ok: true, note: payload.text, amount: payload.amount, display: payload.display, currency: payload.currency }
}

```

### features/flood/presets/shopping.js — 51 linhas (2.2 KB)

```js
// features/flood/presets/shopping.js
// Presets do TIPO "shopping" do flood. Arquivo de DADOS: não importa nada do
// flood, não faz I/O, não conhece socket — assim config.js pode importá-lo sem
// ciclo e os testes validam cada preset com o adapter puro.
//
// Contrato (fonte: README "Shop Message" do fork + lib/Utils/messages.js:1020 —
//   no fork deste build, @lucasmod/boruto-vk7-baileys@2.1.0; no innovatorssoft
//   7.4.7 o mesmo ramo estava em ~1374):
//   sock.sendMessage(jid, { text, title, subtitle, footer, shop: { surface, id }, viewOnce? })
//     → interactiveMessage.shopStorefrontMessage { surface, id }
//
// Por que viewOnce: false aqui:
//   O README do fork mostra `viewOnce: true` em TODOS os exemplos de Shop
//   Message. Isso NÃO prova que o app do destinatário renderiza — e o wrap do
//   fork (viewOnceMessage { interactiveMessage }) é justamente o que produz
//   "mensagem indisponível" + "atualize o WhatsApp" sem atualização existir.
//   Por isso o preset vem com viewOnce: false e o adapter só manda a chave
//   quando o operador pedir true explicitamente.
//
// Por que surface: 1:
//   O proto só tem 0=UNKNOWN, 1=FB, 2=IG, 3=WA. O "4" do README não existe.

export const SHOPPING_PRESET_TEST = {
    id: "shopping-test",
    label: "🛍️ SYZYGY SHOP (teste)",
    type: "shopping",
    contentKind: "shopping",
    // format "text" = o corpo vai no atalho { text } (ramo 'text' in message do
    // ramo shop), não em caption/mídia.
    format: "text",
    // Corpo usado quando o operador responde "0" no wizard (default honesto,
    // sem depender do texto digitado).
    text: "🛍️ SYZYGY SHOP — novidades da semana",
    title: "SYZYGY SHOP",
    subtitle: "Catalog",
    footer: "SYZYGY",
    shop: {
        surface: 1,
        id: "https://en.wikipedia.org/wiki/Shopping_cart"
    },
    viewOnce: false,
    // 'puro' = ramo shop puro do fork (sem messageVersion).
    // 'flow' = mesmo card pelo ramo nativeFlow+shop, que seta messageVersion:1
    // (é o A/B para o caso "payload limpo e o app ainda diz indisponível").
    delivery: "puro"
}

export const SHOPPING_PRESETS = [SHOPPING_PRESET_TEST]

export default SHOPPING_PRESETS

```

### features/flood/presets/shoppingBuilder.js — 68 linhas (3.1 KB)

```js
// features/flood/presets/shoppingBuilder.js
// [PRESET · ponte para o builder AB7 — NÃO substitui nada do shopping]
//
// Presets/shopping.js do AB7 é um arquivo de DADOS (SHOPPING_PRESETS) e foi
// escrito nesta arena com o contrato verificado no fork; a versão da arena
// antiga (01a0aaae) tinha os bugs de viewOnce/surface/header que já foram
// corrigidos aqui. Por isso ESTE arquivo é só a ADAPTAÇÃO de interface que o
// registry de presets precisa:
//
//   preset → src { text, title, subtitle, footer, shop:{surface,id}, viewOnce, delivery }
//          → createShoppingPayload   (features/flood/shopping.js — AB7, intacto)
//          → buildSendContent        (features/flood/engine.js — AB7, intacto)
//          → makeFloodContentBuilder (mesmo laço do executarFlood, AB7)
//
// Nenhum campo novo, nenhum proto cru, nenhum payment.

import { createShoppingPayload, SHOPPING_ERROR, ShoppingPayloadError } from "../shopping.js"
import { buildSendContent as gateSendContent, makeFloodContentBuilder, describeSendWire } from "../engine.js"
import { SHOPPING_DEFAULTS } from "../config.js"

export const TYPE = "shopping"

/** Só as chaves que o adapter de shopping lê — nada de campos de fila/limite. */
export function shoppingSrc(preset = {}) {
    const src = {}
    if (preset.text !== undefined) src.text = preset.text
    if (preset.title !== undefined) src.title = preset.title
    if (preset.subtitle !== undefined) src.subtitle = preset.subtitle
    if (preset.footer !== undefined) src.footer = preset.footer
    if (preset.viewOnce !== undefined) src.viewOnce = preset.viewOnce
    if (preset.delivery !== undefined) src.delivery = preset.delivery
    if (preset.nativeFlow !== undefined) src.nativeFlow = preset.nativeFlow
    const shop = preset.shop && typeof preset.shop === "object" ? preset.shop : {}
    const shopSrc = {}
    if (shop.surface !== undefined) shopSrc.surface = shop.surface
    if (shop.id !== undefined) shopSrc.id = shop.id
    if (Object.keys(shopSrc).length) src.shop = shopSrc
    return src
}

/** Payload + meta + avisos, exatamente como o wizard da loja já recebe. */
export function buildShoppingPayload(preset = {}) {
    try {
        return createShoppingPayload(shoppingSrc(preset), { defaults: { ...SHOPPING_DEFAULTS } })
    } catch (e) {
        if (e instanceof ShoppingPayloadError) throw e
        throw new ShoppingPayloadError(SHOPPING_ERROR.SRC_INVALID, `falha ao montar o card: ${e?.message || e}`)
    }
}

export function buildSendContent(preset = {}) {
    const built = buildShoppingPayload(preset)
    // A ÚLTIMA porteira é a do engine AB7 (surface 1..3, sem wrap, sem chaves
    // vazias) — o preset não tem como passar por fora dela.
    // businessOwnerJid NÃO entra: no contrato do card de loja o fork não lê esse
    // campo (ele pertence ao ramo product). Não inventamos chave.
    return gateSendContent(built.content)
}

export function makeIterationBuilder(preset = {}) {
    const built = buildShoppingPayload(preset)
    return makeFloodContentBuilder(built.content)
}

export function describeShoppingWire(preset = {}) {
    return describeSendWire(buildShoppingPayload(preset).content)
}

```

### features/flood/presets/custom.js — 56 linhas (2.2 KB)

```js
// features/flood/presets/custom.js
// [PRESET · recuperado da arena 01a0aaae — dispatcher fino]
// "custom" não tem builder próprio de conteúdo: ele DELEGA para o builder do
// tipo real (customType, caindo em type). Assim um preset custom nunca escapa
// dos limites nem da validação do tipo que imita — e o shopping continua sendo
// montado pelo builder ATUAL do AB7 (features/flood/presets/shoppingBuilder.js →
// shopping.js/engine.js), não pela versão antiga.

import { buildSendContent as buildText, makeIterationBuilder as iterText } from "./text.js"
import { buildSendContent as buildMention, makeIterationBuilder as iterMention } from "./mention.js"
import { buildSendContent as buildMedia, makeIterationBuilder as iterMedia } from "./media.js"
import { buildSendContent as buildPayment, makeIterationBuilder as iterPayment } from "./payment.js"
import { buildSendContent as buildShopping, makeIterationBuilder as iterShopping } from "./shoppingBuilder.js"

export const TYPE = "custom"

export const CUSTOM_TARGETS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment,
    shopping: buildShopping
}

const ITER_BUILDERS = {
    text: iterText,
    mention: iterMention,
    media: iterMedia,
    payment: iterPayment,
    shopping: iterShopping
}

export function customTypeOf(preset = {}) {
    const t = String(preset?.customType || preset?.type || "text").toLowerCase()
    return CUSTOM_TARGETS[t] ? t : "text"
}

/** Tipo desconhecido NÃO vira texto em silêncio: marca o desvio no meta. */
export function buildSendContent(preset = {}, ctx = {}) {
    const requested = String(preset?.customType || preset?.type || "text").toLowerCase()
    const t = customTypeOf(preset)
    if (!CUSTOM_TARGETS[requested]) {
        throw Object.assign(new Error("CUSTOM_TYPE_UNSUPPORTED"), {
            code: "CUSTOM_TYPE_UNSUPPORTED",
            message: `preset custom com type '${requested || "(vazio)"}' — aceitos: ${Object.keys(CUSTOM_TARGETS).join(", ")}`,
            usedFallback: t
        })
    }
    return CUSTOM_TARGETS[t](preset, ctx)
}

export function makeIterationBuilder(preset = {}, ctx = {}) {
    const t = customTypeOf(preset)
    return ITER_BUILDERS[t](preset, ctx)
}

```

### menus/configMenu.js — 261 linhas (14.1 KB)

```js
// menus/configMenu.js
// [v46] Config REORGANIZADA em duas seções separadas:
//   👤 CONFIGURAÇÕES (ADMs do bot)  → números 1-11
//   👑 COMANDOS DO DONO (restrito)  → números 12-47  (36-45 = 🛡️ FLOOD · CONTROLES)
// O parser rápido (5/NN) usa CONFIG_OPCOES dinamicamente — renumerar aqui
// atualiza os comandos rápidos automaticamente.

import { getSock } from "../connection/socket.js"
import { CONFIG, FLOOD_MODOS, uiModoEfetivo } from "../utils/config.js"
import { setState } from "../utils/stateManager.js"
import { ok, err } from "../utils/terminalUI.js"
import { safeSendMessage } from "../services/groupService.js"
import { VIEW_ONCE_CONFIG } from "../features/viewOnce/config.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { criarBotao } from "../utils/botoes.js"

// [v55] Rótulos das opções para a interface interativa — MESMOS títulos do
// menu TXT (paridade 1:1 com CONFIG_OPCOES: toda opção tem row, toda row tem
// id roteado — o E2E v55 valida isso). O modo TXT continua com a arte original.
export const CONFIG_ROTULOS_ADM = [
    ["1", "Ver proprietario"], ["2", "Numero conectado"], ["3", "Status da conexao"],
    ["4", "Historico"], ["5", "Relatorio completo"], ["6", "Agendamentos"],
    ["7", "Listar ADMs do bot"], ["8", "Listar grupos autz"], ["9", "Listar donos"],
    ["10", "Marcar fantasma"], ["11", "Voltar ao menu"]
]
export const CONFIG_ROTULOS_DONO = [
    ["12", "Criar preset"], ["13", "Apagar preset"], ["14", "Imagem do menu"],
    ["15", "Link de divulgacao"], ["16", "Ler mais"], ["17", "Modo do flood"],
    ["18", "Intervalo do flood"], ["19", "Lote do flood"], ["20", "Auto-limpeza"],
    ["21", "Anti-takeover"], ["22", "Limpar fantasmas"], ["23", "Limpar agendamentos"],
    ["24", "+ Add ADM do bot"], ["25", "- Remover ADM"], ["26", "+ Add grupo autz"],
    ["27", "- Remover grupo"], ["28", "+ Add dono extra"], ["29", "- Remover dono"],
    ["30", "ViewOnce ON/OFF"], ["31", "VO -> grupos"], ["32", "VO -> owner"],
    ["33", "VO -> ADMs"], ["34", "VO salvar"],
    // [FLOOD v2 + restauração 01a0aaae] 36-39 são as MESMAS opções que a arena antiga
    // tinha (mesmo número, mesmo nome); 40-46 são os controles novos da AB7; voltar
    // virou 47 (35 continua valendo como voltar).
    ["36", "Flood presets (load-test)"], ["37", "Flood dry-run"], ["38", "Escolher grupos (1,3,5)"],
    ["39", "Kill switch do flood"],
    ["40", "Allowlist: listar"], ["41", "Allowlist: + grupo"], ["42", "Allowlist: - grupo"],
    ["43", "Velocidade do flood (presets)"], ["44", "Modo teste (payment/loja)"],
    ["45", "Loja: preview do card"], ["46", "Raio-X do flood"], ["47", "Voltar ao menu"]
]

// [v55] Renderer interativo do painel de configuração — MESMA fonte
// (CONFIG_OPCOES) e MESMO estado (config_menu: digitar o número continua
// funcionando em qualquer modo). Exclusivo com o TXT: quem decide é o
// uiMode do config.json (decisão no topo de enviarSubmenuConfig).
async function enviarConfigInterativo(jid, ownerKey, modo = "adm") {
    const dono = modo === "dono"
    const rotulos = dono ? CONFIG_ROTULOS_DONO : CONFIG_ROTULOS_ADM
    const rows = rotulos.map(([n, t]) => ({
        title: `${n.padStart(2, "0")} ${t}`,
        description: "",
        id: CONFIG_OPCOES[n]
    }))
    // [FLOOD v2] com 36-46 a lista passou de 10 linhas → o single_select do
    // WhatsApp corta section acima de 10; dividimos em páginas de 10.
    const sections = []
    for (let i = 0; i < rows.length; i += 10) {
        sections.push({
            title: `${dono ? "👑 DONO" : "👤 CONFIG"} ${rotulos[i][0]}-${rotulos[Math.min(i + 9, rotulos.length - 1)][0]}`,
            rows: rows.slice(i, i + 10)
        })
    }
    const botoes = [criarBotao("single_select", {
        title: dono ? " DONO" : " CONFIG",
        text: dono ? "Comandos do dono (12-47)" : "Configuracoes (1-11)",
        buttonText: " SELECIONAR",
        sections
    })]
    const texto = dono
        ? `👑 𝗖𝗢𝗠𝗔𝗡𝗗𝗢𝗦 𝗗𝗢 𝗗𝗢𝗡𝗢
🔒 acesso restrito ao dono

_Toque em uma opção (12-47) ou digite o número_`
        : `⚙️ 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗖̧𝗢𝗘𝗦
👤 ADMs do bot podem usar

_Toque em uma opção (1-11) ou digite o número_`
    if (ownerKey) setState(ownerKey, { action: "config_menu" })
    await enviarMensagemInterativa(jid, texto, botoes)
}

// Mapa único de opções (a UI é que separa por faixa de número)
export const CONFIG_OPCOES = {
    "0": "abrir_painel",
    // ── 👤 ADM (1-11) ──────────────────────────────────────
    "1": "cfg_owner",
    "2": "cfg_number",
    "3": "cfg_status",
    "4": "cfg_historico",
    "5": "cfg_relatorio",
    "6": "cfg_agendamentos",
    "7": "cfg_list_users",
    "8": "cfg_list_groups",
    "9": "cfg_list_owners",
    "10": "cfg_fantasma",
    "11": "abrir_painel",
    // ── 👑 DONO (12-47) ────────────────────────────────────
    "12": "cfg_criar_preset",
    "13": "cfg_apagar_preset",
    "14": "cfg_menuImage",
    "15": "cfg_link",
    "16": "cfg_ler_mais",
    "17": "cfg_flood_modo",
    "18": "cfg_flood_interval",
    "19": "cfg_flood_lote",
    "20": "cfg_autolimpeza",
    "21": "cfg_antitakeover",
    "22": "cfg_limpar_fantasmas",
    "23": "cfg_limpar_agendamentos",
    "24": "cfg_add_user",
    "25": "cfg_remove_user",
    "26": "cfg_add_group",
    "27": "cfg_remove_group",
    "28": "cfg_add_owner",
    "29": "cfg_remove_owner",
    "30": "cfg_viewonce_toggle",
    "31": "cfg_viewonce_groups",
    "32": "cfg_viewonce_owner",
    "33": "cfg_viewonce_admins",
    "34": "cfg_viewonce_save",
    "35": "abrir_painel",
    // ── 🛡️ FLOOD · CONTROLES (36-47) ───────────────────────
    "36": "painel_flood_presets",
    "37": "cfg_flood_dryrun",
    "38": "cfg_flood_allowlist",
    "39": "cfg_flood_kill",
    "40": "cfg_flood_allowlist_view",
    "41": "cfg_flood_allowlist_add",
    "42": "cfg_flood_allowlist_remove",
    "43": "cfg_flood_speed",
    "44": "cfg_flood_testmode",
    "45": "cfg_flood_loja",
    "46": "cfg_flood_xray",
    "47": "abrir_painel"
}

export async function enviarSubmenuConfig(jid, ownerKey, modo = "adm") {
    const sock = getSock()
    // [v55] DECISÃO CENTRAL DE MODO: buttons → SOMENTE interativo;
    // text/txt/bloks → SOMENTE o TXT original (nunca os dois).
    if (uiModoEfetivo() === "buttons") {
        return enviarConfigInterativo(jid, ownerKey, modo)
    }
    if (ownerKey) setState(ownerKey, { action: "config_menu" })

    const qtdUsers = (CONFIG.usuariosAutorizados || []).length + (CONFIG.lidsAutorizados || []).length
    const qtdGroups = (CONFIG.gruposAutorizados || []).length
    const qtdOwners = (CONFIG.donosExtras || []).length
    const floodModo = CONFIG.floodModo || "normal"
    const modoInfo = FLOOD_MODOS[floodModo] ? `${FLOOD_MODOS[floodModo].intervalo}ms/l${FLOOD_MODOS[floodModo].lote}` : ""

    if (modo === "dono") {
        const voEnabled = VIEW_ONCE_CONFIG.enabled ? "LIGADO" : "DESLIGADO"
        const voGroups = VIEW_ONCE_CONFIG.sendToAuthorizedGroups ? "SIM" : "NAO"
        const voOwner = VIEW_ONCE_CONFIG.sendToOwner ? "SIM" : "NAO"
        const voAdmins = VIEW_ONCE_CONFIG.sendToAdmins ? "SIM" : "NAO"
        const voSave = VIEW_ONCE_CONFIG.saveToDisk ? "DISCO (apaga depois)" : "SÓ BUFFER"

        let t = `╭━━「 👑 𝗖𝗢𝗠𝗔𝗡𝗗𝗢𝗦 𝗗𝗢 𝗗𝗢𝗡𝗢 」━━\n`
        t += `┃ 🔒 acesso restrito ao dono\n`
        t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
        t += `╭─〔 🎨 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 〕──────────\n`
        t += `┃ ⬥ 12 · Criar preset\n`
        t += `┃ ⬥ 13 · Apagar preset\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🖼️ 𝗔𝗣𝗔𝗥Ê𝗡𝗖𝗜𝗔 〕──────────\n`
        t += `┃ ⬥ 14 · Imagem do menu\n`
        t += `┃ ⬥ 15 · Link/numero divulgação\n`
        t += `┃      atual: ${CONFIG.linkDivulgacao ? "definido" : "(nenhum)"}\n`
        t += `┃ ⬥ 16 · 📖 Ler mais: ${CONFIG.lerMais ? "LIGADO" : "DESLIGADO"}\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🌊 𝗙𝗟𝗢𝗢𝗗 〕───────────────\n`
        t += `┃ ⬥ 17 · Modo: ${floodModo} (${modoInfo})\n`
        t += `┃ ⬥ 18 · Intervalo: ${CONFIG.floodInterval}ms\n`
        t += `┃ ⬥ 19 · Lote: ${CONFIG.floodLote}\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🛡️ 𝗦𝗜𝗦𝗧𝗘𝗠𝗔 〕─────────────\n`
        t += `┃ ⬥ 20 · Auto-limpeza: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}\n`
        t += `┃ ⬥ 21 · Anti-takeover: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}\n`
        t += `┃ ⬥ 22 · Limpar grupos fantasmas\n`
        t += `┃ ⬥ 23 · Limpar agendamentos concl.\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🔐 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗢𝗘𝗦 〕───────────\n`
        t += `┃ ⬥ 24 · ➕ Add ADM do bot [${qtdUsers}]\n`
        t += `┃ ⬥ 25 · ➖ Remover ADM do bot\n`
        t += `┃ ⬥ 26 · ➕ Add grupo autorizado [${qtdGroups}]\n`
        t += `┃ ⬥ 27 · ➖ Remover grupo autorizado\n`
        t += `┃ ⬥ 28 · ➕ Add dono extra [${qtdOwners}]\n`
        t += `┃ ⬥ 29 · ➖ Remover dono extra\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 👁️ 𝗩𝗜𝗘𝗪𝗢𝗡𝗖𝗘 〕─────────────\n`
        t += `┃ ⬥ 30 · ViewOnce: ${voEnabled}\n`
        t += `┃ ⬥ 31 · → Grupos autz: ${voGroups}\n`
        t += `┃ ⬥ 32 · → Owner: ${voOwner}\n`
        t += `┃ ⬥ 33 · → ADMs: ${voAdmins}\n`
        t += `┃ ⬥ 34 · Salvar: ${voSave}\n`
        t += `╰───────────────────────\n`
        // ── 🛡️ FLOOD · CONTROLES — lidos da MESMA fonte do flood (features/flood/)
        let fx = null, fxErro = null
        try { fx = await import("../features/flood/index.js") } catch (e) { fxErro = e.message }
        const on = fx ? fx.isKillSwitchOn() : false
        const nAllow = fx ? fx.getAllowlist().length : 0
        const nPresets = fx ? fx.listPresets().length : 0
        const nCustom = fx ? (CONFIG.floodCustomPresets || []).length : 0
        const spd = `${CONFIG.floodModo || "normal"} (${CONFIG.floodInterval || "?"}ms/l${CONFIG.floodLote || "?"})`
        t += `╭─〔 🛡️ 𝗙𝗟𝗢𝗢𝗗 · 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 〕─────\n`
        if (fxErro) t += `┃ ⚠️ feature flood indisponível: ${fxErro}\n`
        t += `┃ ⬥ 36 · Flood presets (load-test) [${nPresets} + ${nCustom} custom]\n`
        t += `┃ ⬥ 37 · 🧪 Dry-run: ${CONFIG.floodDryRun === true ? "LIGADO (não envia)" : "DESLIGADO (envia de verdade)"}\n`
        t += `┃ ⬥ 38 · 🎯 Escolher grupos (1,3,5)\n`
        t += `┃ ⬥ 39 · ${on ? "▶️ Liberar" : "🛑 Bloquear"} flood · atual: ${on ? "BLOQUEADO" : "liberado"}\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🛡️ 𝗙𝗟𝗢𝗢𝗗 · 𝗖𝗢𝗡𝗧𝗥𝗢𝗟𝗘𝗦 〕─────\n`
        t += `┃ ⬥ 40 · 🛡️ Allowlist de destino [${nAllow}]\n`
        t += `┃ ⬥ 41 · ➕ Add grupo na allowlist\n`
        t += `┃ ⬥ 42 · ➖ Remover da allowlist\n`
        t += `┃ ⬥ 43 · 🚀 Velocidade ( presets )\n`
        t += `┃      atual: ${spd}\n`
        t += `┃ ⬥ 44 · 🧪 Modo teste: ${CONFIG.floodTestMode !== false ? "LIGADO" : "DESLIGADO"}\n`
        t += `┃      ⚠️ payment/loja só disparam com ele LIGADO\n`
        t += `┃ ⬥ 45 · 🛍️ Loja: preview do card (não envia)\n`
        t += `┃ ⬥ 46 · 🩺 Raio-X do flood\n`
        t += `╰───────────────────────\n`
        t += ` 47 · ⬅️ Voltar ao menu\n\n`
        t += `_Atalhos de texto: floodpresets · paymenttest · shoppingtest · texttest · mentiontest · mediatest · floodstop · floodstart · flooddryrun · 2/preset/<id>_\n\n`
        t += `_📖 LIGADO: mensagens dobram após o título\n(⚡ SYZYGY) via caracteres invisíveis; o corte\né do app do WhatsApp e pode não dobrar no\niPhone. DESLIGADO: mostra tudo inteiro._\n\n`
        t += `_Digite o número (12-47) · cancelar = sair_\n`
        t += `▬▬▬▬▬▬▬▬▬▬▬▬▬\n⚔️ SYZYGY`
        await safeSendMessage(jid, { text: t }, 0)
        return
    }

    // modo "adm" — configurações que ADMs do bot podem usar
    let t = `╭━━「 ⚙️ 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗖̧𝗢𝗘𝗦 」━━━\n`
    t += `┃ 👤 ADMs do bot podem usar\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += ` 1 · 👤 Ver proprietário\n`
    t += ` 2 · 📱 Número conectado\n`
    t += ` 3 · 📡 Status da conexão\n`
    t += ` 4 · 📜 Histórico (últimas ações)\n`
    t += ` 5 · 📊 Relatório completo\n`
    t += ` 6 · ⏰ Agendamentos\n`
    t += ` 7 · 👤 Listar ADMs do bot [${qtdUsers}]\n`
    t += ` 8 · 👥 Listar grupos autorizados [${qtdGroups}]\n`
    t += ` 9 · 👑 Listar donos [${qtdOwners}]\n`
    t += `10 · 👻 Marcar fantasma: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}\n`
    t += `11 · ⬅️ Voltar ao menu\n\n`
    t += `_Comandos de DONO: opção 5 do menu_\n`
    t += `_Digite o número · cancelar = sair_\n`
    t += `▬▬▬▬▬▬▬▬▬▬▬▬▬\n⚔️ SYZYGY`
    await safeSendMessage(jid, { text: t }, 0)
}

// [v45] Painel do dono = seção 👑 da config (números 12-47 desde os controles do flood)
export async function enviarPainelDono(jid, ownerKey) {
    return enviarSubmenuConfig(jid, ownerKey, "dono")
}

```

### services/groupService.js — 669 linhas (29.3 KB)

```js
// services/groupService.js
// [v29] Ultra rápido: throttle reduzido, lotes maiores, roubar paralelo, blindagem.

import fs from "fs"
import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber, isAuthorizedGroup } from "../utils/permissions.js"
import { err, ok, warn } from "../utils/terminalUI.js"
import { CONFIG, MAX_FLOOD, FLOOD_MODOS } from "../utils/config.js"
// [INFRA FLOOD] Kill switch dos presets, recuperado da arena 01a0aaae.
// Import direto (não passa por features/flood/index.js) para não arrastar o resto da
// feature para dentro do serviço mais quente do projeto.
import { isKillSwitchOn } from "../features/flood/killswitch.js"
import { prepararFoto, prepararFotoBuffer, fetchImagem } from "./mediaService.js"

function isProtectedGroup(jid) {
    try { return isAuthorizedGroup(jid) } catch { return false }
}

// Throttle leve para metadata (200ms) + fila serializada
let _lastMetaTs = 0
let _metaQueue = Promise.resolve()
export async function throttledGroupMetadata(jid) {
    const task = async () => {
        const now = Date.now()
        const elapsed = now - _lastMetaTs
        if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed))
        _lastMetaTs = Date.now()
        const meta = await getSock().groupMetadata(jid)
        setCachedGroupMeta(jid, meta)
        try {
            const { atualizarMapaDeParticipantes } = await import("./lidResolver.js")
            atualizarMapaDeParticipantes(meta.participants)
        } catch {}
        return meta
    }
    const res = _metaQueue.then(task, task)
    _metaQueue = res.catch(() => {})
    return res
}

function getCachedGroupMeta(jid) {
    const c = rt().cachedGroups?.[jid]
    if (!c) return null
    return c._fullMeta || null
}

function setCachedGroupMeta(jid, meta) {
    if (!rt().cachedGroups) rt().cachedGroups = {}
    if (!rt().cachedGroups[jid]) rt().cachedGroups[jid] = { subject: meta.subject || "Sem nome", isAdmin: false }
    rt().cachedGroups[jid]._fullMeta = meta
    if (Array.isArray(meta.participants)) {
        rt().cachedGroups[jid].participants = meta.participants
        rt().cachedGroups[jid].participantsIds = meta.participants.map(p => p.id)
    }
}

async function getParticipantsCachedOrFetch(jid) {
    const cached = rt().cachedGroups?.[jid]
    if (cached?.participants && Array.isArray(cached.participants) && cached.participants.length) {
        return cached.participants
    }
    if (cached?.participantsIds && cached.participantsIds.length) {
        return cached.participantsIds.map(id => ({ id }))
    }
    try {
        const meta = await throttledGroupMetadata(jid)
        return meta.participants
    } catch { return [] }
}

export async function safeSendMessage(jid, content, retries = 1) {
    const sock = getSock()
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await sock.sendMessage(jid, content)
        } catch (e) {
            const msg = String(e.message || "").toLowerCase()
            const isRate = msg.includes("rate-overlimit") || msg.includes("rate") || e.data === 429
            if (isRate && attempt < retries) {
                const delay = 800 * (attempt + 1) + Math.floor(Math.random() * 300)
                await new Promise(r => setTimeout(r, delay))
                continue
            }
            throw e
        }
    }
}

export async function resolverGrupoInput(input) {
    const sock = getSock()
    let jid = input.trim()
    if (jid.includes("whatsapp.com")) {
        const codigo = jid.split("/").pop().split("?")[0]
        const g = await sock.groupGetInviteInfo(codigo)
        jid = g.id
    }
    return jid
}

export async function alterarNomeGrupo(jid, nome) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — não pode alterar nome")
    await getSock().groupUpdateSubject(jid, nome)
}

export async function alterarBioGrupo(jid, bio) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — não pode alterar bio")
    await getSock().groupUpdateDescription(jid, bio)
}


// [v58] TROCA DE FOTO COM RETRY — a foto é o ÚNICO passo de roubar/nuke que
// depende da CONEXÃO DE MÍDIA (upload HTTP). Bug conhecido do fork
// (@lucasmod/boruto-vk7-baileys 2.1.0, e já valia no innovatorssoft 7.4.7): se UMA busca de media_conn falhar, a
// promise rejeitada fica NO CACHE e todos os uploads seguintes falham até
// reconectar ("depois de um tempo a foto não muda mais" — nome/bio/fechar
// continuam porque vão pelo canal de sinal). Aqui: retry com backoff +
// renovação da media_conn + motivo REAL no erro (nunca engolido).
export async function trocarFotoComRetry(jid, prepararBuf, tentativas = 3) {
    const sock = getSock()
    let ultimoErro = null
    for (let t = 1; t <= tentativas; t++) {
        try {
            const buf = await prepararBuf()
            await sock.updateProfilePicture(jid, buf)
            if (t > 1) console.log(ok(`[FOTO] recuperou na tentativa ${t} -> ${jid}`))
            return true
        } catch (e) {
            ultimoErro = e
            console.log(warn(`[FOTO] tentativa ${t}/${tentativas} falhou (${jid}): ${e.message}`))
            if (t >= tentativas) break
            try {
                if (typeof sock.refreshMediaConn === "function") await sock.refreshMediaConn(true)
            } catch (eRefresh) {
                throw new Error(`conexão de mídia morta no cache do fork (${eRefresh.message || eRefresh}) — REINICIE o bot para restaurar os uploads`)
            }
            await new Promise(r => setTimeout(r, 1500 * t))
        }
    }
    throw ultimoErro
}

export async function alterarFotoGrupoArquivo(jid, caminho) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — não pode alterar foto")
    if (!fs.existsSync(caminho)) throw new Error("Arquivo não encontrado")
    await trocarFotoComRetry(jid, () => prepararFoto(caminho))
}

export async function alterarFotoGrupoURL(jid, url) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    const raw = await fetchImagem(url)
    await trocarFotoComRetry(jid, () => prepararFotoBuffer(raw))
}

export async function alterarFotoGrupoBuffer(jid, buffer) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    await trocarFotoComRetry(jid, () => prepararFotoBuffer(buffer))
}

export async function removerFotoGrupo(jid) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    const sock = getSock()
    if (typeof sock.removeProfilePicture === "function") {
        await sock.removeProfilePicture(jid)
        return true
    }
    return false
}

export async function executarNuke(jid) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — NUKE bloqueado")
    const sock = getSock()
    const resumo = { foto: false, nome: false, bio: false, fechado: false, removidos: 0, erros: [] }
    try {
        let fotoPath = null
        if (fs.existsSync("./foto.jpg")) fotoPath = "./foto.jpg"
        else if (CONFIG.menuImage && fs.existsSync(CONFIG.menuImage)) fotoPath = CONFIG.menuImage
        if (fotoPath) {
            await trocarFotoComRetry(jid, () => prepararFoto(fotoPath))
            resumo.foto = true
        } else {
            // [v58] foto "-" sempre com motivo: sem imagem configurada não é
            // falha de upload, mas o usuário precisa saber POR QUE não mudou.
            resumo.erros.push("foto: sem imagem configurada (use ./foto.jpg ou config menuImage)")
        }
    } catch (e) { resumo.erros.push(`foto: ${e.message}`) }
    try { await sock.groupUpdateSubject(jid, CONFIG.nome); resumo.nome = true } catch (e) { resumo.erros.push(`nome: ${e.message}`) }
    try { await sock.groupUpdateDescription(jid, CONFIG.bio); resumo.bio = true } catch (e) { resumo.erros.push(`bio: ${e.message}`) }
    try { await sock.groupSettingUpdate(jid, "announcement"); resumo.fechado = true } catch (e) { resumo.erros.push(`fechar: ${e.message}`) }
    try {
        const participants = await getParticipantsCachedOrFetch(jid)
        const botNum = normalizeNumber(sock.user.id)
        const rem = participants
            .filter(p => { const n = normalizeNumber(p.id); const l = normalizeNumber(p.lid || ""); const dono = normalizeNumber(getOwnerNumber()); const botL = normalizeNumber(sock.user?.lid || ""); const protegido = n === botNum || l === botNum || (botL && (n === botL || l === botL)) || (dono && (n === dono || l === dono)); return !protegido; })
            .map(p => p.id)
        if (rem.length > 0) {
            try {
                await sock.groupParticipantsUpdate(jid, rem, "remove")
                resumo.removidos = rem.length
            } catch (e) { resumo.erros.push(`remover: ${e.message}`) }
        }
    } catch (e) { resumo.erros.push(`metadata: ${e.message}`) }
    return resumo
}

export async function alterarTudoGrupo(jid, { nome, bio, bufferFoto } = {}) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    const sock = getSock()
    const nomeFinal = nome || CONFIG.nome
    const bioFinal = bio || CONFIG.bio
    await sock.groupUpdateSubject(jid, nomeFinal)
    await sock.groupUpdateDescription(jid, bioFinal)
    // [v58] catch VAZIO REMOVIDO (regra do projeto): falha de foto volta com
    // o motivo real para quem chamou reportar.
    let fotoErro = null
    try {
        if (bufferFoto) {
            await trocarFotoComRetry(jid, () => prepararFotoBuffer(bufferFoto))
        } else {
            let fotoPath = null
            if (fs.existsSync("./foto.jpg")) fotoPath = "./foto.jpg"
            else if (CONFIG.menuImage && fs.existsSync(CONFIG.menuImage)) fotoPath = CONFIG.menuImage
            if (fotoPath) await trocarFotoComRetry(jid, () => prepararFoto(fotoPath))
        }
    } catch (eFoto) {
        fotoErro = eFoto.message
        console.log(warn(`[TUDO] foto falhou em ${jid}: ${fotoErro}`))
    }
    return { fotoErro }
}

export async function mencionarTodosFantasma(jid, texto = "") {
    let mentions = []
    try {
        const parts = await getParticipantsCachedOrFetch(jid)
        mentions = parts.map(p => p.id)
    } catch { return false }
    const corpo = (texto && String(texto).trim().length) ? texto : "\u2063"
    try {
        await safeSendMessage(jid, { text: corpo, mentions })
        return true
    } catch { return false }
}

export function getFloodConfig(modoOuIntervalo) {
    if (typeof modoOuIntervalo === "object" && modoOuIntervalo !== null) {
        const m = modoOuIntervalo.modo ? (FLOOD_MODOS[modoOuIntervalo.modo] || FLOOD_MODOS.normal) : null
        return {
            intervalo: modoOuIntervalo.intervaloMs ?? modoOuIntervalo.intervalo ?? m?.intervalo ?? CONFIG.floodInterval ?? 100,
            lote: modoOuIntervalo.lote ?? m?.lote ?? CONFIG.floodLote ?? 6,
            jitter: modoOuIntervalo.jitter ?? (modoOuIntervalo.modo === "seguro") ?? CONFIG.floodJitter ?? false,
            modo: modoOuIntervalo.modo || CONFIG.floodModo || "normal"
        }
    }
    if (typeof modoOuIntervalo === "string") {
        const key = modoOuIntervalo.toLowerCase()
        if (FLOOD_MODOS[key]) {
            return { intervalo: FLOOD_MODOS[key].intervalo, lote: FLOOD_MODOS[key].lote, jitter: key === "seguro", modo: key }
        }
        if (key === "1" || key === "rapido" || key === "rápido") return { intervalo: FLOOD_MODOS.rapido.intervalo, lote: FLOOD_MODOS.rapido.lote, jitter: false, modo: "rapido" }
        if (key === "2" || key === "normal") return { intervalo: FLOOD_MODOS.normal.intervalo, lote: FLOOD_MODOS.normal.lote, jitter: false, modo: "normal" }
        if (key === "3" || key === "lento") return { intervalo: FLOOD_MODOS.lento.intervalo, lote: FLOOD_MODOS.lento.lote, jitter: false, modo: "lento" }
        if (key === "4" || key === "seguro") return { intervalo: FLOOD_MODOS.seguro.intervalo, lote: FLOOD_MODOS.seguro.lote, jitter: true, modo: "seguro" }
        const num = parseInt(key.replace(/\D/g, ""))
        if (!isNaN(num) && num >= 20 && num <= 5000) {
            return { intervalo: num, lote: CONFIG.floodLote || 6, jitter: false, modo: "custom" }
        }
    }
    if (typeof modoOuIntervalo === "number") {
        return { intervalo: modoOuIntervalo, lote: CONFIG.floodLote || 6, jitter: false, modo: "custom" }
    }
    const modoCfg = FLOOD_MODOS[CONFIG.floodModo] || FLOOD_MODOS.normal
    return {
        intervalo: CONFIG.floodInterval ?? modoCfg.intervalo,
        lote: CONFIG.floodLote ?? modoCfg.lote,
        jitter: CONFIG.floodJitter ?? (CONFIG.floodModo === "seguro"),
        modo: CONFIG.floodModo || "normal"
    }
}

// [v29] Flood ultra rápido
export async function executarFlood(jid, msg, qtd, intervaloOuOpts = 100, buildContent = null) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — FLOOD bloqueado")
    const sock = getSock()
    qtd = Math.min(Math.max(1, qtd), MAX_FLOOD)

    const cfg = getFloodConfig(intervaloOuOpts)
    const intervaloMs = cfg.intervalo
    const LOTE = Math.max(1, Math.min(cfg.lote, 10))

    let mentions = []
    if (CONFIG.marcarFantasma) {
        try {
            const parts = await getParticipantsCachedOrFetch(jid)
            mentions = parts.map(p => p.id)
        } catch {}
    }

    const invis = "\u200b"
    let ok = 0, erros = 0

    let stopado = null
    let tentadas = 0
    for (let i = 0; i < qtd; i += LOTE) {
        // [INFRA FLOOD] O flood clássico NÃO tinha como ser interrompido. Agora o
        // kill switch dos presets é consultado aqui, na fronteira do lote (não no
        // meio de um Promise.all), e o resultado diz quantos de fato saíram.
        if (isKillSwitchOn()) { stopado = "KILL_SWITCH"; break }
        const n = Math.min(LOTE, qtd - i)
        tentadas += n
        const envios = []
        for (let k = 0; k < n; k++) {
            const idx = i + k
            const corpo = msg + invis.repeat((idx % 6) + 1)
            // CONTEÚDO por iteração. Sem builder, o comportamento é EXATAMENTE o
            // flood clássico ({ text }). Um TIPO de conteúdo (ex.: shopping) entra
            // pelo buildContent — mesmo laço, mesma fila, mesmo throttle, mesmas
            // permissões. Não existe executor de loja separado.
            let opts
            if (typeof buildContent === "function") {
                let custom = null
                try { custom = buildContent({ index: idx, body: corpo, msg }) } catch { custom = null }
                opts = custom && typeof custom === "object" ? custom : { text: corpo }
            } else {
                opts = { text: corpo }
            }
            // [INFRA FLOOD] "mentions" só é sobrescrito pelo marcarFantasma quando o
            // builder NÃO forneceu lista própria: preset de mention marca somente
            // destinos explicitamente autorizados, nunca todos os participantes.
            if (mentions.length && k === 0 && opts.mentions === undefined) opts.mentions = mentions
            envios.push(
                safeSendMessage(jid, opts, 0).then(() => { ok++ }).catch(() => { erros++ })
            )
        }
        await Promise.all(envios)
        if (i + LOTE < qtd) {
            let delay = intervaloMs
            if (cfg.jitter) delay += Math.floor(Math.random() * 250) + 50
            if (delay > 0) await new Promise(r => setTimeout(r, delay))
        }
    }
    return {
        ok,
        erros,
        total: qtd,
        tentadas,
        modo: cfg.modo,
        intervalo: intervaloMs,
        lote: LOTE,
        ...(stopado ? { stopado } : {})
    }
}

export async function executarFloodLote(grupos, msg, qtd, opts = {}) {
    // opts.buildContent (opcional) é repassado ao MESMO laço de executarFlood —
    // lote e loja compartilham exatamente o mesmo executor.
    const resultados = []
    const cfg = getFloodConfig(opts)
    const delayEntreGrupos = cfg.modo === "seguro" ? 600 : cfg.modo === "lento" ? 300 : cfg.modo === "rapido" ? 150 : 200
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        // [INFRA FLOOD] Kill switch também vale para o lote: o que ainda não
        // começou é reportado como cancelado em vez de ser enviado "para terminar".
        if (isKillSwitchOn()) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Flood cancelado (kill switch)", stopado: "KILL_SWITCH" })
            continue
        }
        if (isProtectedGroup(g.id)) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Grupo protegido (autorizado)" })
            continue
        }
        try {
            const r = await executarFlood(g.id, msg, qtd, cfg, typeof opts?.buildContent === "function" ? opts.buildContent : null)
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: true, ...r })
        } catch (e) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: e.message })
        }
        if (i < grupos.length - 1 && delayEntreGrupos > 0) await new Promise(r => setTimeout(r, delayEntreGrupos))
    }
    return resultados
}

export async function nukeComPreset(jid, { nome, bio, fotoPath, bufferFoto } = {}) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — NUKE bloqueado")
    const sock = getSock()
    const resumo = { foto: false, nome: false, bio: false, fechado: false, removidos: 0, erros: [] }
    let meta = null
    try {
        const parts = await getParticipantsCachedOrFetch(jid)
        meta = getCachedGroupMeta(jid) || { participants: parts }
        if (!meta.participants || !meta.participants.length) {
            meta = await throttledGroupMetadata(jid)
        }
    } catch (e) { resumo.erros.push(`metadata: ${e.message}`) }

    const tarefas = []
    if (meta && Array.isArray(meta.participants)) {
        const botNum = normalizeNumber(sock.user?.id)
        const botL = normalizeNumber(sock.user?.lid || "")
        const dono = normalizeNumber(getOwnerNumber())
        const rem = meta.participants.filter(p => {
            const n = normalizeNumber(p.id); const l = normalizeNumber(p.lid || "")
            const prot = n === botNum || l === botNum || (botL && (n === botL || l === botL)) || (dono && (n === dono || l === dono)) || p.id === meta.owner
            return !prot
        }).map(p => p.id)
        if (rem.length) {
            tarefas.push(sock.groupParticipantsUpdate(jid, rem, "remove")
                .then(() => { resumo.removidos = rem.length }).catch(e => resumo.erros.push(`remover: ${e.message}`)))
        }
    }
    tarefas.push(sock.groupSettingUpdate(jid, "announcement").then(() => { resumo.fechado = true }).catch(e => resumo.erros.push(`fechar: ${e.message}`)))
    if (nome) tarefas.push(sock.groupUpdateSubject(jid, nome).then(() => { resumo.nome = true }).catch(e => resumo.erros.push(`nome: ${e.message}`)))
    if (bio != null) tarefas.push(sock.groupUpdateDescription(jid, bio).then(() => { resumo.bio = true }).catch(e => resumo.erros.push(`bio: ${e.message}`)))
    tarefas.push((async () => {
        try {
            let buf = null
            if (bufferFoto) buf = await prepararFotoBuffer(bufferFoto)
            else if (fotoPath && fs.existsSync(fotoPath)) buf = await prepararFoto(fotoPath)
            if (buf) { await sock.updateProfilePicture(jid, buf); resumo.foto = true }
        } catch (e) { resumo.erros.push(`foto: ${e.message}`) }
    })())
    await Promise.all(tarefas)
    return resumo
}

export async function nukeComPresetLote(grupos, dadosPreset, opts = {}) {
    const resultados = []
    const delayEntre = 250
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        if (isProtectedGroup(g.id)) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Grupo protegido (autorizado)" })
            continue
        }
        try {
            if (opts.mensagem) {
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(g.id, opts.mensagem)
                    else await safeSendMessage(g.id, { text: opts.mensagem }, 0)
                    await new Promise(r => setTimeout(r, 120))
                } catch {}
            }
            const r = await nukeComPreset(g.id, dadosPreset)
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: true, ...r })
        } catch (e) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: e.message })
        }
        if (i < grupos.length - 1) await new Promise(r => setTimeout(r, delayEntre))
    }
    return resultados
}

// [v29] Roubar ultra rápido: fecha+tranca em paralelo, depois foto+nome+bio em paralelo, depois demote
export async function roubarGrupo(jid, { nome, bio, fotoPath, bufferFoto } = {}) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — ROUBAR bloqueado")
    const sock = getSock()
    const resumo = { rebaixados: 0, fechado: false, editRestrito: false, foto: false, nome: false, bio: false, erros: [] }
    const botNum = normalizeNumber(sock.user?.id)
    const botLid = normalizeNumber(sock.user?.lid)
    const donoNum = normalizeNumber(getOwnerNumber())
    const ehProtegido = (p) => {
        const n = normalizeNumber(p?.id || p?.jid || "")
        const l = normalizeNumber(p?.lid || "")
        return (botNum && (n === botNum || l === botNum))
            || (botLid && (n === botLid || l === botLid))
            || (donoNum && (n === donoNum || l === donoNum))
    }
    let meta = null
    try {
        const parts = await getParticipantsCachedOrFetch(jid)
        meta = getCachedGroupMeta(jid) || { participants: parts }
        if (!meta.participants || meta.participants.length !== parts.length) {
            try {
                const full = await throttledGroupMetadata(jid)
                meta = full
            } catch {}
        }
    } catch (e) { resumo.erros.push(`metadata: ${e.message}`) }

    // Fecha + tranca em paralelo (rápido)
    try {
        const t1 = []
        t1.push(sock.groupSettingUpdate(jid, "announcement").then(() => { resumo.fechado = true }).catch(e => resumo.erros.push(`fechar: ${e.message}`)))
        t1.push(sock.groupSettingUpdate(jid, "locked").then(() => { resumo.editRestrito = true }).catch(e => resumo.erros.push(`locked: ${e.message}`)))
        await Promise.all(t1)
    } catch {}

    // Foto + nome + bio em paralelo
    try {
        const t2 = []
        t2.push((async () => {
            try {
                if (bufferFoto) { await trocarFotoComRetry(jid, () => prepararFotoBuffer(bufferFoto)); resumo.foto = true }
                else if (fotoPath && fs.existsSync(fotoPath)) { await trocarFotoComRetry(jid, () => prepararFoto(fotoPath)); resumo.foto = true }
            } catch (e) { resumo.erros.push(`foto: ${e.message}`) }
        })())
        if (nome) t2.push(sock.groupUpdateSubject(jid, nome).then(() => { resumo.nome = true }).catch(e => resumo.erros.push(`nome: ${e.message}`)))
        if (bio != null) t2.push(sock.groupUpdateDescription(jid, bio).then(() => { resumo.bio = true }).catch(e => resumo.erros.push(`bio: ${e.message}`)))
        await Promise.all(t2)
    } catch {}

    // Demote por último
    try {
        if (meta && Array.isArray(meta.participants)) {
            const admins = meta.participants
                .filter(p => (p.admin === "admin" || p.admin === "superadmin") && !ehProtegido(p))
                .map(p => p.id)
            if (admins.length > 0) {
                await sock.groupParticipantsUpdate(jid, admins, "demote")
                resumo.rebaixados = admins.length
            }
        }
    } catch (e) { resumo.erros.push(`demote: ${e.message}`) }

    return resumo
}

export async function roubarGrupoLote(grupos, dadosPreset, opts = {}) {
    const resultados = []
    const delayEntre = 250
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        if (isProtectedGroup(g.id)) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Grupo protegido (autorizado)" })
            continue
        }
        try {
            if (opts.mensagem || CONFIG.linkDivulgacao) {
                const msg = opts.mensagem || CONFIG.linkDivulgacao
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(g.id, msg)
                    else await safeSendMessage(g.id, { text: msg }, 0)
                    await new Promise(r => setTimeout(r, 100))
                } catch {}
            }
            const r = await roubarGrupo(g.id, dadosPreset)
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: true, ...r })
        } catch (e) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: e.message })
        }
        if (i < grupos.length - 1) await new Promise(r => setTimeout(r, delayEntre))
    }
    return resultados
}

export async function validarGrupoExiste(jid) {
    const sock = getSock()
    try {
        await throttledGroupMetadata(jid)
        return true
    } catch {
        return false
    }
}

export async function limparCacheFantasmas(forcar = false) {
    const sock = getSock()
    if (!sock) return { removidos: 0, verificados: 0, lista: [] }
    try {
        const grupos = await sock.groupFetchAllParticipating()
        const idsReais = new Set(Object.keys(grupos))
        const cache = rt().cachedGroups || {}
        const idsCache = Object.keys(cache)
        const fantasmas = idsCache.filter(id => !idsReais.has(id))
        let removidos = 0
        const lista = []
        for (const id of fantasmas) {
            if (forcar) {
                lista.push({ id, subject: cache[id]?.subject || id })
                delete rt().cachedGroups[id]
                removidos++
            } else {
                const existe = await validarGrupoExiste(id)
                if (!existe) {
                    lista.push({ id, subject: cache[id]?.subject || id })
                    delete rt().cachedGroups[id]
                    removidos++
                }
            }
        }
        return { removidos, verificados: idsCache.length, lista, totalReais: idsReais.size }
    } catch (e) {
        console.log(err(`limparCacheFantasmas: ${e.message}`))
        return { removidos: 0, verificados: 0, lista: [], erro: e.message }
    }
}

let _ultimaAtualizacao = 0
const GRUPOS_TTL_MS = 30 * 1000

export async function atualizarGrupos(forcar = false) {
    const sock = getSock()
    if (!forcar && Date.now() - _ultimaAtualizacao < GRUPOS_TTL_MS && Object.keys(rt().cachedGroups || {}).length) {
        return rt().cachedGroups
    }
    try {
        const grupos = await sock.groupFetchAllParticipating()
        const botNum = normalizeNumber(sock.user?.id)
        const botLid = normalizeNumber(sock.user?.lid)
        const lista = Object.values(grupos)

        const ehBot = (p) => {
            const pNum = normalizeNumber(p.id || p.jid || "")
            const pLid = normalizeNumber(p.lid || "")
            return (botNum && (pNum === botNum || pLid === botNum))
                || (botLid && (pNum === botLid || pLid === botLid))
        }
        const admDe = (parts) => {
            if (!Array.isArray(parts)) return false
            const me = parts.find(ehBot)
            return !!(me && (me.admin === "admin" || me.admin === "superadmin"))
        }

        const novo = {}
        const faltando = []
        for (const g of lista) {
            try {
                const { atualizarMapaDeParticipantes } = await import("./lidResolver.js")
                if (Array.isArray(g.participants)) atualizarMapaDeParticipantes(g.participants)
            } catch {}
            if (Array.isArray(g.participants) && g.participants.length) {
                novo[g.id] = {
                    subject: g.subject || "Sem nome",
                    isAdmin: admDe(g.participants),
                    participants: g.participants,
                    participantsIds: g.participants.map(p => p.id),
                    _fullMeta: g
                }
            } else {
                novo[g.id] = { subject: g.subject || "Sem nome", isAdmin: false }
                faltando.push(g.id)
            }
        }
        if (faltando.length) {
            const LOTE = 6
            for (let i = 0; i < faltando.length; i += LOTE) {
                const parte = faltando.slice(i, i + LOTE)
                await Promise.all(parte.map(async (id) => {
                    try {
                        const meta = await throttledGroupMetadata(id)
                        novo[id] = {
                            subject: meta.subject || novo[id]?.subject || "Sem nome",
                            isAdmin: admDe(meta.participants),
                            participants: meta.participants,
                            participantsIds: meta.participants.map(p => p.id),
                            _fullMeta: meta
                        }
                    } catch {}
                }))
                if (i + LOTE < faltando.length) await new Promise(r => setTimeout(r, 200))
            }
        }

        rt().cachedGroups = novo
        _ultimaAtualizacao = Date.now()
    } catch (e) {
        console.log(err(`atualizarGrupos: ${e.message}`))
    }
    return rt().cachedGroups
}

export async function cachedGroupMetadata(jid) {
    const c = rt().cachedGroups?.[jid]
    if (c?._fullMeta && Array.isArray(c._fullMeta.participants)) return c._fullMeta
    if (c?.participants && Array.isArray(c.participants)) {
        return { id: jid, subject: c.subject, participants: c.participants }
    }
    return undefined
}

```

---

## 10. Descritos, não anexados (28)

### handlers/stateHandler.js — 1803 linhas (98.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [REORGANIZAÇÃO] Tratador de estados (input texto/imagem) + processarSelecaoGrupo.
// [v22] Multi-seleção, flood em ondas, agendamento, limpeza, histórico, anti-takeover.
```

Exportações (assinaturas exatas):

```ts
export async function handleEstado(chatJid, ownerKey, st, text, imgInfo, m)
export async function processarSelecaoGrupo(chatJid, ownerKey, next, entry)
```

Âncoras de roteamento (nome:linha-no-arquivo) — reimplemente cada uma:

`config_menu`:118 · `waiting_name`:142 · `waiting_both_name`:147 · `waiting_bio`:155 · `waiting_both_bio`:160 · `waiting_group_image`:165 · `waiting_image_url`:179 · `waiting_menu_image`:188 · `waiting_flood_message`:210 · `waiting_flood_amount`:244 · `waiting_flood_modo`:252 · `config_set_link`:304 · `preset_apagar`:317 · `preset_novo_nome`:330 · `preset_novo_bio`:335 · `preset_novo_img`:340 · `preset_novo_msg`:363 · `waiting_roubar_preset`:377 · `waiting_tudo_preset`:431 · `waiting_tudo_msg`:460 · `waiting_tudo_name`:499 · `waiting_tudo_bio`:504 · `waiting_tudo_image`:509 · `group_menu`:539 · `group_action_menu`:593 · `group_multi_action`:614 · `multi_flood_message`:659 · `multi_flood_amount`:688 · `multi_flood_modo`:695 · `multi_tudo_preset`:742 · `multi_tudo_msg`:764 · `multi_roubar_preset`:787 · `group_agendar_tipo`:820 · `agendar_flood_message`:846 · `agendar_flood_amount`:851 · `agendar_flood_modo`:861 · `agendar_tudo_preset`:878 · `agendar_tudo_msg`:892 · `agendar_roubar_preset`:899 · `agendar_tempo`:913 · `multi_agendar_tipo`:943 · `multi_agendar_flood_message`:966 · `multi_agendar_flood_amount`:971 · `multi_agendar_flood_modo`:979 · `multi_agendar_tudo_preset`:996 · `multi_agendar_tudo_msg`:1010 · `multi_agendar_roubar_preset`:1017 · `multi_agendar_tempo`:1031 · `config_set_flood_interval`:1051 · `config_set_flood_lote`:1058 · `config_set_flood_modo`:1065 · `config_set_flood_speed`:1087 · `config_set_flood_allowlist_add`:1110 · `config_set_flood_allowlist_remove`:1133 · `config_set_flood_loja`:1147 · `config_set_flood_allowlist_pick`:1171 · `config_add_user`:1208 · `config_remove_user`:1252 · `config_add_group`:1265 · `config_remove_group`:1328 · `config_add_owner`:1341 · `config_remove_owner`:1363 · `agendar_cancelar`:1378 · `waiting_group`:1399 · `status_waiting_text`:1486 · `status_waiting_image`:1496 · `status_waiting_video`:1523 · `status_waiting_audience`:1549 · `status_menu_st`:1572 · `status_preset_select`:1586 · `status_preset_menu`:1613 · `status_preset_criar_nome`:1628 · `status_preset_criar_texto`:1642 · `status_preset_apagar`:1650 · `status_audiencia_menu`:1662 · `status_waiting_group_import`:1676 · `status_priv_menu`:1713

### services/fastParser.js — 725 linhas (37.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v31] Modo rápido universal: todos comandos + configs + agendamento via @
// Ex: 3/01/2/msg, 2/01/msg/20/1, 4/01/2, 6/1,3,5/1/msg/20/1@10m, 5/10/rapido, 5/20/5511...
```

Exportações (assinaturas exatas):

```ts
export async function handleFastCommand(chatJid, ownerKey, textRaw)
```

### services/interactiveService.js — 278 linhas (12.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [CORREÇÃO] Envio de mensagens interativas NATIVAS (Native Flow) + extração de ID.
//
// PROBLEMA ORIGINAL:
// enviarMensagemInterativa() montava o interactiveMessage, mas com falhas que,
// no Baileys 7.0.0-rc14, fazem o cliente NÃO renderizar os botões — e o
// catch caía direto para o fallback de TEXTO. Resultado prático:
//   "botão -> texto", exatamente o bug relatado.
//
// CORREÇÕES APLICADAS (sem mudar a intenção — continua Native Flow real):
// 1. messageParamsJson agora recebe um JSON válido ('{}') em vez de "".
// Um paramsJson vazio pode invalidar o render do Native Flow no rc14.
// 2. Cada botão é validado/normalizado: garante buttonParamsJson como string.
// 3. O header sem mídia usa hasMediaAttachment:false explicitamente.
// 4. O fallback textual só dispara em falha REAL de envio, e loga o erro
// original (não engole silenciosamente). O ID textual continua clicável
// via TEXT_TO_ACTION, preservando o fallback textual exigido.
//
// Assim: BOTÃO REAL -> CLICK -> ID REAL -> getInteractiveId() -> roteador.
//
// [v54] RENDER: envelope espelhado EXATAMENTE no list.js (transporte provado
// no cliente real): proto.create() em Body/Footer/Header/NativeFlowMessage,
// SEM messageParamsJson (opcional no proto do fork — string vazia quebra o
// parse do flow no cliente) e SEM contextInfo.mentionedJid. UMA mensagem por
// interação; fallback de texto SOMENTE se o relayMessage lançar (substitui,
// nunca acompanha). Ver AUDITORIA-SYZYGY.md §23.
```

Exportações (assinaturas exatas):

```ts
export async function enviarMensagemInterativa(from, texto, botoes)
export function getInteractiveId(m)
export function horaAtual()
```

### services/buttons.js — 68 linhas (3.2 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v56] getButtonId removido: parser duplicado morto (zero chamadas).
// Parser ÚNICO de respostas interativas = getListId (services/list.js).
```

Exportações (assinaturas exatas):

```ts
export async function sendInteractiveButtons(sockParam, jid, options)
```

### services/list.js — 212 linhas (9.9 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// Resolve 90% dos casos de lista não renderizar
```

Exportações (assinaturas exatas):

```ts
export async function sendInteractiveList(sockParam, jid, options)
export function getListId(m)
export function chunkRowsToSections(rows, sectionTitlePrefix = "Opções")
export function paginateRows(rows, maxPerList = 100)
```

### services/lidResolver.js — 171 linhas (5.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v25] Mapeia LID <-> telefone + busca ativa em grupos.
```

Exportações (assinaturas exatas):

```ts
export function normalizeNumberSimple(v)
export function atualizarMapaDeParticipantes(participants)
export function resolverLidParaPhone(lidOrNumber)
export function resolverPhoneParaLid(phoneOrNumber)
export function getLidMap()
export function limparMapa()
export async function buscarPhonePorLid(lidJidOuNum)
export async function buscarLidPorPhone(phoneJidOuNum)
```

### services/agendaService.js — 250 linhas (8.8 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v22] Agendamento de ações (flood, nuke, roubar) para execução futura.
```

Exportações (assinaturas exatas):

```ts
export function parseAgendamento(input)
export function agendarAcao({ tipo, grupos, dados, mensagem, delayMs, at })
export function listarAgendamentos()
export function cancelarAgendamento(id)
export function limparConcluidos()
export function iniciarAgendamentos()
export function formatarAgendamentosTexto()
```

### services/bloksTransport.js — 110 linhas (5.2 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v48] 🧱 HELPER CENTRAL BLOKS/A2UI — ÚNICA fonte de verdade do transporte
// de mensagens A2UI (Server Inspector). O bot só fornece o payload; toda a
// montagem/encapsulamento/serialização/relay vive AQUI.
//
// ANÁLISE DA CAUSA DA "MENSAGEM INCOMPATÍVEL" (v47) — corrigida na origem:
//  1. O patch interno do fork (patchMessageForMdIfRequired) testaria
//     `interactiveMessage.nativeFlowMesaage` (typo interno da lib) — logo
//     mensagens interactiveMessage/nativeFlowMessage NUNCA recebem o
//     messageContextInfo{deviceListMetadata} que o cliente espera →
//     "sua versão do WhatsApp não é compatível".
//  2. O nome do botão nativo usado ("bloks_widget") não é reconhecido pelo
//     cliente. O identificador do fluxo A2 é o PRÓPRIO nome do botão:
//     "im_a2ui", com o documento A2UI ({version, catalogId, layouts}) como
//     buttonParamsJson.
// CORREÇÃO: montagem manual com generateWAMessageFromContent:
//   viewOnceMessage → message → { messageContextInfo{deviceListMetadata:{},
//   deviceListMetadataVersion:2}, interactiveMessage{ header/body/footer,
//   nativeFlowMessage{ buttons[0] = { name:"im_a2ui", buttonParamsJson } } } }
//   e envio por relayMessage(jid, msg.message, { messageId }).
//
// O PAYLOAD A2UI passa INTACTO (não é reescrito/adaptado): apenas é
// serializado como JSON dentro do botão. Formato do documento A2UI:
//   { version: <n>, catalogId: "<id>", layouts: [...] }
// additionalNodes: relayMessage do fork aceita; nenhum nó é comprovadamente
// necessário para interactiveMessage (o patch MD da própria lib não os usa) —
// nada é adicionado "por tentativa". Se um dia for necessário, o ponto único
// de mudança é AQUI (param additionalNodes opcional).
```

Exportações (assinaturas exatas):

```ts
export const A2UI_BUTTON_NAME
export async function sendBloksMessage(sock, jid, payload, opts = {})
```

### services/mediaService.js — 120 linhas (4.3 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [REORGANIZAÇÃO] Toda a lógica de mídia/imagem extraída do index.js.
// Conversa com Jimp, fetch(), downloadMediaMessage — sem tocar em fluxo/UI.
```

Exportações (assinaturas exatas):

```ts
export function isValidHttpUrl(str)
export async function prepararFoto(caminho)
export async function prepararFotoBuffer(buffer)
export async function baixarMidiaMensagem(m)
export function detectarImagem(m)
export function validarTamanho(size)
export async function fetchImagem(url, prof = 0)
```

### menus/menu.js — 281 linhas (17.4 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// Baileys via camada compat (connection/baileysCompat.js) — listas interativas + paginação
// Usa services/list.js (sendInteractiveList, getListId) - até 3 botões via services/buttons.js
// Mantém IDs iguais aos comandos já existentes do SYZYGY, não quebra nada
```

Exportações (assinaturas exatas):

```ts
export const COMANDOS
export function numeroNavegacao(id)
export function criarSections(listaComandos)
export async function enviarMenuPrincipal(jid)
export async function enviarSubLista(jid, categoriaNome)
export async function enviarListaGrupos(jid)
export async function enviarListaAtaque(jid)
export async function enviarListaPresets(jid)
export async function enviarListaConfig(jid)
export async function enviarListaPermissoes(jid)
export async function enviarListaViewOnce(jid)
export async function enviarListaRapido(jid)
export async function enviarListaComandos(jid)
export async function enviarMenuPrincipalWrapper(jid)
export const CATEGORIAS
export async function sendMainInteractiveMenu(jid)
export async function sendCategoryInteractiveMenu(jid, catId)
export async function sendFastHelpMenu(jid)
```

### menus/mainMenu.js — 138 linhas (6.8 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v35] Menu ultra rápido PV + listas interativas com categorias e paginação
```

Exportações (assinaturas exatas):

```ts
export async function enviarPainelInicial(from)
```

### menus/groupMenu.js — 243 linhas (10.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// menus/groupMenu.js
// [v26] Cache + safeSend + blindagem
```

Exportações (assinaturas exatas):

```ts
export async function enviarConfirmacao(jid, { titulo, texto, idConfirmar })
export async function enviarCancelavel(jid, texto)
export async function enviarVoltar(jid, texto)
export async function listarGruposInterativo(jid, pagina = 1)
export async function enviarMenuAcoesGrupo(jid, grupo, ownerKey)
export async function enviarMenuMultiAcoes(jid, grupos, ownerKey)
export async function enviarMenuFloodModos(jid, ownerKey, info = {})
```

### menus/menutest.js — 132 linhas (6.8 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// Construtor puro de botões Native Flow — Sem dependências de envio.
// [REORGANIZAÇÃO] Agora usa o módulo genérico utils/botoes.js (criarBotao/criarBotoes)
// em vez de montar { name, buttonParamsJson } à mão. Mesmos IDs, mesmos textos.
```

Exportações (assinaturas exatas):

```ts
export function buildMainMenuButtons(prefix = "!")
export function buildAdminMenuButtons()
export function buildConfigButtons()
export function buildGroupActionsButtons(groupId, groupSubject, isAdmin)
```

### features/flood/index.js — 386 linhas (13.3 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// API pública da feature FLOOD/SYZYGY + overlay de TEXTO do wizard da loja.
//
// O wizard de flood já existe (handlers/stateHandler.js: waiting_flood_message
// → waiting_flood_amount → waiting_flood_modo → executarFlood). O shopping entra
// como TIPO de conteúdo nesse mesmo wizard — sem menu novo, sem estado novo de
// fila, sem permissão nova:
//
//   loja:0                                    → preset default (shopping-test)
//   loja                                      → idem (palavra sozinha, sem dois-pontos)
//   loja:texto livre                          → corpo livre + defaults do preset
//   loja:texto|title|surface|id                → overlay completo
//   loja:texto|title|surface                    → id vem do preset
//   loja:texto|title|4|url                      → 4 vira 3 (WA) com aviso
//   loja:flow:…  /  loja:puro:…                 → modo de entrega do mesmo card
//                                                 (flow = ramo nativeFlow+shop do
//                                                 fork, único com messageVersion:1)
//
// (também aceitos como gatilho: "shop:" e "shopping:"). Sem prefixo algum, o
// flood continua 100% clássico: texto puro, mesmo laço, mesmo limite.
```

Exportações (assinaturas exatas):

```ts
export const SHOPPING_TRIGGERS
export function detectShoppingTrigger(text)
export function parseShoppingOverlay(rest = "", preset = null)
export function resolveShoppingSend(rest = "", { presetId = null, delivery = null } = {})
export function shoppingPromptText(presetId = null)
export const SHOPPING_PROMPT
export function floodContentBuilderFor(state)
```

### features/flood/presetEngine.js — 430 linhas (18.3 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [ENGINE DE PRESETS · adaptação arquitetural da arena 01a0aaae para o AB7]
//
// NÃO é o engine antigo copiado, e NÃO é um segundo executor de flood. A arena
// antiga tinha runPresetJob() com defaultSend próprio (sock.sendMessage direto);
// aqui o envio continua passando pela INFRAESTRUTURA DE ENVIO DO AB7:
//
//   preset → loadPreset → validação do tipo → allowlist → grupo protegido →
//          cooldown → speed (FLOOD_MODOS/CONFIG) → queue/limiter → builder →
//          services/groupService.executarFlood(...) → resultado estruturado
//
// O que este módulo faz de fato:
//  • resolve o preset e CLAMPA os tetos (config.js clampPresetLimits);
//  • valida o conteúdo ANTES de qualquer envio (payment/shopping/mention/media);
//  • aplica as porteiras de segurança: kill switch, um-job-por-vez, cooldown,
//    allowlist explícita e grupo protegido (isAuthorizedGroup, via filterTargets);
//  • monta a fila (queue.js) com o limiter (limiter.js) e entrega ao laço do
//    flood clássico por alvo;
//  • devolve métricas diagnósticas (nenhuma contém número cru: alvo é mascarado).
//
// Dry-run (padrão do runtime) NÃO envia: devolve preset, alvo mascarado, tipo,
// chaves do payload e o wire do card. Credencial nunca aparece aqui.
```

Exportações (assinaturas exatas):

```ts
export class PresetJobError
export function isFloodEngineRunning()
export function currentJobInfo()
export function cancelRunningJob(reason = KILL_SWITCH_REASON)
export async function runPresetJob(opts = {})
export function formatPresetJobResult(res = {})
```

### features/flood/customStore.js — 140 linhas (5.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Presets criados pelo dono, persistidos no CONFIG existente (utils/config.js →
// config.json) sob UMA única chave: CONFIG.floodCustomPresets.
//
// Segurança de dados: este módulo NUNCA sobrescreve outras chaves do config.json
// (só lê/escreve o array próprio + chama salvarConfig(), que já é o caminho do
// projeto) e não grava sessão/credencial — não há nada daqui para lá.
//
// Presets reservados: os IDs built-in (text/mention/media/payment/shopping-test)
// não podem ser ofuscados por um custom homônimo — senão o "custom" passaria a
// mudar o comportamento de um preset de teste conhecido.
```

Exportações (assinaturas exatas):

```ts
export const CUSTOM_TYPES
export const CUSTOM_STORE_KEY
export function slugPresetId(raw)
export function listCustomPresets()
export function getCustomPreset(id)
export function isReservedPresetId(id)
export function saveCustomPreset
export function updateCustomPreset(id, patch = {}, opts = {})
export function deleteCustomPreset(idOrIndex, { persist = true } = {})
export function formatCustomPresetsTexto()
```

### features/flood/queue.js — 141 linhas (5.5 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Fila ÚNICA do engine de presets. Preset nenhum implementa fila própria, e a
// fila NÃO é um segundo executor de flood: ela não conhece socket nem monta
// payload. O que ela faz é, para cada item:
//   respeitar kill switch → limiter (intervalo/concorrência/timeout) → chamar o
//   worker → retry limitado → abortar em erro permanente/desconexão → devolver
//   resultado estruturado.
// O worker, no AB7, é quem chama o executarFlood/executarFloodLote existente
// (services/groupService.js). Ou seja: ritmo e retry embaixo, envio em cima,
// UM caminho de send só.
```

Exportações (assinaturas exatas):

```ts
export const QUEUE_CANCELLED
export function createQueue({ interval, concurrency, timeout, maxRetries, onLog, jitter, shouldStop } = {})
```

### features/flood/commerce.js — 125 linhas (5.2 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [SHOPPING] Diagnóstico de `shop.id` — camada PURA de leitura.
//
// Por que isto existe: `shopStorefrontMessage.id` não é "qualquer URL". No
// tráfego real é o id da vitrine/catálogo da conta Business. O preset de exemplo
// do projeto carrega uma URL do Wikipedia, que é marcador visual, não id de
// catálogo — e id que o cliente não resolve é mais um motivo para o app não
// desenhar o card (mesmo com payload limpo).
//
// Sem inventar API: usamos SOMENTE o que este fork expõe de verdade
// (node_modules/@lucasmod/boruto-vk7-baileys/baileys/lib/Socket/business.js):
//   sock.getCatalog({ jid?, limit?, cursor? }) → { products:[{productId,name,…}], nextPageCursor? }
//   sock.getCollections(jid?, limit?)          → { collections:[{id,name,type,productsCount,…}] }
// Nada aqui abre socket, lê sessão ou envia mensagem: quem chama passa o `sock`.
```

Exportações (assinaturas exatas):

```ts
export function extrairIds(payload, prefix = "")
export async function listarIdsDeLoja(sock, opts = {})
export function compararShopId(shopId, listaOuIds)
export function formatDiagnostico(lista, shopId)
```

### features/viewOnce/config.js — 36 linhas (0.9 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v33] Config ViewOnce com modo sem salvar em disco + destinos por origem
```

Exportações (assinaturas exatas):

```ts
export const VIEW_ONCE_CONFIG
```

### features/viewOnce/service.js — 248 linhas (9.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v33] Download em buffer (sem salvar no celular) + temp file opcional com delete + destinos por origem
```

Exportações (assinaturas exatas):

```ts
export async function processViewOnce({ webMessageInfo, viewOnceContent, mediaType, origin, messageId })
export function getProcessedCacheSize()
export function clearProcessedCache()
```

### features/viewOnce/destinations.js — 151 linhas (8.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v35] PV -> owner (mesmo se origem for owner), Grupo -> grupos autorizados
```

Exportações (assinaturas exatas):

```ts
export function resolveDestinations({ origin = null, excludeJid = null } = {})
export function formatDestinationsTexto(destinations, cachedGroups = {})
```

### features/statusManager/config.js — 85 linhas (4.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v41] 🫥 STATUS MANAGER — configuração padrão e constantes.
//
// ANÁLISE TÉCNICA (Baileys 7.0.0-rc14 — verificada no fonte instalado):
//  - Publicação: sock.sendMessage('status@broadcast', conteudo, opts)
//  - Audiência POR PUBLICAÇÃO: opts.statusJidList = [jid1, jid2, ...]
//    (lib/Types/Message.d.ts:240 — API documentada. O status é cifrado com
//     sender-key e a distribuição acontece SOMENTE para os JIDs listados —
//     é o mecanismo nativo "Somente compartilhar com..." do WhatsApp.)
//  - Texto estilizado: opts.backgroundColor ('#RRGGBB' → backgroundArgb) e
//    opts.font (proto.Message.ExtendedTextMessage.FontType).
//  - Privacidade PADRÃO da conta: sock.updateStatusPrivacy('all'|'contacts'|
//    'contact_blacklist'|'none') — API pública (lib/Socket/chats.js:119).
//
// LIMITAÇÕES REAIS (sem contorno — informadas ao usuário):
//  1. Não existe API para EXCLUIR um contato individual de um status específico.
//     O modo 'contact_blacklist' ("contatos exceto...") usa lista que só pode
//     ser editada no aplicativo do telefone.
//  2. GRUPOS não podem ser audiência de Status (regra do produto WhatsApp:
//     status é visível apenas para contatos individuais). Alternativa REAL
//     oferecida: importar os MEMBROS de um grupo como lista individual.
//  3. Não há API pública para APAGAR um status já publicado.
//  4. Vídeo: suportado, mas o servidor do WhatsApp limita a duração (~30s).
//  5. [v42] Sem statusJidList o relayMessage para status@broadcast "sucede",
//     mas NENHUM dispositivo recebe a sender-key → ninguém vê o status.
//     Por isso o módulo SEMPRE publica com statusJidList (mesmo no modo
//     "contatos", usando o registro de contatos do bot).

// Armazenamento persistido
```

Exportações (assinaturas exatas):

```ts
export const STATUS_CONFIG_PATH
export const STATUS_ERROS_PATH
export const STATUS_JID
export const FONTES_STATUS
export const FONTES_VALIDAS
export const CORES_STATUS
export const STATUS_LIMITS
export const STATUS_CONFIG_PADRAO
```

### features/statusManager/index.js — 421 linhas (23.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v42] 🫥 STATUS MANAGER — API pública + roteador de ações (status_*).
// v42: publicação SEMPRE com statusJidList (correção real do "não publica"),
// importar MEMBROS de grupo como audiência, menus reformulados.
// v45: alias textual "status" removido — acesso exclusivo pelo menu (opção 7).
// [v46] PAPÉIS SEPARADOS: ADM do bot CRIA e PUBLICA status (e posta presets);
// audiência, privacidade e gerência de presets continuam SÓ DO DONO.
```

Exportações (assinaturas exatas):

```ts
export const STATUS_MENU_MAP
export function menuStatusTexto(role = "adm")
export async function statusRouter(chatJid, senderKey, actionId)
```

Âncoras de roteamento (nome:linha-no-arquivo) — reimplemente cada uma:

`status_menu`:198 · `status_texto`:223 · `status_imagem`:228 · `status_video`:233 · `status_preset_postar`:239 · `status_preset_menu`:251 · `status_preset_criar`:256 · `status_preset_apagar`:261 · `status_audiencia`:273 · `status_audiencia_contatos`:278 · `status_audiencia_custom`:287 · `status_audiencia_ver`:292 · `status_import_grupo`:309 · `status_privacidade`:340 · `status_priv_all`:345 · `status_priv_contacts`:346 · `status_priv_none`:347 · `status_ver`:357 · `status_erros`:362 · `status_publicar`:367 · `status_cancelar`:398 · `status_limpar_fila`:411

### features/statusManager/service.js — 558 linhas (25.5 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v41] 🫥 STATUS MANAGER — núcleo: rascunhos, audiência, publicação, cancelamento,
// visualização e registro de erros. Usa SOMENTE APIs reais da Baileys 7.0.0-rc14:
//   - sock.sendMessage("status@broadcast", conteudo, { statusJidList, backgroundColor, font })
//   - sock.updateStatusPrivacy("all" | "contacts" | "contact_blacklist" | "none")
```

Exportações (assinaturas exatas):

```ts
export function carregarStatusConfig()
export function registrarErroStatus(tipo, mensagem, contexto = {})
export function listarErrosStatus(qtd = 10)
export function podeGerenciarStatus(senderKey)
export function obterStatusConfig()
export function definirAudienciaCustom(entries)
export function registrarContatos(lista)
export function construirListaContatos()
export function totalContatosConhecidos()
export async function importarMembrosGrupo(groupJid)
export function usarAudienciaContatos()
export function limparAudienciaCustom()
export async function definirPrivacidadePadrao(valor)
export function criarDraftTexto(texto, { font, cor } = {})
export function criarDraftMidia(tipo, buffer, caption = "", mimetype = null)
export function obterFila()
export function limparFila()
export async function publicarStatus()
export function cancelarPublicacao()
export function statusEmAndamento()
export function verConfigTexto()
export function verErrosTexto(qtd = 5)
```

### services/serverInspector.js — 410 linhas (18.2 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v47] 🖥️ SERVER INSPECTOR — painel A2UI (bloksWidget "im_a2ui") com dados
// REAIS do servidor onde o bot executa (Termux/Android, Linux).
//
// ARQUITETURA (conforme especificado):
//   collectServerInfo()      → coleta métricas reais (os / fs / process / /proc)
//   formatServerInfo()       → formata (bytes, %, uptime) sem alterar a UI
//   createServerInspectorData() → monta a estrutura A2UI EXISTENTE + valores reais
//   sendServerInspector()    → interactiveMessage + nativeFlowMessage(bloksWidget)
//                              → relayMessage() (mesmo mecanismo já usado no bot)
//
// UI: a estrutura (layouts hero, system, resources, node_memory, swap, network,
// runtime; componentes Text/Divider/Slider; IDs e catalogId FIXOS) é intocável.
// A ÚNICA coisa dinâmica são os VALORES.
//
// TRATAMENTO DE ERROS: cada métrica é isolada — falha → "N/A" — e NUNCA derruba
// o painel. Nada é aleatório, aproximado ou de demonstração.
```

Exportações (assinaturas exatas):

```ts
export async function collectServerInfo()
export function formatBytes(bytes)
export function formatPct(pct, casas = 1)
export function formatUptime(seg)
export function formatServerInfo(info)
export function createServerInspectorData(infoReal)
export function serverInspectorTexto(d)
export async function sendServerInspector(sock, jid)
```

### start.sh — 121 linhas (3.2 KB) · NÃO anexado por causa do orçamento

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

### update.sh — 477 linhas (24.4 KB) · NÃO anexado por causa do orçamento

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

### recover.sh — 130 linhas (6.7 KB) · NÃO anexado por causa do orçamento

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

> Arquivos citados e ausentes neste snapshot: handlers/helpHandler.js, handlers/antiTakeover.js, features/flood/xray.js

---

Fim. Rode as 4 suítes, escreva o relatório e pare.
