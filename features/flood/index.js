// features/flood/index.js
// API pública do flood de presets. Não substitui executarFlood.

import { getSock, rt } from "../../connection/socket.js"
import { setState, clearState } from "../../utils/stateManager.js"
import { CONFIG, salvarConfig, MAX_FLOOD } from "../../utils/config.js"
import { isOwner } from "../../utils/permissions.js"
import { safeSendMessage } from "../../services/groupService.js"
import { enviarVoltar, enviarCancelavel, listarGruposInterativo } from "../../menus/groupMenu.js"
import { getFloodRuntimeConfig, listPresetIds, getPresetDef } from "./config.js"
import { maskJid, BLOCKED_TARGET } from "./allowlist.js"
import { isKillSwitchOn, setKillSwitch } from "./killswitch.js"
import { cancelRunningJob, isFloodEngineRunning, runPresetJob, describePreset } from "./engine.js"
import { formatPaymentError, getPaymentApiInfo, parsePaymentArgs } from "./payment.js"
import { formatShoppingError, getShoppingApiInfo, parseShoppingArgs } from "./shopping.js"
import { listPresets } from "./presets/index.js"
import { parseSelectedGroups, TARGETS_REQUIRED, extractTargetJids } from "./groups.js"
import { resolveFloodSpeed, formatFloodSpeedMenu } from "./speed.js"
import { listCustomPresets, saveCustomPreset, deleteCustomPreset, formatCustomPresetsTexto, slugPresetId } from "./customStore.js"

export {
    runPresetJob,
    isFloodEngineRunning,
    cancelRunningJob,
    isKillSwitchOn,
    setKillSwitch,
    getPaymentApiInfo,
    parsePaymentArgs,
    getShoppingApiInfo,
    parseShoppingArgs,
    describePreset,
    listPresets,
    parseSelectedGroups,
    resolveFloodSpeed,
    formatFloodSpeedMenu,
    saveCustomPreset,
    deleteCustomPreset,
    listCustomPresets
}

const PRESET_BY_ACTION = {
    flood_preset_text_test: "text-test",
    flood_preset_mention_test: "mention-test",
    flood_preset_media_test: "media-test",
    flood_preset_payment_test: "payment-test",
    flood_preset_shopping_test: "shopping-test"
}

const BUILTIN_IDS = ["text-test", "mention-test", "media-test", "payment-test", "shopping-test"]

export function formatPresetsMenu() {
    const rtCfg = getFloodRuntimeConfig()
    const list = listPresets()
    let t = `🌊 FLOOD PRESETS\n`
    t += `Kill: ${rtCfg.killSwitch ? "ON" : "OFF"} · Dry-run: ${rtCfg.dryRun ? "ON" : "OFF"} · Test: ${rtCfg.testMode ? "ON" : "OFF"}\n`
    t += `━━━━━━━━━━━━━━━━━━━━\n`
    list.forEach((p, i) => {
        const n = i + 1
        let extra = p.type
        if (p.type === "payment") extra += ` ${Number(p.amount || 0).toFixed(2)} ${p.currency || "BRL"}`
        if (p.type === "shopping") extra += ` surface ${p.shop?.surface ?? ""}`
        if (p.modo) extra += ` · ${p.modo}`
        t += `  ${n} · ${p.id}  (${extra})\n`
    })
    t += `\n  c · criar preset\n`
    t += `  a · apagar preset\n`
    t += `  9 · STOP (kill switch)\n`
    t += `  0 · voltar\n\n`
    t += `_Depois do preset: grupos → conteúdo → qtd → velocidade._\n`
    t += `_Grupos: 1 ou 1,3,5_\n`
    t += `_Pagamento: texto|valor|moeda_\n`
    t += `_Loja: texto|title|surface|id_\n`
    t += `_Velocidade: 1 rápido · 2 normal · 3 lento · 4 seguro_\n`
    t += `_Rápido: 2/preset/payment-test_`
    return t
}

