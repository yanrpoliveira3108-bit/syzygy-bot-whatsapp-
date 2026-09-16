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
