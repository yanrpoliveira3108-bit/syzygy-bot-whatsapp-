import { uiModoEfetivo } from "../utils/config.js"
// menus/groupMenu.js
// [v26] Cache + safeSend + blindagem

import { getSock, rt } from "../connection/socket.js"
import { buildGroupActionsButtons } from "./menutest.js"
import { criarBotao } from "../utils/botoes.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { atualizarGrupos, safeSendMessage } from "../services/groupService.js"
import { setState } from "../utils/stateManager.js"

const POR_PAGINA = 10

export async function enviarConfirmacao(jid, { titulo, texto, idConfirmar }) {
    const botoes = [
        criarBotao("quick_reply", { displayText: " CONFIRMAR", id: idConfirmar }),
        criarBotao("quick_reply", { displayText: " CANCELAR", id: "menu_cancel" })
    ]
    await enviarMensagemInterativa(jid, `${titulo}\n\n${texto}`, botoes)
}

export async function enviarCancelavel(jid, texto) {
    const botoes = [
        criarBotao("quick_reply", { displayText: " CANCELAR", id: "menu_cancel" })
    ]
    await enviarMensagemInterativa(jid, texto, botoes)
}

export async function enviarVoltar(jid, texto) {
    const botoes = [
        criarBotao("quick_reply", { displayText: " VOLTAR AO PAINEL", id: "abrir_painel" })
    ]
    await enviarMensagemInterativa(jid, texto, botoes)
}

function ordenarGrupos(todos) {
    const admin = todos
        .filter(g => g.isAdmin)
        .sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
    const membro = todos
        .filter(g => !g.isAdmin)
        .sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
    return { admin, membro, arr: [...admin, ...membro] }
}

function montarListaGrupos(arr, pagina, totalPaginas, qtdAdmin, qtdMembro) {
    const p = Math.max(1, Math.min(pagina, totalPaginas))
    const inicio = (p - 1) * POR_PAGINA
    const fim = Math.min(inicio + POR_PAGINA, arr.length)
    const bar = "━━━━━━━━━━━━━━━━━━━━"

    let t = `📋 𝗚𝗥𝗨𝗣𝗢𝗦 𝗗𝗢 𝗦𝗬𝗭𝗬𝗚𝗬\n`
    t += `👑 SOU ADMIN · ${qtdAdmin}   👤 SÓ MEMBRO · ${qtdMembro}\n`
    t += `▸ Total: ${arr.length}  ·  Página ${p}/${totalPaginas}\n`
    t += `${bar}\n`

    let secAtual = null
    for (let i = inicio; i < fim; i++) {
        const g = arr[i]
        const sec = g.isAdmin ? "admin" : "membro"
        if (sec !== secAtual) {
            if (secAtual) t += "\n"
            t += sec === "admin"
                ? `👑 𝗦𝗢𝗨 𝗔𝗗𝗠𝗜𝗡 (${qtdAdmin})`
                : `👤 𝗦Ó 𝗠𝗘𝗠𝗕𝗥𝗢 (${qtdMembro})`
            t += "\n"
            secAtual = sec
        }
        t += `  ${String(i + 1).padStart(2, "0")} · ${g.subject}\n`
    }

    t += `${bar}\n`
    t += `_Digite o número do grupo, parte do nome_\n`
    t += `_Multi: 1,3,5 ou 1-5 ou 1 3 5_\n`
    const nav = []
    if (p < totalPaginas) nav.push(`p${p + 1} próxima`)
    if (p > 1) nav.push(`p${p - 1} anterior`)
    if (nav.length) t += `_${nav.join(" · ")}_\n`
    t += `_cancelar = sair_`
    return t
}

