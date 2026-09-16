// services/lidResolver.js
// [v25] Mapeia LID <-> telefone + busca ativa em grupos.

import fs from "fs"
import path from "path"
import { getSock, rt } from "../connection/socket.js"

const MAP_PATH = "./dono/lid_map.json"

let lidToPhone = new Map()
let phoneToLid = new Map()

function carregar() {
    try {
        if (fs.existsSync(MAP_PATH)) {
            const data = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"))
            if (data.lidToPhone) {
                for (const [lid, phone] of Object.entries(data.lidToPhone)) {
                    lidToPhone.set(lid, phone)
                    phoneToLid.set(phone, lid)
                }
            }
        }
    } catch {}
}

function salvar() {
    try {
        const dir = path.dirname(MAP_PATH)
        try { fs.mkdirSync(dir, { recursive: true }) } catch {}
        const obj = { lidToPhone: Object.fromEntries(lidToPhone) }
        fs.writeFileSync(MAP_PATH, JSON.stringify(obj, null, 2), "utf-8")
    } catch {}
}

carregar()

export function normalizeNumberSimple(v) {
    if (!v) return ""
    let s = String(v)
    if (s.includes("@")) s = s.split("@")[0]
    if (s.includes(":")) s = s.split(":")[0]
    return s.replace(/\D/g, "")
}

export function atualizarMapaDeParticipantes(participants) {
    if (!Array.isArray(participants)) return
    let mudou = false
    for (const p of participants) {
        const id = p.id || p.jid || ""
        const lid = p.lid || ""
        if (!id || !lid) continue
        const phoneNum = normalizeNumberSimple(id)
        const lidNum = normalizeNumberSimple(lid)
        if (!phoneNum || !lidNum) continue
        if (!id.endsWith("@s.whatsapp.net")) continue
        if (!lid.endsWith("@lid")) continue
        if (lidToPhone.get(lidNum) !== phoneNum) {
            lidToPhone.set(lidNum, phoneNum)
            phoneToLid.set(phoneNum, lidNum)
            mudou = true
        }
    }
    if (mudou) salvar()
}

export function resolverLidParaPhone(lidOrNumber) {
    const n = normalizeNumberSimple(lidOrNumber)
    if (!n) return null
    return lidToPhone.get(n) || null
}

export function resolverPhoneParaLid(phoneOrNumber) {
    const n = normalizeNumberSimple(phoneOrNumber)
    if (!n) return null
    return phoneToLid.get(n) || null
}

export function getLidMap() {
    return { lidToPhone: Object.fromEntries(lidToPhone), phoneToLid: Object.fromEntries(phoneToLid) }
}

export function limparMapa() {
    lidToPhone.clear()
    phoneToLid.clear()
    salvar()
}

// [v25] Busca ativa: dado um LID, tenta achar o telefone varrendo grupos
export async function buscarPhonePorLid(lidJidOuNum) {
    const lidNum = normalizeNumberSimple(lidJidOuNum)
    if (!lidNum) return null
    if (lidToPhone.has(lidNum)) return lidToPhone.get(lidNum)

    const sock = getSock()
    if (!sock) return null

    try {
        // Primeiro tenta cache de grupos que já tem participants
        const grupos = await sock.groupFetchAllParticipating()
        for (const g of Object.values(grupos)) {
            if (Array.isArray(g.participants)) {
                for (const p of g.participants) {
                    const pLidNum = normalizeNumberSimple(p.lid || "")
                    const pPhoneNum = normalizeNumberSimple(p.id || "")
                    if (pLidNum === lidNum && pPhoneNum) {
                        atualizarMapaDeParticipantes([p])
                        return pPhoneNum
                    }
                }
            }
        }
        // Se não achou, busca metadata de alguns grupos (limite 15 para não pesar)
        const ids = Object.keys(grupos).slice(0, 15)
        for (const id of ids) {
            try {
                const meta = await sock.groupMetadata(id)
                if (Array.isArray(meta.participants)) {
                    atualizarMapaDeParticipantes(meta.participants)
                    for (const p of meta.participants) {
                        const pLidNum = normalizeNumberSimple(p.lid || "")
                        const pPhoneNum = normalizeNumberSimple(p.id || "")
                        if (pLidNum === lidNum && pPhoneNum) return pPhoneNum
                    }
                }
            } catch {}
        }
    } catch {}
    return null
}

export async function buscarLidPorPhone(phoneJidOuNum) {
    const phoneNum = normalizeNumberSimple(phoneJidOuNum)
    if (!phoneNum) return null
    if (phoneToLid.has(phoneNum)) return phoneToLid.get(phoneNum)

    const sock = getSock()
    if (!sock) return null

    try {
        const grupos = await sock.groupFetchAllParticipating()
        for (const g of Object.values(grupos)) {
            if (Array.isArray(g.participants)) {
                for (const p of g.participants) {
                    const pPhoneNum = normalizeNumberSimple(p.id || "")
                    const pLidNum = normalizeNumberSimple(p.lid || "")
                    if (pPhoneNum === phoneNum && pLidNum) {
                        atualizarMapaDeParticipantes([p])
                        return pLidNum
                    }
                }
            }
        }
        const ids = Object.keys(grupos).slice(0, 15)
        for (const id of ids) {
            try {
                const meta = await sock.groupMetadata(id)
                if (Array.isArray(meta.participants)) {
                    atualizarMapaDeParticipantes(meta.participants)
                    for (const p of meta.participants) {
                        const pPhoneNum = normalizeNumberSimple(p.id || "")
                        const pLidNum = normalizeNumberSimple(p.lid || "")
                        if (pPhoneNum === phoneNum && pLidNum) return pLidNum
                    }
                }
            } catch {}
        }
    } catch {}
    return null
}
