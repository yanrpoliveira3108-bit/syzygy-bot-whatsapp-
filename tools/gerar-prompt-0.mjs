#!/usr/bin/env node
// tools/gerar-prompt-0.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Gera `SYZYGY-PROMPT-0.md`: UM prompt, escrito do zero, para colar em outro
// agente (arena.ai / Claude / GPT / Gemini) e ele construir o bot SYZYGY sem
// ter o repositório. Diferença em relação ao SYZYGY-PROMPT-BUILD.md (o espelho
// byte-a-byte, 900 KB, pesado de abrir): este arquivo é o PROMPT — cabe em um
// orçamento de KB (default 260), com as tabelas de comandos e menus GERADAS do
// código real, os contratos críticos inline e, para o que ficou de fora, a
// assinatura exata de cada exportação.
//
// Tudo aqui é lido do fonte: nada de número "de cabeça".
//   • TEXT_TO_ACTION   ← commands/commandMap.js      (comandos de texto)
//   • CONFIG_OPCOES    ← menus/configMenu.js         (numeração do painel)
//   • rótulos 1-11/12-NN ← CONFIG_ROTULOS_ADM/DONO (faixa derivada dos rótulos)
//   • FLOOD_PRESET_COMMANDS ← features/flood/router.js (atalhos de preset)
//   • presets/tipos/tetos ← features/flood/config.js
// Por isso o script faz parsing por matching de chaves + avaliação das
// literais (sem importar os módulos: importar menus/*/services/*/puxaria
// config.json e o socket, com efeito colateral em teste de doc).
//
// Uso:  node tools/gerar-prompt-0.mjs [--max-kb 260] [--check]
// ═══════════════════════════════════════════════════════════════════════════

import fs from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"

const RAIZ = path.resolve(import.meta.dirname, "..")
const SAIDA = path.join(RAIZ, "SYZYGY-PROMPT-0.md")
// Contagens das suítes: lidas RODANDO as suítes (offline por construção), nunca de
// cabeça — foi assim que o prompt ficou descrevendo 184/83/228 de uma v52 morta.
const SUITES = ["features/flood/tests.js", "features/flood/tests-infra.js", "features/flood/tests-menu.js"]
function rodarSuite(rel) {
    try {
        const t = execSync(`node ${rel} 2>&1`, { cwd: RAIZ, timeout: 120000, encoding: "utf8" })
        const todas = t.match(/^=== .*ok.*===$/gm) || t.match(/^=== (.+?) ===$/gm) || []
        const ultima = todas[todas.length - 1] || ""
        return ultima.replace(/^=+ /, "").replace(/ =+$/, "") || "(suíte sem linha de resumo)"
    } catch { return "(não rodou — confira manualmente)" }
}
const CONTAGENS = Object.fromEntries(SUITES.map(f => [f, rodarSuite(f)]))

const args = process.argv.slice(2)
const argVal = (nome, def) => {
    const i = args.indexOf(nome)
    return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def
}
const MAX_KB = argVal("--max-kb", 260)

const PKG_BAILEYS = "@lucasmod/boruto-vk7-baileys"
const VER_BAILEYS = "2.1.0"
const SPECIFIER = `${PKG_BAILEYS}/baileys/lib/index.js`

// ── utilidades de leitura ───────────────────────────────────────────────────
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8")
const linhas = (txt) => txt.split("\n").length
const existe = (rel) => { try { return fs.statSync(path.join(RAIZ, rel)).isFile() } catch { return false } }

