// utils/stateManager.js
const STATE_TIMEOUT = 5 * 60 * 1000
const userStates = new Map()

export function setState(key, patch) {
    const cur = userStates.get(key) || {}
    const next = { ...cur, ...patch, expiresAt: Date.now() + STATE_TIMEOUT }
    userStates.set(key, next)
    return next
}

export function getState(key) {
    const st = userStates.get(key)
    if (!st) return null
    if (Date.now() > st.expiresAt) {
        userStates.delete(key)
        return null
    }
    return st
}

export function clearState(key) {
    userStates.delete(key)
}
