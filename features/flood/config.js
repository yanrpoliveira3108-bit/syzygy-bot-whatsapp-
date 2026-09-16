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

import { SHOPPING_PRESETS, SHOPPING_PRESET_TEST } from "./presets/shopping.js"

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

// ─── Presets registrados ────────────────────────────────────────────────────
export const FLOOD_PRESETS = {}
for (const p of SHOPPING_PRESETS) FLOOD_PRESETS[p.id] = p

export const DEFAULT_SHOPPING_PRESET_ID = SHOPPING_PRESET_TEST.id

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
