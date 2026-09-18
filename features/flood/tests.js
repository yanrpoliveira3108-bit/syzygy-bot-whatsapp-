// features/flood/tests.js
// [v53 · AB7] Suíte do FLOOD + PAGAMENTO (substitui a suíte de shopping, que saiu
// do projeto junto com o tipo "shopping"). Rode:  node features/flood/tests.js
//
// Garantias:
//   • NENHUM envio real: sock falso (setSock) e, onde importa, um `executor`
//     injetado que falha se for chamado. Nada sai para um JID de verdade.
//   • config.json e dono/historico.json NÃO são escritos: os bytes são
//     comparados antes/depois; mutações são só em memória e restauradas no fim.
//   • O contrato do payment é conferido CONTRA A FONTE do fork instalado
//     (@lucasmod/boruto-vk7-baileys) — se o fork mudar, o teste avisa; se o fork
//     não estiver instalado, o bloco é SKIP (nunca passa "no chute").
//   • payment é TIPO do flood: a suíte exige que texto e pagamento usem o mesmo
//     executarFlood (nenhum segundo send path, nenhuma segunda fila).

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG, FLOOD_TIPOS, FLOOD_MODOS, floodMaxEfetivo, FLOOD_TETO_ABSOLUTO, MAX_FLOOD } from "../../utils/config.js"

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
function throwsCode(fn, code, m) {
    try { fn(); } catch (e) { assertEq(e?.code || e?.message, code, m); return }
    failed++; failures.push(`${m} — não lançou`); console.log(`✗ ${m} — não lançou`)
}

const DONO_FAKE = "5511999990000@s.whatsapp.net"
const GRUPO_A = "5519999999999-1000@g.us"   // atacável
const GRUPO_B = "5519999999999-2000@g.us"   // atacável
const GRUPO_PROTEGIDO = "5519999999999-3000@g.us"

/** Executor que NÃO pode ser chamado: usado onde só se quer a validação. */
function executorProibido() { throw new Error("EXECUTOR_CHAMADO_EM_TESTE") }

