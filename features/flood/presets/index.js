// features/flood/presets/index.js
import { FLOOD_PRESETS, getPresetDef, clampPresetLimits } from "../config.js"
import { buildSendContent as buildText } from "./text.js"
import { buildSendContent as buildMention } from "./mention.js"
import { buildSendContent as buildMedia } from "./media.js"
import { buildSendContent as buildPayment } from "./payment.js"
import { buildSendContent as buildCustom } from "./custom.js"

const BUILDERS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment,
    custom: buildCustom
}

export function loadPreset(id, overlay = {}) {
    const base = getPresetDef(id)
    if (!base) return { ok: false, error: "PRESET_UNKNOWN" }
    const merged = clampPresetLimits({ ...base, ...overlay, id: base.id, type: overlay.type || base.type })
    if (!["allowlist", "single"].includes(merged.targetMode)) merged.targetMode = "allowlist"
    return { ok: true, preset: merged }
}

export function buildContent(preset, ctx = {}) {
    const type = String(preset?.type || "text").toLowerCase()
    const builder = BUILDERS[type] || BUILDERS.text
    return builder(preset, ctx)
}

export function listPresets() {
    return Object.values(FLOOD_PRESETS).map(p => clampPresetLimits(p))
}
