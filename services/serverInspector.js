// services/serverInspector.js
// [v47] 🖥️ SERVER INSPECTOR — painel A2UI (bloksWidget "im_a2ui") com dados
// REAIS do servidor onde o bot executa (Termux/Android, Linux).
//
// ARQUITETURA (conforme especificado):
//   collectServerInfo()      → coleta métricas reais (os / fs / process / /proc)
//   formatServerInfo()       → formata (bytes, %, uptime) sem alterar a UI
//   createServerInspectorData() → monta a estrutura A2UI EXISTENTE + valores reais
//   sendServerInspector()    → interactiveMessage + nativeFlowMessage(bloksWidget)
//                              → relayMessage() (mesmo mecanismo já usado no bot)
//
// UI: a estrutura (layouts hero, system, resources, node_memory, swap, network,
// runtime; componentes Text/Divider/Slider; IDs e catalogId FIXOS) é intocável.
// A ÚNICA coisa dinâmica são os VALORES.
//
// TRATAMENTO DE ERROS: cada métrica é isolada — falha → "N/A" — e NUNCA derruba
// o painel. Nada é aleatório, aproximado ou de demonstração.

import os from "os"
import fs from "fs"
import process from "process"
import { CONFIG } from "../utils/config.js"
import { sendBloksMessage } from "./bloksTransport.js"

// ============================================================
// COLETA — dados REAIS
// ============================================================

// CPU %: mede os TEMPOS de CPU em dois instantes (intervalo curto, 400ms) e
// calcula idle/total → percentual real 0-100. NÃO usa cpus().length como %.
async function medirCpuPct(intervaloMs = 400) {
    const amostra = () => {
        const cpus = os.cpus()
        let idle = 0, total = 0
        for (const c of cpus) {
            idle += c.times.idle
            total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
        }
        return { idle, total }
    }
    const a = amostra()
    await new Promise(r => setTimeout(r, intervaloMs))
    const b = amostra()
    const dTotal = b.total - a.total
    const dIdle = b.idle - a.idle
    if (dTotal <= 0) return null
    return Math.max(0, Math.min(100, (1 - dIdle / dTotal) * 100))
}

// /proc/meminfo (Linux/Termux): retorna {chave: bytes} ou null
function lerMeminfo() {
    try {
        const txt = fs.readFileSync("/proc/meminfo", "utf-8")
        const map = {}
        for (const linha of txt.split("\n")) {
            const m = linha.match(/^(\w+):\s+(\d+)\s*kB/)
            if (m) map[m[1]] = parseInt(m[2], 10) * 1024
        }
        return map
    } catch {
        return null
    }
}

function coletarMemoria() {
    const mi = lerMeminfo()
    try {
        if (mi && mi.MemTotal && mi.MemAvailable != null) {
            const total = mi.MemTotal
            const disponivel = mi.MemAvailable
            const usada = Math.max(0, total - disponivel)
            return { total, livre: disponivel, usada, pct: (usada / total) * 100, origem: "meminfo" }
        }
    } catch {}
    try {
        const total = os.totalmem()
        const livre = os.freemem()
        const usada = Math.max(0, total - livre)
        return { total, livre, usada, pct: (usada / total) * 100, origem: "os" }
    } catch {
        return null
    }
}

function coletarSwap() {
    const mi = lerMeminfo()
    try {
        const total = mi?.SwapTotal ?? 0
        const livre = mi?.SwapFree ?? 0
        if (!total) return null // sem swap no sistema → N/A (não inventa)
        const usada = Math.max(0, total - livre)
        return { total, livre, usada, pct: (usada / total) * 100 }
    } catch {
        return null
    }
}

// Filesystem ONDE O BOT EXECUTA (process.cwd()) — não uma partição aleatória.
function coletarStorage() {
    try {
        const st = fs.statfsSync(process.cwd())
        const total = st.blocks * st.bsize
        const livre = st.bfree * st.bsize
        const usada = Math.max(0, total - livre)
        if (!total) return null
        return { total, livre, usada, pct: (usada / total) * 100 }
    } catch {
        return null
    }
}

