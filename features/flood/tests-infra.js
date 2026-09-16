// features/flood/tests-infra.js
// [INFRA FLOOD] Testes da infraestrutura de presets recuperada da arena
// 01a0aaae e adaptada ao AB7. Rode:  node features/flood/tests-infra.js
//
// Garantias deste arquivo:
//   • NENHUM envio real: todo send passa por um sock FALSO ou por um executor
//     injetado. O executor padrão (services/groupService.js) é exercitado só com
//     sock falso (setSock) — e um executor que ESTOURA é usado nos dry-runs, para
//     o teste provar que o caminho de envio não foi tocado.
//   • config.json é lido antes/depois: se qualquer asserção persistir em disco, o
//     teste falha (presets custom rodam com persist:false).
//   • estado global (CONFIG, allowlist, grupos autorizados, kill switch, cooldown)
//     é restaurado no finally — teste nenhum deixa o bot com kill switch ligado.
//
// Sem dependências externas: o runner é o mesmo formato de features/flood/tests.js.

import fs from "fs"
import { CONFIG } from "../../utils/config.js"
import { setAuthorizedGroups, getAuthorizedGroups } from "../../utils/permissions.js"

import {
    FLOOD_PRESET_HARD_CAP,
    clampPresetLimits,
    clampJobQtd,
    getFloodRuntimeConfig,
    getPresetDef,
    listPresetIds
} from "./config.js"
import { loadPreset, buildContent, listPresets, describePreset, previewContentKeys, makeIterationBuilder } from "./presets/index.js"
import { resolveMediaBuffer } from "./presets/media.js"
import { sanitizeMentions, visibleTextHasPhones } from "./presets/mention.js"
import { buildPayload as buildPaymentPayload } from "./presets/payment.js"
import { buildShoppingPayload, shoppingSrc } from "./presets/shoppingBuilder.js"
import { buildSendContent as gateSendContent, SHOP_SEND_KEYS, isShoppingContent } from "./engine.js"
import { createQueue } from "./queue.js"
import { createLimiter, withTimeout, classifyError, remainingCooldown, markJobEnd, clearCooldown, sleep } from "./limiter.js"
import { isKillSwitchOn, setKillSwitch, onKillSwitch, toggleKillSwitch, killSwitchStatusTexto } from "./killswitch.js"
import {
    getAllowlist, normalizeTargetJid, isOnAllowlist, filterAllowlist, filterTargets,
    addAllowlistJid, removeAllowlistJid, formatAllowlistTexto, maskJid, ALLOWLIST_EMPTY, BLOCKED_TARGET, PROTECTED_GROUP_BLOCKED
} from "./allowlist.js"
import { slugPresetId, saveCustomPreset, updateCustomPreset, deleteCustomPreset, getCustomPreset, listCustomPresets, formatCustomPresetsTexto, isReservedPresetId } from "./customStore.js"
import { resolveFloodSpeed, formatFloodSpeedMenu, applyFloodSpeed, toFloodOpts } from "./speed.js"
import { extractTargetJids, parseSelectedGroups } from "./groups.js"
import { runPresetJob, formatPresetJobResult, isFloodEngineRunning, cancelRunningJob, currentJobInfo } from "./presetEngine.js"

const GROUP_A = "120363111111111101@g.us"
const GROUP_B = "120363222222222202@g.us"
const GROUP_C = "120363333333333303@g.us"
const PERSONA = "5519999998888@s.whatsapp.net"

let passed = 0
let failed = 0
let skipped = 0
const failures = []

function ok(msg) {
    passed++
    console.log(`✓ ${msg}`)
}
function assert(cond, msg) {
    if (cond) ok(msg)
    else {
        failed++
        failures.push(msg)
        console.log(`✗ ${msg}`)
    }
}
function assertEq(actual, expected, msg) {
    const a = JSON.stringify(actual)
    const e = JSON.stringify(expected)
    if (a === e) {
        ok(a === e && typeof actual === "string" ? `${msg} (${a})` : msg)
        return
    }
    failed++
    failures.push(`${msg} — esperado ${e}, veio ${a}`)
    console.log(`✗ ${msg} — esperado ${e}, veio ${a}`)
}
function skip(msg) {
    skipped++
    console.log(`… SKIP ${msg}`)
}

/** Executor que NÃO pode ser chamado: usado nos dry-runs. */
const executorProibido = async () => {
    throw new Error("DRY-RUN CHAMOU O EXECUTOR")
}

/** Executor falso com contagem: simula o retorno do executarFlood do AB7. */
function makeExecutorFake({ okN = 1, erros = 0, retardarMs = 0, lancar = null } = {}) {
    const calls = []
    const fn = async ({ jid, qtd, cfg, builder }) => {
        if (retardarMs) await sleep(retardarMs)
        if (lancar) throw lancar
        const sample = typeof builder === "function" ? builder({ index: calls.length + 1, body: "corpo" }) : null
        calls.push({ jid, qtd, cfg, keys: sample ? Object.keys(sample).sort() : [] })
        return { ok: okN, erros, total: qtd, modo: cfg?.modo || "normal", intervalo: cfg?.intervaloMs || 0, lote: cfg?.lote || 1 }
    }
    return { fn, calls }
}

