import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    downloadMediaMessage,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} from "@whiskeysockets/baileys"

import pino from "pino"
import readline from "readline"
import fs from "fs"
import path from "path"
import { Jimp } from "jimp"

import {
    isOwner, isGroupJid, normalizeNumber, getSenderJid,
    setDetectedOwner, setConfigOwner, getOwnerNumber, ownerJidForSending
} from "./utils/permissions.js"
import { setState, getState, clearState } from "./utils/stateManager.js"
import { bannerSYZYGY, painelStatus, boot, ok, err, warn, info, credLine, formatUptime, COLORS as C } from "./utils/terminalUI.js"
import { buildMainMenuButtons, buildAdminMenuButtons, buildConfigButtons, buildGroupActionsButtons } from "./menus/menutest.js"

// ============================================================
// IDENTIDADE OFICIAL SYZYGY
// ============================================================

const BRAND = "ARCANJOS ATK && Zuckerberg"
const AUTHOR = "BY ANTY & nyx"
const PHRASE = "se não vai ajudar não atrapalhe"
const BOT_NAME = "SYZYGY"
const OWNER_NAME = "NYX"
const CREDITS = "ANTY DOMINA"

// ============================================================
// SILENCIADOR DE LOGS DE SESSÃO
// ============================================================

const origLog = console.log
const origWarn = console.warn
const origError = console.error
const origStdoutWrite = process.stdout.write.bind(process.stdout)
const origStderrWrite = process.stderr.write.bind(process.stderr)

function isSessionObject(arg) {
    if (!arg) return false
    if (typeof arg === "string") {
        return arg.includes("SessionEntry") || arg.includes("Closing session")
            || arg.includes("privKey") || arg.includes("rootKey")
            || arg.includes("chainKey") || arg.includes("remoteIdentityKey")
            || arg.includes("registrationId") || arg.includes("currentRatchet")
            || arg.includes("Bad MAC") || arg.includes("Failed to decrypt")
            || arg.includes("Session error") || arg.includes("SessionCipher")
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

process.stdout.write = function(chunk, encoding, callback) {
    const s = typeof chunk === "string" ? chunk : chunk?.toString?.() || ""
    if (isSessionObject(s)) {
        if (callback) callback()
        return true
    }
    return origStdoutWrite(chunk, encoding, callback)
}

process.stderr.write = function(chunk, encoding, callback) {
    const s = typeof chunk === "string" ? chunk : chunk?.toString?.() || ""
    if (isSessionObject(s)) {
        if (callback) callback()
        return true
    }
    return origStderrWrite(chunk, encoding, callback)
}

console.log = (...args) => {
    if (shouldSilence(args)) return
    origLog(...args)
}
console.warn = (...args) => { if (!shouldSilence(args)) origWarn(...args) }
console.error = (...args) => { if (!shouldSilence(args)) origError(...args) }

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const CONFIG_PATH = "./config.json"
const SESSAO_PATH = "./sessao"
const MENU_IMAGE_PATH = "./dono/menus/Foto-menu/img-menu.jpg"
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_FLOOD = 100
const HTTP_UA = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BASE_DELAY = 3000
const MAX_SESSION_ERRORS = 8
const SESSION_ERROR_WINDOW_MS = 60 * 1000
const SESSION_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000

let CONFIG = {
    nome: "๛ղվx 𝖅𝖚𝖈𝖐𝖊𝖗𝖇𝖊𝖗𝖌",
    bio: "Dominado por Anty & Nyx",
    menuImage: MENU_IMAGE_PATH,
    ownerOverride: "5519981144235"
}

function carregarConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, "utf-8")
            CONFIG = { ...CONFIG, ...JSON.parse(data) }
        }
    } catch {}
    if (CONFIG.ownerOverride) setConfigOwner(CONFIG.ownerOverride)
}

function salvarConfig() {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2), "utf-8") }
    catch (e) { origLog(err(`Salvar config: ${e.message}`)) }
}

carregarConfig()

// ============================================================
// ESTADO GLOBAL
// ============================================================

let sock = null
let isConnected = false
let reconnectAttempts = 0
let notificacaoOnlineEnviada = false
let cachedGroups = {}
let groupSelectionCache = {}
let bootTime = Date.now()

let isConnecting = false
let connectionLock = false
let pairingCodeRequested = false

let sessionErrorLog = []
let sessionRecoveryInProgress = false
let lastSessionRecovery = 0
let sessionRecoveryCount = 0

const DEBUG_OWNER = true
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))
const aguardarEnter = async () => { await ask(`\n${C.gray}ENTER...${C.reset}`) }

// ============================================================
// CONSTRUTOR DE MENSAGENS INTERATIVAS (NATIVAS + VISÍVEL NO PV)
// ============================================================

async function enviarMensagemInterativa(from, texto, botoes) {
    try {
        // Redireciona @lid para o JID real do telefone
        let targetJid = from || ownerJidForSending()
        if (targetJid.endsWith("@lid")) {
            targetJid = ownerJidForSending()
        }

        // Monta o corpo do interactiveMessage
        const interactiveMsg = {
            body: { text: texto },
            footer: { text: "© SYZYGY • ZUCKERBERG • ARCANJOS ATK" },
            header: { title: "⚡ SYZYGY", hasMediaAttachment: false },
            nativeFlowMessage: {
                buttons: botoes || [],
                messageParamsJson: ""
            }
        }

        // Tenta carregar imagem do menu para o header
        try {
            const imgPath = CONFIG.menuImage || MENU_IMAGE_PATH
            if (imgPath && fs.existsSync(imgPath)) {
                const imgBuffer = fs.readFileSync(imgPath)
                const mediaMsg = await prepareWAMessageMedia(
                    { image: imgBuffer },
                    { upload: sock.waUploadToServer }
                )
                if (mediaMsg?.imageMessage) {
                    interactiveMsg.header = {
                        hasMediaAttachment: true,
                        imageMessage: mediaMsg.imageMessage
                    }
                }
            }
        } catch {}

        // Gera a mensagem interativa REAL usando generateWAMessageFromContent
        const senderJid = sock.user?.id || targetJid
        const msg = generateWAMessageFromContent(targetJid, {
            viewOnceMessage: {
                message: {
                    interactiveMessage: interactiveMsg
                }
            }
        }, { userJid: senderJid })

        // Envia via relayMessage (obrigatório para Native Flow funcionar)
        await sock.relayMessage(targetJid, msg.message, {
            messageId: msg.key.id
        })

        origLog(ok(`[UI] Painel interativo enviado para ${targetJid}`))
    } catch (error) {
        origLog(warn(`[UI] Native Flow falhou (${error.message}). Tentando fallback texto...`))
        // Fallback: envia como texto simples se o Native Flow falhar
        try {
            let fallbackText = texto + "\n\n"
            if (botoes && botoes.length > 0) {
                for (const b of botoes) {
                    try {
                        const p = JSON.parse(b.buttonParamsJson || "{}")
                        if (p.display_text) {
                            fallbackText += `👉 *${p.display_text}*\n`
                        } else if (p.sections) {
                            for (const sec of p.sections) {
                                for (const row of (sec.rows || [])) {
                                    fallbackText += `• ${row.title}\n`
                                }
                            }
                        }
                    } catch {}
                }
            }
            fallbackText += "\n_Digite o número da opção (Ex: 01, 03, 12)_"
            await sock.sendMessage(targetJid, { text: fallbackText })
            origLog(ok(`[UI] Fallback texto enviado para ${targetJid}`))
        } catch (e2) {
            origLog(err(`[UI] Erro total no envio: ${e2.message}`))
        }
    }
}