export function formatPresetReport(p) {
    if (!p) return "Preset inválido."
    let t = `Preset: ${p.id}\n`
    t += `Type: ${p.type}\n`
    if (p.floodModo) t += `Modo: ${p.floodModo}\n`
    t += `Max messages: ${p.maxMessages}\n`
    t += `Interval: ${p.interval} ms\n`
    t += `Concurrency: ${p.concurrency}\n`
    t += `Cooldown: ${Math.round(p.cooldown / 1000)} s\n`
    t += `Target mode: ${p.targetMode}\n`
    if (p.type === "payment") {
        t += `\nPayload:\nTexto:\n${p.text || "Pagamento de teste"}\n\nValor:\n${Number(p.amount).toFixed(2)}\n\nMoeda:\n${p.currency}\n`
    }
    if (p.type === "shopping") {
        t += `\nPayload:\nTexto:\n${p.text || "Produto de teste"}\n\nTitle:\n${p.title || ""}\n\nSurface:\n${p.shop?.surface ?? ""}\n\nShop id:\n${p.shop?.id || ""}\n`
    }
    return t
}

const PAYMENT_ERR = new Set([
    "USAGE", "TEXT_MISSING", "AMOUNT_MISSING", "AMOUNT_INVALID", "AMOUNT_NEGATIVE",
    "CURRENCY_MISSING", "CURRENCY_INVALID", "CURRENCY_UNSUPPORTED",
    "PAYMENT_UNAVAILABLE", "PAYMENT_TEST_DISABLED", "PAYMENT_PAYLOAD_INVALID"
])

const SHOPPING_ERR = new Set([
    "SURFACE_MISSING", "SURFACE_INVALID", "SHOP_ID_MISSING", "SHOP_ID_INVALID",
    "URL_MISSING", "URL_INVALID", "MEDIA_MISSING", "MEDIA_INVALID", "MEDIA_URL_INVALID",
    "MIMETYPE_MISSING", "LOCATION_MISSING", "LOCATION_INVALID",
    "PRODUCT_MISSING", "PRODUCT_ID_MISSING", "PRODUCT_TITLE_MISSING", "PRODUCT_DESCRIPTION_MISSING",
    "PRODUCT_CURRENCY_MISSING", "PRODUCT_IMAGE_MISSING", "PRODUCT_IMAGE_COUNT_INVALID",
    "PRICE_MISSING", "PRICE_INVALID", "BUSINESS_OWNER_MISSING", "BUSINESS_OWNER_INVALID",
    "FORMAT_UNSUPPORTED", "SHOPPING_UNAVAILABLE", "SHOPPING_TEST_DISABLED", "SHOPPING_PAYLOAD_INVALID"
])

