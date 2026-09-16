// features/flood/presets/text.js
export const TYPE = "text"

export function buildSendContent(preset) {
    const text = String(preset?.text || "SYZYGY text-test")
    return { text }
}
