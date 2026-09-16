// actions/floodActions.js
// [REORGANIZAÇÃO] Confirmação de FLOOD (flood_confirm_yes).
// Só executa se o estado atual for waiting_flood_confirm (segurança).

import { getState, clearState } from "../utils/stateManager.js"
import { executarFlood } from "../services/groupService.js"
import { enviarVoltar } from "../menus/groupMenu.js"

export async function confirmarFlood(chatJid, ownerKey) {
    const st = getState(ownerKey)
    if (!st || st.action !== "waiting_flood_confirm") return
    try {
        await executarFlood(st.groupJid, st.floodMessage, st.floodQtd)
        await enviarVoltar(chatJid, "✅ Flood finalizado.")
    } catch (e) {
        await enviarVoltar(chatJid, `❌ ${e.message}`)
    }
    clearState(ownerKey)
}
