// menus/configMenu.js
// [v53 · AB7] Painéis de configuração redesenhados sobre utils/menuArt.js e com a
// numeração compactada depois que allowlist, dry-run, modo-teste e preview de
// loja saíram do projeto:
//   👤 CONFIGURAÇÕES (ADMs do bot)  → 1-11
//   👑 COMANDOS DO DONO (restrito)   → 12-41
// Os atalhos rápidos (5/NN e 6/NN) são derivados de CONFIG_OPCOES: renumerar
// AQUI já atualiza o parser de texto, sem segunda tabela para manter em dia.
//
// Tabela antiga → nova (para quem já tinha decorado):
//   36 Flood presets → 35 · 38 Escolher grupos → 36 · 39 Kill switch → 37
//   43 Velocidade    → 38 · 46 Raio-X           → 39 · 47 Voltar     → 41
//   37 Dry-run, 40/41/42 Allowlist, 44 Modo teste, 45 Preview loja → removidos
//   40 Tipo do flood (texto/pagamento) → NOVO

import { getSock } from "../connection/socket.js"
import { CONFIG, FLOOD_MODOS, FLOOD_TIPOS, uiModoEfetivo } from "../utils/config.js"
import { setState } from "../utils/stateManager.js"
import { safeSendMessage } from "../services/groupService.js"
import { VIEW_ONCE_CONFIG } from "../features/viewOnce/config.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { criarBotao } from "../utils/botoes.js"
import { LOGO, LOGO_PRINCIPAL, moldura, separador, opcao, bloco, rodape, estado } from "../utils/menuArt.js"

// ─── Rótulos (fonte única dos dois modos de UI) ─────────────────────────────
// Paridade 1:1 com CONFIG_OPCOES: toda opção tem rótulo, todo rótulo tem id
// roteado — features/flood/tests-menu.js é quem fiscaliza isto.
export const CONFIG_ROTULOS_ADM = [
    ["1", "👤 Ver proprietário"], ["2", "📱 Número conectado"], ["3", "📡 Status da conexão"],
    ["4", "📜 Histórico"], ["5", "📊 Relatório completo"], ["6", "⏰ Agendamentos"],
    ["7", "👥 Listar ADMs do bot"], ["8", "🧩 Listar grupos autorizados"], ["9", "👑 Listar donos"],
    ["10", "👻 Marcar fantasma"], ["11", "⬅️ Voltar ao menu"]
]
export const CONFIG_ROTULOS_DONO = [
    ["12", "🎨 Criar preset"], ["13", "🗑️ Apagar preset"],
    ["14", "🖼️ Imagem do menu"], ["15", "🔗 Link de divulgação"], ["16", "📖 Ler mais"],
    ["17", "🌊 Modo do flood (velocidade)"], ["18", "⏱️ Intervalo do flood"], ["19", "📦 Lote do flood"],
    ["20", "🧹 Auto-limpeza"], ["21", "🛡️ Anti-takeover"], ["22", "👻 Limpar fantasmas"], ["23", "🗓️ Limpar agendamentos"],
    ["24", "➕ Add ADM do bot"], ["25", "➖ Remover ADM"],
    ["26", "➕ Add grupo autorizado"], ["27", "➖ Remover grupo autorizado"],
    ["28", "➕ Add dono extra"], ["29", "➖ Remover dono extra"],
    ["30", "👁️ ViewOnce ON/OFF"], ["31", "👁️ VO → grupos"], ["32", "👁️ VO → dono"],
    ["33", "👁️ VO → ADMs"], ["34", "💾 VO salvar em disco"],
    ["35", "🌊 Flood · presets (load-test)"], ["36", "🎯 Flood · escolher grupos (1,3,5)"],
    ["37", "🛑 Flood · kill switch"], ["38", "🚀 Flood · velocidade dos presets"],
    ["39", "🩺 Flood · raio-X do job"], ["40", "💳 Flood · tipo padrão (texto/pagamento)"],
    ["41", "⬅️ Voltar ao menu"]
]

