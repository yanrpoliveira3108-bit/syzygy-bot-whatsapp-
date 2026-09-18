# SYZYGY 2.0 — PROMPT DE BUILD DO ZERO

Você vai implementar, do zero, um bot de WhatsApp em Node.js. Este arquivo é o
prompt **inteiro**: especificação + comandos + contratos + o código real de
referência. Não existe repositório para consultar, não procure git, não peça
link. Se faltar alguma coisa, escreva o módulo faltante e marque com
`// TODO(nao-especificado):` no topo e no relatório final.

## 0. Como trabalhar (leia antes de escrever qualquer linha)

1. **Ordem:** Fase 0 (esqueleto instala e importa) → 1 (conexão + texto puro) →
   2 (permissões/config) → 3 (menus numerados) → 4 (flood clássico) → 5 (wizard
   e presets) → 6 (payment como TIPO de conteúdo) → 7 (ataques de grupo) →
   8 (extras: ViewOnce, Status, Inspector, agenda) → 9 (scripts de deploy) →
   10 (aceite). Não existe "fase do shopping/card de loja": o tipo saiu da v53.
   Termine cada fase com a verificação dela e **pare para eu testar** só quando
   eu pedir; caso contrário, siga até o fim.
2. **Não inicie o bot.** Não há WhatsApp pareado aqui. Rode `node --check` e as
   suítes de teste (offline por construção; `features/flood/doctor.mjs` também é
   só leitura). Render de pagamento e visualização única **não tem como provar sem
   aparelho**: reporte como "payload conforme proto, render não testado" — nunca
   "funciona".
3. **Não dispare flood/nuke/roubo real.** Nenhum teste toca a rede: as suítes
   injetam socket falso e devolvem `config.json`/`dono/historico.json` byte a byte
   no `finally` (ação que persiste de propósito — `37` kill switch — é restaurada
   pelo teste, não gravada).
4. **Nada de dependência nova**: nem `dotenv`, nem framework de bot, nem
   Redis/BullMQ, nem TypeScript, nem ORM, nem Docker. Estado é JSON em disco.
5. **Nomes, ids e números são o produto.** Cada atalho, cada `actionId`, cada
   número de menu (`12-41` do dono, `1`-`11` do ADM) e cada chave de
   têm que ser **idênticos** aos que estão nas tabelas abaixo.
   Engine interno você pode reorganizar; superfície, não.
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

## 2. Árvore (gerada do disco — com o papel que o próprio arquivo declara no topo)

```
./  (raiz)
  index.js                   45 l  · [REORGANIZAÇÃO] Ponto de entrada do SYZYGY. Apenas COORDEN
  recover.sh                130 l
  start.sh                  121 l
  update.sh                 477 l
connection/
  baileysCompat.js           46 l  · [v48→v51] CAMADA DE COMPATIBILIDADE BAILEYS — ÚNICO ponto 
  pairing.js                 52 l  · [REORGANIZAÇÃO] Fluxo de PAIRING CODE (não QR). Preservado
  sessionRecovery.js        122 l  · [REORGANIZAÇÃO] Detecção de erros de Signal/Session + recu
  socket.js                  97 l  · [REORGANIZAÇÃO] Detentor do ÚNICO socket Baileys + estado 
  whatsapp.js               329 l  · [v24] LID resolver + grupos autorizados blindados + anti-t
commands/
  commandMap.js              69 l  · [v45] Mapa alinhado ao menu: 5=Comandos do Dono, 6=Configu
  commandRouter.js          672 l  · [v27] Owner-only para foto menu, add/remove ADM, add/remov
utils/
  botoes.js                 123 l  · [IMPLEMENTAÇÃO] Módulo GENÉRICO e REUTILIZÁVEL de botões N
  config.js                 170 l  · [v28] Config com donos extras, ADMs, grupos autorizados, L
  lerMais.js                 47 l  · [v46.1] 📖 "LER MAIS" — dobra mensagens logo após o título
  logger.js                  73 l  · [REORGANIZAÇÃO] Silenciador de logs sensíveis de sessão, e
  menuArt.js                143 l  · [v53 · AB7] Identidade visual ÚNICA dos menus. Antes cada 
  permissions.js            353 l  · [v28] Permissões: donos (multi), ADMs (users), grupos auto
  stateManager.js            25 l
  terminalUI.js              94 l  · [v43] Tema ROXO do SYZYGY. Mesmas funções/assinaturas — só
handlers/
  interactionHandler.js      30 l  · [REORGANIZAÇÃO] Ponte entre a UI interativa e o roteador.
  messageHandler.js         315 l  · [v33] ViewOnce antes de auth + ADM LID imediato + grupos a
  stateHandler.js          1831 l  · [REORGANIZAÇÃO] Tratador de estados (input texto/imagem) +
  terminal.js                69 l  · [v43] Terminal virou PAINEL MONITOR (tema roxo). Comandos:
services/
  agendaService.js          250 l  · [v22] Agendamento de ações (flood, nuke, roubar) para exec
  antiTakeoverService.js     76 l  · [v22] Proteção anti-takeover: detecta quando o bot perde a
  bloksTransport.js         110 l  · [v48] 🧱 HELPER CENTRAL BLOKS/A2UI — ÚNICA fonte de verdad
  buttons.js                 68 l
  fastParser.js             750 l  · [v31] Modo rápido universal: todos comandos + configs + ag
  groupService.js           724 l  · [v29] Ultra rápido: throttle reduzido, lotes maiores, roub
  historicoService.js        85 l  · [v22] Histórico de ações do SYZYGY — log persistido de nuk
  interactiveList.js          8 l  · [v51] CAMADA DE COMPATIBILIDADE — a implementação ÚNICA de
  interactiveService.js     278 l  · [CORREÇÃO] Envio de mensagens interativas NATIVAS (Native 
  lidResolver.js            171 l  · [v25] Mapeia LID <-> telefone + busca ativa em grupos.
  list.js                   212 l  · Resolve 90% dos casos de lista não renderizar
  mediaService.js           120 l  · [REORGANIZAÇÃO] Toda a lógica de mídia/imagem extraída do 
  notificationService.js     76 l  · [v28] Notificações para dono + grupos autorizados.
  presetService.js           89 l  · [NOVO] Presets de configuração (nome + bio + foto) para o 
  serverInspector.js        410 l  · [v47] 🖥️ SERVER INSPECTOR — painel A2UI (bloksWidget "im_
menus/
  adminMenu.js               12 l  · [REORGANIZAÇÃO] Painel administrativo (owner_panel / abrir
  configMenu.js             232 l  · [v53 · AB7] Painéis de configuração redesenhados sobre uti
  groupMenu.js              245 l  · [v26] Cache + safeSend + blindagem
  mainMenu.js               154 l  · [v35] Menu ultra rápido PV + listas interativas com catego
  menu.js                   286 l  · Baileys via camada compat (connection/baileysCompat.js) — 
  menutest.js               132 l  · Construtor puro de botões Native Flow — Sem dependências d
actions/
  configActions.js           57 l  · [v24] Status com permissões
  floodActions.js            20 l  · [REORGANIZAÇÃO] Confirmação de FLOOD (flood_confirm_yes).
  groupActions.js            48 l  · [REORGANIZAÇÃO] Ações de confirmação de grupo (NUKE / remo
features/flood/
  README.md                 179 l
  config.js                 204 l  · [v53 · AB7] Registro de TIPOS/PRESETS de conteúdo do flood
  customStore.js            158 l  · [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao 
  doctor.mjs                128 l  · [v53] Diagnóstico da feature de flood — SOMENTE LEITURA. N
  groups.js                  63 l  · [INFRA FLOOD · recuperada da arena 01a0aaae]
  index.js                  175 l  · [v53 · AB7] Barrel público da feature FLOOD. Superfície en
  killswitch.js              67 l  · [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao 
  limiter.js                172 l  · [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao 
  payment.js                161 l  · [INFRA FLOOD · recuperada da arena 01a0aaae]
  presetEngine.js           386 l  · [ENGINE DE PRESETS · adaptação arquitetural da arena 01a0a
  queue.js                  141 l  · [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao 
  router.js                 215 l  · [v53 · AB7] Fachada de comandos da arena 01a0aaae, reconst
  speed.js                  117 l  · [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao 
  targets.js                174 l  · [v53 · AB7] Destinos dos presets de flood. A allowlist par
  tests-infra.js            456 l [suíte]  · [v53 · AB7] Infra do flood: fila, limiter, kill switch, co
  tests-menu.js             317 l [suíte]  · [v53 · AB7] Testes da LIGAÇÃO entre os painéis e a feature
  tests.js                  413 l [suíte]  · [v53 · AB7] Suíte do FLOOD + PAGAMENTO (substitui a suíte 
features/flood/presets/
  custom.js                  52 l  · [PRESET · recuperado da arena 01a0aaae — dispatcher fino]
  index.js                  105 l  · [PRESET · recuperado da arena 01a0aaae e adaptado ao AB7]
  media.js                   84 l  · [PRESET · recuperado da arena 01a0aaae]
  mention.js                 68 l  · [PRESET · recuperado da arena 01a0aaae — com a regra de se
  payment.js                 43 l  · [PRESET · recuperado da arena 01a0aaae]
  text.js                    25 l  · [PRESET · recuperado da arena 01a0aaae]
features/viewOnce/
  config.js                  36 l  · [v33] Config ViewOnce com modo sem salvar em disco + desti
  destinations.js           151 l  · [v35] PV -> owner (mesmo se origem for owner), Grupo -> gr
  handler.js                127 l  · [v33] Detecção robusta de qualquer ViewOnce (imagem, vídeo
  index.js                   30 l  · Entry point da feature View Once - exporta API pública e i
  permissions.js             39 l  · [v33] Permissão ViewOnce: permite qualquer viewOnce recebi
  service.js                248 l  · [v33] Download em buffer (sem salvar no celular) + temp fi
  tests.js                   95 l [suíte]  · Camada de testes/verificações para View Once - conforme so
features/statusManager/
  config.js                  85 l  · [v41] 🫥 STATUS MANAGER — configuração padrão e constantes
  index.js                  421 l  · [v42] 🫥 STATUS MANAGER — API pública + roteador de ações 
  presets.js                105 l  · [v46] 🗂️ PRESETS DE STATUS — textos salvos para publicar 
  service.js                558 l  · [v41] 🫥 STATUS MANAGER — núcleo: rascunhos, audiência, pu
```

Fora da árvore de código, por decisão: `config.json` (números reais), `dono/**`
(estado de runtime do dono), `sessao/**` (auth), `log/**`, `legacy/**`
(implementações mortas — não ressuscitar). **Não existe passo de `git apply` de
`.patch`**: os patches daquela fase já estão no fonte, aplicar de novo quebra.

(O total real, com LOC por arquivo, está na tabela abaixo — gerada do disco, não
contada de cabeça.)

## 2.1 Inventário (o que existe no projeto e o que este prompt traz)

| arquivo | linhas | no prompt |
|---|---|---|
| `actions/configActions.js` | 57 | descrito (§10) |
| `actions/floodActions.js` | 20 | descrito (§10) |
| `actions/groupActions.js` | 48 | descrito (§10) |
| `commands/commandMap.js` | 69 | anexado (§9) |
| `commands/commandRouter.js` | 672 | anexado (§9) |
| `connection/baileysCompat.js` | 46 | anexado (§9) |
| `connection/pairing.js` | 52 | anexado (§9) |
| `connection/sessionRecovery.js` | 122 | anexado (§9) |
| `connection/socket.js` | 97 | anexado (§9) |
| `connection/whatsapp.js` | 329 | anexado (§9) |
| `features/flood/README.md` | 179 | descrito (§10) |
| `features/flood/config.js` | 204 | anexado (§9) |
| `features/flood/customStore.js` | 158 | descrito (§10) |
| `features/flood/doctor.mjs` | 128 | anexado (§9) |
| `features/flood/groups.js` | 63 | anexado (§9) |
| `features/flood/index.js` | 175 | descrito (§10) |
| `features/flood/killswitch.js` | 67 | anexado (§9) |
| `features/flood/limiter.js` | 172 | anexado (§9) |
| `features/flood/payment.js` | 161 | anexado (§9) |
| `features/flood/presetEngine.js` | 386 | descrito (§10) |
| `features/flood/presets/custom.js` | 52 | anexado (§9) |
| `features/flood/presets/index.js` | 105 | anexado (§9) |
| `features/flood/presets/media.js` | 84 | anexado (§9) |
| `features/flood/presets/mention.js` | 68 | anexado (§9) |
| `features/flood/presets/payment.js` | 43 | anexado (§9) |
| `features/flood/presets/text.js` | 25 | anexado (§9) |
| `features/flood/queue.js` | 141 | descrito (§10) |
| `features/flood/router.js` | 215 | anexado (§9) |
| `features/flood/speed.js` | 117 | descrito (§10) |
| `features/flood/targets.js` | 174 | anexado (§9) |
| `features/flood/tests-infra.js` | 456 | suíte (rode, não reescreva) |
| `features/flood/tests-menu.js` | 317 | suíte (rode, não reescreva) |
| `features/flood/tests.js` | 413 | suíte (rode, não reescreva) |
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
| `handlers/interactionHandler.js` | 30 | anexado (§9) |
| `handlers/messageHandler.js` | 315 | anexado (§9) |
| `handlers/stateHandler.js` | 1831 | descrito (§10) |
| `handlers/terminal.js` | 69 | descrito (§10) |
| `index.js` | 45 | anexado (§9) |
| `menus/adminMenu.js` | 12 | descrito (§10) |
| `menus/configMenu.js` | 232 | anexado (§9) |
| `menus/groupMenu.js` | 245 | descrito (§10) |
| `menus/mainMenu.js` | 154 | descrito (§10) |
| `menus/menu.js` | 286 | descrito (§10) |
| `menus/menutest.js` | 132 | descrito (§10) |
| `package.json` | 24 | anexado (§9) |
| `recover.sh` | 130 | descrito (§10) |
| `services/agendaService.js` | 250 | descrito (§10) |
| `services/antiTakeoverService.js` | 76 | descrito (§10) |
| `services/bloksTransport.js` | 110 | descrito (§10) |
| `services/buttons.js` | 68 | descrito (§10) |
| `services/fastParser.js` | 750 | descrito (§10) |
| `services/groupService.js` | 724 | anexado (§9) |
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
| `utils/config.js` | 170 | anexado (§9) |
| `utils/lerMais.js` | 47 | anexado (§9) |
| `utils/logger.js` | 73 | anexado (§9) |
| `utils/menuArt.js` | 143 | descrito (§10) |
| `utils/permissions.js` | 353 | anexado (§9) |
| `utils/stateManager.js` | 25 | anexado (§9) |
| `utils/terminalUI.js` | 94 | descrito (§10) |
| **total** | **15.868** | 34 anexados · 49 descritos · suítes citadas |

## 3. Comandos que existem (o usuário só digita isto)

### 3.1 Texto → `actionId` (fonte: `commands/commandMap.js`, export `TEXT_TO_ACTION`)

| o que o usuário digita | ação interna (`actionId`) | o que faz |
|---|---|---|
| `0` | `owner_sair` | 0 — desconecta/termina sessão |
| `1` | `painel_listar_grupos` | 1 — lista os grupos autenticados |
| `2` | `painel_flood` | 2 — painel de flood (escolha de grupo/modo) |
| `3` | `painel_tudo` | 3 — flood em todos os grupos autorizados |
| `4` | `painel_roubar` | 4 — painel de roubo/troca de dono |
| `5` | `painel_dono` | 5 — `Comandos do Dono` (faixa 12-41) |
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
| `05` | `painel_dono` | 5 — `Comandos do Dono` (faixa 12-41) |
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
| `floodpresets` | `painel_flood_presets` | 35 — painel de presets (built-in + custom, tetos visíveis) |
| `floodpreset` | `painel_flood_presets` | 35 — painel de presets (built-in + custom, tetos visíveis) |
| `paymenttest` | `flood_preset_payment_test` | roda o preset `payment-test` nos alvos escolhidos (sem seleção: recusa com `NENHUM_ALVO`) |
| `texttest` | `flood_preset_text_test` | roda o preset `text-test` nos alvos escolhidos (sem seleção: recusa com `NENHUM_ALVO`) |
| `mentiontest` | `flood_preset_mention_test` | roda o preset `mention-test` nos alvos escolhidos (sem seleção: recusa com `NENHUM_ALVO`) |
| `mediatest` | `flood_preset_media_test` | roda o preset `media-test` nos alvos escolhidos (sem seleção: recusa com `NENHUM_ALVO`) |
| `floodstop` | `flood_kill_on` | para QUALQUER flood em andamento (kill switch) |
| `floodstart` | `flood_kill_off` | desliga o kill switch |
| `pagamento` | `painel_flood_pagamento` | ver §contratos |
| `floodpagamento` | `painel_flood_pagamento` | ver §contratos |
| `floodalvos` | `cfg_flood_targets` | 36 — escolher os grupos-alvo do flood (a MESMA lista do flood normal) |

Todo item acima funciona **com e sem** `!` onde o próprio mapa já traz as duas
formas; o roteador normaliza caixa/trim e aceita o `actionId` cru também. O
`commandRouter` devolve `{ actionId, args }` e quem decide permissão é
`utils/permissions.js` antes de qualquer efeito.

### 3.2 Menus numerados

**Painel Configurações — ADM (1-11)** (também por `6>n` e `01`…`11`)

| nº | rótulo no menu | `actionId` roteado |
|---|---|---|
| 1 | 👤 Ver proprietário | `cfg_owner` |
| 2 | 📱 Número conectado | `cfg_number` |
| 3 | 📡 Status da conexão | `cfg_status` |
| 4 | 📜 Histórico | `cfg_historico` |
| 5 | 📊 Relatório completo | `cfg_relatorio` |
| 6 | ⏰ Agendamentos | `cfg_agendamentos` |
| 7 | 👥 Listar ADMs do bot | `cfg_list_users` |
| 8 | 🧩 Listar grupos autorizados | `cfg_list_groups` |
| 9 | 👑 Listar donos | `cfg_list_owners` |
| 10 | 👻 Marcar fantasma | `cfg_fantasma` |
| 11 | ⬅️ Voltar ao menu | `abrir_painel` |

**Painel Comandos do Dono (12-41)** (também por `5>n`; o último número da faixa volta ao menu)

