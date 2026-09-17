# PROMPT — Reconstruir o bot SYZYGY do zero

> **Como usar este arquivo:** cole ele inteiro em outra IA (Claude/GPT/Gemini) e diga
> apenas: *"implemente a Fase 0 e 1 e pare para eu testar"*. Este documento é a
> especificação **completa** do SYZYGY: arquitetura, contratos de função, payloads do
> WhatsApp, estados do wizard, numeração de menu, tetos de segurança e critérios de
> aceite. Nenhuma consulta a git, a repositório ou a "código antigo" é necessária —
> tudo que está aqui foi extraído do código que **funciona hoje** (branch
> `arena/01a0ab7b-syzygy-bot-whatsapp`, tip `ccddd33`, 2026-09-17: suítes
> `tests.js` 183 · `tests-infra.js` 228 · `tests-menu.js` 83, 0 falhas).
>
> Onde está escrito **⛔ PROIBIDO**, é lição aprendida em cliente real (bug que já
> aconteceu). Não "melhore" isso sem um teste que prove no app do destinatário.

---

## 1. Missão e persona

Bot de WhatsApp pessoal/ofensivo-defensivo para **um único dono** (e ADMs por ele
autorizados), rodando na conta do dono. Funções: flood, nuke, "roubar" grupo,
presets de identidade, agendamento, inspeção do servidor, gerenciador de status
(stories), captura/repasse de ViewOnce, e um painel de controle em TXT com arte de
caixas (`╭─〔 … 〕───`).

- **Idioma da UI:** pt-BR. Numeração em vez de botão sempre que `uiMode = "text"`
  (é o modo padrão — iPhone/WhatsApp antigo não renderiza botões de forma confiável).
- **Superfície de ataque zero:** o bot **só obedece** a donos/ADMs/grupos autorizados.
  Todo destino de flood/nuke precisa de autorização explícita.
- **Regra de ouro do projeto:** *quem decide se uma mensagem "existe" é o app do
  destinatário, não o payload.* Se o cliente não renderiza, detecte, explique e
  reporte — **nunca finja card de loja/fatura**.

## 2. Stack e restrições técnicas

| Item | Valor real |
|---|---|
| Runtime | Node.js ≥ 20 (testado em 22), `"type": "module"` (ESM puro, sem `require`) |
| Único entry | `index.js` → `npm start` = `node index.js` |
| WhatsApp | `@innovatorssoft/baileys@7.4.7` (fork **não-oficial** do Baileys) |
| Imagem | `jimp@^1.6.0` (redimensiona foto de grupo p/ caber no upload) |
| Log | `pino@^10.3.1` (o Baileys exige; o projeto o silencia) |
| Banco | **Nenhum.** Estado em JSON no disco (`config.json`, `dono/*.json`, `sessao/`) |
| Instalação | `npm install --legacy-peer-deps` ⛔ **PROIBIDO** `npm install` puro: os peer deps do jimp estouram no meio do update e deixam o deploy meio-caminho |
| Testes | `node features/flood/tests.js`, `tests-infra.js`, `tests-menu.js`, `node features/viewOnce/tests.js` (runner próprio, sem jest) |

Dependências exatas do `package.json`:

```json
{ "name": "syzygy", "version": "1.0.0", "type": "module", "main": "index.js",
  "scripts": { "start": "node index.js" },
  "dependencies": { "@innovatorssoft/baileys": "7.4.7", "jimp": "^1.6.0", "pino": "^10.3.1" } }
```

## 3. Árvore de arquivos (com o papel de cada um)

```
index.js                      39 l  só ORQUESTRA: silenciador → config → handlers de processo
                                      → setAsk → banner → iniciarConexao → menuTerminal
PROMPT-RECONSTRUCAO-SYZYGY.md      este arquivo
start.sh                            launcher: pidfile + varredura de /proc pelo cwd; NUNCA
                                    inicia 2ª instância; NUNCA apaga sessao/; `npm start`
update.sh                           deploy seguro: backup → ff/merge → npm → validação
recover.sh                          leia-only: recupera trabalho perdido (stash/reflog/blobs)
config.json                   TRACKED  identidade + allowlists + chaves de flood (ver §7)

connection/whatsapp.js        328 l  makeWASocket, auth multi-arquivo, pairing, reconexão
connection/sessionRecovery.js 121 l  detecção de erro de sessão + recuperação + handlers de sinal
connection/pairing.js                pede número e gera código de pareamento
connection/socket.js            96 l  singleton do sock: setSock/getSock/rt() + aplicarLerMais
                                       (rt() = objeto "runtime": cachedGroups, listeners, etc.)

handlers/messageHandler.js    314 l  ÚNICO ponto de entrada de mensagem (pipeline §6)
handlers/stateHandler.js     1802 l  MÁQUINA DE ESTADOS do wizard (todos os `waiting_*`)
handlers/interactionHandler.js       trata id de botão/lista (toque → ação)
handlers/terminal.js                 menu interativo no stdout (pausar/religar QR, etc.)

menus/mainMenu.js             137 l  painel inicial 1-8
menus/configMenu.js           260 l  painel ⚙️ ADM (1-11) + 👑 DONO (12-47) — §11
menus/groupMenu.js            242 l  lista de grupos (páginas), menu de ações, enviarCancelavel/
                                       enviarVoltar/enviarConfirmacao
menus/adminMenu.js                     painel de ADM
menus/menu.js                 280 l  COMANDOS (categoria/lista), TEXT_TO_ACTION, numeroNavegacao,
                                       paginação em sections de ≤10 (limite do WhatsApp)
menus/menutest.js                      variação de teste do menu

commands/commandMap.js         57 l  TEXT_TO_ACTION: atalhos de texto → ação (§15)
commands/commandRouter.js     715 l  roteador de ações + OWNER_ONLY (§13)

services/groupService.js      668 l  ⭐ núcleo operacional: flood, nuke, roubar, foto, nome/bio,
                                       cache de grupos, safeSendMessage, getFloodConfig
services/fastParser.js        724 l  ⭐ gramática rápida: 1/ 2/ 3/ 4/ 5> 6> 7> e @tempo
services/agendaService.js     249 l  agendamento `@10m` / `@20:30` em JSON no disco
services/presetService.js              presets de IDENTIDADE (nome+bio+foto) p/ nuke/roubar
services/mediaService.js        119 l  jimp: prepararFoto/prepararFotoBuffer/fetchImagem/validarTamanho
services/interactiveService.js  277 l  camada botões/lista + ids de interação (getInteractiveId)
services/list.js / buttons.js          sendInteractiveList / sendInteractiveButtons
services/historicoService.js             registrarAcao/listar/gerarRelatorio → dono/historico.json
services/serverInspector.js    409 l  !bloks: coleta de SO (cpu/ram/disco/rede) e envio
services/bloksTransport.js      109 l  transporte BLOKS/A2UI (só usado pelo Inspector)
services/lidResolver.js         170 l  mapa LID ⇄ phone (participantes usam LID hoje em dia)

utils/config.js               131 l  CONFIG + defaults + salvarConfig + FLOOD_MODOS + MAX_FLOOD
utils/permissions.js          352 l  dono/ADMs/grupos/LIDs + normalizeNumber + isProtected
utils/stateManager.js                  setState/getState/clearState (chave = número do sender)
utils/lerMais.js                       aplicarLerMais (o "…Ler mais" com caracteres invisíveis)
utils/terminalUI.js                    banner, cores, ok/err/warn/info com carimpo HH:MM:SS
utils/botoes.js                          criarBotao/criarBotoes/criarLista
utils/logger.js                          silenciador: nunca logar segredo de sessão

features/flood/            4 779 l  ⭐ infra de flood por presets (§9-§10) — ver árvore lá
features/statusManager/     1 165 l  stories: audiência, presets, publicação, erros (§16)
features/viewOnce/            719 l  captura e repasse de ViewOnce (§17)
legacy/                             código v1 guardado para referência — NÃO importar

dono/                             dados em disco do dono:
  menus/Foto-menu/img-menu.jpg      imagem padrão do menu / do nuke
  historico.json                      auditoria de ações
  presets.json                        presets de identidade
  agenda.json                         agendamentos pendentes
  status_*.json                       config/erros do Status Manager
sessao/                           creds do Baileys (⛔ JAMAIS versionar, jamais apagar em script)
```

## 4. Boot (`index.js`) — exatamente nesta ordem

