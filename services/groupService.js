// services/groupService.js
// [v29] Ultra rápido: throttle reduzido, lotes maiores, roubar paralelo, blindagem.

import fs from "fs"
import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber, isAuthorizedGroup } from "../utils/permissions.js"
import { err, ok, warn } from "../utils/terminalUI.js"
import { CONFIG, MAX_FLOOD, FLOOD_MODOS } from "../utils/config.js"
// [INFRA FLOOD] Kill switch dos presets, recuperado da arena 01a0aaae.
// Import direto (não passa por features/flood/index.js) para não arrastar o resto da
// feature para dentro do serviço mais quente do projeto.
import { isKillSwitchOn } from "../features/flood/killswitch.js"
import { prepararFoto, prepararFotoBuffer, fetchImagem } from "./mediaService.js"

function isProtectedGroup(jid) {
    try { return isAuthorizedGroup(jid) } catch { return false }
}

// Throttle leve para metadata (200ms) + fila serializada
let _lastMetaTs = 0
let _metaQueue = Promise.resolve()
export async function throttledGroupMetadata(jid) {
    const task = async () => {
        const now = Date.now()
        const elapsed = now - _lastMetaTs
        if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed))
        _lastMetaTs = Date.now()
        const meta = await getSock().groupMetadata(jid)
        setCachedGroupMeta(jid, meta)
        try {
            const { atualizarMapaDeParticipantes } = await import("./lidResolver.js")
            atualizarMapaDeParticipantes(meta.participants)
        } catch {}
        return meta
    }
    const res = _metaQueue.then(task, task)
    _metaQueue = res.catch(() => {})
    return res
}

function getCachedGroupMeta(jid) {
    const c = rt().cachedGroups?.[jid]
    if (!c) return null
    return c._fullMeta || null
}

function setCachedGroupMeta(jid, meta) {
    if (!rt().cachedGroups) rt().cachedGroups = {}
    if (!rt().cachedGroups[jid]) rt().cachedGroups[jid] = { subject: meta.subject || "Sem nome", isAdmin: false }
    rt().cachedGroups[jid]._fullMeta = meta
    if (Array.isArray(meta.participants)) {
        rt().cachedGroups[jid].participants = meta.participants
        rt().cachedGroups[jid].participantsIds = meta.participants.map(p => p.id)
    }
}

async function getParticipantsCachedOrFetch(jid) {
    const cached = rt().cachedGroups?.[jid]
    if (cached?.participants && Array.isArray(cached.participants) && cached.participants.length) {
        return cached.participants
    }
    if (cached?.participantsIds && cached.participantsIds.length) {
        return cached.participantsIds.map(id => ({ id }))
    }
    try {
        const meta = await throttledGroupMetadata(jid)
        return meta.participants
    } catch { return [] }
}

export async function safeSendMessage(jid, content, retries = 1) {
    const sock = getSock()
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await sock.sendMessage(jid, content)
        } catch (e) {
            const msg = String(e.message || "").toLowerCase()
            const isRate = msg.includes("rate-overlimit") || msg.includes("rate") || e.data === 429
            if (isRate && attempt < retries) {
                const delay = 800 * (attempt + 1) + Math.floor(Math.random() * 300)
                await new Promise(r => setTimeout(r, delay))
                continue
            }
            throw e
        }
    }
}

export async function resolverGrupoInput(input) {
    const sock = getSock()
    let jid = input.trim()
    if (jid.includes("whatsapp.com")) {
        const codigo = jid.split("/").pop().split("?")[0]
        const g = await sock.groupGetInviteInfo(codigo)
        jid = g.id
    }
    return jid
}

export async function alterarNomeGrupo(jid, nome) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — não pode alterar nome")
    await getSock().groupUpdateSubject(jid, nome)
}

export async function alterarBioGrupo(jid, bio) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — não pode alterar bio")
    await getSock().groupUpdateDescription(jid, bio)
}


