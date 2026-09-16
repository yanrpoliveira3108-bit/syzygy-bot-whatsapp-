// features/flood/presets/payment.js
import { createPaymentPayload, buildPaymentContent } from "../payment.js"

export const TYPE = "payment"

export function buildPayload(preset) {
    return createPaymentPayload({
        text: preset?.text || "Pagamento de teste",
        amount: preset?.amount ?? 25.90,
        currency: preset?.currency || "BRL"
    })
}

export function buildSendContent(preset, { from, mentions } = {}) {
    const payload = buildPayload(preset)
    if (!payload.ok) {
        throw Object.assign(new Error(payload.error), { code: payload.error, payload })
    }
    return buildPaymentContent(payload, { from, mentions })
}
