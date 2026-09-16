// features/flood/limiter.js
// Intervalo, concorrência, cooldown e timeout compartilhados por TODOS os presets.

const lastJobEnd = new Map()
const lastSendAt = new Map()

export function remainingCooldown(presetId, cooldownMs) {
    const last = lastJobEnd.get(presetId) || 0
    const left = cooldownMs - (Date.now() - last)
    return left > 0 ? left : 0
}

export function markJobEnd(presetId) {
    lastJobEnd.set(presetId, Date.now())
}

export function clearCooldown(presetId) {
    if (presetId) lastJobEnd.delete(presetId)
    else lastJobEnd.clear()
}

export function createLimiter({ interval = 3000, concurrency = 1, timeout = 15000, key = "default", jitter = false } = {}) {
    let inflight = 0
    const waiters = []

    function wake() {
        while (waiters.length && inflight < concurrency) {
            const next = waiters.shift()
            next()
        }
    }

    async function acquire() {
        if (inflight < concurrency) {
            inflight++
            return
        }
        await new Promise(resolve => waiters.push(resolve))
        inflight++
    }

    function release() {
        inflight = Math.max(0, inflight - 1)
        wake()
    }

    async function waitInterval() {
        const last = lastSendAt.get(key) || 0
        let wait = interval - (Date.now() - last)
        if (jitter && last) wait += Math.floor(Math.random() * 250) + 50
        if (wait > 0) await sleep(wait)
        lastSendAt.set(key, Date.now())
    }

    async function schedule(fn) {
        await acquire()
        try {
            await waitInterval()
            return await withTimeout(fn, timeout)
        } finally {
            release()
        }
    }

    return { schedule, inflight: () => inflight }
}

export function withTimeout(fn, timeoutMs) {
    const ms = Math.max(1, Number(timeoutMs) || 15000)
    return new Promise((resolve, reject) => {
        let done = false
        const t = setTimeout(() => {
            if (done) return
            done = true
            reject(Object.assign(new Error("TIMEOUT"), { code: "TIMEOUT" }))
        }, ms)
        Promise.resolve()
            .then(() => (typeof fn === "function" ? fn() : fn))
            .then(v => {
                if (done) return
                done = true
                clearTimeout(t)
                resolve(v)
            })
            .catch(e => {
                if (done) return
                done = true
                clearTimeout(t)
                reject(e)
            })
    })
}

export function sleep(ms) {
    return new Promise(r => setTimeout(r, Math.max(0, ms)))
}

export function classifyError(e) {
    const msg = String(e?.message || e || "").toLowerCase()
    const data = e?.data
    const code = e?.code
    if (code === "TIMEOUT" || msg.includes("timeout")) return { kind: "timeout", retry: true, abort: false }
    if (msg.includes("rate-overlimit") || msg.includes("rate") || data === 429) return { kind: "rate_limit", retry: true, abort: false }
    if (msg.includes("disconnect") || msg.includes("connection closed") || msg.includes("not connected") || msg.includes("logged out")) {
        return { kind: "disconnect", retry: false, abort: true }
    }
    if (msg.includes("forbidden") || msg.includes("not-authorized") || msg.includes("blocked")) {
        return { kind: "permanent", retry: false, abort: true }
    }
    return { kind: "error", retry: false, abort: true }
}
