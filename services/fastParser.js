// services/fastParser.js
// [v31] Modo rápido universal: todos comandos + configs + agendamento via @
// Ex: 3/01/2/msg, 2/01/msg/20/1, 4/01/2, 6/1,3,5/1/msg/20/1@10m, 5/10/rapido, 5/20/5511...

import { rt } from "../connection/socket.js"
import { getSock } from "../connection/socket.js"
import { setState } from "../utils/stateManager.js"
import { normalizeNumber, isOwner, isAuthorizedGroup } from "../utils/permissions.js"
import { CONFIG, MAX_FLOOD, FLOOD_MODOS } from "../utils/config.js"
import { atualizarGrupos, executarFlood, executarFloodLote, nukeComPreset, nukeComPresetLote, roubarGrupo, roubarGrupoLote, getFloodConfig, resolverGrupoInput, safeSendMessage, cachedGroupMetadata } from "./groupService.js"
import { ordenarGrupos } from "../menus/groupMenu.js"
import { getPreset, fotoPresetPath, listarPresetsTexto } from "./presetService.js"
import { mencionarTodosFantasma } from "./groupService.js"

function isProtected(jid) {
    try { return isAuthorizedGroup(jid) } catch { return false }
}

async function obterCache(ownerKey) {
    let cache = rt().groupSelectionCache[ownerKey]
    if (cache && Object.keys(cache).length) return cache
    // Se já tem cachedGroups, usa sem fetch
    if (rt().cachedGroups && Object.keys(rt().cachedGroups).length) {
        const todos = Object.entries(rt().cachedGroups).map(([id, info]) => ({ id, ...info }))
        const { arr } = ordenarGrupos(todos)
        cache = {}
        arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })
        rt().groupSelectionCache[ownerKey] = cache
        return cache
    }
    await atualizarGrupos()
    const todos = Object.entries(rt().cachedGroups).map(([id, info]) => ({ id, ...info }))
    const { arr } = ordenarGrupos(todos)
    cache = {}
    arr.forEach((g, i) => { cache[i + 1] = { id: g.id, subject: g.subject, isAdmin: g.isAdmin } })
    rt().groupSelectionCache[ownerKey] = cache
    return cache
}

function resolveGrupoFast(cache, raw) {
    if (!raw) return null
    raw = String(raw).trim()
    if (raw.endsWith("@g.us") || raw.includes("whatsapp.com")) {
        return { id: raw, subject: raw, isAdmin: false, _isRawJid: true }
    }
    const numMatch = raw.match(/^0*(\d+)$/)
    if (numMatch) {
        const n = parseInt(numMatch[1])
        if (cache[n]) return { ...cache[n], index: n }
    }
    const lower = raw.toLowerCase()
    const matches = []
    for (const idx of Object.keys(cache)) {
        const g = cache[idx]
        if (g.subject && g.subject.toLowerCase().includes(lower)) matches.push({ ...g, index: parseInt(idx) })
    }
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) return { _multiple: matches }
    return null
}

function parseMultiFast(cache, raw) {
    const txt = String(raw || "").trim()
    if (!txt) return null
    if (/^0*\d+$/.test(txt)) return null
    if (!/^[\d,\s,\-]+$/.test(txt)) return null
    const allNums = (txt.match(/\d+/g) || []).map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0)
    if (allNums.length < 2) return null
    const normalized = txt.replace(/,/g, " ").replace(/\s+/g, " ").trim()
    const tokens = normalized.split(" ").filter(Boolean)
    const nums = new Set()
    for (const tok of tokens) {
        if (tok.includes("-")) {
            const parts = tok.split("-").map(s => s.trim()).filter(Boolean)
            if (parts.length === 2) {
                const a = parseInt(parts[0].replace(/\D/g, "")), b = parseInt(parts[1].replace(/\D/g, ""))
                if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
                    const start = Math.min(a, b), end = Math.max(a, b)
                    const limit = Math.min(end, start + 99)
                    for (let i = start; i <= limit; i++) nums.add(i)
                }
            }
        } else {
            const n = parseInt(tok.replace(/\D/g, ""))
            if (!isNaN(n) && n > 0) nums.add(n)
        }
    }
    const entries = []
    for (const n of nums) {
        if (cache[n]) entries.push({ ...cache[n], index: n })
    }
    const uniq = []
    const seen = new Set()
    for (const e of entries) {
        if (!seen.has(e.id)) { seen.add(e.id); uniq.push(e) }
    }
    if (uniq.length < 2) return null
    return uniq
}