function formatJobResult(r) {
    if (!r) return "Falha interna."
    if (!r.ok && r.error) {
        if (r.error === TARGETS_REQUIRED) return "❌ Nenhum grupo escolhido. Digite o número (ex: 1) ou vários separados por vírgula (ex: 1,3,5)."
        if (r.error === BLOCKED_TARGET) return "❌ BLOCKED_TARGET — grupo protegido (autorizado) ou inválido."
        if (r.error === "KILL_SWITCH") return "❌ FLOOD_KILL_SWITCH ativo. Use floodstart para liberar."
        if (r.error === "JOB_IN_PROGRESS") return "❌ Já existe um teste em execução."
        if (r.error === "COOLDOWN") return `❌ Cooldown ativo (${Math.ceil((r.remainingMs || 0) / 1000)}s).`
        if (r.error === "PAYMENT_TEST_DISABLED") return "❌ payment-test só roda com floodTestMode ligado."
        if (r.error === "SHOPPING_TEST_DISABLED") return "❌ shopping-test só roda com floodTestMode ligado."
        if (r.error === "PRESET_UNKNOWN") return "❌ Preset desconhecido. Use 1-5, o id do custom, ou crie com c."
        if (r.error === "MEDIA_UNAVAILABLE") return "❌ media-test: nenhuma imagem configurada (menuImage)."
        if (r.error === "ENGINE_ERROR") return `❌ Falha no envio: ${r.message || r.error}`
        if (r.type === "shopping" || SHOPPING_ERR.has(r.error)) {
            const pretty = formatShoppingError(r.error)
            if (pretty) return `❌ ${pretty}`
        }
        if (PAYMENT_ERR.has(r.error) || r.usage) {
            const pretty = formatPaymentError(r.error)
            if (pretty) return `❌ ${pretty}`
        }
        const detail = r.message ? ` (${r.message})` : ""
        return `❌ ${r.error}${detail}`
    }
    const m = r.metrics || {}
    let t = r.dryRun ? "🧪 DRY-RUN (nada enviado)\n" : (r.ok ? "✅ Execução\n" : "❌ Execução com falha\n")
    t += `Preset: ${r.preset?.id} (${r.preset?.type})\n`
    if (r.preset?.floodModo) t += `Velocidade: ${r.preset.floodModo} (${r.preset.interval}ms)\n`
    t += `Queued: ${m.queued} · Sent: ${m.sent} · Fail: ${m.failed} · Cancel: ${m.cancelled}\n`
    t += `Duration: ${m.duration}ms · Avg latency: ${m.averageLatency}ms\n`
    const firstFail = (r.results || []).find(x => x && !x.ok && (x.message || x.error))
    if (firstFail) t += `Erro: ${firstFail.message || firstFail.error}\n`
    if (r.targets?.length) t += `Alvos: ${r.targets.join(", ")}\n`
    if (r.blocked?.length) t += `Bloqueados: ${r.blocked.join(", ")}\n`
    if (r.preset?.type === "payment" || r.preset?.type === "shopping") {
        t += `\n${formatPresetReport(r.preset)}`
    }
    return t.trim()
}

const LERMAIS_SKIP = "\u034F".repeat(64)

function wizardMsg(texto) {
    const t = String(texto || "")
    const i = t.indexOf("\n")
    if (i < 0 || t.includes(LERMAIS_SKIP)) return t
    return t.slice(0, i + 1) + LERMAIS_SKIP + t.slice(i + 1)
}

async function promptWizard(chatJid, texto) {
    await enviarCancelavel(chatJid, wizardMsg(texto))
}

async function reply(chatJid, text) {
    try {
        await enviarVoltar(chatJid, wizardMsg(text))
    } catch {
        try { await safeSendMessage(chatJid, { text: wizardMsg(text) }, 0) } catch {}
    }
}

function flowPayload(extra = {}) {
    const o = {}
    for (const k of ["presetId", "contentKind", "paymentArgs", "shoppingArgs", "shoppingBody", "dryRun", "qtd", "floodModo", "targets"]) {
        if (extra[k] !== undefined) o[k] = extra[k]
    }
    return o
}

function isShoppingContentState(st) {
    if (!st) return false
    if (st.contentKind === "shopping") return true
    const def = getPresetDef(st.presetId)
    return def?.type === "shopping"
}

function contentPrompt(presetId) {
    const def = getPresetDef(presetId) || {}
    const note = def.text || "Pagamento de teste"
    const amount = Number.isFinite(Number(def.amount)) ? Number(def.amount).toFixed(2) : "25.90"
    const currency = def.currency || "BRL"
    return `💳 CONTEÚDO DO PAGAMENTO\nAtual: ${note}|${amount}|${currency}\n\nDigite: texto|valor|moeda\nEx: Pagamento do pedido|25.90|BRL\n\n0 = manter atual`
}

function shoppingContentPrompt(presetId) {
    const def = getPresetDef(presetId) || {}
    const body = def.text || "Produto de teste"
    const title = def.title || "SYZYGY SHOP"
    const surface = def.shop?.surface ?? 1
    const shopId = def.shop?.id || "https://en.wikipedia.org/wiki/QR_code"
    return `🛍️ CONTEÚDO DA LOJA\nAtual: ${title} · surface ${surface}\n\nCole o texto da loja (uma mensagem)\nOu: texto|title|surface|id\nEx: Produto de teste|SYZYGY SHOP|1|https://en.wikipedia.org/wiki/QR_code\nSurface: 1 · 2 · 3 · 4\n\n0 = manter atual`
}

