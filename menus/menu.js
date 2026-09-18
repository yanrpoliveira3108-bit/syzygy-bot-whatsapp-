// menus/menu.js - SISTEMA COMPLETO NEUTRO 100+ COMANDOS
// Baileys via camada compat (connection/baileysCompat.js) — listas interativas + paginação
// Usa services/list.js (sendInteractiveList, getListId) - até 3 botões via services/buttons.js
// Mantém IDs iguais aos comandos já existentes do SYZYGY, não quebra nada

import { sendInteractiveList, getListId } from "../services/list.js"
// [v57] Transporte do MENU PRINCIPAL = MESMA implementação do menu de GRUPOS
// (referência funcional no aparelho): enviarMensagemInterativa + criarBotao.
import { enviarMensagemInterativa } from "../services/interactiveService.js"
import { criarBotao } from "../utils/botoes.js"
import { TEXT_TO_ACTION } from "../commands/commandMap.js"
import { CONFIG_OPCOES } from "./configMenu.js"
import { STATUS_MENU_MAP } from "../features/statusManager/index.js"
import { getSock, rt } from "../connection/socket.js"
import { CONFIG, FLOOD_MODOS } from "../utils/config.js"
import { safeSendMessage } from "../services/groupService.js"
import { ok, err, warn, info } from "../utils/terminalUI.js"