async function resolverEntradaGrupo(entry) {
    if (!entry) return null
    if (entry._isRawJid) {
        try {
            const jid = await resolverGrupoInput(entry.id)
            return { id: jid, subject: entry.subject || jid, isAdmin: false }
        } catch { return null }
    }
    return entry
}

function extractSchedule(text) {
    // Procura @tempo no final: ex "2/01/Oi/20/1@10m" ou "3/01/2/Oi@20:30"
    const m = text.match(/@\s*([^@]+)\s*$/)
    if (!m) return { textWithoutSchedule: text, scheduleStr: null, parsed: null }
    const scheduleStr = m[1].trim()
    // Tenta parsear como agendamento
    // Import dinâmico síncrono não dá, vamos fazer check simples aqui e deixar parse real depois
    const textWithout = text.slice(0, m.index).trim()
    return { textWithoutSchedule: textWithout, scheduleStr }
}

export async function handleFastCommand(chatJid, ownerKey, textRaw) {
    if (!textRaw) return false
    let trimmed = textRaw.trim()
    if (!trimmed) return false

    // Extrai agendamento @ no final
    let scheduleStr = null
    let scheduleParsed = null
    let isScheduled = false
    const schedExtract = extractSchedule(trimmed)
    if (schedExtract.scheduleStr) {
        try {
            const { parseAgendamento } = await import("./agendaService.js")
            const parsed = parseAgendamento(schedExtract.scheduleStr)
            if (parsed) {
                scheduleStr = schedExtract.scheduleStr
                scheduleParsed = parsed
                isScheduled = true
                trimmed = schedExtract.textWithoutSchedule
            }
        } catch {}
    }

    // Se não tem "/", pode ser config rápida tipo "5/10/rapido" já tem "/", ou "1" sem "/" não é fast
    // Comando 1 rápido: "1" ou "1/p2" ou "1/Kk" — precisa "/" para ser considerado fast exceto "1" puro?
    // Vamos aceitar "1" como fast list também, mas "1" já é mapeado no commandMap. Para não duplicar, deixamos "1" passar como fast também se for só "1" ou "1/..."
    const isMainFast = /^[1-6](?:\/.*)?$/.test(trimmed) || /^5\/\d+/.test(trimmed)
    if (!isMainFast) return false

    const cache = await obterCache(ownerKey)

    const partsRaw = trimmed.split("/").map(s => s.trim())
    const cmd = partsRaw[0]

    // Helper para agendar
    async function agendarSePrecisar(tipo, grupos, dados, mensagem) {
        if (!isScheduled || !scheduleParsed) return false
        try {
            const { agendarAcao } = await import("./agendaService.js")
            const job = agendarAcao({ tipo, grupos, dados, mensagem, delayMs: scheduleParsed.delayMs, at: scheduleParsed.at })
            const d = new Date(scheduleParsed.at)
            const quando = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
            await safeSendMessage(chatJid, { text: `⏰ Agendado rápido!\nTipo: ${tipo}\nGrupos: ${grupos.length}\nQuando: ${quando}\nID: ${job.id.slice(0, 8)}` })
            return true
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ Falha ao agendar: ${e.message}` })
            return true
        }
    }

    // 1 - LISTAR GRUPOS: 1, 1/p2, 1/Kk
    if (cmd === "1") {
        if (partsRaw.length === 1) {
            const { listarGruposInterativo } = await import("../menus/groupMenu.js")
            const novoCache = await listarGruposInterativo(chatJid, 1)
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }
        const arg = partsRaw.slice(1).join("/").trim()
        const pagMatch = arg.match(/^(?:p)?\s*(\d+)$/i)
        if (pagMatch) {
            const { listarGruposInterativo } = await import("../menus/groupMenu.js")
            const novoCache = await listarGruposInterativo(chatJid, parseInt(pagMatch[1]))
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }
        // Busca por nome
        const entry = resolveGrupoFast(cache, arg)
        if (!entry) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${arg}` })
            return true
        }
        if (entry._multiple) {
            let txt = `🔍 ${entry._multiple.length} grupos com "${arg}":\n`
            entry._multiple.slice(0, 10).forEach(mm => {
                const b = mm.isAdmin ? "👑" : "👤"
                txt += `[${String(mm.index).padStart(3, "0")}] ${b} ${mm.subject}\n`
            })
            await safeSendMessage(chatJid, { text: txt })
            return true
        }
        const grupo = await resolverEntradaGrupo(entry)
        if (grupo) {
            const { enviarMenuAcoesGrupo } = await import("../menus/groupMenu.js")
            await enviarMenuAcoesGrupo(chatJid, grupo, ownerKey)
        }
        return true
    }

    // 2 - FLOOD
    if (cmd === "2") {
        if (String(partsRaw[1] || "").toLowerCase() === "preset") {
            const { floodRouter } = await import("../features/flood/index.js")
            const name = String(partsRaw[2] || "").trim().toLowerCase()
            if (!name) {
                await safeSendMessage(chatJid, { text: `❌ Flood preset: 2/preset/<nome>\nNomes: text-test, mention-test, media-test, payment-test ou id custom\nEx: 2/preset/payment-test  (depois grupos, conteúdo, qtd, velocidade 1-4)\nEx: 2/preset/payment-test/Pagamento do pedido|25.90|BRL\nCriar/apagar: menu flood presets → c / a` })
                return true
            }
            const rest = partsRaw.slice(3).join("/").trim()
            await floodRouter(chatJid, ownerKey, "run", { presetId: name, paymentArgs: rest || undefined })
            return true
        }
        if (partsRaw.length < 4) {
            await safeSendMessage(chatJid, { text: `❌ Flood rápido: 2/<grupo>/<msg>/<qtd>[/<modo>][@tempo]\nEx: 2/01/Oi/20/1\nEx: 2/01/Oi/20/1@10m (agenda em 10m)\nPreset: 2/preset/payment-test` })
            return true
        }
        let modo = null, qtdStr, msgParts
        const last = partsRaw[partsRaw.length - 1]
        const secondLast = partsRaw[partsRaw.length - 2]
        const lastIsModo = /^(?:[1-4]|rapido|normal|lento|seguro|\d{2,4})$/i.test(last) && partsRaw.length >= 5
        if (lastIsModo) {
            modo = last
            qtdStr = secondLast
            msgParts = partsRaw.slice(2, -2)
        } else {
            modo = null
            qtdStr = last
            msgParts = partsRaw.slice(2, -1)
        }
        const grupoRaw = partsRaw[1]
        const mensagem = msgParts.join("/").trim()
        const qtd = parseInt(String(qtdStr).replace(/\D/g, ""))
        if (!mensagem || isNaN(qtd)) {
            await safeSendMessage(chatJid, { text: "❌ Mensagem ou qtd inválida." })
            return true
        }
        const grupoEntry = resolveGrupoFast(cache, grupoRaw)
        if (!grupoEntry || grupoEntry._multiple) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${grupoRaw}` })
            return true
        }
        const grupo = await resolverEntradaGrupo(grupoEntry)
        if (!grupo) {
            await safeSendMessage(chatJid, { text: "❌ Falha resolver grupo" })
            return true
        }
        if (isProtected(grupo.id)) {
            await safeSendMessage(chatJid, { text: `🛡️ Grupo protegido: ${grupo.subject}` })
            return true
        }
        if (isScheduled) {
            const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
            await agendarSePrecisar("flood", [grupo], { qtd: Math.min(qtd, MAX_FLOOD), modo: cfg.modo }, mensagem)
            return true
        }
        const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
        let msgFlood = mensagem
        if (CONFIG.linkDivulgacao) msgFlood += `\n${CONFIG.linkDivulgacao}`
        await safeSendMessage(chatJid, { text: `⚡ Flood rápido: ${grupo.subject} | ${qtd} | modo ${cfg.modo}` })
        try {
            const r = await executarFlood(grupo.id, msgFlood, Math.min(qtd, MAX_FLOOD), cfg)
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("flood", { id: grupo.id, subject: grupo.subject, qtd: r.total, modo: r.modo, ok: r.ok, via: "fast" })
            await safeSendMessage(chatJid, { text: `✅ Flood: ${r.ok}/${r.total} em ${grupo.subject} | ${r.modo}` })
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ ${e.message}` })
        }
        return true
    }

    // 3 - NUKE
    if (cmd === "3") {
        if (partsRaw.length < 3) {
            await safeSendMessage(chatJid, { text: `❌ Nuke rápido: 3/<grupo>/<preset>[/<msg|pular>][@tempo]\nEx: 3/01/2/Oi\nEx: 3/01/0/pular@10m` })
            return true
        }
        const grupoRaw = partsRaw[1]
        const presetRaw = partsRaw[2]
        const mensagemRaw = partsRaw.length >= 4 ? partsRaw.slice(3).join("/").trim() : ""

        const grupoEntry = resolveGrupoFast(cache, grupoRaw)
        if (!grupoEntry || grupoEntry._multiple) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${grupoRaw}` })
            return true
        }
        const grupo = await resolverEntradaGrupo(grupoEntry)
        if (!grupo || isProtected(grupo.id)) {
            await safeSendMessage(chatJid, { text: isProtected(grupo?.id) ? `🛡️ Protegido: ${grupo.subject}` : "❌ Grupo não encontrado" })
            return true
        }

        let presetDados = {}
        if (/^0+$/.test(presetRaw) || presetRaw === "0") {
            presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const presetIdx = parseInt(presetRaw.replace(/\D/g, ""))
            const preset = getPreset(presetIdx)
            if (!preset) {
                await safeSendMessage(chatJid, { text: `❌ Preset inválido: ${presetRaw}\n${listarPresetsTexto()}` })
                return true
            }
            presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
        }

        const semMsg = !mensagemRaw || mensagemRaw.toLowerCase() === "pular"
        let mensagemFinal = semMsg ? "" : mensagemRaw
        if (mensagemFinal && CONFIG.linkDivulgacao) mensagemFinal += `\n\n${CONFIG.linkDivulgacao}`

        if (isScheduled) {
            await agendarSePrecisar("nuke", [grupo], { preset: presetDados }, mensagemFinal || null)
            return true
        }

        await safeSendMessage(chatJid, { text: `💣 Nuke rápido: ${grupo.subject} | preset ${presetRaw}` })
        try {
            if (mensagemFinal) {
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(grupo.id, mensagemFinal)
                    else await safeSendMessage(grupo.id, { text: mensagemFinal }, 0)
                    await new Promise(r => setTimeout(r, 80))
                } catch {}
            }
            const r = await nukeComPreset(grupo.id, presetDados)
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("nuke", { id: grupo.id, subject: grupo.subject, preset: presetRaw, removidos: r.removidos, via: "fast" })
            await safeSendMessage(chatJid, { text: `✅ NUKE ${grupo.subject}: remov ${r.removidos}` })
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ ${e.message}` })
        }
        return true
    }

    // 4 - ROUBAR
    if (cmd === "4") {
        if (partsRaw.length < 3) {
            await safeSendMessage(chatJid, { text: `❌ Roubar rápido: 4/<grupo>/<preset>[@tempo]\nEx: 4/01/2\nEx: 4/01/2@20:30` })
            return true
        }
        const grupoRaw = partsRaw[1]
        const presetRaw = partsRaw[2]

        const grupoEntry = resolveGrupoFast(cache, grupoRaw)
        if (!grupoEntry || grupoEntry._multiple) {
            await safeSendMessage(chatJid, { text: `❌ Grupo não encontrado: ${grupoRaw}` })
            return true
        }
        const grupo = await resolverEntradaGrupo(grupoEntry)
        if (!grupo || isProtected(grupo.id)) {
            await safeSendMessage(chatJid, { text: isProtected(grupo?.id) ? `🛡️ Protegido: ${grupo.subject}` : "❌ Grupo não encontrado" })
            return true
        }

        let presetDados = {}
        if (/^0+$/.test(presetRaw) || presetRaw === "0") {
            presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const presetIdx = parseInt(presetRaw.replace(/\D/g, ""))
            const preset = getPreset(presetIdx)
            if (!preset) {
                await safeSendMessage(chatJid, { text: `❌ Preset inválido` })
                return true
            }
            presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
        }

        if (isScheduled) {
            await agendarSePrecisar("roubar", [grupo], { preset: presetDados }, null)
            return true
        }

        await safeSendMessage(chatJid, { text: `⚡ Roubar rápido: ${grupo.subject} | preset ${presetRaw}` })
        try {
            if (CONFIG.linkDivulgacao) {
                try {
                    if (CONFIG.marcarFantasma) await mencionarTodosFantasma(grupo.id, CONFIG.linkDivulgacao)
                    else await safeSendMessage(grupo.id, { text: CONFIG.linkDivulgacao }, 0)
                    await new Promise(r => setTimeout(r, 80))
                } catch {}
            }
            const r = await roubarGrupo(grupo.id, presetDados)
            const { registrarAcao } = await import("./historicoService.js")
            registrarAcao("roubar", { id: grupo.id, subject: grupo.subject, preset: presetRaw, rebaixados: r.rebaixados, via: "fast" })
            await safeSendMessage(chatJid, { text: `✅ Roubado ${grupo.subject}: rebaix ${r.rebaixados}` })
        } catch (e) {
            await safeSendMessage(chatJid, { text: `❌ ${e.message}` })
        }
        return true
    }

    // 5 - CONFIGURAÇÕES RÁPIDAS: 5, 5/10, 5/10/rapido, 5/20/numero, etc.
    if (cmd === "5") {
        if (partsRaw.length === 1) {
            const { enviarSubmenuConfig } = await import("../menus/configMenu.js")
            await enviarSubmenuConfig(chatJid, ownerKey)
            return true
        }
        const opcao = partsRaw[1]
        const valor = partsRaw.length >= 3 ? partsRaw.slice(2).join("/").trim() : ""

        // Verifica owner-only
        const { CONFIG_OPCOES } = await import("../menus/configMenu.js")
        const actionId = CONFIG_OPCOES[opcao]
        if (actionId) {
            const { isOwner } = await import("../utils/permissions.js")
            const { OWNER_ONLY } = await import("../commands/commandRouter.js").catch(() => ({ OWNER_ONLY: new Set() }))
            // Se OWNER_ONLY não exportado, usa lista local
            const ownerOnlyLocal = new Set(["cfg_menuImage","cfg_criar_preset","cfg_apagar_preset","cfg_link","cfg_ler_mais","cfg_flood_modo","cfg_flood_interval","cfg_flood_lote","cfg_autolimpeza","cfg_antitakeover","cfg_limpar_fantasmas","cfg_limpar_agendamentos","cfg_add_user","cfg_remove_user","cfg_add_group","cfg_remove_group","cfg_add_owner","cfg_remove_owner","cfg_viewonce_toggle","cfg_viewonce_groups","cfg_viewonce_owner","cfg_viewonce_admins","cfg_viewonce_save","cfg_flood_dryrun","cfg_flood_allowlist","cfg_flood_testmode","flood_kill_on","flood_kill_off"])
            if ((ownerOnlyLocal.has(actionId)) && !isOwner(ownerKey)) {
                await safeSendMessage(chatJid, { text: `❌ Apenas dono: ${actionId}` })
                return true
            }

            // Se tem valor, tenta setar direto sem passar pelo router que pediria input
            if (valor) {
                const { CONFIG, salvarConfig, FLOOD_MODOS } = await import("../utils/config.js")
                if (actionId === "cfg_link") {
                    if (valor.toLowerCase() === "remover") { CONFIG.linkDivulgacao = ""; salvarConfig(); await safeSendMessage(chatJid, { text: "✅ Link removido" }) }
                    else { CONFIG.linkDivulgacao = valor; salvarConfig(); await safeSendMessage(chatJid, { text: `✅ Link salvo: ${valor}` }) }
                    return true
                }
                if (actionId === "cfg_ler_mais") {
                    const on = ["1","on","ligar","ligado","sim","true"].includes(String(valor).toLowerCase())
                    const off = ["0","off","desligar","desligado","nao","não","false"].includes(String(valor).toLowerCase())
                    if (!on && !off) { await safeSendMessage(chatJid, { text: "❌ Use 5/16/1 (ligar) ou 5/16/0 (desligar)" }); return true }
                    CONFIG.lerMais = on
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `📖 Ler mais agora: ${on ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_fantasma") {
                    // toggle ou set
                    if (valor.toLowerCase() === "on" || valor === "1") CONFIG.marcarFantasma = true
                    else if (valor.toLowerCase() === "off" || valor === "0") CONFIG.marcarFantasma = false
                    else CONFIG.marcarFantasma = !CONFIG.marcarFantasma
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Fantasma: ${CONFIG.marcarFantasma ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_flood_modo") {
                    const raw = valor.toLowerCase()
                    if (["rapido","normal","lento","seguro"].includes(raw)) {
                        CONFIG.floodModo = raw
                        const modo = FLOOD_MODOS[raw]
                        CONFIG.floodInterval = modo.intervalo
                        CONFIG.floodLote = modo.lote
                        CONFIG.floodJitter = raw === "seguro"
                        salvarConfig()
                        await safeSendMessage(chatJid, { text: `✅ Flood modo: ${raw} ${modo.intervalo}ms/lote${modo.lote}` })
                    } else {
                        await safeSendMessage(chatJid, { text: "❌ Use: rapido, normal, lento, seguro" })
                    }
                    return true
                }
                if (actionId === "cfg_flood_interval") {
                    const n = parseInt(valor.replace(/\D/g, ""))
                    if (isNaN(n) || n < 20 || n > 5000) { await safeSendMessage(chatJid, { text: "❌ Intervalo 20-5000ms" }); return true }
                    CONFIG.floodInterval = n; salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Intervalo: ${n}ms` })
                    return true
                }
                if (actionId === "cfg_flood_lote") {
                    const n = parseInt(valor.replace(/\D/g, ""))
                    if (isNaN(n) || n < 1 || n > 10) { await safeSendMessage(chatJid, { text: "❌ Lote 1-10" }); return true }
                    CONFIG.floodLote = n; salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Lote: ${n}` })
                    return true
                }
                if (actionId === "cfg_autolimpeza") {
                    if (valor === "1" || valor.toLowerCase() === "on") CONFIG.autoLimpeza = true
                    else if (valor === "0" || valor.toLowerCase() === "off") CONFIG.autoLimpeza = false
                    else CONFIG.autoLimpeza = !CONFIG.autoLimpeza
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Auto-limpeza: ${CONFIG.autoLimpeza ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_antitakeover") {
                    if (valor === "1" || valor.toLowerCase() === "on") CONFIG.antiTakeover = true
                    else if (valor === "0" || valor.toLowerCase() === "off") CONFIG.antiTakeover = false
                    else CONFIG.antiTakeover = !CONFIG.antiTakeover
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Anti-takeover: ${CONFIG.antiTakeover ? "LIGADO" : "DESLIGADO"}` })
                    return true
                }
                if (actionId === "cfg_add_user") {
                    const { addAuthorizedUser } = await import("../utils/permissions.js")
                    const nums = valor.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
                    let adicionados = []
                    for (const n of nums) {
                        const res = addAuthorizedUser(n)
                        if (res?.added) adicionados.push(res.num)
                    }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: adicionados.length ? `✅ ADMs adicionados: ${adicionados.join(", ")}` : "❌ Nenhum adicionado" })
                    return true
                }
                if (actionId === "cfg_remove_user") {
                    const { removeAuthorizedUser } = await import("../utils/permissions.js")
                    const res = removeAuthorizedUser(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Não encontrado" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Removido: ${res.removed}` })
                    return true
                }
                if (actionId === "cfg_add_group") {
                    const { addAuthorizedGroup } = await import("../utils/permissions.js")
                    const { salvarConfig } = await import("../utils/config.js")
                    const { resolverGrupoInput } = await import("./groupService.js")
                    // Tenta resolver como grupo fast
                    let jid = valor
                    const entry = resolveGrupoFast(cache, valor)
                    if (entry && !entry._multiple && !entry._isRawJid) {
                        jid = entry.id
                    } else if (entry?._isRawJid || valor.endsWith("@g.us") || valor.includes("whatsapp.com")) {
                        try { jid = await resolverGrupoInput(valor) } catch {}
                    }
                    const res = addAuthorizedGroup(jid)
                    salvarConfig()
                    if (res?.already) await safeSendMessage(chatJid, { text: `⚠️ Já autorizado` })
                    else if (res?.added) await safeSendMessage(chatJid, { text: `✅ Grupo autorizado: ${jid}` })
                    else await safeSendMessage(chatJid, { text: "❌ Falha" })
                    return true
                }
                if (actionId === "cfg_remove_group") {
                    const { removeAuthorizedGroup } = await import("../utils/permissions.js")
                    const res = removeAuthorizedGroup(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Não encontrado" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Grupo removido: ${res.removed}` })
                    return true
                }
                if (actionId === "cfg_add_owner") {
                    const { addExtraOwner } = await import("../utils/permissions.js")
                    const res = addExtraOwner(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Inválido" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: res.added ? `✅ Dono extra: ${res.num}` : `⚠️ Já era dono: ${res.num}` })
                    return true
                }
                if (actionId === "cfg_remove_owner") {
                    const { removeExtraOwner } = await import("../utils/permissions.js")
                    const res = removeExtraOwner(valor)
                    if (!res) { await safeSendMessage(chatJid, { text: "❌ Não encontrado" }); return true }
                    const { salvarConfig } = await import("../utils/config.js")
                    salvarConfig()
                    await safeSendMessage(chatJid, { text: `✅ Dono extra removido: ${res.removed}` })
                    return true
                }
            }
            // Sem valor ou valor não tratado rápido → delega pro router normal
            const { roteadorAcoes } = await import("../commands/commandRouter.js")
            await roteadorAcoes(chatJid, ownerKey, actionId)
            return true
        }
        await safeSendMessage(chatJid, { text: `❌ Config opção inválida: ${opcao}` })
        return true
    }

    // 6 - MULTI
    if (cmd === "6") {
        if (partsRaw.length < 4) {
            await safeSendMessage(chatJid, { text: `❌ Multi rápido:\n6/<grupos>/<tipo>/...\nTipos: 1 flood, 2 nuke, 3 roubar\nEx: 6/1,3,5/1/Oi/20/1\nEx: 6/1,3,5/2/2/Oi\nEx: 6/1,3,5/3/2\nCom @tempo agenda: 6/1,2/1/Oi/20/1@10m` })
            return true
        }
        const gruposRaw = partsRaw[1]
        const tipo = partsRaw[2]

        let grupos = parseMultiFast(cache, gruposRaw)
        if (!grupos) {
            const splitNames = gruposRaw.split(",").map(s => s.trim()).filter(Boolean)
            if (splitNames.length >= 2) {
                const tmp = []
                for (const nameRaw of splitNames) {
                    const e = resolveGrupoFast(cache, nameRaw)
                    if (e && !e._multiple) {
                        const resolved = await resolverEntradaGrupo(e)
                        if (resolved) tmp.push({ ...resolved, index: e.index || 0 })
                    }
                }
                if (tmp.length >= 2) grupos = tmp
            }
        }
        if (!grupos || grupos.length < 2) {
            await safeSendMessage(chatJid, { text: `❌ Grupos multi inválidos: ${gruposRaw}` })
            return true
        }

        const protegidos = grupos.filter(g => isProtected(g.id))
        const atacaveis = grupos.filter(g => !isProtected(g.id))
        if (protegidos.length) {
            await safeSendMessage(chatJid, { text: `🛡️ Ignorando ${protegidos.length} protegido(s)` })
        }
        if (!atacaveis.length) {
            await safeSendMessage(chatJid, { text: "❌ Todos protegidos." })
            return true
        }
        grupos = atacaveis

        if (isScheduled) {
            // Agendamento multi rápido
            if (tipo === "1") {
                let modo = null, qtdStr, msgParts
                const last = partsRaw[partsRaw.length - 1]
                const secondLast = partsRaw[partsRaw.length - 2]
                const lastIsModo = /^(?:[1-4]|rapido|normal|lento|seguro|\d{2,4})$/i.test(last) && partsRaw.length >= 6
                if (lastIsModo) { modo = last; qtdStr = secondLast; msgParts = partsRaw.slice(3, -2) }
                else { modo = null; qtdStr = last; msgParts = partsRaw.slice(3, -1) }
                const mensagem = msgParts.join("/").trim()
                const qtd = parseInt(String(qtdStr).replace(/\D/g, ""))
                const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
                await agendarSePrecisar("flood", grupos, { qtd: Math.min(qtd, MAX_FLOOD), modo: cfg.modo }, mensagem)
                return true
            }
            if (tipo === "2") {
                const presetRaw = partsRaw[3]
                const msgRaw = partsRaw.length >= 5 ? partsRaw.slice(4).join("/").trim() : ""
                let presetDados = {}
                if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
                else {
                    const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                    if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                    presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
                }
                await agendarSePrecisar("nuke", grupos, { preset: presetDados }, msgRaw || null)
                return true
            }
            if (tipo === "3") {
                const presetRaw = partsRaw[3]
                let presetDados = {}
                if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
                else {
                    const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                    if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                    presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
                }
                await agendarSePrecisar("roubar", grupos, { preset: presetDados }, null)
                return true
            }
        }

        if (tipo === "1") {
            if (partsRaw.length < 5) { await safeSendMessage(chatJid, { text: "❌ Multi flood: 6/<grupos>/1/<msg>/<qtd>[/<modo>]" }); return true }
            let modo = null, qtdStr, msgParts
            const last = partsRaw[partsRaw.length - 1]
            const secondLast = partsRaw[partsRaw.length - 2]
            const lastIsModo = /^(?:[1-4]|rapido|normal|lento|seguro|\d{2,4})$/i.test(last) && partsRaw.length >= 6
            if (lastIsModo) { modo = last; qtdStr = secondLast; msgParts = partsRaw.slice(3, -2) }
            else { modo = null; qtdStr = last; msgParts = partsRaw.slice(3, -1) }
            const mensagem = msgParts.join("/").trim()
            const qtd = parseInt(String(qtdStr).replace(/\D/g, ""))
            const cfg = modo ? getFloodConfig(modo) : getFloodConfig(CONFIG.floodModo)
            let msgFlood = mensagem
            if (CONFIG.linkDivulgacao) msgFlood += `\n${CONFIG.linkDivulgacao}`
            await safeSendMessage(chatJid, { text: `⚡ Multi flood rápido: ${grupos.length} grupos | ${qtd} | modo ${cfg.modo}` })
            try {
                const res = await executarFloodLote(grupos, msgFlood, Math.min(qtd, MAX_FLOOD), cfg)
                const okG = res.filter(r => r.ok).length
                await safeSendMessage(chatJid, { text: `✅ Multi flood: ${okG}/${grupos.length} OK` })
            } catch (e) { await safeSendMessage(chatJid, { text: `❌ ${e.message}` }) }
            return true
        }
        if (tipo === "2") {
            if (partsRaw.length < 4) { await safeSendMessage(chatJid, { text: "❌ Multi nuke: 6/<grupos>/2/<preset>[/<msg>]" }); return true }
            const presetRaw = partsRaw[3]
            const msgRaw = partsRaw.length >= 5 ? partsRaw.slice(4).join("/").trim() : ""
            let presetDados = {}
            if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
            else {
                const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
            }
            const semMsg = !msgRaw || msgRaw.toLowerCase() === "pular"
            const mensagemFinal = semMsg ? "" : (msgRaw + (CONFIG.linkDivulgacao ? `\n\n${CONFIG.linkDivulgacao}` : ""))
            await safeSendMessage(chatJid, { text: `💣 Multi nuke rápido: ${grupos.length} grupos | preset ${presetRaw}` })
            try {
                const res = await nukeComPresetLote(grupos, presetDados, { mensagem: mensagemFinal || null })
                const okG = res.filter(r => r.ok).length
                await safeSendMessage(chatJid, { text: `✅ Multi nuke: ${okG}/${grupos.length} OK` })
            } catch (e) { await safeSendMessage(chatJid, { text: `❌ ${e.message}` }) }
            return true
        }
        if (tipo === "3") {
            if (partsRaw.length < 4) { await safeSendMessage(chatJid, { text: "❌ Multi roubar: 6/<grupos>/3/<preset>" }); return true }
            const presetRaw = partsRaw[3]
            let presetDados = {}
            if (/^0+$/.test(presetRaw) || presetRaw === "0") presetDados = { nome: CONFIG.nome, bio: CONFIG.bio }
            else {
                const preset = getPreset(parseInt(presetRaw.replace(/\D/g, "")))
                if (!preset) { await safeSendMessage(chatJid, { text: "❌ Preset inválido" }); return true }
                presetDados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset) }
            }
            await safeSendMessage(chatJid, { text: `⚡ Multi roubar rápido: ${grupos.length} grupos | preset ${presetRaw}` })
            try {
                const res = await roubarGrupoLote(grupos, presetDados, { mensagem: CONFIG.linkDivulgacao || null })
                const okG = res.filter(r => r.ok).length
                await safeSendMessage(chatJid, { text: `✅ Multi roubar: ${okG}/${grupos.length} OK` })
            } catch (e) { await safeSendMessage(chatJid, { text: `❌ ${e.message}` }) }
            return true
        }
        await safeSendMessage(chatJid, { text: `❌ Tipo multi inválido: ${tipo}` })
        return true
    }

    return false
}