async function enviarPainelInicial(from) {
    const num = normalizeNumber(sock.user?.id || getOwnerNumber())
    const hora = horaAtual()
    const d = new Date()
    const dataHoje = String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + "/" + d.getFullYear()
    const pingMs = Math.floor(Math.random() * 30) + 15
    const uptimeStr = formatUptime(Date.now() - bootTime)

    const texto = `╭━━〔 ⚡ SYZYGY ONLINE 〕━━⬣\n` +
                  `┃ 👤 Dono: ${OWNER_NAME}\n` +
                  `┃ 📱 Número: ${num}\n` +
                  `┃ 📅 ${dataHoje}\n` +
                  `┃ ⏰ ${hora}\n` +
                  `┃ ⚡ Status: ONLINE\n` +
                  `┃ 🏓 Ping: ${pingMs}ms\n` +
                  `┃ ⏱️ Uptime: ${uptimeStr}\n` +
                  `╰━━━━━━━━━━━━━━━━━━⬣\n\n` +
                  `🌌 *Painel de controle do SYZYGY*\n\n` +
                  `Selecione uma categoria abaixo\n` +
                  `para acessar os comandos disponíveis.\n\n` +
                  `_ZUCKERBERG • ARCANJOS ATK_\n_NYX × ANTY DOMINA_`

    const botoes = buildMainMenuButtons("!")
    await enviarMensagemInterativa(from, texto, botoes)
}

async function enviarPainelAdmin(from) {
    const texto = `⚙️ *SYZYGY*\nPAINEL ADMINISTRATIVO\n\nToque em "SELECIONAR" para escolher uma opção.`
    const botoes = buildAdminMenuButtons()
    await enviarMensagemInterativa(from, texto, botoes)
}

async function enviarSubmenuConfig(jid) {
    const texto = `⚙️ *CONFIGURAÇÕES*\n\nSelecione uma opção abaixo:`
    const botoes = buildConfigButtons()
    await enviarMensagemInterativa(jid, texto, botoes)
}

async function enviarConfirmacao(jid, { titulo, texto, idConfirmar }) {
    const botoes = [
        { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "✅ CONFIRMAR", id: idConfirmar }) },
        { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "❌ CANCELAR", id: "menu_cancel" }) }
    ]
    await enviarMensagemInterativa(jid, `${titulo}\n\n${texto}`, botoes)
}

async function enviarCancelavel(jid, texto) {
    const botoes = [{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "❌ CANCELAR", id: "menu_cancel" }) }]
    await enviarMensagemInterativa(jid, texto, botoes)
}

async function enviarVoltar(jid, texto) {
    const botoes = [{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "⬅️ VOLTAR AO PAINEL", id: "abrir_painel" }) }]
    await enviarMensagemInterativa(jid, texto, botoes)
}

async function enviarNotifNovoGrupo(jid, info) {
    const { subject, groupJid, isAdmin } = info
    const body = `╭──────────────────────────────────╮\n` +
                 `│      NOVO GRUPO DETECTADO        │\n` +
                 `├──────────────────────────────────┤\n` +
                 `│ 🟢 O bot entrou em um grupo.     │\n` +
                 `│ 👥 Grupo: ${subject}\n` +
                 `│ 🆔 ID: ${groupJid}\n` +
                 `│ 🔐 Admin: ${isAdmin ? "SIM" : "NÃO"}\n` +
                 `╰──────────────────────────────────╯\n\n` +
                 `SYZYGY\n_ZUCKERBERG • ARCANJOS ATK_`
    try { await sock.sendMessage(jid, { text: body }) } catch {}
}

async function listarGruposInterativo(jid, pagina = 1) {
    await atualizarGrupos()
    const arr = Object.entries(cachedGroups).map(([id, info]) => ({ id, ...info }))
    
    if (arr.length === 0) {
        await sock.sendMessage(jid, { text: "⚠️ O bot não está em nenhum grupo." })
        return null
    }
    
    const cache = {}
    arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })
    
    const POR_PAGINA = 10
    const totalPaginas = Math.ceil(arr.length / POR_PAGINA)
    const p = Math.max(1, Math.min(pagina, totalPaginas))
    const inicio = (p - 1) * POR_PAGINA
    const fim = Math.min(inicio + POR_PAGINA, arr.length)
    
    let texto = `📋 *SEUS GRUPOS* — Página ${p}/${totalPaginas}\n`
    texto += `Total: ${arr.length} grupos (${arr.filter(g => g.isAdmin).length} como ADMIN)\n\n`
    
    for (let i = 0; i < arr.length; i++) {
        const g = arr[i]
        const idx = i + 1
        const badge = g.isAdmin ? "👑" : "👤"
        texto += `[${String(idx).padStart(3, "0")}] ${badge} ${g.subject}\n`
    }
    texto += `\n_💡 Digite o número do grupo (ex: 01, 07, 072) ou parte do nome_`
    
    const rows = []
    for (let i = inicio; i < fim; i++) {
        const g = arr[i]
        const idx = i + 1
        const badge = g.isAdmin ? "👑" : "👤"
        rows.push({
            title: `${String(idx).padStart(3, "0")} • ${badge} ${g.subject.substring(0, 22)}`,
            description: g.isAdmin ? "ADMIN neste grupo" : "Membro deste grupo",
            id: `grp_select_${idx}`
        })
    }
    
    if (p < totalPaginas) rows.push({ title: `➡️ Próxima página (${p+1}/${totalPaginas})`, description: "Ver mais grupos", id: `grp_page_${p+1}` })
    if (p > 1) rows.push({ title: `⬅️ Página anterior (${p-1}/${totalPaginas})`, description: "Voltar página", id: `grp_page_${p-1}` })
    rows.push({ title: "🏠 VOLTAR AO MENU", description: "Menu principal", id: "abrir_painel" })
    
    const lista = {
        title: `📂 GRUPOS - Página ${p}/${totalPaginas}`,
        text: `${arr.length} grupos disponíveis`,
        buttonText: "📂 SELECIONAR GRUPO",
        sections: [{ title: `GRUPOS (${inicio + 1}-${fim})`, rows }]
    }
    
    const botoes = [
        { name: "single_select", buttonParamsJson: JSON.stringify(lista) }
    ]
    
    if (p < totalPaginas) {
        botoes.push({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: `➡️ Próxima (${p+1})`, id: `grp_page_${p+1}` }) })
    }
    if (p > 1) {
        botoes.push({ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: `⬅️ Anterior (${p-1})`, id: `grp_page_${p-1}` }) })
    }
    
    await enviarMensagemInterativa(jid, texto, botoes)
    return cache
}

