// actions/configActions.js
// [v24] Status com permissões

import { getSock, rt } from "../connection/socket.js"
import { setState } from "../utils/stateManager.js"
import { normalizeNumber, getOwnerNumber, getAuthorizedUsers, getAuthorizedGroups } from "../utils/permissions.js"
import { formatUptime } from "../utils/terminalUI.js"
import { enviarVoltar, enviarCancelavel } from "../menus/groupMenu.js"
import { enviarPainelInicial } from "../menus/mainMenu.js"

export async function cfgMenuImage(chatJid, ownerKey) {
    setState(ownerKey, { action: "waiting_menu_image" })
    await enviarCancelavel(chatJid, "🖼️ Envie a nova imagem do menu.")
}

export async function cfgOwner(chatJid) {
    await enviarVoltar(chatJid, `👤 Owner: NYX\n📱 ${getOwnerNumber()}`)
}

export async function cfgNumber(chatJid) {
    await enviarVoltar(chatJid, `📱 Conectado: ${normalizeNumber(getSock().user.id)}`)
}

export async function cfgStatus(chatJid) {
    try {
        const arr = Object.values(rt().cachedGroups)
        const admin = arr.filter(g => g.isAdmin).length
        const { CONFIG, FLOOD_MODOS } = await import("../utils/config.js")
        const { gerarRelatorio } = await import("../services/historicoService.js")
        const { listarAgendamentos } = await import("../services/agendaService.js")
        const rel = gerarRelatorio()
        const ag = listarAgendamentos()
        const pend = ag.filter(j => j.status === "pendente").length
        const modo = FLOOD_MODOS[CONFIG.floodModo] || { intervalo: CONFIG.floodInterval, lote: CONFIG.floodLote }
        let txt = `🟢 SYZYGY ONLINE\n`
        txt += `👥 Grupos: ${arr.length} (👑 ${admin} admin)\n`
        txt += `🕐 Uptime: ${formatUptime(Date.now() - rt().bootTime)}\n`
        txt += `🌊 Flood: ${CONFIG.floodModo} ${modo.intervalo}ms/lote${modo.lote}\n`
        txt += `📜 Histórico: ${rel.total} (${rel.ultimas24h} 24h)\n`
        txt += `⏰ Agendamentos: ${pend} pendentes / ${ag.length} total\n`
        txt += `👤 ADMs bot: ${getAuthorizedUsers().length} | 👥 Grupos autorizados: ${getAuthorizedGroups().length}\n`
        txt += `🧹 Auto-limpeza: ${CONFIG.autoLimpeza ? "ON" : "OFF"} | 🛡️ Anti: ${CONFIG.antiTakeover ? "ON" : "OFF"}\n`
        txt += `🌊 Presets: dry-run ${CONFIG.floodDryRun !== false ? "ON" : "OFF"} | kill ${CONFIG.floodKillSwitch ? "ON" : "OFF"} | allow ${(CONFIG.floodAllowlist || []).length}`
        await enviarVoltar(chatJid, txt)
    } catch (e) {
        const arr = Object.values(rt().cachedGroups)
        await enviarVoltar(
            chatJid,
            `🟢 SYZYGY ONLINE\n👥 Grupos: ${arr.length}\n👑 Admin: ${arr.filter(g => g.isAdmin).length}\n🕐 Uptime: ${formatUptime(Date.now() - rt().bootTime)}`
        )
    }
}

export async function cfgRestart(chatJid, ownerKey, clearState) {
    clearState(ownerKey)
    await enviarPainelInicial(chatJid)
}
