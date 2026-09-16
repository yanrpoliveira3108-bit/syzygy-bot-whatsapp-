// features/flood/killswitch.js
// Kill switch global do flood de presets (+ clássico, se consultado).

import { CONFIG, salvarConfig } from "../../utils/config.js"

let memoryKill = false
const listeners = new Set()

export function isKillSwitchOn() {
    return memoryKill === true || CONFIG.floodKillSwitch === true
}

export function setKillSwitch(on, { persist = false } = {}) {
    memoryKill = !!on
    CONFIG.floodKillSwitch = !!on
    if (persist) {
        try { salvarConfig() } catch {}
    }
    for (const fn of listeners) {
        try { fn(memoryKill) } catch {}
    }
    return isKillSwitchOn()
}

export function onKillSwitch(fn) {
    if (typeof fn === "function") listeners.add(fn)
    return () => listeners.delete(fn)
}
