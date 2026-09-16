// features/flood/presets/media.js
// [PRESET · recuperado da arena 01a0aaae]
// Mídia de teste controlado. Fonte do buffer, nesta ordem:
//   1) buffer fornecido por quem executa (o executor do AB7 já tem o arquivo em
//      mão — ex.: mídia baixada/preparada no wizard);
//   2) caminho configurado no preset (mediaPath / image);
//   3) imagem de menu do projeto (CONFIG.menuImage → MENU_IMAGE_PATH).
// Se nenhuma existir: ERRO ESTRUTURADO MEDIA_UNAVAILABLE — o job reporta o item
// bloqueado e segue (dry-run apenas descreve o que faltou). Nada aqui "cria"
// mídia fake nem troca por texto para parecer que funcionou.

import fs from "fs"
import { CONFIG, MENU_IMAGE_PATH, MAX_IMAGE_BYTES } from "../../../utils/config.js"

export const TYPE = "media"

function readIfPresent(path) {
    try {
        if (!path || typeof path !== "string") return null
        if (!fs.existsSync(path)) return null
        const st = fs.statSync(path)
        if (!st.isFile() || st.size <= 0 || st.size > MAX_IMAGE_BYTES) return null
        const buf = fs.readFileSync(path)
        return buf && buf.length ? buf : null
    } catch {
        return null
    }
}

/** @returns {Buffer|null} */
export function resolveMediaBuffer(preset = {}, ctx = {}) {
    if (ctx?.buffer && Buffer.isBuffer(ctx.buffer) && ctx.buffer.length) return ctx.buffer
    if (preset?.buffer && Buffer.isBuffer(preset.buffer) && preset.buffer.length) return preset.buffer
    const candidates = [
        preset?.mediaPath,
        typeof preset?.image === "string" ? preset.image : null
    ]
    // Fallback para a imagem de menu SÓ quando o preset não disse o contrário:
    // um preset de mídia que aponta para arquivo inexistente tem de dar
    // MEDIA_UNAVAILABLE, não enviar a foto do bot sem avisar.
    if (preset?.menuFallback !== false) {
        candidates.push(CONFIG.menuImage, MENU_IMAGE_PATH)
    }
    for (const p of candidates) {
        const buf = readIfPresent(p)
        if (buf) return buf
    }
    return null
}

export function mediaCaption(preset = {}) {
    return String(preset?.caption || preset?.text || "SYZYGY media-test")
}

export function buildSendContent(preset = {}, ctx = {}) {
    const img = resolveMediaBuffer(preset, ctx)
    if (!img) {
        throw Object.assign(new Error("MEDIA_UNAVAILABLE"), {
            code: "MEDIA_UNAVAILABLE",
            message: "nenhuma mídia encontrada (buffer, preset.mediaPath, CONFIG.menuImage ou MENU_IMAGE_PATH)"
        })
    }
    const content = { image: img, caption: mediaCaption(preset) }
    if (typeof preset?.mimetype === "string" && preset.mimetype.trim()) content.mimetype = preset.mimetype.trim()
    return content
}

/**
 * Mídia é o mesmo arquivo em toda iteração (caption com os \u200b do laço para
 * unicidade visual). Não fazemos upload por iteração: o fork cuida disso.
 */
export function makeIterationBuilder(preset = {}, ctx = {}) {
    const base = buildSendContent(preset, ctx)
    return (iterCtx = {}) => {
        const out = { image: base.image, caption: mediaCaption(preset) }
        if (base.mimetype) out.mimetype = base.mimetype
        const body = typeof iterCtx?.body === "string" ? iterCtx.body : ""
        // só usa o corpo do laço se o preset não definiu caption (evita caption
        // duplicada/diferente do que foi validado)
        if (!preset?.caption && body) out.caption = body
        return out
    }
}