function qtdPrompt() {
    return `Quantidade por grupo (máx ${MAX_FLOOD}):\n0 = 1`
}

async function promptGroupPick(chatJid, ownerKey, extra = {}) {
    const cache = await listarGruposInterativo(chatJid)
    if (!cache) return
    rt().groupSelectionCache[ownerKey] = cache
    setState(ownerKey, { action: "flood_preset_pick_groups", ...flowPayload(extra) })
    await promptWizard(
        chatJid,
        `🌊 Escolha 1 ou mais grupos, separados por vírgula.\nEx: 1\nEx: 1,3,5\n\n0 = voltar · p2 = próxima página`
    )
}

async function continueWizard(chatJid, ownerKey, extra = {}) {
    const def = getPresetDef(extra.presetId)
    if (def?.type === "payment" && (extra.paymentArgs == null || extra.paymentArgs === "")) {
        setState(ownerKey, { action: "flood_preset_pick_content", contentKind: "payment", ...flowPayload(extra) })
        await promptWizard(chatJid, contentPrompt(extra.presetId))
        return
    }
    if (def?.type === "shopping" && extra.shoppingArgs == null && extra.shoppingBody == null) {
        setState(ownerKey, { action: "flood_preset_pick_content", contentKind: "shopping", ...flowPayload(extra) })
        await enviarCancelavel(chatJid, shoppingContentPrompt(extra.presetId))
        return
    }
    if (extra.qtd == null || extra.qtd === "") {
        setState(ownerKey, { action: "flood_preset_pick_qtd", ...flowPayload(extra) })
        await promptWizard(chatJid, qtdPrompt())
        return
    }
    if (extra.floodModo == null || extra.floodModo === "") {
        setState(ownerKey, { action: "flood_preset_pick_speed", ...flowPayload(extra) })
        await promptWizard(chatJid, formatFloodSpeedMenu())
        return
    }
    await floodRouter(chatJid, ownerKey, "run", { ...extra, skipWizard: true })
}

async function executeJob(chatJid, extra = {}) {
    const r = await runPresetJob({
        presetId: extra.presetId,
        ownerKey: extra.ownerKey,
        dryRun: extra.dryRun,
        paymentArgs: extra.paymentArgs,
        shoppingArgs: extra.shoppingArgs,
        shoppingBody: extra.shoppingBody,
        targets: extra.targets,
        mediaBuffer: extra.mediaBuffer,
        qtd: extra.qtd,
        floodModo: extra.floodModo,
        floodCfg: extra.floodCfg
    })
    try {
        const { registrarAcao } = await import("../../services/historicoService.js")
        registrarAcao("flood_preset", {
            preset: extra.presetId,
            dryRun: !!r.dryRun,
            ok: !!r.ok,
            sent: r.metrics?.sent,
            queued: r.metrics?.queued,
            modo: extra.floodModo || r.preset?.floodModo,
            erro: r.error || undefined
        })
    } catch {}
    await reply(chatJid, formatJobResult(r))
}

