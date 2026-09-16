// features/viewOnce/permissions.js
// [v33] Permissão ViewOnce: permite qualquer viewOnce recebido pelo bot, destinos controlados.

import { isOwner, isAuthorizedUser, isAuthorizedUserWithMap, isAuthorizedGroup } from "../../utils/permissions.js"
import { getLidMap } from "../../services/lidResolver.js"
import { VIEW_ONCE_CONFIG } from "./config.js"

export function canProcessViewOnce({ senderJid, chatJid, isGroup }) {
    if (!VIEW_ONCE_CONFIG.enabled) return { allowed: false, reason: "DISABLED" }

    try {
        const lidMap = getLidMap()

        // [v33] REGRA: qualquer ViewOnce recebido pelo número do bot deve ser salvo e encaminhado
        // Então permite sempre, independente de sender, desde que não seja do próprio bot (fromMe já filtrado)
        // Mas mantém log de quem enviou
        if (isOwner(senderJid) || isOwner(chatJid)) return { allowed: true, role: "owner", reason: "OWNER" }

        if (isAuthorizedUserWithMap(senderJid, lidMap) || isAuthorizedUser(senderJid)) {
            return { allowed: true, role: "admin", reason: "BOT_ADMIN" }
        }

        // Mesmo usuário comum que mandar viewOnce no PV do bot, encaminha para dono (útil)
        // E se mandar em grupo autorizado, também encaminha?
        // Vamos permitir qualquer origem, pois o destino é que é protegido
        return { allowed: true, role: "user", reason: "ANY_VIEWONCE" }

    } catch (e) {
        return { allowed: false, reason: "PERMISSION_CHECK_FAILED", error: e.message }
    }
}

export function canReceiveAsDestination({ jid, type }) {
    if (!jid) return false
    if (type === "group" && !jid.endsWith("@g.us")) return false
    if (type === "user" && !(jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid"))) return false
    return true
}
