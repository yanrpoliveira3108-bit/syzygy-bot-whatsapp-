// features/flood/shopping.js
// Adaptador da Shop Message REAL do Baileys instalado:
//   @innovatorssoft/baileys 7.4.7
//   sock.sendMessage(jid, { text, title, subtitle, footer, shop: { surface, id }, viewOnce })
//   → proto interactiveMessage.shopStorefrontMessage { id, surface }
//
// Formatos no generateWAMessageContent: text, image, video, document, location, product.
// Surface no README: 1 | 2 | 3 | 4. Proto enum: 0 UNKNOWN, 1 FB, 2 IG, 3 WA.
// Não inventar API. Se shop não estiver no content, o adaptador recusa.

import { parseCurrency } from "./payment.js"

export const SHOP_FORMATS = ["text", "image", "video", "document", "location", "product"]
export const SHOP_SURFACES = new Set([1, 2, 3, 4])

export function getShoppingApiInfo() {
    return {
        library: "@innovatorssoft/baileys@7.4.7",
        available: true,
        sendShape: "sock.sendMessage(jid, { text, title, subtitle, footer, shop: { surface, id }, viewOnce })",
        proto: "interactiveMessage.shopStorefrontMessage",
        surfaceField: "shop.surface (README 1|2|3|4 · proto FB=1 IG=2 WA=3)",
        formats: [...SHOP_FORMATS],
        alsoPresent: ["collection (não usado neste preset)"]
    }
}

export function parseSurface(raw) {
    if (raw == null || String(raw).trim() === "") return { ok: false, error: "SURFACE_MISSING" }
    const s = String(raw).trim()
    if (!/^[1-4]$/.test(s)) return { ok: false, error: "SURFACE_INVALID" }
    const n = Number(s)
    if (!SHOP_SURFACES.has(n)) return { ok: false, error: "SURFACE_INVALID" }
    return { ok: true, value: n }
}

export function parseShopId(raw) {
    const id = String(raw == null ? "" : raw).trim()
    if (!id) return { ok: false, error: "SHOP_ID_MISSING" }
    if (/^https?:\/\//i.test(id)) {
        try {
            const u = new URL(id)
            if (!u.hostname) return { ok: false, error: "SHOP_ID_INVALID" }
        } catch {
            return { ok: false, error: "SHOP_ID_INVALID" }
        }
    }
    return { ok: true, value: id }
}

export function parseShopUrl(raw, errorCode = "URL_INVALID") {
    const s = String(raw == null ? "" : raw).trim()
    if (!s) return { ok: false, error: "URL_MISSING" }
    try {
        const u = new URL(s)
        if (!/^https?:$/i.test(u.protocol) || !u.hostname) return { ok: false, error: errorCode }
        return { ok: true, value: s }
    } catch {
        return { ok: false, error: errorCode }
    }
}

export function parseBusinessOwnerJid(raw) {
    const jid = String(raw == null ? "" : raw).trim()
    if (!jid) return { ok: false, error: "BUSINESS_OWNER_MISSING" }
    if (!/^.+@(s\.whatsapp\.net|lid)$/i.test(jid)) return { ok: false, error: "BUSINESS_OWNER_INVALID" }
    return { ok: true, value: jid }
}

export function parsePriceAmount1000(raw) {
    if (raw == null || String(raw).trim() === "") return { ok: false, error: "PRICE_MISSING" }
    const s = String(raw).trim()
    if (!/^\d+$/.test(s)) return { ok: false, error: "PRICE_INVALID" }
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "PRICE_INVALID" }
    return { ok: true, value: String(Math.trunc(n)) }
}

function optionalStr(v) {
    if (v == null) return undefined
    const s = String(v).trim()
    return s || undefined
}

function detectFormat(src = {}) {
    const explicit = String(src.format || src.shopFormat || "").trim().toLowerCase()
    if (SHOP_FORMATS.includes(explicit)) return explicit
    if (src.product) return "product"
    if (src.location) return "location"
    if (src.document) return "document"
    if (src.video) return "video"
    if (src.image) return "image"
    return "text"
}

