// features/flood/presets/text.js
// [PRESET · recuperado da arena 01a0aaae]
// O mais simples de todos: só { text }. Os limites (maxMessages/interval/
// cooldown) continuam sendo os do config.js — o builder não tem poder de
// aumentar nada, e é assim que o sistema continua sendo teste controlado.

export const TYPE = "text"

export function buildSendContent(preset = {}) {
    const text = String(preset?.text || "SYZYGY text-test")
    return { text }
}

/**
 * Builder por iteração do executarFlood (AB7): o laço já incrementa o corpo com
 * os \u200b de unicidade — aqui é só reaproveitar esse corpo.
 */
export function makeIterationBuilder(preset = {}) {
    const base = buildSendContent(preset)
    return (ctx = {}) => {
        const body = typeof ctx?.body === "string" && ctx.body.length ? ctx.body : base.text
        return { text: body }
    }
}
