// features/flood/config.js
// [v53 · AB7] Registro de TIPOS/PRESETS de conteúdo do flood SYZYGY.
//
// Arquitetura (não negociável, e é o que mantém isto um flood e não um sistema
// paralelo): NÃO existe segundo executor. O laço real é `executarFlood()` /
// `executarFloodLote()` em services/groupService.js. Preset é só DESCRIÇÃO DE
// CONTEÚDO + TETO; o envio continua sendo um `sock.sendMessage` só, com o wrap
// de "Ler Mais" da conexão.
//
// Tipos atuais: text · mention · media · payment · custom.
// (O tipo "shopping"/card de loja saiu do projeto nesta versão — quem for
// reimplementar loja depois adiciona um builder em presets/ e registra aqui;
// nada mais muda.)
//
// Fontes de verdade dos payloads:
//   • payment → @lucasmod/boruto-vk7-baileys@2.1.0, lib/Utils/messages.js:725-753
//     (monta requestPaymentMessage) e :1247-1249 (lê). Nenhum campo inventado.
//   • tetos   → FLOOD_PRESET_HARD_CAP abaixo ∧ MAX_FLOOD de utils/config.js.

import { CONFIG, MAX_FLOOD, FLOOD_TIPOS, FLOOD_TIPOS_LABEL, floodMaxEfetivo } from "../../utils/config.js"
import { getCustomPreset, listCustomPresets } from "./customStore.js"

// Nomes de tipo aceitos como conteúdo do flood. "text" = flood clássico.
export const FLOOD_PRESET_TYPES = ["text", "mention", "media", "payment", "custom"]
export const FLOOD_CONTENT_KINDS = ["text", "payment"]

// ─── Tetos absolutos (nem config.json, nem overlay, nem preset afrouxa) ──────
// [v53] Subiram junto com o pedido de "flooder de verdade": o modo mais rápido do
// flood normal é 50ms/lote 8 (FLOOD_MODOS.rapido), então o preset não pode exigir
// mais que isso; e o teto de mensagens por alvo deixou de ser "teste de 3
// mensagens" para ser "o que o operador manda, cercado por MAX_FLOOD".
export const FLOOD_PRESET_HARD_CAP = {
    maxMessages: 100,        // por alvo de um job de preset
    minInterval: 40,         // igual ao FLOOD_MODOS.rapido (v53)
    maxConcurrency: 4,       // alvos em paralelo dentro de um job
    minCooldown: 1000,
    minTimeout: 1000,
    maxTimeout: 30000,
    maxRetries: 2
}

/** Limite de envio por comando do flood clássico (lido do config, com teto duro). */
export const FLOOD_MAX_HARD_CEILING = 5000

// ─── Presets padrão (limites idênticos aos da arena 01a0aaae) ────────────────
export const FLOOD_GENERAL_PRESETS = {
    "text-test": {
        id: "text-test", type: "text", text: "SYZYGY text-test", targetMode: "selected",
        maxMessages: 3, interval: 2000, concurrency: 1, cooldown: 15000, timeout: 15000
    },
    "mention-test": {
        id: "mention-test", type: "mention", text: "SYZYGY mention-test", targetMode: "selected",
        maxMessages: 2, interval: 2500, concurrency: 1, cooldown: 20000, timeout: 15000
    },
    "media-test": {
        id: "media-test", type: "media", caption: "SYZYGY media-test", targetMode: "selected",
        maxMessages: 2, interval: 3000, concurrency: 1, cooldown: 20000, timeout: 20000
    },
    "payment-test": {
        id: "payment-test", type: "payment", text: "Pagamento de teste", amount: 25.9, currency: "BRL",
        targetMode: "selected", maxMessages: 3, interval: 3000, concurrency: 1, cooldown: 30000, timeout: 15000
    }
}

// Defaults de runtime do tipo payment quando ele roda como flood normal (painel 2
// com tipo "pagamento"): o laço/ritmo vêm do FLOOD_MODOS escolhido, não daqui.
export const PAYMENT_PRESET_RUNTIME = {
    targetMode: "selected", maxMessages: 10, interval: 1000, concurrency: 1, cooldown: 5000, timeout: 15000
}

export const FLOOD_PRESETS = { ...FLOOD_GENERAL_PRESETS }

export const DEFAULT_FLOOD_PRESET_ID = "text-test"
export const DEFAULT_PAYMENT_PRESET_ID = "payment-test"

export function getFloodPreset(id) {
    if (!id) return null
    return FLOOD_PRESETS[String(id).trim()] || null
}

function clampInt(n, min, max, fallback) {
    const v = Number(n)
    if (!Number.isFinite(v)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(v)))
}

/**
 * Runtime do flood, lido do CONFIG do projeto (utils/config.js).
 * [v53] Saíram daqui `dryRun`, `testMode` e `allowlist`: o flood obedece à mesma
 * permissão do resto do bot (grupo precisa estar em `gruposAutorizados` pra ser
 * PROTEGIDO, e alvo é sempre escolha explícita do operador), sem gate extra.
 */