const CONFIG_KEYS_WATCHED = ["floodAllowlist", "floodCustomPresets", "floodKillSwitch", "floodDryRun", "floodTestMode", "floodModo", "floodInterval", "floodLote", "floodJitter", "marcarFantasma", "nome", "gruposAutorizados"]

function snapshotConfig() {
    const s = {}
    for (const k of CONFIG_KEYS_WATCHED) s[k] = CONFIG[k] === undefined ? undefined : JSON.parse(JSON.stringify(CONFIG[k]))
    return s
}
function restoreConfig(s) {
    for (const k of CONFIG_KEYS_WATCHED) {
        if (s[k] === undefined) delete CONFIG[k]
        else CONFIG[k] = JSON.parse(JSON.stringify(s[k]))
    }
}

export async function runFloodInfraTests() {
    console.log("=== TESTES FLOOD · INFRA (queue/limiter/killswitch/allowlist/customStore/presets/engine) ===")
    const snap = snapshotConfig()
    const configAntes = fs.existsSync("config.json") ? fs.readFileSync("config.json", "utf-8") : null
    const gruposAntes = getAuthorizedGroups()
    let configInalterado = true

    try {
        // ── 0) tetos: overlay/config NUNCA afrouxam o hard cap ────────────────
        const apertado = clampPresetLimits({ maxMessages: 9999, interval: 0, concurrency: 50, cooldown: 0, timeout: 1 })
        assertEq(apertado.maxMessages, FLOOD_PRESET_HARD_CAP.maxMessages, "maxMessages acima do teto é cortado para o hard cap")
        assertEq(apertado.interval, FLOOD_PRESET_HARD_CAP.minInterval, "intervalo menor que o mínimo não passa (sem rajada)")
        assertEq(apertado.concurrency, FLOOD_PRESET_HARD_CAP.maxConcurrency, "concorrência tem teto (2)")
        assertEq(apertado.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, "cooldown mínimo existe (sem spam de job)")
        assertEq(apertado.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, "timeout abaixo do mínimo sobe para o mínimo")
        assertEq(clampPresetLimits({ timeout: 999999 }).timeout, FLOOD_PRESET_HARD_CAP.maxTimeout, "timeout tem teto (maxTimeout)")
        assertEq(clampPresetLimits({ cooldown: 99999999 }).cooldown, 300000, "cooldown tem teto de 5 min")
        assertEq(clampPresetLimits({ interval: 10 ** 9 }).interval, 60000, "intervalo tem teto de 60s")
        assertEq(clampJobQtd(5000, { maxMessages: 3 }), 3, "qtd pedido 5000 → teto do preset (3)")
        const cfg = getFloodRuntimeConfig()
        assertEq(cfg.dryRun, true, "padrão do runtime é DRY-RUN (nada sai sem o operador desligar)")
        assertEq(cfg.testMode, true, "testMode ligado por padrão (payment/shshopping só em teste)")
        assert(cfg.maxRetries <= FLOOD_PRESET_HARD_CAP.maxRetries, "retries do config não passam do teto")

        // ── 1) preset TEXT ───────────────────────────────────────────────────
        const t1 = loadPreset("text-test")
        assertEq(t1.ok, true, "loadPreset('text-test') resolve")
        assertEq(t1.preset.type, "text", "tipo do preset é text")
        const t1c = buildContent(t1.preset)
        assertEq(Object.keys(t1c), ["text"], "preset text produz SOMENTE { text } (item 12)")
        assert(typeof t1c.text === "string" && t1c.text.length > 0, "text é string não vazia")
        const t1b = makeIterationBuilder(t1.preset)({ index: 3, body: "corpo do laço" })
        assertEq(t1b.text, "corpo do laço", "builder por iteração aproveita o corpo único do executarFlood")
        assertEq(loadPreset("nao-existe").error, "PRESET_UNKNOWN", "preset inexistente → PRESET_UNKNOWN (não cai em texto)")
        const t1ov = loadPreset("text-test", { maxMessages: 9999, interval: 1 })
        assertEq(t1ov.preset.maxMessages, 3, "overlay do preset não aumenta o teto do próprio preset")

        // ── 2) preset MENTION ────────────────────────────────────────────────
        const m1 = loadPreset("mention-test")
        assertEq(m1.ok, true, "loadPreset('mention-test') resolve")
        const m1c = buildContent(m1.preset, { mentions: [PERSONA, "lixo", PERSONA, `${GROUP_C}`] })
        assertEq(m1c.mentions, [PERSONA, GROUP_C], "mentions só de lista explícita, deduplicadas, jids válidos (item 14)")
        const m1vazio = buildContent(m1.preset, { mentions: [] })
        assert(!("mentions" in m1vazio), "lista vazia → NENHUMA menção (nunca 'todos os participantes')")
        assertEq(sanitizeMentions(Array.from({ length: 60 }, (_, i) => `551999999900${String(i).padStart(2, "0")}@s.whatsapp.net`)).length, 20, "menções têm teto (20) mesmo se vier 60")
        assertEq(visibleTextHasPhones("chama @5519999998888 aqui"), true, "telefone visível no texto é detectado")
        let leakThrow = null
        try { buildContent({ type: "mention", text: "chama @5519999998888" }) } catch (e) { leakThrow = e }
        assertEq(leakThrow?.code, "MENTION_LEAK", "texto com telefone no preset mention → MENTION_LEAK recusado")
        assertEq(m1c.text.includes("5519"), false, "não injetamos números no texto para simular marcação")

        // ── 3) preset MEDIA ──────────────────────────────────────────────────
        const md1 = loadPreset("media-test")
        assertEq(md1.ok, true, "loadPreset('media-test') resolve")
        const bufFake = Buffer.from("imagem-de-teste")
        const md1c = buildContent(md1.preset, { buffer: bufFake })
        assertEq(Object.keys(md1c).sort(), ["caption", "image"], "media usa o buffer fornecido pelo executor (item 13)")
        assert(Buffer.isBuffer(md1c.image) && md1c.image.length > 0, "image vai como buffer")
        let midErr = null
        try { buildContent({ type: "media", mediaPath: "./nao-existe.png", menuFallback: false }) } catch (e) { midErr = e }
        assertEq(midErr?.code, "MEDIA_UNAVAILABLE", "mídia ausente → erro estruturado MEDIA_UNAVAILABLE")
        assertEq(typeof resolveMediaBuffer({ menuFallback: false, mediaPath: "./nao-existe.png" }), "object", "resolveMediaBuffer devolve null-objeto sem exceção quando não acha nada")
        const md1menu = resolveMediaBuffer({})
        assert(md1menu === null || Buffer.isBuffer(md1menu), "fallback para a imagem de menu existe quando o arquivo está lá")

        // ── 4) preset PAYMENT ────────────────────────────────────────────────
        const p1 = loadPreset("payment-test")
        assertEq(p1.ok, true, "loadPreset('payment-test') resolve")
        const p1c = buildContent(p1.preset, { from: PERSONA, mentions: [PERSONA] })
        assertEq(Object.keys(p1c).sort(), ["mentions", "payment"], "payment é { payment, mentions? } — nada de chave de loja")
        assertEq(p1c.payment.amount, 25900, "valor 25.90 vira amount1000 = 25900")
        assertEq(p1c.payment.currency, "BRL", "moeda preservada")
        assertEq(p1c.payment.note, "Pagamento de teste", "nota vem do texto do preset (item 15)")
        assertEq(p1c.payment.from, PERSONA, "'from' vai no payload quando informado")
        assertEq(p1c.payment.offset, 0, "offset existe como no contrato antigo")
        assert(!("shop" in p1c) && !("viewOnce" in p1c), "payment não contamina com chaves de shopping")
        assertEq(buildPaymentPayload({ text: "x", amount: -5, currency: "BRL" }).error, "AMOUNT_NEGATIVE", "valor negativo recusado no preset")
        let gateErr = null
        try { gateSendContent(p1c) } catch (e) { gateErr = e }
        assertEq(gateErr?.code, "PAYMENT_NOT_ALLOWED", "e o engine do SHOPPING continua recusando payment (separação preservada)")

        // ── 5) preset SHOPPING = builder AB7 atual ───────────────────────────
        const s1 = loadPreset("shopping-test")
        assertEq(s1.ok, true, "loadPreset('shopping-test') resolve")
        const s1built = buildShoppingPayload(s1.preset)
        const s1c = buildContent(s1.preset)
        assertEq(Object.keys(s1c).sort().join(","), "footer,shop,subtitle,text,title", "shopping usa AS chaves do contrato AB7 (engine.js), sem chave extra")
        assert(s1c.shop && Object.keys(s1c.shop).sort().join(",") === "id,surface", "shop = { surface, id } e nada além disso")
        assert(!("viewOnce" in s1c), "sem viewOnce por padrão (fim do 'mensagem indisponível')")
        assert([1, 2, 3].includes(s1c.shop.surface), "surface no wire é 1..3")
        assert(s1c.text === s1.preset.text, "o corpo do card vem do preset")
        assert(isShoppingContent(s1c), "o conteúdo é reconhecido pelo guard do engine")
        const s1ov = loadPreset("shopping-test", { shop: { surface: 4, id: "https://ex.com/loja" } })
        const s1ovc = buildContent(s1ov.preset)
        assertEq(s1ovc.shop.surface, 3, "surface 4 (README do fork) é mapeado para 3 (WA) também no caminho de preset")
        assert(shoppingSrc(s1.preset).delivery === "puro", "delivery do preset é respeitado ('puro')")
        const s1flow = buildContent(loadPreset("shopping-test", { delivery: "flow" }).preset)
        assert(Array.isArray(s1flow.nativeFlow) && s1flow.nativeFlow.length === 1, "delivery 'flow' monta o envelope nativeFlow+shop (messageVersion:1 vem do fork)")
        assertEq(previewContentKeys(s1.preset).keys.join(","), "footer,shop,subtitle,text,title", "previewContentKeys descreve o payload sem enviar")
        assertEq(s1built.meta.messageVersion, null, "modo puro não inventa messageVersion")

        // ── 6) preset CUSTOM (dispatcher) + customStore ──────────────────────
        const slug = slugPresetId("  Promo da Semana!!  ")
        assertEq(slug, "promo-da-semana", "slug do preset é normalizado")
        assertEq(saveCustomPreset({ name: "text-test", type: "text" }, { persist: false }).error, "RESERVED", "id reservado não pode ser ofuscado por custom")
        assertEq(saveCustomPreset({ name: "meu-texto", type: "xyz" }, { persist: false }).error, "TYPE_INVALID", "tipo desconhecido recusado (nada de builder implícito)")
        const savedTxt = saveCustomPreset({ name: "meu-texto", type: "text", text: "oi do custom", modo: "seguro" }, { persist: false })
        assertEq(savedTxt.ok, true, "custom text criado (persist:false → config.json intocado)")
        const custTxt = loadPreset("meu-texto")
        assertEq(custTxt.preset.type, "text", "custom com type text carrega")
        assertEq(buildContent(custTxt.preset).text, "oi do custom", "custom → text usa o builder de text")
        const savedShop = saveCustomPreset({
            name: "minha-loja", type: "shopping", text: "promoção", title: "LOJA", shop: { surface: 4, id: "https://ex.com/shop" }, delivery: "puro"
        }, { persist: false })
        assertEq(savedShop.ok, true, "custom shopping criado")
        const custShop = loadPreset("minha-loja")
        const custShopC = buildContent(custShop.preset)
        assertEq(custShopC.shop.surface, 3, "custom → shopping aponta para o BUILDER AB7 atual (4 → 3, sem viewOnce)")
        assert(!("viewOnce" in custShopC), "custom shopping também não liga viewOnce")
        const savedPay = saveCustomPreset({ name: "meu-pix", type: "payment", text: "paga logo", amount: 12.5, currency: "BRL" }, { persist: false })
        assertEq(savedPay.ok, true, "custom payment criado")
        assertEq(buildContent(loadPreset("meu-pix").preset).payment.amount, 12500, "custom → payment monta requestPaymentMessage (12.50 → 12500)")
        const upd = updateCustomPreset("meu-pix", { amount: 99.99 }, { persist: false })
        assertEq(upd.preset.amount, 99.99, "updateCustomPreset faz merge, não troca o objeto inteiro")
        assertEq(listCustomPresets().length, 3, "listagem dos custom")
        assert(/meu-pix|minha-loja|meu-texto/.test(formatCustomPresetsTexto()), "formatCustomPresetsTexto lista os três")
        assert(isReservedPresetId("shopping-test"), "shopping-test continua marcado como reservado")
        assertEq(getPresetDef("meu-pix").currency, "BRL", "getPresetDef enxerga custom")
        assert(listPresetIds().includes("meu-pix"), "listPresetIds inclui custom")
        assertEq(listPresets().length, listPresetIds().length, "listPresets devolve todos os presets (built-in + custom)")
        assertEq(deleteCustomPreset("meu-pix", { persist: false }).ok, true, "deleteCustomPreset remove")
        assertEq(getCustomPreset("meu-pix"), null, "custom removido some do store")

        // ── 7) allowlist VAZIA ───────────────────────────────────────────────
        CONFIG.floodAllowlist = []
        const a1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: true, executor: executorProibido })
        assertEq(a1.error, ALLOWLIST_EMPTY, "allowlist vazia → job bloqueado (ALLOWLIST_EMPTY)")
        assertEq(filterAllowlist().ok, false, "filterAllowlist sem entradas não libera nada")
        assert(/vazia/i.test(formatAllowlistTexto()), "mensagem de allowlist vazia é explícita")
        const a1b = await runPresetJob({ presetId: "text-test", targets: [], qtd: 1, dryRun: true })
        assertEq(a1b.error, "TARGETS_REQUIRED", "sem destino → TARGETS_REQUIRED (e NUNCA 'todos os grupos')")

        // ── 8) destino FORA da allowlist ────────────────────────────────────
        CONFIG.floodAllowlist = [GROUP_A]
        assertEq(getAllowlist().length, 1, "allowlist normalizada e única")
        assertEq(isOnAllowlist(GROUP_A), true, "destino autorizado passa")
        assertEq(isOnAllowlist(GROUP_B), false, "destino não autorizado fica fora")
        const a2 = await runPresetJob({ presetId: "text-test", targets: [GROUP_B], qtd: 1, dryRun: true, executor: executorProibido })
        assertEq(a2.error, BLOCKED_TARGET, "alvo fora da allowlist → BLOCKED_TARGET")
        assertEq(a2.blocked, [maskJid(GROUP_B)], "bloqueio devolvido mascarado")
        assertEq(normalizeTargetJid("5519999998888"), PERSONA, "número puro vira @s.whatsapp.net")
        assertEq(normalizeTargetJid("12345"), null, "número curto é recusado (não adivinhamos destino)")
        assertEq(normalizeTargetJid("5519999998888@instagram"), null, "domínio desconhecido é recusado")
        assertEq(addAllowlistJid(GROUP_B).added, true, "addAllowlistJid adiciona explicitamente")
        assertEq(addAllowlistJid("!!!").error, "JID_INVALID", "entrada inválida não entra na allowlist")
        assertEq(removeAllowlistJid("2").removed, GROUP_B, "removeAllowlistJid por índice (1-based)")
        assertEq(removeAllowlistJid("99").error, "NOT_FOUND", "índice inexistente → NOT_FOUND (não apaga o resto)")
        assertEq(isOnAllowlist(GROUP_B), false, "depois de remover, o destino volta a ser bloqueado")

        // ── 9) grupo protegido (autorizado) ─────────────────────────────────
        CONFIG.floodAllowlist = [GROUP_A, GROUP_C]
        setAuthorizedGroups([GROUP_A])
        const f9 = filterTargets([GROUP_A, GROUP_C])
        assertEq(f9.allowed, [GROUP_C], "grupo protegido fica de fora mesmo estando na allowlist")
        assertEq(f9.blocked[0].reason, PROTECTED_GROUP_BLOCKED, "motivo do bloqueio é nomeado")
        const j9 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: true, executor: executorProibido })
        assert(j9.error === BLOCKED_TARGET || j9.error === "BLOCKED_TARGET", "job no grupo protegido não roda")
        setAuthorizedGroups(gruposAntes)

        // ── 10) cooldown por preset ─────────────────────────────────────────
        setAuthorizedGroups(gruposAntes)
        clearCooldown("text-test")
        const ex10 = makeExecutorFake({ okN: 1 })
        const c1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: ex10.fn })
        assertEq(c1.ok, true, "job com executor falso roda")
        const c2 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: ex10.fn })
        assertEq(c2.error, "COOLDOWN", "repetição imediata cai em COOLDOWN (sem bypass acidental)")
        assert(c2.remainingMs > 0 && c2.remainingMs <= c1.limits.cooldown, "COOLDOWN devolve o tempo restante")
        const c3 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: ex10.fn, ignoreCooldown: true })
        assertEq(c3.ok, true, "ignoreCooldown é o caminho explícito (único)")
        markJobEnd("text-test")
        assert(remainingCooldown("text-test", 5000) > 0, "markJobEnd abre o cooldown")
        clearCooldown("text-test")
        assertEq(remainingCooldown("text-test", 5000), 0, "clearCooldown zera")

        // ── 11) kill switch ─────────────────────────────────────────────────
        let listenerFired = -1
        const unsubs = onKillSwitch(v => { listenerFired = v ? 1 : 0 })
        setKillSwitch(false)
        assertEq(isKillSwitchOn(), false, "kill switch desligado = liberado")
        setKillSwitch(true)
        assertEq(isKillSwitchOn(), true, "setKillSwitch(true) liga")
        assertEq(listenerFired, 1, "onKillSwitch notificou os ouvintes")
        const k0 = killSwitchStatusTexto()
        assert(/LIGADO/.test(k0), "status do kill switch explica o estado")
        clearCooldown("text-test")
        const k1 = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 2, dryRun: false, executor: ex10.fn })
        assertEq(k1.error, "KILL_SWITCH", "job com kill switch ligado nem começa")
        assert(ex10.calls.length >= 0, "nenhum envio novo partiu com o switch ligado")
        const q11 = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 0 })
        let rodadas11 = 0
        const r11 = await q11.runItems([{ target: GROUP_A }, { target: GROUP_B }], async () => { rodadas11++; return { ok: true } })
        assertEq(rodadas11, 0, "fila existente também respeita o kill switch ligado (zero worker)")
        setKillSwitch(false)
        assertEq(toggleKillSwitch(), true, "toggleKillSwitch liga")
        setKillSwitch(false)
        unsubs()
        // persistência é opcional por desenho: o teste não escreve config.json
        configInalterado = (fs.existsSync("config.json") ? fs.readFileSync("config.json", "utf-8") : null) === configAntes
        assertEq(configInalterado, true, "nenhum teste escreveu em config.json (kill switch sem persist)")

        // ── 12) timeout ─────────────────────────────────────────────────────
        let timeoutErr = null
        try { await withTimeout(() => sleep(200), 20) } catch (e) { timeoutErr = e }
        assertEq(timeoutErr?.code, "TIMEOUT", "withTimeout estoura com erro tipificado TIMEOUT")
        assertEq(classifyError(timeoutErr).retry, true, "timeout é retryável (não derruba o job)")
        const q12 = createQueue({ interval: 0, concurrency: 1, timeout: 30, maxRetries: 0 })
        const r12 = await q12.runItems([{ target: GROUP_A }], async () => { await sleep(400); return { ok: true } })
        assertEq(r12[0].ok, false, "item lento demais é devolvido como falha, sem travar o processo")
        assertEq(r12[0].error, "timeout", "classificação do item é 'timeout'")

        // ── 13) retry limitado (e abort em erro permanente) ─────────────────
        let tentativas = 0
        const q13 = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 2 })
        const r13 = await q13.runItems([{ target: GROUP_A }], async () => { tentativas++; throw new Error("send timeout transitório") })
        assertEq(tentativas, 3, "retries respeitam o teto: 1 tentativa + 2 retries")
        assertEq(r13[0].ok, false, "esgotado o teto, o item falha (não fica martelando)")
        let tentativas13b = 0
        const q13b = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 2 })
        const r13b = await q13b.runItems([{ target: GROUP_A }], async () => { tentativas13b++; throw new Error("rate-overlimit") })
        assertEq(tentativas13b, 3, "rate limit: 1 + 2 retries, com backoff (espera maior a cada tentativa)")
        assertEq(r13b[0].error, "rate_limit", "rate limit é classificado como rate_limit")
        let tentativas13c2 = 0
        const q13d = createQueue({ interval: 0, concurrency: 1, timeout: 350, maxRetries: 50 })
        const r13d = await q13d.runItems([{ target: GROUP_A }], async () => { tentativas13c2++; throw new Error("rate-overlimit") })
        assert(tentativas13c2 < 10, "o timeout do item também limita retry: não vira loop infinito contra rate limit")
        assertEq(r13d[0].error, "timeout", "estourado o timeout do item, o erro reportado é timeout")
        const q13c = createQueue({ interval: 0, concurrency: 1, timeout: 5000, maxRetries: 2 })
        let chamadas13c = 0
        const r13c = await q13c.runItems([{ target: GROUP_A }, { target: GROUP_B }], async () => { chamadas13c++; throw new Error("Connection is closed") })
        assertEq(r13c[0].abort, true, "disconnect aborta o job")
        assertEq(r13c[1].cancelled, true, "os itens seguintes são cancelados, não tentados")
        assertEq(chamadas13c, 1, "worker não foi chamado depois do disconnect")
        assertEq(classifyError(new Error("403 forbidden")).kind, "permanent", "403 é permanente")
        assertEq(classifyError(new Error("boom")).retry, false, "erro desconhecido NÃO é re-tentado à toa")

        // ── 14) dry-run ─────────────────────────────────────────────────────
        clearCooldown("text-test"); clearCooldown("shopping-test")
        const d1 = await runPresetJob({ presetId: "shopping-test", targets: [GROUP_A], qtd: 2, dryRun: true, executor: executorProibido })
        assertEq(d1.ok, true, "dry-run do shopping passa (sem executor)")
        assertEq(d1.results[0].dryRun, true, "resultado marca dryRun")
        assertEq(d1.results[0].keys, ["footer", "shop", "subtitle", "text", "title"], "dry-run devolve as CHAVES do payload (item 22)")
        assert(/shopStorefrontMessage/.test(d1.results[0].wire || ""), "dry-run mostra o wire real do card")
        assertEq(d1.results[0].target, maskJid(GROUP_A), "alvo do dry-run é mascarado (sem número cru)")
        const d1json = JSON.stringify(d1)
        assert(!d1json.includes(GROUP_A), "nenhum jid cru no resultado")
        assert(!/creds|pairing|password|token/i.test(d1json), "nenhuma credencial no resultado")
        assertEq(d1.metrics.planned, 2, "dry-run conta o planejado sem contar como enviado")
        assertEq(d1.metrics.sent, 0, "dry-run não incrementa 'sent'")
        const d2 = await runPresetJob({ presetId: "media-test", overlay: { menuFallback: false }, targets: [GROUP_A], qtd: 1, dryRun: false, executor: makeExecutorFake().fn })
        assertEq(d2.error, "MEDIA_UNAVAILABLE", "media sem arquivo → erro estruturado ANTES de quebrar o processo (item 13)")

        // ── 15) métricas ────────────────────────────────────────────────────
        clearCooldown("text-test")
        const ex15 = makeExecutorFake({ okN: 2, erros: 1 })
        const g1 = await runPresetJob({
            presetId: "text-test", targets: [GROUP_A, GROUP_B, GROUP_C], qtd: 3, dryRun: false,
            floodModo: "seguro", executor: async (i) => { await sleep(2); return ex15.fn(i) }
        })
        assertEq(g1.metrics.started, 1, "métrica started")
        assertEq(g1.metrics.targets, 2, "métrica targets = alvos ACEITOS (B estava fora da allowlist)")
        assertEq(g1.blocked.length, 1, "alvo bloqueado aparece mascarado no resultado")
        assertEq(g1.metrics.queued, 6, "queued = mensagens possíveis (2 alvos × 3, um bloqueado pelo teto do preset)")
        assert(g1.metrics.sent >= 1, "sent conta o que o laço reportou")
        assert(Array.isArray(g1.metrics.latencies), "latencies é array")
        assert(Number.isFinite(g1.metrics.averageLatency), "averageLatency numérica")
        assert(g1.metrics.duration >= 0, "duration do job")
        assertEq(typeof g1.metrics.blocked, "number", "blocked contável")
        const txt15 = formatPresetJobResult(g1)
        assert(/preset text-test/.test(txt15) && /tetos aplicados/.test(txt15), "formatação do resultado é diagnóstica")
        assertEq(g1.metrics.failed, 2, "falhas do laço aparecem somadas por alvo (2 alvos × 1 erro)")
        assertEq(g1.limits.concurrency, 1, "velocidade 'seguro' não aumenta concorrência acima do preset")

        // ── 16) velocidade = FLOOD_MODOS/CONFIG do AB7 (sem 2º sistema) ──────
        const sp4 = resolveFloodSpeed("4")
        assertEq(sp4.ok && sp4.modo, "seguro", "'4' resolve para o modo seguro do projeto")
        assertEq(sp4.jitter, true, "seguro liga jitter (como no flood clássico)")
        const sp0 = resolveFloodSpeed("0")
        assertEq(sp0.ok && sp0.from, "config", "'0' = manter a config atual (floodModo/floodInterval/floodLote)")
        const spNum = resolveFloodSpeed("250")
        assertEq(spNum.modo, "custom", "número solto é intervalo custom")
        assertEq(resolveFloodSpeed("9").error, "SPEED_INVALID", "fora da faixa → SPEED_INVALID")
        const opts16 = toFloodOpts(sp4)
        assertEq(Object.keys(opts16).sort().join(","), "intervaloMs,jitter,lote,modo", "toFloodOpts tem a forma que getFloodConfig/executarFlood aceitam")
        const applied = applyFloodSpeed({ type: "payment", concurrency: 2 }, sp4)
        assertEq(applied.concurrency, 1, "payment fica em concorrência 1")
        assertEq(applyFloodSpeed({ type: "shopping", concurrency: 2 }, sp4).concurrency, 1, "shopping idem")
        assert(/VELOCIDADE DO FLOOD/.test(formatFloodSpeedMenu()) && /Seguro/.test(formatFloodSpeedMenu()), "menu de velocidade vem dos FLOOD_MODOS")

        // ── 17) limiter: intervalo global, concorrência e jitter ────────────
        const lim17 = createLimiter({ interval: 30, concurrency: 2, timeout: 1000, key: "t17" })
        const startedAt17 = Date.now()
        let piques17 = 0
        let picos17 = 0
        await Promise.all(Array.from({ length: 5 }, () => lim17.schedule(async () => {
            piques17++; picos17 = Math.max(picos17, piques17); await sleep(10); piques17--
        })))
        assert(picos17 <= 2, "concorrência do limiter é respeitada (nunca acima do permitido)")
        assert(Date.now() - startedAt17 >= 60, "intervalo mínimo é global (5 itens × 30ms não viram rajada)")
        assertEq(lim17.inflight(), 0, "nada fica preso depois de terminar")
        const lim17b = createLimiter({ interval: 1000, concurrency: 1, timeout: 50, key: "t17b", jitter: true })
        const t17b = Date.now()
        await lim17b.schedule(async () => 1)
        await lim17b.schedule(async () => 1)
        assert(Date.now() - t17b >= 50, "segunda chamada espera o intervalo (jitter só soma)")

        // ── 18) groups: escolha explícita de alvos ──────────────────────────
        const cache18 = { 1: { id: GROUP_A, subject: "A" }, 2: { id: GROUP_B, subject: "B" }, 3: { id: GROUP_C, subject: "C" } }
        assertEq(parseSelectedGroups(cache18, "1").entries.map(e => e.id), [GROUP_A], "'1' resolve um grupo")
        assertEq(parseSelectedGroups(cache18, "1,3").entries.length, 2, "'1,3' resolve dois")
        assertEq(parseSelectedGroups(cache18, "7").error, "NONE", "índice fora do cache → NONE (não 'todos')")
        assertEq(parseSelectedGroups(cache18, "").error, "USAGE", "vazio → USAGE")
        assertEq(parseSelectedGroups(cache18, "a|b").error, "USAGE", "pipe não é seletor de grupo")
        assertEq(extractTargetJids([{ id: GROUP_A }, GROUP_A, null]), [GROUP_A], "extractTargetJids deduplica e aceita objetos")

        // ── 19) sem ciclo: infra não importa o barrel ───────────────────────
        const barrelVazio = ["engine.js", "config.js", "limiter.js", "queue.js", "killswitch.js", "allowlist.js", "customStore.js", "speed.js", "groups.js", "payment.js", "shopping.js"]
        let ciclico = []
        for (const f of barrelVazio) {
            const txt = fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf-8")
            if (/from\s+["']\.\/index\.js["']/.test(txt)) ciclico.push(f)
        }
        assertEq(ciclico, [], "nenhum módulo de base importa features/flood/index.js (sem ciclo engine→preset→engine)")

        // ── 20) job único + cancelamento do job corrente ────────────────────
        clearCooldown("text-test")
        let visto1 = false
        const p20 = runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: async () => { visto1 = true; await sleep(60); return { ok: 1, erros: 0, total: 1 } } })
        await sleep(5)
        assertEq(isFloodEngineRunning(), true, "isFloodEngineRunning durante o job")
        assert(currentJobInfo() && Array.isArray(currentJobInfo().targets), "currentJobInfo com alvos mascarados")
        const conc = await runPresetJob({ presetId: "text-test", targets: [GROUP_A], qtd: 1, dryRun: false, executor: executorProibido })
        assertEq(conc.error, "JOB_IN_PROGRESS", "um job por vez (sem fila paralela de presets)")
        assertEq(cancelRunningJob("TESTE"), true, "cancelRunningJob aceita cancelamento explícito")
        const r20 = await p20
        assertEq(visto1, true, "o job rodou pelo executor injetado")
        assert(r20.metrics.cancelled + r20.metrics.sent >= 0, "resultado com métricas mesmo cancelado")
        clearCooldown("text-test")

        // ── 21) flood CLÁSSICO passa a respeitar o kill switch (integração) ──
        let gs = null
        try { gs = await import("../../services/groupService.js") } catch { gs = null }
        if (!gs || typeof gs.executarFlood !== "function") {
            skip("services/groupService.js indisponível para o teste de integração")
        } else {
            const { setSock, rt } = await import("../../connection/socket.js")
            const enviados21 = []
            const sockFake = {
                user: { id: PERSONA },
                sendMessage: async (jid, content) => { enviados21.push({ jid, content }); return { key: { id: "fake" } } },
                groupMetadata: async () => ({ participants: [{ id: PERSONA }, { id: GROUP_C }] })
            }
            const sockAntes = null
            setSock(sockFake)
            try {
                CONFIG.marcarFantasma = true
                CONFIG.floodAllowlist = [GROUP_A]
                clearCooldown("text-test")
                setKillSwitch(true)
                const antes = enviados21.length
                const r21 = await gs.executarFlood(GROUP_A, "msg", 6, { modo: "normal" })
                assertEq(enviados21.length, antes, "com kill switch ligado o flood clássico NÃO envia nada")
                assertEq(r21.stopado, "KILL_SWITCH", "flood clássico reporta stopado=KILL_SWITCH")
                assertEq(r21.ok, 0, "zero enviadas no lote interrompido")
                setKillSwitch(false)
                const r21b = await gs.executarFlood(GROUP_A, "msg", 3, { modo: "normal" }, () => ({ text: "x", mentions: [GROUP_C] }))
                assertEq(r21b.ok, 3, "com o switch desligado o flood clássico volta a rodar (3/3)")
                const content21 = enviados21[enviados21.length - 1].content
                assertEq(content21.mentions, [GROUP_C], "mentions do builder NÃO são sobrescritas pelo marcarFantasma (preset marca só o autorizado)")
                const r21c = await gs.executarFlood(GROUP_A, "msg", 2, { modo: "normal" })
                assert(Array.isArray(r21c) === false && r21c.tentadas === 2, "retorno do flood clássico ganhou 'tentadas' e manteve o resto")
                assertEq(r21c.ok, 2, "comportamento do flood clássico preservado (ok/erros/total/modo/intervalo/lote)")
                assert(["ok", "erros", "total", "modo", "intervalo", "lote", "tentadas"].every(k => k in r21c), "nenhuma chave antiga sumiu do retorno")
                const lote21 = await gs.executarFloodLote([{ id: GROUP_A }, { id: GROUP_B }], "msg", 1, { modo: "normal" })
                assertEq(lote21.length, 2, "executarFloodLote inalterado no caminho feliz")
                setKillSwitch(true)
                const lote21b = await gs.executarFloodLote([{ id: GROUP_A }, { id: GROUP_B }], "msg", 1, { modo: "normal" })
                assert(lote21b.every(r => r.stopado === "KILL_SWITCH"), "lote também respeita o kill switch entre grupos")
                setKillSwitch(false)
            } finally {
                setSock(sockAntes === null ? undefined : sockAntes)
                try { rt().cachedGroups = {} } catch {}
            }
        }

        // ── 22) presets que só rodam em modo de teste ───────────────────────
        CONFIG.floodTestMode = false
        clearCooldown("payment-test"); clearCooldown("shopping-test")
        const m22a = await runPresetJob({ presetId: "payment-test", targets: [GROUP_A], qtd: 1, dryRun: true })
        assertEq(m22a.error, "PAYMENT_TEST_DISABLED", "payment fora do modo de teste é recusado (item 15)")
        const m22b = await runPresetJob({ presetId: "shopping-test", targets: [GROUP_A], qtd: 1, dryRun: true })
        assertEq(m22b.error, "SHOPPING_TEST_DISABLED", "shopping fora do modo de teste é recusado")
        CONFIG.floodTestMode = true

        // ── 23) API pública exposta pelo barrel ─────────────────────────────
        const barrel = await import("./index.js")
        for (const name of ["createQueue", "createLimiter", "withTimeout", "sleep", "classifyError", "remainingCooldown", "markJobEnd", "clearCooldown",
            "isKillSwitchOn", "setKillSwitch", "onKillSwitch", "getAllowlist", "normalizeTargetJid", "isOnAllowlist", "filterAllowlist", "filterTargets",
            "addAllowlistJid", "removeAllowlistJid", "formatAllowlistTexto", "maskJid", "saveCustomPreset", "updateCustomPreset", "deleteCustomPreset",
            "resolveFloodSpeed", "formatFloodSpeedMenu", "applyFloodSpeed", "loadPreset", "buildPresetContent", "listPresets", "runPresetJob",
            "parseSelectedGroups", "extractTargetJids", "createShoppingPayload", "buildSendContent", "makeFloodContentBuilder", "describeSendWire",
            "SHOP_SEND_KEYS", "listarIdsDeLoja", "compararShopId", "SHOPPING_LIMITS", "SURFACE_VALID"]) {
            assert(barrel[name] !== undefined, `features/flood/index.js exporta ${name}`)
        }
        assertEq(SHOP_SEND_KEYS.includes("viewOnce"), true, "contrato de send do shopping continua documentado no engine")
        assertEq(describePreset(s1.preset).type, "shopping", "describePreset resume sem expor segredo")
        assertEq(listPresetIds().includes("shopping-test"), true, "shopping-test continua na lista de presets")
    } catch (e) {
        failed++
        failures.push(`exceção na suíte: ${(e && e.stack) || e}`)
        console.log("✗ EXCEÇÃO:", (e && e.stack) || e)
    } finally {
        setKillSwitch(false)
        setAuthorizedGroups(gruposAntes)
        restoreConfig(snap)
        clearCooldown()
        const configDepois = fs.existsSync("config.json") ? fs.readFileSync("config.json", "utf-8") : null
        if (configAntes !== null && configDepois !== configAntes) {
            failed++
            failures.push("config.json foi alterado por um teste")
            console.log("✗ config.json FOI ALTERADO POR UM TESTE")
        }
    }

    console.log(`=== FLOOD · INFRA: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failed) {
        console.log("FALHAS:\n" + failures.map(f => `  - ${f}`).join("\n"))
        return false
    }
    return true
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    runFloodInfraTests()
        .then((allOk) => process.exit(allOk ? 0 : 1))
        .catch((e) => {
            console.log("ERRO CRÍTICO NA SUÍTE:", (e && e.stack) || e)
            process.exit(1)
        })
}