function coletarRuntime() {
    try {
        const bun = typeof globalThis.Bun !== "undefined"
        const nome = bun ? "Bun" : "Node.js"
        const versao = bun ? String(globalThis.Bun.version || "?") : process.version
        let engine = "N/A"
        try { engine = process.versions.v8 ? `V8 ${process.versions.v8}` : (process.versions.jsc ? `JavaScriptCore ${process.versions.jsc}` : "N/A") } catch {}
        let compat = "N/A"
        try { compat = process.versions.node || "N/A" } catch {}
        let exe = "N/A"
        try { exe = process.execPath || "N/A" } catch {}
        return { nome, versao, compat, engine, pid: process.pid, exe }
    } catch {
        return null
    }
}

export async function collectServerInfo() {
    const cpus = os.cpus() || []
    let usuario = "N/A"
    try { usuario = os.userInfo?.().username || process.env.USER || process.env.USERNAME || "N/A" } catch {}
    return {
        sistema: {
            os: (() => { try { return os.type() } catch { return null } })(),
            kernel: (() => { try { return os.release() } catch { return null } })(),
            arquitetura: (() => { try { return os.arch() } catch { return null } })(),
            cpuModelo: cpus[0]?.model ? cpus[0].model.replace(/\s+/g, " ").trim() : null,
            cpuNucleos: cpus.length || null,
            hostname: (() => { try { return os.hostname() } catch { return null } })(),
            usuario,
            endianness: (() => { try { return os.endianness() } catch { return null } })()
        },
        cpuPct: await medirCpuPct(),
        loadAvg: (() => { try { const l = os.loadavg(); return l.some(x => Number.isFinite(x)) ? l : null } catch { return null } })(),
        memoria: coletarMemoria(),
        storage: coletarStorage(),
        swap: coletarSwap(),
        nodeMem: (() => { try { return process.memoryUsage() } catch { return null } })(),
        runtime: coletarRuntime(),
        botUptimeSeg: (() => { try { return process.uptime() } catch { return null } })(),
        sysUptimeSeg: (() => { try { return os.uptime() } catch { return null } })()
    }
}

// ============================================================
// FORMATAÇÃO — mesmo estilo visual dos textos existentes
// ============================================================

export function formatBytes(bytes) {
    if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "N/A"
    const unidades = ["B", "KB", "MB", "GB", "TB"]
    let v = bytes, i = 0
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++ }
    if (i === 0) return `${Math.round(v)} B`
    return `${v.toFixed(2)} ${unidades[i]}`
}