async function main() {
    console.log("=== TESTES FLOOD · CORE + PAGAMENTO (v53) ===")
    const cfgBytes = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
    const histBytes = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null

    const {
        FLOOD_PRESET_TYPES, FLOOD_PRESET_HARD_CAP, FLOOD_MAX_HARD_CEILING, FLOOD_GENERAL_PRESETS,
        getFloodRuntimeConfig, getPresetDef, listPresetIds, clampPresetLimits, clampJobQtd,
        listPaymentPresets, listPaymentPresetsTexto, floodTipoLabel, DEFAULT_PAYMENT_PRESET_ID
    } = await import("./config.js")
    const {
        loadPreset, buildContent, makeIterationBuilder, listPresets, describePreset, listPresetsTexto
    } = await import("./presets/index.js")
    const pay = await import("./payment.js")
    const targets = await import("./targets.js")
    const { runPresetJob, formatPresetJobResult, currentJobInfo } = await import("./presetEngine.js")
    const { setKillSwitch, isKillSwitchOn, KILL_SWITCH_REASON } = await import("./killswitch.js")
    const { clearCooldown, remainingCooldown } = await import("./limiter.js")
    const speed = await import("./speed.js")
    const gs = await import("../../services/groupService.js")
    const { setSock, getSock, rt } = await import("../../connection/socket.js")

    const enviados = []
    setSock({
        user: { id: DONO_FAKE },
        sendMessage: async (jid, content) => { enviados.push({ jid, content }); return { key: { id: "fake" } } },
        groupMetadata: async () => ({ id: GRUPO_A, participants: [{ id: DONO_FAKE, admin: "superadmin" }] })
    })

    const antes = {
        floodTipo: CONFIG.floodTipo,
        floodModo: CONFIG.floodModo,
        floodInterval: CONFIG.floodInterval,
        floodLote: CONFIG.floodLote,
        floodJitter: CONFIG.floodJitter,
        floodMaxMensagens: CONFIG.floodMaxMensagens,
        floodErrorStop: CONFIG.floodErrorStop,
        floodPaceAdaptativo: CONFIG.floodPaceAdaptativo,
        floodMaxRetries: CONFIG.floodMaxRetries,
        floodKillSwitch: CONFIG.floodKillSwitch,
        marcarFantasma: CONFIG.marcarFantasma,
        linkDivulgacao: CONFIG.linkDivulgacao,
        grupos: Array.isArray(CONFIG.gruposAutorizados) ? [...CONFIG.gruposAutorizados] : CONFIG.gruposAutorizados
    }

    try {
        // ── 1) tabela de tipos: nada de shopping sobrando ─────────────────────
        assertEq(FLOOD_PRESET_TYPES, ["text", "mention", "media", "payment", "custom"], "FLOOD_PRESET_TYPES é text/mention/media/payment/custom")
        assert(!FLOOD_PRESET_TYPES.includes("shopping"), "tipo 'shopping' deixou de existir")
        assertEq(listPresetIds().sort(), ["media-test", "mention-test", "payment-test", "text-test"], "presets built-in são os quatro (sem loja)")
        assert(listPresets().length === 4, "listPresets() conta os mesmos quatro")
        assert(!/shop|loja|dry|allow/i.test(listPresetsTexto()), "listPresetsTexto() não cita loja/dry-run/allowlist")
        assertEq(floodTipoLabel("texto"), "📝 texto puro", "rótulo do tipo texto")
        assert(/pagamento/.test(floodTipoLabel("payment")), "rótulo do tipo pagamento menciona pagamento")

        // ── 2) tetos: preset/config/overlay nunca afrouxam o hard cap ─────────
        const cap = FLOOD_PRESET_HARD_CAP
        assertEq(cap.maxMessages, 100, "teto de mensagens por preset-job = 100")
        assertEq(cap.minInterval, FLOOD_MODOS.rapido.intervalo, "intervalo mínimo do preset = o do modo mais rápido do projeto")
        assertEq(cap.maxConcurrency, 4, "concorrência máxima = 4 alvos")
        assertEq(cap.maxRetries, 2, "retries de send = 2 no máximo")
        assertEq(FLOOD_MAX_HARD_CEILING, FLOOD_TETO_ABSOLUTO, "teto duro do flood bate com utils/config.js")
        const over = clampPresetLimits({ maxMessages: 999999, interval: 1, concurrency: 99, cooldown: 0, timeout: 999999 })
        assertEq(over.maxMessages, 100, "maxMessages acima do teto é cortado")
        assertEq(over.interval, cap.minInterval, "intervalo abaixo do piso é erguido ao piso")
        assertEq(over.concurrency, 4, "concorrência acima do teto é cortada")
        assertEq(over.cooldown, 1000, "cooldown nunca zero (piso 1s)")
        assertEq(over.timeout, 30000, "timeout máximo 30s")
        assertEq(clampPresetLimits({}).maxMessages, 3, "preset sem limite → default conservador 3")
        // teto do flood normal vem do config, com clamp no teto duro
        CONFIG.floodMaxMensagens = 999999
        assertEq(floodMaxEfetivo(), FLOOD_TETO_ABSOLUTO, "config acima do teto duro → clamp no teto duro")
        CONFIG.floodMaxMensagens = 0
        assertEq(floodMaxEfetivo(), MAX_FLOOD, "config zerado/inválido → default MAX_FLOOD")
        CONFIG.floodMaxMensagens = 3000
        assertEq(floodMaxEfetivo(), 3000, "config dentro do teto → vale o config")
        assertEq(clampJobQtd(999999, null), 3000, "clampJobQtd sem preset → teto do config")
        assertEq(clampJobQtd(999999, { maxMessages: 7 }), 7, "clampJobQtd com preset → teto do preset")
        const rc = getFloodRuntimeConfig()
        assertEq(Object.keys(rc).sort().join(","), "errorStop,killSwitch,maxMensagens,maxRetries,paceAdaptativo,timeoutMs,tipo", "runtime expõe só o que existe (sem dryRun/testMode/allowlist)")
        assert(!("dryRun" in rc) && !("testMode" in rc) && !("allowlist" in rc), "dryRun/testMode/allowlist sumiram do runtime")

        // ── 3) payment: parse e payload ──────────────────────────────────────
        assertEq(pay.parseAmount("25,90").value, 25.9, "parseAmount aceita vírgula BR")
        assertEq(pay.parseAmount("R$ 25.90").ok, false, "parseAmount recusa prefixo 'R$' (erro digitado, não adivinhação)")
        assertEq(pay.parseAmount("25.90").amount1000, 25900, "amount1000 = valor × 1000 (campo do proto)")
        assertEq(pay.parseAmount("-5").error, "AMOUNT_NEGATIVE", "valor negativo recusado")
        assertEq(pay.parseAmount("").error, "AMOUNT_MISSING", "valor vazio recusado")
        assertEq(pay.parseAmount("0").error, "AMOUNT_INVALID", "zero não é cobrança")
        assertEq(pay.parseCurrency("brl").value, "BRL", "moeda é normalizada para maiúsculo")
        assertEq(pay.parseCurrency("XYZ").error, "CURRENCY_UNSUPPORTED", "moeda fora da ISO lista → unsupported")
        assertEq(pay.parseCurrency("B").error, "CURRENCY_INVALID", "moeda precisa de 3 letras")
        const args = pay.parsePaymentArgs("Pedido 12 | 19,90 | BRL")
        assertEq(args.ok && [args.text, args.amount, args.currency].join("|"), "Pedido 12|19.9|BRL", "parsePaymentArgs faz o parse do atalho nota|valor|moeda")
        assertEq(pay.parsePaymentArgs("so texto").error, "USAGE", "atalho incompleto → USAGE com usage")
        assert(/texto\|valor\|moeda/.test(pay.usageTexto()), "usage diz o formato")
        const pl = pay.createPaymentPayload({ text: "Pagamento do pedido", amount: 25.9, currency: "BRL" })
        assertEq(pl.ok, true, "payload de payment construído")
        assertEq(pl.content, { note: "Pagamento do pedido", currency: "BRL", amount: 25900, offset: 0 }, "content = { note, currency, amount(×1000), offset }")
        assertEq(pay.createPaymentPayload({ text: "  ", amount: 1, currency: "BRL" }).error, "TEXT_MISSING", "nota vazia recusada")
        const built = pay.buildPaymentContent(pl, { from: DONO_FAKE })
        assertEq(Object.keys(built.payment).sort().join(","), "amount,currency,expiry,from,note,offset", "buildPaymentContent só monta o que o fork lê")
        assertEq(built.payment.from, DONO_FAKE, "from = JID do bot (requestFrom do proto)")
        assert("payment" in built && !("text" in built) && !("image" in built), "payment não vem com text/imagem grudados")
        throwsCode(() => pay.buildPaymentContent({ ok: false, error: "X" }), "PAYMENT_PAYLOAD_INVALID", "buildPaymentContent recusa payload não validado (não monta meio pagamento)")

        // ── 4) contrato contra a FONTE do fork instalado ─────────────────────
        const forkMsgs = path.join(RAIZ, "node_modules/@lucasmod/boruto-vk7-baileys/baileys/lib/Utils/messages.js")
        if (!fs.existsSync(forkMsgs)) {
            skip("fork ausente — contrato de payment não pôde ser conferido na fonte")
        } else {
            const src = fs.readFileSync(forkMsgs, "utf8")
            const ramo = src.slice(src.indexOf("else if ('payment' in message)"))
            const trecho = ramo.slice(0, ramo.indexOf("else if ('stickerPack'"))
            assert(trecho.includes("m.requestPaymentMessage = requestPaymentMessage"), "fork monta requestPaymentMessage a partir de { payment }")
            for (const campo of ["currency", "offset", "amount", "expiry", "note", "from"]) {
                assert(trecho.includes(`message.payment?.${campo}`), `fork lê payment.${campo} (nosso payload tem de ter exatamente isto)`)
            }
            assert(!trecho.includes("viewOnce"), "ramo de payment não toca viewOnce (nada de envelope V2 aqui)")
            assertEq(Object.keys(built.payment).sort().join(","), ["note", "currency", "amount", "offset", "from", "expiry"].sort().join(","), "nenhuma chave inventada no payload de payment")
            try {
                const mod = await import("@lucasmod/boruto-vk7-baileys/baileys/lib/index.js")
                if (typeof mod.generateWAMessageContent !== "function") throw new Error("sem generateWAMessageContent")
                const com = await mod.generateWAMessageContent({ ...built, mentions: ["5511999991111@s.whatsapp.net"] })
                const rpm = com?.requestPaymentMessage
                assert(!!rpm, "INTEGRAÇÃO: nosso conteúdo compila em requestPaymentMessage no fork")
                assertEq(rpm?.currencyCodeIso4217, "BRL", "moeda chega no proto")
                assertEq(Number(rpm?.amount1000), 25900, "amount1000 chega no proto")
                assertEq(rpm?.noteMessage?.extendedTextMessage?.text, "Pagamento do pedido", "nota chega no proto")
                assertEq(rpm?.requestFrom, DONO_FAKE, "requestFrom chega no proto")
                assertEq(rpm?.noteMessage?.extendedTextMessage?.contextInfo?.mentionedJid?.length, 1, "mentions entram no contextInfo da nota")
                assert(Number(rpm?.amount?.value) === 25900 && Number(rpm?.amount?.currencyCode === "BRL"), "Money struct (amount.currencyCode/value) preenchido")
            } catch (e) {
                skip(`integração com o fork indisponível aqui: ${e.message}`)
            }
        }

        // ── 5) gatilho "pag:" (atalho do mesmo tipo, não um segundo caminho) ──
        assertEq(pay.detectPaymentTrigger("pag:Pedido|25,90|BRL"), { isPayment: true, rest: "Pedido|25,90|BRL" }, "detectPaymentTrigger reconhece 'pag:'")
        assertEq(pay.detectPaymentTrigger("pagamento:X|1|BRL").isPayment, true, "aceita 'pagamento:'")
        assertEq(pay.detectPaymentTrigger("Oi, tudo bem?").isPayment, false, "texto normal NÃO vira pagamento")
        assertEq(pay.detectPaymentTrigger("").isPayment, false, "vazio não é gatilho")
        assertEq(pay.detectPaymentTrigger(null).isPayment, false, "null não quebra")
        const rp = pay.resolvePaymentContent("Pedido|25,90|BRL")
        assertEq(rp.ok && rp.content, { type: "payment", text: "Pedido", amount: 25.9, currency: "BRL" }, "resolvePaymentContent monta o conteúdo do preset")
        assert(/💳/.test(rp.summary), "summary do atalho é legível")
        assertEq(pay.resolvePaymentContent("Pedido|abc").ok, false, "atalho com valor inválido falha em vez de fingir")

        // ── 6) builders por tipo (o dispatch que o laço usa) ──────────────────
        const t = loadPreset("text-test")
        assertEq(t.ok, true, "loadPreset('text-test')")
        assertEq(buildContent(t.preset).text, "SYZYGY text-test", "builder de texto devolve { text }")
        const tIter = makeIterationBuilder(t.preset)()
        assertEq(typeof tIter.text, "string", "iterador de texto devolve corpo")
        const tIter2 = makeIterationBuilder(t.preset)({ body: "corpo do laço" + String.fromCharCode(0x200B) })
        assert(tIter2.text.includes(String.fromCharCode(0x200B)), "texto reaproveita o corpo (com o enchimento de unicidade) do laço")
        const m = loadPreset("mention-test", { mentions: [DONO_FAKE] })
        assertEq(m.ok && buildContent(m.preset, { mentions: [DONO_FAKE] }).mentions?.length, 1, "mention carrega só a lista explícita")
        const md = loadPreset("media-test", { menuFallback: false })
        throwsCode(() => buildContent(md.preset, {}), "MEDIA_UNAVAILABLE", "media sem mídia → MEDIA_UNAVAILABLE (nada de fingir com texto)")
        const mdOk = loadPreset("media-test")
        assert(Buffer.isBuffer(buildContent(mdOk.preset).image), "media com fallback do menu monta { image } de verdade")
        const p = loadPreset("payment-test")
        assertEq(p.ok, true, `loadPreset('${DEFAULT_PAYMENT_PRESET_ID}')`)
        assertEq(p.preset.type, "payment", "preset de pagamento é do tipo payment")
        assertEq(listPaymentPresets().length, 1, "um preset payment built-in")
        assert(/payment-test/.test(listPaymentPresetsTexto()), "listPaymentPresetsTexto lista o payment-test")
        const pIter = makeIterationBuilder(p.preset, { from: DONO_FAKE })()
        assert("payment" in pIter, "iterador de payment devolve conteúdo com payment")
        assertEq(pIter.payment.note, p.preset.text, "nota do payment vem do preset")
        const pIter2 = pIter && (() => { const b = makeIterationBuilder(p.preset, { from: DONO_FAKE }); return b({ index: 4, body: "x" + String.fromCharCode(0x200B).repeat(3), msg: "x" }) })()
        assertEq(pIter2.payment.note, p.preset.text, "o U+200B do laço NÃO entra na nota da cobrança (nota é dado do pagamento)")
        assert(!JSON.stringify(pIter2).includes(String.fromCharCode(0x200B)), "payload de payment limpo de caracteres invisíveis")
        const semTipo = loadPreset("text-test", { type: "shopping" })
        assertEq(semTipo.ok, false, "overlay tentando tipo 'shopping' é recusado")
        assertEq(semTipo.error, "PRESET_TYPE_UNSUPPORTED", "erro digitado: PRESET_TYPE_UNSUPPORTED")
        const tetoPreset = loadPreset("payment-test", { maxMessages: 999 })
        assert(tetoPreset.ok && tetoPreset.preset.maxMessages <= getPresetDef("payment-test").maxMessages, "overlay não sobe o teto do preset")
        assertEq(describePreset(p.preset).type, "payment", "describePreset mantém o tipo")

        // ── 7) targets: normalizar, mascarar e a porteira de grupo protegido ──
        assertEq(targets.normalizeTargetJid("5519999999999"), "5519999999999@s.whatsapp.net", "número puro ganha @s.whatsapp.net")
        assertEq(targets.normalizeTargetJid(GRUPO_A), GRUPO_A, "jid de grupo passa intacto")
        assertEq(targets.normalizeTargetJid("x@dominio.invalido"), null, "domínio desconhecido é recusado")
        assertEq(targets.normalizeTargetJid("123"), null, "número curto demais é recusado")
        assertEq(targets.normalizeTargetJid(""), null, "vazio é null")
        assertEq(targets.maskJid("5511987654321@s.whatsapp.net"), "5511****21@s.whatsapp.net", "máscara nunca entrega o número inteiro")
        assertEq(targets.maskJid(null), "(none)", "máscara de null é texto, não exceção")
        const vazio = targets.filterTargets([])
        assertEq(vazio.ok, false, "lista vazia NÃO significa 'todo mundo'")
        assertEq(vazio.error, targets.NO_TARGETS, "lista vazia → NO_TARGETS")
        const soInvalido = targets.filterTargets(["!!!", "x@y"])
        assertEq(soInvalido.error, targets.BLOCKED_TARGET, "só inválido → BLOCKED_TARGET")
        const misto = targets.filterTargets([GRUPO_A, "!!!", { id: GRUPO_B }, GRUPO_A])
        assertEq(misto.ok, true, "mistura válida é aceita")
        assertEq(misto.allowed, [GRUPO_A, GRUPO_B], "permitidos na ordem, duplicata removida, inválido fora")
        assertEq(misto.blocked.length, 1, "inválidos aparecem em blocked")
        const protegi = targets.filterTargets([GRUPO_A, GRUPO_PROTEGIDO], { isProtected: j => j === GRUPO_PROTEGIDO })
        assertEq(protegi.allowed, [GRUPO_A], "grupo protegido fica fora dos alvos")
        assertEq(protegi.blocked[0].reason, targets.PROTECTED_GROUP_BLOCKED, "bloqueio de protegido tem razão digitada")
        const soProtegido = targets.filterTargets([GRUPO_PROTEGIDO], { isProtected: () => true })
        assertEq(soProtegido.ok, false, "se só havia protegido, nada roda")
        assertEq(soProtegido.error, targets.BLOCKED_TARGET, "e o erro é BLOCKED_TARGET, não 'zero alvos ok'")
        assert(/nenhum destino/i.test(vazio.message), "a recusa de lista vazia explica o motivo")
        // seleção do operador (mesmo cache do flood normal)
        assertEq(targets.getFloodSelection("dono1"), [], "sem seleção, nada é alvo")
        assertEq(targets.setFloodSelection([GRUPO_A, GRUPO_B, { id: GRUPO_A }, "lixo"], { dono: "dono1" }).length, 2, "setFloodSelection normaliza, deduplica e descarta inválido")
        assertEq(targets.getFloodSelection("dono1"), [GRUPO_A, GRUPO_B], "getFloodSelection devolve a escolha")
        assert(/2 grupo\(s\)/.test(targets.resumoAlvosTexto(targets.getFloodSelection("dono1"))), "resumo dos alvos conta os grupos")
        const resumoMask = targets.resumoAlvosTexto([GRUPO_A])
        assert(resumoMask.includes("****") && !resumoMask.includes(GRUPO_A), "resumo dos alvos mascara o destino (5519****00@g.us)")
        assert(/nenhum/.test(targets.resumoAlvosTexto([])), "sem alvo → 'nenhum' (e o atalho recusa)")
        targets.clearFloodSelection("dono1")
        assertEq(targets.getFloodSelection("dono1"), [], "clearFloodSelection esvazia")
        assertEq(targets.contagemGruposAutorizados() >= 0, true, "contagem de grupos autorizados é numérica")

        // ── 8) runPresetJob: as porteiras antes de qualquer envio ─────────────
        clearCooldown()
        const semAlvo = await runPresetJob({ presetId: "text-test", targets: [], qtd: 1, executor: executorProibido })
        assertEq(semAlvo.ok && semAlvo.error, false, "job sem alvo não roda")
        assertEq(semAlvo.error, "TARGETS_REQUIRED", "alvo vazio → TARGETS_REQUIRED (nunca 'todos')")
        const presetInexistente = await runPresetJob({ presetId: "nao-existe", targets: [GRUPO_A], qtd: 1, executor: executorProibido })
        assertEq(presetInexistente.error, "PRESET_UNKNOWN", "preset desconhecido → PRESET_UNKNOWN")
        CONFIG.floodKillSwitch = true
        const comKill = await runPresetJob({ presetId: "text-test", targets: [GRUPO_A], qtd: 1, executor: executorProibido })
        assertEq(comKill.error, KILL_SWITCH_REASON, "kill switch ligado barra o job antes de qualquer trabalho")
        assert(comKill.cancelled === true, "e marca cancelled (o operador vê que foi barrado, não que falhou)")
        CONFIG.floodKillSwitch = false
        const pagoErrado = await runPresetJob({ presetId: "payment-test", overlay: { amount: "abc" }, targets: [GRUPO_A], qtd: 1, executor: executorProibido })
        assert(/AMOUNT/.test(pagoErrado.error || ""), "payment com valor inválido falha ANTES de enviar (erro digitado, não pagamento fingido)")
        assertEq(pagoErrado.usage ? true : false, true, "e devolve o usage para corrigir")
        const rodou = await runPresetJob({
            presetId: "payment-test", targets: [GRUPO_A, GRUPO_B], qtd: 2,
            ignoreCooldown: true,
            executor: async ({ jid, qtd, builder }) => {
                const c = builder({ index: 0, body: "x", msg: "x" })
                enviados.push({ jid: "PROVA", content: c })
                return { ok: qtd, erros: 0, total: qtd }
            }
        })
        assertEq(rodou.ok, true, "job de payment roda com alvos explícitos")
        assertEq(rodou.metrics.sent, 4, "métricas somam os dois alvos × 2")
        const prova = enviados.find(e => e.jid === "PROVA")
        assert(prova && "payment" in prova.content, "o que chegou ao executor foi { payment } (não texto)")
        assert(/💳|payment/.test(formatPresetJobResult(rodou)), "resultado formatado diz que foi payment")
        const cd = remainingCooldown("payment-test", getPresetDef("payment-test").cooldown)
        assert(cd > 0, "cooldown real aplicado depois do job (não dá pra spammar)")
        const noCool = await runPresetJob({ presetId: "payment-test", targets: [GRUPO_A], qtd: 1, executor: executorProibido })
        assertEq(noCool.error, "COOLDOWN", "job dentro do cooldown é barrado com COOLDOWN")
        assertEq(currentJobInfo(), null, "job terminado limpa o estado de 'em andamento'")
        clearCooldown()

        // ── 9) o LAÇO real (executarFlood) com o builder de payment ───────────
        enviados.length = 0
        const laço = await gs.executarFlood(GRUPO_A, "nota", 5, { intervalo: 0, lote: 2, jitter: false }, () => ({ payment: { note: "nota", currency: "BRL", amount: 1000, offset: 0, from: DONO_FAKE, expiry: 0 } }))
        assertEq(laço.ok, 5, "laço enviou as 5 com builder de payment")
        assertEq(enviados.length, 5, "cinco sock.sendMessage no total (um por mensagem — sem segundo caminho)")
        assert(enviados.every(e => "payment" in e.content), "todas as iterações saíram como payment")
        assert(enviados.every(e => e.jid === GRUPO_A), "tudo no alvo escolhido")
        assert(Number.isFinite(laço.msgPorSeg) && Number.isFinite(laço.ms), "laço devolve throughput (ms e msg/s)")
        enviados.length = 0
        const { addAuthorizedGroup, removeAuthorizedGroup } = await import("../../utils/permissions.js")
        const protegio = addAuthorizedGroup(GRUPO_PROTEGIDO)
        const recusado = await gs.executarFlood(GRUPO_PROTEGIDO, "x", 1, 0).catch(e => ({ throwou: e.message }))
        assert(/protegido/i.test(recusado?.throwou || ""), "grupo protegido do bot nunca é alvo do flood")
        if (protegio?.added) removeAuthorizedGroup(GRUPO_PROTEGIDO)
        CONFIG.marcarFantasma = false
        enviados.length = 0
        const semBuilder = await gs.executarFlood(GRUPO_A, "oi", 3, { intervalo: 0, lote: 2 })
        assertEq(semBuilder.ok, 3, "flood clássico (sem builder) continua igual")
        assert(enviados.every(e => "text" in e.content), "sem builder = { text } puro")
        assert(enviados.some(e => e.content.text.includes(String.fromCharCode(0x200B))), "enchimento de unicidade continua no texto")
        // kill switch no meio do laço: para na fronteira do lote
        CONFIG.marcarFantasma = false
        setKillSwitch(true, { persist: false })
        const parado = await gs.executarFlood(GRUPO_A, "oi", 50, { intervalo: 0, lote: 5 })
        assertEq(parado.ok, 0, "kill switch ligado → o laço não envia nada")
        assertEq(parado.stopado, "KILL_SWITCH", "e o resultado diz por que parou")
        setKillSwitch(false, { persist: false })
        // erro-stop: alvo morto não é martelado
        const sockAntes = getSock()
        setSock({
            user: { id: DONO_FAKE },
            sendMessage: async () => { throw new Error("rate-overlimit") }
        })
        CONFIG.floodErrorStop = 2
        CONFIG.floodMaxRetries = 0
        const comErro = await gs.executarFlood(GRUPO_A, "oi", 200, { intervalo: 0, lote: 4 })
        assert(comErro.erros > 0 && comErro.ok === 0, "envios que estouram são contados como erro")
        assertEq(comErro.stopado, "ERROS_CONSECUTIVOS", "N lotes seguidos com falha encerram o job (estabilidade)")
        assert(comErro.tentadas < 200, "e o job para cedo em vez de martelar o relay")
        setSock(sockAntes)
        CONFIG.floodErrorStop = 99
        CONFIG.floodPaceAdaptativo = false
        const semAdapt = await gs.executarFlood(GRUPO_A, "oi", 2, { intervalo: 7, lote: 1 })
        assertEq(semAdapt.intervalo, 7, "pace adaptativo desligado → intervalo intacto")
        CONFIG.floodPaceAdaptativo = true
        assertEq(isKillSwitchOn(), false, "kill switch devolvido ao estado anterior")

        // ── 10) velocidade (overlay único) ───────────────────────────────────
        const s1 = speed.resolveFloodSpeed("1")
        assertEq(s1.ok && s1.modo, "rapido", "atalho 1 = rapido")
        const sBad = speed.resolveFloodSpeed("nada a ver")
        assertEq(sBad.ok, false, "velocidade inválida não cai em modo default")
        const sCustom = speed.resolveFloodSpeed("250")
        assertEq(sCustom.ok && sCustom.intervalo, 250, "número solto = intervalo custom em ms")
        const sBig = speed.resolveFloodSpeed(String(speed.CUSTOM_INTERVAL_MAX + 10))
        assertEq(sBig.ok, false, "acima do intervalo custom máximo é recusado")
        const aplic = speed.applyFloodSpeed(loadPreset("text-test").preset, s1)
        assert(aplic.interval >= FLOOD_PRESET_HARD_CAP.minInterval, "overlay de velocidade não fura o intervalo mínimo do preset")
        assert(/FLOOD_MODOS|1 ·/.test(speed.formatFloodSpeedMenu()), "menu de velocidade mostra as opções")
        assertEq(speed.toFloodOpts(s1).intervaloMs, s1.intervalo, "toFloodOpts repassa o intervalo ao laço do AB7 (campo intervaloMs)")
        const aplicBad = speed.applyFloodSpeed(loadPreset("payment-test").preset, { ok: true, modo: "rapido", intervalo: 1, lote: 20 })
        assert(aplicBad.interval >= FLOOD_PRESET_HARD_CAP.minInterval, "overlay não fura o piso de intervalo (1ms → 40ms)")
        assertEq(aplicBad.concurrency, 1, "payment fica em concorrência 1 mesmo com lote 20")

        // ── 11) nothing-else: nenhum segundo executor apareceu ────────────────
        const gsSrc = fs.readFileSync(path.join(RAIZ, "services/groupService.js"), "utf8")
        const floodFn = gsSrc.slice(gsSrc.indexOf("export async function executarFlood("), gsSrc.indexOf("export async function executarFloodLote("))
        const envios = (floodFn.match(/safeSendMessage\(/g) || []).length
        assertEq(envios, 1, "executarFlood tem UM ponto de envio (safeSendMessage) — nada de segundo caminho")
        assert(!/sendMessage\(\s*jid\s*,\s*\{\s*shop|viewOnceMessage|interactiveMessage/.test(gsSrc), "groupService não monta card/envelope por conta própria")
        const engineSrc = fs.readFileSync(path.join(AQUI, "presetEngine.js"), "utf8")
        assert(!/dryRun|testMode|allowlist|shopping/i.test(engineSrc), "presetEngine está limpo de dry-run/test-mode/allowlist/shopping")
        assert(/executarFlood/.test(engineSrc), "e chama o executarFlood do AB7")
        const idxSrc = fs.readFileSync(path.join(RAIZ, "features/flood/index.js"), "utf8")
        assert(!/from "\.\/(allowlist|engine|shopping|commerce)\.js"/.test(idxSrc), "barrel não re-exporta módulo morto")
        assert(!fs.existsSync(path.join(AQUI, "allowlist.js")) && !fs.existsSync(path.join(AQUI, "engine.js")) && !fs.existsSync(path.join(AQUI, "shopping.js")), "allowlist.js/engine.js/shopping.js não existem mais no disco")
        assert(!fs.existsSync(path.join(AQUI, "presets/shopping.js")), "presets/shopping.js saiu do disco")
    } catch (e) {
        failed++
        failures.push(`exceção: ${e.stack || e}`)
        console.log(`✗ exceção: ${e.stack || e}`)
    } finally {
        // ── restaurar TUDO (o config do usuário é sagrado) ───────────────────
        Object.assign(CONFIG, antes)
        CONFIG.floodKillSwitch = antes.floodKillSwitch
        setKillSwitch(!!antes.floodKillSwitch, { persist: false })
        clearCooldown()
        targets.clearFloodSelection()
        try {
            const { setSock: ss } = await import("../../connection/socket.js")
            ss(null)
        } catch {}
        const cfgDepois = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
        const histDepois = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null
        assert((cfgBytes === null && cfgDepois === null) || (cfgBytes && cfgDepois && cfgBytes.equals(cfgDepois)), "config.json NÃO foi tocado pela suíte")
        assert((histBytes === null && histDepois === null) || (histBytes && histDepois && histBytes.equals(histDepois)), "dono/historico.json NÃO foi tocado pela suíte")
        setSock(null)
    }

    console.log(`\n=== FLOOD · CORE+PAYMENT: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failed) {
        console.log("\nFalhas:")
        for (const f of failures) console.log(` • ${f}`)
        process.exitCode = 1
    }
}

main().catch(e => { console.error(e); process.exit(1) })