/** Extrai o literal de `export const NOME = {...|[...]}` por matching de chaves. */
function literalExport(rel, nome) {
    const src = ler(rel)
    const ini = src.search(new RegExp(`export\\s+const\\s+${nome}\\s*=\\s*[\\[{]`))
    if (ini < 0) throw new Error(`${nome} não achado em ${rel}`)
    const abre = src.slice(ini).match(/[\\[{]/)[0]
    const fecha = abre === "{" ? "}" : "]"
    let i = src.indexOf(abre, ini), prof = 0, fim = -1
    for (; i < src.length; i++) {
        const c = src[i]
        if (c === abre) prof++
        else if (c === fecha) { prof--; if (prof === 0) { fim = i + 1; break } }
        else if (c === '"' || c === "'" || c === "`") {           // pula strings
            const q = c; i++
            while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++ }
        }
    }
    const bruto = src.slice(src.indexOf(abre, ini), fim)
    // literais do projeto usam aspas duplas e sem computação → eval direto é ok
    return Function(`"use strict";return (${bruto.replace(/\/\/[^\n]*/g, "")})`)()
}

/** Recorta o corpo de `export const NOME = { … }` (fecha na linha `}` isolada). */
function corpoObjeto(rel, nome) {
    const src = ler(rel)
    const ini = src.search(new RegExp(`export\\s+const\\s+${nome}\\s*=\\s*\\{`))
    if (ini < 0) return ""
    return src.slice(ini, src.indexOf("\n}", ini) + 2)
}

/** `{ k: "v", … }` aceitando chave com ou sem aspas e valor string ou número. */
function paresChaveValor(rel, nome) {
    const out = {}
    for (const m of corpoObjeto(rel, nome).matchAll(/(?:^|[,{])\s*"?([A-Za-z_$][\w$]*|\d+)"?\s*:\s*(?:"([^"]*)"|(\d+))/gm)) {
        out[m[1]] = m[2] ?? m[3]
    }
    return out
}

// ── máscaras de segredo (derivadas do estado real, nunca regex genérica) ────
const FAKE_TEL = "5519000000000"
const FAKE_GRUPO = "150000000000000000-1000000000@g.us"
function segredosReais() {
    const alvos = ["config.json"]
    try { for (const e of fs.readdirSync(path.join(RAIZ, "dono"))) if (e.endsWith(".json")) alvos.push(`dono/${e}`) } catch {}
    const tels = new Set(), gs = new Set()
    for (const a of alvos) {
        let t; try { t = ler(a) } catch { continue }
        for (const m of t.matchAll(/\b\d{8,20}(?:-\d{2,12})?@g\.us\b/g)) gs.add(m[0])
        for (const m of t.matchAll(/\b55\d{10,13}\b/g)) tels.add(m[0])
    }
    return [...tels].sort((a, b) => b.length - a.length).map(v => [v, FAKE_TEL])
        .concat([...gs].sort((a, b) => b.length - a.length).map(v => [v, FAKE_GRUPO]))
}
const SEGREDOS = segredosReais()
const MASCARAS_TEXTO = [
    [/https?:\/\/(?:chat\.)?whatsapp\.com\/[A-Za-z0-9+/-]+/g, "https://chat.whatsapp.com/<CODIGO_DO_GRUPO>"],
    [/\b\d{8,20}(?:-\d{2,12})?@g\.us\b/g, FAKE_GRUPO],
    [/\b55\d{10,13}(@s\.whatsapp\.net)?\b/g, (m, sufixo) => FAKE_TEL + (sufixo || "")],
]
const mascarar = (t) => {
    let s = SEGREDOS.reduce((acc, [real, fake]) => acc.split(real).join(fake), t)
    for (const [re, rep] of MASCARAS_TEXTO) s = s.replace(re, rep)
    return s
}

// ── 1. superfície de comandos (dado VIVO) ───────────────────────────────────
const TEXT_TO_ACTION = paresChaveValor("commands/commandMap.js", "TEXT_TO_ACTION")
const CONFIG_OPCOES = paresChaveValor("menus/configMenu.js", "CONFIG_OPCOES")
const ROT_ADM = literalExport("menus/configMenu.js", "CONFIG_ROTULOS_ADM")
const ROT_DONO = literalExport("menus/configMenu.js", "CONFIG_ROTULOS_DONO")
const FLOOD_CMDS = paresChaveValor("features/flood/router.js", "FLOOD_PRESET_COMMANDS")
const FLOOD_TEST_PRESET = paresChaveValor("features/flood/router.js", "FLOOD_TEST_ACTION_PRESET")
const HARD_CAP = paresChaveValor("features/flood/config.js", "FLOOD_PRESET_HARD_CAP")
const TIPOS = (() => {
    const src = ler("features/flood/config.js")
    const m = src.match(/export const FLOOD_PRESET_TYPES\s*=\s*\[([^\]]*)\]/)
    return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : []
})()
const MODOS_FLOOD = (() => {
    const bloco = corpoObjeto("utils/config.js", "FLOOD_MODOS")
    const out = {}
    for (const m of bloco.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
        const b = m[2]
        out[m[1]] = {
            label: (b.match(/label:\s*"([^"]*)"/) || [])[1] || "—",
            intervalo: (b.match(/intervalo:\s*(\d+)/) || [])[1] || "—",
            lote: (b.match(/lote:\s*(\d+)/) || [])[1] || "—"
        }
    }
    return out
})()
const MAX_FLOOD = (ler("utils/config.js").match(/MAX_FLOOD\s*=\s*(\d+)/) || [])[1] || "?"
const FAIXA_DONO = (() => {
    const ns = (ROT_DONO || []).map(([n]) => Number(n)).filter(Number.isFinite)
    return ns.length ? `${Math.min(...ns)}-${Math.max(...ns)}` : "?"
})()
const ROTULO_POR_ACAO = {}
for (const [n, acao] of [...ROT_ADM, ...ROT_DONO]) ROTULO_POR_ACAO[acao] = `${n} — ${acao}`

// ── presets: os registrados no fonte (gerais + loja). Presets CUSTOM do dono
// vivem em dono/presets/*.json (estado de runtime, fora do bundle) — por isso a
// tabela abaixo é "os presets padrão", não "todos os presets que existirão".
function presetsConhecidos() {
    const out = []
    const geral = corpoObjeto("features/flood/config.js", "FLOOD_GENERAL_PRESETS")
    for (const m of geral.matchAll(/"(\w[\w-]*)":\s*\{([\s\S]*?)\n\s*\}/g)) {
        const b = m[2]
        const g = (re) => (b.match(re) || [])[1] || "—"
        out.push({
            id: m[1], tipo: g(/type:\s*"([^"]+)"/), texto: g(/(?:text|caption):\s*"([^"]*)"/),
            alvo: g(/targetMode:\s*"([^"]+)"/), max: g(/maxMessages:\s*(\d+)/),
            intervalo: g(/interval:\s*(\d+)/), cooldown: g(/cooldown:\s*(\d+)/),
            arquivo: "features/flood/config.js"
        })
    }
    return out
}

