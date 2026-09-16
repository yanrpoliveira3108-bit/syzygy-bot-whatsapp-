// features/flood/allowlist.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Destinos de teste controlado: SOMENTE JIDs explicitamente autorizados.
//
// REGRA (não negociável, e é ela que mantém isto um sistema de TESTE):
//   destino explicitamente autorizado → permitido
//   destino não autorizado            → bloqueado
// NÃO existe "allGroups", "allContacts", "everyone", "todos os participantes".
// Quem adiciona na allowlist é o dono; o flood de preset nunca adiciona sozinho.
//
// Reuso do AB7 (sem duplicar normalização/permissão):
//   normalizeNumber / isGroupJid / isAuthorizedGroup  ← utils/permissions.js
// O bloco de GRUPO PROTEGIDO continua sendo o do projeto (isAuthorizedGroup):
// aqui ele é aplicado em filterTargets(), para preset nenhum "esquecer" a porteira.

import { CONFIG } from "../../utils/config.js"
import { normalizeNumber, isGroupJid, isAuthorizedGroup } from "../../utils/permissions.js"

export const BLOCKED_TARGET = "BLOCKED_TARGET"
export const ALLOWLIST_EMPTY = "ALLOWLIST_EMPTY"
export const PROTECTED_GROUP_BLOCKED = "PROTECTED_GROUP_BLOCKED"

const KNOWN_DOMAINS = ["g.us", "s.whatsapp.net", "lid"]

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

/**
 * Aceita jid completo (`x@g.us`, `x@s.whatsapp.net`, `x@lid`), `user@dominio`
 * desconhecido (recusado) ou número puro (→ @s.whatsapp.net).
 * @returns {string|null}
 */
export function normalizeTargetJid(value) {
    if (!value) return null
    const s = String(value).trim()
    if (!s) return null
    if (KNOWN_DOMAINS.some(d => s.endsWith(`@${d}`))) return s
    if (s.includes("@")) {
        const [user, domain] = s.split("@")
        if (!user) return null
        return KNOWN_DOMAINS.includes(domain) ? s : null
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

/**
 * Particiona uma lista de destinos em permitidos/bloqueados.
 * `jids` vazio NUNCA significa "todo mundo": significa "a própria allowlist".
 */
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

/**
 * Allowlist + grupo protegido num passo só (é a porteira que o engine de presets usa).
 * @param {string[]} jids
 * @param {{isProtected?: (jid:string)=>boolean}} [opts]
 */
export function filterTargets(jids, opts = {}) {
    const isProtected = typeof opts.isProtected === "function"
        ? opts.isProtected
        : (jid) => {
            try { return isAuthorizedGroup(jid) } catch { return false }
        }
    const base = filterAllowlist(jids)
    if (!base.ok) return { ...base, allowed: [], blocked: [], protectedBlocked: [] }
    const allowed = []
    const protectedBlocked = []
    for (const jid of base.allowed) {
        if (isGroupJid(jid) && isProtected(jid)) protectedBlocked.push(jid)
        else allowed.push(jid)
    }
    const blocked = [...base.blocked, ...protectedBlocked.map(jid => ({ jid, reason: PROTECTED_GROUP_BLOCKED }))]
    return { ok: true, allowed, blocked, protectedBlocked }
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

/** Nunca imprime o número inteiro: destino de teste também é dado sensível. */
export function maskJid(jid) {
    if (!jid) return "(none)"
    const s = String(jid)
    const [user, domain] = s.split("@")
    if (!user) return "***"
    if (user.length <= 4) return `****@${domain || "?"}`
    return `${user.slice(0, 4)}****${user.slice(-2)}@${domain || "?"}`
}

export function formatAllowlistTexto() {
    const list = getAllowlist()
    if (!list.length) return "Allowlist vazia — nenhum destino autorizado."
    return list
        .map((jid, i) => `  ${i + 1} · ${maskJid(jid)}${isGroupJid(jid) ? " (grupo)" : ""}`)
        .join("\n")
}