export async function floodRouter(chatJid, ownerKey, actionId, extra = {}) {
    if (actionId === "painel_flood_presets" || actionId === "flood_presets_menu") {
        setState(ownerKey, { action: "flood_preset_menu" })
        await promptWizard(chatJid, formatPresetsMenu())
        return
    }
    if (actionId === "flood_kill_on") {
        if (!isOwner(ownerKey)) {
            await getSock().sendMessage(chatJid, { text: "❌ Apenas o dono liga o kill switch." })
            return
        }
        setKillSwitch(true, { persist: true })
        cancelRunningJob("KILL_SWITCH")
        await reply(chatJid, "🛑 FLOOD_KILL_SWITCH LIGADO.\nFila interrompida. Novos envios bloqueados.")
        return
    }
    if (actionId === "flood_kill_off") {
        if (!isOwner(ownerKey)) {
            await getSock().sendMessage(chatJid, { text: "❌ Apenas o dono desliga o kill switch." })
            return
        }
        setKillSwitch(false, { persist: true })
        await reply(chatJid, "✅ FLOOD_KILL_SWITCH desligado.")
        return
    }
    if (actionId === "cfg_flood_dryrun") {
        if (!isOwner(ownerKey)) {
            await getSock().sendMessage(chatJid, { text: "❌ Apenas o dono altera dry-run." })
            return
        }
        CONFIG.floodDryRun = !CONFIG.floodDryRun
        salvarConfig()
        await reply(chatJid, `🧪 Dry-run agora: ${CONFIG.floodDryRun ? "LIGADO" : "DESLIGADO"}`)
        return
    }
    if (actionId === "cfg_flood_allowlist") {
        await reply(chatJid, "Flood presets não usam allowlist.\nEscolha os grupos na lista, separados por vírgula (ex: 1 ou 1,3,5).")
        await floodRouter(chatJid, ownerKey, "painel_flood_presets")
        return
    }
    if (actionId === "cfg_flood_testmode") {
        if (!isOwner(ownerKey)) {
            await getSock().sendMessage(chatJid, { text: "❌ Apenas o dono altera test mode." })
            return
        }
        CONFIG.floodTestMode = CONFIG.floodTestMode === false
        salvarConfig()
        await reply(chatJid, `🧪 floodTestMode: ${CONFIG.floodTestMode ? "LIGADO" : "DESLIGADO"}`)
        return
    }
    if (actionId === "flood_preset_create") {
        if (!isOwner(ownerKey)) {
            await getSock().sendMessage(chatJid, { text: "❌ Apenas o dono cria presets." })
            return
        }
        setState(ownerKey, { action: "flood_preset_create_name" })
        await enviarCancelavel(chatJid, "Nome do preset (ex: pix-loja):\nNão use text-test / payment-test.\n\n0 = voltar")
        return
    }
    if (actionId === "flood_preset_delete") {
        if (!isOwner(ownerKey)) {
            await getSock().sendMessage(chatJid, { text: "❌ Apenas o dono apaga presets." })
            return
        }
        const custom = listCustomPresets()
        if (!custom.length) {
            await reply(chatJid, "Nenhum preset custom para apagar.")
            await floodRouter(chatJid, ownerKey, "painel_flood_presets")
            return
        }
        setState(ownerKey, { action: "flood_preset_delete" })
        await enviarCancelavel(chatJid, `Apagar preset custom:\n${formatCustomPresetsTexto()}\n\nDigite o número ou o id.\n0 = voltar`)
        return
    }

    const presetId = PRESET_BY_ACTION[actionId] || extra.presetId
    if (presetId) {
        const targets = extractTargetJids(extra.targets)
        if (!targets.length) {
            await promptGroupPick(chatJid, ownerKey, {
                presetId,
                paymentArgs: extra.paymentArgs,
                shoppingArgs: extra.shoppingArgs,
                shoppingBody: extra.shoppingBody,
                dryRun: extra.dryRun,
                qtd: extra.qtd,
                floodModo: extra.floodModo
            })
            return
        }
        if (!extra.skipWizard) {
            await continueWizard(chatJid, ownerKey, {
                presetId,
                paymentArgs: extra.paymentArgs,
                shoppingArgs: extra.shoppingArgs,
                shoppingBody: extra.shoppingBody,
                dryRun: extra.dryRun,
                qtd: extra.qtd,
                floodModo: extra.floodModo,
                targets
            })
            return
        }
        await executeJob(chatJid, {
            ...extra,
            presetId,
            ownerKey,
            targets
        })
        return
    }

    await getSock().sendMessage(chatJid, { text: `⚠️ Flood preset não reconhecido: ${actionId}` })
}

function resolveMenuPreset(raw, n) {
    const list = listPresets()
    if (n && /^\d+$/.test(n)) {
        const idx = parseInt(n, 10)
        if (idx >= 1 && idx <= list.length) return list[idx - 1]?.id || null
    }
    const key = String(raw || "").trim().toLowerCase()
    if (listPresetIds().includes(key)) return key
    const slug = slugPresetId(key)
    if (slug && listPresetIds().includes(slug)) return slug
    return null
}

