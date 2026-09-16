// utils/logger.js
// [REORGANIZAÇÃO] Silenciador de logs sensíveis de sessão, extraído do index.js.
// Mantém a MESMA proteção: filtra termos de Signal/Session e objetos de sessão,
// sem silenciar indiscriminadamente todos os erros.
//
// Guarda as referências originais ANTES de sobrescrever, e as reexporta para que
// o restante do sistema possa logar de forma garantida (origLog etc).

export const origLog = console.log
export const origWarn = console.warn
export const origError = console.error
const origStdoutWrite = process.stdout.write.bind(process.stdout)
const origStderrWrite = process.stderr.write.bind(process.stderr)

export function isSessionObject(arg) {
    if (!arg) return false
    if (typeof arg === "string") {
        return arg.includes("SessionEntry") || arg.includes("Closing session")
            || arg.includes("privKey") || arg.includes("rootKey")
            || arg.includes("chainKey") || arg.includes("remoteIdentityKey")
            || arg.includes("registrationId") || arg.includes("currentRatchet")
            || arg.includes("Bad MAC") || arg.includes("Failed to decrypt")
            || arg.includes("Session error") || arg.includes("SessionCipher")
            || arg.includes("closed session") || arg.includes("No session found")
            || arg.includes("No matching sessions") || arg.includes("decryptMessage")
    }
    if (typeof arg === "object") {
        const name = arg.constructor?.name || ""
        if (name === "SessionEntry" || name === "SessionState" || name.includes("Session")) return true
        if ("_chains" in arg || "currentRatchet" in arg || "indexInfo" in arg) return true
    }
    return false
}

function shouldSilence(args) {
    try {
        for (const a of args) {
            if (isSessionObject(a)) return true
        }
    } catch {}
    return false
}

let installed = false

// Instala os filtros. Idempotente: chamar mais de uma vez não empilha wrappers.
export function instalarSilenciador() {
    if (installed) return
    installed = true

    process.stdout.write = function (chunk, encoding, callback) {
        const s = typeof chunk === "string" ? chunk : chunk?.toString?.() || ""
        if (isSessionObject(s)) {
            if (callback) callback()
            return true
        }
        return origStdoutWrite(chunk, encoding, callback)
    }

    process.stderr.write = function (chunk, encoding, callback) {
        const s = typeof chunk === "string" ? chunk : chunk?.toString?.() || ""
        if (isSessionObject(s)) {
            if (callback) callback()
            return true
        }
        return origStderrWrite(chunk, encoding, callback)
    }

    console.log = (...args) => { if (!shouldSilence(args)) origLog(...args) }
    console.warn = (...args) => { if (!shouldSilence(args)) origWarn(...args) }
    console.error = (...args) => { if (!shouldSilence(args)) origError(...args) }
}