| nº | rótulo no menu | `actionId` roteado |
|---|---|---|
| 12 | 🎨 Criar preset | `cfg_criar_preset` |
| 13 | 🗑️ Apagar preset | `cfg_apagar_preset` |
| 14 | 🖼️ Imagem do menu | `cfg_menuImage` |
| 15 | 🔗 Link de divulgação | `cfg_link` |
| 16 | 📖 Ler mais | `cfg_ler_mais` |
| 17 | 🌊 Modo do flood (velocidade) | `cfg_flood_modo` |
| 18 | ⏱️ Intervalo do flood | `cfg_flood_interval` |
| 19 | 📦 Lote do flood | `cfg_flood_lote` |
| 20 | 🧹 Auto-limpeza | `cfg_autolimpeza` |
| 21 | 🛡️ Anti-takeover | `cfg_antitakeover` |
| 22 | 👻 Limpar fantasmas | `cfg_limpar_fantasmas` |
| 23 | 🗓️ Limpar agendamentos | `cfg_limpar_agendamentos` |
| 24 | ➕ Add ADM do bot | `cfg_add_user` |
| 25 | ➖ Remover ADM | `cfg_remove_user` |
| 26 | ➕ Add grupo autorizado | `cfg_add_group` |
| 27 | ➖ Remover grupo autorizado | `cfg_remove_group` |
| 28 | ➕ Add dono extra | `cfg_add_owner` |
| 29 | ➖ Remover dono extra | `cfg_remove_owner` |
| 30 | 👁️ ViewOnce ON/OFF | `cfg_viewonce_toggle` |
| 31 | 👁️ VO → grupos | `cfg_viewonce_groups` |
| 32 | 👁️ VO → dono | `cfg_viewonce_owner` |
| 33 | 👁️ VO → ADMs | `cfg_viewonce_admins` |
| 34 | 💾 VO salvar em disco | `cfg_viewonce_save` |
| 35 | 🌊 Flood · presets (load-test) | `painel_flood_presets` |
| 36 | 🎯 Flood · escolher grupos (1,3,5) | `cfg_flood_targets` |
| 37 | 🛑 Flood · kill switch | `cfg_flood_kill` |
| 38 | 🚀 Flood · velocidade dos presets | `cfg_flood_speed` |
| 39 | 🩺 Flood · raio-X do job | `cfg_flood_xray` |
| 40 | 💳 Flood · tipo padrão (texto/pagamento) | `cfg_flood_tipo` |
| 41 | ⬅️ Voltar ao menu | `abrir_painel` |

- `0` / `11` / `41` → `abrir_painel` (voltar). Números com rótulo mas sem ação no mapa = erro de paridade — os testes do projeto proíbem isso.
- Número que já existiu e saiu (42-47 na v53) responde `itemRemovido()` — **nunca** silêncio e **nunca** reusado por opção nova.
- Atalho derivado: `numeroNavegacao(id)` → `NUM_CONFIG[id] >= 12 ? "5>"+n : "6>"+n` (fonte: `menus/menu.js`).

### 3.3 Atalhos de flood/preset (fonte: `features/flood/router.js`)

| atalho | o que faz |
|---|---|
| `floodpresets` | painel_flood_presets |
| `floodpreset` | painel_flood_presets |
| `texttest` | flood_preset_text_test |
| `mentiontest` | flood_preset_mention_test |
| `mediatest` | flood_preset_media_test |
| `paymenttest` | flood_preset_payment_test |
| `pagamento` | painel_flood_pagamento |
| `floodalvos` | cfg_flood_targets |
| `floodstop` | flood_kill_on |
| `floodstart` | flood_kill_off |
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

Tipos aceitos: `text`, `mention`, `media`, `payment`, `custom`. Tetos por tipo (`FLOOD_PRESET_HARD_CAP`): `maxMessages`=100 · `minInterval`=40 · `maxConcurrency`=4 · `minCooldown`=1000 · `minTimeout`=1000 · `maxTimeout`=30000 · `maxRetries`=2. Teto global do flood: `MAX_FLOOD = 2000`.

| `floodModo` | rótulo no menu | `intervalo` (ms) | `lote` |
|---|---|---|---|
| `rapido` | Rápido 40ms/lote12 | 40 | 12 |
| `normal` | Normal 100ms/lote8 | 100 | 8 |
| `lento` | Lento 250ms/lote5 | 250 | 5 |
| `seguro` | Seguro 500ms/lote3 + jitter | 500 | 3 |

`floodJitter` vira `true` automaticamente só no modo `seguro`. `LOTE` efetivo no engine = `max(1, min(floodLote, 10))`. `uiMode`: `text` (default) | `buttons` | `list` | `bloks`, com `txt` aceito como alias; `uiModoEfetivo()` trata `bloks` como `text` para os menus (só o Server Inspector usa o transporte bloks).

### 3.5 Estados do wizard (cada um `st.action` precisa de handler + `cancelar`)

**`waiting_*` (20)** — `waiting_bio`, `waiting_both_bio`, `waiting_both_name`, `waiting_flood_amount`, `waiting_flood_message`, `waiting_flood_modo`, `waiting_flood_tipo`, `waiting_group`, `waiting_group_image`, `waiting_image_url`, `waiting_menu_image`, `waiting_name`, `waiting_payment_moeda`, `waiting_payment_valor`, `waiting_roubar_preset`, `waiting_tudo_bio`, `waiting_tudo_image`, `waiting_tudo_msg`, `waiting_tudo_name`, `waiting_tudo_preset`

**`multi_*` (17)** — `multi_agendar_flood_amount`, `multi_agendar_flood_message`, `multi_agendar_flood_modo`, `multi_agendar_roubar_preset`, `multi_agendar_tempo`, `multi_agendar_tipo`, `multi_agendar_tudo_msg`, `multi_agendar_tudo_preset`, `multi_flood_amount`, `multi_flood_message`, `multi_flood_modo`, `multi_flood_tipo`, `multi_payment_moeda`, `multi_payment_valor`, `multi_roubar_preset`, `multi_tudo_msg`, `multi_tudo_preset`

**`status_*` (13)** — `status_audiencia_menu`, `status_menu_st`, `status_preset_apagar`, `status_preset_criar_nome`, `status_preset_criar_texto`, `status_preset_menu`, `status_preset_select`, `status_priv_menu`, `status_waiting_audience`, `status_waiting_group_import`, `status_waiting_image`, `status_waiting_text`, `status_waiting_video`

**`config_*` (12)** — `config_add_group`, `config_add_owner`, `config_add_user`, `config_menu`, `config_remove_group`, `config_remove_owner`, `config_remove_user`, `config_set_flood_interval`, `config_set_flood_lote`, `config_set_flood_modo`, `config_set_flood_speed`, `config_set_link`

**`agendar_*` (8)** — `agendar_cancelar`, `agendar_flood_amount`, `agendar_flood_message`, `agendar_flood_modo`, `agendar_roubar_preset`, `agendar_tempo`, `agendar_tudo_msg`, `agendar_tudo_preset`

**`preset_*` (5)** — `preset_apagar`, `preset_novo_bio`, `preset_novo_img`, `preset_novo_msg`, `preset_novo_nome`

**`group_*` (4)** — `group_action_menu`, `group_agendar_tipo`, `group_menu`, `group_multi_action`

