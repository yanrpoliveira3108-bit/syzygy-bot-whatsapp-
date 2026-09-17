// menus/configMenu.js
// [v46] Config REORGANIZADA em duas seções separadas:
//   👤 CONFIGURAÇÕES (ADMs do bot)  → números 1-11
//   👑 COMANDOS DO DONO (restrito)  → números 12-46  (36-45 = 🛡️ FLOOD · CONTROLES)
// O parser rápido (5/NN) usa CONFIG_OPCOES dinamicamente — renumerar aqui
// atualiza os comandos rápidos automaticamente.

import { getSock } from "../connection/socket.js"
import { CONFIG, FLOOD_MODOS, uiModoEfetivo } from "../utils/config.js"
import { setState } from "../utils/stateManager.js"
import { ok, err } from "../utils/terminalUI.js"
import { safeSendMessage } from "../services/groupService.js"
import { VIEW_ONCE_CONFIG } from "../features/viewOnce/config.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { criarBotao } from "../utils/botoes.js"

// [v55] Rótulos das opções para a interface interativa — MESMOS títulos do
// menu TXT (paridade 1:1 com CONFIG_OPCOES: toda opção tem row, toda row tem
// id roteado — o E2E v55 valida isso). O modo TXT continua com a arte original.
export const CONFIG_ROTULOS_ADM = [
    ["1", "Ver proprietario"], ["2", "Numero conectado"], ["3", "Status da conexao"],
    ["4", "Historico"], ["5", "Relatorio completo"], ["6", "Agendamentos"],
    ["7", "Listar ADMs do bot"], ["8", "Listar grupos autz"], ["9", "Listar donos"],
    ["10", "Marcar fantasma"], ["11", "Voltar ao menu"]
]
export const CONFIG_ROTULOS_DONO = [
    ["12", "Criar preset"], ["13", "Apagar preset"], ["14", "Imagem do menu"],
    ["15", "Link de divulgacao"], ["16", "Ler mais"], ["17", "Modo do flood"],
    ["18", "Intervalo do flood"], ["19", "Lote do flood"], ["20", "Auto-limpeza"],
    ["21", "Anti-takeover"], ["22", "Limpar fantasmas"], ["23", "Limpar agendamentos"],
    ["24", "+ Add ADM do bot"], ["25", "- Remover ADM"], ["26", "+ Add grupo autz"],
    ["27", "- Remover grupo"], ["28", "+ Add dono extra"], ["29", "- Remover dono"],
    ["30", "ViewOnce ON/OFF"], ["31", "VO -> grupos"], ["32", "VO -> owner"],
    ["33", "VO -> ADMs"], ["34", "VO salvar"],
    // [FLOOD v2] controles da feature features/flood/ — a AB7 tinha só o prefixo
    // "loja:" no wizard, nada aparecia no menu. 36-45 aqui; voltar virou 46.
    ["36", "Kill switch do flood"], ["37", "Dry-run do flood"], ["38", "Modo teste (payment/loja)"],
    ["39", "Allowlist: listar"], ["40", "Allowlist: + grupo"], ["41", "Allowlist: - grupo"],
    ["42", "Velocidade do flood (presets)"], ["43", "Presets: listar"], ["44", "Loja: preview do card"],
    ["45", "Raio-X do flood"], ["46", "Voltar ao menu"]
]

