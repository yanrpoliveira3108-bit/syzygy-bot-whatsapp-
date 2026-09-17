# features/flood — TIPO de conteúdo `shopping` (card de loja) no flood

**O que é:** um TIPO/PRESET de conteúdo do flood existente.
**O que NÃO é:** um segundo flood. Não há fila, timer, lote, throttle, permissão
ou executor próprios — quem envia continua sendo `executarFlood()` /
`executarFloodLote()` em `services/groupService.js`.

Paquete de referência: **@innovatorssoft/baileys 7.4.7** (verificado com
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

O que o fork faz com isso, em `lib/Utils/messages.js` (ramo `shop`, ~1374):

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
| `{ text, shop:{surface,id} }` → ramo `shop` puro (~1374) | `{surface,id}` — **`messageVersion: null`** | não | 138 |
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

* **172** asserções com `@innovatorssoft/baileys` instalado (cobre os dois modos
  de entrega e compara o proto gerado com `messageVersion` nulo/1); sem o pacote,
  o mesmo suite roda os blocos de contrato como **SKIP declarado** no stdout —
  nunca "passado" inventado.
* quando `@innovatorssoft/baileys` está instalado, o suite **também**: compara as
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
`node_modules/@innovatorssoft/baileys/lib/Socket/business.js`) e responde à pergunta *"o id que
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
