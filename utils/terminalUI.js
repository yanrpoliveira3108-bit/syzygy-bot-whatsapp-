// utils/terminalUI.js
// [v43] Tema ROXO do SYZYGY. Mesmas funções/assinaturas — só a identidade visual mudou.
const C = {
    reset:  "\x1b[0m",
    dim:    "\x1b[2m",
    bold:   "\x1b[1m",
    red:    "\x1b[31m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    blue:   "\x1b[34m",
    magenta:"\x1b[35m",
    cyan:   "\x1b[36m",
    white:  "\x1b[37m",
    gray:   "\x1b[90m",
    // 🟣 Paleta roxa (256 cores — suportado pelo Termux)
    purple:     "\x1b[38;5;141m", // violeta claro
    purpleDark: "\x1b[38;5;93m",  // roxo
    lilac:      "\x1b[38;5;183m", // lilás suave
    purpleGray: "\x1b[38;5;240m"  // cinza-arroxeado (bordas)
}

export function bannerSYZYGY() {
    return `${C.purple}${C.bold}
███████╗██╗   ██╗███████╗██╗   ██╗ ██████╗██╗   ██╗
██╔════╝╚██╗ ██╔╝╚══███╔╝╚██╗ ██╔╝██╔════╝╚██╗ ██╔╝
███████╗ ╚████╔╝   ███╔╝  ╚████╔╝ ██║      ╚████╔╝
╚════██║  ╚██╔╝   ███╔╝    ╚██╔╝  ██║       ╚██╔╝
███████║   ██║   ███████╗   ██║   ╚██████╗   ██║
╚══════╝   ╚═╝   ╚══════╝   ╚═╝    ╚═════╝   ╚═╝
${C.reset}${C.purpleGray}   ${"━".repeat(50)}${C.reset}
${C.lilac}   ⚡ SYZYGY · WhatsApp Administration System ⚡${C.reset}
`
}

export function painelStatus(dados) {
    const { conn, number, owner, session, uptime, nome, bio } = dados
    const dot = (color, txt) => `${color}●${C.reset} ${txt}`

    const line = (label, value, valueColor = C.white) =>
        `${C.purpleGray}│${C.reset}  ${label.padEnd(18)} ${valueColor}${value}${C.reset}${" ".repeat(Math.max(0, 24 - String(value).length))}${C.purpleGray}│${C.reset}`

    const sep = `${C.purpleGray}├${"─".repeat(48)}┤${C.reset}`
    const top = `${C.purpleGray}╭${"─".repeat(48)}╮${C.reset}`
    const bot = `${C.purpleGray}╰${"─".repeat(48)}╯${C.reset}`
    const title = (t) => `${C.purpleGray}│${C.reset}  ${C.purple}${C.bold}${t}${C.reset}${" ".repeat(46 - t.length)}${C.purpleGray}│${C.reset}`

    let out = ""
    out += top + "\n"
    out += `${C.purpleGray}│${C.reset}${C.bold}${C.purple}${"SYZYGY".padStart(28).padEnd(48)}${C.reset}${C.purpleGray}│${C.reset}\n`
    out += `${C.purpleGray}│${C.reset}${C.dim}${C.lilac}${"WhatsApp Administration System".padStart(40).padEnd(48)}${C.reset}${C.purpleGray}│${C.reset}\n`
    out += sep + "\n"
    out += title("⟡ STATUS") + "\n"
    out += `${C.purpleGray}│${C.reset}  ${dot(conn === "ONLINE" ? C.green : C.red, "Connection".padEnd(16) + (conn === "ONLINE" ? C.green : C.red) + conn + C.reset).padEnd(56)}${C.purpleGray}│${C.reset}\n`
    out += line("● Number", number || "-", C.white) + "\n"
    out += line("● Session", session || "-", C.green) + "\n"
    out += line("● Uptime", uptime || "-", C.yellow) + "\n"
    out += sep + "\n"
    out += title("⟡ IDENTITY") + "\n"
    out += line("Name", nome || "SYZYGY", C.purple) + "\n"
    out += line("Bio", (bio || "-").substring(0, 22), C.gray) + "\n"
    out += line("Owner", owner || "NYX", C.purple) + "\n"
    out += line("Credits", "NYX", C.lilac) + "\n"
    out += sep + "\n"
    out += title("⟡ WATERMARKS") + "\n"
    out += `${C.purpleGray}│${C.reset}  ${C.purple}${C.bold}ZUCKERBERG${C.reset}${" ".repeat(36)}${C.purpleGray}│${C.reset}\n`
    out += `${C.purpleGray}│${C.reset}  ${C.purple}${C.bold}SYZYGY${C.reset}${" ".repeat(40)}${C.purpleGray}│${C.reset}\n`
    out += bot + "\n"
    return out
}

// [v58] Terminal mais limpo: TODA linha de log nasce com carimbo de hora
// dim (HH:MM:SS) — mesmo lugar, mesma assinatura, só formatação.
const _carimbo = () => {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0"), ss = String(d.getSeconds()).padStart(2, "0")
    return `${C.gray}${C.dim}[${hh}:${mm}:${ss}]${C.reset}`
}
export function boot(msg) { return `${_carimbo()} ${C.purple}${C.bold}[ ⚡ SYZYGY ]${C.reset} ${msg}` }
export function ok(msg) { return `${_carimbo()} ${C.green}✓${C.reset} ${msg}` }
export function err(msg) { return `${_carimbo()} ${C.red}✗${C.reset} ${msg}` }
export function warn(msg) { return `${_carimbo()} ${C.yellow}!${C.reset} ${msg}` }
export function info(tag, msg) { return `${_carimbo()} ${C.purple}[${tag}]${C.reset} ${msg}` }
export function credLine() { return `${C.purple}${C.bold}ZUCKERBERG${C.reset}  ${C.purpleGray}•${C.reset}  ${C.purple}${C.bold}SYZYGY${C.reset}\n${C.lilac}NYX${C.reset} ${C.purpleGray}×${C.reset} ${C.purple}ZUCKERBERG${C.reset}` }

export function formatUptime(ms) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
}

export const COLORS = C
