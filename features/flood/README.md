# features/flood — flood de TEXTO e de PAGAMENTO (v53)

**O que é:** o catálogo de *presets* (teto de mensagens, ritmo, retries, timeout,
cooldown) e o *tipo de conteúdo* que vai dentro de cada mensagem — `texto` ou
`pagamento` (`requestPaymentMessage` do fork Baileys).

**O que NÃO é:** um segundo flood. Não há fila, timer, throttle, permissão ou
executor próprios. Quem envia continua sendo `executarFlood()` /
`executarFloodLote()` em `services/groupService.js` — o mesmo laço, o mesmo
limiter, as mesmas porteiras do flood de texto do menu `2`.

**O que saiu na v53** (não procure por eles; se achar em doc antigo, o doc está
velho): `allowlist.js`, `dry-run`, `modo teste` (`floodTestMode`), preview de
loja (`shopping` / `card de loja`), `engine.js` próprio e os números 42–47 do
painel do dono. No lugar do gate extra: **alvo é sempre a seleção do operador**
(painel `2` → grupos, ou `36`), sem lista própria do flood.

Pacote de referência: **`@lucasmod/boruto-vk7-baileys@2.1.0`** (manifest do
registry + leitura do `lib/` do tarball). Nada aqui é inferido de README de
terceiro. Receita de instalação (o `preinstall` do pacote e o alias do libsignal
são obrigatórios):

```bash
npm i @lucasmod/boruto-vk7-baileys@2.1.0 --ignore-scripts --legacy-peer-deps
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps
# import no código: @lucasmod/boruto-vk7-baileys/baileys/lib/index.js
# NÃO usar 2.0.0 / 2.0.1 / 2.0.2 (tarball sem lib/ compilada ou com engine-requirements quebrado)
```

---

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `config.js` | registro de presets, `FLOOD_PRESET_HARD_CAP`, `getFloodRuntimeConfig()`, rótulo do tipo, clamps. **Não** conhece socket nem fs. |
| `presets/index.js` | `loadPreset()` (merge + clamp) e `buildContent()` por tipo; é onde se religa um tipo novo. |
| `presets/{text,mention,media,payment}.js` | arquivo de dados + builder de cada tipo (sem import do barrel). |
| `presets/custom.js` | dispatcher dos presets do usuário — só delega (texto/menção/mídia/pagamento). |
| `payment.js` | adapter puro do `requestPaymentMessage`: parse de valor/moeda, `buildPaymentContent()`, `getPaymentApiInfo()`, mensagens de erro. |
| `customStore.js` | CRUD dos presets custom em `CONFIG.floodCustomPresets` (com reserva de id built-in). |
| `targets.js` | `normalizeTargetJid`, `filterTargets`, `isProtectedGroupJid`, seleção do operador (`set/get/clearFloodSelection`), `resumoAlvosTexto`. |
| `groups.js` | parse dos números do menu (`parseSelectedGroups`) e `extractTargetJids`. |
| `limiter.js` | `createLimiter` (intervalo global por key + jitter), `withTimeout`, `classifyError`, cooldown por preset. |
| `queue.js` | `createQueue` — retry com backoff, `shouldStop`, `cancel`. Nenhum segundo executor de flood. |
| `presetEngine.js` | `runPresetJob()`: uma instância por vez, cooldown, kill, `currentJobInfo()`, métricas. |
| `killswitch.js` | estado, listener, `persist` opcional em `config.json`. |
| `speed.js` | velocidade efetiva (`resolveFloodSpeed`/`applyFloodSpeed`/`toFloodOpts`). |
| `router.js` | entrada dos atalhos (`paymenttest`, `2/preset/<id>`, `36`…), sempre devolvendo `{handled, reply}`. |
| `index.js` | **barrel** — única porta de entrada para `menus/`, `handlers/`, `commands/`. |
| `doctor.mjs` | diagnóstico de leitura: estado efetivo + payload de cada preset (zero rede, zero disco). |
| `tests.js` | núcleo: config, presets, payment no fio, clamps, payload do fork (161 asserts). |
| `tests-infra.js` | infraestrutura: limiter/fila/kill/job/alvos/store + integração com `executarFlood` (195 asserts). |
| `tests-menu.js` | ligação com os painéis: numeração 12–41, catálogo de comandos, atalhos (208 asserts). |

