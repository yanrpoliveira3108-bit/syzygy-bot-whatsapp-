// features/flood/presets/mention.js
// Hidetag: texto SEM lista de números; mentions só as passadas (nunca todos os membros).

export const TYPE = "mention"

export function buildSendContent(preset, { mentions = [] } = {}) {
    const text = String(preset?.text || "SYZYGY mention-test")
    const content = { text }
    if (Array.isArray(mentions) && mentions.length) content.mentions = mentions
    return content
}

export function visibleTextHasPhones(text) {
    return /@\d{8,}/.test(String(text || ""))
}
