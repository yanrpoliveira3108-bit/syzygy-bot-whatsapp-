// features/viewOnce/destinations.js
// [v35] PV -> owner (mesmo se origem for owner), Grupo -> grupos autorizados

import { getAuthorizedGroups, getAuthorizedUsers, getAuthorizedLids, ownerJidForSending, getAllOwners } from "../../utils/permissions.js"
import { VIEW_ONCE_CONFIG } from "./config.js"
import { canReceiveAsDestination } from "./permissions.js"

export function resolveDestinations({ origin = null, excludeJid = null } = {}) {
    const destinations = { groups: [], admins: [], owners: [], all: [] }

    try {
        const isGroupOrigin = origin && origin.endsWith("@g.us")

        if (origin) {
            if (isGroupOrigin && VIEW_ONCE_CONFIG.groupToGroupsOnly) {
                if (VIEW_ONCE_CONFIG.sendToAuthorizedGroups) {
                    const authGroups = getAuthorizedGroups()
                    const limit = Math.min(authGroups.length, VIEW_ONCE_CONFIG.maxGroups, VIEW_ONCE_CONFIG.maxDestinations)
                    for (let i = 0; i < limit; i++) {
                        const jid = authGroups[i]
                        if (jid === origin) continue
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "group" })) continue
                        destinations.groups.push(jid)
                        destinations.all.push({ jid, type: "group" })
                    }
                }
            } else if (!isGroupOrigin && VIEW_ONCE_CONFIG.pvToOwnerOnly) {
                if (VIEW_ONCE_CONFIG.sendToOwner) {
                    const ownerJid = ownerJidForSending()
                    if (ownerJid && canReceiveAsDestination({ jid: ownerJid, type: "user" })) {
                        destinations.owners.push(ownerJid)
                        destinations.all.push({ jid: ownerJid, type: "owner" })
                    }
                    try {
                        const allOwners = getAllOwners()
                        for (const num of allOwners) {
                            const jid = `${num}@s.whatsapp.net`
                            if (jid === ownerJid) continue
                            if (excludeJid && jid === excludeJid) continue
                            if (!canReceiveAsDestination({ jid, type: "user" })) continue
                            if (destinations.all.length >= VIEW_ONCE_CONFIG.maxDestinations) break
                            destinations.owners.push(jid)
                            destinations.all.push({ jid, type: "owner" })
                        }
                    } catch {}
                }
            } else {
                if (VIEW_ONCE_CONFIG.sendToAuthorizedGroups) {
                    const authGroups = getAuthorizedGroups()
                    const limit = Math.min(authGroups.length, VIEW_ONCE_CONFIG.maxGroups, VIEW_ONCE_CONFIG.maxDestinations)
                    for (let i = 0; i < limit; i++) {
                        const jid = authGroups[i]
                        if (jid === origin) continue
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "group" })) continue
                        destinations.groups.push(jid)
                        destinations.all.push({ jid, type: "group" })
                    }
                }
                if (VIEW_ONCE_CONFIG.sendToOwner) {
                    const ownerJid = ownerJidForSending()
                    if (ownerJid && canReceiveAsDestination({ jid: ownerJid, type: "user" })) {
                        destinations.owners.push(ownerJid)
                        destinations.all.push({ jid: ownerJid, type: "owner" })
                    }
                }
                if (VIEW_ONCE_CONFIG.sendToAdmins) {
                    const users = getAuthorizedUsers()
                    const lids = getAuthorizedLids()
                    const allAdmins = [...users.map(n => `${n}@s.whatsapp.net`), ...lids.map(n => n.includes("@") ? n : `${n}@lid`)]
                    const remaining = VIEW_ONCE_CONFIG.maxDestinations - destinations.all.length
                    const limitAdmins = Math.min(allAdmins.length, VIEW_ONCE_CONFIG.maxAdmins, remaining)
                    for (let i = 0; i < limitAdmins; i++) {
                        const jid = allAdmins[i]
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "user" })) continue
                        if (destinations.owners.includes(jid)) continue
                        if (destinations.all.some(d => d.jid === jid)) continue
                        destinations.admins.push(jid)
                        destinations.all.push({ jid, type: "admin" })
                    }
                }
            }
        } else {
            if (VIEW_ONCE_CONFIG.sendToAuthorizedGroups) {
                const authGroups = getAuthorizedGroups()
                const limit = Math.min(authGroups.length, VIEW_ONCE_CONFIG.maxGroups, VIEW_ONCE_CONFIG.maxDestinations)
                for (let i = 0; i < limit; i++) {
                    const jid = authGroups[i]
                    if (excludeJid && jid === excludeJid) continue
                    if (!canReceiveAsDestination({ jid, type: "group" })) continue
                    destinations.groups.push(jid)
                    destinations.all.push({ jid, type: "group" })
                }
            }
            if (VIEW_ONCE_CONFIG.sendToOwner) {
                const ownerJid = ownerJidForSending()
                if (ownerJid && canReceiveAsDestination({ jid: ownerJid, type: "user" })) {
                    destinations.owners.push(ownerJid)
                    destinations.all.push({ jid: ownerJid, type: "owner" })
                }
                try {
                    const allOwners = getAllOwners()
                    for (const num of allOwners) {
                        const jid = `${num}@s.whatsapp.net`
                        if (jid === ownerJid) continue
                        if (excludeJid && jid === excludeJid) continue
                        if (!canReceiveAsDestination({ jid, type: "user" })) continue
                        if (destinations.all.length >= VIEW_ONCE_CONFIG.maxDestinations) break
                        destinations.owners.push(jid)
                        destinations.all.push({ jid, type: "owner" })
                    }
                } catch {}
            }
            if (VIEW_ONCE_CONFIG.sendToAdmins) {
                const users = getAuthorizedUsers()
                const lids = getAuthorizedLids()
                const allAdmins = [...users.map(n => `${n}@s.whatsapp.net`), ...lids.map(n => n.includes("@") ? n : `${n}@lid`)]
                const remaining = VIEW_ONCE_CONFIG.maxDestinations - destinations.all.length
                const limitAdmins = Math.min(allAdmins.length, VIEW_ONCE_CONFIG.maxAdmins, remaining)
                for (let i = 0; i < limitAdmins; i++) {
                    const jid = allAdmins[i]
                    if (excludeJid && jid === excludeJid) continue
                    if (!canReceiveAsDestination({ jid, type: "user" })) continue
                    if (destinations.owners.includes(jid)) continue
                    if (destinations.all.some(d => d.jid === jid)) continue
                    destinations.admins.push(jid)
                    destinations.all.push({ jid, type: "admin" })
                }
            }
        }

        if (destinations.all.length > VIEW_ONCE_CONFIG.maxDestinations) {
            destinations.all = destinations.all.slice(0, VIEW_ONCE_CONFIG.maxDestinations)
            destinations.groups = destinations.all.filter(d => d.type === "group").map(d => d.jid)
            destinations.admins = destinations.all.filter(d => d.type === "admin").map(d => d.jid)
            destinations.owners = destinations.all.filter(d => d.type === "owner").map(d => d.jid)
        }
    } catch {}

    return destinations
}

export function formatDestinationsTexto(destinations, cachedGroups = {}) {
    const { groups, admins, owners } = destinations
    let txt = `Destinos ViewOnce:\n`
    txt += `Grupos: ${groups.length} | Admins: ${admins.length} | Owners: ${owners.length}\n`
    return txt
}
