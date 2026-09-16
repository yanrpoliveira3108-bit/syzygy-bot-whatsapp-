// handlers/groups.js
import { sendInteractive } from "../utils/menuBuilder.js"

const FOOTER = "SYZYGY • ZUCKERBERG • ARCANJOS ATK"

export async function listarGruposInterativo(sock, jid) {
    const grupos = await sock.groupFetchAllParticipating()
    const arr = Object.values(grupos)

    if (arr.length === 0) {
        await sock.sendMessage(jid, { text: "⚠️ O bot não está em nenhum grupo." })
        return null
    }

    const cache = {}
    const buttons = []

    const total = Math.min(arr.length, 10)
    for (let i = 0; i < total; i++) {
        const g = arr[i]
        const idx = i + 1
        cache[idx] = { id: g.id, subject: g.subject }
        const n = g.participants?.length || "-"
        buttons.push({
            text: `${String(idx).padStart(2, "0")} • ${g.subject.substring(0, 24)}`,
            id: `grp_select_${idx}`,
            description: `${n} membros`
        })
    }
    buttons.push({ text: "⬅️ VOLTAR", id: "abrir_painel", description: "Menu principal" })

    await sendInteractive(sock, jid, {
        title: "📋 SELECIONE O GRUPO",
        body: `📋 *GRUPOS DO BOT*\n\nToque em "SELECIONAR" e escolha o grupo alvo para aplicar a operação.`,
        footer: FOOTER,
        buttons,
        useList: true
    })

    return cache
}
