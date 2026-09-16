// features/flood/config.js
// [SHOPPING] Registro de TIPO/PRESET de conteúdo do flood SYZYGY.
//
// IMPORTANTE (arquitetura): isto NÃO é um segundo flood. Não há fila, timer,
// lote, throttle, permissões ou executor aqui. O laço real continua sendo
// executarFlood()/executarFloodLote() em services/groupService.js — shopping é
// apenas um CONTEÚDO que o laço existente envia via defaultSend (engine.js).
//
// FONTE DA VERDADE: @innovatorssoft/baileys@7.4.7 (verificado com npm pack,
// 2026-09-16), arquivos:
//   • lib/Utils/messages.js  → generateWAMessageContent
//   • WAProto/E2E/E2E.proto  → Message.InteractiveMessage.ShopMessage
// Nenhum campo é inventado: o que o adapter monta é exatamente o atalho que o
// fork sabe ler.

import { CONFIG, MAX_FLOOD } from "../../utils/config.js"
import { SHOPPING_PRESETS, SHOPPING_PRESET_TEST } from "./presets/shopping.js"
import { getCustomPreset, listCustomPresets } from "./customStore.js"

// ─── Limite de caracteres do payload de send ────────────────────────────────
// Validamos ANTES de enviar. Não truncamos em silêncio: conteúdo cortado sem
// aviso é o tipo de bug que faz "o envio funcionar" e o card sair errado.
export const SHOPPING_LIMITS = {
    body: 2048,      // → interactiveMessage.body.text
    title: 100,      // → header.title
    subtitle: 100,   // → header.subtitle
    footer: 100,     // → footer.text
    shopId: 512      // → shopStorefrontMessage.id
}

// ─── Superfícies que EXISTEM no proto deste fork ────────────────────────────
//   message ShopMessage {
//     optional string id = 1;
//     optional Surface surface = 2;
//     optional int32 messageVersion = 3;
//     enum Surface { UNKNOWN_SURFACE=0; FB=1; IG=2; WA=3; }
//   }
// O README do fork documenta `surface: 1, // 2 | 3 | 4`, mas 4 NÃO existe no
// enum. E o protobufjs gerado NÃO valida enum no fromObject (o `default:` aceita
// qualquer número) — então surface 4 é codificado no wire tal como veio e o app
// do destinatário não decodifica: notificação "mensagem indisponível" + tela
// "sua versão do WhatsApp não é compatível / Atualizar", sem atualização existir.
// É um dos sintomas que este adapter elimina.
export const SURFACE_VALID = [1, 2, 3]
export const SURFACE_NAMES = { 1: "FB", 2: "IG", 3: "WA" }
export const SURFACE_TOKENS = { fb: 1, ig: 2, wa: 3 }

// 4 aparece no README; no proto equivale, na prática de catálogo WA, a 3 (WA).
// Decisão do projeto: MAPEAR 4 → 3 com aviso explícito (nunca enviar 4).
export const SURFACE_README_ALIAS = { 4: 3 }

export const SURFACE_INVALID_HINT =
    "use 1 (FB), 2 (IG) ou 3 (WA). O valor 4 do README do fork não existe no proto deste pacote."

// Nomes de tipos aceitos como conteúdo do flood. "text" = flood clássico.
export const FLOOD_CONTENT_KINDS = ["text", "shopping"]

// ─── Defaults do tipo shopping ──────────────────────────────────────────────
// viewOnce: false por padrão. Motivo: em lib/Utils/messages.js (~1631)
//   else if ('viewOnce' in message && !!message.viewOnce) { m = { viewOnceMessage: { message: m } } }
// ou seja, QUALQUER viewOnce verdadeiro coloca o interactiveMessage DENTRO de um
// viewOnceMessage. Tipo de visualização única com card de loja dentro não é
// decodificado pelo app comum — é literalmente "mensagem indisponível".
// A chave é OMITIDA quando não é true (não mandamos viewOnce: false).
export const SHOPPING_DEFAULTS = {
    title: "",
    subtitle: "",
    footer: "",
    surface: 1,
    viewOnce: false
}

// ─── [INFRA FLOOD] Tipos de preset aceitos pelo registry ────────────────────
// "shopping" é o TIPO já existente no AB7; os outros vieram da arena 01a0aaae.
export const FLOOD_PRESET_TYPES = ["text", "mention", "media", "payment", "shopping", "custom"]

// ─── Hard caps do sistema de TESTE CONTROLADO ───────────────────────────────
// Nada de preset (nem overlay, nem custom, nem config.json) passa disto.
// É o que impede o "sistema de presets" de virar ferramenta de massa:
// teto de mensagens, intervalo mínimo, concorrência, cooldown, timeout e retry.
export const FLOOD_PRESET_HARD_CAP = {
    maxMessages: 10,
    minInterval: 1000,
    maxConcurrency: 2,
    minCooldown: 5000,
    minTimeout: 3000,
    maxTimeout: 30000,
    maxRetries: 2
}

