// features/flood/tests-infra.js
// [v53 · AB7] Infra do flood: fila, limiter, kill switch, cooldown, custom store,
// alvos, velocidade e a superfície do barrel. Rode:  node features/flood/tests-infra.js
//
// Garantias deste arquivo:
//   • NENHUM envio real: `executor` injetado (nada toca socket) — e quando o
//     caminho real é exercido, é com sock falso.
//   • config.json / dono/historico.json NÃO são escritos: as chaves observadas
//     são comparadas byte a byte antes/depois (customStore roda com persist:false).
//   • estado global (CONFIG, kill switch, cooldown, seleção de alvos) é
//     restaurado no finally — a suíte não deixa rastro.
//   • [v53] as suítes de allowlist/dry-run/shopping foram retiradas junto com os
//     conceitos; o que está aqui é o que sobrou (e o que é novo: targets/seleção).

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG, FLOOD_MODOS, floodMaxEfetivo } from "../../utils/config.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, "..", "..")
const CONFIG_PATH = path.join(RAIZ, "config.json")
const HIST_PATH = path.join(RAIZ, "dono", "historico.json")

let passed = 0, failed = 0, skipped = 0
const failures = []
function ok(m) { passed++; console.log(`✓ ${m}`) }
function assert(c, m) {
    if (c) ok(m)
    else { failed++; failures.push(m); console.log(`✗ ${m}`) }
}
function assertEq(a, e, m) {
    const A = JSON.stringify(a), E = JSON.stringify(e)
    if (A === E) { ok(m); return }
    failed++; failures.push(`${m} — esperado ${E}, veio ${A}`)
    console.log(`✗ ${m} — esperado ${E}, veio ${A}`)
}
function skip(m) { skipped++; console.log(`… SKIP ${m}`) }

const GROUP_A = "5519999999999-1000@g.us"
const GROUP_B = "5519999999999-2000@g.us"
const GROUP_C = "5519999999999-3000@g.us"
const executorProibido = () => { throw new Error("EXECUTOR_CHAMADO_EM_TESTE") }

const CONFIG_KEYS_WATCHED = ["floodCustomPresets", "floodKillSwitch", "floodModo", "floodInterval", "floodLote", "floodJitter", "floodMaxMensagens", "floodErrorStop", "floodTipo", "marcarFantasma", "nome", "gruposAutorizados"]

function snapshotConfig() {
    const obj = {}
    for (const k of CONFIG_KEYS_WATCHED) obj[k] = JSON.stringify(CONFIG[k])
    return JSON.stringify(obj)
}

