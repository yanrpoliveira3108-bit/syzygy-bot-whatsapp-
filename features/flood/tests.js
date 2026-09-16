// features/flood/tests.js
// Testes do engine de presets (sem WhatsApp real).

import { parseAmount, parseCurrency, parsePaymentArgs, createPaymentPayload, buildPaymentContent, formatPaymentError, getPaymentApiInfo } from "./payment.js"
import { loadPreset, listPresets, buildContent } from "./presets/index.js"
import { FLOOD_PRESETS } from "./config.js"
import { normalizeTargetJid } from "./allowlist.js"
import { remainingCooldown, markJobEnd, clearCooldown, classifyError, withTimeout, createLimiter } from "./limiter.js"
import { createQueue } from "./queue.js"
import { isKillSwitchOn, setKillSwitch } from "./killswitch.js"
import { runPresetJob, isFloodEngineRunning, cancelRunningJob, describePreset } from "./engine.js"
import { visibleTextHasPhones } from "./presets/mention.js"
import { parseSelectedGroups, TARGETS_REQUIRED } from "./groups.js"
import { resolveFloodSpeed, applyFloodSpeed, formatFloodSpeedMenu } from "./speed.js"
import { slugPresetId } from "./customStore.js"

function assert(cond, msg) {
    if (!cond) throw new Error(`FAIL: ${msg}`)
    console.log(`✓ ${msg}`)
}

