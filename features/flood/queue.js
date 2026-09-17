// features/flood/queue.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Fila ÚNICA do engine de presets. Preset nenhum implementa fila própria, e a
// fila NÃO é um segundo executor de flood: ela não conhece socket nem monta
// payload. O que ela faz é, para cada item:
//   respeitar kill switch → limiter (intervalo/concorrência/timeout) → chamar o
//   worker → retry limitado → abortar em erro permanente/desconexão → devolver
//   resultado estruturado.
// O worker, no AB7, é quem chama o executarFlood/executarFloodLote existente
// (services/groupService.js). Ou seja: ritmo e retry embaixo, envio em cima,
// UM caminho de send só.

import { createLimiter, classifyError, sleep } from "./limiter.js"
import { isKillSwitchOn } from "./killswitch.js"

export const QUEUE_CANCELLED = "KILL_SWITCH"

/**
 * @param {object} [opts]
 * @param {number} [opts.interval]   intervalo mínimo global (ms) — já clampado pelo preset
 * @param {number} [opts.concurrency] itens em paralelo (hard cap: 2)
 * @param {number} [opts.timeout]     ms por item (com retry limitado dentro)
 * @param {number} [opts.maxRetries]  0..hard cap; rate limit usa backoff maior
 * @param {boolean} [opts.jitter]
 * @param {(ev:string,data?:object)=>void} [opts.onLog]
 * @param {() => boolean} [opts.shouldStop] hook extra (ex.: estado do job)
 */
export function createQueue({ interval, concurrency, timeout, maxRetries, onLog, jitter, shouldStop } = {}) {
    const limiter = createLimiter({
        interval,
        concurrency,
        timeout,
        key: `q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        jitter: !!jitter
    })
    let cancelled = false
    let cancelReason = null
    let sent = 0
    let failed = 0

    function cancel(reason = QUEUE_CANCELLED) {
        if (!cancelled) cancelReason = reason
        cancelled = true
    }

    function isCancelled() {
        return cancelled || isKillSwitchOn() || (typeof shouldStop === "function" && shouldStop() === true)
    }

    function noteCancel(item, reason) {
        return { ok: false, cancelled: true, reason: reason || cancelReason || QUEUE_CANCELLED, target: item?.target }
    }

    async function runOne(item, worker, attempt, retries) {
        const t0 = Date.now()
        try {
            const result = await worker(item, attempt)
            sent++
            return { ok: true, target: item?.target, latency: Date.now() - t0, attempt, result }
        } catch (e) {
            const cls = classifyError(e)
            if (typeof onLog === "function") {
                onLog("retry-check", { kind: cls.kind, attempt, message: String(e?.message || e).slice(0, 120) })
            }
            if (cls.abort) {
                // Desconexão/erro permanente: PARA o job. Insistir em sessão caída
                // é o que transforma teste controlado em abuso.
                cancel(cls.kind === "disconnect" ? "DISCONNECT" : "PERMANENT_ERROR")
                return {
                    ok: false,
                    target: item?.target,
                    error: cls.kind,
                    message: String(e?.message || e).slice(0, 160),
                    abort: true,
                    latency: Date.now() - t0
                }
            }
            if (cls.retry && attempt < retries) {
                // Backoff (não é "espera menor"): rate limit espera MAIS a cada tentativa.
                const wait = cls.kind === "rate_limit" ? 800 * (attempt + 1) : 200
                await sleep(wait)
                return null // → tenta de novo
            }
            failed++
            return {
                ok: false,
                target: item?.target,
                error: cls.kind,
                message: String(e?.message || e).slice(0, 160),
                latency: Date.now() - t0
            }
        }
    }

    async function runItems(items, worker) {
        const results = []
        const retries = Math.max(0, Number(maxRetries) || 0)
        for (const item of items || []) {
            if (isCancelled()) {
                results.push(noteCancel(item))
                continue
            }
            let result
            try {
                result = await limiter.schedule(async () => {
                    for (let attempt = 0; attempt <= retries; attempt++) {
                        if (isCancelled()) return noteCancel(item)
                        const r = await runOne(item, worker, attempt, retries)
                        if (r !== null) return r
                    }
                    failed++
                    return { ok: false, target: item?.target, error: "retries_exhausted", message: "retry esgotado dentro do limite do preset" }
                })
            } catch (e) {
                const cls = classifyError(e)
                if (cls.abort) cancel(cls.kind === "disconnect" ? "DISCONNECT" : "PERMANENT_ERROR")
                failed++
                result = {
                    ok: false,
                    target: item?.target,
                    error: cls.kind || e?.code || "error",
                    message: String(e?.message || e).slice(0, 160),
                    abort: !!cls.abort
                }
            }
            results.push(result)
            if (result?.abort) cancel(result.error || "ABORT")
        }
        return results
    }

    return {
        runItems,
        cancel,
        isCancelled,
        getCancelReason: () => cancelReason || (isKillSwitchOn() ? QUEUE_CANCELLED : null),
        counts: () => ({ sent, failed }),
        limits: () => limiter.limits()
    }
}