function mediaUpload(raw) {
    if (raw == null) return { ok: false, error: "MEDIA_MISSING" }
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw) && raw.length) return { ok: true, value: raw }
    if (typeof raw === "string") {
        const url = parseShopUrl(raw, "MEDIA_URL_INVALID")
        if (!url.ok) return url
        return { ok: true, value: { url: url.value } }
    }
    if (typeof raw === "object") {
        if (raw.url) {
            const url = parseShopUrl(raw.url, "MEDIA_URL_INVALID")
            if (!url.ok) return url
            return { ok: true, value: { url: url.value } }
        }
        if (raw.stream) return { ok: true, value: raw }
    }
    return { ok: false, error: "MEDIA_INVALID" }
}

function parseLocation(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "LOCATION_MISSING" }
    const lat = Number(raw.degreesLatitude ?? raw.degressLatitude)
    const lng = Number(raw.degreesLongitude ?? raw.degressLongitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: "LOCATION_INVALID" }
    const loc = { degreesLatitude: lat, degreesLongitude: lng }
    const name = optionalStr(raw.name)
    if (name) loc.name = name
    return { ok: true, value: loc }
}

function parseProduct(raw) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "PRODUCT_MISSING" }
    const productId = optionalStr(raw.productId)
    if (!productId) return { ok: false, error: "PRODUCT_ID_MISSING" }
    const title = optionalStr(raw.title)
    if (!title) return { ok: false, error: "PRODUCT_TITLE_MISSING" }
    const description = optionalStr(raw.description)
    if (!description) return { ok: false, error: "PRODUCT_DESCRIPTION_MISSING" }
    const currency = parseCurrency(raw.currencyCode)
    if (!currency.ok) return { ok: false, error: currency.error === "CURRENCY_MISSING" ? "PRODUCT_CURRENCY_MISSING" : currency.error }
    const price = parsePriceAmount1000(raw.priceAmount1000)
    if (!price.ok) return price
    const img = mediaUpload(raw.productImage)
    if (!img.ok) return { ok: false, error: img.error === "MEDIA_MISSING" ? "PRODUCT_IMAGE_MISSING" : img.error }
    const product = {
        productImage: img.value,
        productId,
        title,
        description,
        currencyCode: currency.value,
        priceAmount1000: price.value
    }
    const retailerId = optionalStr(raw.retailerId)
    if (retailerId) product.retailerId = retailerId
    if (raw.url) {
        const url = parseShopUrl(raw.url)
        if (!url.ok) return url
        product.url = url.value
    }
    const count = raw.productImageCount
    if (count != null && String(count).trim() !== "") {
        const n = parseInt(String(count), 10)
        if (!Number.isInteger(n) || n < 1) return { ok: false, error: "PRODUCT_IMAGE_COUNT_INVALID" }
        product.productImageCount = n
    }
    return { ok: true, value: product }
}

export function parseShoppingArgs(raw) {
    const src = String(raw == null ? "" : raw).trim()
    if (!src) return { ok: false, error: "USAGE", usage: usageTexto() }
    const parts = src.split("|").map(s => s.trim())
    if (parts.length === 6 && parseSurface(parts[4]).ok) {
        return createShoppingPayload({
            format: "text",
            text: parts[0],
            title: parts[1],
            subtitle: parts[2],
            footer: parts[3],
            shop: { surface: parts[4], id: parts[5] }
        })
    }
    if (parts.length >= 4) {
        const id = parts[parts.length - 1]
        const surface = parts[parts.length - 2]
        const title = parts[parts.length - 3]
        const text = parts.slice(0, parts.length - 3).join("|")
        return createShoppingPayload({
            format: "text",
            text,
            title,
            shop: { surface, id }
        })
    }
    return { ok: false, error: "USAGE", usage: usageTexto() }
}