export async function runFloodPresetTests() {
    console.log("=== TESTES FLOOD PRESETS SYZYGY ===")

    const { carregarConfig, CONFIG } = await import("../../utils/config.js")
    carregarConfig()
    const snap = {
        kill: CONFIG.floodKillSwitch,
        dry: CONFIG.floodDryRun,
        test: CONFIG.floodTestMode,
        allow: [...(CONFIG.floodAllowlist || [])],
        retries: CONFIG.floodMaxRetries,
        custom: Array.isArray(CONFIG.floodCustomPresets) ? JSON.parse(JSON.stringify(CONFIG.floodCustomPresets)) : []
    }

    try {
        CONFIG.floodKillSwitch = false
        CONFIG.floodDryRun = true
        CONFIG.floodTestMode = true
        CONFIG.floodAllowlist = []
        CONFIG.floodMaxRetries = 1
        CONFIG.floodCustomPresets = []
        setKillSwitch(false)
        clearCooldown()

        // --- parser ---
        assert(parsePaymentArgs("").error === "USAGE", "parser vazio → USAGE")
        assert(parsePaymentArgs("teste").error === "USAGE", "parser só texto → USAGE")
        const p1 = parsePaymentArgs("teste|10|BRL")
        assert(p1.ok && p1.amount === 10 && p1.amount1000 === 10000 && p1.currency === "BRL", "!pix-equivalent teste|10|BRL")
        const p2 = parsePaymentArgs("teste|10.50|BRL")
        assert(p2.ok && p2.amount1000 === 10500, "decimal 10.50 → 10500")
        const p3 = parsePaymentArgs("teste|10,50|BRL")
        assert(p3.ok && p3.amount1000 === 10500, "vírgula decimal 10,50")
        assert(parsePaymentArgs("teste|10|ABC").error === "CURRENCY_UNSUPPORTED", "moeda ABC inválida")
        assert(parsePaymentArgs("teste|abc|BRL").error === "AMOUNT_INVALID", "valor abc inválido")
        assert(parsePaymentArgs("teste|-10|BRL").error === "AMOUNT_NEGATIVE", "valor negativo")
        assert(parseAmount("Infinity").error === "AMOUNT_INVALID", "Infinity rejeitado")
        assert(parseAmount("NaN").error === "AMOUNT_INVALID", "NaN rejeitado")
        assert(parseCurrency("usd").ok && parseCurrency("usd").value === "USD", "moeda lowercase → uppercase")
        const payload = createPaymentPayload({ text: "Pagamento de teste", amount: 25.90, currency: "BRL" })
        assert(payload.ok && payload.amount1000 === 25900 && payload.content.amount === 25900, "createPaymentPayload 25.90 BRL")
        const built = buildPaymentContent(payload, { from: "5511999@s.whatsapp.net" })
        assert(built.payment && built.payment.note === "Pagamento de teste" && built.payment.currency === "BRL", "buildPaymentContent usa API payment")
        assert(getPaymentApiInfo().proto === "requestPaymentMessage", "API documentada = requestPaymentMessage")
        assert(formatPaymentError("USAGE").includes("texto|valor|moeda"), "mensagem de uso amigável")

        // --- presets ---
        assert(loadPreset("payment-test").ok, "carrega payment-test")
        assert(loadPreset("text-test").ok, "carrega text-test")
        assert(loadPreset("mention-test").ok, "carrega mention-test")
        assert(loadPreset("media-test").ok, "carrega media-test")
        assert(!loadPreset("allContacts").ok, "não existe allContacts")
        const pt = loadPreset("payment-test").preset
        assert(pt.maxMessages === 3 && pt.interval === 3000 && pt.concurrency === 1 && pt.cooldown === 30000, "payment-test limites padrão")
        assert(pt.targetMode === "selected", "targetMode selected")
        const over = loadPreset("payment-test", { maxMessages: 999, concurrency: 50, interval: 10 }).preset
        assert(over.maxMessages <= 10 && over.concurrency <= 2 && over.interval >= 1000, "hard caps aplicados")
        assert(listPresets().length === 4, "4 presets prontos")
        assert(describePreset("payment-test").type === "payment", "describePreset")
        assert(FLOOD_PRESETS["payment-test"].type === "payment", "preset payment no mapa")

        // --- velocidade clássica (FLOOD_MODOS) ---
        const s1 = resolveFloodSpeed("1")
        assert(s1.ok && s1.modo === "rapido" && s1.intervalo === 50 && s1.lote === 8, "modo 1 = rápido 50ms/lote8")
        const s2 = resolveFloodSpeed("normal")
        assert(s2.ok && s2.intervalo === 100, "modo normal 100ms")
        const s3 = resolveFloodSpeed("3")
        assert(s3.ok && s3.modo === "lento" && s3.intervalo === 250, "modo 3 = lento")
        const s4 = resolveFloodSpeed("4")
        assert(s4.ok && s4.modo === "seguro" && s4.jitter === true, "modo 4 = seguro + jitter")
        const sc = resolveFloodSpeed("200")
        assert(sc.ok && sc.intervalo === 200, "intervalo custom 200")
        assert(!resolveFloodSpeed("xyz").ok, "velocidade inválida")
        const payFast = applyFloodSpeed({ type: "payment", interval: 3000, concurrency: 2 }, s1)
        assert(payFast.interval === 50 && payFast.concurrency === 1, "payment rápido: 50ms concurrency 1")
        const txtFast = applyFloodSpeed({ type: "text", interval: 2000, concurrency: 1 }, s1)
        assert(txtFast.interval === 50 && txtFast.concurrency === 8, "text rápido: lote 8")
        assert(formatFloodSpeedMenu().includes("Rápido"), "menu de velocidade clássico")
        assert(slugPresetId("Pix Loja!") === "pix-loja", "slug do preset custom")

        CONFIG.floodCustomPresets = [{
            id: "pix-loja",
            type: "payment",
            text: "Loja",
            amount: 10,
            currency: "BRL",
            modo: "rapido"
        }]
        const customLoaded = loadPreset("pix-loja")
        assert(customLoaded.ok && customLoaded.preset.text === "Loja" && customLoaded.preset.amount === 10, "carrega preset custom")
        assert(listPresets().some(p => p.id === "pix-loja"), "custom aparece na lista")
        CONFIG.floodCustomPresets = []
        assert(listPresets().length === 4, "sem custom volta a 4")

        // --- mention leak ---
        assert(!visibleTextHasPhones("olá pessoal"), "texto sem telefones")
        assert(visibleTextHasPhones("@551199999999"), "detecta leak de número")

        // --- escolha de grupos (1 ou 1,3,5) ---
        const cache = {
            1: { id: "111@g.us", subject: "Alpha", isAdmin: true },
            2: { id: "222@g.us", subject: "Beta", isAdmin: false },
            3: { id: "333@g.us", subject: "Gama", isAdmin: true }
        }
        const one = parseSelectedGroups(cache, "1")
        assert(one.ok && one.entries.length === 1 && one.entries[0].id === "111@g.us", "escolhe 1 grupo")
        const multi = parseSelectedGroups(cache, "1,3,5")
        assert(multi.ok && multi.entries.length === 2 && multi.invalid.includes("5"), "escolhe 1,3,5 (5 inválido)")
        const spaced = parseSelectedGroups(cache, "1, 3")
        assert(spaced.ok && spaced.entries.map(e => e.id).join(",") === "111@g.us,333@g.us", "vírgula com espaço")
        assert(!parseSelectedGroups(cache, "").ok, "vazio não escolhe")
        assert(!parseSelectedGroups(cache, "all").ok, "não existe allGroups")
        assert(normalizeTargetJid("5511999999999").endsWith("@s.whatsapp.net"), "normaliza número para JID")

        // --- limiter / timeout / retry classification ---
        assert(classifyError({ message: "rate-overlimit" }).retry === true && classifyError({ message: "rate-overlimit" }).abort === false, "rate limit espera")
        assert(classifyError({ message: "connection closed" }).abort === true, "disconnect aborta")
        assert(classifyError({ code: "TIMEOUT" }).retry === true, "timeout pode retry")
        let timed = false
        try {
            await withTimeout(() => new Promise(r => setTimeout(r, 80)), 20)
        } catch (e) {
            timed = e.code === "TIMEOUT"
        }
        assert(timed, "timeout dispara")
        const lim = createLimiter({ interval: 30, concurrency: 1, timeout: 1000, key: "t" })
        const t0 = Date.now()
        await lim.schedule(async () => 1)
        await lim.schedule(async () => 2)
        assert(Date.now() - t0 >= 25, "interval entre envios")

        // --- queue cancel ---
        const q = createQueue({ interval: 5, concurrency: 1, timeout: 500, maxRetries: 1 })
        q.cancel("KILL_SWITCH")
        const qr = await q.runItems([{ target: "x" }], async () => ({ ok: true }))
        assert(qr[0].cancelled, "fila cancelada não envia")

        const qTimeout = createQueue({ interval: 1, concurrency: 1, timeout: 40, maxRetries: 0 })
        const qto = await qTimeout.runItems([{ target: "x@g.us" }], async () => {
            await new Promise(r => setTimeout(r, 120))
            return { ok: true }
        })
        assert(qto[0] && qto[0].ok === false && qto[0].error, "timeout da fila não explode o engine")

        // --- kill switch ---
        setKillSwitch(true)
        assert(isKillSwitchOn(), "kill switch on")
        const killed = await runPresetJob({
            presetId: "text-test",
            dryRun: true,
            sendFn: async () => ({ sent: true })
        })
        assert(killed.error === "KILL_SWITCH", "engine recusa com kill switch")
        setKillSwitch(false)

        const G1 = "111111111111111@g.us"
        const G2 = "222222222222222@g.us"
        const noT = await runPresetJob({
            presetId: "text-test",
            dryRun: true,
            ignoreCooldown: true,
            sendFn: async () => ({ sent: true })
        })
        assert(noT.error === TARGETS_REQUIRED, "sem grupos escolhidos → TARGETS_REQUIRED")

        // --- dry-run + grupos escolhidos + métricas ---
        let sentCount = 0
        const dry = await runPresetJob({
            presetId: "text-test",
            dryRun: true,
            ignoreCooldown: true,
            targets: [G1, G2],
            sendFn: async () => { sentCount++; return { sent: true } }
        })
        assert(dry.ok && dry.dryRun === true, "dry-run ok")
        assert(sentCount === 0, "dry-run não chama envio real")
        assert(dry.metrics.queued >= 1 && dry.metrics.sent >= 1, "métricas queued/sent no dry-run")
        assert(typeof dry.metrics.duration === "number" && typeof dry.metrics.averageLatency === "number", "duration + averageLatency")

        // --- payment dry-run payload ---
        const pay = await runPresetJob({
            presetId: "payment-test",
            dryRun: true,
            ignoreCooldown: true,
            targets: [G1, G2],
            paymentArgs: "Pagamento do pedido|25.90|BRL",
            sendFn: async () => { throw new Error("não deveria enviar") }
        })
        assert(pay.ok && pay.dryRun, "payment-test dry-run")
        assert(pay.preset.currency === "BRL" && pay.preset.amount === 25.9, "payload payment no job")

        const payBad = await runPresetJob({
            presetId: "payment-test",
            dryRun: true,
            ignoreCooldown: true,
            paymentArgs: "teste|10|XYZ"
        })
        assert(!payBad.ok && payBad.error === "CURRENCY_UNSUPPORTED", "payment-test moeda XYZ recusada")

        // --- envio mock real (não dry) limitado ---
        clearCooldown("text-test")
        let realSent = 0
        const live = await runPresetJob({
            presetId: "text-test",
            dryRun: false,
            ignoreCooldown: true,
            targets: [G1, G2],
            sendFn: async (jid, content) => {
                realSent++
                assert(typeof content.text === "string", "text content")
                return { jid }
            }
        })
        assert(live.ok && realSent === live.metrics.sent, "envio mock text-test")
        assert(realSent === 2, "1 envio por grupo escolhido")

        clearCooldown("text-test")
        const G3 = "333333333333333@g.us"
        const G4 = "444444444444444@g.us"
        let manySent = 0
        const many = await runPresetJob({
            presetId: "text-test",
            dryRun: false,
            ignoreCooldown: true,
            floodModo: "20",
            qtd: 2,
            targets: [G1, G2, G3, G4],
            sendFn: async () => { manySent++; return { ok: true } }
        })
        assert(many.ok && manySent === 8 && many.metrics.queued === 8, "4 grupos × qtd 2, sem corte de maxMessages")
        assert(many.preset.interval === 20, "floodModo 20 aplica intervalo clássico (não 2000ms)")

        clearCooldown("payment-test")
        const payFastJob = await runPresetJob({
            presetId: "payment-test",
            dryRun: true,
            ignoreCooldown: true,
            floodModo: "1",
            qtd: 1,
            targets: [G1],
            paymentArgs: "Pedido|9.99|BRL",
            sendFn: async () => ({ ok: true })
        })
        assert(payFastJob.ok && payFastJob.preset.interval === 50 && payFastJob.preset.concurrency === 1, "payment + rápido 50ms conc=1")
        assert(payFastJob.preset.amount === 9.99 && payFastJob.preset.currency === "BRL", "conteúdo texto|valor|moeda no job")

        CONFIG.floodCustomPresets = [{
            id: "pix-loja",
            type: "payment",
            text: "Loja",
            amount: 10,
            currency: "BRL",
            modo: "rapido"
        }]
        clearCooldown("pix-loja")
        const customJob = await runPresetJob({
            presetId: "pix-loja",
            dryRun: true,
            ignoreCooldown: true,
            targets: [G1],
            sendFn: async () => ({ ok: true })
        })
        assert(customJob.ok && customJob.preset.interval === 50 && customJob.preset.amount === 10, "custom usa modo salvo + payload")
        CONFIG.floodCustomPresets = []

        // --- cooldown ---
        markJobEnd("text-test")
        const cd = remainingCooldown("text-test", 30000)
        assert(cd > 0, "cooldown registrado")
        const blockedCd = await runPresetJob({
            presetId: "text-test",
            dryRun: true,
            sendFn: async () => ({})
        })
        assert(blockedCd.error === "COOLDOWN", "cooldown bloqueia segundo job")
        clearCooldown("text-test")

        // --- mention sem leak ---
        const men = await runPresetJob({
            presetId: "mention-test",
            dryRun: true,
            ignoreCooldown: true,
            targets: [G1],
            resolveMentions: async () => ["5511999999999@s.whatsapp.net"],
            sendFn: async (_jid, content) => {
                assert(!visibleTextHasPhones(content.text), "mention não imprime números")
                return {}
            }
        })
        assert(men.ok, "mention-test dry-run")

        // --- payment content shape ---
        const payContent = buildContent(loadPreset("payment-test").preset, { from: "x@s.whatsapp.net" })
        assert(payContent.payment && payContent.payment.amount === 25900, "builder payment amount1000")
        assert(!("requestPaymentMessage" in payContent), "content usa atalho payment, não proto cru")

        // --- retry permanente aborta ---
        clearCooldown("text-test")
        let tries = 0
        const perm = await runPresetJob({
            presetId: "text-test",
            dryRun: false,
            ignoreCooldown: true,
            targets: [G1],
            sendFn: async () => {
                tries++
                throw new Error("forbidden")
            }
        })
        assert(perm.aborted || !perm.ok, "erro permanente não ok")
        assert(tries === 1, "erro permanente não retenta em loop")

        // --- concurrency lock ---
        assert(isFloodEngineRunning() === false, "engine idle")
        assert(typeof cancelRunningJob === "function", "cancelRunningJob exportado")

        // --- regressão: presets conhecidos e nenhum !pix ---
        const { TEXT_TO_ACTION } = await import("../../commands/commandMap.js")
        assert(TEXT_TO_ACTION["2"] === "painel_flood", "comando 2 flood clássico intacto")
        assert(TEXT_TO_ACTION["3"] === "painel_tudo", "comando 3 nuke intacto")
        assert(TEXT_TO_ACTION["paymenttest"] === "flood_preset_payment_test", "paymenttest mapeado")
        assert(!TEXT_TO_ACTION["!pix"] && !TEXT_TO_ACTION["pix"], "não existe comando pix/!pix")
        assert(TEXT_TO_ACTION["floodstop"] === "flood_kill_on", "floodstop mapeado")

        console.log("=== TODOS TESTES FLOOD PRESETS PASSARAM ===")
        return { ok: true, passed: true }
    } finally {
        CONFIG.floodKillSwitch = snap.kill
        CONFIG.floodDryRun = snap.dry
        CONFIG.floodTestMode = snap.test
        CONFIG.floodAllowlist = snap.allow
        CONFIG.floodMaxRetries = snap.retries
        CONFIG.floodCustomPresets = snap.custom
        setKillSwitch(false)
        clearCooldown()
    }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    runFloodPresetTests().catch(e => { console.error(e); process.exit(1) })
}
