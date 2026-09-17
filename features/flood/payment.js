// features/flood/payment.js
// [INFRA FLOOD · recuperada da arena 01a0aaae]
// Adaptador da Payment Message REAL do pacote instalado (@innovatorssoft/baileys
// 7.4.7): sock.sendMessage(jid, { payment: PaymentInfo }) → requestPaymentMessage
// { amount1000, currencyCodeIso4217, noteMessage, requestFrom }.
//
// Por que este arquivo está aqui e não no engine de shopping:
// payment é OUTRO proto e OUTRO caminho. O adapter de shopping (shopping.js /
// engine.js do AB7) RECUSA payment de propósito — os dois nunca se misturam.
// O contrato de payload não foi alterado: { payment: { note, currency, amount,
// offset, from } }. Também NÃO existe mais "sendPaymentMessage" aqui: quem envia
// é o laço do flood (safeSendMessage / executarFlood), para não haver um segundo
// sock.sendMessage espalhado pelo sistema.
//
// paymentInvite existe no fork mas NÃO carrega valor/moeda — não é o payload de
// pagamento. Nada aqui é inventado.

const ISO4217 = new Set([
    "BRL", "USD", "EUR", "GBP", "JPY", "ARS", "MXN", "CLP", "COP", "PEN",
    "UYU", "PYG", "BOB", "CAD", "AUD", "CHF", "CNY", "INR", "IDR", "ZAR",
    "KRW", "NZD", "SEK", "NOK", "DKK", "PLN", "TRY", "RUB", "AED", "SAR"
])

export function getPaymentApiInfo() {
    return {
        library: "@innovatorssoft/baileys@7.4.7",
        available: true,
        sendShape: "sock.sendMessage(jid, { payment: { note, currency, amount, offset, from, expiry } })",
        proto: "requestPaymentMessage",
        amountField: "amount1000 = valor * 1000",
        mentions: "via content.mentions → noteMessage.extendedTextMessage.contextInfo.mentionedJid",
        alsoPresent: ["paymentInvite (sem valor — NÃO usado neste preset)"]
    }
}

export function parseAmount(raw) {
    if (raw == null) return { ok: false, error: "AMOUNT_MISSING" }
    let s = String(raw).trim()
    if (!s) return { ok: false, error: "AMOUNT_MISSING" }
    if (/^-/.test(s)) return { ok: false, error: "AMOUNT_NEGATIVE" }
    if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".")
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return { ok: false, error: "AMOUNT_INVALID" }
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "AMOUNT_INVALID" }
    if (!Number.isFinite(n * 1000)) return { ok: false, error: "AMOUNT_INVALID" }
    return { ok: true, value: n, amount1000: Math.round(n * 1000), display: n.toFixed(2) }
}

export function parseCurrency(raw) {
    if (raw == null || String(raw).trim() === "") return { ok: false, error: "CURRENCY_MISSING" }
    const code = String(raw).trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) return { ok: false, error: "CURRENCY_INVALID" }
    if (!ISO4217.has(code)) return { ok: false, error: "CURRENCY_UNSUPPORTED" }
    return { ok: true, value: code }
}

export function parsePaymentArgs(raw) {
    const src = String(raw == null ? "" : raw).trim()
    if (!src) {
        return { ok: false, error: "USAGE", usage: usageTexto() }
    }
    const parts = src.split("|").map(s => s.trim())
    if (parts.length < 3) {
        return { ok: false, error: "USAGE", usage: usageTexto() }
    }
    const text = parts[0]
    if (!text) return { ok: false, error: "TEXT_MISSING", usage: usageTexto() }
    const amount = parseAmount(parts[1])
    if (!amount.ok) return { ...amount, usage: usageTexto() }
    const currency = parseCurrency(parts[2])
    if (!currency.ok) return { ...currency, usage: usageTexto() }
    return createPaymentPayload({ text, amount: amount.value, currency: currency.value })
}

export function createPaymentPayload({ text, amount, currency } = {}) {
    const note = String(text == null ? "" : text).trim()
    if (!note) return { ok: false, error: "TEXT_MISSING", usage: usageTexto() }
    const amt = typeof amount === "object" && amount && amount.ok ? amount : parseAmount(amount)
    if (!amt.ok) return { ...amt, usage: usageTexto() }
    const cur = typeof currency === "object" && currency && currency.ok ? currency : parseCurrency(currency)
    if (!cur.ok) return { ...cur, usage: usageTexto() }
    return {
        ok: true,
        text: note,
        amount: amt.value,
        amount1000: amt.amount1000,
        currency: cur.value,
        display: `${amt.display} ${cur.value}`,
        content: {
            note,
            currency: cur.value,
            amount: amt.amount1000,
            offset: 0
        }
    }
}

export function usageTexto() {
    return "Uso: texto|valor|moeda\nExemplo: Pagamento do pedido|25.90|BRL"
}

export function formatPaymentError(code) {
    const map = {
        USAGE: usageTexto(),
        TEXT_MISSING: `Texto obrigatório.\n${usageTexto()}`,
        AMOUNT_MISSING: `Valor obrigatório.\n${usageTexto()}`,
        AMOUNT_INVALID: `Valor inválido. Use 10, 10.5, 10.50, 1000.99 — sem negativo/NaN.\n${usageTexto()}`,
        AMOUNT_NEGATIVE: `Valor não pode ser negativo.\n${usageTexto()}`,
        CURRENCY_MISSING: `Moeda obrigatória (BRL, USD, EUR...).\n${usageTexto()}`,
        CURRENCY_INVALID: `Moeda inválida. Use código ISO de 3 letras (ex: BRL).\n${usageTexto()}`,
        CURRENCY_UNSUPPORTED: `Moeda não suportada neste teste.\n${usageTexto()}`,
        PAYMENT_UNAVAILABLE: "Payment Message indisponível nesta versão do Baileys.",
        PAYMENT_TEST_DISABLED: "payment-test só funciona com floodTestMode ligado."
    }
    return map[code] || `Erro de pagamento: ${code}\n${usageTexto()}`
}

export function buildPaymentContent(payload, { from, mentions, expiry } = {}) {
    if (!payload?.ok || !payload.content) {
        throw Object.assign(new Error("PAYMENT_PAYLOAD_INVALID"), { code: "PAYMENT_PAYLOAD_INVALID" })
    }
    const content = {
        payment: {
            note: payload.content.note,
            currency: payload.content.currency,
            amount: payload.content.amount,
            offset: payload.content.offset || 0,
            expiry: expiry || 0
        }
    }
    if (from) content.payment.from = from
    if (Array.isArray(mentions) && mentions.length) content.mentions = mentions
    return content
}
