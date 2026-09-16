// connection/pairing.js
// [REORGANIZAÇÃO] Fluxo de PAIRING CODE (não QR). Preservado 1:1 do index.js:
//   até 3 tentativas, espera inicial de 4s, intervalo de 3s entre tentativas.

import { rt } from "./socket.js"
import { boot, ok, err, warn, COLORS as C } from "../utils/terminalUI.js"

// Pergunta o número ao operador (via readline injetado) quando não registrado.
export async function pedirNumeroPairing(ask) {
    console.log(warn("[AUTH] Aguardando número de telefone..."))
    let num = await ask(`${C.cyan}[+] Número (5599...): ${C.reset}`)
    num = String(num).replace(/\D/g, "").trim()
    if (!num || num.length < 10) throw new Error("Número inválido")
    console.log(ok(`[AUTH] Número recebido: ${num}`))
    return num
}

// Solicita e exibe o código de pareamento.
export async function solicitarPairingCode(sock, numeroParaPairing) {
    const r = rt()
    r.pairingCodeRequested = true
    console.log(boot("[AUTH] Aguardando inicialização do socket..."))

    let attempts = 0
    let code = null

    while (attempts < 3) {
        try {
            attempts++
            console.log(boot(`[AUTH] Solicitando código de pareamento (tentativa ${attempts}/3)...`))
            await new Promise(res => setTimeout(res, 4000))
            code = await sock.requestPairingCode(numeroParaPairing)
            break
        } catch (e) {
            console.log(err(`[AUTH] Tentativa ${attempts} falhou: ${e.message}`))
            if (attempts >= 3) {
                r.pairingCodeRequested = false
                throw e
            }
            await new Promise(res => setTimeout(res, 3000))
        }
    }

    const formatado = code?.match(/.{1,4}/g)?.join("-") || code
    console.log(`\n${C.yellow}┌────────────────────────────┐${C.reset}`)
    console.log(`${C.yellow}│ ${C.white}${C.bold}CÓDIGO: ${formatado}${C.reset}${C.yellow}${" ".repeat(Math.max(0, 18 - String(formatado).length))}│${C.reset}`)
    console.log(`${C.yellow}└────────────────────────────┘${C.reset}\n`)
    console.log(ok(`[AUTH] Código de pareamento: ${formatado}`))
    console.log(warn(`[AUTH] Abra WhatsApp → Aparelhos conectados → Conectar com número`))
    return formatado
}