// ─── Presets gerais (recuperados da arena 01a0aaae, limites idênticos) ──────
export const FLOOD_GENERAL_PRESETS = {
    "text-test": {
        id: "text-test", type: "text", text: "SYZYGY text-test", targetMode: "selected",
        maxMessages: 3, interval: 2000, concurrency: 1, cooldown: 15000, timeout: 15000
    },
    "mention-test": {
        id: "mention-test", type: "mention", text: "SYZYGY mention-test", targetMode: "selected",
        maxMessages: 2, interval: 2500, concurrency: 1, cooldown: 20000, timeout: 15000
    },
    "media-test": {
        id: "media-test", type: "media", caption: "SYZYGY media-test", targetMode: "selected",
        maxMessages: 2, interval: 3000, concurrency: 1, cooldown: 20000, timeout: 20000
    },
    "payment-test": {
        id: "payment-test", type: "payment", text: "Pagamento de teste", amount: 25.9, currency: "BRL",
        targetMode: "selected", maxMessages: 3, interval: 3000, concurrency: 1, cooldown: 30000, timeout: 15000
    }
}

// Defaults de runtime para o preset de loja (o AB7 não os tinha porque o laço do
// flood clássico é quem manda no ritmo; aqui eles viram cooldown/teto do job).
export const SHOPPING_PRESET_RUNTIME = {
    targetMode: "selected", maxMessages: 3, interval: 3000, concurrency: 1, cooldown: 30000, timeout: 15000
}

// ─── Presets registrados ────────────────────────────────────────────────────
// FLOOD_PRESETS continua sendo a tabela que o wizard da loja lê (getFloodPreset),
// agora ALSO com os presets gerais. Os de shopping mantêm o MESMO objeto: nada do
// contrato (viewOnce/surface/delivery) foi reescrito aqui.
export const FLOOD_PRESETS = { ...FLOOD_GENERAL_PRESETS }
for (const p of SHOPPING_PRESETS) FLOOD_PRESETS[p.id] = p

export const DEFAULT_SHOPPING_PRESET_ID = SHOPPING_PRESET_TEST.id
export const DEFAULT_FLOOD_PRESET_ID = "text-test"

export function getFloodPreset(id) {
    if (!id) return null
    return FLOOD_PRESETS[String(id).trim()] || null
}

export function listShoppingPresets() {
    return Object.values(FLOOD_PRESETS).filter(p => p.type === "shopping")
}

export function listShoppingPresetsTexto() {
    const l = listShoppingPresets()
    if (!l.length) return "_(nenhum preset shopping cadastrado)_"
    return l
        .map(p => `  *${p.id}* · ${p.label || p.title || "shop"} — surface ${p.shop?.surface} · viewOnce ${p.viewOnce === true ? "SIM" : "não"}`)
        .join("\n")
}

// ─── Entrega do card: "puro" vs "flow" (A/B com evidência no proto) ─────────
// Os DOIS modos produzem interactiveMessage.shopStorefrontMessage { surface, id }
// a partir do atalho { shop } — nunca proto cru, nunca payment.
//
//   puro → ramo `else if ('shop' in message && !!message.shop)` (messages.js
//          ~1374). Gera o card SEM `messageVersion`.
//   flow → ramo `interactiveButtons/nativeFlow + message.shop` (~1306). Esse ramo
//          é o ÚNICO do fork que seta `shopStorefrontMessage.messageVersion = 1`,
//          e exige um nativeFlowMessage válido junto (é o envelope que os menus
//          deste repo já usam e que, segundo os comentários de
//          services/interactiveService.js, é o que renderiza no app real).
//
// Evidência (gerada com o pacote real, 2026-09-16): shop puro → mv:null;
// flow → mv:1. Se o app do destinatário só aceita a VITRINE versionada, "puro"
// é exatamente o que cai em "mensagem indisponível" mesmo com payload limpo.
// Padrão conservador: "puro" (contrato do README do fork). Use loja:flow: para
// testar o outro sem mexer em código.
export const SHOPPING_DELIVERY = { PURE: "puro", FLOW: "flow" }
export const SHOPPING_DELIVERY_DEFAULT = SHOPPING_DELIVERY.PURE
export const SHOPPING_FLOW_BUTTON = {
    name: "cta_url",
    label: "Ver catálogo",
    // buttonParamsJson do atalho cta_url (ramo nativeFlow do fork)
    build(url) {
        return JSON.stringify({ display_text: this.label, url, mobile_url: url, webview_url: url })
    }
}

// ════════════════════════════════════════════════════════════════════════════
// [INFRA FLOOD · parte geral recuperada da arena 01a0aaae]
// Tudo abaixo é CONFIGURAÇÃO/VALIDAÇÃO: sem socket, sem envio, sem fila.
// ════════════════════════════════════════════════════════════════════════════

