// services/list.js - V3 CORRIGIDO - SEM viewOnceMessage (fix @lid)
// Resolve 90% dos casos de lista não renderizar

import { generateWAMessageFromContent, generateMessageID, proto } from "../connection/baileysCompat.js"
import { getSock } from "../connection/socket.js"
import { CONFIG, MENU_IMAGE_PATH, uiModoEfetivo } from "../utils/config.js"
import fs from "fs"
import { safeSendMessage } from "./groupService.js"
import { ok, err, warn, info } from "../utils/terminalUI.js"

const MAX_ROWS_PER_SECTION = 25
const MAX_SECTIONS = 10

export async function sendInteractiveList(sockParam, jid, options) {
    const sock = sockParam || getSock()
    const { title = "MENU", body = "Selecione", footer = "Toque", buttonText = "VER OPÇÕES", sections = [], image = null } = options

    if (sections.length > MAX_SECTIONS) throw new Error(`Máximo ${MAX_SECTIONS} sections`)
    for (const sec of sections) {
        if (sec.rows.length > MAX_ROWS_PER_SECTION) throw new Error(`Section ${sec.title} com ${sec.rows.length} rows, máximo ${MAX_ROWS_PER_SECTION}`)
    }
    const totalRows = sections.reduce((a, s) => a + s.rows.length, 0)
    if (totalRows > 100) throw new Error(`Total ${totalRows} rows, máximo 100 - use categorias`)

    // CORREÇÃO 1: JID - usa o LID original se tiver, deixa Baileys resolver
    let targetJid = jid
    if (typeof jid === "string" && jid.includes("@lid")) {
        targetJid = jid
    }

    // [v55] DECISÃO CENTRAL DE MODO: uiModoEfetivo() é a ÚNICA autoridade
    // (config.json → uiMode: text|txt|bloks|buttons). Nada de checagem local.
    if (uiModoEfetivo() === "text") {
        let txt = `*${title}*\n${body}\n\n`
        for (const sec of sections) {
            if (sec.title) txt += `*${sec.title}*\n`
            for (const row of sec.rows) {
                txt += `  ${row.title}${row.description ? ` - ${row.description}` : ""} (id:${row.id})\n`
            }
            txt += "\n"
        }
        if (footer) txt += `_${footer}_\n`
        try {
            // [v43] Imagem anexada SEMPRE (PV e grupo), igual ao painel principal
            const pathImg = CONFIG.menuImage || MENU_IMAGE_PATH
            if (pathImg && fs.existsSync(pathImg)) {
                try {
                    const buf = fs.readFileSync(pathImg)
                    if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
                        await safeSendMessage(targetJid, { image: buf, caption: txt }, 0)
                        console.log(ok(`[LIST] menu texto+img enviado -> ${targetJid}`))
                        return true
                    }
                } catch (eImg) {
                    console.log(warn(`[LIST] imagem falhou (${eImg.message}) — texto puro`))
                }
            }
            await safeSendMessage(targetJid, { text: txt }, 0)
            console.log(ok(`[LIST] menu texto enviado -> ${targetJid} | ${sections.length} sections`))
            return true
        } catch (e) {
            console.log(err(`[LIST] falha fallback ${e.message}`))
            return false
        }
    }

    // CORREÇÃO 2: Remove viewOnceMessage - é isso que faz não aparecer em @lid
    try {
        // [v49] rowIds DUPLICADOS matam a lista no WhatsApp (ex.: cfg_list_groups
        // existe em 2 categorias) — o transporte dedupa com sufixo "#2"/"#3";
        // o handler descarta o sufixo ao rotear.
        const vistos = new Map()
        const formattedSections = sections.map(sec => ({
            title: (sec.title || "").substring(0, 24),
            rows: sec.rows.map(r => {
                let rowId = (r.id || "").substring(0, 100)
                if (rowId) {
                    const n = (vistos.get(rowId) || 0) + 1
                    vistos.set(rowId, n)
                    if (n > 1) rowId = `${rowId}#${n}`
                }
                return {
                    title: (r.title || "").substring(0, 24),
                    description: (r.description || "").substring(0, 72),
                    rowId
                }
            })
        }))

        // [v50] IMAGEM DO MENU (config.json → CONFIG.menuImage) no header do
        // menu interativo — mesma chamada que já funciona no interactiveService
        // deste fork: prepareWAMessageMedia({image}, {upload: waUploadToServer}).
        // Qualquer falha (sem arquivo/upload off) → header sem mídia (log), a
        // lista continua interativa (a imagem NÃO pode impedir a interação).
        let header = { title: (title || "").substring(0, 60), hasMediaAttachment: false }
        try {
            const pathImg = (typeof image === "string" && image) || CONFIG.menuImage || MENU_IMAGE_PATH
            if (pathImg && typeof pathImg === "string" && fs.existsSync(pathImg)) {
                const buf = fs.readFileSync(pathImg)
                if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
                    const { prepareWAMessageMedia } = await import("../connection/baileysCompat.js")
                    const media = await prepareWAMessageMedia({ image: buf }, { upload: sock.waUploadToServer })
                    if (media?.imageMessage) {
                        header = { title: (title || "").substring(0, 60), hasMediaAttachment: true, imageMessage: media.imageMessage }
                        console.log(ok("[LIST] imagem do menu (config.json) anexada ao header"))
                    }
                }
            }
        } catch (eImg) {
            console.log(warn(`[LIST] imagem no header falhou (${eImg.message}) — enviando sem mídia`))
            header = { title: (title || "").substring(0, 60), hasMediaAttachment: false }
        }

        // [v51] ENVELOPE que funciona no cliente real: idêntico ao do painel
        // BLOKS/A2UI (bloksTransport) confirmado funcionando no aparelho —
        // viewOnceMessage → message → messageContextInfo + interactiveMessage.
        // A versão anterior (interactiveMessage solto, sem wrapper) RENDERIZAVA
        // o botão mas a seleção não gerava resposta utilizável.
        const content = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                header: proto.Message.InteractiveMessage.Header.create(header),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    buttons: [
                        {
                            name: "single_select",
                            buttonParamsJson: JSON.stringify({
                                title: (buttonText || "VER OPÇÕES").substring(0, 24),
                                sections: formattedSections
                            })
                        }
                    ]
                })
                    })
            }
        }
        }

        const msg = generateWAMessageFromContent(targetJid, content, {})
        // [v49] O fork NÃO gera key.id (retorna key:{}) — sem messageId o
        // WhatsApp RENDERIZA o botão mas a interação nasce morta (não clicável).
        const messageId = generateMessageID(sock.user?.id)
        await sock.relayMessage(targetJid, msg.message, { messageId })
        console.log(`✓ [LIST] ENVIADO (envelope viewOnce v51) -> ${targetJid} | ${sections.length} sections | ${totalRows} rows | id ${messageId.slice(0, 8)}…`)
        return true
    } catch (e) {
        console.log(warn(`[LIST] falha V3 sem viewOnce ${e.message}, fallback texto`))
        try {
            let txt = `*${title}*\n${body}\n\n`
            for (const sec of sections) {
                txt += `*${sec.title}*\n`
                for (const row of sec.rows) txt += `  • ${row.title} (id:${row.id})\n`
                txt += "\n"
            }
            await safeSendMessage(targetJid, { text: txt }, 0)
            return true
        } catch { return false }
    }
}

