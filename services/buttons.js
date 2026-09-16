// services/buttons.js - V3 SEM viewOnceMessage (fix @lid)

import { generateWAMessageFromContent, generateMessageID, proto } from "../connection/baileysCompat.js"
import { getSock } from "../connection/socket.js"
import { CONFIG, uiModoEfetivo } from "../utils/config.js"
import { safeSendMessage } from "./groupService.js"
import { ok, err, warn } from "../utils/terminalUI.js"

export async function sendInteractiveButtons(sockParam, jid, options) {
    const sock = sockParam || getSock()
    const { title = "TÍTULO", body = "Descrição", footer = "Rodapé", buttons = [], image = null } = options

    const interactiveButtons = buttons.map(btn => {
        if (btn.type === 'reply') return { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id }) }
        if (btn.type === 'url') return { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: btn.text, url: btn.url, merchant_url: btn.url }) }
        if (btn.type === 'copy') return { name: "cta_copy", buttonParamsJson: JSON.stringify({ display_text: btn.text, copy_code: btn.code }) }
    }).filter(Boolean)

    let targetJid = jid

    if (uiModoEfetivo() === "text") {
        let txt = `*${title}*\n${body}\n\n`
        buttons.forEach(b => { txt += `• ${b.text} (id:${b.id})\n` })
        if (footer) txt += `\n_${footer}_`
        try {
            await safeSendMessage(targetJid, { text: txt }, 0)
            return true
        } catch { return false }
    }

    try {
        // [v51] mesmo envelope do BLOKS (funciona no cliente real) — ver list.js
        const content = {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: title.substring(0, 60),
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: interactiveButtons })
                    })
                }
            }
        }

        const msg = generateWAMessageFromContent(targetJid, content, {})
        // [v49] fork não gera key.id — messageId próprio (sem isso o botão renderiza morto)
        const messageId = generateMessageID(sock.user?.id)
        await sock.relayMessage(targetJid, msg.message, { messageId })
        console.log(`✓ [BUTTONS] ENVIADO SEM viewOnce -> ${targetJid} | ${buttons.length} botoes | id ${messageId.slice(0, 8)}…`)
        return true
    } catch (e) {
        console.log(err(`[BUTTONS] erro ${e.message}`))
        try {
            let txt = `*${title}*\n${body}\n`
            await safeSendMessage(targetJid, { text: txt }, 0)
            return true
        } catch { return false }
    }
}

// [v56] getButtonId removido: parser duplicado morto (zero chamadas).
// Parser ÚNICO de respostas interativas = getListId (services/list.js).
