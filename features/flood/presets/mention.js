// features/flood/presets/mention.js
// [PRESET · recuperado da arena 01a0aaae — com a regra de segurança preservada]
// "Hidetag" de teste. Regras duras, e são elas que impedem isto de virar
// marcação indiscriminada:
//   • mentions VÊM DE UMA LISTA EXPLÍCITA (quem chama passou a lista);
//   • o texto NÃO pode conter telefones visíveis (nada de "@5519…" no corpo);
//   • NUNCA injetamos números no texto para simular marcação;
//   • NUNCA caímos para "todos os participantes" quando a lista vem vazia.
// O AB7 tem `mencionarTodosFantasma()` (marcar todos) — ele NÃO é usado por este
// preset. Quando o projeto precisar resolver participantes, quem decide a lista
// é o chamador (ex.: cache de grupo do stateHandler), e o teto é MENTION_MAX.

export const TYPE = "mention"
export const MENTION_MAX = 20
const JID_LIKE = /^[^@\s]+@(?:g\.us|s\.whatsapp\.net|lid)$/

/** Telefones visíveis no corpo = o operador montou a marcação na mão. Recusado. */
export function visibleTextHasPhones(text) {
    return /@\d{8,}/.test(String(text || ""))
}

export function looksLikePhoneRun(text) {
    return /(?:^|\D)\+?\d{10,15}(?:\D|$)/.test(String(text || ""))
}

/**
 * Aceita somente jids válidos, sem duplicatas e até MENTION_MAX.
 * Entrada não-array → lista vazia (e o builder NÃO marca ninguém).
 */
export function sanitizeMentions(list, { max = MENTION_MAX } = {}) {
    const out = []
    const seen = new Set()
    if (!Array.isArray(list)) return out
    const cap = Math.max(1, Math.min(Number(max) || MENTION_MAX, MENTION_MAX))
    for (const raw of list) {
        const s = String(raw || "").trim()
        if (!JID_LIKE.test(s) || seen.has(s)) continue
        seen.add(s)
        out.push(s)
        if (out.length >= cap) break
    }
    return out
}

export function buildSendContent(preset = {}, { mentions } = {}) {
    const text = String(preset?.text || "SYZYGY mention-test")
    if (visibleTextHasPhones(text)) {
        throw Object.assign(new Error("MENTION_LEAK"), { code: "MENTION_LEAK", message: "o texto do preset contém telefones visíveis" })
    }
    const content = { text }
    const list = sanitizeMentions(mentions !== undefined ? mentions : preset?.mentions)
    if (list.length) content.mentions = list
    return content
}

export function makeIterationBuilder(preset = {}, ctx = {}) {
    const base = buildSendContent(preset, ctx)
    return (iterCtx = {}) => {
        const body = typeof iterCtx?.body === "string" && iterCtx.body.length ? iterCtx.body : base.text
        if (visibleTextHasPhones(body)) {
            throw Object.assign(new Error("MENTION_LEAK"), { code: "MENTION_LEAK", message: "corpo da iteração contém telefones visíveis" })
        }
        const out = { text: body }
        if (base.mentions) out.mentions = base.mentions
        return out
    }
}
