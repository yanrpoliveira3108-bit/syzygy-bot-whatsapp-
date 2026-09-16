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
