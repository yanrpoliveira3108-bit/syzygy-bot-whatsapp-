// connection/sessionRecovery.js
// [REORGANIZAÇÃO] Detecção de erros de Signal/Session + recuperação de sessão.
// Constantes e comportamento preservados 1:1 do index.js.

import fs from "fs"
import { rt, setSock } from "./socket.js"
import { SESSAO_PATH, MAX_SESSION_ERRORS, SESSION_ERROR_WINDOW_MS, SESSION_RECOVERY_COOLDOWN_MS } from "../utils/config.js"
import { err, warn } from "../utils/terminalUI.js"

export function isSessionError(msg) {
    if (!msg) return false
    const s = String(msg).toLowerCase()
    return s.includes("bad mac")
        || s.includes("failed to decrypt message")
        || s.includes("session error")
        || s.includes("sessioncipher")
        || s.includes("libsignal")
        || s.includes("decrypted message with closed session")
        || s.includes("no matching sessions found")
        || s.includes("no session for user")
        || s.includes("invalid pdu")
}

export function registrarSessionError() {
    const r = rt()
    const now = Date.now()
    r.sessionErrorLog = r.sessionErrorLog.filter(t => now - t < SESSION_ERROR_WINDOW_MS)
    r.sessionErrorLog.push(now)
    return r.sessionErrorLog.length
}

export async function encerrarSocketAtual() {
    const sock = rt().sock
    if (!sock) return
    try {
        if (typeof sock.ev?.removeAllListeners === "function") {
            sock.ev.removeAllListeners()
        }
        if (typeof sock.end === "function") {
            try { sock.end(new Error("Reinicializando socket")) } catch {}
        }
        if (typeof sock.ws?.close === "function") {
            try { sock.ws.close() } catch {}
        }
    } catch {}
    setSock(null)
}

// iniciarConexao é injetado para evitar dependência circular com whatsapp.js.
let _iniciarConexao = null
export function setIniciarConexao(fn) { _iniciarConexao = fn }

export async function tentarRecuperacaoSessao(motivo = "sessão instável") {
    const r = rt()
    if (r.sessionRecoveryInProgress) return false
    const now = Date.now()
    if (now - r.lastSessionRecovery < SESSION_RECOVERY_COOLDOWN_MS) return false

    r.sessionRecoveryInProgress = true
    r.lastSessionRecovery = now
    r.sessionRecoveryCount++

    try {
        console.log(err(`[AUTH] Sessão corrompida detectada: ${motivo}`))
        await encerrarSocketAtual()

        try {
            await fs.promises.rm(SESSAO_PATH, { recursive: true, force: true })
        } catch {}

        r.sessionErrorLog = []
        r.pairingCodeRequested = false
        r.notificacaoOnlineEnviada = false
        r.isConnected = false
        r.reconnectAttempts = 0

        console.log(warn(`[AUTH] Nova sessão necessária. Reiniciando pareamento...`))

        setTimeout(() => {
            r.sessionRecoveryInProgress = false
            if (_iniciarConexao) {
                _iniciarConexao().catch(e => {
                    console.log(err(`[AUTH] Falha ao reiniciar: ${e.message}`))
                })
            }
        }, 2500)

        return true
    } catch (e) {
        r.sessionRecoveryInProgress = false
        return false
    }
}

export function instalarHandlersProcesso() {
    process.on("uncaughtException", (e) => {
        const msg = e?.message || String(e)
        if (isSessionError(msg)) {
            const total = registrarSessionError()
            console.log(warn(`[AUTH] Session error (${total}/${MAX_SESSION_ERRORS}): ${msg}`))
            if (total >= MAX_SESSION_ERRORS) {
                tentarRecuperacaoSessao(`Bad MAC/Signal recorrente (${total})`)
            }
            return
        }
        console.error(err(`[UNCAUGHT] ${msg}`))
    })

    process.on("unhandledRejection", (reason) => {
        const msg = reason?.message || String(reason)
        if (isSessionError(msg)) {
            const total = registrarSessionError()
            console.log(warn(`[AUTH] Session error (promise) (${total}/${MAX_SESSION_ERRORS}): ${msg}`))
            if (total >= MAX_SESSION_ERRORS) {
                tentarRecuperacaoSessao(`Bad MAC/Signal recorrente (${total})`)
            }
            return
        }
        console.error(err(`[REJECTION] ${msg}`))
    })
}