// estados do wizard: o que `handlers/stateHandler.js` realmente roteia
function acoesWizard() {
    const src = ler("handlers/stateHandler.js")
    const set = new Set()
    for (const m of src.matchAll(/\bst\.action === "([a-z_0-9]+)"/g)) set.add(m[1])
    return [...set].sort()
}
const ACOES_WIZARD = acoesWizard()
const tWizard = (() => {
    const grupos = {}
    for (const a of ACOES_WIZARD) {
        const pref = a.split("_")[0]
        ;(grupos[pref] ||= []).push(a)
    }
    return Object.entries(grupos)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([pref, arr]) => `**\`${pref}_*\` (${arr.length})** — ${arr.map(x => `\`${x}\``).join(", ")}`)
        .join("\n\n")
})()

// inventário completo (nada fica invisível no prompt)
function inventario() {
    const IGN = new Set(["node_modules", ".git", "tmp", "log", "state", "sessao", "dono", "legacy", "patches", "tools"])
    const out = []
    const walk = (abs, rel) => {
        const st = fs.statSync(abs)
        if (st.isDirectory()) {
            for (const e of fs.readdirSync(abs).sort()) {
                if (IGN.has(e) || (e.startsWith(".") && ![".gitignore", ".npmrc"].includes(e))) continue
                walk(path.join(abs, e), rel ? `${rel}/${e}` : e)
            }
            return
        }
        if (!/\.(js|mjs|sh|json|md)$/.test(e0(rel))) return
        if (["package-lock.json", "PROMPT-RECONSTRUCAO-SYZYGY.md", "SYZYGY-PROMPT-BUILD.md", "SYZYGY-PROMPT-0.md", "AUDITORIA-SYZYGY.md", "config.json"].includes(e0(rel))) return
        out.push(rel)
    }
    const e0 = (r) => r.split("/").pop()
    walk(path.join(RAIZ, "."), "")
    return out
}
const INV = inventario()

// ── 2. seleção do apêndice (por prioridade, até MAX_KB) ─────────────────────
// Tier 1 = o que não é derivável de prosa (contratos de wire, segurança,
// superfície). Tier 2 = implementações que a outra IA pode reconstruir a partir
// dos contratos, mas que vale anexar se couber. Tier 3 = só assinatura.
const TIER1 = [
    "package.json", ".npmrc", ".gitignore",
    "index.js",
    "connection/baileysCompat.js", "connection/socket.js", "connection/whatsapp.js",
    "connection/sessionRecovery.js", "connection/pairing.js",
    "utils/config.js", "utils/permissions.js", "utils/stateManager.js", "utils/lerMais.js", "utils/logger.js",
    "commands/commandMap.js", "commands/commandRouter.js",
    "handlers/messageHandler.js", "handlers/interactionHandler.js",
    "features/flood/config.js", "features/flood/payment.js", "features/flood/targets.js", "features/flood/groups.js",
    "features/flood/limiter.js", "features/flood/killswitch.js", "features/flood/router.js",
    "features/flood/presets/index.js", "features/flood/presets/text.js", "features/flood/presets/mention.js",
    "features/flood/presets/media.js", "features/flood/presets/payment.js", "features/flood/presets/custom.js",
    "menus/configMenu.js",
    "services/groupService.js",
    "features/flood/doctor.mjs",
]
const TIER2 = [
    "handlers/stateHandler.js", "handlers/terminal.js",
    "services/fastParser.js", "services/interactiveService.js", "services/buttons.js", "services/list.js",
    "services/interactiveList.js", "services/lidResolver.js", "services/agendaService.js",
    "services/bloksTransport.js", "services/mediaService.js", "services/antiTakeoverService.js",
    "services/historicoService.js", "services/notificationService.js", "services/presetService.js",
    "services/serverInspector.js",
    "menus/menu.js", "menus/mainMenu.js", "menus/groupMenu.js", "menus/adminMenu.js", "menus/menutest.js",
    "features/flood/index.js", "features/flood/speed.js", "features/flood/presetEngine.js",
    "features/flood/customStore.js", "features/flood/queue.js",
    "features/flood/tests.js", "features/flood/tests-infra.js", "features/flood/tests-menu.js",
    "utils/menuArt.js",
    "features/viewOnce/config.js", "features/viewOnce/index.js", "features/viewOnce/handler.js",
    "features/viewOnce/permissions.js", "features/viewOnce/service.js", "features/viewOnce/destinations.js",
    "features/statusManager/config.js", "features/statusManager/index.js", "features/statusManager/presets.js",
    "features/statusManager/service.js",
    "actions/configActions.js", "actions/floodActions.js", "actions/groupActions.js",
    "utils/botoes.js", "utils/terminalUI.js",
    "start.sh", "update.sh", "recover.sh",
    "features/flood/README.md",
]

/** Cabeçalho-comentário do arquivo (as regras que o autor deixou no topo). */
function cabecalhoComentario(rel, max = 55) {
    const src = ler(rel).replace(/^\/\/ [^\n]*\n/, "")   // pula a linha do próprio caminho
    const l = src.split("\n")
    const out = []
    for (const x of l) {
        if (out.length >= max) break
        if (x.startsWith("//")) out.push(x)
        else if (x.trim() === "" && out.length) out.push(x)
        else if (out.length === 0) continue
        else break
    }
    while (out.length && out[out.length - 1].trim() === "") out.pop()
    return out.join("\n")
}

/** Âncoras de roteamento: nomes de ação que o arquivo compara/mapeia, com linha. */
function ancoras(rel) {
    const src = ler(rel)
    const achados = new Map()
    const RES = [
        /(?:st|state)\.action\s*===\s*"([a-z_0-9]+)"/g,
        /case\s+"([a-z_0-9]+)"/g,
        /^\s{4}(?:async\s+)?function\s+(handle[A-Z]\w*)/gm,
        /"([a-z_0-9]+)":\s*(?:async\s+)?(?:handle|on)[A-Z]/g,
    ]
    for (const re of RES) {
        for (const m of src.matchAll(re)) {
            const n = src.slice(0, m.index).split("\n").length
            if (!achados.has(m[1])) achados.set(m[1], n)
        }
    }
    return [...achados.entries()].sort((a, b) => a[1] - b[1]).map(([n, ln]) => `\`${n}\`:${ln}`).join(" · ")
}

function apiAssinaturas(rel) {
    const src = ler(rel)
    const re = /^export\s+(?:async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)\s*(\([^)]{0,160}\))?/gm
    const out = []
    for (const m of src.matchAll(re)) out.push(`export ${m[0].replace(/^export\s+/, "").replace(/\s+/g, " ").trim()}`)
    return out
}

const todos = [...TIER1, ...TIER2].filter(existe)
const faltando = [...TIER1, ...TIER2].filter(r => !existe(r))
const caberia = []
let kb = 0
for (const rel of todos) {
    const peso = Buffer.byteLength(ler(rel)) / 1024
    if (kb + peso > MAX_KB) break
    kb += peso
    caberia.push(rel)
}
const deFora = todos.filter(r => !caberia.includes(r))
// Tier 1 nunca fica de fora: se estourar, a gente avisa em vez de truncar contrato.
const tier1Fora = TIER1.filter(r => existe(r) && !caberia.includes(r))
if (tier1Fora.length) console.warn(`⚠️ --max-kb ${MAX_KB} cortou TIER1: ${tier1Fora.join(", ")} — aumente o orçamento.`)

const tInventario = (() => {
    let linhasTot = 0
    const linhas = INV.map(rel => {
        const bruto = ler(rel)
        const n = linhas_(bruto)
        linhasTot += n
        const modo = caberia.includes(rel) ? "anexado (§9)" : /tests.*\.js$/.test(rel) ? "suíte (rode, não reescreva)" : "descrito (§10)"
        return `| \`${rel}\` | ${n} | ${modo} |`
    })
    return ["| arquivo | linhas | no prompt |", "|---|---|---|", ...linhas,
        `| **total** | **${linhasTot.toLocaleString("pt-BR")}** | ${caberia.length} anexados · ${deFora.length} descritos · suítes citadas |`].join("\n")
})()
function linhas_(t) { return t.split("\n").length }

// ── 3. blocos de código ─────────────────────────────────────────────────────
function bloco(rel) {
    const bruto = ler(rel)
    const corpo = mascarar(bruto)
    const fence = corpo.includes("```") ? "````" : "```"
    const lang = rel.endsWith(".sh") ? "bash" : rel.endsWith(".json") ? "json" : "js"
    const n = linhas(bruto)
    return `### ${rel} — ${n} linhas${kb_peso(bruto)}\n\n${fence}${lang}\n${corpo}\n${fence}\n`
}
const kb_peso = (t) => ` (${(Buffer.byteLength(t) / 1024).toFixed(1)} KB)`

