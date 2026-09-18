// features/flood/presets/index.js
// [PRESET · recuperado da arena 01a0aaae e adaptado ao AB7]
// Registry: id → definição (config.js, com limites clamped) → builder do tipo.
// É o único lugar que sabe "qual tipo usa qual builder". Não envia, não fila,
// não conhece socket: produção de conteúdo validado.
//
// Tipos finais: text · mention · media · payment · custom.
// [v53] O tipo "shopping" saiu do projeto (arquivos e builder removidos). Para
// religá-lo depois: crie ./shopping.js com {buildSendContent,makeIterationBuilder}
// e registre nas duas tabelas abaixo — nada mais no flood muda.

import { getPresetDef, clampPresetLimits, listPresetIds, FLOOD_PRESET_TYPES, FLOOD_PRESET_HARD_CAP } from "../config.js"
import { buildSendContent as buildText, makeIterationBuilder as iterText } from "./text.js"
import { buildSendContent as buildMention, makeIterationBuilder as iterMention } from "./mention.js"
import { buildSendContent as buildMedia, makeIterationBuilder as iterMedia } from "./media.js"
import { buildSendContent as buildPayment, makeIterationBuilder as iterPayment } from "./payment.js"
import { buildSendContent as buildCustom, makeIterationBuilder as iterCustom } from "./custom.js"

export const BUILDERS = {
    text: buildText,
    mention: buildMention,
    media: buildMedia,
    payment: buildPayment,
    custom: buildCustom
}

export const ITER_BUILDERS = {
    text: iterText,
    mention: iterMention,
    media: iterMedia,
    payment: iterPayment,
    custom: iterCustom
}

export const PRESET_TYPES = FLOOD_PRESET_TYPES

function typeOf(preset) {
    return String(preset?.type || "text").toLowerCase()
}

/**
 * @param {string} id  preset built-in ou custom (customStore)
 * @param {object} [overlay] campos digitados no wizard (nunca sobem limites)
 */
export function loadPreset(id, overlay = {}) {
    const def = getPresetDef(id)
    if (!def) return { ok: false, error: "PRESET_UNKNOWN" }
    // clamp DEPOIS do overlay: é o hard cap quem manda, o overlay não afrouxa.
    const merged = clampPresetLimits({ ...def, ...(overlay && typeof overlay === "object" ? overlay : {}), id: def.id, type: overlay?.type || def.type })
    // O preset é o TETO de mensagens dele: overlay/config só pode REDUZIR. Sem
    // isto, um overlay conseguiria transformar um preset de "3x de teste" em 10x
    // — dentro do hard cap, mas fora do que o preset representa.
    const tetoDoPreset = Math.min(Number(def.maxMessages) || FLOOD_PRESET_HARD_CAP.maxMessages, FLOOD_PRESET_HARD_CAP.maxMessages)
    merged.maxMessages = Math.min(merged.maxMessages, Math.max(1, tetoDoPreset))
    if (!["selected", "single"].includes(merged.targetMode)) merged.targetMode = "selected"
    const type = typeOf(merged)
    if (!BUILDERS[type]) return { ok: false, error: "PRESET_TYPE_UNSUPPORTED", type }
    return { ok: true, preset: merged, type }
}

/** Conteúdo de send já validado pelo builder do tipo. */
export function buildContent(preset = {}, ctx = {}) {
    const builder = BUILDERS[typeOf(preset)] || BUILDERS.text
    return builder(preset, ctx)
}

/** Builder por iteração para o executarFlood do AB7 (mesmo laço, mesmo ritmo). */
export function makeIterationBuilder(preset = {}, ctx = {}) {
    const builder = ITER_BUILDERS[typeOf(preset)] || ITER_BUILDERS.text
    return builder(preset, ctx)
}

export function listPresets() {
    return listPresetIds()
        .map(id => {
            const def = getPresetDef(id)
            return def ? clampPresetLimits(def) : null
        })
        .filter(Boolean)
}

/** Resumo sem segredo: id, tipo, limites e chaves do payload (não o conteúdo). */
export function describePreset(preset = {}) {
    const type = typeOf(preset)
    return {
        id: preset.id,
        type,
        maxMessages: preset.maxMessages,
        interval: preset.interval,
        concurrency: preset.concurrency,
        cooldown: preset.cooldown,
        timeout: preset.timeout,
        targetMode: preset.targetMode,
        floodModo: preset.floodModo || null
    }
}

export function listPresetsTexto() {
    const l = listPresets()
    if (!l.length) return "_(nenhum preset de flood cadastrado)_"
    return l
        .map(p => `  *${p.id}* · ${p.type} · ${p.maxMessages}x · ${p.interval}ms · cooldown ${Math.round(p.cooldown / 1000)}s`)
        .join("\n")
}
