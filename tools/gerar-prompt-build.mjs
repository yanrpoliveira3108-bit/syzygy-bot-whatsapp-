#!/usr/bin/env node
// tools/gerar-prompt-build.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Gera `SYZYGY-PROMPT-BUILD.md`: um documento ÚNICO e autossuficiente com
//   (A) a especificação do SYZYGY 2.0 (derivada de PROMPT-RECONSTRUCAO-SYZYGY.md)
//   (B) o CÓDIGO-FONTE de referência completo, arquivo por arquivo
// destinado a ser colado em outro agente/IA para reconstruir o bot do zero,
// sem acesso ao repositório.
//
// Por que um gerador e não um arquivo à mão: o fonte é a verdade. Depois de
// qualquer mudança de código, rode `node tools/gerar-prompt-build.mjs` e o
// documento é re-sincronizado (LOC, conteúdo e números voltam a ser reais).
//
// Segurança: TODO texto é passado por `mascarar()` antes de ser escrito —
// números de telefone, @s.whatsapp.net e @g.us viram placeholders. Assim o
// arquivo pode ser enviado para um modelo de terceiros sem vazar o número do
// dono, o allowlist ou os grupos do flood. `config.json`, `dono/*` e `sessao/*`
// NÃO entram no bundle.
//
// Uso:
//   node tools/gerar-prompt-build.mjs            # escreve SYZYGY-PROMPT-BUILD.md
//   node tools/gerar-prompt-build.mjs --check     # só reporta, não escreve
// ═══════════════════════════════════════════════════════════════════════════

import fs from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(import.meta.dirname, "..")
const SAIDA = path.join(RAIZ, "SYZYGY-PROMPT-BUILD.md")
const SPEC = "PROMPT-RECONSTRUCAO-SYZYGY.md"

/** Nome do pacote e versão-alvo da Baileys deste build. */
const BAILEYS_PKG = "@lucasmod/boruto-vk7-baileys"
const BAILEYS_VER = "2.1.0"
const BAILEYS_SUBPATH = "baileys/lib/index.js"

// ── Ordem do bundle (agrupada por fase de construção) ────────────────────────
// Cada item é um diretório (pega tudo recursivamente) ou um arquivo exato.
const ORDEM = [
    "package.json",
    "connection",
    "utils",
    "commands",
    "handlers",
    "services",
    "actions",
    "menus",
    "index.js",
    "features/flood",
    "features/viewOnce",
    "features/statusManager",
    "start.sh",
    "update.sh",
    "recover.sh",
    ".gitignore",
]

// Depois da lista acima, UMA varredura do resto do repositório pega qualquer
// arquivo novo (o bundle nunca pode ficar mudo sobre código existente).
const EXTRAS = "."

// O que NUNCA entra (além de `node_modules`, `.git`, `tmp`).
const IGNORAR = new Set([
    "node_modules", ".git", "tmp", "log", "state", "sessao", "dono",
    "legacy", "patches", "tools",
])
const IGNORAR_ARQ = new Set([
    "package-lock.json", "AUDITORIA-SYZYGY.md", SPEC, "SYZYGY-PROMPT-BUILD.md",
    "config.json", "config.json.bak", "config.local.json", ".env",
])
const EXT_OK = new Set([".js", ".mjs", ".cjs", ".json", ".md", ".sh", ".txt"])
const NOME_OK = new Set([".gitignore", ".npmrc", ".env.example"])

