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
    assertEq(detectShoppingTrigger("loja:0"), { isShopping: true, rest: "0", trigger: "loja:" }, "gatilho 'loja:0' reconhecido")
    assertEq(detectShoppingTrigger("SHOP: texto|T|2|https://x"), { isShopping: true, rest: "texto|T|2|https://x", trigger: "shop:" }, "gatilho 'SHOP:' (maiúsculo) reconhecido")
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
    const candidates = [
        path.resolve(here, "../../node_modules/@innovatorssoft/baileys/lib/Utils/messages.js"),
        path.resolve(here, "../../../node_modules/@innovatorssoft/baileys/lib/Utils/messages.js"),
        path.resolve(process.cwd(), "node_modules/@innovatorssoft/baileys/lib/Utils/messages.js")
    ]
    const forkFile = candidates.find(p => fs.existsSync(p))
    if (!forkFile) {
        skip("fork @innovatorssoft/baileys não instalado — bloqueio de contrato contra lib/Utils/messages.js não executado")
    } else {
        const src = fs.readFileSync(forkFile, "utf8")
        assert(/else if \('shop' in message && !!message\.shop\)/.test(src), "fork tem o ramo 'shop' puro que o adapter usa")
        assert(/shopStorefrontMessage:\s*\{/.test(src), "fork monta shopStorefrontMessage (superfície real do tipo)")
        assert(/else if \('viewOnce' in message && !!message\.viewOnce\)/.test(src), "fork embrulha em viewOnceMessage quando viewOnce é true (por isso o default é omitir)")
        const protoFile = path.resolve(path.dirname(forkFile), "../../WAProto/E2E/E2E.proto")
        if (fs.existsSync(protoFile)) {
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
    try { Baileys = await import("@innovatorssoft/baileys") } catch { Baileys = null }
    if (!Baileys || typeof Baileys.generateWAMessageContent !== "function") {
        skip("@innovatorssoft/baileys indisponível — proto real não exercitado (rode com as dependências instaladas)")
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
        assert(wire.interactiveMessage.shopStorefrontMessage.messageVersion == null, "messageVersion fica nulo (não inventamos campo no atalho puro)")
        assertEq(wire.interactiveMessage.body.text, zero.content.text, "corpo do card = body.text do interactiveMessage")
        assertEq(wire.interactiveMessage.header.title, SHOPPING_PRESET_TEST.title, "header.title vem do que o preset forneceu")
        assertEq(wire.interactiveMessage.footer.text, SHOPPING_PRESET_TEST.footer, "footer.text vem do que o preset forneceu")
        assertEq(wire.interactiveMessage.header.hasMediaAttachment, false, "hasMediaAttachment é decisão do fork no ramo text")

        // prova do motivo do default: ligar viewOnce embrulha o card
        const wireVo = await generateWAMessageContent({ ...zero.content, viewOnce: true }, options)
        assertEq(Object.keys(wireVo), ["viewOnceMessage"], "viewOnce:true → fork embrulha em viewOnceMessage (por isso o padrão é omitir)")

        // surface 4: o proto aceita o número no wire (é por isso que o app reclama)
        const wireQuatro = await generateWAMessageContent({ text: "t", shop: { surface: 4, id: "https://ex.com" } }, options)
        assertEq(wireQuatro.interactiveMessage.shopStorefrontMessage.surface, 4, "comprovado: o fork NÃO valida surface 4 — por isso o adapter mapeia antes de enviar")
        assertEq((await generateWAMessageContent(m4.content, options)).interactiveMessage.shopStorefrontMessage.surface, 3, "passando pelo adapter, o mesmo caso sai como 3 (WA) no proto")
    }

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
        .catch(() => process.exit(1))
}
