// features/flood/presetEngine.js
// [ENGINE DE PRESETS · adaptação arquitetural da arena 01a0aaae para o AB7]
//
// NÃO é o engine antigo copiado, e NÃO é um segundo executor de flood. A arena
// antiga tinha runPresetJob() com defaultSend próprio (sock.sendMessage direto);
// aqui o envio continua passando pela INFRAESTRUTURA DE ENVIO DO AB7:
//
//   preset → loadPreset → validação do tipo → allowlist → grupo protegido →
//          cooldown → speed (FLOOD_MODOS/CONFIG) → queue/limiter → builder →
//          services/groupService.executarFlood(...) → resultado estruturado
//
// O que este módulo faz de fato:
//  • resolve o preset e CLAMPA os tetos (config.js clampPresetLimits);
//  • valida o conteúdo ANTES de qualquer envio (payment/shopping/mention/media);
//  • aplica as porteiras de segurança: kill switch, um-job-por-vez, cooldown,
//    allowlist explícita e grupo protegido (isAuthorizedGroup, via filterTargets);
//  • monta a fila (queue.js) com o limiter (limiter.js) e entrega ao laço do
//    flood clássico por alvo;
//  • devolve métricas diagnósticas (nenhuma contém número cru: alvo é mascarado).
//
// Dry-run (padrão do runtime) NÃO envia: devolve preset, alvo mascarado, tipo,
// chaves do payload e o wire do card. Credencial nunca aparece aqui.

import { getFloodRuntimeConfig, clampJobQtd, FLOOD_PRESET_HARD_CAP } from "./config.js"
import { loadPreset, buildContent, makeIterationBuilder, describePreset } from "./presets/index.js"
import { filterTargets, maskJid, ALLOWLIST_EMPTY } from "./allowlist.js"
import { remainingCooldown, markJobEnd } from "./limiter.js"
import { createQueue } from "./queue.js"
import { isKillSwitchOn, onKillSwitch, KILL_SWITCH_REASON } from "./killswitch.js"
import { extractTargetJids, TARGETS_REQUIRED } from "./groups.js"
import { resolveFloodSpeed, applyFloodSpeed, toFloodOpts } from "./speed.js"
import { buildPayload as buildPaymentPayload } from "./presets/payment.js"
import { buildShoppingPayload } from "./presets/shoppingBuilder.js"
import { resolveMediaBuffer } from "./presets/media.js"
import { visibleTextHasPhones } from "./presets/mention.js"
import { describeSendWire } from "./engine.js"

/** Um job de preset por vez (o da arena antiga também era assim — mantém). */
let runningJob = null

export class PresetJobError extends Error {
    constructor(code, message, extra = {}) {
        super(message || code)
        this.name = "PresetJobError"
        this.code = code
        Object.assign(this, extra)
    }
}

export function isFloodEngineRunning() {
    return !!runningJob
}

export function currentJobInfo() {
    if (!runningJob) return null
    return {
        presetId: runningJob.presetId,
        type: runningJob.type,
        targets: runningJob.targets.map(maskJid),
        elapsedMs: Date.now() - runningJob.startedAt,
        cancelled: runningJob.queue ? runningJob.queue.isCancelled() : false
    }
}

/** Interrompe o job em andamento (a fila para na próxima iteração). */
export function cancelRunningJob(reason = KILL_SWITCH_REASON) {
    if (!runningJob?.queue) return false
    runningJob.queue.cancel(reason)
    return true
}

// O kill switch LIGADO também cancela o job corrente — não adianta ter botão se
// ele só vale para o próximo job.
onKillSwitch(on => {
    if (on) cancelRunningJob(KILL_SWITCH_REASON)
})

function emptyMetrics() {
    return {
        started: 0,
        queued: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        blocked: 0,
        planned: 0,
        duration: 0,
        averageLatency: 0,
        latencies: [],
        items: 0,
        targets: 0
    }
}