// [v58] TROCA DE FOTO COM RETRY — a foto é o ÚNICO passo de roubar/nuke que
// depende da CONEXÃO DE MÍDIA (upload HTTP). Bug conhecido do fork
// (@lucasmod/boruto-vk7-baileys 2.1.0, e já valia no innovatorssoft 7.4.7): se UMA busca de media_conn falhar, a
// promise rejeitada fica NO CACHE e todos os uploads seguintes falham até
// reconectar ("depois de um tempo a foto não muda mais" — nome/bio/fechar
// continuam porque vão pelo canal de sinal). Aqui: retry com backoff +
// renovação da media_conn + motivo REAL no erro (nunca engolido).
export async function trocarFotoComRetry(jid, prepararBuf, tentativas = 3) {
    const sock = getSock()
    let ultimoErro = null
    for (let t = 1; t <= tentativas; t++) {
        try {
            const buf = await prepararBuf()
            await sock.updateProfilePicture(jid, buf)
            if (t > 1) console.log(ok(`[FOTO] recuperou na tentativa ${t} -> ${jid}`))
            return true
        } catch (e) {
            ultimoErro = e
            console.log(warn(`[FOTO] tentativa ${t}/${tentativas} falhou (${jid}): ${e.message}`))
            if (t >= tentativas) break
            try {
                if (typeof sock.refreshMediaConn === "function") await sock.refreshMediaConn(true)
            } catch (eRefresh) {
                throw new Error(`conexão de mídia morta no cache do fork (${eRefresh.message || eRefresh}) — REINICIE o bot para restaurar os uploads`)
            }
            await new Promise(r => setTimeout(r, 1500 * t))
        }
    }
    throw ultimoErro
}

export async function alterarFotoGrupoArquivo(jid, caminho) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — não pode alterar foto")
    if (!fs.existsSync(caminho)) throw new Error("Arquivo não encontrado")
    await trocarFotoComRetry(jid, () => prepararFoto(caminho))
}

export async function alterarFotoGrupoURL(jid, url) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    const raw = await fetchImagem(url)
    await trocarFotoComRetry(jid, () => prepararFotoBuffer(raw))
}

export async function alterarFotoGrupoBuffer(jid, buffer) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    await trocarFotoComRetry(jid, () => prepararFotoBuffer(buffer))
}

export async function removerFotoGrupo(jid) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    const sock = getSock()
    if (typeof sock.removeProfilePicture === "function") {
        await sock.removeProfilePicture(jid)
        return true
    }
    return false
}

export async function executarNuke(jid) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — NUKE bloqueado")
    const sock = getSock()
    const resumo = { foto: false, nome: false, bio: false, fechado: false, removidos: 0, erros: [] }
    try {
        let fotoPath = null
        if (fs.existsSync("./foto.jpg")) fotoPath = "./foto.jpg"
        else if (CONFIG.menuImage && fs.existsSync(CONFIG.menuImage)) fotoPath = CONFIG.menuImage
        if (fotoPath) {
            await trocarFotoComRetry(jid, () => prepararFoto(fotoPath))
            resumo.foto = true
        } else {
            // [v58] foto "-" sempre com motivo: sem imagem configurada não é
            // falha de upload, mas o usuário precisa saber POR QUE não mudou.
            resumo.erros.push("foto: sem imagem configurada (use ./foto.jpg ou config menuImage)")
        }
    } catch (e) { resumo.erros.push(`foto: ${e.message}`) }
    try { await sock.groupUpdateSubject(jid, CONFIG.nome); resumo.nome = true } catch (e) { resumo.erros.push(`nome: ${e.message}`) }
    try { await sock.groupUpdateDescription(jid, CONFIG.bio); resumo.bio = true } catch (e) { resumo.erros.push(`bio: ${e.message}`) }
    try { await sock.groupSettingUpdate(jid, "announcement"); resumo.fechado = true } catch (e) { resumo.erros.push(`fechar: ${e.message}`) }
    try {
        const participants = await getParticipantsCachedOrFetch(jid)
        const botNum = normalizeNumber(sock.user.id)
        const rem = participants
            .filter(p => { const n = normalizeNumber(p.id); const l = normalizeNumber(p.lid || ""); const dono = normalizeNumber(getOwnerNumber()); const botL = normalizeNumber(sock.user?.lid || ""); const protegido = n === botNum || l === botNum || (botL && (n === botL || l === botL)) || (dono && (n === dono || l === dono)); return !protegido; })
            .map(p => p.id)
        if (rem.length > 0) {
            try {
                await sock.groupParticipantsUpdate(jid, rem, "remove")
                resumo.removidos = rem.length
            } catch (e) { resumo.erros.push(`remover: ${e.message}`) }
        }
    } catch (e) { resumo.erros.push(`metadata: ${e.message}`) }
    return resumo
}

