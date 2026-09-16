// features/viewOnce/service.js
// [v33] Download em buffer (sem salvar no celular) + temp file opcional com delete + destinos por origem

import fs from "fs"
import path from "path"
import { getSock } from "../../connection/socket.js"
import { downloadMediaMessage } from "../../connection/baileysCompat.js"
import pino from "pino"
import { VIEW_ONCE_CONFIG } from "./config.js"
import { resolveDestinations } from "./destinations.js"
import { safeSendMessage } from "../../services/groupService.js"

const processedMessages = new Map()

function isDuplicated(messageId) {
    if (!messageId) return false
    const now = Date.now()
    for (const [id, ts] of processedMessages) {
        if (now - ts > VIEW_ONCE_CONFIG.dedupTtlMs) processedMessages.delete(id)
    }
    return processedMessages.has(messageId)
}

function markProcessed(messageId) {
    if (!messageId) return
    processedMessages.set(messageId, Date.now())
}

function getMediaTypeFromContent(content) {
    if (!content) return "unknown"
    if (content.imageMessage) return "image"
    if (content.videoMessage) return "video"
    if (content.audioMessage) return "audio"
    if (content.documentMessage) return "document"
    if (content.stickerMessage) return "sticker"
    if (content.pttMessage) return "ptt"
    return "unknown"
}

function getCaptionFromContent(content) {
    try {
        const type = getMediaTypeFromContent(content)
        const msg = content[`${type}Message`]
        if (!msg) return ""
        return msg.caption || msg.title || ""
    } catch { return "" }
}

async function baixarMidiaViewOnce(m) {
    // Hook para testes: se env MOCK_VO=1, retorna fake
    if (process.env.MOCK_VO === "1") return Buffer.from("fake viewonce data")
    const sock = getSock()
    try {
        const buffer = await downloadMediaMessage(m, "buffer", {}, {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage
        })
        return buffer
    } catch (e) {
        throw new Error(`MEDIA_DOWNLOAD_FAILED: ${e.message}`)
    }
}

function montarConteudoParaEnvio(buffer, mediaType, originalCaption, mimeType) {
    const captionBase = VIEW_ONCE_CONFIG.captionPrefix || ""
    const keepCaption = VIEW_ONCE_CONFIG.keepOriginalCaption ? (originalCaption || "") : ""
    const caption = (captionBase + (keepCaption ? `\n${keepCaption}` : "")).trim()

    const content = {}
    if (mediaType === "image") {
        content.image = buffer
        if (caption) content.caption = caption
        if (VIEW_ONCE_CONFIG.sendAsViewOnce) content.viewOnce = true
    } else if (mediaType === "video") {
        content.video = buffer
        if (caption) content.caption = caption
        if (VIEW_ONCE_CONFIG.sendAsViewOnce) content.viewOnce = true
    } else if (mediaType === "audio" || mediaType === "ptt") {
        content.audio = buffer
        content.mimetype = mimeType || "audio/ogg; codecs=opus"
        content.ptt = mediaType === "ptt" || mimeType?.includes("ogg")
    } else if (mediaType === "document") {
        content.document = buffer
        content.mimetype = mimeType || "application/octet-stream"
        if (caption) content.caption = caption
        content.fileName = `viewonce_${Date.now()}.${mimeType?.split("/")[1] || "bin"}`
    } else if (mediaType === "sticker") {
        content.sticker = buffer
    } else {
        content.document = buffer
        content.mimetype = mimeType || "application/octet-stream"
        content.fileName = `viewonce_${Date.now()}`
        if (caption) content.caption = caption
    }
    return content
}