export function createShoppingPayload(src = {}) {
    const format = detectFormat(src)
    if (!SHOP_FORMATS.includes(format)) return { ok: false, error: "FORMAT_UNSUPPORTED", usage: usageTexto() }

    const shopSrc = src.shop && typeof src.shop === "object" ? src.shop : {}
    const surface = parseSurface(shopSrc.surface ?? src.surface)
    if (!surface.ok) return { ...surface, usage: usageTexto() }
    const shopId = parseShopId(shopSrc.id ?? src.shopId)
    if (!shopId.ok) return { ...shopId, usage: usageTexto() }

    const title = optionalStr(src.title)
    const subtitle = optionalStr(src.subtitle)
    const footer = optionalStr(src.footer)
    const viewOnce = src.viewOnce !== false
    const content = {
        shop: { surface: surface.value, id: shopId.value },
        viewOnce
    }
    if (title) content.title = title
    if (subtitle) content.subtitle = subtitle
    if (footer) content.footer = footer

    if (format === "text") {
        const text = optionalStr(src.text) || optionalStr(src.caption) || optionalStr(src.body)
        if (!text) return { ok: false, error: "TEXT_MISSING", usage: usageTexto() }
        content.text = text
    } else if (format === "image") {
        const img = mediaUpload(src.image)
        if (!img.ok) return { ...img, usage: usageTexto() }
        content.image = img.value
        content.caption = optionalStr(src.caption) || optionalStr(src.text) || title || ""
        content.hasMediaAttachment = src.hasMediaAttachment === true
    } else if (format === "video") {
        const vid = mediaUpload(src.video)
        if (!vid.ok) return { ...vid, usage: usageTexto() }
        content.video = vid.value
        content.caption = optionalStr(src.caption) || optionalStr(src.text) || title || ""
        content.hasMediaAttachment = src.hasMediaAttachment === true
    } else if (format === "document") {
        const doc = mediaUpload(src.document)
        if (!doc.ok) return { ...doc, usage: usageTexto() }
        const mimetype = optionalStr(src.mimetype)
        if (!mimetype) return { ok: false, error: "MIMETYPE_MISSING", usage: usageTexto() }
        content.document = doc.value
        content.mimetype = mimetype
        content.caption = optionalStr(src.caption) || optionalStr(src.text) || title || ""
        if (src.jpegThumbnail != null) content.jpegThumbnail = src.jpegThumbnail
        content.hasMediaAttachment = src.hasMediaAttachment === true
    } else if (format === "location") {
        const loc = parseLocation(src.location)
        if (!loc.ok) return { ...loc, usage: usageTexto() }
        content.location = loc.value
        content.caption = optionalStr(src.caption) || optionalStr(src.text) || title || ""
        content.hasMediaAttachment = src.hasMediaAttachment === true
    } else if (format === "product") {
        const product = parseProduct(src.product)
        if (!product.ok) return { ...product, usage: usageTexto() }
        content.product = product.value
        if (src.businessOwnerJid) {
            const owner = parseBusinessOwnerJid(src.businessOwnerJid)
            if (!owner.ok) return { ...owner, usage: usageTexto() }
            content.businessOwnerJid = owner.value
        }
        content.caption = optionalStr(src.caption) || optionalStr(src.text) || title || ""
        content.hasMediaAttachment = src.hasMediaAttachment === true
    }

    return {
        ok: true,
        format,
        text: content.text || content.caption,
        title: content.title,
        subtitle: content.subtitle,
        footer: content.footer,
        surface: surface.value,
        shopId: shopId.value,
        viewOnce,
        content
    }
}

export function usageTexto() {
    return "Uso: texto|title|surface|id\nExemplo: Produto de teste|SYZYGY SHOP|1|https://example.com\nOu: texto|title|subtitle|footer|surface|id"
}

