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
