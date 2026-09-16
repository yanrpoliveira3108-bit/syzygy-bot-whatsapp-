// handlers/menu.js
import { sendInteractive } from "../utils/menuBuilder.js"

const FOOTER = "SYZYGY • ZUCKERBERG • ARCANJOS ATK"

export async function enviarPainelInicial(sock, jid, ctx = {}) {
    const { num = "-", hora = "-" } = ctx

    const body = `╔══════════════════════════════════╗\n` +
                 `║          SYZYGY ONLINE           ║\n` +
                 `╠══════════════════════════════════╣\n` +
                 `║ 🟢 Status: ONLINE                ║\n` +
                 `║ 🤖 Sistema conectado.            ║\n` +
                 `║ 📱 Número: ${num}\n` +
                 `║ 👤 Owner: NYX                    ║\n` +
                 `║ 🕐 Conectado: ${hora}              ║\n` +
                 `╚══════════════════════════════════╝\n\n` +
                 `_ZUCKERBERG • ARCANJOS ATK_\n_NYX × ANTY DOMINA_`

    await sendInteractive(sock, jid, {
        title: "SYZYGY",
        body,
        footer: FOOTER,
        buttons: [{ text: "🎛️ ABRIR PAINEL", id: "abrir_painel" }],
        useList: false
    })
}

export async function enviarMenuPrincipal(sock, jid) {
    const body = `⚙️ *SYZYGY*\nPAINEL ADMINISTRATIVO\n\nToque em "SELECIONAR" para escolher uma opção.`

    const buttons = [
        { text: "01 • Registrar Nome",      id: "painel_registrar_nome",         description: "Alterar o nome do bot" },
        { text: "02 • Registrar Bio",       id: "painel_registrar_bio",          description: "Alterar a descrição do bot" },
        { text: "03 • Listar Grupos",       id: "painel_listar_grupos",          description: "Ver grupos ativos" },
        { text: "04 • NUKE",                id: "painel_nuke",                   description: "Destruir grupo (perigo)" },
        { text: "05 • Só Nome",             id: "painel_so_nome",                description: "Alterar apenas o nome" },
        { text: "06 • Só Bio",              id: "painel_so_bio",                 description: "Alterar apenas a bio" },
        { text: "07 • Nome + Bio",          id: "painel_nome_bio",               description: "Alterar ambos" },
        { text: "08 • FLOOD",               id: "painel_flood",                  description: "Envio de rajada" },
        { text: "09 • Foto do Grupo",       id: "painel_foto_grupo",             description: "Enviar arquivo" },
        { text: "10 • Foto por Link",       id: "painel_foto_link",              description: "Alterar usando URL" },
        { text: "11 • Remover Foto",        id: "painel_remover_foto",           description: "Remover foto do grupo" },
        { text: "12 • Configurações",       id: "painel_config",                 description: "Preferências do bot" }
    ]

    await sendInteractive(sock, jid, {
        title: "SYZYGY • PAINEL",
        body,
        footer: FOOTER,
        buttons,
        useList: true
    })
}

export async function enviarSubmenuConfig(sock, jid) {
    const body = `⚙️ *CONFIGURAÇÕES*\n\nSelecione uma opção abaixo:`

    const buttons = [
        { text: "🖼️ Alterar imagem do menu", id: "cfg_menuImage", description: "Enviar arquivo" },
        { text: "👤 Visualizar proprietário", id: "cfg_owner",     description: "Ver número do dono" },
        { text: "📱 Número conectado",       id: "cfg_number",    description: "Ver número do bot" },
        { text: "🟢 Status da conexão",      id: "cfg_status",    description: "Uptime e recursos" },
        { text: "🔄 Atualizar menu",         id: "cfg_restart",   description: "Voltar para o início" },
        { text: "⬅️ Voltar",                 id: "abrir_painel",  description: "Painel principal" }
    ]

    await sendInteractive(sock, jid, {
        title: "⚙️ CONFIGURAÇÕES",
        body,
        footer: FOOTER,
        buttons,
        useList: true
    })
}

export async function enviarConfirmacao(sock, jid, { titulo, texto, idConfirmar }) {
    await sendInteractive(sock, jid, {
        title: titulo,
        body: texto,
        footer: FOOTER,
        buttons: [
            { text: "✅ CONFIRMAR", id: idConfirmar },
            { text: "❌ CANCELAR",  id: "menu_cancel" }
        ],
        useList: false
    })
}

export async function enviarCancelavel(sock, jid, texto) {
    await sendInteractive(sock, jid, {
        title: "SYZYGY",
        body: texto,
        footer: FOOTER,
        buttons: [{ text: "❌ CANCELAR", id: "menu_cancel" }],
        useList: false
    })
}

export async function enviarVoltar(sock, jid, texto) {
    await sendInteractive(sock, jid, {
        title: "SYZYGY",
        body: texto,
        footer: FOOTER,
        buttons: [{ text: "⬅️ VOLTAR AO PAINEL", id: "abrir_painel" }],
        useList: false
    })
}

export async function enviarNotifNovoGrupo(sock, jid, info) {
    const { subject, groupJid, isAdmin } = info
    const body = `╭──────────────────────────────────╮\n` +
                 `│      NOVO GRUPO DETECTADO        │\n` +
                 `├──────────────────────────────────┤\n` +
                 `│ 🟢 O bot entrou em um grupo.     │\n` +
                 `│ 👥 Grupo: ${subject}\n` +
                 `│ 🆔 ID: ${groupJid}\n` +
                 `│ 🔐 Admin: ${isAdmin ? "SIM" : "NÃO"}\n` +
                 `╰──────────────────────────────────╯\n\n` +
                 `SYZYGY\n_ZUCKERBERG • ARCANJOS ATK_`
    try {
        await sock.sendMessage(jid, { text: body })
    } catch {}
}