// [v55] Renderer interativo do painel de configuração — MESMA fonte
// (CONFIG_OPCOES) e MESMO estado (config_menu: digitar o número continua
// funcionando em qualquer modo). Exclusivo com o TXT: quem decide é o
// uiMode do config.json (decisão no topo de enviarSubmenuConfig).
async function enviarConfigInterativo(jid, ownerKey, modo = "adm") {
    const dono = modo === "dono"
    const rotulos = dono ? CONFIG_ROTULOS_DONO : CONFIG_ROTULOS_ADM
    const rows = rotulos.map(([n, t]) => ({
        title: `${n.padStart(2, "0")} ${t}`,
        description: "",
        id: CONFIG_OPCOES[n]
    }))
    // [FLOOD v2] com 36-46 a lista passou de 10 linhas → o single_select do
    // WhatsApp corta section acima de 10; dividimos em páginas de 10.
    const sections = []
    for (let i = 0; i < rows.length; i += 10) {
        sections.push({
            title: `${dono ? "👑 DONO" : "👤 CONFIG"} ${rotulos[i][0]}-${rotulos[Math.min(i + 9, rotulos.length - 1)][0]}`,
            rows: rows.slice(i, i + 10)
        })
    }
    const botoes = [criarBotao("single_select", {
        title: dono ? " DONO" : " CONFIG",
        text: dono ? "Comandos do dono (12-46)" : "Configuracoes (1-11)",
        buttonText: " SELECIONAR",
        sections
    })]
    const texto = dono
        ? `👑 𝗖𝗢𝗠𝗔𝗡𝗗𝗢𝗦 𝗗𝗢 𝗗𝗢𝗡𝗢
🔒 acesso restrito ao dono

_Toque em uma opção (12-46) ou digite o número_`
        : `⚙️ 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗖̧𝗢𝗘𝗦
👤 ADMs do bot podem usar

_Toque em uma opção (1-11) ou digite o número_`
    if (ownerKey) setState(ownerKey, { action: "config_menu" })
    await enviarMensagemInterativa(jid, texto, botoes)
}

// Mapa único de opções (a UI é que separa por faixa de número)
export const CONFIG_OPCOES = {
    "0": "abrir_painel",
    // ── 👤 ADM (1-11) ──────────────────────────────────────
    "1": "cfg_owner",
    "2": "cfg_number",
    "3": "cfg_status",
    "4": "cfg_historico",
    "5": "cfg_relatorio",
    "6": "cfg_agendamentos",
    "7": "cfg_list_users",
    "8": "cfg_list_groups",
    "9": "cfg_list_owners",
    "10": "cfg_fantasma",
    "11": "abrir_painel",
    // ── 👑 DONO (12-46) ────────────────────────────────────
    "12": "cfg_criar_preset",
    "13": "cfg_apagar_preset",
    "14": "cfg_menuImage",
    "15": "cfg_link",
    "16": "cfg_ler_mais",
    "17": "cfg_flood_modo",
    "18": "cfg_flood_interval",
    "19": "cfg_flood_lote",
    "20": "cfg_autolimpeza",
    "21": "cfg_antitakeover",
    "22": "cfg_limpar_fantasmas",
    "23": "cfg_limpar_agendamentos",
    "24": "cfg_add_user",
    "25": "cfg_remove_user",
    "26": "cfg_add_group",
    "27": "cfg_remove_group",
    "28": "cfg_add_owner",
    "29": "cfg_remove_owner",
    "30": "cfg_viewonce_toggle",
    "31": "cfg_viewonce_groups",
    "32": "cfg_viewonce_owner",
    "33": "cfg_viewonce_admins",
    "34": "cfg_viewonce_save",
    "35": "abrir_painel",
    // ── 🛡️ FLOOD · CONTROLES (36-45) ───────────────────────
    "36": "cfg_flood_kill",
    "37": "cfg_flood_dryrun",
    "38": "cfg_flood_testmode",
    "39": "cfg_flood_allowlist",
    "40": "cfg_flood_allowlist_add",
    "41": "cfg_flood_allowlist_remove",
    "42": "cfg_flood_speed",
    "43": "cfg_flood_presets",
    "44": "cfg_flood_loja",
    "45": "cfg_flood_xray",
    "46": "abrir_painel"
}