/** Seções do painel do dono (só estética; a numeração vem de CONFIG_OPCOES). */
export const CONFIG_SECOES_DONO = [
    { titulo: "🎨 PRESETS", numeros: ["12", "13"] },
    { titulo: "🖼️ APARÊNCIA", numeros: ["14", "15", "16"] },
    { titulo: "🌊 FLOOD", numeros: ["17", "18", "19"] },
    { titulo: "🧠 SISTEMA", numeros: ["20", "21", "22", "23"] },
    { titulo: "🔐 PERMISSÕES", numeros: ["24", "25", "26", "27", "28", "29"] },
    { titulo: "👁️ VIEW-ONCE", numeros: ["30", "31", "32", "33", "34"] },
    { titulo: "⚔️ FLOOD · CONTROLE", numeros: ["35", "36", "37", "38", "39", "40", "41"] }
]

/** Mapa único de opções (a UI é quem separa por faixa de número). */
export const CONFIG_OPCOES = {
    "0": "abrir_painel",
    // ── 👤 ADM (1-11) ──
    "1": "cfg_owner", "2": "cfg_number", "3": "cfg_status", "4": "cfg_historico",
    "5": "cfg_relatorio", "6": "cfg_agendamentos", "7": "cfg_list_users", "8": "cfg_list_groups",
    "9": "cfg_list_owners", "10": "cfg_fantasma", "11": "abrir_painel",
    // ── 👑 DONO (12-41) ──
    "12": "cfg_criar_preset", "13": "cfg_apagar_preset", "14": "cfg_menuImage", "15": "cfg_link",
    "16": "cfg_ler_mais", "17": "cfg_flood_modo", "18": "cfg_flood_interval", "19": "cfg_flood_lote",
    "20": "cfg_autolimpeza", "21": "cfg_antitakeover", "22": "cfg_limpar_fantasmas",
    "23": "cfg_limpar_agendamentos",
    "24": "cfg_add_user", "25": "cfg_remove_user", "26": "cfg_add_group", "27": "cfg_remove_group",
    "28": "cfg_add_owner", "29": "cfg_remove_owner",
    "30": "cfg_viewonce_toggle", "31": "cfg_viewonce_groups", "32": "cfg_viewonce_owner",
    "33": "cfg_viewonce_admins", "34": "cfg_viewonce_save",
    // ── ⚔️ FLOOD · CONTROLE (35-41) ──
    "35": "painel_flood_presets", "36": "cfg_flood_targets", "37": "cfg_flood_kill",
    "38": "cfg_flood_speed", "39": "cfg_flood_xray", "40": "cfg_flood_tipo", "41": "abrir_painel"
}

/**
 * Números que existiam até a v52 e deixaram de existir (dry-run, allowlist,
 * modo-teste, preview de loja, "voltar" em 47). O roteador responde em vez de
 * ignorar — número fantasma silencioso é o que faz o usuário achar que o bot
 * quebrou.
 */
export const OPCOES_REMOVIDAS = ["42", "43", "44", "45", "46", "47"]

// ─── Estado mostrado nas linhas (lido das mesmas fontes do flood) ────────────
async function estadoFlood() {
    let fx = null, erro = null
    try { fx = await import("../features/flood/index.js") } catch (e) { erro = e.message }
    const modo = CONFIG.floodModo || "normal"
    const mi = FLOOD_MODOS[modo]
    return {
        fx, erro,
        kill: fx ? fx.isKillSwitchOn() : false,
        presets: fx ? fx.listPresets().length : 0,
        custom: fx ? fx.listCustomPresets().length : 0,
        alvos: (fx && fx.getFloodSelection) ? fx.getFloodSelection() : [],
        tipo: CONFIG.floodTipo === FLOOD_TIPOS.PAGAMENTO ? "💳 pagamento" : "📝 texto",
        // ritmo EFETIVO (o que o laço realmente usa), não o default do modo: o dono
        // ajusta em 18/19 e a linha do painel tem que acompanhar.
        velocidade: (() => {
            const itv = Number.isFinite(+CONFIG.floodInterval) && +CONFIG.floodInterval > 0 ? +CONFIG.floodInterval : (mi?.intervalo ?? null)
            const lt = Number.isFinite(+CONFIG.floodLote) && +CONFIG.floodLote > 0 ? +CONFIG.floodLote : (mi?.lote ?? null)
            return itv == null ? modo : `${modo} (${itv}ms/l${lt ?? "?"})`
        })(),
        teto: fx ? fx.getFloodRuntimeConfig().maxMensagens : "?"
    }
}