```js
instalarSilenciador()          // console.log/warn/error filtram objeto de sessão/creds
carregarConfig()               // config.json → CONFIG; aplica defaults e normaliza allowlists
instalarHandlersProcesso()     // SIGINT/SIGTERM/unhandledRejection → fecha sock limpo
setAsk(ask)                    // readline do terminal compartilhado c/ a conexão (pergunta nº)
console.clear(); bannerSYZYGY(); origLog(boot("Inicializando SYZYGY..."))
await iniciarConexao()         // QR ou código de pareamento → sock pronto e autenticado
await menuTerminal()           // loop de teclado no stdout (pausar, reconectar, sair)
```

Falha em qualquer passo → `origLog(err(...))` + `process.exit(1)`. ⛔ Não colocar
`process.on("uncaughtException")` que engole erro: o `sessionRecovery` decide se
religa e **com limite** (§5).

## 5. Conexão, reconexão e sessão (`connection/*`)

```js
const { version, isLatest } = await fetchLatestBaileysVersion()
const { state, saveCreds } = await useMultiFileAuthState("./sessao")   // SESSAO_PATH
const sock = makeWASocket({ version, auth: state, printQRInTerminal: false,
                            browser: ["Ubuntu", "Chrome", "20.0.04"], logger: pino({level:"silent"}) })
sock.ev.on("creds.update", saveCreds)
```

- Se `sessao/creds.json` não existe → **fluxo de pareamento**: `pedirNumeroPairing()`
  (pergunta no terminal) → `solicitarPairingCode(sock, numero)`; QR só se o usuário
  recusar pareamento. `r.pairingCodeRequested` evita pedir duas vezes na mesma sessão.
- Reconexão: até `MAX_RECONNECT_ATTEMPTS = 5` com backoff `RECONNECT_BASE_DELAY = 3000 · 2^n`.
- Erros de sessão (Signal/auth): janela `SESSION_ERROR_WINDOW_MS = 60 000`, tolera
  `MAX_SESSION_ERRORS = 8` e depois **refaz** a sessão, respeitando no mínimo
  `SESSION_RECOVERY_COOLDOWN_MS = 120 000` (2 min) entre tentativas de recuperação. `isSessionError(e)` casa texto de erro conhecido
  (`Invalid signal message`, `Bad session`, etc.).
- **Bug do fork que precisa de workaround (v58):** uma única falha de `media_conn`
  envenena o cache de mídia da conexão e **todo upload de imagem morre até reconectar**.
  Por isso `trocarFotoComRetry(jid, preparar, tentativas = 3)`: tenta → `refreshMediaConn()`
  → tenta de novo com backoff, e **reporta o motivo real** (⛔ nunca `catch {}` em foto).
- `connection/socket.js`: `setSock/getSock` + `rt()` (objeto runtime global: `cachedGroups`,
  `groupSelectionCache`, listeners). Todo módulo pega o sock por `getSock()`, **nunca**
  importa `whatsapp.js` direto (evita ciclo).

## 6. Pipeline de mensagem (`handlers/messageHandler.js`)

Ordem **exata** (mudar isso quebra o parser rápido e o wizard ao mesmo tempo):

1. Ignora `m.key.fromMe` que **não** seja interação e que não tenha sido enviada pelo bot
   (`foiEnviadoPeloBot(m.key.id)` → id `BAE5`/`3EB0`…).
2. `isGroupJid(chatJid)` decide grupo × PV. `sender = fromMe ? sock.user.id : getSenderJid(m)`.
3. **ViewOnce primeiro** (`detectViewOnce` → `handleViewOnceMessage`), porque a mídia
   some se o handler comum responder antes. Sucesso → `✅ ViewOnce image → N destinos`;
   barrado → `⚠️ ViewOnce não encaminhado: <motivo>`.
4. **Gates de autorização**: `isAuthUserChat`, `isOwnerChat`, `isAuthGroup`;
   PV só obedece se `fromMe || isOwnerSender || isAuthUserSender || dono/chat autorizado`;
   grupo só obedece se `isAuthorizedGroup(chatJid) && (fromMe || owner || adm do bot)`.
5. Negou? → se o texto era `menu`/`!menu`/`5`/`1` em PV não autorizado: responde
   `❌ Acesso negado.` **e** alerta o dono com `De/Sender/Num/Texto` + a linha
   `Para liberar imediato (dono): 5 > 24 > <número>` (e a variante `Se for LID:`).
   ⛔ Nunca "sugerir" ampliar allowlist automaticamente.
6. `interactionId` (toque em botão/lista) → `tratarInteracao` → resolve a ação e cai no roteador.
7. Sem estado? Atalho global (`TEXT_TO_ACTION`) → `roteadorAcoes(chatJid, senderNum, acao)`.
8. `cancelar <id>` de agendamento; `1..N` em contexto de seleção de grupo
   (`processarSelecaoGrupo`).
9. **Estado ativo primeiro**: `if (st && await handleEstado(...)) return` — o wizard
   sempre ganha do parser rápido.
10. `handleFastCommand` (modo rápido `2/…`, `5>NN`) → por último, `menu`/`ajuda`.

`handleEstado` devolve `true` quando consumiu o input; `false` deixa cair no parser.
Convenção universal: `cancelar`/`sair` → `clearState` + `enviarVoltar("❌ Operação cancelada.")`,
`0` → volta um nível. Toda pergunta usa `enviarCancelavel` (diz como sair).

## 7. `config.json` — schema completo (é o único estado persistente de configuração)

`utils/config.js` declara o objeto e `carregarConfig()` faz `Object.assign` + saneamento;
`salvarConfig()` regrava `JSON.stringify(CONFIG, null, 2)` **e antes** sincroniza as
allowlists com os getters de `permissions.js` (fonte da verdade são os setters).

```jsonc
{
  "nome": "๛ղվx 𝖅𝖚𝖈𝖐𝖊𝖗𝖇𝖊𝖗𝖌",   // identidade usada por nuke/roubar (groupUpdateSubject)
  "bio": "⚔️ SYZYGY ⚡",                    // idem (groupUpdateDescription)
  "menuImage": "./dono/menus/Foto-menu/img-menu.jpg",
  "ownerOverride": "5519XXXXXXXXX",       // dono absoluto (número normalizado, sem +)
  "uiMode": "text",                       // text | txt | buttons | list | bloks
  "grupoOficial": "", "linkDivulgacao": "",
  "lerMais": false,                        // aplica "…Ler mais" em mensagens de texto
  "marcarFantasma": true,                  // flood/clássico marca todos os participantes
  "floodModo": "normal", "floodInterval": 150, "floodLote": 5, "floodJitter": false,
  "autoLimpeza": true,                     // limpa grupos fantasmas do cache
  "antiTakeover": true,                    // detecta perda de admin/remoção/promoção suspeita
  "usuariosAutorizados": [], "gruposAutorizados": [], "lidsAutorizados": [], "donosExtras": [],

  // 🛡️ flood por presets — defaults CONSERVADORES por design
  "floodKillSwitch": false,   // true = nada de flood, nem preset nem clássico
  "floodDryRun": true,        // ⚠️ true é o default: nada sai até o operador desligar
  "floodTestMode": true,      // payment/loja só disparam com isto LIGADO
  "floodAllowlist": [],       // ⛔ vazia de propósito = porta de saída fechada
  "floodMaxRetries": 1,       // 0..2
  "floodTimeoutMs": 15000,    // 3000..30000
  "floodCustomPresets": []    // presets salvos pelo dono (persistidos aqui, não em arquivo)
}
```

Constantes exportadas: `MAX_FLOOD = 1000` (por comando), `MAX_IMAGE_BYTES = 10 MiB`,
`MAX_RECONNECT_ATTEMPTS = 5`, `RECONNECT_BASE_DELAY = 3000`, `MAX_SESSION_ERRORS = 8`,
`SESSION_ERROR_WINDOW_MS = 60000`, `SESSION_RECOVERY_COOLDOWN_MS = 120000`,
`HTTP_UA` (mobile Chrome p/ fetch de imagem), `CONFIG_PATH = "./config.json"`,
`SESSAO_PATH = "./sessao"`, `MENU_IMAGE_PATH`, e:

