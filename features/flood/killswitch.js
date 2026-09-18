// features/flood/killswitch.js
// [INFRA FLOOD · recuperada da arena 01a0aaae e adaptada ao AB7]
// Botão de parada global do flood de presets — e CONSULTADO pelo flood clássico
// (services/groupService.js → executarFlood), que no AB7 não tinha nenhuma
// forma de interrupção.
//
// Estado único, sem duplicar: a chave viva é CONFIG.floodKillSwitch (utils/config.js).
// O flag de memória existe só para o caso "liguei agora e NÃO quero gravar em
// config.json" — `persist: true` é que chama salvarConfig().
//
// Importante para o AB7: isto NÃO substitui o que `features/flood/index.js`
// já faz, nem adiciona permissão nova. É só um booleano que os laços consultam.

import { CONFIG, salvarConfig } from "../../utils/config.js"

// Flag em memória (desliga sem tocar em disco quando persist=false).
let memoryKill = false
const listeners = new Set()

export const KILL_SWITCH_REASON = "KILL_SWITCH"

export function isKillSwitchOn() {
    return memoryKill === true || CONFIG.floodKillSwitch === true
}

/** Ligado pela config persistida (independente do flag de memória). */
export function isKillSwitchPersisted() {
    return CONFIG.floodKillSwitch === true
}

/**
 * @param {boolean} on
 * @param {{persist?: boolean}} [opts] persist=true grava em config.json
 * @returns {boolean} estado efetivo depois de aplicar
 */
export function setKillSwitch(on, { persist = false } = {}) {
    memoryKill = !!on
    CONFIG.floodKillSwitch = !!on
    if (persist) {
        try { salvarConfig() } catch {}
    }
    for (const fn of [...listeners]) {
        try { fn(memoryKill) } catch {}
    }
    return isKillSwitchOn()
}

export function toggleKillSwitch({ persist = false } = {}) {
    return setKillSwitch(!isKillSwitchOn(), { persist })
}

/** Assina mudanças do kill switch. Devolve unsubscribe (sem listener vazando). */
export function onKillSwitch(fn) {
    if (typeof fn !== "function") return () => false
    listeners.add(fn)
    return () => listeners.delete(fn)
}

/** Linha de status para terminal/confirmação — nunca imprime números crus. */
export function killSwitchStatusTexto() {
    const estado = isKillSwitchOn() ? "LIGADO (flood bloqueado)" : "desligado"
    const origem = CONFIG.floodKillSwitch === true
        ? (memoryKill ? "config + sessão atual" : "config.json")
        : (memoryKill ? "só nesta execução" : "—")
    return `⛔ Kill switch do flood: ${estado}\n• origem: ${origem}\n• efeito: interrompe jobs de preset e o flood clássico na próxima iteração.`
}