async function enviarMenuAcoesGrupo(jid, grupo) {
    const badge = grupo.isAdmin ? "👑 ADMIN" : "👤 MEMBRO"
    const texto = `╭━━〔 ⚡ SYZYGY 〕━━⬣\n` +
                  `┃ 📂 Grupo: ${grupo.subject}\n` +
                  `┃ 🆔 ID: ${grupo.id}\n` +
                  `┃ 🔐 Status: ${badge}\n` +
                  `╰━━━━━━━━━━━━━━━━━━⬣\n\n` +
                  `Escolha uma ação para este grupo:`
    
    const botoes = buildGroupActionsButtons(grupo.id, grupo.subject, grupo.isAdmin)
    await enviarMensagemInterativa(jid, texto, botoes)
}

function getInteractiveId(m) {
    if (!m || !m.message) return null
    const msg = m.message
    if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            const p = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)
            return p.id || null
        } catch { return null }
    }
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId
    return null
}

// ============================================================
// UTILS E IMAGEM
// ============================================================

async function resolverGrupoInput(input) {
    let jid = input.trim()
    if (jid.includes("whatsapp.com")) {
        const codigo = jid.split("/").pop().split("?")[0]
        const g = await sock.groupGetInviteInfo(codigo)
        jid = g.id
    }
    return jid
}

function isValidHttpUrl(str) {
    try { const u = new URL(str); return u.protocol === "http:" || u.protocol === "https:" } catch { return false }
}

function horaAtual() {
    const d = new Date()
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

async function prepararFoto(caminho) {
    const img = await Jimp.read(caminho)
    img.cover({ w: 640, h: 640 })
    return await img.getBuffer("image/jpeg")
}

async function prepararFotoBuffer(buffer) {
    const img = await Jimp.read(buffer)
    img.cover({ w: 640, h: 640 })
    return await img.getBuffer("image/jpeg")
}

async function baixarMidiaMensagem(m) {
    return await downloadMediaMessage(m, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage
    })
}

function detectarImagem(m) {
    if (!m?.message) return null
    const im = m.message.imageMessage
             || m.message.viewOnceMessage?.message?.imageMessage
             || m.message.viewOnceMessageV2?.message?.imageMessage
    if (im) return { type: "image", mimetype: im.mimetype || "image/jpeg", size: im.fileLength }

    const doc = m.message.documentMessage
    if (doc && typeof doc.mimetype === "string" && doc.mimetype.startsWith("image/")) {
        const mime = doc.mimetype.toLowerCase()
        if (["image/jpeg","image/png","image/webp","image/jpg"].includes(mime)) {
            return { type: "document", mimetype: mime, size: doc.fileLength }
        }
    }
    return null
}

function validarTamanho(size) {
    if (!size) return true
    const n = typeof size === "number" ? size : Number(size)
    return isFinite(n) && n <= MAX_IMAGE_BYTES
}

function extrairImagemHTML(html, baseUrl) {
    const patterns = [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ]
    for (const rx of patterns) {
        const m = html.match(rx)
        if (m && m[1]) { try { return new URL(m[1], baseUrl).toString() } catch { return m[1] } }
    }
    return null
}

async function fetchImagem(url, prof = 0) {
    if (prof > 2) throw new Error("Muitos redirecionamentos")
    if (!isValidHttpUrl(url)) throw new Error("URL inválida")
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 30000)
    let resp
    try {
        resp = await fetch(url, {
            signal: ctrl.signal,
            redirect: "follow",
            headers: { "User-Agent": HTTP_UA, "Accept": "image/*,text/html;q=0.9,*/*;q=0.8" }
        })
    } finally { clearTimeout(to) }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const ct = (resp.headers.get("content-type") || "").toLowerCase()
    const finalUrl = resp.url || url
    if (ct.startsWith("image/")) {
        const cl = parseInt(resp.headers.get("content-length") || "0")
        if (cl && cl > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande")
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande")
        return buf
    }
    if (ct.includes("text/html") || ct.includes("xhtml")) {
        const html = await resp.text()
        const imgUrl = extrairImagemHTML(html, finalUrl)
        if (!imgUrl) {
            if (finalUrl.includes("pinterest") || url.includes("pin.it")) throw new Error("Pinterest sem imagem acessível. Use URL direta.")
            throw new Error("Página sem og:image detectável.")
        }
        return await fetchImagem(imgUrl, prof + 1)
    }
    throw new Error(`Conteúdo não é imagem (${ct})`)
}

// ============================================================
// OPERAÇÕES DO GRUPO
// ============================================================

async function alterarNomeGrupo(jid, nome) { await sock.groupUpdateSubject(jid, nome) }
async function alterarBioGrupo(jid, bio) { await sock.groupUpdateDescription(jid, bio) }
async function alterarFotoGrupoArquivo(jid, caminho) {
    if (!fs.existsSync(caminho)) throw new Error("Arquivo não encontrado")
    const buf = await prepararFoto(caminho)
    await sock.updateProfilePicture(jid, buf)
}
async function alterarFotoGrupoURL(jid, url) {
    const raw = await fetchImagem(url); const buf = await prepararFotoBuffer(raw); await sock.updateProfilePicture(jid, buf)
}
async function alterarFotoGrupoBuffer(jid, buffer) {
    const buf = await prepararFotoBuffer(buffer); await sock.updateProfilePicture(jid, buf)
}
async function removerFotoGrupo(jid) {
    if (typeof sock.removeProfilePicture === "function") { await sock.removeProfilePicture(jid); return true }
    return false
}