export async function alterarTudoGrupo(jid, { nome, bio, bufferFoto } = {}) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado)")
    const sock = getSock()
    const nomeFinal = nome || CONFIG.nome
    const bioFinal = bio || CONFIG.bio
    await sock.groupUpdateSubject(jid, nomeFinal)
    await sock.groupUpdateDescription(jid, bioFinal)
    // [v58] catch VAZIO REMOVIDO (regra do projeto): falha de foto volta com
    // o motivo real para quem chamou reportar.
    let fotoErro = null
    try {
        if (bufferFoto) {
            await trocarFotoComRetry(jid, () => prepararFotoBuffer(bufferFoto))
        } else {
            let fotoPath = null
            if (fs.existsSync("./foto.jpg")) fotoPath = "./foto.jpg"
            else if (CONFIG.menuImage && fs.existsSync(CONFIG.menuImage)) fotoPath = CONFIG.menuImage
            if (fotoPath) await trocarFotoComRetry(jid, () => prepararFoto(fotoPath))
        }
    } catch (eFoto) {
        fotoErro = eFoto.message
        console.log(warn(`[TUDO] foto falhou em ${jid}: ${fotoErro}`))
    }
    return { fotoErro }
}

export async function mencionarTodosFantasma(jid, texto = "") {
    let mentions = []
    try {
        const parts = await getParticipantsCachedOrFetch(jid)
        mentions = parts.map(p => p.id)
    } catch { return false }
    const corpo = (texto && String(texto).trim().length) ? texto : "\u2063"
    try {
        await safeSendMessage(jid, { text: corpo, mentions })
        return true
    } catch { return false }
}

export function getFloodConfig(modoOuIntervalo) {
    if (typeof modoOuIntervalo === "object" && modoOuIntervalo !== null) {
        const m = modoOuIntervalo.modo ? (FLOOD_MODOS[modoOuIntervalo.modo] || FLOOD_MODOS.normal) : null
        return {
            intervalo: modoOuIntervalo.intervaloMs ?? modoOuIntervalo.intervalo ?? m?.intervalo ?? CONFIG.floodInterval ?? 100,
            lote: modoOuIntervalo.lote ?? m?.lote ?? CONFIG.floodLote ?? 6,
            jitter: modoOuIntervalo.jitter ?? (modoOuIntervalo.modo === "seguro") ?? CONFIG.floodJitter ?? false,
            modo: modoOuIntervalo.modo || CONFIG.floodModo || "normal"
        }
    }
    if (typeof modoOuIntervalo === "string") {
        const key = modoOuIntervalo.toLowerCase()
        if (FLOOD_MODOS[key]) {
            return { intervalo: FLOOD_MODOS[key].intervalo, lote: FLOOD_MODOS[key].lote, jitter: key === "seguro", modo: key }
        }
        if (key === "1" || key === "rapido" || key === "rápido") return { intervalo: FLOOD_MODOS.rapido.intervalo, lote: FLOOD_MODOS.rapido.lote, jitter: false, modo: "rapido" }
        if (key === "2" || key === "normal") return { intervalo: FLOOD_MODOS.normal.intervalo, lote: FLOOD_MODOS.normal.lote, jitter: false, modo: "normal" }
        if (key === "3" || key === "lento") return { intervalo: FLOOD_MODOS.lento.intervalo, lote: FLOOD_MODOS.lento.lote, jitter: false, modo: "lento" }
        if (key === "4" || key === "seguro") return { intervalo: FLOOD_MODOS.seguro.intervalo, lote: FLOOD_MODOS.seguro.lote, jitter: true, modo: "seguro" }
        const num = parseInt(key.replace(/\D/g, ""))
        if (!isNaN(num) && num >= 20 && num <= 5000) {
            return { intervalo: num, lote: CONFIG.floodLote || 6, jitter: false, modo: "custom" }
        }
    }
    if (typeof modoOuIntervalo === "number") {
        return { intervalo: modoOuIntervalo, lote: CONFIG.floodLote || 6, jitter: false, modo: "custom" }
    }
    const modoCfg = FLOOD_MODOS[CONFIG.floodModo] || FLOOD_MODOS.normal
    return {
        intervalo: CONFIG.floodInterval ?? modoCfg.intervalo,
        lote: CONFIG.floodLote ?? modoCfg.lote,
        jitter: CONFIG.floodJitter ?? (CONFIG.floodModo === "seguro"),
        modo: CONFIG.floodModo || "normal"
    }
}