```js
export const FLOOD_MODOS = {
  rapido: { intervalo:  50, lote: 8, label: "Rápido 50ms/lote8" },
  normal: { intervalo: 100, lote: 6, label: "Normal 100ms/lote6" },
  lento:  { intervalo: 250, lote: 4, label: "Lento 250ms/lote4" },
  seguro: { intervalo: 500, lote: 3, label: "Seguro 500ms/lote3 + jitter" }
}
```

⛔ PROIBIDO no `config.json`: salvar `sessao/`, token, credencial ou código de pareamento.
⛔ PROIBIDO versionar `sessao/**`, `.env`, `config.json` com números reais — no repo de
partida eles ficam **fora** do commit (aqui o `config.json` está tracked por acidente
histórico: ao reconstruir, coloque `.gitignore` já com `config.json`, `sessao/`, `dono/`,
`tmp/`, `.syzygy-backup/`, `node_modules/`, `log/`).

### Modelo de permissões (`utils/permissions.js`)

- `normalizeNumber(x)` → só dígitos, remove sufixo `@s.whatsapp.net`/`@lid`, trata `-`
  de JID de grupo (`5519…-1234@g.us`).
- Dono = `ownerOverride` ∪ `donosExtras` (`getAllOwners`); ADM de bot = `usuariosAutorizados` ∪
  `lidsAutorizados`; grupo-alvo autorizado = `gruposAutorizados`.
- **LID**: participante pode chegar como `<num>@lid`; por isso `isAuthorizedUserWithMap`
  /`resolverLidParaPhone`/`resolverPhoneParaLid` (mapa em `services/lidResolver.js`,
  alimentado por `atualizarMapaDeParticipantes`). Comparação de identidade SEMPRE por
  número normalizado, nunca por JID cru.
- `isProtectedGroup(jid)` (em `groupService`) = `isAuthorizedGroup(jid)` → **recusa
  flood/nuke/roubar no grupo do dono**. Essa é a proteção anti-takeover mais importante.
- Setters persistem via `salvarConfig()`: `addAuthorizedUser/removeAuthorizedUser`,
  `addAuthorizedGroup/removeAuthorizedGroup`, `addExtraOwner/removeExtraOwner`.
  Remoção por **índice 1-based** aceita `NOT_FOUND` explícito (a UI mostra a lista numerada).

## 8. Máquina de estados do wizard (`utils/stateManager.js` + `handlers/stateHandler.js`)

`setState(chave, obj)` / `getState(chave)` / `clearState(chave)`; a **chave é o número do
sender**, então dois donos/ADMs podem operar ao mesmo tempo sem se atropelarem. O objeto
de estado carrega sempre `action` + os dados coletados (`groupJid`, `selectedGroup`,
`floodQtd`, `floodKind`, `floodContent`, `floodWarnings`, `avisouLoja`…).

Estados implementados (reproduzir todos — são a interface do usuário):

```
grupo/ação:      waiting_group · group_menu · group_action_menu · multi_flood_message ·
                 multi_flood_amount · multi_flood_modo · multi_tudo_preset · multi_tudo_msg ·
                 multi_roubar_preset · multi_agendar_tipo · multi_agendar_* ·
                 group_agendar_tipo · group_agendar_*
identidade:      waiting_name · waiting_bio · waiting_both_name · waiting_both_bio ·
                 waiting_group_image · waiting_image_url · waiting_menu_image ·
                 waiting_tudo_name · waiting_tudo_bio · waiting_tudo_image · waiting_tudo_preset ·
                 waiting_tudo_msg · waiting_roubar_preset
flood clássico:  waiting_flood_message · waiting_flood_amount · waiting_flood_modo
agendamento:     agendar_flood_message · agendar_flood_amount · agendar_flood_modo ·
                 agendar_tudo_preset · agendar_tudo_msg · agendar_roubar_preset ·
                 agendar_tempo · agendar_cancelar
config (1-11/12-47): config_menu · config_add_user · config_remove_user · config_add_group ·
                 config_remove_group · config_add_owner · config_remove_owner · config_set_link ·
                 config_set_flood_modo · config_set_flood_interval · config_set_flood_lote ·
                 config_set_flood_speed · config_set_flood_allowlist_pick ·
                 config_set_flood_allowlist_add · config_set_flood_allowlist_remove ·
                 config_set_flood_loja
presets id.:     preset_novo_nome · preset_novo_bio · preset_novo_img · preset_novo_msg ·
                 preset_apagar
status:          status_menu_st · status_preset_menu · status_preset_select · status_priv_menu ·
                 status_audiencia_menu · status_preset_criar_nome · status_preset_criar_texto ·
                 status_preset_apagar · status_waiting_text · status_waiting_image ·
                 status_waiting_video · status_waiting_group_import
```

Padrões de código do `handleEstado` (mantê-los):

```js
// 1) porta do estado:  if (st.action === "X" && text) { … return true }
// 2) sucesso → enviarVoltar(chatJid, "✅ …") + clearState(ownerKey); return true
// 3) entrada inválida → explica e CONTINUA no estado (return true, sem clearState)
// 4) ação que não definiu novo estado → devolve o usuário ao menu:
//      if (acao !== "abrir_painel" && !getState(ownerKey)) setState(ownerKey,{action:"config_menu"})
// 5) aviso único por tentativa errada: if (!st.avisouX) { setState({...st, avisouX:true}); … }
```

## 9. Flood clássico — `executarFlood` (o ÚNICO laço de envio de texto do projeto)

```js
executarFlood(jid, msg, qtd, intervaloOuOpts = 100, buildContent = null)
→ { ok, erros, total, tentadas, modo, intervalo, lote, stopado? }
```

Contrato (não simplifique):

1. `if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — FLOOD bloqueado")`.
2. `qtd = Math.min(Math.max(1, qtd), MAX_FLOOD)`; `cfg = getFloodConfig(intervaloOuOpts)`
   aceita **objeto** `{modo,intervaloMs,lote,jitter}`, **string** (`"1..4"`, `rapido/normal/
   lento/seguro`, ou ms `20..5000` → `modo:"custom"`), **número** (ms) ou `undefined` (config).
3. `LOTE = max(1, min(cfg.lote, 10))`.
4. `mentions` = todos os participantes **só se** `CONFIG.marcarFantasma` (cache primeiro,
   `throttledGroupMetadata` depois).
5. Loop por lote: `for (i = 0; i < qtd; i += LOTE)` — **dentro da fronteira do lote**, antes
   de anything: `if (isKillSwitchOn()) { stopado = "KILL_SWITCH"; break }` e
   `tentadas += n`. ⛔ Nunca checar kill switch no meio do `Promise.all`.
6. Corpo: `const corpo = msg + "\u200b".repeat((idx % 6) + 1)` — a rotação de 1..6
   caracteres invisíveis é o que impede o WhatsApp de **deduplicar** mensagens idênticas.
7. `buildContent({ index, body, msg })` (opcional): se devolver objeto, ele é o **conteúdo
   do send daquela iteração**; senão `{ text: corpo }`. É por aqui que entra a LOJA —
   ⛔ PROIBIDO criar um "executor de loja" separado (mesmo laço, mesma fila, mesmas permissões).
8. `if (mentions.length && k === 0 && opts.mentions === undefined) opts.mentions = mentions`
   — o builder **sempre** vence o marcarFantasma (senão um preset de mention marcaria
   todos os participantes de um grupo por engano = `MENTION_LEAK`).
9. `safeSendMessage(jid, opts, 0)` por envio, `Promise.all` do lote, depois
   `await delay(intervalo + (jitter ? rand(50..300) : 0))` (sem delay após o último lote).
10. `executarFloodLote(grupos, msg, qtd, opts)`: mesmo laço por grupo e, se o kill switch
    bater no meio, **cancela os grupos restantes** (não fica "terminando" o resto).

`safeSendMessage(jid, content, retries = 1)` = wrapper com retry em erro transitório
(usado por TODA saída do bot). O `Ler mais` **não** é aplicado aqui: ele vive no **wrap
único de `sock.sendMessage`** em `connection/socket.js` (`aplicarLerMais` em `content.text`
ou `content.caption`, nunca em `status@broadcast`) — é por isso que menus/painéis/flood
herdam o comportamento sem cada chamada precisar saber dele. `registrarAcao("flood", {...})`
depois de cada job.

## 10. Infra de presets (`features/flood/`) — módulos e contratos