export async function enviarSubmenuConfig(jid, ownerKey, modo = "adm") {
    const sock = getSock()
    // [v55] DECISÃO CENTRAL DE MODO: buttons → SOMENTE interativo;
    // text/txt/bloks → SOMENTE o TXT original (nunca os dois).
    if (uiModoEfetivo() === "buttons") {
        return enviarConfigInterativo(jid, ownerKey, modo)
    }
    if (ownerKey) setState(ownerKey, { action: "config_menu" })

    const qtdUsers = (CONFIG.usuariosAutorizados || []).length + (CONFIG.lidsAutorizados || []).length
    const qtdGroups = (CONFIG.gruposAutorizados || []).length
    const qtdOwners = (CONFIG.donosExtras || []).length
    const floodModo = CONFIG.floodModo || "normal"
    const modoInfo = FLOOD_MODOS[floodModo] ? `${FLOOD_MODOS[floodModo].intervalo}ms/l${FLOOD_MODOS[floodModo].lote}` : ""

    if (modo === "dono") {
        const voEnabled = VIEW_ONCE_CONFIG.enabled ? "LIGADO" : "DESLIGADO"
        const voGroups = VIEW_ONCE_CONFIG.sendToAuthorizedGroups ? "SIM" : "NAO"
        const voOwner = VIEW_ONCE_CONFIG.sendToOwner ? "SIM" : "NAO"
        const voAdmins = VIEW_ONCE_CONFIG.sendToAdmins ? "SIM" : "NAO"
        const voSave = VIEW_ONCE_CONFIG.saveToDisk ? "DISCO (apaga depois)" : "SÓ BUFFER"

        let t = `╭━━「 👑 𝗖𝗢𝗠𝗔𝗡𝗗𝗢𝗦 𝗗𝗢 𝗗𝗢𝗡𝗢 」━━\n`
        t += `┃ 🔒 acesso restrito ao dono\n`
        t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
        t += `╭─〔 🎨 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 〕──────────\n`
        t += `┃ ⬥ 12 · Criar preset\n`
        t += `┃ ⬥ 13 · Apagar preset\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🖼️ 𝗔𝗣𝗔𝗥Ê𝗡𝗖𝗜𝗔 〕──────────\n`
        t += `┃ ⬥ 14 · Imagem do menu\n`
        t += `┃ ⬥ 15 · Link/numero divulgação\n`
        t += `┃      atual: ${CONFIG.linkDivulgacao ? "definido" : "(nenhum)"}\n`
        t += `┃ ⬥ 16 · 📖 Ler mais: ${CONFIG.lerMais ? "LIGADO" : "DESLIGADO"}\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🌊 𝗙𝗟𝗢𝗢𝗗 〕───────────────\n`
        t += `┃ ⬥ 17 · Modo: ${floodModo} (${modoInfo})\n`
        t += `┃ ⬥ 18 · Intervalo: ${CONFIG.floodInterval}ms\n`
        t += `┃ ⬥ 19 · Lote: ${CONFIG.floodLote}\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🛡️ 𝗦𝗜𝗦𝗧𝗘𝗠𝗔 〕─────────────\n`
        t += `┃ ⬥ 20 · Auto-limpeza: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}\n`
        t += `┃ ⬥ 21 · Anti-takeover: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}\n`
        t += `┃ ⬥ 22 · Limpar grupos fantasmas\n`
        t += `┃ ⬥ 23 · Limpar agendamentos concl.\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 🔐 𝗣𝗘𝗥𝗠𝗜𝗦𝗦𝗢𝗘𝗦 〕───────────\n`
        t += `┃ ⬥ 24 · ➕ Add ADM do bot [${qtdUsers}]\n`
        t += `┃ ⬥ 25 · ➖ Remover ADM do bot\n`
        t += `┃ ⬥ 26 · ➕ Add grupo autorizado [${qtdGroups}]\n`
        t += `┃ ⬥ 27 · ➖ Remover grupo autorizado\n`
        t += `┃ ⬥ 28 · ➕ Add dono extra [${qtdOwners}]\n`
        t += `┃ ⬥ 29 · ➖ Remover dono extra\n`
        t += `╰───────────────────────\n`
        t += `╭─〔 👁️ 𝗩𝗜𝗘𝗪𝗢𝗡𝗖𝗘 〕─────────────\n`
        t += `┃ ⬥ 30 · ViewOnce: ${voEnabled}\n`
        t += `┃ ⬥ 31 · → Grupos autz: ${voGroups}\n`
        t += `┃ ⬥ 32 · → Owner: ${voOwner}\n`
        t += `┃ ⬥ 33 · → ADMs: ${voAdmins}\n`
        t += `┃ ⬥ 34 · Salvar: ${voSave}\n`
        t += `╰───────────────────────\n`
        // ── 🛡️ FLOOD · CONTROLES — lidos da MESMA fonte do flood (features/flood/)
        let fx = null, fxErro = null
        try { fx = await import("../features/flood/index.js") } catch (e) { fxErro = e.message }
        const on = fx ? fx.isKillSwitchOn() : false
        const nAllow = fx ? fx.getAllowlist().length : 0
        const nPresets = fx ? fx.listPresets().length : 0
        const nCustom = fx ? (CONFIG.floodCustomPresets || []).length : 0
        const spd = `${CONFIG.floodModo || "normal"} (${CONFIG.floodInterval || "?"}ms/l${CONFIG.floodLote || "?"})`
        t += `╭─〔 🛡️ 𝗙𝗟𝗢𝗢𝗗 · 𝗖𝗢𝗡𝗧𝗥𝗢𝗟𝗘𝗦 〕─────\n`
        if (fxErro) t += `┃ ⚠️ feature flood indisponível: ${fxErro}\n`
        t += `┃ ⬥ 36 · ${on ? "▶️ Liberar" : "🛑 Bloquear"} flood (kill switch)\n`
        t += `┃      atual: ${on ? "BLOQUEADO" : "liberado"}\n`
        t += `┃ ⬥ 37 · 🧪 Dry-run: ${CONFIG.floodDryRun === true ? "LIGADO (não envia)" : "DESLIGADO (envia de verdade)"}\n`
        t += `┃ ⬥ 38 · 🎯 Modo teste: ${CONFIG.floodTestMode !== false ? "LIGADO" : "DESLIGADO"}\n`
        t += `┃      ⚠️ payment/loja só disparam com ele LIGADO\n`
        t += `┃ ⬥ 39 · 🛡️ Allowlist de destino [${nAllow}]\n`
        t += `┃ ⬥ 40 · ➕ Add grupo na allowlist\n`
        t += `┃ ⬥ 41 · ➖ Remover da allowlist\n`
        t += `┃ ⬥ 42 · 🚀 Velocidade ( presets )\n`
        t += `┃ ⬥ 43 · 📦 Presets [${nPresets} + ${nCustom} custom]\n`
        t += `┃ ⬥ 44 · 🛍️ Loja: preview do card (não envia)\n`
        t += `┃ ⬥ 45 · 🩺 Raio-X do flood · velocidade atual: ${spd}\n`
        t += `╰───────────────────────\n`
        t += ` 46 · ⬅️ Voltar ao menu\n\n`
        t += `_📖 LIGADO: mensagens dobram após o título\n(⚡ SYZYGY) via caracteres invisíveis; o corte\né do app do WhatsApp e pode não dobrar no\niPhone. DESLIGADO: mostra tudo inteiro._\n\n`
        t += `_Digite o número (12-46) · cancelar = sair_\n`
        t += `▬▬▬▬▬▬▬▬▬▬▬▬▬\n⚔️ SYZYGY`
        await safeSendMessage(jid, { text: t }, 0)
        return
    }

    // modo "adm" — configurações que ADMs do bot podem usar
    let t = `╭━━「 ⚙️ 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗖̧𝗢𝗘𝗦 」━━━\n`
    t += `┃ 👤 ADMs do bot podem usar\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += ` 1 · 👤 Ver proprietário\n`
    t += ` 2 · 📱 Número conectado\n`
    t += ` 3 · 📡 Status da conexão\n`
    t += ` 4 · 📜 Histórico (últimas ações)\n`
    t += ` 5 · 📊 Relatório completo\n`
    t += ` 6 · ⏰ Agendamentos\n`
    t += ` 7 · 👤 Listar ADMs do bot [${qtdUsers}]\n`
    t += ` 8 · 👥 Listar grupos autorizados [${qtdGroups}]\n`
    t += ` 9 · 👑 Listar donos [${qtdOwners}]\n`
    t += `10 · 👻 Marcar fantasma: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}\n`
    t += `11 · ⬅️ Voltar ao menu\n\n`
    t += `_Comandos de DONO: opção 5 do menu_\n`
    t += `_Digite o número · cancelar = sair_\n`
    t += `▬▬▬▬▬▬▬▬▬▬▬▬▬\n⚔️ SYZYGY`
    await safeSendMessage(jid, { text: t }, 0)
}

// [v45] Painel do dono = seção 👑 da config (números 12-46 desde os controles do flood)
export async function enviarPainelDono(jid, ownerKey) {
    return enviarSubmenuConfig(jid, ownerKey, "dono")
}
