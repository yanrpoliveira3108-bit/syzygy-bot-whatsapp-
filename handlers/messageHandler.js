// handlers/messageHandler.js
// [v33] ViewOnce antes de auth + ADM LID imediato + grupos autorizados blindados + owner-only

import { getSock, rt, foiEnviadoPeloBot } from "../connection/socket.js"
import {
    isOwner, isGroupJid, normalizeNumber, getSenderJid, getChatJid,
    isAuthorizedUser, isAuthorizedGroup, isAuthorizedUserWithMap,
    getAuthorizedUsers, getAuthorizedGroups, ownerJidForSending
} from "../utils/permissions.js"
import { getState } from "../utils/stateManager.js"
import { CONFIG } from "../utils/config.js"
import { err, warn } from "../utils/terminalUI.js"
import { getLidMap } from "../services/lidResolver.js"

import { getInteractiveId, tratarInteracao } from "./interactionHandler.js"
import { handleEstado } from "./stateHandler.js"
import { detectarImagem } from "../services/mediaService.js"
import { TEXT_TO_ACTION } from "../commands/commandMap.js"
import { roteadorAcoes } from "../commands/commandRouter.js"
import { info } from "../utils/terminalUI.js"
import { getListId } from "../services/interactiveList.js"

function buscarPhoneDeLidEmCache(lidNum) {
    const cache = rt().cachedGroups || {}
    for (const g of Object.values(cache)) {
        const parts = g.participants || g._fullMeta?.participants || []
        if (!Array.isArray(parts)) continue
        for (const p of parts) {
            const pLid = normalizeNumber(p.lid || "")
            const pPhone = normalizeNumber(p.id || "")
            if (pLid === lidNum && pPhone) return pPhone
        }
    }
    return null
}

// [v52] Registro de interações JÁ processadas (dedupe anti-execução-dupla)
const interacoesProcessadas = new Set()
const INTERACOES_MAX = 500
function registrarInteracaoProcessada(id) {
    if (!id) return
    interacoesProcessadas.add(id)
    if (interacoesProcessadas.size > INTERACOES_MAX) {
        const first = interacoesProcessadas.values().next().value
        interacoesProcessadas.delete(first)
    }
}
function foiInteracaoProcessada(id) {
    return !!id && interacoesProcessadas.has(id)
}

// [v53] Última vez que cada (conversa|opção) foi processada — dedupe semântico
const ultimaInteracaoSemantica = new Map()