// [v29] Flood ultra rápido
export async function executarFlood(jid, msg, qtd, intervaloOuOpts = 100, buildContent = null) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — FLOOD bloqueado")
    const sock = getSock()
    qtd = Math.min(Math.max(1, qtd), MAX_FLOOD)

    const cfg = getFloodConfig(intervaloOuOpts)
    const intervaloMs = cfg.intervalo
    const LOTE = Math.max(1, Math.min(cfg.lote, 10))

    let mentions = []
    if (CONFIG.marcarFantasma) {
        try {
            const parts = await getParticipantsCachedOrFetch(jid)
            mentions = parts.map(p => p.id)
        } catch {}
    }

    const invis = "\u200b"
    let ok = 0, erros = 0

    let stopado = null
    let tentadas = 0
    for (let i = 0; i < qtd; i += LOTE) {
        // [INFRA FLOOD] O flood clássico NÃO tinha como ser interrompido. Agora o
        // kill switch dos presets é consultado aqui, na fronteira do lote (não no
        // meio de um Promise.all), e o resultado diz quantos de fato saíram.
        if (isKillSwitchOn()) { stopado = "KILL_SWITCH"; break }
        const n = Math.min(LOTE, qtd - i)
        tentadas += n
        const envios = []
        for (let k = 0; k < n; k++) {
            const idx = i + k
            const corpo = msg + invis.repeat((idx % 6) + 1)
            // CONTEÚDO por iteração. Sem builder, o comportamento é EXATAMENTE o
            // flood clássico ({ text }). Um TIPO de conteúdo (ex.: shopping) entra
            // pelo buildContent — mesmo laço, mesma fila, mesmo throttle, mesmas
            // permissões. Não existe executor de loja separado.
            let opts
            if (typeof buildContent === "function") {
                let custom = null
                try { custom = buildContent({ index: idx, body: corpo, msg }) } catch { custom = null }
                opts = custom && typeof custom === "object" ? custom : { text: corpo }
            } else {
                opts = { text: corpo }
            }
            // [INFRA FLOOD] "mentions" só é sobrescrito pelo marcarFantasma quando o
            // builder NÃO forneceu lista própria: preset de mention marca somente
            // destinos explicitamente autorizados, nunca todos os participantes.
            if (mentions.length && k === 0 && opts.mentions === undefined) opts.mentions = mentions
            envios.push(
                safeSendMessage(jid, opts, 0).then(() => { ok++ }).catch(() => { erros++ })
            )
        }
        await Promise.all(envios)
        if (i + LOTE < qtd) {
            let delay = intervaloMs
            if (cfg.jitter) delay += Math.floor(Math.random() * 250) + 50
            if (delay > 0) await new Promise(r => setTimeout(r, delay))
        }
    }
    return {
        ok,
        erros,
        total: qtd,
        tentadas,
        modo: cfg.modo,
        intervalo: intervaloMs,
        lote: LOTE,
        ...(stopado ? { stopado } : {})
    }
}