function textoDono(f) {
    const qtdUsers = (CONFIG.usuariosAutorizados || []).length + (CONFIG.lidsAutorizados || []).length
    const qtdGroups = (CONFIG.gruposAutorizados || []).length
    const qtdOwners = (CONFIG.donosExtras || []).length
    const vo = [
        `┃ ${opcao("30", "👁️ ViewOnce", estado(VIEW_ONCE_CONFIG.enabled))}`,
        `┃ ${opcao("31", "👁️ VO → grupos", VIEW_ONCE_CONFIG.sendToAuthorizedGroups ? "SIM" : "não")}`,
        `┃ ${opcao("32", "👁️ VO → dono", VIEW_ONCE_CONFIG.sendToOwner ? "SIM" : "não")}`,
        `┃ ${opcao("33", "👁️ VO → ADMs", VIEW_ONCE_CONFIG.sendToAdmins ? "SIM" : "não")}`,
        `┃ ${opcao("34", "💾 VO em disco", VIEW_ONCE_CONFIG.saveToDisk ? "sim (apaga depois)" : "só buffer")}`
    ].join("\n")

    const alvos = f.alvos.length ? `${f.alvos.length} grupo(s) selecionado(s)` : "nenhum (use 36)"
    const erro = f.erro ? `┃ ⚠️ flood indisponível: ${f.erro}\n` : ""

    return [
        moldura(`${LOGO_PRINCIPAL} · 👑 COMANDOS DO DONO`, { largura: 26, enfeite: "༺༻" }),
        `┃ 🔒 só o dono mexe aqui`,
        `┃ 🌊 flood: ${f.tipo} · ${f.velocidade} · teto ${f.teto}`,
        `┃ 🛑 kill switch: ${f.kill ? "ATIVO (nada sai)" : "liberado"}`,
        `┃ 🎯 alvos do flood: ${alvos}`,
        separador(11, "flores"),
        `${bloco("🎨 PRESETS")}`,
        `┃ ${opcao("12", "🎨 Criar preset")}`,
        `┃ ${opcao("13", "🗑️ Apagar preset")}`,
        `${bloco("🖼️ APARÊNCIA")}`,
        `┃ ${opcao("14", "🖼️ Imagem do menu")}`,
        `┃ ${opcao("15", "🔗 Link divulgação", CONFIG.linkDivulgacao ? "definido" : "—")}`,
        `┃ ${opcao("16", "📖 Ler mais", estado(CONFIG.lerMais))}`,
        `${bloco("🌊 FLOOD")}`,
        `┃ ${opcao("17", "🌊 Modo (velocidade)", f.velocidade)}`,
        `┃ ${opcao("18", "⏱️ Intervalo", `${CONFIG.floodInterval}ms`)}`,
        `┃ ${opcao("19", "📦 Lote", `${CONFIG.floodLote}`)}`,
        `┃ ${opcao("40", "💳 Tipo padrão", f.tipo === "📝 texto" ? "texto" : "pagamento")}`,
        `${bloco("🧠 SISTEMA")}`,
        `┃ ${opcao("20", "🧹 Auto-limpeza", estado(CONFIG.autoLimpeza))}`,
        `┃ ${opcao("21", "🛡️ Anti-takeover", estado(CONFIG.antiTakeover))}`,
        `┃ ${opcao("22", "👻 Limpar fantasmas")}`,
        `┃ ${opcao("23", "🗓️ Limpar agendamentos")}`,
        `${bloco("🔐 PERMISSÕES")}`,
        `┃ ${opcao("24", "➕ Add ADM", `${qtdUsers}`)}`,
        `┃ ${opcao("25", "➖ Remover ADM")}`,
        `┃ ${opcao("26", "➕ Add grupo", `${qtdGroups}`)}`,
        `┃ ${opcao("27", "➖ Remover grupo")}`,
        `┃ ${opcao("28", "➕ Add dono", `${qtdOwners}`)}`,
        `┃ ${opcao("29", "➖ Remover dono")}`,
        `${bloco("👁️ VIEW-ONCE")}`,
        vo,
        `${bloco("⚔️ FLOOD · CONTROLE")}`,
        erro +
        `┃ ${opcao("35", "🌊 Presets (load-test)", `${f.presets} + ${f.custom}`)}`,
        `┃ ${opcao("36", "🎯 Escolher grupos (1,3,5)")}`,
        `┃ ${opcao("37", f.kill ? "▶️ Liberar flood" : "🛑 Parar flood AGORA")}`,
        `┃ ${opcao("38", "🚀 Velocidade dos presets")}`,
        `┃ ${opcao("39", "🩺 Raio-X do job")}`,
        separador(11, "trilho"),
        `┃ atalhos: ${"floodpresets · paymenttest · texttest · "}`,
        `┃ mentiontest · mediatest · floodstop · floodstart`,
        `┃ 2/preset/<id> · 12>2 · 36>1,3,5`,
        rodape({ dica: `digite 12-41 · cancelar = sair` })
    ].join("\n")
}

