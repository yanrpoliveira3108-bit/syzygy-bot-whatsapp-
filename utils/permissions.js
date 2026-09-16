// utils/permissions.js
// [v28] Permissões: donos (multi), ADMs (users), grupos autorizados, LID resolver

import fs from "fs"

let DETECTED_PHONE = null
let DETECTED_LID = null
let CONFIG_OWNER_NUM = null
let EXTRA_OWNERS = [] // donos extras
let AUTHORIZED_USERS = []
let AUTHORIZED_GROUPS = []
let AUTHORIZED_LIDS = []

export function setDetectedOwner(sockUser) {
    if (!sockUser) return
    if (typeof sockUser === "object") {
        if (sockUser.id) {
            const pNum = normalizeNumber(sockUser.id)
            if (pNum) DETECTED_PHONE = pNum
        }
        if (sockUser.lid) {
            const lNum = normalizeNumber(sockUser.lid)
            if (lNum) DETECTED_LID = lNum
        }
    } else {
        const num = normalizeNumber(sockUser)
        if (num) DETECTED_PHONE = num
    }
}

export function setConfigOwner(num) {
    if (!num) { CONFIG_OWNER_NUM = null; return }
    CONFIG_OWNER_NUM = normalizeNumber(num)
}

export function setExtraOwners(list) {
    EXTRA_OWNERS = (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean)
    EXTRA_OWNERS = [...new Set(EXTRA_OWNERS)]
}

export function getOwnerNumber() {
    return CONFIG_OWNER_NUM || DETECTED_PHONE || "5519981144235"
}

export function getExtraOwners() {
    return [...EXTRA_OWNERS]
}

export function getAllOwners() {
    const all = [getOwnerNumber(), ...EXTRA_OWNERS].map(normalizeNumber).filter(Boolean)
    return [...new Set(all)]
}

export function normalizeNumber(value) {
    if (!value) return ""
    let s = String(value)
    if (s.includes("@")) s = s.split("@")[0]
    if (s.includes(":")) s = s.split(":")[0]
    return s.replace(/\D/g, "")
}

export function getSenderJid(m) {
    if (!m || !m.key) return null
    // Usa Alt primeiro (LID resolver) - fix para @lid
    if (m.key.participantAlt) return m.key.participantAlt
    if (m.key.remoteJidAlt) return m.key.remoteJidAlt
    if (m.key.participant) return m.key.participant
    return m.key.remoteJid
}

export function getChatJid(m) {
    if (!m || !m.key) return null
    // Para envio, usa remoteJidAlt se existir (fix @lid)
    if (m.key.remoteJidAlt) return m.key.remoteJidAlt
    if (m.key.remoteJid) return m.key.remoteJid
    return null
}

export function isOwner(jidOrNumber) {
    if (!jidOrNumber) return false
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (CONFIG_OWNER_NUM && n === CONFIG_OWNER_NUM) return true
    if (EXTRA_OWNERS.includes(n)) return true
    if (DETECTED_PHONE && n === DETECTED_PHONE) return true
    if (DETECTED_LID && n === DETECTED_LID) return true
    return n === "5519981144235"
}

export function isGroupJid(jid) {
    return typeof jid === "string" && jid.endsWith("@g.us")
}

export function ownerJidForSending() {
    const num = getOwnerNumber()
    return `${num}@s.whatsapp.net`
}

export function setAuthorizedUsers(list) {
    AUTHORIZED_USERS = (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean)
    AUTHORIZED_USERS = [...new Set(AUTHORIZED_USERS)]
}

export function setAuthorizedGroups(list) {
    AUTHORIZED_GROUPS = (Array.isArray(list) ? list : []).filter(j => typeof j === "string" && j.endsWith("@g.us"))
    AUTHORIZED_GROUPS = [...new Set(AUTHORIZED_GROUPS)]
}

export function setAuthorizedLids(list) {
    AUTHORIZED_LIDS = (Array.isArray(list) ? list : []).map(normalizeNumber).filter(Boolean)
    AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
}

export function getAuthorizedUsers() {
    return [...AUTHORIZED_USERS]
}

export function getAuthorizedGroups() {
    return [...AUTHORIZED_GROUPS]
}

export function getAuthorizedLids() {
    return [...AUTHORIZED_LIDS]
}

function carregarLidMapSync() {
    try {
        if (fs.existsSync("./dono/lid_map.json")) {
            const data = JSON.parse(fs.readFileSync("./dono/lid_map.json", "utf-8"))
            return data.lidToPhone || {}
        }
    } catch {}
    return {}
}

export function isAuthorizedUser(jidOrNumber) {
    if (isOwner(jidOrNumber)) return true
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (AUTHORIZED_USERS.includes(n)) return true
    if (AUTHORIZED_LIDS.includes(n)) return true
    return false
}

