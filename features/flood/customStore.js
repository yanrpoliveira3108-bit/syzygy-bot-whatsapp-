// features/flood/customStore.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Presets criados pelo dono, persistidos no CONFIG existente (utils/config.js →
// config.json) sob UMA única chave: CONFIG.floodCustomPresets.
//
// Segurança de dados: este módulo NUNCA sobrescreve outras chaves do config.json
// (só lê/escreve o array próprio + chama salvarConfig(), que já é o caminho do
// projeto) e não grava sessão/credencial — não há nada daqui para lá.
//
// Presets reservados: os IDs built-in (text/mention/media/payment-test) não
// podem ser ofuscados por um custom homônimo — senão o "custom" passaria a mudar
// o comportamento de um preset de teste conhecido.
// [v53] "shopping-test" deixou de ser reservado: o tipo não existe mais, então
// reservar o nome só impediria a pessoa de reaproveitar o id.

import { CONFIG, salvarConfig } from "../../utils/config.js"
import { parseAmount, parseCurrency } from "./payment.js"

const RESERVED = new Set([
    "text-test",
    "mention-test",
    "media-test",
    "payment-test"
])

/** Tipos que o registry de presets sabe montar (= FLOOD_PRESET_TYPES). */
export const CUSTOM_TYPES = ["text", "mention", "media", "payment", "custom"]

/** Tipos para os quais o dispatcher "custom" pode delegar (presets/custom.js). */
export const CUSTOM_TIPOS_DELEGADOS = ["text", "mention", "media", "payment"]

export const CUSTOM_STORE_KEY = "floodCustomPresets"

export function slugPresetId(raw) {
    return String(raw || "")
        .trim()
        .toLowerCase()
        // acento sai TRANSFORMADO (São Paulo → sao-paulo), não apagado: id de
        // preset é digitado pelo operador e "s-o-paulo" não é o que ele espera
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
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
 * arena antiga). Título/subtítulo/rodapé são campos de texto livre (usados pelo
 * builder do tipo quando fizer sentido); nenhum campo de card de loja sobreviveu
 * à v53 — tipo "shopping" não existe mais, e preset antigo com esse tipo dá
 * CUSTOM_TYPE_UNSUPPORTED em vez de virar outra coisa em silêncio.
 */
export function saveCustomPreset({ name, type, customType, text, amount, currency, modo, caption, mentions, title, subtitle, footer, format, image, video, document: doc, location, mimetype } = {}, { persist = true } = {}) {
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
    // "custom" é dispatcher: sem customType válido ele não teria para quem
    // delegar, então a recusa é no cadastro (não um fallback silencioso p/ texto).
    if (t === "custom") {
        const alvo = String(customType || "").trim().toLowerCase()
        if (!CUSTOM_TIPOS_DELEGADOS.includes(alvo)) return { ok: false, error: "CUSTOM_TYPE_INVALID", allowed: CUSTOM_TIPOS_DELEGADOS }
        row.customType = alvo
    }
    if (row.customType === "payment" || t === "payment") {
        // mesmo parse do wizard (aceita "12,50", "R$"? não — só número com vírgula
        // ou ponto), para o preset custom não ter regra de valor paralela.
        const a = parseAmount(amount)
        if (!a.ok) return { ok: false, error: a.error || "AMOUNT_INVALID" }
        row.amount = a.value
        const c = parseCurrency(currency || "BRL")
        if (!c.ok) return { ok: false, error: c.error || "CURRENCY_INVALID" }
        row.currency = c.value
    }
    if (caption) row.caption = String(caption)
    if (title) row.title = String(title)
    if (subtitle) row.subtitle = String(subtitle)
    if (footer) row.footer = String(footer)
    if (format) row.format = String(format)
    if (image) row.image = image
    if (video) row.video = video
    if (doc) row.document = doc
    if (location) row.location = location
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
            const extra = p.type === "payment" ? ` · ${Number(p.amount).toFixed(2)} ${p.currency || "BRL"}` : ""
            return `┃ ${i + 1} · ${p.id} (${p.type}${extra} · ${p.modo || "normal"})`
        })
        .join("\n")
}