Regra de dependência: `presets/*` e os módulos folha **não** importam o barrel
(ciclo ESM). Quem importa o barrel é a superfície externa (`menus/`,
`handlers/`, `commands/`, `services/`).

---

## O que o fork realmente aceita (motivo de o payload ser deste jeito)

Lido em `baileys/lib/` do tarball publicado, não em documentação de terceiros:

* `messages.js:724-753` — o ramo de pagamento lê **apenas**
  `message.payment?.{currency, offset, amount, expiry, note, from, image}`,
  mais `mentions` e `contextInfo`. Não toca em `viewOnce` e não existe `surface`
  no proto de payment. O `amount` vai **direto** para `amount1000`: quem monta
  multiplica por 1000 (por isso `25.90` → `25900`; se você mandar centavos já
  multiplicados, vai cobrar 1000×).
* `buildPaymentContent()` emite exatamente
  `{ note, currency, amount, offset, from, expiry }` — nem uma chave a mais.
  Chave extra = cliente quebra, e `PAYMENT_PAYLOAD_INVALID` é lançado antes de
  qualquer envio.
* `messages.js:1197` — `viewOnce: true` embrulha em `viewOnceMessageV2`; `:1201`
  é `viewOnceExt`. **Não** ligue `viewOnce` num card/pagamento: o wrap muda o
  tipo da mensagem e o app mostra "indisponível".
* `messages.js:973/1020` — o ramo `interactiveButtons` e o `shop` são
  mutuamente exclusivos (`else if`), e `shop` exige `surface` entre 1 e 3 no
  proto. É por isso que o `shopping` foi removido em vez de remendado: o pacote
  de terceiros que o documentava usava `surface: 4` (inexistente) e
  `viewOnce: true` juntos.

Verificação rápida sem bot: `node features/flood/doctor.mjs --only payment`
imprime o JSON que sairia.

---

## Invariantes (o que os testes garantem)

1. **Nada é enviado sem alvo escolhido.** `runPresetJob` exige `targets`
   (`TARGETS_REQUIRED`); os atalhos respondem `NENHUM_ALVO` com o caminho
   (`36`/`2 → grupos`). Nenhuma ampliação automática para "todos os grupos".
2. **Grupo protegido nunca é alvo.** `filterTargets` corta JIDs em
   `gruposAutorizados` (`PROTECTED_GROUP_BLOCKED`) — o flood do bot não atira no
   grupo do dono.
3. **Preset é teto, não piso.** `clampPresetLimits` + `FLOOD_PRESET_HARD_CAP`
   (`maxMessages 100`, `minInterval 40`, `maxConcurrency 4`, `maxRetries 2`,
   `maxTimeout 30000`, `minCooldown 1000`). Overlay e atalho só podem reduzir.
4. **`2000 msg/alvo` é o teto do flood clássico** (`MAX_FLOOD`), configurável
   por `CONFIG.floodMaxMensagens` (`floodMaxEfetivo()`, teto absoluto `FLOOD_MAX_HARD_CEILING = 5000`).
5. **Um job de preset por vez** (`JOB_IN_PROGRESS`), com cooldown por preset e
   `currentJobInfo()` para o raio-X (`39`).
6. **Kill switch derruba na fronteira do lote** — vale para o job em andamento
   (listener) e para o flood do wizard; `37` persiste em `config.json` de
   propósito (bloqueio tem que sobreviver a restart).