// =========================================================
// 1. TODOS OS COMANDOS REAIS DO SYZYGY
// Formato: { id, title, description, categoria }
// IDs são os mesmos do dispatcher (TEXT_TO_ACTION e roteadorAcoes)
// =========================================================
export const COMANDOS = [
    // Grupos & Listagem
    { id: "painel_listar_grupos", title: "Listar Grupos", description: "Ver grupos admin/membro organizados", categoria: "Grupos" },
    { id: "painel_multi", title: "Multi (Lote)", description: "Selecionar vários 1,3,5 ou 1-5", categoria: "Grupos" },
    { id: "cfg_limpar_fantasmas", title: "Limpar Fantasmas", description: "Remove grupos que bot saiu", categoria: "Grupos" },
    { id: "cfg_list_groups", title: "Listar Grupos Autz", description: "Ver grupos autorizados blindados", categoria: "Grupos" },
    { id: "cfg_status", title: "Status", description: "Ver status completo online", categoria: "Grupos" },

    // Ataque & Domínio
    { id: "painel_flood", title: "🌊 FLOOD", description: `Envio massivo · ${FLOOD_MODOS[CONFIG.floodModo]?.label || "normal"}`, categoria: "Ataque" },
    { id: "painel_tudo", title: "Preset + NUKE", description: "Aplica preset + remove todos", categoria: "Ataque" },
    { id: "painel_roubar", title: "Roubar Grupo", description: "Tira ADM todos, fecha e domina", categoria: "Ataque" },
    { id: "fast_flood_help", title: "Flood Rápido", description: "Ex: 2/01/Oi/20/1", categoria: "Ataque" },
    { id: "painel_flood_presets", title: "Flood Presets", description: "text · mention · media · payment", categoria: "Ataque" },
    { id: "cfg_flood_targets", title: "Flood Alvos", description: "escolher grupos (1,3,5)", categoria: "Ataque" },
    { id: "flood_preset_payment_test", title: "Payment Test", description: "💳 payment-test no alvo selecionado", categoria: "Ataque" },
    { id: "cfg_flood_tipo", title: "Flood Tipo", description: "padrão: texto ⇄ pagamento", categoria: "Ataque" },
    { id: "cfg_flood_kill", title: "Flood Kill", description: "🛑 parar tudo na fronteira do lote", categoria: "Ataque" },
    { id: "cfg_flood_xray", title: "Flood Raio-X", description: "teto · job · cooldown · alvos", categoria: "Ataque" },
    { id: "fast_flood_preset_help", title: "Preset Rápido", description: "Ex: 2/preset/payment-test", categoria: "Ataque" },
    { id: "fast_nuke_help", title: "Nuke Rápido", description: "Ex: 3/01/2/Oi", categoria: "Ataque" },
    { id: "fast_roubar_help", title: "Roubar Rápido", description: "Ex: 4/01/2", categoria: "Ataque" },
    { id: "fast_multi_flood_help", title: "Multi Flood", description: "Ex: 6/1,3,5/1/Oi/20/1", categoria: "Ataque" },
    { id: "fast_multi_nuke_help", title: "Multi Nuke", description: "Ex: 6/1-5/2/2/Oi", categoria: "Ataque" },

    // Presets & Mídia
    { id: "cfg_criar_preset", title: "Criar Preset", description: "Salvar nome+bio+foto", categoria: "Presets" },
    { id: "cfg_apagar_preset", title: "Apagar Preset", description: "Remover preset salvo", categoria: "Presets" },
    { id: "cfg_menuImage", title: "Alterar Imagem Menu", description: "Mudar foto menu (dono)", categoria: "Presets" },
    { id: "cfg_list_presets", title: "Listar Presets", description: "Ver presets salvos", categoria: "Presets" },

    // Config Sistema
    { id: "cfg_link", title: "Link Divulgação", description: "Setar link/canal", categoria: "Config" },
    { id: "cfg_ler_mais", title: "Ler Mais", description: "Toggle dobrar mensagens após título", categoria: "Config" },
    { id: "cfg_fantasma", title: "Marcar Fantasma", description: "Toggle mencionar invisível", categoria: "Config" },
    { id: "cfg_flood_modo", title: "Flood Modo", description: "rapido/normal/lento/seguro", categoria: "Config" },
    { id: "cfg_flood_interval", title: "Flood Intervalo", description: "20-5000ms custom", categoria: "Config" },
    { id: "cfg_flood_lote", title: "Flood Lote", description: "1-20 msgs por lote", categoria: "Config" },
    { id: "cfg_flood_speed", title: "Flood Velocidade", description: "modo + intervalo + lote", categoria: "Config" },
    { id: "cfg_autolimpeza", title: "Auto-Limpeza", description: "Toggle limpeza fantasmas", categoria: "Config" },
    { id: "cfg_antitakeover", title: "Anti-Takeover", description: "Toggle proteção ADM", categoria: "Config" },
    { id: "cfg_owner", title: "Ver Proprietário", description: "Ver dono", categoria: "Config" },
    { id: "cfg_number", title: "Número Conectado", description: "Ver número bot", categoria: "Config" },
    { id: "cfg_restart", title: "Atualizar Menu", description: "Voltar ao menu principal", categoria: "Config" },

    // Permissões & Segurança
    { id: "cfg_add_user", title: "Add ADM Bot", description: "Dar ADM por número", categoria: "Permissoes" },
    { id: "cfg_remove_user", title: "Remover ADM Bot", description: "Remover ADM", categoria: "Permissoes" },
    { id: "cfg_list_users", title: "Listar ADMs Bot", description: "Ver ADMs autorizados", categoria: "Permissoes" },
    { id: "cfg_add_group", title: "Add Grupo Autz", description: "Liberar bot em grupo blindado", categoria: "Permissoes" },
    { id: "cfg_remove_group", title: "Remover Grupo Autz", description: "Remover grupo autorizado", categoria: "Permissoes" },
    { id: "cfg_list_groups", title: "Listar Grupos Autz", description: "Ver grupos autorizados", categoria: "Permissoes" },
    { id: "cfg_add_owner", title: "Add Dono Extra", description: "Add dono poder total", categoria: "Permissoes" },
    { id: "cfg_remove_owner", title: "Remover Dono Extra", description: "Remover dono extra", categoria: "Permissoes" },
    { id: "cfg_list_owners", title: "Listar Donos", description: "Ver todos donos", categoria: "Permissoes" },

    // ViewOnce & Histórico
    { id: "cfg_historico", title: "Histórico", description: "Últimas 20 ações", categoria: "ViewOnce" },
    { id: "cfg_relatorio", title: "Relatório Completo", description: "Status detalhado", categoria: "ViewOnce" },
    { id: "cfg_agendamentos", title: "Agendamentos", description: "Ver agendamentos pendentes", categoria: "ViewOnce" },
    { id: "cfg_limpar_agendamentos", title: "Limpar Agendamentos", description: "Remove concluídos", categoria: "ViewOnce" },
    { id: "cfg_viewonce_toggle", title: "ViewOnce ON/OFF", description: "Toggle ViewOnce", categoria: "ViewOnce" },
    { id: "cfg_viewonce_groups", title: "ViewOnce → Grupos", description: "Toggle envio pra grupos", categoria: "ViewOnce" },
    { id: "cfg_viewonce_owner", title: "ViewOnce → Owner", description: "Toggle envio pro dono", categoria: "ViewOnce" },
    { id: "cfg_viewonce_admins", title: "ViewOnce → ADMs", description: "Toggle envio pros ADMs", categoria: "ViewOnce" },
    { id: "cfg_viewonce_save", title: "ViewOnce Salvar", description: "Buffer vs disco com delete", categoria: "ViewOnce" },

    // Rápido & Agendamento
    { id: "fast_config_help", title: "Config Rápido", description: "Ex: 5/10/rapido, 5/20/num", categoria: "Rapido" },
    { id: "fast_agendar_help", title: "Agendar Rápido", description: "Ex: 3/01/2/Oi@10m", categoria: "Rapido" },

    // [v41] Status Manager
    { id: "status_menu", title: "Status Manager", description: "Criar e publicar Status", categoria: "Status" },
    { id: "status_texto", title: "Status Texto", description: "Rascunho de texto (cor/fonte)", categoria: "Status" },
    { id: "status_imagem", title: "Status Imagem", description: "Enviar foto como status", categoria: "Status" },
    { id: "status_video", title: "Status Vídeo", description: "Enviar vídeo (~30s)", categoria: "Status" },
    { id: "status_audiencia", title: "Audiência do Status", description: "Somente compartilhar com...", categoria: "Status" },
    { id: "status_ver", title: "Ver Config Status", description: "Audiência, fila e padrões", categoria: "Status" },
    { id: "status_publicar", title: "Publicar Status", description: "Publica a fila agora", categoria: "Status" },
    { id: "status_cancelar", title: "Cancelar Status", description: "Aborta/limpa publicação", categoria: "Status" },
    { id: "status_erros", title: "Erros de Status", description: "Últimos erros do módulo", categoria: "Status" }
]

