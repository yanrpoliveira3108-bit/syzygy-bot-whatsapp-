// features/flood/presets/custom.js
// Custom reusa os builders dos outros tipos — mesmo engine, mesmos limites.

import { buildSendContent as textContent } from "./text.js"
import { buildSendContent as mentionContent } from "./mention.js"
import { buildSendContent as mediaContent } from "./media.js"
import { buildSendContent as paymentContent } from "./payment.js"

export const TYPE = "custom"

export function buildSendContent(preset, ctx = {}) {
    const t = String(preset?.customType || preset?.type || "text").toLowerCase()
    if (t === "payment") return paymentContent(preset, ctx)
    if (t === "mention") return mentionContent(preset, ctx)
    if (t === "media") return mediaContent(preset, ctx)
    return textContent(preset, ctx)
}