function clampInt(n, min, max, fallback) {
    const v = Number(n)
    if (!Number.isFinite(v)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(v)))
}

/**
 * Runtime do flood de presets, lido do CONFIG do projeto (utils/config.js).
 * Defaults são CONSERVADORES por desenho:
 *   • dryRun: ligado enquanto o operador não desligar de propósito;
 *   • testMode: ligado por padrão (payment/shopping só rodam em modo de teste);
 *   • maxRetries/timeoutMs: clampados pelo hard cap — config não afrouxa teto.
 */
export function getFloodRuntimeConfig() {
    return {
        killSwitch: CONFIG.floodKillSwitch === true,
        dryRun: CONFIG.floodDryRun !== false,
        testMode: CONFIG.floodTestMode !== false,
        allowlist: Array.isArray(CONFIG.floodAllowlist) ? [...CONFIG.floodAllowlist] : [],
        maxRetries: clampInt(CONFIG.floodMaxRetries, 0, FLOOD_PRESET_HARD_CAP.maxRetries, 1),
        timeoutMs: clampInt(CONFIG.floodTimeoutMs, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    }
}

/**
 * Definição crua de um preset: built-in (geral ou shopping) ou custom.
 * O overlay do wizard é aplicado depois, em loadPreset (que clampa).
 */
export function getPresetDef(id) {
    if (!id) return null
    const key = String(id).trim().toLowerCase()
    if (FLOOD_PRESETS[key]) {
        const base = { ...FLOOD_PRESETS[key] }
        // preset de loja não carrega limites (é arquivo de dados) → aplica os defaults
        if (base.type === "shopping") base.maxMessages = base.maxMessages ?? SHOPPING_PRESET_RUNTIME.maxMessages
        return base.type === "shopping" ? { ...SHOPPING_PRESET_RUNTIME, ...base } : base
    }
    const custom = getCustomPreset(key)
    if (!custom) return null
    return {
        id: custom.id,
        type: custom.type || "payment",
        customType: custom.customType,
        text: custom.text,
        amount: custom.amount,
        currency: custom.currency,
        caption: custom.caption,
        title: custom.title,
        subtitle: custom.subtitle,
        footer: custom.footer,
        shop: custom.shop,
        viewOnce: custom.viewOnce,
        delivery: custom.delivery,
        format: custom.format,
        mentions: Array.isArray(custom.mentions) ? [...custom.mentions] : undefined,
        // mídia/atalhos conhecidos do fork (o builder do tipo decide o que usar)
        image: custom.image,
        video: custom.video,
        document: custom.document,
        location: custom.location,
        product: custom.product,
        mimetype: custom.mimetype,
        targetMode: "selected",
        maxMessages: 10,
        interval: 3000,
        concurrency: 1,
        cooldown: 5000,
        timeout: 15000,
        modo: custom.modo
    }
}

export function listPresetIds() {
    const ids = Object.keys(FLOOD_PRESETS)
    for (const p of listCustomPresets()) {
        if (p && p.id && !ids.includes(p.id)) ids.push(p.id)
    }
    return ids
}

/**
 * ÚNICO ponto que aplica os tetos. Preset nenhum (nem custom, nem overlay, nem
 * config.json) consegue maxMessages/intervalo/concorrência/cooldown/timeout
 * fora de FLOOD_PRESET_HARD_CAP — é isto que mantém o sistema de presets como
 * teste controlado em vez de disparo de massa.
 */
export function clampPresetLimits(preset) {
    const src = preset && typeof preset === "object" ? preset : {}
    const maxMessages = clampInt(src.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const interval = clampInt(src.interval, FLOOD_PRESET_HARD_CAP.minInterval, 60000, 3000)
    const concurrency = clampInt(src.concurrency, 1, FLOOD_PRESET_HARD_CAP.maxConcurrency, 1)
    const cooldown = clampInt(src.cooldown, FLOOD_PRESET_HARD_CAP.minCooldown, 300000, 30000)
    const timeout = clampInt(src.timeout, FLOOD_PRESET_HARD_CAP.minTimeout, FLOOD_PRESET_HARD_CAP.maxTimeout, 15000)
    return { ...src, maxMessages, interval, concurrency, cooldown, timeout }
}

/** Limite de mensagens por alvo de um job (hard cap ∧ MAX_FLOOD do projeto). */
export function clampJobQtd(qtd, preset = {}) {
    const wanted = clampInt(qtd, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 1)
    const perPreset = clampInt(preset.maxMessages, 1, FLOOD_PRESET_HARD_CAP.maxMessages, 3)
    const classic = Number.isFinite(MAX_FLOOD) ? MAX_FLOOD : FLOOD_PRESET_HARD_CAP.maxMessages
    return Math.max(1, Math.min(wanted, perPreset, classic))
}

export { FLOOD_PRESET_HARD_CAP as PRESET_HARD_CAP }
