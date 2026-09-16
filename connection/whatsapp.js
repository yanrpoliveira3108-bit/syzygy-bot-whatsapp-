// connection/whatsapp.js
// [v24] LID resolver + grupos autorizados blindados + anti-takeover

import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "./baileysCompat.js"

import pino from "pino"
import fs from "fs"
import path from "path"

import { rt, setSock, getSock, instalarRastreioDeEnvios } from "./socket.js"
import {
    SESSAO_PATH, MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY
} from "../utils/config.js"
import { boot, ok, err, warn, COLORS as C } from "../utils/terminalUI.js"
import {
    normalizeNumber, getSenderJid, setDetectedOwner, getOwnerNumber, ownerJidForSending,
    isAuthorizedGroup
} from "../utils/permissions.js"
import { isGroupJid } from "../utils/permissions.js"

import {
    encerrarSocketAtual, isSessionError, tentarRecuperacaoSessao, setIniciarConexao
} from "./sessionRecovery.js"
import { pedirNumeroPairing, solicitarPairingCode } from "./pairing.js"

import { registrarMessageHandler } from "../handlers/messageHandler.js"
import { atualizarGrupos, limparCacheFantasmas, throttledGroupMetadata } from "../services/groupService.js"
import { enviarNotifNovoGrupo, notificarBotOnline } from "../services/notificationService.js"
import { CONFIG } from "../utils/config.js"

let _ask = async () => ""
export function setAsk(fn) { _ask = fn }

export async function iniciarConexao() {
    const r = rt()
    if (r.isConnecting || r.connectionLock) return
    r.isConnecting = true
    r.connectionLock = true
    try {
        await conectar()
    } catch (e) {
        console.log(err(`[AUTH] Falha: ${e.message}`))
        if (isSessionError(e.message)) {
            await tentarRecuperacaoSessao(e.message)
        }
        throw e
    } finally {
        r.isConnecting = false
        r.connectionLock = false
    }
}

setIniciarConexao(iniciarConexao)