export async function executarFloodLote(grupos, msg, qtd, opts = {}) {
    // opts.buildContent (opcional) é repassado ao MESMO laço de executarFlood —
    // lote e loja compartilham exatamente o mesmo executor.
    const resultados = []
    const cfg = getFloodConfig(opts)
    const delayEntreGrupos = cfg.modo === "seguro" ? 600 : cfg.modo === "lento" ? 300 : cfg.modo === "rapido" ? 150 : 200
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        // [INFRA FLOOD] Kill switch também vale para o lote: o que ainda não
        // começou é reportado como cancelado em vez de ser enviado "para terminar".
        if (isKillSwitchOn()) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Flood cancelado (kill switch)", stopado: "KILL_SWITCH" })
            continue
        }
        if (isProtectedGroup(g.id)) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Grupo protegido (autorizado)" })
            continue
        }
        try {
            const r = await executarFlood(g.id, msg, qtd, cfg, typeof opts?.buildContent === "function" ? opts.buildContent : null)
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: true, ...r })
        } catch (e) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: e.message })
        }
        if (i < grupos.length - 1 && delayEntreGrupos > 0) await new Promise(r => setTimeout(r, delayEntreGrupos))
    }
    return resultados
}

export async function nukeComPreset(jid, { nome, bio, fotoPath, bufferFoto } = {}) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — NUKE bloqueado")
    const sock = getSock()
    const resumo = { foto: false, nome: false, bio: false, fechado: false, removidos: 0, erros: [] }
    let meta = null
    try {
        const parts = await getParticipantsCachedOrFetch(jid)
        meta = getCachedGroupMeta(jid) || { participants: parts }
        if (!meta.participants || !meta.participants.length) {
            meta = await throttledGroupMetadata(jid)
        }
    } catch (e) { resumo.erros.push(`metadata: ${e.message}`) }

    const tarefas = []
    if (meta && Array.isArray(meta.participants)) {
        const botNum = normalizeNumber(sock.user?.id)
        const botL = normalizeNumber(sock.user?.lid || "")
        const dono = normalizeNumber(getOwnerNumber())
        const rem = meta.participants.filter(p => {
            const n = normalizeNumber(p.id); const l = normalizeNumber(p.lid || "")
            const prot = n === botNum || l === botNum || (botL && (n === botL || l === botL)) || (dono && (n === dono || l === dono)) || p.id === meta.owner
            return !prot
        }).map(p => p.id)
        if (rem.length) {
            tarefas.push(sock.groupParticipantsUpdate(jid, rem, "remove")
                .then(() => { resumo.removidos = rem.length }).catch(e => resumo.erros.push(`remover: ${e.message}`)))
        }
    }
    tarefas.push(sock.groupSettingUpdate(jid, "announcement").then(() => { resumo.fechado = true }).catch(e => resumo.erros.push(`fechar: ${e.message}`)))
    if (nome) tarefas.push(sock.groupUpdateSubject(jid, nome).then(() => { resumo.nome = true }).catch(e => resumo.erros.push(`nome: ${e.message}`)))
    if (bio != null) tarefas.push(sock.groupUpdateDescription(jid, bio).then(() => { resumo.bio = true }).catch(e => resumo.erros.push(`bio: ${e.message}`)))
    tarefas.push((async () => {
        try {
            let buf = null
            if (bufferFoto) buf = await prepararFotoBuffer(bufferFoto)
            else if (fotoPath && fs.existsSync(fotoPath)) buf = await prepararFoto(fotoPath)
            if (buf) { await sock.updateProfilePicture(jid, buf); resumo.foto = true }
        } catch (e) { resumo.erros.push(`foto: ${e.message}`) }
    })())
    await Promise.all(tarefas)
    return resumo
}

export async function nukeComPresetLote(grupos, dadosPreset, opts = {}) {
    const resultados = []
    const delayEntre = 250
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        if (isProtectedGroup(g.id)) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Grupo protegido (autorizado)" })
            continue
        }
        try {
            if (opts.mensagem) {
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(g.id, opts.mensagem)
                    else await safeSendMessage(g.id, { text: opts.mensagem }, 0)
                    await new Promise(r => setTimeout(r, 120))
                } catch {}
            }
            const r = await nukeComPreset(g.id, dadosPreset)
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: true, ...r })
        } catch (e) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: e.message })
        }
        if (i < grupos.length - 1) await new Promise(r => setTimeout(r, delayEntre))
    }
    return resultados
}

