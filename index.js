// index.js
// [REORGANIZAÇÃO] Ponto de entrada do SYZYGY. Apenas COORDENA:
//   config -> conexão -> handlers -> terminal.
// Toda a lógica operacional vive nos módulos. O index.js gigante foi separado.

import { instalarSilenciador, origLog } from "./utils/logger.js"
import { carregarConfig } from "./utils/config.js"
import { bannerSYZYGY, boot, ok, err, credLine } from "./utils/terminalUI.js"

import { instalarHandlersProcesso } from "./connection/sessionRecovery.js"
import { iniciarConexao, setAsk } from "./connection/whatsapp.js"
import { menuTerminal, ask } from "./handlers/terminal.js"

// 1) Silenciador de logs sensíveis (mantém proteção de sessão).
instalarSilenciador()

// 2) Configuração persistida (config.json + ownerOverride).
carregarConfig()

// 3) Handlers de processo (recuperação de sessão em erros de Signal).
instalarHandlersProcesso()

// 4) Compartilha o readline do terminal com a conexão (pergunta do número).
setAsk(ask)

// 5) Bootstrap.
console.clear()
process.stdout.write(bannerSYZYGY())
origLog(boot("Inicializando SYZYGY..."))
    origLog(ok("BUILD: v58 — FOTO DOS GRUPOS COM RETRY + TERMINAL LIMPO: causa da foto parar de mudar = bug do fork que envenena o cache da conexão de mídia após UMA falha de media_conn (todo upload morre até reconectar; nome/bio seguem OK); trocarFotoComRetry (3 tentativas + backoff + refreshMediaConn + motivo REAL) em TODOS os caminhos de foto (roubar/nuke/preset/arquivo/URL/buffer); catch vazio de alterarTudoGrupo removido; relatórios de roubar/nuke agora mostram o MOTIVO dos erros (fim do '1 erro(s)' sem explicação) + resumo [ROUBAR]/[NUKE] no terminal; terminal com carimbo HH:MM:SS em todas as linhas e [UI] de 5 linhas → 1 (verboso via uiDebug) [2026-08-29 v58]"))
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
