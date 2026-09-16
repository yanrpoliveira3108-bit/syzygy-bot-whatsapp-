// features/flood/presets/index.js
import { getPresetDef, clampPresetLimits, listPresetIds } from "../config.js"
import { buildSendContent as buildText } from "./text.js"
import { buildSendContent as buildMention } from "./mention.js"
import { buildSendContent as buildMedia } from "./media.js"
import { buildSendContent as buildPayment } from "./payment.js"
import { buildSendContent as buildShopping } from "./shopping.js"
import { buildSendContent as buildCustom } from "./custom.js"

const BUILDERS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment,
    shopping: buildShopping,
    custom: buildCustom
}

export function loadPreset(id, overlay = {}) {
    const base = getPresetDef(id)
    if (!base) return { ok: false, error: "PRESET_UNKNOWN" }
    const merged = clampPresetLimits({ ...base, ...overlay, id: base.id, type: overlay.type || base.type })
    if (!["selected", "single"].includes(merged.targetMode)) merged.targetMode = "selected"
    return { ok: true, preset: merged }
}

export function buildContent(preset, ctx = {}) {
    const type = String(preset?.type || "text").toLowerCase()
    const builder = BUILDERS[type] || BUILDERS.text
    return builder(preset, ctx)
}

export function listPresets() {
    return listPresetIds().map(id => {
        const def = getPresetDef(id)
        return def ? clampPresetLimits(def) : null
    }).filter(Boolean)
}