// [v29] Roubar ultra rápido: fecha+tranca em paralelo, depois foto+nome+bio em paralelo, depois demote
export async function roubarGrupo(jid, { nome, bio, fotoPath, bufferFoto } = {}) {
    if (isProtectedGroup(jid)) throw new Error("Grupo protegido (autorizado) — ROUBAR bloqueado")
    const sock = getSock()
    const resumo = { rebaixados: 0, fechado: false, editRestrito: false, foto: false, nome: false, bio: false, erros: [] }
    const botNum = normalizeNumber(sock.user?.id)
    const botLid = normalizeNumber(sock.user?.lid)
    const donoNum = normalizeNumber(getOwnerNumber())
    const ehProtegido = (p) => {
        const n = normalizeNumber(p?.id || p?.jid || "")
        const l = normalizeNumber(p?.lid || "")
        return (botNum && (n === botNum || l === botNum))
            || (botLid && (n === botLid || l === botLid))
            || (donoNum && (n === donoNum || l === donoNum))
    }
    let meta = null
    try {
        const parts = await getParticipantsCachedOrFetch(jid)
        meta = getCachedGroupMeta(jid) || { participants: parts }
        if (!meta.participants || meta.participants.length !== parts.length) {
            try {
                const full = await throttledGroupMetadata(jid)
                meta = full
            } catch {}
        }
    } catch (e) { resumo.erros.push(`metadata: ${e.message}`) }

    // Fecha + tranca em paralelo (rápido)
    try {
        const t1 = []
        t1.push(sock.groupSettingUpdate(jid, "announcement").then(() => { resumo.fechado = true }).catch(e => resumo.erros.push(`fechar: ${e.message}`)))
        t1.push(sock.groupSettingUpdate(jid, "locked").then(() => { resumo.editRestrito = true }).catch(e => resumo.erros.push(`locked: ${e.message}`)))
        await Promise.all(t1)
    } catch {}

    // Foto + nome + bio em paralelo
    try {
        const t2 = []
        t2.push((async () => {
            try {
                if (bufferFoto) { await trocarFotoComRetry(jid, () => prepararFotoBuffer(bufferFoto)); resumo.foto = true }
                else if (fotoPath && fs.existsSync(fotoPath)) { await trocarFotoComRetry(jid, () => prepararFoto(fotoPath)); resumo.foto = true }
            } catch (e) { resumo.erros.push(`foto: ${e.message}`) }
        })())
        if (nome) t2.push(sock.groupUpdateSubject(jid, nome).then(() => { resumo.nome = true }).catch(e => resumo.erros.push(`nome: ${e.message}`)))
        if (bio != null) t2.push(sock.groupUpdateDescription(jid, bio).then(() => { resumo.bio = true }).catch(e => resumo.erros.push(`bio: ${e.message}`)))
        await Promise.all(t2)
    } catch {}

    // Demote por último
    try {
        if (meta && Array.isArray(meta.participants)) {
            const admins = meta.participants
                .filter(p => (p.admin === "admin" || p.admin === "superadmin") && !ehProtegido(p))
                .map(p => p.id)
            if (admins.length > 0) {
                await sock.groupParticipantsUpdate(jid, admins, "demote")
                resumo.rebaixados = admins.length
            }
        }
    } catch (e) { resumo.erros.push(`demote: ${e.message}`) }

    return resumo
}

export async function roubarGrupoLote(grupos, dadosPreset, opts = {}) {
    const resultados = []
    const delayEntre = 250
    for (let i = 0; i < grupos.length; i++) {
        const g = grupos[i]
        if (isProtectedGroup(g.id)) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: "Grupo protegido (autorizado)" })
            continue
        }
        try {
            if (opts.mensagem || CONFIG.linkDivulgacao) {
                const msg = opts.mensagem || CONFIG.linkDivulgacao
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(g.id, msg)
                    else await safeSendMessage(g.id, { text: msg }, 0)
                    await new Promise(r => setTimeout(r, 100))
                } catch {}
            }
            const r = await roubarGrupo(g.id, dadosPreset)
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: true, ...r })
        } catch (e) {
            resultados.push({ id: g.id, subject: g.subject || g.id, ok: false, erro: e.message })
        }
        if (i < grupos.length - 1) await new Promise(r => setTimeout(r, delayEntre))
    }
    return resultados
}

export async function validarGrupoExiste(jid) {
    const sock = getSock()
    try {
        await throttledGroupMetadata(jid)
        return true
    } catch {
        return false
    }
}

