// services/interactiveService.js
// [CORREÇÃO] Envio de mensagens interativas NATIVAS (Native Flow) + extração de ID.
//
// PROBLEMA ORIGINAL:
// enviarMensagemInterativa() montava o interactiveMessage, mas com falhas que,
// no Baileys 7.0.0-rc14, fazem o cliente NÃO renderizar os botões — e o
// catch caía direto para o fallback de TEXTO. Resultado prático:
//   "botão -> texto", exatamente o bug relatado.
//
// CORREÇÕES APLICADAS (sem mudar a intenção — continua Native Flow real):
// 1. messageParamsJson agora recebe um JSON válido ('{}') em vez de "".
// Um paramsJson vazio pode invalidar o render do Native Flow no rc14.
// 2. Cada botão é validado/normalizado: garante buttonParamsJson como string.
// 3. O header sem mídia usa hasMediaAttachment:false explicitamente.
// 4. O fallback textual só dispara em falha REAL de envio, e loga o erro
// original (não engole silenciosamente). O ID textual continua clicável
// via TEXT_TO_ACTION, preservando o fallback textual exigido.
//
// Assim: BOTÃO REAL -> CLICK -> ID REAL -> getInteractiveId() -> roteador.
//
// [v54] RENDER: envelope espelhado EXATAMENTE no list.js (transporte provado
// no cliente real): proto.create() em Body/Footer/Header/NativeFlowMessage,
// SEM messageParamsJson (opcional no proto do fork — string vazia quebra o
// parse do flow no cliente) e SEM contextInfo.mentionedJid. UMA mensagem por
// interação; fallback de texto SOMENTE se o relayMessage lançar (substitui,
// nunca acompanha). Ver AUDITORIA-SYZYGY.md §23.

import fs from "fs"
import { getSock } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber, ownerJidForSending } from "../utils/permissions.js"
// [v53] uiModoEfetivo: "bloks"/"text" → texto (identidade TXT preservada);
// generateMessageID: o fork NÃO gera key.id (botão nascia morto).
import { uiModoEfetivo } from "../utils/config.js"
import { generateMessageID } from "../connection/baileysCompat.js"
import { CONFIG, MENU_IMAGE_PATH } from "../utils/config.js"
import { ok, err, warn, info } from "../utils/terminalUI.js"

// Normaliza um botão para o formato aceito pelo nativeFlowMessage.
// [CORREÇÃO single_select] Para botões "single_select", o WhatsApp exige que
// cada row possua a chave "rowId" (o contrato nativo da lista). Os builders do
// projeto usam "id" (que continua preservado, pois é o que o dispatcher lê no
// paramsJson de resposta). Aqui, ao serializar, garantimos "rowId" = "id" em
// TODAS as rows, sem alterar os builders nem os identificadores existentes.
function normalizarBotao(b) {
 if (!b || typeof b !== "object") return null
 const name = b.name || "quick_reply"
 let params = b.buttonParamsJson

    // Se vier objeto, serializa. Se vier string, parseia para poder enriquecer.
 let obj = null
 if (typeof params === "string") {
 try { obj = JSON.parse(params) } catch { obj = null }
    } else if (params && typeof params === "object") {
 obj = params
    }

 if (name === "single_select" && obj && Array.isArray(obj.sections)) {
        // [v57] rowIds DUPLICADOS confundem o picker (v49): o mesmo id pode
        // existir em 2 categorias legítimas (ex.: cfg_list_groups em Grupos e
        // Permissoes) — dedupe com sufixo "#n"; o handler já descarta o sufixo
        // (interactionHandler: split("#")[0]).
 const vistosRow = new Map()
 for (const sec of obj.sections) {
 if (!Array.isArray(sec.rows)) continue
 for (const row of sec.rows) {
                // rowId é a chave que o cliente usa para renderizar/retornar a seleção.
 if (row.id && !row.rowId) row.rowId = row.id
                // se por algum motivo só houver rowId, espelha para id (dispatcher).
 if (row.rowId && !row.id) row.id = row.rowId
                // description é opcional no proto, mas algumas versões exigem string.
 if (row.description == null) row.description = ""
                const chave = row.rowId || row.id
                if (chave) {
                    const n = (vistosRow.get(chave) || 0) + 1
                    vistosRow.set(chave, n)
                    if (n > 1) { row.rowId = `${chave}#${n}`; row.id = row.rowId }
                }
            }
        }
 params = JSON.stringify(obj)
    } else if (typeof params !== "string") {
 try { params = JSON.stringify(obj || {}) } catch { params = "{}" }
    }

 return { name, buttonParamsJson: params }
}