export function isAuthorizedUserWithMap(jidOrNumber, lidMap) {
    if (isOwner(jidOrNumber)) return true
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (AUTHORIZED_USERS.includes(n)) return true
    if (AUTHORIZED_LIDS.includes(n)) return true
    let map = lidMap
    if (!map) {
        const raw = carregarLidMapSync()
        map = { lidToPhone: raw }
        const phoneToLid = {}
        for (const [lid, phone] of Object.entries(raw)) {
            phoneToLid[phone] = lid
        }
        map.phoneToLid = phoneToLid
    }
    const phone = map.lidToPhone?.[n]
    if (phone && AUTHORIZED_USERS.includes(phone)) return true
    const lid = map.phoneToLid?.[n]
    if (lid && AUTHORIZED_LIDS.includes(lid)) return true
    if (map.phoneToLid?.[n] && AUTHORIZED_LIDS.includes(map.phoneToLid[n])) return true
    if (map.lidToPhone) {
        for (const [lid, phone] of Object.entries(map.lidToPhone)) {
            if (phone === n && AUTHORIZED_LIDS.includes(lid)) return true
        }
    }
    return false
}

export async function isAuthorizedUserAsync(jidOrNumber) {
    if (isOwner(jidOrNumber)) return true
    const n = normalizeNumber(jidOrNumber)
    if (!n) return false
    if (AUTHORIZED_USERS.includes(n)) return true
    if (AUTHORIZED_LIDS.includes(n)) return true
    const map = carregarLidMapSync()
    if (map[n] && AUTHORIZED_USERS.includes(map[n])) return true
    for (const [lid, phone] of Object.entries(map)) {
        if (phone === n && AUTHORIZED_LIDS.includes(lid)) return true
        if (lid === n && AUTHORIZED_USERS.includes(phone)) return true
    }
    if (String(jidOrNumber).includes("@lid") || n.length > 15) {
        try {
            const { buscarPhonePorLid } = await import("../services/lidResolver.js")
            const phone = await buscarPhonePorLid(jidOrNumber)
            if (phone && AUTHORIZED_USERS.includes(phone)) {
                if (!AUTHORIZED_LIDS.includes(n)) {
                    AUTHORIZED_LIDS.push(n)
                    AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
                }
                return true
            }
        } catch {}
    } else {
        try {
            const { buscarLidPorPhone } = await import("../services/lidResolver.js")
            const lid = await buscarLidPorPhone(jidOrNumber)
            if (lid && AUTHORIZED_LIDS.includes(lid)) return true
        } catch {}
    }
    return false
}

export function isAuthorizedGroup(jid) {
    if (!jid) return false
    return AUTHORIZED_GROUPS.includes(jid)
}