```
limiter.js       createLimiter({interval,concurrency,timeout,key,jitter}) · withTimeout ·
                 sleep · classifyError · remainingCooldown(presetId, cooldownMs) ·
                 markJobEnd(presetId) · clearCooldown(presetId?)
queue.js         createQueue().runItems(items, worker, {concurrency,timeout,onItem}) · cancel ·
                 isCancelled · counts  — backoff: rate_limit ? 800*(n+1) : 200;
                 aborta em erro "disconnect"/permanente
killswitch.js    isKillSwitchOn · setKillSwitch(on,{persist}) · toggleKillSwitch({persist}) ·
                 onKillSwitch(fn)→unsubscribe · killSwitchStatusTexto() · KILL_SWITCH_REASON
allowlist.js     getAllowlist · normalizeTargetJid · isOnAllowlist · filterAllowlist ·
                 filterTargets → {ok[],blocked[]} · addAllowlistJid(value) ·
                 removeAllowlistJid(1-based|jid) · maskJid · formatAllowlistTexto ·
                 códigos: BLOCKED_TARGET · ALLOWLIST_EMPTY · PROTECTED_GROUP_BLOCKED · JID_INVALID
groups.js        parseSelectedGroups · extractTargetJids · TARGETS_REQUIRED
customStore.js   slugPresetId · save/get/update/deleteCustomPreset · listCustomPresets ·
                 formatCustomPresetsTexto · isReservedPresetId · CUSTOM_TYPES (persist:false em teste)
speed.js         resolveFloodSpeed(raw) → {ok,modo,intervalo,lote,jitter,from}|{ok:false,
                 error:"SPEED_INVALID"} · formatFloodSpeedMenu · applyFloodSpeed(preset,cfg) ·
                 toFloodOpts · CUSTOM_INTERVAL_MIN=20 / MAX=5000
payment.js       parseAmount · parseCurrency · parsePaymentArgs("texto|25.90|BRL") ·
                 createPaymentPayload({text,amount,currency}) · buildPaymentContent · formatPaymentError
commerce.js      listarIdsDeLoja · compararShopId · extrairIds · formatDiagnostico
                 (diagnóstico de shop.id com getCatalog/getCollections do fork)
config.js        FLOOD_PRESET_HARD_CAP · FLOOD_GENERAL_PRESETS · getFloodRuntimeConfig() ·
                 getPresetDef(id) · listPresetIds · clampPresetLimits · clampJobQtd
presets/         index.js (loadPreset/buildContent/makeIterationBuilder/listPresets/describePreset/
                 previewContentKeys) + text|mention|media|payment|custom + shopping.js (DADOS) +
                 shoppingBuilder.js (ponte p/ o builder AB7)
presetEngine.js  runPresetJob(opts) · formatPresetJobResult · isFloodEngineRunning ·
                 currentJobInfo · cancelRunningJob · PresetJobError
doctor.mjs       CLI de diagnóstico: node features/flood/doctor.mjs [--only a,b] [--qtd N]
tests.js / tests-infra.js / tests-menu.js   suítes (183/228/83)
router.js        [fachada de comandos] floodRouter + FLOOD_PRESET_COMMANDS + overlays (§13)
index.js         BARREL: única porta de entrada pública (`../features/flood/index.js`)
```

### Tetos (hard cap — o overlay nunca afrouxa)

```js
FLOOD_PRESET_HARD_CAP = { maxMessages: 10, minInterval: 1000, maxConcurrency: 2,
                          minCooldown: 5000, minTimeout: 3000, maxTimeout: 30000, maxRetries: 2 }

FLOOD_GENERAL_PRESETS = {
  "text-test":    { type:"text",    maxMessages:3, interval:2000, cooldown:15000, concurrency:2, timeout:15000 },
  "mention-test": { type:"mention", maxMessages:2, interval:2500, cooldown:20000, ... },
  "media-test":   { type:"media",   maxMessages:2, interval:3000, cooldown:20000, ... },
  "payment-test": { type:"payment", maxMessages:3, interval:3000, cooldown:30000,
                    concurrency:1, timeout:15000, text:"Pagamento de teste",
                    amount:25.9, currency:"BRL" }
}
// + shopping-test (dados puros, ver §14) com SHOPPING_PRESET_RUNTIME =
//   { targetMode:"selected", maxMessages:3, interval:3000, concurrency:1, cooldown:30000, timeout:15000 }
```

Regras de clamp que os testes cobrem (reproduzir literalmente):

- `loadPreset(id, overlay)`: **clamp DEPOIS do overlay**; `merged.maxMessages = min(merged,
  max(1, tetoDoPreset))` → overlay não aumenta o teto **do preset**, e o preset não passa
  do hard cap. `targetMode` forçado a `selected|single`.
- `getFloodRuntimeConfig()` devolve só `{killSwitch,dryRun,testMode,allowlist[],maxRetries,timeoutMs}`
  (não inventar campo aqui).
- `clampJobQtd(qtd) = min(qtd, maxMessages, MAX_FLOOD)`.

### Ordem das porteiras em `runPresetJob` (ordem importa — é o que a UI reporta)

```
1 loadPreset                → PRESET_UNKNOWN / PRESET_TYPE_UNSUPPORTED
2 KILL_SWITCH               → "KILL_SWITCH"
3 JOB_IN_PROGRESS           → um job por vez (isFloodEngineRunning)
4 PAYMENT_TEST_DISABLED / SHOPPING_TEST_DISABLED   (gate do floodTestMode)
5 validação por tipo        → MENTION_LEAK · MEDIA_UNAVAILABLE · AMOUNT_NEGATIVE ·
                              wire do card de loja (chaves exigidas presentes?)
6 COOLDOWN {remainingMs}    → respeita remainingCooldown(presetId, cooldown)
7 filterTargets             → ALLOWLIST_EMPTY / BLOCKED_TARGET / PROTECTED_GROUP_BLOCKED
8 resolveFloodSpeed + applyFloodSpeed   (payment/shopping: concurrency SEMPRE 1)
9 clampJobQtd
10 createQueue.runItems      (worker = opts.executor ?? import("../../services/groupService.js").executarFlood)
11 markJobEnd(presetId) → cooldown aberto
12 resultado: { ok, type, preset, presetExtra, dryRun, speed, limits, targets,
                blocked, metrics, results, cancelled, aborted }
     em dry-run, results[] traz { keys, contentType, wire, qtd }  ← é assim que se
     valida um card SEM enviar
```

⛔ PROIBIDO:retry infinito contra rate limit (o retry é limitado pelo `timeout` do item e
vira `timeout` — isso é **comportamento correto**, não bug); segundo `sock.sendMessage()`
paralelo ao `executarFlood`; fila/executor próprio de loja; remover ou ampliar a allowlist
sozinho; classificar `TIMEOUT` como "sucesso".

## 11. 🛍️ SHOPPING (card de loja) — **status: funcionando o mínimo provado, feature no começo**

⚠️ Leia isto antes de "melhorar" o shopping: a surface do card **não** é garantida pelo
payload — é garantida pelo app do destinatário. O que existe hoje está validado em
**payload + wire**, e o passo que falta é validação em aparelho real (matriz no fim da seção).

### Contrato do send (fork `@innovatorssoft/baileys@7.4.7`)

O fork lê o atalho `{ text, title, subtitle, footer, shop: { surface, id } }` e monta
`interactiveMessage.shopStorefrontMessage { surface, id }`. `SHOP_SEND_KEYS` (o filtro
branco antes do socket):

```js
["text","title","subtitle","footer","shop","nativeFlow","viewOnce","mentions","linkPreview"]
```

`createShoppingPayload(src, { defaults })` → `{ content, warnings, meta }`:

```js
content = { text, title?, subtitle?, footer?, shop: { surface, id }, nativeFlow?, viewOnce? }
meta    = { kind:"shopping", surface, surfaceName, surfaceMappedFrom, hasHeader, hasFooter,
            delivery, messageVersion, viewOnce, shopId, bodyLength,
            proto:"interactiveMessage.shopStorefrontMessage { surface, id }" }
```

Regras duras (todas com teste na suíte; reproduza as 15 mensagens de erro):

```js
SHOPPING_ERROR = SRC_INVALID · TEXT_REQUIRED · TEXT_TOO_LONG · FIELD_TOO_LONG · SHOP_INVALID ·
  SHOP_ID_REQUIRED · SHOP_ID_TOO_LONG · SHOP_ID_INVALID · SURFACE_INVALID · VIEW_ONCE_INVALID ·
  PAYMENT_NOT_ALLOWED · RAW_PROTO_NOT_ALLOWED · MEDIA_NOT_SUPPORTED · DELIVERY_INVALID ·
  NATIVEFLOW_INVALID
```

