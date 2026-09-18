// features/flood/router.js
// [v53 · AB7] Fachada de comandos da arena 01a0aaae, reconstruída sobre a API da
// AB7 e SEM os três conceitos que saíram do projeto: allowlist, dry-run e
// preview. O que mudou de propósito:
//   • Não existe wizard paralelo: os atalhos (`paymenttest`, `texttest`, …)
//     disparam pelo MESMO runPresetJob que chama o executarFlood clássico
//     (services/groupService.js). Nada aqui chama sock.sendMessage() para mandar
//     flood, e nada aqui cria segundo executor.
//   • Alvo = a ÚLTIMA seleção feita no painel do flood (o mesmo cache que o flood
//     de texto usa). Sem seleção feita o atalho recusa e ensina o caminho — não
//     amplia nada sozinho, não "lembra" de outro lugar.
//   • Não há ensaio: o que sai, sai. A cerca é o teto (clampJobQtd), o kill
//     switch e o cooldown por alvo.
//   • payment é um TIPO do flood (preset type:"payment"), não uma segunda porta.

import { getSock } from "../../connection/socket.js"
import { isOwner } from "../../utils/permissions.js"
import { setState } from "../../utils/stateManager.js"
import { CONFIG, FLOOD_TIPOS, floodMaxEfetivo } from "../../utils/config.js"
import { runPresetJob, formatPresetJobResult, currentJobInfo, cancelRunningJob } from "./presetEngine.js"
import { setKillSwitch, killSwitchStatusTexto, KILL_SWITCH_REASON } from "./killswitch.js"
import { listPresetsTexto } from "./presets/index.js"
import { formatCustomPresetsTexto } from "./customStore.js"
import { getFloodSelection, resumoAlvosTexto } from "./targets.js"
import { parseAmount, parseCurrency } from "./payment.js"
import { getFloodRuntimeConfig, FLOOD_PRESET_HARD_CAP, floodTipoLabel } from "./config.js"
import { LOGO, moldura, separador, estado } from "../../utils/menuArt.js"

/**
 * Nomes de comando público → ação. Fonte única dos atalhos de texto
 * (commands/commandMap.js) e da ajuda: renumerar/renomear AQUI, não lá.
 */
export const FLOOD_PRESET_COMMANDS = {
    floodpresets: "painel_flood_presets",
    floodpreset: "painel_flood_presets",
    texttest: "flood_preset_text_test",
    mentiontest: "flood_preset_mention_test",
    mediatest: "flood_preset_media_test",
    paymenttest: "flood_preset_payment_test",
    pagamento: "painel_flood_pagamento",
    floodalvos: "cfg_flood_targets",
    floodstop: "flood_kill_on",
    floodstart: "flood_kill_off"
}

