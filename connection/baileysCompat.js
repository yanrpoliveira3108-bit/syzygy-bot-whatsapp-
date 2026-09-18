// connection/baileysCompat.js
// [v48→v51] CAMADA DE COMPATIBILIDADE BAILEYS — ÚNICO ponto de import da lib.
//
// [v51] Migração @innovatorssoft/baileys 7.4.7 → @lucasmod/boruto-vk7-baileys
// 2.1.0 (repo Otakump4/boruto_vk7-baileys). O que DOEU e como este arquivo
// absorve:
//  - O pacote publicado é o monorepo inteiro: a lib real está em `baileys/lib/`,
//    então o `main: lib/index.js` da raiz não existe. O specifier canônico é
//    `@lucasmod/boruto-vk7-baileys/baileys/lib/index.js` (ESM não resolve
//    diretório: `.../baileys` dá ERR_UNSUPPORTED_DIR_IMPORT).
//  - Default export é o NAMESPACE, não a função — o mesmo sintoma do
//    innovatorssoft, e é para isto que o `typeof === "function"` abaixo existe.
//  - Ele exige `@boruto_vk7/libsignal-node`, nome que não existe no npm; o
//    package.json do projeto resolve via npm alias para
//    @itsukichan/libsignal-node@1.0.1 (mesmo código, nome publicado).
//  - `npm i` precisa de --ignore-scripts (preinstall aponta para arquivo
//    ausente na raiz do tarball) — fixado no .npmrc do projeto.
//  - Contratos de payload preservados no fork novo (verificados no lib dele):
//    `shop` em Utils/messages.js:1020, embrulho de `viewOnce` em :1197,
//    payment em :725-753 (montagem) e :1247-1249 (leitura).
//    Exceção: o ramo COMBINADO nativeFlow+shop (que punha messageVersion=1)
//    NÃO existe aqui — `interactiveButtons` (:973) monta só nativeFlowMessage e
//    é `else if` exclusivo. Ver node_modules/@lucasmod/boruto-vk7-baileys/baileys/lib/Utils/messages.js.
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
import * as baileys from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"

const makeWASocketFn = typeof baileys.default === "function"
    ? baileys.default               // whiskeysockets: default = função
    : baileys.makeWASocket         // innovatorssoft: default = namespace

export default makeWASocketFn
export * from "@lucasmod/boruto-vk7-baileys/baileys/lib/index.js"