- **`surface` só pode ser 1 (FB), 2 (IG), 3 (WA).** O `4` que aparece no README do fork
  **não existe no proto** → `SURFACE_README_ALIAS` mapeia `4 → 3` e empurra um
  `warnings[]` ("surface 4 não existe; usando 3 (WA)"). ⛔ PROIBIDO mandar surface 4.
- **`viewOnce` fica DE FORA.** O default é `viewOnce: false`; a chave só entra no
  conteúdo quando pedida explicitamente. Motivo (está comentado no código):
  `lib/Utils/messages.js ~1631` embrulha em `viewOnceMessage { interactiveMessage }`
  quando `'viewOnce' in message && !!message.viewOnce`, e é **exatamente isso** que produz
  "mensagem indisponível / atualize o WhatsApp" sem atualização existir.
  ⛔ PROIBIDO `viewOnceV2`, proto cru, ou copiar `viewOnce: true` dos exemplos do README.
- `shop.id` é obrigatório (URL/id do catálogo); campos extras dentro de `shop` são
  **ignorados com aviso** (`shop.<x> ignorado: o atalho do fork só lê shop.surface e shop.id`).
- `content.payment`/`requestPaymentMessage` dentro do engine de loja → `PAYMENT_NOT_ALLOWED`
  (⛔ nunca misturar payment "para parecer" loja; payment tem caminho próprio, §12).
- `delivery: "puro" | "flow"`:
  - `puro` → só o ramo `shop`, `messageVersion: null`;
  - `flow` → mesmo card + `nativeFlow` (botão `SHOPPING_FLOW_BUTTON`), único ramo que bota
    `messageVersion: 1` — é o **A/B** para o caso "payload limpo e o app ainda diz indisponível".
  - `buttonParamsJson` precisa ser JSON válido (`NATIVEFLOW_INVALID` se não for; string
    inválida quebra o cliente igual `messageParamsJson:""` quebra menu).
- `isShoppingContent(content)` decide se é card; senão, o engine devolve `{...content}`
  sem alterar (é assim que o mesmo laço serve texto e loja).
- `describeSendWire(content)` → a linha que o operador lê no preview:
  `type: interactiveMessage.shopStorefrontMessage (shop puro|+ nativeFlowMessage (messageVersion:1)) ·
   chaves: … · surface=N · viewOnce=omitido|SIM`. **É por esta string que se prova o card.**

### Como o usuário escolhe loja (sem menu novo): prefixo no passo de conteúdo do flood

```
loja:0                          → preset default (shopping-test)
loja                            → idem
loja:texto livre                → corpo livre + defaults do preset
loja:texto|title|surface|id     → overlay completo (máx. 4 campos → OVERLAY_TOO_MANY_FIELDS)
loja:texto|title|surface        → id vem do preset
loja:texto|title|4|url          → 4 vira 3 (WA) com aviso
loja:flow:… / loja:puro:…       → modo de entrega do MESMO card
```

Gatilhos aceitos: `loja:`, `shop:`, `shopping:`; a **palavra sozinha** (`loja`) também vale —
mas ⛔ **nunca** tratar `loja de roupas` como gatilho (sem os dois-pontos é flood clássico,
senão o robô engole mensagem de verdade). `detectShoppingTrigger(text)` +
`parseShoppingOverlay(rest, preset)` + `resolveShoppingSend(rest)` implementam isso;
o builder entra no `executarFlood` via `makeFloodContentBuilder(content)` como `buildContent`
(mesmo laço, mesmo ritmo, mesmas permissões) e `floodContentBuilderFor(state)`.

⚠️ `presets/shopping.js` é **arquivo de DADOS** (não importa nada do flood, não faz I/O,
não conhece socket — senão `features/flood/config.js` entra em ciclo ESM com ele) e
`presets/shoppingBuilder.js` é só a ponte `preset → src → createShoppingPayload →
buildSendContent → makeFloodContentBuilder`.

O preset default:

```js
SHOPPING_PRESET_TEST = { id:"shopping-test", label:"🛍️ SYZYGY SHOP (teste)", type:"shopping",
  contentKind:"shopping", format:"text", text:"🛍️ SYZYGY SHOP — novidades da semana",
  title:"SYZYGY SHOP", subtitle:"Catalog", footer:"SYZYGY",
  shop:{ surface:1, id:"https://en.wikipedia.org/wiki/Shopping_cart" },
  viewOnce:false, delivery:"puro" }
```

Pendente (é aqui que a feature "está no começo" — implemente nesta ordem):
1. matriz de validação em aparelho real (Android WhatsApp, Android GB, iOS, Web/Desktop,
   WhatsApp Business) → `surface 1/2/3` × `delivery puro/flow` → registrar o que renderiza;
2. `loja:` com **múltiplos produtos** (hoje o card é 1 storefront; o catálogo real vem de
   `getCatalog`/`getCollections` — já existe `commerce.js` com diagnóstico de `shop.id`);
3. botão "ver catálogo" opcional por grupo (`delivery:"flow"` quando o A/B confirmar);
4. isenção do Ler Mais já feita (⛔ não remover: `aplicarLerMais` pula texto que começa
   com `🛍️` ou `💳 CONTEÚDO`, senão o `…Ler mais` come o rodapé do card);
5. `doctor.mjs --only shopping` já valida wire/keys sem enviar (mantenha).

## 12. 💳 PAYMENT — **status: pronto, lógica fechada** (não "reinventar")

Payload do fork: `requestPaymentMessage`, alimentado por

```js
{ payment: { note, currency, amount, offset, from } }
```

- `amount` é **milésimos** (R$ 25,90 → `25900`); `offset` = 0; `from` = JID do dono.
- `parseAmount("25.90" | "25,90" | "R$ 25,90")` → `{ok:true,value:25.9,amount1000:25900,display:"R$ 25,90"}`;
  aceita vírgula ou ponto; ⛔ rejeita negativo (`AMOUNT_NEGATIVE`) e texto sem número.
- `parseCurrency("BRL")` → normaliza maiúsculas, valida 3 letras (fallback `BRL`).
- `parsePaymentArgs("Pagamento do pedido|25.90|BRL")` = atalho para `createPaymentPayload`
  com `TEXT_MISSING` / `USAGE` explícitos (`usageTexto()` mostra o formato no chat).
- `buildPaymentContent(payload,{from,mentions})` monta o send; o adapter de payment do
  preset engine (`presets/payment.js`) tem `makeIterationBuilder` que **copia** o
  `payment` por iteração (nota de cobrança é dado do pagamento → ⛔ não receber o
  `​` invisível do laço dentro do `note`).
- Gate: `floodTestMode=false` → `PAYMENT_TEST_DISABLED` (o motor se recusa a mandar
  cobrança fora de teste). ⛔ não remover para "facilitar".
- O engine de shopping **recusa** payment (`PAYMENT_NOT_ALLOWED`) — dois caminhos separados.

## 13. Ataques e mutações de grupo (o que tem que funcionar igual)

### `executarNuke(jid)` — reset de identidade + expulsão

Ordem: foto → `groupUpdateSubject(jid, CONFIG.nome)` → `groupUpdateDescription(jid, CONFIG.bio)`
→ `groupSettingUpdate(jid,"announcement")` → remove participantes **exceto** bot (id e lid)
e dono (`normalizeNumber` nos dois lados). Retorna
`{ foto, nome, bio, fechado, removidos, erros[] }` e `erros` carrega **motivo legível**
(ex. `"foto: sem imagem configurada (use ./foto.jpg ou config menuImage)"`).
⛔ `catch {}` silencioso. Recusa imediata se `isProtectedGroup(jid)`.

### `alterarTudoGrupo(jid, {nome, bio, bufferFoto})` = "Preset + NUKE" (opção 3)

Aplica identidade (nome/bio/foto) e faz o nuke em sequência, reportando o resumo.

### `roubarGrupo(jid, {nome, bio, fotoPath, bufferFoto})` — "Roubar grupo" (opção 4)

**Sequência que funciona** (não trocar ordem):
1. fecha e tranca em paralelo: `groupSettingUpdate(jid,"announcement")` +
   `groupSettingUpdate(jid,"locked")`;
