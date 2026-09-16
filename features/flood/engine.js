// features/flood/engine.js
// preset → validação → grupos escolhidos → queue → limiter → envio → métricas
// Um job por vez. Dry-run não envia. Kill switch interrompe a fila.
// Sem allowlist / allGroups / everyone — só JIDs que o usuário escolheu.

import { getFloodRuntimeConfig, clampPresetLimits } from "./config.js"
import { loadPreset, buildContent } from "./presets/index.js"
import { maskJid, normalizeTargetJid, BLOCKED_TARGET } from "./allowlist.js"
import { remainingCooldown, markJobEnd } from "./limiter.js"
import { createQueue } from "./queue.js"
import { isKillSwitchOn } from "./killswitch.js"
import { createPaymentPayload } from "./payment.js"
import { visibleTextHasPhones } from "./presets/mention.js"
import { TARGETS_REQUIRED, extractTargetJids } from "./groups.js"
import { info, warn, ok, err } from "../../utils/terminalUI.js"

let runningJob = null

export function isFloodEngineRunning() {
    return !!runningJob
}

export function cancelRunningJob(reason = "KILL_SWITCH") {
    if (runningJob?.queue) runningJob.queue.cancel(reason)
    return !!runningJob
}

function emptyMetrics() {
    return {
        started: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        blocked: 0,
        duration: 0,
        averageLatency: 0,
        latencies: []
    }
}

function logSafe(tag, msg) {
    console.log(info(tag, msg))
}