export function formatPct(pct, casas = 1) {
    if (pct == null || !Number.isFinite(pct)) return "N/A"
    const v = Math.max(0, Math.min(100, pct))
    const r = Math.round(v * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

// "46 dias, 21 horas, 51 minutos" / "5 minutos, 21 segundos"
export function formatUptime(seg) {
    if (seg == null || !Number.isFinite(seg) || seg < 0) return "N/A"
    const s = Math.floor(seg)
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = s % 60
    const partes = []
    if (d) partes.push(`${d} dia${d === 1 ? "" : "s"}`)
    if (h) partes.push(`${h} hora${h === 1 ? "" : "s"}`)
    if (m) partes.push(`${m} minuto${m === 1 ? "" : "s"}`)
    if (!d && !h && ss) partes.push(`${ss} segundo${ss === 1 ? "" : "s"}`)
    if (!partes.length) return "0 segundos"
    return partes.slice(0, 3).join(", ")
}

export function formatServerInfo(info) {
    const na = "N/A"
    const f = (x) => (x == null || x === "" ? na : String(x))
    return {
        hero: { hostname: f(info.sistema.hostname) },
        sistema: {
            os: f(info.sistema.os),
            kernel: f(info.sistema.kernel),
            arquitetura: f(info.sistema.arquitetura),
            cpu: f(info.sistema.cpuModelo),
            cpuNucleos: info.sistema.cpuNucleos != null ? String(info.sistema.cpuNucleos) : na,
            hostname: f(info.sistema.hostname),
            usuario: f(info.sistema.usuario),
            endianness: f(info.sistema.endianness)
        },
        recursos: {
            cpuPct: formatPct(info.cpuPct),
            ramPct: formatPct(info.memoria?.pct),
            ssdPct: formatPct(info.storage?.pct),
            load: info.loadAvg ? info.loadAvg.map(l => (Number.isFinite(l) ? l.toFixed(2) : "N/A")).join(", ") : na,
            ram: info.memoria ? `${formatBytes(info.memoria.usada)} / ${formatBytes(info.memoria.total)}` : na,
            ssd: info.storage ? `${formatBytes(info.storage.usada)} / ${formatBytes(info.storage.total)}` : na
        },
        nodeMemory: {
            rss: formatBytes(info.nodeMem?.rss),
            heapTotal: formatBytes(info.nodeMem?.heapTotal),
            heapUsed: formatBytes(info.nodeMem?.heapUsed),
            external: formatBytes(info.nodeMem?.external),
            arrayBuffers: formatBytes(info.nodeMem?.arrayBuffers)
        },
        swap: {
            pct: formatPct(info.swap?.pct),
            total: info.swap ? formatBytes(info.swap.total) : na,
            usada: info.swap ? formatBytes(info.swap.usada) : na,
            livre: info.swap ? formatBytes(info.swap.livre) : na
        },
        runtime: {
            runtime: f(info.runtime?.nome),
            versao: f(info.runtime?.versao),
            compat: f(info.runtime?.compat),
            engine: f(info.runtime?.engine),
            pid: info.runtime?.pid != null ? String(info.runtime.pid) : na,
            botUptime: formatUptime(info.botUptimeSeg),
            sysUptime: formatUptime(info.sysUptimeSeg),
            exe: f(info.runtime?.exe)
        }
    }
}

// ============================================================
// A2UI — estrutura FIXA (IDs/ordem/componentes intocáveis; só valores mudam)
// ============================================================

const CATALOG_ID = "414487363153356" // catalogId fixo do bloksWidget im_a2ui
const A2UI_VERSION = 3

// IDs fixos e estáveis (nunca gerados em runtime — não mudam entre execuções)
const ID = {
    hero: "hero", system: "system", resources: "resources",
    node_memory: "node_memory", swap: "swap", runtime: "runtime"
}

function txt(id, text, opts = {}) {
    return { rowId: id, component: { type: "TextComponent", text, textSize: opts.size || "MEDIUM", textColor: opts.color || "SECONDARY", ...(opts.style ? { style: opts.style } : {}) } }
}
function flex(id, children, direction = "VERTICAL", alignItems = "START") {
    return { rowId: id, component: { type: "FlexComponent", direction, alignItems, children: children.map(c => c.component) } }
}
function heading(id, text) {
    return { rowId: id, component: { type: "TextComponent", text, textSize: "LARGE", textColor: "PRIMARY", style: "BOLD" } }
}
function divider(id) {
    return { rowId: id, component: { type: "DividerComponent" } }
}
// Slider recebe SOMENTE o valor real (0-100, numérico)
function slider(id, titulo, valor) {
    const v = Number.isFinite(valor) ? Math.max(0, Math.min(100, Math.round(valor))) : 0
    return { rowId: id, component: { type: "SliderComponent", sliderTitle: titulo, value: v, minValue: 0, maxValue: 100 } }
}
function layout(id, rows) {
    return { id, layoutType: 1, component: { rows: rows.map(r => ({ id: r.rowId, component: r.component })) } }
}

export function createServerInspectorData(infoReal) {
    const d = formatServerInfo(infoReal)
    const pct = (s) => (s === "N/A" ? 0 : parseFloat(s))

    const layouts = [
        layout(ID.hero, [
            txt("hero_title", "Server Inspector", { size: "LARGE", color: "PRIMARY", style: "BOLD" }),
            txt("hero_subtitle", "Live operating system information", { size: "SMALL", color: "TERTIARY" }),
            txt("hero_host", `● ${d.hero.hostname}`, { size: "SMALL", color: "SECONDARY" })
        ]),
        layout(ID.system, [
            heading("system_title", "System Information"),
            txt("system_os", `OS · ${d.sistema.os}`),
            txt("system_kernel", `Kernel · ${d.sistema.kernel}`),
            txt("system_arch", `Architecture · ${d.sistema.arquitetura}`),
            txt("system_cpu", `CPU · ${d.sistema.cpu}`),
            txt("system_cores", `CPU Cores · ${d.sistema.cpuNucleos}`),
            txt("system_hostname", `Hostname · ${d.sistema.hostname}`),
            txt("system_user", `User · ${d.sistema.usuario}`),
            txt("system_endianness", `Endianness · ${d.sistema.endianness}`)
        ]),
        layout(ID.resources, [
            heading("res_title", "System Resources"),
            slider("res_cpu", "CPU", pct(d.recursos.cpuPct)),
            slider("res_ram", "RAM", pct(d.recursos.ramPct)),
            slider("res_ssd", "SSD Storage", pct(d.recursos.ssdPct)),
            txt("res_load", `CPU Load · ${d.recursos.load}`),
            txt("res_ram_txt", `RAM · ${d.recursos.ram}`),
            txt("res_ssd_txt", `SSD · ${d.recursos.ssd}`)
        ]),
        layout(ID.node_memory, [
            heading("mem_title", "Node.js Memory"),
            txt("mem_rss", `RSS · ${d.nodeMemory.rss}`),
            txt("mem_heap_total", `Heap Total · ${d.nodeMemory.heapTotal}`),
            txt("mem_heap_used", `Heap Used · ${d.nodeMemory.heapUsed}`),
            txt("mem_external", `External · ${d.nodeMemory.external}`),
            txt("mem_arraybuffers", `ArrayBuffers · ${d.nodeMemory.arrayBuffers}`)
        ]),
        layout(ID.swap, [
            heading("swap_title", "Swap Memory"),
            slider("swap_usage", "Swap Usage", d.swap.pct === "N/A" ? 0 : pct(d.swap.pct)),
            txt("swap_total", `Total · ${d.swap.total}`),
            txt("swap_used", `Used · ${d.swap.usada}`),
            txt("swap_free", `Free · ${d.swap.livre}`)
        ]),
        layout(ID.runtime, [
            heading("rt_title", "Runtime"),
            txt("rt_name", `Runtime · ${d.runtime.runtime}`),
            txt("rt_version", `Runtime Version · ${d.runtime.versao}`),
            txt("rt_compat", `Node Compatibility · ${d.runtime.compat}`),
            txt("rt_engine", `JavaScript Engine · ${d.runtime.engine}`),
            txt("rt_pid", `PID · ${d.runtime.pid}`),
            txt("rt_botuptime", `Bot Uptime · ${d.runtime.botUptime}`),
            txt("rt_sysuptime", `System Uptime · ${d.runtime.sysUptime}`),
            txt("rt_exe", `Executable · ${d.runtime.exe}`)
        ])
    ]

    return {
        bloksWidget: {
            type: "im_a2ui",
            a2ui: {
                version: A2UI_VERSION,
                catalogId: CATALOG_ID,
                layouts
            }
        }
    }
}

// ============================================================
// ENVIO — dispatcher pela UI configurada em config.json ("uiMode")
//   "bloks"   → BLOKS/A2UI (helper central bloksTransport — payload intacto)
//   "text"    → TXT (compatibilidade: painel em texto puro)
//   "buttons" → camada de botões existente (quick_reply)
//   "list"    → camada de listas existente (single_select)
// ============================================================

// Versão TXT do painel (usada nos modos text/buttons/list — mesma informação)
export function serverInspectorTexto(d) {
    let t = `╭━━「 🖥️ 𝗦𝗘𝗥𝗩𝗘𝗥 𝗜𝗡𝗦𝗣𝗘𝗖𝗧𝗢𝗥 」━━\n`
    t += `┃ ● ${d.hero.hostname}\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `🖥️ SYSTEM INFORMATION\n`
    t += `OS · ${d.sistema.os}\nKernel · ${d.sistema.kernel}\nArchitecture · ${d.sistema.arquitetura}\nCPU · ${d.sistema.cpu}\nCPU Cores · ${d.sistema.cpuNucleos}\nHostname · ${d.sistema.hostname}\nUser · ${d.sistema.usuario}\nEndianness · ${d.sistema.endianness}\n\n`
    t += `📊 SYSTEM RESOURCES\nCPU · ${d.recursos.cpuPct}%\nRAM · ${d.recursos.ramPct}% (${d.recursos.ram})\nSSD · ${d.recursos.ssdPct}% (${d.recursos.ssd})\nCPU Load · ${d.recursos.load}\n\n`
    t += `🧠 NODE.JS MEMORY\nRSS · ${d.nodeMemory.rss}\nHeap Total · ${d.nodeMemory.heapTotal}\nHeap Used · ${d.nodeMemory.heapUsed}\nExternal · ${d.nodeMemory.external}\nArrayBuffers · ${d.nodeMemory.arrayBuffers}\n\n`
    t += `💾 SWAP MEMORY\nSwap Usage · ${d.swap.pct}%\nTotal · ${d.swap.total}\nUsed · ${d.swap.usada}\nFree · ${d.swap.livre}\n\n`

    t += `⚙️ RUNTIME\nRuntime · ${d.runtime.runtime} ${d.runtime.versao}\nNode Compatibility · ${d.runtime.compat}\nJavaScript Engine · ${d.runtime.engine}\nPID · ${d.runtime.pid}\nBot Uptime · ${d.runtime.botUptime}\nSystem Uptime · ${d.runtime.sysUptime}\nExecutable · ${d.runtime.exe}\n\n`
    return t
}

export async function sendServerInspector(sock, jid) {
    const info = await collectServerInfo()
    const d = formatServerInfo(info)
    const modo = (CONFIG.uiMode || "text").toLowerCase()

    if (modo === "bloks") {
        // BLOKS/A2UI — payload intacto, transporte no helper central
        return await sendBloksMessage(sock, jid, createServerInspectorData(info), {
            titulo: "Server Inspector",
            subtitulo: "Live operating system information",
            texto: `● ${d.hero.hostname}\nDados em tempo real do servidor`,
            footer: "⚔️ SYZYGY"
        })
    }

    if (modo === "buttons" || modo === "list") {
        const { sendInteractiveButtons } = await import("./buttons.js")
        const { sendInteractiveList } = await import("./list.js")
        const resumo = serverInspectorTexto(d)
        if (modo === "buttons") {
            return await sendInteractiveButtons(sock, jid, {
                title: "🖥️ SERVER INSPECTOR",
                body: resumo,
                footer: "⚔️ SYZYGY",
                buttons: [{ type: "reply", text: "🔄 Atualizar", id: "server_inspector" }]
            })
        }
        return await sendInteractiveList(sock, jid, {
            title: "🖥️ SERVER INSPECTOR",
            body: resumo,
            footer: "⚔️ SYZYGY",
            buttonText: "AÇÕES",
            sections: [{ title: "Ações", rows: [{ id: "server_inspector", title: "🔄 Atualizar", description: "Coletar dados novamente" }] }]
        })
    }

    // TXT (padrão) — caminho simples e confiável, sem nativeFlow/bloks
    let txt = serverInspectorTexto(d)
    txt += `_Painel A2UI: "uiMode": "bloks" no config.json_\n`
    return await sock.sendMessage(jid, { text: txt })
}