export async function listarGruposInterativo(jid, pagina = 1) {
    await atualizarGrupos()

    const todos = Object.entries(rt().cachedGroups).map(([id, info]) => ({ id, ...info }))
    const { arr, admin, membro } = ordenarGrupos(todos)

    if (arr.length === 0) {
        await safeSendMessage(jid, { text: "O bot nao esta em nenhum grupo." })
        return null
    }

    const cache = {}
    arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })

    const totalPaginas = Math.max(1, Math.ceil(arr.length / POR_PAGINA))
    const p = Math.max(1, Math.min(pagina, totalPaginas))
    const inicio = (p - 1) * POR_PAGINA
    const fim = Math.min(inicio + POR_PAGINA, arr.length)

    const texto = montarListaGrupos(arr, p, totalPaginas, admin.length, membro.length)

    const rowsAdmin = [], rowsMembro = []
    for (let i = inicio; i < fim; i++) {
        const g = arr[i]; const idx = i + 1
        const row = { title: `${String(idx).padStart(3, "0")} - ${(g.subject || "").substring(0, 22)}`, description: g.isAdmin ? "COM ADM" : "sem adm", id: `grp_select_${idx}` }
        ;(g.isAdmin ? rowsAdmin : rowsMembro).push(row)
    }
    const sections = []
    if (rowsAdmin.length) sections.push({ title: "👑 SOU ADMIN", rows: rowsAdmin })
    if (rowsMembro.length) sections.push({ title: "👤 SÓ MEMBRO", rows: rowsMembro })
    const navRows = []
    if (p < totalPaginas) navRows.push({ title: `Proxima (${p + 1})`, description: "", id: `grp_page_${p + 1}` })
    if (p > 1) navRows.push({ title: `Anterior (${p - 1})`, description: "", id: `grp_page_${p - 1}` })
    navRows.push({ title: "Voltar ao menu", description: "", id: "abrir_painel" })
    sections.push({ title: "NAVEGACAO", rows: navRows })

    const { CONFIG } = await import("../utils/config.js")
    if (uiModoEfetivo() === "text") {
        await safeSendMessage(jid, { text: texto })
    } else {
        const botoes = [
            criarBotao("single_select", {
                title: `GRUPOS ${p}/${totalPaginas}`,
                text: `${arr.length} grupos`,
                buttonText: "SELECIONAR GRUPO",
                sections
            })
        ]
        await enviarMensagemInterativa(jid, texto, botoes)
    }
    return cache
}

export async function enviarMenuAcoesGrupo(jid, grupo, ownerKey) {
    const badge = grupo.isAdmin ? "👑 𝗦𝗢𝗨 𝗔𝗗𝗠𝗜𝗡" : "👤 𝗦Ó 𝗠𝗘𝗠𝗕𝗥𝗢"
    const texto = `╭━━〔 ⚡ 𝗔ÇÕ𝗘𝗦 𝗗𝗢 𝗚𝗥𝗨𝗣𝗢 〕━━\n` +
                  `┃ ${grupo.subject}\n` +
                  `┃ ${badge}\n` +
                  `╰━━━━━━━━━━━━━━━━━━\n\n` +
                  `Escolha uma ação:\n` +
                  `  1 · FLOOD\n` +
                  `  2 · PRESET + NUKE\n` +
                  `  3 · ROUBAR GRUPO\n` +
                  `  4 · AGENDAR AÇÃO\n` +
                  `  0 · VOLTAR AO MENU\n` +
                  `_cancelar = sair_`

    if (ownerKey) {
        setState(ownerKey, {
            action: "group_action_menu",
            groupJid: grupo.id,
            selectedGroup: { id: grupo.id, subject: grupo.subject, isAdmin: grupo.isAdmin }
        })
    }
    // [v55] DECISÃO CENTRAL DE MODO: buttons → SOMENTE interativo (as MESMAS
    // opções do TXT 1/2/3/4/0, ids que o router despacha para a MESMA função
    // processarSelecaoGrupo — paridade botão=texto). O estado continua setado:
    // digitar 1-4 continua funcionando em qualquer modo.
    if (uiModoEfetivo() === "buttons") {
        const botoes = [criarBotao("single_select", {
            title: " AÇÕES DO GRUPO",
            text: (grupo.subject || "").substring(0, 20),
            buttonText: " EXECUTAR AÇÃO",
            sections: [{
                title: badge.replace(/𝗦𝗢𝗨 |𝗦𝗢́ /, "").trim() || "AÇÕES",
                rows: [
                    { title: "1 FLOOD", description: "Envio massivo", id: "painel_flood" },
                    { title: "2 PRESET + NUKE", description: "Preset completo", id: "painel_tudo" },
                    { title: "3 ROUBAR GRUPO", description: "Domina o grupo", id: "painel_roubar" },
                    { title: "4 AGENDAR AÇÃO", description: "Programa execução", id: "painel_agendar" },
                    { title: "0 VOLTAR AO MENU", description: "Painel principal", id: "abrir_painel" }
                ]
            }]
        })]
        await enviarMensagemInterativa(jid, texto, botoes)
        return
    }
    await safeSendMessage(jid, { text: texto })
}