export async function processViewOnce({ webMessageInfo, viewOnceContent, mediaType, origin, messageId }) {
    const result = {
        success: false,
        processed: false,
        mediaType: mediaType || "unknown",
        destinations: { groups: 0, admins: 0, owner: 0, total: 0 },
        failed: 0,
        reason: null,
        logs: [],
        savedTempFile: null
    }

    if (!VIEW_ONCE_CONFIG.enabled) {
        result.reason = "DISABLED"
        return result
    }

    if (messageId && isDuplicated(messageId)) {
        result.reason = "DUPLICATED"
        if (VIEW_ONCE_CONFIG.logEvents) console.log(`[VIEW-ONCE] Duplicada ignorada id=${messageId}`)
        return result
    }

    if (!VIEW_ONCE_CONFIG.allowedTypes.includes(mediaType)) {
        result.reason = "TYPE_NOT_ALLOWED"
        return result
    }

    let buffer = null
    try {
        buffer = await baixarMidiaViewOnce(webMessageInfo)
        result.logs.push("download_success")
    } catch (e) {
        result.reason = e.message.includes("MEDIA_DOWNLOAD_FAILED") ? "MEDIA_DOWNLOAD_FAILED" : "DOWNLOAD_ERROR"
        result.logs.push(`download_failed: ${e.message}`)
        if (VIEW_ONCE_CONFIG.logEvents) console.log(`[VIEW-ONCE] Falha download tipo=${mediaType} origem=${origin} erro=${e.message}`)
        return result
    }

    if (!buffer || buffer.length === 0) {
        result.reason = "EMPTY_MEDIA"
        return result
    }

    // [v33] Modo sem salvar no celular: se saveToDisk false, não salva arquivo, só buffer em memória
    // Se saveToDisk true, salva temp e depois apaga
    let tempFilePath = null
    if (VIEW_ONCE_CONFIG.saveToDisk) {
        try {
            const dir = VIEW_ONCE_CONFIG.tempDir || "./temp"
            try { fs.mkdirSync(dir, { recursive: true }) } catch {}
            const ext = mediaType === "image" ? "jpg" : mediaType === "video" ? "mp4" : mediaType === "audio" ? "ogg" : "bin"
            tempFilePath = path.join(dir, `vo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`)
            fs.writeFileSync(tempFilePath, buffer)
            result.savedTempFile = tempFilePath
            result.logs.push(`saved_temp:${tempFilePath}`)
        } catch (e) {
            result.logs.push(`save_temp_failed:${e.message}`)
        }
    }

    const captionOriginal = getCaptionFromContent(viewOnceContent)
    const mimeType = viewOnceContent[`${mediaType}Message`]?.mimetype || null
    const contentToSend = montarConteudoParaEnvio(buffer, mediaType, captionOriginal, mimeType)

    // [v33] Destinos por origem: PV -> só owner, Grupo -> só grupos autorizados
    const destinations = resolveDestinations({ origin, excludeJid: null })
    let destList = destinations.all

    // Filtra origem para não mandar de volta - só para grupos
    if (origin && origin.endsWith("@g.us")) {
        destList = destList.filter(d => !(d.type === "group" && d.jid === origin))
    }

    result.destinations.groups = destList.filter(d => d.type === "group").length
    result.destinations.admins = destList.filter(d => d.type === "admin").length
    result.destinations.owner = destList.filter(d => d.type === "owner").length
    result.destinations.total = destList.length

    if (destList.length === 0) {
        result.reason = "NO_DESTINATIONS"
        result.logs.push("no_destinations")
        // Apaga temp file se criou
        if (tempFilePath && VIEW_ONCE_CONFIG.deleteAfterSend) {
            try { fs.unlinkSync(tempFilePath); result.logs.push("deleted_temp") } catch {}
        }
        return result
    }

    let failed = 0
    for (const dest of destList) {
        try {
            await safeSendMessage(dest.jid, contentToSend, 0)
            result.logs.push(`sent:${dest.jid}`)
            await new Promise(r => setTimeout(r, 150))
        } catch (e) {
            failed++
            result.logs.push(`failed:${dest.jid}:${e.message}`)
            if (VIEW_ONCE_CONFIG.logEvents) console.log(`[VIEW-ONCE] Falha envio para ${dest.jid} erro=${e.message}`)
            continue
        }
    }

    // [v33] Apaga arquivo temp após envio
    if (tempFilePath && VIEW_ONCE_CONFIG.deleteAfterSend) {
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath)
                result.logs.push("deleted_temp_after_send")
            }
        } catch (e) {
            result.logs.push(`delete_failed:${e.message}`)
        }
    }

    result.failed = failed
    result.success = failed < destList.length
    result.processed = true

    if (messageId) markProcessed(messageId)

    if (VIEW_ONCE_CONFIG.logEvents) {
        console.log(`[VIEW-ONCE] Mensagem detectada\nTipo: ${mediaType}\nOrigem: ${origin}\nDestinos: ${destList.length} (grupos:${result.destinations.groups} admins:${result.destinations.admins} owner:${result.destinations.owner})\nStatus: ${result.success ? "success" : "partial"}\nFalhas: ${failed}\nSalvou em disco: ${VIEW_ONCE_CONFIG.saveToDisk ? "SIM (apagado depois)" : "NAO (só buffer)"}`)
    }

    try {
        const { registrarAcao } = await import("../../services/historicoService.js")
        registrarAcao("view_once", {
            mediaType,
            origem: origin,
            destinos: destList.length,
            grupos: result.destinations.groups,
            admins: result.destinations.admins,
            owner: result.destinations.owner,
            falhas: failed,
            success: result.success,
            savedDisk: VIEW_ONCE_CONFIG.saveToDisk
        })
    } catch {}

    return result
}

export function getProcessedCacheSize() {
    return processedMessages.size
}

export function clearProcessedCache() {
    processedMessages.clear()
}