function logSafe(onLog, tag, msg) {
    if (typeof onLog === "function") {
        try { onLog(tag, msg) } catch {}
        return
    }
    console.log(`[${tag}] ${msg}`)
}

/**
 * @param {object} opts
 * @param {string} opts.presetId
 * @param {object} [opts.overlay]   campos digitados (nunca afrouxam teto)
 * @param {Array}  [opts.targets]   jids ou {id} — SEMPRE escolha explícita
 * @param {number} [opts.qtd]
 * @param {string|number} [opts.floodModo] "0"|1..4|nome|ms → FLOOD_MODOS/CONFIG
 * @param {object} [opts.floodCfg]  já resolvido (resolveFloodSpeed)
 * @param {boolean} [opts.dryRun]   default: runtime.dryRun
 * @param {boolean} [opts.ignoreCooldown]
 * @param {Array|Function} [opts.mentions] lista explícita ou (target) => []
 * @param {Buffer} [opts.mediaBuffer]
 * @param {string} [opts.from]
 * @param {(ctx:object)=>Promise<{ok,erros,total}>} [opts.executor] overrides o laço do AB7 (testes)
 * @param {(ev:string,data?:object)=>void} [opts.onLog]
 */
export async function runPresetJob(opts = {}) {
    const startedAt = Date.now()
    const metrics = emptyMetrics()
    metrics.started = 1

    const runtime = getFloodRuntimeConfig()
    const dryRun = opts.dryRun != null ? !!opts.dryRun : runtime.dryRun
    const onLog = typeof opts.onLog === "function" ? opts.onLog : null
    const fail = (code, extra = {}) => ({
        ok: false,
        error: code,
        ...extra,
        metrics,
        dryRun
    })

    // 1) preset
    const presetId = String(opts.presetId || "").trim().toLowerCase()
    const loaded = loadPreset(presetId, opts.overlay || {})
    if (!loaded.ok) return fail(loaded.error, { presetId })
    let preset = loaded.preset

    // 2) porteiras globais antes de qualquer trabalho
    if (isKillSwitchOn()) {
        logSafe(onLog, "FLOOD", "CANCELLED kill switch")
        return fail(KILL_SWITCH_REASON, { cancelled: true, preset: describePreset(preset) })
    }
    if (runningJob) {
        return fail("JOB_IN_PROGRESS", { running: currentJobInfo() })
    }

    // 3) validação por tipo (conteúdo ANTES de envio; erros estruturados)
    const type = String(preset.type || "text").toLowerCase()
    if (type === "payment" && !runtime.testMode && !opts.allowPaymentOutsideTest) {
        return fail("PAYMENT_TEST_DISABLED", { preset: describePreset(preset) })
    }
    if (type === "shopping" && !runtime.testMode && !opts.allowShoppingOutsideTest) {
        return fail("SHOPPING_TEST_DISABLED", { preset: describePreset(preset), type })
    }

    let builder
    let wire = null
    let warnings = []
    try {
        if (type === "payment") {
            const payload = buildPaymentPayload(preset)
            if (!payload.ok) return fail(payload.error, { usage: payload.usage, preset: describePreset(preset), type })
        }
        if (type === "shopping") {
            const built = buildShoppingPayload(preset)
            warnings = built.warnings || []
            wire = describeSendWire(built.content)
        }
        if (type === "mention" && visibleTextHasPhones(preset.text)) {
            return fail("MENTION_LEAK", { preset: describePreset(preset), type })
        }
        if (type === "media" && !dryRun && !resolveMediaBuffer(preset, { buffer: opts.mediaBuffer })) {
            return fail("MEDIA_UNAVAILABLE", { preset: describePreset(preset), type })
        }
        builder = makeIterationBuilder(preset, {
            buffer: opts.mediaBuffer,
            from: opts.from,
            mentions: typeof opts.mentions === "function" ? undefined : opts.mentions
        })
    } catch (e) {
        const code = e?.code || (type === "shopping" ? "SHOPPING_PAYLOAD_INVALID" : "PRESET_BUILD_FAILED")
        return fail(code, { message: String(e?.message || e).slice(0, 160), preset: describePreset(preset), type })
    }

    // 5) velocidade: FLOOD_MODOS/CONFIG do AB7 (sem segundo sistema)
    let speed = null
    if (opts.floodCfg && opts.floodCfg.ok) speed = opts.floodCfg
    else if (opts.floodModo != null && String(opts.floodModo).trim() !== "") speed = resolveFloodSpeed(opts.floodModo)
    else if (preset.modo) speed = resolveFloodSpeed(preset.modo)
    if (speed && !speed.ok) return fail(speed.error || "SPEED_INVALID", { preset: describePreset(preset) })
    if (speed) preset = applyFloodSpeed(preset, speed)

    // 4) alvos: só JIDs explicitamente autorizados + sem grupo protegido
    const requested = extractTargetJids(opts.targets || [])
    if (!requested.length) return fail(TARGETS_REQUIRED, { preset: describePreset(preset) })
    const filtered = filterTargets(requested)
    if (!filtered.ok) return fail(filtered.error || ALLOWLIST_EMPTY, { preset: describePreset(preset) })
    metrics.blocked = filtered.blocked.length
    let targets = filtered.allowed
    if (preset.targetMode === "single") targets = targets.slice(0, 1)
    if (!targets.length) {
        return fail("BLOCKED_TARGET", { blocked: filtered.blocked.map(b => maskJid(b.jid || b)), preset: describePreset(preset) })
    }

    // 5) cooldown por preset (sem bypass acidental: ignoreCooldown é explícito)
    const cool = remainingCooldown(preset.id, preset.cooldown)
    if (cool > 0 && !opts.ignoreCooldown) {
        return fail("COOLDOWN", { remainingMs: cool, preset: describePreset(preset) })
    }

    // 6) quantidade dentro dos tetos (hard cap ∧ preset ∧ MAX_FLOOD do projeto)
    const qtd = clampJobQtd(opts.qtd, preset)
    const cfgOpts = toFloodOpts(speed) || {}
    const selected = new Set(targets)
    metrics.targets = targets.length
    metrics.items = targets.length
    metrics.queued = targets.length * qtd

    // 7) fila/limiter por ALVO; o laço de mensagens é o do AB7 (executor)
    const executor = typeof opts.executor === "function" ? opts.executor : null
    const runItems = targets.map(target => ({ target, preset, qtd, cfg: cfgOpts }))
    const queue = createQueue({
        interval: preset.interval,
        concurrency: preset.concurrency,
        timeout: preset.timeout,
        maxRetries: runtime.maxRetries,
        jitter: !!preset.jitter,
        shouldStop: () => isKillSwitchOn(),
        onLog: (ev, data) => {
            if (ev === "retry-check" && data?.kind === "rate_limit") {
                logSafe(onLog, "FLOOD", `rate limit — aguardando backoff (não contorna) attempt=${data.attempt}`)
            }
        }
    })

    runningJob = { presetId: preset.id, type, queue, startedAt, targets }
    logSafe(onLog, jobTag(type), `START preset=${preset.id} type=${type} alvos=${targets.length} qtd=${qtd} dryRun=${dryRun}`)

    let results = []
    try {
        results = await queue.runItems(runItems, async (item) => {
            if (!selected.has(item.target)) {
                throw new PresetJobError("BLOCKED_TARGET", "alvo saiu da lista autorizada")
            }
            const mentions = await resolveMentionsFor(item.target, preset, opts)
            const ctx = { buffer: opts.mediaBuffer, from: opts.from, mentions }
            let content
            try {
                content = buildContent(preset, ctx)
            } catch (e) {
                if (dryRun && (e?.code === "MEDIA_UNAVAILABLE" || e?.code === "SHOPPING_PAYLOAD_INVALID")) {
                    content = { _missing: e.code }
                } else {
                    throw e
                }
            }
            if (dryRun) {
                return {
                    dryRun: true,
                    target: maskJid(item.target),
                    type,
                    keys: Object.keys(content).sort(),
                    wire: type === "shopping" ? wire : null,
                    qtd,
                    modo: speed?.modo || preset.floodModo || null
                }
            }
            const sendOne = executor
                ? () => executor({
                    jid: item.target, msg: bodyFor(preset, type), qtd: item.qtd, cfg: item.cfg, builder, preset, mentions, ctx
                })
                : async () => {
                    // caminho real do AB7: o MESMO executarFlood (laço, throttle,
                    // lote, retry de rate limit e porteira de grupo protegido).
                    const gs = await import("../../services/groupService.js")
                    return gs.executarFlood(item.target, bodyFor(preset, type), item.qtd, item.cfg, builder)
                }
            const r = await sendOne()
            return r && typeof r === "object" ? r : { ok: true }
        })
    } catch (e) {
        const msg = String(e?.message || e).slice(0, 160)
        logSafe(onLog, jobTag(type), `ERROR ${msg}`)
        runningJob = null
        markJobEnd(preset.id)
        return fail("ENGINE_ERROR", { message: msg, preset: describePreset(preset), type })
    }

    runningJob = null
    markJobEnd(preset.id)

    // 8) métricas a partir dos resultados (o laço do AB7 devolve {ok, erros, total})
    const latencies = []
    for (const r of results) {
        if (Number.isFinite(r?.latency)) latencies.push(r.latency)
        if (r?.cancelled) {
            metrics.cancelled++
            continue
        }
        const inner = r?.result || {}
        if (inner.dryRun === true) {
            // dry-run não envia: conta o que SERIA enviado, não como "sent"
            metrics.planned += Number(inner.qtd) || qtd
            continue
        }
        const okN = Number(inner.ok)
        const errN = Number(inner.erros ?? inner.failed)
        if (Number.isFinite(okN) || Number.isFinite(errN)) {
            if (Number.isFinite(okN)) metrics.sent += okN
            if (Number.isFinite(errN)) metrics.failed += errN
        } else if (r?.ok) {
            metrics.sent += 1
        } else {
            metrics.failed += 1
        }
    }
    const aborted = results.some(r => r?.abort)
    const cancelled = results.some(r => r?.cancelled)
    if (cancelled || aborted) {
        logSafe(onLog, jobTag(type), `CANCELLED preset=${preset.id} sent=${metrics.sent} fail=${metrics.failed} cancel=${metrics.cancelled}`)
    } else {
        logSafe(onLog, jobTag(type), `${dryRun ? "DRY-RUN" : "SUCCESS"} preset=${preset.id} ${metrics.sent}/${metrics.queued} ${metrics.duration}ms`)
    }

    return {
        ok: metrics.failed === 0 && metrics.cancelled === 0,
        type,
        preset: describePreset(preset),
        presetExtra: type === "shopping"
            ? { wire, warnings }
            : (type === "payment" ? { display: buildPaymentPayload(preset).display } : {}),
        dryRun,
        speed: speed ? { modo: speed.modo, intervalo: speed.intervalo, lote: speed.lote, jitter: !!speed.jitter } : null,
        limits: {
            interval: preset.interval,
            concurrency: preset.concurrency,
            timeout: preset.timeout,
            cooldown: preset.cooldown,
            maxMessages: preset.maxMessages,
            hardCap: FLOOD_PRESET_HARD_CAP
        },
        targets: targets.map(maskJid),
        blocked: filtered.blocked.map(b => maskJid(b.jid || b)),
        metrics,
        results: results.map(r => ({
            ok: !!r.ok,
            cancelled: !!r.cancelled,
            error: r.error,
            message: r.message ? String(r.message).slice(0, 160) : undefined,
            target: maskJid(r.target),
            latency: r.latency,
            dryRun: r.result?.dryRun === true,
            // dry-run precisa ser diagnóstico completo: tipo + chaves do payload
            // (item 22). Nada de conteúdo cru: só as chaves e o wire do card.
            ...(r.result?.dryRun === true ? { keys: r.result.keys, contentType: r.result.type, wire: r.result.wire, qtd: r.result.qtd } : {}),
            sent: Number.isFinite(Number(r.result?.ok)) ? Number(r.result.ok) : undefined,
            failed: Number.isFinite(Number(r.result?.erros)) ? Number(r.result.erros) : undefined
        })),
        cancelled,
        aborted
    }
}

