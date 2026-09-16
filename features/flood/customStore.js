// features/flood/customStore.js
// Presets de flood/payment criados pelo dono. Sem sessão, sem credencial.

import { CONFIG, salvarConfig } from "../../utils/config.js"

const RESERVED = new Set(["text-test", "mention-test", "media-test", "payment-test", "shopping-test"])

export function slugPresetId(raw) {
    return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "")
        .slice(0, 32)
}

export function listCustomPresets() {
    if (!Array.isArray(CONFIG.floodCustomPresets)) CONFIG.floodCustomPresets = []
    return CONFIG.floodCustomPresets
}

export function getCustomPreset(id) {
    const key = slugPresetId(id)
    if (!key) return null
    return listCustomPresets().find(p => p && p.id === key) || null
}

export function saveCustomPreset({ name, type, text, amount, currency, modo, caption } = {}) {
    const id = slugPresetId(name)
    if (!id) return { ok: false, error: "NAME" }
    if (RESERVED.has(id)) return { ok: false, error: "RESERVED" }
    const t = String(type || "payment").toLowerCase()
    const row = {
        id,
        type: t === "payment" ? "payment" : t,
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
    const list = listCustomPresets()
    const idx = list.findIndex(p => p.id === id)
    if (idx >= 0) list[idx] = row
    else list.push(row)
    CONFIG.floodCustomPresets = list
    salvarConfig()
    return { ok: true, preset: row, updated: idx >= 0 }
}

export function deleteCustomPreset(idOrIndex) {
    const list = listCustomPresets()
    const str = String(idOrIndex || "").trim()
    const asNum = parseInt(str.replace(/\D/g, ""), 10)
    let idx = -1
    if (/^\d+$/.test(str) && asNum >= 1 && asNum <= list.length) idx = asNum - 1
    else {
        const key = slugPresetId(str)
        idx = list.findIndex(p => p.id === key)
    }
    if (idx < 0) return { ok: false, error: "NOT_FOUND" }
    const removed = list.splice(idx, 1)[0]
    CONFIG.floodCustomPresets = list
    salvarConfig()
    return { ok: true, removed }
}

export function formatCustomPresetsTexto() {
    const list = listCustomPresets()
    if (!list.length) return "Nenhum preset custom. Use c para criar."
    return list.map((p, i) => {
        const extra = p.type === "payment" ? ` ${Number(p.amount).toFixed(2)} ${p.currency}` : ""
        return `  ${i + 1} · ${p.id} (${p.type}${extra} · ${p.modo || "normal"})`
    }).join("\n")
}
