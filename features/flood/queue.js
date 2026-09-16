// features/flood/queue.js
// Fila única do engine de presets. Presets NÃO implementam fila própria.

import { createLimiter, classifyError, sleep } from "./limiter.js"
import { isKillSwitchOn } from "./killswitch.js"

export function createQueue({ interval, concurrency, timeout, maxRetries, onLog } = {}) {
    const limiter = createLimiter({ interval, concurrency, timeout, key: `q-${Date.now()}` })
    let cancelled = false
    let cancelReason = null

    function cancel(reason = "KILL_SWITCH") {
        cancelled = true
        cancelReason = reason
    }

    function isCancelled() {
        return cancelled || isKillSwitchOn()
    }

    async function runItems(items, worker) {
        const results = []
        for (const item of items) {
            if (isCancelled()) {
                results.push({ ok: false, cancelled: true, reason: cancelReason || "KILL_SWITCH", target: item?.target })
                continue
            }
            const result = await limiter.schedule(async () => {
                let lastErr = null
                const retries = Math.max(0, Number(maxRetries) || 0)
                for (let attempt = 0; attempt <= retries; attempt++) {
                    if (isCancelled()) return { ok: false, cancelled: true, reason: cancelReason || "KILL_SWITCH", target: item?.target }
                    const t0 = Date.now()
                    try {
                        const sent = await worker(item, attempt)
                        return { ok: true, target: item?.target, latency: Date.now() - t0, attempt, result: sent }
                    } catch (e) {
                        lastErr = e
                        const cls = classifyError(e)
                        if (typeof onLog === "function") onLog("retry-check", { kind: cls.kind, attempt, message: String(e?.message || e).slice(0, 120) })
                        if (cls.abort) {
                            cancel(cls.kind === "disconnect" ? "DISCONNECT" : "PERMANENT_ERROR")
                            return { ok: false, target: item?.target, error: cls.kind, message: String(e?.message || e).slice(0, 160), abort: true, latency: Date.now() - t0 }
                        }
                        if (cls.retry && attempt < retries) {
                            const wait = cls.kind === "rate_limit" ? 800 * (attempt + 1) : 200
                            await sleep(wait)
                            continue
                        }
                        return { ok: false, target: item?.target, error: cls.kind, message: String(e?.message || e).slice(0, 160), latency: Date.now() - t0 }
                    }
                }
                return { ok: false, target: item?.target, error: "retries_exhausted", message: String(lastErr?.message || lastErr || "").slice(0, 160) }
            })
            results.push(result)
            if (result?.abort) {
                cancel(result.error || "ABORT")
            }
        }
        return results
    }

    return { runItems, cancel, isCancelled, getCancelReason: () => cancelReason }
}