export function getFloodRuntimeConfig() {
    return {
        killSwitch: CONFIG.floodKillSwitch === true,
        maxRetries: clampInt(CONFIG.floodMaxRetries, 0, FLOOD_PRESET_HARD_CAP.maxRetries, 1),
        timeoutMs: clampInt(CONFIG.floodTimeoutMs, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000),
        maxMensagens: floodMaxEfetivo(),
        // estabilidade: quantos erros seguidos tolera antes de encerrar o job
        errorStop: clampInt(CONFIG.floodErrorStop, 1, 20, 3),
        // ritmo adaptativo: quando a conexão reclama (429/stream-end) o laço abre
        // o intervalo sozinho em vez de tomar tiro no pé
        paceAdaptativo: CONFIG.floodPaceAdaptativo !== false,
        tipo: FLOOD_TIPOS_LABEL[CONFIG.floodTipo] ? CONFIG.floodTipo : FLOOD_TIPOS.TEXTO
    }
}

/** Rótulo do tipo padrão do flood (mesma fonte do painel 2 e do menu do dono). */
export function floodTipoLabel(tipo = CONFIG.floodTipo) {
    return FLOOD_TIPOS_LABEL[tipo] || FLOOD_TIPOS_LABEL[FLOOD_TIPOS.TEXTO]
}

/**
 * Definição crua de um preset: built-in ou custom (dono/presets/*.json).
 * O overlay do wizard é aplicado depois, em loadPreset (que clampa).
 */
export function getPresetDef(id) {
    if (!id) return null
    const key = String(id).trim().toLowerCase()
    if (FLOOD_PRESETS[key]) {
        const base = { ...FLOOD_PRESETS[key] }
        if (base.type === "payment" && base.maxMessages == null) return { ...PAYMENT_PRESET_RUNTIME, ...base }
        return base
    }
    const custom = getCustomPreset(key)
    if (!custom) return null
    return {
        id: custom.id,
        type: custom.type || "payment",
        customType: custom.customType,
        text: custom.text,
        amount: custom.amount,
        currency: custom.currency,
        caption: custom.caption,
        title: custom.title,
        subtitle: custom.subtitle,
        footer: custom.footer,
        format: custom.format,
        mentions: Array.isArray(custom.mentions) ? [...custom.mentions] : undefined,
        // mídia/atalhos conhecidos do fork (o builder do tipo decide o que usar)
        image: custom.image,
        video: custom.video,
        document: custom.document,
        location: custom.location,
        mimetype: custom.mimetype,
        targetMode: "selected",
        maxMessages: 10,
        interval: 3000,
        concurrency: 1,
        cooldown: 5000,
        timeout: 15000,
        modo: custom.modo
    }
}

export function listPresetIds() {
    const ids = Object.keys(FLOOD_PRESETS)
    for (const p of listCustomPresets()) {
        if (p && p.id && !ids.includes(p.id)) ids.push(p.id)
    }
    return ids
}

/**
 * ÚNICO ponto que aplica os tetos. Preset nenhum (built-in, custom, overlay ou
 * config.json) consegue maxMessages/intervalo/concorrência/cooldown/timeout fora
 * de FLOOD_PRESET_HARD_CAP — é isto que separa "flooder cercado" de disparo solto.
 */
export function clampPresetLimits(preset) {
    const src = preset && typeof preset === "object" ? preset : {}
    const maxMessages = clampInt(src.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const interval = clampInt(src.interval, FLOOD_PRESET_HARD_CAP.minInterval, 60000, 1000)
    const concurrency = clampInt(src.concurrency, 1, FLOOD_PRESET_HARD_CAP.maxConcurrency, 1)
    const cooldown = clampInt(src.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, 300000, 30000)
    const timeout = clampInt(src.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    return { ...src, maxMessages, interval, concurrency, cooldown, timeout }
}

/** Limite de mensagens por alvo de um job (hard cap ∧ teto do config). */
export function clampJobQtd(qtd, preset = null) {
    const classic = getFloodRuntimeConfig().maxMensagens
    const wanted = clampInt(qtd, 1, classic, 1)
    // Sem preset (flood clássico digitado no painel 2) o que vale é o teto do
    // config; com preset, vale também o teto do próprio preset (clampPresetLimits).
    const perPreset = preset && preset.maxMessages != null
        ? clampInt(preset.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
        : classic
    return Math.max(1, Math.min(wanted, perPreset, classic))
}

export function listPaymentPresets() {
    return Object.values(FLOOD_PRESETS).filter(p => p.type === "payment")
}

export function listPaymentPresetsTexto() {
    const l = listPaymentPresets()
    if (!l.length) return "_(nenhum preset de pagamento cadastrado)_"
    return l
        .map(p => `  *${p.id}* · ${p.text || "pagamento"} · ${p.currency || "BRL"} ${Number(p.amount || 0).toFixed(2)} · ${p.maxMessages}x`)
        .join("\n")
}

export { FLOOD_PRESET_HARD_CAP as PRESET_HARD_CAP }