São 79 ações roteadas por `handlers/stateHandler.js` (extraído dos
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
escreve. `uiMode` aceita `text` (default) | `buttons` | `list` | `bloks`
(`txt` é alias de `text`); `uiModoEfetivo()` é a única leitura — ele trata
`bloks` como `text` para os menus e só o Server Inspector enxerga `bloks`
(fonte: `utils/config.js:13-27`).

## 5. Contratos que você não pode improvisar

Estes são os pontos onde a reimplementação "parecida" quebra o bot. Os arquivos
completos estão no apêndice; aqui vai a obrigação funcional:

- **`executarFlood(jid, msg, qtd, intervaloOuOpts = 100, buildContent = null)`**
  (`services/groupService.js`): corpo = `msg + "\u200b".repeat((idx % 6) + 1)`;
  `LOTE = max(1, min(lote, 10))`; gate de cooldown; `null` de `buildContent` =
  flood clássico de texto, função = flood com conteúdo por índice (`texto` ou
  `pagamento`, via `floodContentBuilderFor(...)` de `features/flood/index.js`).
  Sem `buildContent`, **nada** de montar payload.
- **Payment é TIPO de conteúdo do flood**, não segundo sistema: o mesmo
  `runPresetJob` → `executarFlood` → `buildContent` (`presets/index.js`). Um único
  portão de chaves por tipo; conteúdo inválido = erro digitado
  (`PAYMENT_PAYLOAD_INVALID`, `AMOUNT_INVALID`, `CURRENCY_INVALID`), nunca "jeito
  jeitoso".
- **Payment no fio** = `{ payment: { note, currency, amount, offset, from, expiry } }`
  — exatamente estas chaves, nada além. `parsePaymentArgs("Pedido|25,90|BRL")`
  aceita vírgula brasileira; `amount` vai em milésimos porque o fork joga
  `message.payment.amount` direto no `amount1000` (`baileys/lib/messages.js:724-753`
  do `@lucasmod/boruto-vk7-baileys@2.1.0`) — quem monta multiplica por 1000.
  `viewOnce` **nunca** entra no payload (o wrap muda o tipo da mensagem). Nunca
  `.png` de recibo, nunca "pagamento confirmado" sem o `retryReqId` do WhatsApp.
- **Alvo é escolha do operador**: `setFloodSelection`/`getFloodSelection`/`clearFloodSelection`
  (`features/flood/targets.js`). Sem seleção → `TARGETS_REQUIRED` no job e
  `NENHUM_ALVO` no atalho. `filterTargets` corta grupo protegido
  (`PROTECTED_GROUP_BLOCKED`) e JID inválido (`BLOCKED_TARGET`). Não há allowlist do
  flood, nem "todos" implícito, nem ampliação por mensagem recebida.
- **Ataques de grupo** (`executarNuke`, `roubarGrupo`): sequência exata e
  `demote|remove` **por último** (inverter = perder o controle antes de terminar);
  throttling de `groupMetadata` compartilhado; a lista de alvos é sempre a
  seleção explícita do operador.
- **Pipeline** (`handlers/messageHandler.js`): ordem dos 10 passos — filtro de
  fromMe/status → `baileysCompat` → normalização de JID (LID antes de telefone!) →
  permissão → fastParser → `commandRouter` → stateHandler → efeito → log →
  histórico do dono. Trocar a ordem = comando que para de funcionar.
- **Wizard** (`handlers/stateHandler.js`): cada `state.action` tem handler e
  mensagem de saída própria; `cancelar`/`voltar` em todo passo; `setConfig` só
  pelo `SET_KEYS`.
- **Permissões** (`utils/permissions.js`): dono → ADM → grupo autorizado. Sem dono
  configurado, **nada** de painel abre (`painel_dono` é o único caminho de flood).

## 6. Segurança (não negociável)

- `MAX_FLOOD = 2000`; teto por tipo (`FLOOD_PRESET_HARD_CAP`); preset
  acima do teto é **cercado**, não recusado em silêncio.
- Kill switch: estado em memória + `config.json` (`persist: true`) é que chama
  `salvarConfig()`; checado **por lote** — parar leva no máximo 1 lote.
- Não há `dryRun` nem `testMode`: um **único** caminho de execução. As chaves
  `floodAllowlist`/`floodDryRun`/`floodTestMode` estão em
  `CONFIG_CHAVES_APOSENTADAS` (`utils/config.js`) e somem do `config.json` na carga
  — quem reimplementar não pode recriá-las.
- `normalizeTargetJid` decide a forma final (`@s.whatsapp.net` para usuário,
  `@g.us` para grupo) e `getFloodSelection()` vazio **não** significa "todo mundo":
  significa "nada sai" (regra literal de `features/flood/targets.js`).
- Scripts de deploy nunca fazem `reset --hard`/`checkout -f`/`stash drop`; toda
  escrita vem precedida de backup em `.syzygy-backup/<ts>/`.
- `sessao/`, `config.json`, `dono/*` fora do git.

## 7. Aceite (o que "pronto" quer dizer aqui)

```bash
for f in $(find . -name "*.js" -not -path "./node_modules/*"); do node --check "$f"; done
node features/flood/tests.js        # FLOOD · CORE+PAYMENT: 161 ok · 0 falhas · 0 skip
node features/flood/tests-infra.js  # FLOOD · INFRA: 195 ok · 0 falhas · 0 skip
node features/flood/tests-menu.js   # FLOOD · MENU: 208 ok · 0 falhas · 0 skip
node features/viewOnce/tests.js     # TODOS TESTES VIEW-ONCE PASSARAM
npm start                            # (você NÃO roda isto; é o passo do usuário)
```

`tests-payment.js` não existe: o payment é coberto pelas três suítes acima, com o
contrato do payload conferido na fonte do pacote instalado (não em README). As
suítes são offline por construção (socket falso, `config.json`
snapshot/restaurado, `persist:false`) — se o seu código fizer elas escreverem em
disco, o teste falha de propósito. **Não enfraqueça asserção para passar.**

Relatório final obrigatório: o que foi implementado por fase, saída das 4 suítes,
lista de `TODO(nao-especificado)`, e a frase honesta "render de pagamento e
viewOnce não testados em aparelho".

## 8. Proibições (as 12 que já queimaram alguém)

1. trocar a Baileys por `@whiskeysockets`/"oficial" para "testar mais rápido"
2. segundo `sock.sendMessage` ou encurtador paralelo ao wrap de Ler Mais
3. `viewOnce: true` em payload de preset (muda o tipo da mensagem no wrap)
4. chave de payload fora do `WAProto` do fork instalado ("para forçar render")
5. recriar `dryRun`, `testMode` ou allowlist do flood (conceitos removidos na v53)
6. payment com `.png`/recibo falso ou "confirmado" sem `retryReqId`
7. flood que amplia alvo sozinho (mensagem recebida, "todos", cache inteiro) ou que atira em grupo protegido
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

**Incluídos (34):** `package.json` · `.npmrc` · `.gitignore` · `index.js` · `connection/baileysCompat.js` · `connection/socket.js` · `connection/whatsapp.js` · `connection/sessionRecovery.js` · `connection/pairing.js` · `utils/config.js` · `utils/permissions.js` · `utils/stateManager.js` · `utils/lerMais.js` · `utils/logger.js` · `commands/commandMap.js` · `commands/commandRouter.js` · `handlers/messageHandler.js` · `handlers/interactionHandler.js` · `features/flood/config.js` · `features/flood/payment.js` · `features/flood/targets.js` · `features/flood/groups.js` · `features/flood/limiter.js` · `features/flood/killswitch.js` · `features/flood/router.js` · `features/flood/presets/index.js` · `features/flood/presets/text.js` · `features/flood/presets/mention.js` · `features/flood/presets/media.js` · `features/flood/presets/payment.js` · `features/flood/presets/custom.js` · `menus/configMenu.js` · `services/groupService.js` · `features/flood/doctor.mjs`

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
//    é `else if` exclusivo. Ver node_modules/@lucasmod/boruto-vk7-baileys/baileys/lib/Utils/messages.js.
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

### connection/socket.js — 97 linhas (3.7 KB)

```js
// connection/socket.js
// [REORGANIZAÇÃO] Detentor do ÚNICO socket Baileys + estado global de runtime.
// Nenhum outro módulo deve chamar makeWASocket(): todos leem/escrevem aqui.
// Isso evita dependência circular (handlers -> socket <- connection) e garante
// que exista apenas UM socket, como no index.js original.

// [v46] Aplicador do "Ler mais" — usado no wrap ÚNICO de sendMessage abaixo,
// para que TODA mensagem longa do bot (menus, painéis e respostas de comandos)
// dobre logo após o título quando o dono liga a opção (CONFIG.lerMais).
import { aplicarLerMais } from "../utils/lerMais.js"

const runtime = {
    sock: null,
    isConnected: false,
    reconnectAttempts: 0,
    notificacaoOnlineEnviada: false,
    cachedGroups: {},
    groupSelectionCache: {},
    bootTime: Date.now(),

    isConnecting: false,
    connectionLock: false,
    pairingCodeRequested: false,

    sessionErrorLog: [],
    sessionRecoveryInProgress: false,
    lastSessionRecovery: 0,
    sessionRecoveryCount: 0
}

export function getSock() { return runtime.sock }
export function setSock(s) { runtime.sock = s }

// Acesso direto ao objeto de runtime para os módulos que precisam mutar flags.
export function rt() { return runtime }

// ============================================================
// REGISTRO DE MENSAGENS ENVIADAS PELO PRÓPRIO BOT
// ============================================================
// [CORREÇÃO] Em chat consigo mesmo (owner operando do próprio número), o WhatsApp
// devolve as mensagens que o BOT envia como eventos messages.upsert com
// fromMe:true. Sem distinguir, o bot processava o próprio texto (ex.: a lista de
// grupos) como se fosse input do usuário — causando "[GRUPO] Selecionado: [70]"
// e o loop de "Grupo não encontrado".
//
// Solução: registramos o ID de cada mensagem que ENVIAMOS e ignoramos o eco.
const outgoingIds = new Set()
const OUTGOING_MAX = 500

export function registrarEnvio(id) {
    if (!id) return
    outgoingIds.add(id)
    // Limita o tamanho do Set (evita crescimento infinito).
    if (outgoingIds.size > OUTGOING_MAX) {
        const first = outgoingIds.values().next().value
        outgoingIds.delete(first)
    }
}

export function foiEnviadoPeloBot(id) {
    return !!id && outgoingIds.has(id)
}

// Envolve sock.sendMessage e sock.relayMessage UMA vez para auto-registrar os
// IDs de tudo que o bot envia. Chamado logo após makeWASocket().
export function instalarRastreioDeEnvios(sock) {
    if (!sock || sock.__syzygyWrapped) return
    sock.__syzygyWrapped = true

    const origSend = sock.sendMessage?.bind(sock)
    if (origSend) {
        sock.sendMessage = async (jid, ...args) => {
            // [v46] LER MAIS: insere as linhas invisíveis ANTES do envio real.
            // Aplicado a texto e a legenda de mídia (menu com imagem), nunca ao
            // status@broadcast (o texto do status não deve ser dobrado).
            try {
                if (typeof jid === "string" && !jid.includes("status@broadcast") && args[0] && typeof args[0] === "object") {
                    const c = args[0]
                    if (typeof c.text === "string") c.text = aplicarLerMais(c.text)
                    else if (typeof c.caption === "string") c.caption = aplicarLerMais(c.caption)
                }
            } catch {}
            const res = await origSend(jid, ...args)
            try { registrarEnvio(res?.key?.id) } catch {}
            return res
        }
    }

    const origRelay = sock.relayMessage?.bind(sock)
    if (origRelay) {
        sock.relayMessage = async (jid, message, opts) => {
            try { registrarEnvio(opts?.messageId) } catch {}
            return await origRelay(jid, message, opts)
        }
    }
}

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

### utils/config.js — 170 linhas (7.8 KB)

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

// [v53] O teto do flood virou CONFIGURAÇÃO com teto duro: MAX_FLOOD é o default
// (2000 por comando, era 1000) e config.json#floodMaxMensagens ajusta até
// FLOOD_TETO_ABSOLUTO. Ler direto de MAX_FLOOD ainda funciona para quem não
// mexeu no config; quem mexe usa floodMaxEfetivo() (única fonte com clamp).
export const MAX_FLOOD = 2000
export const FLOOD_TETO_ABSOLUTO = 5000

/** Tipos de conteúdo do flood. Payment é TIPO, não segundo executor. */
export const FLOOD_TIPOS = { TEXTO: "texto", MENCION: "mention", MEDIA: "media", PAGAMENTO: "payment" }
export const FLOOD_TIPOS_LABEL = {
    texto: "📝 texto puro",
    mention: "🏷️ menção (lista explícita)",
    media: "🖼️ mídia (imagem do preset/menu)",
    payment: "💳 pagamento (requestPaymentMessage do fork)"
}
export const HTTP_UA =
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

export const MAX_RECONNECT_ATTEMPTS = 5
export const RECONNECT_BASE_DELAY = 3000
export const MAX_SESSION_ERRORS = 8
export const SESSION_ERROR_WINDOW_MS = 60 * 1000
export const SESSION_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000

export const FLOOD_MODOS = {
    // [v53] lotes maiores: o gargalo real é o cliente/servidor do WhatsApp, e o
    // rate-limit já é tratado com backoff em limiter.js — lote maior = job mais
    // curto = menos janela de desconexão. O modo "seguro" continua o único com
    // jitter ligado por default.
    rapido: { intervalo: 40, lote: 12, label: "Rápido 40ms/lote12" },
    normal: { intervalo: 100, lote: 8, label: "Normal 100ms/lote8" },
    lento: { intervalo: 250, lote: 5, label: "Lento 250ms/lote5" },
    seguro: { intervalo: 500, lote: 3, label: "Seguro 500ms/lote3 + jitter" }
}

/** Chaves que a v52 tinha e a v53 aposentou (allowlist/dry-run/modo-teste). */
export const CONFIG_CHAVES_APOSENTADAS = ["floodAllowlist", "floodDryRun", "floodTestMode"]

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
    // [FLOOD · v53] allowlist, dry-run e modo-teste deixaram de existir: o flood
    // obedece à mesma permissão do resto do bot e o alvo é sempre escolha
    // explícita do operador. O que cercar é teto e kill switch, não ensaio.
    floodKillSwitch: false,
    floodMaxRetries: 1,
    floodTimeoutMs: 15000,
    floodMaxMensagens: 2000,
    floodErrorStop: 3,
    floodPaceAdaptativo: true,
    floodTipo: "texto",
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
            if (!CONFIG.floodMaxRetries) CONFIG.floodMaxRetries = 1
            if (!CONFIG.floodTimeoutMs) CONFIG.floodTimeoutMs = 15000
            if (!Number.isFinite(CONFIG.floodMaxMensagens)) CONFIG.floodMaxMensagens = MAX_FLOOD
            if (!Number.isFinite(CONFIG.floodErrorStop)) CONFIG.floodErrorStop = 3
            if (typeof CONFIG.floodPaceAdaptativo !== "boolean") CONFIG.floodPaceAdaptativo = true
            if (!FLOOD_TIPOS_LABEL[CONFIG.floodTipo] && CONFIG.floodTipo !== FLOOD_TIPOS.PAGAMENTO) CONFIG.floodTipo = FLOOD_TIPOS.TEXTO
            // migração honesta: chaves aposentadas saem do config (e o terminal avisa
            // uma vez) em vez de ficarem vivas sem efeito.
            for (const k of CONFIG_CHAVES_APOSENTADAS) {
                if (k in CONFIG) {
                    delete CONFIG[k]
                    CONFIG.__migracaoAposentadas = (CONFIG.__migracaoAposentadas || []).concat(k)
                }
            }
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

/** Teto efetivo de mensagens por alvo de flood (config ∩ teto duro do código). */
export function floodMaxEfetivo() {
    const pedido = Number(CONFIG.floodMaxMensagens)
    const base = Number.isFinite(pedido) && pedido > 0 ? pedido : MAX_FLOOD
    return Math.max(1, Math.min(FLOOD_TETO_ABSOLUTO, Math.trunc(base)))
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

### commands/commandMap.js — 69 linhas (2.6 KB)

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

    // [v53] atalhos de flood da arena 01a0aaae — MESMOS nomes que você digitava,
    // implementação na fachada features/flood/router.js sobre o runPresetJob da
    // AB7. `shoppingtest` e `flooddryrun` saíram junto com shopping/dry-run.
    "floodpresets": "painel_flood_presets",
    "floodpreset": "painel_flood_presets",
    "paymenttest": "flood_preset_payment_test",
    "texttest": "flood_preset_text_test",
    "mentiontest": "flood_preset_mention_test",
    "mediatest": "flood_preset_media_test",
    "floodstop": "flood_kill_on",
    "floodstart": "flood_kill_off",
    "pagamento": "painel_flood_pagamento",
    "!pagamento": "painel_flood_pagamento",
    "floodpagamento": "painel_flood_pagamento",
    "!floodpagamento": "painel_flood_pagamento",
    "floodalvos": "cfg_flood_targets",
    "!floodalvos": "cfg_flood_targets",
    "!floodpresets": "painel_flood_presets",
    "!paymenttest": "flood_preset_payment_test",
    "!texttest": "flood_preset_text_test",
    "!mentiontest": "flood_preset_mention_test",
    "!mediatest": "flood_preset_media_test",
    "!floodstop": "flood_kill_on",
    "!floodstart": "flood_kill_off"
}

```

### commands/commandRouter.js — 672 linhas (38.3 KB)

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
    // [FLOOD · v53] controles da feature features/flood/ (só dono)
    "cfg_flood_targets",
    "cfg_flood_kill",
    "cfg_flood_speed",
    "cfg_flood_tipo",
    "cfg_flood_xray",
    "painel_flood_presets",
    "painel_flood_pagamento",
    "flood_kill_on",
    "flood_kill_off",
    "flood_preset_text_test",
    "flood_preset_mention_test",
    "flood_preset_media_test",
    "flood_preset_payment_test"
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
        painel_flood: "waiting_flood_tipo",
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

    if (actionId === "owner_flood" || actionId === "painel_flood") { await pedirGrupo("waiting_flood_tipo"); return }
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
        if (actionId === "fast_flood_preset_help") help = `🌊 FLOOD PRESETS\n2/preset/<nome>[/conteúdo[/qtd]]\nNomes: text-test, mention-test, media-test, payment-test (+ os seus, em 12)\nEx: 2/preset/payment-test/Pagamento do pedido|25,90|BRL/50\n\nAtalhos: floodpresets · paymenttest · texttest · mentiontest · mediatest\n         floodstop = para tudo · floodstart = libera · floodalvos = trocar alvo\nAlvo: a seleção feita em 36 (ou 2 → grupos). Sem seleção, nada é enviado.`
        else if (actionId === "fast_flood_help") help = `⚡ FLOOD RÁPIDO\nFormato: 2/<grupo>/<msg>/<qtd>[/<modo>][@tempo]\nEx: 2/01/Oi/20/1\nModos: 1 rapido 40ms/lote12, 2 normal 100ms/lote8, 3 lento 250ms/lote5, 4 seguro 500ms/lote3+jitter\nCom @ agenda: 2/01/Oi/20/1@10m\n💳 pagamento: use 2/preset/payment-test/<nota>|<valor>|<moeda>/<qtd>`
        else if (actionId === "fast_nuke_help") help = `💣 NUKE RÁPIDO\nFormato: 3/<grupo>/<preset>[/<msg|pular>][@tempo]\nEx: 3/01/2/Oi\nEx: 3/01/0/pular (0=config padrão)\nEx: 3/01/2/Oi@1h (agenda 1h)`
        else if (actionId === "fast_roubar_help") help = `⚡ ROUBAR RÁPIDO\nFormato: 4/<grupo>/<preset>[@tempo]\nEx: 4/01/2\nEx: 4/Kk/0@20:30`
        else if (actionId === "fast_multi_flood_help") help = `🔢 MULTI FLOOD\nFormato: 6/<grupos>/1/<msg>/<qtd>[/<modo>][@tempo]\nEx: 6/1,3,5/1/Oi/20/1\nEx: 6/1-5/1/Oi/20/1@10m\n💳 pagamento em lote: 2 → 1,3,5 → tipo 2 (o wizard pergunta nota/valor/moeda)`
        else if (actionId === "fast_multi_nuke_help") help = `🔢 MULTI NUKE\nFormato: 6/<grupos>/2/<preset>[/<msg>][@tempo]\nEx: 6/1,3,5/2/2/Oi\nEx: 6/1-5/2/0/pular`
        else if (actionId === "fast_config_help") help = `⚙️ CONFIG RÁPIDO\n5/16/1 → ler mais (liga/desliga)\n5/17/rapido → flood modo\n5/18/200 → intervalo\n5/19/8 → lote\n5/24/5511... → add ADM\n5/26/01 → add grupo autorizado\n5/28/5511... → add dono extra\n5/36/1,3,5 → alvos do flood\n5/37 → kill switch · 5/40 → tipo (texto/pagamento)\n(números = menu 5 · Comandos do Dono, 12-41)`
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
    // ══ ⚔️ FLOOD · CONTROLES (35-40) — fachada features/flood/router.js ══════
    // (painel de presets, atalhos *_test, kill switch, escolha de grupos). A fachada
    // só usa runPresetJob → executarFlood; ela não abre segundo caminho de envio, e
    // desde a v53 não há allowlist nem dry-run: o alvo é a seleção do operador.
    if (
        actionId === "painel_flood_presets" ||
        actionId === "painel_flood_pagamento" ||
        actionId === "flood_presets_menu" ||
        actionId === "cfg_flood_targets" ||
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

    // 🛑 kill switch — a ÚNICA cerca de "não dispare agora" do flood (37).
    if (actionId === "cfg_flood_kill") {
        try {
            const fx = await import("../features/flood/index.js")
            const agora = fx.toggleKillSwitch({ persist: true })
            await getSock().sendMessage(chatJid, {
                text: `${agora ? "🛑 Flood BLOQUEADO (kill switch ligado)" : "▶️ Flood liberado"}\n\n${fx.killSwitchStatusTexto()}\n\n_Efeito: jobs de preset e o flood do wizard param na fronteira do lote._`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ kill switch: ${e.message}` })
        }
        return
    }
    // 🚀 velocidade dos presets (38) — vale para o config e como overlay do job.
    if (actionId === "cfg_flood_speed") {
        try {
            const fx = await import("../features/flood/index.js")
            setState(ownerKey, { action: "config_set_flood_speed" })
            await getSock().sendMessage(chatJid, {
                text: `${fx.formatFloodSpeedMenu()}\n\n_o valor escolhido vale para o flood clássico (config.json) e é o overlay de velocidade dos presets (concorrência nunca sobe acima do preset)._\n(cancelar para sair)`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ velocidade: ${e.message}` })
        }
        return
    }
    // 💳 tipo padrão do flood (40) — texto ⇄ pagamento, no mesmo laço.
    if (actionId === "cfg_flood_tipo") {
        try {
            const fx = await import("../features/flood/index.js")
            await fx.floodRouter(chatJid, ownerKey, "cfg_flood_tipo")
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ tipo do flood: ${e.message}` })
        }
        return
    }
    // 🌊 presets disponíveis (35) — só a lista, sem rodar nada.
    if (actionId === "cfg_flood_presets") {
        try {
            const fx = await import("../features/flood/index.js")
            const cap = fx.FLOOD_PRESET_HARD_CAP
            await getSock().sendMessage(chatJid, {
                text: `${fx.listPresetsTexto()}\n\n${fx.formatCustomPresetsTexto()}\n\n_Teto por job: ${cap.maxMessages} msg · intervalo mín. ${cap.minInterval}ms · ${cap.maxConcurrency} por vez · cooldown mín. ${cap.minCooldown}ms.\nUso: 2 · FLOOD → tipo → conteúdo · ou atalho paymenttest / 2/preset/<id>._`
            })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ presets: ${e.message}` })
        }
        return
    }
    // 🩺 raio-X do job (39) — o diagnóstico honesto: o que está rodando, o que é
    // barrado e qual é o teto. Sem dry-run/allowlist na v53, é aqui que se confere
    // se o flood está armado ou não.
    if (actionId === "cfg_flood_xray") {
        try {
            const fx = await import("../features/flood/index.js")
            const { CONFIG } = await import("../utils/config.js")
            const rc = fx.getFloodRuntimeConfig()
            const cap = fx.FLOOD_PRESET_HARD_CAP
            const defId = fx.DEFAULT_FLOOD_PRESET_ID
            const def = fx.getPresetDef(defId)
            const cd = def ? fx.remainingCooldown(defId, def.cooldown || 0) : 0
            const job = fx.currentJobInfo()
            const alvos = fx.getFloodSelection(ownerKey)
            const t = [
                "🩺 RAIO-X DO FLOOD",
                `• kill switch: ${rc.killSwitch ? "🛑 LIGADO (nada sai)" : "liberado"}`,
                `• tipo padrão: ${fx.floodTipoLabel(rc.tipo)}`,
                `• alvos da sessão: ${alvos.length ? `${alvos.length} grupo(s) (36 para trocar)` : "nenhum → os atalhos recusam e nada sai"}`,
                `• flood clássico (wizard): ${CONFIG.floodModo} ${CONFIG.floodInterval}ms/lote${CONFIG.floodLote} · teto ${rc.maxMensagens} msg/alvo`,
                `• timeout por send: ${rc.timeoutMs}ms · retries: ${rc.maxRetries} · para no ${rc.errorStop}º erro seguido`,
                `• ritmo adaptativo: ${rc.paceAdaptativo ? "LIGADO (abre o intervalo se a conexão reclamar)" : "desligado"}`,
                `• teto de preset: ${cap.maxMessages} msg · mín ${cap.minInterval}ms · conc ${cap.maxConcurrency} · cooldown mín ${cap.minCooldown}ms`,
                `• cooldown do preset "${defId}": ${cd > 0 ? `${cd}ms restantes` : "livre"}`,
                `• job em andamento: ${job ? `${job.presetId} (${job.type}) há ${Math.round(job.elapsedMs / 1000)}s · ${job.targets.length} alvo(s)${job.cancelled ? " · CANCELANDO" : ""}` : "nenhum"}`,
                `• presets ligados: ${fx.listPresetIds().length} + ${fx.listCustomPresets().length} custom`,
                "",
                "_parar agora: 37 (kill switch) — a fila para na fronteira do lote._"
            ].join("\n")
            await getSock().sendMessage(chatJid, { text: t })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ raio-x: ${e.message}` })
        }
        return
    }
    // Números/ids que deixaram de existir na v53 (allowlist, dry-run, modo-teste,
    // preview da loja): resposta explícita em vez de ignorar em silêncio.
    if (["cfg_flood_dryrun", "cfg_flood_testmode", "cfg_flood_allowlist", "cfg_flood_allowlist_view",
         "cfg_flood_allowlist_add", "cfg_flood_allowlist_remove", "cfg_flood_loja",
         "flood_preset_shopping_test"].includes(actionId)) {
        const { itemRemovido } = await import("../utils/menuArt.js")
        const nomes = {
            cfg_flood_dryrun: "🧪 Dry-run", cfg_flood_testmode: "🎯 Modo teste",
            cfg_flood_allowlist: "🛡️ Allowlist", cfg_flood_allowlist_view: "🛡️ Allowlist",
            cfg_flood_allowlist_add: "➕ Add na allowlist", cfg_flood_allowlist_remove: "➖ Remover da allowlist",
            cfg_flood_loja: "🛍️ Loja / card de loja", flood_preset_shopping_test: "🛍️ Shopping test"
        }
        await getSock().sendMessage(chatJid, { text: itemRemovido(nomes[actionId] || actionId, "saiu da v53.") })
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

### handlers/interactionHandler.js — 30 linhas (1.4 KB)

```js
// handlers/interactionHandler.js
// [REORGANIZAÇÃO] Ponte entre a UI interativa e o roteador.
// INTERPRETA a interação (getInteractiveId) e a repassa ao roteador central.

// handlers/interactionHandler.js
// [REORGANIZAÇÃO] Camada de BOTÃO (button handler): identifica a interação,
// extrai o ID real e chama a AÇÃO existente (roteadorAcoes). NÃO trata clique
// como texto — origem separada por logs [BUTTON] e [ACTION].

import { getInteractiveId } from "../services/interactiveService.js"
import { roteadorAcoes } from "../commands/commandRouter.js"

export { getInteractiveId }

export async function tratarInteracao(chatJid, senderNum, interactionId) {
    // [BUTTON] = origem: clique/seleção nativa (não é texto digitado).
    console.log(`[BUTTON] interação recebida | id=${interactionId}`)
    try {
        // [v49] O transporte dedupa rowIds duplicados com "#2" — descarta sufixo.
        let id = String(interactionId || "").split("#")[0]
        // [v49] Navegação: "voltar_menu" não é ação do roteador — vira menu_inicial
        // (que o roteador conhece e reabre o painel). cat_*/comandos seguem direto.
        if (id === "voltar_menu" || id === "menu_inicial") id = "menu_inicial"
        console.log(`[ACTION] executando=${id}`)
        await roteadorAcoes(chatJid, senderNum, id)
    } catch (error) {
        console.error(`[BUTTON] erro ao processar interação:`, error?.message || error)
    }
}

```

### features/flood/config.js — 204 linhas (8.9 KB)

```js
// features/flood/config.js
// [v53 · AB7] Registro de TIPOS/PRESETS de conteúdo do flood SYZYGY.
//
// Arquitetura (não negociável, e é o que mantém isto um flood e não um sistema
// paralelo): NÃO existe segundo executor. O laço real é `executarFlood()` /
// `executarFloodLote()` em services/groupService.js. Preset é só DESCRIÇÃO DE
// CONTEÚDO + TETO; o envio continua sendo um `sock.sendMessage` só, com o wrap
// de "Ler Mais" da conexão.
//
// Tipos atuais: text · mention · media · payment · custom.
// (O tipo "shopping"/card de loja saiu do projeto nesta versão — quem for
// reimplementar loja depois adiciona um builder em presets/ e registra aqui;
// nada mais muda.)
//
// Fontes de verdade dos payloads:
//   • payment → @lucasmod/boruto-vk7-baileys@2.1.0, lib/Utils/messages.js:725-753
//     (monta requestPaymentMessage) e :1247-1249 (lê). Nenhum campo inventado.
//   • tetos   → FLOOD_PRESET_HARD_CAP abaixo ∧ MAX_FLOOD de utils/config.js.

import { CONFIG, MAX_FLOOD, FLOOD_TIPOS, FLOOD_TIPOS_LABEL, floodMaxEfetivo } from "../../utils/config.js"
import { getCustomPreset, listCustomPresets } from "./customStore.js"

// Nomes de tipo aceitos como conteúdo do flood. "text" = flood clássico.
export const FLOOD_PRESET_TYPES = ["text", "mention", "media", "payment", "custom"]
export const FLOOD_CONTENT_KINDS = ["text", "payment"]

// ─── Tetos absolutos (nem config.json, nem overlay, nem preset afrouxa) ──────
// [v53] Subiram junto com o pedido de "flooder de verdade": o modo mais rápido do
// flood normal é 50ms/lote 8 (FLOOD_MODOS.rapido), então o preset não pode exigir
// mais que isso; e o teto de mensagens por alvo deixou de ser "teste de 3
// mensagens" para ser "o que o operador manda, cercado por MAX_FLOOD".
export const FLOOD_PRESET_HARD_CAP = {
    maxMessages: 100,        // por alvo de um job de preset
    minInterval: 40,         // igual ao FLOOD_MODOS.rapido (v53)
    maxConcurrency: 4,       // alvos em paralelo dentro de um job
    minCooldown: 1000,
    minTimeout: 1000,
    maxTimeout: 30000,
    maxRetries: 2
}

/** Limite de envio por comando do flood clássico (lido do config, com teto duro). */
export const FLOOD_MAX_HARD_CEILING = 5000

// ─── Presets padrão (limites idênticos aos da arena 01a0aaae) ────────────────
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

// Defaults de runtime do tipo payment quando ele roda como flood normal (painel 2
// com tipo "pagamento"): o laço/ritmo vêm do FLOOD_MODOS escolhido, não daqui.
export const PAYMENT_PRESET_RUNTIME = {
    targetMode: "selected", maxMessages: 10, interval: 1000, concurrency: 1, cooldown: 5000, timeout: 15000
}

export const FLOOD_PRESETS = { ...FLOOD_GENERAL_PRESETS }

export const DEFAULT_FLOOD_PRESET_ID = "text-test"
export const DEFAULT_PAYMENT_PRESET_ID = "payment-test"

export function getFloodPreset(id) {
    if (!id) return null
    return FLOOD_PRESETS[String(id).trim()] || null
}

function clampInt(n, min, max, fallback) {
    const v = Number(n)
    if (!Number.isFinite(v)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(v)))
}

/**
 * Runtime do flood, lido do CONFIG do projeto (utils/config.js).
 * [v53] Saíram daqui `dryRun`, `testMode` e `allowlist`: o flood obedece à mesma
 * permissão do resto do bot (grupo precisa estar em `gruposAutorizados` pra ser
 * PROTEGIDO, e alvo é sempre escolha explícita do operador), sem gate extra.
 */
export function getFloodRuntimeConfig() {
    return {
        killSwitch: CONFIG.floodKillSwitch === true,
        maxRetries: clampInt(CONFIG.floodMaxRetries, 0, FLOOD_PRESET_HARD_CAP.maxRetries, 1),
        timeoutMs: clampInt(CONFIG.floodTimeoutMs, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000),
        maxMensagens: floodMaxEfetivo(),
        // estabilidade: quantos erros seguidos tolera antes de encerrar o job
        errorStop: clampInt(CONFIG.floodErrorStop, 1, 20, 3),
        // ritmo adaptativo: quando a conexão reclama (429/stream-end) o laço abre
        // o intervalo sozinho em vez de tomar tiro no pé
        paceAdaptativo: CONFIG.floodPaceAdaptativo !== false,
        tipo: FLOOD_TIPOS_LABEL[CONFIG.floodTipo] ? CONFIG.floodTipo : FLOOD_TIPOS.TEXTO
    }
}

/** Rótulo do tipo padrão do flood (mesma fonte do painel 2 e do menu do dono). */
export function floodTipoLabel(tipo = CONFIG.floodTipo) {
    return FLOOD_TIPOS_LABEL[tipo] || FLOOD_TIPOS_LABEL[FLOOD_TIPOS.TEXTO]
}

/**
 * Definição crua de um preset: built-in ou custom (dono/presets/*.json).
 * O overlay do wizard é aplicado depois, em loadPreset (que clampa).
 */
export function getPresetDef(id) {
    if (!id) return null
    const key = String(id).trim().toLowerCase()
    if (FLOOD_PRESETS[key]) {
        const base = { ...FLOOD_PRESETS[key] }
        if (base.type === "payment" && base.maxMessages == null) return { ...PAYMENT_PRESET_RUNTIME, ...base }
        return base
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
        format: custom.format,
        mentions: Array.isArray(custom.mentions) ? [...custom.mentions] : undefined,
        // mídia/atalhos conhecidos do fork (o builder do tipo decide o que usar)
        image: custom.image,
        video: custom.video,
        document: custom.document,
        location: custom.location,
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
 * ÚNICO ponto que aplica os tetos. Preset nenhum (built-in, custom, overlay ou
 * config.json) consegue maxMessages/intervalo/concorrência/cooldown/timeout fora
 * de FLOOD_PRESET_HARD_CAP — é isto que separa "flooder cercado" de disparo solto.
 */
export function clampPresetLimits(preset) {
    const src = preset && typeof preset === "object" ? preset : {}
    const maxMessages = clampInt(src.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const interval = clampInt(src.interval, FLOOD_PRESET_HARD_CAP.minInterval, 60000, 1000)
    const concurrency = clampInt(src.concurrency, 1, FLOOD_PRESET_HARD_CAP.maxConcurrency, 1)
    const cooldown = clampInt(src.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, 300000, 30000)
    const timeout = clampInt(src.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    return { ...src, maxMessages, interval, concurrency, cooldown, timeout }
}

/** Limite de mensagens por alvo de um job (hard cap ∧ teto do config). */
export function clampJobQtd(qtd, preset = null) {
    const classic = getFloodRuntimeConfig().maxMensagens
    const wanted = clampInt(qtd, 1, classic, 1)
    // Sem preset (flood clássico digitado no painel 2) o que vale é o teto do
    // config; com preset, vale também o teto do próprio preset (clampPresetLimits).
    const perPreset = preset && preset.maxMessages != null
        ? clampInt(preset.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
        : classic
    return Math.max(1, Math.min(wanted, perPreset, classic))
}

export function listPaymentPresets() {
    return Object.values(FLOOD_PRESETS).filter(p => p.type === "payment")
}

export function listPaymentPresetsTexto() {
    const l = listPaymentPresets()
    if (!l.length) return "_(nenhum preset de pagamento cadastrado)_"
    return l
        .map(p => `  *${p.id}* · ${p.text || "pagamento"} · ${p.currency || "BRL"} ${Number(p.amount || 0).toFixed(2)} · ${p.maxMessages}x`)
        .join("\n")
}

export { FLOOD_PRESET_HARD_CAP as PRESET_HARD_CAP }

```

### features/flood/payment.js — 161 linhas (7.1 KB)

```js
// features/flood/payment.js
// [INFRA FLOOD · recuperada da arena 01a0aaae]
// Adaptador da Payment Message REAL do pacote instalado (@lucasmod/boruto-vk7-baileys
// 2.1.0): sock.sendMessage(jid, { payment: PaymentInfo }) → requestPaymentMessage
// { amount1000, currencyCodeIso4217, noteMessage, requestFrom }.
//
// [v53] O card de loja (e o adapter que "recusava payment") saiu do projeto:
// sobrou só o que o fork realmente entende. Contrato de payload — conferido na
// fonte em tests.js —: { payment: { note, currency, amount(×1000), offset, from,
// expiry } }. Não existe "sendPaymentMessage" aqui: quem envia é o laço do flood
// (safeSendMessage / executarFlood), para não haver um segundo sock.sendMessage.
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

// ─── gatilho de sintaxe do TIPO pagamento ───────────────────────────────────
// O wizard (2 · FLOOD → tipo) é o caminho principal. Isto aqui é o atalho do
// mesmo caminho, para quem digita: "pag:" na frente do conteúdo, com valor e
// moeda embutidos. Não cria executor, fila nem permissão — no maximo vira o
// mesmo { payment } que o preset do tipo produz.
export const PAYMENT_TRIGGERS = ["pag:", "pagamento:", "payment:"]

export function detectPaymentTrigger(text) {
    const t = String(text == null ? "" : text).trim()
    for (const p of PAYMENT_TRIGGERS) {
        if (t.toLowerCase().startsWith(p)) return { isPayment: true, rest: t.slice(p.length).trim() }
    }
    return { isPayment: false, rest: t }
}

/**
 * "nota|25,90|BRL" → conteúdo de flood validado.
 * @returns {{ok:true, content:object, summary:string}|{ok:false, error:string, usage:string}}
 */
export function resolvePaymentContent(rest = "") {
    const p = parsePaymentArgs(rest)
    if (!p.ok) return { ok: false, error: p.error || "USAGE", usage: p.usage || usageTexto() }
    return {
        ok: true,
        content: { type: "payment", text: p.text, amount: p.amount, currency: p.currency },
        summary: `💳 ${p.display} · nota: ${p.text}`
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
        PAYMENT_UNAVAILABLE: "Payment Message indisponível nesta versão do Baileys."
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

### features/flood/targets.js — 174 linhas (6.6 KB)

```js
// features/flood/targets.js
// [v53 · AB7] Destinos dos presets de flood. A allowlist paralela deixou de
// existir: o preset obedece à MESMA regra do flood normal (painéis 2/3/8, que
// pegam o alvo da escolha explícita do operador sobre a lista de grupos do bot e
// ignoram os grupos protegidos). Nada de segunda lista de autorização, nada de
// gate extra por tipo — texto, menção, mídia e pagamento entram igual.
//
// O que este módulo é:
//   • normalizeTargetJid() → jid completo ou número puro → forma canônica (null
//     se inválido). Sem isso "5519…" vira destinatário quebrado no relay.
//   • maskJid()            → log/histórico nunca veem o número inteiro.
//   • filterTargets()      → particiona a lista explícita em liberados/barrados
//     com a porteira de grupo protegido do projeto. Lista vazia NUNCA significa
//     "todo mundo": é erro.
//
// O que ele NÃO é: fila, timer, retry, permissão própria, executor de flood.

import { CONFIG } from "../../utils/config.js"
import { rt } from "../../connection/socket.js"
import { normalizeNumber, isGroupJid, isAuthorizedGroup } from "../../utils/permissions.js"

export const BLOCKED_TARGET = "BLOCKED_TARGET"
export const NO_TARGETS = "NO_TARGETS"
export const PROTECTED_GROUP_BLOCKED = "PROTECTED_GROUP_BLOCKED"

const KNOWN_DOMAINS = ["g.us", "s.whatsapp.net", "lid"]

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

/** Nunca imprime o número inteiro: destino também é dado sensível. */
export function maskJid(jid) {
    if (!jid) return "(none)"
    const s = String(jid)
    const [user, domain] = s.split("@")
    if (!user) return "***"
    if (user.length <= 4) return `****@${domain || "?"}`
    return `${user.slice(0, 4)}****${user.slice(-2)}@${domain || "?"}`
}

/** Mesma porteira do flood normal: grupo autorizado do bot é intocável. */
function isProtected(jid, opts = {}) {
    if (typeof opts.isProtected === "function") return opts.isProtected(jid)
    try { return isAuthorizedGroup(jid) } catch { return false }
}

/**
 * @param {Array<string|{id:string}>} jids lista EXPLÍCITA do operador/preset
 * @returns {{ok:boolean, allowed:string[], blocked:Array<{jid:string,reason:string}>, error?:string}}
 */
export function filterTargets(jids, opts = {}) {
    const incoming = Array.isArray(jids) ? jids : []
    const allowed = []
    const blocked = []
    const seen = new Set()

    if (!incoming.length) {
        return {
            ok: false,
            error: NO_TARGETS,
            allowed,
            blocked,
            message: "nenhum destino informado — o flood não escolhe alvo sozinho"
        }
    }

    for (const raw of incoming) {
        const original = String((raw && raw.id) || raw || "")
        const jid = normalizeTargetJid(raw && typeof raw === "object" ? raw.id : raw)
        if (!jid) {
            blocked.push({ jid: original, reason: BLOCKED_TARGET })
            continue
        }
        if (seen.has(jid)) continue
        seen.add(jid)
        if (isGroupJid(jid) && isProtected(jid, opts)) {
            blocked.push({ jid, reason: PROTECTED_GROUP_BLOCKED })
            continue
        }
        allowed.push(jid)
    }

    if (!allowed.length) return { ok: false, error: BLOCKED_TARGET, allowed, blocked }
    return { ok: true, allowed, blocked }
}

/** Grupo protegido? (exportado para quem precisa avisar sem duplicar a regra.) */
export function isProtectedGroupJid(jid) {
    return isGroupJid(jid) && isProtected(jid)
}

// ─── Seleção corrente do operador ────────────────────────────────────────────
// Os atalhos de texto (paymenttest, texttest, 2/preset/<id>) não pedem alvo a
// cada disparo: eles usam a ÚLTIMA escolha feita no painel do flood — o mesmo
// cache que o flood de texto usa. Sem escolha feita, o atalho recusa (e diz como
// escolher) em vez de adivinhar.
export function setFloodSelection(jids, { dono = null } = {}) {
    const lista = Array.isArray(jids) ? jids : []
    const rt = getRt()
    if (!rt) return []
    const norm = []
    const seen = new Set()
    for (const raw of lista) {
        const jid = normalizeTargetJid(raw && typeof raw === "object" ? raw.id : raw)
        if (!jid || seen.has(jid)) continue
        seen.add(jid)
        norm.push(jid)
    }
    if (dono) rt.floodSelection = rt.floodSelection || {}
    if (dono) rt.floodSelection[dono] = norm
    else rt.floodSelectionGlobal = norm
    return norm
}

export function getFloodSelection(dono = null) {
    const rt = getRt()
    if (!rt) return []
    const lista = dono && rt.floodSelection ? rt.floodSelection[dono] : rt.floodSelectionGlobal
    return Array.isArray(lista) ? lista : []
}

export function clearFloodSelection(dono = null) {
    const rt = getRt()
    if (!rt) return
    if (dono && rt.floodSelection) delete rt.floodSelection[dono]
    else rt.floodSelectionGlobal = []
}

function getRt() {
    try { return rt() } catch { return null }
}

/**
 * Resumo de alvo para menu/log — mascarado e curto. `null` vira "nenhum", porque
 * "nenhum alvo" é informação, não erro de formatação.
 */
export function resumoAlvosTexto(jids, { max = 3 } = {}) {
    const lista = Array.isArray(jids) ? jids.filter(Boolean) : []
    if (!lista.length) return "nenhum (use 36 · escolher grupos)"
    const mostrados = lista.slice(0, max).map(j => maskJid(j && j.id ? j.id : j))
    const resto = lista.length - mostrados.length
    return `${lista.length} grupo(s): ${mostrados.join(", ")}${resto > 0 ? ` +${resto}` : ""}`
}

/** Números de grupo "limpos" a partir da lista do dono (para persistir em config). */
export function alvosValidos(jids, opts = {}) {
    const r = filterTargets(jids, opts)
    return r.ok ? r.allowed : []
}

/** Quantos grupos o bot tem autorizados — usado em texto de menu/diagnóstico. */
export function contagemGruposAutorizados() {
    const raw = Array.isArray(CONFIG.gruposAutorizados) ? CONFIG.gruposAutorizados : []
    return raw.map(g => normalizeTargetJid(g && g.id ? g.id : g)).filter(Boolean).length
}

```

### features/flood/groups.js — 63 linhas (2.4 KB)

```js
// features/flood/groups.js
// [INFRA FLOOD · recuperada da arena 01a0aaae]
// Alvos de um job de preset: SEMPRE escolha explícita (1 grupo, ou 1,3,5).
// Não existe varredura de "todos os grupos" nem de "todos os contatos" aqui —
// quem resolve o índice é o cache de grupos que o AB7 já mantém
// (rt().cachedGroups, services/groupService.js), e a porteira é a do próprio
// AB7: grupos protegidos (autorizados) são cortados por filterTargets().

export const TARGETS_REQUIRED = "TARGETS_REQUIRED"

/**
 * "1" ou "1,3,5" sobre o cache de grupos → [{id, subject, isAdmin, index}].
 * anything inválido vira `invalid` (devolvido na mensagem), nunca "todos".
 */
export function parseSelectedGroups(cache, raw) {
    const txt = String(raw == null ? "" : raw).trim()
    if (!txt) return { ok: false, error: "USAGE", entries: [], invalid: [] }
    // "|" é o separador do overlay de conteúdo (texto|title|surface|id): se veio
    // aqui, é o operador confundindo os dois campos — melhor erro claro.
    if (txt.includes("|")) return { ok: false, error: "USAGE", entries: [], invalid: [] }
    const tokens = txt.split(",").map(s => s.trim()).filter(Boolean)
    if (!tokens.length) return { ok: false, error: "USAGE", entries: [], invalid: [] }
    const entries = []
    const invalid = []
    const seen = new Set()
    for (const tok of tokens) {
        if (!/^0*\d+$/.test(tok)) {
            invalid.push(tok)
            continue
        }
        const n = parseInt(tok, 10)
        if (!Number.isFinite(n) || n < 1) {
            invalid.push(tok)
            continue
        }
        const g = cache && cache[n]
        if (!g || !g.id) {
            invalid.push(String(n))
            continue
        }
        if (seen.has(g.id)) continue
        seen.add(g.id)
        entries.push({ id: g.id, subject: g.subject || g.id, isAdmin: !!g.isAdmin, index: n })
    }
    if (!entries.length) return { ok: false, error: "NONE", entries: [], invalid }
    return { ok: true, entries, invalid }
}

/** Aceita [jid, ...] ou [{id}, ...]; remove duplicados preservando a ordem. */
export function extractTargetJids(list) {
    const out = []
    const seen = new Set()
    if (!Array.isArray(list)) return out
    for (const item of list) {
        const jid = item && typeof item === "object" ? item.id : item
        const s = String(jid || "").trim()
        if (!s || seen.has(s)) continue
        seen.add(s)
        out.push(s)
    }
    return out
}

```

### features/flood/limiter.js — 172 linhas (6.7 KB)

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
    // [v53] o relay também devolve "429 / too many requests" em texto livre (sem
    // e.data): se cair no ramo genérico, vira abort e o job morre por um motivo que
    // bastava esperar. Continuamos só ESPERANDO (backoff na fila) — nunca contornar.
    if (msg.includes("rate-overlimit") || msg.includes("rate") || data === 429 || msg.includes("429") || msg.includes("too many requests")) {
        return { kind: "rate_limit", retry: true, abort: false }
    }
    if (msg.includes("disconnect") || msg.includes("connection closed") || msg.includes("not connected") || msg.includes("logged out")) {
        return { kind: "disconnect", retry: false, abort: true }
    }
    if (msg.includes("forbidden") || msg.includes("not-authorized") || msg.includes("blocked")) {
        return { kind: "permanent", retry: false, abort: true }
    }
    return { kind: "error", retry: false, abort: true }
}

```

### features/flood/killswitch.js — 67 linhas (2.5 KB)

```js
// features/flood/killswitch.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Botão de parada global do flood de presets — e CONSULTADO pelo flood clássico
// (services/groupService.js → executarFlood), que no AB7 não tinha nenhuma
// forma de interrupção.
//
// Estado único, sem duplicar: a chave viva é CONFIG.floodKillSwitch (utils/config.js).
// O flag de memória existe só para o caso "liguei agora e NÃO quero gravar em
// config.json" — `persist: true` é que chama salvarConfig().
//
// Importante para o AB7: isto NÃO substitui o que `features/flood/index.js`
// já faz, nem adiciona permissão nova. É só um booleano que os laços consultam.

import { CONFIG, salvarConfig } from "../../utils/config.js"

// Flag em memória (desliga sem tocar em disco quando persist=false).
let memoryKill = false
const listeners = new Set()

export const KILL_SWITCH_REASON = "KILL_SWITCH"

export function isKillSwitchOn() {
    return memoryKill === true || CONFIG.floodKillSwitch === true
}

/** Ligado pela config persistida (independente do flag de memória). */
export function isKillSwitchPersisted() {
    return CONFIG.floodKillSwitch === true
}

/**
 * @param {boolean} on
 * @param {{persist?: boolean}} [opts] persist=true grava em config.json
 * @returns {boolean} estado efetivo depois de aplicar
 */
export function setKillSwitch(on, { persist = false } = {}) {
    memoryKill = !!on
    CONFIG.floodKillSwitch = !!on
    if (persist) {
        try { salvarConfig() } catch {}
    }
    for (const fn of [...listeners]) {
        try { fn(memoryKill) } catch {}
    }
    return isKillSwitchOn()
}

export function toggleKillSwitch({ persist = false } = {}) {
    return setKillSwitch(!isKillSwitchOn(), { persist })
}

/** Assina mudanças do kill switch. Devolve unsubscribe (sem listener vazando). */
export function onKillSwitch(fn) {
    if (typeof fn !== "function") return () => false
    listeners.add(fn)
    return () => listeners.delete(fn)
}

/** Linha de status para terminal/confirmação — nunca imprime números crus. */
export function killSwitchStatusTexto() {
    const estado = isKillSwitchOn() ? "LIGADO (flood bloqueado)" : "desligado"
    const origem = CONFIG.floodKillSwitch === true
        ? (memoryKill ? "config + sessão atual" : "config.json")
        : (memoryKill ? "só nesta execução" : "—")
    return `⛔ Kill switch do flood: ${estado}\n• origem: ${origem}\n• efeito: interrompe jobs de preset e o flood clássico na próxima iteração.`
}

```

### features/flood/router.js — 215 linhas (11.5 KB)

```js
// features/flood/router.js
// [v53 · AB7] Fachada de comandos da arena 01a0aaae, reconstruída sobre a API da
// AB7 e SEM os três conceitos que saíram do projeto: allowlist, dry-run e
// preview. O que mudou de propósito:
//   • Não existe wizard paralelo: os atalhos (`paymenttest`, `texttest`, …)
//     disparam pelo MESMO runPresetJob que chama o executarFlood clássico
//     (services/groupService.js). Nada aqui chama sock.sendMessage() para mandar
//     flood, e nada aqui cria segundo executor.
//   • Alvo = a ÚLTIMA seleção feita no painel do flood (o mesmo cache que o flood
//     de texto usa). Sem seleção feita o atalho recusa e ensina o caminho — não
//     amplia nada sozinho, não "lembra" de outro lugar.
//   • Não há ensaio: o que sai, sai. A cerca é o teto (clampJobQtd), o kill
//     switch e o cooldown por alvo.
//   • payment é um TIPO do flood (preset type:"payment"), não uma segunda porta.

import { getSock } from "../../connection/socket.js"
import { isOwner } from "../../utils/permissions.js"
import { setState } from "../../utils/stateManager.js"
import { CONFIG, FLOOD_TIPOS, floodMaxEfetivo } from "../../utils/config.js"
import { runPresetJob, formatPresetJobResult, currentJobInfo, cancelRunningJob } from "./presetEngine.js"
import { setKillSwitch, killSwitchStatusTexto, KILL_SWITCH_REASON } from "./killswitch.js"
import { listPresetsTexto } from "./presets/index.js"
import { formatCustomPresetsTexto } from "./customStore.js"
import { getFloodSelection, resumoAlvosTexto } from "./targets.js"
import { parseAmount, parseCurrency } from "./payment.js"
import { getFloodRuntimeConfig, FLOOD_PRESET_HARD_CAP, floodTipoLabel } from "./config.js"
import { LOGO, moldura, separador, estado } from "../../utils/menuArt.js"

/**
 * Nomes de comando público → ação. Fonte única dos atalhos de texto
 * (commands/commandMap.js) e da ajuda: renumerar/renomear AQUI, não lá.
 */
export const FLOOD_PRESET_COMMANDS = {
    floodpresets: "painel_flood_presets",
    floodpreset: "painel_flood_presets",
    texttest: "flood_preset_text_test",
    mentiontest: "flood_preset_mention_test",
    mediatest: "flood_preset_media_test",
    paymenttest: "flood_preset_payment_test",
    pagamento: "painel_flood_pagamento",
    floodalvos: "cfg_flood_targets",
    floodstop: "flood_kill_on",
    floodstart: "flood_kill_off"
}

/** Ação de atalho → preset que ela roda (null = painel/toggle, não roda job). */
export const FLOOD_TEST_ACTION_PRESET = {
    flood_preset_text_test: "text-test",
    flood_preset_mention_test: "mention-test",
    flood_preset_media_test: "media-test",
    flood_preset_payment_test: "payment-test"
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

/** Painel 35 (⚔️ flood presets): o que existe, como rodar, os tetos e os alvos. */
export function floodPresetsMenuTexto() {
    const rc = getFloodRuntimeConfig()
    const atalhos = Object.entries(FLOOD_PRESET_COMMANDS).map(([c, a]) => `┃ ${c} ⬥ ${a}`)
    const alvos = resumoAlvosTexto(getFloodSelection())
    return [
        moldura(`${LOGO.fraktur} · 🌊 FLOOD · PRESETS`),
        listPresetsTexto(),
        formatCustomPresetsTexto(),
        separador(9, "flores"),
        `┃ teto/job: ${FLOOD_PRESET_HARD_CAP.maxMessages} msg · mín ${FLOOD_PRESET_HARD_CAP.minInterval}ms · ${FLOOD_PRESET_HARD_CAP.maxConcurrency} por vez`,
        `┃ flood normal: até ${floodMaxEfetivo()} msg/alvo (config.json#floodMaxMensagens)`,
        `┃ kill switch: ${estado(rc.killSwitch, { on: "🛑 ATIVO", off: "liberado" })} · tipo padrão: ${floodTipoLabel(rc.tipo)}`,
        `┃ alvos atuais: ${alvos}`,
        separador(9, "trilho"),
        `┃ rodar agora (usa a seleção do painel 2):`,
        `┃ ${"  paymenttest  ·  texttest  ·  mentiontest  ·  mediatest"}`,
        `┃ 2/preset/<id>[/conteúdo]`,
        `┃   ex: 2/preset/payment-test/Pagamento do pedido|25.90|BRL`,
        `┃ alvo avulso: 36>1,3,5  (números da lista de grupos)`,
        separador(9, "neve"),
        `┃ atalhos:`,
        ...atalhos,
        `┃ nenhum destes caminhos cria um segundo executor: o envio é o`,
        `┃ executarFlood do AB7 (services/groupService.js) — um sock.sendMessage só.`
    ].join("\n")
}

/** Overlay de payment a partir de "texto|25.90|BRL". */
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
 * Alvos de um atalho: a seleção corrente do operador. Sem seleção, a resposta
 * ensina o caminho em vez de atirar em tudo que o bot conhece.
 */
function resolverAlvos(ownerKey) {
    const alvos = getFloodSelection(ownerKey).length ? getFloodSelection(ownerKey) : getFloodSelection()
    if (!alvos.length) {
        return {
            ok: false,
            message: `⚠️ NENHUM_ALVO\nNada foi enviado: o flood só atira em alvo escolhido por você.\n\nUse 36 no painel do dono (ou 2 → flood no menu) e digite os números dos grupos, ex: 1,3,5.`
        }
    }
    return { ok: true, alvos }
}

async function runTestJob(chatJid, ownerKey, { presetId, rest = "", tipo = null, qtd = 1 } = {}) {
    const alvos = resolverAlvos(ownerKey)
    if (!alvos.ok) return send(chatJid, alvos.message)

    let overlay = {}
    if (tipo === "payment") {
        const p = paymentOverlayFromRest(rest)
        if (!p.ok) return send(chatJid, `❌ ${p.error}\n${p.usage || "formato: texto|25.90|BRL"}`)
        overlay = p.overlay
    } else if (rest) {
        overlay = { text: rest }
    }

    const res = await runPresetJob({ presetId, overlay, targets: alvos.alvos, qtd })
    try {
        const { registrarAcao } = await import("../../services/historicoService.js")
        registrarAcao("flood_preset", {
            preset: presetId, ok: !!res.ok, sent: res.metrics?.sent,
            alvos: alvos.alvos.length, erro: res.error || undefined, via: "router"
        })
    } catch { /* histórico é opcional aqui */ }
    return send(chatJid, formatPresetJobResult(res))
}

/**
 * Roteador público. Idempotente e sem estado próprio: os únicos estados criados
 * são os de digitação (36 · grupos), tratados em handlers/stateHandler.js.
 */
export async function floodRouter(chatJid, ownerKey, actionId, extra = {}) {
    if (actionId === "painel_flood_presets" || actionId === "flood_presets_menu") {
        return send(chatJid, floodPresetsMenuTexto())
    }
    if (actionId === "painel_flood_pagamento" || actionId === "cfg_flood_tipo") {
        // payment como TIPO padrão do flood: o painel 2 abre já no modo escolha
        // (texto/pagamento) e o laço continua o MESMO. 40 no painel do dono alterna.
        const atual = CONFIG.floodTipo === FLOOD_TIPOS.PAGAMENTO ? FLOOD_TIPOS.PAGAMENTO : FLOOD_TIPOS.TEXTO
        const proximo = actionId === "cfg_flood_tipo" && extra.tipo
            ? (extra.tipo === "payment" || extra.tipo === "pagamento" ? FLOOD_TIPOS.PAGAMENTO : FLOOD_TIPOS.TEXTO)
            : (atual === FLOOD_TIPOS.PAGAMENTO ? FLOOD_TIPOS.TEXTO : FLOOD_TIPOS.PAGAMENTO)
        CONFIG.floodTipo = proximo
        try { const { salvarConfig } = await import("../../utils/config.js"); salvarConfig() } catch { /* config salvo na próxima escrita */ }
        const msg = proximo === FLOOD_TIPOS.PAGAMENTO
            ? `💳 tipo padrão do flood: ${floodTipoLabel(FLOOD_TIPOS.PAGAMENTO)}\n\nAbra 2 · FLOOD: o painel já pede o valor/moeda do pagamento e usa o mesmo laço, o mesmo ritmo e os mesmos alvos do flood de texto.`
            : `📝 tipo padrão do flood: ${floodTipoLabel(FLOOD_TIPOS.TEXTO)}`
        return send(chatJid, msg)
    }
    if (actionId === "flood_kill_on" || actionId === "flood_kill_off") {
        if (!isOwner(ownerKey)) return send(chatJid, "❌ Apenas o dono mexe no kill switch.")
        const on = actionId === "flood_kill_on"
        setKillSwitch(on, { persist: true })
        if (on && currentJobInfo()) cancelRunningJob(KILL_SWITCH_REASON)
        return send(chatJid, `${on ? "🛑 FLOOD_KILL_SWITCH LIGADO" : "▶️ FLOOD_KILL_SWITCH desligado"}\n${on ? "Fila interrompida na fronteira do lote; novos jobs barrados." : "Novos jobs liberados (respeitando cooldown)."}\n\n${killSwitchStatusTexto()}`)
    }
    if (actionId === "cfg_flood_targets") {
        // Mesma máquina do flood normal: listarGruposInterativo monta o cache
        // numerado e stateHandler resolve "1,3,5" / "pag 2". Aqui só trocamos o
        // destino da seleção (waiting_flood_targets em vez de "waiting_flood_message").
        setState(ownerKey, { action: "waiting_group", next: "waiting_flood_targets", origem: "painel_dono" })
        try {
            const { listarGruposInterativo } = await import("../../menus/groupMenu.js")
            const cache = await listarGruposInterativo(chatJid, extra.pagina || 1)
            if (!cache || !Object.keys(cache).length) {
                return send(chatJid, `⚠️ nenhum grupo em cache\nMande o bot entrar num grupo (ou #glist) e tente 36 de novo.`)
            }
            const alvos = resumoAlvosTexto(getFloodSelection(ownerKey))
            return send(chatJid, `${moldura(`${LOGO.fraktur} · 🎯 ALVOS DO FLOOD`)}\n┃ escolha os números: 1 · 1,3,5 · todos · limpar\n┃ alvos atuais: ${alvos}\n${separador(9, "flores")}\n┃ grupos PROTEGIDOS (autorizados) são ignorados: o alvo é\n┃ sempre escolha sua, nunca ampliação automática.`)
        } catch (e) {
            return send(chatJid, `❌ não consegui listar os grupos: ${e?.message || e}`)
        }
    }
    // [v53] o preset de loja saiu do catálogo, mas o atalho antigo ainda chega pelo
    // painel de comandos e pelos números antigos: responder "opção removida" é melhor
    // que um "isso não é comando do flood" genérico — e, sobretudo, não executa nada.
    if (/^flood_preset_shopping/i.test(actionId)
        || (actionId === "run" && /^shopping/i.test(String(extra.presetId || "")))) {
        return send(chatJid, "🛍️ Preview de loja (shopping test) saiu da v53. Os tipos de preset agora são texto, menção, mídia e pagamento — use 2 → tipo → conteúdo.")
    }
    const presetId = FLOOD_TEST_ACTION_PRESET[actionId]
    if (presetId) {
        const tipo = presetId.includes("payment") ? "payment" : null
        return runTestJob(chatJid, ownerKey, { presetId, rest: extra.rest || "", tipo })
    }
    if (actionId === "run") {
        // 2/preset/<id>[/conteúdo] — id livre (built-in ou custom)
        const id = String(extra.presetId || "").trim().toLowerCase()
        if (!id) return send(chatJid, `❌ 2/preset/<nome>\n\n${listPresetsTexto()}`)
        const tipo = /payment|pagamento/.test(id) ? "payment" : null
        return runTestJob(chatJid, ownerKey, { presetId: id, rest: extra.rest || extra.paymentArgs || "", tipo })
    }
    return send(chatJid, `⚠️ ação de flood desconhecida: ${actionId}\n\n${floodPresetsMenuTexto()}`)
}

export default floodRouter

```

### features/flood/presets/index.js — 105 linhas (4.3 KB)

```js
// features/flood/presets/index.js
// [PRESET · recuperado da arena 01a0aaae e adaptado ao AB7]
// Registry: id → definição (config.js, com limites clamped) → builder do tipo.
// É o único lugar que sabe "qual tipo usa qual builder". Não envia, não fila,
// não conhece socket: produção de conteúdo validado.
//
// Tipos finais: text · mention · media · payment · custom.
// [v53] O tipo "shopping" saiu do projeto (arquivos e builder removidos). Para
// religá-lo depois: crie ./shopping.js com {buildSendContent,makeIterationBuilder}
// e registre nas duas tabelas abaixo — nada mais no flood muda.

import { getPresetDef, clampPresetLimits, listPresetIds, FLOOD_PRESET_TYPES, FLOOD_PRESET_HARD_CAP } from "../config.js"
import { buildSendContent as buildText, makeIterationBuilder as iterText } from "./text.js"
import { buildSendContent as buildMention, makeIterationBuilder as iterMention } from "./mention.js"
import { buildSendContent as buildMedia, makeIterationBuilder as iterMedia } from "./media.js"
import { buildSendContent as buildPayment, makeIterationBuilder as iterPayment } from "./payment.js"
import { buildSendContent as buildCustom, makeIterationBuilder as iterCustom } from "./custom.js"

export const BUILDERS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment,
    custom: buildCustom
}

export const ITER_BUILDERS = {
    text: iterText,
    mention: iterMention,
    media: iterMedia,
    payment: iterPayment,
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
// bloqueado e segue (a falha é descrita, nunca disfarçada). Nada aqui "cria"
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

### features/flood/presets/payment.js — 43 linhas (1.6 KB)

```js
// features/flood/presets/payment.js
// [PRESET · recuperado da arena 01a0aaae]
// Payment é o payload do fork (requestPaymentMessage) montado como TIPO do flood:
// mesmo laço, mesmos tetos, mesmas permissões — sem gate de "modo teste" (v53).
// Campos do preset: texto (note) · valor · moeda · from · mentions (quando aplicável).

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

### features/flood/presets/custom.js — 52 linhas (2.0 KB)

```js
// features/flood/presets/custom.js
// [PRESET · recuperado da arena 01a0aaae — dispatcher fino]
// "custom" não tem builder próprio de conteúdo: ele DELEGA para o builder do
// tipo real (customType, caindo em type). Assim um preset custom nunca escapa
// dos limites nem da validação do tipo que imita — inclusive o de pagamento,
// que continua montado por ./payment.js (payload real do fork).

import { buildSendContent as buildText, makeIterationBuilder as iterText } from "./text.js"
import { buildSendContent as buildMention, makeIterationBuilder as iterMention } from "./mention.js"
import { buildSendContent as buildMedia, makeIterationBuilder as iterMedia } from "./media.js"
import { buildSendContent as buildPayment, makeIterationBuilder as iterPayment } from "./payment.js"

export const TYPE = "custom"

export const CUSTOM_TARGETS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment
}

const ITER_BUILDERS = {
    text: iterText,
    mention: iterMention,
    media: iterMedia,
    payment: iterPayment
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

### menus/configMenu.js — 232 linhas (13.0 KB)

```js
// menus/configMenu.js
// [v53 · AB7] Painéis de configuração redesenhados sobre utils/menuArt.js e com a
// numeração compactada depois que allowlist, dry-run, modo-teste e preview de
// loja saíram do projeto:
//   👤 CONFIGURAÇÕES (ADMs do bot)  → 1-11
//   👑 COMANDOS DO DONO (restrito)   → 12-41
// Os atalhos rápidos (5/NN e 6/NN) são derivados de CONFIG_OPCOES: renumerar
// AQUI já atualiza o parser de texto, sem segunda tabela para manter em dia.
//
// Tabela antiga → nova (para quem já tinha decorado):
//   36 Flood presets → 35 · 38 Escolher grupos → 36 · 39 Kill switch → 37
//   43 Velocidade    → 38 · 46 Raio-X           → 39 · 47 Voltar     → 41
//   37 Dry-run, 40/41/42 Allowlist, 44 Modo teste, 45 Preview loja → removidos
//   40 Tipo do flood (texto/pagamento) → NOVO

import { getSock } from "../connection/socket.js"
import { CONFIG, FLOOD_MODOS, FLOOD_TIPOS, uiModoEfetivo } from "../utils/config.js"
import { setState } from "../utils/stateManager.js"
import { safeSendMessage } from "../services/groupService.js"
import { VIEW_ONCE_CONFIG } from "../features/viewOnce/config.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { criarBotao } from "../utils/botoes.js"
import { LOGO, LOGO_PRINCIPAL, moldura, separador, opcao, bloco, rodape, estado } from "../utils/menuArt.js"

// ─── Rótulos (fonte única dos dois modos de UI) ─────────────────────────────
// Paridade 1:1 com CONFIG_OPCOES: toda opção tem rótulo, todo rótulo tem id
// roteado — features/flood/tests-menu.js é quem fiscaliza isto.
export const CONFIG_ROTULOS_ADM = [
    ["1", "👤 Ver proprietário"], ["2", "📱 Número conectado"], ["3", "📡 Status da conexão"],
    ["4", "📜 Histórico"], ["5", "📊 Relatório completo"], ["6", "⏰ Agendamentos"],
    ["7", "👥 Listar ADMs do bot"], ["8", "🧩 Listar grupos autorizados"], ["9", "👑 Listar donos"],
    ["10", "👻 Marcar fantasma"], ["11", "⬅️ Voltar ao menu"]
]
export const CONFIG_ROTULOS_DONO = [
    ["12", "🎨 Criar preset"], ["13", "🗑️ Apagar preset"],
    ["14", "🖼️ Imagem do menu"], ["15", "🔗 Link de divulgação"], ["16", "📖 Ler mais"],
    ["17", "🌊 Modo do flood (velocidade)"], ["18", "⏱️ Intervalo do flood"], ["19", "📦 Lote do flood"],
    ["20", "🧹 Auto-limpeza"], ["21", "🛡️ Anti-takeover"], ["22", "👻 Limpar fantasmas"], ["23", "🗓️ Limpar agendamentos"],
    ["24", "➕ Add ADM do bot"], ["25", "➖ Remover ADM"],
    ["26", "➕ Add grupo autorizado"], ["27", "➖ Remover grupo autorizado"],
    ["28", "➕ Add dono extra"], ["29", "➖ Remover dono extra"],
    ["30", "👁️ ViewOnce ON/OFF"], ["31", "👁️ VO → grupos"], ["32", "👁️ VO → dono"],
    ["33", "👁️ VO → ADMs"], ["34", "💾 VO salvar em disco"],
    ["35", "🌊 Flood · presets (load-test)"], ["36", "🎯 Flood · escolher grupos (1,3,5)"],
    ["37", "🛑 Flood · kill switch"], ["38", "🚀 Flood · velocidade dos presets"],
    ["39", "🩺 Flood · raio-X do job"], ["40", "💳 Flood · tipo padrão (texto/pagamento)"],
    ["41", "⬅️ Voltar ao menu"]
]

/** Seções do painel do dono (só estética; a numeração vem de CONFIG_OPCOES). */
export const CONFIG_SECOES_DONO = [
    { titulo: "🎨 PRESETS", numeros: ["12", "13"] },
    { titulo: "🖼️ APARÊNCIA", numeros: ["14", "15", "16"] },
    { titulo: "🌊 FLOOD", numeros: ["17", "18", "19"] },
    { titulo: "🧠 SISTEMA", numeros: ["20", "21", "22", "23"] },
    { titulo: "🔐 PERMISSÕES", numeros: ["24", "25", "26", "27", "28", "29"] },
    { titulo: "👁️ VIEW-ONCE", numeros: ["30", "31", "32", "33", "34"] },
    { titulo: "⚔️ FLOOD · CONTROLE", numeros: ["35", "36", "37", "38", "39", "40", "41"] }
]

/** Mapa único de opções (a UI é quem separa por faixa de número). */
export const CONFIG_OPCOES = {
    "0": "abrir_painel",
    // ── 👤 ADM (1-11) ──
    "1": "cfg_owner", "2": "cfg_number", "3": "cfg_status", "4": "cfg_historico",
    "5": "cfg_relatorio", "6": "cfg_agendamentos", "7": "cfg_list_users", "8": "cfg_list_groups",
    "9": "cfg_list_owners", "10": "cfg_fantasma", "11": "abrir_painel",
    // ── 👑 DONO (12-41) ──
    "12": "cfg_criar_preset", "13": "cfg_apagar_preset", "14": "cfg_menuImage", "15": "cfg_link",
    "16": "cfg_ler_mais", "17": "cfg_flood_modo", "18": "cfg_flood_interval", "19": "cfg_flood_lote",
    "20": "cfg_autolimpeza", "21": "cfg_antitakeover", "22": "cfg_limpar_fantasmas",
    "23": "cfg_limpar_agendamentos",
    "24": "cfg_add_user", "25": "cfg_remove_user", "26": "cfg_add_group", "27": "cfg_remove_group",
    "28": "cfg_add_owner", "29": "cfg_remove_owner",
    "30": "cfg_viewonce_toggle", "31": "cfg_viewonce_groups", "32": "cfg_viewonce_owner",
    "33": "cfg_viewonce_admins", "34": "cfg_viewonce_save",
    // ── ⚔️ FLOOD · CONTROLE (35-41) ──
    "35": "painel_flood_presets", "36": "cfg_flood_targets", "37": "cfg_flood_kill",
    "38": "cfg_flood_speed", "39": "cfg_flood_xray", "40": "cfg_flood_tipo", "41": "abrir_painel"
}

/**
 * Números que existiam até a v52 e deixaram de existir (dry-run, allowlist,
 * modo-teste, preview de loja, "voltar" em 47). O roteador responde em vez de
 * ignorar — número fantasma silencioso é o que faz o usuário achar que o bot
 * quebrou.
 */
export const OPCOES_REMOVIDAS = ["42", "43", "44", "45", "46", "47"]

// ─── Estado mostrado nas linhas (lido das mesmas fontes do flood) ────────────
async function estadoFlood() {
    let fx = null, erro = null
    try { fx = await import("../features/flood/index.js") } catch (e) { erro = e.message }
    const modo = CONFIG.floodModo || "normal"
    const mi = FLOOD_MODOS[modo]
    return {
        fx, erro,
        kill: fx ? fx.isKillSwitchOn() : false,
        presets: fx ? fx.listPresets().length : 0,
        custom: fx ? fx.listCustomPresets().length : 0,
        alvos: (fx && fx.getFloodSelection) ? fx.getFloodSelection() : [],
        tipo: CONFIG.floodTipo === FLOOD_TIPOS.PAGAMENTO ? "💳 pagamento" : "📝 texto",
        // ritmo EFETIVO (o que o laço realmente usa), não o default do modo: o dono
        // ajusta em 18/19 e a linha do painel tem que acompanhar.
        velocidade: (() => {
            const itv = Number.isFinite(+CONFIG.floodInterval) && +CONFIG.floodInterval > 0 ? +CONFIG.floodInterval : (mi?.intervalo ?? null)
            const lt = Number.isFinite(+CONFIG.floodLote) && +CONFIG.floodLote > 0 ? +CONFIG.floodLote : (mi?.lote ?? null)
            return itv == null ? modo : `${modo} (${itv}ms/l${lt ?? "?"})`
        })(),
        teto: fx ? fx.getFloodRuntimeConfig().maxMensagens : "?"
    }
}

function textoDono(f) {
    const qtdUsers = (CONFIG.usuariosAutorizados || []).length + (CONFIG.lidsAutorizados || []).length
    const qtdGroups = (CONFIG.gruposAutorizados || []).length
    const qtdOwners = (CONFIG.donosExtras || []).length
    const vo = [
        `┃ ${opcao("30", "👁️ ViewOnce", estado(VIEW_ONCE_CONFIG.enabled))}`,
        `┃ ${opcao("31", "👁️ VO → grupos", VIEW_ONCE_CONFIG.sendToAuthorizedGroups ? "SIM" : "não")}`,
        `┃ ${opcao("32", "👁️ VO → dono", VIEW_ONCE_CONFIG.sendToOwner ? "SIM" : "não")}`,
        `┃ ${opcao("33", "👁️ VO → ADMs", VIEW_ONCE_CONFIG.sendToAdmins ? "SIM" : "não")}`,
        `┃ ${opcao("34", "💾 VO em disco", VIEW_ONCE_CONFIG.saveToDisk ? "sim (apaga depois)" : "só buffer")}`
    ].join("\n")

    const alvos = f.alvos.length ? `${f.alvos.length} grupo(s) selecionado(s)` : "nenhum (use 36)"
    const erro = f.erro ? `┃ ⚠️ flood indisponível: ${f.erro}\n` : ""

    return [
        moldura(`${LOGO_PRINCIPAL} · 👑 COMANDOS DO DONO`, { largura: 26, enfeite: "༺༻" }),
        `┃ 🔒 só o dono mexe aqui`,
        `┃ 🌊 flood: ${f.tipo} · ${f.velocidade} · teto ${f.teto}`,
        `┃ 🛑 kill switch: ${f.kill ? "ATIVO (nada sai)" : "liberado"}`,
        `┃ 🎯 alvos do flood: ${alvos}`,
        separador(11, "flores"),
        `${bloco("🎨 PRESETS")}`,
        `┃ ${opcao("12", "🎨 Criar preset")}`,
        `┃ ${opcao("13", "🗑️ Apagar preset")}`,
        `${bloco("🖼️ APARÊNCIA")}`,
        `┃ ${opcao("14", "🖼️ Imagem do menu")}`,
        `┃ ${opcao("15", "🔗 Link divulgação", CONFIG.linkDivulgacao ? "definido" : "—")}`,
        `┃ ${opcao("16", "📖 Ler mais", estado(CONFIG.lerMais))}`,
        `${bloco("🌊 FLOOD")}`,
        `┃ ${opcao("17", "🌊 Modo (velocidade)", f.velocidade)}`,
        `┃ ${opcao("18", "⏱️ Intervalo", `${CONFIG.floodInterval}ms`)}`,
        `┃ ${opcao("19", "📦 Lote", `${CONFIG.floodLote}`)}`,
        `┃ ${opcao("40", "💳 Tipo padrão", f.tipo === "📝 texto" ? "texto" : "pagamento")}`,
        `${bloco("🧠 SISTEMA")}`,
        `┃ ${opcao("20", "🧹 Auto-limpeza", estado(CONFIG.autoLimpeza))}`,
        `┃ ${opcao("21", "🛡️ Anti-takeover", estado(CONFIG.antiTakeover))}`,
        `┃ ${opcao("22", "👻 Limpar fantasmas")}`,
        `┃ ${opcao("23", "🗓️ Limpar agendamentos")}`,
        `${bloco("🔐 PERMISSÕES")}`,
        `┃ ${opcao("24", "➕ Add ADM", `${qtdUsers}`)}`,
        `┃ ${opcao("25", "➖ Remover ADM")}`,
        `┃ ${opcao("26", "➕ Add grupo", `${qtdGroups}`)}`,
        `┃ ${opcao("27", "➖ Remover grupo")}`,
        `┃ ${opcao("28", "➕ Add dono", `${qtdOwners}`)}`,
        `┃ ${opcao("29", "➖ Remover dono")}`,
        `${bloco("👁️ VIEW-ONCE")}`,
        vo,
        `${bloco("⚔️ FLOOD · CONTROLE")}`,
        erro +
        `┃ ${opcao("35", "🌊 Presets (load-test)", `${f.presets} + ${f.custom}`)}`,
        `┃ ${opcao("36", "🎯 Escolher grupos (1,3,5)")}`,
        `┃ ${opcao("37", f.kill ? "▶️ Liberar flood" : "🛑 Parar flood AGORA")}`,
        `┃ ${opcao("38", "🚀 Velocidade dos presets")}`,
        `┃ ${opcao("39", "🩺 Raio-X do job")}`,
        separador(11, "trilho"),
        `┃ atalhos: ${"floodpresets · paymenttest · texttest · "}`,
        `┃ mentiontest · mediatest · floodstop · floodstart`,
        `┃ 2/preset/<id> · 12>2 · 36>1,3,5`,
        rodape({ dica: `digite 12-41 · cancelar = sair` })
    ].join("\n")
}

function textoAdm() {
    const qtdUsers = (CONFIG.usuariosAutorizados || []).length + (CONFIG.lidsAutorizados || []).length
    const qtdGroups = (CONFIG.gruposAutorizados || []).length
    const qtdOwners = (CONFIG.donosExtras || []).length
    return [
        moldura(`${LOGO_PRINCIPAL} · ⚙️ CONFIGURAÇÕES`, { largura: 26, enfeite: "༺༻" }),
        `┃ 👤 ADMs do bot podem usar`,
        separador(11, "neve"),
        ...CONFIG_ROTULOS_ADM.map(([n, r]) => `┃ ${opcao(n, r)}`),
        `┃ 7  ⬥ total: ${qtdUsers} ADM(s) · ${qtdGroups} grupo(s) · ${qtdOwners} dono(s)`,
        rodape({ dica: "opções do dono: 5 do menu principal" })
    ].join("\n")
}

// [v55] Renderer interativo — MESMA fonte (CONFIG_OPCOES/CONFIG_ROTULOS_*),
// MESMO estado (config_menu: digitar o número continua valendo nos dois modos).
async function enviarConfigInterativo(jid, ownerKey, modo = "adm") {
    const dono = modo === "dono"
    const rotulos = dono ? CONFIG_ROTULOS_DONO : CONFIG_ROTULOS_ADM
    const rows = rotulos.map(([n, t]) => ({ title: `${n.padStart(2, "0")} ${t}`, description: "", id: CONFIG_OPCOES[n] }))
    const sections = []
    // single_select do WhatsApp corta section acima de 10 linhas → páginas de 10
    for (let i = 0; i < rows.length; i += 10) {
        const fim = Math.min(i + 9, rows.length - 1)
        sections.push({
            title: `${dono ? "👑 DONO" : "⚙️ CONFIG"} ${rotulos[i][0]}-${rotulos[fim][0]}`,
            rows: rows.slice(i, i + 10)
        })
    }
    const botoes = [criarBotao("single_select", {
        title: dono ? `👑 ${LOGO_PRINCIPAL}` : `⚙️ ${LOGO_PRINCIPAL}`,
        text: dono ? "Comandos do dono (12-41)" : "Configurações (1-11)",
        buttonText: " SELECIONAR",
        sections
    })]
    const texto = dono
        ? `${separador(9, "flores")}\n👑 *${LOGO.fraktur}* · ⚔️ acesso restrito\n_Toque numa opção (12-41) ou digite o número_\n${separador(9, "flores")}`
        : `${separador(9, "neve")}\n⚙️ *${LOGO.fraktur}* · configurações\n_Toque numa opção (1-11) ou digite o número_\n${separador(9, "neve")}`
    if (ownerKey) setState(ownerKey, { action: "config_menu" })
    await enviarMensagemInterativa(jid, texto, botoes)
}

export async function enviarSubmenuConfig(jid, ownerKey, modo = "adm") {
    // DECISÃO CENTRAL DE MODO: buttons → só interativo; text/txt/bloks → só TXT.
    if (uiModoEfetivo() === "buttons") return enviarConfigInterativo(jid, ownerKey, modo)
    if (ownerKey) setState(ownerKey, { action: "config_menu" })
    if (modo !== "dono") return safeSendMessage(jid, { text: textoAdm() }, 0)
    const f = await estadoFlood()
    return safeSendMessage(jid, { text: textoDono(f) }, 0)
}

/** Painel do dono = seção 👑 da config (12-41 desde a v53). */
export async function enviarPainelDono(jid, ownerKey) {
    return enviarSubmenuConfig(jid, ownerKey, "dono")
}

```

### services/groupService.js — 724 linhas (32.4 KB)

```js
// services/groupService.js
// [v29] Ultra rápido: throttle reduzido, lotes maiores, roubar paralelo, blindagem.

import fs from "fs"
import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber, isAuthorizedGroup } from "../utils/permissions.js"
import { err, ok, warn } from "../utils/terminalUI.js"
import { CONFIG, FLOOD_MODOS, floodMaxEfetivo, FLOOD_TIPOS } from "../utils/config.js"
import { getFloodRuntimeConfig } from "../features/flood/config.js"
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
            // ?? com boolean à esquerda nunca caía adiante: o config de jitter era
            // ignorado no caminho de objeto (presets). Corrigido sem mudar a prioridade
            // de quem passa jitter explícito.
            jitter: modoOuIntervalo.jitter ?? (modoOuIntervalo.modo === "seguro" ? true : !!CONFIG.floodJitter),
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
    qtd = Math.min(Math.max(1, qtd), floodMaxEfetivo())

    const cfg = getFloodConfig(intervaloOuOpts)
    const rc = getFloodRuntimeConfig()
    // [v53] Lote até 20: o gargalo é o relay do WhatsApp, não o nosso loop — lote
    // maior fecha o job mais cedo (menos janela de reconexão no meio do flood).
    const LOTE = Math.max(1, Math.min(cfg.lote, 20))
    // retries do config agora VALEM: só cobram preço no erro (backoff de rate-limit
    // dentro do próprio safeSendMessage), nunca no caminho feliz.
    const retries = rc.maxRetries
    const erroStop = Math.max(1, rc.errorStop)
    const paceAdaptativo = rc.paceAdaptativo !== false

    let mentions = []
    // Só vale buscar participantes se o conteúdo NÃO trouxer mentions própria
    // (payment/mention definem as suas) — em grupo grande esse fetch é o único
    // round-trip de metadata do job e custa segundos na largada.
    const querMencoes = CONFIG.marcarFantasma && typeof buildContent !== "function"
    if (querMencoes) {
        try {
            const parts = await getParticipantsCachedOrFetch(jid)
            mentions = parts.map(p => p.id)
        } catch {}
    }

    const invis = "\u200b"
    const pad = [1, 2, 3, 4, 5, 6].map(n => invis.repeat(n))
    let ok = 0, erros = 0
    let stopado = null
    let tentadas = 0
    let atraso = Math.max(0, cfg.intervalo)
    const intervaloBase = atraso
    let errosSeguidos = 0
    const t0 = Date.now()

    for (let i = 0; i < qtd; i += LOTE) {
        // [INFRA FLOOD] O flood clássico não tinha como ser interrompido. O kill
        // switch é consultado na fronteira do lote (nunca no meio de um Promise).
        if (isKillSwitchOn()) { stopado = "KILL_SWITCH"; break }
        const n = Math.min(LOTE, qtd - i)
        tentadas += n
        const envios = []
        for (let k = 0; k < n; k++) {
            const idx = i + k
            const corpo = msg + pad[idx % pad.length]
            // CONTEÚDO por iteração: sem builder, é EXATAMENTE o flood clássico
            // ({ text }). Todo TIPO de conteúdo (ex.: 💳 pagamento) entra pelo
            // buildContent — mesmo laço, mesma fila, mesmo throttle, mesmas
            // permissões. Não existe segundo executor.
            let opts
            if (typeof buildContent === "function") {
                let custom = null
                try { custom = buildContent({ index: idx, body: corpo, msg }) } catch { custom = null }
                opts = custom && typeof custom === "object" ? custom : { text: corpo }
            } else {
                opts = { text: corpo }
            }
            // "mentions" só é sobrescrito pelo marcarFantasma quando o builder NÃO
            // forneceu lista própria: marca só destinos explicitamente autorizados.
            if (mentions.length && k === 0 && opts.mentions === undefined) opts.mentions = mentions
            envios.push(safeSendMessage(jid, opts, retries))
        }
        // allSettled: um envio que estoura não pode cancelar os irmãos do lote
        // (com Promise.all o reject ficava "flutuante" e o saldo saía errado).
        const res = await Promise.allSettled(envios)
        let falhas = 0
        let teveRate = false
        for (const r of res) {
            if (r.status === "fulfilled") ok++
            else {
                erros++
                falhas++
                const m = String(r.reason?.message || r.reason || "").toLowerCase()
                if (m.includes("rate") || r.reason?.data === 429 || m.includes("stream") || m.includes("restart")) teveRate = true
            }
        }
        // [v53 · estabilidade] o laço para sozinho quando o alvo está morto: N
        // lotes seguidos com falha em vez de martelar o relay até o timeout geral.
        errosSeguidos = falhas ? errosSeguidos + 1 : 0
        if (errosSeguidos >= erroStop && i + LOTE < qtd) { stopado = "ERROS_CONSECUTIVOS"; break }
        if (i + LOTE >= qtd) break
        // [v53 · ritmo adaptativo] connection.open/429 no meio do job abre o
        // intervalo sozinho (até 4x) e volta ao normal quando o lote limpa.
        if (paceAdaptativo) {
            if (teveRate || falhas) atraso = Math.min(intervaloBase * 4, Math.max(atraso * 2, 40))
            else if (atraso > intervaloBase) atraso = Math.max(intervaloBase, Math.floor(atraso / 2))
        }
        let delay = atraso
        if (cfg.jitter) delay += Math.floor(Math.random() * 250) + 50
        if (delay > 0) await new Promise(r => setTimeout(r, delay))
    }
    const ms = Date.now() - t0
    return {
        ok,
        erros,
        total: qtd,
        tentadas,
        modo: cfg.modo,
        intervalo: atraso,
        intervaloBase,
        lote: LOTE,
        ms,
        // throughput em msg/s — é o número que mostra se o "flooder" está fluindo
        msgPorSeg: ms > 0 ? Number(((ok / ms) * 1000).toFixed(1)) : 0,
        adaptou: paceAdaptativo && atraso !== intervaloBase,
        ...(stopado ? { stopado } : {})
    }
}

export async function executarFloodLote(grupos, msg, qtd, opts = {}) {
    // opts.buildContent (opcional) é repassado ao MESMO laço de executarFlood —
    // lote e loja compartilham exatamente o mesmo executor.
    const resultados = []
    const cfg = getFloodConfig(opts)
    // [v53] espera entre grupos menor: cada grupo já tem o próprio ritmo interno,
    // e o rate-limit é tratado com backoff dentro de executarFlood.
    const delayEntreGrupos = cfg.modo === "seguro" ? 400 : cfg.modo === "lento" ? 200 : cfg.modo === "rapido" ? 60 : 120
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
            // `ok` do LOTE é por grupo (boolean), e a contagem vai em enviados/total.
            // Antes o spread do executarFlood sobrescrevia ok com o número, e quem
            // lia "quantos grupos OK" contava envio como grupo.
            resultados.push({
                id: g.id, subject: g.subject || g.id,
                ok: (r.ok || 0) > 0,
                enviados: r.ok || 0, total: r.total, falhas: r.erros || 0,
                modo: r.modo, intervalo: r.intervalo, msgPorSeg: r.msgPorSeg,
                stopado: r.stopado || null
            })
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

### features/flood/doctor.mjs — 128 linhas (7.1 KB)

```js
// features/flood/doctor.mjs
// [v53] Diagnóstico da feature de flood — SOMENTE LEITURA. Não envia, não grava.
//
// Rode na raiz do projeto:
//   node features/flood/doctor.mjs
//   node features/flood/doctor.mjs --preset payment-test
//   node features/flood/doctor.mjs --only payment,media
//   node features/flood/doctor.mjs --target 120363...@g.us      (valida as porteiras)
//   node features/flood/doctor.mjs --qtd 5 --overlay-text "oi|25,90|BRL"
//
// O que ele faz: carrega o MESMO config.json do bot, imprime o estado efetivo
// (kill switch, teto, ritmo, alvos mascarados, hard caps) e MONTA o conteúdo de
// cada preset sem enviar nada. É a checagem de migração antes de ligar o bot.
//
// Por que não existe mais "--dry-run do job": na v53 o conceito de dry-run saiu
// (não há um segundo modo de execução). Aqui o que prova que nada sai é o próprio
// arquivo: ele não importa sock, não importa runPresetJob e não tem sendMessage.

import { carregarConfig, CONFIG, MAX_FLOOD, FLOOD_MODOS, floodMaxEfetivo, FLOOD_TIPOS } from "../../utils/config.js"
import * as fx from "./index.js"
import { alvosValidos } from "./targets.js"

carregarConfig()

const argv = process.argv.slice(2)
const argOf = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null
}
const presetArg = argOf("preset")
const targetArg = argOf("target")
const onlyArg = (argOf("only") || "").split(",").map(s => s.trim()).filter(Boolean)
const qtdArg = Number(argOf("qtd")) || 3
const overlayText = argOf("overlay-text")

const hr = (t = "─") => console.log(t.repeat(66))
const line = (k, v) => console.log(`${String(k).padEnd(22)} ${v}`)

let problemas = 0
const alerta = (msg) => { problemas++; console.log(`  ⚠️ ${msg}`) }

hr()
console.log("SYZYGY · flood (v53) — diagnóstico · NENHUM ENVIO ACONTECE AQUI")
hr()
line("flood clássico", `MAX_FLOOD ${MAX_FLOOD} · teto efetivo ${floodMaxEfetivo()} msg/alvo (config.json#floodMaxMensagens)`)
line("ritmo atual", `${CONFIG.floodModo || "normal"} · ${CONFIG.floodInterval}ms · lote ${CONFIG.floodLote} · jitter ${CONFIG.floodJitter === true ? "sim" : "não"}`)
line("FLOOD_MODOS", Object.values(FLOOD_MODOS).map(m => m.label).join(" | "))
line("tipo padrão", fx.floodTipoLabel(CONFIG.floodTipo || FLOOD_TIPOS.TEXTO))
line("kill switch", fx.isKillSwitchOn()
    ? `⛔ LIGADO${fx.isKillSwitchPersisted() ? " (persistido em config.json — sobrevive a restart)" : " (só nesta execução)"}`
    : "desligado")
const rt = fx.getFloodRuntimeConfig()
line("runtime dos presets", `retries=${rt.maxRetries} · timeout=${rt.timeoutMs}ms · para no ${rt.errorStop}º erro seguido · ritmo adaptativo ${rt.paceAdaptativo ? "ligado" : "desligado"}`)
line("hard caps", `≤${fx.FLOOD_PRESET_HARD_CAP.maxMessages} msg · intervalo ≥${fx.FLOOD_PRESET_HARD_CAP.minInterval}ms · conc ≤${fx.FLOOD_PRESET_HARD_CAP.maxConcurrency} · cooldown ≥${fx.FLOOD_PRESET_HARD_CAP.minCooldown}ms · retries ≤${fx.FLOOD_PRESET_HARD_CAP.maxRetries}`)
const sel = fx.getFloodSelection()
line("alvos da sessão", fx.resumoAlvosTexto(sel))
line("grupos protegidos", `${alvosValidos.length} autorizados (gruposAutorizados) — o flood NUNCA atira neles`)
if (fx.isFloodEngineRunning()) {
    const info = fx.currentJobInfo()
    line("job em andamento", `${info?.presetId || "?"} · ${info?.sent ?? 0}/${info?.planned ?? "?"} · alvos ${info?.targets?.length ?? 0}`)
} else {
    line("job em andamento", "nenhum")
}
if (!sel.length) {
    console.log("  ℹ️ sem alvos escolhidos: os atalhos (paymenttest, 2/preset/…) recusam com NENHUM_ALVO.")
    console.log("     Isso é de propósito — o flood não amplia alvo sozinho. Escolha em 36 ou 2 → grupos.")
}
hr()
console.log("PRESETS (built-in + custom)")
hr()
for (const p of fx.listPresets()) {
    const res = fx.remainingCooldown(p.id, p.cooldown) // ms que faltam (0 = livre)
    console.log(`  ${p.id.padEnd(18)} ${String(p.type).padEnd(8)} ${p.maxMessages}x · ${String(p.interval).padStart(5)}ms · conc ${p.concurrency} · cd ${Math.round(p.cooldown / 1000)}s · to ${p.timeout}ms${res ? ` · ⏳ cooldown faltando ${Math.ceil(res / 1000)}s` : " · cd livre"}`)
}
hr()
console.log("CONTEÚDO MONTADO POR PRESET (payload de send, zero rede)")
hr()

const ctx = { from: CONFIG.ownerOverride ? `${String(CONFIG.ownerOverride).replace(/\D/g, "")}@s.whatsapp.net` : "0@s.whatsapp.net" }
const ids = presetArg ? [presetArg] : fx.listPresetIds()
for (const id of ids) {
    const def = fx.getPresetDef(id)
    if (!def) { alerta(`preset desconhecido: ${id}`); continue }
    if (onlyArg.length && !onlyArg.includes(def.type)) continue
    const overlay = overlayText ? { text: overlayText } : {}
    const carrega = fx.loadPreset(id, overlay)
    if (!carrega.ok) { alerta(`${id} → ${carrega.error}`); continue }
    let conteudo, erro = null
    try {
        conteudo = fx.buildPresetContent(carrega.preset, ctx)
    } catch (e) {
        erro = e?.code || e?.message || String(e)
    }
    if (erro) { alerta(`${id} → conteúdo não montou: ${erro}`); continue }
    const chaves = Object.keys(conteudo || {})
    const resumido = JSON.stringify(conteudo, (k, v) => (["image", "video", "document", "mimetype"].includes(k) ? `[${k} ${Buffer.isBuffer(v) ? `${v.length}B` : typeof v}]` : v))?.slice(0, 150)
    console.log(`  ✓ ${id.padEnd(18)} tipo=${def.type} · chaves=${chaves.join("+") || "—"} · ${qtdArg}x/${def.maxMessages} máx`)
    if (def.type === "mention") console.log("     (as menções entram no contextInfo por iteração — makeIterationBuilder — não no conteúdo base)")
    console.log(`     ${resumido}${resumido.length >= 150 ? "…" : ""}`)
    for (const w of carrega.warnings || []) console.log(`     ⚠️ ${w}`)
}
hr()
console.log("PORTEIRAS DE ALVO")
hr()
if (targetArg) {
    const norm = fx.normalizeTargetJid(targetArg)
    console.log(`  normalizeTargetJid(${targetArg}) → ${norm ? fx.maskJid(norm) : "null (formato inválido)"}`)
    if (norm) {
        const f = fx.filterTargets([norm])
        console.log(`  filterTargets → ${f.ok ? `APROVADO (${f.allowed.length})` : `BARRADO (${f.error})`}${f.blocked?.length ? ` · bloqueados: ${f.blocked.map(b => b.reason).join(",")}` : ""}`)
        console.log(`  protegido? ${fx.isProtectedGroupJid(norm) ? "SIM (bloqueado — é o grupo autorizado do dono)" : "não"}`)
    }
} else {
    console.log("  passe --target <jid> para conferir as porteiras de um destino específico.")
}
const dup = fx.extractTargetJids(["150000000000000000-1000000000@g.us", { id: "150000000000000000-1000000000@g.us" }, null])
console.log(`  extractTargetJids deduplica objeto/string e descarta vazio: ${dup.length === 1 ? "ok" : "FALHOU"}`)
hr()
console.log(fx.formatFloodSpeedMenu())
hr()
console.log("Nada foi enviado e nada foi escrito em disco. Para rodar de verdade:")
console.log("2 → flood no menu (wizard) ou paymenttest/2/preset/<id> no painel do dono (35-41).")
console.log("O envio é sempre executarFlood()/executarFloodLote() — a mesma porta do flood de texto.")
if (problemas) {
    console.log(`\n⚠️ ${problemas} problema(s) acima.`)
    process.exitCode = 1
}

```

---

## 10. Descritos, não anexados (49)

### handlers/stateHandler.js — 1831 linhas (102.1 KB) · NÃO anexado por causa do orçamento

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

`config_menu`:121 · `waiting_name`:145 · `waiting_both_name`:150 · `waiting_bio`:158 · `waiting_both_bio`:163 · `waiting_group_image`:168 · `waiting_image_url`:182 · `waiting_menu_image`:191 · `waiting_flood_tipo`:212 · `waiting_flood_message`:234 · `waiting_payment_valor`:272 · `waiting_payment_moeda`:283 · `waiting_flood_amount`:305 · `waiting_flood_modo`:316 · `config_set_link`:361 · `preset_apagar`:374 · `preset_novo_nome`:387 · `preset_novo_bio`:392 · `preset_novo_img`:397 · `preset_novo_msg`:420 · `waiting_roubar_preset`:434 · `waiting_tudo_preset`:488 · `waiting_tudo_msg`:517 · `waiting_tudo_name`:556 · `waiting_tudo_bio`:561 · `waiting_tudo_image`:566 · `group_menu`:596 · `group_action_menu`:650 · `group_multi_action`:671 · `multi_flood_tipo`:716 · `multi_flood_message`:730 · `multi_payment_valor`:753 · `multi_payment_moeda`:761 · `multi_flood_amount`:774 · `multi_flood_modo`:783 · `multi_tudo_preset`:827 · `multi_tudo_msg`:849 · `multi_roubar_preset`:872 · `group_agendar_tipo`:905 · `agendar_flood_message`:931 · `agendar_flood_amount`:936 · `agendar_flood_modo`:946 · `agendar_tudo_preset`:963 · `agendar_tudo_msg`:977 · `agendar_roubar_preset`:984 · `agendar_tempo`:998 · `multi_agendar_tipo`:1028 · `multi_agendar_flood_message`:1051 · `multi_agendar_flood_amount`:1056 · `multi_agendar_flood_modo`:1064 · `multi_agendar_tudo_preset`:1081 · `multi_agendar_tudo_msg`:1095 · `multi_agendar_roubar_preset`:1102 · `multi_agendar_tempo`:1116 · `config_set_flood_interval`:1136 · `config_set_flood_lote`:1143 · `config_set_flood_modo`:1150 · `config_set_flood_speed`:1172 · `config_add_user`:1199 · `config_remove_user`:1243 · `config_add_group`:1256 · `config_remove_group`:1319 · `config_add_owner`:1332 · `config_remove_owner`:1354 · `agendar_cancelar`:1369 · `waiting_group`:1390 · `status_waiting_text`:1513 · `status_waiting_image`:1523 · `status_waiting_video`:1550 · `status_waiting_audience`:1576 · `status_menu_st`:1599 · `status_preset_select`:1613 · `status_preset_menu`:1640 · `status_preset_criar_nome`:1655 · `status_preset_criar_texto`:1669 · `status_preset_apagar`:1677 · `status_audiencia_menu`:1689 · `status_waiting_group_import`:1703 · `status_priv_menu`:1740

### handlers/terminal.js — 69 linhas (3.3 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v43] Terminal virou PAINEL MONITOR (tema roxo). Comandos: SOMENTE no WhatsApp.
// O readline (ask) continua exportado porque o pairing da 1ª conexão precisa dele.
//
//   ┌─ o que mudou ─────────────────────────────────────────────┐
//   │ - menu [01]-[12] REMOVIDO (todas essas funções já existem │
//   │   no WhatsApp: menu → 1..7, config, status etc)           │
//   │ - terminal exibe banner + status e atualiza a cada 60s    │
//   │ - 'sair' ou Ctrl+C encerra                                │
//   └───────────────────────────────────────────────────────────┘
```

Exportações (assinaturas exatas):

```ts
export const rl
export const ask
export async function menuTerminal()
```

### services/fastParser.js — 750 linhas (39.3 KB) · NÃO anexado por causa do orçamento

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

### services/interactiveList.js — 8 linhas (0.5 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v51] CAMADA DE COMPATIBILIDADE — a implementação ÚNICA de listas interativas
// vive em services/list.js. Este arquivo existia como uma SEGUNDA implementação
// concorrente (enviava com messageId undefined = lista renderizada mas morta,
// usada pelas páginas de categoria cat_* do roteador) e foi o causador do
// "abre mas não seleciona". Agora apenas reexporta a fonte única.
```

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
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

### services/antiTakeoverService.js — 76 linhas (3.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v22] Proteção anti-takeover: detecta quando o bot perde admin, é removido,
// ou quando há mudanças suspeitas nos grupos.
```

Exportações (assinaturas exatas):

```ts
export async function handlePerdaAdmin(groupJid, subject)
export async function handleRemovidoDoGrupo(groupJid, subject)
export async function handlePromocaoSuspeita(groupJid, subject, promotedIds)
export function getStatusAntiTakeover()
```

### services/historicoService.js — 85 linhas (2.5 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v22] Histórico de ações do SYZYGY — log persistido de nukes, roubos, floods, etc.
```

Exportações (assinaturas exatas):

```ts
export function registrarAcao(tipo, detalhes = {})
export function listarHistorico(qtd = 20)
export function limparHistorico()
export function gerarRelatorio()
export function formatarHistoricoTexto(qtd = 15)
```

### services/notificationService.js — 76 linhas (2.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v28] Notificações para dono + grupos autorizados.
```

Exportações (assinaturas exatas):

```ts
export async function enviarNotifNovoGrupo(jid, info)
export async function enviarNotifAdminRecebido(ownerKey, groupJid, subject)
export async function notificarBotOnline()
```

### services/presetService.js — 89 linhas (2.9 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [NOVO] Presets de configuração (nome + bio + foto) para o comando 13.
// - Persistidos em ./dono/presets/presets.json
// - Fotos salvas em ./dono/presets/preset_<id>.jpg
// - Criados AUTOMATICAMENTE quando o usuário usa o 13 informando nome/bio/foto.
```

Exportações (assinaturas exatas):

```ts
export function carregarPresets()
export function getPreset(indice1)
export function fotoPresetPath(preset)
export function salvarNovoPreset({ nome, bio, bufferFoto, mensagem })
export function apagarPreset(indice1)
export function listarPresetsTexto()
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

### menus/menu.js — 286 linhas (17.9 KB) · NÃO anexado por causa do orçamento

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

### menus/mainMenu.js — 154 linhas (7.4 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v35] Menu ultra rápido PV + listas interativas com categorias e paginação
```

Exportações (assinaturas exatas):

```ts
export async function enviarPainelInicial(from)
```

### menus/groupMenu.js — 245 linhas (10.7 KB) · NÃO anexado por causa do orçamento

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

### menus/adminMenu.js — 12 linhas (0.4 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [REORGANIZAÇÃO] Painel administrativo (owner_panel / abrir_painel).
```

Exportações (assinaturas exatas):

```ts
export async function enviarPainelAdmin(from)
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

### features/flood/index.js — 175 linhas (4.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v53 · AB7] Barrel público da feature FLOOD. Superfície enxuta de propósito:
// allowlist, dry-run, modo-teste, preview e o card de loja saíram do projeto, e
// este arquivo é justamente o lugar onde eles "moravam" (o antigo tinha
// detectShoppingTrigger/parseShoppingOverlay/shoppingPromptText exportados aqui).
//
// Arquitetura que este barrel expõe:
//   preset (descrição de conteúdo + teto)  →  runPresetJob (orquestração)
//        →  executarFlood / executarFloodLote (services/groupService.js)
// Um `sock.sendMessage` só por envio, com o wrap de "Ler Mais" da conexão.
// payment é um TIPO de preset (presets/payment.js), nunca um segundo executor.
//
// O router (./router.js) importa os módulos folha, NUNCA este barrel — é assim que
// se evita o ciclo ESM que derrubava o módulo em silêncio.
```

Exportações (assinaturas exatas):

```ts
export function floodContentBuilderFor(state)
```

### features/flood/speed.js — 117 linhas (4.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// NÃO é um segundo sistema de velocidade. O AB7 já resolve ritmo em
// getFloodConfig() (services/groupService.js) a partir de FLOOD_MODOS + CONFIG
// (utils/config.js: floodModo / floodInterval / floodLote / floodJitter).
// Este módulo só faz a ponte preset → esses MESMOS valores, para o preset não
// inventar intervalo nem lote próprio.
//
// Saída sempre compatível com getFloodConfig(objeto) e, portanto, com
// executarFlood(jid, msg, qtd, cfg, builder): { modo, intervaloMs, lote, jitter }.
```

Exportações (assinaturas exatas):

```ts
export const CUSTOM_INTERVAL_MIN
export const CUSTOM_INTERVAL_MAX
export function resolveFloodSpeed(raw)
export function formatFloodSpeedMenu()
export function applyFloodSpeed(preset, cfg)
export function toFloodOpts(cfg)
```

### features/flood/presetEngine.js — 386 linhas (16.4 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [ENGINE DE PRESETS · adaptação arquitetural da arena 01a0aaae para o AB7]
//
// NÃO é o engine antigo copiado, e NÃO é um segundo executor de flood. A arena
// antiga tinha runPresetJob() com defaultSend próprio (sock.sendMessage direto);
// aqui o envio continua passando pela INFRAESTRUTURA DE ENVIO DO AB7:
//
//   preset → loadPreset → validação do tipo → escolha explícita de alvo → grupo
//   protegido →
//          cooldown → speed (FLOOD_MODOS/CONFIG) → queue/limiter → builder →
//          services/groupService.executarFlood(...) → resultado estruturado
//
// O que este módulo faz de fato:
//  • resolve o preset e CLAMPA os tetos (config.js clampPresetLimits);
//  • valida o conteúdo ANTES de qualquer envio (payment/mention/media);
//  • aplica as porteiras de segurança: kill switch, um-job-por-vez, cooldown,
//    filtro de alvo (targets.js): lista explícita + grupo protegido;
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

### features/flood/customStore.js — 158 linhas (6.7 KB) · NÃO anexado por causa do orçamento

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
// Presets reservados: os IDs built-in (text/mention/media/payment-test) não
// podem ser ofuscados por um custom homônimo — senão o "custom" passaria a mudar
// o comportamento de um preset de teste conhecido.
// [v53] "shopping-test" deixou de ser reservado: o tipo não existe mais, então
// reservar o nome só impediria a pessoa de reaproveitar o id.
```

Exportações (assinaturas exatas):

```ts
export const CUSTOM_TYPES
export const CUSTOM_TIPOS_DELEGADOS
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

### features/flood/tests.js — 413 linhas (30.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v53 · AB7] Suíte do FLOOD + PAGAMENTO (substitui a suíte de shopping, que saiu
// do projeto junto com o tipo "shopping"). Rode:  node features/flood/tests.js
//
// Garantias:
//   • NENHUM envio real: sock falso (setSock) e, onde importa, um `executor`
//     injetado que falha se for chamado. Nada sai para um JID de verdade.
//   • config.json e dono/historico.json NÃO são escritos: os bytes são
//     comparados antes/depois; mutações são só em memória e restauradas no fim.
//   • O contrato do payment é conferido CONTRA A FONTE do fork instalado
//     (@lucasmod/boruto-vk7-baileys) — se o fork mudar, o teste avisa; se o fork
//     não estiver instalado, o bloco é SKIP (nunca passa "no chute").
//   • payment é TIPO do flood: a suíte exige que texto e pagamento usem o mesmo
//     executarFlood (nenhum segundo send path, nenhuma segunda fila).
```

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

### features/flood/tests-infra.js — 456 linhas (32.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v53 · AB7] Infra do flood: fila, limiter, kill switch, cooldown, custom store,
// alvos, velocidade e a superfície do barrel. Rode:  node features/flood/tests-infra.js
//
// Garantias deste arquivo:
//   • NENHUM envio real: `executor` injetado (nada toca socket) — e quando o
//     caminho real é exercido, é com sock falso.
//   • config.json / dono/historico.json NÃO são escritos: as chaves observadas
//     são comparadas byte a byte antes/depois (customStore roda com persist:false).
//   • estado global (CONFIG, kill switch, cooldown, seleção de alvos) é
//     restaurado no finally — a suíte não deixa rastro.
//   • [v53] as suítes de allowlist/dry-run/shopping foram retiradas junto com os
//     conceitos; o que está aqui é o que sobrou (e o que é novo: targets/seleção).
```

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

### features/flood/tests-menu.js — 317 linhas (22.6 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v53 · AB7] Testes da LIGAÇÃO entre os painéis e a feature features/flood/.
// Rode:  node features/flood/tests-menu.js
//
// Desde a v53 o painel do dono é 12-41 (allowlist/dry-run/modo-teste/preview de
// loja saíram, e os números antigos 42-47 passam a responder "opção removida" em
// vez de sumir em silêncio). Esta suíte é o que garante que:
//   • todo número tem ação roteada e toda ação tem rótulo (paridade 1:1);
//   • o parser rápido (5/NN, "5>NN") e o atalho de texto batem com o painel;
//   • nenhum menu cita conceito que não existe mais;
//   • nada é ENVIADO de verdade: sock falso, e o alvo vazio recusa antes.
//
// Garantias de ambiente: config.json e dono/historico.json comparados byte a byte
// antes/depois; CONFIG e estado de menu restaurados no finally.
```

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

### utils/menuArt.js — 143 linhas (6.5 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v53 · AB7] Identidade visual ÚNICA dos menus. Antes cada painel desenhava a
// própria moldura no próprio arquivo (╭━━「 」, ┏┓, ╔═╗ misturados) — o resultado
// era menu bonito em um lugar e torto no outro. Agora: um só módulo, todos os
// painéis passam por aqui.
//
// Regras que este módulo aplica (e que os menus não podem contornar):
//  • cada página cabe em ~10 opções → nada de "Ler Mais" engolindo opção de menu
//    (utils/lerMais.js dobra o que passa do limite de exibição do app);
//  • número sempre na 2ª coluna com zero à esquerda (01…40) porque o cliente
//    digita `05`, `5`, `6>12` e os três têm de funcionar;
//  • nenhum caractere depende de fonte exótica para alinhar: as linhas de
//    separação são formadas por um glifo repetido, não por espaços contados.
//  • o logotipo em unicode decorado é ENFEITE, nunca chave de parsing — ninguém
//    compara texto de menu com string literal (os testes verificam ação roteada,
//    não arte).
```

Exportações (assinaturas exatas):

```ts
export const LOGO
export const LOGO_PRINCIPAL
export const LOGO_ASSINATURA
export function moldura(titulo, { largura = 0, enfeite = "༺༻" } = {})
export function separador(n = 14, estilo = "flores")
export function filete(n = 12)
export function opcao(numero, rotulo, direita = "")
export function bloco(titulo, { largura = 22 } = {})
export function rodape({ pagina = null, totalPaginas = null, dica = "digite o número da opção" } = {})
export function montarMenu({ titulo, subtitulo = null, itens, porPagina = 12, secoes = null, rodapeOpts = {} })
export function estado(onOff, { on = "✅ LIGADO", off = "⬜ desligado" } = {})
export function itemRemovido(nome, motivo = "saiu desta versão")
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

### features/viewOnce/index.js — 30 linhas (1.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// Entry point da feature View Once - exporta API pública e integração.
```

Exportações (assinaturas exatas):

```ts
export async function onMessageViewOnce({ chatJid, senderJid, isGroup, webMessageInfo })
```

### features/viewOnce/handler.js — 127 linhas (4.8 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v33] Detecção robusta de qualquer ViewOnce (imagem, vídeo, áudio, doc, sticker, ptt)
```

Exportações (assinaturas exatas):

```ts
export function detectViewOnce(m)
export async function handleViewOnceMessage({ chatJid, senderJid, isGroup, webMessageInfo })
```

### features/viewOnce/permissions.js — 39 linhas (1.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v33] Permissão ViewOnce: permite qualquer viewOnce recebido pelo bot, destinos controlados.
```

Exportações (assinaturas exatas):

```ts
export function canProcessViewOnce({ senderJid, chatJid, isGroup })
export function canReceiveAsDestination({ jid, type })
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

### features/statusManager/presets.js — 105 linhas (3.9 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v46] 🗂️ PRESETS DE STATUS — textos salvos para publicar rápido.
// Regra de papel (v46): qualquer ADM do bot pode POSTAR um preset (7 > 4);
// criar/apagar é restrito ao DONO (7 > 11). Persistência: dono/status_presets.json.
```

Exportações (assinaturas exatas):

```ts
export function listarStatusPresets()
export function obterStatusPreset(idx1)
export function criarStatusPreset(nome, texto)
export function apagarStatusPreset(idx1)
export function statusPresetsTexto(acao = "postar")
export function menuPresetGerenciarTexto()
```

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

### actions/configActions.js — 57 linhas (2.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v24] Status com permissões
```

Exportações (assinaturas exatas):

```ts
export async function cfgMenuImage(chatJid, ownerKey)
export async function cfgOwner(chatJid)
export async function cfgNumber(chatJid)
export async function cfgStatus(chatJid)
export async function cfgRestart(chatJid, ownerKey, clearState)
```

### actions/floodActions.js — 20 linhas (0.7 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [REORGANIZAÇÃO] Confirmação de FLOOD (flood_confirm_yes).
// Só executa se o estado atual for waiting_flood_confirm (segurança).
```

Exportações (assinaturas exatas):

```ts
export async function confirmarFlood(chatJid, ownerKey)
```

### actions/groupActions.js — 48 linhas (2.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [REORGANIZAÇÃO] Ações de confirmação de grupo (NUKE / remover foto) e a
// listagem textual de grupos (owner_grupos / painel_listar_grupos).
// Cada confirmação SÓ executa se o estado atual for o esperado (segurança).
```

Exportações (assinaturas exatas):

```ts
export async function listarGruposTexto(chatJid, ownerKey)
export async function confirmarNuke(chatJid, ownerKey)
export async function confirmarRemoverFoto(chatJid, ownerKey)
```

### utils/botoes.js — 123 linhas (4.8 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [IMPLEMENTAÇÃO] Módulo GENÉRICO e REUTILIZÁVEL de botões Native Flow.
//
// Responsabilidade ÚNICA: construir o payload de um botão e validar os dados.
// NÃO conhece "painel", "config", "menu" nem qualquer comando. Quem sabe o que
// cada id significa é o handler/roteador (commands/commandRouter.js).
//
// Formato de saída: { name, buttonParamsJson } — exatamente o que o projeto já
// usa e o que o Baileys 7.0.0-rc14 espera dentro de nativeFlowMessage.buttons.
//
// IMPORTANTE sobre as chaves do JSON interno (contrato do WhatsApp, não do Baileys):
//   quick_reply    -> { display_text, id }
//   cta_copy       -> { display_text, copy_code }
//   cta_url        -> { display_text, url }
//   single_select  -> { title, text, buttonText, sections:[{ title, rows:[{title,description,id,rowId}] }] }
//
// A API pública usa nomes amigáveis (displayText, copyCode, rowId) e este módulo
// traduz para o contrato acima — assim o resto do bot não repete JSON à mão.

// ------------------------------------------------------------------
// Normalização de rows do single_select.
// Aceita rowId OU id (o dispatcher do projeto lê "id" na resposta), e garante
// AMBOS presentes para máxima compatibilidade de renderização/seleção.
// ------------------------------------------------------------------
```

Exportações (assinaturas exatas):

```ts
export function criarBotao(tipo, dados = {})
export function criarBotoes(lista = [])
export function criarLista(dados = {})
```

Âncoras de roteamento (nome:linha-no-arquivo) — reimplemente cada uma:

`quick_reply`:54 · `cta_copy`:65 · `cta_url`:77 · `single_select`:88

### utils/terminalUI.js — 94 linhas (5.1 KB) · NÃO anexado por causa do orçamento

As regras do arquivo, direto do topo dele:

```js
// [v43] Tema ROXO do SYZYGY. Mesmas funções/assinaturas — só a identidade visual mudou.
```

Exportações (assinaturas exatas):

```ts
export function bannerSYZYGY()
export function painelStatus(dados)
export function boot(msg)
export function ok(msg)
export function err(msg)
export function warn(msg)
export function info(tag, msg)
export function credLine()
export function formatUptime(ms)
export const COLORS
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

### features/flood/README.md — 179 linhas (9.9 KB) · NÃO anexado por causa do orçamento

Exportações (assinaturas exatas):

```ts
(sem exportações nomeadas)
```

---

Fim. Rode as 4 suítes, escreva o relatório e pare.
