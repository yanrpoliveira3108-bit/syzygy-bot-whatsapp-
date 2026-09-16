// features/flood/index.js
// API pública do flood de presets (load-test). Não substitui executarFlood.

import { getSock, rt } from "../../connection/socket.js"
import { setState, clearState } from "../../utils/stateManager.js"
import { CONFIG, salvarConfig } from "../../utils/config.js"
import { isOwner } from "../../utils/permissions.js"
import { safeSendMessage } from "../../services/groupService.js"
import { enviarVoltar, enviarCancelavel, listarGruposInterativo } from "../../menus/groupMenu.js"
import { getFloodRuntimeConfig, listPresetIds } from "./config.js"
import { maskJid, BLOCKED_TARGET } from "./allowlist.js"
import { isKillSwitchOn, setKillSwitch } from "./killswitch.js"
import { cancelRunningJob, isFloodEngineRunning, runPresetJob, describePreset } from "./engine.js"
import { formatPaymentError, getPaymentApiInfo, parsePaymentArgs } from "./payment.js"
import { listPresets } from "./presets/index.js"
import { parseSelectedGroups, TARGETS_REQUIRED, extractTargetJids } from "./groups.js"

export {
    runPresetJob,
    isFloodEngineRunning,
    cancelRunningJob,
    isKillSwitchOn,
    setKillSwitch,
    getPaymentApiInfo,
    parsePaymentArgs,
    describePreset,
    listPresets,
    parseSelectedGroups
}

const PRESET_BY_ACTION = {
    flood_preset_text_test: "text-test",
    flood_preset_mention_test: "mention-test",
    flood_preset_media_test: "media-test",
    flood_preset_payment_test: "payment-test"
}

export function formatPresetsMenu() {
    const rtCfg = getFloodRuntimeConfig()
    const list = listPresets()
    let t = `🌊 FLOOD PRESETS (load-test)\n`
    t += `Kill: ${rtCfg.killSwitch ? "ON" : "OFF"} · Dry-run: ${rtCfg.dryRun ? "ON" : "OFF"} · Test: ${rtCfg.testMode ? "ON" : "OFF"}\n`
    t += `━━━━━━━━━━━━━━━━━━━━\n`
    list.forEach((p, i) => {
        t += `  ${i + 1} · ${p.id}  (${p.type} · max ${p.maxMessages} · ${p.interval}ms)\n`
    })
    t += `\n  9 · STOP (kill switch)\n`
    t += `  0 · voltar\n\n`
    t += `_Depois do preset, a lista de grupos aparece._\n`
    t += `_Escolha 1 ou mais, separados por vírgula._\n`
    t += `_Ex: 1    ou    1,3,5_\n`
    t += `_Rápido: 2/preset/payment-test_\n`
    t += `_paymenttest · texttest · floodstop_`
    return t
}

export function formatPresetReport(p) {
    if (!p) return "Preset inválido."
    let t = `Preset: ${p.id}\n`
    t += `Type: ${p.type}\n`
    t += `Max messages: ${p.maxMessages}\n`
    t += `Interval: ${p.interval} ms\n`
    t += `Concurrency: ${p.concurrency}\n`
    t += `Cooldown: ${Math.round(p.cooldown / 1000)} s\n`
    t += `Target mode: ${p.targetMode}\n`
    if (p.type === "payment") {
        t += `\nPayload:\nTexto:\n${p.text || "Pagamento de teste"}\n\nValor:\n${Number(p.amount).toFixed(2)}\n\nMoeda:\n${p.currency}\n`
    }
    return t
}