async function executarNuke(jid) {
    try { if (fs.existsSync("./foto.jpg")) { const buf = await prepararFoto("./foto.jpg"); await sock.updateProfilePicture(jid, buf) } } catch {}
    await sock.groupUpdateSubject(jid, CONFIG.nome)
    await sock.groupUpdateDescription(jid, CONFIG.bio)
    const meta = await sock.groupMetadata(jid)
    const botNum = normalizeNumber(sock.user.id)
    const rem = meta.participants.filter(p => normalizeNumber(p.id) !== botNum && p.id !== meta.owner).map(p => p.id)
    if (rem.length > 0) await sock.groupParticipantsUpdate(jid, rem, "remove")
    await sock.groupSettingUpdate(jid, "announcement")
}

async function executarFlood(jid, msg, qtd) {
    qtd = Math.min(Math.max(1, qtd), MAX_FLOOD)
    const meta = await sock.groupMetadata(jid)
    const mentions = meta.participants.map(p => p.id)
    for (let i = 1; i <= qtd; i++) {
        await sock.sendMessage(jid, { text: msg, mentions })
        await new Promise(r => setTimeout(r, 650))
    }
}

async function atualizarGrupos() {
    try {
        const grupos = await sock.groupFetchAllParticipating()
        const botNum = normalizeNumber(sock?.user?.id)
        const botLid = normalizeNumber(sock?.user?.lid)
        const novo = {}
        const lista = Object.values(grupos)
        
        for (const g of lista) {
            let isAdmin = false
            let participantes = g.participants
            
            if (!Array.isArray(participantes) || participantes.length === 0) {
                try {
                    const meta = await sock.groupMetadata(g.id)
                    participantes = meta.participants || []
                } catch { participantes = [] }
            }
            
            if (Array.isArray(participantes)) {
                const me = participantes.find(p => {
                    const pNum = normalizeNumber(p.id || p.jid || "")
                    const pLid = normalizeNumber(p.lid || "")
                    return (botNum && (pNum === botNum || pLid === botNum))
                        || (botLid && (pNum === botLid || pLid === botLid))
                })
                if (me && (me.admin === "admin" || me.admin === "superadmin")) {
                    isAdmin = true
                }
            }
            
            novo[g.id] = { subject: g.subject || "Sem nome", isAdmin }
        }
        cachedGroups = novo
    } catch (e) { origLog(err(`atualizarGrupos: ${e.message}`)) }
}

async function notificarBotOnline() {
    if (notificacaoOnlineEnviada) return
    notificacaoOnlineEnviada = true
    const jid = ownerJidForSending()
    if (!jid) return
    try { await enviarPainelInicial(jid) }
    catch (e) { origLog(err(`Notif online: ${e.message}`)) }
}

// ============================================================
// TRATAMENTO DE SESSÃO SIGNAL
// ============================================================

