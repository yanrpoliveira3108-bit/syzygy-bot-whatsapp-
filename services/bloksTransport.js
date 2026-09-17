// services/bloksTransport.js
// [v48] 🧱 HELPER CENTRAL BLOKS/A2UI — ÚNICA fonte de verdade do transporte
// de mensagens A2UI (Server Inspector). O bot só fornece o payload; toda a
// montagem/encapsulamento/serialização/relay vive AQUI.
//
// ANÁLISE DA CAUSA DA "MENSAGEM INCOMPATÍVEL" (v47) — corrigida na origem:
//  1. O patch interno do fork (patchMessageForMdIfRequired) testaria
//     `interactiveMessage.nativeFlowMesaage` (typo interno da lib) — logo
//     mensagens interactiveMessage/nativeFlowMessage NUNCA recebem o
//     messageContextInfo{deviceListMetadata} que o cliente espera →
//     "sua versão do WhatsApp não é compatível".
//  2. O nome do botão nativo usado ("bloks_widget") não é reconhecido pelo
//     cliente. O identificador do fluxo A2 é o PRÓPRIO nome do botão:
//     "im_a2ui", com o documento A2UI ({version, catalogId, layouts}) como
//     buttonParamsJson.
// CORREÇÃO: montagem manual com generateWAMessageFromContent:
//   viewOnceMessage → message → { messageContextInfo{deviceListMetadata:{},
//   deviceListMetadataVersion:2}, interactiveMessage{ header/body/footer,
//   nativeFlowMessage{ buttons[0] = { name:"im_a2ui", buttonParamsJson } } } }
//   e envio por relayMessage(jid, msg.message, { messageId }).
//
// O PAYLOAD A2UI passa INTACTO (não é reescrito/adaptado): apenas é
// serializado como JSON dentro do botão. Formato do documento A2UI:
//   { version: <n>, catalogId: "<id>", layouts: [...] }
// additionalNodes: relayMessage do fork aceita; nenhum nó é comprovadamente
// necessário para interactiveMessage (o patch MD da própria lib não os usa) —
// nada é adicionado "por tentativa". Se um dia for necessário, o ponto único
// de mudança é AQUI (param additionalNodes opcional).

import { generateWAMessageFromContent, generateMessageID } from "../connection/baileysCompat.js"
import { CONFIG } from "../utils/config.js"
import { ok, warn } from "../utils/terminalUI.js"

// Nome do botão native-flow que identifica uma superfície A2UI.
// (ponto único de configuração do formato de transmissão)
export const A2UI_BUTTON_NAME = "im_a2ui"

/**
 * Envia uma mensagem BLOKS/A2UI.
 * @param sock       socket Baileys (fork @lucasmod/boruto-vk7-baileys)
 * @param jid        destinatário
 * @param payload    { bloksWidget: { type: "im_a2ui", a2ui: { version, catalogId, layouts } } }
 *                   (contrato preservado do createServerInspectorData)
 * @param opts       { titulo, texto, footer, additionalNodes? }
 */
export async function sendBloksMessage(sock, jid, payload, opts = {}) {
    const dbg = (tag, msg) => { if (CONFIG.uiDebug) console.log(ok(`[${tag}] ${msg}`)) }

    // [A2UI] Payload recebido — documento A2UI extraído SEM alteração
    const a2ui = payload?.bloksWidget?.a2ui || payload?.a2ui || payload
    if (!a2ui || !Array.isArray(a2ui.layouts) || !a2ui.layouts.length) {
        throw new Error("payload A2UI inválido: faltam layouts")
    }
    if (!a2ui.catalogId) {
        throw new Error("payload A2UI inválido: falta catalogId")
    }
    dbg("A2UI", `payload recebido: ${a2ui.layouts.length} layouts, catalogId ${a2ui.catalogId}`)

    // [BLOKS] Montagem: viewOnceMessage + messageContextInfo (metadado que o
    // patch interno da lib NÃO injeta por causa do typo nativeFlowMesaage).
    const buttonParamsJson = JSON.stringify(a2ui)
    const content = {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadataVersion: 2,
                    deviceListMetadata: {}
                },
                interactiveMessage: {
                    header: {
                        title: opts.titulo || "Server Inspector",
                        subtitle: opts.subtitulo || "Live operating system information",
                        hasMediaAttachment: false
                    },
                    body: { text: opts.texto || "" },
                    footer: { text: opts.footer || "" },
                    nativeFlowMessage: {
                        buttons: [
                            { name: A2UI_BUTTON_NAME, buttonParamsJson }
                        ],
                        messageParamsJson: ""
                    },
                    contextInfo: { mentionedJid: [jid] }
                }
            }
        }
    }
    dbg("BLOKS", "interactiveMessage montado (viewOnce + messageContextInfo)")

    // Serialização pelo gerador oficial do fork (proto real).
    // [DIFERENÇA REAL DO FORK] o generateWAMessageFromContent do fork (@lucasmod)
    // não gera key.id (retorna key:{} — no whiskeysockets gerava "3EB0...").
    // Geramos aqui com generateMessageID do próprio fork.
    const messageId = generateMessageID(sock.user?.id)
    const msg = generateWAMessageFromContent(jid, content, {
        userJid: sock.user?.id || jid,
        quoted: null
    })
    dbg("A2UI", `gerado: messageId ${messageId}`)

    // [RELAY]
    dbg("RELAY", `relayMessage → ${jid}`)
    const r = await sock.relayMessage(jid, msg.message, {
        messageId,
        ...(opts.additionalNodes?.length ? { additionalNodes: opts.additionalNodes } : {})
    })
    dbg("RELAY", "relayMessage concluído")
    return r
}
