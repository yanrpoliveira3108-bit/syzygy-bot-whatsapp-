// features/flood/targets.js
// [v53 · AB7] Destinos dos presets de flood. A allowlist paralela deixou de
// existir: o preset obedece à MESMA regra do flood normal (painéis 2/3/8, que
// pegam o alvo da escolha explícita do operador sobre a lista de grupos do bot e
// ignoram os grupos protegidos). Nada de segunda lista de autorização, nada de
// gate extra por tipo — texto, menção, mídia e pagamento entram igual.
//
// O que este módulo é:
//   • normalizeTargetJid() → jid completo ou número puro → forma canônica (null
//     se inválido). Sem isso "5519…" vira destinatário quebrado no relay.
//   • maskJid()            → log/histórico nunca veem o número inteiro.
//   • filterTargets()      → particiona a lista explícita em liberados/barrados
//     com a porteira de grupo protegido do projeto. Lista vazia NUNCA significa
//     "todo mundo": é erro.
//
// O que ele NÃO é: fila, timer, retry, permissão própria, executor de flood.

import { CONFIG } from "../../utils/config.js"
import { rt } from "../../connection/socket.js"
import { normalizeNumber, isGroupJid, isAuthorizedGroup } from "../../utils/permissions.js"

export const BLOCKED_TARGET = "BLOCKED_TARGET"
export const NO_TARGETS = "NO_TARGETS"
export const PROTECTED_GROUP_BLOCKED = "PROTECTED_GROUP_BLOCKED"

const KNOWN_DOMAINS = ["g.us", "s.whatsapp.net", "lid"]

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

/** Nunca imprime o número inteiro: destino também é dado sensível. */
export function maskJid(jid) {
    if (!jid) return "(none)"
    const s = String(jid)
    const [user, domain] = s.split("@")
    if (!user) return "***"
    if (user.length <= 4) return `****@${domain || "?"}`
    return `${user.slice(0, 4)}****${user.slice(-2)}@${domain || "?"}`
}

/** Mesma porteira do flood normal: grupo autorizado do bot é intocável. */
function isProtected(jid, opts = {}) {
    if (typeof opts.isProtected === "function") return opts.isProtected(jid)
    try { return isAuthorizedGroup(jid) } catch { return false }
}

/**
 * @param {Array<string|{id:string}>} jids lista EXPLÍCITA do operador/preset
 * @returns {{ok:boolean, allowed:string[], blocked:Array<{jid:string,reason:string}>, error?:string}}
 */
export function filterTargets(jids, opts = {}) {
    const incoming = Array.isArray(jids) ? jids : []
    const allowed = []
    const blocked = []
    const seen = new Set()

    if (!incoming.length) {
        return {
            ok: false,
            error: NO_TARGETS,
            allowed,
            blocked,
            message: "nenhum destino informado — o flood não escolhe alvo sozinho"
        }
    }

    for (const raw of incoming) {
        const original = String((raw && raw.id) || raw || "")
        const jid = normalizeTargetJid(raw && typeof raw === "object" ? raw.id : raw)
        if (!jid) {
            blocked.push({ jid: original, reason: BLOCKED_TARGET })
            continue
        }
        if (seen.has(jid)) continue
        seen.add(jid)
        if (isGroupJid(jid) && isProtected(jid, opts)) {
            blocked.push({ jid, reason: PROTECTED_GROUP_BLOCKED })
            continue
        }
        allowed.push(jid)
    }

    if (!allowed.length) return { ok: false, error: BLOCKED_TARGET, allowed, blocked }
    return { ok: true, allowed, blocked }
}

/** Grupo protegido? (exportado para quem precisa avisar sem duplicar a regra.) */
export function isProtectedGroupJid(jid) {
    return isGroupJid(jid) && isProtected(jid)
}

// ─── Seleção corrente do operador ────────────────────────────────────────────
// Os atalhos de texto (paymenttest, texttest, 2/preset/<id>) não pedem alvo a
// cada disparo: eles usam a ÚLTIMA escolha feita no painel do flood — o mesmo
// cache que o flood de texto usa. Sem escolha feita, o atalho recusa (e diz como
// escolher) em vez de adivinhar.
export function setFloodSelection(jids, { dono = null } = {}) {
    const lista = Array.isArray(jids) ? jids : []
    const rt = getRt()
    if (!rt) return []
    const norm = []
    const seen = new Set()
    for (const raw of lista) {
        const jid = normalizeTargetJid(raw && typeof raw === "object" ? raw.id : raw)
        if (!jid || seen.has(jid)) continue
        seen.add(jid)
        norm.push(jid)
    }
    if (dono) rt.floodSelection = rt.floodSelection || {}
    if (dono) rt.floodSelection[dono] = norm
    else rt.floodSelectionGlobal = norm
    return norm
}

export function getFloodSelection(dono = null) {
    const rt = getRt()
    if (!rt) return []
    const lista = dono && rt.floodSelection ? rt.floodSelection[dono] : rt.floodSelectionGlobal
    return Array.isArray(lista) ? lista : []
}

export function clearFloodSelection(dono = null) {
    const rt = getRt()
    if (!rt) return
    if (dono && rt.floodSelection) delete rt.floodSelection[dono]
    else rt.floodSelectionGlobal = []
}

function getRt() {
    try { return rt() } catch { return null }
}

/**
 * Resumo de alvo para menu/log — mascarado e curto. `null` vira "nenhum", porque
 * "nenhum alvo" é informação, não erro de formatação.
 */
export function resumoAlvosTexto(jids, { max = 3 } = {}) {
    const lista = Array.isArray(jids) ? jids.filter(Boolean) : []
    if (!lista.length) return "nenhum (use 36 · escolher grupos)"
    const mostrados = lista.slice(0, max).map(j => maskJid(j && j.id ? j.id : j))
    const resto = lista.length - mostrados.length
    return `${lista.length} grupo(s): ${mostrados.join(", ")}${resto > 0 ? ` +${resto}` : ""}`
}

/** Números de grupo "limpos" a partir da lista do dono (para persistir em config). */
export function alvosValidos(jids, opts = {}) {
    const r = filterTargets(jids, opts)
    return r.ok ? r.allowed : []
}

/** Quantos grupos o bot tem autorizados — usado em texto de menu/diagnóstico. */
export function contagemGruposAutorizados() {
    const raw = Array.isArray(CONFIG.gruposAutorizados) ? CONFIG.gruposAutorizados : []
    return raw.map(g => normalizeTargetJid(g && g.id ? g.id : g)).filter(Boolean).length
}