/** Ação de atalho → preset que ela roda (null = painel/toggle, não roda job). */
export const FLOOD_TEST_ACTION_PRESET = {
    flood_preset_text_test: "text-test",
    flood_preset_mention_test: "mention-test",
    flood_preset_media_test: "media-test",
    flood_preset_payment_test: "payment-test"
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

/** Painel 35 (⚔️ flood presets): o que existe, como rodar, os tetos e os alvos. */
export function floodPresetsMenuTexto() {
    const rc = getFloodRuntimeConfig()
    const atalhos = Object.entries(FLOOD_PRESET_COMMANDS).map(([c, a]) => `┃ ${c} ⬥ ${a}`)
    const alvos = resumoAlvosTexto(getFloodSelection())
    return [
        moldura(`${LOGO.fraktur} · 🌊 FLOOD · PRESETS`),
        listPresetsTexto(),
        formatCustomPresetsTexto(),
        separador(9, "flores"),
        `┃ teto/job: ${FLOOD_PRESET_HARD_CAP.maxMessages} msg · mín ${FLOOD_PRESET_HARD_CAP.minInterval}ms · ${FLOOD_PRESET_HARD_CAP.maxConcurrency} por vez`,
        `┃ flood normal: até ${floodMaxEfetivo()} msg/alvo (config.json#floodMaxMensagens)`,
        `┃ kill switch: ${estado(rc.killSwitch, { on: "🛑 ATIVO", off: "liberado" })} · tipo padrão: ${floodTipoLabel(rc.tipo)}`,
        `┃ alvos atuais: ${alvos}`,
        separador(9, "trilho"),
        `┃ rodar agora (usa a seleção do painel 2):`,
        `┃ ${"  paymenttest  ·  texttest  ·  mentiontest  ·  mediatest"}`,
        `┃ 2/preset/<id>[/conteúdo]`,
        `┃   ex: 2/preset/payment-test/Pagamento do pedido|25.90|BRL`,
        `┃ alvo avulso: 36>1,3,5  (números da lista de grupos)`,
        separador(9, "neve"),
        `┃ atalhos:`,
        ...atalhos,
        `┃ nenhum destes caminhos cria um segundo executor: o envio é o`,
        `┃ executarFlood do AB7 (services/groupService.js) — um sock.sendMessage só.`
    ].join("\n")
}

/** Overlay de payment a partir de "texto|25.90|BRL". */
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
 * Alvos de um atalho: a seleção corrente do operador. Sem seleção, a resposta
 * ensina o caminho em vez de atirar em tudo que o bot conhece.
 */
function resolverAlvos(ownerKey) {
    const alvos = getFloodSelection(ownerKey).length ? getFloodSelection(ownerKey) : getFloodSelection()
    if (!alvos.length) {
        return {
            ok: false,
            message: `⚠️ NENHUM_ALVO\nNada foi enviado: o flood só atira em alvo escolhido por você.\n\nUse 36 no painel do dono (ou 2 → flood no menu) e digite os números dos grupos, ex: 1,3,5.`
        }
    }
    return { ok: true, alvos }
}

async function runTestJob(chatJid, ownerKey, { presetId, rest = "", tipo = null, qtd = 1 } = {}) {
    const alvos = resolverAlvos(ownerKey)
    if (!alvos.ok) return send(chatJid, alvos.message)

    let overlay = {}
    if (tipo === "payment") {
        const p = paymentOverlayFromRest(rest)
        if (!p.ok) return send(chatJid, `❌ ${p.error}\n${p.usage || "formato: texto|25.90|BRL"}`)
        overlay = p.overlay
    } else if (rest) {
        overlay = { text: rest }
    }

    const res = await runPresetJob({ presetId, overlay, targets: alvos.alvos, qtd })
    try {
        const { registrarAcao } = await import("../../services/historicoService.js")
        registrarAcao("flood_preset", {
            preset: presetId, ok: !!res.ok, sent: res.metrics?.sent,
            alvos: alvos.alvos.length, erro: res.error || undefined, via: "router"
        })
    } catch { /* histórico é opcional aqui */ }
    return send(chatJid, formatPresetJobResult(res))
}

/**
 * Roteador público. Idempotente e sem estado próprio: os únicos estados criados
 * são os de digitação (36 · grupos), tratados em handlers/stateHandler.js.
 */
export async function floodRouter(chatJid, ownerKey, actionId, extra = {}) {
    if (actionId === "painel_flood_presets" || actionId === "flood_presets_menu") {
        return send(chatJid, floodPresetsMenuTexto())
    }
    if (actionId === "painel_flood_pagamento" || actionId === "cfg_flood_tipo") {
        // payment como TIPO padrão do flood: o painel 2 abre já no modo escolha
        // (texto/pagamento) e o laço continua o MESMO. 40 no painel do dono alterna.
        const atual = CONFIG.floodTipo === FLOOD_TIPOS.PAGAMENTO ? FLOOD_TIPOS.PAGAMENTO : FLOOD_TIPOS.TEXTO
        const proximo = actionId === "cfg_flood_tipo" && extra.tipo
            ? (extra.tipo === "payment" || extra.tipo === "pagamento" ? FLOOD_TIPOS.PAGAMENTO : FLOOD_TIPOS.TEXTO)
            : (atual === FLOOD_TIPOS.PAGAMENTO ? FLOOD_TIPOS.TEXTO : FLOOD_TIPOS.PAGAMENTO)
        CONFIG.floodTipo = proximo
        try { const { salvarConfig } = await import("../../utils/config.js"); salvarConfig() } catch { /* config salvo na próxima escrita */ }
        const msg = proximo === FLOOD_TIPOS.PAGAMENTO
            ? `💳 tipo padrão do flood: ${floodTipoLabel(FLOOD_TIPOS.PAGAMENTO)}\n\nAbra 2 · FLOOD: o painel já pede o valor/moeda do pagamento e usa o mesmo laço, o mesmo ritmo e os mesmos alvos do flood de texto.`
            : `📝 tipo padrão do flood: ${floodTipoLabel(FLOOD_TIPOS.TEXTO)}`
        return send(chatJid, msg)
    }
    if (actionId === "flood_kill_on" || actionId === "flood_kill_off") {
        if (!isOwner(ownerKey)) return send(chatJid, "❌ Apenas o dono mexe no kill switch.")
        const on = actionId === "flood_kill_on"
        setKillSwitch(on, { persist: true })
        if (on && currentJobInfo()) cancelRunningJob(KILL_SWITCH_REASON)
        return send(chatJid, `${on ? "🛑 FLOOD_KILL_SWITCH LIGADO" : "▶️ FLOOD_KILL_SWITCH desligado"}\n${on ? "Fila interrompida na fronteira do lote; novos jobs barrados." : "Novos jobs liberados (respeitando cooldown)."}\n\n${killSwitchStatusTexto()}`)
    }
    if (actionId === "cfg_flood_targets") {
        // Mesma máquina do flood normal: listarGruposInterativo monta o cache
        // numerado e stateHandler resolve "1,3,5" / "pag 2". Aqui só trocamos o
        // destino da seleção (waiting_flood_targets em vez de "waiting_flood_message").
        setState(ownerKey, { action: "waiting_group", next: "waiting_flood_targets", origem: "painel_dono" })
        try {
            const { listarGruposInterativo } = await import("../../menus/groupMenu.js")
            const cache = await listarGruposInterativo(chatJid, extra.pagina || 1)
            if (!cache || !Object.keys(cache).length) {
                return send(chatJid, `⚠️ nenhum grupo em cache\nMande o bot entrar num grupo (ou #glist) e tente 36 de novo.`)
            }
            const alvos = resumoAlvosTexto(getFloodSelection(ownerKey))
            return send(chatJid, `${moldura(`${LOGO.fraktur} · 🎯 ALVOS DO FLOOD`)}\n┃ escolha os números: 1 · 1,3,5 · todos · limpar\n┃ alvos atuais: ${alvos}\n${separador(9, "flores")}\n┃ grupos PROTEGIDOS (autorizados) são ignorados: o alvo é\n┃ sempre escolha sua, nunca ampliação automática.`)
        } catch (e) {
            return send(chatJid, `❌ não consegui listar os grupos: ${e?.message || e}`)
        }
    }
    // [v53] o preset de loja saiu do catálogo, mas o atalho antigo ainda chega pelo
    // painel de comandos e pelos números antigos: responder "opção removida" é melhor
    // que um "isso não é comando do flood" genérico — e, sobretudo, não executa nada.
    if (/^flood_preset_shopping/i.test(actionId)
        || (actionId === "run" && /^shopping/i.test(String(extra.presetId || "")))) {
        return send(chatJid, "🛍️ Preview de loja (shopping test) saiu da v53. Os tipos de preset agora são texto, menção, mídia e pagamento — use 2 → tipo → conteúdo.")
    }
    const presetId = FLOOD_TEST_ACTION_PRESET[actionId]
    if (presetId) {
        const tipo = presetId.includes("payment") ? "payment" : null
        return runTestJob(chatJid, ownerKey, { presetId, rest: extra.rest || "", tipo })
    }
    if (actionId === "run") {
        // 2/preset/<id>[/conteúdo] — id livre (built-in ou custom)
        const id = String(extra.presetId || "").trim().toLowerCase()
        if (!id) return send(chatJid, `❌ 2/preset/<nome>\n\n${listPresetsTexto()}`)
        const tipo = /payment|pagamento/.test(id) ? "payment" : null
        return runTestJob(chatJid, ownerKey, { presetId: id, rest: extra.rest || extra.paymentArgs || "", tipo })
    }
    return send(chatJid, `⚠️ ação de flood desconhecida: ${actionId}\n\n${floodPresetsMenuTexto()}`)
}

export default floodRouter