// [v51] Parser ÚNICO de respostas interativas — cobre as estruturas que o
// fork @innovatorssoft/baileys 7.4.7 efetivamente entrega (interactiveResponse
// native flow, list clássica, buttons e template).
export function getListId(m) {
    if (!m || !m.message) return null
    const msg = m.message
    if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const p = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
            return p.id || p.rowId || p.selectedRowId || p.selectedId || null
        } catch { return null }
    }
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId
    try {
        const json = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
        if (json) return JSON.parse(json).id || null
    } catch {}
    return null
}

export { getListId as getInteractiveId }

export function chunkRowsToSections(rows, sectionTitlePrefix = "Opções") {
    const MAX_ROWS = 25
    const sections = []
    let secIndex = 1
    for (let i = 0; i < rows.length; i += MAX_ROWS) {
        const chunk = rows.slice(i, i + MAX_ROWS)
        const title = rows.length > MAX_ROWS ? `${sectionTitlePrefix} ${secIndex}` : sectionTitlePrefix
        sections.push({ title, rows: chunk })
        secIndex++
    }
    return sections
}

export function paginateRows(rows, maxPerList = 100) {
    const pages = []
    for (let i = 0; i < rows.length; i += maxPerList) {
        pages.push(rows.slice(i, i + maxPerList))
    }
    return pages
}
