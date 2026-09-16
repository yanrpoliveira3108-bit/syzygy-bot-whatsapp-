// actions/groupActions.js
// [REORGANIZAÇÃO] Ações de confirmação de grupo (NUKE / remover foto) e a
// listagem textual de grupos (owner_grupos / painel_listar_grupos).
// Cada confirmação SÓ executa se o estado atual for o esperado (segurança).

import { rt } from "../connection/socket.js"
import { getState, clearState, setState } from "../utils/stateManager.js"
import { executarNuke, removerFotoGrupo } from "../services/groupService.js"
import { enviarVoltar, listarGruposInterativo } from "../menus/groupMenu.js"

// [v21] Comando "Listar Grupos" agora usa a lista ORGANIZADA (seções 👑/👤,
// contadores, paginação) e entra no estado de navegação. Você pode digitar o
// número de um grupo para abrir o menu de ações dele.
export async function listarGruposTexto(chatJid, ownerKey) {
    const cache = await listarGruposInterativo(chatJid)
    if (!cache) return
    if (ownerKey) {
        rt().groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "group_menu" })
    }
}

export async function confirmarNuke(chatJid, ownerKey) {
    const st = getState(ownerKey)
    if (!st || st.action !== "confirm_nuke") return
    try {
        const r = await executarNuke(st.groupJid)
        const mk = (b) => b ? "OK" : "-"
        // [v58] resumo com o motivo real das falhas (nada de "1 erro(s)" sem explicação)
        await enviarVoltar(chatJid, `✅ NUKE executado.\nFoto: ${mk(r.foto)} Nome: ${mk(r.nome)} Bio: ${mk(r.bio)}\nRemovidos: ${r.removidos}${r.erros.length ? `\n⚠️ ${r.erros.slice(0, 3).join(" · ").slice(0, 220)}` : ""}`)
    } catch (e) {
        await enviarVoltar(chatJid, `❌ ${e.message}`)
    }
    clearState(ownerKey)
}

export async function confirmarRemoverFoto(chatJid, ownerKey) {
    const st = getState(ownerKey)
    if (!st || st.action !== "confirm_rmfoto") return
    try {
        const okRem = await removerFotoGrupo(st.groupJid)
        await enviarVoltar(chatJid, okRem ? "✅ Foto removida." : "⚠️ Sem suporte.")
    } catch (e) {
        await enviarVoltar(chatJid, `❌ ${e.message}`)
    }
    clearState(ownerKey)
}