function textoAdm() {
    const qtdUsers = (CONFIG.usuariosAutorizados || []).length + (CONFIG.lidsAutorizados || []).length
    const qtdGroups = (CONFIG.gruposAutorizados || []).length
    const qtdOwners = (CONFIG.donosExtras || []).length
    return [
        moldura(`${LOGO_PRINCIPAL} · ⚙️ CONFIGURAÇÕES`, { largura: 26, enfeite: "༺༻" }),
        `┃ 👤 ADMs do bot podem usar`,
        separador(11, "neve"),
        ...CONFIG_ROTULOS_ADM.map(([n, r]) => `┃ ${opcao(n, r)}`),
        `┃ 7  ⬥ total: ${qtdUsers} ADM(s) · ${qtdGroups} grupo(s) · ${qtdOwners} dono(s)`,
        rodape({ dica: "opções do dono: 5 do menu principal" })
    ].join("\n")
}

// [v55] Renderer interativo — MESMA fonte (CONFIG_OPCOES/CONFIG_ROTULOS_*),
// MESMO estado (config_menu: digitar o número continua valendo nos dois modos).
async function enviarConfigInterativo(jid, ownerKey, modo = "adm") {
    const dono = modo === "dono"
    const rotulos = dono ? CONFIG_ROTULOS_DONO : CONFIG_ROTULOS_ADM
    const rows = rotulos.map(([n, t]) => ({ title: `${n.padStart(2, "0")} ${t}`, description: "", id: CONFIG_OPCOES[n] }))
    const sections = []
    // single_select do WhatsApp corta section acima de 10 linhas → páginas de 10
    for (let i = 0; i < rows.length; i += 10) {
        const fim = Math.min(i + 9, rows.length - 1)
        sections.push({
            title: `${dono ? "👑 DONO" : "⚙️ CONFIG"} ${rotulos[i][0]}-${rotulos[fim][0]}`,
            rows: rows.slice(i, i + 10)
        })
    }
    const botoes = [criarBotao("single_select", {
        title: dono ? `👑 ${LOGO_PRINCIPAL}` : `⚙️ ${LOGO_PRINCIPAL}`,
        text: dono ? "Comandos do dono (12-41)" : "Configurações (1-11)",
        buttonText: " SELECIONAR",
        sections
    })]
    const texto = dono
        ? `${separador(9, "flores")}\n👑 *${LOGO.fraktur}* · ⚔️ acesso restrito\n_Toque numa opção (12-41) ou digite o número_\n${separador(9, "flores")}`
        : `${separador(9, "neve")}\n⚙️ *${LOGO.fraktur}* · configurações\n_Toque numa opção (1-11) ou digite o número_\n${separador(9, "neve")}`
    if (ownerKey) setState(ownerKey, { action: "config_menu" })
    await enviarMensagemInterativa(jid, texto, botoes)
}

export async function enviarSubmenuConfig(jid, ownerKey, modo = "adm") {
    // DECISÃO CENTRAL DE MODO: buttons → só interativo; text/txt/bloks → só TXT.
    if (uiModoEfetivo() === "buttons") return enviarConfigInterativo(jid, ownerKey, modo)
    if (ownerKey) setState(ownerKey, { action: "config_menu" })
    if (modo !== "dono") return safeSendMessage(jid, { text: textoAdm() }, 0)
    const f = await estadoFlood()
    return safeSendMessage(jid, { text: textoDono(f) }, 0)
}

/** Painel do dono = seção 👑 da config (12-41 desde a v53). */
export async function enviarPainelDono(jid, ownerKey) {
    return enviarSubmenuConfig(jid, ownerKey, "dono")
}
