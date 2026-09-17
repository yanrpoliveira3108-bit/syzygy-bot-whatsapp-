// features/flood/router.js
// [RESTAURAÇÃO] Fachada de comandos da arena 01a0aaae, reconstruída sobre a API da AB7.
//
// A arena antiga tinha 10 comandos de texto (`floodpresets`, `paymenttest`,
// `shoppingtest`, `floodstop`, …) e as opções 36-39 do painel do dono apontando para
// um `floodRouter` dentro de features/flood/index.js. A migração para a AB7 trouxe a
// infra (queue/limiter/kill switch/allowlist/preset engine) mas NÃO trouxe essa
// fachada — foi isso que fez "os comandos sumirem".
//
// O que mudou de lá para cá, de propósito:
//   • Não existe wizard paralelo: os `*test` disparam pelo MESMO runPresetJob da AB7,
//     que por sua vez chama o executarFlood clássico (services/groupService.js). Nada
//     aqui chama sock.sendMessage() para mandar flood.
//   • Dry-run é o default: só sai de verdade se CONFIG.floodDryRun estiver DESLIGADO
//     (painel 37) — o comando nunca "esconde" o envio.
//   • Alvos = allowlist da feature (a porta de saída). `38 · Escolher grupos` escreve
//     nela a partir da lista de grupos autorizados; nada é ampliado sozinho.
//   • O preset de loja vem daqui só como DADO de preset (overlay texto|title|surface|id),
//     com surface ≤ 3 e viewOnce off — as chaves do card são as do builder da AB7.

import { CONFIG } from "../../utils/config.js"
import { getSock } from "../../connection/socket.js"
import { isOwner } from "../../utils/permissions.js"
import { setState } from "../../utils/stateManager.js"
import { runPresetJob, formatPresetJobResult, currentJobInfo, cancelRunningJob } from "./presetEngine.js"
import { setKillSwitch, killSwitchStatusTexto, KILL_SWITCH_REASON } from "./killswitch.js"
import { getAllowlist, addAllowlistJid, formatAllowlistTexto, maskJid } from "./allowlist.js"
import { listPresetsTexto } from "./presets/index.js"
import { formatCustomPresetsTexto } from "./customStore.js"
import { normalizeSurface } from "./shopping.js"
import { listShoppingPresetsTexto, DEFAULT_SHOPPING_PRESET_ID } from "./config.js"
import { parseAmount, parseCurrency } from "./payment.js"
import { getFloodRuntimeConfig, FLOOD_PRESET_HARD_CAP } from "./config.js"

/**
 * Nomes de comando público → id de ação. É a fonte única dos atalhos de texto
 * (commands/commandMap.js) e da ajuda: renumerar/renomear aqui, não lá.
 */
export const FLOOD_PRESET_COMMANDS = {
    floodpresets: "painel_flood_presets",
    floodpreset: "painel_flood_presets",
    texttest: "flood_preset_text_test",
    mentiontest: "flood_preset_mention_test",
    mediatest: "flood_preset_media_test",
    paymenttest: "flood_preset_payment_test",
    shoppingtest: "flood_preset_shopping_test",
    floodstop: "flood_kill_on",
    floodstart: "flood_kill_off",
    flooddryrun: "cfg_flood_dryrun"
}

/** Ação de atalho → preset que ela roda (null = painel/toggle, não roda job). */
export const FLOOD_TEST_ACTION_PRESET = {
    flood_preset_text_test: "text-test",
    flood_preset_mention_test: "mention-test",
    flood_preset_media_test: "media-test",
    flood_preset_payment_test: "payment-test",
    flood_preset_shopping_test: "shopping-test"
}

async function send(chatJid, text) {
    try {
        const sock = getSock()
        if (!sock || typeof sock.sendMessage !== "function") return { sent: false, reason: "sem sock" }
        await sock.sendMessage(chatJid, { text })
        return { sent: true }
    } catch (e) {
        return { sent: false, error: e?.message || String(e) }
    }
}

