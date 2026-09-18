// features/flood/limiter.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Intervalo, concorrência, cooldown e timeout COMPARTILHADOS por todos os presets.
//
// Arquitetura: este módulo é infra pura — não conhece socket, não conhece
// WhatsApp e NÃO envia nada. Quem executa envio continua sendo o
// executarFlood()/executarFloodLote() de services/groupService.js (AB7).
// O limiter só responde "quando posso", "quantos ao mesmo tempo" e "até quando
// esperar". É por isso que ele é reutilizável pelo sistema de presets e por
// qualquer outro laço, sem virar um segundo executor.
//
// Limites de segurança (não são otimizáveis por preset): os valores máximos
// vêm de FLOOD_PRESET_HARD_CAP (features/flood/config.js) e são aplicados em
// clampPresetLimits ANTES de chegar aqui. Nada neste módulo remove throttle,
// jitter ou cooldown — e nada aqui tenta "contornar" rate limit: o que existe é
// ESPERA (waitInterval) e backoff nos retries da fila.

/**
 * Estado de cooldown por preset (em memória de propósito): cooldown de teste
 * controlado não precisa sobreviver a restart — se precisasse, seria config,
 * não estado. `clearCooldown` existe para o operador resetar manualmente.
 */
const lastJobEnd = new Map()
const lastSendAt = new Map()

/** Quanto falta (ms) para o cooldown de `presetId` terminar. 0 = pode rodar. */
export function remainingCooldown(presetId, cooldownMs) {
    const last = lastJobEnd.get(presetId) || 0
    const need = Math.max(0, Number(cooldownMs) || 0)
    const left = need - (Date.now() - last)
    return left > 0 ? left : 0
}

/** Registra o fim do job → abre o cooldown do preset. */
export function markJobEnd(presetId) {
    if (!presetId) return
    lastJobEnd.set(presetId, Date.now())
}

/** Reset manual do cooldown (um preset, ou todos se omitido). */
export function clearCooldown(presetId) {
    if (presetId) lastJobEnd.delete(presetId)
    else lastJobEnd.clear()
}

export function sleep(ms) {
    const t = Math.max(0, Number(ms) || 0)
    return new Promise(r => setTimeout(r, t))
}

/**
 * Timeout com erro tipificado ({ code: "TIMEOUT" }) — classifyError trata como
 * retryável, então um timeout não derruba o job inteiro.
 */
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

/**
 * Limiter de um laço: concorrência + intervalo mínimo (+ jitter opcional).
 * O intervalo é GLOBAL por `key` (não por chamada) — é isso que faz um lote de
 * N alvos continuar respeitando o mesmo ritmo, em vez de virar rajada.
 */
export function createLimiter({ interval = 3000, concurrency = 1, timeout = 15000, key = "default", jitter = false } = {}) {
    const minInterval = Math.max(0, Number(interval) || 0)
    const maxInflight = Math.max(1, Number(concurrency) || 1)
    let inflight = 0
    const waiters = []

    function wake() {
        while (waiters.length && inflight < maxInflight) {
            // O slot é reservado AQUI, antes de acordar o waiter. Se deixar para o
            // `inflight++` depois do await, um acquire() que rodar nesse intervalo
            // de microtask vê espaço livre e passa também — a concorrência real
            // estoura o teto (bug que veio da arena 01a0aaae e que o teste pega).
            inflight++
            const next = waiters.shift()
            next()
        }
    }

    async function acquire() {
        if (inflight < maxInflight) {
            inflight++
            return
        }
        await new Promise(resolve => waiters.push(resolve))
        // já reservado por wake()
    }

    function release() {
        inflight = Math.max(0, inflight - 1)
        wake()
    }

    async function waitInterval() {
        const last = lastSendAt.get(key) || 0
        let wait = minInterval - (Date.now() - last)
        // Jitter é para PARECER humano / diluir rajada. Ele só AUMENTA a espera:
        // nunca é usado para encurtar intervalo nem para driblar proteção.
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

    return {
        schedule,
        inflight: () => inflight,
        pending: () => waiters.length,
        /** Intervalo/timeout efetivos — usado no resumo do job e nos testes. */
        limits: () => ({ interval: minInterval, concurrency: maxInflight, timeout, key, jitter: !!jitter })
    }
}

/**
 * Classifica erro do envio para decidir retry/abort.
 * - timeout / rate limit  → retryável (com backoff na fila), NUNCA "contorna"
 * - disconnect            → aborta o job (não adianta martelar sessão caída)
 * - forbidden/blocked      → permanente, aborta
 */
export function classifyError(e) {
    const msg = String(e?.message || e || "").toLowerCase()
    const data = e?.data
    const code = e?.code
    if (code === "TIMEOUT" || msg.includes("timeout")) return { kind: "timeout", retry: true, abort: false }
    // [v53] o relay também devolve "429 / too many requests" em texto livre (sem
    // e.data): se cair no ramo genérico, vira abort e o job morre por um motivo que
    // bastava esperar. Continuamos só ESPERANDO (backoff na fila) — nunca contornar.
    if (msg.includes("rate-overlimit") || msg.includes("rate") || data === 429 || msg.includes("429") || msg.includes("too many requests")) {
        return { kind: "rate_limit", retry: true, abort: false }
    }
    if (msg.includes("disconnect") || msg.includes("connection closed") || msg.includes("not connected") || msg.includes("logged out")) {
        return { kind: "disconnect", retry: false, abort: true }
    }
    if (msg.includes("forbidden") || msg.includes("not-authorized") || msg.includes("blocked")) {
        return { kind: "permanent", retry: false, abort: true }
    }
    return { kind: "error", retry: false, abort: true }
}