export async function enviarMenuMultiAcoes(jid, grupos, ownerKey) {
    const lista = grupos.slice(0, 10).map((g) => `  ${String(g.index).padStart(2, "0")} · ${g.subject}`).join("\n")
    const mais = grupos.length > 10 ? `\n  ... +${grupos.length - 10} outros` : ""
    const texto = `╭━━〔 ⚡ 𝗠𝗨𝗟𝗧𝗜-𝗔ÇÃ𝗢 〕━━\n` +
                  `┃ ${grupos.length} grupos selecionados\n` +
                  `╰━━━━━━━━━━━━━━━━━━\n\n` +
                  `${lista}${mais}\n\n` +
                  `Escolha ação para TODOS:\n` +
                  `  1 · FLOOD EM LOTE\n` +
                  `  2 · PRESET + NUKE EM LOTE\n` +
                  `  3 · ROUBAR EM LOTE\n` +
                  `  4 · AGENDAR EM LOTE\n` +
                  `  0 · VOLTAR\n` +
                  `_cancelar = sair_`
    if (ownerKey) {
        setState(ownerKey, {
            action: "group_multi_action",
            multiGroups: grupos
        })
    }
    await safeSendMessage(jid, { text: texto })
}

export async function enviarMenuFloodModos(jid, ownerKey, info = {}) {
    const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
    const atual = CONFIG.floodModo || "normal"
    const qtd = info.qtd || "?"
    // [v53] o modo controla SÓ a velocidade; o TIPO do conteúdo (📝 texto |
    // 💳 pagamento) já foi decidido no passo anterior. Nada aqui muda executor,
    // fila ou permissões.
    const tipoConteudo = info.floodTipo || info.floodKind
    const linhaTipo = tipoConteudo === "payment" || tipoConteudo === "pagamento"
        ? `💳 TIPO: pagamento · ${info.floodContent?.currency || "BRL"} ${Number(info.floodContent?.amount || 0).toFixed(2)} · nota: ${info.floodContent?.text || "-"}\n`
        : ``
    const texto = `🌊 FLOOD — MODO DE ENVIO\n` +
                  `${linhaTipo}` +
                  `Qtd: ${qtd} msgs | Atual: ${atual}\n\n` +
                  `Escolha a velocidade:\n` +
                  `  1 · Rápido — ${FLOOD_MODOS.rapido.intervalo}ms / lote ${FLOOD_MODOS.rapido.lote} (arriscado)\n` +
                  `  2 · Normal — ${FLOOD_MODOS.normal.intervalo}ms / lote ${FLOOD_MODOS.normal.lote}\n` +
                  `  3 · Lento — ${FLOOD_MODOS.lento.intervalo}ms / lote ${FLOOD_MODOS.lento.lote}\n` +
                  `  4 · Seguro — ${FLOOD_MODOS.seguro.intervalo}ms / lote ${FLOOD_MODOS.seguro.lote} + jitter\n` +
                  `  Ou digite intervalo custom (ex: 200)\n\n` +
                  `_0 = usar config atual (${CONFIG.floodInterval}ms)_`
    if (ownerKey) {
        setState(ownerKey, {
            action: info.multi ? "multi_flood_modo" : "waiting_flood_modo",
            groupJid: info.groupJid,
            selectedGroup: info.selectedGroup || null,
            multiGroups: info.multiGroups,
            floodMessage: info.floodMessage,
            floodQtd: qtd,
            // [v53] o TIPO de conteúdo atravessa o passo de modo: é o mesmo estado
            // do mesmo wizard — não uma fila nem um executor paralelo.
            floodTipo: info.floodTipo || "texto",
            floodContent: info.floodContent || null,
        })
    }
    await safeSendMessage(jid, { text: texto })
}

export { montarListaGrupos, ordenarGrupos, POR_PAGINA }