/** Painel 36: o que existe de preset, como rodar, e os atalhos. */
export function floodPresetsMenuTexto() {
    const rc = getFloodRuntimeConfig()
    const atalhos = Object.entries(FLOOD_PRESET_COMMANDS).map(([c, a]) => `  ${c} → ${a}`)
    return [
        "🌊 FLOOD · PRESETS (load-test)",
        "",
        listPresetsTexto(),
        "",
        formatCustomPresetsTexto(),
        `• teto por job: ${FLOOD_PRESET_HARD_CAP.maxMessages} msg · mín ${FLOOD_PRESET_HARD_CAP.minInterval}ms · ${FLOOD_PRESET_HARD_CAP.maxConcurrency} por vez`,
        `• dry-run agora: ${rc.dryRun ? "LIGADO (nada sai)" : "⚠️ DESLIGADO (sai de verdade)"}`,
        `• allowlist: ${rc.allowlist.length} destino(s)${rc.allowlist.length ? "" : " → sem destino, todo job morre em ALLOWLIST_EMPTY"}`,
        "",
        "Rodar rapidinho (usa a allowlist como alvo, 1 msg por destino):",
        ...Object.keys(FLOOD_TEST_ACTION_PRESET).map(a => `  ${a.replace("flood_preset_", "").replace("_test", "")}test`),
        `  2/preset/<id>[/conteúdo]      ex: 2/preset/payment-test/Pagamento do pedido|25.90|BRL`,
        `  2/preset/${DEFAULT_SHOPPING_PRESET_ID}/Produto|SYZYGY SHOP|wa`,
        "",
        "Atalhos:",
        ...atalhos,
        "",
        "_nenhum destes caminhos cria um segundo executor: o envio é o executarFlood do AB7_"
    ].join("\n")
}

/** Overlay de payment a partir de "texto|25.90|BRL" (formato que já existia). */
export function paymentOverlayFromRest(rest) {
    const src = String(rest || "").trim()
    if (!src) return { ok: true, overlay: {} }
    const parts = src.split("|").map(s => s.trim())
    const text = parts[0]
    if (!text) return { ok: false, error: "TEXT_MISSING" }
    const amt = parseAmount(parts[1])
    if (!amt.ok) return { ok: false, error: amt.error, usage: amt.usage }
    const cur = parseCurrency(parts[2] || "BRL")
    if (!cur.ok) return { ok: false, error: cur.error, usage: cur.usage }
    return { ok: true, overlay: { text, amount: amt.value, currency: cur.value } }
}

/**
 * Overlay de shopping a partir de "texto|title|surface|id" — MESMAS regras do
 * wizard (index.js:parseShoppingOverlay), reimplementadas aqui porque o router não
 * pode importar o barrel que o exporta (ciclo ESM). 4 campos no máximo; surface
 * passada por normalizeSurface (o "4" do README do fork vira 3 com aviso do próprio
 * normalizador); qualquer outra coisa é texto livre, pipes inclusos.
 */
export function shoppingOverlayFromRest(rest) {
    const raw = String(rest || "").trim()
    const overlay = {}
    if (!raw || /^(0|default|padr[õo]o)$/i.test(raw)) return { ok: true, overlay, kind: "default" }
    const parts = raw.split("|").map(x => x.trim())
    if (parts.length >= 3 && /^(\d+|fb|ig|wa)$/i.test(parts[2])) {
        if (parts.length > 4) return { ok: false, error: "OVERLAY_TOO_MANY_FIELDS", message: "máximo 4 campos: texto|title|surface|id" }
        overlay.text = parts[0]
        if (parts[1]) overlay.title = parts[1]
        const shop = {}
        try {
            const r = normalizeSurface(parts[2])
            if (r && r.surface != null) shop.surface = r.surface
        } catch (e) {
            return { ok: false, error: e.code || "SURFACE_INVALID", message: e.message }
        }
        if (parts[3]) shop.id = parts[3]
        if (Object.keys(shop).length) overlay.shop = shop
        return { ok: true, overlay, kind: "spec" }
    }
    overlay.text = raw
    return { ok: true, overlay, kind: "plain" }
}