export function registrarMessageHandler(sock) {
    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            if (chatUpdate.type && chatUpdate.type !== "notify") return

            const m = chatUpdate.messages[0]
            if (!m || !m.message) return
            // [v41] Status (stories) recebidos não são input de comando — ignora.
            // Evita resposta automática a status de contatos (ex.: status com texto "menu").
            if (m.key?.remoteJid === "status@broadcast") return
            // CORREÇÃO JID: usa remoteJidAlt se tiver (fix @lid)
            const chatJid = getChatJid(m) || m.key.remoteJid
            if (!chatJid) return

            const fromMe = !!m.key.fromMe
            // [v55] DEDUPE GLOBAL POR key.id: o WhatsApp pode entregar a MESMA
            // mensagem 2x (retry/eco) com o MESMO id — seja texto, botão ou lista.
            // Um evento = uma execução, para qualquer tipo de mensagem.
            if (foiInteracaoProcessada(m.key?.id)) return
            registrarInteracaoProcessada(m.key?.id)
            // [v52] Parser ÚNICO de interações (getListId — lista/botões/template/
            // native flow). Antes: getInteractiveId(m) || getListId(m) — dois
            // parsers quase iguais podiam divergir e causar duplo caminho.
            let interactionId = getListId(m)
            // [v52] Tap no BOTÃO ("Mostrar lista") sem row selecionada: clientes
            // que não abrem o picker nativo devolvem a interactiveResponse SEM id
            // → o toque significa "quero a lista" (mostrar_lista).
            if (!interactionId && m.message?.interactiveResponseMessage) interactionId = "mostrar_lista"
            // [v52] DEDUPE: o WhatsApp pode entregar a mesma interação 2x (retry/
            // reenvio) → execuções duplicadas. Registro o id da mensagem e ignoro
            // repetições (cap 500, igual ao registro de envios).
            if (interactionId) {
                // (b) [v53] o mesmo TOQUE entregue 2x com key.ids DIFERENTES
                // (retry/eco do WhatsApp — causa global das respostas duplicadas):
                // mesma conversa + mesma opção dentro de 1,5s = a MESMA interação.
                const semKey = `${chatJid}|${interactionId}`
                const agora = Date.now()
                const ultima = ultimaInteracaoSemantica.get(semKey)
                if (ultima != null && agora - ultima < 1500) {
                    console.log(info("MENU", `interação duplicada ignorada (${interactionId} em ${chatJid})`))
                    return
                }
                ultimaInteracaoSemantica.set(semKey, agora)
                if (ultimaInteracaoSemantica.size > 500) {
                    for (const [k, ts] of ultimaInteracaoSemantica) {
                        if (agora - ts > 60000) ultimaInteracaoSemantica.delete(k)
                    }
                }
            }
            // [v51][DEBUG gated] Resposta interativa que NÃO gerou id → dump
            // das chaves p/ descobrir o formato real (ativa com "uiDebug": true).
            if (!interactionId && /interactive|list|buttons|template/i.test(Object.keys(m.message || {}).join(","))) {
                try {
                    const { CONFIG } = await import("../utils/config.js")
                    if (CONFIG.uiDebug) console.log(info("MENU-DEBUG", JSON.stringify(m.message).slice(0, 1500)))
                } catch {}
            }
            if (fromMe && !interactionId && foiEnviadoPeloBot(m.key.id)) return

            const isGroup = isGroupJid(chatJid)
            let sender = fromMe ? getSock().user?.id : getSenderJid(m)
            const senderNum = normalizeNumber(sender)
            const chatNum = normalizeNumber(chatJid)

            // [v33] ViewOnce - detecta ANTES de checar autorização, para qualquer viewOnce recebido pelo bot ser encaminhado
            try {
                const { detectViewOnce, handleViewOnceMessage } = await import("../features/viewOnce/index.js")
                const vo = detectViewOnce(m)
                if (vo) {
                    console.log(info("VIEW-ONCE", `Detectada tipo=${vo.mediaType} origem=${chatJid} sender=${senderNum} isGroup=${isGroup}`))
                    const res = await handleViewOnceMessage({ chatJid, senderJid: sender, isGroup, webMessageInfo: m })
                    if (res && res.processed) {
                        console.log(info("VIEW-ONCE", `ok tipo=${res.mediaType} destinos=${res.destinations.total} (grupos:${res.destinations.groups} owner:${res.destinations.owner} admins:${res.destinations.admins}) falhas=${res.failed || 0}`))
                        try {
                            const { safeSendMessage } = await import("../services/groupService.js")
                            await safeSendMessage(chatJid, { text: `✅ ViewOnce ${res.mediaType} → ${res.destinations.total} destinos (grupos:${res.destinations.groups} owner:${res.destinations.owner})${res.failed ? ` falhas:${res.failed}` : ""}` }, 0)
                        } catch {}
                    } else if (res && res.reason && res.reason !== "DISABLED" && res.reason !== "DUPLICATED") {
                        // [v43] Motivo da falha AGORA aparece no TERMINAL também (diagnóstico)
                        const dets = res.logs?.filter(l => String(l).includes("failed") || String(l).includes("download")).slice(0, 2).join(" | ")
                        console.log(warn(`[VIEW-ONCE] NÃO encaminhado: motivo=${res.reason} tipo=${res.mediaType} origem=${chatJid}${dets ? ` · ${dets}` : ""}`))
                        try {
                            const { safeSendMessage } = await import("../services/groupService.js")
                            await safeSendMessage(chatJid, { text: `⚠️ ViewOnce não encaminhado: ${res.reason}` }, 0)
                        } catch {}
                    }
                    return
                }
            } catch (e) {
                console.log(err(`[VIEW-ONCE] handler erro ${e.message}`))
            }

            let lidMap = null
            try { lidMap = getLidMap() } catch {}

            let isOwnerSender = isOwner(sender)
            let isAuthUserSender = isAuthorizedUserWithMap(sender, lidMap)
            let isOwnerChat = isOwner(chatJid)
            let isAuthUserChat = isAuthorizedUserWithMap(chatJid, lidMap)
            const isAuthGroup = isGroup && isAuthorizedGroup(chatJid)

            if (!isAuthUserSender && !isOwnerSender) {
                const phoneFromCache = buscarPhoneDeLidEmCache(senderNum)
                if (phoneFromCache && getAuthorizedUsers().includes(phoneFromCache)) {
                    isAuthUserSender = true
                }
            }
            if (!isAuthUserChat && !isOwnerChat && !isGroup) {
                const phoneFromCache2 = buscarPhoneDeLidEmCache(chatNum)
                if (phoneFromCache2 && getAuthorizedUsers().includes(phoneFromCache2)) {
                    isAuthUserChat = true
                }
            }

            const authorizedPV = !isGroup && (fromMe || isOwnerSender || isAuthUserSender || isOwnerChat || isAuthUserChat)
            const authorizedGroup = isGroup && isAuthGroup && (fromMe || isOwnerSender || isAuthUserSender)
            const authorized = authorizedPV || authorizedGroup

            const textRaw = (
                m.message.conversation ||
                m.message.extendedTextMessage?.text ||
                m.message.imageMessage?.caption ||
                m.message.documentMessage?.caption || ""
            ).trim()
            const textLower = textRaw.toLowerCase()

            if ((CONFIG.uiDebug || process.env.SYZYGY_UI_DEBUG === "1") && authorized) {
                console.log(`[AUTH] grupo=${isGroup} authGroup=${isAuthGroup} sender=${sender} senderNum=${senderNum} isOwner=${isOwnerSender} isAuth=${isAuthUserSender} chat=${chatJid} text=${textRaw.slice(0,40)}`)
            }

            if (!authorized) {
                if (!isGroup && (textLower === "!menu" || textLower === "menu" || textLower === "5" || textLower === "1")) {
                    try {
                        const lidInfo = sender ? `\nSeu ID: ${sender}\nNum: ${senderNum}` : ""
                        await getSock().sendMessage(chatJid, { text: `❌ Acesso negado.${lidInfo}\n\nAvisando o dono...` })
                    } catch {}
                    try {
                        const oj = ownerJidForSending()
                        if (oj && chatJid !== oj) {
                            await getSock().sendMessage(oj, { text: `⚠️ Tentativa negada\nDe: ${chatJid}\nSender: ${sender}\nNum: ${senderNum}\nTexto: ${textRaw}\n\nPara liberar imediato (dono):\n5 > 24 > ${senderNum}\nSe for LID:\n5 > 24 > ${sender}` })
                        }
                    } catch {}
                }
                return
            }

            if (interactionId) {
                await tratarInteracao(chatJid, senderNum, interactionId)
                return
            }

            // [v57] DEDUPE SEMÂNTICO DE COMANDO DE TEXTO: o mesmo comando pode
            // chegar 2x com key.ids DIFERENTES (eco multi-device do WhatsApp) —
            // mesma conversa + mesmo comando roteado dentro de 1,5s = 1 execução
            // (mesma política já aplicada às interações desde a v53).
            if (TEXT_TO_ACTION[textLower]) {
                const semCmdKey = `${chatJid}|cmd:${textLower}`
                const agoraCmd = Date.now()
                const ultimaCmd = ultimaInteracaoSemantica.get(semCmdKey)
                if (ultimaCmd != null && agoraCmd - ultimaCmd < 1500) {
                    console.log(info("MENU", `comando duplicado ignorado ("${textRaw}" em ${chatJid})`))
                    return
                }
                ultimaInteracaoSemantica.set(semCmdKey, agoraCmd)
                if (ultimaInteracaoSemantica.size > 500) {
                    for (const [k, ts] of ultimaInteracaoSemantica) {
                        if (agoraCmd - ts > 60000) ultimaInteracaoSemantica.delete(k)
                    }
                }
            }

            const st = getState(senderNum)
            const imgInfo = detectarImagem(m)

            const GLOBAIS = new Set(["menu_cancel", "abrir_painel", "menu_inicial", "owner_panel"])
            const acaoGlobal = TEXT_TO_ACTION[textLower]
            if (acaoGlobal && GLOBAIS.has(acaoGlobal)) {
                console.log(info("COMMAND", `Input="${textRaw}" -> ${acaoGlobal} grupo=${isGroup} sender=${senderNum}`))
                await roteadorAcoes(chatJid, senderNum, acaoGlobal)
                return
            }

            const mCancelarAg = textLower.match(/^(?:cancelar(?:_agendamento)?)\s+([a-z0-9]+)$/i)
            if (mCancelarAg) {
                const id = mCancelarAg[1]
                try {
                    const { listarAgendamentos, cancelarAgendamento } = await import("../services/agendaService.js")
                    let removido = cancelarAgendamento(id)
                    if (!removido) {
                        const lista = listarAgendamentos()
                        const found = lista.find(j => j.id.startsWith(id))
                        if (found) removido = cancelarAgendamento(found.id)
                    }
                    if (removido) {
                        await getSock().sendMessage(chatJid, { text: `✅ Agendamento ${removido.id.slice(0, 8)} cancelado.` })
                    } else {
                        await getSock().sendMessage(chatJid, { text: `⚠️ ID ${id} não encontrado.` })
                    }
                } catch (e) {
                    await getSock().sendMessage(chatJid, { text: `Erro: ${e.message}` })
                }
                return
            }

            const mAcaoRapida = textLower.match(/^a\s*([1-4])$/i)
            if (mAcaoRapida) {
                const alvo = (rt().grupoAlvo || {})[normalizeNumber(getSock().user?.id)] ||
                             (rt().grupoAlvo || {})["owner"] ||
                             Object.values(rt().grupoAlvo || {})[0]
                const chave = mAcaoRapida[1]
                if (chave === "1") {
                    await roteadorAcoes(chatJid, senderNum, "painel_listar_grupos")
                    return
                }
                if (!alvo) {
                    await getSock().sendMessage(chatJid, { text: "Nenhum grupo-alvo. Ganhe admin em um grupo primeiro, ou digite: menu" })
                    return
                }
                const mapaRapido = { "2": "waiting_flood_message", "3": "waiting_tudo_name", "4": "roubar_grupo" }
                const next = mapaRapido[chave]
                if (next) {
                    const { processarSelecaoGrupo } = await import("./stateHandler.js")
                    console.log(info("COMMAND", `AcaoRapida A${chave} -> ${next} em ${alvo.subject}`))
                    await processarSelecaoGrupo(chatJid, senderNum, next, { id: alvo.id, subject: alvo.subject, isAdmin: true })
                    return
                }
            }

            if (st && await handleEstado(chatJid, senderNum, st, textRaw, imgInfo, m)) return

            // [v53] DESPACHO ÚNICO DE INTERAÇÕES: o bloco v36 (handleListClick +
            // fallback inline, um SEGUNDO sistema de despacho com lógica própria)
            // foi REMOVIDO — interações fluem EXCLUSIVAMENTE por tratarInteracao
            // (interactionHandler → roteadorAcoes), no return lá em cima.
            // Uma interação = uma execução = uma resposta.

            if (textRaw.includes("/")) {
                try {
                    const { handleFastCommand } = await import("../services/fastParser.js")
                    const handled = await handleFastCommand(chatJid, senderNum, textRaw)
                    if (handled) return
                } catch (e) {
                    console.log(err(`[FAST] erro ${e.message}`))
                }
            }

            const actionText = TEXT_TO_ACTION[textLower]
            if (actionText) {
                console.log(info("COMMAND", `Input="${textRaw}" -> ${actionText} grupo=${isGroup} sender=${senderNum}`))
                await roteadorAcoes(chatJid, senderNum, actionText)
                return
            }

            // [v45] "status" textual removido — Status Manager é a opção 7;
            // status do bot continua em: botstatus / menu 6 > 3 / relatorio
        } catch (e) {
            console.log(err(`Handler erro: ${e.message}\n${e.stack}`))
        }
    })
}