export async function limparCacheFantasmas(forcar = false) {
    const sock = getSock()
    if (!sock) return { removidos: 0, verificados: 0, lista: [] }
    try {
        const grupos = await sock.groupFetchAllParticipating()
        const idsReais = new Set(Object.keys(grupos))
        const cache = rt().cachedGroups || {}
        const idsCache = Object.keys(cache)
        const fantasmas = idsCache.filter(id => !idsReais.has(id))
        let removidos = 0
        const lista = []
        for (const id of fantasmas) {
            if (forcar) {
                lista.push({ id, subject: cache[id]?.subject || id })
                delete rt().cachedGroups[id]
                removidos++
            } else {
                const existe = await validarGrupoExiste(id)
                if (!existe) {
                    lista.push({ id, subject: cache[id]?.subject || id })
                    delete rt().cachedGroups[id]
                    removidos++
                }
            }
        }
        return { removidos, verificados: idsCache.length, lista, totalReais: idsReais.size }
    } catch (e) {
        console.log(err(`limparCacheFantasmas: ${e.message}`))
        return { removidos: 0, verificados: 0, lista: [], erro: e.message }
    }
}

let _ultimaAtualizacao = 0
const GRUPOS_TTL_MS = 30 * 1000

export async function atualizarGrupos(forcar = false) {
    const sock = getSock()
    if (!forcar && Date.now() - _ultimaAtualizacao < GRUPOS_TTL_MS && Object.keys(rt().cachedGroups || {}).length) {
        return rt().cachedGroups
    }
    try {
        const grupos = await sock.groupFetchAllParticipating()
        const botNum = normalizeNumber(sock.user?.id)
        const botLid = normalizeNumber(sock.user?.lid)
        const lista = Object.values(grupos)

        const ehBot = (p) => {
            const pNum = normalizeNumber(p.id || p.jid || "")
            const pLid = normalizeNumber(p.lid || "")
            return (botNum && (pNum === botNum || pLid === botNum))
                || (botLid && (pNum === botLid || pLid === botLid))
        }
        const admDe = (parts) => {
            if (!Array.isArray(parts)) return false
            const me = parts.find(ehBot)
            return !!(me && (me.admin === "admin" || me.admin === "superadmin"))
        }

        const novo = {}
        const faltando = []
        for (const g of lista) {
            try {
                const { atualizarMapaDeParticipantes } = await import("./lidResolver.js")
                if (Array.isArray(g.participants)) atualizarMapaDeParticipantes(g.participants)
            } catch {}
            if (Array.isArray(g.participants) && g.participants.length) {
                novo[g.id] = {
                    subject: g.subject || "Sem nome",
                    isAdmin: admDe(g.participants),
                    participants: g.participants,
                    participantsIds: g.participants.map(p => p.id),
                    _fullMeta: g
                }
            } else {
                novo[g.id] = { subject: g.subject || "Sem nome", isAdmin: false }
                faltando.push(g.id)
            }
        }
        if (faltando.length) {
            const LOTE = 6
            for (let i = 0; i < faltando.length; i += LOTE) {
                const parte = faltando.slice(i, i + LOTE)
                await Promise.all(parte.map(async (id) => {
                    try {
                        const meta = await throttledGroupMetadata(id)
                        novo[id] = {
                            subject: meta.subject || novo[id]?.subject || "Sem nome",
                            isAdmin: admDe(meta.participants),
                            participants: meta.participants,
                            participantsIds: meta.participants.map(p => p.id),
                            _fullMeta: meta
                        }
                    } catch {}
                }))
                if (i + LOTE < faltando.length) await new Promise(r => setTimeout(r, 200))
            }
        }

        rt().cachedGroups = novo
        _ultimaAtualizacao = Date.now()
    } catch (e) {
        console.log(err(`atualizarGrupos: ${e.message}`))
    }
    return rt().cachedGroups
}

export async function cachedGroupMetadata(jid) {
    const c = rt().cachedGroups?.[jid]
    if (c?._fullMeta && Array.isArray(c._fullMeta.participants)) return c._fullMeta
    if (c?.participants && Array.isArray(c.participants)) {
        return { id: jid, subject: c.subject, participants: c.participants }
    }
    return undefined
}
