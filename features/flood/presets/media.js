// features/flood/presets/media.js
import fs from "fs"
import { CONFIG, MENU_IMAGE_PATH } from "../../../utils/config.js"

export const TYPE = "media"

export function resolveMediaBuffer(preset) {
    if (preset?.buffer && Buffer.isBuffer(preset.buffer) && preset.buffer.length) return preset.buffer
    const path = preset?.mediaPath || CONFIG.menuImage || MENU_IMAGE_PATH
    try {
        if (path && fs.existsSync(path)) {
            const buf = fs.readFileSync(path)
            if (buf && buf.length) return buf
        }
    } catch {}
    return null
}

export function buildSendContent(preset, { buffer } = {}) {
    const img = buffer || resolveMediaBuffer(preset)
    if (!img) {
        throw Object.assign(new Error("MEDIA_UNAVAILABLE"), { code: "MEDIA_UNAVAILABLE" })
    }
    return {
        image: img,
        caption: String(preset?.caption || preset?.text || "SYZYGY media-test")
    }
}