// Monta o texto de fallback (corpo + lista das opções clicáveis por número/nome).
function montarFallbackTexto(texto, botoesNorm) {
 let out = (texto && String(texto).trim().length > 0) ? (texto + "\n\n") : ""
 let temLista = false
 let temAcao = false
 for (const b of botoesNorm) {
 try {
 const p = JSON.parse(b.buttonParamsJson || "{}")
 if (p.sections) {
 for (const sec of p.sections) {
 if (sec.title) out += `\n*${sec.title}*\n`
 for (const row of (sec.rows || [])) {
                        // Mostra o título (já vem com o número, ex.: "01 Registrar Nome").
 out += `  ${row.title}\n`
 temLista = true
                    }
                }
            } else if (p.display_text) {
                // quick_reply / cta viram linhas de ação clicáveis por texto.
 out += `\n ${p.display_text}`
 temAcao = true
            }
        } catch {}
    }
 if (temLista) out += `\n_Digite o número da opção (ex: 01, 03, 12). "cancelar" para sair._`
 else if (temAcao) out += `\n\n_Responda com a opção desejada._`
 return out
}

export async function enviarMensagemInterativa(from, texto, botoes) {
 const sock = getSock()

    // Redireciona @lid para o JID real do telefone (visível no PV do owner).
 let targetJid = from || ownerJidForSending()
 if (typeof targetJid === "string" && targetJid.endsWith("@lid")) {
 targetJid = ownerJidForSending()
    }

 const botoesNorm = Array.isArray(botoes)
        ? botoes.map(normalizarBotao).filter(Boolean)
        : []

    // [v53] Modo via uiModoEfetivo() — mesma regra do resto do sistema.

    // Modo texto explícito, ou nada para enviar como botão.
 if (uiModoEfetivo() === "text" || botoesNorm.length === 0) {
 try {
 await sock.sendMessage(targetJid, { text: montarFallbackTexto(texto, botoesNorm) })
 console.log(ok(`[UI] Texto enviado para ${targetJid}`))
 return true
        } catch (eTxt) {
 console.log(err(`[UI] Falha ao enviar texto: ${eTxt.message}`))
 return false
        }
    }

    // ============================================================
    // [v53] UMA INTERAÇÃO = UMA RESPOSTA.
    // A antiga "ETAPA 1" (texto enviado SEPARADAMENTE antes dos botões) era um
    // workaround da era em que o relay não renderizava — com o transporte
    // corrigido (messageId real + envelope) ela virou a CAUSA GLOBAL da
    // duplicação "texto + botões". REMOVIDA: o texto vai DENTRO da mensagem
    // interativa (body.text); se o relay falhar, aí sim cai para texto simples.
    // ============================================================

    // ============================================================
    // ETAPA 2 — BOTÕES NATIVOS (estrutura ZERO-TWO: interactiveMessage +
    // nativeFlowMessage + imagem no header + relayMessage).
    // ============================================================
    // Esta é a MESMA engenharia do case 'menu' da ZERO-TWO que você forneceu:
    // viewOnceMessage -> interactiveMessage { body, footer, header(imagem),
    // nativeFlowMessage{ buttons } } enviado por relayMessage.
 try {
 // [v58] terminal limpo: detalhes de preparação só com uiDebug
 if (CONFIG.uiDebug) console.log(info("UI", `preparando interactiveMessage (nativeFlow + imagem)`))

 const { prepareWAMessageMedia, generateWAMessageFromContent, proto } =
 await import("../connection/baileysCompat.js")

        // Header com a imagem do menu (se existir). [v54] O title SEMPRE
        // permanece (igual list.js) — com ou sem mídia.
 let header = { title: " SYZYGY", hasMediaAttachment: false }
 try {
 const imgPath = CONFIG.menuImage || MENU_IMAGE_PATH
 if (imgPath && fs.existsSync(imgPath)) {
 const imgBuffer = fs.readFileSync(imgPath)
 const mediaMenu = await prepareWAMessageMedia(
                    { image: imgBuffer },
                    { upload: sock.waUploadToServer }
                )
 if (mediaMenu?.imageMessage) {
 header = { title: " SYZYGY", hasMediaAttachment: true, imageMessage: mediaMenu.imageMessage }
                }
            }
        } catch (eimg) {
 console.log(warn(`[UI] imagem do menu indisponível (${eimg.message})`))
        }

        // ============================================================
        // [v54] ENVELOPE IDÊNTICO AO list.js — o ÚNICO transporte de
        // mensagem interativa comprovado RENDERIZANDO no cliente real
        // (lista real do "Mostrar lista", v49-v52). Diferenças que a v53
        // introduziu e QUEBRAVAM o render dos botões, eliminadas:
        //   1. messageParamsJson: ""  → REMOVIDO. No proto do fork
        //      (@innovatorssoft/baileys 7.4.7) o campo é OPCIONAL
        //      (string|null); o list.js (que renderiza) não o envia.
        //      String vazia invalida o parse do flow no cliente.
        //   2. contextInfo.mentionedJid → REMOVIDO (list.js não envia;
        //      mencionar o JID dentro de interactiveMessage degrada o
        //      render/notificação no cliente).
        //   3. Objeto cru → proto.Message.InteractiveMessage.create()
        //      (+ Body/Footer/Header/NativeFlowMessage.create), igual ao
        //      list.js — serialização com os tipos/defaults do fork.
        // Quick_reply/single_select/cta continuam saindo por
        // nativeFlowMessage.buttons (contrato {name, buttonParamsJson}).
        // ============================================================
 const msg = generateWAMessageFromContent(targetJid, {
 viewOnceMessage: {
 message: {
 messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
 interactiveMessage: proto.Message.InteractiveMessage.create({
 body: proto.Message.InteractiveMessage.Body.create({ text: texto }),
 footer: proto.Message.InteractiveMessage.Footer.create({ text: "© SYZYGY ZUCKERBERG" }),
 header: proto.Message.InteractiveMessage.Header.create(header),
 nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
 buttons: botoesNorm
                        })
                    })
                }
            }
        }, {})

 const messageId = generateMessageID(sock.user?.id)
 const nomes = botoesNorm.map(b => b.name).join(", ")
 if (CONFIG.uiDebug) {
 console.log(info("UI", `interactiveMessage criado | header.img=${header.hasMediaAttachment}`))
 console.log(info("UI", `nativeFlow buttons=${botoesNorm.length} [${nomes}] | id=${messageId.slice(0, 8)}…`))
 }

 await sock.relayMessage(targetJid, msg.message, { messageId })
 // [v58] 1 linha por mensagem interativa (antes eram 5; verboso só com uiDebug)
 const jidCurto = `…${String(targetJid).split("@")[0].slice(-4)}`
 console.log(ok(`[UI] interativa → ${jidCurto} · botão(s) ${botoesNorm.length} [${nomes}] · ${header.hasMediaAttachment ? "img" : "sem img"} · ${messageId.slice(0, 8)}…`))
 return true
    } catch (error) {
 console.log(warn(`[UI] Native Flow falhou (${error.message}). Fallback texto...`))
 try {
 await sock.sendMessage(targetJid, { text: montarFallbackTexto(texto, botoesNorm) })
 console.log(ok(`[UI] Fallback (opções) enviado para ${targetJid}`))
 return true
        } catch (e2) {
 console.log(err(`[UI] Erro no fallback: ${e2.message}`))
        }
 return false
    }
}

// [PRESERVAÇÃO] Reconhece todos os formatos de resposta interativa suportados.
export function getInteractiveId(m) {
 if (!m || !m.message) return null
 const msg = m.message

 if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
 try {
 const p = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
            // [CORREÇÃO single_select] aceita id / rowId / selectedRowId / selectedId,
            // dependendo de como o cliente devolve a seleção da lista.
 return p.id || p.rowId || p.selectedRowId || p.selectedId || null
        } catch { return null }
    }
 if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
 return msg.listResponseMessage.singleSelectReply.selectedRowId
    }
 if (msg.buttonsResponseMessage?.selectedButtonId) {
 return msg.buttonsResponseMessage.selectedButtonId
    }
 if (msg.templateButtonReplyMessage?.selectedId) {
 return msg.templateButtonReplyMessage.selectedId
    }
 return null
}

// Helper de hora local (usado pelo painel inicial).
export function horaAtual() {
 const d = new Date()
 return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// Só reexportamos utilidades de número usadas pelos menus.
export { normalizeNumber, getOwnerNumber }