function isSessionError(msg) {
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

function registrarSessionError() {
    const now = Date.now()
    sessionErrorLog = sessionErrorLog.filter(t => now - t < SESSION_ERROR_WINDOW_MS)
    sessionErrorLog.push(now)
    return sessionErrorLog.length
}

async function encerrarSocketAtual() {
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
    sock = null
}

async function tentarRecuperacaoSessao(motivo = "sessão instável") {
    if (sessionRecoveryInProgress) return false
    const now = Date.now()
    if (now - lastSessionRecovery < SESSION_RECOVERY_COOLDOWN_MS) return false

    sessionRecoveryInProgress = true
    lastSessionRecovery = now
    sessionRecoveryCount++

    try {
        origLog(err(`[AUTH] Sessão corrompida detectada: ${motivo}`))
        await encerrarSocketAtual()

        try {
            await fs.promises.rm(SESSAO_PATH, { recursive: true, force: true })
        } catch {}

        sessionErrorLog = []
        pairingCodeRequested = false
        notificacaoOnlineEnviada = false
        isConnected = false
        reconnectAttempts = 0

        origLog(warn(`[AUTH] Nova sessão necessária. Reiniciando pareamento...`))

        setTimeout(() => {
            sessionRecoveryInProgress = false
            iniciarConexao().catch(e => {
                origLog(err(`[AUTH] Falha ao reiniciar: ${e.message}`))
            })
        }, 2500)

        return true
    } catch (e) {
        sessionRecoveryInProgress = false
        return false
    }
}

process.on("uncaughtException", (e) => {
    const msg = e?.message || String(e)
    if (isSessionError(msg)) {
        const total = registrarSessionError()
        origLog(warn(`[AUTH] Session error (${total}/${MAX_SESSION_ERRORS}): ${msg}`))
        if (total >= MAX_SESSION_ERRORS) {
            tentarRecuperacaoSessao(`Bad MAC/Signal recorrente (${total})`)
        }
        return
    }
    origError(err(`[UNCAUGHT] ${msg}`))
})

process.on("unhandledRejection", (reason) => {
    const msg = reason?.message || String(reason)
    if (isSessionError(msg)) {
        const total = registrarSessionError()
        origLog(warn(`[AUTH] Session error (promise) (${total}/${MAX_SESSION_ERRORS}): ${msg}`))
        if (total >= MAX_SESSION_ERRORS) {
            tentarRecuperacaoSessao(`Bad MAC/Signal recorrente (${total})`)
        }
        return
    }
    origError(err(`[REJECTION] ${msg}`))
})

// ============================================================
// CONEXÃO BAILEYS
// ============================================================

async function iniciarConexao() {
    if (isConnecting || connectionLock) return
    isConnecting = true
    connectionLock = true
    try {
        await conectar()
    } catch (e) {
        origLog(err(`[AUTH] Falha: ${e.message}`))
        if (isSessionError(e.message)) {
            await tentarRecuperacaoSessao(e.message)
        }
        throw e
    } finally {
        isConnecting = false
        connectionLock = false
    }
}

async function conectar() {
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
    origLog(`${C.gray}[AUTH] Baileys: ${version.join(".")} (latest: ${isLatest})${C.reset}`)

    const { state, saveCreds } = await useMultiFileAuthState(SESSAO_PATH)

    let numeroParaPairing = null
    if (!jaRegistrado && !pairingCodeRequested) {
        origLog(warn("[AUTH] Aguardando número de telefone..."))
        try {
            let num = await ask(`${C.cyan}[+] Número (5599...): ${C.reset}`)
            num = String(num).replace(/\D/g, "").trim()
            if (!num || num.length < 10) throw new Error("Número inválido")
            numeroParaPairing = num
            origLog(ok(`[AUTH] Número recebido: ${num}`))
        } catch (e) {
            origLog(err(`[AUTH] Entrada inválida: ${e.message}`))
            throw e
        }
    }

    origLog(boot("[AUTH] Conectando aos servidores do WhatsApp..."))

    sock = makeWASocket({
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
        getMessage: async () => ({ conversation: "" })
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("groups.upsert", async (grupos) => {
        try {
            for (const g of grupos) {
                const jid = g.id
                const subject = g.subject || "-"
                const botNum = normalizeNumber(sock?.user?.id)
                let isAdmin = false
                if (Array.isArray(g.participants)) {
                    const me = g.participants.find(p => normalizeNumber(p.id) === botNum)
                    if (me && (me.admin === "admin" || me.admin === "superadmin")) isAdmin = true
                }
                cachedGroups[jid] = { subject, isAdmin }
                const oj = ownerJidForSending()
                if (oj) try { await enviarNotifNovoGrupo(oj, { subject, groupJid: jid, isAdmin }) } catch {}
            }
        } catch {}
    })

    sock.ev.on("group-participants.update", async (evt) => {
        try {
            const { id: groupJid, participants, action } = evt
            const botNum = normalizeNumber(sock?.user?.id)
            if (!participants.some(p => normalizeNumber(p) === botNum)) return
            if (action === "remove") { delete cachedGroups[groupJid]; return }
            try {
                const meta = await sock.groupMetadata(groupJid)
                const me = meta.participants.find(p => normalizeNumber(p.id) === botNum)
                const isAdmin = me && (me.admin === "admin" || me.admin === "superadmin")
                cachedGroups[groupJid] = { subject: meta.subject, isAdmin }
                if (action === "add") {
                    const oj = ownerJidForSending()
                    if (oj) try { await enviarNotifNovoGrupo(oj, { subject: meta.subject, groupJid, isAdmin }) } catch {}
                }
            } catch {}
        } catch {}
    })

    sock.ev.on("messages.upsert", async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0]
            if (!m || !m.message) return
            const chatJid = m.key.remoteJid
            if (!chatJid) return

            const isGroup = isGroupJid(chatJid)
            const fromMe = !!m.key.fromMe
            let sender = fromMe ? sock.user?.id : getSenderJid(m)
            const senderNum = normalizeNumber(sender)
            const authorized = fromMe || isOwner(sender) || isOwner(chatJid)

            const interactionId = getInteractiveId(m)
            const textRaw = (
                m.message.conversation ||
                m.message.extendedTextMessage?.text ||
                m.message.imageMessage?.caption ||
                m.message.documentMessage?.caption || ""
            ).trim()
            const textLower = textRaw.toLowerCase()

            if (!authorized) {
                if (!isGroup && (textLower === "!menu" || textLower === "menu")) {
                    try { await sock.sendMessage(chatJid, { text: "❌ Acesso negado.\nEste painel é exclusivo do proprietário." }) } catch {}
                }
                return
            }

            if (interactionId) {
                origLog(info("UI", `Interação clicada: ${interactionId}`))
                await roteadorAcoes(chatJid, senderNum, interactionId)
                return
            }

            const st = getState(senderNum)
            const imgInfo = detectarImagem(m)
            if (st && await handleEstado(chatJid, senderNum, st, textRaw, imgInfo, m)) return

            const actionText = TEXT_TO_ACTION[textLower]
            if (actionText) {
                origLog(info("COMMAND", `Input="${textRaw}" -> Action=${actionText}`))
                await roteadorAcoes(chatJid, senderNum, actionText)
                return
            }

            if (!isGroup && textLower === "!status") {
                const arr = Object.values(cachedGroups)
                await sock.sendMessage(chatJid, {
                    text: `🟢 SYZYGY ONLINE\n📱 ${normalizeNumber(sock.user.id)}\n👥 Grupos: ${arr.length}\n👑 Admin: ${arr.filter(g=>g.isAdmin).length}\n\nZUCKERBERG • ARCANJOS ATK`
                })
            }
        } catch (e) {
            origLog(err(`Handler erro: ${e.message}`))
        }
    })

    if (numeroParaPairing && !pairingCodeRequested) {
        pairingCodeRequested = true
        origLog(boot("[AUTH] Aguardando inicialização do socket..."))
        
        let attempts = 0
        let code = null
        
        while (attempts < 3) {
            try {
                attempts++
                origLog(boot(`[AUTH] Solicitando código de pareamento (tentativa ${attempts}/3)...`))
                await new Promise(r => setTimeout(r, 4000))
                code = await sock.requestPairingCode(numeroParaPairing)
                break
            } catch (e) {
                origLog(err(`[AUTH] Tentativa ${attempts} falhou: ${e.message}`))
                if (attempts >= 3) {
                    pairingCodeRequested = false
                    throw e
                }
                await new Promise(r => setTimeout(r, 3000))
            }
        }

        const formatado = code?.match(/.{1,4}/g)?.join("-") || code
        origLog(`\n${C.yellow}┌────────────────────────────┐${C.reset}`)
        origLog(`${C.yellow}│ ${C.white}${C.bold}CÓDIGO: ${formatado}${C.reset}${C.yellow}${" ".repeat(Math.max(0, 18 - formatado.length))}│${C.reset}`)
        origLog(`${C.yellow}└────────────────────────────┘${C.reset}\n`)
        origLog(ok(`[AUTH] Código de pareamento: ${formatado}`))
        origLog(warn(`[AUTH] Abra WhatsApp → Aparelhos conectados → Conectar com número`))
    }

    await new Promise((resolve, reject) => {
        let settled = false
        const finalizar = (fn, valor) => { if (settled) return; settled = true; fn(valor) }

        sock.ev.on("connection.update", async (u) => {
            const { connection, lastDisconnect } = u

            if (connection === "connecting") {
                origLog(boot("[AUTH] Conectando..."))
            }

            if (connection === "open") {
                isConnected = true
                reconnectAttempts = 0
                sessionErrorLog = []
                pairingCodeRequested = true
                setDetectedOwner(sock.user)
                origLog(ok(`[AUTH] Conexão aberta com sucesso`))
                origLog(ok(`[AUTH] Dispositivo conectado: ${getOwnerNumber()}`))
                setTimeout(async () => {
                    try { await atualizarGrupos(); await notificarBotOnline() }
                    catch {}
                }, 2000)
                finalizar(resolve)
                return
            }

            if (connection === "close") {
                isConnected = false
                const sc = lastDisconnect?.error?.output?.statusCode
                const reason = lastDisconnect?.error?.message || "-"

                origLog(warn(`[AUTH] Conexão fechada: ${reason} (code=${sc || "n/a"})`))

                if (sc === DisconnectReason.loggedOut) {
                    origLog(err(`[AUTH] Sessão deslogada.`))
                    notificacaoOnlineEnviada = false
                    pairingCodeRequested = false
                    await tentarRecuperacaoSessao("loggedOut")
                    finalizar(reject, new Error("Sessão inválida"))
                    return
                }

                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    origLog(err(`[AUTH] Limite de reconexões atingido.`))
                    finalizar(reject, new Error("Falha ao reconectar"))
                    return
                }

                reconnectAttempts++
                const delay = RECONNECT_BASE_DELAY * reconnectAttempts
                origLog(warn(`[AUTH] Reconectando em ${delay}ms (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`))

                await new Promise(r => setTimeout(r, delay))
                connectionLock = false
                isConnecting = false
                iniciarConexao()
                    .then(() => finalizar(resolve))
                    .catch(e => finalizar(reject, e))
                return
            }
        })
    })
}

