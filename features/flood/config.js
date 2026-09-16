// features/flood/config.js
// Presets de load-test do flood. Defaults seguros.
// Overlay vem de CONFIG (utils/config.js) — não duplicar listas em vários arquivos.

import { CONFIG } from "../../utils/config.js"

export const FLOOD_PRESET_HARD_CAP = {
    maxMessages: 10,
    minInterval: 1000,
    maxConcurrency: 2,
    minCooldown: 5000,
    minTimeout: 3000,
    maxTimeout: 30000,
    maxRetries: 2
}

export const FLOOD_PRESETS = {
    "text-test": {
        id: "text-test",
        type: "text",
        text: "SYZYGY text-test",
        targetMode: "selected",
        maxMessages: 3,
        interval: 2000,
        concurrency: 1,
        cooldown: 15000,
        timeout: 15000
    },
    "mention-test": {
        id: "mention-test",
        type: "mention",
        text: "SYZYGY mention-test",
        targetMode: "selected",
        maxMessages: 2,
        interval: 2500,
        concurrency: 1,
        cooldown: 20000,
        timeout: 15000
    },
    "media-test": {
        id: "media-test",
        type: "media",
        caption: "SYZYGY media-test",
        targetMode: "selected",
        maxMessages: 2,
        interval: 3000,
        concurrency: 1,
        cooldown: 20000,
        timeout: 20000
    },
    "payment-test": {
        id: "payment-test",
        type: "payment",
        text: "Pagamento de teste",
        amount: 25.90,
        currency: "BRL",
        targetMode: "selected",
        maxMessages: 3,
        interval: 3000,
        concurrency: 1,
        cooldown: 30000,
        timeout: 15000
    }
}

export function getFloodRuntimeConfig() {
    return {
        killSwitch: CONFIG.floodKillSwitch === true,
        dryRun: CONFIG.floodDryRun !== false,
        testMode: CONFIG.floodTestMode !== false,
        allowlist: Array.isArray(CONFIG.floodAllowlist) ? [...CONFIG.floodAllowlist] : [],
        maxRetries: clampInt(CONFIG.floodMaxRetries, 0, FLOOD_PRESET_HARD_CAP.maxRetries, 1),
        timeoutMs: clampInt(CONFIG.floodTimeoutMs, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    }
}

export function getPresetDef(id) {
    if (!id) return null
    const key = String(id).trim().toLowerCase()
    return FLOOD_PRESETS[key] || null
}

export function listPresetIds() {
    return Object.keys(FLOOD_PRESETS)
}

export function clampPresetLimits(preset) {
    const src = preset && typeof preset === "object" ? preset : {}
    const maxMessages = clampInt(src.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const interval = clampInt(src.interval, FLOOD_PRESET_HARD_CAP.minInterval, 60000, 3000)
    const concurrency = clampInt(src.concurrency, 1, FLOOD_PRESET_HARD_CAP.maxConcurrency, 1)
    const cooldown = clampInt(src.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, 300000, 30000)
    const timeout = clampInt(src.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    return { ...src, maxMessages, interval, concurrency, cooldown, timeout }
}

function clampInt(n, min, max, fallback) {
    const v = Number(n)
    if (!Number.isFinite(v)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(v)))
}