// ── 1. coleta ───────────────────────────────────────────────────────────────
function listar() {
    const vistos = new Set()
    const out = []
    const walk = (abs, rel) => {
        const st = fs.statSync(abs)
        if (st.isDirectory()) {
            for (const e of fs.readdirSync(abs).sort()) {
                if (IGNORAR.has(e) || (e.startsWith(".") && !NOME_OK.has(e))) continue
                walk(path.join(abs, e), `${rel}/${e}`)
            }
            return
        }
        if (IGNORAR_ARQ.has(path.basename(rel))) return
        if (!EXT_OK.has(path.extname(rel)) && !NOME_OK.has(path.basename(rel))) return
        if (vistos.has(rel)) return
        vistos.add(rel)
        out.push(rel)
    }
    for (const item of [...ORDEM, EXTRAS]) {
        const abs = path.join(RAIZ, item)
        if (!fs.existsSync(abs)) { console.warn(`[ausente] ${item}`); continue }
        walk(abs, item === EXTRAS ? "." : `./${item}`)
    }
    // normaliza caminhos vindos da varredura geral ("./x" vs "././x")
    return out.map(r => r.replace(/^\.\/\.\//, "./"))
}

// ── 2. saneamento ───────────────────────────────────────────────────────────
// Não máscaras genéricas: a lista de segredos é DERIVADA do estado real do
// projeto (config.json + dono/*.json, ambos fora do bundle) e só essas
// sequências são substituídas no resto do fonte. Isso preserva intactos os
// números sintéticos de fixture (5519999999999 etc.), que as suítes de teste
// comparam literalmente — se você mascarar um fixture, o teste quebra.
//
// Os placeholders têm forma válida (só dígitos), porque o código normaliza
// JIDs/telefones: um "5519XXXXXXXXX" faria o boot falhar e o teste de
// permissão errar. Então: telefone real → 5519000000000, grupo real →
// 150000000000000000-1000000000@g.us. Ambos são números que ninguém usa.
const FAKE_TEL = "5519000000000"
const FAKE_GRUPO = "150000000000000000-1000000000@g.us"

function segredosReais() {
    const alvos = ["config.json"]
    try {
        for (const e of fs.readdirSync(path.join(RAIZ, "dono"))) {
            if (e.endsWith(".json")) alvos.push(`dono/${e}`)
        }
    } catch {}
    const tels = new Set(), grupos = new Set()
    for (const a of alvos) {
        let t
        try { t = fs.readFileSync(path.join(RAIZ, a), "utf8") } catch { continue }
        for (const m of t.matchAll(/\b\d{8,20}(?:-\d{2,12})?@g\.us\b/g)) grupos.add(m[0])
        for (const m of t.matchAll(/\b55\d{10,13}\b/g)) tels.add(m[0])
    }
    // ordena decrescente por tamanho para não mastigar prefixo de número mais longo
    const lista = [...tels].sort((a, b) => b.length - a.length).map(v => [v, FAKE_TEL])
        .concat([...grupos].sort((a, b) => b.length - a.length).map(v => [v, FAKE_GRUPO]))
    return lista
}

const SEGREDOS = segredosReais()

function mascarar(texto) {
    let s = texto
    for (const [real, fake] of SEGREDOS) s = s.split(real).join(fake)
    return s
}

function achouSegredo(texto) {
    return SEGREDOS.filter(([real]) => texto.includes(real)).map(([real]) => real)
}

// ── 3. patches da especificação (a spec base fala do fork antigo) ──────────
// Estes replaces são a ÚNICA edição de conteúdo feita sobre a spec: trocam a
// identidade da Baileys. Se a spec base mudar, re-derive aqui (nunca edite o
// bundle gerado na mão).
const PATCHES_SPEC = [
    [
        "| WhatsApp | `@innovatorssoft/baileys@7.4.7` (fork **não-oficial** do Baileys) |",
        `| WhatsApp | \`${BAILEYS_PKG}@${BAILEYS_VER}\` (fork **não-oficial** do Baileys — repo \`Otakump4/boruto_vk7-baileys\`) |`,
    ],
    [
        '  "dependencies": { "@innovatorssoft/baileys": "7.4.7", "jimp": "^1.6.0", "pino": "^10.3.1" } }',
        `  "dependencies": { "jimp": "^1.6.0", "pino": "^10.3.1" } }\n// e, com npm alias, a Baileys + o libsignal renomeado que ela exige:\n// npm i ${BAILEYS_PKG}@${BAILEYS_VER} --ignore-scripts --legacy-peer-deps\n// npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps\n// ⚠️ este pacote NÃO instala com "npm i" liso — leia a seção 2.1 antes de tentar`,
    ],
    [
        "### Contrato do send (fork `@innovatorssoft/baileys@7.4.7`)",
        `### Contrato do send (fork \`${BAILEYS_PKG}@${BAILEYS_VER}\`)`,
    ],
    [
        "> risca: Node ESM + `@innovatorssoft/baileys@7.4.7` + `jimp` + `pino`, estado em JSON no",
        `> risca: Node ESM + \`${BAILEYS_PKG}@${BAILEYS_VER}\` + \`jimp\` + \`pino\`, estado em JSON no`,
    ],
]

const SEC_MIGRACAO = `
### 2.1 A Baileys deste build (leia antes de instalar qualquer coisa)

A dependência de WhatsApp deste projeto é o fork \`${BAILEYS_PKG}@${BAILEYS_VER}\`
(repo \`Otakump4/boruto_vk7-baileys\`). Ele **substitui** o \`@innovatorssoft/baileys@7.4.7\`
das versões anteriores e é dele que vêm os contratos de \`shop\`/\`payment\`/
\`viewOnce\` desta spec. O pacote tem **quatro armadilhas de empacotamento** que
já foram diagnosticadas em ambiente real (Node 22 + npm 10); se você não as
conhecer, vai achar que o projeto está errado e vai perder horas.

**Receita que funciona** (nesta ordem, e só esta):

\`\`\`bash
# 1) o pacote em si — --ignore-scripts é OBRIGATÓRIO
npm i ${BAILEYS_PKG}@${BAILEYS_VER} --ignore-scripts --legacy-peer-deps
# 2) o libsignal que ele exige sob um nome que NÃO existe no npm — alias OBRIGATÓRIO
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" \\
      --ignore-scripts --legacy-peer-deps
\`\`\`

| # | Armadilha | Sintoma | Por quê |
|---|---|---|---|
| 1 | \`preinstall\` quebra | \`Cannot find module '.../engine-requirements.js'\` e a instalação aborta | o \`package.json\` publicado declara \`"preinstall": "node ./engine-requirements.js"\`, mas o arquivo só existe dentro de \`baileys/\` no tarball. Daí o \`--ignore-scripts\` |
| 2 | \`main\` aponta para arquivo inexistente | \`MODULE_NOT_FOUND\` ao importar a raiz do pacote | o \`package.json\` diz \`"main": "lib/index.js"\`, mas o tarball publica o monorepo: a lib real está em \`baileys/lib/\` |
| 3 | import de diretório | \`ERR_UNSUPPORTED_DIR_IMPORT\` (o \`type: module\` do projeto nem cai na regra de CJS) | o pacote não tem \`exports\` map e o \`package.json\` aninhado tem \`"main"\` — ESM não resolve diretório sozinho. **Caminho canônico:** \`${BAILEYS_PKG}/${BAILEYS_SUBPATH}\` |
| 4 | libsignal renomeado | \`Cannot find module '@boruto_vk7/libsignal-node'\` em \`baileys/lib/Signal/libsignal.js\` (7 ocorrências) | o fork renomeou o pacote sem publicá-lo. Alias para \`@itsukichan/libsignal-node@1.0.1\` (mesmo código, nome publicado) |

**E o \`.npmrc\` do projeto** (incluído no bundle) já fixa as duas flags acima:

\`\`\`
ignore-scripts=true
legacy-peer-deps=true
\`\`\`

Com ele presente, \`npm i\` basta. Se você criar o projeto do zero sem o arquivo,
use as linhas com flags explícitas — ou o \`npm i\` aborta no \`preinstall\` e você
vai perder 20 minutos lendo stack trace de MODULE_NOT_FOUND.

**Regra de import (inegociável):** o \`default\` export deste pacote é o
**namespace**, não a função (diferente do \`@whiskeysockets\`, onde default **é**
\`makeWASocket\`). Então:

\`\`\`js
// ❌ NÃO: default é o objeto inteiro, isso vira "makeWASocket is not a function"
import makeWASocket from "${BAILEYS_PKG}/${BAILEYS_SUBPATH}"
// ✅ SIM: named import
import { makeWASocket, useMultiFileAuthState, proto, getContentType }
    from "${BAILEYS_PKG}/${BAILEYS_SUBPATH}"
\`\`\`

É exatamente por isso que existe **um único ponto de import** no projeto:
\`connection/baileysCompat.js\` (24 linhas) faz \`import * as baileys\`, escolhe a
função com \`typeof baileys.default === "function" ? baileys.default : baileys.makeWASocket\`
e re-exporta tudo. **Nenhum outro arquivo importa a lib** (verificado com
\`grep\`: zero \`from "@innovatorssoft/baileys"\` fora do shim; as ~12 menções ao
nome do pacote em outros arquivos são comentários). Trocar de fork é mudar
**uma linha** nesse arquivo — foi o que este build fez.

**O que o shim precisa fazer neste build** (o fonte anexado já está assim ou deve
ficar):

\`\`\`js
// connection/baileysCompat.js — linha 1
import * as baileys from "${BAILEYS_PKG}/${BAILEYS_SUBPATH}"
\`\`\`

E os comentários que ancoram comportamento em número de linha do fork antigo
precisam ser reancorados (são só comentários, não código): \`shop\` agora está em
\`baileys/lib/Utils/messages.js:1020\` (era \`~1374\`), \`viewOnce\` em
\`messages.js:1197\`, payment em \`messages.js:725-753\` (montagem) e
\`1247-1249\` (decodificação). Arquivos com esses comentários:
\`features/flood/config.js\`, \`features/flood/presets/shopping.js\`,
\`features/flood/{shopping,payment,tests,commerce}.js\`,
\`features/flood/README.md\`, \`services/{groupService,interactiveService,list,bloksTransport}.js\`.

**O que NÃO muda** (por isso o resto da spec vale igual): os contratos de payload.
\`Utils/messages.js\` continua fazendo \`else if ('shop' in message && !!message.shop)\`
→ \`interactiveMessage.shopStorefrontMessage { surface, id }\`, e continua
embrulhando em \`viewOnceMessage\` quando \`viewOnce\` é true — as duas regras da
spec (card sem \`viewOnce\`, e \`surface ∈ {1,2,3}\`) permanecem exatas.

**Inventário de APIs verificado em runtime** (253 exports no total). Todos os 25
métodos que o SYZYGY chama existem neste fork:

\`\`\`
✓ sendMessage   ✓ query      ✓ sendNode        ✓ relayMessage      ✓ end
✓ groupMetadata ✓ groupFetchAllParticipating   ✓ groupSettingUpdate  ✓ groupParticipantsUpdate
✓ groupUpdateSubject         ✓ groupUpdateDescription              ✓ groupGetInviteInfo
✓ updateProfilePicture       ✓ removeProfilePicture  ✓ profilePictureUrl
✓ getCatalog    ✓ getCollections  ✓ updateStatusPrivacy  ✓ getPrivacyTokens
✓ refreshMediaConn ✓ presenceSubscribe ✓ sendPresenceUpdate ✓ getUSyncDevices
✓ requestPairingCode ✓ generateMessageTag ✓ waitForMessage
\`\`\`

Ausências que importam (não chame, não existe): \`statusUpdate\`, \`updateStatus\`,
\`fetchStatusSessions\`, \`groupLeave\`, \`groupAdd\`, \`jids\`, \`Delay\`,
\`prepareMessageToEncode\`, \`fetchLatestWAVersion\`, \`isJidBareEphemeral\`.
Consequências: (a) Status Manager publica story com \`sock.sendMessage\` para
\`status@broadcast\` + \`updateStatusPrivacy\` (é o que o fonte faz; não invente
\`statusUpdate\`); (b) exportar/ajudar os outros do grupo é via
\`groupParticipantsUpdate\` (\`"remove"\`/\`"add"\`), não \`groupLeave\`; (c) se um
módulo seu precisar de \`Delay\`, implemente \`const Delay = ms => new Promise(r =>
setTimeout(r, ms))\` localmente.

Detalhes de versão: o fork pinou WhatsApp \`[2, 3000, 1026924051]\`
(\`baileys/lib/Defaults/baileys-version.json\`, lido por \`Defaults.version\`),
\`engines.node >= 20\`, peer \`jimp ^0.22.12\` (só usado em \`updateProfilePicture\`;
o SYZYGY faz o próprio resize com \`jimp@^1.6\` — não baixe o jimp do peer), e as
dependências próprias dele são \`@adiwajshing/keyed-db ^0.2.4\`, \`@hapi/boom ^14.0.1\`,
\`aws4fetch ^1.0.20\`, \`axios ^1.7.9\`, \`cache-manager ^5.7.6\`, \`@cacheable/node-cache ^1.5.4\`,
\`link-preview-js ^3.0.5\`, \`pino ^9.6.1\`, \`protobufjs ^7.12.6\`.

⚠️ \`pino ^9.6.1\` lá, \`pino ^10.3.1\` aqui. Não tente "alinhar": o SYZYGY declara o
seu e o npm resolve dois (o do projeto no topo, o do fork no subtree). Ambos aceitam
\`pino({level:"silent"})\`, que é o único uso que importa aqui.

⚠️ NÃO instale 2.0.0/2.0.1/2.0.2: os tarballs dessas versões saíram **sem \`lib/\`**
(o pacote é vazio e nada importa). \`2.1.0\` é a única versão usável. Antes de
escrever qualquer código, valide com:

\`\`\`bash
node --input-type=module -e 'import("👉ESPEC👈").then(m=>console.log(typeof m.makeWASocket))'
# deve imprimir "function". Se imprimir "object" ou der ERR_* → pare e reporte.
\`\`\`

Se a instalação da lib falhar, **não** troque por \`@whiskeysockets/baileys\` "só para
testar": o card de loja que este projeto renderiza depende do \`shop\`/
\`shopStorefrontMessage\` que só existem no fork. Nesse caso, reporte a falha com a
saída do npm.


### 2.2 Arquivos que NÃO vêm no bundle (e o que fazer com eles)

O bundle da Parte B é o código real, arquivo por arquivo. Estão de fora, de propósito:

| Caminho | Por quê | O que você deve gerar |
|---|---|---|
| \`config.json\` | contém número real do dono e allowlist | crie do zero pelo schema da seção 7 (e o wizard 12-46); **nunca** invente um número de teste — deixe vazio e o wizard pergunta |
| \`dono/**\` | estado runtime do dono (fila, kill switch, histórico, presets gravados) | crie os JSONs vazios com a forma que os módulos esperam; eles são escritos em runtime, não versionados |
| \`sessao/**\`, \`log/**\`, \`state/**\` | credenciais reais da sessão WhatsApp e logs | não crie; gerados no primeiro \`--pair <numero>\` |
| \`package-lock.json\` | 425 KB de hashes sem valor de spec | \`npm i\` gera o seu |
| \`legacy/**\` | implementações mortas, que NÃO devem ser ressuscitadas (o bundle já traz os arquivos que vieram deles) | nada — só não copie de volta |
| \`AUDITORIA-SYZYGY.md\`, \`PROMPT-RECONSTRUCAO-SYZYGY.md\` | prosa de engenharia reversa; a Parte A substitui | nada |
| \`tools/gerar-prompt-build.mjs\` | este gerador | recrie se você for re-sincronizar o bundle depois (opcional) |
| qualquer número de telefone / JID real | segredo | os placeholders \`5519XXXXXXXXX\` e \`XXXX@g.us\` do bundle são esperados: substitua pelo que o dono informar |

### 2.3 Protocolo de transplante (como usar a Parte B sem estragar o projeto)

A Parte B não é "material de leitura": é o contrato. Siga estas 9 regras:

1. **Copie antes de inventar.** Para cada arquivo da lista, crie o arquivo com o
   conteúdo exato do bloco correspondente. Só escreva código seu onde o bloco não
   existe (ex.: \`config.json\`, \`dono/*.json\`, os JSONs de estado).
2. **Não "melhore" de graça.** Nada de renomear função, trocar \`for\` por
   \`reduce\`, introduzir TypeScript, ESLint, \`dotenv\`, ORM, framework de bot,
   fila externa (BullMQ/Redis), Docker ou qualquer dependência nova. O projeto tem
   3 dependências de propósito (\`jimp\`, \`pino\`, + a Baileys via alias) e estado em
   JSON puro.
3. **Não restaure o \`legacy/\`** (nem os blocos comentados "legado vivo" que a
   auditoria descreve: 5 rotas mortas de menu, callbacks órfãos, listeners
   duplicados, o \`index.js\` de 678 linhas com engine paralelo). Eles ficaram fora
   do bundle de propósito — se um arquivo seu importa algo que não existe no
   bundle, você errou o import, não o legado.
4. **Nomes, ids e atalhos são imutáveis.** Os ~65 atalhos de \`commands/commandMap.js\`
   (\`2>\`, \`6>12\`, \`15>\`, \`36>4\`, \`shoppingtest\`, \`floodstop\`, …), os rótulos de menu,
   os \`menuCategoryId\`, os \`actionId\` (\`AAAE:<slug>\`) e os \`state.action\` do wizard
   são o produto. Mudar um = quebrar usuário que já decorou. Engine interno você
   pode tocar; superfície, não.
5. **Um único \`sock.sendMessage\`.** O wrap de Ler Mais (tamanho-alvo 512 +
   "… Ler Mais" aninhado) já está em \`connection/whatsapp.js\`; nada de
   "encurtador" paralelo em serviço, nem segundo \`sendMessage\` no caminho.
6. **Imports da lib só pelo shim.** \`connection/baileysCompat.js\` é o único ponto
   que conhece o nome do pacote da Baileys (seção 2.1). Qualquer \`from
   "@lucasmod/..."\` aparecendo em outro arquivo é defeito de reconstrução —
   inclusive o seu, se você for tentado a "importar direto para simplificar".
7. **Comentário com número de linha é âncora, não decoração.** Onde o fonte diz
   \`messages.js:1020\` (neste fork), signifique que o comportamento do card vem
   dali. Se você mudar de fork de novo, reancore os comentários — e re-verifique
   o contrato, não só o número.
8. **Testes são parte do pacote.** Vêm no bundle e são o seu critério de pronto:
   \`features/flood/tests.js\` (shopping/flood/payload — 184 asserts, incluindo o
   bloqueio de contrato lido do \`messages.js\` do fork instalado),
   \`features/flood/tests-menu.js\` (menus e atalhos — 83),
   \`features/flood/tests-infra.js\` (presets, overlays de payment, kill switch,
   cooldown — 228) e \`features/viewOnce/tests.js\`. Não existe \`tests-payment.js\`:
   as asserções de pagamento estão na suíte de infra. Rode os 4 e cole a saída no
   relatório final.
   Eles são 100% offline: nulo o socket, \`salvarConfig\` fora do caminho,
   \`process.exitCode\` em falha. Não os enfraqueça para passar.
9. **Verificação mínima antes de reportar** (do bundle, na raiz do projeto novo):

\`\`\`bash
npm i @lucasmod/boruto-vk7-baileys@2.1.0 --ignore-scripts --legacy-peer-deps
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps
for f in $(find . -name "*.js" -not -path "./node_modules/*"); do node --check "$f" || echo "SINTAXE: $f"; done
node --input-type=module -e 'import("@lucasmod/boruto-vk7-baileys/baileys/lib/index.js").then(m=>console.log("makeWASocket:",typeof m.makeWASocket,"| proto:",!!m.proto))'
node --input-type=module -e 'import("./connection/baileysCompat.js").then(m=>console.log("shim:",typeof m.default))'
node features/flood/tests.js && node features/flood/tests-menu.js
node features/flood/tests-infra.js && node features/viewOnce/tests.js
\`\`\`

\`shim: function\` é o ponto que prova que a camada de compatibilidade absorveu a
troca de default-export. Se der \`object\`, o shim não foi aplicado (seção 2.1).

**O que reportar no final (e o que NÃO dizer):** card de loja, pagamento
transferido e viewOnce **não têm como ser provados aqui** — dependem de aparelho
real. A frase correta é "payload conforme \`proto\`, renderização não testada em
app", nunca "funciona". Também não diga que o bot "está no ar": o boot real exige
\`sessao/\` + QR e isso é passo do usuário.

`

// ── 4. montagem ──────────────────────────────────────────────────────────────
const arquivos = listar()
let linhasTotal = 0, bytesTotal = 0
const blocos = []
const redacoes = []

for (const rel of arquivos) {
    const abs = path.join(RAIZ, rel)
    const bruto = fs.readFileSync(abs, "utf8")
    const limpo = mascarar(bruto)
    if (limpo !== bruto) {
        redacoes.push(rel)
        for (const real of achouSegredo(bruto)) {
            const n = bruto.split(real).length - 1
            console.warn(`[redação] ${rel}: ${real} → ${real.includes("@") ? FAKE_GRUPO : FAKE_TEL} (${n}×)`)
        }
    }
    const n = bruto.split("\n").length
    linhasTotal += n
    bytesTotal += Buffer.byteLength(bruto)
    const ext = path.extname(rel).replace(".", "")
    const lang = ext === "mjs" || ext === "cjs" ? "js" : (ext || "text")
    // cercas dentro do conteúdo exigem cerca de nível superior
    const fence = limpo.includes("```") ? "````" : "```"
    blocos.push(
        `#### \`${rel}\` — ${n} linhas, ${Buffer.byteLength(bruto)} bytes\n\n` +
        `${fence}${lang}\n${limpo}\n${fence}\n`
    )
}

const specAbs = path.join(RAIZ, SPEC)
let spec = fs.existsSync(specAbs) ? fs.readFileSync(specAbs, "utf8") : ""
if (!spec) throw new Error(`spec base ausente: ${SPEC}`)
for (const [de, para] of PATCHES_SPEC) {
    if (!spec.includes(de)) console.warn(`[patch não aplicado — trecho não encontrado] ${de.slice(0, 60)}`)
    spec = spec.replace(de, para)
}
// insere a seção da Baileys depois do bloco de stack (antes de "## 3.") e
// normaliza o placeholder que a spec usa para "número mascarado".
const ANCORA = "\n## 3. "
if (spec.includes(ANCORA)) spec = spec.replace(ANCORA, "\n" + SEC_MIGRACAO + "\n---\n" + ANCORA)
else { console.warn("[aviso] âncora '## 3.' não achada; seção 2.1 vai para o fim da Parte A"); spec += SEC_MIGRACAO }
spec = spec.replaceAll("5519XXXXXXXXX", FAKE_TEL).replaceAll("XXXXXXX-XXXXXXXXX@g.us", FAKE_GRUPO)
spec = spec.replace("👉ESPEC👈", `${BAILEYS_PKG}/${BAILEYS_SUBPATH}`)
spec = mascarar(spec)

const cabecalho = `# SYZYGY 2.0 — PROMPT DE BUILD (especificação + código-fonte)

> **Isto é o prompt completo.** A Parte A é a especificação; a Parte B é o
> código-fonte real de referência, arquivo por arquivo. Nada aqui depende de
> repositório, git ou link externo: você tem tudo que precisa neste arquivo.
>
> **Sua missão:** implementar um bot de WhatsApp (WhatsApp + Node.js + Baileys)
> que reaja a texto **e** a menus numerados sequenciais, com o mesmo contrato de
> interação, as mesmas permissões e o mesmo motor de automação descritos aqui.
>
> **Três regras de ouro:**
> 1. **A Parte B é a verdade mecânica.** Quando a prosa da Parte A e um arquivo
>    da Parte B divergirem, o arquivo vence — ele é código que roda.
> 2. **Não use git nem procure o repositório.** Não existe. Está tudo aqui.
> 3. **Não inicie o bot nem dispare flood/nuke/roubo real.** Sem WhatsApp
>    configurado você não pode testar efeito em aparelho; faça verificações
>    estáticas (\`node --check\`, import graph, as suítes de teste que também estão
>    aqui) e diga explicitamente o que ficou sem prova de runtime.
>
> **Onde este build é diferente do original de 2024-11:** o pacote de WhatsApp é
> \`${BAILEYS_PKG}@${BAILEYS_VER}\` (não o \`@innovatorssoft/baileys@7.4.7\` antigo)
> e ele **não instala com \`npm i\` liso** — leia a seção **2.1** antes de tudo.
> Os contratos de payload (card de loja, pagamento, viewOnce) são idênticos.

| campo | valor |
|---|---|
| bundle gerado por | \`tools/gerar-prompt-build.mjs\` (rode-o para re-sincronizar) |
| especificação base | \`${SPEC}\` |
| arquivos de fonte incluídos | ${arquivos.length} |
| linhas de fonte incluídas | ${linhasTotal} |
| tamanho do apêndice | ${(bytesTotal / 1024).toFixed(0)} KB |
| segredos | removidos — ${redacoes.length ? `redações aplicadas em: ${redacoes.join(", ")}` : "nenhum número/JID real presente"} |
| estado do projeto quando este bundle foi feito | AB7 v51 — Baileys trocada para \`${BAILEYS_PKG}@${BAILEYS_VER}\`, \`connection/baileysCompat.js\` reancorado, \`.npmrc\` de instalação criado; suítes verdes: shopping 184 · menu 83 · infra 228 · viewOnce ✓ |
| divergência conhecida do fork novo | o ramo combinado \`nativeFlow+shop\` (que punha \`shopStorefrontMessage.messageVersion = 1\`) não existe aqui ⇒ modo \`flow\` degenera em \`puro\`; \`viewOnce: true\` embrulha em \`viewOnceMessageV2\` (antes \`viewOnceMessage\`) — em ambos os casos a regra é a mesma: nunca mandar \`viewOnce\` no card de loja |

---
`

const corpo = [
    cabecalho,
    "\n# PARTE A — ESPECIFICAÇÃO\n",
    spec.replace(/^# [^\n]*\n/, ""),   // tira o H1 duplicado da spec base
    "\n---\n\n# PARTE B — CÓDIGO-FONTE DE REFERÊNCIA\n",
    `Estes ${arquivos.length} arquivos são o projeto real, na ordem em que devem ser
lidos/criados. Copiar é permitido e desejado: cada linha aqui já foi validada em
produção. Onde um arquivo mencionar número/JID como \`5519XXXXXXXXX\`, é redação
intencional deste bundle (ver 2.2), não bug.\n\n`,
    "### Índice\n\n",
    blocos.map((b, i) => `${i + 1}. ${b.match(/#### `([^`]+)`/)[1]}`).join("\n"),
    "\n\n",
    blocos.join("\n"),
    "\n---\n\n# FIM DO BUNDLE\n\nDepois de montar o projeto: rode as três suítes de teste\ndo bundle (\`features/flood/tests*.js\`, \`tests-menu.js\`, \`tests-payment.js\`) e o\nchecklist de smoke da Parte A. Não declare sucesso por render de card de loja,\npagamento ou viewOnce sem prova em aparelho real.\n",
].join("")

if (process.argv.includes("--verify")) {
    const doc = fs.readFileSync(SAIDA, "utf8")
    const re = /^#### `([^`]+)` — [\d,]+ linhas, [\d,]+ bytes\n\n(`{3,4})\w*\n([\s\S]*?)\n\2$/gm
    const vistos = new Map()
    let m, ok = 0, bad = []
    while ((m = re.exec(doc))) {
        vistos.set(m[1], m[3])
        const real = mascarar(fs.readFileSync(path.join(RAIZ, m[1]), "utf8")).replace(/\s+$/, "")
        if (real === m[3].replace(/\s+$/, "")) ok++
        else bad.push(m[1])
    }
    const faltando = arquivos.filter(a => !vistos.has(a))
    console.log(`verificação: ${ok}/${arquivos.length} blocos idênticos ao fonte`)
    if (bad.length) console.log("DIFEREM:", bad.join(", "))
    if (faltando.length) console.log("AUSENTES NO DOC:", faltando.join(", "))
    for (const [p2, n] of SEGREDOS) if (doc.includes(p2)) console.log(`⚠️ SEGREDO VAZADO NO DOC: ${p2}`)
    process.exit(bad.length || faltando.length ? 1 : 0)
}

process.argv.includes("--check")
    ? console.log(JSON.stringify({ arquivos: arquivos.length, linhas: linhasTotal, bytes: bytesTotal, redacoes }, null, 1))
    : (fs.writeFileSync(SAIDA, corpo), console.log(
        `SYZYGY-PROMPT-BUILD.md: ${arquivos.length} arquivos, ${linhasTotal} linhas de fonte, ` +
        `${(Buffer.byteLength(corpo) / 1024).toFixed(0)} KB total, ${redacoes.length} arquivo(s) redigido(s).`
    ))