export function addAuthorizedUser(num) {
    const n = normalizeNumber(num)
    if (!n) return null
    if (n.length < 10 || n.length > 20) return null
    if (isOwner(n)) return { alreadyOwner: true, num: n }
    const isLid = String(num).includes("@lid") || n.length > 15
    if (isLid) {
        if (AUTHORIZED_LIDS.includes(n)) return { already: true, num: n, isLid: true }
        AUTHORIZED_LIDS.push(n)
        AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
        return { added: true, num: n, isLid: true, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
    }
    if (AUTHORIZED_USERS.includes(n)) return { already: true, num: n }
    AUTHORIZED_USERS.push(n)
    AUTHORIZED_USERS = [...new Set(AUTHORIZED_USERS)]
    try {
        const map = carregarLidMapSync()
        for (const [lid, phone] of Object.entries(map)) {
            if (phone === n && !AUTHORIZED_LIDS.includes(lid)) {
                AUTHORIZED_LIDS.push(lid)
            }
        }
        AUTHORIZED_LIDS = [...new Set(AUTHORIZED_LIDS)]
    } catch {}
    return { added: true, num: n, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
}

export function removeAuthorizedUser(numOrIndex) {
    const str = String(numOrIndex).trim()
    const idx = parseInt(str.replace(/\D/g, ""))
    if (!isNaN(idx) && str.match(/^0*\d+$/)) {
        if (idx >= 1 && idx <= AUTHORIZED_USERS.length) {
            const removed = AUTHORIZED_USERS.splice(idx - 1, 1)
            return { removed: removed[0], byIndex: true, list: getAuthorizedUsers() }
        }
        if (idx > AUTHORIZED_USERS.length && idx <= AUTHORIZED_USERS.length + AUTHORIZED_LIDS.length) {
            const lidIdx = idx - AUTHORIZED_USERS.length - 1
            const removed = AUTHORIZED_LIDS.splice(lidIdx, 1)
            return { removed: removed[0], byIndex: true, isLid: true, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
        }
    }
    const n = normalizeNumber(numOrIndex)
    if (!n) return null
    let pos = AUTHORIZED_USERS.indexOf(n)
    if (pos >= 0) {
        AUTHORIZED_USERS.splice(pos, 1)
        try {
            const map = carregarLidMapSync()
            for (const [lid, phone] of Object.entries(map)) {
                if (phone === n) {
                    const p2 = AUTHORIZED_LIDS.indexOf(lid)
                    if (p2 >= 0) AUTHORIZED_LIDS.splice(p2, 1)
                }
            }
        } catch {}
        return { removed: n, byIndex: false, list: getAuthorizedUsers() }
    }
    pos = AUTHORIZED_LIDS.indexOf(n)
    if (pos >= 0) {
        AUTHORIZED_LIDS.splice(pos, 1)
        return { removed: n, byIndex: false, isLid: true, list: getAuthorizedUsers(), lids: getAuthorizedLids() }
    }
    return null
}

export function addExtraOwner(num) {
    const n = normalizeNumber(num)
    if (!n) return null
    if (n.length < 10 || n.length > 15) return null
    if (CONFIG_OWNER_NUM && n === CONFIG_OWNER_NUM) return { alreadyOwner: true, num: n }
    if (n === "5519981144235") return { alreadyOwner: true, num: n }
    if (EXTRA_OWNERS.includes(n)) return { already: true, num: n }
    // Se era ADM, remove de ADM e promove a dono
    const idxUser = AUTHORIZED_USERS.indexOf(n)
    if (idxUser >= 0) AUTHORIZED_USERS.splice(idxUser, 1)
    EXTRA_OWNERS.push(n)
    EXTRA_OWNERS = [...new Set(EXTRA_OWNERS)]
    return { added: true, num: n, list: getExtraOwners() }
}

export function removeExtraOwner(numOrIndex) {
    const str = String(numOrIndex).trim()
    const idx = parseInt(str.replace(/\D/g, ""))
    if (!isNaN(idx) && str.match(/^0*\d+$/)) {
        if (idx >= 1 && idx <= EXTRA_OWNERS.length) {
            const removed = EXTRA_OWNERS.splice(idx - 1, 1)
            return { removed: removed[0], byIndex: true, list: getExtraOwners() }
        }
    }
    const n = normalizeNumber(numOrIndex)
    if (!n) return null
    const pos = EXTRA_OWNERS.indexOf(n)
    if (pos < 0) return null
    EXTRA_OWNERS.splice(pos, 1)
    return { removed: n, byIndex: false, list: getExtraOwners() }
}

export function addAuthorizedGroup(jid) {
    if (!jid || !isGroupJid(jid)) return null
    if (AUTHORIZED_GROUPS.includes(jid)) return { already: true, jid }
    AUTHORIZED_GROUPS.push(jid)
    AUTHORIZED_GROUPS = [...new Set(AUTHORIZED_GROUPS)]
    return { added: true, jid, list: getAuthorizedGroups() }
}

export function removeAuthorizedGroup(jidOrIndex) {
    const str = String(jidOrIndex).trim()
    const idx = parseInt(str.replace(/\D/g, ""))
    if (!isNaN(idx) && str.match(/^0*\d+$/) && idx >= 1 && idx <= AUTHORIZED_GROUPS.length) {
        const removed = AUTHORIZED_GROUPS.splice(idx - 1, 1)
        return { removed: removed[0], byIndex: true, list: getAuthorizedGroups() }
    }
    if (!isGroupJid(jidOrIndex)) return null
    const pos = AUTHORIZED_GROUPS.indexOf(jidOrIndex)
    if (pos < 0) return null
    AUTHORIZED_GROUPS.splice(pos, 1)
    return { removed: jidOrIndex, byIndex: false, list: getAuthorizedGroups() }
}

export function formatAuthorizedUsersTexto() {
    const all = [...AUTHORIZED_USERS, ...AUTHORIZED_LIDS]
    if (!all.length) return "Nenhum usuário autorizado extra (só o dono)."
    return all.map((n, i) => {
        const isLid = AUTHORIZED_LIDS.includes(n)
        return `  ${i + 1} · ${n}${isLid ? " (LID)" : ""}`
    }).join("\n")
}

export function formatAuthorizedGroupsTexto(cachedGroups = {}) {
    if (!AUTHORIZED_GROUPS.length) return "Nenhum grupo autorizado (bot só no PV)."
    return AUTHORIZED_GROUPS.map((jid, i) => {
        const subj = cachedGroups[jid]?.subject || jid
        return `  ${i + 1} · ${subj}\n     ${jid}`
    }).join("\n\n")
}

export function formatExtraOwnersTexto() {
    if (!EXTRA_OWNERS.length) return "Nenhum dono extra (só você)."
    return EXTRA_OWNERS.map((n, i) => `  ${i + 1} · ${n}`).join("\n")
}
