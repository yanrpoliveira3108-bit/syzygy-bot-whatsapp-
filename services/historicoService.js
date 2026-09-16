// services/historicoService.js
// [v22] Histórico de ações do SYZYGY — log persistido de nukes, roubos, floods, etc.

import fs from "fs"
import path from "path"

const HIST_DIR = "./dono"
const HIST_PATH = path.join(HIST_DIR, "historico.json")
const MAX_HIST = 200

function garantirDir() {
    try { fs.mkdirSync(HIST_DIR, { recursive: true }) } catch {}
}

function carregar() {
    garantirDir()
    try {
        if (fs.existsSync(HIST_PATH)) {
            const d = JSON.parse(fs.readFileSync(HIST_PATH, "utf-8"))
            if (Array.isArray(d)) return d
        }
    } catch {}
    return []
}

function salvar(lista) {
    garantirDir()
    try {
        // Mantém só os últimos MAX_HIST
        const cortada = lista.slice(-MAX_HIST)
        fs.writeFileSync(HIST_PATH, JSON.stringify(cortada, null, 2), "utf-8")
    } catch {}
}

export function registrarAcao(tipo, detalhes = {}) {
    const lista = carregar()
    const entry = {
        ts: Date.now(),
        data: new Date().toISOString(),
        tipo, // flood, nuke, roubar, etc
        ...detalhes
    }
    lista.push(entry)
    salvar(lista)
    return entry
}

export function listarHistorico(qtd = 20) {
    const lista = carregar()
    return lista.slice(-qtd).reverse()
}

export function limparHistorico() {
    salvar([])
}

export function gerarRelatorio() {
    const lista = carregar()
    const total = lista.length
    const porTipo = {}
    let ultimas24h = 0
    const agora = Date.now()
    for (const h of lista) {
        porTipo[h.tipo] = (porTipo[h.tipo] || 0) + 1
        if (agora - h.ts < 24 * 60 * 60 * 1000) ultimas24h++
    }
    return { total, porTipo, ultimas24h, lista: lista.slice(-10).reverse() }
}

export function formatarHistoricoTexto(qtd = 15) {
    const lista = listarHistorico(qtd)
    if (!lista.length) return "Histórico vazio."
    let out = `📜 HISTÓRICO SYZYGY — últimos ${lista.length}\n`
    out += `━━━━━━━━━━━━━━━━━━━━\n`
    for (const h of lista) {
        const d = new Date(h.ts)
        const hora = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        const alvo = h.subject || h.grupo || h.id || ""
        out += `${hora} · ${h.tipo.toUpperCase()} · ${alvo}\n`
        if (h.ok === false) out += `  ❌ ${h.erro || "erro"}\n`
        else if (h.resumo) out += `  ${h.resumo}\n`
    }
    return out
}
