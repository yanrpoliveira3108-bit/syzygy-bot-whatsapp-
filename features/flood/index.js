// features/flood/index.js
// [v53 · AB7] Barrel público da feature FLOOD. Superfície enxuta de propósito:
// allowlist, dry-run, modo-teste, preview e o card de loja saíram do projeto, e
// este arquivo é justamente o lugar onde eles "moravam" (o antigo tinha
// detectShoppingTrigger/parseShoppingOverlay/shoppingPromptText exportados aqui).
//
// Arquitetura que este barrel expõe:
//   preset (descrição de conteúdo + teto)  →  runPresetJob (orquestração)
//        →  executarFlood / executarFloodLote (services/groupService.js)
// Um `sock.sendMessage` só por envio, com o wrap de "Ler Mais" da conexão.
// payment é um TIPO de preset (presets/payment.js), nunca um segundo executor.
//
// O router (./router.js) importa os módulos folha, NUNCA este barrel — é assim que
// se evita o ciclo ESM que derrubava o módulo em silêncio.

import { BUILDERS, makeIterationBuilder } from "./presets/index.js"
import { maskJid } from "./targets.js"

export {
    FLOOD_PRESET_TYPES,
    FLOOD_CONTENT_KINDS,
    FLOOD_PRESET_HARD_CAP,
    PRESET_HARD_CAP,
    FLOOD_MAX_HARD_CEILING,
    FLOOD_GENERAL_PRESETS,
    PAYMENT_PRESET_RUNTIME,
    DEFAULT_FLOOD_PRESET_ID,
    DEFAULT_PAYMENT_PRESET_ID,
    getFloodPreset,
    getFloodRuntimeConfig,
    getPresetDef,
    listPresetIds,
    listPaymentPresets,
    listPaymentPresetsTexto,
    clampPresetLimits,
    clampJobQtd,
    floodTipoLabel
} from "./config.js"

export {
    loadPreset,
    buildContent as buildPresetContent,
    listPresets,
    describePreset,
    listPresetsTexto,
    PRESET_TYPES,
    BUILDERS as PRESET_BUILDERS
} from "./presets/index.js"

export {
    runPresetJob,
    formatPresetJobResult,
    isFloodEngineRunning,
    currentJobInfo,
    cancelRunningJob,
    PresetJobError
} from "./presetEngine.js"

export {
    isKillSwitchOn,
    isKillSwitchPersisted,
    setKillSwitch,
    toggleKillSwitch,
    onKillSwitch,
    killSwitchStatusTexto,
    KILL_SWITCH_REASON
} from "./killswitch.js"

export {
    normalizeTargetJid,
    maskJid,
    filterTargets,
    isProtectedGroupJid,
    setFloodSelection,
    getFloodSelection,
    clearFloodSelection,
    resumoAlvosTexto,
    contagemGruposAutorizados,
    BLOCKED_TARGET,
    NO_TARGETS,
    PROTECTED_GROUP_BLOCKED
} from "./targets.js"

export {
    parseSelectedGroups,
    extractTargetJids,
    TARGETS_REQUIRED
} from "./groups.js"

export {
    resolveFloodSpeed,
    formatFloodSpeedMenu,
    applyFloodSpeed,
    toFloodOpts,
    CUSTOM_INTERVAL_MIN,
    CUSTOM_INTERVAL_MAX
} from "./speed.js"

export {
    createQueue,
    QUEUE_CANCELLED
} from "./queue.js"

export {
    createLimiter,
    withTimeout,
    sleep,
    classifyError,
    remainingCooldown,
    markJobEnd,
    clearCooldown
} from "./limiter.js"

export {
    slugPresetId,
    listCustomPresets,
    getCustomPreset,
    saveCustomPreset,
    updateCustomPreset,
    deleteCustomPreset,
    formatCustomPresetsTexto,
    isReservedPresetId,
    CUSTOM_TYPES,
    CUSTOM_TIPOS_DELEGADOS
} from "./customStore.js"

export {
    getPaymentApiInfo,
    parsePaymentArgs,
    parseAmount,
    parseCurrency,
    createPaymentPayload,
    buildPaymentContent,
    usageTexto as paymentUsageTexto,
    formatPaymentError,
    PAYMENT_TRIGGERS,
    detectPaymentTrigger,
    resolvePaymentContent
} from "./payment.js"

// Fachada de comandos (floodpresets/paymenttest/texttest/mentiontest/mediatest/
// floodstop/floodstart + 2/preset/<id>). Implementação em ./router.js.
export {
    floodRouter,
    floodPresetsMenuTexto,
    FLOOD_PRESET_COMMANDS,
    FLOOD_TEST_ACTION_PRESET,
    paymentOverlayFromRest
} from "./router.js"

/**
 * Integração com o executarFlood: o 5º argumento (buildContent) é o dispatch
 * TIPADO do conteúdo (mention/media/payment) e vem dos builders de preset —
 * `presets/<tipo>.js#makeIterationBuilder`. Não existe motor paralelo: sem builder
 * (tipo "texto") o laço clássico é exatamente o flood de sempre.
 *
 * @param {{floodTipo?:string, floodContent?:object, floodFrom?:string}} state
 * @returns {null|((ctx:{index:number,body:string,msg:string})=>object)}
 */
export function floodContentBuilderFor(state) {
    const tipo = String((state && (state.floodTipo || state.floodKind)) || "").trim()
    if (!tipo || tipo === "texto" || tipo === "text") return null
    const type = tipo === "pagamento" ? "payment" : tipo
    if (!BUILDERS[type]) return null
    const preset = { type, ...((state && state.floodContent) || {}) }
    const ctx = { from: state && state.floodFrom, mentions: state && state.floodMentions }
    return makeIterationBuilder(preset, ctx)
}

export default {
    nome: "flood",
    versao: "v53",
    tipos: ["texto", "mention", "media", "payment"]
}
