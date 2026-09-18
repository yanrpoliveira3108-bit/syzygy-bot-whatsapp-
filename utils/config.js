// utils/config.js
// [v28] Config com donos extras, ADMs, grupos autorizados, LIDs

import fs from "fs"
import { setConfigOwner, setAuthorizedUsers, setAuthorizedGroups, setAuthorizedLids, setExtraOwners, getAuthorizedUsers, getAuthorizedGroups, getAuthorizedLids, getExtraOwners } from "./permissions.js"
import { err } from "./terminalUI.js"

export const CONFIG_PATH = "./config.json"
export const SESSAO_PATH = "./sessao"
export const MENU_IMAGE_PATH = "./dono/menus/Foto-menu/img-menu.jpg"

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
// [v48] Modo de UI (config.json → "uiMode"):
//   "text"    → TXT (tudo texto — modo de compatibilidade, inalterado)
//   "buttons" → mensagens interativas com botões (camada existente)
//   "list"    → listas interativas (camada existente)
//   "bloks"   → menu/botões seguem em TXT (identidade preservada) e o
//               SERVER INSPECTOR (!bloks) é enviado como BLOKS/A2UI
// uiModoEfetivo() trata "bloks" como "text" para os fluxos existentes —
// apenas o transporte do Server Inspector enxerga o modo "bloks".
export function uiModoEfetivo() {
    const m = (CONFIG.uiMode || "text").toLowerCase()
    // [v55] "txt" é aceito como alias de "text" (config.json); "bloks" segue
    // tratado como "text" para os fluxos de menu (só o Inspector enxerga bloks).
    if (m === "txt" || m === "bloks") return "text"
    return m
}

// [v53] O teto do flood virou CONFIGURAÇÃO com teto duro: MAX_FLOOD é o default
// (2000 por comando, era 1000) e config.json#floodMaxMensagens ajusta até
// FLOOD_TETO_ABSOLUTO. Ler direto de MAX_FLOOD ainda funciona para quem não
// mexeu no config; quem mexe usa floodMaxEfetivo() (única fonte com clamp).
export const MAX_FLOOD = 2000
export const FLOOD_TETO_ABSOLUTO = 5000

/** Tipos de conteúdo do flood. Payment é TIPO, não segundo executor. */
export const FLOOD_TIPOS = { TEXTO: "texto", MENCION: "mention", MEDIA: "media", PAGAMENTO: "payment" }
export const FLOOD_TIPOS_LABEL = {
    texto: "📝 texto puro",
    mention: "🏷️ menção (lista explícita)",
    media: "🖼️ mídia (imagem do preset/menu)",
    payment: "💳 pagamento (requestPaymentMessage do fork)"
}
export const HTTP_UA =
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

export const MAX_RECONNECT_ATTEMPTS = 5
export const RECONNECT_BASE_DELAY = 3000
export const MAX_SESSION_ERRORS = 8
export const SESSION_ERROR_WINDOW_MS = 60 * 1000
export const SESSION_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000

export const FLOOD_MODOS = {
    // [v53] lotes maiores: o gargalo real é o cliente/servidor do WhatsApp, e o
    // rate-limit já é tratado com backoff em limiter.js — lote maior = job mais
    // curto = menos janela de desconexão. O modo "seguro" continua o único com
    // jitter ligado por default.
    rapido: { intervalo: 40, lote: 12, label: "Rápido 40ms/lote12" },
    normal: { intervalo: 100, lote: 8, label: "Normal 100ms/lote8" },
    lento: { intervalo: 250, lote: 5, label: "Lento 250ms/lote5" },
    seguro: { intervalo: 500, lote: 3, label: "Seguro 500ms/lote3 + jitter" }
}

/** Chaves que a v52 tinha e a v53 aposentou (allowlist/dry-run/modo-teste). */
export const CONFIG_CHAVES_APOSENTADAS = ["floodAllowlist", "floodDryRun", "floodTestMode"]

export const CONFIG = {
    nome: "๛ղվx 𝖅𝖚𝖈𝖐𝖊𝖗𝖇𝖊𝖗𝖌",
    bio: "⚔️ SYZYGY ⚡",
    menuImage: MENU_IMAGE_PATH,
    ownerOverride: "5519981144235",
    uiMode: "text",
    grupoOficial: "",
    linkDivulgacao: "",
    lerMais: false,
    marcarFantasma: true,
    floodModo: "normal",
    floodInterval: 150,
    floodLote: 5,
    floodJitter: false,
    autoLimpeza: true,
    antiTakeover: true,
    usuariosAutorizados: [],
    gruposAutorizados: [],
    lidsAutorizados: [],
    donosExtras: [],
    // [FLOOD · presets] chaves da infraestrutura de flood (recuperadas da arena
    // [FLOOD · v53] allowlist, dry-run e modo-teste deixaram de existir: o flood
    // obedece à mesma permissão do resto do bot e o alvo é sempre escolha
    // explícita do operador. O que cercar é teto e kill switch, não ensaio.
    floodKillSwitch: false,
    floodMaxRetries: 1,
    floodTimeoutMs: 15000,
    floodMaxMensagens: 2000,
    floodErrorStop: 3,
    floodPaceAdaptativo: true,
    floodTipo: "texto",
    floodCustomPresets: []
}

