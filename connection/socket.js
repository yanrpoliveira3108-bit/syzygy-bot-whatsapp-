// connection/socket.js
// [REORGANIZAÇÃO] Detentor do ÚNICO socket Baileys + estado global de runtime.
// Nenhum outro módulo deve chamar makeWASocket(): todos leem/escrevem aqui.
// Isso evita dependência circular (handlers -> socket <- connection) e garante
// que exista apenas UM socket, como no index.js original.

// [v46] Aplicador do "Ler mais" — usado no wrap ÚNICO de sendMessage abaixo,
// para que TODA mensagem longa do bot (menus, painéis e respostas de comandos)
// dobre logo após o título quando o dono liga a opção (CONFIG.lerMais).
import { aplicarLerMais } from "../utils/lerMais.js"

const runtime = {
    sock: null,
    isConnected: false,
    reconnectAttempts: 0,
    notificacaoOnlineEnviada: false,
    cachedGroups: {},
    groupSelectionCache: {},
    bootTime: Date.now(),

    isConnecting: false,
    connectionLock: false,
    pairingCodeRequested: false,

    sessionErrorLog: [],
    sessionRecoveryInProgress: false,
    lastSessionRecovery: 0,
    sessionRecoveryCount: 0
}

export function getSock() { return runtime.sock }
export function setSock(s) { runtime.sock = s }

// Acesso direto ao objeto de runtime para os módulos que precisam mutar flags.
export function rt() { return runtime }

// ============================================================
// REGISTRO DE MENSAGENS ENVIADAS PELO PRÓPRIO BOT
// ============================================================
// [CORREÇÃO] Em chat consigo mesmo (owner operando do próprio número), o WhatsApp
// devolve as mensagens que o BOT envia como eventos messages.upsert com
// fromMe:true. Sem distinguir, o bot processava o próprio texto (ex.: a lista de
// grupos) como se fosse input do usuário — causando "[GRUPO] Selecionado: [70]"
// e o loop de "Grupo não encontrado".
//
// Solução: registramos o ID de cada mensagem que ENVIAMOS e ignoramos o eco.
const outgoingIds = new Set()
const OUTGOING_MAX = 500

export function registrarEnvio(id) {
    if (!id) return
    outgoingIds.add(id)
    // Limita o tamanho do Set (evita crescimento infinito).
    if (outgoingIds.size > OUTGOING_MAX) {
        const first = outgoingIds.values().next().value
        outgoingIds.delete(first)
    }
}

export function foiEnviadoPeloBot(id) {
    return !!id && outgoingIds.has(id)
}

// Envolve sock.sendMessage e sock.relayMessage UMA vez para auto-registrar os
// IDs de tudo que o bot envia. Chamado logo após makeWASocket().
export function instalarRastreioDeEnvios(sock) {
    if (!sock || sock.__syzygyWrapped) return
    sock.__syzygyWrapped = true

    const origSend = sock.sendMessage?.bind(sock)
    if (origSend) {
        sock.sendMessage = async (jid, ...args) => {
            // [v46] LER MAIS: insere as linhas invisíveis ANTES do envio real.
            // Aplicado a texto e a legenda de mídia (menu com imagem), nunca ao
            // status@broadcast (o texto do status não deve ser dobrado).
            try {
                if (typeof jid === "string" && !jid.includes("status@broadcast") && args[0] && typeof args[0] === "object") {
                    const c = args[0]
                    if (typeof c.text === "string") c.text = aplicarLerMais(c.text)
                    else if (typeof c.caption === "string") c.caption = aplicarLerMais(c.caption)
                }
            } catch {}
            const res = await origSend(jid, ...args)
            try { registrarEnvio(res?.key?.id) } catch {}
            return res
        }
    }

    const origRelay = sock.relayMessage?.bind(sock)
    if (origRelay) {
        sock.relayMessage = async (jid, message, opts) => {
            try { registrarEnvio(opts?.messageId) } catch {}
            return await origRelay(jid, message, opts)
        }
    }
}