7. **`disconnect` aborta, `rate_limit` espera.** `classifyError`: 429/
   "rate-overlimit"/"too many requests" → retry com backoff (800ms × (n+1));
   desconexão/forbidden/blocked → aborta o job. Erro não classificado aborta
   (conservador). `withTimeout` devolve `{code:"TIMEOUT"}`, nuncaPromise pendente.
8. **Jitter só aumenta a espera.** `createLimiter` soma 50–300ms; o intervalo é
   global por `key`, então dois targets nunca compartilham um burst.
9. **Testes não escrevem em disco.** `salvarConfig()` é proibido nas suítes;
   `config.json` e `dono/historico.json` são comparados byte a byte antes/depois
   (e devolvidos ao estado original quando a ação testada persiste de verdade).

---

## Números e atalhos

Painel do dono (`5` → `Configurações`) — ADM mantém 1–11:

| nº | o que faz |
| --- | --- |
| 17 / 18 / 19 | modo de flood · intervalo · lote |
| 35 | painel de presets (built-in + custom, tetos visíveis) |
| 36 | escolher os grupos do flood (`1`, `1,3,5`, `limpar`) — mesma lista do flood normal |
| 37 | kill switch (liga/desliga, persistido) |
| 38 | velocidade dos presets (`1..4` ou intervalo custom 20–5000 ms) |
| 39 | raio-X do job (kill, tipo, alvos, ritmo, timeout, retries, cooldown, teto) |
| 40 | tipo padrão do flood: `texto` ⇄ `pagamento` |
| 42–47 | respondem "opção removida na v53" — nunca número fantasma |

Atalhos de texto (fora do menu): `floodpresets`, `paymenttest`, `texttest`,
`mentiontest`, `mediatest` (e a variante `!`), `floodstop`/`floodstart`,
`pagamento`, `2/preset/<id>[/<resto>[/<qtd>]]`,
`2/<grupo>/pag:Nota|25,90|BRL/<qtd>[/<modo>][@tempo]`, `36/1,3/grupo`.

O tipo **só troca o conteúdo**: `CONFIG.floodTipo` (`texto|pagamento`) mais
`CONFIG.floodContent`, resolvidos por `floodContentBuilderFor(...)`; o resto
(alvos, ritmo, lote, kill) é compartilhado.

---

## Rodar

```bash
node features/flood/doctor.mjs                 # diagnóstico de leitura (não precisa de sessão)
node features/flood/tests.js                   # === FLOOD · CORE+PAYMENT: 161 ok · 0 falhas · 0 skip ===
node features/flood/tests-infra.js             # === FLOOD · INFRA: 195 ok · 0 falhas · 0 skip ===
node features/flood/tests-menu.js              # === FLOOD · MENU: 208 ok · 0 falhas · 0 skip ===
```

As três suítes são independentes de ordem, não usam rede e não deixam estado.
Elas são a especificação executável da v53 — se um comportamento mudar, mude o
teste e o texto aqui junto.

---

## Religar um tipo novo (ex.: voltar com o card de loja)

O caminho está pronto e é curto — foi assim que `payment` entrou:

1. `presets/<tipo>.js` com os dados + builder puro (sem socket, sem fs);
2. registrar em `presets/index.js` (`BUILDERS`, `ITER_BUILDERS`) e no
   `FLOOD_GENERAL_PRESETS`/`FLOOD_PRESET_TYPES` de `config.js`;
3. validar o payload **contra o `lib/` do fork instalado** (não contra README) e
   recusar chave fora do proto no builder;
4. entrar no `CUSTOM_TIPOS_DELEGADOS` de `customStore.js` se quiser ser tipo de
   preset custom;
5. um atalho em `router.js` + `commandMap.js` e uma linha no painel
   (`menus/configMenu.js`, números seguintes a 41 — sem reusar os mortos);
6. `tests.js` + `tests-menu.js` cobrindo o tipo, e `doctor.mjs --only <tipo>`.

O que continua proibido para qualquer tipo: segundo executor de flood,
auto-ampliação de alvo, disparo em grupo protegido, e chave de payload que o
`WAProto` não conheça.