2. foto (com retry) + nome + bio em paralelo (`Promise.all`, cada um com seu `catch`
   que empurra `erros`);
3. **demote por último**: `groupParticipantsUpdate(jid, adminsNaoProtegidos, "demote")`
   — antes disso o bot ainda é admin e consegue editar; depois já não conseguiria.
Retorno: `{ rebaixados, fechado, editRestrito, foto, nome, bio, erros[] }`.
`ehProtegido(p)` protege bot (`id` **e** `lid`) e dono. ⛔ nunca demote do dono.
`roubarGrupoLote(grupos, dadosPreset, opts)` idem por grupo.

### Foto de grupo (o ponto que mais quebrou na história do projeto)

```js
trocarFotoComRetry(jid, prepararBuf, tentativas = 3)
// tentativa → se falhar: sock.refreshMediaConn(true) → tenta de novo (backoff)
// prepararFoto(caminho) / prepararFotoBuffer(buffer) → jimp resize p/ quadrado válido
// baixarMidiaMensagem(m) p/ foto enviada no chat; validarTamanho(size) ≤ 10 MiB
```

⛔ PROIBIDO omitir o `refreshMediaConn()` (uma falha de `media_conn` contamina todo upload
seguinte até reconectar — foi o bug que fez a foto "parar de mudar" pra sempre);
⛔ PROIBIDO reportar sucesso sem o `resumo.foto = true`.

### Presets de identidade (`services/presetService.js`)

`carregarPresets()/getPreset(i)/salvarNovoPreset({nome,bio,msg,img})/apagarPreset(i)/
listarPresetsTexto()/fotoPresetPath(preset)` — persistem em `dono/presets.json`.
Preset `0` = "atual/CONFIG" (nome+bio do CONFIG, sem foto).NUKE/ROUBAR recebem
`presetDados` do wizard ou do fast path (`3/01/2/Oi`, `4/01/2`).

### Mencionar todos "fantasma"

`mencionarTodosFantasma(jid, texto)`: `mentions = participantes.map(p => p.id)` +
`{ text: texto || "\u2063", mentions }` — o `​` invisível é o corpo quando não há texto
(o WhatsApp ignora texto vazio com mentions). Só roda com `CONFIG.marcarFantasma` ou em
preset de `mention` com destino explicitamente autorizado (⛔ `MENTION_LEAK`).

### `aplicarLerMais` (`utils/lerMais.js`)

Quando `CONFIG.lerMais`, injeta caracteres invisíveis depois do título para forçar o
"…Ler mais" do app. ⚠️ Corte é client-side (pode não dobrar no iPhone) — a UI diz isso.
**Isenções obrigatórias**: conteúdo começando com `🛍️` ou `💳 CONTEÚDO` (card de loja e
nota de cobrança não podem ser cortados).

## 14. UI: painéis e a numeração (não "renumere" — decorar é o contrato)

`uiModoEfetivo()`: `text`/`txt`/`bloks` → fluxos TXT; `buttons` → interativo; `list` → lista.
⛔ Nunca mandar TXT **e** interativo na mesma ação (exclusivo por decisão de modo).
No interativo: `single_select` com **sections de ≤10 linhas** (limite do app).

| Painel | Onde entra | Faixa |
|---|---|---|
| Inicial | `menu` / `1`…`8` no chat | 1 Listar grupos · 2 🌊 FLOOD · 3 💣 Preset+NUKE · 4 👑 Roubar · 5 👑 Comandos do dono · 6 ⚙️ Configurações · 7 🫥 Status Manager · 8 🔢 Multi (Lote) · 0 Sair |
| ⚙️ ADM | `6` | 1-11 (ver dono/num/conexão/histórico/relatório/agendamentos/listas/ler mais…/voltar) |
| 👑 DONO | `5` | **12-47** (tabela abaixo) · `0`/`cancelar` saem |
| Grupo | `1` → número do grupo | menu de ações por grupo (nome/bio/foto/flood/nuke/roubar/agendar) |
| Multi (lote) | `8` | seleção multi `1,3,5` + as mesmas ações em lote |

**👑 DONO (12-47) — os números 36-39 são os da arena original, preservados de propósito:**

```
12 Criar preset        13 Apagar preset       14 Imagem do menu     15 Link/nº divulgação
16 📖 Ler mais: ON/OFF  17 Modo do flood       18 Intervalo          19 Lote
20 Auto-limpeza         21 Anti-takeover       22 Limpar fantasmas   23 Limpar agendamentos
24 + ADM bot           25 − ADM bot            26 + grupo autz        27 − grupo autz
28 + dono extra         29 − dono extra
30 ViewOnce ON/OFF      31 → grupos autz       32 → owner             33 → ADMs   34 Salvar
35 ⬅️ Voltar ao menu (alias histórico — continua valendo)
── 🛡️ FLOOD · PRESETS ─────────────────────────────────────────────────────────
36 Flood presets (load-test)      → painel de presets + atalhos + estado do dry-run
37 🧪 Dry-run: LIGADO/DESLIGADO   → CONFIG.floodDryRun
38 🎯 Escolher grupos (1,3,5)     → escreve CONFIG.floodAllowlist (1,3,5 · todos · limpar)
39 🛑/▶️ Kill switch (toggle)      → setKillSwitch(±,{persist:true}) + cancela job em andamento
── 🛡️ FLOOD · CONTROLES ──────────────────────────────────────────────────────
40 Allowlist: listar              41 Allowlist: + grupo (nº ou JID @g.us)
42 Allowlist: − grupo (1-based)   43 🚀 Velocidade (1-4 ou ms 20..5000)
44 🧪 Modo teste (payment/loja)   45 🛍️ Loja: preview do card (NÃO envia)
46 🩺 Raio-X do flood             47 ⬅️ Voltar ao menu
```

Fonte única dos números: `CONFIG_OPCOES` em `menus/configMenu.js` (+ `CONFIG_ROTULOS_ADM`
/`CONFIG_ROTULOS_DONO` exportados para paridade com o interativo). `menus/menu.js` deriva
os comandos rápidos automaticamente:

```js
const NUM_CONFIG = {}; for (const [k,v] of Object.entries(CONFIG_OPCOES)) if (v!=="abrir_painel") NUM_CONFIG[v]=Number(k)
numeroNavegacao(id) → NUM_CONFIG[id] >= 12 ? `5>${NUM_CONFIG[id]}` : `6>${NUM_CONFIG[id]}`
```

⛔ PROIBIDO duplicar a lista de opções em outro lugar (foi assim que o "E2E de paridade"
nasceu: **toda** opção tem row, **toda** row tem id roteado — o teste
`features/flood/tests-menu.js` confere nos dois sentidos).

## 15. Atalhos de texto e a fachada de flood (`commands/commandMap.js` + `features/flood/router.js`)

`TEXT_TO_ACTION` (chave sem `!` e com `!` — as duas formas existem) → `roteadorAcoes`:

```
menu/voltar/menutest → menu_inicial · 0/00 → owner_sair · cancelar → menu_cancel
1 listar · 2 flood · 3 tudo · 4 roubar · 5 dono · 6 config · 7 status · 8 multi/lote
historico · relatorio · agendamentos · limpar_fantasmas · limpar_agendamentos ·
botstatus · bloks (→ server_inspector)
── 🌊 flood (restaurados da arena 01a0aaae; a implementação é a fachada) ──
floodpresets | floodpreset → painel_flood_presets
texttest · mentiontest · mediatest · paymenttest · shoppingtest → flood_preset_<tipo>_test
floodstop → flood_kill_on      floodstart → flood_kill_off      flooddryrun → cfg_flood_dryrun
```

`features/flood/router.js` = **fachada**, não segundo motor:

```js
floodRouter(chatJid, ownerKey, actionId, extra)   // painel, *_test, run, kill on/off, escolher grupos
FLOOD_PRESET_COMMANDS   // atalho → ação  (fonte dos nomes; commandMap só replica)
FLOOD_TEST_ACTION_PRESET// ação → preset ("paymenttest" → "payment-test")
paymentOverlayFromRest("Pedido|25.90|BRL")  → {ok, overlay:{text,amount,currency}} | {ok:false,error}
shoppingOverlayFromRest("Produto|Loja|wa|id") → {ok, overlay, kind} (4 campos máx.; 4→3)
```