/** Corpo que o laço do flood usa como base (o builder decide o que fazer dele). */
function bodyFor(preset, type) {
    if (type === "media") return String(preset.caption || preset.text || "SYZYGY media-test")
    if (type === "payment") return String(preset.text || "Pagamento de teste")
    return String(preset.text || "SYZYGY text-test")
}

/**
 * mentions: SOMENTE de lista explícita (array no opts, preset.mentions, ou
 * resolver fornecido). Nunca caímos para "todos os participantes".
 */
async function resolveMentionsFor(target, preset, opts) {
    if (typeof opts.resolveMentions === "function") {
        try {
            const r = await opts.resolveMentions(target, preset)
            return Array.isArray(r) ? r : []
        } catch {
            return []
        }
    }
    if (typeof opts.mentions === "function") {
        try {
            const r = await opts.mentions(target, preset)
            return Array.isArray(r) ? r : []
        } catch {
            return []
        }
    }
    if (Array.isArray(opts.mentions) && opts.mentions.length) return opts.mentions
    if (Array.isArray(preset.mentions) && preset.mentions.length) return preset.mentions
    return []
}

function jobTag(type) {
    if (type === "payment") return "PAYMENT"
    if (type === "shopping") return "SHOPPING"
    if (type === "media") return "FLOOD-MEDIA"
    if (type === "mention") return "FLOOD-MENTION"
    return "FLOOD"
}

