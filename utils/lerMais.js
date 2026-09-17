// utils/lerMais.js
// [v46.1] 📖 "LER MAIS" — dobra mensagens logo após o título (⚡ SYZYGY).
//
// MECANISMO REAL (sem invenção de API):
// O app do WhatsApp só cria o botão "Ler mais"/"Ler tudo" quando a mensagem
// excede o LIMITE DE CARACTERES do cliente (varia por versão/aparelho — na
// prática fica entre ~1.000 e ~2.200). Linhas em branco NÃO bastam: aparecem
// como espaço visível e nem sempre passam do limite (foi o que aconteceu na
// v46). O que funciona (confirmado empiricamente no Android) é preencher com
// um CARACTERE INVISÍVEL — U+034F COMBINING GRAPHEME JOINER (bytes CD 8F) —
// até a mensagem passar do limite: a prévia mostra só a 1ª linha (o título)
// e o restante fica atrás do "Ler mais".
//
// LIMITAÇÕES INFORMADAS (mostradas no menu do dono):
//  • O corte exato e o limite são decisão do app (sem API) — variação por
//    versão/aparelho.
//  • Relatos apontam que em IPHONE o truque do caractere invisível não dobra.
//  • Mensagens de 1 linha só (ex.: "✅ Feito") não são alteradas.
//  • DESLIGADO = nada é acrescentado; mensagens MUITO longas ainda podem ser
//    dobradas pelo próprio app (comportamento do WhatsApp, sem API p/ veto).
//  • Quem COPIAR a mensagem cola os caracteres invisíveis junto (inofensivo).

import { CONFIG } from "./config.js"

const INV = "\u034F"          // U+034F — invisível no WhatsApp Android (2 bytes UTF-8)
const ALVO_CHARS = 4000       // total p/ passar do limite de exibição com folga
const MIN_RESTO = 4           // só aplica em mensagens com algo após a 1ª linha

export function aplicarLerMais(texto) {
    try {
        if (!CONFIG.lerMais || typeof texto !== "string") return texto
        const i = texto.indexOf("\n")
        if (i < 0) return texto                       // 1 linha só: não mexe
        if (texto.slice(i + 1).trim().length < MIN_RESTO) return texto
        if (texto.includes(INV.repeat(64))) return texto // já aplicado (idempotente)
        const falta = Math.max(0, ALVO_CHARS - texto.length)
        const pad = INV.repeat(falta) + "\n"
        return texto.slice(0, i + 1) + pad + texto.slice(i + 1)
    } catch {
        return texto
    }
}