async function conectar() {
    const r = rt()
    await encerrarSocketAtual()

    let jaRegistrado = false
    const credsPath = path.join(SESSAO_PATH, "creds.json")
    if (fs.existsSync(credsPath)) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"))
            jaRegistrado = !!creds.registered
        } catch {}
    }

    if (!jaRegistrado) {
        try {
            fs.rmSync(SESSAO_PATH, { recursive: true, force: true })
            fs.mkdirSync(SESSAO_PATH, { recursive: true })
        } catch {}
    }

    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`${C.gray}[AUTH] Baileys: ${version.join(".")} (latest: ${isLatest})${C.reset}`)

    const { state, saveCreds } = await useMultiFileAuthState(SESSAO_PATH)

    let numeroParaPairing = null
    if (!jaRegistrado && !r.pairingCodeRequested) {
        try {
            numeroParaPairing = await pedirNumeroPairing(_ask)
        } catch (e) {
            console.log(err(`[AUTH] Entrada inválida: ${e.message}`))
            throw e
        }
    }

    console.log(boot("[AUTH] Conectando aos servidores do WhatsApp..."))

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "fatal" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        defaultQueryTimeoutMs: 60000,
        generateHighQualityLinkPreview: false,
        getMessage: async () => ({ conversation: "" }),
        cachedGroupMetadata: async (jid) => {
            try {
                const { cachedGroupMetadata } = await import("../services/groupService.js")
                return await cachedGroupMetadata(jid)
            } catch { return undefined }
        }
    })
    setSock(sock)

    instalarRastreioDeEnvios(sock)

    sock.ev.on("creds.update", saveCreds)

    // [v42] Registro de contatos para o STATUS MANAGER (modo "contatos" real):
    // contacts.upsert entrega os contatos conhecidos da conta; o módulo normaliza
    // e persiste em dono/status_config.json (contatosConhecidos).
    sock.ev.on("contacts.upsert", async (contatos) => {
        try {
            if (!Array.isArray(contatos) || !contatos.length) return
            const { registrarContatos } = await import("../features/statusManager/service.js")
            const novos = registrarContatos(contatos)
            if (novos > 0) console.log(ok(`[STATUS] +${novos} contato(s) no registro (${contatos.length} sincronizados)`))
        } catch {}
    })

    sock.ev.on("groups.upsert", async (grupos) => {
        try {
            const { atualizarMapaDeParticipantes } = await import("../services/lidResolver.js")
            for (const g of grupos) {
                const jid = g.id
                const subject = g.subject || "-"
                const botNum = normalizeNumber(getSock()?.user?.id)
                let isAdmin = false
                if (Array.isArray(g.participants)) {
                    const me = g.participants.find(p => normalizeNumber(p.id) === botNum)
                    if (me && (me.admin === "admin" || me.admin === "superadmin")) isAdmin = true
                    try { atualizarMapaDeParticipantes(g.participants) } catch {}
                }
                rt().cachedGroups[jid] = { subject, isAdmin }
                const oj = ownerJidForSending()
                if (oj) try { await enviarNotifNovoGrupo(oj, { subject, groupJid: jid, isAdmin }) } catch {}
            }
        } catch {}
    })

    sock.ev.on("groups.update", async (updates) => {
        try {
            for (const upd of updates) {
                const jid = upd.id
                if (!jid) continue
                const cache = rt().cachedGroups[jid]
                if (cache) {
                    if (upd.subject) cache.subject = upd.subject
                    if (CONFIG.antiTakeover && upd.announce === "true") {
                        const { registrarAcao } = await import("../services/historicoService.js")
                        registrarAcao("grupo_fechado", { id: jid, subject: upd.subject || cache.subject })
                    }
                }
            }
        } catch {}
    })

    sock.ev.on("group-participants.update", async (evt) => {
        try {
            const { id: groupJid, participants, action } = evt
            const botNum = normalizeNumber(getSock()?.user?.id)
            const botLid = normalizeNumber(getSock()?.user?.lid)
            const bateBot = (x) => {
                const n = normalizeNumber(x)
                return (botNum && n === botNum) || (botLid && n === botLid)
            }
            const meAfetado = Array.isArray(participants) && participants.some(bateBot)

            if (action === "remove" && meAfetado) {
                // [v40] Captura o subject ANTES de deletar do cache (antes: notificação
                // de remoção sempre mostrava o JID porque o cache já tinha sido apagado).
                const subjRemovido = rt().cachedGroups[groupJid]?.subject || groupJid
                delete rt().cachedGroups[groupJid]
                try {
                    const { handleRemovidoDoGrupo } = await import("../services/antiTakeoverService.js")
                    await handleRemovidoDoGrupo(groupJid, subjRemovido)
                } catch {}
                return
            }

            let meta = null
            for (let i = 0; i < 3 && !meta; i++) {
                try { meta = await throttledGroupMetadata(groupJid) } catch { await new Promise(r => setTimeout(r, 400)) }
            }
            if (!meta) { console.log(warn(`[GRUPO] metadata indisponível para ${groupJid}`)); return }

            // Atualiza mapa LID
            try {
                const { atualizarMapaDeParticipantes } = await import("../services/lidResolver.js")
                atualizarMapaDeParticipantes(meta.participants)
            } catch {}

            const me = meta.participants.find(p => bateBot(p.id) || bateBot(p.jid) || bateBot(p.lid))
            const isAdminAgora = !!(me && (me.admin === "admin" || me.admin === "superadmin"))
            const eraAdmin = !!rt().cachedGroups[groupJid]?.isAdmin
            rt().cachedGroups[groupJid] = { subject: meta.subject || "Sem nome", isAdmin: isAdminAgora }

            const oj = ownerJidForSending()

            if (action === "add" && meAfetado && oj) {
                try { await enviarNotifNovoGrupo(oj, { subject: meta.subject || "Sem nome", groupJid, isAdmin: isAdminAgora }) } catch (e) { console.log(err(`[NOTIF entrada] ${e.message}`)) }
            }

            const promoveuBot = action === "promote" && meAfetado
            if ((promoveuBot || (isAdminAgora && !eraAdmin))) {
                const { enviarNotifAdminRecebido } = await import("../services/notificationService.js")
                try {
                    await enviarNotifAdminRecebido(normalizeNumber(getOwnerNumber()), groupJid, meta.subject || "Sem nome")
                    console.log(ok(`[NOTIF] ADMIN recebido em ${meta.subject || groupJid}`))
                } catch (e) { console.log(err(`[NOTIF admin] ${e.message}`)) }
            }

            if (action === "demote" && meAfetado) {
                try {
                    const { handlePerdaAdmin } = await import("../services/antiTakeoverService.js")
                    await handlePerdaAdmin(groupJid, meta.subject || "Sem nome")
                } catch {}
            }

            if (action === "promote" && !meAfetado && Array.isArray(participants) && participants.length >= 3) {
                try {
                    const { handlePromocaoSuspeita } = await import("../services/antiTakeoverService.js")
                    await handlePromocaoSuspeita(groupJid, meta.subject || "Sem nome", participants)
                } catch {}
            }
        } catch (e) {
            console.log(err(`[group-participants] ${e.message}`))
        }
    })

    registrarMessageHandler(sock)

    if (numeroParaPairing && !r.pairingCodeRequested) {
        await solicitarPairingCode(sock, numeroParaPairing)
    }

    await new Promise((resolve, reject) => {
        let settled = false
        const finalizar = (fn, valor) => { if (settled) return; settled = true; fn(valor) }

        sock.ev.on("connection.update", async (u) => {
            const { connection, lastDisconnect } = u

            if (connection === "connecting") {
                console.log(boot("[AUTH] Conectando..."))
            }

            if (connection === "open") {
                r.isConnected = true
                r.reconnectAttempts = 0
                r.sessionErrorLog = []
                r.pairingCodeRequested = true
                setDetectedOwner(getSock().user)
                console.log(ok(`[AUTH] Conexão aberta com sucesso`))
                console.log(ok(`[AUTH] Dispositivo conectado: ${getOwnerNumber()}`))
                setTimeout(async () => {
                    try {
                        await atualizarGrupos()
                        if (CONFIG.autoLimpeza) {
                            try {
                                const res = await limparCacheFantasmas(true)
                                if (res.removidos > 0) console.log(ok(`[LIMPEZA] ${res.removidos} grupos fantasmas removidos`))
                            } catch {}
                        }
                        try {
                            const { iniciarAgendamentos } = await import("../services/agendaService.js")
                            const ag = iniciarAgendamentos()
                            if (ag.pendentes > 0) console.log(ok(`[AGENDA] ${ag.pendentes} agendamentos pendentes carregados`))
                        } catch {}
                        await notificarBotOnline()
                    } catch {}
                }, 2000)
                finalizar(resolve)
                return
            }

            if (connection === "close") {
                r.isConnected = false
                const sc = lastDisconnect?.error?.output?.statusCode
                const reason = lastDisconnect?.error?.message || "-"

                console.log(warn(`[AUTH] Conexão fechada: ${reason} (code=${sc || "n/a"})`))

                if (sc === DisconnectReason.loggedOut) {
                    console.log(err(`[AUTH] Sessão deslogada.`))
                    r.notificacaoOnlineEnviada = false
                    r.pairingCodeRequested = false
                    await tentarRecuperacaoSessao("loggedOut")
                    finalizar(reject, new Error("Sessão inválida"))
                    return
                }

                if (r.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.log(err(`[AUTH] Limite de reconexões atingido.`))
                    finalizar(reject, new Error("Falha ao reconectar"))
                    return
                }

                r.reconnectAttempts++
                const delay = RECONNECT_BASE_DELAY * r.reconnectAttempts
                console.log(warn(`[AUTH] Reconectando em ${delay}ms (${r.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`))

                await new Promise(res => setTimeout(res, delay))
                r.connectionLock = false
                r.isConnecting = false
                iniciarConexao()
                    .then(() => finalizar(resolve))
                    .catch(e => finalizar(reject, e))
                return
            }
        })
    })
}

export { isGroupJid }
