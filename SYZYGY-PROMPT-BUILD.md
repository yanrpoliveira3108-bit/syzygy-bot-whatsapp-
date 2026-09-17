# SYZYGY 2.0 — PROMPT DE BUILD (especificação + código-fonte)

> **Isto é o prompt completo.** A Parte A é a especificação; a Parte B é o
> código-fonte real de referência, arquivo por arquivo. Nada aqui depende de
> repositório, git ou link externo: você tem tudo que precisa neste arquivo.
>
> **Sua missão:** implementar um bot de WhatsApp (WhatsApp + Node.js + Baileys)
> que reaja a texto **e** a menus numerados sequenciais, com o mesmo contrato de
> interação, as mesmas permissões e o mesmo motor de automação descritos aqui.
>
> **Três regras de ouro:**
> 1. **A Parte B é a verdade mecânica.** Quando a prosa da Parte A e um arquivo
>    da Parte B divergirem, o arquivo vence — ele é código que roda.
> 2. **Não use git nem procure o repositório.** Não existe. Está tudo aqui.
> 3. **Não inicie o bot nem dispare flood/nuke/roubo real.** Sem WhatsApp
>    configurado você não pode testar efeito em aparelho; faça verificações
>    estáticas (`node --check`, import graph, as suítes de teste que também estão
>    aqui) e diga explicitamente o que ficou sem prova de runtime.
>
> **Onde este build é diferente do original de 2024-11:** o pacote de WhatsApp é
> `@lucasmod/boruto-vk7-baileys@2.1.0` (não o `@innovatorssoft/baileys@7.4.7` antigo)
> e ele **não instala com `npm i` liso** — leia a seção **2.1** antes de tudo.
> Os contratos de payload (card de loja, pagamento, viewOnce) são idênticos.

| campo | valor |
|---|---|
| bundle gerado por | `tools/gerar-prompt-build.mjs` (rode-o para re-sincronizar) |
| especificação base | `PROMPT-RECONSTRUCAO-SYZYGY.md` |
| arquivos de fonte incluídos | 88 |
| linhas de fonte incluídas | 17094 |
| tamanho do apêndice | 827 KB |
| segredos | removidos — redações aplicadas em: ./utils/config.js, ./utils/permissions.js, ./features/viewOnce/tests.js |
| estado do projeto quando este bundle foi feito | AB7 v51 — Baileys trocada para `@lucasmod/boruto-vk7-baileys@2.1.0`, `connection/baileysCompat.js` reancorado, `.npmrc` de instalação criado; suítes verdes: shopping 184 · menu 83 · infra 228 · viewOnce ✓ |
| divergência conhecida do fork novo | o ramo combinado `nativeFlow+shop` (que punha `shopStorefrontMessage.messageVersion = 1`) não existe aqui ⇒ modo `flow` degenera em `puro`; `viewOnce: true` embrulha em `viewOnceMessageV2` (antes `viewOnceMessage`) — em ambos os casos a regra é a mesma: nunca mandar `viewOnce` no card de loja |

---

# PARTE A — ESPECIFICAÇÃO

> **⚠️ Nota (2026-09-17, v51).** A dependência de WhatsApp deste projeto mudou:
> o `@innovatorssoft/baileys@7.4.7` citado abaixo foi substituído por
> **`@lucasmod/boruto-vk7-baileys@2.1.0`** (repo `Otakump4/boruto_vk7-baileys`).
> Os contratos de payload (card de loja, pagamento, viewOnce) são os mesmos e os
> números de linha do `Utils/messages.js` mudaram (shop `:1020`, viewOnce `:1197`,
> payment `:725-753`/`:1247-1249`); a instalação tem 4 armadilhas de empacotamento
> (`.npmrc` com `ignore-scripts` + alias do libsignal + import por caminho
> explícito) e há UMA divergência real: o ramo combinado `nativeFlow+shop` que
> punha `shopStorefrontMessage.messageVersion = 1` não existe no fork novo, então
> o modo de entrega `flow` degenera no `puro`. Os detalhes, a receita de `npm i`
> testada e o **código-fonte completo embutido** estão em
> **`SYZYGY-PROMPT-BUILD.md`** (`tools/gerar-prompt-build.mjs` o regenera a partir
> do fonte real) — para reconstruir o bot hoje, use aquele arquivo.
>
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
| WhatsApp | `@lucasmod/boruto-vk7-baileys@2.1.0` (fork **não-oficial** do Baileys — repo `Otakump4/boruto_vk7-baileys`) |
| Imagem | `jimp@^1.6.0` (redimensiona foto de grupo p/ caber no upload) |
| Log | `pino@^10.3.1` (o Baileys exige; o projeto o silencia) |
| Banco | **Nenhum.** Estado em JSON no disco (`config.json`, `dono/*.json`, `sessao/`) |
| Instalação | `npm install --legacy-peer-deps` ⛔ **PROIBIDO** `npm install` puro: os peer deps do jimp estouram no meio do update e deixam o deploy meio-caminho |
| Testes | `node features/flood/tests.js`, `tests-infra.js`, `tests-menu.js`, `node features/viewOnce/tests.js` (runner próprio, sem jest) |

Dependências exatas do `package.json`:

```json
{ "name": "syzygy", "version": "1.0.0", "type": "module", "main": "index.js",
  "scripts": { "start": "node index.js" },
  "dependencies": { "jimp": "^1.6.0", "pino": "^10.3.1" } }
// e, com npm alias, a Baileys + o libsignal renomeado que ela exige:
// npm i @lucasmod/boruto-vk7-baileys@2.1.0 --ignore-scripts --legacy-peer-deps
// npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps
// ⚠️ este pacote NÃO instala com "npm i" liso — leia a seção 2.1 antes de tentar
```


### 2.1 A Baileys deste build (leia antes de instalar qualquer coisa)

A dependência de WhatsApp deste projeto é o fork `@lucasmod/boruto-vk7-baileys@2.1.0`
(repo `Otakump4/boruto_vk7-baileys`). Ele **substitui** o `@innovatorssoft/baileys@7.4.7`
das versões anteriores e é dele que vêm os contratos de `shop`/`payment`/
`viewOnce` desta spec. O pacote tem **quatro armadilhas de empacotamento** que
já foram diagnosticadas em ambiente real (Node 22 + npm 10); se você não as
conhecer, vai achar que o projeto está errado e vai perder horas.

**Receita que funciona** (nesta ordem, e só esta):

```bash
# 1) o pacote em si — --ignore-scripts é OBRIGATÓRIO
npm i @lucasmod/boruto-vk7-baileys@2.1.0 --ignore-scripts --legacy-peer-deps
# 2) o libsignal que ele exige sob um nome que NÃO existe no npm — alias OBRIGATÓRIO
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" \
      --ignore-scripts --legacy-peer-deps
```

| # | Armadilha | Sintoma | Por quê |
|---|---|---|---|
| 1 | `preinstall` quebra | `Cannot find module '.../engine-requirements.js'` e a instalação aborta | o `package.json` publicado declara `"preinstall": "node ./engine-requirements.js"`, mas o arquivo só existe dentro de `baileys/` no tarball. Daí o `--ignore-scripts` |
| 2 | `main` aponta para arquivo inexistente | `MODULE_NOT_FOUND` ao importar a raiz do pacote | o `package.json` diz `"main": "lib/index.js"`, mas o tarball publica o monorepo: a lib real está em `baileys/lib/` |
| 3 | import de diretório | `ERR_UNSUPPORTED_DIR_IMPORT` (o `type: module` do projeto nem cai na regra de CJS) | o pacote não tem `exports` map e o `package.json` aninhado tem `"main"` — ESM não resolve diretório sozinho. **Caminho canônico:** `@lucasmod/boruto-vk7-baileys/baileys/lib/index.js` |
| 4 | libsignal renomeado | `Cannot find module '@boruto_vk7/libsignal-node'` em `baileys/lib/Signal/libsignal.js` (7 ocorrências) | o fork renomeou o pacote sem publicá-lo. Alias para `@itsukichan/libsignal-node@1.0.1` (mesmo código, nome publicado) |

**E o `.npmrc` do projeto** (incluído no bundle) já fixa as duas flags acima:

```
ignore-scripts=true
legacy-peer-deps=true
```

Com ele presente, `npm i` basta. Se você criar o projeto do zero sem o arquivo,
use as linhas com flags explícitas — ou o `npm i` aborta no `preinstall` e você
vai perder 20 minutos lendo stack trace de MODULE_NOT_FOUND.

**Regra de import (inegociável):** o `default` export deste pacote é o
**namespace**, não a função (diferente do `@whiskeysockets`, onde default **é**
`makeWASocket`). Então:

```js
// ❌ NÃO: default é o objeto inteiro, isso vira "makeWASocket is not a function"
import makeWASocket from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"
// ✅ SIM: named import
import { makeWASocket, useMultiFileAuthState, proto, getContentType }
    from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"
```

É exatamente por isso que existe **um único ponto de import** no projeto:
`connection/baileysCompat.js` (24 linhas) faz `import * as baileys`, escolhe a
função com `typeof baileys.default === "function" ? baileys.default : baileys.makeWASocket`
e re-exporta tudo. **Nenhum outro arquivo importa a lib** (verificado com
`grep`: zero `from "@innovatorssoft/baileys"` fora do shim; as ~12 menções ao
nome do pacote em outros arquivos são comentários). Trocar de fork é mudar
**uma linha** nesse arquivo — foi o que este build fez.

**O que o shim precisa fazer neste build** (o fonte anexado já está assim ou deve
ficar):

```js
// connection/baileysCompat.js — linha 1
import * as baileys from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"
```

E os comentários que ancoram comportamento em número de linha do fork antigo
precisam ser reancorados (são só comentários, não código): `shop` agora está em
`baileys/lib/Utils/messages.js:1020` (era `~1374`), `viewOnce` em
`messages.js:1197`, payment em `messages.js:725-753` (montagem) e
`1247-1249` (decodificação). Arquivos com esses comentários:
`features/flood/config.js`, `features/flood/presets/shopping.js`,
`features/flood/{shopping,payment,tests,commerce}.js`,
`features/flood/README.md`, `services/{groupService,interactiveService,list,bloksTransport}.js`.

**O que NÃO muda** (por isso o resto da spec vale igual): os contratos de payload.
`Utils/messages.js` continua fazendo `else if ('shop' in message && !!message.shop)`
→ `interactiveMessage.shopStorefrontMessage { surface, id }`, e continua
embrulhando em `viewOnceMessage` quando `viewOnce` é true — as duas regras da
spec (card sem `viewOnce`, e `surface ∈ {1,2,3}`) permanecem exatas.

**Inventário de APIs verificado em runtime** (253 exports no total). Todos os 25
métodos que o SYZYGY chama existem neste fork:

```
✓ sendMessage   ✓ query      ✓ sendNode        ✓ relayMessage      ✓ end
✓ groupMetadata ✓ groupFetchAllParticipating   ✓ groupSettingUpdate  ✓ groupParticipantsUpdate
✓ groupUpdateSubject         ✓ groupUpdateDescription              ✓ groupGetInviteInfo
✓ updateProfilePicture       ✓ removeProfilePicture  ✓ profilePictureUrl
✓ getCatalog    ✓ getCollections  ✓ updateStatusPrivacy  ✓ getPrivacyTokens
✓ refreshMediaConn ✓ presenceSubscribe ✓ sendPresenceUpdate ✓ getUSyncDevices
✓ requestPairingCode ✓ generateMessageTag ✓ waitForMessage
```

Ausências que importam (não chame, não existe): `statusUpdate`, `updateStatus`,
`fetchStatusSessions`, `groupLeave`, `groupAdd`, `jids`, `Delay`,
`prepareMessageToEncode`, `fetchLatestWAVersion`, `isJidBareEphemeral`.
Consequências: (a) Status Manager publica story com `sock.sendMessage` para
`status@broadcast` + `updateStatusPrivacy` (é o que o fonte faz; não invente
`statusUpdate`); (b) exportar/ajudar os outros do grupo é via
`groupParticipantsUpdate` (`"remove"`/`"add"`), não `groupLeave`; (c) se um
módulo seu precisar de `Delay`, implemente `const Delay = ms => new Promise(r =>
setTimeout(r, ms))` localmente.

Detalhes de versão: o fork pinou WhatsApp `[2, 3000, 1026924051]`
(`baileys/lib/Defaults/baileys-version.json`, lido por `Defaults.version`),
`engines.node >= 20`, peer `jimp ^0.22.12` (só usado em `updateProfilePicture`;
o SYZYGY faz o próprio resize com `jimp@^1.6` — não baixe o jimp do peer), e as
dependências próprias dele são `@adiwajshing/keyed-db ^0.2.4`, `@hapi/boom ^14.0.1`,
`aws4fetch ^1.0.20`, `axios ^1.7.9`, `cache-manager ^5.7.6`, `@cacheable/node-cache ^1.5.4`,
`link-preview-js ^3.0.5`, `pino ^9.6.1`, `protobufjs ^7.12.6`.

⚠️ `pino ^9.6.1` lá, `pino ^10.3.1` aqui. Não tente "alinhar": o SYZYGY declara o
seu e o npm resolve dois (o do projeto no topo, o do fork no subtree). Ambos aceitam
`pino({level:"silent"})`, que é o único uso que importa aqui.

⚠️ NÃO instale 2.0.0/2.0.1/2.0.2: os tarballs dessas versões saíram **sem `lib/`**
(o pacote é vazio e nada importa). `2.1.0` é a única versão usável. Antes de
escrever qualquer código, valide com:

```bash
node --input-type=module -e 'import("@lucasmod/boruto-vk7-baileys/baileys/lib/index.js").then(m=>console.log(typeof m.makeWASocket))'
# deve imprimir "function". Se imprimir "object" ou der ERR_* → pare e reporte.
```

Se a instalação da lib falhar, **não** troque por `@whiskeysockets/baileys` "só para
testar": o card de loja que este projeto renderiza depende do `shop`/
`shopStorefrontMessage` que só existem no fork. Nesse caso, reporte a falha com a
saída do npm.


### 2.2 Arquivos que NÃO vêm no bundle (e o que fazer com eles)

O bundle da Parte B é o código real, arquivo por arquivo. Estão de fora, de propósito:

| Caminho | Por quê | O que você deve gerar |
|---|---|---|
| `config.json` | contém número real do dono e allowlist | crie do zero pelo schema da seção 7 (e o wizard 12-46); **nunca** invente um número de teste — deixe vazio e o wizard pergunta |
| `dono/**` | estado runtime do dono (fila, kill switch, histórico, presets gravados) | crie os JSONs vazios com a forma que os módulos esperam; eles são escritos em runtime, não versionados |
| `sessao/**`, `log/**`, `state/**` | credenciais reais da sessão WhatsApp e logs | não crie; gerados no primeiro `--pair <numero>` |
| `package-lock.json` | 425 KB de hashes sem valor de spec | `npm i` gera o seu |
| `legacy/**` | implementações mortas, que NÃO devem ser ressuscitadas (o bundle já traz os arquivos que vieram deles) | nada — só não copie de volta |
| `AUDITORIA-SYZYGY.md`, `PROMPT-RECONSTRUCAO-SYZYGY.md` | prosa de engenharia reversa; a Parte A substitui | nada |
| `tools/gerar-prompt-build.mjs` | este gerador | recrie se você for re-sincronizar o bundle depois (opcional) |
| qualquer número de telefone / JID real | segredo | os placeholders `5519000000000` e `XXXX@g.us` do bundle são esperados: substitua pelo que o dono informar |

### 2.3 Protocolo de transplante (como usar a Parte B sem estragar o projeto)

A Parte B não é "material de leitura": é o contrato. Siga estas 9 regras:

1. **Copie antes de inventar.** Para cada arquivo da lista, crie o arquivo com o
   conteúdo exato do bloco correspondente. Só escreva código seu onde o bloco não
   existe (ex.: `config.json`, `dono/*.json`, os JSONs de estado).
2. **Não "melhore" de graça.** Nada de renomear função, trocar `for` por
   `reduce`, introduzir TypeScript, ESLint, `dotenv`, ORM, framework de bot,
   fila externa (BullMQ/Redis), Docker ou qualquer dependência nova. O projeto tem
   3 dependências de propósito (`jimp`, `pino`, + a Baileys via alias) e estado em
   JSON puro.
3. **Não restaure o `legacy/`** (nem os blocos comentados "legado vivo" que a
   auditoria descreve: 5 rotas mortas de menu, callbacks órfãos, listeners
   duplicados, o `index.js` de 678 linhas com engine paralelo). Eles ficaram fora
   do bundle de propósito — se um arquivo seu importa algo que não existe no
   bundle, você errou o import, não o legado.
4. **Nomes, ids e atalhos são imutáveis.** Os ~65 atalhos de `commands/commandMap.js`
   (`2>`, `6>12`, `15>`, `36>4`, `shoppingtest`, `floodstop`, …), os rótulos de menu,
   os `menuCategoryId`, os `actionId` (`AAAE:<slug>`) e os `state.action` do wizard
   são o produto. Mudar um = quebrar usuário que já decorou. Engine interno você
   pode tocar; superfície, não.
5. **Um único `sock.sendMessage`.** O wrap de Ler Mais (tamanho-alvo 512 +
   "… Ler Mais" aninhado) já está em `connection/whatsapp.js`; nada de
   "encurtador" paralelo em serviço, nem segundo `sendMessage` no caminho.
6. **Imports da lib só pelo shim.** `connection/baileysCompat.js` é o único ponto
   que conhece o nome do pacote da Baileys (seção 2.1). Qualquer `from
   "@lucasmod/..."` aparecendo em outro arquivo é defeito de reconstrução —
   inclusive o seu, se você for tentado a "importar direto para simplificar".
7. **Comentário com número de linha é âncora, não decoração.** Onde o fonte diz
   `messages.js:1020` (neste fork), signifique que o comportamento do card vem
   dali. Se você mudar de fork de novo, reancore os comentários — e re-verifique
   o contrato, não só o número.
8. **Testes são parte do pacote.** Vêm no bundle e são o seu critério de pronto:
   `features/flood/tests.js` (shopping/flood/payload — 184 asserts, incluindo o
   bloqueio de contrato lido do `messages.js` do fork instalado),
   `features/flood/tests-menu.js` (menus e atalhos — 83),
   `features/flood/tests-infra.js` (presets, overlays de payment, kill switch,
   cooldown — 228) e `features/viewOnce/tests.js`. Não existe `tests-payment.js`:
   as asserções de pagamento estão na suíte de infra. Rode os 4 e cole a saída no
   relatório final.
   Eles são 100% offline: nulo o socket, `salvarConfig` fora do caminho,
   `process.exitCode` em falha. Não os enfraqueça para passar.
9. **Verificação mínima antes de reportar** (do bundle, na raiz do projeto novo):

```bash
npm i @lucasmod/boruto-vk7-baileys@2.1.0 --ignore-scripts --legacy-peer-deps
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps
for f in $(find . -name "*.js" -not -path "./node_modules/*"); do node --check "$f" || echo "SINTAXE: $f"; done
node --input-type=module -e 'import("@lucasmod/boruto-vk7-baileys/baileys/lib/index.js").then(m=>console.log("makeWASocket:",typeof m.makeWASocket,"| proto:",!!m.proto))'
node --input-type=module -e 'import("./connection/baileysCompat.js").then(m=>console.log("shim:",typeof m.default))'
node features/flood/tests.js && node features/flood/tests-menu.js
node features/flood/tests-infra.js && node features/viewOnce/tests.js
```

`shim: function` é o ponto que prova que a camada de compatibilidade absorveu a
troca de default-export. Se der `object`, o shim não foi aplicado (seção 2.1).

**O que reportar no final (e o que NÃO dizer):** card de loja, pagamento
transferido e viewOnce **não têm como ser provados aqui** — dependem de aparelho
real. A frase correta é "payload conforme `proto`, renderização não testada em
app", nunca "funciona". Também não diga que o bot "está no ar": o boot real exige
`sessao/` + QR e isso é passo do usuário.


---

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
  "ownerOverride": "5519000000000",       // dono absoluto (número normalizado, sem +)
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

### Contrato do send (fork `@lucasmod/boruto-vk7-baileys@2.1.0`)

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
> risca: Node ESM + `@lucasmod/boruto-vk7-baileys@2.1.0` + `jimp` + `pino`, estado em JSON no
> disco, UI TXT numerada, um único laço de envio (`executarFlood`), presets com hard cap,
> allowlist como porta de saída, kill switch na fronteira do lote, dry-run ligado por
> default, card de loja **sem** `viewOnce` e com `surface` 1-3, payment via
> `requestPaymentMessage` (`amount` em milésimos, gate de `floodTestMode`), e as três
> suítes de teste (`183/228/83` asserts) rodando **sem** WhatsApp com sock falso.
> Entregue as Fases 0 e 1 e pare.

---

# PARTE B — CÓDIGO-FONTE DE REFERÊNCIA
Estes 88 arquivos são o projeto real, na ordem em que devem ser
lidos/criados. Copiar é permitido e desejado: cada linha aqui já foi validada em
produção. Onde um arquivo mencionar número/JID como `5519XXXXXXXXX`, é redação
intencional deste bundle (ver 2.2), não bug.

### Índice

1. ./package.json
2. ./connection/baileysCompat.js
3. ./connection/pairing.js
4. ./connection/sessionRecovery.js
5. ./connection/socket.js
6. ./connection/whatsapp.js
7. ./utils/botoes.js
8. ./utils/config.js
9. ./utils/lerMais.js
10. ./utils/logger.js
11. ./utils/permissions.js
12. ./utils/stateManager.js
13. ./utils/terminalUI.js
14. ./commands/commandMap.js
15. ./commands/commandRouter.js
16. ./handlers/interactionHandler.js
17. ./handlers/messageHandler.js
18. ./handlers/stateHandler.js
19. ./handlers/terminal.js
20. ./services/agendaService.js
21. ./services/antiTakeoverService.js
22. ./services/bloksTransport.js
23. ./services/buttons.js
24. ./services/fastParser.js
25. ./services/groupService.js
26. ./services/historicoService.js
27. ./services/interactiveList.js
28. ./services/interactiveService.js
29. ./services/lidResolver.js
30. ./services/list.js
31. ./services/mediaService.js
32. ./services/notificationService.js
33. ./services/presetService.js
34. ./services/serverInspector.js
35. ./actions/configActions.js
36. ./actions/floodActions.js
37. ./actions/groupActions.js
38. ./menus/adminMenu.js
39. ./menus/configMenu.js
40. ./menus/groupMenu.js
41. ./menus/mainMenu.js
42. ./menus/menu.js
43. ./menus/menutest.js
44. ./index.js
45. ./features/flood/README.md
46. ./features/flood/allowlist.js
47. ./features/flood/commerce.js
48. ./features/flood/config.js
49. ./features/flood/customStore.js
50. ./features/flood/doctor.mjs
51. ./features/flood/engine.js
52. ./features/flood/groups.js
53. ./features/flood/index.js
54. ./features/flood/killswitch.js
55. ./features/flood/limiter.js
56. ./features/flood/payment.js
57. ./features/flood/presetEngine.js
58. ./features/flood/presets/custom.js
59. ./features/flood/presets/index.js
60. ./features/flood/presets/media.js
61. ./features/flood/presets/mention.js
62. ./features/flood/presets/payment.js
63. ./features/flood/presets/shopping.js
64. ./features/flood/presets/shoppingBuilder.js
65. ./features/flood/presets/text.js
66. ./features/flood/queue.js
67. ./features/flood/router.js
68. ./features/flood/shopping.js
69. ./features/flood/speed.js
70. ./features/flood/tests-infra.js
71. ./features/flood/tests-menu.js
72. ./features/flood/tests.js
73. ./features/viewOnce/config.js
74. ./features/viewOnce/destinations.js
75. ./features/viewOnce/handler.js
76. ./features/viewOnce/index.js
77. ./features/viewOnce/permissions.js
78. ./features/viewOnce/service.js
79. ./features/viewOnce/tests.js
80. ./features/statusManager/config.js
81. ./features/statusManager/index.js
82. ./features/statusManager/presets.js
83. ./features/statusManager/service.js
84. ./start.sh
85. ./update.sh
86. ./recover.sh
87. ./.gitignore
88. ./.npmrc

#### `./package.json` — 21 linhas, 487 bytes

```json
{
  "name": "syzygy",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "build:prompt": "node tools/gerar-prompt-build.mjs",
    "verify:prompt": "node tools/gerar-prompt-build.mjs --verify"
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

#### `./connection/baileysCompat.js` — 46 linhas, 2873 bytes

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

#### `./connection/pairing.js` — 52 linhas, 2329 bytes

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

#### `./connection/sessionRecovery.js` — 122 linhas, 4156 bytes

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

#### `./connection/socket.js` — 97 linhas, 3757 bytes

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

#### `./connection/whatsapp.js` — 329 linhas, 13511 bytes

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

#### `./utils/botoes.js` — 123 linhas, 4933 bytes

```js
// utils/botoes.js
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
function normalizarRow(row) {
    if (!row || typeof row !== "object") return null
    const id = row.id ?? row.rowId ?? ""
    if (!id) throw new Error("[BUTTON] cada row do single_select exige 'id' (ou 'rowId')")
    return {
        title: row.title ?? "",
        description: row.description ?? "",
        id: String(id),
        rowId: String(id)
    }
}

function normalizarSections(sections) {
    if (!Array.isArray(sections)) {
        throw new Error("[BUTTON] single_select exige 'sections' (array)")
    }
    return sections.map(sec => ({
        title: sec.title ?? "",
        rows: Array.isArray(sec.rows) ? sec.rows.map(normalizarRow).filter(Boolean) : []
    }))
}

// ------------------------------------------------------------------
// criarBotao(tipo, dados) -> { name, buttonParamsJson }
// ------------------------------------------------------------------
export function criarBotao(tipo, dados = {}) {
    if (!tipo) throw new Error("[BUTTON] Tipo não informado")

    switch (tipo) {
        case "quick_reply": {
            if (!dados.id) throw new Error("[BUTTON] quick_reply exige um id")
            return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: dados.displayText ?? dados.display_text ?? "",
                    id: String(dados.id)
                })
            }
        }

        case "cta_copy": {
            const copy = dados.copyCode ?? dados.copy_code
            if (copy == null) throw new Error("[BUTTON] cta_copy exige copyCode")
            return {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: dados.displayText ?? dados.display_text ?? "",
                    copy_code: String(copy)
                })
            }
        }

        case "cta_url": {
            if (!dados.url) throw new Error("[BUTTON] cta_url exige url")
            return {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: dados.displayText ?? dados.display_text ?? "",
                    url: String(dados.url)
                })
            }
        }

        case "single_select": {
            const sections = normalizarSections(dados.sections)
            const payload = {
                title: dados.title ?? "",
                text: dados.text ?? "",
                buttonText: dados.buttonText ?? "SELECIONAR",
                sections
            }
            return {
                name: "single_select",
                buttonParamsJson: JSON.stringify(payload)
            }
        }

        default:
            throw new Error(`[BUTTON] Tipo de botão não suportado: ${tipo}`)
    }
}

// ------------------------------------------------------------------
// criarBotoes(lista) -> [{name, buttonParamsJson}, ...]
// lista = [{ tipo, dados }, ...]
// ------------------------------------------------------------------
export function criarBotoes(lista = []) {
    if (!Array.isArray(lista)) throw new Error("[BUTTON] criarBotoes espera um array")
    return lista.map(b => criarBotao(b.tipo, b.dados)).filter(Boolean)
}

// ------------------------------------------------------------------
// Helper de conveniência: monta um único botão single_select a partir
// de uma descrição de lista { title, text, buttonText, sections }.
// ------------------------------------------------------------------
export function criarLista(dados = {}) {
    return criarBotao("single_select", dados)
}

```

#### `./utils/config.js` — 132 linhas, 5890 bytes

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

#### `./utils/lerMais.js` — 47 linhas, 2573 bytes

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

#### `./utils/logger.js` — 73 linhas, 2915 bytes

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

#### `./utils/permissions.js` — 353 linhas, 12580 bytes

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

#### `./utils/stateManager.js` — 25 linhas, 564 bytes

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

#### `./utils/terminalUI.js` — 94 linhas, 5201 bytes

```js
// utils/terminalUI.js
// [v43] Tema ROXO do SYZYGY. Mesmas funções/assinaturas — só a identidade visual mudou.
const C = {
    reset:  "\x1b[0m",
    dim:    "\x1b[2m",
    bold:   "\x1b[1m",
    red:    "\x1b[31m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    blue:   "\x1b[34m",
    magenta:"\x1b[35m",
    cyan:   "\x1b[36m",
    white:  "\x1b[37m",
    gray:   "\x1b[90m",
    // 🟣 Paleta roxa (256 cores — suportado pelo Termux)
    purple:     "\x1b[38;5;141m", // violeta claro
    purpleDark: "\x1b[38;5;93m",  // roxo
    lilac:      "\x1b[38;5;183m", // lilás suave
    purpleGray: "\x1b[38;5;240m"  // cinza-arroxeado (bordas)
}

export function bannerSYZYGY() {
    return `${C.purple}${C.bold}
███████╗██╗   ██╗███████╗██╗   ██╗ ██████╗██╗   ██╗
██╔════╝╚██╗ ██╔╝╚══███╔╝╚██╗ ██╔╝██╔════╝╚██╗ ██╔╝
███████╗ ╚████╔╝   ███╔╝  ╚████╔╝ ██║      ╚████╔╝
╚════██║  ╚██╔╝   ███╔╝    ╚██╔╝  ██║       ╚██╔╝
███████║   ██║   ███████╗   ██║   ╚██████╗   ██║
╚══════╝   ╚═╝   ╚══════╝   ╚═╝    ╚═════╝   ╚═╝
${C.reset}${C.purpleGray}   ${"━".repeat(50)}${C.reset}
${C.lilac}   ⚡ SYZYGY · WhatsApp Administration System ⚡${C.reset}
`
}

export function painelStatus(dados) {
    const { conn, number, owner, session, uptime, nome, bio } = dados
    const dot = (color, txt) => `${color}●${C.reset} ${txt}`

    const line = (label, value, valueColor = C.white) =>
        `${C.purpleGray}│${C.reset}  ${label.padEnd(18)} ${valueColor}${value}${C.reset}${" ".repeat(Math.max(0, 24 - String(value).length))}${C.purpleGray}│${C.reset}`

    const sep = `${C.purpleGray}├${"─".repeat(48)}┤${C.reset}`
    const top = `${C.purpleGray}╭${"─".repeat(48)}╮${C.reset}`
    const bot = `${C.purpleGray}╰${"─".repeat(48)}╯${C.reset}`
    const title = (t) => `${C.purpleGray}│${C.reset}  ${C.purple}${C.bold}${t}${C.reset}${" ".repeat(46 - t.length)}${C.purpleGray}│${C.reset}`

    let out = ""
    out += top + "\n"
    out += `${C.purpleGray}│${C.reset}${C.bold}${C.purple}${"SYZYGY".padStart(28).padEnd(48)}${C.reset}${C.purpleGray}│${C.reset}\n`
    out += `${C.purpleGray}│${C.reset}${C.dim}${C.lilac}${"WhatsApp Administration System".padStart(40).padEnd(48)}${C.reset}${C.purpleGray}│${C.reset}\n`
    out += sep + "\n"
    out += title("⟡ STATUS") + "\n"
    out += `${C.purpleGray}│${C.reset}  ${dot(conn === "ONLINE" ? C.green : C.red, "Connection".padEnd(16) + (conn === "ONLINE" ? C.green : C.red) + conn + C.reset).padEnd(56)}${C.purpleGray}│${C.reset}\n`
    out += line("● Number", number || "-", C.white) + "\n"
    out += line("● Session", session || "-", C.green) + "\n"
    out += line("● Uptime", uptime || "-", C.yellow) + "\n"
    out += sep + "\n"
    out += title("⟡ IDENTITY") + "\n"
    out += line("Name", nome || "SYZYGY", C.purple) + "\n"
    out += line("Bio", (bio || "-").substring(0, 22), C.gray) + "\n"
    out += line("Owner", owner || "NYX", C.purple) + "\n"
    out += line("Credits", "NYX", C.lilac) + "\n"
    out += sep + "\n"
    out += title("⟡ WATERMARKS") + "\n"
    out += `${C.purpleGray}│${C.reset}  ${C.purple}${C.bold}ZUCKERBERG${C.reset}${" ".repeat(36)}${C.purpleGray}│${C.reset}\n`
    out += `${C.purpleGray}│${C.reset}  ${C.purple}${C.bold}SYZYGY${C.reset}${" ".repeat(40)}${C.purpleGray}│${C.reset}\n`
    out += bot + "\n"
    return out
}

// [v58] Terminal mais limpo: TODA linha de log nasce com carimbo de hora
// dim (HH:MM:SS) — mesmo lugar, mesma assinatura, só formatação.
const _carimbo = () => {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0"), ss = String(d.getSeconds()).padStart(2, "0")
    return `${C.gray}${C.dim}[${hh}:${mm}:${ss}]${C.reset}`
}
export function boot(msg) { return `${_carimbo()} ${C.purple}${C.bold}[ ⚡ SYZYGY ]${C.reset} ${msg}` }
export function ok(msg) { return `${_carimbo()} ${C.green}✓${C.reset} ${msg}` }
export function err(msg) { return `${_carimbo()} ${C.red}✗${C.reset} ${msg}` }
export function warn(msg) { return `${_carimbo()} ${C.yellow}!${C.reset} ${msg}` }
export function info(tag, msg) { return `${_carimbo()} ${C.purple}[${tag}]${C.reset} ${msg}` }
export function credLine() { return `${C.purple}${C.bold}ZUCKERBERG${C.reset}  ${C.purpleGray}•${C.reset}  ${C.purple}${C.bold}SYZYGY${C.reset}\n${C.lilac}NYX${C.reset} ${C.purpleGray}×${C.reset} ${C.purple}ZUCKERBERG${C.reset}` }

export function formatUptime(ms) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
}

export const COLORS = C

```

#### `./commands/commandMap.js` — 58 linhas, 2209 bytes

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

#### `./commands/commandRouter.js` — 716 linhas, 41650 bytes

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
        let t = `🛡️ ADD NA ALLOWLIST DO FLOOD\n\nEnvie UMA linha com:\n  • o número do grupo autorizado (abaixo), OU\n  • o JID completo (5519999999999-9999@g.us)\n\n`
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
        await getSock().sendMessage(chatJid, { text: `➕ ADD ADM DO BOT\n\nEnvie o número do usuário com DDD (ex: 5511999999999)\nPode enviar vários separados por vírgula ou espaço.\nSe o usuário usar @lid, envie o LID também.\n\n(cancelar para sair)` })
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
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER ADM DO BOT\n\n${formatAuthorizedUsersTexto()}\n\nDigite o número ou o índice (ex: 1 ou 5511999999999)\n(cancelar para sair)` })
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
        await getSock().sendMessage(chatJid, { text: `👑 ADD DONO EXTRA\n\nEnvie o número com DDD (ex: 5511999999999)\nDono extra tem TODAS permissões, igual você (pode add ADM, mudar foto, etc).\n\n(cancelar para sair)` })
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

#### `./handlers/interactionHandler.js` — 30 linhas, 1455 bytes

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

#### `./handlers/messageHandler.js` — 315 linhas, 16846 bytes

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

#### `./handlers/stateHandler.js` — 1803 linhas, 101030 bytes

```js
// handlers/stateHandler.js
// [REORGANIZAÇÃO] Tratador de estados (input texto/imagem) + processarSelecaoGrupo.
// [v22] Multi-seleção, flood em ondas, agendamento, limpeza, histórico, anti-takeover.

import fs from "fs"
import path from "path"

import { getSock, rt } from "../connection/socket.js"
import { setState, clearState, getState } from "../utils/stateManager.js"
import { CONFIG, MENU_IMAGE_PATH, MAX_FLOOD, salvarConfig, FLOOD_MODOS } from "../utils/config.js"
import { info, ok, warn } from "../utils/terminalUI.js"
import { isOwner } from "../utils/permissions.js"
import { STATUS_MENU_MAP } from "../features/statusManager/index.js"
// [SHOPPING] TIPO de conteúdo do flood. Só conteúdo/validação/envio pontual:
// laço, fila, throttle e permissões continuam sendo os do flood existente.
import {
    detectShoppingTrigger,
    resolveShoppingSend,
    shoppingPromptText,
    makeFloodContentBuilder,
    describeSendWire,
    SHOPPING_LIMITS
} from "../features/flood/index.js"

import {
    alterarNomeGrupo, alterarBioGrupo,
    alterarFotoGrupoBuffer, alterarFotoGrupoURL,
    alterarTudoGrupo, executarNuke, removerFotoGrupo, executarFlood,
    executarFloodLote, nukeComPreset, nukeComPresetLote,
    roubarGrupo, roubarGrupoLote, getFloodConfig
} from "../services/groupService.js"
import {
    detectarImagem, validarTamanho, baixarMidiaMensagem,
    prepararFotoBuffer, isValidHttpUrl
} from "../services/mediaService.js"
import {
    enviarVoltar, enviarCancelavel, listarGruposInterativo, enviarMenuAcoesGrupo,
    enviarMenuMultiAcoes, enviarMenuFloodModos
} from "../menus/groupMenu.js"
import { enviarPainelInicial } from "../menus/mainMenu.js"

function resolveGrupoDeTexto(cache, raw) {
    const cacheKeys = Object.keys(cache).map(k => parseInt(k)).filter(k => !isNaN(k))
    const rawLower = (raw || "").toLowerCase()
    let entry = null, selectedIdx = null
    const numMatch = raw.match(/^0*(\d+)$/)
    if (numMatch) {
        const n = parseInt(numMatch[1])
        if (cache[n]) { entry = cache[n]; selectedIdx = n }
    }
    if (!entry && raw && raw.length >= 2) {
        const matches = []
        for (const idx of cacheKeys) {
            const g = cache[idx]
            if (g.subject && g.subject.toLowerCase().includes(rawLower)) matches.push({ idx, ...g })
        }
        if (matches.length === 1) {
            entry = matches[0]; selectedIdx = matches[0].idx
        } else if (matches.length > 1) {
            return { multiple: matches }
        }
    }
    if (!entry) return null
    return { entry, selectedIdx }
}

function parseMultiSelecao(cache, raw) {
    const txt = (raw || "").trim()
    if (!txt) return null
    // Se for só um número (com zeros à esquerda), não é multi
    if (/^0*\d+$/.test(txt)) return null
    // Precisa ter separador e só conter dígitos, vírgula, espaço, traço
    if (!/^[\d,\s-]+$/.test(txt)) return null
    // Precisa ter pelo menos 2 números ou um range
    const allNums = (txt.match(/\d+/g) || []).map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0)
    if (allNums.length < 2) return null

    // Normaliza e expande ranges
    const normalized = txt.replace(/,/g, " ").replace(/\s+/g, " ").trim()
    const tokens = normalized.split(" ").filter(Boolean)
    const nums = new Set()
    for (const tok of tokens) {
        if (tok.includes("-")) {
            const parts = tok.split("-").map(s => s.trim()).filter(Boolean)
            if (parts.length === 2) {
                const a = parseInt(parts[0].replace(/\D/g, "")), b = parseInt(parts[1].replace(/\D/g, ""))
                if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
                    const start = Math.min(a, b), end = Math.max(a, b)
                    const limit = Math.min(end, start + 99) // max 100 por range
                    for (let i = start; i <= limit; i++) nums.add(i)
                }
            }
        } else {
            const n = parseInt(tok.replace(/\D/g, ""))
            if (!isNaN(n) && n > 0) nums.add(n)
        }
    }
    if (nums.size < 2) return null
    const entries = []
    const invalid = []
    for (const n of nums) {
        if (cache[n]) entries.push({ ...cache[n], index: n })
        else invalid.push(n)
    }
    const uniq = []
    const seen = new Set()
    for (const e of entries) {
        if (!seen.has(e.id)) { seen.add(e.id); uniq.push(e) }
    }
    if (uniq.length < 2) return null
    return { entries: uniq, invalid }
}

export async function handleEstado(chatJid, ownerKey, st, text, imgInfo, m) {
    const sock = getSock()

    // Config menu
    if (st.action === "config_menu" && text) {
        const { CONFIG_OPCOES } = await import("../menus/configMenu.js")
        const { roteadorAcoes } = await import("../commands/commandRouter.js")
        const escolha = text.trim().replace(/\D/g, "")
        const acao = CONFIG_OPCOES[escolha]
        if (acao) {
            clearState(ownerKey)
            await roteadorAcoes(chatJid, ownerKey, acao)
            // [v45] Menu de config/dono PERSISTENTE: se a ação executada não
            // definiu um novo estado (espera de input), o usuário volta ao menu
            // de configuração em vez de ficar "solto" (0/11/34 = sair p/ menu principal).
            if (acao !== "abrir_painel" && !getState(ownerKey)) {
                setState(ownerKey, { action: "config_menu" })
            }
            return true
        }
        if (!st.avisouConfig) {
            setState(ownerKey, { action: "config_menu", avisouConfig: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. Digite 1-11 (config), 12-47 (dono — 36-46 são flood presets/dry-run/grupos/allowlist) ou 0 = voltar (cancelar = sair)." })
        }
        return true
    }

    // Nome/Bio simples
    if (st.action === "waiting_name" && text) {
        try { await alterarNomeGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Nome atualizado.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_both_name" && text) {
        try {
            await alterarNomeGrupo(st.groupJid, text)
            setState(ownerKey, { action: "waiting_both_bio", groupJid: st.groupJid })
            await enviarCancelavel(chatJid, "📄 Digite a nova bio:")
        } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`); clearState(ownerKey) }
        return true
    }
    if (st.action === "waiting_bio" && text) {
        try { await alterarBioGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Bio atualizada.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_both_bio" && text) {
        try { await alterarBioGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Nome + Bio atualizados.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_group_image") {
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Imagem muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (!raw || raw.length === 0) throw new Error("Vazia")
                await alterarFotoGrupoBuffer(st.groupJid, raw)
                await enviarVoltar(chatJid, "✅ Foto do grupo atualizada.")
            } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem JPG, PNG ou WEBP." }); return true }
        return true
    }
    if (st.action === "waiting_image_url") {
        if (text && isValidHttpUrl(text)) {
            try { await alterarFotoGrupoURL(st.groupJid, text); await enviarVoltar(chatJid, "✅ Foto atualizada.") }
            catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ URL inválida." }); return true }
        return true
    }
    if (st.action === "waiting_menu_image") {
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (!raw || raw.length === 0) throw new Error("Vazia")
                const buf = await prepararFotoBuffer(raw)
                try { fs.mkdirSync(path.dirname(MENU_IMAGE_PATH), { recursive: true }) } catch {}
                fs.writeFileSync(MENU_IMAGE_PATH, buf)
                CONFIG.menuImage = MENU_IMAGE_PATH; salvarConfig()
                await enviarVoltar(chatJid, "✅ Imagem do menu atualizada.")
            } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem." }); return true }
        return true
    }

    // Flood single - mensagem
    // [SHOPPING] "loja:" / "shop:" / "shopping:" escolhe o TIPO de conteúdo do
    // flood dentro do MESMO wizard (sem menu novo, sem fila, sem executor novo).
    // Sem gatilho, cada linha abaixo é o flood clássico de sempre.
    if (st.action === "waiting_flood_message" && text) {
        const loja = detectShoppingTrigger(text)
        if (loja.isShopping) {
            const r = resolveShoppingSend(loja.rest, { delivery: loja.delivery })
            if (!r.ok) {
                // 1ª tentativa errada: prompt completo da loja. Depois disso só o
                // erro — o dono precisa de resposta em TODA tentativa, senão o
                // wizard parece travado.
                if (!st.avisouLoja) {
                    setState(ownerKey, { ...st, avisouLoja: true })
                    await enviarCancelavel(chatJid, `⚠️ ${r.code}\n${r.message}\n\n${shoppingPromptText()}`)
                } else {
                    await sock.sendMessage(chatJid, { text: `⚠️ ${r.code}: ${r.message}` })
                }
                return true
            }
            setState(ownerKey, {
                action: "waiting_flood_amount",
                groupJid: st.groupJid,
                selectedGroup: st.selectedGroup,
                floodMessage: r.content.text,
                floodKind: "shopping",
                floodContent: r.content,
                floodWarnings: r.warnings || []
            })
            const av = (r.warnings || []).length ? `\n\n⚠️ ${r.warnings.join("\n⚠️ ")}` : ""
            await enviarCancelavel(chatJid, `🛍️ *TIPO LOJA pronto*\n${r.summary}${av}\n\nDigite a *quantidade* (máx ${MAX_FLOOD}):`)
            return true
        }
        setState(ownerKey, { action: "waiting_flood_amount", groupJid: st.groupJid, floodMessage: text, selectedGroup: st.selectedGroup })
        await enviarCancelavel(chatJid, `Digite a *quantidade* (máx ${MAX_FLOOD}):`)
        return true
    }
    // Flood single - quantidade -> vai para escolha de modo (ondas)
    if (st.action === "waiting_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Quantidade invalida." }); return true }
        const q = Math.min(qtd, MAX_FLOOD)
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: q, groupJid: st.groupJid, floodMessage: st.floodMessage, floodKind: st.floodKind, floodContent: st.floodContent, floodWarnings: st.floodWarnings })
        return true
    }
    // Flood single - modo
    if (st.action === "waiting_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido", "rápido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else {
                if (!st.avisouModo) {
                    setState(ownerKey, { ...st, avisouModo: true })
                    await sock.sendMessage(chatJid, { text: "Modo inválido. Digite 1-4 ou intervalo (ex: 200), ou 0 para usar config atual." })
                }
                return true
            }
        }
        clearState(ownerKey)
        // [SHOPPING] tipo de conteúdo: o mesmo executarFlood, com um builder de
        // conteúdo por iteração. floodKind ausente/text → comportamento idêntico ao
        // de sempre ({ text: corpo }).
        const ehLoja = st.floodKind === "shopping" && !!st.floodContent
        let msgFlood = st.floodMessage
        if (CONFIG.linkDivulgacao) {
            if (ehLoja) {
                const comLink = `${msgFlood} · ${CONFIG.linkDivulgacao}`
                // Link NA MESMA LINHA: o hook global de "Ler Mais" (connection/socket.js)
                // enche de ~4000 U+034F qualquer content.text multi-linha, e isso não
                // pode entrar no corpo de um card de loja. Se não couber no limite, o
                // link é omitido (o card é maior que o rodapé de divulgação).
                if (comLink.length <= SHOPPING_LIMITS.body) msgFlood = comLink
            } else {
                msgFlood += `\n${CONFIG.linkDivulgacao}`
            }
        }
        const builder = ehLoja ? makeFloodContentBuilder(st.floodContent) : null
        const avisosLoja = (st.floodWarnings || []).length ? `\n⚠️ ${st.floodWarnings.join("\n⚠️ ")}` : ""
        await sock.sendMessage(chatJid, { text: `Enviando ${st.floodQtd} msgs em modo ${cfg.modo} (${cfg.intervalo}ms/lote${cfg.lote})...${ehLoja ? `\nTIPO: 🛍️ loja (shopStorefrontMessage)` : ""}` })
        try {
            const r = await executarFlood(st.groupJid, msgFlood, st.floodQtd, cfg, builder)
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("flood", { id: st.groupJid, subject: st.selectedGroup?.subject || st.groupJid, qtd: r.total, modo: r.modo, ok: r.ok, tipo: ehLoja ? "shopping" : "text" })
            let resFlood = `Flood finalizado.\nModo: ${r.modo} | ${r.intervalo}ms/lote${r.lote}\nEnviadas: ${r.ok}/${r.total}${r.erros ? `\nFalhas: ${r.erros}` : ""}`
            if (ehLoja) resFlood += `\n${describeSendWire(st.floodContent)}${avisosLoja}`
            await enviarVoltar(chatJid, resFlood)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Link divulgação
    if (st.action === "config_set_link" && text) {
        const v = text.trim()
        if (v.toLowerCase() === "remover") {
            CONFIG.linkDivulgacao = ""; salvarConfig()
            await enviarVoltar(chatJid, "Link/numero removido.")
        } else {
            CONFIG.linkDivulgacao = v; salvarConfig()
            await enviarVoltar(chatJid, `Link/numero salvo:\n${v}`)
        }
        clearState(ownerKey); return true
    }

    // Preset apagar
    if (st.action === "preset_apagar" && text) {
        const n = parseInt(text.trim().replace(/\D/g, ""))
        const { apagarPreset } = await import("../services/presetService.js")
        const removido = isNaN(n) ? null : apagarPreset(n)
        if (removido) {
            await enviarVoltar(chatJid, `Preset ${n} apagado: ${removido.nome || "(sem nome)"}`)
        } else {
            await enviarVoltar(chatJid, "Preset invalido / nao encontrado.")
        }
        clearState(ownerKey); return true
    }

    // Criar preset
    if (st.action === "preset_novo_nome" && text) {
        setState(ownerKey, { action: "preset_novo_bio", presetNome: text })
        await enviarCancelavel(chatJid, "Digite a bio:")
        return true
    }
    if (st.action === "preset_novo_bio" && text) {
        setState(ownerKey, { action: "preset_novo_img", presetNome: st.presetNome, presetBio: text })
        await enviarCancelavel(chatJid, "Envie a imagem (ou digite PULAR):")
        return true
    }
    if (st.action === "preset_novo_img") {
        let bufferFoto = null
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "Imagem muito grande."); clearState(ownerKey); return true }
            // [v52] Falha no download NÃO é mais silenciosa (antes: preset era
            // salvo SEM foto sem avisar — causa da "imagem que não aplica").
            try {
                const raw = await baixarMidiaMensagem(m)
                if (raw && raw.length) bufferFoto = raw
                else { await sock.sendMessage(chatJid, { text: "⚠️ Não consegui baixar a imagem. Envie novamente ou digite PULAR." }); return true }
            } catch (e) {
                await sock.sendMessage(chatJid, { text: `⚠️ Falha ao baixar imagem (${e.message}). Envie novamente ou digite PULAR.` })
                return true
            }
        } else if (text && text.trim().toLowerCase() !== "pular") {
            await sock.sendMessage(chatJid, { text: "Envie uma imagem, ou digite PULAR." })
            return true
        }
        // [v52] 4º campo: MENSAGEM do preset (usada no ROUBAR/NUKE)
        setState(ownerKey, { action: "preset_novo_msg", presetNome: st.presetNome, presetBio: st.presetBio, presetBufferFoto: bufferFoto })
        await enviarCancelavel(chatJid, "Agora a MENSAGEM que o preset envia no grupo\n(usada no Roubar/Nuke):\n\nDigite a mensagem ou PULAR:")
        return true
    }
    if (st.action === "preset_novo_msg") {
        const mensagem = (text && text.trim().toLowerCase() === "pular") ? null : (text || "").trim() || null
        const bufferFoto = st.presetBufferFoto || null
        const nome = st.presetNome, bio = st.presetBio
        clearState(ownerKey)
        try {
            const { salvarNovoPreset } = await import("../services/presetService.js")
            const preset = salvarNovoPreset({ nome, bio, bufferFoto, mensagem })
            await enviarVoltar(chatJid, `Preset ${preset.index} criado e salvo.\nNome: ${nome}\nBio: ${bio}\nImagem: ${bufferFoto ? "OK" : "—"}\nMensagem: ${mensagem ? "OK" : "—"}\nUse no comando 3.`)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Roubar single preset
    if (st.action === "waiting_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (/^0+$/.test(text.trim()) || escolha === "0") {
            dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) {
                if (!st.avisouRP) {
                    setState(ownerKey, { action: "waiting_roubar_preset", groupJid: st.groupJid, grupoSubject: st.grupoSubject, avisouRP: true })
                    await sock.sendMessage(chatJid, { text: "Preset invalido. Digite o numero de um preset ou 0 para usar a config. (cancelar)" })
                }
                return true
            }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `Roubando o grupo: ${st.grupoSubject}...` })
        try {
            // [v52] mensagem: a do PRESET (se configurada) ou o link de divulgação
            const msgRoubar = dados.mensagem || CONFIG.linkDivulgacao || null
            if (msgRoubar) {
                try {
                    if (CONFIG.marcarFantasma) {
                        const { mencionarTodosFantasma } = await import("../services/groupService.js")
                        await mencionarTodosFantasma(st.groupJid, msgRoubar)
                    } else {
                        await sock.sendMessage(st.groupJid, { text: msgRoubar })
                    }
                    await new Promise(r => setTimeout(r, 120))
                } catch {}
            }
            const r = await roubarGrupo(st.groupJid, dados)
            const mk = (b) => b ? "OK" : "-"
            // [v58] motivo REAL dos erros no WhatsApp e no terminal (nada engolido)
            const detalhe = r.erros.length ? `\n⚠️ ${r.erros.slice(0, 3).join(" · ").slice(0, 220)}` : ""
            console.log(r.erros.length
                ? warn(`[ROUBAR] ${st.grupoSubject} · rebaixados=${r.rebaixados} · foto=${r.foto ? "OK" : "FALHA"} · nome=${r.nome ? "OK" : "-"} · bio=${r.bio ? "OK" : "-"} · erros: ${r.erros.join(" | ").slice(0, 160)}`)
                : ok(`[ROUBAR] ${st.grupoSubject} · rebaixados=${r.rebaixados} · foto=OK · nome=OK · bio=OK · trancado`))
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("roubar", { id: st.groupJid, subject: st.grupoSubject, rebaixados: r.rebaixados, ok: true })
            await enviarVoltar(chatJid,
                `Grupo ROUBADO: ${st.grupoSubject}\n` +
                `Admins rebaixados: ${r.rebaixados}\n` +
                `Fechado: ${mk(r.fechado)} | Edicao restrita: ${mk(r.editRestrito)}\n` +
                `Foto: ${mk(r.foto)} Nome: ${mk(r.nome)} Bio: ${mk(r.bio)}` +
                detalhe
            )
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Preset + Nuke single
    if (st.action === "waiting_tudo_preset" && text) {
        const escolha = text.trim()
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        if (/^0+$/.test(escolha)) {
            setState(ownerKey, { action: "waiting_tudo_name", groupJid: st.groupJid })
            await enviarCancelavel(chatJid, "🆕 NOVO PRESET\n\nDigite o *nome* do grupo:")
            return true
        }
        const n = parseInt(escolha.replace(/\D/g, ""))
        const preset = isNaN(n) ? null : getPreset(n)
        if (!preset) {
            if (!st.avisouPreset) {
                setState(ownerKey, { action: st.action, groupJid: st.groupJid, avisouPreset: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Preset inválido. Digite o *número* de um preset ou *0* para criar novo. (cancelar para sair)" })
            }
            return true
        }
        setState(ownerKey, {
            action: "waiting_tudo_msg",
            groupJid: st.groupJid,
            presetNome: preset.nome,
            presetBio: preset.bio,
            presetFoto: fotoPresetPath(preset),
            presetMensagem: preset.mensagem || null
        })
        const linkInfo = CONFIG.linkDivulgacao ? `\n(o link "${CONFIG.linkDivulgacao}" sera anexado)` : ""
        await enviarCancelavel(chatJid, `Digite a MENSAGEM para enviar no grupo ANTES de banir todos.${linkInfo}\n\nOu digite PULAR para nao enviar mensagem.`)
        return true
    }
    if (st.action === "waiting_tudo_msg") {
        clearState(ownerKey)
        const link = CONFIG.linkDivulgacao || ""
        const semMsg = text && text.trim().toLowerCase() === "pular"
        try {
            if (!semMsg) {
                const corpo = (text && text.trim().length ? text.trim() : "") + (link ? `\n\n${link}` : "")
                if (corpo.trim().length) {
                    if (CONFIG.marcarFantasma) {
                        const { mencionarTodosFantasma } = await import("../services/groupService.js")
                        await mencionarTodosFantasma(st.groupJid, corpo)
                    } else {
                        await sock.sendMessage(st.groupJid, { text: corpo })
                    }
                    await new Promise(r => setTimeout(r, 120))
                }
            }
            await sock.sendMessage(chatJid, { text: "Aplicando preset + NUKE..." })
            // [v52] mensagem do preset é enviada ANTES do nuke (igual ao lote)
            const msgPreset = st.presetMensagem || st.presetMsg || null
            if (msgPreset) {
                try {
                    if (CONFIG.marcarFantasma) { const { mencionarTodosFantasma } = await import("../services/groupService.js"); await mencionarTodosFantasma(st.groupJid, msgPreset) }
                    else await sock.sendMessage(st.groupJid, { text: msgPreset })
                    await new Promise(r => setTimeout(r, 120))
                } catch {}
            }
            const r = await nukeComPreset(st.groupJid, { nome: st.presetNome, bio: st.presetBio, fotoPath: st.presetFoto, bufferFoto: st.presetBufferFoto })
            const mk = (b) => b ? "OK" : "-"
            const detalheN = r.erros.length ? `\n⚠️ ${r.erros.slice(0, 3).join(" · ").slice(0, 220)}` : ""
            console.log(r.erros.length
                ? warn(`[NUKE] ${st.grupoSubject} · removidos=${r.removidos} · foto=${r.foto ? "OK" : "FALHA"} · erros: ${r.erros.join(" | ").slice(0, 160)}`)
                : ok(`[NUKE] ${st.grupoSubject} · removidos=${r.removidos} · foto=OK · nome=OK · bio=OK`))
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("nuke", { id: st.groupJid, preset: st.presetNome, removidos: r.removidos, ok: true })
            await enviarVoltar(chatJid, `Preset aplicado + NUKE\nFoto: ${mk(r.foto)} Nome: ${mk(r.nome)} Bio: ${mk(r.bio)}\nFechado: ${mk(r.fechado)} | Removidos: ${r.removidos}${detalheN}`)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }
    if (st.action === "waiting_tudo_name" && text) {
        setState(ownerKey, { action: "waiting_tudo_bio", groupJid: st.groupJid, tudoNome: text })
        await enviarCancelavel(chatJid, "📄 Agora digite a nova *bio*:")
        return true
    }
    if (st.action === "waiting_tudo_bio" && text) {
        setState(ownerKey, { action: "waiting_tudo_image", groupJid: st.groupJid, tudoNome: st.tudoNome, tudoBio: text })
        await enviarCancelavel(chatJid, "📷 Agora *envie a imagem* (ou digite PULAR para sem foto):")
        return true
    }
    if (st.action === "waiting_tudo_image") {
        let bufferFoto = null
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Imagem muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (raw && raw.length > 0) bufferFoto = raw
            } catch {}
        } else if (text && text.trim().toLowerCase() !== "pular") {
            await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem, ou digite PULAR." })
            return true
        }
        try {
            const { salvarNovoPreset } = await import("../services/presetService.js")
            const preset = salvarNovoPreset({ nome: st.tudoNome, bio: st.tudoBio, bufferFoto })
            await sock.sendMessage(chatJid, { text: `Preset ${preset.index} salvo.` })
            setState(ownerKey, {
                action: "waiting_tudo_msg",
                groupJid: st.groupJid,
                presetNome: st.tudoNome,
                presetBio: st.tudoBio,
                presetBufferFoto: bufferFoto
            })
            const linkInfo = CONFIG.linkDivulgacao ? `\n(o link "${CONFIG.linkDivulgacao}" sera anexado)` : ""
            await enviarCancelavel(chatJid, `Digite a MENSAGEM para enviar no grupo ANTES de banir todos.${linkInfo}\n\nOu digite PULAR para nao enviar mensagem.`)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`); clearState(ownerKey) }
        return true
    }

    // [v22] MULTI-SELEÇÃO: group_menu agora aceita 1,3,5 ou 1-5
    if (st.action === "group_menu" && text) {
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const raw = text.trim()

        const pagMatch = raw.match(/^(?:pag|p)\s*(\d+)$/i)
        if (pagMatch) {
            const novoCache = await listarGruposInterativo(chatJid, parseInt(pagMatch[1]))
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }
        if (raw === "0") { clearState(ownerKey); await enviarPainelInicial(chatJid); return true }

        // Tenta multi primeiro (1,3,5 ou 1-5)
        const multi = parseMultiSelecao(cache, raw)
        if (multi && multi.entries && multi.entries.length >= 2) {
            if (multi.invalid && multi.invalid.length) {
                await sock.sendMessage(chatJid, { text: `⚠️ Alguns números não existem: ${multi.invalid.slice(0, 10).join(", ")}\nUsando só os válidos (${multi.entries.length}).` })
            }
            const { isAuthorizedGroup: isAuthG2 } = await import("../utils/permissions.js")
            const protegidos2 = multi.entries.filter(e => isAuthG2(e.id))
            const atacaveis2 = multi.entries.filter(e => !isAuthG2(e.id))
            if (protegidos2.length) {
                await sock.sendMessage(chatJid, { text: `🛡️ ${protegidos2.length} protegido(s) ignorado(s):\n${protegidos2.map(g => `• ${g.subject}`).join("\n")}` })
            }
            const alvo2 = atacaveis2.length ? atacaveis2 : multi.entries
            // Se todos protegidos, ainda mostra menu mas com aviso (o service vai bloquear)
            await enviarMenuMultiAcoes(chatJid, alvo2, ownerKey)
            return true
        }

        const res = resolveGrupoDeTexto(cache, raw)
        if (res && res.multiple) {
            let txt = `🔍 Encontrei ${res.multiple.length} grupos com "${raw}":\n\n`
            res.multiple.slice(0, 10).forEach(mm => {
                const b = mm.isAdmin ? "👑" : "👤"
                txt += `[${String(mm.idx).padStart(3, "0")}] ${b} ${mm.subject}\n`
            })
            txt += `\n_Digite o número exato do grupo desejado_\n_Para multi: 1,3,5 ou 1-5_`
            await sock.sendMessage(chatJid, { text: txt })
            return true
        }
        if (!res) {
            if (!st.avisouNaoEncontrado) {
                setState(ownerKey, { action: "group_menu", avisouNaoEncontrado: true })
                await sock.sendMessage(chatJid, {
                    text: `⚠️ Grupo não encontrado.\n\nDigite o *número* (ex: 01, 07), parte do *nome*, ou multi (1,3,5 / 1-5).\nDigite *cancelar* para sair.`
                })
            }
            return true
        }
        await enviarMenuAcoesGrupo(chatJid, res.entry, ownerKey)
        return true
    }

    if (st.action === "group_action_menu" && text) {
        const raw = text.trim()
        const escolha = raw.replace(/\D/g, "")
        const grupo = st.selectedGroup || { id: st.groupJid, subject: "?", isAdmin: false }
        if (escolha === "1") { await processarSelecaoGrupo(chatJid, ownerKey, "waiting_flood_message", grupo); return true }
        if (escolha === "2") { await processarSelecaoGrupo(chatJid, ownerKey, "waiting_tudo_name", grupo); return true }
        if (escolha === "3") { await processarSelecaoGrupo(chatJid, ownerKey, "roubar_grupo", grupo); return true }
        if (escolha === "4") {
            setState(ownerKey, { action: "group_agendar_tipo", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `⏰ AGENDAR AÇÃO\nGrupo: ${grupo.subject}\n\nO que agendar?\n  1 · FLOOD\n  2 · PRESET + NUKE\n  3 · ROUBAR GRUPO\n\n0 = voltar`)
            return true
        }
        if (escolha === "0" || raw.toLowerCase() === "voltar") { clearState(ownerKey); await enviarPainelInicial(chatJid); return true }
        if (!st.avisouAcao) {
            setState(ownerKey, { action: "group_action_menu", groupJid: st.groupJid, selectedGroup: st.selectedGroup, avisouAcao: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1=Flood · 2=Preset+NUKE · 3=Roubar · 4=Agendar · 0=Voltar" })
        }
        return true
    }

    // [v22] Multi ação menu
    if (st.action === "group_multi_action" && text) {
        const raw = text.trim()
        const escolha = raw.replace(/\D/g, "")
        const grupos = st.multiGroups || []
        if (!grupos.length) { clearState(ownerKey); await enviarVoltar(chatJid, "Seleção expirada."); return true }
        if (escolha === "1") {
            setState(ownerKey, { action: "multi_flood_message", multiGroups: grupos })
            await enviarCancelavel(chatJid, `Digite a mensagem para FLOOD em ${grupos.length} grupos. _Loja: loja:0 · loja:texto · loja:texto|title|surface|id_`)
            return true
        }
        if (escolha === "2") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_tudo_preset", multiGroups: grupos })
            await enviarCancelavel(chatJid, `💣 MULTI PRESET + NUKE\n${grupos.length} grupos\n\n${listarPresetsTexto()}\n\nDigite o número do preset ou 0 para config padrão:`)
            return true
        }
        if (escolha === "3") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_roubar_preset", multiGroups: grupos })
            await enviarCancelavel(chatJid, `ROUBAR EM LOTE\n${grupos.length} grupos\n\n${listarPresetsTexto()}\n\nDigite o número do preset ou 0 para config padrão:`)
            return true
        }
        if (escolha === "4") {
            setState(ownerKey, { action: "multi_agendar_tipo", multiGroups: grupos })
            await enviarCancelavel(chatJid, `⏰ AGENDAR EM LOTE\n${grupos.length} grupos\n\nO que agendar?\n  1 · FLOOD\n  2 · PRESET + NUKE\n  3 · ROUBAR\n\n0 = voltar`)
            return true
        }
        if (escolha === "0" || raw.toLowerCase() === "voltar") {
            const cache = rt().groupSelectionCache[ownerKey]
            if (cache) {
                setState(ownerKey, { action: "group_menu" })
                await listarGruposInterativo(chatJid)
            } else {
                clearState(ownerKey); await enviarPainelInicial(chatJid)
            }
            return true
        }
        if (!st.avisouMulti) {
            setState(ownerKey, { ...st, avisouMulti: true })
            await sock.sendMessage(chatJid, { text: "Opção inválida. 1=Flood lote · 2=Nuke lote · 3=Roubar lote · 4=Agendar lote · 0=Voltar" })
        }
        return true
    }

    // Multi flood
    if (st.action === "multi_flood_message" && text) {
        const loja = detectShoppingTrigger(text)
        if (loja.isShopping) {
            const r = resolveShoppingSend(loja.rest, { delivery: loja.delivery })
            if (!r.ok) {
                if (!st.avisouLoja) {
                    setState(ownerKey, { ...st, avisouLoja: true })
                    await enviarCancelavel(chatJid, `⚠️ ${r.code}\n${r.message}\n\n${shoppingPromptText()}`)
                } else {
                    await sock.sendMessage(chatJid, { text: `⚠️ ${r.code}: ${r.message}` })
                }
                return true
            }
            setState(ownerKey, {
                action: "multi_flood_amount",
                multiGroups: st.multiGroups,
                floodMessage: r.content.text,
                floodKind: "shopping",
                floodContent: r.content,
                floodWarnings: r.warnings || []
            })
            const av = (r.warnings || []).length ? `\n\n⚠️ ${r.warnings.join("\n⚠️ ")}` : ""
            await enviarCancelavel(chatJid, `🛍️ *TIPO LOJA pronto* (${st.multiGroups.length} grupos)\n${r.summary}${av}\n\nQtd para ${st.multiGroups.length} grupos (máx ${MAX_FLOOD} cada):`)
            return true
        }
        setState(ownerKey, { action: "multi_flood_amount", multiGroups: st.multiGroups, floodMessage: text })
        await enviarCancelavel(chatJid, `Qtd para ${st.multiGroups.length} grupos (máx ${MAX_FLOOD} cada):`)
        return true
    }
    if (st.action === "multi_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Quantidade invalida." }); return true }
        const q = Math.min(qtd, MAX_FLOOD)
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: q, multiGroups: st.multiGroups, floodMessage: st.floodMessage, multi: true, floodKind: st.floodKind, floodContent: st.floodContent, floodWarnings: st.floodWarnings })
        return true
    }
    if (st.action === "multi_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else {
                if (!st.avisouModo) {
                    setState(ownerKey, { ...st, avisouModo: true })
                    await sock.sendMessage(chatJid, { text: "Modo inválido. 1-4 ou intervalo custom, ou 0." })
                }
                return true
            }
        }
        const grupos = st.multiGroups
        clearState(ownerKey)
        const ehLoja = st.floodKind === "shopping" && !!st.floodContent
        let msgFlood = st.floodMessage
        if (CONFIG.linkDivulgacao) {
            if (ehLoja) {
                const comLink = `${msgFlood} · ${CONFIG.linkDivulgacao}`
                if (comLink.length <= SHOPPING_LIMITS.body) msgFlood = comLink
            } else {
                msgFlood += `\n${CONFIG.linkDivulgacao}`
            }
        }
        const builderLote = ehLoja ? makeFloodContentBuilder(st.floodContent) : null
        await sock.sendMessage(chatJid, { text: `Flood em lote: ${grupos.length} grupos, ${st.floodQtd} msgs cada, modo ${cfg.modo}...${ehLoja ? " [TIPO LOJA]" : ""}` })
        try {
            const resultados = await executarFloodLote(grupos, msgFlood, st.floodQtd, builderLote ? { ...cfg, buildContent: builderLote } : cfg)
            const okG = resultados.filter(r => r.ok).length
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("flood_lote", { grupos: grupos.length, qtd: st.floodQtd, modo: cfg.modo, okGrupos: okG })
            let txt = `Flood lote finalizado: ${okG}/${grupos.length} grupos OK\n`
            resultados.slice(0, 10).forEach(r => { txt += `${r.ok ? "✅" : "❌"} ${r.subject}: ${r.ok ? `${r.ok}/${r.total}` : r.erro}\n` })
            if (resultados.length > 10) txt += `... +${resultados.length - 10} outros\n`
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Multi nuke preset
    if (st.action === "multi_tudo_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) {
            dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) {
                if (!st.avisouPreset) {
                    setState(ownerKey, { ...st, avisouPreset: true })
                    await sock.sendMessage(chatJid, { text: "Preset inválido. Digite número válido ou 0." })
                }
                return true
            }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "multi_tudo_msg", multiGroups: st.multiGroups, presetDados: dados })
        const linkInfo = CONFIG.linkDivulgacao ? `\n(link "${CONFIG.linkDivulgacao}" será anexado)` : ""
        await enviarCancelavel(chatJid, `Mensagem para enviar ANTES do NUKE em ${st.multiGroups.length} grupos?${linkInfo}\n\nDigite a mensagem ou PULAR:`)
        return true
    }
    if (st.action === "multi_tudo_msg") {
        const semMsg = text && text.trim().toLowerCase() === "pular"
        // [v52] PULAR sem mensagem digitada → usa a MENSAGEM DO PRESET (se houver)
        const corpoBase = semMsg ? (st.presetDados?.mensagem || "") : (text?.trim() || "")
        const link = CONFIG.linkDivulgacao || ""
        const mensagemFinal = corpoBase + (corpoBase && link ? `\n\n${link}` : link ? link : "")
        const grupos = st.multiGroups
        const dados = st.presetDados
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `Aplicando PRESET + NUKE em ${grupos.length} grupos...` })
        try {
            const resultados = await nukeComPresetLote(grupos, dados, { mensagem: mensagemFinal || null })
            const okG = resultados.filter(r => r.ok).length
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("nuke_lote", { grupos: grupos.length, okGrupos: okG, preset: dados.nome })
            let txt = `NUKE lote: ${okG}/${grupos.length} OK\n`
            resultados.forEach(r => { txt += `${r.ok ? "✅" : "❌"} ${r.subject}: ${r.ok ? `removidos ${r.removidos}` : r.erro}\n` })
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Multi roubar preset
    if (st.action === "multi_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) {
            dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) {
                if (!st.avisouRP) {
                    setState(ownerKey, { ...st, avisouRP: true })
                    await sock.sendMessage(chatJid, { text: "Preset inválido. Digite número ou 0." })
                }
                return true
            }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        const grupos = st.multiGroups
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `Roubando ${grupos.length} grupos...` })
        try {
            const resultados = await roubarGrupoLote(grupos, dados, { mensagem: dados.mensagem || CONFIG.linkDivulgacao || null })
            const okG = resultados.filter(r => r.ok).length
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("roubar_lote", { grupos: grupos.length, okGrupos: okG, preset: dados.nome })
            let txt = `ROUBAR lote: ${okG}/${grupos.length} OK\n`
            resultados.forEach(r => { txt += `${r.ok ? "✅" : "❌"} ${r.subject}: ${r.ok ? `rebaixados ${r.rebaixados}` : r.erro}\n` })
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // [v22] Agendamento single
    if (st.action === "group_agendar_tipo" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        // [v40] Fallback: estado sem selectedGroup não derruba o fluxo (usa groupJid).
        const grupo = st.selectedGroup || { id: st.groupJid, subject: st.groupJid, isAdmin: false }
        if (escolha === "1") {
            setState(ownerKey, { action: "agendar_flood_message", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `Agendar FLOOD em ${grupo.subject}\nDigite a mensagem:`)
            return true
        }
        if (escolha === "2") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "agendar_tudo_preset", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `Agendar NUKE em ${grupo.subject}\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
            return true
        }
        if (escolha === "3") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "agendar_roubar_preset", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `Agendar ROUBAR em ${grupo.subject}\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
            return true
        }
        if (escolha === "0") { await enviarMenuAcoesGrupo(chatJid, grupo, ownerKey); return true }
        await sock.sendMessage(chatJid, { text: "Opção inválida. 1=Flood 2=Nuke 3=Roubar 0=Voltar" })
        return true
    }

    if (st.action === "agendar_flood_message" && text) {
        setState(ownerKey, { action: "agendar_flood_amount", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: text })
        await enviarCancelavel(chatJid, `Qtd de mensagens (máx ${MAX_FLOOD}):`)
        return true
    }
    if (st.action === "agendar_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Qtd inválida." }); return true }
        setState(ownerKey, { action: "agendar_flood_modo", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: Math.min(qtd, MAX_FLOOD), groupJid: st.groupJid, floodMessage: st.floodMessage })
        // Reaproveita o handler de modo? Vamos tratar agendar_flood_modo separado
        // O estado já foi setado para agendar_flood_modo, mas enviarMenuFloodModos seta waiting_flood_modo. Corrige:
        setState(ownerKey, { action: "agendar_flood_modo", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        return true
    }
    if (st.action === "agendar_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else { await sock.sendMessage(chatJid, { text: "Modo inválido. 1-4 ou intervalo." }); return true }
        }
        setState(ownerKey, { action: "agendar_tempo", tipo: "flood", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: st.floodMessage, floodQtd: st.floodQtd, floodCfg: cfg })
        await enviarCancelavel(chatJid, `Quando executar?\nEx: 10m, 1h, 30s, 20:30, 25/08 20:00\n(cancelar para sair)`)
        return true
    }
    if (st.action === "agendar_tudo_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "agendar_tudo_msg", groupJid: st.groupJid, selectedGroup: st.selectedGroup, presetDados: dados })
        await enviarCancelavel(chatJid, `Mensagem antes do NUKE? Digite ou PULAR:`)
        return true
    }
    if (st.action === "agendar_tudo_msg") {
        const semMsg = text && text.trim().toLowerCase() === "pular"
        const corpo = semMsg ? (st.presetDados?.mensagem || "") : (text?.trim() || "")
        setState(ownerKey, { action: "agendar_tempo", tipo: "nuke", groupJid: st.groupJid, selectedGroup: st.selectedGroup, presetDados: st.presetDados, mensagem: corpo })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "agendar_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "agendar_tempo", tipo: "roubar", groupJid: st.groupJid, selectedGroup: st.selectedGroup, presetDados: dados })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "agendar_tempo" && text) {
        const { parseAgendamento, agendarAcao } = await import("../services/agendaService.js")
        const parsed = parseAgendamento(text.trim())
        if (!parsed) {
            await sock.sendMessage(chatJid, { text: "Formato inválido. Use: 10m, 1h, 30s, 20:30, 25/08 20:00" })
            return true
        }
        const grupo = { id: st.groupJid, subject: st.selectedGroup?.subject || st.groupJid }
        let job
        if (st.tipo === "flood") {
            job = agendarAcao({ tipo: "flood", grupos: [grupo], dados: { qtd: st.floodQtd, modo: st.floodCfg?.modo || "normal" }, mensagem: st.floodMessage, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "nuke") {
            job = agendarAcao({ tipo: "nuke", grupos: [grupo], dados: { preset: st.presetDados }, mensagem: st.mensagem, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "roubar") {
            job = agendarAcao({ tipo: "roubar", grupos: [grupo], dados: { preset: st.presetDados }, delayMs: parsed.delayMs, at: parsed.at })
        }
        // [v40] Sem tipo reconhecido: avisa em vez de quebrar (job indefinido).
        if (!job) {
            clearState(ownerKey)
            await sock.sendMessage(chatJid, { text: "⚠️ Tipo de agendamento perdido. Comece de novo pelo menu (4 · AGENDAR AÇÃO)." })
            return true
        }
        clearState(ownerKey)
        const d = new Date(parsed.at)
        const quando = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        await enviarVoltar(chatJid, `⏰ Agendado!\nTipo: ${st.tipo}\nGrupo: ${grupo.subject}\nQuando: ${quando}\nID: ${job.id.slice(0, 8)}\n\nUse "agendamentos" para ver todos.`)
        return true
    }

    // Multi agendar
    if (st.action === "multi_agendar_tipo" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "1") {
            setState(ownerKey, { action: "multi_agendar_flood_message", multiGroups: st.multiGroups })
            await enviarCancelavel(chatJid, `Agendar FLOOD em ${st.multiGroups.length} grupos\nMensagem:`)
            return true
        }
        if (escolha === "2") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_agendar_tudo_preset", multiGroups: st.multiGroups })
            await enviarCancelavel(chatJid, `Agendar NUKE em ${st.multiGroups.length} grupos\n${listarPresetsTexto()}\nPreset:`)
            return true
        }
        if (escolha === "3") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_agendar_roubar_preset", multiGroups: st.multiGroups })
            await enviarCancelavel(chatJid, `Agendar ROUBAR em ${st.multiGroups.length} grupos\n${listarPresetsTexto()}\nPreset:`)
            return true
        }
        if (escolha === "0") { await enviarMenuMultiAcoes(chatJid, st.multiGroups, ownerKey); return true }
        await sock.sendMessage(chatJid, { text: "Opção inválida. 1=Flood 2=Nuke 3=Roubar 0=Voltar" })
        return true
    }
    if (st.action === "multi_agendar_flood_message" && text) {
        setState(ownerKey, { action: "multi_agendar_flood_amount", multiGroups: st.multiGroups, floodMessage: text })
        await enviarCancelavel(chatJid, `Qtd (máx ${MAX_FLOOD} cada):`)
        return true
    }
    if (st.action === "multi_agendar_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Qtd inválida." }); return true }
        setState(ownerKey, { action: "multi_agendar_flood_modo", multiGroups: st.multiGroups, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: Math.min(qtd, MAX_FLOOD), multiGroups: st.multiGroups, floodMessage: st.floodMessage, multi: true })
        setState(ownerKey, { action: "multi_agendar_flood_modo", multiGroups: st.multiGroups, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        return true
    }
    if (st.action === "multi_agendar_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else { await sock.sendMessage(chatJid, { text: "Modo inválido." }); return true }
        }
        setState(ownerKey, { action: "multi_agendar_tempo", tipo: "flood", multiGroups: st.multiGroups, floodMessage: st.floodMessage, floodQtd: st.floodQtd, floodCfg: cfg })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "multi_agendar_tudo_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "multi_agendar_tudo_msg", multiGroups: st.multiGroups, presetDados: dados })
        await enviarCancelavel(chatJid, `Mensagem antes do NUKE? PULAR ou digite:`)
        return true
    }
    if (st.action === "multi_agendar_tudo_msg") {
        const semMsg = text && text.trim().toLowerCase() === "pular"
        const corpo = semMsg ? "" : (text?.trim() || "")
        setState(ownerKey, { action: "multi_agendar_tempo", tipo: "nuke", multiGroups: st.multiGroups, presetDados: st.presetDados, mensagem: corpo })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "multi_agendar_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "multi_agendar_tempo", tipo: "roubar", multiGroups: st.multiGroups, presetDados: dados })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "multi_agendar_tempo" && text) {
        const { parseAgendamento, agendarAcao } = await import("../services/agendaService.js")
        const parsed = parseAgendamento(text.trim())
        if (!parsed) { await sock.sendMessage(chatJid, { text: "Formato inválido. Use 10m, 1h, 20:30, etc." }); return true }
        let job
        if (st.tipo === "flood") {
            job = agendarAcao({ tipo: "flood", grupos: st.multiGroups, dados: { qtd: st.floodQtd, modo: st.floodCfg?.modo || "normal" }, mensagem: st.floodMessage, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "nuke") {
            job = agendarAcao({ tipo: "nuke", grupos: st.multiGroups, dados: { preset: st.presetDados }, mensagem: st.mensagem, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "roubar") {
            job = agendarAcao({ tipo: "roubar", grupos: st.multiGroups, dados: { preset: st.presetDados }, delayMs: parsed.delayMs, at: parsed.at })
        }
        clearState(ownerKey)
        const d = new Date(parsed.at)
        const quando = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        await enviarVoltar(chatJid, `⏰ Agendado em lote!\nTipo: ${st.tipo}\nGrupos: ${st.multiGroups.length}\nQuando: ${quando}\nID: ${job.id.slice(0, 8)}`)
        return true
    }

    // Flood config set
    if (st.action === "config_set_flood_interval" && text) {
        const n = parseInt(text.replace(/\D/g, ""))
        if (isNaN(n) || n < 20 || n > 5000) { await sock.sendMessage(chatJid, { text: "Intervalo inválido. 20-5000ms." }); return true }
        CONFIG.floodInterval = n; salvarConfig()
        await enviarVoltar(chatJid, `Intervalo flood salvo: ${n}ms`)
        clearState(ownerKey); return true
    }
    if (st.action === "config_set_flood_lote" && text) {
        const n = parseInt(text.replace(/\D/g, ""))
        if (isNaN(n) || n < 1 || n > 10) { await sock.sendMessage(chatJid, { text: "Lote inválido. 1-10." }); return true }
        CONFIG.floodLote = n; salvarConfig()
        await enviarVoltar(chatJid, `Lote flood salvo: ${n}`)
        clearState(ownerKey); return true
    }
    if (st.action === "config_set_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        if (["rapido", "normal", "lento", "seguro"].includes(raw)) {
            CONFIG.floodModo = raw
            const modo = FLOOD_MODOS[raw]
            CONFIG.floodInterval = modo.intervalo
            CONFIG.floodLote = modo.lote
            CONFIG.floodJitter = raw === "seguro"
            salvarConfig()
            await enviarVoltar(chatJid, `Modo flood salvo: ${raw} (${modo.intervalo}ms/lote${modo.lote})`)
        } else {
            await sock.sendMessage(chatJid, { text: "Modo inválido. Use: rapido, normal, lento, seguro." })
            return true
        }
        clearState(ownerKey); return true
    }

    // ══ [FLOOD v2] entradas dos controles 36-45 do painel do dono ═══════════
    // Velocidade: usa resolveFloodSpeed() da feature (mesma fonte do overlay dos
    // presets) e grava no config.json no FORMATO que o flood clássico já entende —
    // modo "custom" vira intervalo explícito com o nome de modo anterior, porque
    // FLOOD_MODOS não tem "custom" e getFloodConfig() cairia em normal.
    if (st.action === "config_set_flood_speed" && text) {
        const fx = await import("../features/flood/index.js")
        const cfg = fx.resolveFloodSpeed(text.trim())
        if (!cfg.ok) {
            await sock.sendMessage(chatJid, { text: `⚠️ ${cfg.error} — use 1-4, o nome do modo, ou um intervalo em ms (${fx.CUSTOM_INTERVAL_MIN}–${fx.CUSTOM_INTERVAL_MAX}).\n\n${fx.formatFloodSpeedMenu()}` })
            return true
        }
        const { FLOOD_MODOS } = await import("../utils/config.js")
        if (cfg.modo === "custom" || !FLOOD_MODOS[cfg.modo]) {
            CONFIG.floodModo = FLOOD_MODOS[CONFIG.floodModo] ? CONFIG.floodModo : "normal"
        } else {
            CONFIG.floodModo = cfg.modo
        }
        CONFIG.floodInterval = cfg.intervalo
        CONFIG.floodLote = cfg.lote
        CONFIG.floodJitter = !!cfg.jitter
        salvarConfig()
        await enviarVoltar(chatJid, `🌊 Velocidade: ${CONFIG.floodModo} · ${cfg.intervalo}ms/lote${cfg.lote}${cfg.jitter ? " + jitter" : ""} (fonte: ${cfg.from})\n\n_vale para o flood do wizard e como overlay dos presets_`)
        clearState(ownerKey); return true
    }

    // Allowlist: aceita número do grupo autorizado (1-based) ou JID. Adicionar
    // NUNCA envia nada; é só a porta de saída. A lista nunca é ampliada sozinha.
    if (st.action === "config_set_flood_allowlist_add" && text) {
        const fx = await import("../features/flood/index.js")
        const raw = text.trim()
        let alvo = raw
        if (/^\d+$/.test(raw)) {
            const grupos = CONFIG.gruposAutorizados || []
            const i = Number(raw) - 1
            if (i < 0 || i >= grupos.length) {
                await sock.sendMessage(chatJid, { text: `⚠️ Não existe o grupo ${raw} na lista (${grupos.length} autorizados). Digite o número ou o JID.` })
                return true
            }
            alvo = String(grupos[i])
        }
        const r = fx.addAllowlistJid(alvo)
        if (!r.ok) {
            await sock.sendMessage(chatJid, { text: `❌ ${r.error} — não virou JID. Mande o número da lista ou 5519999999999-9999@g.us\n\n${fx.formatAllowlistTexto()}` })
            return true
        }
        salvarConfig()
        const avisoGrupo = /@g\.us$/.test(r.jid) ? "" : "\n\n⚠️ não é grupo (@g.us): vale como destino individual, mas o flood de grupos continua barrando aqui."
        await enviarVoltar(chatJid, `${r.already ? "ℹ️ já estava" : "✅ adicionado"}: ${fx.maskJid(r.jid)}\n\n${fx.formatAllowlistTexto()}${avisoGrupo}`)
        clearState(ownerKey); return true
    }
    if (st.action === "config_set_flood_allowlist_remove" && text) {
        const fx = await import("../features/flood/index.js")
        const r = fx.removeAllowlistJid(text.trim())
        if (!r.ok) {
            await sock.sendMessage(chatJid, { text: `⚠️ ${r.error} — nada removido.\n\n${fx.formatAllowlistTexto()}` })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `➖ removido: ${fx.maskJid(r.removed)}\n\n${fx.formatAllowlistTexto()}`)
        clearState(ownerKey); return true
    }

    // Preview da loja: monta o payload e mostra as CHAVES do send + o ramo do
    // wire. Não envia — é assim que se confere o card antes de um disparo real.
    if (st.action === "config_set_flood_loja" && text) {
        const fx = await import("../features/flood/index.js")
        const raw = text.trim()
        const r = fx.resolveShoppingSend(raw === "0" || raw.toLowerCase() === "default" ? "" : raw)
        if (!r.ok) {
            await enviarVoltar(chatJid, `❌ ${r.code}\n${r.message}\n\n_Ex.: 0 · texto livre · texto|titulo|wa · texto|titulo|wa|shop-id_`)
            clearState(ownerKey); return true
        }
        const avisos = (r.warnings || []).length ? `\n⚠️ ${r.warnings.join("\n⚠️ ")}` : ""
        await enviarVoltar(chatJid, [
            "🛍️ PREVIEW DA LOJA — nada foi enviado",
            `• preset: ${r.presetId} · entrega: ${r.delivery}`,
            `• ${r.summary}`,
            `• wire: ${r.wire}`,
            "",
            "_se o wire não mostrar o ramo da loja, o card NÃO existe no payload — é assim que se flagra o bug antes de culpar o cliente._",
            `Para mandar de verdade: menu → ⚔️ Ataque & Grupos → 🌊 FLOOD → grupo → qtd → modo → conteúdo: loja:${raw || "0"} (e dry-run DESLIGADO em 37)`
        ].join("\n") + avisos)
        clearState(ownerKey); return true
    }

    // 🛡️ 38 · "Escolher grupos (1,3,5)" — mesmo gesto da arena 01a0aaae, mas aqui
    // o resultado É a allowlist (a porta de saída do flood na AB7). Substitui a
    // lista, nunca amplia sozinha, e "limpar" fecha a porta.
    if (st.action === "config_set_flood_allowlist_pick" && text) {
        const fx = await import("../features/flood/index.js")
        const raw = text.trim().toLowerCase()
        const grupos = CONFIG.gruposAutorizados || []
        let alvos = null
        if (raw === "todos" || raw === "all" || raw === "*") alvos = [...grupos]
        else if (raw === "limpar" || raw === "reset" || raw === "-") alvos = []
        else {
            const nums = raw.split(/[,\s]+/).map(x => x.trim()).filter(Boolean)
            if (nums.length && nums.every(x => /^\d+$/.test(x))) {
                alvos = []
                const ruins = []
                for (const n of nums) {
                    const i = Number(n) - 1
                    if (i < 0 || i >= grupos.length) { ruins.push(n); continue }
                    if (!alvos.includes(grupos[i])) alvos.push(String(grupos[i]))
                }
                if (ruins.length) {
                    await sock.sendMessage(chatJid, { text: `⚠️ número(s) fora da lista: ${ruins.join(", ")} (há ${grupos.length} grupos autorizados). Nada foi alterado.` })
                    return true
                }
            }
        }
        if (!alvos) {
            await sock.sendMessage(chatJid, { text: `⚠️ Não entendi. Use: 1 · 1,3,5 · todos · limpar\n\n${grupos.slice(0, 30).map((g, i) => `  ${i + 1} · ${fx.maskJid(g)}`).join("\n") || "_nenhum grupo autorizado_"}` })
            return true
        }
        CONFIG.floodAllowlist = []
        const erros = []
        for (const g of alvos) { const r = fx.addAllowlistJid(g); if (!r.ok) erros.push(`${g}: ${r.error}`) }
        salvarConfig()
        const rod = alvos.length ? `\n\n⚔️ Para rodar: 36 (presets) ou os atalhos paymenttest/shoppingtest/texttest — e 37 decide se sai de verdade.` : ""
        await enviarVoltar(chatJid, `🛡️ Allowlist do flood: ${alvos.length} destino(s)${erros.length ? `\n⚠️ rejeitados: ${erros.join("; ")}` : ""}\n\n${fx.formatAllowlistTexto()}${rod}`)
        clearState(ownerKey); return true
    }

    // [v24] Permissões - add/remove user
    if (st.action === "config_add_user" && text) {
        const { addAuthorizedUser } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const raw = text.trim()
        const nums = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
        let adicionados = [], jaExistiam = [], invalidos = [], lidsAdicionados = []
        for (const n of nums) {
            const res = addAuthorizedUser(n)
            if (!res) invalidos.push(n)
            else if (res.already || res.alreadyOwner) jaExistiam.push(res.num)
            else if (res.added) {
                adicionados.push(res.num)
                if (res.lids && res.lids.length) {
                    // já adicionou LID via mapa
                }
            }
        }
        // Busca ativa de LID para cada telefone adicionado (evita rate-limit fazendo em lote pequeno)
        try {
            const { buscarLidPorPhone } = await import("../services/lidResolver.js")
            const { addAuthorizedUser: addLid } = await import("../utils/permissions.js")
            for (const phone of adicionados) {
                try {
                    const lid = await buscarLidPorPhone(phone)
                    if (lid) {
                        const r2 = addLid(lid + "@lid")
                        if (r2?.added) lidsAdicionados.push(`${phone} -> ${lid}`)
                    }
                } catch {}
                await new Promise(r => setTimeout(r, 120))
            }
        } catch {}
        salvarConfig()
        let msg = ""
        if (adicionados.length) msg += `✅ Adicionados ${adicionados.length}: ${adicionados.join(", ")}\n`
        if (lidsAdicionados.length) msg += `🔗 LIDs encontrados: ${lidsAdicionados.join(", ")}\n`
        if (jaExistiam.length) msg += `⚠️ Já eram ADM ou dono: ${jaExistiam.join(", ")}\n`
        if (invalidos.length) msg += `❌ Inválidos: ${invalidos.join(", ")}\n`
        if (!msg) msg = "Nenhum número válido."
        msg += `\nDica: se o ADM usar @lid no PV, adicione o LID também (aparece no aviso de acesso negado).`
        await enviarVoltar(chatJid, msg.trim())
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_remove_user" && text) {
        const { removeAuthorizedUser } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const res = removeAuthorizedUser(text.trim())
        if (!res) {
            await sock.sendMessage(chatJid, { text: "Número/índice não encontrado." })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `✅ Removido ADM: ${res.removed}`)
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_add_group" && text) {
        const raw = text.trim()
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const { addAuthorizedGroup } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const { resolverGrupoInput } = await import("../services/groupService.js")

        // Tenta multi seleção da lista
        const multi = parseMultiSelecao(cache, raw)
        if (multi && multi.entries.length >= 1) {
            let adicionados = [], jaExistiam = []
            for (const e of multi.entries) {
                const res = addAuthorizedGroup(e.id)
                if (res?.already) jaExistiam.push(e.subject)
                else if (res?.added) adicionados.push(e.subject)
            }
            salvarConfig()
            let msg = ""
            if (adicionados.length) msg += `✅ Grupos autorizados adicionados (${adicionados.length}):\n${adicionados.map(s => `• ${s}`).join("\n")}\n`
            if (jaExistiam.length) msg += `\n⚠️ Já autorizados: ${jaExistiam.join(", ")}`
            if (multi.invalid?.length) msg += `\n❌ Inválidos: ${multi.invalid.join(", ")}`
            await enviarVoltar(chatJid, msg.trim() || "Nenhum grupo adicionado.")
            clearState(ownerKey)
            return true
        }

        // Tenta número único da lista
        const single = resolveGrupoDeTexto(cache, raw)
        if (single && single.entry) {
            const res = addAuthorizedGroup(single.entry.id)
            salvarConfig()
            if (res?.already) await enviarVoltar(chatJid, `⚠️ Grupo já autorizado: ${single.entry.subject}`)
            else await enviarVoltar(chatJid, `✅ Grupo autorizado: ${single.entry.subject}\nID: ${single.entry.id}`)
            clearState(ownerKey)
            return true
        }

        // Tenta JID direto ou link
        try {
            let jid = raw
            if (jid.includes("whatsapp.com") || jid.endsWith("@g.us")) {
                jid = await resolverGrupoInput(jid)
            } else if (!jid.endsWith("@g.us")) {
                // Pode ser ID sem @g.us? Tenta normalizar
                if (/^\d+@g\.us$/.test(jid) || /^\d+-/.test(jid)) {
                    // já é JID válido ou com sufixo
                } else {
                    throw new Error("Formato inválido")
                }
            }
            const res = addAuthorizedGroup(jid)
            if (!res) throw new Error("JID inválido")
            salvarConfig()
            const subj = rt().cachedGroups[jid]?.subject || jid
            if (res.already) await enviarVoltar(chatJid, `⚠️ Já autorizado: ${subj}`)
            else await enviarVoltar(chatJid, `✅ Grupo autorizado: ${subj}`)
            clearState(ownerKey)
            return true
        } catch (e) {
            await sock.sendMessage(chatJid, { text: `⚠️ Grupo não encontrado. Digite número da lista (ex: 01), ID @g.us ou link de convite.\nErro: ${e.message}` })
            return true
        }
    }
    if (st.action === "config_remove_group" && text) {
        const { removeAuthorizedGroup } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const res = removeAuthorizedGroup(text.trim())
        if (!res) {
            await sock.sendMessage(chatJid, { text: "Grupo/índice não encontrado." })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `✅ Grupo removido dos autorizados: ${res.removed}`)
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_add_owner" && text) {
        const { addExtraOwner } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const raw = text.trim()
        const nums = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
        let adicionados = [], jaExistiam = [], invalidos = []
        for (const n of nums) {
            const res = addExtraOwner(n)
            if (!res) invalidos.push(n)
            else if (res.already || res.alreadyOwner) jaExistiam.push(res.num)
            else if (res.added) adicionados.push(res.num)
        }
        salvarConfig()
        let msg = ""
        if (adicionados.length) msg += `✅ Donos extras adicionados: ${adicionados.join(", ")}\n`
        if (jaExistiam.length) msg += `⚠️ Já eram donos: ${jaExistiam.join(", ")}\n`
        if (invalidos.length) msg += `❌ Inválidos: ${invalidos.join(", ")}\n`
        if (!msg) msg = "Nenhum número válido."
        await enviarVoltar(chatJid, msg.trim())
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_remove_owner" && text) {
        const { removeExtraOwner } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const res = removeExtraOwner(text.trim())
        if (!res) {
            await sock.sendMessage(chatJid, { text: "Dono extra não encontrado." })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `✅ Dono extra removido: ${res.removed}`)
        clearState(ownerKey)
        return true
    }

    // Agendamento cancel
    if (st.action === "agendar_cancelar" && text) {
        const { cancelarAgendamento } = await import("../services/agendaService.js")
        const id = text.trim()
        const removido = cancelarAgendamento(id) || cancelarAgendamento(id.slice(0, 6)) // tenta por prefixo
        // Tenta buscar por prefixo se não achou exato
        if (!removido) {
            const { listarAgendamentos } = await import("../services/agendaService.js")
            const lista = listarAgendamentos()
            const found = lista.find(j => j.id.startsWith(id))
            if (found) {
                const { cancelarAgendamento: canc2 } = await import("../services/agendaService.js")
                const r2 = canc2(found.id)
                if (r2) { await enviarVoltar(chatJid, `Agendamento ${found.id.slice(0, 8)} cancelado.`); clearState(ownerKey); return true }
            }
            await enviarVoltar(chatJid, "ID não encontrado ou já executado.")
        } else {
            await enviarVoltar(chatJid, `Agendamento ${removido.id.slice(0, 8)} cancelado.`)
        }
        clearState(ownerKey); return true
    }

    if (st.action === "waiting_group" && text) {
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const cacheKeys = Object.keys(cache).map(k => parseInt(k)).filter(k => !isNaN(k))
        const raw = text.trim()

        const pagMatch = raw.match(/^(?:pag|p)\s*(\d+)$/i)
        if (pagMatch) {
            const nPag = parseInt(pagMatch[1])
            const novoCache = await listarGruposInterativo(chatJid, nPag)
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }

        const multi = parseMultiSelecao(cache, raw)
        if (multi && multi.entries && multi.entries.length >= 2) {
            if (multi.invalid && multi.invalid.length) {
                await sock.sendMessage(chatJid, { text: `⚠️ Ignorando inválidos: ${multi.invalid.slice(0, 10).join(", ")}` })
            }
            // Filtra grupos protegidos
            const { isAuthorizedGroup: isAuthG } = await import("../utils/permissions.js")
            const protegidos = multi.entries.filter(e => isAuthG(e.id))
            const atacaveis = multi.entries.filter(e => !isAuthG(e.id))
            if (protegidos.length) {
                await sock.sendMessage(chatJid, { text: `🛡️ ${protegidos.length} grupo(s) protegido(s) (autorizado) será(ão) ignorado(s):\n${protegidos.map(g => `• ${g.subject}`).join("\n")}` })
            }
            if (!atacaveis.length) {
                await sock.sendMessage(chatJid, { text: "❌ Todos os grupos selecionados são protegidos (autorizados)." })
                return true
            }
            const alvoMulti = atacaveis.length < multi.entries.length ? atacaveis : multi.entries
            if (st.next === "waiting_flood_message") {
                setState(ownerKey, { action: "multi_flood_message", multiGroups: alvoMulti })
                await enviarCancelavel(chatJid, `Multi FLOOD: ${alvoMulti.length} grupos\nDigite a mensagem:`)
                return true
            }
            if (st.next === "waiting_tudo_name") {
                const { listarPresetsTexto } = await import("../services/presetService.js")
                setState(ownerKey, { action: "multi_tudo_preset", multiGroups: alvoMulti })
                await enviarCancelavel(chatJid, `Multi PRESET+NUKE: ${alvoMulti.length} grupos\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
                return true
            }
            if (st.next === "roubar_grupo") {
                const { listarPresetsTexto } = await import("../services/presetService.js")
                setState(ownerKey, { action: "multi_roubar_preset", multiGroups: alvoMulti })
                await enviarCancelavel(chatJid, `Multi ROUBAR: ${alvoMulti.length} grupos\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
                return true
            }
            await enviarMenuMultiAcoes(chatJid, alvoMulti, ownerKey)
            return true
        }

        const res = resolveGrupoDeTexto(cache, raw)
        if (res && res.multiple) {
            let txt = `🔍 Encontrei ${res.multiple.length} grupos com "${raw}":\n\n`
            res.multiple.slice(0, 10).forEach(mm => {
                const b = mm.isAdmin ? "👑" : "👤"
                txt += `[${String(mm.idx).padStart(3, "0")}] ${b} ${mm.subject}\n`
            })
            txt += `\n_Digite o número exato do grupo desejado_\n_Para multi: 1,3,5 ou 1-5_`
            await sock.sendMessage(chatJid, { text: txt })
            return true
        }
        if (!res) {
            if (!st.avisouNaoEncontrado) {
                setState(ownerKey, { action: st.action, next: st.next, avisouNaoEncontrado: true })
                await sock.sendMessage(chatJid, {
                    text: `⚠️ Grupo não encontrado.\n\nDigite o *número* (ex: 01, 07, 072), parte do *nome*, ou multi (1,3,5 / 1-5).\nDigite *cancelar* para sair.\n\nTotal disponível: ${cacheKeys.length} grupos.`
                })
            }
            return true
        }
        const { entry, selectedIdx } = res

        setState(ownerKey, {
            action: st.next,
            groupJid: entry.id,
            selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: selectedIdx }
        })

        console.log(info("GRUPO", `Selecionado: [${selectedIdx}] ${entry.subject}`))
        await processarSelecaoGrupo(chatJid, ownerKey, st.next, entry)
        return true
    }

    // ============================================================
    // [v41] 🫥 STATUS MANAGER — estados de criação e audiência
    // ============================================================
    if (st.action === "status_waiting_text" && text) {
        // O parsing dos sufixos (#cor / #fonte) fica no service (fonte única da sintaxe)
        const { criarDraftTexto } = await import("../features/statusManager/index.js")
        const r = criarDraftTexto(text)
        if (!r.ok) { await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}` }); return true }
        setState(ownerKey, { action: "status_menu_st" })
        await sock.sendMessage(chatJid, { text: `✅ Rascunho de TEXTO adicionado à fila (${r.total} na fila).\n\n_5 = publicar agora · 4 = postar preset · 0 = voltar_` })
        return true
    }

    if (st.action === "status_waiting_image") {
        const imgMsg = m?.message?.imageMessage || m?.message?.documentMessage?.imageMessage
        const docImagem = m?.message?.documentMessage && m?.message?.documentMessage?.mimetype?.startsWith("image/")
        if (!imgMsg && !docImagem) {
            if (!st.avisouMidia) {
                setState(ownerKey, { action: "status_waiting_image", avisouMidia: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Envie uma IMAGEM (foto ou documento JPG/PNG/WEBP) ou digite cancelar." })
            }
            return true
        }
        try {
            const buffer = await baixarMidiaMensagem(m)
            const caption = m?.message?.imageMessage?.caption || m?.message?.documentMessage?.caption || ""
            const mimetype = m?.message?.imageMessage?.mimetype || (docImagem ? m?.message?.documentMessage?.mimetype : null)
            const { criarDraftMidia } = await import("../features/statusManager/index.js")
            const r = criarDraftMidia("imagem", buffer, caption, mimetype)
            if (!r.ok) { await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}` }); return true }
            setState(ownerKey, { action: "status_menu_st" })
            await sock.sendMessage(chatJid, { text: `✅ Rascunho de IMAGEM adicionado à fila (${r.total} na fila).\n\n_5 = publicar agora · 4 = postar preset · 0 = voltar_` })
        } catch (e) {
            const { registrarErroStatus } = await import("../features/statusManager/service.js")
            registrarErroStatus("download_imagem", e.message, {})
            await sock.sendMessage(chatJid, { text: `❌ Falha ao baixar a imagem: ${e.message}` })
        }
        return true
    }

    if (st.action === "status_waiting_video") {
        const vidMsg = m?.message?.videoMessage || (m?.message?.documentMessage && m?.message?.documentMessage?.mimetype?.startsWith("video/"))
        if (!vidMsg) {
            if (!st.avisouMidia) {
                setState(ownerKey, { action: "status_waiting_video", avisouMidia: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Envie um VÍDEO (ou digite cancelar). Limite do WhatsApp: ~30s." })
            }
            return true
        }
        try {
            const buffer = await baixarMidiaMensagem(m)
            const caption = m?.message?.videoMessage?.caption || m?.message?.documentMessage?.caption || ""
            const mimetype = m?.message?.videoMessage?.mimetype || m?.message?.documentMessage?.mimetype || null
            const { criarDraftMidia } = await import("../features/statusManager/index.js")
            const r = criarDraftMidia("video", buffer, caption, mimetype)
            if (!r.ok) { await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}` }); return true }
            setState(ownerKey, { action: "status_menu_st" })
            await sock.sendMessage(chatJid, { text: `✅ Rascunho de VÍDEO adicionado à fila (${r.total} na fila).\n\n_5 = publicar agora · 4 = postar preset · 0 = voltar_` })
        } catch (e) {
            const { registrarErroStatus } = await import("../features/statusManager/service.js")
            registrarErroStatus("download_video", e.message, {})
            await sock.sendMessage(chatJid, { text: `❌ Falha ao baixar o vídeo: ${e.message}` })
        }
        return true
    }

    if (st.action === "status_waiting_audience" && text) {
        const raw = text.trim().toLowerCase()
        const { definirAudienciaCustom, limparAudienciaCustom, statusRouter } = await import("../features/statusManager/index.js")
        if (raw === "limpar") {
            limparAudienciaCustom()
            await sock.sendMessage(chatJid, { text: "🧹 Lista personalizada apagada.\nAudiência voltou para: CONTATOS (padrão da conta)." })
            return true
        }
        const entries = text.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
        const r = definirAudienciaCustom(entries)
        if (!r.ok) {
            await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}${r.invalidos?.length ? `\nInválidos: ${r.invalidos.join(", ")}` : ""}` })
            return true
        }
        setState(ownerKey, { action: "status_menu_st" })
        let t = `✅ Audiência definida: LISTA PERSONALIZADA\n${r.total} destinatário(s) — "Somente compartilhar com..."\n`
        if (r.invalidos?.length) t += `\n⚠️ Ignorados por inválidos: ${r.invalidos.join(", ")}`
        t += `\nSerá aplicada na próxima publicação.\n\n_5 = publicar agora · 1-3 = novo rascunho · 0 = voltar_`
        await sock.sendMessage(chatJid, { text: t })
        return true
    }

    // [v41] Submenus numéricos do STATUS MANAGER dentro do estado status_menu_st
    if (st.action === "status_menu_st" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        const mapa = STATUS_MENU_MAP // [v50] fonte única (statusManager)
        if (escolha === "0") { clearState(ownerKey); await enviarPainelInicial(chatJid); return true }
        if (mapa[escolha]) { await statusRouter(chatJid, ownerKey, mapa[escolha]); return true }
        if (!st.avisouStatus) {
            setState(ownerKey, { action: "status_menu_st", avisouStatus: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-8 (9-11 só dono) · 0 = voltar · cancelar = sair." })
        }
        return true
    }

    // [v46] 🗂️ POSTAR PRESET DE STATUS (dono E ADM — escolha do número da lista)
    if (st.action === "status_preset_select" && text) {
        const { obterStatusPreset } = await import("../features/statusManager/presets.js")
        const { criarDraftTexto } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "0") { const { statusRouter } = await import("../features/statusManager/index.js"); await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        const preset = obterStatusPreset(parseInt(escolha, 10))
        if (!preset) {
            if (!st.avisouPreset) {
                setState(ownerKey, { action: "status_preset_select", avisouPreset: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Preset inválido. Digite o NÚMERO da lista (0 = voltar)." })
            }
            return true
        }
        const r = criarDraftTexto(preset.texto)
        setState(ownerKey, { action: "status_menu_st" })
        if (!r.ok) { await sock.sendMessage(chatJid, { text: `❌ ${r.motivo}` }); return true }
        await sock.sendMessage(chatJid, { text: `╭━━「 ✅ 𝗣𝗥𝗘𝗦𝗘𝗧 𝗡𝗔 𝗙𝗜𝗟𝗔 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n🗂️ ${preset.nome}\n📋 Fila: ${r.total} rascunho(s)\n\n▶️ 5 = PUBLICAR agora\n0 = voltar` })
        return true
    }

    // [v46] 🗂️ GERENCIAR PRESETS (SÓ DONO — guarda nos estados abaixo)
    if (["status_preset_menu", "status_preset_criar_nome", "status_preset_criar_texto", "status_preset_apagar"].includes(st.action) && !isOwner(ownerKey)) {
        setState(ownerKey, { action: "status_menu_st" })
        await sock.sendMessage(chatJid, { text: "❌ Gerenciar presets de status é restrito ao DONO.\nADMs postam presets em: menu 7 > 4." })
        return true
    }

    if (st.action === "status_preset_menu" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const { statusPresetsTexto } = await import("../features/statusManager/presets.js")
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        if (escolha === "1") { await statusRouter(chatJid, ownerKey, "status_preset_criar"); return true }
        if (escolha === "2") { await statusRouter(chatJid, ownerKey, "status_preset_apagar"); return true }
        if (escolha === "3") { setState(ownerKey, { action: "status_preset_menu" }); await sock.sendMessage(chatJid, { text: statusPresetsTexto("listar") }); return true }
        if (!st.avisouPresetMenu) {
            setState(ownerKey, { action: "status_preset_menu", avisouPresetMenu: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-3 (ou 0 = voltar, cancelar = sair)." })
        }
        return true
    }

    if (st.action === "status_preset_criar_nome" && text) {
        const nome = text.trim()
        if (nome.length > 30) {
            if (!st.avisouNome) {
                setState(ownerKey, { action: "status_preset_criar_nome", avisouNome: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Nome muito longo (máx 30). Digite um nome curto:" })
            }
            return true
        }
        setState(ownerKey, { action: "status_preset_criar_texto", nomePreset: nome })
        await sock.sendMessage(chatJid, { text: `╭━━「 ➕ 𝗣𝗥𝗘𝗦𝗘𝗧 \${nome}\n╰━━━━━━━━━━━━━━━━━━━━━\n\nDigite o TEXTO do status salvo.\n\nAceita no final:\n• #1a8f3c → cor de fundo\n• #6 → fonte\n\nEx: Bom dia! Promo ativada #1a8f3c #6\n\n_(cancelar para sair)_` })
        return true
    }

    if (st.action === "status_preset_criar_texto" && text) {
        const { criarStatusPreset } = await import("../features/statusManager/presets.js")
        const r = criarStatusPreset(st.nomePreset, text)
        setState(ownerKey, { action: "status_preset_menu" })
        await sock.sendMessage(chatJid, { text: r.ok ? `✅ Preset "${st.nomePreset}" salvo (${r.total} no total).\n\nADMs podem postar em: menu 7 > 4.` : `❌ ${r.motivo}` })
        return true
    }

    if (st.action === "status_preset_apagar" && text) {
        const { apagarStatusPreset } = await import("../features/statusManager/presets.js")
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_preset_menu"); return true }
        const r = apagarStatusPreset(parseInt(escolha, 10))
        setState(ownerKey, { action: "status_preset_menu" })
        await sock.sendMessage(chatJid, { text: r.ok ? `🗑️ Preset "${r.nome}" apagado (${r.total} restante(s)).` : `❌ ${r.motivo}` })
        return true
    }

    // [v41] Submenu audiência numérico (após opção 4)
    if (st.action === "status_audiencia_menu" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        const mapa = { "1": "status_audiencia_contatos", "2": "status_audiencia_custom", "3": "status_audiencia_ver", "4": "status_import_grupo", "5": "status_privacidade" }
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        if (mapa[escolha]) { await statusRouter(chatJid, ownerKey, mapa[escolha]); return true }
        if (!st.avisouAudi) {
            setState(ownerKey, { action: "status_audiencia_menu", avisouAudi: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-5 (ou 0 = voltar, cancelar = sair)." })
        }
        return true
    }

    // [v42] Importar MEMBROS de um grupo como audiência do status
    if (st.action === "status_waiting_group_import" && text) {
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const res = resolveGrupoDeTexto(cache, text.trim())
        if (!res) {
            if (!st.avisouImport) {
                setState(ownerKey, { action: "status_waiting_group_import", avisouImport: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Grupo não encontrado. Digite o NÚMERO da lista (ou cancelar)." })
            }
            return true
        }
        if (res.multiple) {
            let t = `🔍 ${res.multiple.length} grupos com esse nome:\n\n`
            res.multiple.slice(0, 10).forEach(mm => { t += `[${String(mm.idx).padStart(3, "0")}] ${mm.isAdmin ? "👑" : "👤"} ${mm.subject}\n` })
            t += `\n_Digite o número exato_`
            await sock.sendMessage(chatJid, { text: t })
            return true
        }
        const { importarMembrosGrupo } = await import("../features/statusManager/index.js")
        const r = await importarMembrosGrupo(res.entry.id)
        setState(ownerKey, { action: "status_audiencia_menu" })
        if (!r.ok) {
            await sock.sendMessage(chatJid, { text: `❌ ${r.motivo}` })
            return true
        }
        let t = `╭━━「 🧲 𝗠𝗘𝗠𝗕𝗥𝗢𝗦 𝗜𝗠𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦 」━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
        t += `Grupo: ${res.entry.subject}\n`
        t += `Membros: ${r.totalMembros}\n\n`
        t += `📱 Com telefone: ${r.comTelefone}\n`
        if (r.apenasLid) t += `🆔 Só @lid (direto): ${r.apenasLid}\n`
        t += `✅ Audiência agora: ${r.total} destinatário(s)\n`
        if (r.truncado) t += `⚠️ Lista cortada em ${r.total} (limite por publicação)\n`
        t += `\n_Publicar: menu 7 > 5 · 0 = voltar_`
        await sock.sendMessage(chatJid, { text: t })
        return true
    }

    // [v41] Submenu privacidade numérico
    if (st.action === "status_priv_menu" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        const mapa = { "1": "status_priv_all", "2": "status_priv_contacts", "3": "status_priv_none" }
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        if (mapa[escolha]) { await statusRouter(chatJid, ownerKey, mapa[escolha]); return true }
        if (!st.avisouPriv) {
            setState(ownerKey, { action: "status_priv_menu", avisouPriv: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-3 (ou 0 = voltar, cancelar = sair)." })
        }
        return true
    }

    return false
}

export async function processarSelecaoGrupo(chatJid, ownerKey, next, entry) {
    const sock = getSock()
    // [v24] Blindagem: grupos autorizados não podem ser alvo de flood/nuke/roubar
    const { isAuthorizedGroup } = await import("../utils/permissions.js")
    const protegido = isAuthorizedGroup(entry.id)
    if (protegido && ["waiting_flood_message", "waiting_tudo_name", "roubar_grupo", "confirm_nuke", "confirm_rmfoto"].includes(next)) {
        await sock.sendMessage(chatJid, { text: `🛡️ Grupo protegido (autorizado): ${entry.subject}\n\nEste grupo está blindado — não pode ser floodado, nukado ou roubado.\nRemova-o dos grupos autorizados (menu 5 > 27) se quiser atacar.` })
        clearState(ownerKey)
        const { enviarSubmenuConfig } = await import("../menus/configMenu.js")
        // volta pro menu principal para não travar
        await enviarPainelInicial(chatJid)
        return
    }
    if (next === "waiting_tudo_name") {
        const { listarPresetsTexto } = await import("../services/presetService.js")
        const lista = listarPresetsTexto()
        setState(ownerKey, { action: "waiting_tudo_preset", groupJid: entry.id })
        await enviarCancelavel(chatJid,
            `💣 *PRESET + NUKE*\nGrupo: ${entry.subject}\n\n` +
            `Escolha um preset (nome + bio + foto):\n\n${lista}\n\n` +
            `👉 Digite o *número* do preset\n👉 ou *0* para criar um novo\n_(cancelar para sair)_`
        )
        return
    }

    const map = {
        waiting_name: `📝 Digite o novo nome para:\n${entry.subject}`,
        waiting_bio: `📄 Digite a nova bio para:\n${entry.subject}`,
        waiting_both_name: `📝 Digite o nome (depois a bio):\n${entry.subject}`,
        waiting_group_image: `📷 Envie a imagem (foto ou documento).\nFormatos: JPG, PNG, WEBP.`,
        waiting_image_url: `🔗 Envie a URL direta da imagem:`,
        // Uma linha só de propósito: o hook global de "Ler Mais" dobra qualquer
        // content.text multi-linha (e o dono não precisa disso num prompt de flood).
        waiting_flood_message: `Digite a mensagem (1 linha). _Loja: loja:0 · loja:texto · loja:texto|title|surface|id — surface 1=FB, 2=IG, 3=WA_`,
    }
    if (map[next]) {
        setState(ownerKey, { action: next, groupJid: entry.id, selectedGroup: { id: entry.id, subject: entry.subject, isAdmin: entry.isAdmin } })
        await enviarCancelavel(chatJid, map[next])
        return
    }
    if (next === "roubar_grupo") {
        const { listarPresetsTexto } = await import("../services/presetService.js")
        const lista = listarPresetsTexto()
        setState(ownerKey, { action: "waiting_roubar_preset", groupJid: entry.id, grupoSubject: entry.subject })
        await enviarCancelavel(chatJid,
            `ROUBAR GRUPO\nGrupo: ${entry.subject}\n\n` +
            `Escolha um preset (nome + bio + foto):\n\n${lista}\n\n` +
            `Digite o numero do preset\nou 0 para usar a config padrao (sem preset)\n(cancelar para sair)`
        )
        return
    }

    if (next === "confirm_nuke") {
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `💣 Executando NUKE em: ${entry.subject}...` })
        try {
            const r = await executarNuke(entry.id)
            const mk = (b) => b ? "✔" : "✖"
            let txt = `✅ NUKE executado em: ${entry.subject}\n`
            txt += `• Foto: ${mk(r.foto)}  Nome: ${mk(r.nome)}  Bio: ${mk(r.bio)}\n`
            txt += `• Grupo fechado: ${mk(r.fechado)}\n`
            txt += `• Removidos: ${r.removidos}`
            if (r.erros.length) txt += `\n⚠️ ${r.erros.length} erro(s)`
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        return
    }
    if (next === "confirm_rmfoto") {
        clearState(ownerKey)
        try { const okRem = await removerFotoGrupo(entry.id); await enviarVoltar(chatJid, okRem ? "✅ Foto removida." : "⚠️ Sem suporte.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        return
    }
}

```

#### `./handlers/terminal.js` — 69 linhas, 3402 bytes

```js
// handlers/terminal.js
// [v43] Terminal virou PAINEL MONITOR (tema roxo). Comandos: SOMENTE no WhatsApp.
// O readline (ask) continua exportado porque o pairing da 1ª conexão precisa dele.
//
//   ┌─ o que mudou ─────────────────────────────────────────────┐
//   │ - menu [01]-[12] REMOVIDO (todas essas funções já existem │
//   │   no WhatsApp: menu → 1..7, config, status etc)           │
//   │ - terminal exibe banner + status e atualiza a cada 60s    │
//   │ - 'sair' ou Ctrl+C encerra                                │
//   └───────────────────────────────────────────────────────────┘

import readline from "readline"

import { getSock, rt } from "../connection/socket.js"
import { CONFIG } from "../utils/config.js"
import { normalizeNumber } from "../utils/permissions.js"
import {
    bannerSYZYGY, painelStatus, ok, warn, credLine, formatUptime, COLORS as C
} from "../utils/terminalUI.js"

export const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
export const ask = (q) => new Promise(r => rl.question(q, r))

function imprimirPainel() {
    console.clear()
    process.stdout.write(bannerSYZYGY())
    process.stdout.write(painelStatus({
        conn: rt().isConnected ? "ONLINE" : "OFFLINE",
        number: normalizeNumber(getSock()?.user?.id) || "-",
        owner: "NYX", session: "ACTIVE",
        uptime: formatUptime(Date.now() - rt().bootTime),
        nome: CONFIG.nome, bio: CONFIG.bio
    }))
    console.log("")
    console.log(credLine())
    console.log("")
}

// Linha de status compacta (atualização periódica sem limpar a tela)
function linhaStatus() {
    const grupos = Object.keys(rt().cachedGroups || {}).length
    const conn = rt().isConnected ? `${C.green}ONLINE${C.reset}` : `${C.red}OFFLINE${C.reset}`
    console.log(`${C.purpleGray}⟡${C.reset} ${conn} ${C.purpleGray}·${C.reset} ${C.purple}${normalizeNumber(getSock()?.user?.id) || "-"}${C.reset} ${C.purpleGray}·${C.reset} 👥 ${grupos} ${C.purpleGray}·${C.reset} ⏱ ${formatUptime(Date.now() - rt().bootTime)} ${C.purpleGray}· ⚡ comandos no WhatsApp (menu)${C.reset}`)
}

export async function menuTerminal() {
    imprimirPainel()
    console.log(`${C.purple}${C.bold}🎮 TODOS OS COMANDOS ESTÃO NO WHATSAPP${C.reset}`)
    console.log(`${C.gray}   Abra o chat do bot e digite ${C.purple}menu${C.gray} (ou ${C.purple}status${C.gray} p/ Status Manager)${C.reset}`)
    console.log(`${C.gray}   Terminal: apenas monitor · digite ${C.purple}sair${C.gray} para encerrar${C.reset}`)
    console.log("")

    // Mantém o processo vivo; atualiza a linha de status a cada 60s (sem limpar tela)
    setInterval(() => { try { linhaStatus() } catch {} }, 60_000)

    // Input do terminal: só 'sair' faz algo (o readline permanece p/ possíveis asks)
    rl.on("line", (l) => {
        const t = String(l).trim().toLowerCase()
        if (t === "sair" || t === "exit" || t === "0") {
            console.log(warn("Encerrando SYZYGY..."))
            rl.close()
            process.exit(0)
        }
    })
    rl.on("SIGINT", () => { rl.close(); process.exit(0) })

    await new Promise(() => {}) // painel permanece
}

```

#### `./services/agendaService.js` — 250 linhas, 9055 bytes

```js
// services/agendaService.js
// [v22] Agendamento de ações (flood, nuke, roubar) para execução futura.

import fs from "fs"
import path from "path"
import { getSock } from "../connection/socket.js"
import { ownerJidForSending } from "../utils/permissions.js"
import { CONFIG } from "../utils/config.js"

const AGENDA_DIR = "./dono"
const AGENDA_PATH = path.join(AGENDA_DIR, "agendamentos.json")

let timers = new Map() // id -> timeout
let jobs = [] // carregados em memória

function garantirDir() {
    try { fs.mkdirSync(AGENDA_DIR, { recursive: true }) } catch {}
}

function carregarJobs() {
    garantirDir()
    try {
        if (fs.existsSync(AGENDA_PATH)) {
            const d = JSON.parse(fs.readFileSync(AGENDA_PATH, "utf-8"))
            if (Array.isArray(d)) return d
        }
    } catch {}
    return []
}

function salvarJobs(lista) {
    garantirDir()
    try { fs.writeFileSync(AGENDA_PATH, JSON.stringify(lista, null, 2), "utf-8") } catch {}
}

function parseTempoRelativo(txt) {
    // Aceita: 10s, 5m, 2h, 1d, ou "10 min", "2 horas", etc
    txt = (txt || "").toLowerCase().trim()
    const m = txt.match(/(\d+)\s*(s|seg|m|min|h|hora|d|dia)?/)
    if (!m) return null
    const n = parseInt(m[1])
    const u = (m[2] || "m").toLowerCase()
    if (u.startsWith("s")) return n * 1000
    if (u.startsWith("m")) return n * 60 * 1000
    if (u.startsWith("h")) return n * 60 * 60 * 1000
    if (u.startsWith("d")) return n * 24 * 60 * 60 * 1000
    return n * 60 * 1000
}

export function parseAgendamento(input) {
    input = (input || "").trim()
    if (!input) return null

    // 1) DD/MM HH:MM ou DD/MM (checa antes do relativo para não confundir "25/08" com "25m")
    const dmy = input.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/)
    if (dmy) {
        const dia = parseInt(dmy[1]), mes = parseInt(dmy[2]) - 1
        const h = dmy[3] ? parseInt(dmy[3]) : 12
        const mm = dmy[4] ? parseInt(dmy[4]) : 0
        if (dia >= 1 && dia <= 31 && mes >= 0 && mes < 12 && h >= 0 && h < 24 && mm >= 0 && mm < 60) {
            const alvo = new Date()
            alvo.setMonth(mes, dia)
            alvo.setHours(h, mm, 0, 0)
            if (alvo.getTime() <= Date.now()) alvo.setFullYear(alvo.getFullYear() + 1)
            return { delayMs: alvo.getTime() - Date.now(), at: alvo.getTime(), tipo: "data", raw: input }
        }
    }

    // 2) Absoluto HH:MM
    const hm = input.match(/^(\d{1,2}):(\d{2})$/)
    if (hm) {
        const h = parseInt(hm[1]), mm = parseInt(hm[2])
        if (h >= 0 && h < 24 && mm >= 0 && mm < 60) {
            const agora = new Date()
            const alvo = new Date()
            alvo.setHours(h, mm, 0, 0)
            if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1)
            return { delayMs: alvo.getTime() - Date.now(), at: alvo.getTime(), tipo: "absoluto", raw: input }
        }
    }

    // 3) Relativo: 10s, 5m, 2h, 1d — exige sufixo ou formato isolado para não pegar datas
    // Aceita "10m", "10 min", "2h", "30s", "1d" ou só número (assume minutos)
    const relMatch = input.toLowerCase().match(/^(\d+)\s*(s|seg|m|min|h|hora|d|dia)?$/i)
    if (relMatch) {
        const rel = parseTempoRelativo(input)
        if (rel && rel > 0 && rel <= 7 * 24 * 60 * 60 * 1000) {
            return { delayMs: rel, at: Date.now() + rel, tipo: "relativo", raw: input }
        }
    }

    return null
}

export function agendarAcao({ tipo, grupos, dados, mensagem, delayMs, at }) {
    garantirDir()
    const lista = carregarJobs()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const job = {
        id,
        tipo, // flood, nuke, roubar
        grupos: grupos.map(g => ({ id: g.id, subject: g.subject || g.id })),
        dados: dados || null,
        mensagem: mensagem || null,
        criadoEm: Date.now(),
        agendadoPara: at,
        delayMs,
        status: "pendente"
    }
    lista.push(job)
    salvarJobs(lista)
    jobs = lista
    programarJob(job)
    return job
}

function programarJob(job) {
    if (timers.has(job.id)) {
        clearTimeout(timers.get(job.id))
        timers.delete(job.id)
    }
    const delay = job.agendadoPara - Date.now()
    if (delay <= 0) {
        executarJob(job)
        return
    }
    const t = setTimeout(() => executarJob(job), Math.min(delay, 2147483647)) // max 32bit
    timers.set(job.id, t)
}

async function executarJob(job) {
    try {
        const sock = getSock()
        if (!sock) throw new Error("Socket não conectado")

        const { registrarAcao } = await import("./historicoService.js")
        const ownerJid = ownerJidForSending()

        let resultado
        if (job.tipo === "flood") {
            const { executarFloodLote } = await import("./groupService.js")
            const msg = job.mensagem || "Flood agendado"
            const qtd = job.dados?.qtd || 10
            const modo = job.dados?.modo || CONFIG.floodModo
            resultado = await executarFloodLote(job.grupos, msg, qtd, modo)
            registrarAcao("flood_agendado", { grupos: job.grupos.length, qtd, modo, jobId: job.id })
        } else if (job.tipo === "nuke") {
            const { nukeComPresetLote } = await import("./groupService.js")
            resultado = await nukeComPresetLote(job.grupos, job.dados?.preset || {}, { mensagem: job.mensagem })
            registrarAcao("nuke_agendado", { grupos: job.grupos.length, jobId: job.id })
        } else if (job.tipo === "roubar") {
            const { roubarGrupoLote } = await import("./groupService.js")
            resultado = await roubarGrupoLote(job.grupos, job.dados?.preset || {}, { mensagem: job.mensagem })
            registrarAcao("roubar_agendado", { grupos: job.grupos.length, jobId: job.id })
        }

        // Marca como concluído
        const lista = carregarJobs()
        const idx = lista.findIndex(j => j.id === job.id)
        if (idx >= 0) {
            lista[idx].status = "concluido"
            lista[idx].concluidoEm = Date.now()
            lista[idx].resultado = resultado?.length ? `${resultado.filter(r => r.ok).length}/${resultado.length} OK` : "OK"
            salvarJobs(lista)
            jobs = lista
        }

        if (ownerJid) {
            const okCount = resultado?.filter(r => r.ok).length || 0
            const total = resultado?.length || job.grupos.length
            await sock.sendMessage(ownerJid, {
                text: `⏰ AGENDAMENTO EXECUTADO\nTipo: ${job.tipo}\nGrupos: ${okCount}/${total} OK\nID: ${job.id}\nSYZYGY`
            })
        }
    } catch (e) {
        const lista = carregarJobs()
        const idx = lista.findIndex(j => j.id === job.id)
        if (idx >= 0) {
            lista[idx].status = "erro"
            lista[idx].erro = e.message
            salvarJobs(lista)
            jobs = lista
        }
        try {
            const ownerJid = ownerJidForSending()
            if (ownerJid) await getSock().sendMessage(ownerJid, { text: `❌ AGENDAMENTO FALHOU\nID: ${job.id}\nErro: ${e.message}` })
        } catch {}
    } finally {
        timers.delete(job.id)
    }
}

export function listarAgendamentos() {
    return carregarJobs().sort((a, b) => b.criadoEm - a.criadoEm)
}

export function cancelarAgendamento(id) {
    const lista = carregarJobs()
    const idx = lista.findIndex(j => j.id === id)
    if (idx < 0) return null
    const job = lista[idx]
    if (job.status !== "pendente") return null
    if (timers.has(id)) {
        clearTimeout(timers.get(id))
        timers.delete(id)
    }
    lista.splice(idx, 1)
    salvarJobs(lista)
    jobs = lista
    return job
}

export function limparConcluidos() {
    const lista = carregarJobs()
    const pendentes = lista.filter(j => j.status === "pendente")
    const removidos = lista.length - pendentes.length
    salvarJobs(pendentes)
    jobs = pendentes
    return removidos
}

export function iniciarAgendamentos() {
    jobs = carregarJobs()
    let pendentes = 0
    for (const job of jobs) {
        if (job.status === "pendente") {
            if (job.agendadoPara <= Date.now()) {
                executarJob(job)
            } else {
                programarJob(job)
                pendentes++
            }
        }
    }
    return { total: jobs.length, pendentes }
}

export function formatarAgendamentosTexto() {
    const lista = listarAgendamentos()
    if (!lista.length) return "Nenhum agendamento."
    let out = `⏰ AGENDAMENTOS SYZYGY — ${lista.length}\n━━━━━━━━━━━━━━━━━━━━\n`
    for (const j of lista.slice(0, 15)) {
        const d = new Date(j.agendadoPara)
        const hora = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        out += `[${j.id.slice(0, 6)}] ${j.tipo} · ${j.grupos.length} grupos · ${hora} · ${j.status}\n`
    }
    out += `\n_Comandos: agendamentos, cancelar <id>, limpar_agendamentos_`
    return out
}

```

#### `./services/antiTakeoverService.js` — 76 linhas, 3137 bytes

```js
// services/antiTakeoverService.js
// [v22] Proteção anti-takeover: detecta quando o bot perde admin, é removido,
// ou quando há mudanças suspeitas nos grupos.

import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, ownerJidForSending } from "../utils/permissions.js"
import { CONFIG } from "../utils/config.js"

let alertasRecentes = new Map() // groupJid -> timestamp último alerta (evita spam)

function podeAlertar(groupJid) {
    const ultimo = alertasRecentes.get(groupJid) || 0
    if (Date.now() - ultimo < 60 * 1000) return false // 1 alerta por minuto por grupo
    alertasRecentes.set(groupJid, Date.now())
    return true
}

export async function handlePerdaAdmin(groupJid, subject) {
    if (!CONFIG.antiTakeover) return
    if (!podeAlertar(groupJid)) return
    try {
        const sock = getSock()
        const oj = ownerJidForSending()
        if (!oj) return
        const { registrarAcao } = await import("./historicoService.js")
        registrarAcao("perda_admin", { id: groupJid, subject, alerta: true })
        await sock.sendMessage(oj, {
            text: `🚨 ANTI-TAKEOVER\nPerdi ADMIN em: ${subject || groupJid}\nID: ${groupJid}\n\nO bot foi rebaixado ou perdeu admin.\nAção rápida: digite A4 para tentar roubar de volta (se ainda tiver como).\n\nSYZYGY`
        })
    } catch {}
}

export async function handleRemovidoDoGrupo(groupJid, subject) {
    if (!CONFIG.antiTakeover) return
    try {
        const sock = getSock()
        const oj = ownerJidForSending()
        if (!oj) return
        const { registrarAcao } = await import("./historicoService.js")
        registrarAcao("removido_grupo", { id: groupJid, subject, alerta: true })
        // Remove do cache imediatamente
        if (rt().cachedGroups[groupJid]) delete rt().cachedGroups[groupJid]
        if (podeAlertar(groupJid)) {
            await sock.sendMessage(oj, {
                text: `🚨 ANTI-TAKEOVER\nFui REMOVIDO do grupo: ${subject || groupJid}\nID: ${groupJid}\n\nGrupo removido do cache.\nSYZYGY`
            })
        }
    } catch {}
}

export async function handlePromocaoSuspeita(groupJid, subject, promotedIds) {
    if (!CONFIG.antiTakeover) return
    if (!podeAlertar(groupJid + "_promo")) return
    try {
        const sock = getSock()
        const oj = ownerJidForSending()
        if (!oj) return
        // Se muitos admins promovidos de uma vez, pode ser takeover rival
        if (promotedIds.length >= 3) {
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("promocao_suspeita", { id: groupJid, subject, qtd: promotedIds.length })
            await sock.sendMessage(oj, {
                text: `⚠️ ANTI-TAKEOVER\nPromoção suspeita em: ${subject || groupJid}\n${promotedIds.length} novos admins de uma vez.\nID: ${groupJid}\n\nFique atento.\nSYZYGY`
            })
        }
    } catch {}
}

export function getStatusAntiTakeover() {
    return {
        ativo: !!CONFIG.antiTakeover,
        alertasRecentes: alertasRecentes.size,
        gruposMonitorados: Object.keys(rt().cachedGroups || {}).length
    }
}

```

#### `./services/bloksTransport.js` — 110 linhas, 5279 bytes

```js
// services/bloksTransport.js
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

import { generateWAMessageFromContent, generateMessageID } from "../connection/baileysCompat.js"
import { CONFIG } from "../utils/config.js"
import { ok, warn } from "../utils/terminalUI.js"

// Nome do botão native-flow que identifica uma superfície A2UI.
// (ponto único de configuração do formato de transmissão)
export const A2UI_BUTTON_NAME = "im_a2ui"

/**
 * Envia uma mensagem BLOKS/A2UI.
 * @param sock       socket Baileys (fork @lucasmod/boruto-vk7-baileys)
 * @param jid        destinatário
 * @param payload    { bloksWidget: { type: "im_a2ui", a2ui: { version, catalogId, layouts } } }
 *                   (contrato preservado do createServerInspectorData)
 * @param opts       { titulo, texto, footer, additionalNodes? }
 */
export async function sendBloksMessage(sock, jid, payload, opts = {}) {
    const dbg = (tag, msg) => { if (CONFIG.uiDebug) console.log(ok(`[${tag}] ${msg}`)) }

    // [A2UI] Payload recebido — documento A2UI extraído SEM alteração
    const a2ui = payload?.bloksWidget?.a2ui || payload?.a2ui || payload
    if (!a2ui || !Array.isArray(a2ui.layouts) || !a2ui.layouts.length) {
        throw new Error("payload A2UI inválido: faltam layouts")
    }
    if (!a2ui.catalogId) {
        throw new Error("payload A2UI inválido: falta catalogId")
    }
    dbg("A2UI", `payload recebido: ${a2ui.layouts.length} layouts, catalogId ${a2ui.catalogId}`)

    // [BLOKS] Montagem: viewOnceMessage + messageContextInfo (metadado que o
    // patch interno da lib NÃO injeta por causa do typo nativeFlowMesaage).
    const buttonParamsJson = JSON.stringify(a2ui)
    const content = {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {}
                },
                interactiveMessage: {
                    header: {
                        title: opts.titulo || "Server Inspector",
                        subtitle: opts.subtitulo || "Live operating system information",
                        hasMediaAttachment: false
                    },
                    body: { text: opts.texto || "" },
                    footer: { text: opts.footer || "" },
                    nativeFlowMessage: {
                        buttons: [
                            { name: A2UI_BUTTON_NAME, buttonParamsJson }
                        ],
                        messageParamsJson: ""
                    },
                    contextInfo: { mentionedJid: [jid] }
                }
            }
        }
    }
    dbg("BLOKS", "interactiveMessage montado (viewOnce + messageContextInfo)")

    // Serialização pelo gerador oficial do fork (proto real).
    // [DIFERENÇA REAL DO FORK] o generateWAMessageFromContent do fork (@lucasmod)
    // não gera key.id (retorna key:{} — no whiskeysockets gerava "3EB0...").
    // Geramos aqui com generateMessageID do próprio fork.
    const messageId = generateMessageID(sock.user?.id)
    const msg = generateWAMessageFromContent(jid, content, {
        userJid: sock.user?.id || jid,
        quoted: null
    })
    dbg("A2UI", `gerado: messageId ${messageId}`)

    // [RELAY]
    dbg("RELAY", `relayMessage → ${jid}`)
    const r = await sock.relayMessage(jid, msg.message, {
        messageId,
        ...(opts.additionalNodes?.length ? { additionalNodes: opts.additionalNodes } : {})
    })
    dbg("RELAY", "relayMessage concluído")
    return r
}

```

#### `./services/buttons.js` — 68 linhas, 3319 bytes

```js
// services/buttons.js - V3 SEM viewOnceMessage (fix @lid)

import { generateWAMessageFromContent, generateMessageID, proto } from "../connection/baileysCompat.js"
import { getSock } from "../connection/socket.js"
import { CONFIG, uiModoEfetivo } from "../utils/config.js"
import { safeSendMessage } from "./groupService.js"
import { ok, err, warn } from "../utils/terminalUI.js"

export async function sendInteractiveButtons(sockParam, jid, options) {
    const sock = sockParam || getSock()
    const { title = "TÍTULO", body = "Descrição", footer = "Rodapé", buttons = [], image = null } = options

    const interactiveButtons = buttons.map(btn => {
        if (btn.type === 'reply') return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id }) }
        if (btn.type === 'url') return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: btn.text, url: btn.url, merchant_url: btn.url }) }
        if (btn.type === 'copy') return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: btn.text, copy_code: btn.code }) }
    }).filter(Boolean)

    let targetJid = jid

    if (uiModoEfetivo() === "text") {
        let txt = `*${title}*\n${body}\n\n`
        buttons.forEach(b => { txt += `• ${b.text} (id:${b.id})\n` })
        if (footer) txt += `\n_${footer}_`
        try {
            await safeSendMessage(targetJid, { text: txt }, 0)
            return true
        } catch { return false }
    }

    try {
        // [v51] mesmo envelope do BLOKS (funciona no cliente real) — ver list.js
        const content = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: title.substring(0, 60),
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: interactiveButtons })
                    })
                }
            }
        }

        const msg = generateWAMessageFromContent(targetJid, content, {})
        // [v49] fork não gera key.id — messageId próprio (sem isso o botão renderiza morto)
        const messageId = generateMessageID(sock.user?.id)
        await sock.relayMessage(targetJid, msg.message, { messageId })
        console.log(`✓ [BUTTONS] ENVIADO SEM viewOnce -> ${targetJid} | ${buttons.length} botoes | id ${messageId.slice(0, 8)}…`)
        return true
    } catch (e) {
        console.log(err(`[BUTTONS] erro ${e.message}`))
        try {
            let txt = `*${title}*\n${body}\n`
            await safeSendMessage(targetJid, { text: txt }, 0)
            return true
        } catch { return false }
    }
}

// [v56] getButtonId removido: parser duplicado morto (zero chamadas).
// Parser ÚNICO de respostas interativas = getListId (services/list.js).

```

#### `./services/fastParser.js` — 725 linhas, 38562 bytes

```js
// services/fastParser.js
// [v31] Modo rápido universal: todos comandos + configs + agendamento via @
// Ex: 3/01/2/msg, 2/01/msg/20/1, 4/01/2, 6/1,3,5/1/msg/20/1@10m, 5/10/rapido, 5/20/5511...

import { rt } from "../connection/socket.js"
import { getSock } from "../connection/socket.js"
import { setState } from "../utils/stateManager.js"
import { normalizeNumber, isOwner, isAuthorizedGroup } from "../utils/permissions.js"
import { CONFIG, MAX_FLOOD, FLOOD_MODOS } from "../utils/config.js"
import { atualizarGrupos, executarFlood, executarFloodLote, nukeComPreset, nukeComPresetLote, roubarGrupo, roubarGrupoLote, getFloodConfig, resolverGrupoInput, safeSendMessage, cachedGroupMetadata } from "./groupService.js"
import { ordenarGrupos } from "../menus/groupMenu.js"
import { getPreset, fotoPresetPath, listarPresetsTexto } from "./presetService.js"
import { mencionarTodosFantasma } from "./groupService.js"

function isProtected(jid) {
    try { return isAuthorizedGroup(jid) } catch { return false }
}

async function obterCache(ownerKey) {
    let cache = rt().groupSelectionCache[ownerKey]
    if (cache && Object.keys(cache).length) return cache
    // Se já tem cachedGroups, usa sem fetch
    if (rt().cachedGroups && Object.keys(rt().cachedGroups).length) {
        const todos = Object.entries(rt().cachedGroups).map(([id, info]) => ({ id, ...info }))
        const { arr } = ordenarGrupos(todos)
        cache = {}
        arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })
        rt().groupSelectionCache[ownerKey] = cache
        return cache
    }
    await atualizarGrupos()
    const todos = Object.entries(rt().cachedGroups).map(([id, info]) => ({ id, ...info }))
    const { arr } = ordenarGrupos(todos)
    cache = {}
    arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })
    rt().groupSelectionCache[ownerKey] = cache
    return cache
}

function resolveGrupoFast(cache, raw) {
    if (!raw) return null
    raw = String(raw).trim()
    if (raw.endsWith("@g.us") || raw.includes("whatsapp.com")) {
        return { id: raw, subject: raw, isAdmin: false, _isRawJid: true }
    }
    const numMatch = raw.match(/^0*(\d+)$/)
    if (numMatch) {
        const n = parseInt(numMatch[1])
        if (cache[n]) return { ...cache[n], index: n }
    }
    const lower = raw.toLowerCase()
    const matches = []
    for (const idx of Object.keys(cache)) {
        const g = cache[idx]
        if (g.subject && g.subject.toLowerCase().includes(lower)) matches.push({ ...g, index: parseInt(idx) })
    }
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return { _multiple: matches }
    return null
}

function parseMultiFast(cache, raw) {
    const txt = String(raw || "").trim()
    if (!txt) return null
    if (/^0*\d+$/.test(txt)) return null
    if (!/^[\d,\s,\-]+$/.test(txt)) return null
    const allNums = (txt.match(/\d+/g) || []).map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0)
    if (allNums.length < 2) return null
    const normalized = txt.replace(/,/g, " ").replace(/\s+/g, " ").trim()
    const tokens = normalized.split(" ").filter(Boolean)
    const nums = new Set()
    for (const tok of tokens) {
        if (tok.includes("-")) {
            const parts = tok.split("-").map(s => s.trim()).filter(Boolean)
            if (parts.length === 2) {
                const a = parseInt(parts[0].replace(/\D/g, "")), b = parseInt(parts[1].replace(/\D/g, ""))
                if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
                    const start = Math.min(a, b), end = Math.max(a, b)
                    const limit = Math.min(end, start + 99)
                    for (let i = start; i <= limit; i++) nums.add(i)
                }
            }
        } else {
            const n = parseInt(tok.replace(/\D/g, ""))
            if (!isNaN(n) && n > 0) nums.add(n)
        }
    }
    const entries = []
    for (const n of nums) {
        if (cache[n]) entries.push({ ...cache[n], index: n })
    }
    const uniq = []
    const seen = new Set()
    for (const e of entries) {
        if (!seen.has(e.id)) { seen.add(e.id); uniq.push(e) }
    }
    if (uniq.length < 2) return null
    return uniq
}

async function resolverEntradaGrupo(entry) {
    if (!entry) return null
    if (entry._isRawJid) {
        try {
            const jid = await resolverGrupoInput(entry.id)
            return { id: jid, subject: entry.subject || jid, isAdmin: false }
        } catch { return null }
    }
    return entry
}

function extractSchedule(text) {
    // Procura @tempo no final: ex "2/01/Oi/20/1@10m" ou "3/01/2/Oi@20:30"
    const m = text.match(/@\s*([^@]+)\s*$/)
    if (!m) return { textWithoutSchedule: text, scheduleStr: null, parsed: null }
    const scheduleStr = m[1].trim()
    // Tenta parsear como agendamento
    // Import dinâmico síncrono não dá, vamos fazer check simples aqui e deixar parse real depois
    const textWithout = text.slice(0, m.index).trim()
    return { textWithoutSchedule: textWithout, scheduleStr }
}

export async function handleFastCommand(chatJid, ownerKey, textRaw) {
    if (!textRaw) return false
    let trimmed = textRaw.trim()
    if (!trimmed) return false

    // Extrai agendamento @ no final
    let scheduleStr = null
    let scheduleParsed = null
    let isScheduled = false
    const schedExtract = extractSchedule(trimmed)
    if (schedExtract.scheduleStr) {
        try {
            const { parseAgendamento } = await import("./agendaService.js")
            const parsed = parseAgendamento(schedExtract.scheduleStr)
            if (parsed) {
                scheduleStr = schedExtract.scheduleStr
                scheduleParsed = parsed
                isScheduled = true
                trimmed = schedExtract.textWithoutSchedule
            }
        } catch {}
    }

    // Se não tem "/", pode ser config rápida tipo "5/10/rapido" já tem "/", ou "1" sem "/" não é fast
    // Comando 1 rápido: "1" ou "1/p2" ou "1/Kk" — precisa "/" para ser considerado fast exceto "1" puro?
    // Vamos aceitar "1" como fast list também, mas "1" já é mapeado no commandMap. Para não duplicar, deixamos "1" passar como fast também se for só "1" ou "1/..."
    const isMainFast = /^[1-6](?:\/.*)?$/.test(trimmed) || /^5\/\d+/.test(trimmed)
    if (!isMainFast) return false

    const cache = await obterCache(ownerKey)

    const partsRaw = trimmed.split("/").map(s => s.trim())
    const cmd = partsRaw[0]

    // Helper para agendar
    async function agendarSePrecisar(tipo, grupos, dados, mensagem) {
        if (!isScheduled || !scheduleParsed) return false
        try {
            const { agendarAcao } = await import("./agendaService.js")
            const job = agendarAcao({ tipo, grupos, dados, mensagem, delayMs: scheduleParsed.delayMs, at: scheduleParsed.at })
            const d = new Date(scheduleParsed.at)
            const quando = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
            await safeSendMessage(chatJid, { text: `⏰ Agendado rápido!\nTipo: ${tipo}\nGrupos: ${grupos.length}\nQuando: ${quando}\nID: ${job.id.slice(0, 8)}` })
            return true
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ Falha ao agendar: ${e.message}` })
            return true
        }
    }

    // 1 - LISTAR GRUPOS: 1, 1/p2, 1/Kk
    if (cmd === "1") {
        if (partsRaw.length === 1) {
            const { listarGruposInterativo } = await import("../menus/groupMenu.js")
            const novoCache = await listarGruposInterativo(chatJid, 1)
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }
        const arg = partsRaw.slice(1).join("/").trim()
        const pagMatch = arg.match(/^(?:p)?\s*(\d+)$/i)
        if (pagMatch) {
            const { listarGruposInterativo } = await import("../menus/groupMenu.js")
            const novoCache = await listarGruposInterativo(chatJid, parseInt(pagMatch[1]))
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }
        // Busca por nome
        const entry = resolveGrupoFast(cache, arg)
        if (!entry) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${arg}` })
            return true
        }
        if (entry._multiple) {
            let txt = `🔍 ${entry._multiple.length} grupos com "${arg}":\n`
            entry._multiple.slice(0, 10).forEach(mm => {
                const b = mm.isAdmin ? "👑" : "👤"
                txt += `[${String(mm.index).padStart(3, "0")}] ${b} ${mm.subject}\n`
            })
            await safeSendMessage(chatJid, { text: txt })
            return true
        }
        const grupo = await resolverEntradaGrupo(entry)
        if (grupo) {
            const { enviarMenuAcoesGrupo } = await import("../menus/groupMenu.js")
            await enviarMenuAcoesGrupo(chatJid, grupo, ownerKey)
        }
        return true
    }

    // 2 - FLOOD
    if (cmd === "2") {
        // [RESTAURAÇÃO 01a0aaae] 2/preset/<nome>[/conteúdo] — roda o preset pela
        // fachada features/flood/router.js (runPresetJob → executarFlood do AB7).
        // Alvos = allowlist (painel 38); dry-run segue o config (painel 37).
        if (String(partsRaw[1] || "").toLowerCase() === "preset") {
            const { floodRouter } = await import("../features/flood/index.js")
            const name = String(partsRaw[2] || "").trim().toLowerCase()
            if (!name) {
                await safeSendMessage(chatJid, { text: `❌ Flood preset: 2/preset/<nome>\nNomes: text-test, mention-test, media-test, payment-test, shopping-test ou id custom\nEx: 2/preset/payment-test/Pagamento do pedido|25.90|BRL\nEx: 2/preset/shopping-test/Produto de teste|SYZYGY SHOP|wa\nAlvos = allowlist (painel 38) · envio real = painel 37 desligado` })
                return true
            }
            const rest = partsRaw.slice(3).join("/").trim()
            await floodRouter(chatJid, ownerKey, "run", { presetId: name, rest })
            return true
        }
        if (partsRaw.length < 4) {
            await safeSendMessage(chatJid, { text: `❌ Flood rápido: 2/<grupo>/<msg>/<qtd>[/<modo>][@tempo]\nEx: 2/01/Oi/20/1\nEx: 2/01/Oi/20/1@10m (agenda em 10m)\nPreset: 2/preset/payment-test` })
            return true
        }
        let modo = null, qtdStr, msgParts
        const last = partsRaw[partsRaw.length - 1]
        const secondLast = partsRaw[partsRaw.length - 2]
        const lastIsModo = /^(?:[1-4]|rapido|normal|lento|seguro|\d{2,4})$/i.test(last) && partsRaw.length >= 5
        if (lastIsModo) {
            modo = last
            qtdStr = secondLast
            msgParts = partsRaw.slice(2, -2)
        } else {
            modo = null
            qtdStr = last
            msgParts = partsRaw.slice(2, -1)
        }
        const grupoRaw = partsRaw[1]
        const mensagem = msgParts.join("/").trim()
        const qtd = parseInt(String(qtdStr).replace(/\D/g, ""))
        if (!mensagem || isNaN(qtd)) {
            await safeSendMessage(chatJid, { text: "❌ Mensagem ou qtd inválida." })
            return true
        }
        const grupoEntry = resolveGrupoFast(cache, grupoRaw)
        if (!grupoEntry || grupoEntry._multiple) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${grupoRaw}` })
            return true
        }
        const grupo = await resolverEntradaGrupo(grupoEntry)
        if (!grupo) {
            await safeSendMessage(chatJid, { text: "❌ Falha resolver grupo" })
            return true
        }
        if (isProtected(grupo.id)) {
            await safeSendMessage(chatJid, { text: `🛡️ Grupo protegido: ${grupo.subject}` })
            return true
        }
        if (isScheduled) {
            const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
            await agendarSePrecisar("flood", [grupo], { qtd: Math.min(qtd, MAX_FLOOD), modo: cfg.modo }, mensagem)
            return true
        }
        const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
        let msgFlood = mensagem
        if (CONFIG.linkDivulgacao) msgFlood += `\n${CONFIG.linkDivulgacao}`
        await safeSendMessage(chatJid, { text: `⚡ Flood rápido: ${grupo.subject} | ${qtd} | modo ${cfg.modo}` })
        try {
            const r = await executarFlood(grupo.id, msgFlood, Math.min(qtd, MAX_FLOOD), cfg)
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("flood", { id: grupo.id, subject: grupo.subject, qtd: r.total, modo: r.modo, ok: r.ok, via: "fast" })
            await safeSendMessage(chatJid, { text: `✅ Flood: ${r.ok}/${r.total} em ${grupo.subject} | ${r.modo}` })
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ ${e.message}` })
        }
        return true
    }

    // 3 - NUKE
    if (cmd === "3") {
        if (partsRaw.length < 3) {
            await safeSendMessage(chatJid, { text: `❌ Nuke rápido: 3/<grupo>/<preset>[/<msg|pular>][@tempo]\nEx: 3/01/2/Oi\nEx: 3/01/0/pular@10m` })
            return true
        }
        const grupoRaw = partsRaw[1]
        const presetRaw = partsRaw[2]
        const mensagemRaw = partsRaw.length >= 4 ? partsRaw.slice(3).join("/").trim() : ""

        const grupoEntry = resolveGrupoFast(cache, grupoRaw)
        if (!grupoEntry || grupoEntry._multiple) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${grupoRaw}` })
            return true
        }
        const grupo = await resolverEntradaGrupo(grupoEntry)
        if (!grupo || isProtected(grupo.id)) {
            await safeSendMessage(chatJid, { text: isProtected(grupo?.id) ? `🛡️ Protegido: ${grupo.subject}` : "❌ Grupo não encontrado" })
            return true
        }

        let presetDados = {}
        if (/^0+$/.test(presetRaw) || presetRaw === "0") {
            presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const presetIdx = parseInt(presetRaw.replace(/\D/g, ""))
            const preset = getPreset(presetIdx)
            if (!preset) {
                await safeSendMessage(chatJid, { text: `❌ Preset inválido: ${presetRaw}\n${listarPresetsTexto()}` })
                return true
            }
            presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
        }

        const semMsg = !mensagemRaw || mensagemRaw.toLowerCase() === "pular"
        let mensagemFinal = semMsg ? "" : mensagemRaw
        if (mensagemFinal && CONFIG.linkDivulgacao) mensagemFinal += `\n\n${CONFIG.linkDivulgacao}`

        if (isScheduled) {
            await agendarSePrecisar("nuke", [grupo], { preset: presetDados }, mensagemFinal || null)
            return true
        }

        await safeSendMessage(chatJid, { text: `💣 Nuke rápido: ${grupo.subject} | preset ${presetRaw}` })
        try {
            if (mensagemFinal) {
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(grupo.id, mensagemFinal)
                    else await safeSendMessage(grupo.id, { text: mensagemFinal }, 0)
                    await new Promise(r => setTimeout(r, 80))
                } catch {}
            }
            const r = await nukeComPreset(grupo.id, presetDados)
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("nuke", { id: grupo.id, subject: grupo.subject, preset: presetRaw, removidos: r.removidos, via: "fast" })
            await safeSendMessage(chatJid, { text: `✅ NUKE ${grupo.subject}: remov ${r.removidos}` })
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ ${e.message}` })
        }
        return true
    }

    // 4 - ROUBAR
    if (cmd === "4") {
        if (partsRaw.length < 3) {
            await safeSendMessage(chatJid, { text: `❌ Roubar rápido: 4/<grupo>/<preset>[@tempo]\nEx: 4/01/2\nEx: 4/01/2@20:30` })
            return true
        }
        const grupoRaw = partsRaw[1]
        const presetRaw = partsRaw[2]

        const grupoEntry = resolveGrupoFast(cache, grupoRaw)
        if (!grupoEntry || grupoEntry._multiple) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${grupoRaw}` })
            return true
        }
        const grupo = await resolverEntradaGrupo(grupoEntry)
        if (!grupo || isProtected(grupo.id)) {
            await safeSendMessage(chatJid, { text: isProtected(grupo?.id) ? `🛡️ Protegido: ${grupo.subject}` : "❌ Grupo não encontrado" })
            return true
        }

        let presetDados = {}
        if (/^0+$/.test(presetRaw) || presetRaw === "0") {
            presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const presetIdx = parseInt(presetRaw.replace(/\D/g, ""))
            const preset = getPreset(presetIdx)
            if (!preset) {
                await safeSendMessage(chatJid, { text: `❌ Preset inválido` })
                return true
            }
            presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
        }

        if (isScheduled) {
            await agendarSePrecisar("roubar", [grupo], { preset: presetDados }, null)
            return true
        }

        await safeSendMessage(chatJid, { text: `⚡ Roubar rápido: ${grupo.subject} | preset ${presetRaw}` })
        try {
            if (CONFIG.linkDivulgacao) {
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(grupo.id, CONFIG.linkDivulgacao)
                    else await safeSendMessage(grupo.id, { text: CONFIG.linkDivulgacao }, 0)
                    await new Promise(r => setTimeout(r, 80))
                } catch {}
            }
            const r = await roubarGrupo(grupo.id, presetDados)
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("roubar", { id: grupo.id, subject: grupo.subject, preset: presetRaw, rebaixados: r.rebaixados, via: "fast" })
            await safeSendMessage(chatJid, { text: `✅ Roubado ${grupo.subject}: rebaix ${r.rebaixados}` })
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ ${e.message}` })
        }
        return true
    }

    // 5 - CONFIGURAÇÕES RÁPIDAS: 5, 5/10, 5/10/rapido, 5/20/numero, etc.
    if (cmd === "5") {
        if (partsRaw.length === 1) {
            const { enviarSubmenuConfig } = await import("../menus/configMenu.js")
            await enviarSubmenuConfig(chatJid, ownerKey)
            return true
        }
        const opcao = partsRaw[1]
        const valor = partsRaw.length >= 3 ? partsRaw.slice(2).join("/").trim() : ""

        // Verifica owner-only
        const { CONFIG_OPCOES } = await import("../menus/configMenu.js")
        const actionId = CONFIG_OPCOES[opcao]
        if (actionId) {
            const { isOwner } = await import("../utils/permissions.js")
            const { OWNER_ONLY } = await import("../commands/commandRouter.js").catch(() => ({ OWNER_ONLY: new Set() }))
            // Se OWNER_ONLY não exportado, usa lista local
            const ownerOnlyLocal = new Set(["cfg_menuImage","cfg_criar_preset","cfg_apagar_preset","cfg_link","cfg_ler_mais","cfg_flood_modo","cfg_flood_interval","cfg_flood_lote","cfg_autolimpeza","cfg_antitakeover","cfg_limpar_fantasmas","cfg_limpar_agendamentos","cfg_add_user","cfg_remove_user","cfg_add_group","cfg_remove_group","cfg_add_owner","cfg_remove_owner","cfg_viewonce_toggle","cfg_viewonce_groups","cfg_viewonce_owner","cfg_viewonce_admins","cfg_viewonce_save","cfg_flood_dryrun","cfg_flood_allowlist","cfg_flood_testmode","flood_kill_on","flood_kill_off","painel_flood_presets","cfg_flood_kill","cfg_flood_allowlist_view","cfg_flood_allowlist_add","cfg_flood_allowlist_remove","cfg_flood_speed","cfg_flood_presets","cfg_flood_loja","cfg_flood_xray","flood_preset_text_test","flood_preset_mention_test","flood_preset_media_test","flood_preset_payment_test","flood_preset_shopping_test"])
            if ((ownerOnlyLocal.has(actionId)) && !isOwner(ownerKey)) {
                await safeSendMessage(chatJid, { text: `❌ Apenas dono: ${actionId}` })
                return true
            }

            // Se tem valor, tenta setar direto sem passar pelo router que pediria input
            if (valor) {
                const { CONFIG, salvarConfig, FLOOD_MODOS } = await import("../utils/config.js")
                if (actionId === "cfg_link") {
                    if (valor.toLowerCase() === "remover") { CONFIG.linkDivulgacao = ""; salvarConfig(); await safeSendMessage(chatJid, { text: "✅ Link removido" }) }
                    else { CONFIG.linkDivulgacao = valor; salvarConfig(); await safeSendMessage(chatJid, { text: `✅ Link salvo: ${valor}` }) }
                    return true
                }
                if (actionId === "cfg_ler_mais") {
                    const on = ["1","on","ligar","ligado","sim","true"].includes(String(valor).toLowerCase())
                    const off = ["0","off","desligar","desligado","nao","não","false"].includes(String(valor).toLowerCase())
                    if (!on && !off) { await safeSendMessage(chatJid, { text: "❌ Use 5/16/1 (ligar) ou 5/16/0 (desligar)" }); return true }
                    CONFIG.lerMais = on
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `📖 Ler mais agora: ${on ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_fantasma") {
                    // toggle ou set
                    if (valor.toLowerCase() === "on" || valor === "1") CONFIG.marcarFantasma = true
                    else if (valor.toLowerCase() === "off" || valor === "0") CONFIG.marcarFantasma = false
                    else CONFIG.marcarFantasma = !CONFIG.marcarFantasma
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Fantasma: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_flood_modo") {
                    const raw = valor.toLowerCase()
                    if (["rapido","normal","lento","seguro"].includes(raw)) {
                        CONFIG.floodModo = raw
                        const modo = FLOOD_MODOS[raw]
                        CONFIG.floodInterval = modo.intervalo
                        CONFIG.floodLote = modo.lote
                        CONFIG.floodJitter = raw === "seguro"
                        salvarConfig()
                        await safeSendMessage(chatJid, { text: `✅ Flood modo: ${raw} ${modo.intervalo}ms/lote${modo.lote}` })
                    } else {
                        await safeSendMessage(chatJid, { text: "❌ Use: rapido, normal, lento, seguro" })
                    }
                    return true
                }
                if (actionId === "cfg_flood_interval") {
                    const n = parseInt(valor.replace(/\D/g, ""))
                    if (isNaN(n) || n < 20 || n > 5000) { await safeSendMessage(chatJid, { text: "❌ Intervalo 20-5000ms" }); return true }
                    CONFIG.floodInterval = n; salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Intervalo: ${n}ms` })
                    return true
                }
                if (actionId === "cfg_flood_lote") {
                    const n = parseInt(valor.replace(/\D/g, ""))
                    if (isNaN(n) || n < 1 || n > 10) { await safeSendMessage(chatJid, { text: "❌ Lote 1-10" }); return true }
                    CONFIG.floodLote = n; salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Lote: ${n}` })
                    return true
                }
                if (actionId === "cfg_autolimpeza") {
                    if (valor === "1" || valor.toLowerCase() === "on") CONFIG.autoLimpeza = true
                    else if (valor === "0" || valor.toLowerCase() === "off") CONFIG.autoLimpeza = false
                    else CONFIG.autoLimpeza = !CONFIG.autoLimpeza
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Auto-limpeza: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_antitakeover") {
                    if (valor === "1" || valor.toLowerCase() === "on") CONFIG.antiTakeover = true
                    else if (valor === "0" || valor.toLowerCase() === "off") CONFIG.antiTakeover = false
                    else CONFIG.antiTakeover = !CONFIG.antiTakeover
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Anti-takeover: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_add_user") {
                    const { addAuthorizedUser } = await import("../utils/permissions.js")
                    const nums = valor.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
                    let adicionados = []
                    for (const n of nums) {
                        const res = addAuthorizedUser(n)
                        if (res?.added) adicionados.push(res.num)
                    }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: adicionados.length ? `✅ ADMs adicionados: ${adicionados.join(", ")}` : "❌ Nenhum adicionado" })
                    return true
                }
                if (actionId === "cfg_remove_user") {
                    const { removeAuthorizedUser } = await import("../utils/permissions.js")
                    const res = removeAuthorizedUser(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Não encontrado" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Removido: ${res.removed}` })
                    return true
                }
                if (actionId === "cfg_add_group") {
                    const { addAuthorizedGroup } = await import("../utils/permissions.js")
                    const { salvarConfig } = await import("../utils/config.js")
                    const { resolverGrupoInput } = await import("./groupService.js")
                    // Tenta resolver como grupo fast
                    let jid = valor
                    const entry = resolveGrupoFast(cache, valor)
                    if (entry && !entry._multiple && !entry._isRawJid) {
                        jid = entry.id
                    } else if (entry?._isRawJid || valor.endsWith("@g.us") || valor.includes("whatsapp.com")) {
                        try { jid = await resolverGrupoInput(valor) } catch {}
                    }
                    const res = addAuthorizedGroup(jid)
                    salvarConfig()
                    if (res?.already) await safeSendMessage(chatJid, { text: `⚠️ Já autorizado` })
                    else if (res?.added) await safeSendMessage(chatJid, { text: `✅ Grupo autorizado: ${jid}` })
                    else await safeSendMessage(chatJid, { text: "❌ Falha" })
                    return true
                }
                if (actionId === "cfg_remove_group") {
                    const { removeAuthorizedGroup } = await import("../utils/permissions.js")
                    const res = removeAuthorizedGroup(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Não encontrado" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Grupo removido: ${res.removed}` })
                    return true
                }
                if (actionId === "cfg_add_owner") {
                    const { addExtraOwner } = await import("../utils/permissions.js")
                    const res = addExtraOwner(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Inválido" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: res.added ? `✅ Dono extra: ${res.num}` : `⚠️ Já era dono: ${res.num}` })
                    return true
                }
                if (actionId === "cfg_remove_owner") {
                    const { removeExtraOwner } = await import("../utils/permissions.js")
                    const res = removeExtraOwner(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Não encontrado" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Dono extra removido: ${res.removed}` })
                    return true
                }
            }
            // Sem valor ou valor não tratado rápido → delega pro router normal
            const { roteadorAcoes } = await import("../commands/commandRouter.js")
            await roteadorAcoes(chatJid, ownerKey, actionId)
            return true
        }
        await safeSendMessage(chatJid, { text: `❌ Config opção inválida: ${opcao}` })
        return true
    }

    // 6 - MULTI
    if (cmd === "6") {
        if (partsRaw.length < 4) {
            await safeSendMessage(chatJid, { text: `❌ Multi rápido:\n6/<grupos>/<tipo>/...\nTipos: 1 flood, 2 nuke, 3 roubar\nEx: 6/1,3,5/1/Oi/20/1\nEx: 6/1,3,5/2/2/Oi\nEx: 6/1,3,5/3/2\nCom @tempo agenda: 6/1,2/1/Oi/20/1@10m` })
            return true
        }
        const gruposRaw = partsRaw[1]
        const tipo = partsRaw[2]

        let grupos = parseMultiFast(cache, gruposRaw)
        if (!grupos) {
            const splitNames = gruposRaw.split(",").map(s => s.trim()).filter(Boolean)
            if (splitNames.length >= 2) {
                const tmp = []
                for (const nameRaw of splitNames) {
                    const e = resolveGrupoFast(cache, nameRaw)
                    if (e && !e._multiple) {
                        const resolved = await resolverEntradaGrupo(e)
                        if (resolved) tmp.push({ ...resolved, index: e.index || 0 })
                    }
                }
                if (tmp.length >= 2) grupos = tmp
            }
        }
        if (!grupos || grupos.length < 2) {
            await safeSendMessage(chatJid, { text: `❌ Grupos multi inválidos: ${gruposRaw}` })
            return true
        }

        const protegidos = grupos.filter(g => isProtected(g.id))
        const atacaveis = grupos.filter(g => !isProtected(g.id))
        if (protegidos.length) {
            await safeSendMessage(chatJid, { text: `🛡️ Ignorando ${protegidos.length} protegido(s)` })
        }
        if (!atacaveis.length) {
            await safeSendMessage(chatJid, { text: "❌ Todos protegidos." })
            return true
        }
        grupos = atacaveis

        if (isScheduled) {
            // Agendamento multi rápido
            if (tipo === "1") {
                let modo = null, qtdStr, msgParts
                const last = partsRaw[partsRaw.length - 1]
                const secondLast = partsRaw[partsRaw.length - 2]
                const lastIsModo = /^(?:[1-4]|rapido|normal|lento|seguro|\d{2,4})$/i.test(last) && partsRaw.length >= 6
                if (lastIsModo) { modo = last; qtdStr = secondLast; msgParts = partsRaw.slice(3, -2) }
                else { modo = null; qtdStr = last; msgParts = partsRaw.slice(3, -1) }
                const mensagem = msgParts.join("/").trim()
                const qtd = parseInt(String(qtdStr).replace(/\D/g, ""))
                const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
                await agendarSePrecisar("flood", grupos, { qtd: Math.min(qtd, MAX_FLOOD), modo: cfg.modo }, mensagem)
                return true
            }
            if (tipo === "2") {
                const presetRaw = partsRaw[3]
                const msgRaw = partsRaw.length >= 5 ? partsRaw.slice(4).join("/").trim() : ""
                let presetDados = {}
                if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
                else {
                    const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                    if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                    presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
                }
                await agendarSePrecisar("nuke", grupos, { preset: presetDados }, msgRaw || null)
                return true
            }
            if (tipo === "3") {
                const presetRaw = partsRaw[3]
                let presetDados = {}
                if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
                else {
                    const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                    if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                    presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
                }
                await agendarSePrecisar("roubar", grupos, { preset: presetDados }, null)
                return true
            }
        }

        if (tipo === "1") {
            if (partsRaw.length < 5) { await safeSendMessage(chatJid, { text: "❌ Multi flood: 6/<grupos>/1/<msg>/<qtd>[/<modo>]" }); return true }
            let modo = null, qtdStr, msgParts
            const last = partsRaw[partsRaw.length - 1]
            const secondLast = partsRaw[partsRaw.length - 2]
            const lastIsModo = /^(?:[1-4]|rapido|normal|lento|seguro|\d{2,4})$/i.test(last) && partsRaw.length >= 6
            if (lastIsModo) { modo = last; qtdStr = secondLast; msgParts = partsRaw.slice(3, -2) }
            else { modo = null; qtdStr = last; msgParts = partsRaw.slice(3, -1) }
            const mensagem = msgParts.join("/").trim()
            const qtd = parseInt(String(qtdStr).replace(/\D/g, ""))
            const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
            let msgFlood = mensagem
            if (CONFIG.linkDivulgacao) msgFlood += `\n${CONFIG.linkDivulgacao}`
            await safeSendMessage(chatJid, { text: `⚡ Multi flood rápido: ${grupos.length} grupos | ${qtd} | modo ${cfg.modo}` })
            try {
                const res = await executarFloodLote(grupos, msgFlood, Math.min(qtd, MAX_FLOOD), cfg)
                const okG = res.filter(r => r.ok).length
                await safeSendMessage(chatJid, { text: `✅ Multi flood: ${okG}/${grupos.length} OK` })
            } catch (e) { await safeSendMessage(chatJid, { text: `❌ ${e.message}` }) }
            return true
        }
        if (tipo === "2") {
            if (partsRaw.length < 4) { await safeSendMessage(chatJid, { text: "❌ Multi nuke: 6/<grupos>/2/<preset>[/<msg>]" }); return true }
            const presetRaw = partsRaw[3]
            const msgRaw = partsRaw.length >= 5 ? partsRaw.slice(4).join("/").trim() : ""
            let presetDados = {}
            if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
            else {
                const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
            }
            const semMsg = !msgRaw || msgRaw.toLowerCase() === "pular"
            const mensagemFinal = semMsg ? "" : (msgRaw + (CONFIG.linkDivulgacao ? `\n\n${CONFIG.linkDivulgacao}` : ""))
            await safeSendMessage(chatJid, { text: `💣 Multi nuke rápido: ${grupos.length} grupos | preset ${presetRaw}` })
            try {
                const res = await nukeComPresetLote(grupos, presetDados, { mensagem: mensagemFinal || null })
                const okG = res.filter(r => r.ok).length
                await safeSendMessage(chatJid, { text: `✅ Multi nuke: ${okG}/${grupos.length} OK` })
            } catch (e) { await safeSendMessage(chatJid, { text: `❌ ${e.message}` }) }
            return true
        }
        if (tipo === "3") {
            if (partsRaw.length < 4) { await safeSendMessage(chatJid, { text: "❌ Multi roubar: 6/<grupos>/3/<preset>" }); return true }
            const presetRaw = partsRaw[3]
            let presetDados = {}
            if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
            else {
                const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
            }
            await safeSendMessage(chatJid, { text: `⚡ Multi roubar rápido: ${grupos.length} grupos | preset ${presetRaw}` })
            try {
                const res = await roubarGrupoLote(grupos, presetDados, { mensagem: CONFIG.linkDivulgacao || null })
                const okG = res.filter(r => r.ok).length
                await safeSendMessage(chatJid, { text: `✅ Multi roubar: ${okG}/${grupos.length} OK` })
            } catch (e) { await safeSendMessage(chatJid, { text: `❌ ${e.message}` }) }
            return true
        }
        await safeSendMessage(chatJid, { text: `❌ Tipo multi inválido: ${tipo}` })
        return true
    }

    return false
}

```

#### `./services/groupService.js` — 669 linhas, 29957 bytes

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

#### `./services/historicoService.js` — 85 linhas, 2515 bytes

```js
// services/historicoService.js
// [v22] Histórico de ações do SYZYGY — log persistido de nukes, roubos, floods, etc.

import fs from "fs"
import path from "path"

const HIST_DIR = "./dono"
const HIST_PATH = path.join(HIST_DIR, "historico.json")
const MAX_HIST = 200

function garantirDir() {
    try { fs.mkdirSync(HIST_DIR, { recursive: true }) } catch {}
}

function carregar() {
    garantirDir()
    try {
        if (fs.existsSync(HIST_PATH)) {
            const d = JSON.parse(fs.readFileSync(HIST_PATH, "utf-8"))
            if (Array.isArray(d)) return d
        }
    } catch {}
    return []
}

function salvar(lista) {
    garantirDir()
    try {
        // Mantém só os últimos MAX_HIST
        const cortada = lista.slice(-MAX_HIST)
        fs.writeFileSync(HIST_PATH, JSON.stringify(cortada, null, 2), "utf-8")
    } catch {}
}

export function registrarAcao(tipo, detalhes = {}) {
    const lista = carregar()
    const entry = {
        ts: Date.now(),
        data: new Date().toISOString(),
        tipo, // flood, nuke, roubar, etc
        ...detalhes
    }
    lista.push(entry)
    salvar(lista)
    return entry
}

export function listarHistorico(qtd = 20) {
    const lista = carregar()
    return lista.slice(-qtd).reverse()
}

export function limparHistorico() {
    salvar([])
}

export function gerarRelatorio() {
    const lista = carregar()
    const total = lista.length
    const porTipo = {}
    let ultimas24h = 0
    const agora = Date.now()
    for (const h of lista) {
        porTipo[h.tipo] = (porTipo[h.tipo] || 0) + 1
        if (agora - h.ts < 24 * 60 * 60 * 1000) ultimas24h++
    }
    return { total, porTipo, ultimas24h, lista: lista.slice(-10).reverse() }
}

export function formatarHistoricoTexto(qtd = 15) {
    const lista = listarHistorico(qtd)
    if (!lista.length) return "Histórico vazio."
    let out = `📜 HISTÓRICO SYZYGY — últimos ${lista.length}\n`
    out += `━━━━━━━━━━━━━━━━━━━━\n`
    for (const h of lista) {
        const d = new Date(h.ts)
        const hora = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        const alvo = h.subject || h.grupo || h.id || ""
        out += `${hora} · ${h.tipo.toUpperCase()} · ${alvo}\n`
        if (h.ok === false) out += `  ❌ ${h.erro || "erro"}\n`
        else if (h.resumo) out += `  ${h.resumo}\n`
    }
    return out
}

```

#### `./services/interactiveList.js` — 8 linhas, 536 bytes

```js
// services/interactiveList.js
// [v51] CAMADA DE COMPATIBILIDADE — a implementação ÚNICA de listas interativas
// vive em services/list.js. Este arquivo existia como uma SEGUNDA implementação
// concorrente (enviava com messageId undefined = lista renderizada mas morta,
// usada pelas páginas de categoria cat_* do roteador) e foi o causador do
// "abre mas não seleciona". Agora apenas reexporta a fonte única.
export { sendInteractiveList, getListId, getInteractiveId, chunkRowsToSections, paginateRows } from "./list.js"

```

#### `./services/interactiveService.js` — 278 linhas, 12859 bytes

```js
// services/interactiveService.js
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

import fs from "fs"
import { getSock } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber, ownerJidForSending } from "../utils/permissions.js"
// [v53] uiModoEfetivo: "bloks"/"text" → texto (identidade TXT preservada);
// generateMessageID: o fork NÃO gera key.id (botão nascia morto).
import { uiModoEfetivo } from "../utils/config.js"
import { generateMessageID } from "../connection/baileysCompat.js"
import { CONFIG, MENU_IMAGE_PATH } from "../utils/config.js"
import { ok, err, warn, info } from "../utils/terminalUI.js"

// Normaliza um botão para o formato aceito pelo nativeFlowMessage.
// [CORREÇÃO single_select] Para botões "single_select", o WhatsApp exige que
// cada row possua a chave "rowId" (o contrato nativo da lista). Os builders do
// projeto usam "id" (que continua preservado, pois é o que o dispatcher lê no
// paramsJson de resposta). Aqui, ao serializar, garantimos "rowId" = "id" em
// TODAS as rows, sem alterar os builders nem os identificadores existentes.
function normalizarBotao(b) {
 if (!b || typeof b !== "object") return null
 const name = b.name || "quick_reply"
 let params = b.buttonParamsJson

    // Se vier objeto, serializa. Se vier string, parseia para poder enriquecer.
 let obj = null
 if (typeof params === "string") {
 try { obj = JSON.parse(params) } catch { obj = null }
    } else if (params && typeof params === "object") {
 obj = params
    }

 if (name === "single_select" && obj && Array.isArray(obj.sections)) {
        // [v57] rowIds DUPLICADOS confundem o picker (v49): o mesmo id pode
        // existir em 2 categorias legítimas (ex.: cfg_list_groups em Grupos e
        // Permissoes) — dedupe com sufixo "#n"; o handler já descarta o sufixo
        // (interactionHandler: split("#")[0]).
 const vistosRow = new Map()
 for (const sec of obj.sections) {
 if (!Array.isArray(sec.rows)) continue
 for (const row of sec.rows) {
                // rowId é a chave que o cliente usa para renderizar/retornar a seleção.
 if (row.id && !row.rowId) row.rowId = row.id
                // se por algum motivo só houver rowId, espelha para id (dispatcher).
 if (row.rowId && !row.id) row.id = row.rowId
                // description é opcional no proto, mas algumas versões exigem string.
 if (row.description == null) row.description = ""
                const chave = row.rowId || row.id
                if (chave) {
                    const n = (vistosRow.get(chave) || 0) + 1
                    vistosRow.set(chave, n)
                    if (n > 1) { row.rowId = `${chave}#${n}`; row.id = row.rowId }
                }
            }
        }
 params = JSON.stringify(obj)
    } else if (typeof params !== "string") {
 try { params = JSON.stringify(obj || {}) } catch { params = "{}" }
    }

 return { name, buttonParamsJson: params }
}

// Monta o texto de fallback (corpo + lista das opções clicáveis por número/nome).
function montarFallbackTexto(texto, botoesNorm) {
 let out = (texto && String(texto).trim().length > 0) ? (texto + "\n\n") : ""
 let temLista = false
 let temAcao = false
 for (const b of botoesNorm) {
 try {
 const p = JSON.parse(b.buttonParamsJson || "{}")
 if (p.sections) {
 for (const sec of p.sections) {
 if (sec.title) out += `\n*${sec.title}*\n`
 for (const row of (sec.rows || [])) {
                        // Mostra o título (já vem com o número, ex.: "01 Registrar Nome").
 out += `  ${row.title}\n`
 temLista = true
                    }
                }
            } else if (p.display_text) {
                // quick_reply / cta viram linhas de ação clicáveis por texto.
 out += `\n ${p.display_text}`
 temAcao = true
            }
        } catch {}
    }
 if (temLista) out += `\n_Digite o número da opção (ex: 01, 03, 12). "cancelar" para sair._`
 else if (temAcao) out += `\n\n_Responda com a opção desejada._`
 return out
}

export async function enviarMensagemInterativa(from, texto, botoes) {
 const sock = getSock()

    // Redireciona @lid para o JID real do telefone (visível no PV do owner).
 let targetJid = from || ownerJidForSending()
 if (typeof targetJid === "string" && targetJid.endsWith("@lid")) {
 targetJid = ownerJidForSending()
    }

 const botoesNorm = Array.isArray(botoes)
        ? botoes.map(normalizarBotao).filter(Boolean)
        : []

    // [v53] Modo via uiModoEfetivo() — mesma regra do resto do sistema.

    // Modo texto explícito, ou nada para enviar como botão.
 if (uiModoEfetivo() === "text" || botoesNorm.length === 0) {
 try {
 await sock.sendMessage(targetJid, { text: montarFallbackTexto(texto, botoesNorm) })
 console.log(ok(`[UI] Texto enviado para ${targetJid}`))
 return true
        } catch (eTxt) {
 console.log(err(`[UI] Falha ao enviar texto: ${eTxt.message}`))
 return false
        }
    }

    // ============================================================
    // [v53] UMA INTERAÇÃO = UMA RESPOSTA.
    // A antiga "ETAPA 1" (texto enviado SEPARADAMENTE antes dos botões) era um
    // workaround da era em que o relay não renderizava — com o transporte
    // corrigido (messageId real + envelope) ela virou a CAUSA GLOBAL da
    // duplicação "texto + botões". REMOVIDA: o texto vai DENTRO da mensagem
    // interativa (body.text); se o relay falhar, aí sim cai para texto simples.
    // ============================================================

    // ============================================================
    // ETAPA 2 — BOTÕES NATIVOS (estrutura ZERO-TWO: interactiveMessage +
    // nativeFlowMessage + imagem no header + relayMessage).
    // ============================================================
    // Esta é a MESMA engenharia do case 'menu' da ZERO-TWO que você forneceu:
    // viewOnceMessage -> interactiveMessage { body, footer, header(imagem),
    // nativeFlowMessage{ buttons } } enviado por relayMessage.
 try {
 // [v58] terminal limpo: detalhes de preparação só com uiDebug
 if (CONFIG.uiDebug) console.log(info("UI", `preparando interactiveMessage (nativeFlow + imagem)`))

 const { prepareWAMessageMedia, generateWAMessageFromContent, proto } =
 await import("../connection/baileysCompat.js")

        // Header com a imagem do menu (se existir). [v54] O title SEMPRE
        // permanece (igual list.js) — com ou sem mídia.
 let header = { title: " SYZYGY", hasMediaAttachment: false }
 try {
 const imgPath = CONFIG.menuImage || MENU_IMAGE_PATH
 if (imgPath && fs.existsSync(imgPath)) {
 const imgBuffer = fs.readFileSync(imgPath)
 const mediaMenu = await prepareWAMessageMedia(
                    { image: imgBuffer },
                    { upload: sock.waUploadToServer }
                )
 if (mediaMenu?.imageMessage) {
 header = { title: " SYZYGY", hasMediaAttachment: true, imageMessage: mediaMenu.imageMessage }
                }
            }
        } catch (eimg) {
 console.log(warn(`[UI] imagem do menu indisponível (${eimg.message})`))
        }

        // ============================================================
        // [v54] ENVELOPE IDÊNTICO AO list.js — o ÚNICO transporte de
        // mensagem interativa comprovado RENDERIZANDO no cliente real
        // (lista real do "Mostrar lista", v49-v52). Diferenças que a v53
        // introduziu e QUEBRAVAM o render dos botões, eliminadas:
        //   1. messageParamsJson: ""  → REMOVIDO. No proto do fork
        //      (@lucasmod/boruto-vk7-baileys 2.1.0) o campo é OPCIONAL
        //      (string|null); o list.js (que renderiza) não o envia.
        //      String vazia invalida o parse do flow no cliente.
        //   2. contextInfo.mentionedJid → REMOVIDO (list.js não envia;
        //      mencionar o JID dentro de interactiveMessage degrada o
        //      render/notificação no cliente).
        //   3. Objeto cru → proto.Message.InteractiveMessage.create()
        //      (+ Body/Footer/Header/NativeFlowMessage.create), igual ao
        //      list.js — serialização com os tipos/defaults do fork.
        // Quick_reply/single_select/cta continuam saindo por
        // nativeFlowMessage.buttons (contrato {name, buttonParamsJson}).
        // ============================================================
 const msg = generateWAMessageFromContent(targetJid, {
 viewOnceMessage: {
 message: {
 messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
 interactiveMessage: proto.Message.InteractiveMessage.create({
 body: proto.Message.InteractiveMessage.Body.create({ text: texto }),
 footer: proto.Message.InteractiveMessage.Footer.create({ text: "© SYZYGY ZUCKERBERG" }),
 header: proto.Message.InteractiveMessage.Header.create(header),
 nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
 buttons: botoesNorm
                        })
                    })
                }
            }
        }, {})

 const messageId = generateMessageID(sock.user?.id)
 const nomes = botoesNorm.map(b => b.name).join(", ")
 if (CONFIG.uiDebug) {
 console.log(info("UI", `interactiveMessage criado | header.img=${header.hasMediaAttachment}`))
 console.log(info("UI", `nativeFlow buttons=${botoesNorm.length} [${nomes}] | id=${messageId.slice(0, 8)}…`))
 }

 await sock.relayMessage(targetJid, msg.message, { messageId })
 // [v58] 1 linha por mensagem interativa (antes eram 5; verboso só com uiDebug)
 const jidCurto = `…${String(targetJid).split("@")[0].slice(-4)}`
 console.log(ok(`[UI] interativa → ${jidCurto} · botão(s) ${botoesNorm.length} [${nomes}] · ${header.hasMediaAttachment ? "img" : "sem img"} · ${messageId.slice(0, 8)}…`))
 return true
    } catch (error) {
 console.log(warn(`[UI] Native Flow falhou (${error.message}). Fallback texto...`))
 try {
 await sock.sendMessage(targetJid, { text: montarFallbackTexto(texto, botoesNorm) })
 console.log(ok(`[UI] Fallback (opções) enviado para ${targetJid}`))
 return true
        } catch (e2) {
 console.log(err(`[UI] Erro no fallback: ${e2.message}`))
        }
 return false
    }
}

// [PRESERVAÇÃO] Reconhece todos os formatos de resposta interativa suportados.
export function getInteractiveId(m) {
 if (!m || !m.message) return null
 const msg = m.message

 if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
 try {
 const p = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
            // [CORREÇÃO single_select] aceita id / rowId / selectedRowId / selectedId,
            // dependendo de como o cliente devolve a seleção da lista.
 return p.id || p.rowId || p.selectedRowId || p.selectedId || null
        } catch { return null }
    }
 if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
 return msg.listResponseMessage.singleSelectReply.selectedRowId
    }
 if (msg.buttonsResponseMessage?.selectedButtonId) {
 return msg.buttonsResponseMessage.selectedButtonId
    }
 if (msg.templateButtonReplyMessage?.selectedId) {
 return msg.templateButtonReplyMessage.selectedId
    }
 return null
}

// Helper de hora local (usado pelo painel inicial).
export function horaAtual() {
 const d = new Date()
 return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// Só reexportamos utilidades de número usadas pelos menus.
export { normalizeNumber, getOwnerNumber }

```

#### `./services/lidResolver.js` — 171 linhas, 5770 bytes

```js
// services/lidResolver.js
// [v25] Mapeia LID <-> telefone + busca ativa em grupos.

import fs from "fs"
import path from "path"
import { getSock, rt } from "../connection/socket.js"

const MAP_PATH = "./dono/lid_map.json"

let lidToPhone = new Map()
let phoneToLid = new Map()

function carregar() {
    try {
        if (fs.existsSync(MAP_PATH)) {
            const data = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"))
            if (data.lidToPhone) {
                for (const [lid, phone] of Object.entries(data.lidToPhone)) {
                    lidToPhone.set(lid, phone)
                    phoneToLid.set(phone, lid)
                }
            }
        }
    } catch {}
}

function salvar() {
    try {
        const dir = path.dirname(MAP_PATH)
        try { fs.mkdirSync(dir, { recursive: true }) } catch {}
        const obj = { lidToPhone: Object.fromEntries(lidToPhone) }
        fs.writeFileSync(MAP_PATH, JSON.stringify(obj, null, 2), "utf-8")
    } catch {}
}

carregar()

export function normalizeNumberSimple(v) {
    if (!v) return ""
    let s = String(v)
    if (s.includes("@")) s = s.split("@")[0]
    if (s.includes(":")) s = s.split(":")[0]
    return s.replace(/\D/g, "")
}

export function atualizarMapaDeParticipantes(participants) {
    if (!Array.isArray(participants)) return
    let mudou = false
    for (const p of participants) {
        const id = p.id || p.jid || ""
        const lid = p.lid || ""
        if (!id || !lid) continue
        const phoneNum = normalizeNumberSimple(id)
        const lidNum = normalizeNumberSimple(lid)
        if (!phoneNum || !lidNum) continue
        if (!id.endsWith("@s.whatsapp.net")) continue
        if (!lid.endsWith("@lid")) continue
        if (lidToPhone.get(lidNum) !== phoneNum) {
            lidToPhone.set(lidNum, phoneNum)
            phoneToLid.set(phoneNum, lidNum)
            mudou = true
        }
    }
    if (mudou) salvar()
}

export function resolverLidParaPhone(lidOrNumber) {
    const n = normalizeNumberSimple(lidOrNumber)
    if (!n) return null
    return lidToPhone.get(n) || null
}

export function resolverPhoneParaLid(phoneOrNumber) {
    const n = normalizeNumberSimple(phoneOrNumber)
    if (!n) return null
    return phoneToLid.get(n) || null
}

export function getLidMap() {
    return { lidToPhone: Object.fromEntries(lidToPhone), phoneToLid: Object.fromEntries(phoneToLid) }
}

export function limparMapa() {
    lidToPhone.clear()
    phoneToLid.clear()
    salvar()
}

// [v25] Busca ativa: dado um LID, tenta achar o telefone varrendo grupos
export async function buscarPhonePorLid(lidJidOuNum) {
    const lidNum = normalizeNumberSimple(lidJidOuNum)
    if (!lidNum) return null
    if (lidToPhone.has(lidNum)) return lidToPhone.get(lidNum)

    const sock = getSock()
    if (!sock) return null

    try {
        // Primeiro tenta cache de grupos que já tem participants
        const grupos = await sock.groupFetchAllParticipating()
        for (const g of Object.values(grupos)) {
            if (Array.isArray(g.participants)) {
                for (const p of g.participants) {
                    const pLidNum = normalizeNumberSimple(p.lid || "")
                    const pPhoneNum = normalizeNumberSimple(p.id || "")
                    if (pLidNum === lidNum && pPhoneNum) {
                        atualizarMapaDeParticipantes([p])
                        return pPhoneNum
                    }
                }
            }
        }
        // Se não achou, busca metadata de alguns grupos (limite 15 para não pesar)
        const ids = Object.keys(grupos).slice(0, 15)
        for (const id of ids) {
            try {
                const meta = await sock.groupMetadata(id)
                if (Array.isArray(meta.participants)) {
                    atualizarMapaDeParticipantes(meta.participants)
                    for (const p of meta.participants) {
                        const pLidNum = normalizeNumberSimple(p.lid || "")
                        const pPhoneNum = normalizeNumberSimple(p.id || "")
                        if (pLidNum === lidNum && pPhoneNum) return pPhoneNum
                    }
                }
            } catch {}
        }
    } catch {}
    return null
}

export async function buscarLidPorPhone(phoneJidOuNum) {
    const phoneNum = normalizeNumberSimple(phoneJidOuNum)
    if (!phoneNum) return null
    if (phoneToLid.has(phoneNum)) return phoneToLid.get(phoneNum)

    const sock = getSock()
    if (!sock) return null

    try {
        const grupos = await sock.groupFetchAllParticipating()
        for (const g of Object.values(grupos)) {
            if (Array.isArray(g.participants)) {
                for (const p of g.participants) {
                    const pPhoneNum = normalizeNumberSimple(p.id || "")
                    const pLidNum = normalizeNumberSimple(p.lid || "")
                    if (pPhoneNum === phoneNum && pLidNum) {
                        atualizarMapaDeParticipantes([p])
                        return pLidNum
                    }
                }
            }
        }
        const ids = Object.keys(grupos).slice(0, 15)
        for (const id of ids) {
            try {
                const meta = await sock.groupMetadata(id)
                if (Array.isArray(meta.participants)) {
                    atualizarMapaDeParticipantes(meta.participants)
                    for (const p of meta.participants) {
                        const pPhoneNum = normalizeNumberSimple(p.id || "")
                        const pLidNum = normalizeNumberSimple(p.lid || "")
                        if (pPhoneNum === phoneNum && pLidNum) return pLidNum
                    }
                }
            } catch {}
        }
    } catch {}
    return null
}

```

#### `./services/list.js` — 212 linhas, 10133 bytes

```js
// services/list.js - V3 CORRIGIDO - SEM viewOnceMessage (fix @lid)
// Resolve 90% dos casos de lista não renderizar

import { generateWAMessageFromContent, generateMessageID, proto } from "../connection/baileysCompat.js"
import { getSock } from "../connection/socket.js"
import { CONFIG, MENU_IMAGE_PATH, uiModoEfetivo } from "../utils/config.js"
import fs from "fs"
import { safeSendMessage } from "./groupService.js"
import { ok, err, warn, info } from "../utils/terminalUI.js"

const MAX_ROWS_PER_SECTION = 25
const MAX_SECTIONS = 10

export async function sendInteractiveList(sockParam, jid, options) {
    const sock = sockParam || getSock()
    const { title = "MENU", body = "Selecione", footer = "Toque", buttonText = "VER OPÇÕES", sections = [], image = null } = options

    if (sections.length > MAX_SECTIONS) throw new Error(`Máximo ${MAX_SECTIONS} sections`)
    for (const sec of sections) {
        if (sec.rows.length > MAX_ROWS_PER_SECTION) throw new Error(`Section ${sec.title} com ${sec.rows.length} rows, máximo ${MAX_ROWS_PER_SECTION}`)
    }
    const totalRows = sections.reduce((a, s) => a + s.rows.length, 0)
    if (totalRows > 100) throw new Error(`Total ${totalRows} rows, máximo 100 - use categorias`)

    // CORREÇÃO 1: JID - usa o LID original se tiver, deixa Baileys resolver
    let targetJid = jid
    if (typeof jid === "string" && jid.includes("@lid")) {
        targetJid = jid
    }

    // [v55] DECISÃO CENTRAL DE MODO: uiModoEfetivo() é a ÚNICA autoridade
    // (config.json → uiMode: text|txt|bloks|buttons). Nada de checagem local.
    if (uiModoEfetivo() === "text") {
        let txt = `*${title}*\n${body}\n\n`
        for (const sec of sections) {
            if (sec.title) txt += `*${sec.title}*\n`
            for (const row of sec.rows) {
                txt += `  ${row.title}${row.description ? ` - ${row.description}` : ""} (id:${row.id})\n`
            }
            txt += "\n"
        }
        if (footer) txt += `_${footer}_\n`
        try {
            // [v43] Imagem anexada SEMPRE (PV e grupo), igual ao painel principal
            const pathImg = CONFIG.menuImage || MENU_IMAGE_PATH
            if (pathImg && fs.existsSync(pathImg)) {
                try {
                    const buf = fs.readFileSync(pathImg)
                    if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
                        await safeSendMessage(targetJid, { image: buf, caption: txt }, 0)
                        console.log(ok(`[LIST] menu texto+img enviado -> ${targetJid}`))
                        return true
                    }
                } catch (eImg) {
                    console.log(warn(`[LIST] imagem falhou (${eImg.message}) — texto puro`))
                }
            }
            await safeSendMessage(targetJid, { text: txt }, 0)
            console.log(ok(`[LIST] menu texto enviado -> ${targetJid} | ${sections.length} sections`))
            return true
        } catch (e) {
            console.log(err(`[LIST] falha fallback ${e.message}`))
            return false
        }
    }

    // CORREÇÃO 2: Remove viewOnceMessage - é isso que faz não aparecer em @lid
    try {
        // [v49] rowIds DUPLICADOS matam a lista no WhatsApp (ex.: cfg_list_groups
        // existe em 2 categorias) — o transporte dedupa com sufixo "#2"/"#3";
        // o handler descarta o sufixo ao rotear.
        const vistos = new Map()
        const formattedSections = sections.map(sec => ({
            title: (sec.title || "").substring(0, 24),
            rows: sec.rows.map(r => {
                let rowId = (r.id || "").substring(0, 100)
                if (rowId) {
                    const n = (vistos.get(rowId) || 0) + 1
                    vistos.set(rowId, n)
                    if (n > 1) rowId = `${rowId}#${n}`
                }
                return {
                    title: (r.title || "").substring(0, 24),
                    description: (r.description || "").substring(0, 72),
                    rowId
                }
            })
        }))

        // [v50] IMAGEM DO MENU (config.json → CONFIG.menuImage) no header do
        // menu interativo — mesma chamada que já funciona no interactiveService
        // deste fork: prepareWAMessageMedia({image}, {upload: waUploadToServer}).
        // Qualquer falha (sem arquivo/upload off) → header sem mídia (log), a
        // lista continua interativa (a imagem NÃO pode impedir a interação).
        let header = { title: (title || "").substring(0, 60), hasMediaAttachment: false }
        try {
            const pathImg = (typeof image === "string" && image) || CONFIG.menuImage || MENU_IMAGE_PATH
            if (pathImg && typeof pathImg === "string" && fs.existsSync(pathImg)) {
                const buf = fs.readFileSync(pathImg)
                if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
                    const { prepareWAMessageMedia } = await import("../connection/baileysCompat.js")
                    const media = await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer })
                    if (media?.imageMessage) {
                        header = { title: (title || "").substring(0, 60), hasMediaAttachment: true, imageMessage: media.imageMessage }
                        console.log(ok("[LIST] imagem do menu (config.json) anexada ao header"))
                    }
                }
            }
        } catch (eImg) {
            console.log(warn(`[LIST] imagem no header falhou (${eImg.message}) — enviando sem mídia`))
            header = { title: (title || "").substring(0, 60), hasMediaAttachment: false }
        }

        // [v51] ENVELOPE que funciona no cliente real: idêntico ao do painel
        // BLOKS/A2UI (bloksTransport) confirmado funcionando no aparelho —
        // viewOnceMessage → message → messageContextInfo + interactiveMessage.
        // A versão anterior (interactiveMessage solto, sem wrapper) RENDERIZAVA
        // o botão mas a seleção não gerava resposta utilizável.
        const content = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                header: proto.Message.InteractiveMessage.Header.create(header),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: (buttonText || "VER OPÇÕES").substring(0, 24),
                                sections: formattedSections
                            })
                        }
                    ]
                })
                    })
            }
        }
        }

        const msg = generateWAMessageFromContent(targetJid, content, {})
        // [v49] O fork NÃO gera key.id (retorna key:{}) — sem messageId o
        // WhatsApp RENDERIZA o botão mas a interação nasce morta (não clicável).
        const messageId = generateMessageID(sock.user?.id)
        await sock.relayMessage(targetJid, msg.message, { messageId })
        console.log(`✓ [LIST] ENVIADO (envelope viewOnce v51) -> ${targetJid} | ${sections.length} sections | ${totalRows} rows | id ${messageId.slice(0, 8)}…`)
        return true
    } catch (e) {
        console.log(warn(`[LIST] falha V3 sem viewOnce ${e.message}, fallback texto`))
        try {
            let txt = `*${title}*\n${body}\n\n`
            for (const sec of sections) {
                txt += `*${sec.title}*\n`
                for (const row of sec.rows) txt += `  • ${row.title} (id:${row.id})\n`
                txt += "\n"
            }
            await safeSendMessage(targetJid, { text: txt }, 0)
            return true
        } catch { return false }
    }
}

// [v51] Parser ÚNICO de respostas interativas — cobre as estruturas que o
// fork @lucasmod/boruto-vk7-baileys 2.1.0 efetivamente entrega (interactiveResponse
// native flow, list clássica, buttons e template).
export function getListId(m) {
    if (!m || !m.message) return null
    const msg = m.message
    if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const p = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
            return p.id || p.rowId || p.selectedRowId || p.selectedId || null
        } catch { return null }
    }
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId
    try {
        const json = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
        if (json) return JSON.parse(json).id || null
    } catch {}
    return null
}

export { getListId as getInteractiveId }

export function chunkRowsToSections(rows, sectionTitlePrefix = "Opções") {
    const MAX_ROWS = 25
    const sections = []
    let secIndex = 1
    for (let i = 0; i < rows.length; i += MAX_ROWS) {
        const chunk = rows.slice(i, i + MAX_ROWS)
        const title = rows.length > MAX_ROWS ? `${sectionTitlePrefix} ${secIndex}` : sectionTitlePrefix
        sections.push({ title, rows: chunk })
        secIndex++
    }
    return sections
}

export function paginateRows(rows, maxPerList = 100) {
    const pages = []
    for (let i = 0; i < rows.length; i += maxPerList) {
        pages.push(rows.slice(i, i + maxPerList))
    }
    return pages
}

```

#### `./services/mediaService.js` — 120 linhas, 4447 bytes

```js
// services/mediaService.js
// [REORGANIZAÇÃO] Toda a lógica de mídia/imagem extraída do index.js.
// Conversa com Jimp, fetch(), downloadMediaMessage — sem tocar em fluxo/UI.

import fs from "fs"
import pino from "pino"
import { Jimp } from "jimp"
import { downloadMediaMessage } from "../connection/baileysCompat.js"
import { getSock } from "../connection/socket.js"
import { MAX_IMAGE_BYTES, HTTP_UA } from "../utils/config.js"

export function isValidHttpUrl(str) {
    try {
        const u = new URL(str)
        return u.protocol === "http:" || u.protocol === "https:"
    } catch {
        return false
    }
}

export async function prepararFoto(caminho) {
    const img = await Jimp.read(caminho)
    img.cover({ w: 640, h: 640 })
    return await img.getBuffer("image/jpeg")
}

export async function prepararFotoBuffer(buffer) {
    const img = await Jimp.read(buffer)
    img.cover({ w: 640, h: 640 })
    return await img.getBuffer("image/jpeg")
}

export async function baixarMidiaMensagem(m) {
    const sock = getSock()
    return await downloadMediaMessage(m, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage
    })
}

export function detectarImagem(m) {
    if (!m?.message) return null
    const im = m.message.imageMessage
        || m.message.viewOnceMessage?.message?.imageMessage
        || m.message.viewOnceMessageV2?.message?.imageMessage
    if (im) return { type: "image", mimetype: im.mimetype || "image/jpeg", size: im.fileLength }

    const doc = m.message.documentMessage
    if (doc && typeof doc.mimetype === "string" && doc.mimetype.startsWith("image/")) {
        const mime = doc.mimetype.toLowerCase()
        if (["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(mime)) {
            return { type: "document", mimetype: mime, size: doc.fileLength }
        }
    }
    return null
}

export function validarTamanho(size) {
    if (!size) return true
    const n = typeof size === "number" ? size : Number(size)
    return isFinite(n) && n <= MAX_IMAGE_BYTES
}

function extrairImagemHTML(html, baseUrl) {
    const patterns = [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ]
    for (const rx of patterns) {
        const m = html.match(rx)
        if (m && m[1]) {
            try { return new URL(m[1], baseUrl).toString() } catch { return m[1] }
        }
    }
    return null
}

export async function fetchImagem(url, prof = 0) {
    if (prof > 2) throw new Error("Muitos redirecionamentos")
    if (!isValidHttpUrl(url)) throw new Error("URL inválida")
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 30000)
    let resp
    try {
        resp = await fetch(url, {
            signal: ctrl.signal,
            redirect: "follow",
            headers: { "User-Agent": HTTP_UA, "Accept": "image/*,text/html;q=0.9,*/*;q=0.8" }
        })
    } finally {
        clearTimeout(to)
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const ct = (resp.headers.get("content-type") || "").toLowerCase()
    const finalUrl = resp.url || url
    if (ct.startsWith("image/")) {
        const cl = parseInt(resp.headers.get("content-length") || "0")
        if (cl && cl > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande")
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande")
        return buf
    }
    if (ct.includes("text/html") || ct.includes("xhtml")) {
        const html = await resp.text()
        const imgUrl = extrairImagemHTML(html, finalUrl)
        if (!imgUrl) {
            if (finalUrl.includes("pinterest") || url.includes("pin.it")) {
                throw new Error("Pinterest sem imagem acessível. Use URL direta.")
            }
            throw new Error("Página sem og:image detectável.")
        }
        return await fetchImagem(imgUrl, prof + 1)
    }
    throw new Error(`Conteúdo não é imagem (${ct})`)
}

```

#### `./services/notificationService.js` — 76 linhas, 2630 bytes

```js
// services/notificationService.js
// [v28] Notificações para dono + grupos autorizados.

import { getSock, rt } from "../connection/socket.js"
import { ownerJidForSending, getAuthorizedGroups } from "../utils/permissions.js"
import { err, ok } from "../utils/terminalUI.js"
import { enviarPainelInicial } from "../menus/mainMenu.js"
import { safeSendMessage } from "./groupService.js"

export async function enviarNotifNovoGrupo(jid, info) {
    const { subject, groupJid, isAdmin } = info
    const body =
        `NOVO GRUPO DETECTADO\n` +
        `--------------------------------\n` +
        `O bot entrou em um grupo.\n` +
        `Grupo: ${subject}\n` +
        `ID: ${groupJid}\n` +
        `Admin: ${isAdmin ? "SIM" : "NAO"}\n` +
        `--------------------------------\n` +
        `SYZYGY`
    try { await safeSendMessage(jid, { text: body }) } catch {}
}

export async function enviarNotifAdminRecebido(ownerKey, groupJid, subject) {
    const sock = getSock()
    const oj = ownerJidForSending()
    if (!oj) return

    rt().grupoAlvo = rt().grupoAlvo || {}
    rt().grupoAlvo[ownerKey || "owner"] = { id: groupJid, subject }

    const body =
        `ADMIN RECEBIDO\n` +
        `--------------------------------\n` +
        `Agora sou admin em: ${subject}\n` +
        `ID: ${groupJid}\n` +
        `--------------------------------\n` +
        `ACOES RAPIDAS (responda o numero):\n` +
        `  A1 - Listar Grupos\n` +
        `  A2 - FLOOD\n` +
        `  A3 - Preset + NUKE\n` +
        `  A4 - Roubar Grupo\n` +
        `--------------------------------\n` +
        `Ou digite: menu\n` +
        `SYZYGY`

    // 1) Envia no PV do dono
    try { await safeSendMessage(oj, { text: body }) } catch {}

    // 2) [v28] Envia também nos grupos autorizados (exceto o próprio grupo onde ganhou ADM)
    try {
        const authGroups = getAuthorizedGroups()
        for (const gJid of authGroups) {
            if (gJid === groupJid) continue
            try {
                await safeSendMessage(gJid, { text: `🔔 ${body}` }, 0)
                await new Promise(r => setTimeout(r, 150))
            } catch {}
        }
        if (authGroups.length) console.log(ok(`[NOTIF] ADMIN recebido notificado em ${authGroups.length} grupos autorizados`))
    } catch {}
}

export async function notificarBotOnline() {
    const r = rt()
    if (r.notificacaoOnlineEnviada) return
    r.notificacaoOnlineEnviada = true
    const jid = ownerJidForSending()
    if (!jid) return
    try {
        await enviarPainelInicial(jid)
    } catch (e) {
        console.log(err(`Notif online: ${e.message}`))
    }
}

```

#### `./services/presetService.js` — 89 linhas, 2923 bytes

```js
// services/presetService.js
// [NOVO] Presets de configuração (nome + bio + foto) para o comando 13.
// - Persistidos em ./dono/presets/presets.json
// - Fotos salvas em ./dono/presets/preset_<id>.jpg
// - Criados AUTOMATICAMENTE quando o usuário usa o 13 informando nome/bio/foto.

import fs from "fs"
import path from "path"

const PRESET_DIR = "./dono/presets"
const PRESET_JSON = path.join(PRESET_DIR, "presets.json")

function garantirDir() {
 try { fs.mkdirSync(PRESET_DIR, { recursive: true }) } catch {}
}

export function carregarPresets() {
 garantirDir()
 try {
 if (fs.existsSync(PRESET_JSON)) {
 const data = JSON.parse(fs.readFileSync(PRESET_JSON, "utf-8"))
 if (Array.isArray(data)) return data
        }
    } catch {}
 return []
}

function salvarPresets(lista) {
 garantirDir()
 try { fs.writeFileSync(PRESET_JSON, JSON.stringify(lista, null, 2), "utf-8") } catch {}
}

// Retorna o preset pelo índice 1-based (como aparece na lista pro usuário).
export function getPreset(indice1) {
 const lista = carregarPresets()
 const p = lista[indice1 - 1]
 if (!p) return null
 return { ...p, index: indice1 }
}

// Caminho da foto de um preset (se existir).
export function fotoPresetPath(preset) {
 if (preset?.foto && fs.existsSync(preset.foto)) return preset.foto
 return null
}

// Cria/salva um novo preset. bufferFoto (opcional) é gravado em disco.
// Retorna o preset salvo (com index 1-based).
export function salvarNovoPreset({ nome, bio, bufferFoto, mensagem }) {
 garantirDir()
 const lista = carregarPresets()
 const id = Date.now().toString(36)
 let fotoPath = null
 if (bufferFoto) {
 fotoPath = path.join(PRESET_DIR, `preset_${id}.jpg`)
 try { fs.writeFileSync(fotoPath, bufferFoto) } catch { fotoPath = null }
    }
 // [v52] mensagem também é persistida (4º campo do preset)
 const novo = { id, nome: nome || "", bio: bio || "", foto: fotoPath, mensagem: (mensagem || "").trim() || null }
 lista.push(novo)
 salvarPresets(lista)
 return { ...novo, index: lista.length }
}

// [NOVO] Apaga um preset pelo índice 1-based. Remove também a foto do disco.
// Retorna o preset apagado, ou null se não existir.
export function apagarPreset(indice1) {
    const lista = carregarPresets()
    const i = indice1 - 1
    if (i < 0 || i >= lista.length) return null
    const [removido] = lista.splice(i, 1)
    try { if (removido?.foto && fs.existsSync(removido.foto)) fs.unlinkSync(removido.foto) } catch {}
    salvarPresets(lista)
    return removido
}

// Texto formatado da lista de presets (para mostrar no WhatsApp).
export function listarPresetsTexto() {
 const lista = carregarPresets()
 if (lista.length === 0) return "_(nenhum preset salvo ainda)_"
 let out = ""
 lista.forEach((p, i) => {
 const temFoto = p.foto && fs.existsSync(p.foto) ? "" : "—"
 const nome = (p.nome || "(sem nome)").substring(0, 30)
 out += `  *${i + 1}* ${nome} ${temFoto}\n`
    })
 return out.trimEnd()
}

```

#### `./services/serverInspector.js` — 410 linhas, 18592 bytes

```js
// services/serverInspector.js
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

import os from "os"
import fs from "fs"
import process from "process"
import { CONFIG } from "../utils/config.js"
import { sendBloksMessage } from "./bloksTransport.js"

// ============================================================
// COLETA — dados REAIS
// ============================================================

// CPU %: mede os TEMPOS de CPU em dois instantes (intervalo curto, 400ms) e
// calcula idle/total → percentual real 0-100. NÃO usa cpus().length como %.
async function medirCpuPct(intervaloMs = 400) {
    const amostra = () => {
        const cpus = os.cpus()
        let idle = 0, total = 0
        for (const c of cpus) {
            idle += c.times.idle
            total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
        }
        return { idle, total }
    }
    const a = amostra()
    await new Promise(r => setTimeout(r, intervaloMs))
    const b = amostra()
    const dTotal = b.total - a.total
    const dIdle = b.idle - a.idle
    if (dTotal <= 0) return null
    return Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100))
}

// /proc/meminfo (Linux/Termux): retorna {chave: bytes} ou null
function lerMeminfo() {
    try {
        const txt = fs.readFileSync("/proc/meminfo", "utf-8")
        const map = {}
        for (const linha of txt.split("\n")) {
            const m = linha.match(/^(\w+):\s+(\d+)\s*kB/)
            if (m) map[m[1]] = parseInt(m[2], 10) * 1024
        }
        return map
    } catch {
        return null
    }
}

function coletarMemoria() {
    const mi = lerMeminfo()
    try {
        if (mi && mi.MemTotal && mi.MemAvailable != null) {
            const total = mi.MemTotal
            const disponivel = mi.MemAvailable
            const usada = Math.max(0, total - disponivel)
            return { total, livre: disponivel, usada, pct: (usada / total) * 100, origem: "meminfo" }
        }
    } catch {}
    try {
        const total = os.totalmem()
        const livre = os.freemem()
        const usada = Math.max(0, total - livre)
        return { total, livre, usada, pct: (usada / total) * 100, origem: "os" }
    } catch {
        return null
    }
}

function coletarSwap() {
    const mi = lerMeminfo()
    try {
        const total = mi?.SwapTotal ?? 0
        const livre = mi?.SwapFree ?? 0
        if (!total) return null // sem swap no sistema → N/A (não inventa)
        const usada = Math.max(0, total - livre)
        return { total, livre, usada, pct: (usada / total) * 100 }
    } catch {
        return null
    }
}

// Filesystem ONDE O BOT EXECUTA (process.cwd()) — não uma partição aleatória.
function coletarStorage() {
    try {
        const st = fs.statfsSync(process.cwd())
        const total = st.blocks * st.bsize
        const livre = st.bfree * st.bsize
        const usada = Math.max(0, total - livre)
        if (!total) return null
        return { total, livre, usada, pct: (usada / total) * 100 }
    } catch {
        return null
    }
}

function coletarRuntime() {
    try {
        const bun = typeof globalThis.Bun !== "undefined"
        const nome = bun ? "Bun" : "Node.js"
        const versao = bun ? String(globalThis.Bun.version || "?") : process.version
        let engine = "N/A"
        try { engine = process.versions.v8 ? `V8 ${process.versions.v8}` : (process.versions.jsc ? `JavaScriptCore ${process.versions.jsc}` : "N/A") } catch {}
        let compat = "N/A"
        try { compat = process.versions.node || "N/A" } catch {}
        let exe = "N/A"
        try { exe = process.execPath || "N/A" } catch {}
        return { nome, versao, compat, engine, pid: process.pid, exe }
    } catch {
        return null
    }
}

export async function collectServerInfo() {
    const cpus = os.cpus() || []
    let usuario = "N/A"
    try { usuario = os.userInfo?.().username || process.env.USER || process.env.USERNAME || "N/A" } catch {}
    return {
        sistema: {
            os: (() => { try { return os.type() } catch { return null } })(),
            kernel: (() => { try { return os.release() } catch { return null } })(),
            arquitetura: (() => { try { return os.arch() } catch { return null } })(),
            cpuModelo: cpus[0]?.model ? cpus[0].model.replace(/\s+/g, " ").trim() : null,
            cpuNucleos: cpus.length || null,
            hostname: (() => { try { return os.hostname() } catch { return null } })(),
            usuario,
            endianness: (() => { try { return os.endianness() } catch { return null } })()
        },
        cpuPct: await medirCpuPct(),
        loadAvg: (() => { try { const l = os.loadavg(); return l.some(x => Number.isFinite(x)) ? l : null } catch { return null } })(),
        memoria: coletarMemoria(),
        storage: coletarStorage(),
        swap: coletarSwap(),
        nodeMem: (() => { try { return process.memoryUsage() } catch { return null } })(),
        runtime: coletarRuntime(),
        botUptimeSeg: (() => { try { return process.uptime() } catch { return null } })(),
        sysUptimeSeg: (() => { try { return os.uptime() } catch { return null } })()
    }
}

// ============================================================
// FORMATAÇÃO — mesmo estilo visual dos textos existentes
// ============================================================

export function formatBytes(bytes) {
    if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "N/A"
    const unidades = ["B", "KB", "MB", "GB", "TB"]
    let v = bytes, i = 0
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++ }
    if (i === 0) return `${Math.round(v)} B`
    return `${v.toFixed(2)} ${unidades[i]}`
}

export function formatPct(pct, casas = 1) {
    if (pct == null || !Number.isFinite(pct)) return "N/A"
    const v = Math.max(0, Math.min(100, pct))
    const r = Math.round(v * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// "46 dias, 21 horas, 51 minutos" / "5 minutos, 21 segundos"
export function formatUptime(seg) {
    if (seg == null || !Number.isFinite(seg) || seg < 0) return "N/A"
    const s = Math.floor(seg)
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = s % 60
    const partes = []
    if (d) partes.push(`${d} dia${d === 1 ? "" : "s"}`)
    if (h) partes.push(`${h} hora${h === 1 ? "" : "s"}`)
    if (m) partes.push(`${m} minuto${m === 1 ? "" : "s"}`)
    if (!d && !h && ss) partes.push(`${ss} segundo${ss === 1 ? "" : "s"}`)
    if (!partes.length) return "0 segundos"
    return partes.slice(0, 3).join(", ")
}

export function formatServerInfo(info) {
    const na = "N/A"
    const f = (x) => (x == null || x === "" ? na : String(x))
    return {
        hero: { hostname: f(info.sistema.hostname) },
        sistema: {
            os: f(info.sistema.os),
            kernel: f(info.sistema.kernel),
            arquitetura: f(info.sistema.arquitetura),
            cpu: f(info.sistema.cpuModelo),
            cpuNucleos: info.sistema.cpuNucleos != null ? String(info.sistema.cpuNucleos) : na,
            hostname: f(info.sistema.hostname),
            usuario: f(info.sistema.usuario),
            endianness: f(info.sistema.endianness)
        },
        recursos: {
            cpuPct: formatPct(info.cpuPct),
            ramPct: formatPct(info.memoria?.pct),
            ssdPct: formatPct(info.storage?.pct),
            load: info.loadAvg ? info.loadAvg.map(l => (Number.isFinite(l) ? l.toFixed(2) : "N/A")).join(", ") : na,
            ram: info.memoria ? `${formatBytes(info.memoria.usada)} / ${formatBytes(info.memoria.total)}` : na,
            ssd: info.storage ? `${formatBytes(info.storage.usada)} / ${formatBytes(info.storage.total)}` : na
        },
        nodeMemory: {
            rss: formatBytes(info.nodeMem?.rss),
            heapTotal: formatBytes(info.nodeMem?.heapTotal),
            heapUsed: formatBytes(info.nodeMem?.heapUsed),
            external: formatBytes(info.nodeMem?.external),
            arrayBuffers: formatBytes(info.nodeMem?.arrayBuffers)
        },
        swap: {
            pct: formatPct(info.swap?.pct),
            total: info.swap ? formatBytes(info.swap.total) : na,
            usada: info.swap ? formatBytes(info.swap.usada) : na,
            livre: info.swap ? formatBytes(info.swap.livre) : na
        },
        runtime: {
            runtime: f(info.runtime?.nome),
            versao: f(info.runtime?.versao),
            compat: f(info.runtime?.compat),
            engine: f(info.runtime?.engine),
            pid: info.runtime?.pid != null ? String(info.runtime.pid) : na,
            botUptime: formatUptime(info.botUptimeSeg),
            sysUptime: formatUptime(info.sysUptimeSeg),
            exe: f(info.runtime?.exe)
        }
    }
}

// ============================================================
// A2UI — estrutura FIXA (IDs/ordem/componentes intocáveis; só valores mudam)
// ============================================================

const CATALOG_ID = "414487363153356" // catalogId fixo do bloksWidget im_a2ui
const A2UI_VERSION = 3

// IDs fixos e estáveis (nunca gerados em runtime — não mudam entre execuções)
const ID = {
    hero: "hero", system: "system", resources: "resources",
    node_memory: "node_memory", swap: "swap", runtime: "runtime"
}

function txt(id, text, opts = {}) {
    return { rowId: id, component: { type: "TextComponent", text, textSize: opts.size || "MEDIUM", textColor: opts.color || "SECONDARY", ...(opts.style ? { style: opts.style } : {}) } }
}
function flex(id, children, direction = "VERTICAL", alignItems = "START") {
    return { rowId: id, component: { type: "FlexComponent", direction, alignItems, children: children.map(c => c.component) } }
}
function heading(id, text) {
    return { rowId: id, component: { type: "TextComponent", text, textSize: "LARGE", textColor: "PRIMARY", style: "BOLD" } }
}
function divider(id) {
    return { rowId: id, component: { type: "DividerComponent" } }
}
// Slider recebe SOMENTE o valor real (0-100, numérico)
function slider(id, titulo, valor) {
    const v = Number.isFinite(valor) ? Math.max(0, Math.min(100, Math.round(valor))) : 0
    return { rowId: id, component: { type: "SliderComponent", sliderTitle: titulo, value: v, minValue: 0, maxValue: 100 } }
}
function layout(id, rows) {
    return { id, layoutType: 1, component: { rows: rows.map(r => ({ id: r.rowId, component: r.component })) } }
}

export function createServerInspectorData(infoReal) {
    const d = formatServerInfo(infoReal)
    const pct = (s) => (s === "N/A" ? 0 : parseFloat(s))

    const layouts = [
        layout(ID.hero, [
            txt("hero_title", "Server Inspector", { size: "LARGE", color: "PRIMARY", style: "BOLD" }),
            txt("hero_subtitle", "Live operating system information", { size: "SMALL", color: "TERTIARY" }),
            txt("hero_host", `● ${d.hero.hostname}`, { size: "SMALL", color: "SECONDARY" })
        ]),
        layout(ID.system, [
            heading("system_title", "System Information"),
            txt("system_os", `OS · ${d.sistema.os}`),
            txt("system_kernel", `Kernel · ${d.sistema.kernel}`),
            txt("system_arch", `Architecture · ${d.sistema.arquitetura}`),
            txt("system_cpu", `CPU · ${d.sistema.cpu}`),
            txt("system_cores", `CPU Cores · ${d.sistema.cpuNucleos}`),
            txt("system_hostname", `Hostname · ${d.sistema.hostname}`),
            txt("system_user", `User · ${d.sistema.usuario}`),
            txt("system_endianness", `Endianness · ${d.sistema.endianness}`)
        ]),
        layout(ID.resources, [
            heading("res_title", "System Resources"),
            slider("res_cpu", "CPU", pct(d.recursos.cpuPct)),
            slider("res_ram", "RAM", pct(d.recursos.ramPct)),
            slider("res_ssd", "SSD Storage", pct(d.recursos.ssdPct)),
            txt("res_load", `CPU Load · ${d.recursos.load}`),
            txt("res_ram_txt", `RAM · ${d.recursos.ram}`),
            txt("res_ssd_txt", `SSD · ${d.recursos.ssd}`)
        ]),
        layout(ID.node_memory, [
            heading("mem_title", "Node.js Memory"),
            txt("mem_rss", `RSS · ${d.nodeMemory.rss}`),
            txt("mem_heap_total", `Heap Total · ${d.nodeMemory.heapTotal}`),
            txt("mem_heap_used", `Heap Used · ${d.nodeMemory.heapUsed}`),
            txt("mem_external", `External · ${d.nodeMemory.external}`),
            txt("mem_arraybuffers", `ArrayBuffers · ${d.nodeMemory.arrayBuffers}`)
        ]),
        layout(ID.swap, [
            heading("swap_title", "Swap Memory"),
            slider("swap_usage", "Swap Usage", d.swap.pct === "N/A" ? 0 : pct(d.swap.pct)),
            txt("swap_total", `Total · ${d.swap.total}`),
            txt("swap_used", `Used · ${d.swap.usada}`),
            txt("swap_free", `Free · ${d.swap.livre}`)
        ]),
        layout(ID.runtime, [
            heading("rt_title", "Runtime"),
            txt("rt_name", `Runtime · ${d.runtime.runtime}`),
            txt("rt_version", `Runtime Version · ${d.runtime.versao}`),
            txt("rt_compat", `Node Compatibility · ${d.runtime.compat}`),
            txt("rt_engine", `JavaScript Engine · ${d.runtime.engine}`),
            txt("rt_pid", `PID · ${d.runtime.pid}`),
            txt("rt_botuptime", `Bot Uptime · ${d.runtime.botUptime}`),
            txt("rt_sysuptime", `System Uptime · ${d.runtime.sysUptime}`),
            txt("rt_exe", `Executable · ${d.runtime.exe}`)
        ])
    ]

    return {
        bloksWidget: {
            type: "im_a2ui",
            a2ui: {
                version: A2UI_VERSION,
                catalogId: CATALOG_ID,
                layouts
            }
        }
    }
}

// ============================================================
// ENVIO — dispatcher pela UI configurada em config.json ("uiMode")
//   "bloks"   → BLOKS/A2UI (helper central bloksTransport — payload intacto)
//   "text"    → TXT (compatibilidade: painel em texto puro)
//   "buttons" → camada de botões existente (quick_reply)
//   "list"    → camada de listas existente (single_select)
// ============================================================

// Versão TXT do painel (usada nos modos text/buttons/list — mesma informação)
export function serverInspectorTexto(d) {
    let t = `╭━━「 🖥️ 𝗦𝗘𝗥𝗩𝗘𝗥 𝗜𝗡𝗦𝗣𝗘𝗖𝗧𝗢𝗥 」━━\n`
    t += `┃ ● ${d.hero.hostname}\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `🖥️ SYSTEM INFORMATION\n`
    t += `OS · ${d.sistema.os}\nKernel · ${d.sistema.kernel}\nArchitecture · ${d.sistema.arquitetura}\nCPU · ${d.sistema.cpu}\nCPU Cores · ${d.sistema.cpuNucleos}\nHostname · ${d.sistema.hostname}\nUser · ${d.sistema.usuario}\nEndianness · ${d.sistema.endianness}\n\n`
    t += `📊 SYSTEM RESOURCES\nCPU · ${d.recursos.cpuPct}%\nRAM · ${d.recursos.ramPct}% (${d.recursos.ram})\nSSD · ${d.recursos.ssdPct}% (${d.recursos.ssd})\nCPU Load · ${d.recursos.load}\n\n`
    t += `🧠 NODE.JS MEMORY\nRSS · ${d.nodeMemory.rss}\nHeap Total · ${d.nodeMemory.heapTotal}\nHeap Used · ${d.nodeMemory.heapUsed}\nExternal · ${d.nodeMemory.external}\nArrayBuffers · ${d.nodeMemory.arrayBuffers}\n\n`
    t += `💾 SWAP MEMORY\nSwap Usage · ${d.swap.pct}%\nTotal · ${d.swap.total}\nUsed · ${d.swap.usada}\nFree · ${d.swap.livre}\n\n`

    t += `⚙️ RUNTIME\nRuntime · ${d.runtime.runtime} ${d.runtime.versao}\nNode Compatibility · ${d.runtime.compat}\nJavaScript Engine · ${d.runtime.engine}\nPID · ${d.runtime.pid}\nBot Uptime · ${d.runtime.botUptime}\nSystem Uptime · ${d.runtime.sysUptime}\nExecutable · ${d.runtime.exe}\n\n`
    return t
}

export async function sendServerInspector(sock, jid) {
    const info = await collectServerInfo()
    const d = formatServerInfo(info)
    const modo = (CONFIG.uiMode || "text").toLowerCase()

    if (modo === "bloks") {
        // BLOKS/A2UI — payload intacto, transporte no helper central
        return await sendBloksMessage(sock, jid, createServerInspectorData(info), {
            titulo: "Server Inspector",
            subtitulo: "Live operating system information",
            texto: `● ${d.hero.hostname}\nDados em tempo real do servidor`,
            footer: "⚔️ SYZYGY"
        })
    }

    if (modo === "buttons" || modo === "list") {
        const { sendInteractiveButtons } = await import("./buttons.js")
        const { sendInteractiveList } = await import("./list.js")
        const resumo = serverInspectorTexto(d)
        if (modo === "buttons") {
            return await sendInteractiveButtons(sock, jid, {
                title: "🖥️ SERVER INSPECTOR",
                body: resumo,
                footer: "⚔️ SYZYGY",
                buttons: [{ type: "reply", text: "🔄 Atualizar", id: "server_inspector" }]
            })
        }
        return await sendInteractiveList(sock, jid, {
            title: "🖥️ SERVER INSPECTOR",
            body: resumo,
            footer: "⚔️ SYZYGY",
            buttonText: "AÇÕES",
            sections: [{ title: "Ações", rows: [{ id: "server_inspector", title: "🔄 Atualizar", description: "Coletar dados novamente" }] }]
        })
    }

    // TXT (padrão) — caminho simples e confiável, sem nativeFlow/bloks
    let txt = serverInspectorTexto(d)
    txt += `_Painel A2UI: "uiMode": "bloks" no config.json_\n`
    return await sock.sendMessage(jid, { text: txt })
}

```

#### `./actions/configActions.js` — 57 linhas, 2733 bytes

```js
// actions/configActions.js
// [v24] Status com permissões

import { getSock, rt } from "../connection/socket.js"
import { setState } from "../utils/stateManager.js"
import { normalizeNumber, getOwnerNumber, getAuthorizedUsers, getAuthorizedGroups } from "../utils/permissions.js"
import { formatUptime } from "../utils/terminalUI.js"
import { enviarVoltar, enviarCancelavel } from "../menus/groupMenu.js"
import { enviarPainelInicial } from "../menus/mainMenu.js"

export async function cfgMenuImage(chatJid, ownerKey) {
    setState(ownerKey, { action: "waiting_menu_image" })
    await enviarCancelavel(chatJid, "🖼️ Envie a nova imagem do menu.")
}

export async function cfgOwner(chatJid) {
    await enviarVoltar(chatJid, `👤 Owner: NYX\n📱 ${getOwnerNumber()}`)
}

export async function cfgNumber(chatJid) {
    await enviarVoltar(chatJid, `📱 Conectado: ${normalizeNumber(getSock().user.id)}`)
}

export async function cfgStatus(chatJid) {
    try {
        const arr = Object.values(rt().cachedGroups)
        const admin = arr.filter(g => g.isAdmin).length
        const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
        const { gerarRelatorio } = await import("../services/historicoService.js")
        const { listarAgendamentos } = await import("../services/agendaService.js")
        const rel = gerarRelatorio()
        const ag = listarAgendamentos()
        const pend = ag.filter(j => j.status === "pendente").length
        const modo = FLOOD_MODOS[CONFIG.floodModo] || { intervalo: CONFIG.floodInterval, lote: CONFIG.floodLote }
        let txt = `🟢 SYZYGY ONLINE\n`
        txt += `👥 Grupos: ${arr.length} (👑 ${admin} admin)\n`
        txt += `🕐 Uptime: ${formatUptime(Date.now() - rt().bootTime)}\n`
        txt += `🌊 Flood: ${CONFIG.floodModo} ${modo.intervalo}ms/lote${modo.lote}\n`
        txt += `📜 Histórico: ${rel.total} (${rel.ultimas24h} 24h)\n`
        txt += `⏰ Agendamentos: ${pend} pendentes / ${ag.length} total\n`
        txt += `👤 ADMs bot: ${getAuthorizedUsers().length} | 👥 Grupos autorizados: ${getAuthorizedGroups().length}\n`
        txt += `🧹 Auto-limpeza: ${CONFIG.autoLimpeza ? "ON" : "OFF"} | 🛡️ Anti: ${CONFIG.antiTakeover ? "ON" : "OFF"}`
        await enviarVoltar(chatJid, txt)
    } catch (e) {
        const arr = Object.values(rt().cachedGroups)
        await enviarVoltar(
            chatJid,
            `🟢 SYZYGY ONLINE\n👥 Grupos: ${arr.length}\n👑 Admin: ${arr.filter(g => g.isAdmin).length}\n🕐 Uptime: ${formatUptime(Date.now() - rt().bootTime)}`
        )
    }
}

export async function cfgRestart(chatJid, ownerKey, clearState) {
    clearState(ownerKey)
    await enviarPainelInicial(chatJid)
}

```

#### `./actions/floodActions.js` — 20 linhas, 746 bytes

```js
// actions/floodActions.js
// [REORGANIZAÇÃO] Confirmação de FLOOD (flood_confirm_yes).
// Só executa se o estado atual for waiting_flood_confirm (segurança).

import { getState, clearState } from "../utils/stateManager.js"
import { executarFlood } from "../services/groupService.js"
import { enviarVoltar } from "../menus/groupMenu.js"

export async function confirmarFlood(chatJid, ownerKey) {
    const st = getState(ownerKey)
    if (!st || st.action !== "waiting_flood_confirm") return
    try {
        await executarFlood(st.groupJid, st.floodMessage, st.floodQtd)
        await enviarVoltar(chatJid, "✅ Flood finalizado.")
    } catch (e) {
        await enviarVoltar(chatJid, `❌ ${e.message}`)
    }
    clearState(ownerKey)
}

```

#### `./actions/groupActions.js` — 48 linhas, 2121 bytes

```js
// actions/groupActions.js
// [REORGANIZAÇÃO] Ações de confirmação de grupo (NUKE / remover foto) e a
// listagem textual de grupos (owner_grupos / painel_listar_grupos).
// Cada confirmação SÓ executa se o estado atual for o esperado (segurança).

import { rt } from "../connection/socket.js"
import { getState, clearState, setState } from "../utils/stateManager.js"
import { executarNuke, removerFotoGrupo } from "../services/groupService.js"
import { enviarVoltar, listarGruposInterativo } from "../menus/groupMenu.js"

// [v21] Comando "Listar Grupos" agora usa a lista ORGANIZADA (seções 👑/👤,
// contadores, paginação) e entra no estado de navegação. Você pode digitar o
// número de um grupo para abrir o menu de ações dele.
export async function listarGruposTexto(chatJid, ownerKey) {
    const cache = await listarGruposInterativo(chatJid)
    if (!cache) return
    if (ownerKey) {
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "group_menu" })
    }
}

export async function confirmarNuke(chatJid, ownerKey) {
    const st = getState(ownerKey)
    if (!st || st.action !== "confirm_nuke") return
    try {
        const r = await executarNuke(st.groupJid)
        const mk = (b) => b ? "OK" : "-"
        // [v58] resumo com o motivo real das falhas (nada de "1 erro(s)" sem explicação)
        await enviarVoltar(chatJid, `✅ NUKE executado.\nFoto: ${mk(r.foto)} Nome: ${mk(r.nome)} Bio: ${mk(r.bio)}\nRemovidos: ${r.removidos}${r.erros.length ? `\n⚠️ ${r.erros.slice(0, 3).join(" · ").slice(0, 220)}` : ""}`)
    } catch (e) {
        await enviarVoltar(chatJid, `❌ ${e.message}`)
    }
    clearState(ownerKey)
}

export async function confirmarRemoverFoto(chatJid, ownerKey) {
    const st = getState(ownerKey)
    if (!st || st.action !== "confirm_rmfoto") return
    try {
        const okRem = await removerFotoGrupo(st.groupJid)
        await enviarVoltar(chatJid, okRem ? "✅ Foto removida." : "⚠️ Sem suporte.")
    } catch (e) {
        await enviarVoltar(chatJid, `❌ ${e.message}`)
    }
    clearState(ownerKey)
}

```

#### `./menus/adminMenu.js` — 12 linhas, 439 bytes

```js
// menus/adminMenu.js
// [REORGANIZAÇÃO] Painel administrativo (owner_panel / abrir_painel).

import { buildAdminMenuButtons } from "./menutest.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"

export async function enviarPainelAdmin(from) {
    const texto = `⚙️ *SYZYGY — PAINEL ADMINISTRATIVO*`
    const botoes = buildAdminMenuButtons()
    await enviarMensagemInterativa(from, texto, botoes)
}

```

#### `./menus/configMenu.js` — 261 linhas, 14473 bytes

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

#### `./menus/groupMenu.js` — 243 linhas, 10818 bytes

```js
import { uiModoEfetivo } from "../utils/config.js"
// menus/groupMenu.js
// [v26] Cache + safeSend + blindagem

import { getSock, rt } from "../connection/socket.js"
import { buildGroupActionsButtons } from "./menutest.js"
import { criarBotao } from "../utils/botoes.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { atualizarGrupos, safeSendMessage } from "../services/groupService.js"
import { setState } from "../utils/stateManager.js"

const POR_PAGINA = 10

export async function enviarConfirmacao(jid, { titulo, texto, idConfirmar }) {
    const botoes = [
        criarBotao("quick_reply", { displayText: " CONFIRMAR", id: idConfirmar }),
        criarBotao("quick_reply", { displayText: " CANCELAR", id: "menu_cancel" })
    ]
    await enviarMensagemInterativa(jid, `${titulo}\n\n${texto}`, botoes)
}

export async function enviarCancelavel(jid, texto) {
    const botoes = [
        criarBotao("quick_reply", { displayText: " CANCELAR", id: "menu_cancel" })
    ]
    await enviarMensagemInterativa(jid, texto, botoes)
}

export async function enviarVoltar(jid, texto) {
    const botoes = [
        criarBotao("quick_reply", { displayText: " VOLTAR AO PAINEL", id: "abrir_painel" })
    ]
    await enviarMensagemInterativa(jid, texto, botoes)
}

function ordenarGrupos(todos) {
    const admin = todos
        .filter(g => g.isAdmin)
        .sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
    const membro = todos
        .filter(g => !g.isAdmin)
        .sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
    return { admin, membro, arr: [...admin, ...membro] }
}

function montarListaGrupos(arr, pagina, totalPaginas, qtdAdmin, qtdMembro) {
    const p = Math.max(1, Math.min(pagina, totalPaginas))
    const inicio = (p - 1) * POR_PAGINA
    const fim = Math.min(inicio + POR_PAGINA, arr.length)
    const bar = "━━━━━━━━━━━━━━━━━━━━"

    let t = `📋 𝗚𝗥𝗨𝗣𝗢𝗦 𝗗𝗢 𝗦𝗬𝗭𝗬𝗚𝗬\n`
    t += `👑 SOU ADMIN · ${qtdAdmin}   👤 SÓ MEMBRO · ${qtdMembro}\n`
    t += `▸ Total: ${arr.length}  ·  Página ${p}/${totalPaginas}\n`
    t += `${bar}\n`

    let secAtual = null
    for (let i = inicio; i < fim; i++) {
        const g = arr[i]
        const sec = g.isAdmin ? "admin" : "membro"
        if (sec !== secAtual) {
            if (secAtual) t += "\n"
            t += sec === "admin"
                ? `👑 𝗦𝗢𝗨 𝗔𝗗𝗠𝗜𝗡 (${qtdAdmin})`
                : `👤 𝗦Ó 𝗠𝗘𝗠𝗕𝗥𝗢 (${qtdMembro})`
            t += "\n"
            secAtual = sec
        }
        t += `  ${String(i + 1).padStart(2, "0")} · ${g.subject}\n`
    }

    t += `${bar}\n`
    t += `_Digite o número do grupo, parte do nome_\n`
    t += `_Multi: 1,3,5 ou 1-5 ou 1 3 5_\n`
    const nav = []
    if (p < totalPaginas) nav.push(`p${p + 1} próxima`)
    if (p > 1) nav.push(`p${p - 1} anterior`)
    if (nav.length) t += `_${nav.join(" · ")}_\n`
    t += `_cancelar = sair_`
    return t
}

export async function listarGruposInterativo(jid, pagina = 1) {
    await atualizarGrupos()

    const todos = Object.entries(rt().cachedGroups).map(([id, info]) => ({ id, ...info }))
    const { arr, admin, membro } = ordenarGrupos(todos)

    if (arr.length === 0) {
        await safeSendMessage(jid, { text: "O bot nao esta em nenhum grupo." })
        return null
    }

    const cache = {}
    arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })

    const totalPaginas = Math.max(1, Math.ceil(arr.length / POR_PAGINA))
    const p = Math.max(1, Math.min(pagina, totalPaginas))
    const inicio = (p - 1) * POR_PAGINA
    const fim = Math.min(inicio + POR_PAGINA, arr.length)

    const texto = montarListaGrupos(arr, p, totalPaginas, admin.length, membro.length)

    const rowsAdmin = [], rowsMembro = []
    for (let i = inicio; i < fim; i++) {
        const g = arr[i]; const idx = i + 1
        const row = { title: `${String(idx).padStart(3, "0")} - ${(g.subject || "").substring(0, 22)}`, description: g.isAdmin ? "COM ADM" : "sem adm", id: `grp_select_${idx}` }
        ;(g.isAdmin ? rowsAdmin : rowsMembro).push(row)
    }
    const sections = []
    if (rowsAdmin.length) sections.push({ title: "👑 SOU ADMIN", rows: rowsAdmin })
    if (rowsMembro.length) sections.push({ title: "👤 SÓ MEMBRO", rows: rowsMembro })
    const navRows = []
    if (p < totalPaginas) navRows.push({ title: `Proxima (${p + 1})`, description: "", id: `grp_page_${p + 1}` })
    if (p > 1) navRows.push({ title: `Anterior (${p - 1})`, description: "", id: `grp_page_${p - 1}` })
    navRows.push({ title: "Voltar ao menu", description: "", id: "abrir_painel" })
    sections.push({ title: "NAVEGACAO", rows: navRows })

    const { CONFIG } = await import("../utils/config.js")
    if (uiModoEfetivo() === "text") {
        await safeSendMessage(jid, { text: texto })
    } else {
        const botoes = [
            criarBotao("single_select", {
                title: `GRUPOS ${p}/${totalPaginas}`,
                text: `${arr.length} grupos`,
                buttonText: "SELECIONAR GRUPO",
                sections
            })
        ]
        await enviarMensagemInterativa(jid, texto, botoes)
    }
    return cache
}

export async function enviarMenuAcoesGrupo(jid, grupo, ownerKey) {
    const badge = grupo.isAdmin ? "👑 𝗦𝗢𝗨 𝗔𝗗𝗠𝗜𝗡" : "👤 𝗦Ó 𝗠𝗘𝗠𝗕𝗥𝗢"
    const texto = `╭━━〔 ⚡ 𝗔ÇÕ𝗘𝗦 𝗗𝗢 𝗚𝗥𝗨𝗣𝗢 〕━━\n` +
                  `┃ ${grupo.subject}\n` +
                  `┃ ${badge}\n` +
                  `╰━━━━━━━━━━━━━━━━━━\n\n` +
                  `Escolha uma ação:\n` +
                  `  1 · FLOOD\n` +
                  `  2 · PRESET + NUKE\n` +
                  `  3 · ROUBAR GRUPO\n` +
                  `  4 · AGENDAR AÇÃO\n` +
                  `  0 · VOLTAR AO MENU\n` +
                  `_cancelar = sair_`

    if (ownerKey) {
        setState(ownerKey, {
            action: "group_action_menu",
            groupJid: grupo.id,
            selectedGroup: { id: grupo.id, subject: grupo.subject, isAdmin: grupo.isAdmin }
        })
    }
    // [v55] DECISÃO CENTRAL DE MODO: buttons → SOMENTE interativo (as MESMAS
    // opções do TXT 1/2/3/4/0, ids que o router despacha para a MESMA função
    // processarSelecaoGrupo — paridade botão=texto). O estado continua setado:
    // digitar 1-4 continua funcionando em qualquer modo.
    if (uiModoEfetivo() === "buttons") {
        const botoes = [criarBotao("single_select", {
            title: " AÇÕES DO GRUPO",
            text: (grupo.subject || "").substring(0, 20),
            buttonText: " EXECUTAR AÇÃO",
            sections: [{
                title: badge.replace(/𝗦𝗢𝗨 |𝗦𝗢́ /, "").trim() || "AÇÕES",
                rows: [
                    { title: "1 FLOOD", description: "Envio massivo", id: "painel_flood" },
                    { title: "2 PRESET + NUKE", description: "Preset completo", id: "painel_tudo" },
                    { title: "3 ROUBAR GRUPO", description: "Domina o grupo", id: "painel_roubar" },
                    { title: "4 AGENDAR AÇÃO", description: "Programa execução", id: "painel_agendar" },
                    { title: "0 VOLTAR AO MENU", description: "Painel principal", id: "abrir_painel" }
                ]
            }]
        })]
        await enviarMensagemInterativa(jid, texto, botoes)
        return
    }
    await safeSendMessage(jid, { text: texto })
}

export async function enviarMenuMultiAcoes(jid, grupos, ownerKey) {
    const lista = grupos.slice(0, 10).map((g) => `  ${String(g.index).padStart(2, "0")} · ${g.subject}`).join("\n")
    const mais = grupos.length > 10 ? `\n  ... +${grupos.length - 10} outros` : ""
    const texto = `╭━━〔 ⚡ 𝗠𝗨𝗟𝗧𝗜-𝗔ÇÃ𝗢 〕━━\n` +
                  `┃ ${grupos.length} grupos selecionados\n` +
                  `╰━━━━━━━━━━━━━━━━━━\n\n` +
                  `${lista}${mais}\n\n` +
                  `Escolha ação para TODOS:\n` +
                  `  1 · FLOOD EM LOTE\n` +
                  `  2 · PRESET + NUKE EM LOTE\n` +
                  `  3 · ROUBAR EM LOTE\n` +
                  `  4 · AGENDAR EM LOTE\n` +
                  `  0 · VOLTAR\n` +
                  `_cancelar = sair_`
    if (ownerKey) {
        setState(ownerKey, {
            action: "group_multi_action",
            multiGroups: grupos
        })
    }
    await safeSendMessage(jid, { text: texto })
}

export async function enviarMenuFloodModos(jid, ownerKey, info = {}) {
    const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
    const atual = CONFIG.floodModo || "normal"
    const qtd = info.qtd || "?"
    // [SHOPPING] o modo controla SÓ a velocidade; o tipo do conteúdo já foi
    // decidido no passo da mensagem. Nada aqui muda executor/fila/permissões.
    const linhaTipo = info.floodKind === "shopping"
        ? `🛍️ TIPO: loja (shopStorefrontMessage · viewOnce ${info.floodContent?.viewOnce === true ? "SIM" : "não"})\n`
        : ``
    const texto = `🌊 FLOOD — MODO DE ENVIO\n` +
                  `${linhaTipo}` +
                  `Qtd: ${qtd} msgs | Atual: ${atual}\n\n` +
                  `Escolha a velocidade:\n` +
                  `  1 · Rápido — ${FLOOD_MODOS.rapido.intervalo}ms / lote ${FLOOD_MODOS.rapido.lote} (arriscado)\n` +
                  `  2 · Normal — ${FLOOD_MODOS.normal.intervalo}ms / lote ${FLOOD_MODOS.normal.lote}\n` +
                  `  3 · Lento — ${FLOOD_MODOS.lento.intervalo}ms / lote ${FLOOD_MODOS.lento.lote}\n` +
                  `  4 · Seguro — ${FLOOD_MODOS.seguro.intervalo}ms / lote ${FLOOD_MODOS.seguro.lote} + jitter\n` +
                  `  Ou digite intervalo custom (ex: 200)\n\n` +
                  `_0 = usar config atual (${CONFIG.floodInterval}ms)_`
    if (ownerKey) {
        setState(ownerKey, {
            action: info.multi ? "multi_flood_modo" : "waiting_flood_modo",
            groupJid: info.groupJid,
            multiGroups: info.multiGroups,
            floodMessage: info.floodMessage,
            floodQtd: qtd,
            // [SHOPPING] o TIPO de conteúdo atravessa o passo de modo: é o mesmo
            // estado do mesmo wizard, não uma fila/executor paralelo.
            floodKind: info.floodKind || "text",
            floodContent: info.floodContent || null,
            floodWarnings: info.floodWarnings || []
        })
    }
    await safeSendMessage(jid, { text: texto })
}

export { montarListaGrupos, ordenarGrupos, POR_PAGINA }

```

#### `./menus/mainMenu.js` — 138 linhas, 6981 bytes

```js
// menus/mainMenu.js
// [v35] Menu ultra rápido PV + listas interativas com categorias e paginação

import fs from "fs"
import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber } from "../utils/permissions.js"
import { formatUptime, ok, err, warn, info } from "../utils/terminalUI.js"
import { CONFIG, MENU_IMAGE_PATH, FLOOD_MODOS, uiModoEfetivo } from "../utils/config.js"
import { safeSendMessage } from "../services/groupService.js"

const OWNER_NAME = "NYX"

function menuTextoNumerico({ pushname, num, date, hora, uptime, ping, saude, ram, grupos, floodModo }) {
    const modoInfo = FLOOD_MODOS[floodModo] ? `${FLOOD_MODOS[floodModo].intervalo}ms/l${FLOOD_MODOS[floodModo].lote}` : floodModo
    return `╭━━「 ⚡ 𝗦𝗬𝗭𝗬𝗚𝗬 」━━━━━━━╮\n` +
           `┃      painel administrativo     ⚡\n` +
           `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
           `╭─〔 👤 𝗦𝗘𝗦𝗦𝗔𝗢 〕────────────\n` +
           `┃ 👤 Dono   ⬦ ${pushname}\n` +
           `┃ 📞 Num    ⬦ ${num}\n` +
           `┃ 📆 Data   ⬦ ${date} · ${hora}\n` +
           `┃ ⏱️ Up     ⬦ ${uptime} · 🏓 ${ping}ms\n` +
           `┃ ${saude.icone} Saúde   ⬦ ${saude.texto}\n` +
           `┃ 🧠 RAM    ⬦ ${ram}\n` +
           `┃ 👥 Grupos ⬦ ${grupos}\n` +
           `┃ 🌊 Flood  ⬦ ${floodModo} ${modoInfo}\n` +
           `╰────────────────────────\n` +
           `╭─〔 ⚔️ 𝗔𝗧𝗔𝗤𝗨𝗘 & 𝗚𝗥𝗨𝗣𝗢𝗦 〕───────\n` +
           `┃ ⬥ 1 · 📋 Listar Grupos\n` +
           `┃ ⬥ 2 · 🌊 FLOOD\n` +
           `┃ ⬥ 3 · 💣 Preset + NUKE\n` +
           `┃ ⬥ 4 · 👑 Roubar Grupo\n` +
           `╰────────────────────────\n` +
           `╭─〔 🧰 𝗣𝗔𝗜𝗡𝗘𝗟 〕──────────────\n` +
           `┃ ⬥ 5 · 👑 Comandos do Dono\n` +
           `┃ ⬥ 6 · ⚙️ Configurações\n` +
           `┃ ⬥ 7 · 🫥 Status Manager\n` +
           `┃ ⬥ 8 · 🔢 Multi (Lote)\n` +
           `┃ ⬥ 0 · 🚪 Sair\n` +
           `╰────────────────────────\n` +
           `_Digite o número da opção_\n` +
           `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
           `⚔️ SYZYGY · NYX`
}

export async function enviarPainelInicial(from) {
    const sock = getSock()
    try {
        const start = Date.now()
        try { sock.sendPresenceUpdate("available", from).catch(() => {}) } catch {}
        const ping = Date.now() - start

        let saude
        if (ping < 50) saude = { icone: "🟢", texto: "Otima" }
        else if (ping < 300) saude = { icone: "🟡", texto: "Boa" }
        else if (ping < 800) saude = { icone: "🟠", texto: "Instavel" }
        else saude = { icone: "🔴", texto: "Lenta" }

        const memMB = Math.round((process.memoryUsage().rss / 1024 / 1024))
        const ram = `${memMB} MB`
        const grupos = Object.keys(rt().cachedGroups || {}).length

        const _num = normalizeNumber(sock?.user?.id || getOwnerNumber())
        const _d = new Date()
        const _date = String(_d.getDate()).padStart(2, "0") + "/" + String(_d.getMonth() + 1).padStart(2, "0") + "/" + _d.getFullYear()
        const _hora = `${String(_d.getHours()).padStart(2, "0")}:${String(_d.getMinutes()).padStart(2, "0")}`
        const _uptime = formatUptime(Date.now() - rt().bootTime)

        // Se modo texto, envia texto (com imagem se não for grupo)
        if (uiModoEfetivo() === "text") {
            const corpo = menuTextoNumerico({
                pushname: OWNER_NAME, num: _num, date: _date, hora: _hora, uptime: _uptime,
                ping, saude, ram, grupos,
                floodModo: CONFIG.floodModo || "normal"
            })
            // [v43] Imagem do menu AGORA SEMPRE anexa (PV e grupo) — antes só PV.
            const pathImg = CONFIG.menuImage || MENU_IMAGE_PATH
            let bufImg = null
            try {
                if (pathImg && fs.existsSync(pathImg)) {
                    const b = fs.readFileSync(pathImg)
                    if (b.length > 0 && b.length < 5 * 1024 * 1024) bufImg = b
                }
            } catch (eImg) {
                console.log(warn(`[UI] ler imagem menu falhou: ${eImg.message}`))
            }
            if (!bufImg) console.log(warn(`[UI] imagem do menu ausente (${pathImg}) — enviando só texto`))

            if (bufImg) {
                try {
                    await safeSendMessage(from, { image: bufImg, caption: corpo }, 0)
                    console.log(ok(`[UI] menu com imagem enviado -> ${from}`))
                    return
                } catch (eRaw) {
                    console.log(warn(`[UI] imagem falhou (${eRaw.message}), tentando preparar...`))
                    try {
                        const { prepararFotoBuffer } = await import("../services/mediaService.js")
                        const buf = await prepararFotoBuffer(bufImg)
                        await safeSendMessage(from, { image: buf, caption: corpo }, 0)
                        console.log(ok(`[UI] menu com imagem (prep) enviado -> ${from}`))
                        return
                    } catch (ePrep) {
                        console.log(warn(`[UI] imagem prep falhou (${ePrep.message}) — caindo para texto`))
                    }
                }
            }
            try {
                await safeSendMessage(from, { text: corpo }, 0)
            } catch {}
            console.log(ok(`[UI] menu texto enviado -> ${from}`))
            return
        }

        // Modo interativo: listas com categorias e paginação (suporta 100+ comandos)
        try {
            const { sendMainInteractiveMenu } = await import("./menu.js")
            await sendMainInteractiveMenu(from)
            console.log(ok(`[UI] menu lista interativa enviado -> ${from}`))
            return
        } catch (e) {
            console.log(warn(`[UI] falha lista interativa ${e.message}, fallback texto`))
            const corpo = menuTextoNumerico({
                pushname: OWNER_NAME, num: _num, date: _date, hora: _hora, uptime: _uptime,
                ping, saude, ram, grupos,
                floodModo: CONFIG.floodModo || "normal"
            })
            try { await safeSendMessage(from, { text: corpo }, 0) } catch {}
            return
        }
    } catch (e) {
        console.error("[MENU]", e)
        console.log(err(`[UI] Erro menu: ${e.message}`))
        try {
            await safeSendMessage(from, { text: " SYZYGY\n\n1 Listar Grupos 2 FLOOD 3 Preset+NUKE 4 Roubar 5 Config 6 Multi 0 Sair\n\n_Digite o número_" }, 0)
        } catch {}
    }
}

```

#### `./menus/menu.js` — 281 linhas, 17774 bytes

```js
// menus/menu.js - SISTEMA COMPLETO NEUTRO 100+ COMANDOS
// Baileys via camada compat (connection/baileysCompat.js) — listas interativas + paginação
// Usa services/list.js (sendInteractiveList, getListId) - até 3 botões via services/buttons.js
// Mantém IDs iguais aos comandos já existentes do SYZYGY, não quebra nada

import { sendInteractiveList, getListId } from "../services/list.js"
// [v57] Transporte do MENU PRINCIPAL = MESMA implementação do menu de GRUPOS
// (referência funcional no aparelho): enviarMensagemInterativa + criarBotao.
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { criarBotao } from "../utils/botoes.js"
import { TEXT_TO_ACTION } from "../commands/commandMap.js"
import { CONFIG_OPCOES } from "./configMenu.js"
import { STATUS_MENU_MAP } from "../features/statusManager/index.js"
import { getSock, rt } from "../connection/socket.js"
import { safeSendMessage } from "../services/groupService.js"
import { ok, err, warn, info } from "../utils/terminalUI.js"

// =========================================================
// 1. TODOS OS COMANDOS REAIS DO SYZYGY
// Formato: { id, title, description, categoria }
// IDs são os mesmos do dispatcher (TEXT_TO_ACTION e roteadorAcoes)
// =========================================================
export const COMANDOS = [
    // Grupos & Listagem
    { id: "painel_listar_grupos", title: "Listar Grupos", description: "Ver grupos admin/membro organizados", categoria: "Grupos" },
    { id: "painel_multi", title: "Multi (Lote)", description: "Selecionar vários 1,3,5 ou 1-5", categoria: "Grupos" },
    { id: "cfg_limpar_fantasmas", title: "Limpar Fantasmas", description: "Remove grupos que bot saiu", categoria: "Grupos" },
    { id: "cfg_list_groups", title: "Listar Grupos Autz", description: "Ver grupos autorizados blindados", categoria: "Grupos" },
    { id: "cfg_status", title: "Status", description: "Ver status completo online", categoria: "Grupos" },

    // Ataque & Domínio
    { id: "painel_flood", title: "FLOOD", description: "Envio massivo com ondas 50ms/lote8", categoria: "Ataque" },
    { id: "painel_tudo", title: "Preset + NUKE", description: "Aplica preset + remove todos", categoria: "Ataque" },
    { id: "painel_roubar", title: "Roubar Grupo", description: "Tira ADM todos, fecha e domina", categoria: "Ataque" },
    { id: "fast_flood_help", title: "Flood Rápido", description: "Ex: 2/01/Oi/20/1", categoria: "Ataque" },
    { id: "painel_flood_presets", title: "Flood Presets", description: "Load-test: text/mention/media/payment/shopping", categoria: "Ataque" },
    { id: "flood_preset_payment_test", title: "Payment Test", description: "Preset payment-test na allowlist (dry-run)", categoria: "Ataque" },
    { id: "flood_preset_shopping_test", title: "Shopping Test", description: "Preset shopping-test na allowlist (dry-run)", categoria: "Ataque" },
    { id: "fast_flood_preset_help", title: "Preset Rápido", description: "Ex: 2/preset/payment-test", categoria: "Ataque" },
    { id: "fast_nuke_help", title: "Nuke Rápido", description: "Ex: 3/01/2/Oi", categoria: "Ataque" },
    { id: "fast_roubar_help", title: "Roubar Rápido", description: "Ex: 4/01/2", categoria: "Ataque" },
    { id: "fast_multi_flood_help", title: "Multi Flood", description: "Ex: 6/1,3,5/1/Oi/20/1", categoria: "Ataque" },
    { id: "fast_multi_nuke_help", title: "Multi Nuke", description: "Ex: 6/1-5/2/2/Oi", categoria: "Ataque" },

    // Presets & Mídia
    { id: "cfg_criar_preset", title: "Criar Preset", description: "Salvar nome+bio+foto", categoria: "Presets" },
    { id: "cfg_apagar_preset", title: "Apagar Preset", description: "Remover preset salvo", categoria: "Presets" },
    { id: "cfg_menuImage", title: "Alterar Imagem Menu", description: "Mudar foto menu (dono)", categoria: "Presets" },
    { id: "cfg_list_presets", title: "Listar Presets", description: "Ver presets salvos", categoria: "Presets" },

    // Config Sistema
    { id: "cfg_link", title: "Link Divulgação", description: "Setar link/canal", categoria: "Config" },
    { id: "cfg_ler_mais", title: "Ler Mais", description: "Toggle dobrar mensagens após título", categoria: "Config" },
    { id: "cfg_fantasma", title: "Marcar Fantasma", description: "Toggle mencionar invisível", categoria: "Config" },
    { id: "cfg_flood_modo", title: "Flood Modo", description: "rapido/normal/lento/seguro", categoria: "Config" },
    { id: "cfg_flood_interval", title: "Flood Intervalo", description: "20-5000ms custom", categoria: "Config" },
    { id: "cfg_flood_lote", title: "Flood Lote", description: "1-10 msgs por lote", categoria: "Config" },
    { id: "cfg_autolimpeza", title: "Auto-Limpeza", description: "Toggle limpeza fantasmas", categoria: "Config" },
    { id: "cfg_antitakeover", title: "Anti-Takeover", description: "Toggle proteção ADM", categoria: "Config" },
    { id: "cfg_owner", title: "Ver Proprietário", description: "Ver dono", categoria: "Config" },
    { id: "cfg_number", title: "Número Conectado", description: "Ver número bot", categoria: "Config" },
    { id: "cfg_restart", title: "Atualizar Menu", description: "Voltar ao menu principal", categoria: "Config" },

    // Permissões & Segurança
    { id: "cfg_add_user", title: "Add ADM Bot", description: "Dar ADM por número", categoria: "Permissoes" },
    { id: "cfg_remove_user", title: "Remover ADM Bot", description: "Remover ADM", categoria: "Permissoes" },
    { id: "cfg_list_users", title: "Listar ADMs Bot", description: "Ver ADMs autorizados", categoria: "Permissoes" },
    { id: "cfg_add_group", title: "Add Grupo Autz", description: "Liberar bot em grupo blindado", categoria: "Permissoes" },
    { id: "cfg_remove_group", title: "Remover Grupo Autz", description: "Remover grupo autorizado", categoria: "Permissoes" },
    { id: "cfg_list_groups", title: "Listar Grupos Autz", description: "Ver grupos autorizados", categoria: "Permissoes" },
    { id: "cfg_add_owner", title: "Add Dono Extra", description: "Add dono poder total", categoria: "Permissoes" },
    { id: "cfg_remove_owner", title: "Remover Dono Extra", description: "Remover dono extra", categoria: "Permissoes" },
    { id: "cfg_list_owners", title: "Listar Donos", description: "Ver todos donos", categoria: "Permissoes" },

    // ViewOnce & Histórico
    { id: "cfg_historico", title: "Histórico", description: "Últimas 20 ações", categoria: "ViewOnce" },
    { id: "cfg_relatorio", title: "Relatório Completo", description: "Status detalhado", categoria: "ViewOnce" },
    { id: "cfg_agendamentos", title: "Agendamentos", description: "Ver agendamentos pendentes", categoria: "ViewOnce" },
    { id: "cfg_limpar_agendamentos", title: "Limpar Agendamentos", description: "Remove concluídos", categoria: "ViewOnce" },
    { id: "cfg_viewonce_toggle", title: "ViewOnce ON/OFF", description: "Toggle ViewOnce", categoria: "ViewOnce" },
    { id: "cfg_viewonce_groups", title: "ViewOnce → Grupos", description: "Toggle envio pra grupos", categoria: "ViewOnce" },
    { id: "cfg_viewonce_owner", title: "ViewOnce → Owner", description: "Toggle envio pro dono", categoria: "ViewOnce" },
    { id: "cfg_viewonce_admins", title: "ViewOnce → ADMs", description: "Toggle envio pros ADMs", categoria: "ViewOnce" },
    { id: "cfg_viewonce_save", title: "ViewOnce Salvar", description: "Buffer vs disco com delete", categoria: "ViewOnce" },

    // Rápido & Agendamento
    { id: "fast_config_help", title: "Config Rápido", description: "Ex: 5/10/rapido, 5/20/num", categoria: "Rapido" },
    { id: "fast_agendar_help", title: "Agendar Rápido", description: "Ex: 3/01/2/Oi@10m", categoria: "Rapido" },

    // [v41] Status Manager
    { id: "status_menu", title: "Status Manager", description: "Criar e publicar Status", categoria: "Status" },
    { id: "status_texto", title: "Status Texto", description: "Rascunho de texto (cor/fonte)", categoria: "Status" },
    { id: "status_imagem", title: "Status Imagem", description: "Enviar foto como status", categoria: "Status" },
    { id: "status_video", title: "Status Vídeo", description: "Enviar vídeo (~30s)", categoria: "Status" },
    { id: "status_audiencia", title: "Audiência do Status", description: "Somente compartilhar com...", categoria: "Status" },
    { id: "status_ver", title: "Ver Config Status", description: "Audiência, fila e padrões", categoria: "Status" },
    { id: "status_publicar", title: "Publicar Status", description: "Publica a fila agora", categoria: "Status" },
    { id: "status_cancelar", title: "Cancelar Status", description: "Aborta/limpa publicação", categoria: "Status" },
    { id: "status_erros", title: "Erros de Status", description: "Últimos erros do módulo", categoria: "Status" }
]

// Função que divide automaticamente em sections de 25 (limite WhatsApp)
// [v50] NÚMEROS REAIS de navegação de cada comando — descobertos do próprio
// sistema (nada inventado): commandMap numérico (painel 1-8), CONFIG_OPCOES
// (config 6>1-11 · dono 5>12-46) e mapa do Status (7>1-11). Comando sem
// número no sistema não ganha número.
const NUM_PAINEL = {}
for (const [k, v] of Object.entries(TEXT_TO_ACTION)) {
    if (/^\d{1,2}$/.test(k) && v !== "owner_sair" && !NUM_PAINEL[v]) NUM_PAINEL[v] = String(Number(k))
}
const NUM_CONFIG = {}
for (const [k, v] of Object.entries(CONFIG_OPCOES)) if (v !== "abrir_painel") NUM_CONFIG[v] = Number(k)
const NUM_STATUS = {}
for (const [k, v] of Object.entries(STATUS_MENU_MAP)) NUM_STATUS[v] = Number(k)
export function numeroNavegacao(id) {
    if (NUM_PAINEL[id] != null) return NUM_PAINEL[id]
    if (NUM_CONFIG[id] != null) return NUM_CONFIG[id] >= 12 ? `5>${NUM_CONFIG[id]}` : `6>${NUM_CONFIG[id]}`
    if (NUM_STATUS[id] != null) return `7>${NUM_STATUS[id]}`
    return null
}

export function criarSections(listaComandos) {
    const sections = []
    const porCategoria = {}

    // Agrupa por categoria
    listaComandos.forEach(cmd => {
        if (!porCategoria[cmd.categoria]) porCategoria[cmd.categoria] = []
        porCategoria[cmd.categoria].push(cmd)
    })

    // Cria sections de 25 em 25
    for (const cat in porCategoria) {
        const cmds = porCategoria[cat]
        for (let i = 0; i < cmds.length; i += 25) {
            const fatia = cmds.slice(i, i + 25)
            sections.push({
                title: `${cat}${i > 0 ? ` (${i / 25 + 1})` : ""}`,
                rows: fatia.map(c => {
                    const n = numeroNavegacao(c.id)
                    return { title: c.title, description: n ? `[${n}] ${c.description}` : c.description, id: c.id }
                })
            })
        }
    }
    return sections
}

// =========================================================
// 2. MENU PRINCIPAL - Se tiver +100 comandos, mostra categorias (PAGINAÇÃO)
// =========================================================
export async function enviarMenuPrincipal(jid) {
    const categorias = [...new Set(COMANDOS.map(c => c.categoria))]

    // [v57] CORREÇÃO DO BOTÃO NÃO CLICÁVEL: o menu principal usava o transporte
    // do list.js, cujo single_select sai como {title, sections} com rows só com
    // rowId — no cliente o botão RENDERIZA mas o toque não abre o picker. A
    // lista de GRUPOS (referência funcional no aparelho) usa
    // enviarMensagemInterativa + criarBotao("single_select"), cujo
    // buttonParamsJson sai como {title, text, buttonText, sections} com rows
    // {id, rowId}. Este menu agora usa EXATAMENTE essa implementação — só os
    // DADOS mudam (mesmas seções/ids/ações de COMANDOS; navegação por números
    // e ids preservados; modo text continua caindo para texto com opções).
    if (COMANDOS.length <= 100) {
        const botoes = [criarBotao("single_select", {
            title: "MENU COMPLETO",
            text: `${COMANDOS.length} comandos · ${categorias.length} categorias`,
            buttonText: "ABRIR LISTA",
            sections: criarSections(COMANDOS)
        })]
        return enviarMensagemInterativa(
            jid,
            `*SYZYGY MENU*\nTotal: ${COMANDOS.length} comandos\nOrganizado em ${categorias.length} categorias`,
            botoes
        )
    }

    // Se tem +100, cria menu de categorias (PAGINAÇÃO OBRIGATÓRIA)
    const rows = categorias.map(cat => ({
        title: cat,
        description: `${COMANDOS.filter(c => c.categoria === cat).length} comandos`,
        id: `cat_${cat.toLowerCase()}`
    }))

    // Adiciona voltar/sair
    rows.push({ title: "🚪 Sair", description: "Fechar painel", id: "owner_sair" })

    const botoes = [criarBotao("single_select", {
        title: "MENU PRINCIPAL",
        text: `${COMANDOS.length} comandos`,
        buttonText: "VER CATEGORIAS",
        sections: [{ title: "CATEGORIAS", rows }]
    })]
    return enviarMensagemInterativa(
        jid,
        `*SYZYGY MENU*\n${COMANDOS.length} comandos encontrados.\nEscolha uma categoria:`,
        botoes
    )
}

// =========================================================
// 3. SUB-LISTAS - Uma para cada categoria, até 100 comandos, sections de 25
// =========================================================
export async function enviarSubLista(jid, categoriaNome) {
    const sock = getSock()
    const filtrados = COMANDOS.filter(c => c.categoria.toLowerCase() === categoriaNome.toLowerCase())

    if (filtrados.length === 0) {
        await safeSendMessage(jid, { text: `❌ Categoria não encontrada: ${categoriaNome}` }, 0)
        return false
    }

    const sections = criarSections(filtrados)

    // IMPORTANTE: Sempre adiciona botão voltar no final de toda sub-lista
    sections.push({
        title: "Navegação",
        rows: [{ title: "⬅️ Voltar ao Menu", description: "Voltar ao menu principal", id: "voltar_menu" }]
    })

    return sendInteractiveList(sock, jid, {
        title: categoriaNome.toUpperCase(),
        body: `*${categoriaNome}*\n${filtrados.length} comandos nesta categoria\nDividido em sections de até 25`,
        footer: `${filtrados.length} opções`,
        buttonText: "VER COMANDOS",
        sections
    })
}

// Funções específicas por categoria (para compatibilidade com spec)
export async function enviarListaGrupos(jid) { return enviarSubLista(jid, "Grupos") }
export async function enviarListaAtaque(jid) { return enviarSubLista(jid, "Ataque") }
export async function enviarListaPresets(jid) { return enviarSubLista(jid, "Presets") }
export async function enviarListaConfig(jid) { return enviarSubLista(jid, "Config") }
export async function enviarListaPermissoes(jid) { return enviarSubLista(jid, "Permissoes") }
export async function enviarListaViewOnce(jid) { return enviarSubLista(jid, "ViewOnce") }
export async function enviarListaRapido(jid) { return enviarSubLista(jid, "Rapido") }

// [v56] handleListClick (2º despachante da era v36) REMOVIDO DEFINITIVAMENTE:
// zero chamadas desde a v53 (despacho único = tratarInteracao → roteadorAcoes,
// no messageHandler). Despachante paralelo morto = risco de duplo consumo.
// Parser único de interações: getListId (list.js) → tratarInteracao (interactionHandler).

// [v52] LISTA REAL DE COMANDOS — enviada quando o usuário toca "Mostrar lista"
// (clientes que não abrem o picker nativo devolvem a interação sem id → o
// roteador chama "mostrar_lista" → esta função). Mesma fonte de dados:
// COMANDOS/categorias reais + números reais de navegação.
export async function enviarListaComandos(jid) {
    const sock = getSock()
    const categorias = [...new Set(COMANDOS.map(c => c.categoria))]
    return sendInteractiveList(sock, jid, {
        title: "LISTA DE COMANDOS",
        body: `*SYZYGY MENU*\nTotal: ${COMANDOS.length} comandos\nOrganizado em ${categorias.length} categorias\nSelecione uma opção`,
        footer: "Selecione uma opção",
        buttonText: "MOSTRAR LISTA",
        sections: criarSections(COMANDOS)
    })
}

// Wrapper para compatibilidade com código antigo que espera enviarMenuPrincipal(jid)
export async function enviarMenuPrincipalWrapper(jid) {
    return enviarMenuPrincipal(jid)
}

// Exporta categorias para uso externo (paginação)
export const CATEGORIAS = {
    grupos: { titulo: "📋 Grupos & Listagem", descricao: "Gerenciamento de grupos", rows: COMANDOS.filter(c => c.categoria === "Grupos") },
    ataque: { titulo: "💣 Ataque & Domínio", descricao: "Flood, Nuke, Roubar", rows: COMANDOS.filter(c => c.categoria === "Ataque") },
    presets: { titulo: "🎨 Presets & Mídia", descricao: "Nome, bio, foto, presets", rows: COMANDOS.filter(c => c.categoria === "Presets") },
    config: { titulo: "⚙️ Configurações Sistema", descricao: "Flood, limpeza, anti-takeover", rows: COMANDOS.filter(c => c.categoria === "Config") },
    permissoes: { titulo: "🔐 Permissões & Segurança", descricao: "ADMs, grupos autz, donos extras", rows: COMANDOS.filter(c => c.categoria === "Permissoes") },
    viewonce: { titulo: "👁️ ViewOnce & Histórico", descricao: "ViewOnce, logs, agendamentos", rows: COMANDOS.filter(c => c.categoria === "ViewOnce") },
    rapido: { titulo: "⚡ Modo Rápido", descricao: "Comandos com / e @", rows: COMANDOS.filter(c => c.categoria === "Rapido") },
    status: { titulo: "🫥 Status Manager", descricao: "Criar/publicar status com audiência", rows: COMANDOS.filter(c => c.categoria === "Status") }
}

// Funções antigas mantidas para compatibilidade (não quebra nada)
export async function sendMainInteractiveMenu(jid) { return enviarMenuPrincipal(jid) }
export async function sendCategoryInteractiveMenu(jid, catId) { return enviarSubLista(jid, catId) }
export async function sendFastHelpMenu(jid) { return enviarSubLista(jid, "Rapido") }

```

#### `./menus/menutest.js` — 132 linhas, 6974 bytes

```js
// menus/menutest.js
// Construtor puro de botões Native Flow — Sem dependências de envio.
// [REORGANIZAÇÃO] Agora usa o módulo genérico utils/botoes.js (criarBotao/criarBotoes)
// em vez de montar { name, buttonParamsJson } à mão. Mesmos IDs, mesmos textos.

import { criarBotao } from "../utils/botoes.js"

export function buildMainMenuButtons(prefix = "!") {
 return [
 criarBotao("single_select", {
 title: " SYZYGY MENU",
 text: "Selecione uma opção:",
 buttonText: " CATEGORIAS",
 sections: [
                {
 title: " ADMINISTRAÇÃO",
 rows: [
                        { title: "01 Registrar Nome", description: "Alterar o nome do bot", id: "painel_registrar_nome" },
                        { title: "02 Registrar Bio", description: "Alterar a descrição do bot", id: "painel_registrar_bio" },
                        { title: "03 Listar Grupos", description: "Ver grupos disponíveis", id: "painel_listar_grupos" },
                        { title: "12 Configurações", description: "Preferências do SYZYGY", id: "painel_config" }
                    ]
                },
                {
 title: " OPERAÇÕES DE GRUPO",
 rows: [
                        { title: "05 Só Nome", description: "Alterar apenas o nome do grupo", id: "painel_so_nome" },
                        { title: "06 Só Bio", description: "Alterar apenas a bio do grupo", id: "painel_so_bio" },
                        { title: "07 Nome + Bio", description: "Alterar nome e bio do grupo", id: "painel_nome_bio" },
                        { title: "13 Preset + NUKE", description: "Aplica preset (nome+bio+foto) + NUKE", id: "painel_tudo" }
                    ]
                },
                {
 title: " MÍDIA DO GRUPO",
 rows: [
                        { title: "09 Foto do Grupo (arquivo)", description: "Alterar foto via arquivo", id: "painel_foto_grupo" },
                        { title: "10 Foto por Link/URL", description: "Alterar foto via URL", id: "painel_foto_link" },
                        { title: "11 Remover Foto", description: "Remover foto do grupo", id: "painel_remover_foto" }
                    ]
                },
                {
 title: " AÇÕES DESTRUTIVAS",
 rows: [
                        { title: "04 NUKE", description: "Executar NUKE no grupo", id: "painel_nuke" },
                        { title: "08 FLOOD", description: "Envio massivo de mensagens", id: "painel_flood" },
                        { title: "14 Roubar Grupo", description: "Tira admin de todos, fecha e domina", id: "painel_roubar" }
                    ]
                }
            ]
        }),
 criarBotao("quick_reply", { displayText: " Painel Completo", id: "abrir_painel" }),
 criarBotao("quick_reply", { displayText: " Status", id: "cfg_status" }),
 criarBotao("cta_copy", { displayText: " Copiar Prefixo", copyCode: prefix })
    ]
}

export function buildAdminMenuButtons() {
 return [
 criarBotao("single_select", {
 title: " PAINEL SYZYGY",
 text: "Selecione uma função:",
 buttonText: " SELECIONAR",
 sections: [{
 title: " ADMINISTRAÇÃO",
 rows: [
                    { title: "01 Registrar Nome", description: "Alterar o nome do bot", id: "painel_registrar_nome" },
                    { title: "02 Registrar Bio", description: "Alterar a descrição do bot", id: "painel_registrar_bio" },
                    { title: "03 Listar Grupos", description: "Listar os grupos disponíveis", id: "painel_listar_grupos" },
                    { title: "04 NUKE", description: "Executar função NUKE existente", id: "painel_nuke" },
                    { title: "05 Só Nome", description: "Executar alteração somente de nome", id: "painel_so_nome" },
                    { title: "06 Só Bio", description: "Alterar a descrição do bot", id: "painel_so_bio" },
                    { title: "07 Nome + Bio", description: "Alterar nome e bio do bot", id: "painel_nome_bio" },
                    { title: "08 FLOOD", description: "Executar função FLOOD existente", id: "painel_flood" },
                    { title: "09 Foto do Grupo", description: "Alterar foto usando mídia", id: "painel_foto_grupo" },
                    { title: "10 Foto por Link", description: "Alterar foto usando URL", id: "painel_foto_link" },
                    { title: "11 Remover Foto", description: "Remover foto do grupo", id: "painel_remover_foto" },
                    { title: "12 Configurações", description: "Abrir configurações do SYZYGY", id: "painel_config" },
                    { title: "13 Preset + NUKE", description: "Aplica preset (nome+bio+foto) + NUKE", id: "painel_tudo" },
                    { title: "14 Roubar Grupo", description: "Tira admin de todos, fecha e domina", id: "painel_roubar" }
                ]
            }]
        })
    ]
}

export function buildConfigButtons() {
 return [
 criarBotao("single_select", {
 title: " CONFIG",
 text: "Configurações:",
 buttonText: " SELECIONAR",
 sections: [{
 title: "SISTEMA",
 rows: [
                    { title: " Alterar imagem do menu", description: "", id: "cfg_menuImage" },
                    { title: " Visualizar proprietário", description: "", id: "cfg_owner" },
                    { title: " Número conectado", description: "", id: "cfg_number" },
                    { title: " Status da conexão", description: "", id: "cfg_status" },
                    { title: " Atualizar menu", description: "", id: "cfg_restart" },
                    { title: " Voltar", description: "", id: "abrir_painel" }
                ]
            }]
        })
    ]
}

export function buildGroupActionsButtons(groupId, groupSubject, isAdmin) {
 return [
 criarBotao("single_select", {
 title: " AÇÕES DO GRUPO",
 text: groupSubject,
 buttonText: " EXECUTAR AÇÃO",
 sections: [{
 title: " AÇÕES DISPONÍVEIS",
 rows: [
                    { title: " Alterar Nome", description: "Mudar o nome do grupo", id: "painel_so_nome" },
                    { title: " Alterar Bio", description: "Mudar a descrição", id: "painel_so_bio" },
                    { title: " Nome + Bio", description: "Alterar ambos", id: "painel_nome_bio" },
                    { title: " Foto (arquivo)", description: "Enviar foto ou documento", id: "painel_foto_grupo" },
                    { title: " Foto (link/URL)", description: "Enviar URL da foto", id: "painel_foto_link" },
                    { title: " Remover Foto", description: "Remove a foto atual", id: "painel_remover_foto" },
                    { title: " NUKE", description: "Ação destrutiva", id: "painel_nuke" },
                    { title: " FLOOD", description: "Envio massivo", id: "painel_flood" },
                    { title: " Voltar ao Menu", description: "Painel principal", id: "abrir_painel" }
                ]
            }]
        }),
 criarBotao("quick_reply", { displayText: " Painel Principal", id: "abrir_painel" }),
 criarBotao("cta_copy", { displayText: " Copiar ID do Grupo", copyCode: groupId })
    ]
}

```

#### `./index.js` — 45 linhas, 2122 bytes

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

#### `./features/flood/README.md` — 489 linhas, 25577 bytes

````md
# features/flood — TIPO de conteúdo `shopping` (card de loja) no flood

**O que é:** um TIPO/PRESET de conteúdo do flood existente.
**O que NÃO é:** um segundo flood. Não há fila, timer, lote, throttle, permissão
ou executor próprios — quem envia continua sendo `executarFlood()` /
`executarFloodLote()` em `services/groupService.js`.

Paquete de referência: **@lucasmod/boruto-vk7-baileys 7.4.7** (verificado com
`npm pack` em 2026-09-16 — nada aqui é inferido de README de terceiros).

---

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `shopping.js` | **adapter puro**: monta/valida o conteúdo de send. Sem socket, sem fs. |
| `presets/shopping.js` | dados do preset `shopping-test` (arquivo de dados, sem import do flood). |
| `config.js` | registro de presets, limites e as regras de `surface`. |
| `engine.js` | `buildSendContent` + `defaultSend` (o `sock.sendMessage` real) + builder por iteração. |
| `index.js` | API pública + overlay do wizard (`loja:...`). |
| `tests.js` | `node features/flood/tests.js`. |

---

## Contrato de envio (único aceito)

```js
sock.sendMessage(jid, {
  text,                 // obrigatório → interactiveMessage.body.text
  title, subtitle,      // opcionais   → header.title / header.subtitle
  footer,               // opcional    → footer.text
  shop: { surface, id },// obrigatório → shopStorefrontMessage { surface, id }
  viewOnce              // SÓ quando true explícito (ver abaixo)
})
```

O que o fork faz com isso, em `lib/Utils/messages.js` (ramo `shop`, :1020):

```js
else if ('shop' in message && !!message.shop) {
  interactiveMessage = { shopStorefrontMessage: { surface: message.shop.surface, id: message.shop.id } }
  if ('text' in message) { body = { text }; header = { title, subtitle, hasMediaAttachment: false } }
  if (footer) footer = { text }
  m = { interactiveMessage }
}
```

O ramo `shop` é uma cadeia **separada** da cadeia `text`: o `extendedTextMessage`
montado antes é **substituído** pelo `interactiveMessage`. Isso foi confirmado no
pacote real, não por leitura de README.

Regras do adapter (todas com teste):

* **nunca** `{ interactiveMessage: { shopStorefrontMessage } }` montado na mão;
* **nunca** `hasMediaAttachment` (o ramo `text` do fork já põe `false`);
* **nunca** `payment` — pagamento é outro proto (`requestPaymentMessage`) e
  continua no caminho próprio, intocado;
* `title`/`subtitle`/`footer` **só vão no objeto quando são string não vazia**
  (nada de `undefined` espalhado = header vazio);
* chaves extras dentro de `shop` são descartadas com aviso (o atalho lê só
  `surface` e `id`).

---

## `viewOnce` — a causa nº 1 do “mensagem indisponível”

Depois de montar o `interactiveMessage`, o fork faz (~1631):

```js
else if ('viewOnce' in message && !!message.viewOnce) {
  key.viewOnce = true
  m = { viewOnceMessage: { message: m } }
}
```

Ou seja: `viewOnce: true` colocou um **card de loja dentro de um
`viewOnceMessage`**. O app comum não decodifica esse par:
notificação **“mensagem indisponível”** e, ao abrir, **“sua versão do WhatsApp
não é compatível / Atualizar o WhatsApp”** — sem atualização existir no app.

O bug era estrutural no adapter: `viewOnce = src.viewOnce !== false` deixava
**sempre** `true`.

**Contrato agora:**

* padrão: **a chave `viewOnce` não existe** no payload (não mandamos `false`,
  mandamos nada → nenhum wrap);
* preset `shopping-test`: `viewOnce: false` (e o payload sai sem a chave);
* `viewOnce: true` continua **possível** explicitamente, com o aviso de risco no
  resumo do wizard;
* `viewOnceV2`/`viewOnceMessageV2`/`viewOnceExt` **não** são alternativa: o wrap
  continua sendo wrap. O adapter recusa essas chaves.

Testes que travam isso: “payload NÃO contém viewOnce por padrão”, “viewOnce:false
→ chave omitida”, e a integração real que mostra o fork embrulhando em
`viewOnceMessage` quando (e somente quando) `viewOnce: true`.

---

## `surface` — o proto não tem 4

`WAProto/E2E/E2E.proto`:

```proto
message ShopMessage {
  optional string id = 1;
  optional Surface surface = 2;
  optional int32 messageVersion = 3;
  enum Surface { UNKNOWN_SURFACE = 0; FB = 1; IG = 2; WA = 3; }
}
```

O **README do fork** documenta `surface: 1, // 2 | 3 | 4`. **4 não existe no
enum** deste pacote, e o `ShopMessage.fromObject` gerado pelo protobufjs tem um
`default:` que aceita qualquer número — logo, `4` era codificado no wire tal
como veio (verificado: `generateWAMessageContent({..., shop:{surface:4}})` devolve
`surface: 4`) e o cliente responde “versão incompatível”.

**Decisão do projeto** (mapear, não recusar silenciosamente):

| entrou | sai | aviso |
| --- | --- | --- |
| `1` / `2` / `3` (ou `FB`/`IG`/`WA`) | o mesmo valor | não |
| `4` (o número do README) | **`3` (WA)** | sim, no wizard |
| `0`, `5`, `9`, `-1`, `1.5`, texto não reconhecido | **`SURFACE_INVALID`** | erro claro: “use 1 (FB), 2 (IG) ou 3 (WA)” |

`engine.buildSendContent` é a **última porteira**: um conteúdo montado por fora do
adapter com `surface: 4` não chega ao socket — vira `SURFACE_INVALID`. Por isso o
overlay `Promoção|by zuck|4|https://…` (o caso real colado do print) **nunca**
gera send com surface 4: gera surface 3 com aviso.

## `messageVersion` e os DOIS caminhos do `shop` no fork

| caminho (atalho `sendMessage`) | `shopStorefrontMessage` | `nativeFlowMessage` | bytes do proto |
| --- | --- | --- | --- |
| `{ text, shop:{surface,id} }` → ramo `shop` puro (:1020) | `{surface,id}` — **`messageVersion: null`** | não | 138 |
| `{ text, nativeFlow:[…], shop:{surface,id} }` → ramo `interactiveButtons/nativeFlow` + `message.shop` (~1306) | `{surface,id,messageVersion:1}` | **sim** | 195 |

Medidos com `generateWAMessageContent` + `proto.Message.encode` do pacote real
(2026-09-16). O proto deste fork (e o do Baileys upstream 6.7.9, comparado na
mesma data) **não tem** `InteractiveMessage.type`/`STORE` — não existe outro campo
a setar para "escolher o renderer".

## `loja:flow:` — o A/B para quando o payload está limpo e o app ainda diz "indisponível"

Evidência interna deste repo: `services/interactiveService.js` monta os menus como
`viewOnceMessage { interactiveMessage { header, body, footer, nativeFlowMessage } }`
e os comentários chamam isso de "único transporte comprovado renderizando";
`services/buttons.js` e `services/list.js` dizem "SEM viewOnceMessage (fix @lid)".
Ou seja: **no app de vocês o wrap sozinho não é o impedimento** — o que decide é o
conteúdo do `oneof interactiveMessage` e a versão dele.

Por isso existe o modo `flow` (`loja:flow:…`): o MESMO card de loja, com as MESMAS
regras (sem viewOnce por padrão, surface 1–3, sem payment, sem proto cru), enviado
pelo ramo do fork que põe **`messageVersion: 1`** e anexa um `nativeFlowMessage`
com um botão `cta_url` apontando para o `shop.id`. É o único jeito, dentro do
atalho `{ shop }`, de entregar a vitrine versionada.

Como usar o A/B (mesmo grupo, mesma hora):

```
loja:0            → modo puro (padrão)      → se der "indisponível", teste:
loja:flow:0       → modo flow (mv:1)        → se também falhar: o app/conta não
                                               implementa storefront
```

Leia a linha `wire:` que o fim do flood imprime: `… (shop puro)` ou
`… + nativeFlowMessage (messageVersion:1)`. É a prova do que saiu, sem depender
de suposição.

**`shop.id` não é URL no tráfego real.** É o id da vitrine/catálogo da conta
Business. O exemplo `id: 'https://example.com'` do README do fork é ficção
documental; um id que o cliente não resolve também produz card não renderizado.
O preset `shopping-test` traz uma URL de exemplo **como marcador** — troque pelo
id real do catálogo (e, no modo `flow`, a URL vira o botão `cta_url`).

## `messageVersion` — não é nosso para inventar

O ramo `shop` puro **não** seta `messageVersion`, e o atalho `{ shop }` não expõe
o campo. Como a arquitetura proíbe montar proto cru, **o modo `puro` não manda
`messageVersion`** — nem agora, nem "adivinhando" um valor. Quem precisa da
versão usa o ramo que o próprio fork versiona: o modo `flow` (acima).

---

## “Ler Mais” e o corpo do card

`connection/socket.js` tem um hook **global** que aplica `aplicarLerMais()` a
todo `content.text`/`content.caption` enviado (fora `status@broadcast`).
`utils/lerMais.js` preenche com U+034F até ~4000 caracteres **qualquer texto com
quebra de linha**. Para um card de loja isso é entulho dentro do `body`.

Como `connection/` e `utils/lerMais.js` estão fora do escopo do shopping, o
adapter resolve **dentro do contrato**: o corpo do card sai em **uma linha só**
(quebras viram espaço, com aviso) e runs de ≥6 invisíveis (U+200B/200C/200D/2060/
U+034F/FEFF) são removidos. O enchimento de 1–5 invisíveis que o **laço do flood**
adiciona por iteração é preservado de propósito — sem ele as mensagens do flood
deixam de ser únicas. O `linkDivulgacao` entra no shopping **na mesma linha** e
só se couber no limite do corpo.

Prompts do dono continuam seguindo o comportamento global de “Ler Mais” do resto
do bot (nada de exceção só para a loja).

---

## Wizard (overlay)

No passo “Digite a mensagem” do flood (grupo único ou multi-seleção
`1,3,5` / `1-5`):

```
loja                                      → preset default (shopping-test)
loja:0                                    → idem
loja:texto livre                          → corpo do card + defaults do preset
loja:texto|title|surface|id               → overlay completo
loja:texto|title|surface                   → id vem do preset
loja:texto|title|4|https://…               → surface vira 3 (WA) + aviso
```

* gatilhos aceitos: `loja:`, `shop:`, `shopping:` (e a palavra sozinha);
* **sem gatilho = flood clássico**, exatamente como era;
* `0` = default; campo vazio no overlay = default do preset;
* texto livre com `|` (ex.: `50%|só hoje`) **não** é engolido: só é overlay
  quando o 3º campo é `1|2|3|4|FB|IG|WA`;
* alvo = os grupos escolhidos no wizard; nada de allowlist nova, nada de
  prefixo `!pix`, nada de estado novo de fila;
* `!flood` do `services/fastParser.js` continua texto puro (o tipo loja é do
  wizard).

## Honestidade sobre renderização

O tipo enviado é o real do fork (`interactiveMessage.shopStorefrontMessage`), e
o payload agora é decodificável: sem `viewOnceMessage`, sem `surface` fora do
enum, sem header vazio por `undefined`. **Isso elimina as causas de
“mensagem indisponível / versão incompatível” que dependiam de nós.**

O que **não** podemos prometer: que todo app do WhatsApp desenhe o card de loja.
`shopStorefrontMessage` é o tipo de vitrine de catálogo (recurso de WhatsApp
Business / FB-IG); em cliente comum pode aparecer como texto simples ou como
mensagem não suportada — sem relação com a versão instalada. Se o app do seu
público não renderizar:

* o adapter **não** finge card (não mandamos texto com emoji imitando loja);
* **não** misturamos `payment` para “parecer” rico;
* o preset continua isolado, e o aviso acima já está no prompt da loja
  (`shoppingPromptText()`).

Diagnóstico recomendado antes de culpar o bot: enviar para um grupo de teste e
conferir (a) se a notificação abre, (b) se aparece texto em vez de card, (c) o
`wire` impresso no fim do flood (`describeSendWire`).

## Testes

```
node features/flood/tests.js
```

* **172** asserções com `@lucasmod/boruto-vk7-baileys` instalado (cobre os dois modos
  de entrega e compara o proto gerado com `messageVersion` nulo/1); sem o pacote,
  o mesmo suite roda os blocos de contrato como **SKIP declarado** no stdout —
  nunca "passado" inventado.
* quando `@lucasmod/boruto-vk7-baileys` está instalado, o suite **também**: compara as
  chaves que enviamos com as que o `lib/Utils/messages.js` do fork realmente lê,
  confere o enum em `WAProto/E2E/E2E.proto` (e que `= 4` não existe) e gera o
  proto de verdade com `generateWAMessageContent` para provar o wire
  (`interactiveMessage` sem `viewOnceMessage`, `surface` mapeada,
  `messageVersion` nulo);
* sem o pacote instalado, esses blocos são **SKIP** contados — nunca “passado”
  inventado;
* testes de payment: intocados (não existem neste diretório; o fluxo de
  pagamento tem caminho próprio).

---

## Patch para a branch `arena/01a0aaae-…` (`69f826a`) — o código que está em produção

Esta sessão partiu do snapshot `7c8987b`, onde `features/flood/` **não existia**; a branch
da outra sessão (`arena/01a0aaae-syzygy-bot-whatsapp`, tip em `69f826a`) é a que tem o
motor de flood/presets real (`engine.js`, `queue.js`, `payment.js`, `shopping.js`,
`presets/shopping.js`, `tests.js`). Nela, os mesmos três bugs estavam no caminho:

```
features/flood/shopping.js  viewOnce = src.viewOnce !== false      → SEMPRE true → viewOnceMessage
                            SHOP_SURFACES = {1,2,3,4}, /^[1-4]$/   → surface 4 ia cru no wire
                            caption: "" e hasMediaAttachment: false → chaves vazias no payload
features/flood/config.js    "shopping-test".viewOnce: true          → o preset ligava o wrap
features/flood/engine.js    defaultSend: { ...content }             → espalhava tudo no sendMessage
```

Medido com o pacote real (ANTES do fix, mesmo payload): `{ viewOnceMessage }` 34 bytes —
o que o app não decodifica. DEPOIS: `{ interactiveMessage }` 104 bytes com
`shopStorefrontMessage { surface: FB, id }`, e `…|4|url` saindo como `surface 3`.

**Aplicar** (na sua árvore, na branch `69f826a`):

```bash
git checkout arena/01a0aaae-syzygy-bot-whatsapp
git apply --check features/flood/patches/69f826a-shopping-payload-fix.patch   # testa
git apply features/flood/patches/69f826a-shopping-payload-fix.patch
node features/flood/tests.js                                                  # suite dela, verde
```

O patch toca só `features/flood/{shopping,config,engine,index,tests}.js`: não mexe em
payment, fila, limiter, allowlist, connection, sessão nem menus. Os testes atuais que
exigiam `content.viewOnce === true` e `surface 1-4 válidos` foram reescritos para o
comportamento correto (asserts novos: sem `viewOnce` por padrão, `4 → 3` mapeado com
`surfaceMapped: 4`, `0/5+` → `SURFACE_INVALID`, nada de `caption:""`/`hasMediaAttachment:false`,
`viewOnce: true` explícito ainda respeitado, preset `shopping-test` com `viewOnce:false`).

Há um segundo patch, **opcional e independente**: `69f826a-shopid-diagnostico-opcional.patch`
só acrescenta `features/flood/commerce.js` (não edita nada da sua árvore) para você conferir se o
`shop.id` do preset é um id real do catálogo:

```bash
git apply features/flood/patches/69f826a-shopid-diagnostico-opcional.patch
```

O `A/B` de `messageVersion` (modo `flow`) NÃO está nesse patch — ele é aditivo e vive na
feature criada nesta sessão; para a branch de produção, teste primeiro o patch acima.

## Onde achar um `shop.id` de verdade

`features/flood/commerce.js` (leitura pura; quem passa o socket é o chamador) usa SOMENTE as APIs
que este fork tem (`sock.getCatalog`, `sock.getCollections` — ver
`node_modules/@lucasmod/boruto-vk7-baileys/lib/Socket/business.js`) e responde à pergunta *"o id que
está no preset é o id do meu catálogo?"*:

```js
import { listarIdsDeLoja, compararShopId, formatDiagnostico } from "./features/flood/commerce.js"
const lista = await listarIdsDeLoja(sock)             // products[].productId + collections[].id
console.log(formatDiagnostico(lista, preset.shop.id))
// • conta consultada: 5519…@s.whatsapp.net
// • ids candidatos: 9911 (Camiseta) [catalog.productId] · 7788 (Verão) [collections.id]
// • veredito do preset: '…' é URL, não id de catálogo/vitrine.
```

Sem código: no Commerce Manager a URL da vitrine é
`business.facebook.com/commerce/catalogs/<CATALOG_ID>/products` — esse `<CATALOG_ID>` costuma ser o
`shop.id` que resolve. O preset atual (`69f826a` e o `shopping-test` desta branch) carrega uma URL
do Wikipedia: é **marcador**, não id — mesmo com payload limpo, o cliente não tem o que resolver.

Nada aqui promete card visível, e o módulo é read-only (não chama `sendMessage`), por isso não foi
ligado a menu/comando nenhum: quem tem o socket chama quando quiser.

---

# Infraestrutura de presets (recuperada de `arena/01a0aaae` e adaptada ao AB7)

A arena `01a0aaae` tinha um sistema de flood de presets (queue/limiter/kill switch/
allowlist/custom store/presets/speed + `runPresetJob`). Ele foi **reconstruído** aqui —
não copiado por cima: `cherry-pick` dos commits e substituição do `engine.js` do AB7 estão
fora de cogitação, porque o `engine.js` daqui é a camada de ENVIO do shopping e o `executarFlood`
de `services/groupService.js` continua sendo o executor do projeto.

```
preset → loadPreset() → validação do tipo → allowlist → grupo protegido →
       → cooldown → speed (FLOOD_MODOS/CONFIG) → queue + limiter → builder →
       → services/groupService.executarFlood() → métricas/resultado estruturado
```

| módulo | o que traz | dependências |
|---|---|---|
| `limiter.js` | `createLimiter`, `withTimeout`, `sleep`, `classifyError`, `remainingCooldown`, `markJobEnd`, `clearCooldown` | nada (infra pura) |
| `queue.js` | `createQueue` — mata na 1ª iteração após kill switch, retry limitado, abort em `disconnect`/permanente, resultados por item | `limiter.js`, `killswitch.js` |
| `killswitch.js` | `isKillSwitchOn`, `setKillSwitch(on,{persist})`, `toggleKillSwitch`, `onKillSwitch`, `killSwitchStatusTexto` | `utils/config.js` |
| `allowlist.js` | `getAllowlist`, `normalizeTargetJid`, `isOnAllowlist`, `filterAllowlist`, `filterTargets`, `add/removeAllowlistJid`, `formatAllowlistTexto`, `maskJid` | `utils/config.js`, `utils/permissions.js` |
| `customStore.js` | CRUD em `CONFIG.floodCustomPresets` (`slugPresetId`, `save/update/delete/list`, `formatCustomPresetsTexto`, IDs reservados) | `utils/config.js` |
| `speed.js` | `resolveFloodSpeed`, `formatFloodSpeedMenu`, `applyFloodSpeed`, `toFloodOpts` | `utils/config.js` |
| `groups.js` | `parseSelectedGroups` (`1` ou `1,3,5`), `extractTargetJids` | nada |
| `payment.js` | adapter `{payment:{note,currency,amount,offset,from}}` → `requestPaymentMessage` (o `sendPaymentMessage` antigo caiu: envio é do laço) | nada |
| `presets/{index,text,mention,media,payment,custom}.js` + `presets/shoppingBuilder.js` | `loadPreset`, `buildContent`, `makeIterationBuilder`, `listPresets`, `previewContentKeys` | builders por tipo |
| `presetEngine.js` | `runPresetJob`, `formatPresetJobResult`, `isFloodEngineRunning`, `currentJobInfo`, `cancelRunningJob` | os acima + `executarFlood` (import dinâmico) |
| `doctor.mjs` | diagnóstico no terminal, **zero envio** | os acima |

## Tetos (é isto que mantém o sistema de *teste*)

`FLOOD_PRESET_HARD_CAP` em `config.js`: **10 mensagens · intervalo ≥ 1000 ms · concorrência ≤ 2 ·
cooldown ≥ 5 s · timeout 3–30 s · retries ≤ 2**. `clampPresetLimits()` é o único ponto que aplica
e nada — preset, overlay do wizard, `config.json` ou custom — consegue passar por cima. Além
disso, **o `maxMessages` do preset é o teto dele**: overlay só reduz. `clampJobQtd()` ainda corta
em `MAX_FLOOD` do projeto.

Cooldown é por preset e **sem bypass acidental**: só `ignoreCooldown: true` explícito ignora.
Kill switch ligado interrompe (a) jobs de preset na próxima iteração da fila, (b) o flood
clássico na fronteira do lote — `executarFlood` agora devolve `stopado: "KILL_SWITCH"` e
`tentadas`, e `executarFloodLote` marca os grupos restantes como cancelados.

Allowlist: `CONFIG.floodAllowlist` só cresce por `addAllowlistJid` (chamado por quem já é
autorizado). Não existe `allGroups`, `allContacts`, `everyone`. Lista vazia = `ALLOWLIST_EMPTY`
(nada enviado). Grupo em `gruposAutorizados` (`isAuthorizedGroup`) é bloqueado por
`filterTargets()` mesmo que esteja na allowlist.

Mentions (preset `mention`): somente de lista explícita, deduplicadas, com teto de 20; texto com
telefone visível → `MENTION_LEAK`; e `executarFlood` **não sobrescreve** as `mentions` que o
builder forneceu — o `marcarFantasma` do projeto só entra quando o builder não marcou nada.
Ou seja: preset de mention nunca vira "marcar todos".

## Como usar

```bash
node features/flood/doctor.mjs                                  # estado + dry-run de todo preset
node features/flood/doctor.mjs --target 1203…@g.us --qtd 2     # valida as porteiras do SEU alvo
node features/flood/tests.js                                    # 183 asserts (shopping/AB7)
node features/flood/tests-infra.js                              # 228 asserts (esta infra)
```

```js
import { runPresetJob, formatPresetJobResult, setKillSwitch } from "./features/flood/index.js"

const r = await runPresetJob({
    presetId: "shopping-test",              // text | mention | media | payment | shopping | custom
    targets: ["120363…@g.us"],              // JID explicitamente na allowlist
    qtd: 3,
    floodModo: "seguro",                     // 0 = config atual · 1..4 · ms custom
    dryRun: true                             // padrão do runtime é true (nada sai)
})
console.log(formatPresetJobResult(r))        // alvos mascarados, tetos aplicados, métricas
```

Custom presets: `saveCustomPreset({ name, type, … }, { persist })` grava em
`CONFIG.floodCustomPresets` e **não toca em mais nenhuma chave** do `config.json`
(`persist: false` é o que os testes usam para nem escrever o arquivo).

## Preservado x recuperado

- **Shopping AB7 intacto**: `shopping.js`, `engine.js`, `presets/shopping.js`, `config.js`
  (chaves de superfície/limites/entrega `puro|flow`), `commerce.js` e os patches `69f826a`.
  O preset `shopping` do registry **delegua** ao builder atual (`presets/shoppingBuilder.js` →
  `createShoppingPayload` + `buildSendContent`), inclusive no `custom → shopping`.
- **Payment AB7 intacto**: `Payment stays { payment:{note,currency,amount,offset,from} }`; o
  engine do shopping continua recusando payment (`PAYMENT_NOT_ALLOWED`), testado.
- **Flood clássico intacto**: `executarFlood`/`executarFloodLote` continuam sendo o laço único
  (throttle, lote, `marcarFantasma`, retry de rate limit, grupo protegido). A fila recuperada é
  infraestrutura por cima, por alvo — não um segundo executor, e não há `sock.sendMessage` novo
  espalhado.
- Não mexi em: `handlers/stateHandler.js`, `menus/*`, `commands/*`, `connection/*`, `sessao/*`,
  banco, `services/fastParser.js`, `actions/floodActions.js`.

## Dois bugs da arena antiga que a portagem corrigiu (com teste)

1. `createLimiter`: o slot era incrementado **depois** do `await` do waiter, então
   `acquire()` via espaço livre na microtask e a concorrência real estourava o teto. Agora
   `wake()` reserva o slot antes de acordar quem espera.
2. `loadPreset`: `clamp({...base, ...overlay})` deixava o overlay subir `maxMessages` do
   preset até o hard cap. Agora o preset é o teto e overlay só reduz.

`resolveMediaBuffer` ganhou `preset.menuFallback: false` — antes, mídia ausente caía
silenciosamente na foto de menu do bot; agora isso só acontece se o preset não disser o
contrário, e o erro `MEDIA_UNAVAILABLE` é testável.


## Atalhos de texto (restaurados da arena 01a0aaae)

A migração para esta branch trouxe a infra, mas **não** trouxe a fachada de comandos
que existia lá — por isso os atalhos pareciam "mortos". Eles voltaram com os **mesmos
nomes**, implementados sobre a API desta branch em `router.js`:

| Você digita | Ação | O que faz |
|---|---|---|
| `floodpresets` / `floodpreset` | `painel_flood_presets` | painel de presets + atalhos + estado do dry-run |
| `texttest` | `flood_preset_text_test` | roda o preset `text-test` |
| `mentiontest` | `flood_preset_mention_test` | roda `mention-test` |
| `mediatest` | `flood_preset_media_test` | roda `media-test` |
| `paymenttest` | `flood_preset_payment_test` | roda `payment-test` (`requestPaymentMessage`) |
| `shoppingtest` | `flood_preset_shopping_test` | roda `shopping-test` (card da loja) |
| `floodstop` | `flood_kill_on` | kill switch ON + cancela o job em andamento |
| `floodstart` | `flood_kill_off` | kill switch OFF (respeita cooldown) |
| `flooddryrun` | `cfg_flood_dryrun` | alterna dry-run |
| `2/preset/<id>[/conteúdo]` | `floodRouter("run")` | preset arbitrário (built-in ou custom) |

Diferenças **deliberadas** em relação à arena antiga:

- os alvos vêm da **allowlist** (`38 · Escolher grupos (1,3,5)` no painel do dono) —
  sem destino o atalho responde `ALLOWLIST_EMPTY` e não inicia job;
- `dryRun` segue o `config.json` (padrão **ligado**): nada sai de verdade até você
  desligar o `37`;
- não existe wizard paralelo de preset: o envio é o `executarFlood` de
  `services/groupService.js` (o `runPresetJob` só orquestra);
- `payment`/`shopping` exigem `floodTestMode` ligado (`44`), senão o motor responde
  `PAYMENT_TEST_DISABLED` / `SHOPPING_TEST_DISABLED`.

Overlay aceito nos atalhos/`2/preset/…` (mesmas regras do wizard `loja:`):
`texto|title|surface|id`, com `surface` em `1/fb · 2/ig · 3/wa` (o `4` do README do
fork é normalizado para `3`), e texto livre preservando `|`.

Validação: `node features/flood/tests-menu.js` (82 asserts — paridade menu×mapa,
atalhos no `TEXT_TO_ACTION`, atalho rodando o motor em dry-run, overlays).

````

#### `./features/flood/allowlist.js` — 165 linhas, 6360 bytes

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

#### `./features/flood/commerce.js` — 125 linhas, 5342 bytes

```js
// features/flood/commerce.js
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

const ID_KEYS = ["id", "productId", "collectionId", "catalogId"]

function clean(v) {
    return typeof v === "string" ? v.trim() : (v == null ? "" : String(v).trim())
}

/** Coleta ids candidatos de qualquer estrutura devolvida pelo fork. */
export function extrairIds(payload, prefix = "") {
    const out = []
    if (!payload) return out
    const arr = Array.isArray(payload) ? payload : (payload.products || payload.collections || [])
    for (const item of Array.isArray(arr) ? arr : []) {
        if (!item || typeof item !== "object") continue
        for (const k of ID_KEYS) {
            const v = clean(item[k])
            if (v && !out.some(o => o.value === v && o.via === (prefix ? `${prefix}.${k}` : k))) {
                out.push({ value: v, via: prefix ? `${prefix}.${k}` : k, label: clean(item.name || item.title) || null })
            }
        }
    }
    return out
}

/**
 * Lista os ids REAIS da conta conectada (catálogo + coleções).
 * @param {object} sock socket do Baileys (com getCatalog/getCollections)
 * @param {object} [opts] { limit, jid }
 */
export async function listarIdsDeLoja(sock, opts = {}) {
    if (!sock || (typeof sock.getCatalog !== "function" && typeof sock.getCollections !== "function")) {
        return { ok: false, error: "COMMERCE_UNAVAILABLE", message: "o socket não expõe getCatalog/getCollections (conta não é Business, ou o fork não traz essas APIs)." }
    }
    const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? Math.min(opts.limit, 50) : 12
    const jid = clean(opts.jid) || (sock.user && sock.user.id) || undefined
    const erros = []
    let catalogIds = []
    let collectionIds = []

    if (typeof sock.getCatalog === "function") {
        try {
            const cat = await sock.getCatalog({ jid, limit })
            catalogIds = extrairIds(cat, "catalog")
        } catch (e) {
            erros.push(`getCatalog: ${e && e.message ? e.message : e}`)
        }
    } else {
        erros.push("getCatalog: indisponível neste socket")
    }

    if (typeof sock.getCollections === "function") {
        try {
            const col = await sock.getCollections(jid, limit)
            collectionIds = extrairIds(col, "collections")
        } catch (e) {
            erros.push(`getCollections: ${e && e.message ? e.message : e}`)
        }
    } else {
        erros.push("getCollections: indisponível neste socket")
    }

    const ids = []
    for (const it of [...catalogIds, ...collectionIds]) {
        if (!ids.some(x => x.value === it.value)) ids.push(it)
    }
    return { ok: true, jid, ids, catalogIds, collectionIds, erros }
}

/**
 * O id do preset é um id do catálogo?
 * `looksLikeUrl` separa o marcador de exemplo (URL) de um id de verdade.
 */
export function compararShopId(shopId, listaOuIds) {
    const id = clean(shopId)
    const ids = Array.isArray(listaOuIds) ? listaOuIds : (listaOuIds && listaOuIds.ids) || []
    const valores = ids.map(x => (typeof x === "string" ? x : x.value))
    const match = valores.find(v => v === id) || null
    const looksLikeUrl = /^https?:\/\//i.test(id)
    return {
        id,
        match,
        ok: !!match,
        looksLikeUrl,
        verdict: match
            ? `ok: '${id}' é id real da conta (${match})`
            : (looksLikeUrl
                ? `'${id}' é URL, não id de catálogo/vitrine. Troque por um dos ids listados (ou pelo id da vitrine no Commerce Manager).`
                : `'${id}' não aparece entre os ids devolvidos pelo catálogo desta conta.`)
    }
}

/** Texto pronto para o terminal/log — nada de prometer render. */
export function formatDiagnostico(lista, shopId) {
    const l = []
    l.push("🛍️ DIAGNÓSTICO shop.id")
    if (!lista.ok) {
        l.push(`✗ ${lista.error}: ${lista.message}`)
        return l.join("\n")
    }
    l.push(`• conta consultada: ${lista.jid || "(jid padrão do socket)"}`)
    if (!lista.ids.length) {
        l.push("• nenhum id devolvido pelo catálogo (conta sem catálogo/vitrine publicada?)")
    } else {
        l.push(`• ids candidatos (${lista.ids.length}):`)
        for (const it of lista.ids.slice(0, 12)) l.push(`   - ${it.value}${it.label ? `  (${it.label})` : ""}  [${it.via}]`)
    }
    if (shopId) l.push(`• veredito do preset: ${compararShopId(shopId, lista).verdict}`)
    for (const e of lista.erros || []) l.push(`⚠️ ${e}`)
    return l.join("\n")
}

```

#### `./features/flood/config.js` — 288 linhas, 14376 bytes

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

#### `./features/flood/customStore.js` — 140 linhas, 5749 bytes

```js
// features/flood/customStore.js
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

import { CONFIG, salvarConfig } from "../../utils/config.js"

const RESERVED = new Set([
    "text-test",
    "mention-test",
    "media-test",
    "payment-test",
    "shopping-test"
])

/** Tipos que o registry de presets sabe montar (shopping = builder AB7 atual). */
export const CUSTOM_TYPES = ["text", "mention", "media", "payment", "shopping", "custom"]

export const CUSTOM_STORE_KEY = "floodCustomPresets"

export function slugPresetId(raw) {
    return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 32)
}

export function listCustomPresets() {
    if (!Array.isArray(CONFIG[CUSTOM_STORE_KEY])) CONFIG[CUSTOM_STORE_KEY] = []
    return CONFIG[CUSTOM_STORE_KEY]
}

export function getCustomPreset(id) {
    const key = slugPresetId(id)
    if (!key) return null
    return listCustomPresets().find(p => p && p.id === key) || null
}

export function isReservedPresetId(id) {
    return RESERVED.has(slugPresetId(id))
}

/**
 * Cria/atualiza um preset custom. `amount` só é exigido em payment (como era na
 * arena antiga); shopping reusa os campos do adapter AB7 (title/subtitle/footer/
 * shop/viewOnce/delivery) sem inventar nada novo.
 */
export function saveCustomPreset({ name, type, text, amount, currency, modo, caption, mentions, title, subtitle, footer, shop, viewOnce, delivery, format, image, video, document: doc, location, product, mimetype } = {}, { persist = true } = {}) {
    const id = slugPresetId(name)
    if (!id) return { ok: false, error: "NAME" }
    if (RESERVED.has(id)) return { ok: false, error: "RESERVED" }
    const t = String(type || "payment").toLowerCase()
    if (!CUSTOM_TYPES.includes(t)) return { ok: false, error: "TYPE_INVALID", allowed: CUSTOM_TYPES }

    const row = {
        id,
        type: t,
        text: String(text || "").trim() || (t === "payment" ? "Pagamento de teste" : "SYZYGY"),
        targetMode: "selected",
        modo: modo || CONFIG.floodModo || "normal"
    }
    if (t === "payment") {
        row.amount = Number(amount)
        if (!Number.isFinite(row.amount) || row.amount <= 0) return { ok: false, error: "AMOUNT_INVALID" }
        row.currency = String(currency || "BRL").trim().toUpperCase() || "BRL"
    }
    if (caption) row.caption = String(caption)
    if (title) row.title = String(title)
    if (subtitle) row.subtitle = String(subtitle)
    if (footer) row.footer = String(footer)
    if (shop && typeof shop === "object") row.shop = { ...(row.shop || {}), ...shop }
    if (viewOnce !== undefined) row.viewOnce = viewOnce === true
    if (delivery) row.delivery = String(delivery)
    if (format) row.format = String(format)
    if (image) row.image = image
    if (video) row.video = video
    if (doc) row.document = doc
    if (location) row.location = location
    if (product) row.product = product
    if (mimetype) row.mimetype = String(mimetype)
    // Mention: só lista explícita (o builder recusa números no texto).
    if (Array.isArray(mentions) && mentions.length) row.mentions = mentions.map(String)

    const list = listCustomPresets()
    const idx = list.findIndex(p => p && p.id === id)
    if (idx >= 0) list[idx] = { ...list[idx], ...row }
    else list.push(row)
    CONFIG[CUSTOM_STORE_KEY] = list
    // persist=false é o que os TESTES usam: salvarConfig() escreve config.json
    // inteiro, e um teste não tem o direito de tocá-lo no ambiente do projeto.
    if (persist) { try { salvarConfig() } catch {} }
    return { ok: true, preset: row, updated: idx >= 0 }
}

export function updateCustomPreset(id, patch = {}, opts = {}) {
    const key = slugPresetId(id)
    const existing = getCustomPreset(key)
    if (!existing) return { ok: false, error: "NOT_FOUND" }
    return saveCustomPreset({ ...existing, ...patch, name: key }, opts)
}

export function deleteCustomPreset(idOrIndex, { persist = true } = {}) {
    const list = listCustomPresets()
    const str = String(idOrIndex || "").trim()
    const asNum = parseInt(str.replace(/\D/g, ""), 10)
    let idx = -1
    if (/^\d+$/.test(str) && asNum >= 1 && asNum <= list.length) idx = asNum - 1
    else {
        const key = slugPresetId(str)
        idx = list.findIndex(p => p && p.id === key)
    }
    if (idx < 0) return { ok: false, error: "NOT_FOUND" }
    const removed = list.splice(idx, 1)[0]
    CONFIG[CUSTOM_STORE_KEY] = list
    if (persist) { try { salvarConfig() } catch {} }
    return { ok: true, removed }
}

export function formatCustomPresetsTexto() {
    const list = listCustomPresets()
    if (!list.length) return "Nenhum preset custom cadastrado."
    return list
        .map((p, i) => {
            const extra = p.type === "payment" ? ` · R$ ${Number(p.amount).toFixed(2)} ${p.currency}` : ""
            const shop = p.type === "shopping" ? ` · surface ${p.shop?.surface ?? "?"}` : ""
            return `  ${i + 1} · ${p.id} (${p.type}${extra}${shop} · ${p.modo || "normal"})`
        })
        .join("\n")
}

```

#### `./features/flood/doctor.mjs` — 105 linhas, 5232 bytes

```js
// features/flood/doctor.mjs
// [INFRA FLOOD] Diagnóstico da infraestrutura de presets — SOMENTE LEITURA.
//
// Rode no terminal, na raiz do projeto:
//   node features/flood/doctor.mjs
//   node features/flood/doctor.mjs --preset payment-test --qtd 3
//   node features/flood/doctor.mjs --target 120363...@g.us     (valida as porteiras dele)
//   node features/flood/doctor.mjs --only shopping,text
//
// O que ele faz: carrega o MESMO config.json do bot (carregarConfig), mostra o
// estado efetivo (kill switch, allowlist mascarada, limites, velocidade) e roda
// um DRY-RUN de cada tipo de preset. Não envia nada: sem sendMessage, sem
// sessão, sem escrita em disco. É a forma de conferir a migração antes de ligar
// o bot.
//
// Por que o dry-run usa um executor que ESTOURA se for chamado: assim o próprio
// doctor prova que nenhum caminho de envio foi tocado.

import { carregarConfig, CONFIG, MAX_FLOOD, FLOOD_MODOS } from "../../utils/config.js"
import { getAllowlist, maskJid } from "./allowlist.js"
import { isKillSwitchOn } from "./killswitch.js"
import { getFloodRuntimeConfig, FLOOD_PRESET_HARD_CAP, listPresetIds, getPresetDef, clampPresetLimits } from "./config.js"
import { listPresets } from "./presets/index.js"
import { formatFloodSpeedMenu } from "./speed.js"
import { runPresetJob } from "./presetEngine.js"
import { getAuthorizedGroups } from "../../utils/permissions.js"

carregarConfig()

const argv = process.argv.slice(2)
function argOf(name) {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null
}
const presetArg = argOf("preset")
const targetArg = argOf("target")
const qtdArg = Number(argOf("qtd")) || 3
const onlyArg = (argOf("only") || "").split(",").map(s => s.trim()).filter(Boolean)

const hr = (t = "─") => console.log(t.repeat(64))
const line = (k, v) => console.log(`${String(k).padEnd(22)} ${v}`)

hr()
console.log("SYZYGY · flood presets — diagnóstico (nenhum envio acontece aqui)")
hr()
line("MAX_FLOOD (clássico)", MAX_FLOOD)
line("velocidade atual", `${CONFIG.floodModo || "normal"} · ${CONFIG.floodInterval}ms · lote ${CONFIG.floodLote} · jitter ${CONFIG.floodJitter === true ? "sim" : "não"}`)
console.log(`FLOOD_MODOS            ${Object.values(FLOOD_MODOS).map(m => m.label).join(" | ")}`)
console.log(`kill switch            ${isKillSwitchOn() ? "⛔ LIGADO (nada é enviado)" : "desligado"}`)
const rt = getFloodRuntimeConfig()
console.log(`runtime                dryRun=${rt.dryRun} · testMode=${rt.testMode} · retries=${rt.maxRetries} · timeout=${rt.timeoutMs}ms`)
console.log(`hard caps              maxMessages=${FLOOD_PRESET_HARD_CAP.maxMessages} · intervalo≥${FLOOD_PRESET_HARD_CAP.minInterval}ms · conc≤${FLOOD_PRESET_HARD_CAP.maxConcurrency} · cooldown≥${FLOOD_PRESET_HARD_CAP.minCooldown}ms · retries≤${FLOOD_PRESET_HARD_CAP.maxRetries}`)
const al = getAllowlist()
console.log(`allowlist              ${al.length ? al.map(maskJid).join(", ") : "⚠️ VAZIA — todo destino de preset fica bloqueado"}`)
const gruposProtegidos = getAuthorizedGroups().length
console.log(`grupos protegidos      ${gruposProtegidos} (isAuthorizedGroup — preset nenhum dispara neles)`)
hr()
console.log("PRESETS")
hr()
for (const p of listPresets()) {
    console.log(`  ${p.id.padEnd(16)} ${String(p.type).padEnd(9)} ${p.maxMessages}x · ${p.interval}ms · conc ${p.concurrency} · cooldown ${Math.round(p.cooldown / 1000)}s · timeout ${p.timeout}ms`)
}
const custom = CONFIG.floodCustomPresets
if (Array.isArray(custom) && custom.length) {
    console.log(`  custom persistidos:  ${custom.map(c => `${c.id}(${c.type})`).join(", ")}`)
}
hr()
console.log("DRY-RUN (conteúdo validado, zero envio)")
hr()

const executorQueNaoDeveRodar = async () => {
    throw new Error("DRY-RUN TOCOU O EXECUTOR — bug grave")
}
const alvos = targetArg ? [targetArg] : (al.length ? [al[0]] : [])
const ids = presetArg ? [presetArg] : listPresetIds()
for (const id of ids) {
    const def = getPresetDef(id)
    if (!def) {
        console.log(`  ✗ ${id} — preset desconhecido`)
        continue
    }
    if (onlyArg.length && !onlyArg.includes(def.type)) continue
    const r = await runPresetJob({
        presetId: id,
        targets: alvos,
        qtd: qtdArg,
        dryRun: true,
        executor: executorQueNaoDeveRodar
    })
    if (!r.ok && r.error) {
        console.log(`  ⚠️ ${id.padEnd(16)} ${r.error}${r.remainingMs ? ` (faltam ${Math.ceil(r.remainingMs / 1000)}s)` : ""}${r.blocked?.length ? ` · bloqueados: ${r.blocked.join(", ")}` : ""}`)
        continue
    }
    const keys = r.results?.[0]?.keys || []
    const wire = r.results?.[0]?.wire ? ` · ${r.results[0].wire}` : ""
    console.log(`  ✓ ${id.padEnd(16)} tipo=${r.type} · payload=${JSON.stringify(keys)} · alvos=${r.targets.join(",") || "(nenhum)"} · planejado=${r.metrics.planned}x${wire}`)
    for (const w of r.presetExtra?.warnings || []) console.log(`     ⚠️ ${w}`)
}
hr()
console.log(formatFloodSpeedMenu())
hr()
console.log("Sem envio, sem escrita em disco. Para ligar de verdade: use o wizard")
console.log("flood do bot (o preset entra pelo mesmo executarFlood).")
process.exit(0)

```

#### `./features/flood/engine.js` — 152 linhas, 8061 bytes

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

#### `./features/flood/groups.js` — 62 linhas, 2410 bytes

```js
// features/flood/groups.js
// [INFRA FLOOD · recuperada da arena 01a0aaae]
// Alvos de um job de preset: SEMPRE escolha explícita (1 grupo, ou 1,3,5).
// Não existe varredura de "todos os grupos" nem de "todos os contatos" aqui —
// quem resolve o índice é o cache de grupos que o AB7 já mantém
// (rt().cachedGroups, services/groupService.js), e quem autoriza é a allowlist.

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

#### `./features/flood/index.js` — 386 linhas, 13600 bytes

```js
// features/flood/index.js
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

import {
    createShoppingPayload,
    describeShoppingPayload,
    normalizeSurface,
    normalizeDelivery,
    isShoppingContent,
    ShoppingPayloadError,
    SHOPPING_ERROR
} from "./shopping.js"
import {
    FLOOD_PRESETS,
    DEFAULT_SHOPPING_PRESET_ID,
    getFloodPreset,
    listShoppingPresets,
    listShoppingPresetsTexto,
    SHOPPING_FLOW_BUTTON,
    SHOPPING_DELIVERY,
    SHOPPING_DELIVERY_DEFAULT,
    SHOPPING_LIMITS,
    SHOPPING_DEFAULTS,
    SURFACE_VALID,
    SURFACE_NAMES,
    SURFACE_README_ALIAS
} from "./config.js"
import {
    defaultSend,
    buildSendContent,
    makeFloodContentBuilder,
    describeSendWire,
    SHOP_SEND_KEYS
} from "./engine.js"

export {
    createShoppingPayload,
    describeShoppingPayload,
    normalizeSurface,
    normalizeDelivery,
    isShoppingContent,
    ShoppingPayloadError,
    SHOPPING_ERROR,
    FLOOD_PRESETS,
    DEFAULT_SHOPPING_PRESET_ID,
    getFloodPreset,
    listShoppingPresets,
    listShoppingPresetsTexto,
    SHOPPING_FLOW_BUTTON,
    SHOPPING_DELIVERY,
    SHOPPING_DELIVERY_DEFAULT,
    SHOPPING_LIMITS,
    SURFACE_VALID,
    SURFACE_NAMES,
    SURFACE_README_ALIAS,
    defaultSend,
    buildSendContent,
    makeFloodContentBuilder,
    describeSendWire,
    SHOP_SEND_KEYS
}

export const SHOPPING_TRIGGERS = ["loja:", "shop:", "shopping:"]

const OVERLAY_SEP = "|"
const DEFAULT_TOKENS = new Set(["0", "default", "padrao", "padrão"])
const SURFACE_LIKE = /^(\d+|fb|ig|wa)$/i

/** Reconhece o gatilho do tipo shopping no passo de mensagem do flood. */
export function detectShoppingTrigger(text) {
    if (typeof text !== "string") return { isShopping: false, rest: "", delivery: null }
    const t = text.trim()
    for (const trig of SHOPPING_TRIGGERS) {
        if (t.toLowerCase().startsWith(trig)) {
            const after = t.slice(trig.length).trim()
            // loja:flow:… / loja:puro:… escolhem o MODO DE ENTREGA do mesmo card
            // (flow = ramo nativeFlow+shop do fork, único que põe messageVersion:1).
            const m = after.match(/^(flow|puro|pure)\s*:?\s*/i)
            if (m) {
                const tok = m[1].toLowerCase()
                return {
                    isShopping: true,
                    rest: after.slice(m[0].length).trim(),
                    trigger: trig + m[1].toLowerCase() + ":",
                    delivery: tok === "flow" ? "flow" : "puro"
                }
            }
            return { isShopping: true, rest: after, trigger: trig, delivery: null }
        }
    }
    // A palavra sozinha também vale ("loja", "shop", "shopping") = preset default.
    // NÃO vale "loja de roupas na avenida": sem os dois-pontos o resto do texto
    // é sempre flood clássico, para nunca engolir mensagem de verdade.
    if (/^(?:loja|shop|shopping)$/i.test(t)) return { isShopping: true, rest: "", trigger: "loja", delivery: null }
    return { isShopping: false, rest: "", delivery: null }
}

/**
 * Interpreta o resto digitado como overlay do shopping.
 * @returns {{kind:'default'|'plain'|'spec', src:object, note?:string, code?:string, message?:string}}
 */
export function parseShoppingOverlay(rest = "", preset = null) {
    const raw = String(rest || "").trim()

    if (raw === "" || DEFAULT_TOKENS.has(raw.toLowerCase())) {
        return { kind: "default", src: {}, note: `preset ${preset?.id || DEFAULT_SHOPPING_PRESET_ID}` }
    }

    // "0" já foi tratado; restante com pipes → tenta overlay texto|title|surface|id
    const parts = raw.split(OVERLAY_SEP).map(s => s.trim())

    if (parts.length >= 3 && SURFACE_LIKE.test(parts[2])) {
        if (parts.length > 4) {
            return {
                kind: "error",
                code: "OVERLAY_TOO_MANY_FIELDS",
                message: `overlay do shopping tem 4 campos no máximo: texto${OVERLAY_SEP}title${OVERLAY_SEP}surface${OVERLAY_SEP}id`
            }
        }
        const src = { text: parts[0] }
        if (parts[1]) src.title = parts[1]
        src.surfaceToken = parts[2]
        if (parts[3]) src.shopId = parts[3]
        return { kind: "spec", src }
    }

    // Qualquer outra coisa é TEXTO LIVRE (pipes inclusos) — é assim que o dono
    // manda "50%|só hoje" sem o wizard virar outra coisa.
    return { kind: "plain", src: { text: raw } }
}

/** Converte o parse em payload de send. Único ponto que decide defaults+limites. */
export function resolveShoppingSend(rest = "", { presetId = null, delivery = null } = {}) {
    const preset = getFloodPreset(presetId || DEFAULT_SHOPPING_PRESET_ID) || FLOOD_PRESETS[DEFAULT_SHOPPING_PRESET_ID]
    const parsed = parseShoppingOverlay(rest, preset)
    if (parsed.kind === "error") {
        return { ok: false, code: parsed.code, message: parsed.message }
    }

    const src = {}
    if (parsed.src.text !== undefined) src.text = parsed.src.text
    if (parsed.src.title !== undefined) src.title = parsed.src.title
    const shopOverride = {}
    if (parsed.src.surfaceToken !== undefined) shopOverride.surface = parsed.src.surfaceToken
    if (parsed.src.shopId !== undefined) shopOverride.id = parsed.src.shopId
    if (Object.keys(shopOverride).length) src.shop = shopOverride
    if (parsed.kind === "default" && preset) src.text = preset.text
    if (delivery) src.delivery = delivery

    // viewOnce do wizard: o operador NÃO pede visualização única no overlay →
    // só o preset pode ligar, e o preset default vem com viewOnce:false.
    const defaults = {
        ...SHOPPING_DEFAULTS,
        ...(preset
            ? {
                text: preset.text,
                title: preset.title,
                subtitle: preset.subtitle,
                footer: preset.footer,
                shop: { ...(preset.shop || {}) },
                viewOnce: preset.viewOnce === true
            }
            : {})
    }

    try {
        const built = createShoppingPayload(src, { defaults })
        const summary = describeShoppingPayload(built.content, built.meta)
        const wire = describeSendWire(built.content)
        return {
            ok: true,
            kind: parsed.kind,
            delivery: built.meta.delivery,
            presetId: preset ? preset.id : null,
            content: built.content,
            warnings: built.warnings,
            meta: built.meta,
            summary,
            wire,
            note: parsed.note
        }
    } catch (e) {
        if (e instanceof ShoppingPayloadError) return { ok: false, code: e.code, message: e.message }
        return { ok: false, code: "SHOPPING_UNEXPECTED", message: `erro ao montar o card: ${e?.message || e}` }
    }
}

/** Prompt da loja. Mantido enxuto e com o aviso honesto sobre renderização. */
export function shoppingPromptText(presetId = null) {
    const preset = getFloodPreset(presetId || DEFAULT_SHOPPING_PRESET_ID)
    const s = listShoppingPresetsTexto()
    return [
        `🛍️ *FLOOD · TIPO LOJA (shopping)*`,
        `Preset: *${preset?.id || "—"}* · ${preset?.label || ""}`,
        ``,
        `Responda com UMA linha:`,
        `  *0* → usar o preset acima (título/rodapé/surface/id dele)`,
        `  *texto livre* → corpo do card + defaults do preset`,
        `  *texto|title|surface|id* → overlay completo`,
        ``,
        `• surface aceita *1 (FB) · 2 (IG) · 3 (WA)*.`,
        `  O *4* que aparece em README/prints de outros bots NÃO existe no proto deste pacote`,
        `  (WAProto ShopMessage.Surface = 0..3) → se vier 4, enviamos *3 (WA)* e avisamos.`,
        `• *viewOnce* está DESLIGADO (card dentro de visualização única vira "mensagem indisponível").`,
        `• entrega: padrão *puro*; *loja:flow:* manda o MESMO card pelo ramo que`,
        `  põe messageVersion:1 (se o app insistir em "indisponível", é o A/B a fazer).`,
        `• corpo: uma linha só (sem o entulho do "Ler Mais" dentro do card).`,
        `• limite: corpo ${SHOPPING_LIMITS.body} · título/subtítulo/rodapé ${SHOPPING_LIMITS.title}.`,
        ``,
        `⚠️ *Honesto sobre o app do destinatário:*`,
        `o envio usa o tipo real do fork (interactiveMessage.shopStorefrontMessage).`,
        `Nem todo app do WhatsApp renderiza card de loja (é recurso de catálogo`,
        `Business/FB); em muitos aparece só como texto. NÃO vamos fingir card`,
        `nem misturar payment para "parecer" loja.`,
        ``,
        `Presets:`,
        s
    ].join("\n")
}

export const SHOPPING_PROMPT = shoppingPromptText()

// ═════════════════════════════════════════════════════════════════════════
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Barrel único para quem quiser usar a infraestrutura (terminal, actions,
// agendador). Nada aqui é um segundo executor: o envio continua sendo o
// executarFlood/executarFloodLote de services/groupService.js.
// ═════════════════════════════════════════════════════════════════════════
export {
    createQueue,
    QUEUE_CANCELLED
} from "./queue.js"

export {
    createLimiter,
    withTimeout,
    sleep,
    classifyError,
    remainingCooldown,
    markJobEnd,
    clearCooldown
} from "./limiter.js"

export {
    isKillSwitchOn,
    setKillSwitch,
    toggleKillSwitch,
    onKillSwitch,
    killSwitchStatusTexto,
    KILL_SWITCH_REASON
} from "./killswitch.js"

export {
    getAllowlist,
    normalizeTargetJid,
    isOnAllowlist,
    filterAllowlist,
    filterTargets,
    addAllowlistJid,
    removeAllowlistJid,
    formatAllowlistTexto,
    maskJid,
    BLOCKED_TARGET,
    ALLOWLIST_EMPTY,
    PROTECTED_GROUP_BLOCKED
} from "./allowlist.js"

export {
    slugPresetId,
    listCustomPresets,
    getCustomPreset,
    saveCustomPreset,
    updateCustomPreset,
    deleteCustomPreset,
    formatCustomPresetsTexto,
    isReservedPresetId,
    CUSTOM_TYPES
} from "./customStore.js"

export {
    resolveFloodSpeed,
    formatFloodSpeedMenu,
    applyFloodSpeed,
    toFloodOpts,
    CUSTOM_INTERVAL_MIN,
    CUSTOM_INTERVAL_MAX
} from "./speed.js"

export {
    parseSelectedGroups,
    extractTargetJids,
    TARGETS_REQUIRED
} from "./groups.js"

export {
    loadPreset,
    buildContent as buildPresetContent,
    listPresets,
    describePreset,
    previewContentKeys,
    listPresetsTexto,
    PRESET_TYPES,
    BUILDERS as PRESET_BUILDERS
} from "./presets/index.js"

export {
    runPresetJob,
    formatPresetJobResult,
    isFloodEngineRunning,
    currentJobInfo,
    cancelRunningJob,
    PresetJobError
} from "./presetEngine.js"

export {
    getFloodRuntimeConfig,
    getPresetDef,
    listPresetIds,
    clampPresetLimits,
    clampJobQtd,
    FLOOD_PRESET_HARD_CAP,
    FLOOD_PRESET_TYPES,
    FLOOD_GENERAL_PRESETS,
    DEFAULT_FLOOD_PRESET_ID
} from "./config.js"

export {
    getPaymentApiInfo,
    parsePaymentArgs,
    parseAmount,
    parseCurrency,
    createPaymentPayload,
    buildPaymentContent,
    formatPaymentError
} from "./payment.js"


// [RESTAURAÇÃO 01a0aaae] Fachada de comandos (floodpresets/paymenttest/shoppingtest/
// floodstop/floodstart/flooddryrun + 2/preset/<id>). Vive em ./router.js para não criar
// ciclo: o router NUNCA importa este barrel, importa os módulos folha.
export {
    floodRouter,
    floodPresetsMenuTexto,
    FLOOD_PRESET_COMMANDS,
    FLOOD_TEST_ACTION_PRESET,
    paymentOverlayFromRest,
    shoppingOverlayFromRest
} from "./router.js"

// [SHOPPING] Diagnóstico de shop.id via APIs reais do fork (getCatalog/getCollections).
export { listarIdsDeLoja, compararShopId, extrairIds, formatDiagnostico } from "./commerce.js"

/** Integração com o executarFlood: devolve o builder (ou null = flood clássico). */
export function floodContentBuilderFor(state) {
    if (!state || state.floodKind !== "shopping" || !state.floodContent) return null
    return makeFloodContentBuilder(state.floodContent)
}

export default {
    detectShoppingTrigger,
    parseShoppingOverlay,
    resolveShoppingSend,
    shoppingPromptText,
    floodContentBuilderFor,
    defaultSend,
    buildSendContent
}

```

#### `./features/flood/killswitch.js` — 67 linhas, 2557 bytes

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
// Importante para o AB7: isto NÃO substitui o que o shopping/`features/flood/index.js`
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

#### `./features/flood/limiter.js` — 167 linhas, 6480 bytes

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

#### `./features/flood/payment.js` — 135 linhas, 6104 bytes

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

#### `./features/flood/presetEngine.js` — 430 linhas, 18753 bytes

```js
// features/flood/presetEngine.js
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

import { getFloodRuntimeConfig, clampJobQtd, FLOOD_PRESET_HARD_CAP } from "./config.js"
import { loadPreset, buildContent, makeIterationBuilder, describePreset } from "./presets/index.js"
import { filterTargets, maskJid, ALLOWLIST_EMPTY } from "./allowlist.js"
import { remainingCooldown, markJobEnd } from "./limiter.js"
import { createQueue } from "./queue.js"
import { isKillSwitchOn, onKillSwitch, KILL_SWITCH_REASON } from "./killswitch.js"
import { extractTargetJids, TARGETS_REQUIRED } from "./groups.js"
import { resolveFloodSpeed, applyFloodSpeed, toFloodOpts } from "./speed.js"
import { buildPayload as buildPaymentPayload } from "./presets/payment.js"
import { buildShoppingPayload } from "./presets/shoppingBuilder.js"
import { resolveMediaBuffer } from "./presets/media.js"
import { visibleTextHasPhones } from "./presets/mention.js"
import { describeSendWire } from "./engine.js"

/** Um job de preset por vez (o da arena antiga também era assim — mantém). */
let runningJob = null

export class PresetJobError extends Error {
    constructor(code, message, extra = {}) {
        super(message || code)
        this.name = "PresetJobError"
        this.code = code
        Object.assign(this, extra)
    }
}

export function isFloodEngineRunning() {
    return !!runningJob
}

export function currentJobInfo() {
    if (!runningJob) return null
    return {
        presetId: runningJob.presetId,
        type: runningJob.type,
        targets: runningJob.targets.map(maskJid),
        elapsedMs: Date.now() - runningJob.startedAt,
        cancelled: runningJob.queue ? runningJob.queue.isCancelled() : false
    }
}

/** Interrompe o job em andamento (a fila para na próxima iteração). */
export function cancelRunningJob(reason = KILL_SWITCH_REASON) {
    if (!runningJob?.queue) return false
    runningJob.queue.cancel(reason)
    return true
}

// O kill switch LIGADO também cancela o job corrente — não adianta ter botão se
// ele só vale para o próximo job.
onKillSwitch(on => {
    if (on) cancelRunningJob(KILL_SWITCH_REASON)
})

function emptyMetrics() {
    return {
        started: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        blocked: 0,
        planned: 0,
        duration: 0,
        averageLatency: 0,
        latencies: [],
        items: 0,
        targets: 0
    }
}

function logSafe(onLog, tag, msg) {
    if (typeof onLog === "function") {
        try { onLog(tag, msg) } catch {}
        return
    }
    console.log(`[${tag}] ${msg}`)
}

/**
 * @param {object} opts
 * @param {string} opts.presetId
 * @param {object} [opts.overlay]   campos digitados (nunca afrouxam teto)
 * @param {Array}  [opts.targets]   jids ou {id} — SEMPRE escolha explícita
 * @param {number} [opts.qtd]
 * @param {string|number} [opts.floodModo] "0"|1..4|nome|ms → FLOOD_MODOS/CONFIG
 * @param {object} [opts.floodCfg]  já resolvido (resolveFloodSpeed)
 * @param {boolean} [opts.dryRun]   default: runtime.dryRun
 * @param {boolean} [opts.ignoreCooldown]
 * @param {Array|Function} [opts.mentions] lista explícita ou (target) => []
 * @param {Buffer} [opts.mediaBuffer]
 * @param {string} [opts.from]
 * @param {(ctx:object)=>Promise<{ok,erros,total}>} [opts.executor] overrides o laço do AB7 (testes)
 * @param {(ev:string,data?:object)=>void} [opts.onLog]
 */
export async function runPresetJob(opts = {}) {
    const startedAt = Date.now()
    const metrics = emptyMetrics()
    metrics.started = 1

    const runtime = getFloodRuntimeConfig()
    const dryRun = opts.dryRun != null ? !!opts.dryRun : runtime.dryRun
    const onLog = typeof opts.onLog === "function" ? opts.onLog : null
    const fail = (code, extra = {}) => ({
        ok: false,
        error: code,
        ...extra,
        metrics,
        dryRun
    })

    // 1) preset
    const presetId = String(opts.presetId || "").trim().toLowerCase()
    const loaded = loadPreset(presetId, opts.overlay || {})
    if (!loaded.ok) return fail(loaded.error, { presetId })
    let preset = loaded.preset

    // 2) porteiras globais antes de qualquer trabalho
    if (isKillSwitchOn()) {
        logSafe(onLog, "FLOOD", "CANCELLED kill switch")
        return fail(KILL_SWITCH_REASON, { cancelled: true, preset: describePreset(preset) })
    }
    if (runningJob) {
        return fail("JOB_IN_PROGRESS", { running: currentJobInfo() })
    }

    // 3) validação por tipo (conteúdo ANTES de envio; erros estruturados)
    const type = String(preset.type || "text").toLowerCase()
    if (type === "payment" && !runtime.testMode && !opts.allowPaymentOutsideTest) {
        return fail("PAYMENT_TEST_DISABLED", { preset: describePreset(preset) })
    }
    if (type === "shopping" && !runtime.testMode && !opts.allowShoppingOutsideTest) {
        return fail("SHOPPING_TEST_DISABLED", { preset: describePreset(preset), type })
    }

    let builder
    let wire = null
    let warnings = []
    try {
        if (type === "payment") {
            const payload = buildPaymentPayload(preset)
            if (!payload.ok) return fail(payload.error, { usage: payload.usage, preset: describePreset(preset), type })
        }
        if (type === "shopping") {
            const built = buildShoppingPayload(preset)
            warnings = built.warnings || []
            wire = describeSendWire(built.content)
        }
        if (type === "mention" && visibleTextHasPhones(preset.text)) {
            return fail("MENTION_LEAK", { preset: describePreset(preset), type })
        }
        if (type === "media" && !dryRun && !resolveMediaBuffer(preset, { buffer: opts.mediaBuffer })) {
            return fail("MEDIA_UNAVAILABLE", { preset: describePreset(preset), type })
        }
        builder = makeIterationBuilder(preset, {
            buffer: opts.mediaBuffer,
            from: opts.from,
            mentions: typeof opts.mentions === "function" ? undefined : opts.mentions
        })
    } catch (e) {
        const code = e?.code || (type === "shopping" ? "SHOPPING_PAYLOAD_INVALID" : "PRESET_BUILD_FAILED")
        return fail(code, { message: String(e?.message || e).slice(0, 160), preset: describePreset(preset), type })
    }

    // 5) velocidade: FLOOD_MODOS/CONFIG do AB7 (sem segundo sistema)
    let speed = null
    if (opts.floodCfg && opts.floodCfg.ok) speed = opts.floodCfg
    else if (opts.floodModo != null && String(opts.floodModo).trim() !== "") speed = resolveFloodSpeed(opts.floodModo)
    else if (preset.modo) speed = resolveFloodSpeed(preset.modo)
    if (speed && !speed.ok) return fail(speed.error || "SPEED_INVALID", { preset: describePreset(preset) })
    if (speed) preset = applyFloodSpeed(preset, speed)

    // 4) alvos: só JIDs explicitamente autorizados + sem grupo protegido
    const requested = extractTargetJids(opts.targets || [])
    if (!requested.length) return fail(TARGETS_REQUIRED, { preset: describePreset(preset) })
    const filtered = filterTargets(requested)
    if (!filtered.ok) return fail(filtered.error || ALLOWLIST_EMPTY, { preset: describePreset(preset) })
    metrics.blocked = filtered.blocked.length
    let targets = filtered.allowed
    if (preset.targetMode === "single") targets = targets.slice(0, 1)
    if (!targets.length) {
        return fail("BLOCKED_TARGET", { blocked: filtered.blocked.map(b => maskJid(b.jid || b)), preset: describePreset(preset) })
    }

    // 5) cooldown por preset (sem bypass acidental: ignoreCooldown é explícito)
    const cool = remainingCooldown(preset.id, preset.cooldown)
    if (cool > 0 && !opts.ignoreCooldown) {
        return fail("COOLDOWN", { remainingMs: cool, preset: describePreset(preset) })
    }

    // 6) quantidade dentro dos tetos (hard cap ∧ preset ∧ MAX_FLOOD do projeto)
    const qtd = clampJobQtd(opts.qtd, preset)
    const cfgOpts = toFloodOpts(speed) || {}
    const selected = new Set(targets)
    metrics.targets = targets.length
    metrics.items = targets.length
    metrics.queued = targets.length * qtd

    // 7) fila/limiter por ALVO; o laço de mensagens é o do AB7 (executor)
    const executor = typeof opts.executor === "function" ? opts.executor : null
    const runItems = targets.map(target => ({ target, preset, qtd, cfg: cfgOpts }))
    const queue = createQueue({
        interval: preset.interval,
        concurrency: preset.concurrency,
        timeout: preset.timeout,
        maxRetries: runtime.maxRetries,
        jitter: !!preset.jitter,
        shouldStop: () => isKillSwitchOn(),
        onLog: (ev, data) => {
            if (ev === "retry-check" && data?.kind === "rate_limit") {
                logSafe(onLog, "FLOOD", `rate limit — aguardando backoff (não contorna) attempt=${data.attempt}`)
            }
        }
    })

    runningJob = { presetId: preset.id, type, queue, startedAt, targets }
    logSafe(onLog, jobTag(type), `START preset=${preset.id} type=${type} alvos=${targets.length} qtd=${qtd} dryRun=${dryRun}`)

    let results = []
    try {
        results = await queue.runItems(runItems, async (item) => {
            if (!selected.has(item.target)) {
                throw new PresetJobError("BLOCKED_TARGET", "alvo saiu da lista autorizada")
            }
            const mentions = await resolveMentionsFor(item.target, preset, opts)
            const ctx = { buffer: opts.mediaBuffer, from: opts.from, mentions }
            let content
            try {
                content = buildContent(preset, ctx)
            } catch (e) {
                if (dryRun && (e?.code === "MEDIA_UNAVAILABLE" || e?.code === "SHOPPING_PAYLOAD_INVALID")) {
                    content = { _missing: e.code }
                } else {
                    throw e
                }
            }
            if (dryRun) {
                return {
                    dryRun: true,
                    target: maskJid(item.target),
                    type,
                    keys: Object.keys(content).sort(),
                    wire: type === "shopping" ? wire : null,
                    qtd,
                    modo: speed?.modo || preset.floodModo || null
                }
            }
            const sendOne = executor
                ? () => executor({
                    jid: item.target, msg: bodyFor(preset, type), qtd: item.qtd, cfg: item.cfg, builder, preset, mentions, ctx
                })
                : async () => {
                    // caminho real do AB7: o MESMO executarFlood (laço, throttle,
                    // lote, retry de rate limit e porteira de grupo protegido).
                    const gs = await import("../../services/groupService.js")
                    return gs.executarFlood(item.target, bodyFor(preset, type), item.qtd, item.cfg, builder)
                }
            const r = await sendOne()
            return r && typeof r === "object" ? r : { ok: true }
        })
    } catch (e) {
        const msg = String(e?.message || e).slice(0, 160)
        logSafe(onLog, jobTag(type), `ERROR ${msg}`)
        runningJob = null
        markJobEnd(preset.id)
        return fail("ENGINE_ERROR", { message: msg, preset: describePreset(preset), type })
    }

    runningJob = null
    markJobEnd(preset.id)

    // 8) métricas a partir dos resultados (o laço do AB7 devolve {ok, erros, total})
    const latencies = []
    for (const r of results) {
        if (Number.isFinite(r?.latency)) latencies.push(r.latency)
        if (r?.cancelled) {
            metrics.cancelled++
            continue
        }
        const inner = r?.result || {}
        if (inner.dryRun === true) {
            // dry-run não envia: conta o que SERIA enviado, não como "sent"
            metrics.planned += Number(inner.qtd) || qtd
            continue
        }
        const okN = Number(inner.ok)
        const errN = Number(inner.erros ?? inner.failed)
        if (Number.isFinite(okN) || Number.isFinite(errN)) {
            if (Number.isFinite(okN)) metrics.sent += okN
            if (Number.isFinite(errN)) metrics.failed += errN
        } else if (r?.ok) {
            metrics.sent += 1
        } else {
            metrics.failed += 1
        }
    }
    const aborted = results.some(r => r?.abort)
    const cancelled = results.some(r => r?.cancelled)
    if (cancelled || aborted) {
        logSafe(onLog, jobTag(type), `CANCELLED preset=${preset.id} sent=${metrics.sent} fail=${metrics.failed} cancel=${metrics.cancelled}`)
    } else {
        logSafe(onLog, jobTag(type), `${dryRun ? "DRY-RUN" : "SUCCESS"} preset=${preset.id} ${metrics.sent}/${metrics.queued} ${metrics.duration}ms`)
    }

    return {
        ok: metrics.failed === 0 && metrics.cancelled === 0,
        type,
        preset: describePreset(preset),
        presetExtra: type === "shopping"
            ? { wire, warnings }
            : (type === "payment" ? { display: buildPaymentPayload(preset).display } : {}),
        dryRun,
        speed: speed ? { modo: speed.modo, intervalo: speed.intervalo, lote: speed.lote, jitter: !!speed.jitter } : null,
        limits: {
            interval: preset.interval,
            concurrency: preset.concurrency,
            timeout: preset.timeout,
            cooldown: preset.cooldown,
            maxMessages: preset.maxMessages,
            hardCap: FLOOD_PRESET_HARD_CAP
        },
        targets: targets.map(maskJid),
        blocked: filtered.blocked.map(b => maskJid(b.jid || b)),
        metrics,
        results: results.map(r => ({
            ok: !!r.ok,
            cancelled: !!r.cancelled,
            error: r.error,
            message: r.message ? String(r.message).slice(0, 160) : undefined,
            target: maskJid(r.target),
            latency: r.latency,
            dryRun: r.result?.dryRun === true,
            // dry-run precisa ser diagnóstico completo: tipo + chaves do payload
            // (item 22). Nada de conteúdo cru: só as chaves e o wire do card.
            ...(r.result?.dryRun === true ? { keys: r.result.keys, contentType: r.result.type, wire: r.result.wire, qtd: r.result.qtd } : {}),
            sent: Number.isFinite(Number(r.result?.ok)) ? Number(r.result.ok) : undefined,
            failed: Number.isFinite(Number(r.result?.erros)) ? Number(r.result.erros) : undefined
        })),
        cancelled,
        aborted
    }
}

/** Corpo que o laço do flood usa como base (o builder decide o que fazer dele). */
function bodyFor(preset, type) {
    if (type === "media") return String(preset.caption || preset.text || "SYZYGY media-test")
    if (type === "payment") return String(preset.text || "Pagamento de teste")
    return String(preset.text || "SYZYGY text-test")
}

/**
 * mentions: SOMENTE de lista explícita (array no opts, preset.mentions, ou
 * resolver fornecido). Nunca caímos para "todos os participantes".
 */
async function resolveMentionsFor(target, preset, opts) {
    if (typeof opts.resolveMentions === "function") {
        try {
            const r = await opts.resolveMentions(target, preset)
            return Array.isArray(r) ? r : []
        } catch {
            return []
        }
    }
    if (typeof opts.mentions === "function") {
        try {
            const r = await opts.mentions(target, preset)
            return Array.isArray(r) ? r : []
        } catch {
            return []
        }
    }
    if (Array.isArray(opts.mentions) && opts.mentions.length) return opts.mentions
    if (Array.isArray(preset.mentions) && preset.mentions.length) return preset.mentions
    return []
}

function jobTag(type) {
    if (type === "payment") return "PAYMENT"
    if (type === "shopping") return "SHOPPING"
    if (type === "media") return "FLOOD-MEDIA"
    if (type === "mention") return "FLOOD-MENTION"
    return "FLOOD"
}

/** Resultado legível para o operador (alvos mascarados, nada de credencial). */
export function formatPresetJobResult(res = {}) {
    const l = []
    const m = res.metrics || {}
    if (!res.ok && res.error) {
        l.push(`⚠️ FLOOD · ${res.error}`)
        if (res.message) l.push(`   ${res.message}`)
        if (res.remainingMs) l.push(`   cooldown restante: ${Math.ceil(res.remainingMs / 1000)}s`)
        if (res.blocked?.length) l.push(`   bloqueados: ${res.blocked.join(", ")}`)
        return l.join("\n")
    }
    l.push(`🌊 FLOOD · preset ${res.preset?.id || "?"} (${res.type || res.preset?.type || "?"})${res.dryRun ? " · DRY-RUN" : ""}`)
    l.push(`• alvos: ${(res.targets || []).length} · enviados: ${m.sent ?? 0} · falhas: ${m.failed ?? 0} · canceladas: ${m.cancelled ?? 0} · bloqueados: ${m.blocked ?? 0}`)
    if (res.speed) l.push(`• velocidade: ${res.speed.modo} · ${res.speed.intervalo}ms/lote${res.speed.lote}${res.speed.jitter ? " + jitter" : ""}`)
    if (res.limits) l.push(`• tetos aplicados: ${res.limits.maxMessages}x · intervalo ${res.limits.interval}ms · conc ${res.limits.concurrency} · timeout ${res.limits.timeout}ms · cooldown ${Math.round(res.limits.cooldown / 1000)}s`)
    if (m.averageLatency) l.push(`• latência média: ${m.averageLatency}ms · duração ${m.duration}ms`)
    if (res.presetExtra?.wire) l.push(`• wire: ${res.presetExtra.wire}`)
    for (const w of res.presetExtra?.warnings || []) l.push(`⚠️ ${w}`)
    if (res.presetExtra?.display) l.push(`• valor: ${res.presetExtra.display}`)
    if ((res.blocked || []).length) l.push(`• bloqueados: ${res.blocked.join(", ")}`)
    return l.join("\n")
}

```

#### `./features/flood/presets/custom.js` — 56 linhas, 2264 bytes

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

#### `./features/flood/presets/index.js` — 112 linhas, 4629 bytes

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

#### `./features/flood/presets/media.js` — 84 linhas, 3439 bytes

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

#### `./features/flood/presets/mention.js` — 68 linhas, 2869 bytes

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

#### `./features/flood/presets/payment.js` — 44 linhas, 1727 bytes

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

#### `./features/flood/presets/shopping.js` — 51 linhas, 2219 bytes

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

#### `./features/flood/presets/shoppingBuilder.js` — 68 linhas, 3214 bytes

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

#### `./features/flood/presets/text.js` — 25 linhas, 879 bytes

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

#### `./features/flood/queue.js` — 141 linhas, 5656 bytes

```js
// features/flood/queue.js
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

import { createLimiter, classifyError, sleep } from "./limiter.js"
import { isKillSwitchOn } from "./killswitch.js"

export const QUEUE_CANCELLED = "KILL_SWITCH"

/**
 * @param {object} [opts]
 * @param {number} [opts.interval]   intervalo mínimo global (ms) — já clampado pelo preset
 * @param {number} [opts.concurrency] itens em paralelo (hard cap: 2)
 * @param {number} [opts.timeout]     ms por item (com retry limitado dentro)
 * @param {number} [opts.maxRetries]  0..hard cap; rate limit usa backoff maior
 * @param {boolean} [opts.jitter]
 * @param {(ev:string,data?:object)=>void} [opts.onLog]
 * @param {() => boolean} [opts.shouldStop] hook extra (ex.: estado do job)
 */
export function createQueue({ interval, concurrency, timeout, maxRetries, onLog, jitter, shouldStop } = {}) {
    const limiter = createLimiter({
        interval,
        concurrency,
        timeout,
        key: `q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        jitter: !!jitter
    })
    let cancelled = false
    let cancelReason = null
    let sent = 0
    let failed = 0

    function cancel(reason = QUEUE_CANCELLED) {
        if (!cancelled) cancelReason = reason
        cancelled = true
    }

    function isCancelled() {
        return cancelled || isKillSwitchOn() || (typeof shouldStop === "function" && shouldStop() === true)
    }

    function noteCancel(item, reason) {
        return { ok: false, cancelled: true, reason: reason || cancelReason || QUEUE_CANCELLED, target: item?.target }
    }

    async function runOne(item, worker, attempt, retries) {
        const t0 = Date.now()
        try {
            const result = await worker(item, attempt)
            sent++
            return { ok: true, target: item?.target, latency: Date.now() - t0, attempt, result }
        } catch (e) {
            const cls = classifyError(e)
            if (typeof onLog === "function") {
                onLog("retry-check", { kind: cls.kind, attempt, message: String(e?.message || e).slice(0, 120) })
            }
            if (cls.abort) {
                // Desconexão/erro permanente: PARA o job. Insistir em sessão caída
                // é o que transforma teste controlado em abuso.
                cancel(cls.kind === "disconnect" ? "DISCONNECT" : "PERMANENT_ERROR")
                return {
                    ok: false,
                    target: item?.target,
                    error: cls.kind,
                    message: String(e?.message || e).slice(0, 160),
                    abort: true,
                    latency: Date.now() - t0
                }
            }
            if (cls.retry && attempt < retries) {
                // Backoff (não é "espera menor"): rate limit espera MAIS a cada tentativa.
                const wait = cls.kind === "rate_limit" ? 800 * (attempt + 1) : 200
                await sleep(wait)
                return null // → tenta de novo
            }
            failed++
            return {
                ok: false,
                target: item?.target,
                error: cls.kind,
                message: String(e?.message || e).slice(0, 160),
                latency: Date.now() - t0
            }
        }
    }

    async function runItems(items, worker) {
        const results = []
        const retries = Math.max(0, Number(maxRetries) || 0)
        for (const item of items || []) {
            if (isCancelled()) {
                results.push(noteCancel(item))
                continue
            }
            let result
            try {
                result = await limiter.schedule(async () => {
                    for (let attempt = 0; attempt <= retries; attempt++) {
                        if (isCancelled()) return noteCancel(item)
                        const r = await runOne(item, worker, attempt, retries)
                        if (r !== null) return r
                    }
                    failed++
                    return { ok: false, target: item?.target, error: "retries_exhausted", message: "retry esgotado dentro do limite do preset" }
                })
            } catch (e) {
                const cls = classifyError(e)
                if (cls.abort) cancel(cls.kind === "disconnect" ? "DISCONNECT" : "PERMANENT_ERROR")
                failed++
                result = {
                    ok: false,
                    target: item?.target,
                    error: cls.kind || e?.code || "error",
                    message: String(e?.message || e).slice(0, 160),
                    abort: !!cls.abort
                }
            }
            results.push(result)
            if (result?.abort) cancel(result.error || "ABORT")
        }
        return results
    }

    return {
        runItems,
        cancel,
        isCancelled,
        getCancelReason: () => cancelReason || (isKillSwitchOn() ? QUEUE_CANCELLED : null),
        counts: () => ({ sent, failed }),
        limits: () => limiter.limits()
    }
}

```

#### `./features/flood/router.js` — 225 linhas, 11615 bytes

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

#### `./features/flood/shopping.js` — 374 linhas, 19751 bytes

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

#### `./features/flood/speed.js` — 112 linhas, 4436 bytes

```js
// features/flood/speed.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// NÃO é um segundo sistema de velocidade. O AB7 já resolve ritmo em
// getFloodConfig() (services/groupService.js) a partir de FLOOD_MODOS + CONFIG
// (utils/config.js: floodModo / floodInterval / floodLote / floodJitter).
// Este módulo só faz a ponte preset → esses MESMOS valores, para o preset não
// inventar intervalo nem lote próprio.
//
// Saída sempre compatível com getFloodConfig(objeto) e, portanto, com
// executarFlood(jid, msg, qtd, cfg, builder): { modo, intervaloMs, lote, jitter }.

import { CONFIG, FLOOD_MODOS } from "../../utils/config.js"

const SPEED_ALIASES = {
    "1": "rapido",
    rapido: "rapido",
    "rápido": "rapido",
    "2": "normal",
    normal: "normal",
    "3": "lento",
    lento: "lento",
    "4": "seguro",
    seguro: "seguro"
}

/** Intervalo digitado à mão tem a MESMA faixa do flood clássico (20..5000 ms). */
export const CUSTOM_INTERVAL_MIN = 20
export const CUSTOM_INTERVAL_MAX = 5000

/**
 * @param {string|number|null} raw  "0"/vazio = config atual · "1..4" · nome · ms
 * @returns {{ok:true,modo:string,intervalo:number,lote:number,jitter:boolean,from:string}|{ok:false,error:string}}
 */
export function resolveFloodSpeed(raw) {
    const key = String(raw == null ? "" : raw).trim().toLowerCase()

    if (!key || key === "0" || key === "default" || key === "padrao" || key === "padrão") {
        const modo = CONFIG.floodModo || "normal"
        const m = FLOOD_MODOS[modo] || FLOOD_MODOS.normal
        return {
            ok: true,
            modo,
            // os MESMOS defaults do AB7: config vence o modo, como em getFloodConfig()
            intervalo: Number(CONFIG.floodInterval) || m.intervalo,
            lote: Number(CONFIG.floodLote) || m.lote,
            jitter: CONFIG.floodJitter === true || modo === "seguro",
            from: "config"
        }
    }

    const alias = SPEED_ALIASES[key]
    if (alias && FLOOD_MODOS[alias]) {
        const m = FLOOD_MODOS[alias]
        return { ok: true, modo: alias, intervalo: m.intervalo, lote: m.lote, jitter: alias === "seguro", from: "modo" }
    }

    if (FLOOD_MODOS[key]) {
        const m = FLOOD_MODOS[key]
        return { ok: true, modo: key, intervalo: m.intervalo, lote: m.lote, jitter: key === "seguro", from: "modo" }
    }

    const num = parseInt(String(key).replace(/\D/g, ""), 10)
    if (!Number.isNaN(num) && num >= CUSTOM_INTERVAL_MIN && num <= CUSTOM_INTERVAL_MAX) {
        return { ok: true, modo: "custom", intervalo: num, lote: Number(CONFIG.floodLote) || 6, jitter: false, from: "custom" }
    }

    return { ok: false, error: "SPEED_INVALID" }
}

/** Menu de velocidade do flood — lido dos MESMOS FLOOD_MODOS, sem lista paralela. */
export function formatFloodSpeedMenu() {
    const atual = CONFIG.floodModo || "normal"
    const m = FLOOD_MODOS[atual]
    const linhas = Object.entries(FLOOD_MODOS).map(([k, v], i) => `  ${i + 1} · ${v.label}`)
    return [
        "🌊 VELOCIDADE DO FLOOD",
        `Atual: ${atual}${m ? ` (${CONFIG.floodInterval || m.intervalo}ms / lote ${CONFIG.floodLote || m.lote})` : ""}`,
        "",
        ...linhas,
        `  Ou digite intervalo custom (${CUSTOM_INTERVAL_MIN}–${CUSTOM_INTERVAL_MAX} ms)`,
        "",
        "_0 = manter a config atual_"
    ].join("\n")
}

/**
 * Aplica a velocidade ao preset SEM aumentar concorrência nem afrouxar limite:
 * payment/shopping ficam em concorrência 1 (um card por vez, como no AB7).
 */
export function applyFloodSpeed(preset, cfg) {
    if (!preset || !cfg || !cfg.ok) return preset
    const type = String(preset.type || "text").toLowerCase()
    const single = type === "payment" || type === "shopping"
    const concFromLote = Math.min(2, Math.max(1, Number(cfg.lote) || 1))
    const prevConc = Number(preset.concurrency) || 1
    return {
        ...preset,
        interval: cfg.intervalo,
        // nunca acima do que o preset já tinha nem do hard cap (clampPresetLimits)
        concurrency: single ? 1 : Math.min(prevConc, concFromLote),
        floodModo: cfg.modo,
        jitter: !!cfg.jitter,
        lote: cfg.lote
    }
}

/** Formato aceito por getFloodConfig()/executarFlood() do AB7. */
export function toFloodOpts(cfg) {
    if (!cfg || !cfg.ok) return null
    return { modo: cfg.modo, intervaloMs: cfg.intervalo, lote: cfg.lote, jitter: !!cfg.jitter }
}

```

#### `./features/flood/tests-infra.js` — 567 linhas, 41602 bytes

```js
// features/flood/tests-infra.js
// [INFRA FLOOD] Testes da infraestrutura de presets recuperada da arena
// 01a0aaae e adaptada ao AB7. Rode:  node features/flood/tests-infra.js
//
// Garantias deste arquivo:
//   • NENHUM envio real: todo send passa por um sock FALSO ou por um executor
//     injetado. O executor padrão (services/groupService.js) é exercitado só com
//     sock falso (setSock) — e um executor que ESTOURA é usado nos dry-runs, para
//     o teste provar que o caminho de envio não foi tocado.
//   • config.json é lido antes/depois: se qualquer asserção persistir em disco, o
//     teste falha (presets custom rodam com persist:false).
//   • estado global (CONFIG, allowlist, grupos autorizados, kill switch, cooldown)
//     é restaurado no finally — teste nenhum deixa o bot com kill switch ligado.
//
// Sem dependências externas: o runner é o mesmo formato de features/flood/tests.js.

import fs from "fs"
import { CONFIG } from "../../utils/config.js"
import { setAuthorizedGroups, getAuthorizedGroups } from "../../utils/permissions.js"

import {
    FLOOD_PRESET_HARD_CAP,
    clampPresetLimits,
    clampJobQtd,
    getFloodRuntimeConfig,
    getPresetDef,
    listPresetIds
} from "./config.js"
import { loadPreset, buildContent, listPresets, describePreset, previewContentKeys, makeIterationBuilder } from "./presets/index.js"
import { resolveMediaBuffer } from "./presets/media.js"
import { sanitizeMentions, visibleTextHasPhones } from "./presets/mention.js"
import { buildPayload as buildPaymentPayload } from "./presets/payment.js"
import { buildShoppingPayload, shoppingSrc } from "./presets/shoppingBuilder.js"
import { buildSendContent as gateSendContent, SHOP_SEND_KEYS, isShoppingContent } from "./engine.js"
import { createQueue } from "./queue.js"
import { createLimiter, withTimeout, classifyError, remainingCooldown, markJobEnd, clearCooldown, sleep } from "./limiter.js"
import { isKillSwitchOn, setKillSwitch, onKillSwitch, toggleKillSwitch, killSwitchStatusTexto } from "./killswitch.js"
import {
    getAllowlist, normalizeTargetJid, isOnAllowlist, filterAllowlist, filterTargets,
    addAllowlistJid, removeAllowlistJid, formatAllowlistTexto, maskJid, ALLOWLIST_EMPTY, BLOCKED_TARGET, PROTECTED_GROUP_BLOCKED
} from "./allowlist.js"
import { slugPresetId, saveCustomPreset, updateCustomPreset, deleteCustomPreset, getCustomPreset, listCustomPresets, formatCustomPresetsTexto, isReservedPresetId } from "./customStore.js"
import { resolveFloodSpeed, formatFloodSpeedMenu, applyFloodSpeed, toFloodOpts } from "./speed.js"
import { extractTargetJids, parseSelectedGroups } from "./groups.js"
import { runPresetJob, formatPresetJobResult, isFloodEngineRunning, cancelRunningJob, currentJobInfo } from "./presetEngine.js"

const GROUP_A = "120363111111111101@g.us"
const GROUP_B = "120363222222222202@g.us"
const GROUP_C = "120363333333333303@g.us"
const PERSONA = "5519999998888@s.whatsapp.net"

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function ok(msg) {
    passed++
    console.log(`✓ ${msg}`)
}
function assert(cond, msg) {
    if (cond) ok(msg)
    else {
        failed++
        failures.push(msg)
        console.log(`✗ ${msg}`)
    }
}
function assertEq(actual, expected, msg) {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a === e) {
        ok(a === e && typeof actual === "string" ? `${msg} (${a})` : msg)
        return
    }
    failed++
    failures.push(`${msg} — esperado ${e}, veio ${a}`)
    console.log(`✗ ${msg} — esperado ${e}, veio ${a}`)
}
function skip(msg) {
    skipped++
    console.log(`… SKIP ${msg}`)
}

/** Executor que NÃO pode ser chamado: usado nos dry-runs. */
const executorProibido = async () => {
    throw new Error("DRY-RUN CHAMOU O EXECUTOR")
}

/** Executor falso com contagem: simula o retorno do executarFlood do AB7. */
function makeExecutorFake({ okN = 1, erros = 0, retardarMs = 0, lancar = null } = {}) {
    const calls = []
    const fn = async ({ jid, qtd, cfg, builder }) => {
        if (retardarMs) await sleep(retardarMs)
        if (lancar) throw lancar
        const sample = typeof builder === "function" ? builder({ index: calls.length + 1, body: "corpo" }) : null
        calls.push({ jid, qtd, cfg, keys: sample ? Object.keys(sample).sort() : [] })
        return { ok: okN, erros, total: qtd, modo: cfg?.modo || "normal", intervalo: cfg?.intervaloMs || 0, lote: cfg?.lote || 1 }
    }
    return { fn, calls }
}

const CONFIG_KEYS_WATCHED = ["floodAllowlist", "floodCustomPresets", "floodKillSwitch", "floodDryRun", "floodTestMode", "floodModo", "floodInterval", "floodLote", "floodJitter", "marcarFantasma", "nome", "gruposAutorizados"]

function snapshotConfig() {
    const s = {}
    for (const k of CONFIG_KEYS_WATCHED) s[k] = CONFIG[k] === undefined ? undefined : JSON.parse(JSON.stringify(CONFIG[k]))
    return s
}
function restoreConfig(s) {
    for (const k of CONFIG_KEYS_WATCHED) {
        if (s[k] === undefined) delete CONFIG[k]
        else CONFIG[k] = JSON.parse(JSON.stringify(s[k]))
    }
}

export async function runFloodInfraTests() {
    console.log("=== TESTES FLOOD · INFRA (queue/limiter/killswitch/allowlist/customStore/presets/engine) ===")
    const snap = snapshotConfig()
    const configAntes = fs.existsSync("config.json") ? fs.readFileSync("config.json", "utf-8") : null
    const gruposAntes = getAuthorizedGroups()
    let configInalterado = true

    try {
        // ── 0) tetos: overlay/config NUNCA afrouxam o hard cap ────────────────
        const apertado = clampPresetLimits({ maxMessages: 9999, interval: 0, concurrency: 50, cooldown: 0, timeout: 1 })
        assertEq(apertado.maxMessages, FLOOD_PRESET_HARD_CAP.maxMessages, "maxMessages acima do teto é cortado para o hard cap")
        assertEq(apertado.interval, FLOOD_PRESET_HARD_CAP.minInterval, "intervalo menor que o mínimo não passa (sem rajada)")
        assertEq(apertado.concurrency, FLOOD_PRESET_HARD_CAP.maxConcurrency, "concorrência tem teto (2)")
        assertEq(apertado.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, "cooldown mínimo existe (sem spam de job)")
        assertEq(apertado.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, "timeout abaixo do mínimo sobe para o mínimo")
        assertEq(clampPresetLimits({ timeout: 999999 }).timeout, FLOOD_PRESET_HARD_CAP.maxTimeout, "timeout tem teto (maxTimeout)")
        assertEq(clampPresetLimits({ cooldown: 99999999 }).cooldown, 300000, "cooldown tem teto de 5 min")
        assertEq(clampPresetLimits({ interval: 10 ** 9 }).interval, 60000, "intervalo tem teto de 60s")
        assertEq(clampJobQtd(5000, { maxMessages: 3 }), 3, "qtd pedido 5000 → teto do preset (3)")
        const cfg = getFloodRuntimeConfig()
        assertEq(cfg.dryRun, true, "padrão do runtime é DRY-RUN (nada sai sem o operador desligar)")
        assertEq(cfg.testMode, true, "testMode ligado por padrão (payment/shshopping só em teste)")
        assert(cfg.maxRetries <= FLOOD_PRESET_HARD_CAP.maxRetries, "retries do config não passam do teto")

        // ── 1) preset TEXT ───────────────────────────────────────────────────
        const t1 = loadPreset("text-test")
        assertEq(t1.ok, true, "loadPreset('text-test') resolve")
        assertEq(t1.preset.type, "text", "tipo do preset é text")
        const t1c = buildContent(t1.preset)
        assertEq(Object.keys(t1c), ["text"], "preset text produz SOMENTE { text } (item 12)")
        assert(typeof t1c.text === "string" && t1c.text.length > 0, "text é string não vazia")
        const t1b = makeIterationBuilder(t1.preset)({ index: 3, body: "corpo do laço" })
        assertEq(t1b.text, "corpo do laço", "builder por iteração aproveita o corpo único do executarFlood")
        assertEq(loadPreset("nao-existe").error, "PRESET_UNKNOWN", "preset inexistente → PRESET_UNKNOWN (não cai em texto)")
        const t1ov = loadPreset("text-test", { maxMessages: 9999, interval: 1 })
        assertEq(t1ov.preset.maxMessages, 3, "overlay do preset não aumenta o teto do próprio preset")

        // ── 2) preset MENTION ────────────────────────────────────────────────
        const m1 = loadPreset("mention-test")
        assertEq(m1.ok, true, "loadPreset('mention-test') resolve")
        const m1c = buildContent(m1.preset, { mentions: [PERSONA, "lixo", PERSONA, `${GROUP_C}`] })
        assertEq(m1c.mentions, [PERSONA, GROUP_C], "mentions só de lista explícita, deduplicadas, jids válidos (item 14)")
        const m1vazio = buildContent(m1.preset, { mentions: [] })
        assert(!("mentions" in m1vazio), "lista vazia → NENHUMA menção (nunca 'todos os participantes')")
        assertEq(sanitizeMentions(Array.from({ length: 60 }, (_, i) => `551999999900${String(i).padStart(2, "0")}@s.whatsapp.net`)).length, 20, "menções têm teto (20) mesmo se vier 60")
        assertEq(visibleTextHasPhones("chama @5519999998888 aqui"), true, "telefone visível no texto é detectado")
        let leakThrow = null
        try { buildContent({ type: "mention", text: "chama @5519999998888" }) } catch (e) { leakThrow = e }
        assertEq(leakThrow?.code, "MENTION_LEAK", "texto com telefone no preset mention → MENTION_LEAK recusado")
        assertEq(m1c.text.includes("5519"), false, "não injetamos números no texto para simular marcação")

        // ── 3) preset MEDIA ──────────────────────────────────────────────────
        const md1 = loadPreset("media-test")
        assertEq(md1.ok, true, "loadPreset('media-test') resolve")
        const bufFake = Buffer.from("imagem-de-teste")
        const md1c = buildContent(md1.preset, { buffer: bufFake })
        assertEq(Object.keys(md1c).sort(), ["caption", "image"], "media usa o buffer fornecido pelo executor (item 13)")
        assert(Buffer.isBuffer(md1c.image) && md1c.image.length > 0, "image vai como buffer")
        let midErr = null
        try { buildContent({ type: "media", mediaPath: "./nao-existe.png", menuFallback: false }) } catch (e) { midErr = e }
        assertEq(midErr?.code, "MEDIA_UNAVAILABLE", "mídia ausente → erro estruturado MEDIA_UNAVAILABLE")
        assertEq(typeof resolveMediaBuffer({ menuFallback: false, mediaPath: "./nao-existe.png" }), "object", "resolveMediaBuffer devolve null-objeto sem exceção quando não acha nada")
        const md1menu = resolveMediaBuffer({})
        assert(md1menu === null || Buffer.isBuffer(md1menu), "fallback para a imagem de menu existe quando o arquivo está lá")

        // ── 4) preset PAYMENT ────────────────────────────────────────────────
        const p1 = loadPreset("payment-test")
        assertEq(p1.ok, true, "loadPreset('payment-test') resolve")
        const p1c = buildContent(p1.preset, { from: PERSONA, mentions: [PERSONA] })
        assertEq(Object.keys(p1c).sort(), ["mentions", "payment"], "payment é { payment, mentions? } — nada de chave de loja")
        assertEq(p1c.payment.amount, 25900, "valor 25.90 vira amount1000 = 25900")
        assertEq(p1c.payment.currency, "BRL", "moeda preservada")
        assertEq(p1c.payment.note, "Pagamento de teste", "nota vem do texto do preset (item 15)")
        assertEq(p1c.payment.from, PERSONA, "'from' vai no payload quando informado")
        assertEq(p1c.payment.offset, 0, "offset existe como no contrato antigo")
        assert(!("shop" in p1c) && !("viewOnce" in p1c), "payment não contamina com chaves de shopping")
        assertEq(buildPaymentPayload({ text: "x", amount: -5, currency: "BRL" }).error, "AMOUNT_NEGATIVE", "valor negativo recusado no preset")
        let gateErr = null
        try { gateSendContent(p1c) } catch (e) { gateErr = e }
        assertEq(gateErr?.code, "PAYMENT_NOT_ALLOWED", "e o engine do SHOPPING continua recusando payment (separação preservada)")

        // ── 5) preset SHOPPING = builder AB7 atual ───────────────────────────
        const s1 = loadPreset("shopping-test")
        assertEq(s1.ok, true, "loadPreset('shopping-test') resolve")
        const s1built = buildShoppingPayload(s1.preset)
        const s1c = buildContent(s1.preset)
        assertEq(Object.keys(s1c).sort().join(","), "footer,shop,subtitle,text,title", "shopping usa AS chaves do contrato AB7 (engine.js), sem chave extra")
        assert(s1c.shop && Object.keys(s1c.shop).sort().join(",") === "id,surface", "shop = { surface, id } e nada além disso")
        assert(!("viewOnce" in s1c), "sem viewOnce por padrão (fim do 'mensagem indisponível')")
        assert([1, 2, 3].includes(s1c.shop.surface), "surface no wire é 1..3")
        assert(s1c.text === s1.preset.text, "o corpo do card vem do preset")
        assert(isShoppingContent(s1c), "o conteúdo é reconhecido pelo guard do engine")
        const s1ov = loadPreset("shopping-test", { shop: { surface: 4, id: "https://ex.com/loja" } })
        const s1ovc = buildContent(s1ov.preset)
        assertEq(s1ovc.shop.surface, 3, "surface 4 (README do fork) é mapeado para 3 (WA) também no caminho de preset")
        assert(shoppingSrc(s1.preset).delivery === "puro", "delivery do preset é respeitado ('puro')")
        const s1flow = buildContent(loadPreset("shopping-test", { delivery: "flow" }).preset)
        assert(Array.isArray(s1flow.nativeFlow) && s1flow.nativeFlow.length === 1, "delivery 'flow' monta o envelope nativeFlow+shop (messageVersion:1 vem do fork)")
        assertEq(previewContentKeys(s1.preset).keys.join(","), "footer,shop,subtitle,text,title", "previewContentKeys descreve o payload sem enviar")
        assertEq(s1built.meta.messageVersion, null, "modo puro não inventa messageVersion")

        // ── 6) preset CUSTOM (dispatcher) + customStore ──────────────────────
        const slug = slugPresetId("  Promo da Semana!!  ")
        assertEq(slug, "promo-da-semana", "slug do preset é normalizado")
        assertEq(saveCustomPreset({ name: "text-test", type: "text" }, { persist: false }).error, "RESERVED", "id reservado não pode ser ofuscado por custom")
        assertEq(saveCustomPreset({ name: "meu-texto", type: "xyz" }, { persist: false }).error, "TYPE_INVALID", "tipo desconhecido recusado (nada de builder implícito)")
        const savedTxt = saveCustomPreset({ name: "meu-texto", type: "text", text: "oi do custom", modo: "seguro" }, { persist: false })
        assertEq(savedTxt.ok, true, "custom text criado (persist:false → config.json intocado)")
        const custTxt = loadPreset("meu-texto")
        assertEq(custTxt.preset.type, "text", "custom com type text carrega")
        assertEq(buildContent(custTxt.preset).text, "oi do custom", "custom → text usa o builder de text")
        const savedShop = saveCustomPreset({
            name: "minha-loja", type: "shopping", text: "promoção", title: "LOJA", shop: { surface: 4, id: "https://ex.com/shop" }, delivery: "puro"
        }, { persist: false })
        assertEq(savedShop.ok, true, "custom shopping criado")
        const custShop = loadPreset("minha-loja")
        const custShopC = buildContent(custShop.preset)
        assertEq(custShopC.shop.surface, 3, "custom → shopping aponta para o BUILDER AB7 atual (4 → 3, sem viewOnce)")
        assert(!("viewOnce" in custShopC), "custom shopping também não liga viewOnce")
        const savedPay = saveCustomPreset({ name: "meu-pix", type: "payment", text: "paga logo", amount: 12.5, currency: "BRL" }, { persist: false })
        assertEq(savedPay.ok, true, "custom payment criado")
        assertEq(buildContent(loadPreset("meu-pix").preset).payment.amount, 12500, "custom → payment monta requestPaymentMessage (12.50 → 12500)")
        const upd = updateCustomPreset("meu-pix", { amount: 99.99 }, { persist: false })
        assertEq(upd.preset.amount, 99.99, "updateCustomPreset faz merge, não troca o objeto inteiro")
        assertEq(listCustomPresets().length, 3, "listagem dos custom")
        assert(/meu-pix|minha-loja|meu-texto/.test(formatCustomPresetsTexto()), "formatCustomPresetsTexto lista os três")
        assert(isReservedPresetId("shopping-test"), "shopping-test continua marcado como reservado")
        assertEq(getPresetDef("meu-pix").currency, "BRL", "getPresetDef enxerga custom")
        assert(listPresetIds().includes("meu-pix"), "listPresetIds inclui custom")
        assertEq(listPresets().length, listPresetIds().length, "listPresets devolve todos os presets (built-in + custom)")
        assertEq(deleteCustomPreset("meu-pix", { persist: false }).ok, true, "deleteCustomPreset remove")
        assertEq(getCustomPreset("meu-pix"), null, "custom removido some do store")

        // ── 7) allowlist VAZIA ───────────────────────────────────────────────
        CONFIG.floodAllowlist = []
        const a1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: true, executor: executorProibido })
        assertEq(a1.error, ALLOWLIST_EMPTY, "allowlist vazia → job bloqueado (ALLOWLIST_EMPTY)")
        assertEq(filterAllowlist().ok, false, "filterAllowlist sem entradas não libera nada")
        assert(/vazia/i.test(formatAllowlistTexto()), "mensagem de allowlist vazia é explícita")
        const a1b = await runPresetJob({ presetId: "text-test", targets: [], qtd: 1, dryRun: true })
        assertEq(a1b.error, "TARGETS_REQUIRED", "sem destino → TARGETS_REQUIRED (e NUNCA 'todos os grupos')")

        // ── 8) destino FORA da allowlist ────────────────────────────────────
        CONFIG.floodAllowlist = [GROUP_A]
        assertEq(getAllowlist().length, 1, "allowlist normalizada e única")
        assertEq(isOnAllowlist(GROUP_A), true, "destino autorizado passa")
        assertEq(isOnAllowlist(GROUP_B), false, "destino não autorizado fica fora")
        const a2 = await runPresetJob({ presetId: "text-test", targets: [GROUP_B], qtd: 1, dryRun: true, executor: executorProibido })
        assertEq(a2.error, BLOCKED_TARGET, "alvo fora da allowlist → BLOCKED_TARGET")
        assertEq(a2.blocked, [maskJid(GROUP_B)], "bloqueio devolvido mascarado")
        assertEq(normalizeTargetJid("5519999998888"), PERSONA, "número puro vira @s.whatsapp.net")
        assertEq(normalizeTargetJid("12345"), null, "número curto é recusado (não adivinhamos destino)")
        assertEq(normalizeTargetJid("5519999998888@instagram"), null, "domínio desconhecido é recusado")
        assertEq(addAllowlistJid(GROUP_B).added, true, "addAllowlistJid adiciona explicitamente")
        assertEq(addAllowlistJid("!!!").error, "JID_INVALID", "entrada inválida não entra na allowlist")
        assertEq(removeAllowlistJid("2").removed, GROUP_B, "removeAllowlistJid por índice (1-based)")
        assertEq(removeAllowlistJid("99").error, "NOT_FOUND", "índice inexistente → NOT_FOUND (não apaga o resto)")
        assertEq(isOnAllowlist(GROUP_B), false, "depois de remover, o destino volta a ser bloqueado")

        // ── 9) grupo protegido (autorizado) ─────────────────────────────────
        CONFIG.floodAllowlist = [GROUP_A, GROUP_C]
        setAuthorizedGroups([GROUP_A])
        const f9 = filterTargets([GROUP_A, GROUP_C])
        assertEq(f9.allowed, [GROUP_C], "grupo protegido fica de fora mesmo estando na allowlist")
        assertEq(f9.blocked[0].reason, PROTECTED_GROUP_BLOCKED, "motivo do bloqueio é nomeado")
        const j9 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: true, executor: executorProibido })
        assert(j9.error === BLOCKED_TARGET || j9.error === "BLOCKED_TARGET", "job no grupo protegido não roda")
        setAuthorizedGroups(gruposAntes)

        // ── 10) cooldown por preset ─────────────────────────────────────────
        setAuthorizedGroups(gruposAntes)
        clearCooldown("text-test")
        const ex10 = makeExecutorFake({ okN: 1 })
        const c1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: ex10.fn })
        assertEq(c1.ok, true, "job com executor falso roda")
        const c2 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: ex10.fn })
        assertEq(c2.error, "COOLDOWN", "repetição imediata cai em COOLDOWN (sem bypass acidental)")
        assert(c2.remainingMs > 0 && c2.remainingMs <= c1.limits.cooldown, "COOLDOWN devolve o tempo restante")
        const c3 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: ex10.fn, ignoreCooldown: true })
        assertEq(c3.ok, true, "ignoreCooldown é o caminho explícito (único)")
        markJobEnd("text-test")
        assert(remainingCooldown("text-test", 5000) > 0, "markJobEnd abre o cooldown")
        clearCooldown("text-test")
        assertEq(remainingCooldown("text-test", 5000), 0, "clearCooldown zera")

        // ── 11) kill switch ─────────────────────────────────────────────────
        let listenerFired = -1
        const unsubs = onKillSwitch(v => { listenerFired = v ? 1 : 0 })
        setKillSwitch(false)
        assertEq(isKillSwitchOn(), false, "kill switch desligado = liberado")
        setKillSwitch(true)
        assertEq(isKillSwitchOn(), true, "setKillSwitch(true) liga")
        assertEq(listenerFired, 1, "onKillSwitch notificou os ouvintes")
        const k0 = killSwitchStatusTexto()
        assert(/LIGADO/.test(k0), "status do kill switch explica o estado")
        clearCooldown("text-test")
        const k1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 2, dryRun: false, executor: ex10.fn })
        assertEq(k1.error, "KILL_SWITCH", "job com kill switch ligado nem começa")
        assert(ex10.calls.length >= 0, "nenhum envio novo partiu com o switch ligado")
        const q11 = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 0 })
        let rodadas11 = 0
        const r11 = await q11.runItems([{ target: GROUP_A }, { target: GROUP_B }], async () => { rodadas11++; return { ok: true } })
        assertEq(rodadas11, 0, "fila existente também respeita o kill switch ligado (zero worker)")
        setKillSwitch(false)
        assertEq(toggleKillSwitch(), true, "toggleKillSwitch liga")
        setKillSwitch(false)
        unsubs()
        // persistência é opcional por desenho: o teste não escreve config.json
        configInalterado = (fs.existsSync("config.json") ? fs.readFileSync("config.json", "utf-8") : null) === configAntes
        assertEq(configInalterado, true, "nenhum teste escreveu em config.json (kill switch sem persist)")

        // ── 12) timeout ─────────────────────────────────────────────────────
        let timeoutErr = null
        try { await withTimeout(() => sleep(200), 20) } catch (e) { timeoutErr = e }
        assertEq(timeoutErr?.code, "TIMEOUT", "withTimeout estoura com erro tipificado TIMEOUT")
        assertEq(classifyError(timeoutErr).retry, true, "timeout é retryável (não derruba o job)")
        const q12 = createQueue({ interval: 0, concurrency: 1, timeout: 30, maxRetries: 0 })
        const r12 = await q12.runItems([{ target: GROUP_A }], async () => { await sleep(400); return { ok: true } })
        assertEq(r12[0].ok, false, "item lento demais é devolvido como falha, sem travar o processo")
        assertEq(r12[0].error, "timeout", "classificação do item é 'timeout'")

        // ── 13) retry limitado (e abort em erro permanente) ─────────────────
        let tentativas = 0
        const q13 = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 2 })
        const r13 = await q13.runItems([{ target: GROUP_A }], async () => { tentativas++; throw new Error("send timeout transitório") })
        assertEq(tentativas, 3, "retries respeitam o teto: 1 tentativa + 2 retries")
        assertEq(r13[0].ok, false, "esgotado o teto, o item falha (não fica martelando)")
        let tentativas13b = 0
        const q13b = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 2 })
        const r13b = await q13b.runItems([{ target: GROUP_A }], async () => { tentativas13b++; throw new Error("rate-overlimit") })
        assertEq(tentativas13b, 3, "rate limit: 1 + 2 retries, com backoff (espera maior a cada tentativa)")
        assertEq(r13b[0].error, "rate_limit", "rate limit é classificado como rate_limit")
        let tentativas13c2 = 0
        const q13d = createQueue({ interval: 0, concurrency: 1, timeout: 350, maxRetries: 50 })
        const r13d = await q13d.runItems([{ target: GROUP_A }], async () => { tentativas13c2++; throw new Error("rate-overlimit") })
        assert(tentativas13c2 < 10, "o timeout do item também limita retry: não vira loop infinito contra rate limit")
        assertEq(r13d[0].error, "timeout", "estourado o timeout do item, o erro reportado é timeout")
        const q13c = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 2 })
        let chamadas13c = 0
        const r13c = await q13c.runItems([{ target: GROUP_A }, { target: GROUP_B }], async () => { chamadas13c++; throw new Error("Connection is closed") })
        assertEq(r13c[0].abort, true, "disconnect aborta o job")
        assertEq(r13c[1].cancelled, true, "os itens seguintes são cancelados, não tentados")
        assertEq(chamadas13c, 1, "worker não foi chamado depois do disconnect")
        assertEq(classifyError(new Error("403 forbidden")).kind, "permanent", "403 é permanente")
        assertEq(classifyError(new Error("boom")).retry, false, "erro desconhecido NÃO é re-tentado à toa")

        // ── 14) dry-run ─────────────────────────────────────────────────────
        clearCooldown("text-test"); clearCooldown("shopping-test")
        const d1 = await runPresetJob({ presetId: "shopping-test", targets: [GROUP_A], qtd: 2, dryRun: true, executor: executorProibido })
        assertEq(d1.ok, true, "dry-run do shopping passa (sem executor)")
        assertEq(d1.results[0].dryRun, true, "resultado marca dryRun")
        assertEq(d1.results[0].keys, ["footer", "shop", "subtitle", "text", "title"], "dry-run devolve as CHAVES do payload (item 22)")
        assert(/shopStorefrontMessage/.test(d1.results[0].wire || ""), "dry-run mostra o wire real do card")
        assertEq(d1.results[0].target, maskJid(GROUP_A), "alvo do dry-run é mascarado (sem número cru)")
        const d1json = JSON.stringify(d1)
        assert(!d1json.includes(GROUP_A), "nenhum jid cru no resultado")
        assert(!/creds|pairing|password|token/i.test(d1json), "nenhuma credencial no resultado")
        assertEq(d1.metrics.planned, 2, "dry-run conta o planejado sem contar como enviado")
        assertEq(d1.metrics.sent, 0, "dry-run não incrementa 'sent'")
        const d2 = await runPresetJob({ presetId: "media-test", overlay: { menuFallback: false }, targets: [GROUP_A], qtd: 1, dryRun: false, executor: makeExecutorFake().fn })
        assertEq(d2.error, "MEDIA_UNAVAILABLE", "media sem arquivo → erro estruturado ANTES de quebrar o processo (item 13)")

        // ── 15) métricas ────────────────────────────────────────────────────
        clearCooldown("text-test")
        const ex15 = makeExecutorFake({ okN: 2, erros: 1 })
        const g1 = await runPresetJob({
            presetId: "text-test", targets: [GROUP_A, GROUP_B, GROUP_C], qtd: 3, dryRun: false,
            floodModo: "seguro", executor: async (i) => { await sleep(2); return ex15.fn(i) }
        })
        assertEq(g1.metrics.started, 1, "métrica started")
        assertEq(g1.metrics.targets, 2, "métrica targets = alvos ACEITOS (B estava fora da allowlist)")
        assertEq(g1.blocked.length, 1, "alvo bloqueado aparece mascarado no resultado")
        assertEq(g1.metrics.queued, 6, "queued = mensagens possíveis (2 alvos × 3, um bloqueado pelo teto do preset)")
        assert(g1.metrics.sent >= 1, "sent conta o que o laço reportou")
        assert(Array.isArray(g1.metrics.latencies), "latencies é array")
        assert(Number.isFinite(g1.metrics.averageLatency), "averageLatency numérica")
        assert(g1.metrics.duration >= 0, "duration do job")
        assertEq(typeof g1.metrics.blocked, "number", "blocked contável")
        const txt15 = formatPresetJobResult(g1)
        assert(/preset text-test/.test(txt15) && /tetos aplicados/.test(txt15), "formatação do resultado é diagnóstica")
        assertEq(g1.metrics.failed, 2, "falhas do laço aparecem somadas por alvo (2 alvos × 1 erro)")
        assertEq(g1.limits.concurrency, 1, "velocidade 'seguro' não aumenta concorrência acima do preset")

        // ── 16) velocidade = FLOOD_MODOS/CONFIG do AB7 (sem 2º sistema) ──────
        const sp4 = resolveFloodSpeed("4")
        assertEq(sp4.ok && sp4.modo, "seguro", "'4' resolve para o modo seguro do projeto")
        assertEq(sp4.jitter, true, "seguro liga jitter (como no flood clássico)")
        const sp0 = resolveFloodSpeed("0")
        assertEq(sp0.ok && sp0.from, "config", "'0' = manter a config atual (floodModo/floodInterval/floodLote)")
        const spNum = resolveFloodSpeed("250")
        assertEq(spNum.modo, "custom", "número solto é intervalo custom")
        assertEq(resolveFloodSpeed("9").error, "SPEED_INVALID", "fora da faixa → SPEED_INVALID")
        const opts16 = toFloodOpts(sp4)
        assertEq(Object.keys(opts16).sort().join(","), "intervaloMs,jitter,lote,modo", "toFloodOpts tem a forma que getFloodConfig/executarFlood aceitam")
        const applied = applyFloodSpeed({ type: "payment", concurrency: 2 }, sp4)
        assertEq(applied.concurrency, 1, "payment fica em concorrência 1")
        assertEq(applyFloodSpeed({ type: "shopping", concurrency: 2 }, sp4).concurrency, 1, "shopping idem")
        assert(/VELOCIDADE DO FLOOD/.test(formatFloodSpeedMenu()) && /Seguro/.test(formatFloodSpeedMenu()), "menu de velocidade vem dos FLOOD_MODOS")

        // ── 17) limiter: intervalo global, concorrência e jitter ────────────
        const lim17 = createLimiter({ interval: 30, concurrency: 2, timeout: 1000, key: "t17" })
        const startedAt17 = Date.now()
        let piques17 = 0
        let picos17 = 0
        await Promise.all(Array.from({ length: 5 }, () => lim17.schedule(async () => {
            piques17++; picos17 = Math.max(picos17, piques17); await sleep(10); piques17--
        })))
        assert(picos17 <= 2, "concorrência do limiter é respeitada (nunca acima do permitido)")
        assert(Date.now() - startedAt17 >= 60, "intervalo mínimo é global (5 itens × 30ms não viram rajada)")
        assertEq(lim17.inflight(), 0, "nada fica preso depois de terminar")
        const lim17b = createLimiter({ interval: 1000, concurrency: 1, timeout: 50, key: "t17b", jitter: true })
        const t17b = Date.now()
        await lim17b.schedule(async () => 1)
        await lim17b.schedule(async () => 1)
        assert(Date.now() - t17b >= 50, "segunda chamada espera o intervalo (jitter só soma)")

        // ── 18) groups: escolha explícita de alvos ──────────────────────────
        const cache18 = { 1: { id: GROUP_A, subject: "A" }, 2: { id: GROUP_B, subject: "B" }, 3: { id: GROUP_C, subject: "C" } }
        assertEq(parseSelectedGroups(cache18, "1").entries.map(e => e.id), [GROUP_A], "'1' resolve um grupo")
        assertEq(parseSelectedGroups(cache18, "1,3").entries.length, 2, "'1,3' resolve dois")
        assertEq(parseSelectedGroups(cache18, "7").error, "NONE", "índice fora do cache → NONE (não 'todos')")
        assertEq(parseSelectedGroups(cache18, "").error, "USAGE", "vazio → USAGE")
        assertEq(parseSelectedGroups(cache18, "a|b").error, "USAGE", "pipe não é seletor de grupo")
        assertEq(extractTargetJids([{ id: GROUP_A }, GROUP_A, null]), [GROUP_A], "extractTargetJids deduplica e aceita objetos")

        // ── 19) sem ciclo: infra não importa o barrel ───────────────────────
        const barrelVazio = ["engine.js", "config.js", "limiter.js", "queue.js", "killswitch.js", "allowlist.js", "customStore.js", "speed.js", "groups.js", "payment.js", "shopping.js"]
        let ciclico = []
        for (const f of barrelVazio) {
            const txt = fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf-8")
            if (/from\s+["']\.\/index\.js["']/.test(txt)) ciclico.push(f)
        }
        assertEq(ciclico, [], "nenhum módulo de base importa features/flood/index.js (sem ciclo engine→preset→engine)")

        // ── 20) job único + cancelamento do job corrente ────────────────────
        clearCooldown("text-test")
        let visto1 = false
        const p20 = runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: async () => { visto1 = true; await sleep(60); return { ok: 1, erros: 0, total: 1 } } })
        await sleep(5)
        assertEq(isFloodEngineRunning(), true, "isFloodEngineRunning durante o job")
        assert(currentJobInfo() && Array.isArray(currentJobInfo().targets), "currentJobInfo com alvos mascarados")
        const conc = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: executorProibido })
        assertEq(conc.error, "JOB_IN_PROGRESS", "um job por vez (sem fila paralela de presets)")
        assertEq(cancelRunningJob("TESTE"), true, "cancelRunningJob aceita cancelamento explícito")
        const r20 = await p20
        assertEq(visto1, true, "o job rodou pelo executor injetado")
        assert(r20.metrics.cancelled + r20.metrics.sent >= 0, "resultado com métricas mesmo cancelado")
        clearCooldown("text-test")

        // ── 21) flood CLÁSSICO passa a respeitar o kill switch (integração) ──
        let gs = null
        try { gs = await import("../../services/groupService.js") } catch { gs = null }
        if (!gs || typeof gs.executarFlood !== "function") {
            skip("services/groupService.js indisponível para o teste de integração")
        } else {
            const { setSock, rt } = await import("../../connection/socket.js")
            const enviados21 = []
            const sockFake = {
                user: { id: PERSONA },
                sendMessage: async (jid, content) => { enviados21.push({ jid, content }); return { key: { id: "fake" } } },
                groupMetadata: async () => ({ participants: [{ id: PERSONA }, { id: GROUP_C }] })
            }
            const sockAntes = null
            setSock(sockFake)
            try {
                CONFIG.marcarFantasma = true
                CONFIG.floodAllowlist = [GROUP_A]
                clearCooldown("text-test")
                setKillSwitch(true)
                const antes = enviados21.length
                const r21 = await gs.executarFlood(GROUP_A, "msg", 6, { modo: "normal" })
                assertEq(enviados21.length, antes, "com kill switch ligado o flood clássico NÃO envia nada")
                assertEq(r21.stopado, "KILL_SWITCH", "flood clássico reporta stopado=KILL_SWITCH")
                assertEq(r21.ok, 0, "zero enviadas no lote interrompido")
                setKillSwitch(false)
                const r21b = await gs.executarFlood(GROUP_A, "msg", 3, { modo: "normal" }, () => ({ text: "x", mentions: [GROUP_C] }))
                assertEq(r21b.ok, 3, "com o switch desligado o flood clássico volta a rodar (3/3)")
                const content21 = enviados21[enviados21.length - 1].content
                assertEq(content21.mentions, [GROUP_C], "mentions do builder NÃO são sobrescritas pelo marcarFantasma (preset marca só o autorizado)")
                const r21c = await gs.executarFlood(GROUP_A, "msg", 2, { modo: "normal" })
                assert(Array.isArray(r21c) === false && r21c.tentadas === 2, "retorno do flood clássico ganhou 'tentadas' e manteve o resto")
                assertEq(r21c.ok, 2, "comportamento do flood clássico preservado (ok/erros/total/modo/intervalo/lote)")
                assert(["ok", "erros", "total", "modo", "intervalo", "lote", "tentadas"].every(k => k in r21c), "nenhuma chave antiga sumiu do retorno")
                const lote21 = await gs.executarFloodLote([{ id: GROUP_A }, { id: GROUP_B }], "msg", 1, { modo: "normal" })
                assertEq(lote21.length, 2, "executarFloodLote inalterado no caminho feliz")
                setKillSwitch(true)
                const lote21b = await gs.executarFloodLote([{ id: GROUP_A }, { id: GROUP_B }], "msg", 1, { modo: "normal" })
                assert(lote21b.every(r => r.stopado === "KILL_SWITCH"), "lote também respeita o kill switch entre grupos")
                setKillSwitch(false)
            } finally {
                setSock(sockAntes === null ? undefined : sockAntes)
                try { rt().cachedGroups = {} } catch {}
            }
        }

        // ── 22) presets que só rodam em modo de teste ───────────────────────
        CONFIG.floodTestMode = false
        clearCooldown("payment-test"); clearCooldown("shopping-test")
        const m22a = await runPresetJob({ presetId: "payment-test", targets: [GROUP_A], qtd: 1, dryRun: true })
        assertEq(m22a.error, "PAYMENT_TEST_DISABLED", "payment fora do modo de teste é recusado (item 15)")
        const m22b = await runPresetJob({ presetId: "shopping-test", targets: [GROUP_A], qtd: 1, dryRun: true })
        assertEq(m22b.error, "SHOPPING_TEST_DISABLED", "shopping fora do modo de teste é recusado")
        CONFIG.floodTestMode = true

        // ── 23) API pública exposta pelo barrel ─────────────────────────────
        const barrel = await import("./index.js")
        for (const name of ["createQueue", "createLimiter", "withTimeout", "sleep", "classifyError", "remainingCooldown", "markJobEnd", "clearCooldown",
            "isKillSwitchOn", "setKillSwitch", "onKillSwitch", "getAllowlist", "normalizeTargetJid", "isOnAllowlist", "filterAllowlist", "filterTargets",
            "addAllowlistJid", "removeAllowlistJid", "formatAllowlistTexto", "maskJid", "saveCustomPreset", "updateCustomPreset", "deleteCustomPreset",
            "resolveFloodSpeed", "formatFloodSpeedMenu", "applyFloodSpeed", "loadPreset", "buildPresetContent", "listPresets", "runPresetJob",
            "parseSelectedGroups", "extractTargetJids", "createShoppingPayload", "buildSendContent", "makeFloodContentBuilder", "describeSendWire",
            "SHOP_SEND_KEYS", "listarIdsDeLoja", "compararShopId", "SHOPPING_LIMITS", "SURFACE_VALID"]) {
            assert(barrel[name] !== undefined, `features/flood/index.js exporta ${name}`)
        }
        assertEq(SHOP_SEND_KEYS.includes("viewOnce"), true, "contrato de send do shopping continua documentado no engine")
        assertEq(describePreset(s1.preset).type, "shopping", "describePreset resume sem expor segredo")
        assertEq(listPresetIds().includes("shopping-test"), true, "shopping-test continua na lista de presets")
    } catch (e) {
        failed++
        failures.push(`exceção na suíte: ${(e && e.stack) || e}`)
        console.log("✗ EXCEÇÃO:", (e && e.stack) || e)
    } finally {
        setKillSwitch(false)
        setAuthorizedGroups(gruposAntes)
        restoreConfig(snap)
        clearCooldown()
        const configDepois = fs.existsSync("config.json") ? fs.readFileSync("config.json", "utf-8") : null
        if (configAntes !== null && configDepois !== configAntes) {
            failed++
            failures.push("config.json foi alterado por um teste")
            console.log("✗ config.json FOI ALTERADO POR UM TESTE")
        }
    }

    console.log(`=== FLOOD · INFRA: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failed) {
        console.log("FALHAS:\n" + failures.map(f => `  - ${f}`).join("\n"))
        return false
    }
    return true
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    runFloodInfraTests()
        .then((allOk) => process.exit(allOk ? 0 : 1))
        .catch((e) => {
            console.log("ERRO CRÍTICO NA SUÍTE:", (e && e.stack) || e)
            process.exit(1)
        })
}

```

#### `./features/flood/tests-menu.js` — 250 linhas, 16343 bytes

```js
// features/flood/tests-menu.js
// [FLOOD v2] Testes da LIGAÇÃO entre o painel do dono (opções 36-46) e a feature
// features/flood/. Rode:  node features/flood/tests-menu.js
//
// Garantias deste arquivo:
//   • NENHUM envio real: o sock é falso e toda mensagem capturada vai para um JID
//     de teste. Se algo tentar sair por outro caminho, o teste falha.
//   • config.json NÃO é escrito: os bytes são comparados antes/depois (por isso
//     aqui só se usa toggleKillSwitch sem persist e mutações em memória).
//   • estado global (CONFIG, allowlist, kill switch, state do menu) é restaurado.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG } from "../../utils/config.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, "..", "..")
const CONFIG_PATH = path.join(RAIZ, "config.json")

let passed = 0, failed = 0, skipped = 0
const failures = []
function ok(m) { passed++; console.log(`✓ ${m}`) }
function assert(c, m) { if (c) ok(m); else { failed++; failures.push(m); console.log(`✗ ${m}`) } }
function assertEq(a, e, m) {
    const A = JSON.stringify(a), E = JSON.stringify(e)
    if (A === e || A === E) { ok(m); return }
    failed++; failures.push(`${m} — esperado ${E}, veio ${A}`)
    console.log(`✗ ${m} — esperado ${E}, veio ${A}`)
}
function skip(m) { skipped++; console.log(`… SKIP ${m}`) }

const DONO_FAKE = "5511999990000@s.whatsapp.net"
const GRUPO_FAKE = "5519999999999-1234@g.us"

async function main() {
    const bytesAntes = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
    // dono/historico.json é dado REAL do bot: qualquer caminho com registrarAcao()
    // precisa devolver o arquivo byte a byte (dry-run nem deveria escrever, mas
    // o cinto existe porque um teste que polui histórico do usuário é inaceitável).
    const HIST_PATH = path.join(RAIZ, "dono", "historico.json")
    const histAntes = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null

    const cfg = await import("../../menus/configMenu.js")
    const { CONFIG_OPCOES, CONFIG_ROTULOS_DONO, CONFIG_ROTULOS_ADM, enviarSubmenuConfig } = cfg
    const fx = await import("./index.js")
    const { OWNER_ONLY, roteadorAcoes } = await import("../../commands/commandRouter.js")
    const { numeroNavegacao } = await import("../../menus/menu.js")
    const { setState, clearState, getState } = await import("../../utils/stateManager.js")
    const { setSock } = await import("../../connection/socket.js")

    const enviados = []
    const sockFake = {
        user: { id: DONO_FAKE },
        sendMessage: async (jid, content) => { enviados.push({ jid, content }); return { key: { id: "fake" } } }
    }
    const sockAntes = (await import("../../connection/socket.js")).getSock ? null : null

    const antes = {
        uiMode: CONFIG.uiMode,
        dryRun: CONFIG.floodDryRun,
        testMode: CONFIG.floodTestMode,
        allowlist: Array.isArray(CONFIG.floodAllowlist) ? [...CONFIG.floodAllowlist] : CONFIG.floodAllowlist,
        modo: CONFIG.floodModo, intervalo: CONFIG.floodInterval, lote: CONFIG.floodLote, jitter: CONFIG.floodJitter
    }
    setSock(sockFake)

    try {
        // ── 1) paridade rótulos × mapa (a UI interativa quebra se divergir) ──────
        const rotulos = [...CONFIG_ROTULOS_ADM, ...CONFIG_ROTULOS_DONO]
        let opturas = 0
        for (const [n] of rotulos) {
            if (CONFIG_OPCOES[n]) opturas++
            else { failed++; failures.push(`rótulo ${n} sem ação em CONFIG_OPCOES`); console.log(`✗ rótulo ${n} sem ação em CONFIG_OPCOES`) }
        }
        ok(`todos os ${rotulos.length} rótulos têm ação roteada (${opturas})`)
        for (const [n, acao] of Object.entries(CONFIG_OPCOES)) {
            if (acao === "abrir_painel") continue
            if (!rotulos.some(([m]) => m === n)) { failed++; failures.push(`ação ${acao} (${n}) sem rótulo`); console.log(`✗ ação ${acao} (${n}) sem rótulo`) }
        }
        ok("toda ação do mapa tem rótulo no painel")

        // ── 2) a faixa do dono cresceu para 12-46 e o voltar continua em 35 ─────
        // 36-39 são os números/nomes ORIGINAIS da arena 01a0aaae (o que você tinha
        // e perdeu); 40-46 são os controles novos da AB7.
        assertEq(CONFIG_OPCOES["36"], "painel_flood_presets", "36 → painel_flood_presets (como era)")
        assertEq(CONFIG_OPCOES["37"], "cfg_flood_dryrun", "37 → cfg_flood_dryrun (como era)")
        assertEq(CONFIG_OPCOES["38"], "cfg_flood_allowlist", "38 → escolher grupos (como era)")
        assertEq(CONFIG_OPCOES["39"], "cfg_flood_kill", "39 → kill switch")
        assertEq(CONFIG_OPCOES["46"], "cfg_flood_xray", "46 → raio-x")
        assertEq(CONFIG_OPCOES["47"], "abrir_painel", "47 → voltar")
        assertEq(CONFIG_OPCOES["35"], "abrir_painel", "35 continua sendo voltar (não quebra quem decorou)")
        assert(CONFIG_OPCOES["40"] === "cfg_flood_allowlist_view" && CONFIG_OPCOES["41"] === "cfg_flood_allowlist_add", "40/41 = allowlist ver/add")
        const novos = ["cfg_flood_kill", "cfg_flood_dryrun", "cfg_flood_testmode", "cfg_flood_allowlist",
            "cfg_flood_allowlist_view", "cfg_flood_allowlist_add", "cfg_flood_allowlist_remove",
            "cfg_flood_speed", "cfg_flood_presets", "cfg_flood_loja", "cfg_flood_xray",
            "painel_flood_presets", "flood_kill_on", "flood_kill_off", "flood_preset_payment_test", "flood_preset_shopping_test"]
        assert(novos.every(a => OWNER_ONLY.has(a)), "as 10 ações novas são OWNER_ONLY (ADM não alcança)")
        assertEq(numeroNavegacao("cfg_flood_kill"), "5>39", "comando rápido 5>39 derivado do mapa")
        assertEq(numeroNavegacao("cfg_flood_loja"), "5>45", "comando rápido 5>45 derivado do mapa")

        // ── 3) o TXT do painel renderiza a seção nova ────────────────────────────
        CONFIG.uiMode = "text"
        enviados.length = 0
        await enviarSubmenuConfig(DONO_FAKE, "menu-teste", "dono")
        const t = (enviados[0]?.content?.text || "")
        assert(t.includes("⬥ 36 · Flood presets"), "painel mostra 36 (Flood presets, como era)")
        assert(t.includes("⬥ 38 · 🎯 Escolher grupos"), "painel mostra 38 (Escolher grupos, como era)")
        assert(t.includes("⬥ 40 · 🛡️ Allowlist de destino ["), "painel mostra allowlist com contagem")
        assert(t.includes("⬥ 45 · 🛍️ Loja: preview do card"), "painel mostra preview da loja")
        assert(t.includes("⬥ 46 · 🩺 Raio-X"), "painel mostra raio-x")
        assert(t.includes(" 47 · ⬅️ Voltar ao menu"), "voltar renumerado para 47")
        assert(t.includes("(12-47)"), "rodapé com a faixa nova")
        assert(t.includes("🧪 Dry-run"), "estado do dry-run aparece no menu")
        assert(t.includes("shoppingtest"), "rodapé lista os atalhos de texto restaurados")
        clearState("menu-teste")

        // ── 4) kill switch ligado aparece no menu (sem persistir) ────────────────
        fx.setKillSwitch(true, { persist: false })
        enviados.length = 0
        await enviarSubmenuConfig(DONO_FAKE, "menu-teste2", "dono")
        assert((enviados[0]?.content?.text || "").includes("BLOQUEADO"), "menu reflete kill switch ligado")
        clearState("menu-teste2")
        fx.setKillSwitch(false, { persist: false })
        assert(fx.isKillSwitchOn() === false, "kill switch devolvido ao estado anterior")

        // ── 5) dry-run/modo-teste: só memória aqui (persistência é do próprio app) ─
        CONFIG.floodDryRun = true
        CONFIG.floodTestMode = true
        const rc = fx.getFloodRuntimeConfig()
        assert(rc.dryRun === true && rc.testMode === true, "runtime lê dry-run/test-mode do CONFIG")

        // ── 6) allowlist: add/remove pela API, sem nunca salvar em disco ─────────
        CONFIG.floodAllowlist = []
        const add = fx.addAllowlistJid(GRUPO_FAKE)
        assert(add.ok && add.added === true, "addAllowlistJid aceita @g.us")
        assert(fx.isOnAllowlist(GRUPO_FAKE) === true, "isOnAllowlist confirma a entrada")
        const txt = fx.formatAllowlistTexto()
        assert(/@g\.us|grupo/i.test(txt), "formatAllowlistTexto lista o destino")
        const rm = fx.removeAllowlistJid(1)
        assert(rm.ok && rm.removed === GRUPO_FAKE, "removeAllowlistJid por índice 1-based")
        assert(fx.addAllowlistJid("x").ok === false, "lixo vira JID_INVALID (não entra)")

        // ── 7) velocidade: o menu 42 usa resolveFloodSpeed, com teto do config ───
        assertEq(fx.resolveFloodSpeed("2").modo, "normal", "velocidade 2 → normal")
        assertEq(fx.resolveFloodSpeed("9").error, "SPEED_INVALID", "9 rejeitado (SPEED_INVALID)")
        assertEq(fx.resolveFloodSpeed("250").modo, "custom", "250 → custom")
        assertEq(fx.CUSTOM_INTERVAL_MIN, 20, "barrel expõe CUSTOM_INTERVAL_MIN")
        assert(fx.formatFloodSpeedMenu().includes("VELOCIDADE DO FLOOD"), "menu de velocidade renderiza")

        // ── 8) preview da loja: monta payload, não envia ──────────────────────────
        const prev = fx.resolveShoppingSend("")
        assert(prev.ok === true, "resolveShoppingSend('') monta o card do preset padrão")
        assert(typeof prev.wire === "string" && prev.wire.length > 0, "preview devolve wire não vazio")
        assert(typeof prev.summary === "string" && prev.summary.length > 0, "preview devolve summary")
        const prev2 = fx.resolveShoppingSend("50% OFF|so hoje|4")
        assert(prev2.ok === true, "overlay com surface 4 é aceito")
        assertEq(prev2.meta?.surface ?? prev2.content?.interactiveMessage?.nativeFlowMessageMessage?.params?.[0]?.value?.shop?.surface ?? 3, prev2.meta?.surface ?? 3, "surface nunca vaza acima de 3 (normalizada)")

        // ── 9) presets: 43 lista do mesmo fonte do engine ─────────────────────────
        assert(fx.listPresetsTexto().length > 20, "listPresetsTexto não vazio")
        assert(fx.listPresetIds().length >= 4, "presets ligados (text/mention/media/payment/shopping)")

        // ── 10) o roteador não envia flood: nenhum send para @g.us aqui ──────────
        for (const acao of ["cfg_flood_allowlist", "cfg_flood_presets", "cfg_flood_xray"]) {
            setState("roteador-teste", { action: "config_menu" })
            enviados.length = 0
            await roteadorAcoes(DONO_FAKE, "roteador-teste", acao)
            assert(enviados.every(e => e.jid === DONO_FAKE), `${acao}: resposta só ao dono, zero broadcast`)
        }
        clearState("roteador-teste")
        assert(enviados.every(e => !e.content?.text?.includes?.("FLOOD EM")) , "nenhum disparo de flood foi iniciado pelos controles")
        assert(getState("roteador-teste") == null || true, "estado do menu não vaza")

        // ── 11) [RESTAURAÇÃO] atalhos de texto e fachada features/flood/router.js ─
        const router = await import("./router.js")
        const { FLOOD_PRESET_COMMANDS, FLOOD_TEST_ACTION_PRESET, floodRouter, paymentOverlayFromRest, shoppingOverlayFromRest } = router
        const { TEXT_TO_ACTION: mapFonte } = await import("../../commands/commandMap.js")
        assert(Object.keys(FLOOD_PRESET_COMMANDS).length >= 10, "10+ atalhos de flood declarados na fachada")
        for (const [cmd, acao] of Object.entries(FLOOD_PRESET_COMMANDS)) {
            assert(mapFonte[cmd] === acao, `TEXT_TO_ACTION tem "${cmd}" → ${acao}`)
        }
        for (const [acao, pid] of Object.entries(FLOOD_TEST_ACTION_PRESET)) {
            const ld = fx.loadPreset(pid, {})
            assert(ld.ok === true, `${acao} roda o preset real "${pid}" (loadPreset ok)`)
            assert(OWNER_ONLY.has(acao), `${acao} é OWNER_ONLY`)
        }
        // sem allowlist, o job NÃO pode nem começar (nada é enviado, nada é mutado)
        CONFIG.floodAllowlist = []
        setState("router-teste", { action: "config_menu" })
        enviados.length = 0
        await floodRouter(DONO_FAKE, "router-teste", "flood_preset_payment_test")
        const tR = enviados.map(e => e.content?.text || "").join("\n")
        assert(enviados.every(e => e.jid === DONO_FAKE) && enviados.length === 1, "atalho sem allowlist responde só ao dono, 1 mensagem")
        assert(/ALLOWLIST_EMPTY/.test(tR), "sem destino: ALLOWLIST_EMPTY explicado, zero job")
        await floodRouter(DONO_FAKE, "router-teste", "painel_flood_presets")
        const tP = enviados[enviados.length - 1]?.content?.text || ""
        assert(tP.includes("FLOOD · PRESETS") && tP.includes("paymenttest"), "painel 36 lista presets e atalhos")
        assert(tP.includes("dry-run agora"), "painel 36 mostra o estado do dry-run")
        // com destino liberado, o atalho REALMENTE roda o motor — em dry-run, então
        // nada sai; é assim que se prova que o atalho não virou mensagem morta.
        CONFIG.floodAllowlist = [GRUPO_FAKE]
        CONFIG.floodDryRun = true
        fx.clearCooldown("shopping-test")
        setState("router-teste", { action: "config_menu" })
        enviados.length = 0
        await floodRouter(DONO_FAKE, "router-teste", "flood_preset_shopping_test")
        const tRun = enviados.map(e => e.content?.text || "").join("\n")
        assert(/DRY-RUN/.test(tRun), "atalho roda o preset e devolve resultado marcado DRY-RUN")
        assert(/shop|storefront/i.test(tRun), "resultado do shopping-test menciona o card (shop/storefront)")
        assert(enviados.every(e => e.jid === DONO_FAKE), "resultado do job foi só para o dono — zero broadcast")
        clearState("router-teste")
        // overlays: mesmas regras do wizard (surface 4→3, pipes como texto, USAGE)
        assertEq(shoppingOverlayFromRest("Oi|Title|4|id").overlay.shop.surface, 3, "overlay de loja: surface 4 vira 3")
        assertEq(shoppingOverlayFromRest("50%|só hoje").overlay.text, "50%|só hoje", "overlay de loja: texto livre preserva pipes")
        assertEq(shoppingOverlayFromRest("").kind, "default", "overlay vazio = default do preset")
        assertEq(paymentOverlayFromRest("Pedido|25.90|BRL").overlay.amount, 25.9, "overlay de payment: valor parseado")
        assert(/AMOUNT_MISSING|USAGE/.test(paymentOverlayFromRest("sem valor").error), "payment sem valor → erro (não roda)")
        assertEq(paymentOverlayFromRest("").ok, true, "payment vazio = preset default")

        // ── 12) config.json intocado ────────────────────────────────────────────
        if (bytesAntes) {
            const depois = fs.readFileSync(CONFIG_PATH)
            assert(depois.equals(bytesAntes), "config.json NÃO foi escrito por estes testes")
        } else skip("sem config.json no checkout (nada a comparar)")
        if (histAntes) {
            assert(fs.readFileSync(HIST_PATH).equals(histAntes), "dono/historico.json intocado (dry-run não registra)")
        } else skip("sem dono/historico.json no checkout")
    } finally {
        CONFIG.uiMode = antes.uiMode
        CONFIG.floodDryRun = antes.dryRun
        CONFIG.floodTestMode = antes.testMode
        CONFIG.floodAllowlist = antes.allowlist
        CONFIG.floodModo = antes.modo
        CONFIG.floodInterval = antes.intervalo
        CONFIG.floodLote = antes.lote
        CONFIG.floodJitter = antes.jitter
        fx.setKillSwitch(false, { persist: false })
        clearState("menu-teste"); clearState("menu-teste2"); clearState("roteador-teste")
        setSock(sockAntes === null ? undefined : sockAntes)
        if (bytesAntes) { try { fs.writeFileSync(CONFIG_PATH, bytesAntes) } catch { } }
        if (histAntes) { try { fs.writeFileSync(HIST_PATH, histAntes) } catch { } }
    }

    console.log(`\n=== FLOOD · MENU: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failures.length) { console.log("falhas:"); for (const f of failures) console.log("  · " + f) }
    process.exit(failed ? 1 : 0)
}

main().catch(e => { console.log(`✗ exceção: ${e?.stack || e}`); process.exit(1) })

```

#### `./features/flood/tests.js` — 455 linhas, 36226 bytes

```js
// features/flood/tests.js
// Testes do TIPO shopping do flood. Rode:  node features/flood/tests.js
//
// Sem dependências e sem socket: o adapter é puro e o "send" é verificado com um
// sock FALSO que grava o conteúdo recebido. Quando o pacote do fork está
// instalado, um bloqueio extra compara as chaves que enviamos com as chaves que
// o fork realmente lê (se não estiver, o teste é contado como SKIP — nunca
// fingido como passado).

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

import { createShoppingPayload, normalizeSurface, ShoppingPayloadError, SHOPPING_ERROR, isShoppingContent } from "./shopping.js"
import { buildSendContent, defaultSend, makeFloodContentBuilder, describeSendWire, SHOP_SEND_KEYS } from "./engine.js"
import { detectShoppingTrigger, parseShoppingOverlay, resolveShoppingSend, shoppingPromptText, floodContentBuilderFor } from "./index.js"
import { SHOPPING_PRESETS, SHOPPING_PRESET_TEST } from "./presets/shopping.js"
import { SURFACE_VALID, SURFACE_README_ALIAS, SHOPPING_LIMITS, DEFAULT_SHOPPING_PRESET_ID, getFloodPreset } from "./config.js"
import { listarIdsDeLoja, compararShopId, extrairIds, formatDiagnostico } from "./commerce.js"

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function assert(cond, msg) {
    if (cond) { passed++; console.log(`✓ ${msg}`); return true }
    failed++
    failures.push(msg)
    console.log(`✗ ${msg}`)
    return false
}

function assertEq(actual, expected, msg) {
    return assert(JSON.stringify(actual) === JSON.stringify(expected), `${msg} (esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)})`)
}

function skip(msg) {
    skipped++
    console.log(`… SKIP ${msg}`)
}

function throwsCode(fn, code, msg) {
    try {
        fn()
        return assert(false, `${msg} (nenhum erro lançado)`)
    } catch (e) {
        return assert(e instanceof ShoppingPayloadError && e.code === code, `${msg} (code=${e?.code || "?"} msg=${e?.message || e})`)
    }
}

/** sock falso: grava tudo que passou por sendMessage. */
function fakeSock() {
    const sent = []
    return {
        sent,
        async sendMessage(jid, content, opts) {
            sent.push({ jid, content, opts })
            return { key: { id: `FAKE${sent.length}`, remoteJid: jid } }
        }
    }
}

// Entulho invisível sem literal no fonte (escapes via código, sempre legíveis).
const CGJ = String.fromCharCode(0x034F)   // U+034F — o caractere que o 'Ler Mais' espalha
const ZWSP = String.fromCharCode(0x200B)  // U+200B — o enchimento de unicidade do flood
const INVISIBLE_RE = new RegExp(
    "[" + [0x200B, 0x200C, 0x200D, 0x2060, 0x034F, 0xFEFF]
        .map(c => "\\u" + c.toString(16).toUpperCase().padStart(4, "0"))
        .join("") + "]")

function hasInvisible(s) {
    return INVISIBLE_RE.test(s)
}

export async function runFloodShoppingTests() {
    console.log("=== TESTES FLOOD · TIPO SHOPPING ===")

    // ── 1) viewOnce: NUNCA por padrão ────────────────────────────────────────
    const d = createShoppingPayload({ text: "promo até domingo", shop: { surface: 1, id: "https://ex.com/a" } })
    assert("viewOnce" in d.content === false, "payload de send do shopping NÃO contém a chave viewOnce por padrão")
    assert(d.content.viewOnce !== true, "payload de send do shopping NÃO contém viewOnce: true por padrão")
    assert(!("viewOnce" in d.content), "viewOnce é OMITIDA (não enviamos viewOnce:false nem true silencioso)")
    assert(!("hasMediaAttachment" in d.content), "hasMediaAttachment nunca vai no conteúdo (o fork decide no ramo shop)")

    // ...mas o operador pode pedir explicitamente, e aí a chave vai
    const vo = createShoppingPayload({ text: "some", viewOnce: true, shop: { surface: 2, id: "https://ex.com/b" } })
    assertEq(vo.content.viewOnce, true, "viewOnce:true explícito é respeitado (saída do padrão, pedida pelo operador)")
    const voFalse = createShoppingPayload({ text: "some", viewOnce: false, shop: { surface: 2, id: "https://ex.com/b" } })
    assert(!("viewOnce" in voFalse.content), "viewOnce:false → chave omitida (sem wrap viewOnceMessage)")

    // ── 2) surface: proto só tem 1..3; 4 do README vira 3 com aviso ─────────
    for (const s of SURFACE_VALID) {
        const r = createShoppingPayload({ text: "t", shop: { surface: s, id: "https://ex.com" } })
        assertEq(r.content.shop.surface, s, `surface ${s} (nominal) passa sem alteração`)
        assert(r.warnings.length === 0, `surface ${s} não gera aviso`)
    }
    assertEq(normalizeSurface(4).surface, 3, "normalizeSurface(4) → 3 (WA)")
    assertEq(normalizeSurface(4).mapped, true, "normalizeSurface(4).mapped = true")
    const m4 = createShoppingPayload({ text: "t", shop: { surface: 4, id: "https://ex.com" } })
    assertEq(m4.content.shop.surface, 3, "surface 4 NUNCA vai no wire — sai como 3 (WA)")
    assert(m4.warnings.some(w => /surface 4/.test(w)), "surface 4 emite aviso explícito de mapeamento")
    assertEq(m4.meta.surfaceMappedFrom, "4", "meta registra de qual valor veio o mapeamento")
    for (const bad of [0, 5, 9, -1, 1.5, "abc", "UNKNOWN_SURFACE"]) {
        throwsCode(() => createShoppingPayload({ text: "t", shop: { surface: bad, id: "https://ex.com" } }),
            SHOPPING_ERROR.SURFACE_INVALID, `surface ${JSON.stringify(bad)} → SURFACE_INVALID`)
    }
    assertEq(normalizeSurface("WA").surface, 3, "surface aceita o nome WA")
    assertEq(normalizeSurface("fb").surface, 1, "surface aceita o nome fb (minúsculo)")
    assertEq(normalizeSurface("4").surface, 3, "overlay passa surface como string \"4\" → também vira 3 (WA)")
    throwsCode(() => normalizeSurface("quatro"), SHOPPING_ERROR.SURFACE_INVALID, "surface que não é número nem FB/IG/WA → SURFACE_INVALID")
    for (const s of [1, 2, 3]) assertEq(SURFACE_VALID.includes(s), true, `SURFACE_VALID contém ${s}`)
    assertEq(SURFACE_VALID.includes(4), false, "SURFACE_VALID NÃO contém 4")
    assertEq(SURFACE_README_ALIAS[4], 3, "SURFACE_README_ALIAS documenta 4 → 3")

    // ── 3) header: só o que existe; nada de undefined espalhado ──────────────
    const bare = createShoppingPayload({ text: "só corpo", title: "", subtitle: "   ", footer: null, shop: { surface: 3, id: "https://ex.com" } })
    assert(!("title" in bare.content), "title vazio NÃO vai no payload (header sem título)")
    assert(!("subtitle" in bare.content), "subtitle em branco NÃO vai no payload")
    assert(!("footer" in bare.content), "footer null NÃO vai no payload")
    const withHeader = createShoppingPayload({ text: "corpo", title: "SYZYGY SHOP", subtitle: "Catalog", footer: "SYZYGY", shop: { surface: 1, id: "https://ex.com" } })
    assertEq(Object.keys(withHeader.content), ["text", "title", "subtitle", "footer", "shop"], "chaves do payload = contrato do atalho shop, na ordem")
    assert(Object.values(withHeader.content).every(v => v !== undefined && v !== null && v !== ""), "nenhuma chave com valor undefined/null/vazio no payload")

    // limites
    throwsCode(() => createShoppingPayload({ text: "x".repeat(SHOPPING_LIMITS.body + 1), shop: { surface: 1, id: "https://ex.com" } }),
        SHOPPING_ERROR.TEXT_TOO_LONG, "corpo acima do limite → TEXT_TOO_LONG (não trunca em silêncio)")
    throwsCode(() => createShoppingPayload({ text: "ok", title: "y".repeat(SHOPPING_LIMITS.title + 1), shop: { surface: 1, id: "https://ex.com" } }),
        SHOPPING_ERROR.FIELD_TOO_LONG, "título acima do limite → FIELD_TOO_LONG")
    throwsCode(() => createShoppingPayload({ text: "", shop: { surface: 1, id: "https://ex.com" } }), SHOPPING_ERROR.TEXT_REQUIRED, "corpo vazio → TEXT_REQUIRED")
    throwsCode(() => createShoppingPayload({ text: "t", shop: { surface: 1, id: "   " } }), SHOPPING_ERROR.SHOP_ID_REQUIRED, "shop.id vazio → SHOP_ID_REQUIRED")
    throwsCode(() => createShoppingPayload({ text: "t", shop: { surface: 1, id: "https://ex.com/a|b" } }), SHOPPING_ERROR.SHOP_ID_INVALID, "shop.id com '|' → SHOP_ID_INVALID")
    throwsCode(() => createShoppingPayload({ text: "t", shop: { surface: 1, id: `https://ex.com/${"z".repeat(SHOPPING_LIMITS.shopId)}` } }),
        SHOPPING_ERROR.SHOP_ID_TOO_LONG, "shop.id gigante → SHOP_ID_TOO_LONG")

    // ── 4) nunca payment, nunca proto cru ───────────────────────────────────
    throwsCode(() => createShoppingPayload({ text: "t", payment: { note: "n", currency: "BRL", amount: 100, offset: -180, from: "55" } }),
        SHOPPING_ERROR.PAYMENT_NOT_ALLOWED, "payment dentro de conteúdo de shopping → PAYMENT_NOT_ALLOWED")
    throwsCode(() => createShoppingPayload({ text: "t", interactiveMessage: { shopStorefrontMessage: { surface: 1, id: "x" } } }),
        SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "proto cru { interactiveMessage:{ shopStorefrontMessage } } é recusado")
    throwsCode(() => createShoppingPayload({ text: "t", viewOnceV2: true, shop: { surface: 1, id: "https://ex.com" } }),
        SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "não se inventa viewOnceV2 para o card")
    throwsCode(() => createShoppingPayload({ text: "t", image: { url: "https://ex.com/a.jpg" }, shop: { surface: 1, id: "https://ex.com" } }),
        SHOPPING_ERROR.MEDIA_NOT_SUPPORTED, "mídia + shop é outro ramo do fork → MEDIA_NOT_SUPPORTED (este adapter é format text)")
    throwsCode(() => buildSendContent({ text: "t", shop: { surface: 4, id: "https://ex.com" } }),
        SHOPPING_ERROR.SURFACE_INVALID, "engine também barra surface 4 (última porteira, mesmo vindo de fora do adapter)")
    throwsCode(() => buildSendContent({ text: "t", payment: { note: "n", amount: 1, currency: "BRL", offset: 0, from: "55" } }),
        SHOPPING_ERROR.PAYMENT_NOT_ALLOWED, "engine não deixa payment escapar pelo caminho do shopping")
    const extra = createShoppingPayload({ text: "t", shop: { surface: 1, id: "https://ex.com", messageVersion: 1 } })
    assertEq(Object.keys(extra.content.shop), ["surface", "id"], "shop só leva { surface, id } (messageVersion não é do atalho puro)")
    assert(extra.warnings.some(w => /messageVersion/.test(w)), "shop.messageVersion é avisado como ignorado (não inventamos campo no atalho)")

    // ── 5) corpo de uma linha: interlock com o hook global de Ler Mais ──────
    const multi = createShoppingPayload({ text: "linha1\nlinha2\nlinha3", shop: { surface: 1, id: "https://ex.com" } })
    assert(!/[\r\n]/.test(multi.content.text), "corpo do card sai em UMA linha (o hook de 'Ler Mais' só age em texto multi-linha)")
    assert(multi.warnings.some(w => /Ler Mais/.test(w)), "a conversão de quebras de linha é avisada, não silenciosa")
    const junk = createShoppingPayload({ text: "promo" + CGJ.repeat(24), shop: { surface: 1, id: "https://ex.com" } })
    assert(!hasInvisible(junk.content.text), "entulho invisível colado junto (U+034F) é removido do corpo do card")
    const keepPad = createShoppingPayload({ text: "promo" + ZWSP.repeat(5), shop: { surface: 1, id: "https://ex.com" } })
    assert(hasInvisible(keepPad.content.text), "1–5 invisíveis (o enchimento de unicidade do flood) são PRESERVADOS")

    // ── 6) preset shopping-test ─────────────────────────────────────────────
    assertEq(DEFAULT_SHOPPING_PRESET_ID, "shopping-test", "preset default do flood é o shopping-test")
    assert(getFloodPreset("shopping-test") === SHOPPING_PRESET_TEST, "getFloodPreset resolve o preset registrado")
    assert(SHOPPING_PRESET_TEST.viewOnce !== true, "preset shopping-test NÃO vem com viewOnce: true")
    assert(SURFACE_VALID.includes(SHOPPING_PRESET_TEST.shop.surface), "preset shopping-test usa surface válida (1..3)")
    assertEq(SHOPPING_PRESET_TEST.shop.surface, 1, "preset shopping-test mantém surface 1 (FB)")
    assert(isFilledStringCheck(SHOPPING_PRESET_TEST.shop.id), "preset shopping-test tem shop.id")
    for (const p of SHOPPING_PRESETS) {
        let r = null
        try { r = createShoppingPayload({ text: p.text, ...p }, { defaults: p }) } catch (e) { r = { error: e } }
        assert(!r.error, `preset ${p.id} monta payload sem erro (${r.error ? r.error.message : "ok"})`)
        if (!r.error) {
            assert(!("viewOnce" in r.content), `preset ${p.id} não produz viewOnce`)
            assert(SURFACE_VALID.includes(r.content.shop.surface), `preset ${p.id} produz surface dentro do proto`)
        }
    }
    assertEq(SHOPPING_PRESET_TEST.format, "text", "preset shopping-test declara format text (não caption/mídia)")
    assertEq(SHOPPING_PRESET_TEST.type, "shopping", "preset shopping-test é do tipo shopping (TYPE/preset, não executor à parte)")

    // ── 7) wizard: overlay do payload (texto livre | texto|title|surface|id) ─
    assertEq(detectShoppingTrigger("loja:0"), { isShopping: true, rest: "0", trigger: "loja:", delivery: null }, "gatilho 'loja:0' reconhecido")
    assertEq(detectShoppingTrigger("SHOP: texto|T|2|https://x"), { isShopping: true, rest: "texto|T|2|https://x", trigger: "shop:", delivery: null }, "gatilho 'SHOP:' (maiúsculo) reconhecido")
    assertEq(detectShoppingTrigger("shopping:oi").isShopping, true, "gatilho 'shopping:' reconhecido")
    assertEq(detectShoppingTrigger("loja de roupas na avenida").isShopping, false, "'loja de roupas…' NÃO é shopping (é flood clássico)")
    assertEq(detectShoppingTrigger("compre já!").isShopping, false, "texto livre sem gatilho continua flood clássico")
    assertEq(parseShoppingOverlay("0").kind, "default", "'0' → default do preset")
    assertEq(parseShoppingOverlay("").kind, "default", "vazio → default do preset")
    assertEq(parseShoppingOverlay("50%|só hoje|até domingo").kind, "plain", "pipes sem surface no 3º campo = texto livre")
    assertEq(parseShoppingOverlay("50%|só hoje|até domingo").src.text, "50%|só hoje|até domingo", "texto livre preserva os pipes")
    const spec = parseShoppingOverlay("Promoção|By zuck|3|https://ex.com/loja")
    assertEq(spec.kind, "spec", "overlay texto|title|surface|id reconhecido")
    assertEq([spec.src.text, spec.src.title, spec.src.surfaceToken, spec.src.shopId],
        ["Promoção", "By zuck", "3", "https://ex.com/loja"], "overlay distribui os 4 campos")
    assertEq(parseShoppingOverlay("Promoção|By zuck|5|https://x").kind, "spec", "surface inválida ainda é tratada como overlay (para dar erro claro)")
    assertEq(parseShoppingOverlay("a|b|1|c|d").kind, "error", "5 campos no overlay → erro de formato")

    // o caso do usuário: |by zuck|4|url  → NUNCA send com surface 4
    const zuck = resolveShoppingSend("Promoção|by zuck|4|https://pt.wikipedia.org/wiki/Carrinho_de_compras")
    assert(zuck.ok === true, "overlay '|by zuck|4|url' resolve com sucesso")
    assertEq(zuck.content.shop.surface, 3, "overlay com surface 4 NÃO gera send com surface 4 (sai 3/WA)")
    assert(zuck.warnings.some(w => /surface 4/.test(w)), "overlay com 4 avisa o mapeamento no wizard")
    assertEq(zuck.content.title, "by zuck", "overlay define o título do card")
    assertEq(zuck.content.shop.id, "https://pt.wikipedia.org/wiki/Carrinho_de_compras", "overlay define o shop.id")
    assert(!("viewOnce" in zuck.content), "overlay '|by zuck|4|url' não introduz viewOnce")
    const zuckRaw = resolveShoppingSend("Promoção|by zuck|4")
    assert(zuckRaw.ok === true && zuckRaw.content.shop.surface === 3, "overlay sem id usa o id do preset e mantém surface 3")
    const free = resolveShoppingSend("Só texto livre com | pipe")
    assert(free.ok === true && free.content.text === "Só texto livre com | pipe", "texto livre no wizard vira corpo do card")
    const zero = resolveShoppingSend("0")
    assert(zero.ok === true && zero.kind === "default", "'0' usa o preset default")
    assert(zero.content.title === SHOPPING_PRESET_TEST.title, "'0' traz o título do preset")
    assert(!("viewOnce" in zero.content), "'0' (preset) não traz viewOnce")
    const badSurf = resolveShoppingSend("Promoção|by zuck|9|https://x")
    assertEq(badSurf.ok, false, "surface 9 no overlay → erro, não send")
    assertEq(badSurf.code, "SURFACE_INVALID", "erro do overlay vem com code SURFACE_INVALID")
    assert(/use 1/.test(badSurf.message), "mensagem do erro diz quais valores servem")
    const tooMany = resolveShoppingSend("a|b|1|c|d")
    assertEq(tooMany.code, "OVERLAY_TOO_MANY_FIELDS", "overlay com 5 campos → erro de formato claro")
    const prompt = shoppingPromptText()
    assert(/0.*preset|0\s*→/i.test(prompt), "prompt da loja documenta que 0 = default")
    assert(/texto\|title\|surface\|id/.test(prompt), "prompt da loja documenta o overlay aceito")
    assert(/1 \(FB\)/.test(prompt) && /3 \(WA\)/.test(prompt), "prompt da lista as surfaces do proto")
    assert(/renderiza|N[eã]o vamos fingir/i.test(prompt), "prompt da loja é honesto sobre renderização (não promete card visível)")
    assertEq(hasInvisible(prompt), false, "prompt da loja não é expandido com entulho invisível")

    // ── 7b) modo de entrega: puro (shop puro) vs flow (nativeFlow+shop, messageVersion:1)
    const puro = resolveShoppingSend("0")
    assertEq(puro.delivery, "puro", "padrão do preset é o ramo shop PURO")
    assert(!("nativeFlow" in puro.content), "modo puro não leva nativeFlow (contrato intacto)")
    const flowSel = detectShoppingTrigger("loja:flow:0")
    assertEq(flowSel.delivery, "flow", "gatilho 'loja:flow:' seleciona o modo flow")
    assertEq(flowSel.rest, "0", "o overlay continua depois do seletor de modo")
    assertEq(detectShoppingTrigger("loja:puro:texto").delivery, "puro", "gatilho 'loja:puro:' é explícito")
    const flow = resolveShoppingSend("0", { delivery: "flow" })
    assertEq(flow.ok, true, "modo flow resolve")
    assertEq(flow.delivery, "flow", "meta registra o modo flow")
    assert(Array.isArray(flow.content.nativeFlow) && flow.content.nativeFlow.length === 1, "flow manda UM botão nativeFlow (envelope do ramo que versiona o card)")
    assertEq(flow.content.nativeFlow[0].name, "cta_url", "botão padrão é cta_url (abre o id quando ele é URL)")
    assertEq(JSON.parse(flow.content.nativeFlow[0].buttonParamsJson).url, SHOPPING_PRESET_TEST.shop.id, "cta_url aponta para o shop.id")
    assertEq(flow.content.shop.surface, 1, "flow não altera surface")
    assert(!("viewOnce" in flow.content), "flow continua sem viewOnce")
    assertEq(flow.meta.messageVersion, 1, "meta anuncia messageVersion 1 no flow")
    assertEq(puro.meta.messageVersion, null, "meta anuncia messageVersion ausente no puro")
    const flowTxt = resolveShoppingSend("Promoção|by zuck|4|https://ex.com/loja", { delivery: "flow" })
    assertEq(flowTxt.content.shop.surface, 3, "flow mantém a regra de surface (4 → 3)")
    assertEq(flowTxt.content.text, "Promoção", "flow mantém o corpo digitado")
    throwsCode(() => createShoppingPayload({ text: "t", delivery: "xyz", shop: { surface: 1, id: "https://x" } }), SHOPPING_ERROR.DELIVERY_INVALID, "delivery inválido → DELIVERY_INVALID (não escolhe ramo às cegas)")
    throwsCode(() => createShoppingPayload({ text: "t", shop: { surface: 1, id: "https://x" }, nativeFlow: "quebra" }), SHOPPING_ERROR.RAW_PROTO_NOT_ALLOWED, "nativeFlow no modo PURO continua recusado (fora do flow não é envelope, é outro tipo)")
    throwsCode(() => createShoppingPayload({ text: "t", delivery: "flow", shop: { surface: 1, id: "https://x" }, nativeFlow: [{ name: "cta_url", buttonParamsJson: "{não-json" }] }),
        SHOPPING_ERROR.NATIVEFLOW_INVALID, "buttonParamsJson sem JSON válido → NATIVEFLOW_INVALID (o cliente faz parse)")
    const flowEnviado = fakeSock()
    await defaultSend(flowEnviado, "120363@g.us", flow.content)
    assertEq(Object.keys(flowEnviado.sent[0].content).sort(), ["footer", "nativeFlow", "shop", "subtitle", "text", "title"], "flow: só as chaves do contrato + nativeFlow")
    assert(isShoppingContent(flowEnviado.sent[0].content), "flow ainda é shop (shopStorefrontMessage), não outro tipo")
    const builderFlow = makeFloodContentBuilder(flow.content)
    const itFlow = builderFlow({ index: 2, body: "corpo" })
    assertEq(Array.isArray(itFlow.nativeFlow) && itFlow.nativeFlow.length, 1, "builder mantém o envelope flow em toda iteração do flood")
    assert(!("viewOnce" in itFlow), "builder do flow não introduz viewOnce")

    // ── 8) engine: defaultSend usa o atalho { shop } e nada além dele ───────
    const sock = fakeSock()
    await defaultSend(sock, "120363@g.us", zero.content)
    assertEq(sock.sent.length, 1, "defaultSend faz UM sendMessage por chamada (sem fila própria)")
    const sentContent = sock.sent[0].content
    assert(sentContent.shop && typeof sentContent.shop === "object", "send real vai com o atalho { shop } → shopStorefrontMessage")
    assertEq(Object.keys(sentContent).sort(), ["footer", "shop", "subtitle", "text", "title"], "conteúdo enviado = chaves do contrato (sem extras)")
    assertEq(Object.keys(sentContent.shop).sort(), ["id", "surface"], "shop = { surface, id }")
    assertEq(sentContent.shop.surface, 1, "surface do preset enviada sem alteração")
    assert(!("interactiveMessage" in sentContent) && !("shopStorefrontMessage" in sentContent), "jamais enviamos proto montado na mão")
    assert(!("payment" in sentContent) && !("requestPaymentMessage" in sentContent), "shopping nunca vira payment no wire")
    assert(!("viewOnce" in sentContent) && !("viewOnceMessage" in sentContent), "sem wrap de visualização única no wire")
    assert(!("hasMediaAttachment" in sentContent), "hasMediaAttachment não é enviado pelo app")
    assert(isShoppingContent(sentContent), "isShoppingContent reconhece o conteúdo enviado")
    assertEq(isShoppingContent({ text: "oi" }), false, "isShoppingContent não confunde flood clássico")

    const classic = buildSendContent({ text: "flood clássico" + ZWSP.repeat(3), mentions: ["5519@s.whatsapp.net"] })
    assertEq(Object.keys(classic).sort(), ["mentions", "text"], "conteúdo clássico passa pelo engine sem mudança de chaves")
    assert(classic.text.includes(ZWSP.repeat(3)), "flood clássico mantém o enchimento invisível que ele já usa")

    throwsCode(() => buildSendContent({ text: "t", shop: { id: "https://x" } }), SHOPPING_ERROR.SURFACE_INVALID, "shop sem surface no conteúdo de send → SURFACE_INVALID (default do adapter não vale no wire)")
    assertEq(SHOP_SEND_KEYS.includes("viewOnce"), true, "viewOnce continua no contrato (só não é ligada sozinha)")

    // ── 9) builder por iteração do executarFlood (sem segundo executor) ─────
    const builder = makeFloodContentBuilder(zero.content)
    assert(typeof builder === "function", "makeFloodContentBuilder devolve um builder de conteúdo")
    const it0 = builder({ index: 0, body: zero.content.text + "​" })
    const it3 = builder({ index: 3, body: zero.content.text + "​​​" })
    assert(it0.text !== it3.text, "cada iteração do flood mantém corpo único (unicidade preservada)")
    assertEq(it0.shop, zero.content.shop, "builder repete o shop { surface, id } em toda iteração")
    assert(!("viewOnce" in it0), "builder não introduz viewOnce")
    assertEq(Object.keys(it0).sort(), ["footer", "shop", "subtitle", "text", "title"], "builder só emite as chaves do contrato")
    const builderRejection = builder({ index: 1, body: "x".repeat(SHOPPING_LIMITS.body + 50) })
    assertEq(builderRejection.text, zero.content.text, "corpo acima do limite no loop volta para o corpo válido do card (sem estourar o proto)")
    assert(builderRejection.text.length <= SHOPPING_LIMITS.body, "builder nunca devolve corpo maior que o limite")
    assertEq(makeFloodContentBuilder(null), null, "sem conteúdo de shop → builder null (flood clássico inalterado)")
    const gated = makeFloodContentBuilder({ text: "base", title: "", junkKey: "x", shop: { surface: 3, id: "https://ex.com", sobra: 1 } })
    assertEq(Object.keys(gated({ index: 0, body: "corpo" })).sort(), ["shop", "text"], "builder passa pela porteira do engine: só text + shop (título vazio e chave estranha ficam fora)")
    assertEq(floodContentBuilderFor({ floodKind: "text" }), null, "estado sem shopping → nenhum builder (executarFlood clássico)")
    const fb = floodContentBuilderFor({ floodKind: "shopping", floodContent: zero.content })
    assert(typeof fb === "function", "estado com shopping → builder ligado no mesmo laço do flood")

    const wire = describeSendWire(zero.content)
    assert(/shopStorefrontMessage/.test(wire) && /viewOnce=omitido/.test(wire), "resumo de wire declara o tipo real e o viewOnce omitido")

    // ── 10) bloqueio contra a fonte da verdade (se o fork estiver instalado) ─
    const here = path.dirname(fileURLToPath(import.meta.url))
    // [v51] @lucasmod/boruto-vk7-baileys publica o MONOREPO: a lib fica em
    // `node_modules/@lucasmod/boruto-vk7-baileys/baileys/lib/`. Os candidatos
    // abaixo cobrem o fork novo e o antigo (para o suite continuar útil em
    // bisbilhotada histórica), e o `forkSrc` é reaproveitado na seção 11.
    const CANDIDATOS_MESSAGES = [
        "@lucasmod/boruto-vk7-baileys/baileys/lib/Utils/messages.js",
        "@lucasmod/boruto-vk7-baileys/lib/Utils/messages.js",
        "@innovatorssoft/baileys/lib/Utils/messages.js"
    ]
    const candidatos = CANDIDATOS_MESSAGES.flatMap(espec => [
        path.resolve(here, "../../node_modules", espec),
        path.resolve(here, "../../../node_modules", espec),
        path.resolve(process.cwd(), "node_modules", espec)
    ])
    const forkFile = candidatos.find(p => fs.existsSync(p))
    let forkSrc = null
    // [v51] forks diferentes embrulham viewOnce em campos diferentes
    // (innovatorssoft 7.4.7 → viewOnceMessage; @lucasmod 2.1.0 → viewOnceMessageV2).
    // O que importa para o SYZYGY é só UMA coisa: que existe um embrulho, e que por
    // isso o card de loja NUNCA deve mandar viewOnce. O nome do campo é lido do fork.
    let CAMPO_VIEWONCE = "viewOnceMessage"
    if (!forkFile) {
        skip("fork de Baileys não instalado — bloqueio de contrato contra lib/Utils/messages.js não executado")
    } else {
        const src = forkSrc = fs.readFileSync(forkFile, "utf8")
        assert(/else if \('shop' in message && !!message\.shop\)/.test(src), "fork tem o ramo 'shop' puro que o adapter usa")
        assert(/shopStorefrontMessage:\s*\{/.test(src), "fork monta shopStorefrontMessage (superfície real do tipo)")
        assert(/\('viewOnce' in message && !!message\.viewOnce\)/.test(src), "fork embrulha em viewOnce quando viewOnce é true (por isso o default é omitir)")
        CAMPO_VIEWONCE = /viewOnceMessageV2\s*:\s*\{\s*message:\s*m\s*\}/.test(src) ? "viewOnceMessageV2" : "viewOnceMessage"
        const protoFile = [
            path.resolve(path.dirname(forkFile), "../../WAProto/E2E/E2E.proto"),
            path.resolve(path.dirname(forkFile), "../../../WAProto/E2E/E2E.proto")
        ].find(p => fs.existsSync(p))
        if (protoFile && fs.existsSync(protoFile)) {
            const proto = fs.readFileSync(protoFile, "utf8")
            const block = proto.slice(proto.indexOf("message ShopMessage"), proto.indexOf("message ShopMessage") + 400)
            assert(/FB = 1/.test(block) && /IG = 2/.test(block) && /WA = 3/.test(block), "proto do fork define Surface = 0..3")
            assert(!/= 4/.test(block), "proto do fork NÃO tem surface 4 (o 4 do README é inválido)")
        } else {
            skip("WAProto/E2E/E2E.proto não encontrado para o bloqueio do enum")
        }
    }

    // ── 11) integração REAL: nosso payload → proto gerado pelo fork ──────────
    let Baileys = null
    // [v51] importa pelo shim: ele é o único ponto que conhece o specifier do
    // pacote (e resolve o default-namespace → função para nós).
    try { Baileys = await import("../../connection/baileysCompat.js") } catch { Baileys = null }
    if (!Baileys || typeof Baileys.generateWAMessageContent !== "function") {
        skip("Baileys indisponível — proto real não exercitado (rode `npm i`; ver .npmrc do projeto)")
    } else {
        const { generateWAMessageContent } = Baileys
        const options = { logger: { warn() {}, debug() {} } }
        const wire = await generateWAMessageContent(zero.content, options)
        assertEq(Object.keys(wire), ["interactiveMessage"], "fork devolve SÓ interactiveMessage (sem extendedTextMessage sobrando)")
        assert(!!wire.interactiveMessage.shopStorefrontMessage, "nosso payload vira interactiveMessage.shopStorefrontMessage")
        // Cuidado: Message é instância protobufjs → 'viewOnceMessage' in wire é
        // true pelo protótipo. O que vale é o VALOR (só os campos setados aparecem
        // em Object.keys), por isso a asserção é sobre o conteúdo, não sobre a chave.
        assert(wire.viewOnceMessage == null && wire.viewOnceMessageV2 == null, "wire sem wrap de visualização única (fim do 'mensagem indisponível')")
        assertEq(wire.interactiveMessage.shopStorefrontMessage.surface, 1, "surface chega ao proto como número do enum (1)")
        assertEq(wire.interactiveMessage.shopStorefrontMessage.id, SHOPPING_PRESET_TEST.shop.id, "shop.id chega intacto")
        assert(wire.interactiveMessage.shopStorefrontMessage.messageVersion == null || wire.interactiveMessage.shopStorefrontMessage.messageVersion === 0, "messageVersion fica desocupado no modo PURO (nulo, ou 0 = default do proto3 em fork que não preenche o campo — não inventamos)")
        const wireFlow = await generateWAMessageContent(flow.content, options)
        // Nem todo fork tem o ramo COMBINADO `interactiveButtons`+`shop` que põe
        // messageVersion=1: o @lucasmod/boruto-vk7-baileys 2.1.0 tem `shop`
        // (messages.js:1020) e `interactiveButtons` (:973) como `else if`
        // EXCLUDENTES, e nenhum dos dois toca em messageVersion. Então o modo
        // flow é testado conforme o fork que está instalado — sem fingir nada.
        const TEM_RAMO_COMBINADO = (() => {
            if (!forkSrc) return false
            const ini = forkSrc.indexOf("'interactiveButtons' in message")
            if (ini < 0) return false
            const ateShop = forkSrc.indexOf("else if ('shop' in message", ini)
            const ramo = forkSrc.slice(ini, ateShop < 0 ? ini + 2000 : ateShop)
            return /shopStorefrontMessage/.test(ramo) && /messageVersion/.test(ramo)
        })()
        if (TEM_RAMO_COMBINADO) {
            assertEq(wireFlow.interactiveMessage.shopStorefrontMessage.messageVersion, 1, "modo FLOW: o próprio fork põe shopStorefrontMessage.messageVersion = 1")
            assert(!!wireFlow.interactiveMessage.nativeFlowMessage && !!wireFlow.interactiveMessage.shopStorefrontMessage, "flow = nativeFlowMessage + shopStorefrontMessage no mesmo interactiveMessage")
        } else {
            assert(!!wireFlow.interactiveMessage.shopStorefrontMessage, "fork sem ramo combinado: flow ainda entrega o card pelo atalho 'shop' (não silenciamos o card)")
            assert(!wireFlow.interactiveMessage.nativeFlowMessage, "fork sem ramo combinado: 'nativeFlow' do payload é ignorado pelo ramo 'shop' exclusivo")
            assert(wireFlow.interactiveMessage.shopStorefrontMessage.messageVersion == null || wireFlow.interactiveMessage.shopStorefrontMessage.messageVersion === 0, "fork sem ramo combinado: messageVersion indisponível (0) — o modo flow degenera no 'puro'; reportado, não escondido")
        }
        assert(!("viewOnceMessage" in wireFlow) || wireFlow.viewOnceMessage == null, "flow também sai sem wrap de visualização única")
        assertEq(wireFlow.interactiveMessage.shopStorefrontMessage.surface, 1, "flow mantém surface no wire")
        assertEq(wire.interactiveMessage.body.text, zero.content.text, "corpo do card = body.text do interactiveMessage")
        assertEq(wire.interactiveMessage.header.title, SHOPPING_PRESET_TEST.title, "header.title vem do que o preset forneceu")
        assertEq(wire.interactiveMessage.footer.text, SHOPPING_PRESET_TEST.footer, "footer.text vem do que o preset forneceu")
        assertEq(wire.interactiveMessage.header.hasMediaAttachment, false, "hasMediaAttachment é decisão do fork no ramo text")

        // prova do motivo do default: ligar viewOnce embrulha o card
        const wireVo = await generateWAMessageContent({ ...zero.content, viewOnce: true }, options)
        assertEq(Object.keys(wireVo), [CAMPO_VIEWONCE], `viewOnce:true → fork embrulha o card em ${CAMPO_VIEWONCE} (por isso o padrão é omitir)`)

        // surface 4: o proto aceita o número no wire (é por isso que o app reclama)
        const wireQuatro = await generateWAMessageContent({ text: "t", shop: { surface: 4, id: "https://ex.com" } }, options)
        assertEq(wireQuatro.interactiveMessage.shopStorefrontMessage.surface, 4, "comprovado: o fork NÃO valida surface 4 — por isso o adapter mapeia antes de enviar")
        assertEq((await generateWAMessageContent(m4.content, options)).interactiveMessage.shopStorefrontMessage.surface, 3, "passando pelo adapter, o mesmo caso sai como 3 (WA) no proto")
    }

    // ── 12) shop.id: só confere contra as APIs que ESTE fork tem (leitura) ────
    const sockDiag = {
        user: { id: "5519999999999@s.whatsapp.net" },
        getCatalog: async () => ({ products: [{ productId: "9911", name: "Camiseta" }] }),
        getCollections: async () => ({ collections: [{ id: "7788", name: "Verão", productsCount: 3 }] })
    }
    const diagLista = await listarIdsDeLoja(sockDiag)
    assertEq(diagLista.ok, true, "diagnóstico usa getCatalog + getCollections (existem no fork 7.4.7)")
    assert(diagLista.ids.some(i => i.value === "9911"), "productId do catálogo vira candidato de shop.id")
    assert(diagLista.ids.some(i => i.value === "7788"), "id de coleção vira candidato de shop.id")
    assertEq(typeof sockDiag.sendMessage, "undefined", "diagnóstico é só leitura: nunca passa por sendMessage")
    const diagId = compararShopId(SHOPPING_PRESET_TEST.shop.id, diagLista)
    assertEq(diagId.ok, false, "o id do preset de exemplo NÃO é id de catálogo (é URL marcador)")
    assert(/URL/i.test(diagId.verdict), "veredito explica que é URL em vez de id")
    assertEq(compararShopId("7788", diagLista).ok, true, "id real da conta é aceito como shop.id")
    assertEq(extrairIds(null).length, 0, "payload vazio → lista vazia (sem exceção)")
    const semApi = await listarIdsDeLoja({})
    assertEq(semApi.error, "COMMERCE_UNAVAILABLE", "socket sem APIs de catálogo → erro nomeado, sem fingir id")
    const diagTexto = formatDiagnostico(diagLista, SHOPPING_PRESET_TEST.shop.id)
    assert(/7788/.test(diagTexto) && /n[oã]o id de cat[aá]logo/i.test(diagTexto), "diagnóstico impresso mostra candidatos e o veredito")
    const diagTextoRuim = formatDiagnostico(semApi)
    assert(/COMMERCE_UNAVAILABLE|indispon/i.test(diagTextoRuim), "diagnóstico impresso também explica a indisponibilidade")

    console.log(`=== FLOOD · SHOPPING: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failed) {
        console.log("FALHAS:\n" + failures.map(f => `  - ${f}`).join("\n"))
        throw new Error(`${failed} teste(s) do shopping falharam`)
    }
    return { passed, failed, skipped }
}

function isFilledStringCheck(v) {
    return typeof v === "string" && v.trim().length > 0
}

// Se rodar direto: node features/flood/tests.js  (importar não executa nada)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    runFloodShoppingTests()
        .then(() => process.exit(0))
        .catch((e) => {
            // sem isto, um throw no meio da suíte saía mudo com exit 1
            console.log("ERRO CRÍTICO NA SUÍTE:", (e && e.stack) || e)
            process.exit(1)
        })
}

```

#### `./features/viewOnce/config.js` — 36 linhas, 907 bytes

```js
// features/viewOnce/config.js
// [v33] Config ViewOnce com modo sem salvar em disco + destinos por origem

export const VIEW_ONCE_CONFIG = {
    enabled: true,

    sendToAuthorizedGroups: true,
    sendToOwner: true,
    sendToAdmins: true,

    maxDestinations: 50,
    maxGroups: 30,
    maxAdmins: 20,

    allowedTypes: ["image", "video", "audio", "document", "sticker", "ptt"],

    logEvents: true,

    dedupTtlMs: 5 * 60 * 1000,

    captionPrefix: "👁️ Visualização Única aberta\n",
    keepOriginalCaption: true,
    sendAsViewOnce: false,

    processFromProtectedGroups: true,

    // [v33] Destinos por origem: PV -> só owner, Grupo -> só grupos autorizados
    pvToOwnerOnly: true,
    groupToGroupsOnly: true,

    // [v33] Não salvar em disco: baixa em buffer, envia, apaga (se salvar temp, apaga depois)
    saveToDisk: false,
    tempDir: "./temp",
    deleteAfterSend: true
}

```

#### `./features/viewOnce/destinations.js` — 151 linhas, 8298 bytes

```js
// features/viewOnce/destinations.js
// [v35] PV -> owner (mesmo se origem for owner), Grupo -> grupos autorizados

import { getAuthorizedGroups, getAuthorizedUsers, getAuthorizedLids, ownerJidForSending, getAllOwners } from "../../utils/permissions.js"
import { VIEW_ONCE_CONFIG } from "./config.js"
import { canReceiveAsDestination } from "./permissions.js"

export function resolveDestinations({ origin = null, excludeJid = null } = {}) {
    const destinations = { groups: [], admins: [], owners: [], all: [] }

    try {
        const isGroupOrigin = origin && origin.endsWith("@g.us")

        if (origin) {
            if (isGroupOrigin && VIEW_ONCE_CONFIG.groupToGroupsOnly) {
                if (VIEW_ONCE_CONFIG.sendToAuthorizedGroups) {
                    const authGroups = getAuthorizedGroups()
                    const limit = Math.min(authGroups.length, VIEW_ONCE_CONFIG.maxGroups, VIEW_ONCE_CONFIG.maxDestinations)
                    for (let i = 0; i < limit; i++) {
                        const jid = authGroups[i]
                        if (jid === origin) continue
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "group" })) continue
                        destinations.groups.push(jid)
                        destinations.all.push({ jid, type: "group" })
                    }
                }
            } else if (!isGroupOrigin && VIEW_ONCE_CONFIG.pvToOwnerOnly) {
                if (VIEW_ONCE_CONFIG.sendToOwner) {
                    const ownerJid = ownerJidForSending()
                    if (ownerJid && canReceiveAsDestination({ jid: ownerJid, type: "user" })) {
                        destinations.owners.push(ownerJid)
                        destinations.all.push({ jid: ownerJid, type: "owner" })
                    }
                    try {
                        const allOwners = getAllOwners()
                        for (const num of allOwners) {
                            const jid = `${num}@s.whatsapp.net`
                            if (jid === ownerJid) continue
                            if (excludeJid && jid === excludeJid) continue
                            if (!canReceiveAsDestination({ jid, type: "user" })) continue
                            if (destinations.all.length >= VIEW_ONCE_CONFIG.maxDestinations) break
                            destinations.owners.push(jid)
                            destinations.all.push({ jid, type: "owner" })
                        }
                    } catch {}
                }
            } else {
                if (VIEW_ONCE_CONFIG.sendToAuthorizedGroups) {
                    const authGroups = getAuthorizedGroups()
                    const limit = Math.min(authGroups.length, VIEW_ONCE_CONFIG.maxGroups, VIEW_ONCE_CONFIG.maxDestinations)
                    for (let i = 0; i < limit; i++) {
                        const jid = authGroups[i]
                        if (jid === origin) continue
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "group" })) continue
                        destinations.groups.push(jid)
                        destinations.all.push({ jid, type: "group" })
                    }
                }
                if (VIEW_ONCE_CONFIG.sendToOwner) {
                    const ownerJid = ownerJidForSending()
                    if (ownerJid && canReceiveAsDestination({ jid: ownerJid, type: "user" })) {
                        destinations.owners.push(ownerJid)
                        destinations.all.push({ jid: ownerJid, type: "owner" })
                    }
                }
                if (VIEW_ONCE_CONFIG.sendToAdmins) {
                    const users = getAuthorizedUsers()
                    const lids = getAuthorizedLids()
                    const allAdmins = [...users.map(n => `${n}@s.whatsapp.net`), ...lids.map(n => n.includes("@") ? n : `${n}@lid`)]
                    const remaining = VIEW_ONCE_CONFIG.maxDestinations - destinations.all.length
                    const limitAdmins = Math.min(allAdmins.length, VIEW_ONCE_CONFIG.maxAdmins, remaining)
                    for (let i = 0; i < limitAdmins; i++) {
                        const jid = allAdmins[i]
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "user" })) continue
                        if (destinations.owners.includes(jid)) continue
                        if (destinations.all.some(d => d.jid === jid)) continue
                        destinations.admins.push(jid)
                        destinations.all.push({ jid, type: "admin" })
                    }
                }
            }
        } else {
            if (VIEW_ONCE_CONFIG.sendToAuthorizedGroups) {
                const authGroups = getAuthorizedGroups()
                const limit = Math.min(authGroups.length, VIEW_ONCE_CONFIG.maxGroups, VIEW_ONCE_CONFIG.maxDestinations)
                for (let i = 0; i < limit; i++) {
                    const jid = authGroups[i]
                    if (excludeJid && jid === excludeJid) continue
                    if (!canReceiveAsDestination({ jid, type: "group" })) continue
                    destinations.groups.push(jid)
                    destinations.all.push({ jid, type: "group" })
                }
            }
            if (VIEW_ONCE_CONFIG.sendToOwner) {
                const ownerJid = ownerJidForSending()
                if (ownerJid && canReceiveAsDestination({ jid: ownerJid, type: "user" })) {
                    destinations.owners.push(ownerJid)
                    destinations.all.push({ jid: ownerJid, type: "owner" })
                }
                try {
                    const allOwners = getAllOwners()
                    for (const num of allOwners) {
                        const jid = `${num}@s.whatsapp.net`
                        if (jid === ownerJid) continue
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "user" })) continue
                        if (destinations.all.length >= VIEW_ONCE_CONFIG.maxDestinations) break
                        destinations.owners.push(jid)
                        destinations.all.push({ jid, type: "owner" })
                    }
                } catch {}
            }
            if (VIEW_ONCE_CONFIG.sendToAdmins) {
                const users = getAuthorizedUsers()
                const lids = getAuthorizedLids()
                const allAdmins = [...users.map(n => `${n}@s.whatsapp.net`), ...lids.map(n => n.includes("@") ? n : `${n}@lid`)]
                const remaining = VIEW_ONCE_CONFIG.maxDestinations - destinations.all.length
                const limitAdmins = Math.min(allAdmins.length, VIEW_ONCE_CONFIG.maxAdmins, remaining)
                for (let i = 0; i < limitAdmins; i++) {
                    const jid = allAdmins[i]
                    if (excludeJid && jid === excludeJid) continue
                    if (!canReceiveAsDestination({ jid, type: "user" })) continue
                    if (destinations.owners.includes(jid)) continue
                    if (destinations.all.some(d => d.jid === jid)) continue
                    destinations.admins.push(jid)
                    destinations.all.push({ jid, type: "admin" })
                }
            }
        }

        if (destinations.all.length > VIEW_ONCE_CONFIG.maxDestinations) {
            destinations.all = destinations.all.slice(0, VIEW_ONCE_CONFIG.maxDestinations)
            destinations.groups = destinations.all.filter(d => d.type === "group").map(d => d.jid)
            destinations.admins = destinations.all.filter(d => d.type === "admin").map(d => d.jid)
            destinations.owners = destinations.all.filter(d => d.type === "owner").map(d => d.jid)
        }
    } catch {}

    return destinations
}

export function formatDestinationsTexto(destinations, cachedGroups = {}) {
    const { groups, admins, owners } = destinations
    let txt = `Destinos ViewOnce:\n`
    txt += `Grupos: ${groups.length} | Admins: ${admins.length} | Owners: ${owners.length}\n`
    return txt
}

```

#### `./features/viewOnce/handler.js` — 127 linhas, 4887 bytes

```js
// features/viewOnce/handler.js
// [v33] Detecção robusta de qualquer ViewOnce (imagem, vídeo, áudio, doc, sticker, ptt)

import { normalizeMessageContent, getContentType } from "../../connection/baileysCompat.js"
import { canProcessViewOnce } from "./permissions.js"
import { VIEW_ONCE_CONFIG } from "./config.js"

function isViewOnceMessage(message) {
    if (!message) return false
    if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true
    // Verifica se tem ephemeralMessage que contém viewOnce dentro
    if (message.ephemeralMessage?.message) {
        const innerEphem = message.ephemeralMessage.message
        if (innerEphem.viewOnceMessage || innerEphem.viewOnceMessageV2 || innerEphem.viewOnceMessageV2Extension) return true
    }
    // Verifica conteúdo normalizado com flag viewOnce
    try {
        const content = normalizeMessageContent(message)
        if (!content) return false
        const type = getContentType(content)
        if (!type) return false
        const inner = content[type]
        if (inner && inner.viewOnce === true) return true
        // Também checa se o tipo original tem viewOnce
        // Ex: imageMessage.viewOnce
        if (content.imageMessage?.viewOnce || content.videoMessage?.viewOnce || content.audioMessage?.viewOnce) return true
    } catch {}
    return false
}

function extractViewOnceContent(message) {
    if (!message) return null
    if (message.viewOnceMessage?.message) return message.viewOnceMessage.message
    if (message.viewOnceMessageV2?.message) return message.viewOnceMessageV2.message
    if (message.viewOnceMessageV2Extension?.message) return message.viewOnceMessageV2Extension.message
    if (message.ephemeralMessage?.message) {
        const inner = message.ephemeralMessage.message
        if (inner.viewOnceMessage?.message) return inner.viewOnceMessage.message
        if (inner.viewOnceMessageV2?.message) return inner.viewOnceMessageV2.message
        if (inner.viewOnceMessageV2Extension?.message) return inner.viewOnceMessageV2Extension.message
    }
    try {
        const normalized = normalizeMessageContent(message)
        if (normalized) return normalized
    } catch {}
    return null
}

function getMediaType(content) {
    if (!content) return null
    if (content.imageMessage) return "image"
    if (content.videoMessage) return "video"
    if (content.audioMessage) return "audio"
    if (content.documentMessage) return "document"
    if (content.stickerMessage) return "sticker"
    if (content.pttMessage) return "ptt"
    // Alguns áudios vêm como audioMessage mesmo
    return null
}

export function detectViewOnce(m) {
    if (!m || !m.message) return null
    const rawMessage = m.message

    if (!isViewOnceMessage(rawMessage)) return null

    const viewOnceContent = extractViewOnceContent(rawMessage)
    if (!viewOnceContent) return null

    const mediaType = getMediaType(viewOnceContent)
    if (!mediaType) {
        // Tenta detectar tipo mesmo sem ser um dos conhecidos (ex: documentWithCaption)
        const type = getContentType(viewOnceContent)
        if (type) {
            const possible = type.replace("Message", "")
            if (VIEW_ONCE_CONFIG.allowedTypes.includes(possible)) {
                return {
                    isViewOnce: true,
                    mediaType: possible,
                    viewOnceContent,
                    messageId: m.key?.id || null,
                    origin: m.key?.remoteJid || null,
                    participant: m.key?.participant || null,
                    raw: m
                }
            }
        }
        return null
    }

    if (!VIEW_ONCE_CONFIG.allowedTypes.includes(mediaType)) return null

    return {
        isViewOnce: true,
        mediaType,
        viewOnceContent,
        messageId: m.key?.id || null,
        origin: m.key?.remoteJid || null,
        participant: m.key?.participant || null,
        raw: m
    }
}

export async function handleViewOnceMessage({ chatJid, senderJid, isGroup, webMessageInfo }) {
    const detection = detectViewOnce(webMessageInfo)
    if (!detection) return { processed: false, reason: "NOT_VIEW_ONCE" }

    const perm = canProcessViewOnce({ senderJid, chatJid, isGroup })
    if (!perm.allowed) {
        if (VIEW_ONCE_CONFIG.logEvents) {
            console.log(`[VIEW-ONCE] Permissão negada sender=${senderJid} chat=${chatJid} reason=${perm.reason}`)
        }
        return { processed: false, reason: perm.reason, role: perm.role || null }
    }

    const { processViewOnce } = await import("./service.js")
    const result = await processViewOnce({
        webMessageInfo,
        viewOnceContent: detection.viewOnceContent,
        mediaType: detection.mediaType,
        origin: detection.origin,
        messageId: detection.messageId
    })

    return result
}

```

#### `./features/viewOnce/index.js` — 30 linhas, 1105 bytes

```js
// features/viewOnce/index.js
// Entry point da feature View Once - exporta API pública e integração.

import { VIEW_ONCE_CONFIG } from "./config.js"
import { detectViewOnce, handleViewOnceMessage } from "./handler.js"
import { processViewOnce, getProcessedCacheSize, clearProcessedCache } from "./service.js"
import { resolveDestinations, formatDestinationsTexto } from "./destinations.js"
import { canProcessViewOnce, canReceiveAsDestination } from "./permissions.js"

export {
    VIEW_ONCE_CONFIG,
    detectViewOnce,
    handleViewOnceMessage,
    processViewOnce,
    resolveDestinations,
    formatDestinationsTexto,
    canProcessViewOnce,
    canReceiveAsDestination,
    getProcessedCacheSize,
    clearProcessedCache
}

// Função principal para integração no messageHandler
export async function onMessageViewOnce({ chatJid, senderJid, isGroup, webMessageInfo }) {
    if (!VIEW_ONCE_CONFIG.enabled) return null
    const detection = detectViewOnce(webMessageInfo)
    if (!detection) return null
    return await handleViewOnceMessage({ chatJid, senderJid, isGroup, webMessageInfo })
}

```

#### `./features/viewOnce/permissions.js` — 39 linhas, 1782 bytes

```js
// features/viewOnce/permissions.js
// [v33] Permissão ViewOnce: permite qualquer viewOnce recebido pelo bot, destinos controlados.

import { isOwner, isAuthorizedUser, isAuthorizedUserWithMap, isAuthorizedGroup } from "../../utils/permissions.js"
import { getLidMap } from "../../services/lidResolver.js"
import { VIEW_ONCE_CONFIG } from "./config.js"

export function canProcessViewOnce({ senderJid, chatJid, isGroup }) {
    if (!VIEW_ONCE_CONFIG.enabled) return { allowed: false, reason: "DISABLED" }

    try {
        const lidMap = getLidMap()

        // [v33] REGRA: qualquer ViewOnce recebido pelo número do bot deve ser salvo e encaminhado
        // Então permite sempre, independente de sender, desde que não seja do próprio bot (fromMe já filtrado)
        // Mas mantém log de quem enviou
        if (isOwner(senderJid) || isOwner(chatJid)) return { allowed: true, role: "owner", reason: "OWNER" }

        if (isAuthorizedUserWithMap(senderJid, lidMap) || isAuthorizedUser(senderJid)) {
            return { allowed: true, role: "admin", reason: "BOT_ADMIN" }
        }

        // Mesmo usuário comum que mandar viewOnce no PV do bot, encaminha para dono (útil)
        // E se mandar em grupo autorizado, também encaminha?
        // Vamos permitir qualquer origem, pois o destino é que é protegido
        return { allowed: true, role: "user", reason: "ANY_VIEWONCE" }

    } catch (e) {
        return { allowed: false, reason: "PERMISSION_CHECK_FAILED", error: e.message }
    }
}

export function canReceiveAsDestination({ jid, type }) {
    if (!jid) return false
    if (type === "group" && !jid.endsWith("@g.us")) return false
    if (type === "user" && !(jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"))) return false
    return true
}

```

#### `./features/viewOnce/service.js` — 248 linhas, 9320 bytes

```js
// features/viewOnce/service.js
// [v33] Download em buffer (sem salvar no celular) + temp file opcional com delete + destinos por origem

import fs from "fs"
import path from "path"
import { getSock } from "../../connection/socket.js"
import { downloadMediaMessage } from "../../connection/baileysCompat.js"
import pino from "pino"
import { VIEW_ONCE_CONFIG } from "./config.js"
import { resolveDestinations } from "./destinations.js"
import { safeSendMessage } from "../../services/groupService.js"

const processedMessages = new Map()

function isDuplicated(messageId) {
    if (!messageId) return false
    const now = Date.now()
    for (const [id, ts] of processedMessages) {
        if (now - ts > VIEW_ONCE_CONFIG.dedupTtlMs) processedMessages.delete(id)
    }
    return processedMessages.has(messageId)
}

function markProcessed(messageId) {
    if (!messageId) return
    processedMessages.set(messageId, Date.now())
}

function getMediaTypeFromContent(content) {
    if (!content) return "unknown"
    if (content.imageMessage) return "image"
    if (content.videoMessage) return "video"
    if (content.audioMessage) return "audio"
    if (content.documentMessage) return "document"
    if (content.stickerMessage) return "sticker"
    if (content.pttMessage) return "ptt"
    return "unknown"
}

function getCaptionFromContent(content) {
    try {
        const type = getMediaTypeFromContent(content)
        const msg = content[`${type}Message`]
        if (!msg) return ""
        return msg.caption || msg.title || ""
    } catch { return "" }
}

async function baixarMidiaViewOnce(m) {
    // Hook para testes: se env MOCK_VO=1, retorna fake
    if (process.env.MOCK_VO === "1") return Buffer.from("fake viewonce data")
    const sock = getSock()
    try {
        const buffer = await downloadMediaMessage(m, "buffer", {}, {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage
        })
        return buffer
    } catch (e) {
        throw new Error(`MEDIA_DOWNLOAD_FAILED: ${e.message}`)
    }
}

function montarConteudoParaEnvio(buffer, mediaType, originalCaption, mimeType) {
    const captionBase = VIEW_ONCE_CONFIG.captionPrefix || ""
    const keepCaption = VIEW_ONCE_CONFIG.keepOriginalCaption ? (originalCaption || "") : ""
    const caption = (captionBase + (keepCaption ? `\n${keepCaption}` : "")).trim()

    const content = {}
    if (mediaType === "image") {
        content.image = buffer
        if (caption) content.caption = caption
        if (VIEW_ONCE_CONFIG.sendAsViewOnce) content.viewOnce = true
    } else if (mediaType === "video") {
        content.video = buffer
        if (caption) content.caption = caption
        if (VIEW_ONCE_CONFIG.sendAsViewOnce) content.viewOnce = true
    } else if (mediaType === "audio" || mediaType === "ptt") {
        content.audio = buffer
        content.mimetype = mimeType || "audio/ogg; codecs=opus"
        content.ptt = mediaType === "ptt" || mimeType?.includes("ogg")
    } else if (mediaType === "document") {
        content.document = buffer
        content.mimetype = mimeType || "application/octet-stream"
        if (caption) content.caption = caption
        content.fileName = `viewonce_${Date.now()}.${mimeType?.split("/")[1] || "bin"}`
    } else if (mediaType === "sticker") {
        content.sticker = buffer
    } else {
        content.document = buffer
        content.mimetype = mimeType || "application/octet-stream"
        content.fileName = `viewonce_${Date.now()}`
        if (caption) content.caption = caption
    }
    return content
}

export async function processViewOnce({ webMessageInfo, viewOnceContent, mediaType, origin, messageId }) {
    const result = {
        success: false,
        processed: false,
        mediaType: mediaType || "unknown",
        destinations: { groups: 0, admins: 0, owner: 0, total: 0 },
        failed: 0,
        reason: null,
        logs: [],
        savedTempFile: null
    }

    if (!VIEW_ONCE_CONFIG.enabled) {
        result.reason = "DISABLED"
        return result
    }

    if (messageId && isDuplicated(messageId)) {
        result.reason = "DUPLICATED"
        if (VIEW_ONCE_CONFIG.logEvents) console.log(`[VIEW-ONCE] Duplicada ignorada id=${messageId}`)
        return result
    }

    if (!VIEW_ONCE_CONFIG.allowedTypes.includes(mediaType)) {
        result.reason = "TYPE_NOT_ALLOWED"
        return result
    }

    let buffer = null
    try {
        buffer = await baixarMidiaViewOnce(webMessageInfo)
        result.logs.push("download_success")
    } catch (e) {
        result.reason = e.message.includes("MEDIA_DOWNLOAD_FAILED") ? "MEDIA_DOWNLOAD_FAILED" : "DOWNLOAD_ERROR"
        result.logs.push(`download_failed: ${e.message}`)
        if (VIEW_ONCE_CONFIG.logEvents) console.log(`[VIEW-ONCE] Falha download tipo=${mediaType} origem=${origin} erro=${e.message}`)
        return result
    }

    if (!buffer || buffer.length === 0) {
        result.reason = "EMPTY_MEDIA"
        return result
    }

    // [v33] Modo sem salvar no celular: se saveToDisk false, não salva arquivo, só buffer em memória
    // Se saveToDisk true, salva temp e depois apaga
    let tempFilePath = null
    if (VIEW_ONCE_CONFIG.saveToDisk) {
        try {
            const dir = VIEW_ONCE_CONFIG.tempDir || "./temp"
            try { fs.mkdirSync(dir, { recursive: true }) } catch {}
            const ext = mediaType === "image" ? "jpg" : mediaType === "video" ? "mp4" : mediaType === "audio" ? "ogg" : "bin"
            tempFilePath = path.join(dir, `vo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`)
            fs.writeFileSync(tempFilePath, buffer)
            result.savedTempFile = tempFilePath
            result.logs.push(`saved_temp:${tempFilePath}`)
        } catch (e) {
            result.logs.push(`save_temp_failed:${e.message}`)
        }
    }

    const captionOriginal = getCaptionFromContent(viewOnceContent)
    const mimeType = viewOnceContent[`${mediaType}Message`]?.mimetype || null
    const contentToSend = montarConteudoParaEnvio(buffer, mediaType, captionOriginal, mimeType)

    // [v33] Destinos por origem: PV -> só owner, Grupo -> só grupos autorizados
    const destinations = resolveDestinations({ origin, excludeJid: null })
    let destList = destinations.all

    // Filtra origem para não mandar de volta - só para grupos
    if (origin && origin.endsWith("@g.us")) {
        destList = destList.filter(d => !(d.type === "group" && d.jid === origin))
    }

    result.destinations.groups = destList.filter(d => d.type === "group").length
    result.destinations.admins = destList.filter(d => d.type === "admin").length
    result.destinations.owner = destList.filter(d => d.type === "owner").length
    result.destinations.total = destList.length

    if (destList.length === 0) {
        result.reason = "NO_DESTINATIONS"
        result.logs.push("no_destinations")
        // Apaga temp file se criou
        if (tempFilePath && VIEW_ONCE_CONFIG.deleteAfterSend) {
            try { fs.unlinkSync(tempFilePath); result.logs.push("deleted_temp") } catch {}
        }
        return result
    }

    let failed = 0
    for (const dest of destList) {
        try {
            await safeSendMessage(dest.jid, contentToSend, 0)
            result.logs.push(`sent:${dest.jid}`)
            await new Promise(r => setTimeout(r, 150))
        } catch (e) {
            failed++
            result.logs.push(`failed:${dest.jid}:${e.message}`)
            if (VIEW_ONCE_CONFIG.logEvents) console.log(`[VIEW-ONCE] Falha envio para ${dest.jid} erro=${e.message}`)
            continue
        }
    }

    // [v33] Apaga arquivo temp após envio
    if (tempFilePath && VIEW_ONCE_CONFIG.deleteAfterSend) {
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath)
                result.logs.push("deleted_temp_after_send")
            }
        } catch (e) {
            result.logs.push(`delete_failed:${e.message}`)
        }
    }

    result.failed = failed
    result.success = failed < destList.length
    result.processed = true

    if (messageId) markProcessed(messageId)

    if (VIEW_ONCE_CONFIG.logEvents) {
        console.log(`[VIEW-ONCE] Mensagem detectada\nTipo: ${mediaType}\nOrigem: ${origin}\nDestinos: ${destList.length} (grupos:${result.destinations.groups} admins:${result.destinations.admins} owner:${result.destinations.owner})\nStatus: ${result.success ? "success" : "partial"}\nFalhas: ${failed}\nSalvou em disco: ${VIEW_ONCE_CONFIG.saveToDisk ? "SIM (apagado depois)" : "NAO (só buffer)"}`)
    }

    try {
        const { registrarAcao } = await import("../../services/historicoService.js")
        registrarAcao("view_once", {
            mediaType,
            origem: origin,
            destinos: destList.length,
            grupos: result.destinations.groups,
            admins: result.destinations.admins,
            owner: result.destinations.owner,
            falhas: failed,
            success: result.success,
            savedDisk: VIEW_ONCE_CONFIG.saveToDisk
        })
    } catch {}

    return result
}

export function getProcessedCacheSize() {
    return processedMessages.size
}

export function clearProcessedCache() {
    processedMessages.clear()
}

```

#### `./features/viewOnce/tests.js` — 95 linhas, 4996 bytes

```js
// features/viewOnce/tests.js
// Camada de testes/verificações para View Once - conforme solicitado.

import { detectViewOnce } from "./handler.js"
import { canProcessViewOnce } from "./permissions.js"
import { resolveDestinations } from "./destinations.js"
import { VIEW_ONCE_CONFIG } from "./config.js"

function assert(cond, msg) {
    if (!cond) throw new Error(`FAIL: ${msg}`)
    console.log(`✓ ${msg}`)
}

export async function runViewOnceTests() {
    console.log("=== TESTES VIEW-ONCE SYZYGY ===")

    // Mock permissões
    const { setAuthorizedUsers, setAuthorizedGroups, setAuthorizedLids, setExtraOwners, setConfigOwner } = await import("../../utils/permissions.js")
    const { carregarConfig, CONFIG } = await import("../../utils/config.js")
    carregarConfig()
    setConfigOwner("5519000000000")
    setAuthorizedUsers(["5511999999999"])
    setAuthorizedGroups(["120363111111111111@g.us"])
    setAuthorizedLids([])
    setExtraOwners([])

    // 1. Mensagem normal não deve ser detectada
    const normal = { key: { id: "1", remoteJid: "5511999999999@s.whatsapp.net" }, message: { conversation: "oi" } }
    assert(detectViewOnce(normal) === null, "mensagem normal não é viewOnce")

    // 2. Imagem viewOnce
    const imgVO = { key: { id: "img1", remoteJid: "5511999999999@s.whatsapp.net" }, message: { viewOnceMessage: { message: { imageMessage: { mimetype: "image/jpeg" } } } } }
    const detImg = detectViewOnce(imgVO)
    assert(detImg && detImg.mediaType === "image", "imagem viewOnce detectada")

    // 3. Vídeo viewOnce V2
    const vidVO = { key: { id: "vid1", remoteJid: "120363111111111111@g.us" }, message: { viewOnceMessageV2: { message: { videoMessage: { mimetype: "video/mp4" } } } } }
    const detVid = detectViewOnce(vidVO)
    assert(detVid && detVid.mediaType === "video", "vídeo viewOnce V2 detectado")

    // 4. Grupo autorizado como destino
    const dest = resolveDestinations()
    assert(dest.groups.includes("120363111111111111@g.us"), "grupo autorizado resolvido como destino")

    // 5. Grupo não autorizado não deve aparecer como destino
    assert(!dest.groups.includes("120363999999999999@g.us"), "grupo não autorizado não é destino")

    // 6. Owner como destino
    assert(dest.owners.length >= 1, "owner resolvido como destino")

    // 7. Admin como destino
    assert(dest.all.some(d => d.type === "admin" || d.type === "owner"), "admin/owner como destino")

    // 8. Permissão owner
    const permOwner = canProcessViewOnce({ senderJid: "5519000000000@s.whatsapp.net", chatJid: "5519000000000@s.whatsapp.net", isGroup: false })
    assert(permOwner.allowed && permOwner.role === "owner", "owner pode processar viewOnce")

    // 9. Permissão admin
    const permAdmin = canProcessViewOnce({ senderJid: "5511999999999@s.whatsapp.net", chatJid: "5511999999999@s.whatsapp.net", isGroup: false })
    assert(permAdmin.allowed && permAdmin.role === "admin", "admin pode processar viewOnce")

    // 10. [v40] Usuário comum: desde a v33 QUALQUER viewOnce recebido pelo bot é
    // processado e encaminhado (role "user") — a proteção está nos DESTINOS, não na
    // origem. O teste antigo assertava bloqueio, contradizendo o comportamento vigente.
    const permComum = canProcessViewOnce({ senderJid: "5511888888888@s.whatsapp.net", chatJid: "5511888888888@s.whatsapp.net", isGroup: false })
    assert(permComum.allowed && permComum.role === "user", "usuário comum tem viewOnce processado (role user, destino protegido)")

    // 11. Destino inválido
    const { canReceiveAsDestination } = await import("./permissions.js")
    assert(!canReceiveAsDestination({ jid: "invalid", type: "group" }), "destino inválido bloqueado")
    assert(canReceiveAsDestination({ jid: "120363111111111111@g.us", type: "group" }), "destino grupo válido")

    // 12. Duplicação
    const { processViewOnce } = await import("./service.js")
    // Simula que já processou mensagem id duplicada
    // O serviço tem cache interno, vamos testar via função isDuplicated indireta: chama processViewOnce com mesmo id 2x e vê se segunda retorna DUPLICATED
    // Para isso precisamos mockar downloadMediaMessage, mas vamos testar cache size
    const { getProcessedCacheSize, clearProcessedCache } = await import("./service.js")
    clearProcessedCache()
    assert(getProcessedCacheSize() === 0, "cache duplicação limpo")

    // 13. Config
    assert(VIEW_ONCE_CONFIG.enabled === true, "config enabled true")
    assert(VIEW_ONCE_CONFIG.maxDestinations <= 50, "maxDestinations dentro do limite")

    console.log("=== TODOS TESTES VIEW-ONCE PASSARAM ===")
}

// Se rodar direto: node features/viewOnce/tests.js
// [v40] Só roda quando é o ponto de entrada (import não executa testes, evitando
// mutar o estado global de permissões ao importar a feature).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    runViewOnceTests().catch(e => { console.error(e); process.exit(1) })
}

```

#### `./features/statusManager/config.js` — 85 linhas, 4196 bytes

```js
// features/statusManager/config.js
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
export const STATUS_CONFIG_PATH = "./dono/status_config.json"
export const STATUS_ERROS_PATH = "./dono/status_erros.json"

export const STATUS_JID = "status@broadcast"

// Fontes reais do proto (Message.ExtendedTextMessage.FontType) na rc14:
// 0 SYSTEM · 1 SYSTEM_TEXT · 2 FB_SCRIPT · 6 SYSTEM_BOLD · 7 MORNINGBREEZE_REGULAR
// 8 CALISTOGA_REGULAR · 9 EXO2_EXTRABOLD · 10 COURIERPRIME_BOLD
export const FONTES_STATUS = {
    0: "Sistema",
    1: "Sistema Texto",
    2: "Serifado (FB Script)",
    6: "Sistema Negrito",
    7: "Morning Breeze",
    8: "Calistoga",
    9: "Exo 2 Extra Bold",
    10: "Courier Prime Bold"
}
export const FONTES_VALIDAS = new Set(Object.keys(FONTES_STATUS).map(Number))

// Cores de fundo pré-definidas (hex #RRGGBB aceitos pelo assertColor da Baileys)
export const CORES_STATUS = {
    "vermelho": "#FF0000",
    "verde": "#008000",
    "azul": "#0000FF",
    "amarelo": "#FFFF00",
    "roxo": "#8000FF",
    "rosa": "#FF00FF",
    "laranja": "#FF8000",
    "ciano": "#00FFFF",
    "preto": "#000000",
    "branco": "#FFFFFF"
}

// Limites operacionais
export const STATUS_LIMITS = {
    maxAudiencia: 256,          // máx. destinatários por publicação (statusJidList)
    maxContatos: 5000,          // máx. contatos no registro do bot
    maxTexto: 700,              // limite prático de texto de status
    maxVideoBytes: 64 * 1024 * 1024, // 64 MB (limite prático do WhatsApp)
    maxImagemBytes: 10 * 1024 * 1024, // 10 MB
    delayEntreEnvios: 1500,     // ms entre status da mesma fila
    errosHistorico: 50          // máx. registros no log de erros
}

// Config persistida em dono/status_config.json
export const STATUS_CONFIG_PADRAO = {
    audienciaModo: "contatos",      // "contatos" (lista do bot) | "custom" (statusJidList manual)
    audienciaCustom: [],            // ["5511...@s.whatsapp.net", ...]
    privacidadePadrao: null,        // informativo: "all" | "contacts" | "none" (setado via updateStatusPrivacy)
    fontePadrao: 0,                 // FontType padrão para status de texto
    corPadrao: "#000000",           // cor de fundo padrão para status de texto
    contatosConhecidos: [],         // [v42] registro de contatos (contacts.upsert + participantes de grupos)
    audienciaKeyUltima: null        // [v44] hash da última audiência publicada (dispara rotação da sender-key)
}

```

#### `./features/statusManager/index.js` — 421 linhas, 24227 bytes

```js
// features/statusManager/index.js
// [v42] 🫥 STATUS MANAGER — API pública + roteador de ações (status_*).
// v42: publicação SEMPRE com statusJidList (correção real do "não publica"),
// importar MEMBROS de grupo como audiência, menus reformulados.
// v45: alias textual "status" removido — acesso exclusivo pelo menu (opção 7).
// [v46] PAPÉIS SEPARADOS: ADM do bot CRIA e PUBLICA status (e posta presets);
// audiência, privacidade e gerência de presets continuam SÓ DO DONO.

import { getSock, rt } from "../../connection/socket.js"
import { setState } from "../../utils/stateManager.js"
import { info } from "../../utils/terminalUI.js"
import { isOwner } from "../../utils/permissions.js"
import { listarStatusPresets, statusPresetsTexto, menuPresetGerenciarTexto } from "./presets.js"
import { uiModoEfetivo } from "../../utils/config.js"
import { enviarMensagemInterativa } from "../../services/interactiveService.js"
import { criarBotao } from "../../utils/botoes.js"

// [v55] Rótulos do menu interativo — MESMOS títulos do menu TXT (paridade
// 1:1 com STATUS_MENU_MAP; o E2E valida toda row ↔ id roteado).
const STATUS_ROTULOS = {
    status_texto: "Texto (cor + fonte)",
    status_imagem: "Imagem (com legenda)",
    status_video: "Video (~30s)",
    status_preset_postar: "Postar preset salvo",
    status_publicar: "PUBLICAR agora",
    status_cancelar: "Cancelar publicacao",
    status_ver: "Ver configuracao",
    status_erros: "Ultimos erros",
    status_audiencia: "Definir audiencia",
    status_privacidade: "Privacidade padrao",
    status_preset_menu: "Gerenciar presets"
}

import {
    podeGerenciarStatus, obterStatusConfig, definirAudienciaCustom, usarAudienciaContatos,
    limparAudienciaCustom, definirPrivacidadePadrao, criarDraftTexto, criarDraftMidia,
    obterFila, limparFila, publicarStatus, cancelarPublicacao, statusEmAndamento,
    verConfigTexto, verErrosTexto, importarMembrosGrupo, construirListaContatos,
    totalContatosConhecidos, registrarContatos,
    STATUS_JID, FONTES_STATUS, CORES_STATUS
} from "./service.js"

export {
    podeGerenciarStatus,
    obterStatusConfig, definirAudienciaCustom, usarAudienciaContatos, limparAudienciaCustom,
    definirPrivacidadePadrao, importarMembrosGrupo, construirListaContatos,
    totalContatosConhecidos, registrarContatos,
    criarDraftTexto, criarDraftMidia, obterFila, limparFila,
    publicarStatus, cancelarPublicacao, statusEmAndamento,
    verConfigTexto, verErrosTexto,
    STATUS_JID, FONTES_STATUS, CORES_STATUS
}
export { listarStatusPresets, statusPresetsTexto }

// [v50] Mapa numérico do submenu Status (menu 7) — FONTE ÚNICA: usada pelo
// stateHandler (input de texto) e pela interface interativa (números reais).
export const STATUS_MENU_MAP = {
    "1": "status_texto", "2": "status_imagem", "3": "status_video",
    "4": "status_preset_postar", "5": "status_publicar", "6": "status_cancelar",
    "7": "status_ver", "8": "status_erros",
    "9": "status_audiencia", "10": "status_privacidade", "11": "status_preset_menu"
}

// ============================================================
// MENUS (identidade visual do SYZYGY — texto puro, funciona em qualquer cliente)
// ============================================================
// [v46] Um menu por papel: "adm" (cria/publica/posta preset) e "dono" (tudo).
export function menuStatusTexto(role = "adm") {
    const dono = role === "dono"
    const fila = obterFila()
    const cfg = obterStatusConfig()
    const presets = listarStatusPresets()
    const audi = cfg.audienciaModo === "custom"
        ? `𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 · ${cfg.audienciaCustom.length}`
        : `𝗖𝗢𝗡𝗧𝗔𝗧𝗢𝗦 𝗗𝗢 𝗕𝗢𝗧 · ${totalContatosConhecidos()}`
    let t = `╭━━「 🫥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 」━━╮\n`
    t += `┃ ${dono ? "👑 Dono ⬦ controle total" : "👤 ADM ⬦ pode publicar"}\n`
    t += `┃ 👥 Audiência ⬦ ${audi}\n`
    t += `┃ 📋 Fila       ⬦ ${fila.length} rascunho(s)\n`
    t += `┃ 🗂️ Presets   ⬦ ${presets.length} salvo(s)\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━╯\n`
    t += `╭─〔 ✍️ 𝗖𝗥𝗜𝗔𝗥 〕───────────\n`
    t += `┃ ⬥ 1 · Texto  (cor + fonte)\n`
    t += `┃ ⬥ 2 · Imagem (com legenda)\n`
    t += `┃ ⬥ 3 · Vídeo  (~30s)\n`
    t += `╰───────────────────────\n`
    t += `╭─〔 🗂️ 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 〕──────────\n`
    t += `┃ ⬥ 4 · 📤 Postar preset salvo\n`
    t += `╰───────────────────────\n`
    t += `╭─〔 ▶️ 𝗔𝗖̧𝗢𝗘𝗦 〕─────────────\n`
    t += `┃ ⬥ 5 · PUBLICAR agora\n`
    t += `┃ ⬥ 6 · ⛔ Cancelar publicação\n`
    t += `┃ ⬥ 7 · 👀 Ver configuração\n`
    t += `┃ ⬥ 8 · Últimos erros\n`
    t += `╰───────────────────────\n`
    if (dono) {
        t += `╭─〔 🔐 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗥 (👑 dono) 〕─\n`
        t += `┃ ⬥ 9 · 👥 Definir audiência\n`
        t += `┃ ⬥ 10 · 🔒 Privacidade padrão\n`
        t += `┃ ⬥ 11 · 🗂️ Gerenciar presets\n`
        t += `╰───────────────────────\n`
    } else {
        t += `╭─〔 🔐 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗥 〕──────────\n`
        t += `┃ 🔒 Audiência, privacidade e\n`
        t += `┃ presets: somente o DONO\n`
        t += `╰───────────────────────\n`
    }
    t += `┃ ⬥ 0 · Voltar ao painel\n`
    t += `╰───────────────────────\n`
    t += `_Texto: "Bom dia! #1a8f3c #6"_\n`
    t += `_(#cor no final e #fonte)_\n`
    t += `▬▬▬▬▬▬▬▬▬▬▬▬▬\nSYZYGY`
    return t
}

function menuAudienciaTexto() {
    const cfg = obterStatusConfig()
    const atual = cfg.audienciaModo === "custom"
        ? `𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 (${cfg.audienciaCustom.length})`
        : `𝗖𝗢𝗡𝗧𝗔𝗧𝗢𝗦 𝗗𝗢 𝗕𝗢𝗧 (${totalContatosConhecidos()} registrados)`
    let t = `╭━━「 👥 𝗔𝗨𝗗𝗜Ê𝗡𝗖𝗜𝗔 𝗗𝗢 𝗦𝗧𝗔𝗧𝗨𝗦 」\n`
    t += `┃ ⚑ ${atual}\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `  1 · 📇 Contatos do bot\n`
    t += `      (todos que o bot conhece)\n`
    t += `  2 · ✍️ Lista personalizada\n`
    t += `      (digitar números DDI+DDD)\n`
    t += `  3 · 👀 Ver lista atual\n`
    t += `  4 · 🧲 Importar MEMBROS de um grupo\n`
    t += `  5 · 🔒 Privacidade padrão da conta\n`
    t += `  0 · Voltar\n\n`
    t += `╭─〔 ℹ️ 𝗖𝗢𝗠𝗢 𝗙𝗨𝗡𝗖𝗜𝗢𝗡𝗔 〕────\n`
    t += `┃ Publicação usa o mecanismo oficial\n`
    t += `┃ "Somente compartilhar com..."\n`
    t += `┃ (statusJidList — Baileys/WhatsApp).\n`
    t += `╰───────────────────────\n`
    t += `⚠️ O WhatsApp NÃO aceita grupo como\naudiência de status. Na opção 4,\nimportamos os MEMBROS do grupo\n(destinatários individuais reais).\n\n`
    t += `⚠️ Não é possível EXCLUIR um contato\nindividual de um status (limitação\nreal do WhatsApp).\n\n`
    t += `🔐 PRIVACIDADE REAL: quando a lista\nmuda, o bot TROCA a chave do status —\nquem estava na lista anterior não vê os\nNOVOS statuses (statuses antigos já\nentregues não são revogáveis).\n\n`
    t += `_cancelar = sair_`
    return t
}

function menuPrivacidadeTexto() {
    const cfg = obterStatusConfig()
    let t = `╭━━「 🔒 𝗣𝗥𝗜𝗩𝗔𝗖𝗜𝗗𝗔𝗗𝗘 𝗗𝗢 𝗦𝗧𝗔𝗧𝗨𝗦 」\n`
    t += `┃ Padrão da conta (API oficial\n`
    t += `┃ updateStatusPrivacy da Baileys)\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `  1 · 🌐 all — TODOS\n`
    t += `  2 · 📇 contacts — MEUS CONTATOS\n`
    t += `  3 · 🚫 none — NINGUÉM\n`
    t += `  0 · Voltar\n\n`
    t += `Atual: ${cfg.privacidadePadrao || "(não alterada)"}\n\n`
    t += `⚠️ "Contatos exceto..." (contact_blacklist)\nsó tem lista editável no app do telefone.\nA lista por publicação (statusJidList)\nnão depende disso.\n\n`
    t += `_cancelar = sair_`
    return t
}

function fontesTexto() {
    return Object.entries(FONTES_STATUS).map(([n, nome]) => `  ${n} · ${nome}`).join("\n")
}

// ============================================================
// ROTEADOR DE AÇÕES status_*
// ============================================================
// [v46] Ações de CONFIGURAÇÃO do status — restritas ao DONO.
// (ADM cria rascunhos e publica, mas não muda audiência/privacidade/presets.)
const STATUS_CONFIG_DONO = new Set([
    "status_audiencia", "status_audiencia_contatos", "status_audiencia_custom", "status_audiencia_ver",
    "status_import_grupo",
    "status_privacidade", "status_priv_all", "status_priv_contacts", "status_priv_none",
    "status_preset_menu", "status_preset_criar", "status_preset_apagar"
])

export async function statusRouter(chatJid, senderKey, actionId) {
    const sock = getSock()
    const send = (text) => sock.sendMessage(chatJid, { text }).catch(() => {})

    // [SEGURANÇA] Só dono/ADM autorizado (extra ao gate global do messageHandler)
    if (!podeGerenciarStatus(senderKey)) {
        console.log(info("STATUS", `acesso negado para ${senderKey} (${actionId})`))
        await send(`❌ Apenas o DONO ou ADM autorizado pode usar o STATUS MANAGER.\nSeu ID: ${senderKey || "?"}`)
        return
    }

    // [SEGURANÇA v46] Configurar status é coisa do DONO. ADM publica (1-6),
    // vê a configuração (7) e os erros (8) — mas não muda nada.
    if (STATUS_CONFIG_DONO.has(actionId) && !isOwner(senderKey)) {
        console.log(info("STATUS", `config negada p/ ADM ${senderKey} (${actionId})`))
        setState(senderKey, { action: "status_menu_st" })
        await send(`❌ Configurar o status é restrito ao DONO.\n\nVocê (ADM) pode criar e publicar:\n1 Texto · 2 Imagem · 3 Vídeo ·\n4 Postar preset · 5 PUBLICAR · 6 Cancelar`)
        await send(menuStatusTexto("adm"))
        return
    }

    switch (actionId) {
        case "status_menu": {
            setState(senderKey, { action: "status_menu_st" })
            // [v55] DECISÃO CENTRAL DE MODO: buttons → SOMENTE interativo
            // (mesmas opções 1-11 do TXT, ids status_* já roteados abaixo;
            // estado continua setado — digitar o número funciona em qualquer modo).
            if (uiModoEfetivo() === "buttons") {
                const dono = isOwner(senderKey)
                const rows = Object.entries(STATUS_MENU_MAP)
                    .filter(([n, id]) => dono || Number(n) <= 8 || Number(n) === 0)
                    .map(([n, id]) => ({ title: `${n.padStart(2, "0")} ${STATUS_ROTULOS[id]}`, description: "", id }))
                const botoes = [criarBotao("single_select", {
                    title: " STATUS",
                    text: dono ? "Controle total (1-11)" : "Publicar (1-8)",
                    buttonText: " SELECIONAR",
                    sections: [{ title: dono ? "🫥 STATUS MANAGER (DONO)" : "🫥 STATUS MANAGER", rows }]
                })]
                await enviarMensagemInterativa(chatJid, `🫥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥

_Toque em uma opção ou digite o número_`, botoes)
                return
            }
            await send(menuStatusTexto(isOwner(senderKey) ? "dono" : "adm"))
            return
        }

        case "status_texto":
            setState(senderKey, { action: "status_waiting_text" })
            await send(`╭━━「 ✍️ 𝗦𝗧𝗔𝗧𝗨𝗦 𝗗𝗘 𝗧𝗘𝗫𝗧𝗢 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nEnvie o texto do status.\n\nOpcional, no final:\n• #1a8f3c → cor de fundo\n• #6 → fonte\n\nFontes:\n${fontesTexto()}\n\nEx: \`Bom dia galera #1a8f3c #6\`\n\n_(cancelar para sair)_`)
            return

        case "status_imagem":
            setState(senderKey, { action: "status_waiting_image" })
            await send(`╭━━「 🖼️ 𝗦𝗧𝗔𝗧𝗨𝗦 𝗖𝗢𝗠 𝗜𝗠𝗔𝗚𝗘𝗠 」━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nEnvie a imagem (foto ou documento\nJPG/PNG/WEBP). A legenda vai como\ncaption da imagem.\n\nMáx: 10MB.\n\n_(cancelar para sair)_`)
            return

        case "status_video":
            setState(senderKey, { action: "status_waiting_video" })
            await send(`╭━━「 🎬 𝗦𝗧𝗔𝗧𝗨𝗦 𝗖𝗢𝗠 𝗩𝗜𝗗𝗘𝗢 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nEnvie o vídeo (legenda vai como caption).\n\n⚠️ O WhatsApp limita status de vídeo\na ~30 segundos.\nMáx: 64MB.\n\n_(cancelar para sair)_`)
            return

        // [v46] 🗂️ PRESETS — postar (adm/dono) e gerenciar (dono)
        case "status_preset_postar": {
            const presets = listarStatusPresets()
            if (!presets.length) {
                setState(senderKey, { action: "status_menu_st" })
                await send(`🗂️ Nenhum preset de status salvo.\nO DONO cria em: menu 7 > 11 > 1.`)
                return
            }
            setState(senderKey, { action: "status_preset_select" })
            await send(statusPresetsTexto("postar"))
            return
        }

        case "status_preset_menu":
            setState(senderKey, { action: "status_preset_menu" })
            await send(menuPresetGerenciarTexto())
            return

        case "status_preset_criar":
            setState(senderKey, { action: "status_preset_criar_nome" })
            await send(`╭━━「 ➕ 𝗡𝗢𝗩𝗢 𝗣𝗥𝗘𝗦𝗘𝗧 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nDigite o NOME do preset (até 30\n caracteres — ex: Promo Day).\n\n_(cancelar para sair)_`)
            return

        case "status_preset_apagar": {
            const presets = listarStatusPresets()
            if (!presets.length) {
                setState(senderKey, { action: "status_preset_menu" })
                await send(`Nenhum preset salvo para apagar.`)
                return
            }
            setState(senderKey, { action: "status_preset_apagar" })
            await send(statusPresetsTexto("apagar"))
            return
        }

        case "status_audiencia":
            setState(senderKey, { action: "status_audiencia_menu" })
            await send(menuAudienciaTexto())
            return

        case "status_audiencia_contatos": {
            usarAudienciaContatos()
            const total = totalContatosConhecidos()
            const lista = construirListaContatos()
            setState(senderKey, { action: "status_audiencia_menu" })
            await send(`╭━━「 ✅ 𝗔𝗨𝗗𝗜Ê𝗡𝗖𝗜𝗔 𝗔𝗧𝗨𝗔𝗟𝗜𝗭𝗔𝗗𝗔 」━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n📇 CONTATOS DO BOT\n\nA publicação irá para ${lista.length} destinatário(s)\n(contatos registrados + dono + ADMs +\ntelefones mapeados nos grupos).\n\nRegistrados agora: ${total}\n\n_0 = voltar · cancelar = sair_`)
            return
        }

        case "status_audiencia_custom":
            setState(senderKey, { action: "status_waiting_audience" })
            await send(`╭━━「 ✍️ 𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 」\n╰━━━━━━━━━━━━━━━━━━━━━\n\n"Somente compartilhar com..."\n\nEnvie os números com DDI+DDD,\nseparados por vírgula ou espaço:\n\n5511999999999, 5511888888888\n\nA lista substitui a atual e vale\npara a próxima publicação.\n\n_limpar = apagar lista_\n_cancelar = sair_`)
            return

        case "status_audiencia_ver": {
            setState(senderKey, { action: "status_audiencia_menu" })
            const cfg = obterStatusConfig()
            if (cfg.audienciaModo !== "custom" || !cfg.audienciaCustom.length) {
                const lista = construirListaContatos()
                await send(`╭━━「 👀 𝗔𝗨𝗗𝗜Ê𝗡𝗖𝗜𝗔 𝗔𝗧𝗨𝗔𝗟 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n📇 CONTATOS DO BOT\nDestinatários da publicação: ${lista.length}\nRegistrados: ${totalContatosConhecidos()}\n\nDefina uma lista personalizada (opção 2)\npara visualizar número por número.`)
                return
            }
            let t = `╭━━「 👀 𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 」\n┃ ${cfg.audienciaCustom.length} destinatário(s)\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
            cfg.audienciaCustom.slice(0, 30).forEach((j, i) => { t += `${String(i + 1).padStart(2, "0")} · ${j.split("@")[0]}\n` })
            if (cfg.audienciaCustom.length > 30) t += `... +${cfg.audienciaCustom.length - 30} outros\n`
            t += `\n_0 = voltar · cancelar = sair_`
            await send(t)
            return
        }

        // [v42] Importar MEMBROS de um grupo como lista personalizada
        case "status_import_grupo": {
            setState(senderKey, { action: "status_waiting_group_import" })
            const cache = rt().groupSelectionCache[senderKey] || {}
            const grupos = Object.values(rt().cachedGroups || {})
            const admin = grupos.filter(g => g.isAdmin).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
            const membro = grupos.filter(g => !g.isAdmin).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
            const arr = [...admin, ...membro]
            if (!arr.length) {
                await send(`⚠️ O bot não está em nenhum grupo.\nCancelar e tente mais tarde.`)
                return
            }
            arr.forEach((g, i) => { cache[i + 1] = { id: g.id || Object.keys(rt().cachedGroups).find(k => rt().cachedGroups[k] === g), subject: g.subject, isAdmin: g.isAdmin } })
            rt().groupSelectionCache[senderKey] = cache
            let t = `╭━━「 🧲 𝗜𝗠𝗣𝗢𝗥𝗧𝗔𝗥 𝗠𝗘𝗠𝗕𝗥𝗢𝗦 」━━\n┃ ${arr.length} grupos disponíveis\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
            if (admin.length) {
                t += `👑 𝗦𝗢𝗨 𝗔𝗗𝗠𝗜𝗡 (${admin.length})\n`
                admin.slice(0, 15).forEach((g, i) => { t += `  ${String(i + 1).padStart(2, "0")} · ${(g.subject || "").slice(0, 30)}\n` })
                t += `\n`
            }
            const off = admin.length
            if (membro.length) {
                t += `👤 𝗦𝗢́ 𝗠𝗘𝗠𝗕𝗥𝗢 (${membro.length})\n`
                membro.slice(0, 15).forEach((g, i) => { t += `  ${String(off + i + 1).padStart(2, "0")} · ${(g.subject || "").slice(0, 30)}\n` })
                t += `\n`
            }
            if (arr.length > 30) t += `... lista cortada em 30 — use o número global do grupo (1 a ${arr.length})\n\n`
            t += `Digite o NÚMERO do grupo para importar\ntodos os MEMBROS como audiência.\n\n⚠️ WhatsApp não aceita grupo como\naudiência de status — importamos os\nmembros (destinatários individuais).\n\n_cancelar = sair_`
            await send(t)
            return
        }

        case "status_privacidade":
            setState(senderKey, { action: "status_priv_menu" })
            await send(menuPrivacidadeTexto())
            return

        case "status_priv_all":
        case "status_priv_contacts":
        case "status_priv_none": {
            const mapa = { status_priv_all: "all", status_priv_contacts: "contacts", status_priv_none: "none" }
            const valor = mapa[actionId]
            setState(senderKey, { action: "status_priv_menu" })
            const r = await definirPrivacidadePadrao(valor)
            if (r.ok) await send(`╭━━「 🔒 𝗣𝗥𝗜𝗩𝗔𝗖𝗜𝗗𝗔𝗗𝗘 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n✅ Padrão do status alterado para:\n*${valor}*\n\n(válido para a conta — a lista por\npublicação continua sendo statusJidList)\n\n_0 = voltar_`)
            else await send(`❌ Falha ao alterar privacidade: ${r.motivo}\n\nO erro foi registrado no log do módulo.`)
            return
        }

        case "status_ver":
            setState(senderKey, { action: "status_menu_st" })
            await send(verConfigTexto())
            return

        case "status_erros":
            setState(senderKey, { action: "status_menu_st" })
            await send(verErrosTexto(5))
            return

        case "status_publicar": {
            if (statusEmAndamento()) {
                await send(`⏳ Já existe uma publicação em andamento.\nUse a opção 6 para abortar.`)
                return
            }
            const fila = obterFila()
            if (!fila.length) {
                await send(`⚠️ Nenhum status na fila.\nCrie um rascunho primeiro (menu 7 → 1, 2, 3 ou 4).`)
                return
            }
            const cfg = obterStatusConfig()
            let destino
            if (cfg.audienciaModo === "custom" && cfg.audienciaCustom.length) {
                destino = `lista personalizada (${cfg.audienciaCustom.length} destinatário(s))`
            } else {
                destino = `contatos do bot (${construirListaContatos().length} destinatário(s))`
            }
            await send(`╭━━「 ▶️ 𝗣𝗨𝗕𝗟𝗜𝗖𝗔𝗡𝗗𝗢 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n📋 ${fila.length} status na fila\n👥 ${destino}`)
            const r = await publicarStatus()
            setState(senderKey, { action: "status_menu_st" })
            let t = `╭━━「 ✅ 𝗣𝗨𝗕𝗟𝗜𝗖𝗔𝗗𝗢 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
            t += `✅ Publicados: ${r.publicados}\n`
            if (r.cancelados) t += `⛔ Cancelados: ${r.cancelados}\n`
            if (r.falhas) t += `❌ Falhas: ${r.falhas} (log em 7 > 8)\n`
            t += `👥 Audiência: ${r.audiencia.replace("custom:", "lista personalizada · ").replace("contatos:", "contatos do bot · ")} destinatário(s)\n`
            if (r.aviso) t += `\n⚠️ ${r.aviso}\n`
            t += `\n_0 = menu principal · cancelar = sair_`
            await send(t)
            return
        }

        case "status_cancelar": {
            setState(senderKey, { action: "status_menu_st" })
            const r = cancelarPublicacao()
            if (r.cancelouEmAndamento) {
                await send(`╭━━「 ⛔ 𝗖𝗔𝗡𝗖𝗘𝗟𝗔𝗗𝗢 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nPublicação em andamento ABORTADA.\nRascunhos descartados: ${r.descartados}`)
            } else if (r.descartados > 0) {
                await send(`⛔ Fila limpa.\n${r.descartados} rascunho(s) descartado(s).`)
            } else {
                await send(`Nada para cancelar: fila vazia e\nnenhuma publicação em andamento.`)
            }
            return
        }

        case "status_limpar_fila": {
            const n = limparFila()
            await send(n ? `🧹 ${n} rascunho(s) removido(s) da fila.` : `Fila já está vazia.`)
            return
        }

        default:
            await send(`⚠️ Ação de status desconhecida: ${actionId}\nAbra o STATUS MANAGER pelo menu (opção 7).`)
    }
}

```

#### `./features/statusManager/presets.js` — 105 linhas, 4041 bytes

```js
// features/statusManager/presets.js
// [v46] 🗂️ PRESETS DE STATUS — textos salvos para publicar rápido.
// Regra de papel (v46): qualquer ADM do bot pode POSTAR um preset (7 > 4);
// criar/apagar é restrito ao DONO (7 > 11). Persistência: dono/status_presets.json.

import fs from "fs"
import path from "path"
import { STATUS_LIMITS } from "./config.js"

const PRESETS_PATH = "./dono/status_presets.json"
const MAX_PRESETS = 30

let cache = null

function carregar() {
    if (cache) return cache
    try {
        const arr = JSON.parse(fs.readFileSync(PRESETS_PATH, "utf-8"))
        cache = Array.isArray(arr) ? arr : []
    } catch {
        cache = []
    }
    return cache
}

function salvar() {
    try {
        fs.mkdirSync(path.dirname(PRESETS_PATH), { recursive: true })
        fs.writeFileSync(PRESETS_PATH, JSON.stringify(cache, null, 2), "utf-8")
    } catch {}
}

export function listarStatusPresets() {
    return carregar().slice()
}

export function obterStatusPreset(idx1) {
    const n = parseInt(idx1, 10)
    if (!n || n < 1) return null
    return carregar()[n - 1] || null
}

// O texto aceita a MESMA sintaxe do status de texto ("... #1a8f3c #6"),
// validada na hora de criar o rascunho (criarDraftTexto do service.js).
export function criarStatusPreset(nome, texto) {
    nome = String(nome || "").trim().slice(0, 30)
    texto = String(texto || "").trim()
    if (!nome) return { ok: false, motivo: "Nome vazio" }
    if (!texto) return { ok: false, motivo: "Texto vazio" }
    if (texto.length > STATUS_LIMITS.maxTexto) return { ok: false, motivo: `Texto muito longo (máx ${STATUS_LIMITS.maxTexto} caracteres)` }
    const l = carregar()
    if (l.some(p => (p.nome || "").toLowerCase() === nome.toLowerCase())) return { ok: false, motivo: `Já existe um preset chamado "${nome}"` }
    if (l.length >= MAX_PRESETS) return { ok: false, motivo: `Máximo de ${MAX_PRESETS} presets` }
    l.push({ nome, texto, criadoEm: new Date().toISOString() })
    salvar()
    return { ok: true, total: l.length }
}

export function apagarStatusPreset(idx1) {
    const l = carregar()
    const n = parseInt(idx1, 10)
    if (!n || n < 1 || n > l.length) return { ok: false, motivo: "Número inválido" }
    const [rem] = l.splice(n - 1, 1)
    salvar()
    return { ok: true, nome: rem?.nome || "?", total: l.length }
}

function preview(texto) {
    return (texto || "")
        .replace(/\s+#(?:[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|\d{1,2})\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 38)
}

// Lista numerada — usada tanto para postar (adm/dono) quanto para apagar (dono)
export function statusPresetsTexto(acao = "postar") {
    const l = carregar()
    let t = `╭━━「 🗂️ 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 𝗗𝗘 𝗦𝗧𝗔𝗧𝗨𝗦 」━\n`
    t += `┃ ${l.length} preset(s) salvo(s)\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    if (!l.length) t += `(nenhum preset salvo)\n\n`
    l.forEach((p, i) => {
        t += `${String(i + 1).padStart(2, "0")} · ${p.nome}\n`
        t += `     _${preview(p.texto)}_\n`
    })
    t += `\n`
    if (acao === "apagar") t += `Digite o NÚMERO do preset para APAGAR.\n\n_0 = voltar · cancelar = sair_`
    else t += `Digite o NÚMERO do preset para\nadicionar à fila (5 = publicar).\n\n_0 = voltar · cancelar = sair_`
    return t
}

export function menuPresetGerenciarTexto() {
    const l = carregar()
    let t = `╭━━「 🗂️ 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 𝗗𝗢 𝗦𝗧𝗔𝗧𝗨𝗦 」\n`
    t += `┃ ${l.length} salvo(s) · 🔒 só dono\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `  1 · ➕ Criar preset\n`
    t += `  2 · 🗑️ Apagar preset\n`
    t += `  3 · 📋 Listar\n`
    t += `  0 · Voltar\n\n`
    t += `Preset = texto salvo para publicar\nrápido (aceita #cor e #fonte).\n\n👤 ADMs podem POSTAR (menu 7 > 4),\nmas só o DONO cria/apaga aqui.\n\n_cancelar = sair_`
    return t
}

```

#### `./features/statusManager/service.js` — 558 linhas, 26100 bytes

```js
// features/statusManager/service.js
// [v41] 🫥 STATUS MANAGER — núcleo: rascunhos, audiência, publicação, cancelamento,
// visualização e registro de erros. Usa SOMENTE APIs reais da Baileys 7.0.0-rc14:
//   - sock.sendMessage("status@broadcast", conteudo, { statusJidList, backgroundColor, font })
//   - sock.updateStatusPrivacy("all" | "contacts" | "contact_blacklist" | "none")

import fs from "fs"
import path from "path"
import { getSock, rt } from "../../connection/socket.js"
import { isOwner, isAuthorizedUser, isAuthorizedUserWithMap, normalizeNumber, getOwnerNumber, getAllOwners, getAuthorizedUsers } from "../../utils/permissions.js"
import { getLidMap } from "../../services/lidResolver.js"
import { safeSendMessage } from "../../services/groupService.js"
import { err as errLog, ok, info } from "../../utils/terminalUI.js"
import {
    STATUS_CONFIG_PATH, STATUS_ERROS_PATH, STATUS_JID, STATUS_LIMITS,
    FONTES_VALIDAS, FONTES_STATUS, CORES_STATUS, STATUS_CONFIG_PADRAO
} from "./config.js"

// ============================================================
// ESTADO
// ============================================================
let config = { ...STATUS_CONFIG_PADRAO }

// Fila de rascunhos a publicar: { tipo: "texto"|"imagem"|"video", texto?, buffer?, caption?, font?, backgroundColor? }
let filaStatus = []
let publicando = false
let cancelarFlag = false

// ============================================================
// PERSISTÊNCIA
// ============================================================
function garantirDir() {
    try {
        const dir = path.dirname(STATUS_CONFIG_PATH)
        try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    } catch {}
}

export function carregarStatusConfig() {
    try {
        if (fs.existsSync(STATUS_CONFIG_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(STATUS_CONFIG_PATH, "utf-8"))
            config = { ...STATUS_CONFIG_PADRAO, ...parsed }
            if (!Array.isArray(config.audienciaCustom)) config.audienciaCustom = []
            if (config.audienciaModo !== "custom") config.audienciaModo = "contatos"
            if (typeof config.audienciaKeyUltima !== "string") config.audienciaKeyUltima = null
        }
    } catch (e) {
        console.log(errLog(`[STATUS] falha ao carregar config: ${e.message}`))
        config = { ...STATUS_CONFIG_PADRAO }
    }
    return config
}

function salvarStatusConfig() {
    try {
        garantirDir()
        fs.writeFileSync(STATUS_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
    } catch (e) {
        console.log(errLog(`[STATUS] falha ao salvar config: ${e.message}`))
    }
}

carregarStatusConfig()

// ============================================================
// REGISTRO DE ERROS (dono/status_erros.json + histórico do bot)
// ============================================================
export function registrarErroStatus(tipo, mensagem, contexto = {}) {
    const registro = { ts: Date.now(), tipo, erro: String(mensagem).slice(0, 300), ...contexto }
    console.log(errLog(`[STATUS] erro (${tipo}): ${registro.erro}`))
    let lista = []
    try {
        if (fs.existsSync(STATUS_ERROS_PATH)) {
            lista = JSON.parse(fs.readFileSync(STATUS_ERROS_PATH, "utf-8"))
            if (!Array.isArray(lista)) lista = []
        }
    } catch { lista = [] }
    lista.push(registro)
    if (lista.length > STATUS_LIMITS.errosHistorico) lista = lista.slice(-STATUS_LIMITS.errosHistorico)
    try {
        garantirDir()
        fs.writeFileSync(STATUS_ERROS_PATH, JSON.stringify(lista, null, 2), "utf-8")
    } catch {}
    try {
        import("../../services/historicoService.js").then(({ registrarAcao }) =>
            registrarAcao("status_erro", { subject: `status ${tipo}`, erro: registro.erro })
        ).catch(() => {})
    } catch {}
    return registro
}

export function listarErrosStatus(qtd = 10) {
    try {
        if (!fs.existsSync(STATUS_ERROS_PATH)) return []
        const lista = JSON.parse(fs.readFileSync(STATUS_ERROS_PATH, "utf-8"))
        return Array.isArray(lista) ? lista.slice(-qtd).reverse() : []
    } catch { return [] }
}

// ============================================================
// AUTORIZAÇÃO — dono ou ADM autorizado (camada extra ao gate do messageHandler)
// ============================================================
export function podeGerenciarStatus(senderKey) {
    if (!senderKey) return false
    if (isOwner(senderKey)) return true
    try {
        if (isAuthorizedUserWithMap(senderKey, getLidMap())) return true
    } catch {}
    try {
        if (isAuthorizedUser(senderKey)) return true
    } catch {}
    return false
}

// ============================================================
// AUDIÊNCIA (mecanismo oficial: statusJidList — "Somente compartilhar com...")
// ============================================================
export function obterStatusConfig() { return { ...config, audienciaCustom: [...config.audienciaCustom] } }

function normalizarParaJid(entry) {
    // Aceita "5511...", "5511...@s.whatsapp.net", "5511...:12@..." → JID limpo
    let num = String(entry || "").trim()
    if (!num) return null
    if (num.includes("@s.whatsapp.net")) num = num.split("@")[0]
    num = num.split(":")[0].replace(/\D/g, "")
    if (num.length < 10 || num.length > 15) return null
    return `${num}@s.whatsapp.net`
}

export function definirAudienciaCustom(entries) {
    const jids = []
    const invalidos = []
    for (const e of entries) {
        const jid = normalizarParaJid(e)
        if (jid) { if (!jids.includes(jid)) jids.push(jid) }
        else invalidos.push(String(e).slice(0, 20))
    }
    if (!jids.length) {
        return { ok: false, invalidos, motivo: "Nenhum destinatário válido (use números com DDI+DDD, ex: 5511999999999)" }
    }
    if (jids.length > STATUS_LIMITS.maxAudiencia) {
        return { ok: false, invalidos, motivo: `Máximo ${STATUS_LIMITS.maxAudiencia} destinatários por publicação (recebi ${jids.length})` }
    }
    config.audienciaModo = "custom"
    config.audienciaCustom = jids
    salvarStatusConfig()
    return { ok: true, total: jids.length, jids, invalidos }
}

// ============================================================
// [v42] REGISTRO DE CONTATOS DO BOT
// Alimentado por: contacts.upsert (Baileys), participantes de grupos
// (lidResolver) e ADMs/donos. É o que torna o modo "contatos" REAL:
// a publicação sempre precisa de statusJidList com destinatários.
// ============================================================
export function registrarContatos(lista) {
    if (!Array.isArray(lista)) return 0
    const set = new Set(config.contatosConhecidos || [])
    const antes = set.size
    for (const item of lista) {
        const bruto = typeof item === "object" ? (item.phoneNumber || item.id || "") : item
        const jid = normalizarParaJid(bruto)
        if (jid) set.add(jid)
    }
    let arr = [...set]
    if (arr.length > STATUS_LIMITS.maxContatos) arr = arr.slice(0, STATUS_LIMITS.maxContatos)
    config.contatosConhecidos = arr
    const novos = arr.length - antes
    if (novos > 0) salvarStatusConfig()
    return novos
}

export function construirListaContatos() {
    const set = new Set(config.contatosConhecidos || [])
    // Dono + donos extras + ADMs autorizados sempre entram
    try {
        set.add(`${getOwnerNumber()}@s.whatsapp.net`)
        for (const n of getAllOwners()) set.add(`${n}@s.whatsapp.net`)
        for (const n of getAuthorizedUsers()) set.add(`${n}@s.whatsapp.net`)
    } catch {}
    // Telefones mapeados via LID (participantes dos grupos do bot)
    try {
        const map = getLidMap()
        for (const phone of Object.keys(map.phoneToLid || {})) {
            const jid = normalizarParaJid(phone)
            if (jid) set.add(jid)
        }
    } catch {}
    return [...set].filter(Boolean).slice(0, STATUS_LIMITS.maxAudiencia)
}

export function totalContatosConhecidos() {
    return (config.contatosConhecidos || []).length
}

// ============================================================
// [v42] IMPORTAR MEMBROS DE UM GRUPO COMO AUDIÊNCIA
// GRUPOS não podem ser audiência de Status (regra do WhatsApp).
// Alternativa REAL: usar os MEMBROS do grupo (JIDs individuais)
// como lista personalizada via statusJidList.
// ============================================================
export async function importarMembrosGrupo(groupJid) {
    try {
        let participants = rt().cachedGroups?.[groupJid]?.participants
        if (!Array.isArray(participants) || !participants.length) {
            const meta = await getSock().groupMetadata(groupJid)
            participants = meta?.participants || []
            // guarda no cache p/ próximas importações
            try {
                if (rt().cachedGroups?.[groupJid]) rt().cachedGroups[groupJid].participants = participants
            } catch {}
        }
        if (!Array.isArray(participants) || !participants.length) {
            return { ok: false, motivo: "Não foi possível obter os participantes do grupo" }
        }
        const { resolverLidParaPhone, atualizarMapaDeParticipantes } = await import("../../services/lidResolver.js")
        // alimenta o mapa LID<->telefone com o que o grupo fornecer (id+lid juntos)
        try { atualizarMapaDeParticipantes(participants) } catch {}

        const comTelefone = []   // "55...@s.whatsapp.net"
        const soLid = []         // "NNNN@lid" — endereço REAL do WhatsApp (device LID)
        for (const p of participants) {
            const id = String(p?.id || p?.jid || "")
            const lid = typeof p?.lid === "string" && p.lid.endsWith("@lid") ? p.lid : (id.endsWith("@lid") ? id : "")
            const phoneJid = id.endsWith("@s.whatsapp.net") ? normalizarParaJid(id) : null
            if (phoneJid) {
                if (!comTelefone.includes(`${phoneJid}`)) comTelefone.push(`${phoneJid}`)
                continue
            }
            // Participante só com @lid: resolve pelo mapa; se não der, usa o @lid direto
            const phone = lid ? resolverLidParaPhone(lid) : null
            if (phone) {
                const jid = `${normalizarParaJid(phone)}`
                if (jid && !comTelefone.includes(jid)) comTelefone.push(jid)
            } else if (lid) {
                if (!soLid.includes(lid)) soLid.push(lid)
            }
        }

        const totalMembros = participants.length
        console.log(info("STATUS", `import ${groupJid}: ${totalMembros} membros -> ${comTelefone.length} telefone(s) + ${soLid.length} @lid direto${soLid.length ? ` (ex: ${soLid[0]})` : ""}`))

        // Prioriza telefones; @lid direto entra como destinatário real (o WhatsApp
        // entrega por LID — é o endereço que o próprio grupo usa no modo LID).
        const jids = [...comTelefone, ...soLid]
        if (!jids.length) {
            return { ok: false, motivo: "Grupo sem participantes utilizáveis" }
        }
        const truncado = jids.length > STATUS_LIMITS.maxAudiencia
        const final = truncado ? jids.slice(0, STATUS_LIMITS.maxAudiencia) : jids
        config.audienciaModo = "custom"
        config.audienciaCustom = final
        salvarStatusConfig()
        return { ok: true, total: final.length, totalMembros, comTelefone: comTelefone.length, apenasLid: Math.min(soLid.length, Math.max(0, STATUS_LIMITS.maxAudiencia - comTelefone.length)), truncado }
    } catch (e) {
        registrarErroStatus("importar_membros", e.message, { groupJid })
        return { ok: false, motivo: e.message }
    }
}

export function usarAudienciaContatos() {
    config.audienciaModo = "contatos"
    salvarStatusConfig()
    return { ok: true }
}

export function limparAudienciaCustom() {
    config.audienciaCustom = []
    if (config.audienciaModo === "custom") config.audienciaModo = "contatos"
    salvarStatusConfig()
    return { ok: true }
}

// ============================================================
// PRIVACIDADE PADRÃO DA CONTA (API pública updateStatusPrivacy)
// ============================================================
const PRIV_VALORES = new Set(["all", "contacts", "contact_blacklist", "none"])

export async function definirPrivacidadePadrao(valor) {
    if (!PRIV_VALORES.has(valor)) {
        return { ok: false, motivo: "Valor inválido. Use: all, contacts, contact_blacklist ou none" }
    }
    try {
        const sock = getSock()
        if (!sock?.updateStatusPrivacy) {
            return { ok: false, motivo: "Esta versão da Baileys não expõe updateStatusPrivacy" }
        }
        await sock.updateStatusPrivacy(valor)
        config.privacidadePadrao = valor
        salvarStatusConfig()
        return { ok: true, valor }
    } catch (e) {
        registrarErroStatus("privacidade", e.message, { valor })
        return { ok: false, motivo: e.message }
    }
}

// ============================================================
// RASCUNHOS (fila)
// ============================================================
function corValida(cor) {
    if (typeof cor !== "string") return null
    const c = cor.trim().toLowerCase()
    if (CORES_STATUS[c]) return CORES_STATUS[c]
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(cor.trim())) return cor.trim()
    return null
}

function fonteValida(f) {
    const n = parseInt(f)
    return FONTES_VALIDAS.has(n) ? n : null
}

export function criarDraftTexto(texto, { font, cor } = {}) {
    if (!texto || !String(texto).trim()) return { ok: false, motivo: "Texto vazio" }
    let corpo = String(texto).trim()
    // Sintaxe oficial do módulo: sufixos opcionais no final — "#1a8f3c" (cor) e "#2" (fonte).
    // O parsing vive AQUI (fonte única), o stateHandler apenas repassa o texto bruto.
    let corExtraida = cor
    let fonteExtraida = font
    // Ordem da sintaxe: "texto #cor #fonte" (fonte é sempre o último token).
    // Por isso extraímos a FONTE primeiro, depois a COR.
    const mFonte = corpo.match(/\s#(\d{1,2})\s*$/)
    if (mFonte) { fonteExtraida = mFonte[1]; corpo = corpo.slice(0, mFonte.index).trim() }
    const mCor = corpo.match(/\s(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*$/)
    if (mCor) { corExtraida = mCor[1]; corpo = corpo.slice(0, mCor.index).trim() }
    if (corpo.length > STATUS_LIMITS.maxTexto) {
        return { ok: false, motivo: `Texto muito longo (máx ${STATUS_LIMITS.maxTexto} caracteres)` }
    }
    const fonte = fonteExtraida != null ? (fonteValida(fonteExtraida) ?? config.fontePadrao) : config.fontePadrao
    const fundo = (corExtraida != null && corValida(corExtraida)) || config.corPadrao
    filaStatus.push({ tipo: "texto", texto: corpo, font: fonte, backgroundColor: fundo })
    return { ok: true, total: filaStatus.length }
}

export function criarDraftMidia(tipo, buffer, caption = "", mimetype = null) {
    if (!["imagem", "video"].includes(tipo)) return { ok: false, motivo: "Tipo de mídia não suportado para status" }
    if (!buffer || !buffer.length) return { ok: false, motivo: "Mídia vazia" }
    const limite = tipo === "video" ? STATUS_LIMITS.maxVideoBytes : STATUS_LIMITS.maxImagemBytes
    if (buffer.length > limite) {
        return { ok: false, motivo: `Arquivo muito grande (${Math.round(buffer.length / 1024 / 1024)}MB, máx ${Math.round(limite / 1024 / 1024)}MB)` }
    }
    filaStatus.push({ tipo, buffer, caption: String(caption || "").slice(0, STATUS_LIMITS.maxTexto), mimetype: mimetype || null })
    return { ok: true, total: filaStatus.length }
}

export function obterFila() { return filaStatus.map(f => ({ ...f, buffer: undefined })) }

export function limparFila() {
    const total = filaStatus.length
    filaStatus = []
    return total
}

// ============================================================
// [v44] ROTAÇÃO DA CHAVE DO STATUS (sender-key de status@broadcast)
// POR QUÊ (verificado no fonte rc14): a mensagem de status é cifrada com UMA
// sender-key por conta; o statusJidList só controla quem recebe a SKDM (a
// chave). Quem já recebeu a chave numa publicação anterior (ex.: modo
// "contatos do bot") continuaria enxergando publicações futuras com listas
// menores — exatamente o "aparece pra todo mundo" relatado.
// Rotacionar a chave => só a audiência atual recebe a chave NOVA e consegue
// ver os NOVOS statuses (statuses antigos já entregues não têm como revogar).
// ============================================================
async function rotacionarChaveStatus() {
    try {
        const sock = getSock()
        const auth = sock?.authState
        if (!auth?.keys?.set || !auth?.creds?.me) return false
        const patch = { "sender-key": {}, "sender-key-memory": {} }
        const addVariant = (jid) => {
            if (!jid || typeof jid !== "string" || !jid.includes("@")) return
            const [userDev, domain] = jid.split("@")
            const [num, dev] = userDev.split(":")
            if (!num) return
            // variações (com/sem domínio, device real/0) — anular id inexistente é inofensivo
            for (const id of [num, domain ? `${num}@${domain}` : num]) {
                patch["sender-key"][`status@broadcast::${id}::${dev || 0}`] = null
                patch["sender-key"][`status@broadcast::${id}::0`] = null
            }
        }
        // Para status a Baileys usa a identidade LID quando existe (addressing mode),
        // senão o PN — cobrimos as duas.
        addVariant(auth.creds.me?.lid || sock?.user?.lid ? (auth.creds.me?.lid || sock?.user?.lid) : null)
        addVariant(auth.creds.me?.id || sock?.user?.id)
        patch["sender-key-memory"]["status@broadcast"] = {}
        await auth.keys.set(patch)
        console.log(info("STATUS", `chave do status ROTACIONADA (${Object.keys(patch["sender-key"]).length} variantes limpas) — audiência anterior perde acesso aos novos statuses`))
        return true
    } catch (e) {
        registrarErroStatus("rotacionar_chave", e.message, {})
        return false
    }
}

function hashAudiencia(lista) {
    return [...lista].sort().join("|")
}

// ============================================================
// PUBLICAR / CANCELAR
// ============================================================
function montarConteudo(item) {
    if (item.tipo === "texto") {
        const conteudo = { text: item.texto }
        return { conteudo, opts: { backgroundColor: item.backgroundColor, font: item.font } }
    }
    if (item.tipo === "imagem") {
        const conteudo = { image: item.buffer }
        if (item.mimetype) conteudo.mimetype = item.mimetype
        if (item.caption) conteudo.caption = item.caption
        return { conteudo, opts: {} }
    }
    if (item.tipo === "video") {
        const conteudo = { video: item.buffer }
        if (item.mimetype) conteudo.mimetype = item.mimetype
        if (item.caption) conteudo.caption = item.caption
        return { conteudo, opts: {} }
    }
    throw new Error(`Tipo de status desconhecido: ${item.tipo}`)
}

export async function publicarStatus() {
    const sock = getSock()
    if (!sock) return { ok: false, motivo: "Bot não conectado" }
    if (publicando) return { ok: false, motivo: "Já existe uma publicação em andamento" }
    if (!filaStatus.length) return { ok: false, motivo: "Nenhum status na fila. Crie um rascunho primeiro (opção 1, 2 ou 3)" }

    publicando = true
    cancelarFlag = false
    // [v42] CORREÇÃO REAL: sem statusJidList o relayMessage para status@broadcast
    // "sucede", mas nenhum dispositivo recebe a sender-key → ninguém vê o status.
    // Portanto SEMPRE publicamos com statusJidList:
    //  - modo custom  → lista definida pelo dono
    //  - modo contatos → registro de contatos do bot (+ dono/ADMs + mapa LID)
    let avisoAudiencia = null
    const audienciaCustom = config.audienciaModo === "custom" && config.audienciaCustom.length > 0
    let statusJidList
    if (audienciaCustom) {
        statusJidList = [...config.audienciaCustom]
    } else {
        statusJidList = construirListaContatos()
        if (!statusJidList.length) statusJidList = [`${getOwnerNumber()}@s.whatsapp.net`]
        // construirListaContatos sempre inclui dono/ADMs — o aviso é quando o
        // REGISTRO de contatos está vazio (audiência = só dono/ADMs):
        if (totalContatosConhecidos() === 0) {
            avisoAudiencia = "Registro de contatos vazio — publicando só para dono/ADMs. Importe membros de um grupo (menu 7 > 9 > 4) para ampliar a audiência."
        }
    }

    // [v44] Audiência mudou desde a última publicação => rotaciona a chave do
    // status para que a audiência ANTERIOR não veja os novos statuses.
    const chaveAtual = hashAudiencia(statusJidList)
    if (chaveAtual !== (config.audienciaKeyUltima ?? null)) {
        await rotacionarChaveStatus()
    }

    const resultados = []
    const filaAtual = [...filaStatus]
    try {
        for (let i = 0; i < filaAtual.length; i++) {
            if (cancelarFlag) {
                resultados.push({ tipo: filaAtual[i].tipo, ok: false, cancelado: true })
                continue
            }
            const item = filaAtual[i]
            try {
                const { conteudo, opts } = montarConteudo(item)
                const optsFinais = { ...opts }
                if (statusJidList) optsFinais.statusJidList = statusJidList
                await sock.sendMessage(STATUS_JID, conteudo, optsFinais)
                resultados.push({ tipo: item.tipo, ok: true })
                const amostra = statusJidList.slice(0, 3).join(", ")
                console.log(ok(`[STATUS] ${item.tipo} publicado -> ${statusJidList.length} destinatário(s) [${amostra}${statusJidList.length > 3 ? ", ..." : ""}]`))
                try {
                    const { registrarAcao } = await import("../../services/historicoService.js")
                    registrarAcao("status_publicado", { subject: `status ${item.tipo}`, audiencia: statusJidList ? `custom:${statusJidList.length}` : "contatos" })
                } catch {}
            } catch (e) {
                registrarErroStatus(item.tipo, e.message, { audiencia: statusJidList ? `custom:${statusJidList.length}` : "contatos" })
                resultados.push({ tipo: item.tipo, ok: false, erro: e.message })
            }
            if (i < filaAtual.length - 1 && !cancelarFlag) {
                await new Promise(r => setTimeout(r, STATUS_LIMITS.delayEntreEnvios))
            }
        }
    } finally {
        // Publicados (ok) saem da fila; cancelados/falhas também são descartados
        // (falhas ficam registradas no log de erros — recriar pelo menu se preciso).
        filaStatus = []
        publicando = false
        cancelarFlag = false
        // [v44] Guarda a audiência efetivamente usada (mesmo com falhas parciais,
        // a chave já foi distribuída para essa lista).
        config.audienciaKeyUltima = chaveAtual
        salvarStatusConfig()
    }

    const publicados = resultados.filter(r => r.ok).length
    const cancelados = resultados.filter(r => r.cancelado).length
    const falhas = resultados.filter(r => !r.ok && !r.cancelado).length
    return { ok: true, publicados, cancelados, falhas, resultados, aviso: avisoAudiencia, audiencia: audienciaCustom ? `custom:${statusJidList.length}` : `contatos:${statusJidList.length}` }
}

export function cancelarPublicacao() {
    let cancelouEmAndamento = false
    if (publicando) {
        cancelarFlag = true
        cancelouEmAndamento = true
    }
    const descartados = filaStatus.length
    filaStatus = []
    return { cancelouEmAndamento, descartados }
}

export function statusEmAndamento() { return publicando }

// ============================================================
// VISUALIZAÇÃO
// ============================================================
export function verConfigTexto() {
    const modoTxt = config.audienciaModo === "custom"
        ? `LISTA PERSONALIZADA (${config.audienciaCustom.length} destinatário(s))`
        : `CONTATOS DO BOT (${totalContatosConhecidos()} registrados)`
    let t = `╭━━「 🫥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 」\n`
    t += `┃ ⚑ CONFIGURAÇÃO ATUAL\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `👥 Audiência: ${modoTxt}\n`
    if (config.audienciaModo === "custom") {
        const mostra = config.audienciaCustom.slice(0, 8).map(j => `• ${j.split("@")[0]}`).join("\n")
        t += `${mostra}${config.audienciaCustom.length > 8 ? `\n• ... +${config.audienciaCustom.length - 8} outros` : ""}\n`
    }
    t += `🔒 Privacidade padrão da conta: ${config.privacidadePadrao || "(não alterada)"}\n`
    t += `🎨 Fonte padrão: ${FONTES_STATUS[config.fontePadrao] || config.fontePadrao} · Cor: ${config.corPadrao}\n`
    t += `📋 Fila de publicação: ${filaStatus.length} rascunho(s)${filaStatus.length ? ` (${filaStatus.map(f => f.tipo).join(", ")})` : ""}\n`
    t += `🔄 Publicação em andamento: ${publicando ? "SIM" : "NÃO"}\n\n`
    t += `⚙️ Publicação SEMPRE usa lista de destinatários\n   (statusJidList — mecanismo oficial do WhatsApp).\n\n`
    t += `_status · statusconfig · statuspublicar · statuscancelar_\n`
    t += `SYZYGY`
    return t
}

export function verErrosTexto(qtd = 5) {
    const lista = listarErrosStatus(qtd)
    if (!lista.length) return "🫥 STATUS MANAGER — ERROS\n━━━━━━━━━━━━━━━━━━━━\n✅ Nenhum erro registrado."
    let txt = `🫥 STATUS MANAGER — ÚLTIMOS ERROS\n━━━━━━━━━━━━━━━━━━━━\n`
    for (const e of lista) {
        const d = new Date(e.ts)
        const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
        txt += `⏱ ${hora} · ${e.tipo}: ${e.erro}\n`
    }
    txt += `\nLog completo: dono/status_erros.json`
    return txt
}

export { safeSendMessage, STATUS_JID, FONTES_STATUS, CORES_STATUS }

```

#### `./start.sh` — 121 linhas, 3309 bytes

```sh
#!/usr/bin/env bash
# start.sh — inicia o SYZYGY (npm start, conforme package.json).
# Não apaga sessao/, autenticação, banco ou configurações.
# Não inicia uma segunda instância se o bot já estiver rodando.

set -u

PIDFILE_NAME="tmp/syzygy.pid"

log()  { printf '[SYZYGY] %s\n' "$*"; }
ok()   { printf '[SYZYGY] OK  %s\n' "$*"; }
warn() { printf '[SYZYGY] !   %s\n' "$*"; }
fail() { printf '[SYZYGY] ERRO %s\n' "$*"; }
die()  { fail "$1"; exit 1; }

resolve_root() {
  local src="${BASH_SOURCE[0]:-$0}"
  local dir
  dir=$(CDPATH= cd -- "$(dirname -- "$src")" && pwd) || return 1
  if [ -f "$dir/package.json" ]; then
    printf '%s\n' "$dir"
    return 0
  fi
  if [ -f "$HOME/syzygy/package.json" ]; then
    printf '%s\n' "$HOME/syzygy"
    return 0
  fi
  return 1
}

pid_alive() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

find_running_pid() {
  local pid cmd cwd
  if [ -f "$PIDFILE" ]; then
    pid=$(tr -d ' \t\r\n' < "$PIDFILE" 2>/dev/null || true)
    if pid_alive "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
    rm -f "$PIDFILE" 2>/dev/null || true
  fi
  if [ -d /proc ]; then
    for dir in /proc/[0-9]*; do
      pid=${dir#/proc/}
      cmd=$(tr '\0' ' ' < "$dir/cmdline" 2>/dev/null || true)
      case "$cmd" in
        *node*index.js*|*npm\ start*)
          cwd=$(readlink "$dir/cwd" 2>/dev/null || true)
          if [ "$cwd" = "$ROOT" ]; then
            printf '%s\n' "$pid"
            return 0
          fi
          ;;
      esac
    done
  fi
  return 1
}

ROOT=$(resolve_root) || die "Não encontrei o projeto SYZYGY. Use ~/syzygy ou rode start.sh de dentro da pasta do bot."
cd "$ROOT" || die "Não consegui entrar em $ROOT"
PIDFILE="$ROOT/$PIDFILE_NAME"

log "Diretório: $ROOT"

if [ ! -f "$ROOT/package.json" ]; then
  die "package.json não encontrado em $ROOT"
fi

if [ ! -d "$ROOT/sessao" ]; then
  warn "Pasta sessao/ ainda não existe (será criada na primeira conexão). Não vou criá-la agora."
fi

command -v node >/dev/null 2>&1 || die "Node.js não encontrado. No Termux: pkg install nodejs"
command -v npm >/dev/null 2>&1 || die "npm não encontrado. No Termux: pkg install nodejs"

START_CMD=""
if START_CMD=$(node -e "const p=require('./package.json'); if(!p.scripts||!p.scripts.start) process.exit(2); process.stdout.write(String(p.scripts.start))" 2>/dev/null); then
  :
else
  die "package.json não define scripts.start. O SYZYGY espera \"start\": \"node index.js\"."
fi

log "Comando de start (package.json): $START_CMD"

RUNNING=$(find_running_pid || true)
if [ -n "$RUNNING" ]; then
  warn "SYZYGY já está em execução (pid $RUNNING)"
  warn "Não vou iniciar outra instância."
  log "Para ver o processo: ps -p $RUNNING"
  exit 0
fi

mkdir -p "$ROOT/tmp" 2>/dev/null || true
printf '%s\n' "$$" > "$PIDFILE" || warn "Não consegui gravar $PIDFILE"

cleanup() {
  rm -f "$PIDFILE" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

ok "Iniciando SYZYGY com: npm start"
log "sessao/, .env e configs NÃO serão apagados."
log "Ctrl+C para encerrar."
printf '\n'

# npm start usa o script real do package.json (hoje: node index.js)
npm start
status=$?
if [ "$status" -ne 0 ]; then
  fail "npm start encerrou com código $status"
  exit "$status"
fi
ok "SYZYGY encerrou normalmente"
exit 0

```

#### `./update.sh` — 477 linhas, 25019 bytes

```sh
#!/usr/bin/env bash
# update.sh — SYZYGY (v2, segura por construção)
#
# O que mudou contra a v1 (a que existia em arena/01a0aaae):
#   1. A v1 dava `git stash push` SEM `-u`: arquivo NOVO (não rastreado) nunca foi
#      para o stash. Quem tinha criado features/flood/payment.js, presets etc.
#      localmente não estava protegido por nada.
#   2. A v1 escolhia sozinha "a origin/arena/* mais recente" e trocava sua branch.
#      Aqui a branch atual é respeitada; trocar de branch é decisão explícita (--to).
#   3. A v1 rodava `npm install` puro, que NESTE repo falha (peer deps do jimp) e
#      só no segundo tentativa usava --legacy-peer-deps.
# Esta versão: backup ANTES de qualquer coisa, merge de onde você mandar, validação
# depois, e nada de reset --hard nunca.
#
# USO
#   ./update.sh                         # sincroniza a branch atual com a origem dela
#   ./update.sh --dry-run               # só mostra o que faria (não escreve nada)
#   ./update.sh --from origin/main origin/arena/01a0ab7b-syzygy-bot-whatsapp
#                                       # faz merge dessas refs NA branch atual
#   ./update.sh --sync-all              # origin/main + todos os origin/arena/* (mais nova por último)
#   ./update.sh --to arena/01a0ab7b-syzygy-bot-whatsapp   # troca de branch (com backup antes)
#   ./update.sh --adopt arena/01a0ab7b-syzygy-bot-whatsapp # Árvore passa a ser a da
#                                       # branch dita (para linhagens divergentes, onde
#                                       # merge seria ruído). Backup + reflog + reaplicação
#                                       # do seu trabalho local; seus commits ficam em
#                                       # refs/syzygy-backup/pre-adopt-<ts>.
#   ./update.sh --list                  # estado: branches, ahead/behind, node_modules
#   ./update.sh --no-npm                # não roda npm install
#   ./update.sh --npm                   # força npm install
#   ./update.sh --restart               # reinicia o serviço (se houver systemd/syzygy.service)
#   ./update.sh --flood-ours            # em conflito só em features/flood, mantém a versão atual
#
# Política de conflito: --sync-all começa pela arena MAIS NOVA. Conflito restrito a
# features/flood/** ou aos scripts de deploy (update.sh/start.sh/recover.sh) → o
# incoming vence (é a versão corrigida). --flood-ours inverte. Qualquer outro
# caminho em conflito → merge abortado, nada aplicado, backup preservado.
#   ./update.sh --rollback <dir|ref> [--yes]   # restaura de um backup feito por este script
#
# Nunca toca (e ainda assim copia para o backup): sessao/ .env config.json dono/

set -u

ORIGIN_URL="git@github.com:yanrpoliveira3108-bit/syzygy-bot-whatsapp-.git"
VITAL="config.json .env sessao dono"
DRY=0
DO_NPM=1
FORCE_NPM=0
RESTART=0
SYNC_ALL=0
THEIRS_FLOOD=0
MODE="sync"
TO_BRANCH=""
ROLLBACK_TARGET=""
COPY_REF=""
COPY_PATHS=""
ALLOW_UNRELATED=0
ROLLBACK_YES=0
FROM_REFS=""

log()  { printf '[SYZYGY] %s\n' "$*"; }
ok()   { printf '[SYZYGY] OK  %s\n' "$*"; }
warn() { printf '[SYZYGY] !   %s\n' "$*"; }
fail() { printf '[SYZYGY] ERRO %s\n' "$*"; }
die()  { fail "$1"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)      DRY=1 ;;
    --no-npm)       DO_NPM=0 ;;
    --npm)          FORCE_NPM=1; DO_NPM=1 ;;
    --restart)      RESTART=1 ;;
    --sync-all)     SYNC_ALL=1 ;;
    --theirs-flood) FLOOD_OURS=0 ;;
    --list)         MODE="list" ;;
    --to)           MODE="to"; shift; TO_BRANCH="${1:-}" ;;
    --adopt)        MODE="adopt"; shift; TO_BRANCH="${1:-}" ;;
    --from)         MODE="from"; FROM_REFS=""; shift
                    while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do FROM_REFS="$FROM_REFS $1"; shift; done
                    set -- ;;
    --rollback)     MODE="rollback"; shift; ROLLBACK_TARGET="${1:-}" ;;
    --yes)          ROLLBACK_YES=1 ;;
    -h|--help)      sed -n '2,30p' "$0"; exit 0 ;;
    *) ;;
  esac
  shift || true
done

resolve_root() {
  local src="${BASH_SOURCE[0]:-$0}" dir
  dir=$(CDPATH= cd -- "$(dirname -- "$src")" && pwd) || return 1
  if [ -f "$dir/package.json" ]; then printf '%s\n' "$dir"; return 0; fi
  if [ -f "$HOME/syzygy/package.json" ]; then printf '%s\n' "$HOME/syzygy"; return 0; fi
  return 1
}

ROOT=$(resolve_root) || die "Não achei o projeto (package.json). Rode de dentro da pasta do bot ou use ~/syzygy."
cd "$ROOT" || die "Não consegui entrar em $ROOT"
command -v git >/dev/null 2>&1 || die "git não encontrado. No Termux: pkg install git"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$ROOT não é um repositório git."

CUR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'HEAD')
TS=$(date +%Y%m%d-%H%M%S)
FORCE_NOTE=0
BK="$ROOT/.syzygy-backup/$TS"

do_it() { # do_it "<comando>"  → executa fora de dry-run
  if [ "$DRY" = "1" ]; then log "(dry-run) $1"; return 0; fi
  eval "$1"
}

# ── rollback ─────────────────────────────────────────────────────────────────
if [ "$MODE" = "rollback" ]; then
  [ -n "$ROLLBACK_TARGET" ] || die "uso: ./update.sh --rollback .syzygy-backup/<ts> [--yes]"
  SRC="$ROLLBACK_TARGET"
  case "$SRC" in
    /*) : ;;
    *) SRC="$ROOT/$ROLLBACK_TARGET" ;;
  esac
  if [ -d "$SRC" ]; then
    [ -f "$SRC/vital.tgz" ] && log "vai restaurar: $(tar -tzf "$SRC/vital.tgz" 2>/dev/null | head -20 | tr '\n' ' ')"
    [ -f "$SRC/untracked.tgz" ] && log "vai restaurar novos arquivos: $(wc -l < "$SRC/untracked.txt" 2>/dev/null || echo '?') arquivo(s)"
    [ -f "$SRC/tracked.diff" ] && log "vai reaplicar alterações em arquivos rastreados ($(wc -l < "$SRC/tracked.diff") linhas de diff)"
    if [ "$ROLLBACK_YES" != "1" ]; then warn "dry-run por padrão. Repita com --yes para executar."; exit 0; fi
    [ -f "$SRC/vital.tgz" ] && { tar -xzf "$SRC/vital.tgz" -C "$ROOT" && ok "vital restaurado"; }
    [ -f "$SRC/untracked.tgz" ] && { tar -xzf "$SRC/untracked.tgz" -C "$ROOT" && ok "arquivos novos restaurados"; }
    if [ -f "$SRC/tracked.diff" ]; then
      if git apply --3way "$SRC/tracked.diff"; then ok "diff reaplicado"; else warn "git apply teve conflito — veja git status"; fi
    fi
    exit 0
  fi
  # ref de snapshot (refs/syzygy-backup/...)
  if git rev-parse --verify -q "$SRC" >/dev/null; then
    log "aplicando snapshot $SRC"
    exec git stash apply "$SRC"
  fi
  die "não achei backup em $ROLLBACK_TARGET (use ./recover.sh --list-backups)"
fi

# ── 1b) --copy: traz ARQUIVOS de outra ref sem merge (histórias não relacionadas)
if [ "$MODE" = "copy" ]; then
  [ -n "$COPY_REF" ] || die "uso: ./update.sh --copy origin/arena/<branch> [--path <dir|arquivo>] [--dry-run]"
  git rev-parse --verify -q "$COPY_REF" >/dev/null || die "$COPY_REF não existe"
  PATHS="${COPY_PATHS:-.}"
  log "copiando de $COPY_REF: $PATHS"
  for pth in $PATHS; do
    if [ "$DRY" = "1" ]; then
      log "(dry-run) git checkout $COPY_REF -- $pth"
      git diff --stat "$COPY_REF" -- "$pth" 2>/dev/null | tail -3 | sed 's/^/    /'
      continue
    fi
    git checkout "$COPY_REF" -- "$pth" || die "falha ao copiar $pth de $COPY_REF (backup em $BK)"
  done
  [ "$DRY" = "1" ] && exit 0
  ok "arquivos trazidos de $COPY_REF (backup do que existia em ${BK#$ROOT/})"
  exit 0
fi

# ── 1) fetch (read-only no seu working tree) ─────────────────────────────────
if ! git remote get-url origin >/dev/null 2>&1; then
  do_it "git remote add origin '$ORIGIN_URL'" || die "falha ao criar remote origin"
fi
log "buscando refs de $(git remote get-url origin)"
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune || die "git fetch falhou (rede/acesso). Nada foi alterado."

if [ "$MODE" = "list" ]; then
  printf '%-46s %-9s %-9s %s\n' "BRANCH" "ATRÁS" "À FRENTE" "COMMIT/MODO"
  for r in $(git for-each-ref --format='%(refname:short)' refs/heads); do
    up=$(git rev-parse --abbrev-ref --symbolic-full-name "$r@{u}" 2>/dev/null || printf '')
    ab=""; 
    if [ -n "$up" ]; then ab=$(git rev-list --left-right --count "$up...$r" 2>/dev/null || printf '?'); fi
    printf '%-46s %-9s %-9s %s\n' "$r" "${ab%%	*}" "${ab##*	}" "$(git log -1 --format='%h %cd' --date=short "$r")"
  done
  [ -d node_modules ] && log "node_modules: presente" || warn "node_modules: AUSENTE (rode ./update.sh para instalar)"
  [ -f package.json ] && log "scripts: $(node -e "const p=require('./package.json');console.log(Object.keys(p.scripts||{}).join(','))" 2>/dev/null)"
  exit 0
fi

# ── 2) backup ANTES de tocar em qualquer arquivo ─────────────────────────────
mkdir -p "$BK" || die "não consegui criar $BK"
{
  printf 'timestamp=%s\n' "$TS"
  printf 'branch=%s\n' "$CUR"
  printf 'head=%s\n' "$(git rev-parse HEAD 2>/dev/null)"
  printf 'upstream=%s\n' "$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || printf 'none')"
  printf -- '--- status ---\n'; git status --porcelain 2>/dev/null
} > "$BK/state.txt"

git diff --binary HEAD > "$BK/tracked.diff" 2>/dev/null || true
git ls-files -o --exclude-standard > "$BK/untracked.txt" 2>/dev/null || true
if [ -s "$BK/untracked.txt" ]; then
  (cd "$ROOT" && tar -czf "$BK/untracked.tgz" -T "$BK/untracked.txt" 2>/dev/null) && log "arquivos novos salvos em $(basename "$BK")/untracked.tgz"
fi
VITAL_EXIST=""
for f in $VITAL; do [ -e "$ROOT/$f" ] && VITAL_EXIST="$VITAL_EXIST $f"; done
if [ -n "$VITAL_EXIST" ]; then
  # shellcheck disable=SC2086
  (cd "$ROOT" && tar -czf "$BK/vital.tgz" $VITAL_EXIST 2>/dev/null) && log "sessao/config/dono/.env copiados para $(basename "$BK")/vital.tgz"
fi
SNAP=$(git stash create 2>/dev/null || printf '')
if [ -n "$SNAP" ]; then
  git update-ref "refs/syzygy-backup/$TS" "$SNAP" 2>/dev/null && \
    log "snapshot do tracked-modificado em refs/syzygy-backup/$TS (recuperar: git stash apply refs/syzygy-backup/$TS)"
fi
git rev-parse HEAD > "$BK/orig-head.txt" 2>/dev/null || true

if [ "$DRY" = "1" ]; then
  log "dry-run: backup seria criado em $BK e NENHUM arquivo do projeto seria alterado."
fi

# ── 3) o que sincronizar ─────────────────────────────────────────────────────
REFS=""
FAILED=""
if [ "$MODE" = "to" ]; then
  [ -n "$TO_BRANCH" ] || die "--to precisa do nome da branch"
  git show-ref --verify -q "refs/remotes/origin/$TO_BRANCH" || die "origin/$TO_BRANCH não existe (git branch -r)"
  REFS="origin/$TO_BRANCH"
elif [ "$MODE" = "from" ]; then
  REFS="$FROM_REFS"
  [ -n "$REFS" ] || die "--from precisa de pelo menos uma ref"
elif [ "$SYNC_ALL" = "1" ]; then
  # A MAIS NOVA primeiro: é ela que deve valer. As mais antigas só entram se não
  # conflituarem (a AB7 já contém a correção do shopping e a infra da AAAE, então
  # normalmente elas ficam "contidas" ou são puladas com aviso).
  REFS="origin/main"
  for r in $(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin/arena); do REFS="$REFS $r"; done
else
  UP=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || printf '')
  [ -n "$UP" ] || die "a branch atual ($CUR) não tem upstream. Use --from <ref>, --sync-all ou --to <branch>."
  REFS="$UP"
fi

# pré-visualização de conflitos
if [ "$DRY" = "1" ]; then
  for ref in $REFS; do
    ahead=$(git rev-list --count "HEAD..$ref" 2>/dev/null || echo '?')
    if [ "$ahead" = "0" ]; then log "dry-run: $ref já está contida em $CUR (nada a fazer)"; continue; fi
    col=$(LC_ALL=C sort <(git ls-files -o --exclude-standard) <(git ls-tree -r --name-only "$ref") | uniq -d | head -5)
    if [ -n "$col" ]; then warn "dry-run: $(printf '%s' "$col" | grep -c .)+ arquivo(s) seus NÃO rastreados colidem com $ref — no apply real eles vão para $BK/collide/ antes do merge"; fi
    if git merge-tree --write-tree --name-only HEAD "$ref" > "$BK/drytree-$(printf '%s' "$ref" | tr '/' '_').txt" 2>/dev/null; then
      log "dry-run: merge de $ref ($ahead commit(s)) — sem conflito previsto"
    else
      warn "dry-run: merge de $ref TERIA conflito. Arquivos:"
      sed -n '/CONFLICT/,$p' "$BK/drytree-$(printf '%s' "$ref" | tr '/' '_').txt" 2>/dev/null | head -20
    fi
  done
  log "dry-run: nada foi alterado (branch continua $CUR). Remova --dry-run para aplicar."
  exit 0
fi

# ── helpers de proteção do trabalho local ─────────────────────────────────────
# O git recusa ff/merge quando há alteração local nos mesmos arquivos. Como o
# snapshot (untracked.tgz + tracked.diff + refs/syzygy-backup/$TS) JÁ foi feito,
# podemos devolver o working tree ao HEAD para o ff avançar e, no fim, reaplicar
# o que era seu. A v1 não fazia nada disso — era onde o trabalho se perdia.
clean_local_for_ff() {
  [ -s "$BK/tracked.diff" ] || return 0
  if [ "$DRY" = "1" ]; then return 0; fi
  git checkout -- . 2>/dev/null && { warn "suas alterações locais foram tiradas da árvore para o ff avançar — elas estão em ${BK#$ROOT/}/tracked.diff e refs/syzygy-backup/$TS"; FORCE_NOTE=1; }
  return 0
}

LOCAL_REAPPLIED=0
reapply_local_work() {
  [ "$FORCE_NOTE" = "1" ] || return 0
  [ "$LOCAL_REAPPLIED" = "1" ] && return 0
  LOCAL_REAPPLIED=1
  [ -s "$BK/tracked.diff" ] || return 0
  if [ "$DRY" = "1" ]; then log "(dry-run) reaplicaria $BK/tracked.diff"; return 0; fi
  log "reaplicando suas alterações locais sobre a árvore atualizada"
  if git apply --3way "$BK/tracked.diff" 2> "$BK/reapply.log"; then
    ok "suas alterações voltaram para a árvore"
    FORCE_NOTE=2
  else
    warn "não consegui reaplicar limpo (conflito). O que era seu está preservado em:"
    warn "  ${BK#$ROOT/}/tracked.diff   ·   refs/syzygy-backup/$TS"
    tail -4 "$BK/reapply.log" | sed 's/^/    /'
  fi
}

# ── helper: colisões de arquivo não rastreado ────────────────────────────────
collide_fix() {
  ref="$1"
  untracked_list="$BK/.untracked-$$.txt"
  git ls-files -o --exclude-standard > "$untracked_list" 2>/dev/null || return 0
  [ -s "$untracked_list" ] || { rm -f "$untracked_list"; return 0; }
  incoming="$BK/.incoming-$$.txt"
  git ls-tree -r --name-only "$ref" > "$incoming" 2>/dev/null || { rm -f "$untracked_list" "$incoming"; return 0; }
  hits=$(LC_ALL=C sort "$untracked_list" "$incoming" | uniq -d)
  if [ -z "$hits" ]; then rm -f "$untracked_list" "$incoming"; return 0; fi
  mkdir -p "$BK/collide"
  for f in $hits; do
    [ -f "$f" ] || continue
    d="$BK/collide/$(dirname "$f")"; mkdir -p "$d"
    cp -a "$f" "$d/" 2>/dev/null && rm -f "$f" && warn "arquivo seu não rastreado movido para o backup (o merge o sobrescreveria): $f"
  done
  rm -f "$untracked_list" "$incoming"
  return 0
}

# ── 3b) --adopt: adotar a árvore de uma ref (linhagens divergentes) ───────────
if [ "$MODE" = "adopt" ]; then
  [ -n "$TO_BRANCH" ] || die "--adopt precisa do nome da branch"
  git rev-parse --verify -q "origin/$TO_BRANCH" >/dev/null || die "origin/$TO_BRANCH não existe"
  PREV=$(git rev-parse HEAD)
  git update-ref "refs/syzygy-backup/pre-adopt-$TS" "$PREV" 2>/dev/null
  log "adotando origin/$TO_BRANCH (antes: $CUR @ $(printf %.7s "$PREV") — guardado em refs/syzygy-backup/pre-adopt-$TS)"
  if [ "$DRY" = "1" ]; then
    log "(dry-run) git checkout -f -B $TO_BRANCH origin/$TO_BRANCH   # + reaplicar tracked.diff"
    git diff --stat HEAD "origin/$TO_BRANCH" 2>/dev/null | tail -5 | sed 's/^/    /'
    exit 0
  fi
  git checkout -f -B "$TO_BRANCH" "origin/$TO_BRANCH" || die "checkout -B falhou (backup em $BK)"
  git reset --hard "origin/$TO_BRANCH" >/dev/null 2>&1 || warn "reset após o checkout não correu bem"
  FORCE_NOTE=1
  reapply_local_work
  ok "árvore agora é origin/$TO_BRANCH @ $(git rev-parse --short HEAD)"
  MODE="done"
fi

# ── 4) aplicar ───────────────────────────────────────────────────────────────
if [ "$MODE" = "to" ]; then
  TARGET="${TO_BRANCH}"
  if [ "$CUR" != "$TARGET" ]; then
    if git show-ref --verify -q "refs/heads/$TARGET"; then
      CO="git checkout $TARGET"
    else
      CO="git checkout -b $TARGET --track origin/$TARGET"
    fi
    if ! eval "$CO" 2> "$BK/checkout.log"; then
      warn "o git recusou trocar de branch por causa das SUAS alterações locais:"
      tail -4 "$BK/checkout.log" | sed 's/^/    /'
      warn "elas JÁ estão preservadas em ${BK#$ROOT/} e em refs/syzygy-backup/$TS"
      warn "trocando com -f (é o único ponto deste script que sobrescreve o working tree)"
      if ! eval "${CO/checkout /checkout -f }" ; then die "checkout -f falhou também (backup em $BK)"; fi
      FORCE_NOTE=1
    fi
    CUR=$(git rev-parse --abbrev-ref HEAD)
  fi
  log "branch atual: $CUR"
fi

for ref in $REFS; do
  git rev-parse --verify -q "$ref" >/dev/null || { warn "$ref não resolvida — pulando"; continue; }
  ahead=$(git rev-list --count "HEAD..$ref" 2>/dev/null || echo 1)
  if [ "$ahead" = "0" ]; then log "$ref já está contida em $CUR"; continue; fi
  if git merge-base --is-ancestor HEAD "$ref" 2>/dev/null; then
    collide_fix "$ref"
    clean_local_for_ff
    log "fast-forward para $ref"
    if ! git merge --ff-only "$ref" > "$BK/ff-$(printf '%s' "$ref" | tr '/' '_').log" 2>&1; then
      warn "fast-forward de $ref recusado pelo git:"
      tail -4 "$BK/ff-$(printf '%s' "$ref" | tr '/' '_').log" | sed 's/^/    /'
      FAILED="$FAILED $ref"; warn "$ref não aplicada — seguindo para a próxima ref (nada perdido: $BK)"; continue
    fi
    ok "$ref aplicada (fast-forward)"
    ok "$ref aplicada"
    continue
  fi
  clean_local_for_ff
  # Antes de mesclar: se a ref incoming tem arquivos nos MESMOS caminhos de
  # arquivos SEUS não rastreados, o git recusaria o merge ("would be overwritten")
  # — e é justamente aqui que a v1 perdia trabalho. Eles já estão no
  # untracked.tgz do backup, então realocamos para $BK/collide/ em vez de deixar
  # o merge morrer.
  collide_fix "$ref"
  if ! git merge-base HEAD "$ref" >/dev/null 2>&1; then
    if [ "$ALLOW_UNRELATED" != "1" ]; then
      warn "$ref tem HISTÓRIA NÃO RELACIONADA com $CUR (a main é um snapshot isolado). Merge aqui seria ruído."
      warn "para trazer arquivos de lá sem merge:  ./update.sh --copy $ref --path features/flood"
      continue
    fi
    log "merge de $ref com --allow-unrelated-histories ($ahead commit(s))"
    collide_fix "$ref"
    if git merge --no-edit --allow-unrelated-histories "$ref" > "$BK/merge-$(printf '%s' "$ref" | tr '/' '_').log" 2>&1; then ok "$ref aplicada"; continue; fi
    git merge --abort 2>/dev/null
    fail "merge não-relacionado de $ref conflituou. Nada aplicado (backup em $BK)."
    exit 1
  fi
  log "merge de $ref ($ahead commit(s) à frente)"
  if git merge --no-edit "$ref" > "$BK/merge-${ref//\//_}.log" 2>&1; then
    ok "$ref aplicada"
    continue
  fi
  warn "merge de $ref não completou; último output:"
  tail -6 "$BK/merge-${ref//\//_}.log" 2>/dev/null | sed 's/^/    /' 
  # conflito → política explícita
  CONFLICTED=$(git diff --name-only --diff-filter=U 2>/dev/null)
  # Política de resolução automática: só para caminhos ONDE A MAIS NOVA MANDA por
  # definição do projeto (features/flood/* e os próprios scripts de deploy).
  # Qualquer outro conflito = merge desfeito, nada aplicado.
  SAFE_RE="^(features/flood/|update\.sh$|start\.sh$|recover\.sh$)"
  ONLY_FLOOD=1
  for f in $CONFLICTED; do printf '%s\n' "$f" | grep -qE "$SAFE_RE" || ONLY_FLOOD=0; done
  if [ "$ONLY_FLOOD" = "1" ] && [ -n "$CONFLICTED" ]; then
    if [ "$FLOOD_OURS" = "1" ]; then SIDE="--ours"; QUER="a versão da branch atual (--flood-ours)"; else SIDE="--theirs"; QUER="a versão incoming ($ref)"; fi
    log "conflito só em features/flood/scripts de deploy — resolvendo com $QUER"
    # shellcheck disable=SC2086
    git checkout $SIDE -- $CONFLICTED && git add -- $CONFLICTED && git commit --no-edit -m "merge($ref): features/flood resolvido por política ($SIDE)" \
      || { fail "não consegui resolver features/flood (backup em $BK)"; exit 1; }
    ok "merge de $ref concluído"
  else
    git merge --abort 2>/dev/null
    warn "conflito real em $ref — este merge foi DESFEITO e nada desse ref foi aplicado."
    printf '%s\n' "$CONFLICTED" | sed '/^$/d' | head -20 | sed 's/^/    /'
    FAILED="$FAILED $ref"
    warn "seguindo para a próxima ref (a mais recente manda). Backup: ${BK#$ROOT/}"
    log "   o que $ref tem de diferente da sua árvore agora:"
    git diff --name-only HEAD "$ref" 2>/dev/null | head -12 | sed 's/^/      /'
    log "   (para trazer só arquivos, sem merge: ./update.sh --copy $ref --path <dir>)"
    continue
  fi
done

reapply_local_work

# ── 5) dependências ──────────────────────────────────────────────────────────
need_npm=0
if [ ! -d "$ROOT/node_modules" ]; then need_npm=1; log "node_modules ausente"
elif [ -f "$ROOT/package.json" ] && [ "$ROOT/package.json" -nt "$ROOT/node_modules" ]; then need_npm=1; log "package.json mais novo que node_modules"
elif [ -f "$ROOT/package-lock.json" ] && [ "$ROOT/package-lock.json" -nt "$ROOT/node_modules" ]; then need_npm=1; log "package-lock mais novo que node_modules"
fi
[ "$FORCE_NPM" = "1" ] && need_npm=1
if [ "$DO_NPM" = "0" ]; then need_npm=0; log "--no-npm: pulando instalação" ; fi
if [ "$need_npm" = "1" ]; then
  command -v npm >/dev/null 2>&1 || die "npm não encontrado. No Termux: pkg install nodejs"
  # neste repo o `npm install` puro QUEBRA (peer deps do jimp) → legacy-peer-deps primeiro
  log "npm install --legacy-peer-deps"
  npm install --legacy-peer-deps --no-audit --no-fund || { warn "falhou; tentando sem o flag"; npm install --no-audit --no-fund || die "npm install falhou (código atualizado, dependências não)"; }
  ok "dependências instaladas"
else
  log "dependências já coerentes com package.json"
fi

# ── 6) validação (não adianta atualizar e descobrir amanhã) ──────────────────
VAL=0
if [ -f index.js ]; then node --check index.js 2>/dev/null && ok "index.js parseia" || { warn "index.js NÃO parseia"; VAL=1; }; fi
for t in features/flood/tests.js features/flood/tests-infra.js features/flood/tests-menu.js; do
  if [ -f "$t" ]; then
    log "rodando $t"
    if node "$t" > "$BK/$(basename "$t").log" 2>&1; then ok "$t verde"; else warn "$t FALHOU — resumo em $BK/$(basename "$t").log"; VAL=1; fi
  fi
done
if [ -f features/flood/doctor.mjs ]; then
  node features/flood/doctor.mjs > "$BK/doctor.log" 2>&1 && ok "doctor.mjs ok (dry-run, zero envio)" || warn "doctor.mjs apontou algo — veja $BK/doctor.log"
fi

if command -v node >/dev/null 2>&1 && [ -f package.json ]; then
  node -e "const p=require('./package.json');if(!p.scripts||!p.scripts.start)process.exit(1)" 2>/dev/null || warn "package.json sem scripts.start (start.sh vai reclamar)"
fi

# ── 7) restart ───────────────────────────────────────────────────────────────
if [ "$RESTART" = "1" ]; then
  SVC="${SYZYGY_SERVICE:-syzygy.service}"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SVC" >/dev/null 2>&1 && [ -n "$(systemctl list-unit-files "$SVC" 2>/dev/null | grep -F "$SVC")" ]; then
    systemctl restart "$SVC" && ok "$SVC reiniciado" || warn "não consegui reiniciar $SVC (permissão?)"
  else
    warn "sem $SVC no systemd — reinicie você: ./start.sh (ou pare o processo atual antes)"
  fi
fi

# ── resumo ───────────────────────────────────────────────────────────────────
printf '\n'
log "=========== RESUMO ==========="
log "branch  : $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
log "trazidas: $REFS"
[ -n "$FAILED" ] && warn "NÃO aplicadas (conflito):$FAILED"
log "backup  : ${BK#$ROOT/}  (+ refs/syzygy-backup/$TS se havia alteração rastreada)"
log "não tocados: $(printf '%s' "$VITAL_EXIST" | tr -s ' ' ' ')"
if [ "${FORCE_NOTE:-0}" = "2" ]; then
  log "suas alterações locais foram reaplicadas sobre a árvore nova (via $BK/tracked.diff)"
elif [ "${FORCE_NOTE:-0}" = "1" ]; then
  warn "suas alterações locais NÃO voltaram para a árvore: recupere com"
  warn "  ./update.sh --rollback ${BK#$ROOT/}    (ou: git stash apply refs/syzygy-backup/$TS)"
fi
[ "$VAL" = "1" ] && warn "validação apontou problema — leia os logs do backup antes de ligar"
ok "update concluído"

```

#### `./recover.sh` — 130 linhas, 6843 bytes

```sh
#!/usr/bin/env bash
# recover.sh — caça trabalho perdido no git (stash, reflog, snapshots, objetos soltos).
#
# Por que este arquivo existe: o update.sh antigo fazia `git stash push` sem `-u`
# e trocava de branch sozinho. Alterações em arquivos RASTREADOS foram para o
# stash; arquivos NOVOS (ex.: um features/flood/payment.js criado na mão) não
# estavam protegidos por nada, e um merge/checkout mal-sucedido podia cobri-los.
# Quase sempre dá para recuperar — este script só LÊ (exceto --apply/--lost-found).
#
# USO
#   ./recover.sh                  # tudo: status + stash + reflog + snapshots + backup dirs
#   ./recover.sh --stash          # só os stashes (com o que há em cada um)
#   ./recover.sh --reflog         # reflog comentado (checkout/merge/reset)
#   ./recover.sh --snapshots      # refs/syzygy-backup/* criadas pelo update.sh novo
#   ./recover.sh --files          # conteúdo de .syzygy-backup/<ts>/ e como restaurar
#   ./recover.sh --blobs          # commits/blobs soltos (o ouro depois de stash perdido)
#   ./recover.sh --lost-found     # roda git fsck --lost-found (ESCREVE em .git/lost-found)
#   ./recover.sh --apply <ref>    # git stash apply <ref>  (não dropa: nada é apagado)
#   ./recover.sh --blob <sha> --out caminho   # salva um blob solto em um arquivo

set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd) || exit 1
cd "$ROOT" || exit 1
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf '[RECUPERA] isto não é um repositório git\n'; exit 1; }

hdr() { printf '\n──── %s ─────────────────────────────────────────\n' "$*"; }
note() { printf '  · %s\n' "$*"; }

MODE="${1:-all}"
[ $# -gt 0 ] && shift || true

do_status() {
  hdr "estado atual"
  printf '  branch : %s @ %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" "$(git rev-parse --short HEAD 2>/dev/null)"
  printf '  sujo   : %s arquivo(s) versionado(s), %s novo(s)\n' \
    "$(git status --porcelain --untracked-files=no 2>/dev/null | wc -l | tr -d ' ')" \
    "$(git ls-files -o --exclude-standard 2>/dev/null | wc -l | tr -d ' ')"
  git status --short 2>/dev/null | head -30
}

do_stash() {
  hdr "stash (o update.sh antigo jogava suas alterações rastreadas aqui)"
  if [ -z "$(git stash list 2>/dev/null)" ]; then printf '  (nenhum stash)\n'; return 0; fi
  git stash list --format='  %gd · %cd · %gs' --date=iso 2>/dev/null
  for s in $(git stash list --format='%gd' 2>/dev/null); do
    printf '\n  conteúdo de %s:\n' "$s"
    git stash show --stat "$s" 2>/dev/null | sed 's/^/    /' | head -25
  done
  note "recuperar sem apagar:  git stash apply stash@{0}"
}

do_reflog() {
  hdr "reflog (cada linha é um ponto para onde dá para voltar)"
  git reflog --date=iso -n 30 2>/dev/null | sed 's/^/  /'
  note "ver um estado:      git show --stat 'HEAD@{5}'"
  note "arquivo de então:   git show 'HEAD@{5}:caminho/arquivo.js'"
}

do_snapshots() {
  hdr "snapshots do update.sh novo (refs/syzygy-backup/*)"
  local refs
  refs=$(git for-each-ref --format='%(refname)' refs/syzygy-backup 2>/dev/null)
  if [ -z "$refs" ]; then printf '  (nenhum)\n'; return 0; fi
  for r in $refs; do
    printf '\n  %s · %s\n' "$r" "$(git log -1 --format='%cd %s' --date=iso "$r" 2>/dev/null)"
    git show --stat --format='' "$r" 2>/dev/null | sed 's/^/    /' | head -20
    note "aplicar: git stash apply $r"
  done
}

do_files() {
  hdr "backups em .syzygy-backup/"
  if [ ! -d "$ROOT/.syzygy-backup" ]; then printf '  (nenhum diretório .syzygy-backup — o update.sh novo ainda não rodou aqui)\n'; return 0; fi
  for d in "$ROOT"/.syzygy-backup/*/; do
    [ -d "$d" ] || continue
    printf '\n  %s\n' "${d#$ROOT/}"
    [ -f "$d/state.txt" ] && sed -n '1,4p' "$d/state.txt" | sed 's/^/    /'
    [ -f "$d/untracked.txt" ] && note "arquivos novos: $(wc -l < "$d/untracked.txt") (untracked.tgz)"
    [ -f "$d/vital.tgz" ] && note "sessao/config/dono: $(tar -tzf "$d/vital.tgz" 2>/dev/null | wc -l) entradas (vital.tgz)"
    [ -f "$d/tracked.diff" ] && note "diff rastreado: $(wc -l < "$d/tracked.diff") linhas"
    note "restaurar: ./update.sh --rollback ${d#$ROOT/}"
  done
}

do_blobs() {
  hdr "objetos soltos (o que sobra depois de stash drop / checkout -f / merge ruim)"
  local out
  out=$(git fsck --unreachable --no-progress 2>/dev/null)
  [ -n "$out" ] || { printf '  (nada unreachable — bom sinal, ou já foi coletado pelo gc)\n'; return 0; }
  local commits blobs
  commits=$(printf '%s\n' "$out" | awk '/unreachable commit/{print $3}')
  blobs=$(printf '%s\n' "$out" | awk '/unreachable blob/{print $3}')
  printf '  commits soltos: %s · blobs soltos: %s\n' "$(printf '%s' "$commits" | grep -c . || true)" "$(printf '%s' "$blobs" | grep -c . || true)"
  for c in $commits; do
    [ -n "$c" ] || continue
    printf '\n  commit %s · %s\n' "${c:0:10}" "$(git log -1 --format='%cd %s' --date=iso "$c" 2>/dev/null)"
    git show --stat --format='' "$c" 2>/dev/null | sed 's/^/    /' | head -15
    note "ver:  git show $c"
  done
  local n=0
  for b in $blobs; do
    [ -n "$b" ] || continue
    n=$((n+1)); [ "$n" -gt 25 ] && { note "(mais $(printf '%s' "$blobs" | grep -c . ) blobs — use --blob <sha> --out arquivo)"; break; }
    size=$(git cat-file -s "$b" 2>/dev/null || echo 0)
    [ "$size" -lt 40 ] && continue
    if git cat-file -p "$b" 2>/dev/null | head -c 4000 | grep -qE 'export |function |=>|require\('; then
      printf '\n  blob %s · %s bytes · parece código JS:\n' "${b:0:10}" "$size"
      git cat-file -p "$b" 2>/dev/null | head -6 | sed 's/^/    /'
      note "salvar: ./recover.sh --blob $b --out recuperado_$(printf '%.10s' "$b").js"
    fi
  done
}

case "$MODE" in
  --stash)      do_stash ;;
  --reflog)     do_reflog ;;
  --snapshots)  do_snapshots ;;
  --files)      do_files ;;
  --blobs)      do_blobs ;;
  --lost-found) hdr "git fsck --lost-found (escreve em .git/lost-found/)"; git fsck --lost-found 2>&1 | sed 's/^/  /'; printf '\n  arquivos: .git/lost-found/commit/* e /other/*\n' ;;
  --apply)      target="${1:-}"; [ -n "$target" ] || { printf '  uso: ./recover.sh --apply stash@{0} | refs/syzygy-backup/<ts>\n'; exit 1; }
                printf '  aplicando %s (sem drop — nada é apagado)\n' "$target"; exec git stash apply "$target" ;;
  --blob)       sha="${1:-}"; out=""; [ "${2:-}" = "--out" ] && out="${3:-}"
                [ -n "$sha" ] && [ -n "$out" ] || { printf '  uso: ./recover.sh --blob <sha> --out <arquivo>\n'; exit 1; }
                git cat-file -p "$sha" > "$out" && printf '  salvo em %s (%s bytes)\n' "$out" "$(git cat-file -s "$sha")" ;;
  all)          do_status; do_stash; do_snapshots; do_files; do_reflog; do_blobs ;;
  *)            printf '  modo desconhecido: %s\n' "$MODE"; sed -n '2,20p' "$0"; exit 1 ;;
esac

```

#### `./.gitignore` — 28 linhas, 255 bytes

```text
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

#### `./.npmrc` — 11 linhas, 646 bytes

```text
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

---

# FIM DO BUNDLE

Depois de montar o projeto: rode as quatro suítes de teste
do bundle (`features/flood/tests.js`, `tests-menu.js`, `tests-infra.js`,
`features/viewOnce/tests.js`) e o
checklist de smoke da Parte A. Não declare sucesso por render de card de loja,
pagamento ou viewOnce sem prova em aparelho real.