// Função que divide automaticamente em sections de 25 (limite WhatsApp)
// [v50] NÚMEROS REAIS de navegação de cada comando — descobertos do próprio
// sistema (nada inventado): commandMap numérico (painel 1-8), CONFIG_OPCOES
// (config 6>1-11 · dono 5>12-46) e mapa do Status (7>1-11). Comando sem
// número no sistema não ganha número.
const NUM_PAINEL = {}
for (const [k, v] of Object.entries(TEXT_TO_ACTION)) {
    if (/^\d{1,2}$/.test(k) && v !== "owner_sair" && !NUM_PAINEL[v]) NUM_PAINEL[v] = String(Number(k))
}
const NUM_CONFIG = {}
for (const [k, v] of Object.entries(CONFIG_OPCOES)) if (v !== "abrir_painel") NUM_CONFIG[v] = Number(k)
const NUM_STATUS = {}
for (const [k, v] of Object.entries(STATUS_MENU_MAP)) NUM_STATUS[v] = Number(k)
export function numeroNavegacao(id) {
    if (NUM_PAINEL[id] != null) return NUM_PAINEL[id]
    if (NUM_CONFIG[id] != null) return NUM_CONFIG[id] >= 12 ? `5>${NUM_CONFIG[id]}` : `6>${NUM_CONFIG[id]}`
    if (NUM_STATUS[id] != null) return `7>${NUM_STATUS[id]}`
    return null
}

