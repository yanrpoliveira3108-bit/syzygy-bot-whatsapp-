// features/flood/speed.js
// Reusa FLOOD_MODOS do flood clássico (rapido/normal/lento/seguro). Sem segundo sistema.

import { CONFIG, FLOOD_MODOS } from "../../utils/config.js"

export function resolveFloodSpeed(raw) {
    const key = String(raw == null ? "" : raw).trim().toLowerCase()
    if (!key || key === "0") {
        const modo = CONFIG.floodModo || "normal"
        const m = FLOOD_MODOS[modo] || FLOOD_MODOS.normal
        return {
            ok: true,
            modo,
            intervalo: Number(CONFIG.floodInterval) || m.intervalo,
            lote: Number(CONFIG.floodLote) || m.lote,
            jitter: CONFIG.floodJitter === true || modo === "seguro"
        }
    }
    if (key === "1" || key === "rapido" || key === "rápido") {
        const m = FLOOD_MODOS.rapido
        return { ok: true, modo: "rapido", intervalo: m.intervalo, lote: m.lote, jitter: false }
    }
    if (key === "2" || key === "normal") {
        const m = FLOOD_MODOS.normal
        return { ok: true, modo: "normal", intervalo: m.intervalo, lote: m.lote, jitter: false }
    }
    if (key === "3" || key === "lento") {
        const m = FLOOD_MODOS.lento
        return { ok: true, modo: "lento", intervalo: m.intervalo, lote: m.lote, jitter: false }
    }
    if (key === "4" || key === "seguro") {
        const m = FLOOD_MODOS.seguro
        return { ok: true, modo: "seguro", intervalo: m.intervalo, lote: m.lote, jitter: true }
    }
    if (FLOOD_MODOS[key]) {
        const m = FLOOD_MODOS[key]
        return { ok: true, modo: key, intervalo: m.intervalo, lote: m.lote, jitter: key === "seguro" }
    }
    const num = parseInt(String(key).replace(/\D/g, ""), 10)
    if (!Number.isNaN(num) && num >= 20 && num <= 5000) {
        return { ok: true, modo: "custom", intervalo: num, lote: CONFIG.floodLote || 6, jitter: false }
    }
    return { ok: false, error: "SPEED_INVALID" }
}

export function formatFloodSpeedMenu() {
    const atual = CONFIG.floodModo || "normal"
    const m = FLOOD_MODOS[atual]
    let t = `🌊 VELOCIDADE DO FLOOD\n`
    t += `Atual: ${atual}`
    if (m) t += ` (${CONFIG.floodInterval || m.intervalo}ms / lote ${CONFIG.floodLote || m.lote})`
    t += `\n\nEscolha a velocidade:\n`
    t += `  1 · Rápido — ${FLOOD_MODOS.rapido.intervalo}ms / lote ${FLOOD_MODOS.rapido.lote}\n`
    t += `  2 · Normal — ${FLOOD_MODOS.normal.intervalo}ms / lote ${FLOOD_MODOS.normal.lote}\n`
    t += `  3 · Lento — ${FLOOD_MODOS.lento.intervalo}ms / lote ${FLOOD_MODOS.lento.lote}\n`
    t += `  4 · Seguro — ${FLOOD_MODOS.seguro.intervalo}ms / lote ${FLOOD_MODOS.seguro.lote} + jitter\n`
    t += `  Ou digite intervalo custom (ex: 200)\n\n`
    t += `_0 = usar config atual_`
    return t
}

export function applyFloodSpeed(preset, cfg) {
    if (!preset || !cfg || !cfg.ok) return preset
    const type = String(preset.type || "text").toLowerCase()
    const concurrency = type === "payment"
        ? 1
        : Math.min(8, Math.max(1, Number(cfg.lote) || 1))
    return {
        ...preset,
        interval: cfg.intervalo,
        concurrency,
        floodModo: cfg.modo,
        jitter: !!cfg.jitter,
        lote: cfg.lote
    }
}