async function main() {
    console.log("=== TESTES FLOOD · INFRA (fila/limiter/killswitch/alvos/customStore/velocidade) ===")
    const cfgBytes = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
    const histBytes = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null
    const snapAntes = snapshotConfig()

    const { createQueue, QUEUE_CANCELLED } = await import("./queue.js")
    const { createLimiter, withTimeout, sleep, classifyError, remainingCooldown, markJobEnd, clearCooldown } = await import("./limiter.js")
    const ks = await import("./killswitch.js")
    const { isKillSwitchOn, isKillSwitchPersisted, setKillSwitch, toggleKillSwitch, onKillSwitch, killSwitchStatusTexto, KILL_SWITCH_REASON } = ks
    const cs = await import("./customStore.js")
    const tg = await import("./targets.js")
    const gr = await import("./groups.js")
    const sp = await import("./speed.js")
    const cfgMod = await import("./config.js")
    const { runPresetJob, formatPresetJobResult, currentJobInfo, cancelRunningJob, isFloodEngineRunning } = await import("./presetEngine.js")
    const { loadPreset, buildContent, listPresets, describePreset } = await import("./presets/index.js")

    const antes = {
        marcarFantasma: CONFIG.marcarFantasma,
        kill: CONFIG.floodKillSwitch,
        modo: CONFIG.floodModo,
        intervalo: CONFIG.floodInterval,
        lote: CONFIG.floodLote,
        jitter: CONFIG.floodJitter,
        maxMensagens: CONFIG.floodMaxMensagens,
        errorStop: CONFIG.floodErrorStop,
        pace: CONFIG.floodPaceAdaptativo,
        tipo: CONFIG.floodTipo,
        retries: CONFIG.floodMaxRetries,
        custom: Array.isArray(CONFIG.floodCustomPresets) ? [...CONFIG.floodCustomPresets] : []
    }

    try {
        // ── 0) runtime e chaves aposentadas ──────────────────────────────────
        const rc = cfgMod.getFloodRuntimeConfig()
        assert(!("dryRun" in rc) && !("testMode" in rc) && !("allowlist" in rc), "runtime não expõe dryRun/testMode/allowlist")
        assertEq(typeof rc.maxMensagens, "number", "runtime expõe o teto de mensagens")
        assertEq(rc.maxMensagens, floodMaxEfetivo(), "o teto do runtime é o do config (mesma fonte)")
        assert("paceAdaptativo" in rc && "errorStop" in rc, "estabilidade tem knob próprio (pace adaptativo + erro-stop)")
        assert(!("floodAllowlist" in CONFIG) && !("floodDryRun" in CONFIG) && !("floodTestMode" in CONFIG), "as chaves aposentadas não renascem no CONFIG em memória")
        const { CONFIG_CHAVES_APOSENTADAS } = await import("../../utils/config.js")
        assertEq(CONFIG_CHAVES_APOSENTADAS, ["floodAllowlist", "floodDryRun", "floodTestMode"], "a lista de chaves aposentadas é digitada (migração as usa)")

        // ── 1) cooldown por preset ───────────────────────────────────────────
        clearCooldown()
        assertEq(remainingCooldown("text-test", 30000), 0, "sem job anterior → cooldown zero")
        markJobEnd("text-test")
        const cd1 = remainingCooldown("text-test", 30000)
        assert(cd1 > 29000 && cd1 <= 30000, "markJobEnd abre o cooldown (30s)")
        assertEq(remainingCooldown("outro-preset", 30000), 0, "cooldown é POR preset, não global")
        clearCooldown("text-test")
        assertEq(remainingCooldown("text-test", 30000), 0, "clearCooldown(id) reseta só ele")
        markJobEnd("text-test"); markJobEnd("payment-test"); clearCooldown()
        assertEq(remainingCooldown("payment-test", 1), 0, "clearCooldown() sem id reseta todos")

        // ── 2) limiter: intervalo global por key, concorrência e jitter ──────
        const L = createLimiter({ interval: 40, concurrency: 2, timeout: 1000, key: "t-lim", jitter: false })
        assertEq(L.limits().interval, 40, "limiter expõe os limites efetivos")
        assertEq(L.limits().concurrency, 2, "concorrência efetiva")
        let pico = 0, atual = 0
        const tarefas = Array.from({ length: 6 }, () => L.schedule(async () => {
            atual++; pico = Math.max(pico, atual)
            await sleep(15)
            atual--
        }))
        await Promise.all(tarefas)
        assertEq(pico, 2, "pico de concorrência = teto do limiter (não virou rajada)")
        assertEq(L.inflight(), 0, "inflight zerou no fim")
        assertEq(L.pending(), 0, "sem waiter órfão")
        const t0 = Date.now()
        await L.schedule(async () => {})
        await L.schedule(async () => {})
        assert(Date.now() - t0 >= 30, "intervalo é GLOBAL por key (segunda chamada esperou o ritmo)")
        const JL = createLimiter({ interval: 10, concurrency: 1, jitter: true, key: "t-jit" })
        const jt0 = Date.now()
        await JL.schedule(async () => {}); await JL.schedule(async () => {})
        assert(Date.now() - jt0 >= 40, "jitter só AUMENTA a espera (nunca encurta / não dribla proteção)")
        let timingEstourou = null
        try { await withTimeout(() => sleep(120), 20) } catch (e) { timingEstourou = e.code }
        assertEq(timingEstourou, "TIMEOUT", "withTimeout tipifica estouro como TIMEOUT")
        const valeu = await withTimeout(async () => 7, 500)
        assertEq(valeu, 7, "withTimeout passa o resultado quando cabe no tempo")
        // classifyError: o que retrya e o que aborta
        assertEq(classifyError(Object.assign(new Error("rate-overlimit"), {})).kind, "rate_limit", "rate-overlimit → rate_limit")
        assertEq(classifyError(new Error("Connection Closed")).kind, "disconnect", "desconexão → disconnect")
        assert(classifyError(new Error("Connection Closed")).abort === true, "disconnect ABORTA (não se martela sessão caída)")
        assertEq(classifyError(new Error("429 too many requests")).kind, "rate_limit", "429 em texto livre também é rate_limit (não mata o job)")
        assertEq(classifyError(Object.assign(new Error("x"), { data: 429 })).kind, "rate_limit", "e data:429 idem")
        assert(classifyError(new Error("qualsiquerro")).abort === true, "erro desconhecido ABORTA (conservador: não insistir em cima do erro)")
        assertEq(classifyError(Object.assign(new Error("estourou"), { code: "TIMEOUT" })).kind, "timeout", "code TIMEOUT entra como timeout retryável")
        assert(/forbidden|blocked|permanent/.test(JSON.stringify(classifyError(new Error("403 forbidden")))), "forbidden é tratado como permanente")

        // ── 3) fila: retry com backoff, cancelamento, shouldStop ─────────────
        let tentativas = 0
        const Q = createQueue({ interval: 0, concurrency: 1, timeout: 1000, maxRetries: 1 })
        const rq = await Q.runItems([{ target: GROUP_A }], async () => {
            tentativas++
            if (tentativas === 1) throw new Error("rate-overlimit")
            return { ok: 1 }
        })
        assertEq(tentativas, 2, "rate limit tentou de novo (backoff, não contorno)")
        assertEq(rq[0].ok, true, "e o item acabou OK")
        assertEq(Q.counts().sent, 1, "counts() soma envios ok da fila")
        assertEq(Q.counts().failed, 0, "e falhas finais")
        const Q2 = createQueue({ interval: 0, concurrency: 1, timeout: 1000, maxRetries: 2 })
        const r2 = await Q2.runItems([{ target: GROUP_A }], async () => { throw new Error("Connection Closed") })
        assertEq(r2[0].abort, true, "disconnect aborta o item")
        assertEq(Q2.isCancelled(), true, "abort cancela a fila")
        assertEq(Q2.getCancelReason(), "DISCONNECT", "com o motivo digitado")
        let chamados = 0
        const Q3 = createQueue({ interval: 0, concurrency: 1, timeout: 500, shouldStop: () => true })
        const r3 = await Q3.runItems([{ target: GROUP_A }, { target: GROUP_B }], async () => { chamados++; return {} })
        assertEq(chamados, 0, "shouldStop=true → worker nunca é chamado")
        assert(r3.every(x => x.cancelled === true || x.ok === false), "itens vêm como cancelados, não como enviados")
        const Q4 = createQueue({ interval: 0, concurrency: 1, timeout: 500 })
        const p4 = Q4.runItems([{ target: GROUP_A }], async () => { await sleep(200); return {} })
        Q4.cancel(QUEUE_CANCELLED)
        const r4 = await p4
        assert(Array.isArray(r4), "cancel() não deixa runItems quebrar")
        assertEq(Q4.getCancelReason(), QUEUE_CANCELLED, "motivo do cancel fica legível")
        assertEq(Q4.limits().interval, 0, "a fila expõe os limites que recebeu")

        // ── 4) kill switch (estado, listener, texto, persistência) ───────────
        CONFIG.floodKillSwitch = false
        assertEq(isKillSwitchOn(), false, "kill switch desligado = flood liberado")
        let eventos = []
        const off = onKillSwitch(ev => eventos.push(ev))
        assertEq(typeof off, "function", "onKillSwitch devolve unsubscribe")
        assertEq(toggleKillSwitch({ persist: false }), true, "toggle liga")
        assertEq(eventos.length, 1, "listener foi avisado ao ligar")
        assertEq(isKillSwitchOn(), true, "estado refletido")
        assert(/BLOQUEADO|bloqueado|ATIVO|ativo/i.test(killSwitchStatusTexto()), "texto de status digitado")
        assertEq(toggleKillSwitch({ persist: false }), false, "toggle desliga")
        assertEq(eventos.length, 2, "e avisa de novo")
        setKillSwitch(true, { persist: false })
        assertEq(isKillSwitchOn(), true, "setKillSwitch(true) liga")
        const antesDoOff = eventos.length
        off()
        setKillSwitch(true, { persist: false })
        setKillSwitch(false, { persist: false })
        assertEq(eventos.length, antesDoOff, "depois do unsubscribe, nada mais é entregue ao listener (sem vazamento)")
        setKillSwitch(false, { persist: false })
        assertEq(CONFIG.floodKillSwitch, false, "e persist:false devolve o CONFIG ao estado anterior")
        assertEq(isKillSwitchPersisted(), false, "persist:false não escreve no CONFIG (o config do usuário é sagrado em teste)")
        function ofOffSafe(fn) { try { fn && fn() } catch {} }

        // ── 5) runPresetJob: porteiras e métricas (sem envio) ────────────────
        clearCooldown()
        const j1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 2, ignoreCooldown: true, executor: async () => ({ ok: 2, erros: 0, total: 2 }) })
        assertEq(j1.ok, true, "job com executor fake roda")
        assertEq(j1.metrics.sent, 2, "métrica sent vem do resultado do laço")
        assertEq(j1.metrics.targets, 1, "alvos contados")
        assert(j1.metrics.duration >= 0, "duração medida")
        const j2 = await runPresetJob({ presetId: "text-test", targets: [], qtd: 1, executor: executorProibido })
        assertEq(j2.error, gr.TARGETS_REQUIRED, "sem alvo → TARGETS_REQUIRED (nunca 'todos')")
        const j3 = await runPresetJob({ presetId: "payment-test", overlay: { currency: "ZZZ" }, targets: [GROUP_A], qtd: 1, executor: executorProibido })
        assert(/CURRENCY|PAYMENT/.test(j3.error || ""), "payment com moeda inválida falha antes de qualquer send")
        assert(/FLOOD ·/.test(formatPresetJobResult(j3)), "resultado formatado também para falha")
        CONFIG.floodKillSwitch = true
        const j4 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, executor: executorProibido })
        assertEq(j4.error, KILL_SWITCH_REASON, "kill switch barra o job inteiro")
        CONFIG.floodKillSwitch = false
        clearCooldown()
        const emAndamento = []
        const p5 = runPresetJob({
            presetId: "text-test", targets: [GROUP_A], qtd: 1, ignoreCooldown: true,
            executor: async () => { await sleep(80); return { ok: 1, erros: 0, total: 1 } }
        }).then(r => { emAndamento.push("fim"); return r })
        await sleep(10)
        assert(isFloodEngineRunning(), "isFloodEngineRunning() vê o job corrente")
        const duplo = await runPresetJob({ presetId: "text-test", targets: [GROUP_B], qtd: 1, ignoreCooldown: true, executor: executorProibido })
        assertEq(duplo.error, "JOB_IN_PROGRESS", "job dois é recusado (um por vez — sem fila paralela)"),
        assert(currentJobInfo() && currentJobInfo().targets.length === 1, "currentJobInfo descreve o job")
        await p5
        assertEq(emAndamento, ["fim"], "job único terminou")
        clearCooldown()
        const alvoFora = await runPresetJob({ presetId: "text-test", targets: ["lixo total"], qtd: 1, ignoreCooldown: true, executor: executorProibido })
        assertEq(alvoFora.error, tg.BLOCKED_TARGET, "alvo que não vira JID → BLOCKED_TARGET")

        // ── 6) alvos: seleção do operador e proteção ─────────────────────────
        tg.clearFloodSelection()
        assertEq(tg.getFloodSelection(), [], "sem seleção global")
        tg.setFloodSelection([GROUP_A, GROUP_B], { dono: "donoX" })
        assertEq(tg.getFloodSelection("donoX"), [GROUP_A, GROUP_B], "seleção por dono")
        tg.setFloodSelection([GROUP_C])
        assertEq(tg.getFloodSelection(), [GROUP_C], "seleção global independente da por dono")
        assertEq(tg.getFloodSelection("donoX"), [GROUP_A, GROUP_B], "e não sobrescreve a do dono")
        tg.clearFloodSelection()
        assertEq(tg.getFloodSelection(), [], "clear só da global")
        assertEq(tg.getFloodSelection("donoX").length, 2, "a do dono continua")
        tg.clearFloodSelection("donoX")
        assertEq(tg.getFloodSelection("donoX"), [], "cada dono limpa a sua")
        const { addAuthorizedGroup, removeAuthorizedGroup } = await import("../../utils/permissions.js")
        const addP = addAuthorizedGroup(GROUP_C)
        const filtrado = tg.filterTargets([GROUP_A, GROUP_C])
        assertEq(filtrado.allowed, [GROUP_A], "grupo autorizado do bot é cortado dos alvos do flood")
        assertEq(filtrado.blocked[0].reason, tg.PROTECTED_GROUP_BLOCKED, "com razão digitada")
        assertEq(tg.isProtectedGroupJid(GROUP_C), true, "isProtectedGroupJid espelha a proteção")
        assertEq(tg.isProtectedGroupJid(GROUP_A), false, "grupo comum não é protegido")
        if (addP?.added) removeAuthorizedGroup(GROUP_C)
        assertEq(tg.filterTargets([{ id: GROUP_A }, GROUP_A]).allowed.length, 1, "duplicata (objeto e string) colapsa em um")

        // ── 7) groups: escolha explícita (1 / 1,3,5 / nada de "todos") ───────
        const cache = {
            1: { id: GROUP_A, subject: "Grupo A", isAdmin: true },
            2: { id: GROUP_B, subject: "Grupo B", isAdmin: false },
            3: { id: GROUP_C, subject: "Grupo C", isAdmin: false }
        }
        const g1 = gr.parseSelectedGroups(cache, "1")
        assertEq(g1.ok && g1.entries.length, 1, "1 → um grupo")
        assertEq(g1.entries[0].id, GROUP_A, "e é o grupo certo")
        const g3 = gr.parseSelectedGroups(cache, "1,3")
        assertEq(g3.ok && g3.entries.map(e => e.id), [GROUP_A, GROUP_C], "1,3 → dois alvos")
        const gBad = gr.parseSelectedGroups(cache, "1,99")
        assertEq(gBad.ok, true, "parcial: o que existe é aproveitado")
        assertEq(gBad.invalid, ["99"], "e o índice inexistente é devolvido em invalid")
        assertEq(gr.parseSelectedGroups(cache, "99").ok, false, "só inválido → ok:false (NADA de 'todos')")
        assertEq(gr.parseSelectedGroups(cache, "99").error, "NONE", "com erro digitado NONE")
        assertEq(gr.parseSelectedGroups(cache, "todos").ok, false, "'todos' NÃO é atalho aqui (é escolha explícita)")
        assertEq(gr.parseSelectedGroups(cache, "").error, "USAGE", "vazio → USAGE")
        assertEq(gr.parseSelectedGroups(cache, "2|1,5").error, "USAGE", "índice com | é USAGE (não come o overlay)")
        // extractTargetJids só achata/ordena; quem valida é filterTargets (uma
        // única porteira, sem duas implementações de JID válido no projeto)
        assertEq(gr.extractTargetJids([{ id: GROUP_A }, GROUP_B, null, GROUP_A]), [GROUP_A, GROUP_B], "extractTargetJids aceita objeto/string, deduplica e descarta vazio")
        assertEq(tg.filterTargets(gr.extractTargetJids([42, null])).error, tg.BLOCKED_TARGET, "e '42' é barrado na filtragem (não vira destinatário quebrado)")
        assertEq(gr.TARGETS_REQUIRED, "TARGETS_REQUIRED", "constante de erro estável")

        // ── 8) customStore: CRUD, reserved e persistência ───────────────────
        const n1 = cs.saveCustomPreset({ name: "Meu Pago", type: "payment", text: "Cobrança", amount: "12,50", currency: "brl" }, { persist: false })
        assertEq(n1.ok, true, "custom payment criado (persist:false)")
        assertEq(n1.preset.amount, 12.5, "valor normalizado")
        assertEq(n1.preset.currency, "BRL", "moeda normalizada")
        assertEq(CONFIG.floodCustomPresets.length, antes.custom.length + 1, "entrou na lista em memória")
        const n2 = cs.saveCustomPreset({ name: "meu pago", type: "payment", amount: 1 }, { persist: false })
        assertEq(n2.updated, true, "mesmo slug atualiza em vez de duplicar")
        assertEq(cs.saveCustomPreset({ name: "text-test", type: "text" }, { persist: false }).error, "RESERVED", "não se ofusca preset built-in")
        assertEq(cs.saveCustomPreset({ name: "x", type: "shopping" }, { persist: false }).error, "TYPE_INVALID", "tipo 'shopping' não existe mais (nem como custom)")
        assertEq(cs.saveCustomPreset({ name: "x", type: "payment", amount: "abc" }, { persist: false }).error, "AMOUNT_INVALID", "payment sem valor é recusado")
        assertEq(cs.saveCustomPreset({ name: "   " }, { persist: false }).error, "NAME", "nome vazio recusado")
        const txt = cs.saveCustomPreset({ name: "Aviso Loja", type: "text", text: "aberto até 22h" }, { persist: false })
        assertEq(txt.ok, true, "custom de texto criado")
        const up = cs.updateCustomPreset("aviso-loja", { text: "aberto até 23h" }, { persist: false })
        assertEq(up.ok && up.preset.text, "aberto até 23h", "update por id funciona")
        const defCustom = cfgMod.getPresetDef("aviso-loja")
        assertEq(defCustom.type, "text", "getPresetDef resolve o custom")
        assert(cfgMod.listPresetIds().includes("aviso-loja"), "listPresetIds inclui custom")
        const lp = loadPreset("aviso-loja")
        assertEq(lp.ok && buildContent(lp.preset).text, "aberto até 23h", "loadPreset+builder montam o custom")
        assertEq(cs.saveCustomPreset({ name: "sem-alvo", type: "custom" }, { persist: false }).error, "CUSTOM_TYPE_INVALID", "custom sem customType é recusado no cadastro (não vira texto em silêncio)")
        assertEq(cs.saveCustomPreset({ name: "ruim", type: "custom", customType: "shopping" }, { persist: false }).error, "CUSTOM_TYPE_INVALID", "customType 'shopping' não é delegado de ninguém")
        const lc = cs.saveCustomPreset({ name: "pago-robusto", type: "custom", customType: "payment", amount: 5, currency: "BRL", text: "pix" }, { persist: false })
        assertEq(lc.ok, true, "custom type 'custom' com customType payment é aceito")
        const lp2 = loadPreset("pago-robusto")
        assertEq(lp2.ok && buildContent(lp2.preset, { from: "55@s.whatsapp.net" }).payment.amount, 5000, "e delega para o builder de payment (5 → 5000)")
        const semTipo = loadPreset("aviso-loja", { type: "shopping" })
        assertEq(semTipo.ok, false, "custom forçado a 'shopping' é barrado no loadPreset")
        assert(/Nenhum preset custom|^.*┃ 1 · /m.test(cs.formatCustomPresetsTexto()), "formatação lista os custom")
        assertEq(cs.deleteCustomPreset("aviso-loja", { persist: false }).removed.id, "aviso-loja", "delete por id")
        assertEq(cs.deleteCustomPreset("nao-existe", { persist: false }).error, "NOT_FOUND", "delete inexistente → NOT_FOUND")
        CONFIG.floodCustomPresets = antes.custom
        assertEq(cs.isReservedPresetId("payment-test"), true, "payment-test continua reservado")
        assertEq(cs.isReservedPresetId("shopping-test"), false, "shopping-test deixou de ser reservado")
        assertEq(cs.slugPresetId("  Súper  Loja 24h!! "), "super-loja-24h", "slugPresetId tira acento sem apagar letra")
        assertEq(cs.slugPresetId("São Paulo 24h"), "sao-paulo-24h", "e São Paulo vira sao-paulo (não so-paulo)")
        assertEq(cs.CUSTOM_STORE_KEY, "floodCustomPresets", "a chave do store é a do config")

        // ── 9) velocidade: mesma fonte do AB7, sem segundo sistema ───────────
        for (const [i, modo] of Object.entries(["rapido", "normal", "lento", "seguro"])) {
            const r = sp.resolveFloodSpeed(String(Number(i) + 1))
            assertEq(r.ok && r.modo, modo, `atalho ${Number(i) + 1} → ${modo}`)
            assertEq(r.intervalo, FLOOD_MODOS[modo].intervalo, `${modo} vem de FLOOD_MODOS (sem tabela paralela)`)
        }
        assertEq(sp.resolveFloodSpeed("0").from, "config", "0 = config atual")
        assertEq(sp.resolveFloodSpeed(sp.CUSTOM_INTERVAL_MAX + 1).ok, false, "acima do máximo custom recusado")
        assertEq(sp.resolveFloodSpeed(sp.CUSTOM_INTERVAL_MIN).intervalo, sp.CUSTOM_INTERVAL_MIN, "no limite mínimo aceito")
        const ap = sp.applyFloodSpeed({ type: "text", interval: 3000, concurrency: 3 }, sp.resolveFloodSpeed("1"))
        assertEq(ap.interval, Math.max(cfgMod.FLOOD_PRESET_HARD_CAP.minInterval, FLOOD_MODOS.rapido.intervalo), "overlay não desce abaixo do piso do hard cap")
        assertEq(ap.lote, FLOOD_MODOS.rapido.lote, "lote vai junto com o modo")
        assertEq(sp.applyFloodSpeed({ type: "text", interval: 1000 }, null).interval, 1000, "cfg inválido não altera o preset")
        assertEq(sp.toFloodOpts(null), null, "toFloodOpts(null) = null (o laço usa o config)")
        assert(/VELOCIDADE DO FLOOD/.test(sp.formatFloodSpeedMenu()), "menu de velocidade existe e é nomeado")

        // ── 10) integração com o laço clássico: kill switch vale para todos ──
        CONFIG.marcarFantasma = false
        const gs = await import("../../services/groupService.js")
        const { setSock } = await import("../../connection/socket.js")
        const enviadosFake = []
        setSock({ user: { id: "5511999990000@s.whatsapp.net" }, sendMessage: async (jid, c) => { enviadosFake.push({ jid, c }); return {} } })
        setKillSwitch(true, { persist: false })
        const parado = await gs.executarFlood(GROUP_A, "oi", 6, { intervalo: 0, lote: 3 })
        assertEq(parado.ok, 0, "flood clássico respeita o kill switch")
        assertEq(enviadosFake.length, 0, "e nada chegou ao socket")
        setKillSwitch(false, { persist: false })
        const rodou = await gs.executarFlood(GROUP_A, "oi", 4, { intervalo: 0, lote: 2 })
        assertEq(rodou.ok, 4, "liberado, o mesmo laço entrega as 4")
        assertEq(rodou.lote, 2, "lote respeitado no resultado")
        assertEq(typeof rodou.msgPorSeg, "number", "throughput medido (velocidade é auditável)")
        const lote = await gs.executarFloodLote([GROUP_A, GROUP_B], "oi", 1, { intervalo: 0, lote: 1 })
        assertEq(lote.length, 2, "lote devolve um resultado por grupo")
        assert(lote.every(r => r.ok === true && r.enviados === 1 && r.total === 1), "ambos rodaram pelo MESMO executarFlood (ok booleano por grupo + contagem à parte)")
        assertEq(typeof lote[0].msgPorSeg, "number", "e o lote traz o throughput por grupo")
        setKillSwitch(true, { persist: false })
        const loteParado = await gs.executarFloodLote([GROUP_A, GROUP_B], "oi", 1, { intervalo: 0 })
        assert(loteParado.every(r => /kill switch/i.test(r.erro || "")), "kill switch também vale para o lote (nada 'para terminar')")
        setKillSwitch(false, { persist: false })
        setSock(null)
        CONFIG.marcarFantasma = antes.marcarFantasma

        // ── 11) cancelamento do job corrente via API ─────────────────────────
        clearCooldown()
        let visto = 0
        const p11 = runPresetJob({
            presetId: "text-test", targets: [GROUP_A, GROUP_B], qtd: 1, ignoreCooldown: true,
            executor: async () => { visto++; await sleep(60); return { ok: 1, erros: 0, total: 1 } }
        })
        await sleep(10)
        const c = cancelRunningJob("teste")
        assertEq(c, true, "cancelRunningJob confirma que cancelou")
        await p11
        assertEq(isFloodEngineRunning(), false, "e o engine volta a ocioso")
        assertEq(cancelRunningJob("de novo"), false, "sem job corrente devolve false (não finge que cancelou)")
        clearCooldown()

        // ── 12) sem ciclo: infra não importa o barrel nem o socket ───────────
        for (const f of ["queue.js", "limiter.js", "killswitch.js", "groups.js", "targets.js", "customStore.js", "speed.js", "config.js"]) {
            const src = fs.readFileSync(path.join(AQUI, f), "utf8")
            assert(!/from "\.\/index\.js"/.test(src), `${f} não importa o próprio barrel`)
            if (["queue.js", "limiter.js", "groups.js", "customStore.js"].includes(f)) {
                assert(!/connection\/socket\.js/.test(src), `${f} não conhece socket (infra pura)`)
            }
        }
        const routerSrc = fs.readFileSync(path.join(AQUI, "router.js"), "utf8")
        assert(!/from "\.\/index\.js"/.test(routerSrc), "router.js também foge do barrel (ciclo ESM)")

        // ── 13) superfície do barrel ─────────────────────────────────────────
        const barrel = await import("./index.js")
        const ESPERADO = [
            "getFloodRuntimeConfig", "getPresetDef", "listPresetIds", "clampPresetLimits", "clampJobQtd",
            "FLOOD_PRESET_HARD_CAP", "FLOOD_PRESET_TYPES", "DEFAULT_FLOOD_PRESET_ID", "DEFAULT_PAYMENT_PRESET_ID",
            "listPaymentPresets", "listPaymentPresetsTexto", "floodTipoLabel",
            "loadPreset", "buildPresetContent", "listPresets", "describePreset", "listPresetsTexto", "PRESET_BUILDERS",
            "runPresetJob", "formatPresetJobResult", "isFloodEngineRunning", "currentJobInfo", "cancelRunningJob",
            "isKillSwitchOn", "isKillSwitchPersisted", "setKillSwitch", "toggleKillSwitch", "onKillSwitch", "killSwitchStatusTexto", "KILL_SWITCH_REASON",
            "normalizeTargetJid", "maskJid", "filterTargets", "isProtectedGroupJid",
            "setFloodSelection", "getFloodSelection", "clearFloodSelection", "resumoAlvosTexto",
            "parseSelectedGroups", "extractTargetJids", "TARGETS_REQUIRED",
            "resolveFloodSpeed", "formatFloodSpeedMenu", "applyFloodSpeed", "toFloodOpts",
            "createQueue", "QUEUE_CANCELLED", "createLimiter", "withTimeout", "sleep", "classifyError",
            "remainingCooldown", "markJobEnd", "clearCooldown",
            "slugPresetId", "listCustomPresets", "getCustomPreset", "saveCustomPreset", "deleteCustomPreset",
            "formatCustomPresetsTexto", "isReservedPresetId", "CUSTOM_TYPES",
            "getPaymentApiInfo", "parsePaymentArgs", "parseAmount", "parseCurrency", "createPaymentPayload",
            "buildPaymentContent", "formatPaymentError", "detectPaymentTrigger", "resolvePaymentContent",
            "floodRouter", "floodPresetsMenuTexto", "FLOOD_PRESET_COMMANDS", "FLOOD_TEST_ACTION_PRESET",
            "paymentOverlayFromRest", "floodContentBuilderFor"
        ]
        const faltando = ESPERADO.filter(k => !(k in barrel))
        assertEq(faltando, [], `barrel exporta a superfície combinada (${ESPERADO.length} nomes)`)
        for (const morto of ["getAllowlist", "addAllowlistJid", "removeAllowlistJid", "formatAllowlistTexto", "isOnAllowlist", "filterAllowlist", "ALLOWLIST_EMPTY", "createShoppingPayload", "detectShoppingTrigger", "resolveShoppingSend", "shoppingPromptText", "SHOP_SEND_KEYS", "SHOPPING_LIMITS", "SURFACE_VALID", "listarIdsDeLoja", "compararShopId", "previewContentKeys"]) {
            assert(!(morto in barrel), `barrel NÃO expõe '${morto}' (conceito aposentado)`)
        }
        assertEq(Object.keys(barrel.FLOOD_TEST_ACTION_PRESET).length, 4, "quatro atalhos de teste (text/mention/media/payment)")
        assert(!Object.values(barrel.FLOOD_TEST_ACTION_PRESET).some(v => /shop/.test(v)), "nenhum atalho aponta para shopping")
        assert(Object.keys(barrel.FLOOD_PRESET_COMMANDS).length >= 8, "comandos de texto preservados da arena antiga")
        for (const c of ["paymenttest", "texttest", "mentiontest", "mediatest", "floodstop", "floodstart", "floodpresets"]) {
            assert(c in barrel.FLOOD_PRESET_COMMANDS, `atalho '${c}' continua existindo`)
        }
        for (const morto of ["shoppingtest", "flooddryrun"]) {
            assert(!(morto in barrel.FLOOD_PRESET_COMMANDS), `'${morto}' saiu do commandMap (fonte: router)`)
        }
        assertEq(typeof barrel.floodContentBuilderFor({ floodTipo: "texto" }), "object", "builder 'null' para tipo texto")
        const bPay = barrel.floodContentBuilderFor({ floodTipo: "pagamento", floodContent: { type: "payment", text: "x", amount: 7, currency: "BRL" }, floodFrom: "55@s.whatsapp.net" })
        assertEq(typeof bPay, "function", "payment ganha builder por iteração")
        assertEq(bPay({ index: 0, body: "y", msg: "y" }).payment.amount, 7000, "e o payload usa o valor validado, não o corpo do laço")
        assertEq(barrel.floodContentBuilderFor({ floodTipo: "nao-existe" }), null, "tipo inexistente não inventa nada")
    } catch (e) {
        failed++
        failures.push(`exceção: ${e.stack || e}`)
        console.log(`✗ exceção: ${e.stack || e}`)
    } finally {
        Object.assign(CONFIG, antes)
        CONFIG.floodCustomPresets = antes.custom
        setKillSwitch(!!antes.kill, { persist: false })
        clearCooldown()
        tg.clearFloodSelection(); tg.clearFloodSelection("donoX")
        try { (await import("../../connection/socket.js")).setSock(null) } catch {}
        const cfgDepois = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
        const histDepois = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null
        assertEq(snapshotConfig(), snapAntes, "nenhuma chave vigiada do CONFIG ficou alterada")
        assert((cfgBytes === null && cfgDepois === null) || (cfgBytes && cfgDepois && cfgBytes.equals(cfgDepois)), "config.json NÃO foi tocado pela suíte")
        assert((histBytes === null && histDepois === null) || (histBytes && histDepois && histBytes.equals(histDepois)), "dono/historico.json NÃO foi tocado pela suíte")
    }

    console.log(`\n=== FLOOD · INFRA: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failed) {
        console.log("\nFalhas:")
        for (const f of failures) console.log(` • ${f}`)
        process.exitCode = 1
    }
}

main().catch(e => { console.error(e); process.exit(1) })