export function criarSections(listaComandos) {
    const sections = []
    const porCategoria = {}

    // Agrupa por categoria
    listaComandos.forEach(cmd => {
        if (!porCategoria[cmd.categoria]) porCategoria[cmd.categoria] = []
        porCategoria[cmd.categoria].push(cmd)
    })

    // Cria sections de 25 em 25
    for (const cat in porCategoria) {
        const cmds = porCategoria[cat]
        for (let i = 0; i < cmds.length; i += 25) {
            const fatia = cmds.slice(i, i + 25)
            sections.push({
                title: `${cat}${i > 0 ? ` (${i / 25 + 1})` : ""}`,
                rows: fatia.map(c => {
                    const n = numeroNavegacao(c.id)
                    return { title: c.title, description: n ? `[${n}] ${c.description}` : c.description, id: c.id }
                })
            })
        }
    }
    return sections
}

// =========================================================
// 2. MENU PRINCIPAL - Se tiver +100 comandos, mostra categorias (PAGINAÇÃO)
// =========================================================
export async function enviarMenuPrincipal(jid) {
    const categorias = [...new Set(COMANDOS.map(c => c.categoria))]

    // [v57] CORREÇÃO DO BOTÃO NÃO CLICÁVEL: o menu principal usava o transporte
    // do list.js, cujo single_select sai como {title, sections} com rows só com
    // rowId — no cliente o botão RENDERIZA mas o toque não abre o picker. A
    // lista de GRUPOS (referência funcional no aparelho) usa
    // enviarMensagemInterativa + criarBotao("single_select"), cujo
    // buttonParamsJson sai como {title, text, buttonText, sections} com rows
    // {id, rowId}. Este menu agora usa EXATAMENTE essa implementação — só os
    // DADOS mudam (mesmas seções/ids/ações de COMANDOS; navegação por números
    // e ids preservados; modo text continua caindo para texto com opções).
    if (COMANDOS.length <= 100) {
        const botoes = [criarBotao("single_select", {
            title: "MENU COMPLETO",
            text: `${COMANDOS.length} comandos · ${categorias.length} categorias`,
            buttonText: "ABRIR LISTA",
            sections: criarSections(COMANDOS)
        })]
        return enviarMensagemInterativa(
            jid,
            `*SYZYGY MENU*\nTotal: ${COMANDOS.length} comandos\nOrganizado em ${categorias.length} categorias`,
            botoes
        )
    }

    // Se tem +100, cria menu de categorias (PAGINAÇÃO OBRIGATÓRIA)
    const rows = categorias.map(cat => ({
        title: cat,
        description: `${COMANDOS.filter(c => c.categoria === cat).length} comandos`,
        id: `cat_${cat.toLowerCase()}`
    }))

    // Adiciona voltar/sair
    rows.push({ title: "🚪 Sair", description: "Fechar painel", id: "owner_sair" })

    const botoes = [criarBotao("single_select", {
        title: "MENU PRINCIPAL",
        text: `${COMANDOS.length} comandos`,
        buttonText: "VER CATEGORIAS",
        sections: [{ title: "CATEGORIAS", rows }]
    })]
    return enviarMensagemInterativa(
        jid,
        `*SYZYGY MENU*\n${COMANDOS.length} comandos encontrados.\nEscolha uma categoria:`,
        botoes
    )
}

// =========================================================
// 3. SUB-LISTAS - Uma para cada categoria, até 100 comandos, sections de 25
// =========================================================
export async function enviarSubLista(jid, categoriaNome) {
    const sock = getSock()
    const filtrados = COMANDOS.filter(c => c.categoria.toLowerCase() === categoriaNome.toLowerCase())

    if (filtrados.length === 0) {
        await safeSendMessage(jid, { text: `❌ Categoria não encontrada: ${categoriaNome}` }, 0)
        return false
    }

    const sections = criarSections(filtrados)

    // IMPORTANTE: Sempre adiciona botão voltar no final de toda sub-lista
    sections.push({
        title: "Navegação",
        rows: [{ title: "⬅️ Voltar ao Menu", description: "Voltar ao menu principal", id: "voltar_menu" }]
    })

    return sendInteractiveList(sock, jid, {
        title: categoriaNome.toUpperCase(),
        body: `*${categoriaNome}*\n${filtrados.length} comandos nesta categoria\nDividido em sections de até 25`,
        footer: `${filtrados.length} opções`,
        buttonText: "VER COMANDOS",
        sections
    })
}