export async function runPresetJob(opts = {}) {
    const startedAt = Date.now()
    const metrics = emptyMetrics()
    metrics.started = 1

    const runtime = getFloodRuntimeConfig()
    const dryRun = opts.dryRun != null ? !!opts.dryRun : runtime.dryRun
    const presetId = String(opts.presetId || "").trim().toLowerCase()
    const loaded = loadPreset(presetId, opts.overlay || {})
    if (!loaded.ok) {
        return { ok: false, error: loaded.error, metrics, dryRun }
    }
    let preset = loaded.preset

    if (preset.type === "payment") {
        if (!runtime.testMode && !opts.allowPaymentOutsideTest) {
            return { ok: false, error: "PAYMENT_TEST_DISABLED", metrics, dryRun }
        }
        if (typeof opts.paymentArgs === "string" && opts.paymentArgs.trim()) {
            const { parsePaymentArgs } = await import("./payment.js")
            const parsed = parsePaymentArgs(opts.paymentArgs)
            if (!parsed.ok) return { ok: false, error: parsed.error, usage: parsed.usage, metrics, dryRun }
            preset = clampPresetLimits({ ...preset, text: parsed.text, amount: parsed.amount, currency: parsed.currency })
        }
        const payloadCheck = createPaymentPayload({ text: preset.text, amount: preset.amount, currency: preset.currency })
        if (!payloadCheck.ok) return { ok: false, error: payloadCheck.error, usage: payloadCheck.usage, metrics, dryRun }
        preset._payment = payloadCheck
    }

    if (isKillSwitchOn()) {
        logSafe("FLOOD", "CANCELLED kill switch")
        return { ok: false, error: "KILL_SWITCH", metrics, dryRun, cancelled: true }
    }

    if (runningJob) {
        return { ok: false, error: "JOB_IN_PROGRESS", metrics, dryRun }
    }

    const cool = remainingCooldown(preset.id, preset.cooldown)
    if (cool > 0 && !opts.ignoreCooldown) {
        return { ok: false, error: "COOLDOWN", remainingMs: cool, metrics, dryRun }
    }

    const requested = []
    const seenReq = new Set()
    for (const raw of extractTargetJids(opts.targets)) {
        const jid = normalizeTargetJid(raw) || (String(raw).endsWith("@g.us") ? String(raw).trim() : null)
        if (!jid || seenReq.has(jid)) continue
        seenReq.add(jid)
        requested.push(jid)
    }
    if (!requested.length) {
        return { ok: false, error: TARGETS_REQUIRED, metrics, dryRun }
    }

    let isProtected = () => false
    try {
        const { isAuthorizedGroup } = await import("../../utils/permissions.js")
        isProtected = (jid) => {
            try { return isAuthorizedGroup(jid) } catch { return false }
        }
    } catch {}

    const allowed = []
    const blocked = []
    for (const jid of requested) {
        if (isProtected(jid)) {
            blocked.push(jid)
            continue
        }
        allowed.push(jid)
    }

    if (!allowed.length) {
        return { ok: false, error: BLOCKED_TARGET, blocked: blocked.map(maskJid), metrics, dryRun }
    }

    let targets = allowed.slice(0, preset.maxMessages)
    if (preset.targetMode === "single") targets = targets.slice(0, 1)
    metrics.queued = targets.length
    metrics.blocked = blocked.length

    if (!targets.length) {
        return { ok: false, error: BLOCKED_TARGET, blocked: blocked.map(maskJid), metrics, dryRun }
    }
    const selectedSet = new Set(targets)

    if (preset.type === "mention") {
        const txt = String(preset.text || "")
        if (visibleTextHasPhones(txt)) {
            return { ok: false, error: "MENTION_LEAK", metrics, dryRun }
        }
    }

    const items = targets.map(target => ({ target, preset }))
    const sendFn = typeof opts.sendFn === "function" ? opts.sendFn : defaultSend
    const resolveMentions = typeof opts.resolveMentions === "function" ? opts.resolveMentions : defaultMentions

    const queue = createQueue({
        interval: preset.interval,
        concurrency: preset.concurrency,
        timeout: preset.timeout,
        maxRetries: runtime.maxRetries,
        onLog: (ev, data) => {
            if (ev === "retry-check" && data?.kind === "rate_limit") {
                logSafe("FLOOD", `rate limit — espera (não contorna) attempt=${data.attempt}`)
            }
        }
    })

    runningJob = { presetId: preset.id, queue, startedAt }
    logSafe(preset.type === "payment" ? "PAYMENT" : "FLOOD", `START preset=${preset.id} type=${preset.type} n=${targets.length} dryRun=${dryRun}`)

    let results = []
    try {
        results = await queue.runItems(items, async (item) => {
            if (!selectedSet.has(item.target)) {
                throw Object.assign(new Error(BLOCKED_TARGET), { code: BLOCKED_TARGET })
            }
            const mentions = preset.type === "mention" || preset.type === "payment"
                ? await resolveMentions(item.target)
                : []
            let content
            try {
                let from = opts.from
                if (!from && (preset.type === "payment")) {
                    try {
                        const { getSock } = await import("../../connection/socket.js")
                        from = getSock()?.user?.id
                    } catch {}
                }
                content = buildContent(preset, {
                    mentions,
                    from,
                    buffer: opts.mediaBuffer
                })
            } catch (e) {
                if (dryRun && e.code === "MEDIA_UNAVAILABLE") {
                    content = { caption: preset.caption || preset.text || "media-test", _mediaMissing: true }
                } else {
                    throw e
                }
            }
            if (dryRun) {
                return { dryRun: true, target: maskJid(item.target), keys: Object.keys(content) }
            }
            return sendFn(item.target, content, { preset, mentions })
        })
    } catch (e) {
        const msg = String(e?.message || e).slice(0, 160)
        console.log(err(`[FLOOD] ERROR ${msg}`))
        runningJob = null
        markJobEnd(preset.id)
        return { ok: false, error: "ENGINE_ERROR", message: msg, metrics, dryRun }
    }

    runningJob = null
    markJobEnd(preset.id)

    const latencies = []
    for (const r of results) {
        if (r?.cancelled) metrics.cancelled++
        else if (r?.ok) {
            metrics.sent++
            if (Number.isFinite(r.latency)) latencies.push(r.latency)
        } else metrics.failed++
    }
    metrics.latencies = latencies
    metrics.averageLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0
    metrics.duration = Date.now() - startedAt

    const aborted = results.some(r => r?.abort)
    const cancelled = results.some(r => r?.cancelled)
    const tag = preset.type === "payment" ? "PAYMENT" : "FLOOD"
    if (cancelled || aborted) {
        console.log(warn(`[${tag}] CANCELLED preset=${preset.id} sent=${metrics.sent} fail=${metrics.failed} cancel=${metrics.cancelled}`))
    } else if (metrics.failed && !metrics.sent) {
        console.log(err(`[${tag}] ERROR preset=${preset.id} fail=${metrics.failed}`))
    } else {
        console.log(ok(`[${tag}] SUCCESS preset=${preset.id} sent=${metrics.sent}/${metrics.queued} dryRun=${dryRun} ${metrics.duration}ms`))
    }

    return {
        ok: metrics.failed === 0 && metrics.cancelled === 0,
        preset: {
            id: preset.id,
            type: preset.type,
            maxMessages: preset.maxMessages,
            interval: preset.interval,
            concurrency: preset.concurrency,
            cooldown: preset.cooldown,
            targetMode: preset.targetMode,
            text: preset.type === "payment" ? preset.text : undefined,
            amount: preset.amount,
            currency: preset.currency
        },
        dryRun,
        targets: targets.map(maskJid),
        blocked: blocked.map(maskJid),
        metrics,
        results: results.map(r => ({
            ok: !!r.ok,
            cancelled: !!r.cancelled,
            error: r.error,
            message: r.message ? String(r.message).slice(0, 160) : undefined,
            target: maskJid(r.target),
            latency: r.latency,
            dryRun: r.result?.dryRun === true
        })),
        cancelled,
        aborted
    }
}

async function defaultSend(jid, content) {
    const { getSock } = await import("../../connection/socket.js")
    const sock = getSock()
    if (!sock) throw Object.assign(new Error("NOT_CONNECTED"), { code: "disconnect" })
    if (content && content.payment) {
        const payment = { ...content.payment }
        if (!payment.from && sock.user?.id) payment.from = sock.user.id
        const payload = { payment }
        if (Array.isArray(content.mentions) && content.mentions.length) payload.mentions = content.mentions
        return sock.sendMessage(jid, payload)
    }
    const { safeSendMessage } = await import("../../services/groupService.js")
    return safeSendMessage(jid, content, 1)
}

async function defaultMentions() {
    return []
}

export function describePreset(id) {
    const loaded = loadPreset(id)
    if (!loaded.ok) return null
    const p = loaded.preset
    return {
        id: p.id,
        type: p.type,
        maxMessages: p.maxMessages,
        interval: p.interval,
        concurrency: p.concurrency,
        cooldown: p.cooldown,
        targetMode: p.targetMode,
        text: p.text || p.caption,
        amount: p.amount,
        currency: p.currency
    }
}
