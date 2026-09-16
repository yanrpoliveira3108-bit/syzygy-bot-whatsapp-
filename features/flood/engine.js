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
export const SHOP_SEND_KEYS = ["text", "title", "subtitle", "footer", "shop", "viewOnce", "mentions", "linkPreview"]

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
    return `type: interactiveMessage.shopStorefrontMessage · chaves: ${keys.join(", ")} · surface=${c.shop.surface} · viewOnce=${c.viewOnce === true ? "SIM" : "omitido"}`
}
