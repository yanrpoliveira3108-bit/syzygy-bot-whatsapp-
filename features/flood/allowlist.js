// features/flood/allowlist.js
// Destinos de teste: SOMENTE JIDs explicitamente autorizados.
// Sem allContacts / allGroups / everyone.

import { CONFIG } from "../../utils/config.js"
import { normalizeNumber, isGroupJid } from "../../utils/permissions.js"

export const BLOCKED_TARGET = "BLOCKED_TARGET"
export const ALLOWLIST_EMPTY = "ALLOWLIST_EMPTY"

export function getAllowlist() {
    const raw = Array.isArray(CONFIG.floodAllowlist) ? CONFIG.floodAllowlist : []
    const out = []
    const seen = new Set()
    for (const item of raw) {
        const jid = normalizeTargetJid(item)
        if (!jid || seen.has(jid)) continue
        seen.add(jid)
        out.push(jid)
    }
    return out
}

export function normalizeTargetJid(value) {
    if (!value) return null
    const s = String(value).trim()
    if (!s) return null
    if (s.endsWith("@g.us") || s.endsWith("@s.whatsapp.net") || s.endsWith("@lid")) return s
    if (s.includes("@")) {
        const [user, domain] = s.split("@")
        if (!user) return null
        if (domain === "g.us" || domain === "s.whatsapp.net" || domain === "lid") return s
        return null
    }
    const n = normalizeNumber(s)
    if (!n) return null
    if (n.length < 10 || n.length > 20) return null
    return `${n}@s.whatsapp.net`
}

export function isOnAllowlist(jid) {
    const target = normalizeTargetJid(jid)
    if (!target) return false
    const list = getAllowlist()
    const tNum = normalizeNumber(target)
    for (const a of list) {
        if (a === target) return true
        if (tNum && normalizeNumber(a) === tNum) return true
    }
    return false
}

export function filterAllowlist(jids) {
    const list = getAllowlist()
    if (!list.length) return { ok: false, error: ALLOWLIST_EMPTY, allowed: [], blocked: [] }
    const allowed = []
    const blocked = []
    const seen = new Set()
    const incoming = Array.isArray(jids) && jids.length ? jids : list
    for (const raw of incoming) {
        const jid = normalizeTargetJid(raw)
        if (!jid) {
            blocked.push({ jid: String(raw || ""), reason: BLOCKED_TARGET })
            continue
        }
        if (!isOnAllowlist(jid)) {
            blocked.push({ jid, reason: BLOCKED_TARGET })
            continue
        }
        if (seen.has(jid)) continue
        seen.add(jid)
        allowed.push(jid)
    }
    return { ok: true, allowed, blocked, empty: !list.length }
}

export function addAllowlistJid(value) {
    const jid = normalizeTargetJid(value)
    if (!jid) return { ok: false, error: "JID_INVALID" }
    if (!Array.isArray(CONFIG.floodAllowlist)) CONFIG.floodAllowlist = []
    if (isOnAllowlist(jid)) return { ok: true, already: true, jid }
    CONFIG.floodAllowlist.push(jid)
    return { ok: true, added: true, jid, list: getAllowlist() }
}

export function removeAllowlistJid(valueOrIndex) {
    if (!Array.isArray(CONFIG.floodAllowlist)) CONFIG.floodAllowlist = []
    const str = String(valueOrIndex || "").trim()
    const idx = parseInt(str.replace(/\D/g, ""), 10)
    if (!Number.isNaN(idx) && /^\d+$/.test(str) && idx >= 1 && idx <= CONFIG.floodAllowlist.length) {
        const removed = CONFIG.floodAllowlist.splice(idx - 1, 1)[0]
        return { ok: true, removed, byIndex: true, list: getAllowlist() }
    }
    const jid = normalizeTargetJid(str)
    if (!jid) return { ok: false, error: "NOT_FOUND" }
    const n = normalizeNumber(jid)
    const pos = CONFIG.floodAllowlist.findIndex(a => a === jid || normalizeNumber(a) === n)
    if (pos < 0) return { ok: false, error: "NOT_FOUND" }
    const removed = CONFIG.floodAllowlist.splice(pos, 1)[0]
    return { ok: true, removed, byIndex: false, list: getAllowlist() }
}

export function formatAllowlistTexto() {
    const list = getAllowlist()
    if (!list.length) return "Allowlist vazia — nenhum destino autorizado."
    return list.map((jid, i) => `  ${i + 1} · ${maskJid(jid)}${isGroupJid(jid) ? " (grupo)" : ""}`).join("\n")
}

export function maskJid(jid) {
    if (!jid) return "(none)"
    const s = String(jid)
    const [user, domain] = s.split("@")
    if (!user) return "***"
    if (user.length <= 4) return `****@${domain || "?"}`
    return `${user.slice(0, 4)}****${user.slice(-2)}@${domain || "?"}`
}
