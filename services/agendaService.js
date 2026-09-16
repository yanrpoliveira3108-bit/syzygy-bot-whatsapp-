// services/agendaService.js
// [v22] Agendamento de ações (flood, nuke, roubar) para execução futura.

import fs from "fs"
import path from "path"
import { getSock } from "../connection/socket.js"
import { ownerJidForSending } from "../utils/permissions.js"
import { CONFIG } from "../utils/config.js"

const AGENDA_DIR = "./dono"
const AGENDA_PATH = path.join(AGENDA_DIR, "agendamentos.json")

let timers = new Map() // id -> timeout
let jobs = [] // carregados em memória

function garantirDir() {
    try { fs.mkdirSync(AGENDA_DIR, { recursive: true }) } catch {}
}

function carregarJobs() {
    garantirDir()
    try {
        if (fs.existsSync(AGENDA_PATH)) {
            const d = JSON.parse(fs.readFileSync(AGENDA_PATH, "utf-8"))
            if (Array.isArray(d)) return d
        }
    } catch {}
    return []
}

function salvarJobs(lista) {
    garantirDir()
    try { fs.writeFileSync(AGENDA_PATH, JSON.stringify(lista, null, 2), "utf-8") } catch {}
}

function parseTempoRelativo(txt) {
    // Aceita: 10s, 5m, 2h, 1d, ou "10 min", "2 horas", etc
    txt = (txt || "").toLowerCase().trim()
    const m = txt.match(/(\d+)\s*(s|seg|m|min|h|hora|d|dia)?/)
    if (!m) return null
    const n = parseInt(m[1])
    const u = (m[2] || "m").toLowerCase()
    if (u.startsWith("s")) return n * 1000
    if (u.startsWith("m")) return n * 60 * 1000
    if (u.startsWith("h")) return n * 60 * 60 * 1000
    if (u.startsWith("d")) return n * 24 * 60 * 60 * 1000
    return n * 60 * 1000
}

export function parseAgendamento(input) {
    input = (input || "").trim()
    if (!input) return null

    // 1) DD/MM HH:MM ou DD/MM (checa antes do relativo para não confundir "25/08" com "25m")
    const dmy = input.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/)
    if (dmy) {
        const dia = parseInt(dmy[1]), mes = parseInt(dmy[2]) - 1
        const h = dmy[3] ? parseInt(dmy[3]) : 12
        const mm = dmy[4] ? parseInt(dmy[4]) : 0
        if (dia >= 1 && dia <= 31 && mes >= 0 && mes < 12 && h >= 0 && h < 24 && mm >= 0 && mm < 60) {
            const alvo = new Date()
            alvo.setMonth(mes, dia)
            alvo.setHours(h, mm, 0, 0)
            if (alvo.getTime() <= Date.now()) alvo.setFullYear(alvo.getFullYear() + 1)
            return { delayMs: alvo.getTime() - Date.now(), at: alvo.getTime(), tipo: "data", raw: input }
        }
    }

    // 2) Absoluto HH:MM
    const hm = input.match(/^(\d{1,2}):(\d{2})$/)
    if (hm) {
        const h = parseInt(hm[1]), mm = parseInt(hm[2])
        if (h >= 0 && h < 24 && mm >= 0 && mm < 60) {
            const agora = new Date()
            const alvo = new Date()
            alvo.setHours(h, mm, 0, 0)
            if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1)
            return { delayMs: alvo.getTime() - Date.now(), at: alvo.getTime(), tipo: "absoluto", raw: input }
        }
    }

    // 3) Relativo: 10s, 5m, 2h, 1d — exige sufixo ou formato isolado para não pegar datas
    // Aceita "10m", "10 min", "2h", "30s", "1d" ou só número (assume minutos)
    const relMatch = input.toLowerCase().match(/^(\d+)\s*(s|seg|m|min|h|hora|d|dia)?$/i)
    if (relMatch) {
        const rel = parseTempoRelativo(input)
        if (rel && rel > 0 && rel <= 7 * 24 * 60 * 60 * 1000) {
            return { delayMs: rel, at: Date.now() + rel, tipo: "relativo", raw: input }
        }
    }

    return null
}

export function agendarAcao({ tipo, grupos, dados, mensagem, delayMs, at }) {
    garantirDir()
    const lista = carregarJobs()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const job = {
        id,
        tipo, // flood, nuke, roubar
        grupos: grupos.map(g => ({ id: g.id, subject: g.subject || g.id })),
        dados: dados || null,
        mensagem: mensagem || null,
        criadoEm: Date.now(),
        agendadoPara: at,
        delayMs,
        status: "pendente"
    }
    lista.push(job)
    salvarJobs(lista)
    jobs = lista
    programarJob(job)
    return job
}

