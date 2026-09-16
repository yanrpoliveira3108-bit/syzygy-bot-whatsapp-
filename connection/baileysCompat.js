// connection/baileysCompat.js
// [v48] CAMADA DE COMPATIBILIDADE BAILEYS — ÚNICO ponto de import da lib.
//
// Migração @whiskeysockets/baileys 7.0.0-rc14 → @innovatorssoft/baileys 7.4.7:
//  - Todas as APIs usadas pelo projeto existem no fork com os mesmos nomes
//    (verificado em runtime: makeWASocket, useMultiFileAuthState,
//    fetchLatestBaileysVersion, DisconnectReason, jidNormalizedUser,
//    areJidsSameUser, downloadMediaMessage, normalizeMessageContent,
//    getContentType, generateWAMessageFromContent, prepareWAMessageMedia,
//    generateForwardMessageContent, generateWAMessage, proto, ...).
//  - DIFERENÇA REAL corrigida aqui: no whiskeysockets o default export É a
//    função makeWASocket; no innovatorssoft o default export é o NAMESPACE
//    (objeto). O projeto faz `import makeWASocket from ...` — sem esta camada
//    ele receberia um objeto e quebraria ao conectar. Aqui o default volta a
//    ser a função, preservando o contrato original.
//  - Para trocar de fork no futuro, mude SOMENTE este arquivo.
import * as baileys from "@innovatorssoft/baileys"

const makeWASocketFn = typeof baileys.default === "function"
    ? baileys.default               // whiskeysockets: default = função
    : baileys.makeWASocket         // innovatorssoft: default = namespace

export default makeWASocketFn
export * from "@innovatorssoft/baileys"