// ── 4. tabelas ───────────────────────────────────────────────────────────────
const tComandos = (() => {
    const linhasTbl = ["| o que o usuário digita | ação interna (`actionId`) | o que faz |", "|---|---|---|"]
    const descricao = {
        menu_cancel: "sai do wizard/painel corrente (também `cancelar`)",
        menu_inicial: "reabre o menu principal",
        painel_listar_grupos: "1 — lista os grupos autenticados",
        painel_flood: "2 — painel de flood (escolha de grupo/modo)",
        painel_tudo: "3 — flood em todos os grupos autorizados",
        painel_roubar: "4 — painel de roubo/troca de dono",
        painel_dono: `5 — \`Comandos do Dono\` (faixa ${FAIXA_DONO})`,
        painel_config: "6 — `Configurações` (faixa 1-11)",
        status_menu: "7 — Status Manager (histórias)",
        painel_multi: "8 — flood multi-grupo por lote",
        owner_sair: "0 — desconecta/termina sessão",
        flood_kill_on: "para QUALQUER flood em andamento (kill switch)",
        flood_kill_off: "desliga o kill switch",
        painel_flood_presets: "35 — painel de presets (built-in + custom, tetos visíveis)",
        cfg_flood_targets: "36 — escolher os grupos-alvo do flood (a MESMA lista do flood normal)",
        cfg_flood_kill: "37 — kill switch (para o job em andamento e barra os próximos; persiste)",
        cfg_flood_speed: "38 — velocidade dos presets (1..4 ou intervalo custom 20-5000 ms)",
        cfg_flood_xray: "39 — raio-X do job (estado efetivo, nada escondido)",
        cfg_flood_tipo: "40 — tipo padrão do flood: texto ⇄ pagamento",
    }
    for (const [cmd, acao] of Object.entries(TEXT_TO_ACTION)) {
        const extra = descricao[acao]
            || ROTULO_POR_ACAO[acao]?.replace(/^\d+ — /, "opção de menu: ")
            || (acao.startsWith("flood_preset_") ? `roda o preset \`${FLOOD_TEST_PRESET[acao] || "?"}\` nos alvos escolhidos (sem seleção: recusa com \`NENHUM_ALVO\`)` : "ver §contratos")
        linhasTbl.push(`| \`${cmd}\` | \`${acao}\` | ${extra} |`)
    }
    return linhasTbl.join("\n")
})()

const tMenus = (() => {
    const render = (rotulos, titulo, nota) => {
        const l = [`**${titulo}**${nota ? ` (${nota})` : ""}`, "", "| nº | rótulo no menu | `actionId` roteado |", "|---|---|---|"]
        for (const [n, rot] of rotulos) l.push(`| ${n} | ${rot} | \`${CONFIG_OPCOES[n] || "—"}\` |`)
        return l.join("\n")
    }
    const l1 = render(ROT_ADM, "Painel Configurações — ADM (1-11)", "também por `6>n` e `01`…`11`")
    const l2 = render(ROT_DONO, `Painel Comandos do Dono (${FAIXA_DONO})`, "também por `5>n`; o último número da faixa volta ao menu")
    const voltar = Object.entries(CONFIG_OPCOES).filter(([, v]) => v === "abrir_painel").map(([n]) => `\`${n}\``)
    return `${l1}\n\n${l2}\n\n- ${voltar.join(" / ")} → \`abrir_painel\` (voltar). Números com rótulo mas sem ação no mapa = erro de paridade — os testes do projeto proíbem isso.\n- Número que já existiu e saiu (42-47 na v53) responde \`itemRemovido()\` — **nunca** silêncio e **nunca** reusado por opção nova.\n- Atalho derivado: \`numeroNavegacao(id)\` → \`NUM_CONFIG[id] >= 12 ? "5>"+n : "6>"+n\` (fonte: \`menus/menu.js\`).`
})()

const tAtalhos = [
    "| atalho | o que faz |", "|---|---|",
    ...Object.entries(FLOOD_CMDS).map(([a, b]) => `| \`${a}\` | ${b.replace(/"/g, "")} |`),
    "| `2/preset/<id>` | carrega e roda o preset `<id>` no grupo do painel (atalho direto, sem menu) |",
    "| `15>` | submenu de velocidade/intervalo do flood |",
    "| `36>4` | dentro do menu 36: rodar o preset nº 4 |",
].join("\n")

const tPresets = [
    "| preset (`id`) | tipo | texto/caption | alvo | máx | intervalo | cooldown | onde está definido |",
    "|---|---|---|---|---|---|---|---|",
    ...presetsConhecidos().map(p => `| \`${p.id}\` | ${p.tipo} | ${p.texto} | ${p.alvo} | ${p.max} | ${p.intervalo} ms | ${p.cooldown} ms | \`${p.arquivo}\`${p.extra ? ` (${p.extra})` : ""} |`),
    "",
    `Tipos aceitos: \`${TIPOS.join("\`, \`")}\`. Tetos por tipo (\`FLOOD_PRESET_HARD_CAP\`): ${Object.entries(HARD_CAP).map(([k, v]) => `\`${k}\`=${v}`).join(" · ")}. Teto global do flood: \`MAX_FLOOD = ${MAX_FLOOD}\`.`,
].join("\n")

const tModos = Object.entries(MODOS_FLOOD).length
    ? ["| `floodModo` | rótulo no menu | `intervalo` (ms) | `lote` |", "|---|---|---|---|",
    ...Object.entries(MODOS_FLOOD).map(([k, v]) => `| \`${k}\` | ${v.label} | ${v.intervalo} | ${v.lote} |`),
    "",
    "`floodJitter` vira `true` automaticamente só no modo `seguro`. `LOTE` efetivo no engine = `max(1, min(floodLote, 10))`. `uiMode`: `text` (default) | `buttons` | `list` | `bloks`, com `txt` aceito como alias; `uiModoEfetivo()` trata `bloks` como `text` para os menus (só o Server Inspector usa o transporte bloks)."].join("\n")
    : "_parse de `FLOOD_MODOS` vazio — confira `utils/config.js` manualmente_"

