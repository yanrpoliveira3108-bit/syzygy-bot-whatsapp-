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
