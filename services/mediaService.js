// services/mediaService.js
// [REORGANIZAÇÃO] Toda a lógica de mídia/imagem extraída do index.js.
// Conversa com Jimp, fetch(), downloadMediaMessage — sem tocar em fluxo/UI.

import fs from "fs"
import pino from "pino"
import { Jimp } from "jimp"
import { downloadMediaMessage } from "../connection/baileysCompat.js"
import { getSock } from "../connection/socket.js"
import { MAX_IMAGE_BYTES, HTTP_UA } from "../utils/config.js"

export function isValidHttpUrl(str) {
    try {
        const u = new URL(str)
        return u.protocol === "http:" || u.protocol === "https:"
    } catch {
        return false
    }
}

export async function prepararFoto(caminho) {
    const img = await Jimp.read(caminho)
    img.cover({ w: 640, h: 640 })
    return await img.getBuffer("image/jpeg")
}

export async function prepararFotoBuffer(buffer) {
    const img = await Jimp.read(buffer)
    img.cover({ w: 640, h: 640 })
    return await img.getBuffer("image/jpeg")
}

export async function baixarMidiaMensagem(m) {
    const sock = getSock()
    return await downloadMediaMessage(m, "buffer", {}, {
        logger: pino({ level: "silent" }),
        reuploadRequest: sock.updateMediaMessage
    })
}

export function detectarImagem(m) {
    if (!m?.message) return null
    const im = m.message.imageMessage
        || m.message.viewOnceMessage?.message?.imageMessage
        || m.message.viewOnceMessageV2?.message?.imageMessage
    if (im) return { type: "image", mimetype: im.mimetype || "image/jpeg", size: im.fileLength }

    const doc = m.message.documentMessage
    if (doc && typeof doc.mimetype === "string" && doc.mimetype.startsWith("image/")) {
        const mime = doc.mimetype.toLowerCase()
        if (["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(mime)) {
            return { type: "document", mimetype: mime, size: doc.fileLength }
        }
    }
    return null
}

export function validarTamanho(size) {
    if (!size) return true
    const n = typeof size === "number" ? size : Number(size)
    return isFinite(n) && n <= MAX_IMAGE_BYTES
}

function extrairImagemHTML(html, baseUrl) {
    const patterns = [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ]
    for (const rx of patterns) {
        const m = html.match(rx)
        if (m && m[1]) {
            try { return new URL(m[1], baseUrl).toString() } catch { return m[1] }
        }
    }
    return null
}

export async function fetchImagem(url, prof = 0) {
    if (prof > 2) throw new Error("Muitos redirecionamentos")
    if (!isValidHttpUrl(url)) throw new Error("URL inválida")
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 30000)
    let resp
    try {
        resp = await fetch(url, {
            signal: ctrl.signal,
            redirect: "follow",
            headers: { "User-Agent": HTTP_UA, "Accept": "image/*,text/html;q=0.9,*/*;q=0.8" }
        })
    } finally {
        clearTimeout(to)
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const ct = (resp.headers.get("content-type") || "").toLowerCase()
    const finalUrl = resp.url || url
    if (ct.startsWith("image/")) {
        const cl = parseInt(resp.headers.get("content-length") || "0")
        if (cl && cl > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande")
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande")
        return buf
    }
    if (ct.includes("text/html") || ct.includes("xhtml")) {
        const html = await resp.text()
        const imgUrl = extrairImagemHTML(html, finalUrl)
        if (!imgUrl) {
            if (finalUrl.includes("pinterest") || url.includes("pin.it")) {
                throw new Error("Pinterest sem imagem acessível. Use URL direta.")
            }
            throw new Error("Página sem og:image detectável.")
        }
        return await fetchImagem(imgUrl, prof + 1)
    }
    throw new Error(`Conteúdo não é imagem (${ct})`)
}