function formatJobResult(r) {
    if (!r) return "Falha interna."
    if (!r.ok && r.error) {
        if (r.error === TARGETS_REQUIRED) return "❌ Nenhum grupo escolhido. Digite o número (ex: 1) ou vários separados por vírgula (ex: 1,3,5)."
        if (r.error === BLOCKED_TARGET) return "❌ BLOCKED_TARGET — grupo protegido (autorizado) ou inválido."
        if (r.error === "KILL_SWITCH") return "❌ FLOOD_KILL_SWITCH ativo. Use floodstart para liberar."
        if (r.error === "JOB_IN_PROGRESS") return "❌ Já existe um teste em execução."
        if (r.error === "COOLDOWN") return `❌ Cooldown ativo (${Math.ceil((r.remainingMs || 0) / 1000)}s).`
        if (r.error === "PAYMENT_TEST_DISABLED") return "❌ payment-test só roda com floodTestMode ligado."
        if (r.error === "PRESET_UNKNOWN") return "❌ Preset desconhecido. Use text-test, mention-test, media-test, payment-test."
        if (r.error === "MEDIA_UNAVAILABLE") return "❌ media-test: nenhuma imagem configurada (menuImage)."
        if (r.usage || formatPaymentError(r.error) !== `Erro de pagamento: ${r.error}\n${r.usage || ""}`) {
            const pretty = formatPaymentError(r.error)
            if (pretty) return `❌ ${pretty}`
        }
        return `❌ ${r.error}`
    }
    const m = r.metrics || {}
    let t = r.dryRun ? "🧪 DRY-RUN (nada enviado)\n" : "✅ Execução\n"
    t += `Preset: ${r.preset?.id} (${r.preset?.type})\n`
    t += `Queued: ${m.queued} · Sent: ${m.sent} · Fail: ${m.failed} · Cancel: ${m.cancelled}\n`
    t += `Duration: ${m.duration}ms · Avg latency: ${m.averageLatency}ms\n`
    if (r.targets?.length) t += `Alvos: ${r.targets.join(", ")}\n`
    if (r.blocked?.length) t += `Bloqueados: ${r.blocked.join(", ")}\n`
    if (r.preset?.type === "payment") {
        t += `\n${formatPresetReport(r.preset)}`
    }
    return t.trim()
}

async function reply(chatJid, text) {
    try {
        await enviarVoltar(chatJid, text)
    } catch {
        try { await safeSendMessage(chatJid, { text }, 0) } catch {}
    }
}

async function promptGroupPick(chatJid, ownerKey, extra = {}) {
    const cache = await listarGruposInterativo(chatJid)
    if (!cache) return
    rt().groupSelectionCache[ownerKey] = cache
    setState(ownerKey, {
        action: "flood_preset_pick_groups",
        presetId: extra.presetId,
        paymentArgs: extra.paymentArgs,
        dryRun: extra.dryRun
    })
    await enviarCancelavel(
        chatJid,
        `🌊 Escolha 1 ou mais grupos, separados por vírgula.\nEx: 1\nEx: 1,3,5\n\n0 = voltar · p2 = próxima página`
    )
}

export async function floodRouter(chatJid, ownerKey, actionId, extra = {}) {
    if (actionId === "painel_flood_presets" || actionId === "flood_presets_menu") {
        setState(ownerKey, { action: "flood_preset_menu" })
        await enviarCancelavel(chatJid, formatPresetsMenu())
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

    const presetId = PRESET_BY_ACTION[actionId] || extra.presetId
    if (presetId) {
        const targets = extractTargetJids(extra.targets)
        if (!targets.length) {
            await promptGroupPick(chatJid, ownerKey, {
                presetId,
                paymentArgs: extra.paymentArgs,
                dryRun: extra.dryRun
            })
            return
        }
        const r = await runPresetJob({
            presetId,
            ownerKey,
            dryRun: extra.dryRun,
            paymentArgs: extra.paymentArgs,
            targets,
            mediaBuffer: extra.mediaBuffer
        })
        try {
            const { registrarAcao } = await import("../../services/historicoService.js")
            registrarAcao("flood_preset", {
                preset: presetId,
                dryRun: !!r.dryRun,
                ok: !!r.ok,
                sent: r.metrics?.sent,
                queued: r.metrics?.queued,
                erro: r.error || undefined
            })
        } catch {}
        await reply(chatJid, formatJobResult(r))
        return
    }

    await getSock().sendMessage(chatJid, { text: `⚠️ Flood preset não reconhecido: ${actionId}` })
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
        const map = { "1": "text-test", "2": "mention-test", "3": "media-test", "4": "payment-test" }
        const id = map[n] || (listPresetIds().includes(raw) ? raw : null)
        if (!id) {
            if (!st.avisou) {
                setState(ownerKey, { action: "flood_preset_menu", avisou: true })
                await getSock().sendMessage(chatJid, { text: "Opção inválida. 1-4 presets · 9 stop · 0 voltar" })
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
            setState(ownerKey, {
                action: "flood_preset_pick_groups",
                presetId: st.presetId,
                paymentArgs: st.paymentArgs,
                dryRun: st.dryRun
            })
            await enviarCancelavel(
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
        clearState(ownerKey)
        await getSock().sendMessage(chatJid, { text: `Grupos escolhidos (${atacaveis.length}): ${names}` }).catch(() => {})
        await floodRouter(chatJid, ownerKey, "run", {
            presetId: st.presetId,
            paymentArgs: st.paymentArgs,
            dryRun: st.dryRun,
            targets: atacaveis.map(g => g.id)
        })
        return true
    }
    return false
}

export function isFloodPresetFast(parts) {
    return Array.isArray(parts) && parts[0] === "2" && String(parts[1] || "").toLowerCase() === "preset"
}
