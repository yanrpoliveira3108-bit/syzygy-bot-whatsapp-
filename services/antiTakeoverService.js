// services/antiTakeoverService.js
// [v22] Proteção anti-takeover: detecta quando o bot perde admin, é removido,
// ou quando há mudanças suspeitas nos grupos.

import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, ownerJidForSending } from "../utils/permissions.js"
import { CONFIG } from "../utils/config.js"

let alertasRecentes = new Map() // groupJid -> timestamp último alerta (evita spam)

function podeAlertar(groupJid) {
    const ultimo = alertasRecentes.get(groupJid) || 0
    if (Date.now() - ultimo < 60 * 1000) return false // 1 alerta por minuto por grupo
    alertasRecentes.set(groupJid, Date.now())
    return true
}

export async function handlePerdaAdmin(groupJid, subject) {
    if (!CONFIG.antiTakeover) return
    if (!podeAlertar(groupJid)) return
    try {
        const sock = getSock()
        const oj = ownerJidForSending()
        if (!oj) return
        const { registrarAcao } = await import("./historicoService.js")
        registrarAcao("perda_admin", { id: groupJid, subject, alerta: true })
        await sock.sendMessage(oj, {
            text: `🚨 ANTI-TAKEOVER\nPerdi ADMIN em: ${subject || groupJid}\nID: ${groupJid}\n\nO bot foi rebaixado ou perdeu admin.\nAção rápida: digite A4 para tentar roubar de volta (se ainda tiver como).\n\nSYZYGY`
        })
    } catch {}
}

export async function handleRemovidoDoGrupo(groupJid, subject) {
    if (!CONFIG.antiTakeover) return
    try {
        const sock = getSock()
        const oj = ownerJidForSending()
        if (!oj) return
        const { registrarAcao } = await import("./historicoService.js")
        registrarAcao("removido_grupo", { id: groupJid, subject, alerta: true })
        // Remove do cache imediatamente
        if (rt().cachedGroups[groupJid]) delete rt().cachedGroups[groupJid]
        if (podeAlertar(groupJid)) {
            await sock.sendMessage(oj, {
                text: `🚨 ANTI-TAKEOVER\nFui REMOVIDO do grupo: ${subject || groupJid}\nID: ${groupJid}\n\nGrupo removido do cache.\nSYZYGY`
            })
        }
    } catch {}
}

export async function handlePromocaoSuspeita(groupJid, subject, promotedIds) {
    if (!CONFIG.antiTakeover) return
    if (!podeAlertar(groupJid + "_promo")) return
    try {
        const sock = getSock()
        const oj = ownerJidForSending()
        if (!oj) return
        // Se muitos admins promovidos de uma vez, pode ser takeover rival
        if (promotedIds.length >= 3) {
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("promocao_suspeita", { id: groupJid, subject, qtd: promotedIds.length })
            await sock.sendMessage(oj, {
                text: `⚠️ ANTI-TAKEOVER\nPromoção suspeita em: ${subject || groupJid}\n${promotedIds.length} novos admins de uma vez.\nID: ${groupJid}\n\nFique atento.\nSYZYGY`
            })
        }
    } catch {}
}

export function getStatusAntiTakeover() {
    return {
        ativo: !!CONFIG.antiTakeover,
        alertasRecentes: alertasRecentes.size,
        gruposMonitorados: Object.keys(rt().cachedGroups || {}).length
    }
}