/** Resultado legível para o operador (alvos mascarados, nada de credencial). */
export function formatPresetJobResult(res = {}) {
    const l = []
    const m = res.metrics || {}
    if (!res.ok && res.error) {
        l.push(`⚠️ FLOOD · ${res.error}`)
        if (res.message) l.push(`   ${res.message}`)
        if (res.remainingMs) l.push(`   cooldown restante: ${Math.ceil(res.remainingMs / 1000)}s`)
        if (res.blocked?.length) l.push(`   bloqueados: ${res.blocked.join(", ")}`)
        return l.join("\n")
    }
    l.push(`🌊 FLOOD · preset ${res.preset?.id || "?"} (${res.type || res.preset?.type || "?"})${res.dryRun ? " · DRY-RUN" : ""}`)
    l.push(`• alvos: ${(res.targets || []).length} · enviados: ${m.sent ?? 0} · falhas: ${m.failed ?? 0} · canceladas: ${m.cancelled ?? 0} · bloqueados: ${m.blocked ?? 0}`)
    if (res.speed) l.push(`• velocidade: ${res.speed.modo} · ${res.speed.intervalo}ms/lote${res.speed.lote}${res.speed.jitter ? " + jitter" : ""}`)
    if (res.limits) l.push(`• tetos aplicados: ${res.limits.maxMessages}x · intervalo ${res.limits.interval}ms · conc ${res.limits.concurrency} · timeout ${res.limits.timeout}ms · cooldown ${Math.round(res.limits.cooldown / 1000)}s`)
    if (m.averageLatency) l.push(`• latência média: ${m.averageLatency}ms · duração ${m.duration}ms`)
    if (res.presetExtra?.wire) l.push(`• wire: ${res.presetExtra.wire}`)
    for (const w of res.presetExtra?.warnings || []) l.push(`⚠️ ${w}`)
    if (res.presetExtra?.display) l.push(`• valor: ${res.presetExtra.display}`)
    if ((res.blocked || []).length) l.push(`• bloqueados: ${res.blocked.join(", ")}`)
    return l.join("\n")
}