/** Árvore real: diretório → arquivo, LOC e a 1ª linha de descrição do próprio fonte. */
function arvoreGerada() {
    const IGN = new Set(["node_modules", ".git", "tmp", "log", "state", "sessao", "dono", "legacy", "tools"])
    const dirs = ["", "connection", "commands", "utils", "handlers", "services", "menus", "actions",
        "features/flood", "features/flood/presets", "features/viewOnce",
        "features/statusManager"].filter(d => fs.existsSync(path.join(RAIZ, d || ".")))
    const l = []
    for (const d of dirs) {
        const abs = path.join(RAIZ, d || ".")
        if (!fs.existsSync(abs)) continue
        const nomes = fs.readdirSync(abs).filter(e => {
            if (IGN.has(e) || (e.startsWith(".") && ![".gitignore", ".npmrc"].includes(e))) return false
            const full = path.join(abs, e)
            if (d === "" && !fs.statSync(full).isFile()) return false
            if (d === "" && fs.statSync(full).isFile() && !["index.js", "package.json", "start.sh", "update.sh", "recover.sh", "PROMPT-RECONSTRUCAO-SYZYGY.md", "SYZYGY-PROMPT-0.md", "SYZYGY-PROMPT-BUILD.md"].includes(e)) return false
            return /\.(js|mjs|sh|md|patch)$/.test(e)
        }).sort()
        if (!nomes.length) continue
        l.push(d ? `${d}/` : "./  (raiz)")
        for (const n of nomes) {
            const rel = d ? `${d}/${n}` : n
            if (["PROMPT-RECONSTRUCAO-SYZYGY.md", "SYZYGY-PROMPT-BUILD.md", "SYZYGY-PROMPT-0.md"].includes(n)) continue
            let bruto
            try { bruto = ler(rel) } catch { continue }
            const papel = (bruto.split("\n").slice(0, 4).find(x => /^\/\/ \[|^\/\/ [A-Z]/.test(x.trim()) && x.trim().length > 12) || "")
                .replace(/^\/\/\s*/, "").slice(0, 58)
            const mark = n.startsWith("tests") ? " [suíte]" : ""
            l.push(`  ${n.padEnd(24)} ${String(linhas(bruto)).padStart(4)} l${mark}${papel ? `  · ${papel}` : ""}`)
        }
    }
    return l.join("\n")
}

// ── 5. documento ────────────────────────────────────────────────────────────
const doc = `# SYZYGY 2.0 — PROMPT DE BUILD DO ZERO

Você vai implementar, do zero, um bot de WhatsApp em Node.js. Este arquivo é o
prompt **inteiro**: especificação + comandos + contratos + o código real de
referência. Não existe repositório para consultar, não procure git, não peça
link. Se faltar alguma coisa, escreva o módulo faltante e marque com
\`// TODO(nao-especificado):\` no topo e no relatório final.

## 0. Como trabalhar (leia antes de escrever qualquer linha)

1. **Ordem:** Fase 0 (esqueleto instala e importa) → 1 (conexão + texto puro) →
   2 (permissões/config) → 3 (menus numerados) → 4 (flood clássico) → 5 (wizard
   e presets) → 6 (payment como TIPO de conteúdo) → 7 (ataques de grupo) →
   8 (extras: ViewOnce, Status, Inspector, agenda) → 9 (scripts de deploy) →
   10 (aceite). Não existe "fase do shopping/card de loja": o tipo saiu da v53.
   Termine cada fase com a verificação dela e **pare para eu testar** só quando
   eu pedir; caso contrário, siga até o fim.
2. **Não inicie o bot.** Não há WhatsApp pareado aqui. Rode \`node --check\` e as
   suítes de teste (offline por construção; \`features/flood/doctor.mjs\` também é
   só leitura). Render de pagamento e visualização única **não tem como provar sem
   aparelho**: reporte como "payload conforme proto, render não testado" — nunca
   "funciona".
3. **Não dispare flood/nuke/roubo real.** Nenhum teste toca a rede: as suítes
   injetam socket falso e devolvem \`config.json\`/\`dono/historico.json\` byte a byte
   no \`finally\` (ação que persiste de propósito — \`37\` kill switch — é restaurada
   pelo teste, não gravada).
4. **Nada de dependência nova**: nem \`dotenv\`, nem framework de bot, nem
   Redis/BullMQ, nem TypeScript, nem ORM, nem Docker. Estado é JSON em disco.
5. **Nomes, ids e números são o produto.** Cada atalho, cada \`actionId\`, cada
   número de menu (\`${FAIXA_DONO}\` do dono, \`1\`-\`11\` do ADM) e cada chave de
   têm que ser **idênticos** aos que estão nas tabelas abaixo.
   Engine interno você pode reorganizar; superfície, não.
6. **Um único \`sock.sendMessage\`** com o wrap de "Ler Mais" já embutido na
   conexão. Segundo atalho de send = defeito.
7. **Se um contrato não fechar** (API que o fork não tem, payload que o cliente
   rejeita), detecte no runtime, avise no chat e deposite no relatório — não
   finja sucesso e não troque a Baileys por outra para "testar".
8. **Segredo:** os números \`${FAKE_TEL}\` e
   \`150000000000000000-1000000000@g.us\` são placeholders intencionais. Peça o
   número real ao usuário; não invente número de teste "de verdade".

## 1. Stack exata (e a Baileys deste build)

\`\`\`json
${mascarar(ler("package.json")).trim()}
\`\`\`

- **Runtime:** Node \`>=20\` (testado em 22), ESM puro (\`"type": "module"\`), sem build step.
- **Único logger:** \`pino\` com \`{ level: "silent" }\` — o resto imprime com
  \`utils/logger.js\` + \`utils/terminalUI.js\` (ANSI).
- **Imagem:** \`jimp ^1.6\` só para resize/formato do \`menuImage\` e da foto de grupo.
- **WhatsApp:** \`${PKG_BAILEYS}@${VER_BAILEYS}\` — fork não-oficial do Baileys
  (repo \`Otakump4/boruto_vk7-baileys\`). É **este** o pacote do projeto; não use
  \`@whiskeysockets\`, não use \`@innovatorssoft\` (era o anterior), não use o
  Baileys do npm oficial. Ele é a única fonte dos tipos \`shop\` (card de loja) e
  \`payment\` que o bot usa.

### 1.1 Instalação (4 armadilhas do empacotamento — verificadas em ambiente real)

\`\`\`bash
# com o .npmrc deste projeto, basta:
npm i
# do zero, sem .npmrc (as flags são obrigatórias, não cosméticas):
npm i ${PKG_BAILEYS}@${VER_BAILEYS} --ignore-scripts --legacy-peer-deps
npm i "@boruto_vk7/libsignal-node@npm:@itsukichan/libsignal-node@1.0.1" --ignore-scripts --legacy-peer-deps
\`\`\`

| # | o que acontece | por quê |
|---|---|---|
| 1 | \`npm i\` aborta com \`Cannot find module '.../engine-requirements.js'\` | o \`package.json\` publicado roda \`preinstall\` apontando para arquivo que só existe em \`baileys/\` no tarball ⇒ precisa de \`ignore-scripts=true\` |
| 2 | \`MODULE_NOT_FOUND\` no import da raiz | o \`main\` (\`lib/index.js\`) não existe na raiz: o tarball é o monorepo, a lib vive em \`baileys/lib/\` |
| 3 | \`ERR_UNSUPPORTED_DIR_IMPORT\` no \`import ".../${PKG_BAILEYS.split("/")[1]}"\` | sem \`exports\` map, ESM não resolve diretório ⇒ caminho explícito do arquivo |
| 4 | \`Cannot find module '@boruto_vk7/libsignal-node'\` (7 usos em \`lib/Signal/\`) | o fork renomeou o pacote e não publicou o nome ⇒ alias npm para \`@itsukichan/libsignal-node@1.0.1\` |

**Especificador canônico** (o único que resolve): \`${SPECIFIER}\`.
**Default export é o namespace, não a função** ⇒ use named import, ou (é o que o
projeto faz) importe só pelo shim:

\`\`\`js
// ❌ import makeWASocket from "${SPECIFIER}"   → makeWASocket vira objeto
// ✅ import { makeWASocket, useMultiFileAuthState, proto } from "${SPECIFIER}"
// ✅✅ projeto real: import makeWASocket, { ... } from "../connection/baileysCompat.js"
\`\`\`

\`connection/baileysCompat.js\` é o **único** arquivo que conhece o nome do pacote
(hoje 11 arquivos citam o pacote, mas **só** \`baileysCompat.js\` o importa — as
duas linhas \`import *\` e \`export *\`; os outros 10 são comentários/âncoras de
linha). Trocar de fork é uma linha nele. Rode \`grep -rn "boruto-vk7" --include=*.js
. | grep -c from\` e confirme que dá 1 arquivo.)

### 1.2 O que o pacote entrega (e o que você é proibido de chamar)

Contratos de payload verificados em \`baileys/lib/Utils/messages.js\` deste fork:

| comportamento | onde | regra que o SYZYGY segue |
|---|---|---|
| \`shop\` → \`interactiveMessage.shopStorefrontMessage { surface, id }\` | \`messages.js:1020\` | o card de loja é **exatamente** \`{ text, title?, subtitle?, footer?, shop: { surface, id } }\` |
| \`viewOnce: true\` → embrulho | \`messages.js:1197\` | **nunca** mande \`viewOnce\` junto do \`shop\` (o wrap mata o card no celular) |
| \`payment\` → \`requestPaymentMessage\` | \`messages.js:725-753\` (monta), \`1247-1249\` (lê) | \`{ payment: { note, currency, amount, offset, from } }\`, \`amount\` em milésimos (\`25.90\` → \`25900\`) |
| ramo combinado \`nativeFlow + shop\` | **NÃO EXISTE** aqui (\`interactiveButtons\` em \`:973\` é \`else if\` excludente) | o modo de entrega \`flow\` degenera no \`puro\`; \`messageVersion\` fica no default do proto. Reporte, não finja |

Métodos que **existem** e o projeto usa (25/25 ✓): \`sendMessage\`, \`query\`,
\`sendNode\`, \`relayMessage\`, \`groupMetadata\`, \`groupFetchAllParticipating\`,
\`groupSettingUpdate\`, \`groupParticipantsUpdate\`, \`groupUpdateSubject\`,
\`groupUpdateDescription\`, \`groupGetInviteInfo\`, \`updateProfilePicture\`,
\`removeProfilePicture\`, \`profilePictureUrl\`, \`getCatalog\`, \`getCollections\`,
\`updateStatusPrivacy\`, \`getPrivacyTokens\`, \`refreshMediaConn\`,
\`presenceSubscribe\`, \`sendPresenceUpdate\`, \`getUSyncDevices\`,
\`requestPairingCode\`, \`generateMessageTag\`, \`end\`.

Que **não** existem — não chame, não tente "polyfill com query crua":
\`statusUpdate\`, \`updateStatus\`, \`fetchStatusSessions\`, \`groupLeave\`,
\`groupAdd\`, \`jids\`, \`Delay\`, \`prepareMessageToEncode\`, \`fetchLatestWAVersion\`.
Consequências: story = \`sendMessage("status@broadcast", ...)\` +
\`updateStatusPrivacy\`; sair/remover do grupo = \`groupParticipantsUpdate\`; se
precisar de delay, \`const Delay = ms => new Promise(r => setTimeout(r, ms))\`.

Versionamento interno do fork: WhatsApp \`[2, 3000, 1026924051]\`
(\`lib/Defaults/baileys-version.json\`), \`pino ^9.6\` como dependência própria dele
(não alinhe com o \`pino ^10\` do projeto — cada um usa o seu), peer \`jimp ^0.22\`
(ignorado; o resize é nosso), \`engines.node >= 20\`.

Smoke test da fase 0 — tem que imprimir \`function\` (e ~252 chaves no segundo
comando; o número de exports não é contrato, é só prova de vida do pacote):

\`\`\`bash
node --input-type=module -e 'import("${SPECIFIER}").then(m=>console.log(typeof m.makeWASocket, Object.keys(m).length))'
node --input-type=module -e 'import("./connection/baileysCompat.js").then(m=>console.log("shim:",typeof m.default))'
\`\`\`

## 2. Árvore (gerada do disco — com o papel que o próprio arquivo declara no topo)

\`\`\`
${arvoreGerada()}
\`\`\`

Fora da árvore de código, por decisão: \`config.json\` (números reais), \`dono/**\`
(estado de runtime do dono), \`sessao/**\` (auth), \`log/**\`, \`legacy/**\`
(implementações mortas — não ressuscitar). **Não existe passo de \`git apply\` de
\`.patch\`**: os patches daquela fase já estão no fonte, aplicar de novo quebra.

(O total real, com LOC por arquivo, está na tabela abaixo — gerada do disco, não
contada de cabeça.)

## 2.1 Inventário (o que existe no projeto e o que este prompt traz)

${tInventario}

## 3. Comandos que existem (o usuário só digita isto)

### 3.1 Texto → \`actionId\` (fonte: \`commands/commandMap.js\`, export \`TEXT_TO_ACTION\`)

${tComandos}

Todo item acima funciona **com e sem** \`!\` onde o próprio mapa já traz as duas
formas; o roteador normaliza caixa/trim e aceita o \`actionId\` cru também. O
\`commandRouter\` devolve \`{ actionId, args }\` e quem decide permissão é
\`utils/permissions.js\` antes de qualquer efeito.

### 3.2 Menus numerados

${tMenus}

### 3.3 Atalhos de flood/preset (fonte: \`features/flood/router.js\`)

${tAtalhos}

### 3.4 Presets e modos de flood

${tPresets}

${tModos}

### 3.5 Estados do wizard (cada um \`st.action\` precisa de handler + \`cancelar\`)

${tWizard}

São ${ACOES_WIZARD.length} ações roteadas por \`handlers/stateHandler.js\` (extraído dos
\`st.action === "…"\` reais). Quem cai fora do mapa tem que cair em "não entendi",
nunca em silêncio.

## 4. \`config.json\` — o único estado de configuração

Forma (números mascarados; **não** versionado em git):

\`\`\`json
${exemploConfig()}
\`\`\`

Regras: chave desconhecida em \`SET_KEYS\` → warning, não exceção; arrays são
substituídos por completo (sem merge profundo); \`salvarConfig()\` é o único ponto
de escrita (com snapshot para o \`recover.sh\`); o bot lê no boot e o wizard
escreve. \`uiMode\` aceita \`text\` (default) | \`buttons\` | \`list\` | \`bloks\`
(\`txt\` é alias de \`text\`); \`uiModoEfetivo()\` é a única leitura — ele trata
\`bloks\` como \`text\` para os menus e só o Server Inspector enxerga \`bloks\`
(fonte: \`utils/config.js:13-27\`).

## 5. Contratos que você não pode improvisar

Estes são os pontos onde a reimplementação "parecida" quebra o bot. Os arquivos
completos estão no apêndice; aqui vai a obrigação funcional:

- **\`executarFlood(jid, msg, qtd, intervaloOuOpts = 100, buildContent = null)\`**
  (\`services/groupService.js\`): corpo = \`msg + "\\u200b".repeat((idx % 6) + 1)\`;
  \`LOTE = max(1, min(lote, 10))\`; gate de cooldown; \`null\` de \`buildContent\` =
  flood clássico de texto, função = flood com conteúdo por índice (\`texto\` ou
  \`pagamento\`, via \`floodContentBuilderFor(...)\` de \`features/flood/index.js\`).
  Sem \`buildContent\`, **nada** de montar payload.
- **Payment é TIPO de conteúdo do flood**, não segundo sistema: o mesmo
  \`runPresetJob\` → \`executarFlood\` → \`buildContent\` (\`presets/index.js\`). Um único
  portão de chaves por tipo; conteúdo inválido = erro digitado
  (\`PAYMENT_PAYLOAD_INVALID\`, \`AMOUNT_INVALID\`, \`CURRENCY_INVALID\`), nunca "jeito
  jeitoso".
- **Payment no fio** = \`{ payment: { note, currency, amount, offset, from, expiry } }\`
  — exatamente estas chaves, nada além. \`parsePaymentArgs("Pedido|25,90|BRL")\`
  aceita vírgula brasileira; \`amount\` vai em milésimos porque o fork joga
  \`message.payment.amount\` direto no \`amount1000\` (\`baileys/lib/messages.js:724-753\`
  do \`@lucasmod/boruto-vk7-baileys@2.1.0\`) — quem monta multiplica por 1000.
  \`viewOnce\` **nunca** entra no payload (o wrap muda o tipo da mensagem). Nunca
  \`.png\` de recibo, nunca "pagamento confirmado" sem o \`retryReqId\` do WhatsApp.
- **Alvo é escolha do operador**: \`setFloodSelection\`/\`getFloodSelection\`/\`clearFloodSelection\`
  (\`features/flood/targets.js\`). Sem seleção → \`TARGETS_REQUIRED\` no job e
  \`NENHUM_ALVO\` no atalho. \`filterTargets\` corta grupo protegido
  (\`PROTECTED_GROUP_BLOCKED\`) e JID inválido (\`BLOCKED_TARGET\`). Não há allowlist do
  flood, nem "todos" implícito, nem ampliação por mensagem recebida.
- **Ataques de grupo** (\`executarNuke\`, \`roubarGrupo\`): sequência exata e
  \`demote\|remove\` **por último** (inverter = perder o controle antes de terminar);
  throttling de \`groupMetadata\` compartilhado; a lista de alvos é sempre a
  seleção explícita do operador.
- **Pipeline** (\`handlers/messageHandler.js\`): ordem dos 10 passos — filtro de
  fromMe/status → \`baileysCompat\` → normalização de JID (LID antes de telefone!) →
  permissão → fastParser → \`commandRouter\` → stateHandler → efeito → log →
  histórico do dono. Trocar a ordem = comando que para de funcionar.
- **Wizard** (\`handlers/stateHandler.js\`): cada \`state.action\` tem handler e
  mensagem de saída própria; \`cancelar\`/\`voltar\` em todo passo; \`setConfig\` só
  pelo \`SET_KEYS\`.
- **Permissões** (\`utils/permissions.js\`): dono → ADM → grupo autorizado. Sem dono
  configurado, **nada** de painel abre (\`painel_dono\` é o único caminho de flood).

## 6. Segurança (não negociável)

- \`MAX_FLOOD = ${MAX_FLOOD}\`; teto por tipo (\`FLOOD_PRESET_HARD_CAP\`); preset
  acima do teto é **cercado**, não recusado em silêncio.
- Kill switch: estado em memória + \`config.json\` (\`persist: true\`) é que chama
  \`salvarConfig()\`; checado **por lote** — parar leva no máximo 1 lote.
- Não há \`dryRun\` nem \`testMode\`: um **único** caminho de execução. As chaves
  \`floodAllowlist\`/\`floodDryRun\`/\`floodTestMode\` estão em
  \`CONFIG_CHAVES_APOSENTADAS\` (\`utils/config.js\`) e somem do \`config.json\` na carga
  — quem reimplementar não pode recriá-las.
- \`normalizeTargetJid\` decide a forma final (\`@s.whatsapp.net\` para usuário,
  \`@g.us\` para grupo) e \`getFloodSelection()\` vazio **não** significa "todo mundo":
  significa "nada sai" (regra literal de \`features/flood/targets.js\`).
- Scripts de deploy nunca fazem \`reset --hard\`/\`checkout -f\`/\`stash drop\`; toda
  escrita vem precedida de backup em \`.syzygy-backup/<ts>/\`.
- \`sessao/\`, \`config.json\`, \`dono/*\` fora do git.

## 7. Aceite (o que "pronto" quer dizer aqui)

\`\`\`bash
for f in $(find . -name "*.js" -not -path "./node_modules/*"); do node --check "$f"; done
node features/flood/tests.js        # ${CONTAGENS["features/flood/tests.js"]}
node features/flood/tests-infra.js  # ${CONTAGENS["features/flood/tests-infra.js"]}
node features/flood/tests-menu.js   # ${CONTAGENS["features/flood/tests-menu.js"]}
node features/viewOnce/tests.js     # TODOS TESTES VIEW-ONCE PASSARAM
npm start                            # (você NÃO roda isto; é o passo do usuário)
\`\`\`

\`tests-payment.js\` não existe: o payment é coberto pelas três suítes acima, com o
contrato do payload conferido na fonte do pacote instalado (não em README). As
suítes são offline por construção (socket falso, \`config.json\`
snapshot/restaurado, \`persist:false\`) — se o seu código fizer elas escreverem em
disco, o teste falha de propósito. **Não enfraqueça asserção para passar.**

Relatório final obrigatório: o que foi implementado por fase, saída das 4 suítes,
lista de \`TODO(nao-especificado)\`, e a frase honesta "render de pagamento e
viewOnce não testados em aparelho".

## 8. Proibições (as 12 que já queimaram alguém)

1. trocar a Baileys por \`@whiskeysockets\`/"oficial" para "testar mais rápido"
2. segundo \`sock.sendMessage\` ou encurtador paralelo ao wrap de Ler Mais
3. \`viewOnce: true\` em payload de preset (muda o tipo da mensagem no wrap)
4. chave de payload fora do \`WAProto\` do fork instalado ("para forçar render")
5. recriar \`dryRun\`, \`testMode\` ou allowlist do flood (conceitos removidos na v53)
6. payment com \`.png\`/recibo falso ou "confirmado" sem \`retryReqId\`
7. flood que amplia alvo sozinho (mensagem recebida, "todos", cache inteiro) ou que atira em grupo protegido
8. \`demote\`/\`remove\` antes de concluir a sequência de ataque
9. \`salvarConfig()\` dentro de teste
10. \`reset --hard\`/\`stash\` em script de deploy
11. restaurar arquivos de \`legacy/\` "porque existiam"
12. dizer que renderizou sem aparelho
`

// ── apêndice ────────────────────────────────────────────────────────────────
function linhasDoFonte() {
    let n = 0
    for (const rel of todos) n += linhas(ler(rel))
    return n
}
// Amostra SINTÉTICA: as chaves e os tipos são os reais (lidos do config.json
// atual, se existir), os valores são exemplos seguros. Nunca despejar o
// config.json real num prompt externo — nem mascarado: a lista de chaves já é
// informação, os valores não.
function exemploConfig() {
    let real = {}
    try { real = JSON.parse(ler("config.json")) } catch {}
    const EXEMPLO = {
        nome: "SYZYGY", bio: "⚔️ SYZYGY ⚡", menuImage: "./dono/menus/Foto-menu/img-menu.jpg",
        ownerOverride: "", uiMode: "text", grupoOficial: "", linkDivulgacao: "",
        lerMais: true, marcarFantasma: true, floodModo: "normal", floodInterval: 100,
        floodLote: 6, floodJitter: false, autoLimpeza: true, antiTakeover: true,
        usuariosAutorizados: [], gruposAutorizados: [], lidsAutorizados: [], donosExtras: [],
        uiDebug: false,
    }
    const saida = {}
    for (const k of Object.keys(real).length ? Object.keys(real) : Object.keys(EXEMPLO)) {
        saida[k] = k in EXEMPLO ? EXEMPLO[k]
            : Array.isArray(real[k]) ? [] : typeof real[k] === "boolean" ? true
                : typeof real[k] === "number" ? real[k] : ""
    }
    for (const [k, v] of Object.entries(EXEMPLO)) if (!(k in saida)) saida[`+${k}`] = v
    return JSON.stringify(saida, null, 2)
}

const ape = [
    `\n---\n\n# 9. APÊNDICE — código-fonte de referência\n\n`,
    `Prioridade: Tier 1 (contrato/superfície) sempre entra; Tier 2 (implementações) entra\n`,
    `enquanto couber no orçamento de ${MAX_KB} KB. O que ficou de fora está listado com a\n`,
    `assinatura exata de cada exportação — reimplementar a partir delas é suportado.\n\n`,
    `**Incluídos (${caberia.length}):** ${caberia.map(r => "`" + r + "`").join(" · ")}\n\n`,
    caberia.map(bloco).join("\n"),
    deFora.length
        ? `\n---\n\n## 10. Descritos, não anexados (${deFora.length})\n\n` +
        deFora.map(rel => {
            const cab = cabecalhoComentario(rel)
            const anc = ancoras(rel)
            const parts = [`### ${rel} — ${linhas(ler(rel))} linhas${kb_peso(ler(rel))} · NÃO anexado por causa do orçamento`, ""]
            if (cab) parts.push(`As regras do arquivo, direto do topo dele:`, "", "\`\`\`js", cab, "\`\`\`", "")
            parts.push("Exportações (assinaturas exatas):", "", "\`\`\`ts", apiAssinaturas(rel).join("\n") || "(sem exportações nomeadas)", "\`\`\`", "")
            if (anc) parts.push(`Âncoras de roteamento (nome:linha-no-arquivo) — reimplemente cada uma:`, "", anc, "")
            return parts.join("\n")
        }).join("\n")
        : "",
    faltando.length ? `\n> Arquivos citados e ausentes neste snapshot: ${faltando.join(", ")}\n` : "",
    `\n---\n\nFim. Rode as 4 suítes, escreva o relatório e pare.\n`,
].join("")

fs.writeFileSync(SAIDA, doc + ape)
const kbTotal = (Buffer.byteLength(doc + ape) / 1024).toFixed(0)
console.log(`SYZYGY-PROMPT-0.md: ${kbTotal} KB · ${caberia.length} arquivos anexados · ${deFora.length} descritos · orçamento ${MAX_KB} KB`)
if (args.includes("--check")) console.log(JSON.stringify({ incl: caberia, fora: deFora, faltando }, null, 1))
for (const s of SEGREDOS) if ((doc + ape).includes(s[0])) console.log(`⚠️ SEGREDO VAZADO: ${s[0]}`)
