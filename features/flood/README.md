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

## `messageVersion` — existe, mas não é nosso para inventar

O proto tem `messageVersion = 3`, e o **outro** caminho do fork
(`interactiveButtons`/`nativeFlow` + `message.shop || message.shopSurface`) seta
`messageVersion: 1`. O ramo `shop` puro **não** seta, e o atalho `sendMessage`
não expõe esse campo.

Como a arquitetura proíbe montar proto cru, **não mandamos `messageVersion`**.
Se um dia o card precisar do campo, o caminho é o ramo `nativeFlow + shop` — e
isso é outra decisão, fora do escopo do flood.

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

* **145** asserções com `@innovatorssoft/baileys` instalado; sem o pacote, o
  mesmo suite roda **127 ok + 2 SKIP** (os blocos de contrato ficam SKIP
  declarado no stdout — nunca "passado" inventado), sem dependências extras.
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