function programarJob(job) {
    if (timers.has(job.id)) {
        clearTimeout(timers.get(job.id))
        timers.delete(job.id)
    }
    const delay = job.agendadoPara - Date.now()
    if (delay <= 0) {
        executarJob(job)
        return
    }
    const t = setTimeout(() => executarJob(job), Math.min(delay, 2147483647)) // max 32bit
    timers.set(job.id, t)
}

async function executarJob(job) {
    try {
        const sock = getSock()
        if (!sock) throw new Error("Socket não conectado")

        const { registrarAcao } = await import("./historicoService.js")
        const ownerJid = ownerJidForSending()

        let resultado
        if (job.tipo === "flood") {
            const { executarFloodLote } = await import("./groupService.js")
            const msg = job.mensagem || "Flood agendado"
            const qtd = job.dados?.qtd || 10
            const modo = job.dados?.modo || CONFIG.floodModo
            resultado = await executarFloodLote(job.grupos, msg, qtd, modo)
            registrarAcao("flood_agendado", { grupos: job.grupos.length, qtd, modo, jobId: job.id })
        } else if (job.tipo === "nuke") {
            const { nukeComPresetLote } = await import("./groupService.js")
            resultado = await nukeComPresetLote(job.grupos, job.dados?.preset || {}, { mensagem: job.mensagem })
            registrarAcao("nuke_agendado", { grupos: job.grupos.length, jobId: job.id })
        } else if (job.tipo === "roubar") {
            const { roubarGrupoLote } = await import("./groupService.js")
            resultado = await roubarGrupoLote(job.grupos, job.dados?.preset || {}, { mensagem: job.mensagem })
            registrarAcao("roubar_agendado", { grupos: job.grupos.length, jobId: job.id })
        }

        // Marca como concluído
        const lista = carregarJobs()
        const idx = lista.findIndex(j => j.id === job.id)
        if (idx >= 0) {
            lista[idx].status = "concluido"
            lista[idx].concluidoEm = Date.now()
            lista[idx].resultado = resultado?.length ? `${resultado.filter(r => r.ok).length}/${resultado.length} OK` : "OK"
            salvarJobs(lista)
            jobs = lista
        }

        if (ownerJid) {
            const okCount = resultado?.filter(r => r.ok).length || 0
            const total = resultado?.length || job.grupos.length
            await sock.sendMessage(ownerJid, {
                text: `⏰ AGENDAMENTO EXECUTADO\nTipo: ${job.tipo}\nGrupos: ${okCount}/${total} OK\nID: ${job.id}\nSYZYGY`
            })
        }
    } catch (e) {
        const lista = carregarJobs()
        const idx = lista.findIndex(j => j.id === job.id)
        if (idx >= 0) {
            lista[idx].status = "erro"
            lista[idx].erro = e.message
            salvarJobs(lista)
            jobs = lista
        }
        try {
            const ownerJid = ownerJidForSending()
            if (ownerJid) await getSock().sendMessage(ownerJid, { text: `❌ AGENDAMENTO FALHOU\nID: ${job.id}\nErro: ${e.message}` })
        } catch {}
    } finally {
        timers.delete(job.id)
    }
}

export function listarAgendamentos() {
    return carregarJobs().sort((a, b) => b.criadoEm - a.criadoEm)
}

export function cancelarAgendamento(id) {
    const lista = carregarJobs()
    const idx = lista.findIndex(j => j.id === id)
    if (idx < 0) return null
    const job = lista[idx]
    if (job.status !== "pendente") return null
    if (timers.has(id)) {
        clearTimeout(timers.get(id))
        timers.delete(id)
    }
    lista.splice(idx, 1)
    salvarJobs(lista)
    jobs = lista
    return job
}

export function limparConcluidos() {
    const lista = carregarJobs()
    const pendentes = lista.filter(j => j.status === "pendente")
    const removidos = lista.length - pendentes.length
    salvarJobs(pendentes)
    jobs = pendentes
    return removidos
}

export function iniciarAgendamentos() {
    jobs = carregarJobs()
    let pendentes = 0
    for (const job of jobs) {
        if (job.status === "pendente") {
            if (job.agendadoPara <= Date.now()) {
                executarJob(job)
            } else {
                programarJob(job)
                pendentes++
            }
        }
    }
    return { total: jobs.length, pendentes }
}

export function formatarAgendamentosTexto() {
    const lista = listarAgendamentos()
    if (!lista.length) return "Nenhum agendamento."
    let out = `⏰ AGENDAMENTOS SYZYGY — ${lista.length}\n━━━━━━━━━━━━━━━━━━━━\n`
    for (const j of lista.slice(0, 15)) {
        const d = new Date(j.agendadoPara)
        const hora = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        out += `[${j.id.slice(0, 6)}] ${j.tipo} · ${j.grupos.length} grupos · ${hora} · ${j.status}\n`
    }
    out += `\n_Comandos: agendamentos, cancelar <id>, limpar_agendamentos_`
    return out
}
