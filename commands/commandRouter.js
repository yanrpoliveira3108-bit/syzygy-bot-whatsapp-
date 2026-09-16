// commands/commandRouter.js
// [v27] Owner-only para foto menu, add/remove ADM, add/remove grupo, flood config, etc.

import { rt } from "../connection/socket.js"
import { getSock } from "../connection/socket.js"
import { setState, getState, clearState } from "../utils/stateManager.js"

import { enviarPainelInicial } from "../menus/mainMenu.js"
import { enviarPainelAdmin } from "../menus/adminMenu.js"
import { enviarSubmenuConfig, enviarPainelDono } from "../menus/configMenu.js"
import {
    listarGruposInterativo, enviarMenuAcoesGrupo, enviarVoltar, enviarCancelavel
} from "../menus/groupMenu.js"

import { processarSelecaoGrupo } from "../handlers/stateHandler.js"
import { listarGruposTexto, confirmarNuke, confirmarRemoverFoto } from "../actions/groupActions.js"
import { confirmarFlood } from "../actions/floodActions.js"
import {
    cfgMenuImage, cfgOwner, cfgNumber, cfgStatus, cfgRestart
} from "../actions/configActions.js"
import { isOwner } from "../utils/permissions.js"

// Ações que só o dono pode fazer (ADMs não)
export const OWNER_ONLY = new Set([
    "painel_dono",
    "cfg_menuImage",
    "cfg_criar_preset",
    "cfg_apagar_preset",
    "cfg_link",
    "cfg_ler_mais",
    "cfg_flood_modo",
    "cfg_flood_interval",
    "cfg_flood_lote",
    "cfg_autolimpeza",
    "cfg_antitakeover",
    "cfg_limpar_fantasmas",
    "cfg_limpar_agendamentos",
    "cfg_add_user",
    "cfg_remove_user",
    "cfg_add_group",
    "cfg_remove_group",
    "cfg_add_owner",
    "cfg_remove_owner",
    "cfg_viewonce_toggle",
    "cfg_viewonce_groups",
    "cfg_viewonce_owner",
    "cfg_viewonce_admins",
    "cfg_viewonce_save"
])

