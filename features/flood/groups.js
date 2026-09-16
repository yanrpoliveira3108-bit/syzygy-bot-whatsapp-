// features/flood/groups.js
// Escolha explícita de grupos (1 ou 1,3,5). Sem allowlist, sem allGroups.

export const TARGETS_REQUIRED = "TARGETS_REQUIRED"

export function parseSelectedGroups(cache, raw) {
    const txt = String(raw == null ? "" : raw).trim()
    if (!txt) return { ok: false, error: "USAGE", entries: [], invalid: [] }
    if (txt.includes("|")) return { ok: false, error: "USAGE", entries: [], invalid: [] }
    const tokens = txt.split(",").map(s => s.trim()).filter(Boolean)
    if (!tokens.length) return { ok: false, error: "USAGE", entries: [], invalid: [] }
    const entries = []
    const invalid = []
    const seen = new Set()
    for (const tok of tokens) {
        if (!/^0*\d+$/.test(tok)) {
            invalid.push(tok)
            continue
        }
        const n = parseInt(tok, 10)
        if (!Number.isFinite(n) || n < 1) {
            invalid.push(tok)
            continue
        }
        const g = cache && cache[n]
        if (!g || !g.id) {
            invalid.push(String(n))
            continue
        }
        if (seen.has(g.id)) continue
        seen.add(g.id)
        entries.push({ id: g.id, subject: g.subject || g.id, isAdmin: !!g.isAdmin, index: n })
    }
    if (!entries.length) return { ok: false, error: "NONE", entries: [], invalid }
    return { ok: true, entries, invalid }
}

export function extractTargetJids(list) {
    const out = []
    const seen = new Set()
    if (!Array.isArray(list)) return out
    for (const item of list) {
        const jid = item && typeof item === "object" ? item.id : item
        const s = String(jid || "").trim()
        if (!s || seen.has(s)) continue
        seen.add(s)
        out.push(s)
    }
    return out
}
