// features/viewOnce/handler.js
// [v33] Detecção robusta de qualquer ViewOnce (imagem, vídeo, áudio, doc, sticker, ptt)

import { normalizeMessageContent, getContentType } from "../../connection/baileysCompat.js"
import { canProcessViewOnce } from "./permissions.js"
import { VIEW_ONCE_CONFIG } from "./config.js"

function isViewOnceMessage(message) {
    if (!message) return false
    if (message.viewOnceMessage || message.viewOnceMessageV2 || message.viewOnceMessageV2Extension) return true
    // Verifica se tem ephemeralMessage que contém viewOnce dentro
    if (message.ephemeralMessage?.message) {
        const innerEphem = message.ephemeralMessage.message
        if (innerEphem.viewOnceMessage || innerEphem.viewOnceMessageV2 || innerEphem.viewOnceMessageV2Extension) return true
    }
    // Verifica conteúdo normalizado com flag viewOnce
    try {
        const content = normalizeMessageContent(message)
        if (!content) return false
        const type = getContentType(content)
        if (!type) return false
        const inner = content[type]
        if (inner && inner.viewOnce === true) return true
        // Também checa se o tipo original tem viewOnce
        // Ex: imageMessage.viewOnce
        if (content.imageMessage?.viewOnce || content.videoMessage?.viewOnce || content.audioMessage?.viewOnce) return true
    } catch {}
    return false
}

function extractViewOnceContent(message) {
    if (!message) return null
    if (message.viewOnceMessage?.message) return message.viewOnceMessage.message
    if (message.viewOnceMessageV2?.message) return message.viewOnceMessageV2.message
    if (message.viewOnceMessageV2Extension?.message) return message.viewOnceMessageV2Extension.message
    if (message.ephemeralMessage?.message) {
        const inner = message.ephemeralMessage.message
        if (inner.viewOnceMessage?.message) return inner.viewOnceMessage.message
        if (inner.viewOnceMessageV2?.message) return inner.viewOnceMessageV2.message
        if (inner.viewOnceMessageV2Extension?.message) return inner.viewOnceMessageV2Extension.message
    }
    try {
        const normalized = normalizeMessageContent(message)
        if (normalized) return normalized
    } catch {}
    return null
}

function getMediaType(content) {
    if (!content) return null
    if (content.imageMessage) return "image"
    if (content.videoMessage) return "video"
    if (content.audioMessage) return "audio"
    if (content.documentMessage) return "document"
    if (content.stickerMessage) return "sticker"
    if (content.pttMessage) return "ptt"
    // Alguns áudios vêm como audioMessage mesmo
    return null
}

export function detectViewOnce(m) {
    if (!m || !m.message) return null
    const rawMessage = m.message

    if (!isViewOnceMessage(rawMessage)) return null

    const viewOnceContent = extractViewOnceContent(rawMessage)
    if (!viewOnceContent) return null

    const mediaType = getMediaType(viewOnceContent)
    if (!mediaType) {
        // Tenta detectar tipo mesmo sem ser um dos conhecidos (ex: documentWithCaption)
        const type = getContentType(viewOnceContent)
        if (type) {
            const possible = type.replace("Message", "")
            if (VIEW_ONCE_CONFIG.allowedTypes.includes(possible)) {
                return {
                    isViewOnce: true,
                    mediaType: possible,
                    viewOnceContent,
                    messageId: m.key?.id || null,
                    origin: m.key?.remoteJid || null,
                    participant: m.key?.participant || null,
                    raw: m
                }
            }
        }
        return null
    }

    if (!VIEW_ONCE_CONFIG.allowedTypes.includes(mediaType)) return null

    return {
        isViewOnce: true,
        mediaType,
        viewOnceContent,
        messageId: m.key?.id || null,
        origin: m.key?.remoteJid || null,
        participant: m.key?.participant || null,
        raw: m
    }
}

export async function handleViewOnceMessage({ chatJid, senderJid, isGroup, webMessageInfo }) {
    const detection = detectViewOnce(webMessageInfo)
    if (!detection) return { processed: false, reason: "NOT_VIEW_ONCE" }

    const perm = canProcessViewOnce({ senderJid, chatJid, isGroup })
    if (!perm.allowed) {
        if (VIEW_ONCE_CONFIG.logEvents) {
            console.log(`[VIEW-ONCE] Permissão negada sender=${senderJid} chat=${chatJid} reason=${perm.reason}`)
        }
        return { processed: false, reason: perm.reason, role: perm.role || null }
    }

    const { processViewOnce } = await import("./service.js")
    const result = await processViewOnce({
        webMessageInfo,
        viewOnceContent: detection.viewOnceContent,
        mediaType: detection.mediaType,
        origin: detection.origin,
        messageId: detection.messageId
    })

    return result
}