export async function roteadorAcoes(chatJid, ownerKey, actionId) {
    if (actionId === "menu_inicial") {
        clearState(ownerKey)
        await enviarPainelInicial(chatJid)
        return
    }
    if (actionId === "menu_cancel") {
        clearState(ownerKey)
        await enviarVoltar(chatJid, "❌ Operação cancelada.")
        return
    }
    if (actionId === "owner_panel" || actionId === "abrir_painel") {
        clearState(ownerKey)
        await enviarPainelInicial(chatJid)
        return
    }

    // [v55] PARIDADE BOTÃO = TEXTO no menu de ações de grupo: com o painel de
    // ações aberto (estado group_action_menu), os ids painel_* executam a
    // MESMA ação que digitar 1/2/3/4 no TXT — via processarSelecaoGrupo, a
    // mesma função do caminho numérico (nenhuma lógica duplicada).
    const stGA = getState(ownerKey)
    const GA_DIRETO = {
        painel_flood: "waiting_flood_message",
        painel_tudo: "waiting_tudo_name",
        painel_roubar: "roubar_grupo",
        painel_so_nome: "waiting_name",
        painel_so_bio: "waiting_bio",
        painel_nome_bio: "waiting_both_name",
        painel_foto_grupo: "waiting_group_image",
        painel_foto_link: "waiting_image_url"
    }
    if (stGA?.action === "group_action_menu" && stGA.selectedGroup && GA_DIRETO[actionId]) {
        setState(ownerKey, {
            action: GA_DIRETO[actionId],
            groupJid: stGA.selectedGroup.id,
            selectedGroup: stGA.selectedGroup
        })
        await processarSelecaoGrupo(chatJid, ownerKey, GA_DIRETO[actionId], stGA.selectedGroup)
        return
    }
    if (actionId === "painel_agendar" && stGA?.action === "group_action_menu" && stGA.selectedGroup) {
        // Mesmo handler do TXT "4" (estado group_agendar_tipo + mesmo texto)
        setState(ownerKey, { action: "group_agendar_tipo", groupJid: stGA.selectedGroup.id, selectedGroup: stGA.selectedGroup })
        await enviarCancelavel(chatJid, `⏰ AGENDAR AÇÃO\nGrupo: ${stGA.selectedGroup.subject}\n\nO que agendar?\n  1 · FLOOD\n  2 · PRESET + NUKE\n  3 · ROUBAR GRUPO\n\n0 = voltar`)
        return
    }

    // Verifica owner-only
    if (OWNER_ONLY.has(actionId) && !isOwner(ownerKey)) {
        await getSock().sendMessage(chatJid, { text: `❌ Apenas o dono pode usar este comando.\nComando: ${actionId}\nSeu ID: ${ownerKey}` })
        return
    }

    const pedirGrupo = async (next) => {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "waiting_group", next })
    }

    // Comandos ATIVOS
    if (actionId === "owner_grupos" || actionId === "painel_listar_grupos") { await listarGruposTexto(chatJid, ownerKey); return }

    // [v40] Botões OFICIAIS do painel (menutest.js / adminMenu.js) — restaurados
    // conforme MAPA DE BOTÕES da AUDITORIA. Os estados waiting_*/confirm_* já
    // existiam no stateHandler; faltava o despacho no roteador (clique não fazia nada).
    if (actionId === "painel_registrar_nome" || actionId === "painel_so_nome" || actionId === "owner_nome" || actionId === "owner_so_nome") { await pedirGrupo("waiting_name"); return }
    if (actionId === "painel_registrar_bio" || actionId === "painel_so_bio" || actionId === "owner_bio" || actionId === "owner_so_bio") { await pedirGrupo("waiting_bio"); return }
    if (actionId === "painel_nome_bio" || actionId === "owner_nome_bio") { await pedirGrupo("waiting_both_name"); return }
    if (actionId === "painel_nuke" || actionId === "owner_nuke") { await pedirGrupo("confirm_nuke"); return }
    if (actionId === "painel_foto_grupo" || actionId === "owner_foto_arquivo") { await pedirGrupo("waiting_group_image"); return }
    if (actionId === "painel_foto_link" || actionId === "owner_foto_link") { await pedirGrupo("waiting_image_url"); return }
    if (actionId === "painel_remover_foto" || actionId === "owner_remover_foto") { await pedirGrupo("confirm_rmfoto"); return }

    if (actionId === "owner_flood" || actionId === "painel_flood") { await pedirGrupo("waiting_flood_message"); return }
    if (actionId === "owner_tudo" || actionId === "painel_tudo") { await pedirGrupo("waiting_tudo_name"); return }
    if (actionId === "owner_roubar" || actionId === "painel_roubar") { await pedirGrupo("roubar_grupo"); return }
    if (actionId === "owner_config" || actionId === "painel_config") { await enviarSubmenuConfig(chatJid, ownerKey, "adm"); return }
    if (actionId === "painel_dono" || actionId === "owner_area") { await enviarPainelDono(chatJid, ownerKey); return }
    if (actionId === "owner_multi" || actionId === "painel_multi") {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "group_menu" })
        await getSock().sendMessage(chatJid, { text: `🔢 MODO MULTI ATIVO\nDigite vários números: 1,3,5 ou 1-5 ou 1 3 5\n\nPara ação em um único grupo, digite só um número.` })
        return
    }
    if (actionId === "owner_sair") { clearState(ownerKey); await getSock().sendMessage(chatJid, { text: "Painel fechado." }); return }

    // [v47] 🖥️ SERVER INSPECTOR (!bloks) — painel A2UI (im_a2ui) com dados REAIS
    // do servidor. UI fixa em services/serverInspector.js; falha isolada não
    // derruba o painel nem a conexão (fallback de texto abaixo).
    // [v52] "Mostrar lista" — toque no botão do menu sem row selecionada
    if (actionId === "mostrar_lista") {
        try {
            const { enviarListaComandos } = await import("../menus/menu.js")
            await enviarListaComandos(chatJid)
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ Falha ao gerar a lista: ${e.message}` }).catch(() => {})
        }
        return
    }
    if (actionId === "server_inspector") {
        try {
            const { sendServerInspector } = await import("../services/serverInspector.js")
            await sendServerInspector(getSock(), chatJid)
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `❌ Falha ao gerar o Server Inspector: ${e.message}` }).catch(() => {})
        }
        return
    }

    // [v41] 🫥 STATUS MANAGER — delega TODAS as ações status_* ao módulo.
    // Autorização (dono/ADM) é verificada dentro do módulo, além do gate global.
    if (actionId.startsWith("status_")) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        await statusRouter(chatJid, ownerKey, actionId)
        return
    }

    // [v33] Categorias do menu interativo com listas (paginação para 100+ comandos)
    if (actionId.startsWith("cat_")) {
        // cat_grupos, cat_ataque, etc ou cat_grupos_page_2
        const pageMatch = actionId.match(/^cat_(.+)_page_(\d+)$/)
        if (pageMatch) {
            const catId = pageMatch[1]
            const pageNum = parseInt(pageMatch[2])
            const { CATEGORIAS } = await import("../menus/menu.js")
            const cat = CATEGORIAS[catId]
            if (cat) {
                const { paginateRows, chunkRowsToSections } = await import("../services/interactiveList.js")
                const { sendInteractiveList } = await import("../services/interactiveList.js")
                const { getSock } = await import("../connection/socket.js")
                const pages = paginateRows(cat.rows, 100)
                const pageIdx = Math.max(0, Math.min(pageNum - 1, pages.length - 1))
                const pageRows = pages[pageIdx]
                const sections = chunkRowsToSections(pageRows, cat.titulo)
                const navRows = []
                if (pageIdx + 1 < pages.length) navRows.push({ title: "➡️ Próxima", description: `Página ${pageIdx + 2}/${pages.length}`, id: `cat_${catId}_page_${pageIdx + 2}` })
                if (pageIdx > 0) navRows.push({ title: "⬅️ Anterior", description: `Página ${pageIdx}/${pages.length}`, id: `cat_${catId}_page_${pageIdx}` })
                navRows.push({ title: "⬅️ Voltar ao Menu", description: "Menu principal", id: "menu_inicial" })
                sections.push({ title: "Navegação", rows: navRows })
                await sendInteractiveList(getSock(), chatJid, {
                    title: `${cat.titulo} P${pageIdx + 1}/${pages.length}`,
                    body: `${cat.titulo} - Página ${pageIdx + 1}/${pages.length}\n${cat.descricao}`,
                    footer: "© SYZYGY",
                    buttonText: "Selecionar",
                    sections
                })
            }
            return
        }

        const catId = actionId.replace("cat_", "")
        if (catId === "rapido") {
            const { sendFastHelpMenu } = await import("../menus/menu.js")
            await sendFastHelpMenu(chatJid)
            return
        }
        const { sendCategoryInteractiveMenu } = await import("../menus/menu.js")
        await sendCategoryInteractiveMenu(chatJid, catId)
        return
    }

    // Ajuda modo rápido clicada
    if (actionId.startsWith("fast_")) {
        const { safeSendMessage } = await import("../services/groupService.js")
        let help = ""
        if (actionId === "fast_flood_help") help = `⚡ FLOOD RÁPIDO\nFormato: 2/<grupo>/<msg>/<qtd>[/<modo>][@tempo]\nEx: 2/01/Oi/20/1\nModos: 1 rapido 50ms/lote8, 2 normal 100ms/lote6, 3 lento 250ms/lote4, 4 seguro 500ms/lote3\nCom @ agenda: 2/01/Oi/20/1@10m`
        else if (actionId === "fast_nuke_help") help = `💣 NUKE RÁPIDO\nFormato: 3/<grupo>/<preset>[/<msg|pular>][@tempo]\nEx: 3/01/2/Oi\nEx: 3/01/0/pular (0=config padrão)\nEx: 3/01/2/Oi@1h (agenda 1h)`
        else if (actionId === "fast_roubar_help") help = `⚡ ROUBAR RÁPIDO\nFormato: 4/<grupo>/<preset>[@tempo]\nEx: 4/01/2\nEx: 4/Kk/0@20:30`
        else if (actionId === "fast_multi_flood_help") help = `🔢 MULTI FLOOD\nFormato: 6/<grupos>/1/<msg>/<qtd>[/<modo>][@tempo]\nEx: 6/1,3,5/1/Oi/20/1\nEx: 6/1-5/1/Oi/20/1@10m`
        else if (actionId === "fast_multi_nuke_help") help = `🔢 MULTI NUKE\nFormato: 6/<grupos>/2/<preset>[/<msg>][@tempo]\nEx: 6/1,3,5/2/2/Oi\nEx: 6/1-5/2/0/pular`
        else if (actionId === "fast_config_help") help = `⚙️ CONFIG RÁPIDO\n5/16/1 → ler mais (liga/desliga)\n5/17/rapido → flood modo\n5/18/200 → intervalo\n5/19/8 → lote\n5/24/5511... → add ADM\n5/26/01 → add grupo autorizado\n5/28/5511... → add dono extra\n(números = menu 5 · Comandos do Dono)`
        else if (actionId === "fast_agendar_help") help = `⏰ AGENDAR RÁPIDO\nUse @ no final:\n3/01/2/Oi@10m → nuke em 10m\n2/01/Oi/20/1@1h → flood em 1h\n4/01/2@20:30 → roubar 20:30\nFormatos tempo: 10s, 5m, 2h, 1d, 20:30, 25/08 20:00`
        else help = `⚡ MODO RÁPIDO\nUse / para comandos diretos e @ para agendar`
        await safeSendMessage(chatJid, { text: help }, 0)
        return
    }

    // Config submenu
    if (actionId === "cfg_menuImage") { await cfgMenuImage(chatJid, ownerKey); return }
    if (actionId === "cfg_owner")     { await cfgOwner(chatJid); return }
    if (actionId === "cfg_number")    { await cfgNumber(chatJid); return }
    if (actionId === "cfg_status")    { await cfgStatus(chatJid); return }
    if (actionId === "cfg_restart")   { await cfgRestart(chatJid, ownerKey, clearState); return }
    if (actionId === "cfg_criar_preset") {
        setState(ownerKey, { action: "preset_novo_nome" })
        await getSock().sendMessage(chatJid, { text: "NOVO PRESET\n\nDigite o nome do grupo (ou cancelar):" })
        return
    }
    // [v40] Listar presets: existia no menu interativo (categoria Presets) mas não tinha handler.
    if (actionId === "cfg_list_presets") {
        const { listarPresetsTexto, carregarPresets } = await import("../services/presetService.js")
        const total = carregarPresets().length
        await getSock().sendMessage(chatJid, {
            text: total === 0
                ? `🎨 PRESETS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\nNenhum preset salvo.\n\nUse 6 (Criar preset) no config para criar.`
                : `🎨 PRESETS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n${listarPresetsTexto()}\n\nUse 12 para criar, 13 para apagar (menu 5).`
        })
        return
    }
    if (actionId === "cfg_apagar_preset") {
        const { listarPresetsTexto, carregarPresets } = await import("../services/presetService.js")
        if (carregarPresets().length === 0) {
            await getSock().sendMessage(chatJid, { text: "Nenhum preset salvo." })
            return
        }
        setState(ownerKey, { action: "preset_apagar" })
        await getSock().sendMessage(chatJid, { text: `APAGAR PRESET\n\n${listarPresetsTexto()}\n\nDigite o numero do preset para apagar (ou cancelar):` })
        return
    }
    if (actionId === "cfg_fantasma") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.marcarFantasma = !CONFIG.marcarFantasma
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `Marcar fantasma agora: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}\n\n(marca todos sem mostrar os @ no nuke, flood e roubo)` })
        return
    }
    if (actionId === "cfg_link") {
        const { CONFIG } = await import("../utils/config.js")
        setState(ownerKey, { action: "config_set_link" })
        await getSock().sendMessage(chatJid, {
            text: `LINK / NUMERO DE DIVULGACAO\n\nAtual: ${CONFIG.linkDivulgacao || "(nenhum)"}\n\nEnvie o link do grupo/canal ou o numero.\nDigite REMOVER para apagar.\n(cancelar para sair)`
        })
        return
    }
    if (actionId === "cfg_flood_modo") {
        const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
        setState(ownerKey, { action: "config_set_flood_modo" })
        await getSock().sendMessage(chatJid, {
            text: `🌊 MODO FLOOD\nAtual: ${CONFIG.floodModo} (${FLOOD_MODOS[CONFIG.floodModo]?.intervalo}ms/lote${FLOOD_MODOS[CONFIG.floodModo]?.lote})\n\nDigite:\n  rapido - 80ms/lote6 (arriscado)\n  normal - 150ms/lote5\n  lento - 400ms/lote3\n  seguro - 800ms/lote2 + jitter\n\n(cancelar para sair)`
        })
        return
    }
    if (actionId === "cfg_flood_interval") {
        setState(ownerKey, { action: "config_set_flood_interval" })
        await getSock().sendMessage(chatJid, { text: `Intervalo flood atual: ${ (await import("../utils/config.js")).CONFIG.floodInterval}ms\n\nDigite novo intervalo (20-5000ms):\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_flood_lote") {
        setState(ownerKey, { action: "config_set_flood_lote" })
        await getSock().sendMessage(chatJid, { text: `Lote flood atual: ${ (await import("../utils/config.js")).CONFIG.floodLote}\n\nDigite novo lote (1-10):\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_ler_mais") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.lerMais = !CONFIG.lerMais
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `📖 Ler mais agora: ${CONFIG.lerMais ? "LIGADO" : "DESLIGADO"}\n\nLIGADO → mensagens dobram logo após\no título (⚡ SYZYGY), usando caracteres\ninvisíveis que estouram o limite do app.\nDESLIGADO → mostra tudo inteiro.\n\n⚠️ O corte exato é do app do WhatsApp\n(sem API) e pode não dobrar no iPhone.` })
        return
    }
    if (actionId === "cfg_autolimpeza") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.autoLimpeza = !CONFIG.autoLimpeza
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `Auto-limpeza agora: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}\n\nRemove automaticamente grupos fantasmas do cache.` })
        return
    }
    if (actionId === "cfg_antitakeover") {
        const { CONFIG, salvarConfig } = await import("../utils/config.js")
        CONFIG.antiTakeover = !CONFIG.antiTakeover
        salvarConfig()
        await getSock().sendMessage(chatJid, { text: `Anti-takeover agora: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}\n\nDetecta perda de admin, remoção e promoções suspeitas.` })
        return
    }
    if (actionId === "cfg_limpar_fantasmas") {
        await getSock().sendMessage(chatJid, { text: "Limpando grupos fantasmas..." })
        try {
            const { limparCacheFantasmas } = await import("../services/groupService.js")
            const r = await limparCacheFantasmas(true)
            await getSock().sendMessage(chatJid, { text: `Limpeza concluída.\nVerificados: ${r.verificados}\nRemovidos: ${r.removidos}\nReais: ${r.totalReais || "?"}\n${r.lista.length ? "\nRemovidos:\n" + r.lista.slice(0, 10).map(x => `• ${x.subject}`).join("\n") : ""}` })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_historico") {
        try {
            const { formatarHistoricoTexto } = await import("../services/historicoService.js")
            await getSock().sendMessage(chatJid, { text: formatarHistoricoTexto(20) })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_relatorio") {
        try {
            const { gerarRelatorio } = await import("../services/historicoService.js")
            const { carregarPresets } = await import("../services/presetService.js")
            const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
            const { rt } = await import("../connection/socket.js")
            const rel = gerarRelatorio()
            const grupos = Object.values(rt().cachedGroups || {})
            const admin = grupos.filter(g => g.isAdmin).length
            const modo = FLOOD_MODOS[CONFIG.floodModo] || {}
            const { listarAgendamentos } = await import("../services/agendaService.js")
            const ag = listarAgendamentos()
            const pendentes = ag.filter(j => j.status === "pendente").length
            const { getAuthorizedUsers, getAuthorizedGroups } = await import("../utils/permissions.js")
            let txt = `📊 RELATÓRIO SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n`
            txt += `👥 Grupos: ${grupos.length} (👑 ${admin} admin / 👤 ${grupos.length - admin} membro)\n`
            txt += `🎨 Presets: ${carregarPresets().length}\n`
            txt += `🌊 Flood: ${CONFIG.floodModo} ${modo.intervalo}ms/lote${modo.lote} ${CONFIG.floodJitter ? "+jitter" : ""}\n`
            txt += `👻 Fantasma: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}\n`
            txt += `🧹 Auto-limpeza: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}\n`
            txt += `🛡️ Anti-takeover: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}\n`
            txt += `👤 ADMs bot: ${getAuthorizedUsers().length} | 👥 Grupos autorizados: ${getAuthorizedGroups().length}\n`
            txt += `📜 Histórico: ${rel.total} ações (${rel.ultimas24h} nas últimas 24h)\n`
            txt += `⏰ Agendamentos: ${ag.length} (${pendentes} pendentes)\n`
            txt += `━━━━━━━━━━━━━━━━━━━━\n`
            txt += `Por tipo: ${Object.entries(rel.porTipo).map(([k, v]) => `${k}:${v}`).join(" ") || "nenhum"}\n\n`
            txt += `Últimas ações:\n`
            rel.lista.slice(0, 5).forEach(h => {
                const d = new Date(h.ts)
                txt += `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${h.tipo} ${h.subject || ""}\n`
            })
            await getSock().sendMessage(chatJid, { text: txt })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro relatório: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_agendamentos") {
        try {
            const { formatarAgendamentosTexto } = await import("../services/agendaService.js")
            await getSock().sendMessage(chatJid, { text: formatarAgendamentosTexto() })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_limpar_agendamentos") {
        try {
            const { limparConcluidos } = await import("../services/agendaService.js")
            const n = limparConcluidos()
            await getSock().sendMessage(chatJid, { text: `Removidos ${n} agendamentos concluídos/com erro.` })
        } catch (e) {
            await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
        }
        return
    }
    if (actionId === "cfg_add_user") {
        setState(ownerKey, { action: "config_add_user" })
        await getSock().sendMessage(chatJid, { text: `➕ ADD ADM DO BOT\n\nEnvie o número do usuário com DDD (ex: 5511999999999)\nPode enviar vários separados por vírgula ou espaço.\nSe o usuário usar @lid, envie o LID também.\n\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_remove_user") {
        const { getAuthorizedUsers, formatAuthorizedUsersTexto } = await import("../utils/permissions.js")
        const users = getAuthorizedUsers()
        if (!users.length) {
            await getSock().sendMessage(chatJid, { text: "Nenhum usuário autorizado extra." })
            return
        }
        setState(ownerKey, { action: "config_remove_user" })
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER ADM DO BOT\n\n${formatAuthorizedUsersTexto()}\n\nDigite o número ou o índice (ex: 1 ou 5511999999999)\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_list_users") {
        const { formatAuthorizedUsersTexto, getAuthorizedUsers, getAuthorizedLids } = await import("../utils/permissions.js")
        const { getOwnerNumber } = await import("../utils/permissions.js")
        const owner = getOwnerNumber()
        let txt = `👤 ADMs DO BOT SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n`
        txt += `👑 Dono: ${owner}\n\n`
        txt += `Autorizados extras (${getAuthorizedUsers().length} tel + ${getAuthorizedLids().length} LID):\n`
        txt += formatAuthorizedUsersTexto()
        txt += `\n\nUse 24 para adicionar, 25 para remover (menu 5).`
        await getSock().sendMessage(chatJid, { text: txt })
        return
    }
    if (actionId === "cfg_add_group") {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "config_add_group" })
        await getSock().sendMessage(chatJid, { text: `➕ ADD GRUPO AUTORIZADO\n\nDigite o número do grupo da lista acima (ex: 01)\nOu envie link de convite / ID do grupo.\n\nPara multi: 1,3,5 ou 1-5\nGrupo autorizado fica blindado contra nuke/flood/roubar\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_remove_group") {
        const { getAuthorizedGroups, formatAuthorizedGroupsTexto } = await import("../utils/permissions.js")
        const groups = getAuthorizedGroups()
        if (!groups.length) {
            await getSock().sendMessage(chatJid, { text: "Nenhum grupo autorizado." })
            return
        }
        setState(ownerKey, { action: "config_remove_group" })
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER GRUPO AUTORIZADO\n\n${formatAuthorizedGroupsTexto(rt().cachedGroups)}\n\nDigite o índice (ex: 1) ou o ID do grupo\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_list_groups") {
        const { getAuthorizedGroups, formatAuthorizedGroupsTexto } = await import("../utils/permissions.js")
        const txt = `👥 GRUPOS AUTORIZADOS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n${formatAuthorizedGroupsTexto(rt().cachedGroups)}\n\nTotal: ${getAuthorizedGroups().length}\nBlindados contra nuke/flood/roubar\n\nUse 26 para adicionar, 27 para remover (menu 5).`
        await getSock().sendMessage(chatJid, { text: txt })
        return
    }
    if (actionId === "cfg_add_owner") {
        setState(ownerKey, { action: "config_add_owner" })
        await getSock().sendMessage(chatJid, { text: `👑 ADD DONO EXTRA\n\nEnvie o número com DDD (ex: 5511999999999)\nDono extra tem TODAS permissões, igual você (pode add ADM, mudar foto, etc).\n\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_remove_owner") {
        const { getExtraOwners, formatExtraOwnersTexto } = await import("../utils/permissions.js")
        if (!getExtraOwners().length) {
            await getSock().sendMessage(chatJid, { text: "Nenhum dono extra." })
            return
        }
        setState(ownerKey, { action: "config_remove_owner" })
        await getSock().sendMessage(chatJid, { text: `➖ REMOVER DONO EXTRA\n\n${formatExtraOwnersTexto()}\n\nDigite índice ou número\n(cancelar para sair)` })
        return
    }
    if (actionId === "cfg_list_owners") {
        const { formatExtraOwnersTexto, getExtraOwners, getOwnerNumber, getAllOwners } = await import("../utils/permissions.js")
        let txt = `👑 DONOS SYZYGY\n━━━━━━━━━━━━━━━━━━━━\n`
        txt += `Principal: ${getOwnerNumber()}\n\n`
        txt += `Extras (${getExtraOwners().length}):\n${formatExtraOwnersTexto()}\n\n`
        txt += `Todos com poder total: ${getAllOwners().join(", ")}`
        await getSock().sendMessage(chatJid, { text: txt })
        return
    }
    if (actionId === "cfg_viewonce_toggle") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.enabled = !VIEW_ONCE_CONFIG.enabled
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce agora: ${VIEW_ONCE_CONFIG.enabled ? "LIGADO" : "DESLIGADO"}` })
        return
    }
    if (actionId === "cfg_viewonce_groups") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.sendToAuthorizedGroups = !VIEW_ONCE_CONFIG.sendToAuthorizedGroups
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce → grupos autorizados: ${VIEW_ONCE_CONFIG.sendToAuthorizedGroups ? "SIM" : "NAO"}` })
        return
    }
    if (actionId === "cfg_viewonce_owner") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.sendToOwner = !VIEW_ONCE_CONFIG.sendToOwner
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce → owner: ${VIEW_ONCE_CONFIG.sendToOwner ? "SIM" : "NAO"}` })
        return
    }
    if (actionId === "cfg_viewonce_admins") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.sendToAdmins = !VIEW_ONCE_CONFIG.sendToAdmins
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce → ADMs: ${VIEW_ONCE_CONFIG.sendToAdmins ? "SIM" : "NAO"}` })
        return
    }
    if (actionId === "cfg_viewonce_save") {
        const { VIEW_ONCE_CONFIG } = await import("../features/viewOnce/config.js")
        VIEW_ONCE_CONFIG.saveToDisk = !VIEW_ONCE_CONFIG.saveToDisk
        await getSock().sendMessage(chatJid, { text: `👁️ ViewOnce salvar: ${VIEW_ONCE_CONFIG.saveToDisk ? "DISCO (salva, envia e apaga)" : "SÓ BUFFER (não salva no celular)"}\n\n${VIEW_ONCE_CONFIG.saveToDisk ? "Salva em temp/ e apaga após enviar" : "Só em memória, não fica arquivo no seu celular"}` })
        return
    }

    if (actionId === "nuke_confirm_yes")   { await confirmarNuke(chatJid, ownerKey); return }
    if (actionId === "rmfoto_confirm_yes") { await confirmarRemoverFoto(chatJid, ownerKey); return }
    if (actionId === "flood_confirm_yes")  { await confirmarFlood(chatJid, ownerKey); return }

    if (actionId.startsWith("grp_page_")) {
        const nPag = parseInt(actionId.replace("grp_page_", ""))
        const novoCache = await listarGruposInterativo(chatJid, nPag)
        if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
        return
    }

    if (actionId.startsWith("grp_select_")) {
        const n = parseInt(actionId.replace("grp_select_", ""))
        const entry = (rt().groupSelectionCache[ownerKey] || {})[n]
        if (!entry) { await enviarVoltar(chatJid, "⚠️ Seleção expirada."); return }
        const st = getState(ownerKey)
        if (!st || st.action !== "waiting_group") {
            await enviarMenuAcoesGrupo(chatJid, entry, ownerKey)
            return
        }
        setState(ownerKey, {
            action: st.next,
            groupJid: entry.id,
            selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: n }
        })
        await processarSelecaoGrupo(chatJid, ownerKey, st.next, entry)
        return
    }

    // [v40] Fallback: nenhum handler para o ID (evita clique de botão sem resposta).
    await getSock().sendMessage(chatJid, { text: `⚠️ Comando não reconhecido: ${actionId}\nDigite *menu* para abrir o painel.` })
}