export function carregarConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, "utf-8")
            const parsed = JSON.parse(data)
            Object.assign(CONFIG, parsed)
            if (typeof CONFIG.lerMais !== "boolean") CONFIG.lerMais = false
            if (!CONFIG.floodModo) CONFIG.floodModo = "normal"
            if (!CONFIG.floodInterval) {
                const modo = FLOOD_MODOS[CONFIG.floodModo] || FLOOD_MODOS.normal
                CONFIG.floodInterval = modo.intervalo
            }
            if (!CONFIG.floodLote) {
                const modo = FLOOD_MODOS[CONFIG.floodModo] || FLOOD_MODOS.normal
                CONFIG.floodLote = modo.lote
            }
            if (typeof CONFIG.autoLimpeza !== "boolean") CONFIG.autoLimpeza = true
            if (typeof CONFIG.antiTakeover !== "boolean") CONFIG.antiTakeover = true
            if (typeof CONFIG.floodJitter !== "boolean") CONFIG.floodJitter = CONFIG.floodModo === "seguro"
            if (!Array.isArray(CONFIG.usuariosAutorizados)) CONFIG.usuariosAutorizados = []
            if (!Array.isArray(CONFIG.gruposAutorizados)) CONFIG.gruposAutorizados = []
            if (!Array.isArray(CONFIG.lidsAutorizados)) CONFIG.lidsAutorizados = []
            if (!Array.isArray(CONFIG.donosExtras)) CONFIG.donosExtras = []
            if (typeof CONFIG.floodKillSwitch !== "boolean") CONFIG.floodKillSwitch = false
            if (!CONFIG.floodMaxRetries) CONFIG.floodMaxRetries = 1
            if (!CONFIG.floodTimeoutMs) CONFIG.floodTimeoutMs = 15000
            if (!Number.isFinite(CONFIG.floodMaxMensagens)) CONFIG.floodMaxMensagens = MAX_FLOOD
            if (!Number.isFinite(CONFIG.floodErrorStop)) CONFIG.floodErrorStop = 3
            if (typeof CONFIG.floodPaceAdaptativo !== "boolean") CONFIG.floodPaceAdaptativo = true
            if (!FLOOD_TIPOS_LABEL[CONFIG.floodTipo] && CONFIG.floodTipo !== FLOOD_TIPOS.PAGAMENTO) CONFIG.floodTipo = FLOOD_TIPOS.TEXTO
            // migração honesta: chaves aposentadas saem do config (e o terminal avisa
            // uma vez) em vez de ficarem vivas sem efeito.
            for (const k of CONFIG_CHAVES_APOSENTADAS) {
                if (k in CONFIG) {
                    delete CONFIG[k]
                    CONFIG.__migracaoAposentadas = (CONFIG.__migracaoAposentadas || []).concat(k)
                }
            }
            if (!Array.isArray(CONFIG.floodCustomPresets)) CONFIG.floodCustomPresets = []
        }
    } catch {}
    if (CONFIG.ownerOverride) setConfigOwner(CONFIG.ownerOverride)
    setAuthorizedUsers(CONFIG.usuariosAutorizados)
    setAuthorizedGroups(CONFIG.gruposAutorizados)
    setAuthorizedLids(CONFIG.lidsAutorizados)
    setExtraOwners(CONFIG.donosExtras)
    return CONFIG
}

/** Teto efetivo de mensagens por alvo de flood (config ∩ teto duro do código). */
export function floodMaxEfetivo() {
    const pedido = Number(CONFIG.floodMaxMensagens)
    const base = Number.isFinite(pedido) && pedido > 0 ? pedido : MAX_FLOOD
    return Math.max(1, Math.min(FLOOD_TETO_ABSOLUTO, Math.trunc(base)))
}

export function salvarConfig() {
    try {
        try {
            CONFIG.usuariosAutorizados = getAuthorizedUsers()
            CONFIG.gruposAutorizados = getAuthorizedGroups()
            CONFIG.lidsAutorizados = getAuthorizedLids()
            CONFIG.donosExtras = getExtraOwners()
        } catch {}
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2), "utf-8")
    } catch (e) {
        console.log(err(`Salvar config: ${e.message}`))
    }
}