export async function handleFloodPresetState(chatJid, ownerKey, st, text) {
    if (!st) return false

    if (st.action === "flood_preset_menu" && text) {
        const raw = text.trim().toLowerCase()
        const n = raw.replace(/\D/g, "")
        if (raw === "0" || n === "0") {
            clearState(ownerKey)
            const { enviarPainelInicial } = await import("../../menus/mainMenu.js")
            await enviarPainelInicial(chatJid)
            return true
        }
        if (n === "9" || raw === "stop" || raw === "floodstop") {
            clearState(ownerKey)
            await floodRouter(chatJid, ownerKey, "flood_kill_on")
            return true
        }
        if (raw === "c" || raw === "criar" || raw === "+") {
            await floodRouter(chatJid, ownerKey, "flood_preset_create")
            return true
        }
        if (raw === "a" || raw === "apagar" || raw === "-") {
            await floodRouter(chatJid, ownerKey, "flood_preset_delete")
            return true
        }
        const id = resolveMenuPreset(raw, n)
        if (!id) {
            if (!st.avisou) {
                setState(ownerKey, { action: "flood_preset_menu", avisou: true })
                await getSock().sendMessage(chatJid, { text: "Opção inválida. Número do preset · c criar · a apagar · 9 stop · 0 voltar" })
            }
            return true
        }
        await floodRouter(chatJid, ownerKey, "run", { presetId: id })
        return true
    }

    if (st.action === "flood_preset_pick_groups" && text) {
        const raw = text.trim()
        const pagMatch = raw.match(/^(?:pag|p)\s*(\d+)$/i)
        if (pagMatch) {
            const novoCache = await listarGruposInterativo(chatJid, parseInt(pagMatch[1], 10))
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            setState(ownerKey, { action: "flood_preset_pick_groups", ...flowPayload(st) })
            await promptWizard(
                chatJid,
                `🌊 Escolha 1 ou mais grupos, separados por vírgula.\nEx: 1\nEx: 1,3,5\n\n0 = voltar · p2 = próxima página`
            )
            return true
        }
        if (raw === "0" || raw.toLowerCase() === "voltar") {
            await floodRouter(chatJid, ownerKey, "painel_flood_presets")
            return true
        }
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const parsed = parseSelectedGroups(cache, raw)
        if (!parsed.ok) {
            if (!st.avisou) {
                setState(ownerKey, { ...st, avisou: true })
                await getSock().sendMessage(chatJid, { text: "⚠️ Grupo não encontrado.\nDigite o número (ex: 1) ou vários separados por vírgula (ex: 1,3,5)." })
            }
            return true
        }
        if (parsed.invalid.length) {
            await getSock().sendMessage(chatJid, { text: `⚠️ Ignorando inválidos: ${parsed.invalid.slice(0, 10).join(", ")}` })
        }
        let { isAuthorizedGroup } = { isAuthorizedGroup: () => false }
        try {
            ;({ isAuthorizedGroup } = await import("../../utils/permissions.js"))
        } catch {}
        const protegidos = parsed.entries.filter(e => {
            try { return isAuthorizedGroup(e.id) } catch { return false }
        })
        const atacaveis = parsed.entries.filter(e => {
            try { return !isAuthorizedGroup(e.id) } catch { return true }
        })
        if (protegidos.length) {
            await getSock().sendMessage(chatJid, { text: `🛡️ ${protegidos.length} protegido(s) ignorado(s):\n${protegidos.map(g => `• ${g.subject}`).join("\n")}` })
        }
        if (!atacaveis.length) {
            await getSock().sendMessage(chatJid, { text: "❌ Todos os grupos escolhidos são protegidos (autorizados)." })
            return true
        }
        const names = atacaveis.map(g => g.subject).join(", ")
        await getSock().sendMessage(chatJid, { text: `Grupos escolhidos (${atacaveis.length}): ${names}` }).catch(() => {})
        await continueWizard(chatJid, ownerKey, {
            ...flowPayload(st),
            targets: atacaveis.map(g => g.id)
        })
        return true
    }

    if (st.action === "flood_preset_pick_content" && text) {
        const raw = text.trim()
        const shoppingNow = isShoppingContentState(st)
        if (raw === "0" || raw.toLowerCase() === "manter") {
            await continueWizard(chatJid, ownerKey, {
                ...flowPayload(st),
                paymentArgs: shoppingNow ? st.paymentArgs : (st.paymentArgs || false),
                shoppingArgs: shoppingNow ? false : st.shoppingArgs,
                shoppingBody: shoppingNow ? false : st.shoppingBody
            })
            return true
        }
        if (shoppingNow) {
            const parsed = parseShoppingArgs(raw)
            if (parsed.ok) {
                await continueWizard(chatJid, ownerKey, { ...flowPayload(st), shoppingArgs: raw, shoppingBody: false })
                return true
            }
            if (parsed.error === "SURFACE_INVALID" || parsed.error === "SHOP_ID_INVALID" || parsed.error === "SHOP_ID_MISSING") {
                await getSock().sendMessage(chatJid, { text: `❌ ${formatShoppingError(parsed.error)}` })
                return true
            }
            await continueWizard(chatJid, ownerKey, { ...flowPayload(st), shoppingArgs: false, shoppingBody: raw })
            return true
        }
        const parsed = parsePaymentArgs(raw)
        if (!parsed.ok) {
            await getSock().sendMessage(chatJid, { text: `❌ ${formatPaymentError(parsed.error)}` })
            return true
        }
        await continueWizard(chatJid, ownerKey, { ...flowPayload(st), paymentArgs: raw })
        return true
    }

    if (st.action === "flood_preset_pick_qtd" && text) {
        const raw = text.trim()
        if (raw === "0" || raw.toLowerCase() === "pular") {
            await continueWizard(chatJid, ownerKey, { ...flowPayload(st), qtd: 1 })
            return true
        }
        const q = parseInt(raw.replace(/\D/g, ""), 10)
        if (!Number.isFinite(q) || q < 1) {
            await getSock().sendMessage(chatJid, { text: `Quantidade inválida. 1-${MAX_FLOOD} ou 0 para 1.` })
            return true
        }
        await continueWizard(chatJid, ownerKey, { ...flowPayload(st), qtd: Math.min(q, MAX_FLOOD) })
        return true
    }

    if (st.action === "flood_preset_pick_speed" && text) {
        const raw = text.trim()
        const speed = resolveFloodSpeed(raw)
        if (!speed.ok) {
            if (!st.avisou) {
                setState(ownerKey, { ...st, avisou: true })
                await getSock().sendMessage(chatJid, { text: "Modo inválido. Digite 1-4, rapido/normal/lento/seguro, intervalo (ex: 200) ou 0." })
            }
            return true
        }
        await continueWizard(chatJid, ownerKey, { ...flowPayload(st), floodModo: raw, floodCfg: speed })
        return true
    }

    if (st.action === "flood_preset_create_name" && text) {
        const raw = text.trim()
        if (raw === "0" || raw.toLowerCase() === "voltar") {
            await floodRouter(chatJid, ownerKey, "painel_flood_presets")
            return true
        }
        const id = slugPresetId(raw)
        if (!id) {
            await getSock().sendMessage(chatJid, { text: "Nome inválido. Use letras, números e hífen." })
            return true
        }
        if (BUILTIN_IDS.includes(id)) {
            await getSock().sendMessage(chatJid, { text: "Esse id é reservado. Escolha outro nome." })
            return true
        }
        setState(ownerKey, { action: "flood_preset_create_type", createName: raw })
        await enviarCancelavel(chatJid, `Tipo do preset "${id}":\n  1 · payment (padrão)\n  2 · text\n\n0 = voltar`)
        return true
    }

    if (st.action === "flood_preset_create_type" && text) {
        const raw = text.trim().toLowerCase()
        if (raw === "0" || raw === "voltar") {
            await floodRouter(chatJid, ownerKey, "flood_preset_create")
            return true
        }
        let type = "payment"
        if (raw === "2" || raw === "text" || raw === "texto") type = "text"
        else if (raw === "1" || raw === "payment" || raw === "pagamento" || raw === "") type = "payment"
        else if (!["1", "2", "payment", "text", "texto", "pagamento"].includes(raw)) {
            await getSock().sendMessage(chatJid, { text: "Digite 1 (payment) ou 2 (text)." })
            return true
        }
        setState(ownerKey, { action: "flood_preset_create_content", createName: st.createName, createType: type })
        if (type === "payment") {
            await enviarCancelavel(chatJid, `Conteúdo do pagamento:\ntexto|valor|moeda\nEx: Pagamento do pedido|25.90|BRL`)
        } else {
            await enviarCancelavel(chatJid, "Texto do preset:")
        }
        return true
    }

    if (st.action === "flood_preset_create_content" && text) {
        const raw = text.trim()
        if (raw === "0" || raw.toLowerCase() === "voltar") {
            setState(ownerKey, { action: "flood_preset_create_type", createName: st.createName })
            await enviarCancelavel(chatJid, `Tipo do preset:\n  1 · payment\n  2 · text\n\n0 = voltar`)
            return true
        }
        const type = st.createType || "payment"
        const draft = { createName: st.createName, createType: type }
        if (type === "payment") {
            const parsed = parsePaymentArgs(raw)
            if (!parsed.ok) {
                await getSock().sendMessage(chatJid, { text: `❌ ${formatPaymentError(parsed.error)}` })
                return true
            }
            draft.createText = parsed.text
            draft.createAmount = parsed.amount
            draft.createCurrency = parsed.currency
        } else {
            if (!raw) {
                await getSock().sendMessage(chatJid, { text: "Texto obrigatório." })
                return true
            }
            draft.createText = raw
        }
        setState(ownerKey, { action: "flood_preset_create_speed", ...draft })
        await enviarCancelavel(chatJid, `Velocidade padrão deste preset:\n\n${formatFloodSpeedMenu()}`)
        return true
    }

    if (st.action === "flood_preset_create_speed" && text) {
        const raw = text.trim()
        const speed = resolveFloodSpeed(raw)
        if (!speed.ok) {
            await getSock().sendMessage(chatJid, { text: "Modo inválido. 1-4, nome do modo, intervalo (ex: 200) ou 0." })
            return true
        }
        const saved = saveCustomPreset({
            name: st.createName,
            type: st.createType || "payment",
            text: st.createText,
            amount: st.createAmount,
            currency: st.createCurrency,
            modo: speed.modo === "custom" ? String(speed.intervalo) : speed.modo
        })
        if (!saved.ok) {
            await getSock().sendMessage(chatJid, { text: `❌ Não salvou: ${saved.error}` })
            return true
        }
        clearState(ownerKey)
        const p = saved.preset
        const extra = p.type === "payment" ? ` ${Number(p.amount).toFixed(2)} ${p.currency}` : ""
        await floodRouter(chatJid, ownerKey, "painel_flood_presets")
        await getSock().sendMessage(chatJid, { text: `✅ Preset ${saved.updated ? "atualizado" : "criado"}: ${p.id} (${p.type}${extra} · ${p.modo})` }).catch(() => {})
        return true
    }

    if (st.action === "flood_preset_delete" && text) {
        const raw = text.trim()
        if (raw === "0" || raw.toLowerCase() === "voltar") {
            await floodRouter(chatJid, ownerKey, "painel_flood_presets")
            return true
        }
        const res = deleteCustomPreset(raw)
        if (!res.ok) {
            await getSock().sendMessage(chatJid, { text: "Preset não encontrado. Número da lista ou id." })
            return true
        }
        await floodRouter(chatJid, ownerKey, "painel_flood_presets")
        await getSock().sendMessage(chatJid, { text: `🗑️ Apagado: ${res.removed.id}` }).catch(() => {})
        return true
    }

    return false
}

export function isFloodPresetFast(parts) {
    return Array.isArray(parts) && parts[0] === "2" && String(parts[1] || "").toLowerCase() === "preset"
}
