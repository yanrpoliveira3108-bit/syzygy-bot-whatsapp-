// features/flood/presets/shopping.js
import { createShoppingPayload, buildShoppingContent } from "../shopping.js"

export const TYPE = "shopping"

export function buildPayload(preset) {
    return createShoppingPayload(preset)
}

export function buildSendContent(preset, { businessOwnerJid } = {}) {
    const payload = buildPayload(preset)
    if (!payload.ok) {
        throw Object.assign(new Error(payload.error), { code: payload.error, payload })
    }
    return buildShoppingContent(payload, { businessOwnerJid })
}
