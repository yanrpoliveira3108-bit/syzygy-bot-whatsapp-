// features/flood/customStore.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Presets criados pelo dono, persistidos no CONFIG existente (utils/config.js →
// config.json) sob UMA única chave: CONFIG.floodCustomPresets.
//
// Segurança de dados: este módulo NUNCA sobrescreve outras chaves do config.json
// (só lê/escreve o array próprio + chama salvarConfig(), que já é o caminho do
// projeto) e não grava sessão/credencial — não há nada daqui para lá.
//
// Presets reservados: os IDs built-in (text/mention/media/payment/shopping-test)
// não podem ser ofuscados por um custom homônimo — senão o "custom" passaria a
// mudar o comportamento de um preset de teste conhecido.

import { CONFIG, salvarConfig } from "../../utils/config.js"

const RESERVED = new Set([
    "text-test",
    "mention-test",
    "media-test",
    "payment-test",
    "shopping-test"
])

/** Tipos que o registry de presets sabe montar (shopping = builder AB7 atual). */
export const CUSTOM_TYPES = ["text", "mention", "media", "payment", "shopping", "custom"]

export const CUSTOM_STORE_KEY = "floodCustomPresets"

export function slugPresetId(raw) {
    return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 32)
}

export function listCustomPresets() {
    if (!Array.isArray(CONFIG[CUSTOM_STORE_KEY])) CONFIG[CUSTOM_STORE_KEY] = []
    return CONFIG[CUSTOM_STORE_KEY]
}

export function getCustomPreset(id) {
    const key = slugPresetId(id)
    if (!key) return null
    return listCustomPresets().find(p => p && p.id === key) || null
}

export function isReservedPresetId(id) {
    return RESERVED.has(slugPresetId(id))
}

/**
 * Cria/atualiza um preset custom. `amount` só é exigido em payment (como era na
 * arena antiga); shopping reusa os campos do adapter AB7 (title/subtitle/footer/
 * shop/viewOnce/delivery) sem inventar nada novo.
 */
export function saveCustomPreset({ name, type, text, amount, currency, modo, caption, mentions, title, subtitle, footer, shop, viewOnce, delivery, format, image, video, document: doc, location, product, mimetype } = {}, { persist = true } = {}) {
    const id = slugPresetId(name)
    if (!id) return { ok: false, error: "NAME" }
    if (RESERVED.has(id)) return { ok: false, error: "RESERVED" }
    const t = String(type || "payment").toLowerCase()
    if (!CUSTOM_TYPES.includes(t)) return { ok: false, error: "TYPE_INVALID", allowed: CUSTOM_TYPES }

    const row = {
        id,
        type: t,
        text: String(text || "").trim() || (t === "payment" ? "Pagamento de teste" : "SYZYGY"),
        targetMode: "selected",
        modo: modo || CONFIG.floodModo || "normal"
    }
    if (t === "payment") {
        row.amount = Number(amount)
        if (!Number.isFinite(row.amount) || row.amount <= 0) return { ok: false, error: "AMOUNT_INVALID" }
        row.currency = String(currency || "BRL").trim().toUpperCase() || "BRL"
    }
    if (caption) row.caption = String(caption)
    if (title) row.title = String(title)
    if (subtitle) row.subtitle = String(subtitle)
    if (footer) row.footer = String(footer)
    if (shop && typeof shop === "object") row.shop = { ...(row.shop || {}), ...shop }
    if (viewOnce !== undefined) row.viewOnce = viewOnce === true
    if (delivery) row.delivery = String(delivery)
    if (format) row.format = String(format)
    if (image) row.image = image
    if (video) row.video = video
    if (doc) row.document = doc
    if (location) row.location = location
    if (product) row.product = product
    if (mimetype) row.mimetype = String(mimetype)
    // Mention: só lista explícita (o builder recusa números no texto).
    if (Array.isArray(mentions) && mentions.length) row.mentions = mentions.map(String)

    const list = listCustomPresets()
    const idx = list.findIndex(p => p && p.id === id)
    if (idx >= 0) list[idx] = { ...list[idx], ...row }
    else list.push(row)
    CONFIG[CUSTOM_STORE_KEY] = list
    // persist=false é o que os TESTES usam: salvarConfig() escreve config.json
    // inteiro, e um teste não tem o direito de tocá-lo no ambiente do projeto.
    if (persist) { try { salvarConfig() } catch {} }
    return { ok: true, preset: row, updated: idx >= 0 }
}

export function updateCustomPreset(id, patch = {}, opts = {}) {
    const key = slugPresetId(id)
    const existing = getCustomPreset(key)
    if (!existing) return { ok: false, error: "NOT_FOUND" }
    return saveCustomPreset({ ...existing, ...patch, name: key }, opts)
}

export function deleteCustomPreset(idOrIndex, { persist = true } = {}) {
    const list = listCustomPresets()
    const str = String(idOrIndex || "").trim()
    const asNum = parseInt(str.replace(/\D/g, ""), 10)
    let idx = -1
    if (/^\d+$/.test(str) && asNum >= 1 && asNum <= list.length) idx = asNum - 1
    else {
        const key = slugPresetId(str)
        idx = list.findIndex(p => p && p.id === key)
    }
    if (idx < 0) return { ok: false, error: "NOT_FOUND" }
    const removed = list.splice(idx, 1)[0]
    CONFIG[CUSTOM_STORE_KEY] = list
    if (persist) { try { salvarConfig() } catch {} }
    return { ok: true, removed }
}

export function formatCustomPresetsTexto() {
    const list = listCustomPresets()
    if (!list.length) return "Nenhum preset custom cadastrado."
    return list
        .map((p, i) => {
            const extra = p.type === "payment" ? ` · R$ ${Number(p.amount).toFixed(2)} ${p.currency}` : ""
            const shop = p.type === "shopping" ? ` · surface ${p.shop?.surface ?? "?"}` : ""
            return `  ${i + 1} · ${p.id} (${p.type}${extra}${shop} · ${p.modo || "normal"})`
        })
        .join("\n")
}