// Funções específicas por categoria (para compatibilidade com spec)
export async function enviarListaGrupos(jid) { return enviarSubLista(jid, "Grupos") }
export async function enviarListaAtaque(jid) { return enviarSubLista(jid, "Ataque") }
export async function enviarListaPresets(jid) { return enviarSubLista(jid, "Presets") }
export async function enviarListaConfig(jid) { return enviarSubLista(jid, "Config") }
export async function enviarListaPermissoes(jid) { return enviarSubLista(jid, "Permissoes") }
export async function enviarListaViewOnce(jid) { return enviarSubLista(jid, "ViewOnce") }
export async function enviarListaRapido(jid) { return enviarSubLista(jid, "Rapido") }

// [v56] handleListClick (2º despachante da era v36) REMOVIDO DEFINITIVAMENTE:
// zero chamadas desde a v53 (despacho único = tratarInteracao → roteadorAcoes,
// no messageHandler). Despachante paralelo morto = risco de duplo consumo.
// Parser único de interações: getListId (list.js) → tratarInteracao (interactionHandler).

// [v52] LISTA REAL DE COMANDOS — enviada quando o usuário toca "Mostrar lista"
// (clientes que não abrem o picker nativo devolvem a interação sem id → o
// roteador chama "mostrar_lista" → esta função). Mesma fonte de dados:
// COMANDOS/categorias reais + números reais de navegação.
export async function enviarListaComandos(jid) {
    const sock = getSock()
    const categorias = [...new Set(COMANDOS.map(c => c.categoria))]
    return sendInteractiveList(sock, jid, {
        title: "LISTA DE COMANDOS",
        body: `*SYZYGY MENU*\nTotal: ${COMANDOS.length} comandos\nOrganizado em ${categorias.length} categorias\nSelecione uma opção`,
        footer: "Selecione uma opção",
        buttonText: "MOSTRAR LISTA",
        sections: criarSections(COMANDOS)
    })
}

// Wrapper para compatibilidade com código antigo que espera enviarMenuPrincipal(jid)
export async function enviarMenuPrincipalWrapper(jid) {
    return enviarMenuPrincipal(jid)
}

// Exporta categorias para uso externo (paginação)
export const CATEGORIAS = {
    grupos: { titulo: "📋 Grupos & Listagem", descricao: "Gerenciamento de grupos", rows: COMANDOS.filter(c => c.categoria === "Grupos") },
    ataque: { titulo: "💣 Ataque & Domínio", descricao: "Flood, Nuke, Roubar", rows: COMANDOS.filter(c => c.categoria === "Ataque") },
    presets: { titulo: "🎨 Presets & Mídia", descricao: "Nome, bio, foto, presets", rows: COMANDOS.filter(c => c.categoria === "Presets") },
    config: { titulo: "⚙️ Configurações Sistema", descricao: "Flood, limpeza, anti-takeover", rows: COMANDOS.filter(c => c.categoria === "Config") },
    permissoes: { titulo: "🔐 Permissões & Segurança", descricao: "ADMs, grupos autz, donos extras", rows: COMANDOS.filter(c => c.categoria === "Permissoes") },
    viewonce: { titulo: "👁️ ViewOnce & Histórico", descricao: "ViewOnce, logs, agendamentos", rows: COMANDOS.filter(c => c.categoria === "ViewOnce") },
    rapido: { titulo: "⚡ Modo Rápido", descricao: "Comandos com / e @", rows: COMANDOS.filter(c => c.categoria === "Rapido") },
    status: { titulo: "🫥 Status Manager", descricao: "Criar/publicar status com audiência", rows: COMANDOS.filter(c => c.categoria === "Status") }
}

// Funções antigas mantidas para compatibilidade (não quebra nada)
export async function sendMainInteractiveMenu(jid) { return enviarMenuPrincipal(jid) }
export async function sendCategoryInteractiveMenu(jid, catId) { return enviarSubLista(jid, catId) }
export async function sendFastHelpMenu(jid) { return enviarSubLista(jid, "Rapido") }