export function formatShoppingError(code) {
    const map = {
        USAGE: usageTexto(),
        TEXT_MISSING: `Texto/body obrigatório.\n${usageTexto()}`,
        SURFACE_MISSING: `surface obrigatório (1, 2, 3 ou 4).\n${usageTexto()}`,
        SURFACE_INVALID: `surface inválido. Use 1, 2, 3 ou 4.\n${usageTexto()}`,
        SHOP_ID_MISSING: `shop.id obrigatório.\n${usageTexto()}`,
        SHOP_ID_INVALID: `shop.id inválido. Use URL http(s) ou id da loja.\n${usageTexto()}`,
        URL_MISSING: "URL obrigatória.",
        URL_INVALID: "URL inválida. Use http(s).",
        MEDIA_MISSING: "Mídia obrigatória para este formato.",
        MEDIA_INVALID: "Mídia inválida.",
        MEDIA_URL_INVALID: "URL de mídia inválida.",
        MIMETYPE_MISSING: "mimetype obrigatório no formato document.",
        LOCATION_MISSING: "location obrigatória no formato location.",
        LOCATION_INVALID: "location inválida. Use degreesLatitude e degreesLongitude.",
        PRODUCT_MISSING: "product obrigatório no formato product.",
        PRODUCT_ID_MISSING: "productId obrigatório.",
        PRODUCT_TITLE_MISSING: "title do produto obrigatório.",
        PRODUCT_DESCRIPTION_MISSING: "description do produto obrigatória.",
        PRODUCT_CURRENCY_MISSING: "currencyCode obrigatório (ex: BRL).",
        PRODUCT_IMAGE_MISSING: "productImage obrigatória.",
        PRODUCT_IMAGE_COUNT_INVALID: "productImageCount inválido.",
        PRICE_MISSING: "priceAmount1000 obrigatório.",
        PRICE_INVALID: "priceAmount1000 inválido. Use inteiro positivo (ex: 283000).",
        BUSINESS_OWNER_MISSING: "businessOwnerJid obrigatório no formato product.",
        BUSINESS_OWNER_INVALID: "businessOwnerJid inválido (use número@s.whatsapp.net).",
        CURRENCY_INVALID: "Moeda inválida. Use código ISO de 3 letras (ex: BRL).",
        CURRENCY_UNSUPPORTED: "Moeda não suportada neste teste.",
        FORMAT_UNSUPPORTED: `Formato shopping não suportado. Use: ${SHOP_FORMATS.join(", ")}.`,
        SHOPPING_UNAVAILABLE: "Shop Message indisponível nesta versão do Baileys.",
        SHOPPING_TEST_DISABLED: "shopping-test só funciona com floodTestMode ligado.",
        SHOPPING_PAYLOAD_INVALID: "Payload shopping inválido."
    }
    return map[code] || `Erro de shopping: ${code}\n${usageTexto()}`
}

export function buildShoppingContent(payload, { businessOwnerJid } = {}) {
    if (!payload?.ok || !payload.content) {
        throw Object.assign(new Error("SHOPPING_PAYLOAD_INVALID"), { code: "SHOPPING_PAYLOAD_INVALID" })
    }
    const content = { ...payload.content }
    if (content.product && !content.businessOwnerJid && businessOwnerJid) {
        content.businessOwnerJid = businessOwnerJid
    }
    if (content.product && !content.businessOwnerJid) {
        throw Object.assign(new Error("BUSINESS_OWNER_MISSING"), { code: "BUSINESS_OWNER_MISSING" })
    }
    return content
}

export async function sendShoppingMessage(sock, jid, payload, extra = {}) {
    if (!sock || typeof sock.sendMessage !== "function") {
        throw Object.assign(new Error("SHOPPING_UNAVAILABLE"), { code: "SHOPPING_UNAVAILABLE" })
    }
    const content = buildShoppingContent(payload, { businessOwnerJid: extra.businessOwnerJid || sock.user?.id })
    return sock.sendMessage(jid, content)
}