Regras da fachada (⛔ não afrouxar): alvos = `getAllowlist()` (vazio → responde
`ALLOWLIST_EMPTY` e **não inicia job**); `dryRun` segue `CONFIG.floodDryRun !== false`;
`flood_kill_on` persiste **e** chama `cancelRunningJob(KILL_SWITCH_REASON)`; tudo passa por
`runPresetJob` → `executarFlood`; `registrarAcao("flood_preset", …)` **só quando não é
dry-run** (ensaio não polui `dono/historico.json`); o módulo **não importa o barrel**
(`features/flood/index.js` importa `router.js` — ciclo ESM).

## 16. Modo rápido (`services/fastParser.js`) — gramática a reproduzir

```
1/<n>                     grupo n da lista (cache de seleção por ownerKey)
2/<grupo>/<msg>/<qtd>[/<modo>][@tempo]      ex: 2/01/Oi/20/1 · 2/01/Oi/20/1@10m
2/preset/<id>[/conteúdo] ex: 2/preset/payment-test/Pedido|25.90|BRL
                          ex: 2/preset/shopping-test/Produto|SYZYGY SHOP|wa
3/<grupo>/<preset>[/<msg|pular>][@tempo]    NUKE (0 = config padrão; "pular" = sem msg)
4/<grupo>/<preset>[@tempo]                  ROUBAR
5>NN                        dono (ex: 5>37 alterna dry-run · 5>36 painel de presets)
6>NN                        config ADM
7>NN                        Status Manager
6/<grupos>/1/<msg>/<qtd>[/<modo>][@tempo]    MULTI/LOTE (aceita "1,3,5" e "1-5")
```

