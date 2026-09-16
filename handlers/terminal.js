// handlers/terminal.js
// [v43] Terminal virou PAINEL MONITOR (tema roxo). Comandos: SOMENTE no WhatsApp.
// O readline (ask) continua exportado porque o pairing da 1ª conexão precisa dele.
//
//   ┌─ o que mudou ─────────────────────────────────────────────┐
//   │ - menu [01]-[12] REMOVIDO (todas essas funções já existem │
//   │   no WhatsApp: menu → 1..7, config, status etc)           │
//   │ - terminal exibe banner + status e atualiza a cada 60s    │
//   │ - 'sair' ou Ctrl+C encerra                                │
//   └───────────────────────────────────────────────────────────┘

import readline from "readline"

import { getSock, rt } from "../connection/socket.js"
import { CONFIG } from "../utils/config.js"
import { normalizeNumber } from "../utils/permissions.js"
import {
    bannerSYZYGY, painelStatus, ok, warn, credLine, formatUptime, COLORS as C
} from "../utils/terminalUI.js"

export const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
export const ask = (q) => new Promise(r => rl.question(q, r))

function imprimirPainel() {
    console.clear()
    process.stdout.write(bannerSYZYGY())
    process.stdout.write(painelStatus({
        conn: rt().isConnected ? "ONLINE" : "OFFLINE",
        number: normalizeNumber(getSock()?.user?.id) || "-",
        owner: "NYX", session: "ACTIVE",
        uptime: formatUptime(Date.now() - rt().bootTime),
        nome: CONFIG.nome, bio: CONFIG.bio
    }))
    console.log("")
    console.log(credLine())
    console.log("")
}

// Linha de status compacta (atualização periódica sem limpar a tela)
function linhaStatus() {
    const grupos = Object.keys(rt().cachedGroups || {}).length
    const conn = rt().isConnected ? `${C.green}ONLINE${C.reset}` : `${C.red}OFFLINE${C.reset}`
    console.log(`${C.purpleGray}⟡${C.reset} ${conn} ${C.purpleGray}·${C.reset} ${C.purple}${normalizeNumber(getSock()?.user?.id) || "-"}${C.reset} ${C.purpleGray}·${C.reset} 👥 ${grupos} ${C.purpleGray}·${C.reset} ⏱ ${formatUptime(Date.now() - rt().bootTime)} ${C.purpleGray}· ⚡ comandos no WhatsApp (menu)${C.reset}`)
}

export async function menuTerminal() {
    imprimirPainel()
    console.log(`${C.purple}${C.bold}🎮 TODOS OS COMANDOS ESTÃO NO WHATSAPP${C.reset}`)
    console.log(`${C.gray}   Abra o chat do bot e digite ${C.purple}menu${C.gray} (ou ${C.purple}status${C.gray} p/ Status Manager)${C.reset}`)
    console.log(`${C.gray}   Terminal: apenas monitor · digite ${C.purple}sair${C.gray} para encerrar${C.reset}`)
    console.log("")

    // Mantém o processo vivo; atualiza a linha de status a cada 60s (sem limpar tela)
    setInterval(() => { try { linhaStatus() } catch {} }, 60_000)

    // Input do terminal: só 'sair' faz algo (o readline permanece p/ possíveis asks)
    rl.on("line", (l) => {
        const t = String(l).trim().toLowerCase()
        if (t === "sair" || t === "exit" || t === "0") {
            console.log(warn("Encerrando SYZYGY..."))
            rl.close()
            process.exit(0)
        }
    })
    rl.on("SIGINT", () => { rl.close(); process.exit(0) })

    await new Promise(() => {}) // painel permanece
}
