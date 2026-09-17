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