- `<grupo>` aceita número da lista, pedaço do subject ou JID (`resolverGrupoInput`).
- `@tempo` → `parseAgendamento`: `DD/MM [HH:MM]` (data; se já passou, ano+1) · `HH:MM`
  (absoluto hoje/amanhã) · `Ns|Nm|Nh|Nd`/`10 min`/**só número = minutos** → cria
  `agendarAcao({tipo,grupos,dados,mensagem,delayMs,at})` (`id = base36(now)+rand`) e
  responde "⏰ Agendado para …". `cancelar <id>` cancela; `limpar_agendamentos` remove
  concluídos. Persistência em `dono/agenda.json`, executor = `iniciarAgendamentos()` no boot.
- ⚠️ `OWNER_ONLY` (no `commandRouter`) **também** existe como lista local de fallback dentro
  do fastParser — as duas fontes têm que conter os mesmos `cfg_flood_*`/`flood_*`
  (se esquecer, ADM não-dono consegue ligar kill switch pelo `5>NN`).
- `qtd` sempre clampada em `MAX_FLOOD`; `modo` `1..4` → `getFloodConfig`.

## 17. Features anexas (existem e funcionam — reconstrua)

**ViewOnce** (`features/viewOnce/`): `VIEW_ONCE_CONFIG = {enabled:true,
sendToAuthorizedGroups:true, sendToOwner:true, sendToAdmins:true, maxDestinations:50,
maxGroups:30, maxAdmins:20, allowedTypes:[image,video,audio,document,sticker,ptt],
logEvents:true, saveToDisk:false}`. `detectViewOnce(m)` →
`handleViewOnceMessage({chatJid,senderJid,isGroup,webMessageInfo})` → desembrulha
`viewOnceMessage(V2)`, baixa a mídia **uma vez** (cache de processados →
`getProcessedCacheSize`/`clearProcessedCache`) e repassa aos destinos por
`destinations.js`; `saveToDisk:false` = **só em buffer** (⛔ nunca salvar mídia alheia em
disco sem o dono ligar isso explicitamente). Resposta: `✅ ViewOnce <tipo> → N destinos
(grupos:x owner:y)` ou `⚠️ … : <motivo>`.

**Status Manager** (`features/statusManager/`, painel `7`, números `1-11` em `STATUS_MENU_MAP`):
texto (`1`), imagem (`2`), vídeo (`3`), preset (`4`), publicar (`5`), cancelar (`6`),
ver fila (`7`), erros (`8`), audiência (`9`), privacidade (`10`), menu de presets (`11`).
`STATUS_LIMITS = { maxAudiencia:256, maxContatos:5000, maxTexto:700, maxVideoBytes:64MiB,
maxImagemBytes:10MiB, delayEntreEnvios:1500, errosHistorico:50 }`;
`STATUS_CONFIG_PADRAO = { audienciaModo:"contatos"|"custom", audienciaCustom:[],
privacidadePadrao:null, fontePadrao:0, corPadrao:"#000000", contatosConhecidos:[],
audienciaKeyUltima:null }` (em `dono/status_config.json`, erros em `dono/status_erros.json`);
`FONTES_STATUS = {0 Sistema,1 Sistema Texto,2 Serifado,6 Negrito,7 Morning Breeze,
8 Calistoga,9 Exo2,10 Courier}` + cores; `importarMembrosGrupo` alimenta
`contatosConhecidos`; `podeGerenciarStatus` gateia (dono + ADMs autorizados);
rotação de sender-key quando a audiência muda (`audienciaKeyUltima`).

**Server Inspector** (`!bloks`): `collectServerInfo()` (hostname, uptime, load, CPU, RAM,
disco, rede, processo Node, versão) → `sendServerInspector`; no `uiMode:"bloks"` vai como
BLOKS/A2UI, nos outros vai como TXT (`serverInspectorTexto`). Somente dono. ⛔ nunca expor
por PV não autorizado (o gate global já cobre).

**Histórico/Relatório**: `registrarAcao(tipo, dados)` → `dono/historico.json`
(`{ts,data,tipo,…}`), `listarHistorico(n)`, `gerarRelatorio()`, `formatarHistoricoTexto(20)`,
`limparHistorico()`. Tipos usados hoje: `flood`, `nuke`, `roubar`, `flood_preset`.

**Terminal** (`handlers/terminal.js` + `utils/terminalUI.js`): readline com `ask()`,
banner, `ok/err/warn/info` com carimbo `HH:MM:SS`, `credLine()`;
`utils/logger.js#instalarSilenciador()` intercepta `console.*` para **nunca** imprimir
objeto de sessão/creds.

## 18. Deploy (por que `update.sh`/`start.sh`/`recover.sh` existem)

- `start.sh`: pidfile + varredura de `/proc` pelo cwd → **não** inicia segunda instância,
  **não** apaga `sessao/`, executa `npm start`. ⚠️ Consequência: para aplicar código novo
  é preciso **matar o processo velho antes** (é a causa nº 1 de "atualizei e nada mudou").
- `update.sh`: **backup antes de tocar em qualquer arquivo** →
  `.syzygy-backup/<ts>/` com `tracked.diff`, `untracked.tgz` (**todos** os não rastreados),
  `vital.tgz` (`config.json`, `.env`, `sessao/`, `dono/`) e snapshot real via
  `git stash create` + `git update-ref refs/syzygy-backup/<ts>`; `--list` read-only;
  `--dry-run` prevê conflito (`git merge-tree`) e colisões de untracked; `--sync-all`
  aplica a arena **mais nova primeiro**; conflito só em `features/flood/**` ou nos scripts
  de deploy é resolvido com o incoming (`--flood-ours` inverte), qualquer outro conflito =
  `git merge --abort` e segue; `--to <branch>` troca de branch e **reaplica** `tracked.diff`
  com `git apply --3way`; `--adopt` para linhagens divergentes; `--copy <ref> --path <dir>`;
  `--rollback <dir|ref>`; `npm install --legacy-peer-deps`; validação = as três suítes +
  `doctor.mjs` com log no diretório do backup. ⛔ PROIBIDO: `git stash push` **sem `-u`**
  (foi assim que se perdeu trabalho real), `reset --hard`/`checkout -f` sem aviso,
  `git stash drop`, `npm install` puro.
- `recover.sh` é **read-only**: `--stash --reflog --snapshots --files --blobs
  --lost-found --apply <ref> --blob <sha> --out arquivo`.

## 19. Critérios de aceite (o "pronto" do projeto)

Rode as suítes; a contagem atual é a régua (183 · 228 · 83, **0 falhas, 0 skip**).
Elas são executáveis sem WhatsApp (sock falso injetado por `setSock`), **nunca** enviam
de verdade e **comparam os bytes** de `config.json` e `dono/historico.json` antes/depois
(persistir em teste = falha). Copie as asserções críticas ao reconstruir:

- **`tests.js` (shopping/wizard)** — trigger `loja:`/`shop:`/`shopping:` e a palavra sozinha;
  `loja de roupas` **não** é gatilho; overlay 4 campos; `OVERLAY_TOO_MANY_FIELDS`;
  `surface 4 → 3` com warning; `viewOnce` omitido; keys do send =
  `footer,shop,subtitle,text,title`; `delivery:"flow"` → `messageVersion:1`, `puro` → `null`;
  `isShoppingContent`; `describeSendWire`; `makeFloodContentBuilder` com fallback
  `{text}` quando o builder estoura; isenção do Ler Mais.
- **`tests-infra.js` (infra)** — overlay não sobe teto · `MENTION_LEAK` com 20 menções ·
  `MEDIA_UNAVAILABLE` · payment `25900/BRL/offset` + `PAYMENT_NOT_ALLOWED` ·
  custom `RESERVED`/`TYPE_INVALID` · `ALLOWLIST_EMPTY`/`TARGETS_REQUIRED`/`BLOCKED_TARGET`/
  `JID_INVALID` · grupo protegido · cooldown + `ignoreCooldown` · kill switch · `TIMEOUT` ·
  retries · abort em `Connection is closed` · métricas · limiter (teto/intervalo global/
  inflight) · speed (`"4"→seguro`, `"0"→config`, `"250"→custom`, `"9"→SPEED_INVALID`,
  payment/shopping `concurrency:1`) · anti-ciclo de import · `JOB_IN_PROGRESS`/`cancelRunningJob`
  · integração com `setSock` fake · gates de teste · nomes do barrel.
- **`tests-menu.js` (UI/fachada)** — paridade rótulo×mapa nos dois painéis · faixa 12-47 ·
  `35` **e** `47` = voltar · todas as ações novas em `OWNER_ONLY` · `numeroNavegacao`
  (`5>36`, `5>45`) · render do TXT com estado vivo · kill switch refletido sem persistir ·
  allowlist add/remove 1-based · `SPEED_INVALID`/custom · preview da loja com surface ≤ 3 ·
  `TEXT_TO_ACTION` com os 10 atalhos · atalho sem allowlist = 1 msg ao dono e `ALLOWLIST_EMPTY`
  · atalho com allowlist roda o motor e devolve `DRY-RUN` + `shop` no wire · `config.json`
  e `dono/historico.json` intocados.

Teste manual no aparelho (a única prova que vale): `floodpresets` → `38 · 1` →
`shoppingtest` (deve responder DRY-RUN com `viewOnce=omitido` e `surface=1..3`) → `37`
desliga dry-run → repetir → conferir **no app do destinatário** se o card abre; `loja:flow:0`
pelo wizard é o A/B; `floodstop` no meio de um flood tem que parar na fronteira do lote.

## 20. ⛔ Proibições consolidadas (lista única — nada aqui é opcional)

1. `viewOnce: true` em card de loja; `viewOnceV2`; proto cru (`hasMediaAttachment`,
   `RAW_PROTO_NOT_ALLOWED`); inventar campo de renderer que o proto não tem.
2. `surface` fora de 1/2/3 (o "4" do README do fork não existe).
3. Segundo executor/fila/permissão para a loja: shopping é **TIPO de conteúdo** do flood.
4. Segundo `sock.sendMessage()` paralelo ao `executarFlood`.
5. Allowlist removida, ampliada automaticamente, ou contornada (nem por "teste").
6. `npm install` sem `--legacy-peer-deps`; `git stash` sem `-u`; `reset --hard`/`checkout -f`
   sem backup; apagar `sessao/` em script de update; versionar `sessao/`, `.env`, `config.json`
   com números reais.
7. `catch {}` em operação de grupo (o usuário recebe o **motivo**).
8. Silenciar kill switch, cooldown, `remainingMs`, bloqueados ou `aborted` no resultado.
9. Enviar flood real sem `floodDryRun` ligado por default; rodar payment/loja com
   `floodTestMode` desligado.
10. TXT **e** interativo na mesma ação; mais de 10 rows por section; menu com numeração
    duplicada em dois lugares.
11. `payload` de loja carregando payment (e vice-versa).
12. `erros: ["N erro(s)"]` sem explicação (v58: relatório sempre com o motivo).

## 21. Ordem de construção sugerida (pare a cada fase e rode o teste dela)

| Fase | Entrega | Aceite |
|---|---|---|
| 0 | scaffold ESM, deps, `.gitignore`, `config.json` + `utils/config.js` (defaults + salvarConfig), `terminalUI`, `logger` | `node -e "import('./utils/config.js')"` ok; `config.json` reescrito idêntico |
| 1 | `connection/*` (auth multi-arquivo, pareamento, reconexão, silenciador, `rt()`) | loga `AUTH Baileys x.y.z`, conecta em teste com QR/pairing |
| 2 | `permissions` + `stateManager` + `messageHandler` (pipeline §6) com **só** `menu`/`cancelar` | PV não autorizado recebe `❌ Acesso negado` + alerta ao dono |
| 3 | `menus` (main/config/grupo) em TXT + `configMenu` com `CONFIG_OPCOES` | digitar número funciona; `cancelar` sai limpo |
| 4 | `groupService`: cache de grupos, `safeSendMessage`, `throttledGroupMetadata`, `getFloodConfig`, `executarFlood` + `executarFloodLote` + `registrarAcao` | flood em 1 grupo de teste: 20 msgs com 1-6 `​` rotativos, lote/intervalo respeitados |
| 5 | Nuke/Roubar/Preset+foto (`trocarFotoComRetry` com `refreshMediaConn`) | foto muda **depois** de uma falha simulada; resumo com motivos |
| 6 | `fastParser` (`1/`…`6/`, `@tempo`) + `agendaService` | `2/01/Oi/3/2@1m` agenda e dispara; `cancelar <id>` cancela |
| 7 | `features/flood/` infra (limiter→queue→killswitch→allowlist→speed→groups→customStore→presets→presetEngine→doctor) + `tests-infra.js` | 228 asserts verdes; dry-run não chama executor |
| 8 | Payment (pronto na lógica, §12) + Shopping (mínimo provado, §11) + integração `loja:` no wizard + `tests.js` | 183 asserts; `describeSendWire` mostra `shopStorefrontMessage`, `viewOnce=omitido` |
| 9 | Fachada de comandos (`router.js` + `commandMap` + 36-47) + `tests-menu.js` | 83 asserts; `shoppingtest` responde com resultado de job |
| 10 | ViewOnce, Status Manager, Server Inspector, Multi/Lote, `dono/*` persist | `!bloks`, `7` (status), `8` (lote) funcionam em PV do dono |
| 11 | `start.sh`/`update.sh`/`recover.sh` + `.gitignore` + README | `./update.sh --dry-run` não altera nada; `./start.sh` não duplica instância |

## 22. Perguntas que a IA deve fazer antes de codar (não adivinhe)

1. Qual **número** é o dono (`ownerOverride`) e qual grupo de teste entra na `floodAllowlist`?
2. `uiMode`: TXT (default, funciona em qualquer cliente) ou `buttons`/`list`/`bloks`?
3. Vai usar a **conta do dono** (o bot roda na conta pessoal — flood/nuke/roubar são ações
   reais e baníveis)? Se sim, `floodDryRun` fica **ligado** até validação manual.
4. Loja: precisa renderizar em **iPhone**? (é o caso que ainda não foi validado — §11 pendências)

## 23. Frase de partida (copie para a outra IA)

> Reconstrua o bot **SYZYGY** para WhatsApp seguindo `PROMPT-RECONSTRUCAO-SYZYGY.md` à
> risca: Node ESM + `@innovatorssoft/baileys@7.4.7` + `jimp` + `pino`, estado em JSON no
> disco, UI TXT numerada, um único laço de envio (`executarFlood`), presets com hard cap,
> allowlist como porta de saída, kill switch na fronteira do lote, dry-run ligado por
> default, card de loja **sem** `viewOnce` e com `surface` 1-3, payment via
> `requestPaymentMessage` (`amount` em milésimos, gate de `floodTestMode`), e as três
> suítes de teste (`183/228/83` asserts) rodando **sem** WhatsApp com sock falso.
> Entregue as Fases 0 e 1 e pare.