// ============================================================
// TRATADOR DE ESTADOS (INPUT TEXTO/IMAGEM)
// ============================================================

async function handleEstado(chatJid, ownerKey, st, text, imgInfo, m) {
    if (st.action === "waiting_name" && text) {
        try { await alterarNomeGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Nome atualizado.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_both_name" && text) {
        try { await alterarNomeGrupo(st.groupJid, text); setState(ownerKey, { action: "waiting_both_bio", groupJid: st.groupJid }); await enviarCancelavel(chatJid, "📄 Digite a nova bio:") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`); clearState(ownerKey) }
        return true
    }
    if (st.action === "waiting_bio" && text) {
        try { await alterarBioGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Bio atualizada.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_both_bio" && text) {
        try { await alterarBioGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Nome + Bio atualizados.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_group_image") {
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Imagem muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (!raw || raw.length === 0) throw new Error("Vazia")
                await alterarFotoGrupoBuffer(st.groupJid, raw)
                await enviarVoltar(chatJid, "✅ Foto do grupo atualizada.")
            } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem JPG, PNG ou WEBP." }); return true }
        return true
    }
    if (st.action === "waiting_image_url") {
        if (text && isValidHttpUrl(text)) {
            try { await alterarFotoGrupoURL(st.groupJid, text); await enviarVoltar(chatJid, "✅ Foto atualizada.") }
            catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ URL inválida." }); return true }
        return true
    }
    if (st.action === "waiting_menu_image") {
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (!raw || raw.length === 0) throw new Error("Vazia")
                const buf = await prepararFotoBuffer(raw)
                try { fs.mkdirSync(path.dirname(MENU_IMAGE_PATH), { recursive: true }) } catch {}
                fs.writeFileSync(MENU_IMAGE_PATH, buf)
                CONFIG.menuImage = MENU_IMAGE_PATH; salvarConfig()
                await enviarVoltar(chatJid, "✅ Imagem do menu atualizada.")
            } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem." }); return true }
        return true
    }
    if (st.action === "waiting_flood_message" && text) {
        setState(ownerKey, { action: "waiting_flood_amount", groupJid: st.groupJid, floodMessage: text })
        await enviarCancelavel(chatJid, `Digite a *quantidade* (máx ${MAX_FLOOD}):`)
        return true
    }
    if (st.action === "waiting_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "⚠️ Quantidade inválida." }); return true }
        const q = Math.min(qtd, MAX_FLOOD)
        setState(ownerKey, { action: "waiting_flood_confirm", groupJid: st.groupJid, floodMessage: st.floodMessage, floodQtd: q })
        await enviarConfirmacao(chatJid, { titulo: "⚠️ CONFIRMAR ENVIO", texto: `Quantidade: ${q}\n\nMensagem:\n"${st.floodMessage}"`, idConfirmar: "flood_confirm_yes" })
        return true
    }
    if (st.action === "waiting_group" && text) {
        const cache = groupSelectionCache[ownerKey] || {}
        const cacheKeys = Object.keys(cache).map(k => parseInt(k)).filter(k => !isNaN(k))
        const raw = text.trim()
        const rawLower = raw.toLowerCase()
        
        const pagMatch = raw.match(/^(?:pag|p)\s*(\d+)$/i)
        if (pagMatch) {
            const nPag = parseInt(pagMatch[1])
            const novoCache = await listarGruposInterativo(chatJid, nPag)
            if (novoCache) groupSelectionCache[ownerKey] = novoCache
            return true
        }
        
        let entry = null
        let selectedIdx = null
        
        const numMatch = raw.match(/^0*(\d+)$/)
        if (numMatch) {
            const n = parseInt(numMatch[1])
            if (cache[n]) {
                entry = cache[n]
                selectedIdx = n
            }
        }
        
        if (!entry && raw.length >= 2) {
            const matches = []
            for (const idx of cacheKeys) {
                const g = cache[idx]
                if (g.subject && g.subject.toLowerCase().includes(rawLower)) {
                    matches.push({ idx, ...g })
                }
            }
            if (matches.length === 1) {
                entry = matches[0]
                selectedIdx = matches[0].idx
            } else if (matches.length > 1) {
                let txt = `🔍 Encontrei ${matches.length} grupos com "${raw}":\n\n`
                matches.slice(0, 10).forEach(m => {
                    const b = m.isAdmin ? "👑" : "👤"
                    txt += `[${String(m.idx).padStart(3, "0")}] ${b} ${m.subject}\n`
                })
                txt += `\n_Digite o número exato do grupo desejado_`
                await sock.sendMessage(chatJid, { text: txt })
                return true
            }
        }
        
        if (!entry) {
            await sock.sendMessage(chatJid, { 
                text: `⚠️ Grupo não encontrado.\n\nDigite o *número* (ex: 01, 07, 072) ou parte do *nome*.\n\nTotal disponível: ${cacheKeys.length} grupos.` 
            })
            return true
        }
        
        setState(ownerKey, { 
            action: st.next,
            groupJid: entry.id,
            selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: selectedIdx }
        })
        
        origLog(info("GRUPO", `Selecionado: [${selectedIdx}] ${entry.subject}`))
        await processarSelecaoGrupo(chatJid, ownerKey, st.next, entry)
        return true
    }
    return false
}

// ============================================================
// ROTEADOR CENTRAL DE AÇÕES INTERATIVAS
// ============================================================

async function roteadorAcoes(chatJid, ownerKey, actionId) {
    if (actionId === "menu_inicial") {
        clearState(ownerKey)
        await enviarPainelInicial(chatJid)
        return
    }

    if (actionId === "menu_cancel") {
        clearState(ownerKey)
        await enviarVoltar(chatJid, "❌ Operação cancelada.")
        return
    }

    if (actionId === "owner_panel" || actionId === "abrir_painel") {
        clearState(ownerKey)
        await enviarPainelAdmin(chatJid)
        return
    }

    const pedirGrupo = async (next) => {
        const cache = await listarGruposInterativo(chatJid)
        if (!cache) return
        groupSelectionCache[ownerKey] = cache
        setState(ownerKey, { action: "waiting_group", next })
    }

    if (actionId === "owner_nome" || actionId === "painel_registrar_nome" || actionId === "owner_so_nome" || actionId === "painel_so_nome") { await pedirGrupo("waiting_name"); return }
    if (actionId === "owner_bio"  || actionId === "painel_registrar_bio"  || actionId === "owner_so_bio"  || actionId === "painel_so_bio")  { await pedirGrupo("waiting_bio"); return }
    if (actionId === "owner_nome_bio" || actionId === "painel_nome_bio") { await pedirGrupo("waiting_both_name"); return }
    if (actionId === "owner_grupos" || actionId === "painel_listar_grupos") {
        await atualizarGrupos()
        const arr = Object.values(cachedGroups)
        let t = `📋 SYZYGY — GRUPOS\n\n`
        arr.forEach((g, i) => t += `${String(i+1).padStart(2,"0")} • ${g.subject}\n     ${g.isAdmin?"👑 ADMIN":"👤 MEMBRO"}\n\n`)
        await enviarVoltar(chatJid, t || "⚠️ Nenhum grupo."); return
    }
    if (actionId === "owner_nuke" || actionId === "painel_nuke") { await pedirGrupo("confirm_nuke"); return }
    if (actionId === "owner_flood" || actionId === "painel_flood") { await pedirGrupo("waiting_flood_message"); return }
    if (actionId === "owner_foto_arquivo" || actionId === "painel_foto_grupo") { await pedirGrupo("waiting_group_image"); return }
    if (actionId === "owner_foto_link" || actionId === "painel_foto_link") { await pedirGrupo("waiting_image_url"); return }
    if (actionId === "owner_remover_foto" || actionId === "painel_remover_foto") { await pedirGrupo("confirm_rmfoto"); return }
    if (actionId === "owner_config" || actionId === "painel_config") { await enviarSubmenuConfig(chatJid); return }
    if (actionId === "owner_sair") { clearState(ownerKey); await sock.sendMessage(chatJid, { text: "🚪 Painel fechado." }); return }

    if (actionId === "cfg_menuImage") { setState(ownerKey, { action: "waiting_menu_image" }); await enviarCancelavel(chatJid, "🖼️ Envie a nova imagem do menu."); return }
    if (actionId === "cfg_owner") { await enviarVoltar(chatJid, `👤 Owner: NYX\n📱 ${getOwnerNumber()}`); return }
    if (actionId === "cfg_number") { await enviarVoltar(chatJid, `📱 Conectado: ${normalizeNumber(sock.user.id)}`); return }
    if (actionId === "cfg_status") {
        const arr = Object.values(cachedGroups)
        await enviarVoltar(chatJid, `🟢 SYZYGY ONLINE\n👥 Grupos: ${arr.length}\n👑 Admin: ${arr.filter(g=>g.isAdmin).length}\n🕐 Uptime: ${formatUptime(Date.now()-bootTime)}`)
        return
    }
    if (actionId === "cfg_restart") { clearState(ownerKey); await enviarPainelInicial(chatJid); return }

    if (actionId === "nuke_confirm_yes") {
        const st = getState(ownerKey); if (!st || st.action !== "confirm_nuke") return
        try { await executarNuke(st.groupJid); await enviarVoltar(chatJid, "✅ NUKE executado.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return
    }
    if (actionId === "rmfoto_confirm_yes") {
        const st = getState(ownerKey); if (!st || st.action !== "confirm_rmfoto") return
        try { const ok = await removerFotoGrupo(st.groupJid); await enviarVoltar(chatJid, ok ? "✅ Foto removida." : "⚠️ Sem suporte.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return
    }
    if (actionId === "flood_confirm_yes") {
        const st = getState(ownerKey); if (!st || st.action !== "waiting_flood_confirm") return
        try { await executarFlood(st.groupJid, st.floodMessage, st.floodQtd); await enviarVoltar(chatJid, "✅ Flood finalizado.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return
    }

    if (actionId.startsWith("grp_select_")) {
        const n = parseInt(actionId.replace("grp_select_", ""))
        const entry = (groupSelectionCache[ownerKey] || {})[n]
        if (!entry) { await enviarVoltar(chatJid, "⚠️ Seleção expirada."); return }
        const st = getState(ownerKey)
        if (!st || st.action !== "waiting_group") {
            setState(ownerKey, {
                action: "group_menu",
                groupJid: entry.id,
                selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: n }
            })
            await enviarMenuAcoesGrupo(chatJid, entry)
            return
        }
        setState(ownerKey, {
            action: st.next,
            groupJid: entry.id,
            selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: n }
        })
        await processarSelecaoGrupo(chatJid, ownerKey, st.next, entry); return
    }
}

async function processarSelecaoGrupo(chatJid, ownerKey, next, entry) {
    const map = {
        waiting_name: `📝 Digite o novo nome para:\n${entry.subject}`,
        waiting_bio: `📄 Digite a nova bio para:\n${entry.subject}`,
        waiting_both_name: `📝 Digite o nome (depois a bio):\n${entry.subject}`,
        waiting_group_image: `📷 Envie a imagem (foto ou documento).\nFormatos: JPG, PNG, WEBP.`,
        waiting_image_url: `🔗 Envie a URL direta da imagem:`,
        waiting_flood_message: `Digite a mensagem:`
    }
    if (map[next]) { setState(ownerKey, { action: next, groupJid: entry.id }); await enviarCancelavel(chatJid, map[next]); return }
    if (next === "confirm_nuke") { setState(ownerKey, { action: "confirm_nuke", groupJid: entry.id }); await enviarConfirmacao(chatJid, { titulo: "⚠️ CONFIRMAR NUKE", texto: `Grupo: ${entry.subject}\n\nAção destrutiva.`, idConfirmar: "nuke_confirm_yes" }); return }
    if (next === "confirm_rmfoto") { setState(ownerKey, { action: "confirm_rmfoto", groupJid: entry.id }); await enviarConfirmacao(chatJid, { titulo: "⚠️ REMOVER FOTO", texto: `Grupo: ${entry.subject}\n\nRemover?`, idConfirmar: "rmfoto_confirm_yes" }); return }
}

// ============================================================
// TRADUÇÃO TEXTUAL DE FALLBACK (PREVINE LOOP DE TEXTO)
// ============================================================

const TEXT_TO_ACTION = {
    "cancelar": "menu_cancel",
    "!cancelar": "menu_cancel",
    "voltar": "abrir_painel",
    "!voltar": "abrir_painel",
    "menu": "menu_inicial",
    "!menu": "menu_inicial",
    "menutest": "menu_inicial",
    "!menutest": "menu_inicial",
    "abrir painel": "owner_panel",
    "!abrir painel": "owner_panel",
    "painel": "owner_panel",
    "!painel": "owner_panel",
    "01": "painel_registrar_nome", "1": "painel_registrar_nome",
    "02": "painel_registrar_bio", "2": "painel_registrar_bio",
    "03": "painel_listar_grupos", "3": "painel_listar_grupos",
    "04": "painel_nuke", "4": "painel_nuke",
    "05": "painel_so_nome", "5": "painel_so_nome",
    "06": "painel_so_bio", "6": "painel_so_bio",
    "07": "painel_nome_bio", "7": "painel_nome_bio",
    "08": "painel_flood", "8": "painel_flood",
    "09": "painel_foto_grupo", "9": "painel_foto_grupo",
    "10": "painel_foto_link",
    "11": "painel_remover_foto",
    "12": "painel_config",
    "00": "owner_sair", "0": "owner_sair"
}

// ============================================================
// PAINEL DO TERMINAL E INICIALIZAÇÃO DO BOOTSTRAP
// ============================================================

function imprimirPainel() {
    console.clear()
    process.stdout.write(bannerSYZYGY())
    process.stdout.write(painelStatus({
        conn: isConnected ? "ONLINE" : "OFFLINE",
        number: normalizeNumber(sock?.user?.id) || "-",
        owner: OWNER_NAME, session: "ACTIVE",
        uptime: formatUptime(Date.now() - bootTime),
        nome: CONFIG.nome, bio: CONFIG.bio
    }))
    origLog("")
    origLog(credLine())
    origLog("")
}

async function menuTerminal() {
    while (true) {
        imprimirPainel()
        origLog(`${C.gray} [01]${C.reset} Registrar Nome`)
        origLog(`${C.gray} [02]${C.reset} Registrar Bio`)
        origLog(`${C.gray} [03]${C.reset} Listar Grupos`)
        origLog(`${C.red} [04]${C.reset} ${C.bold}NUKE${C.reset}`)
        origLog(`${C.gray} [05]${C.reset} Só Nome`)
        origLog(`${C.gray} [06]${C.reset} Só Bio`)
        origLog(`${C.gray} [07]${C.reset} Nome + Bio`)
        origLog(`${C.red} [08]${C.reset} ${C.bold}FLOOD${C.reset}`)
        origLog(`${C.gray} [09]${C.reset} Foto do Grupo (arquivo)`)
        origLog(`${C.gray} [10]${C.reset} Foto por Link`)
        origLog(`${C.gray} [11]${C.reset} Remover Foto`)
        origLog(`${C.gray} [12]${C.reset} Configurações`)
        origLog(`${C.gray} [00]${C.reset} Sair\n`)

        const op = await ask(`${C.cyan}syzygy${C.reset}@${C.magenta}painel${C.reset} ${C.gray}>${C.reset} `)

        if (op==="1"||op==="01") { CONFIG.nome=await ask(`Novo nome: `); salvarConfig(); origLog(ok("Salvo")); await aguardarEnter(); continue }
        if (op==="2"||op==="02") { CONFIG.bio=await ask(`Nova bio: `); salvarConfig(); origLog(ok("Salvo")); await aguardarEnter(); continue }
        if (op==="3"||op==="03") {
            try { const g=await sock.groupFetchAllParticipating(); Object.values(g).forEach((x,i)=>origLog(` ${C.gray}[${i}]${C.reset} ${x.subject} ${C.dim}| ${x.id}${C.reset}`)) }
            catch(e) { origLog(err(e.message)) }
            await aguardarEnter(); continue
        }
        if (op==="0"||op==="00") { rl.close(); process.exit(0) }
        if (op==="12") {
            origLog(`Nome: ${CONFIG.nome}\nBio: ${CONFIG.bio}\nMenu img: ${CONFIG.menuImage} (${fs.existsSync(CONFIG.menuImage)?"OK":"não"})`)
            const p=await ask(`Caminho imagem (ENTER pula): `)
            if(p.trim()){CONFIG.menuImage=p.trim();salvarConfig();origLog(ok("Salvo"))}
            await aguardarEnter(); continue
        }
        if (["9","09","10","11"].includes(op)) {
            const input=await ask(`ID/Link do grupo: `); let jid
            try{jid=await resolverGrupoInput(input)}catch{origLog(err("Inválido"));await aguardarEnter();continue}
            try{
                if(op==="9"||op==="09"){const c=await ask(`Caminho: `);await alterarFotoGrupoArquivo(jid,c.trim());origLog(ok("Foto alterada"))}
                if(op==="10"){const u=await ask(`URL: `);await alterarFotoGrupoURL(jid,u.trim());origLog(ok("Foto alterada"))}
                if(op==="11"){const r=await removerFotoGrupo(jid);origLog(r?ok("Removida"):warn("Sem suporte"))}
            }catch(e){origLog(err(e.message))}
            await aguardarEnter(); continue
        }
        if (["4","04","5","05","6","06","7","07","8","08"].includes(op)) {
            const input=await ask(`ID/Link: `); let jid
            try{jid=await resolverGrupoInput(input)}catch{origLog(err("Inválido"));await aguardarEnter();continue}
            try{
                if(["5","05"].includes(op)){await alterarNomeGrupo(jid,CONFIG.nome);origLog(ok("Nome"))}
                if(["6","06"].includes(op)){await alterarBioGrupo(jid,CONFIG.bio);origLog(ok("Bio"))}
                if(["7","07"].includes(op)){await alterarNomeGrupo(jid,CONFIG.nome);await alterarBioGrupo(jid,CONFIG.bio);origLog(ok("Nome+Bio"))}
                if(["4","04"].includes(op)){const c=await ask("CONFIRMAR: ");if(c.trim()==="CONFIRMAR")await executarNuke(jid);else origLog(warn("Cancelado"))}
                if(["8","08"].includes(op)){const msg=await ask(`Msg: `);const q=Math.min(parseInt(await ask(`Qtd (max ${MAX_FLOOD}): `))||10,MAX_FLOOD);await executarFlood(jid,msg,q);origLog(ok("Flood ok"))}
            }catch(e){origLog(err(e.message))}
            await aguardarEnter()
        }
    }
}

console.clear()
process.stdout.write(bannerSYZYGY())
origLog(boot("Inicializando SYZYGY..."))
origLog(ok("Configurações carregadas"))
origLog(ok("Carregando autenticação..."))

try {
    await iniciarConexao()
    origLog(ok("Conexão WhatsApp estabelecida com sucesso"))
    origLog("")
    origLog(credLine())
    origLog("")
    await menuTerminal()
} catch (e) {
    origLog(err(`Falha crítica: ${e.message}`))
    process.exit(1)
}