async function runTestJob(chatJid, ownerKey, { presetId, rest = "", tipo = null, dryRun = null } = {}) {
    const alvo = getAllowlist()
    if (!alvo.length) {
        return send(chatJid, `⚠️ ALLOWLIST_EMPTY — nenhum destino liberado.\n\nUse 38 · Escolher grupos (1,3,5) do painel do dono, ou 41 para adicionar um JID.\nNada foi enviado.`)
    }
    let overlay = {}
    if (tipo === "payment") {
        const p = paymentOverlayFromRest(rest)
        if (!p.ok) return send(chatJid, `❌ ${p.error}\n${p.usage || "formato: texto|25.90|BRL"}`)
        overlay = p.overlay
    } else if (tipo === "shopping") {
        const s = shoppingOverlayFromRest(rest)
        if (!s.ok) return send(chatJid, `❌ ${s.error}\n${s.message || "formato: texto|title|surface|id (surface: 1/fb, 2/ig, 3/wa)"}`)
        overlay = s.overlay
    } else if (rest) {
        overlay = { text: rest }
    }

    const res = await runPresetJob({
        presetId,
        overlay,
        targets: alvo,
        qtd: 1,
        dryRun: dryRun == null ? (CONFIG.floodDryRun !== false) : !!dryRun
    })
    try {
        const { registrarAcao } = await import("../../services/historicoService.js")
        registrarAcao("flood_preset", {
            preset: presetId, dryRun: !!res.dryRun, ok: !!res.ok, sent: res.metrics?.sent,
            erro: res.error || undefined, via: "router"
        })
    } catch { /* histórico é opcional aqui */ }
    const rodape = res.dryRun
        ? "\n\n_DRY-RUN: nada saiu. Para o 1º envio real, desligue o 37 (e mantenha o 36 por perto)._"
        : ""
    return send(chatJid, `${formatPresetJobResult(res)}${rodape}`)
}

/**
 * Roteador público. Idempotente e sem estado próprio: os únicos estados criados
 * são os de digitação (38 · grupos), tratados em handlers/stateHandler.js.
 */
export async function floodRouter(chatJid, ownerKey, actionId, extra = {}) {
    if (actionId === "painel_flood_presets" || actionId === "flood_presets_menu") {
        return send(chatJid, floodPresetsMenuTexto())
    }
    if (actionId === "flood_kill_on" || actionId === "flood_kill_off") {
        if (!isOwner(ownerKey)) return send(chatJid, "❌ Apenas o dono mexe no kill switch.")
        const on = actionId === "flood_kill_on"
        setKillSwitch(on, { persist: true })
        if (on && currentJobInfo()) cancelRunningJob(KILL_SWITCH_REASON)
        return send(chatJid, `${on ? "🛑 FLOOD_KILL_SWITCH LIGADO" : "▶️ FLOOD_KILL_SWITCH desligado"}\n${on ? "Fila interrompida na fronteira do lote; novos jobs barrados." : "Novos jobs liberados (respeitando cooldown)."}\n\n${killSwitchStatusTexto()}`)
    }
    if (actionId === "cfg_flood_allowlist" || actionId === "flood_pick_groups") {
        const grupos = CONFIG.gruposAutorizados || []
        let t = `🛡️ ESCOLHER GRUPOS DO FLOOD (allowlist)\n\nDigite os números separados por vírgula:\n  1        → só o grupo 1\n  1,3,5    → três destinos\n  todos    → tudo que está autorizado\n  limpar   → fecha a porta (allowlist vazia)\n\n`
        t += grupos.length
            ? grupos.slice(0, 30).map((g, i) => `  ${i + 1} · ${maskJid(g)}`).join("\n")
            : "_nenhum grupo autorizado — autorize primeiro no painel (26)_"
        t += `\n\n_A allowlist é a porta de saída do flood: sem ela, TODO destino é barrado._\n(cancelar para sair)`
        setState(ownerKey, { action: "config_set_flood_allowlist_pick" })
        return send(chatJid, t)
    }
    const presetId = FLOOD_TEST_ACTION_PRESET[actionId]
    if (presetId) {
        return runTestJob(chatJid, ownerKey, { presetId, rest: extra.rest || "", tipo: presetId.includes("payment") ? "payment" : presetId.includes("shopping") ? "shopping" : null })
    }
    if (actionId === "run") {
        // 2/preset/<id>[/conteúdo] — id livre (built-in ou custom)
        const id = String(extra.presetId || "").trim().toLowerCase()
        if (!id) return send(chatJid, `❌ 2/preset/<nome>\n${listPresetsTexto()}\n\n${listShoppingPresetsTexto()}`)
        const tipo = /payment/.test(id) ? "payment" : /shop|loja/.test(id) ? "shopping" : null
        return runTestJob(chatJid, ownerKey, { presetId: id, rest: extra.rest || extra.paymentArgs || extra.shoppingArgs || "", tipo })
    }
    return send(chatJid, `⚠️ ação de flood desconhecida: ${actionId}\n\n${floodPresetsMenuTexto()}`)
}

export default floodRouter
