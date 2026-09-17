// features/flood/speed.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// NÃO é um segundo sistema de velocidade. O AB7 já resolve ritmo em
// getFloodConfig() (services/groupService.js) a partir de FLOOD_MODOS + CONFIG
// (utils/config.js: floodModo / floodInterval / floodLote / floodJitter).
// Este módulo só faz a ponte preset → esses MESMOS valores, para o preset não
// inventar intervalo nem lote próprio.
//
// Saída sempre compatível com getFloodConfig(objeto) e, portanto, com
// executarFlood(jid, msg, qtd, cfg, builder): { modo, intervaloMs, lote, jitter }.

import { CONFIG, FLOOD_MODOS } from "../../utils/config.js"

const SPEED_ALIASES = {
    "1": "rapido",
    rapido: "rapido",
    "rápido": "rapido",
    "2": "normal",
    normal: "normal",
    "3": "lento",
    lento: "lento",
    "4": "seguro",
    seguro: "seguro"
}

/** Intervalo digitado à mão tem a MESMA faixa do flood clássico (20..5000 ms). */
export const CUSTOM_INTERVAL_MIN = 20
export const CUSTOM_INTERVAL_MAX = 5000

/**
 * @param {string|number|null} raw  "0"/vazio = config atual · "1..4" · nome · ms
 * @returns {{ok:true,modo:string,intervalo:number,lote:number,jitter:boolean,from:string}|{ok:false,error:string}}
 */
export function resolveFloodSpeed(raw) {
    const key = String(raw == null ? "" : raw).trim().toLowerCase()

    if (!key || key === "0" || key === "default" || key === "padrao" || key === "padrão") {
        const modo = CONFIG.floodModo || "normal"
        const m = FLOOD_MODOS[modo] || FLOOD_MODOS.normal
        return {
            ok: true,
            modo,
            // os MESMOS defaults do AB7: config vence o modo, como em getFloodConfig()
            intervalo: Number(CONFIG.floodInterval) || m.intervalo,
            lote: Number(CONFIG.floodLote) || m.lote,
            jitter: CONFIG.floodJitter === true || modo === "seguro",
            from: "config"
        }
    }

    const alias = SPEED_ALIASES[key]
    if (alias && FLOOD_MODOS[alias]) {
        const m = FLOOD_MODOS[alias]
        return { ok: true, modo: alias, intervalo: m.intervalo, lote: m.lote, jitter: alias === "seguro", from: "modo" }
    }

    if (FLOOD_MODOS[key]) {
        const m = FLOOD_MODOS[key]
        return { ok: true, modo: key, intervalo: m.intervalo, lote: m.lote, jitter: key === "seguro", from: "modo" }
    }

    const num = parseInt(String(key).replace(/\D/g, ""), 10)
    if (!Number.isNaN(num) && num >= CUSTOM_INTERVAL_MIN && num <= CUSTOM_INTERVAL_MAX) {
        return { ok: true, modo: "custom", intervalo: num, lote: Number(CONFIG.floodLote) || 6, jitter: false, from: "custom" }
    }

    return { ok: false, error: "SPEED_INVALID" }
}

/** Menu de velocidade do flood — lido dos MESMOS FLOOD_MODOS, sem lista paralela. */
export function formatFloodSpeedMenu() {
    const atual = CONFIG.floodModo || "normal"
    const m = FLOOD_MODOS[atual]
    const linhas = Object.entries(FLOOD_MODOS).map(([k, v], i) => `  ${i + 1} · ${v.label}`)
    return [
        "🌊 VELOCIDADE DO FLOOD",
        `Atual: ${atual}${m ? ` (${CONFIG.floodInterval || m.intervalo}ms / lote ${CONFIG.floodLote || m.lote})` : ""}`,
        "",
        ...linhas,
        `  Ou digite intervalo custom (${CUSTOM_INTERVAL_MIN}–${CUSTOM_INTERVAL_MAX} ms)`,
        "",
        "_0 = manter a config atual_"
    ].join("\n")
}

/**
 * Aplica a velocidade ao preset SEM aumentar concorrência nem afrouxar limite:
 * payment/shopping ficam em concorrência 1 (um card por vez, como no AB7).
 */
export function applyFloodSpeed(preset, cfg) {
    if (!preset || !cfg || !cfg.ok) return preset
    const type = String(preset.type || "text").toLowerCase()
    const single = type === "payment" || type === "shopping"
    const concFromLote = Math.min(2, Math.max(1, Number(cfg.lote) || 1))
    const prevConc = Number(preset.concurrency) || 1
    return {
        ...preset,
        interval: cfg.intervalo,
        // nunca acima do que o preset já tinha nem do hard cap (clampPresetLimits)
        concurrency: single ? 1 : Math.min(prevConc, concFromLote),
        floodModo: cfg.modo,
        jitter: !!cfg.jitter,
        lote: cfg.lote
    }
}

/** Formato aceito por getFloodConfig()/executarFlood() do AB7. */
export function toFloodOpts(cfg) {
    if (!cfg || !cfg.ok) return null
    return { modo: cfg.modo, intervaloMs: cfg.intervalo, lote: cfg.lote, jitter: !!cfg.jitter }
}
