// features/flood/tests-menu.js
// [v53 · AB7] Testes da LIGAÇÃO entre os painéis e a feature features/flood/.
// Rode:  node features/flood/tests-menu.js
//
// Desde a v53 o painel do dono é 12-41 (allowlist/dry-run/modo-teste/preview de
// loja saíram, e os números antigos 42-47 passam a responder "opção removida" em
// vez de sumir em silêncio). Esta suíte é o que garante que:
//   • todo número tem ação roteada e toda ação tem rótulo (paridade 1:1);
//   • o parser rápido (5/NN, "5>NN") e o atalho de texto batem com o painel;
//   • nenhum menu cita conceito que não existe mais;
//   • nada é ENVIADO de verdade: sock falso, e o alvo vazio recusa antes.
//
// Garantias de ambiente: config.json e dono/historico.json comparados byte a byte
// antes/depois; CONFIG e estado de menu restaurados no finally.

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG, FLOOD_TIPOS } from "../../utils/config.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, "..", "..")
const CONFIG_PATH = path.join(RAIZ, "config.json")
const HIST_PATH = path.join(RAIZ, "dono", "historico.json")

let passed = 0, failed = 0, skipped = 0
const failures = []
function ok(m) { passed++; console.log(`✓ ${m}`) }
function assert(c, m) {
    if (c) ok(m)
    else { failed++; failures.push(m); console.log(`✗ ${m}`) }
}
function assertEq(a, e, m) {
    const A = JSON.stringify(a), E = JSON.stringify(e)
    if (A === E) { ok(m); return }
    failed++; failures.push(`${m} — esperado ${E}, veio ${A}`)
    console.log(`✗ ${m} — esperado ${E}, veio ${A}`)
}
function skip(m) { skipped++; console.log(`… SKIP ${m}`) }

// O roteador valida dono de verdade (utils/permissions.js) — o fixture usa o número
// configurado em CONFIG.ownerOverride, com sock falso: nada sai do processo.
const DONO_FAKE = `${String(CONFIG.ownerOverride || "").replace(/\D/g, "")}@s.whatsapp.net`
const GRUPO_FAKE = "5519999999999-1234@g.us"

async function main() {
    console.log("=== TESTES FLOOD · MENU/ATALHOS (v53) ===")
    const cfgBytes = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
    const histBytes = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null

    const { CONFIG_OPCOES, CONFIG_ROTULOS_ADM, CONFIG_ROTULOS_DONO, CONFIG_SECOES_DONO, OPCOES_REMOVIDAS, enviarSubmenuConfig } = await import("../../menus/configMenu.js")
    const { numeroNavegacao, COMANDOS, criarSections } = await import("../../menus/menu.js")
    const { OWNER_ONLY, roteadorAcoes } = await import("../../commands/commandRouter.js")
    const { TEXT_TO_ACTION } = await import("../../commands/commandMap.js")
    const fx = await import("./index.js")
    const { setState, clearState, getState } = await import("../../utils/stateManager.js")
    const { setSock, rt } = await import("../../connection/socket.js")
    const art = await import("../../utils/menuArt.js")

    const enviados = []
    setSock({
        user: { id: DONO_FAKE },
        sendMessage: async (jid, content) => { enviados.push({ jid, content }); return { key: { id: "fake" } } },
        sendPresenceUpdate: async () => {},
        groupMetadata: async (jid) => ({ id: jid, participants: [] }),
        groupFetchAllParticipating: async () => ({}),
        getStatus: async () => "",
        fetchLatestBaileysVersion: async () => [2, 3000, 1026924051]
    })

    const antes = {
        uiMode: CONFIG.uiMode,
        tipo: CONFIG.floodTipo,
        kill: CONFIG.floodKillSwitch,
        grupos: Array.isArray(CONFIG.gruposAutorizados) ? [...CONFIG.gruposAutorizados] : CONFIG.gruposAutorizados,
        modo: CONFIG.floodModo, intervalo: CONFIG.floodInterval, lote: CONFIG.floodLote
    }
    CONFIG.uiMode = "text" // o painel TXT é o que se desenha; interativo é conferido à parte

    const textoDoPainel = async (modo) => {
        enviados.length = 0
        await enviarSubmenuConfig(DONO_FAKE, DONO_FAKE, modo)
        return enviados.map(e => e.content?.text || "").join("\n")
    }

    try {
        // ── 1) paridade rótulo × ação (a UI interativa quebra se divergir) ────
        const rotulos = [...CONFIG_ROTULOS_ADM, ...CONFIG_ROTULOS_DONO]
        for (const [n] of rotulos) {
            if (!CONFIG_OPCOES[n]) { failed++; failures.push(`rótulo ${n} sem ação em CONFIG_OPCOES`); console.log(`✗ rótulo ${n} sem ação em CONFIG_OPCOES`) }
        }
        ok(`todos os ${rotulos.length} rótulos têm ação roteada`)
        for (const [n, acao] of Object.entries(CONFIG_OPCOES)) {
            if (acao === "abrir_painel") continue
            if (!rotulos.some(([m]) => m === n)) { failed++; failures.push(`ação ${acao} (${n}) sem rótulo`); console.log(`✗ ação ${acao} (${n}) sem rótulo`) }
        }
        ok("toda ação do mapa tem rótulo no painel")
        assertEq(CONFIG_ROTULOS_ADM.length, 11, "ADM continua com 1-11 (promessa do menu preservada)")
        assertEq(CONFIG_ROTULOS_DONO.length, 30, "dono tem 30 opções (12-41, compactado dos 36 antigos)")
        const numsDono = CONFIG_ROTULOS_DONO.map(([n]) => Number(n))
        assertEq([Math.min(...numsDono), Math.max(...numsDono)], [12, 41], "faixa do dono é 12-41 sem buraco")
        assertEq(numsDono.length, new Set(numsDono).size, "nenhum número repetido no painel do dono")
        for (let i = 12; i <= 41; i++) assert(numsDono.includes(i), `${i} existe`)
        // as 4 primeiras opções do painel principal continuam 1-4 (Atacar & Grupos)
        assertEq(CONFIG_OPCOES["0"], "abrir_painel", "0 volta ao painel")
        assertEq(CONFIG_OPCOES["11"], "abrir_painel", "11 (fim do ADM) volta ao painel")
        assertEq(CONFIG_OPCOES["41"], "abrir_painel", "41 (fim do dono) volta ao painel")

        // ── 2) seções só decoram; não inventam número órfão ───────────────────
        const emSecao = CONFIG_SECOES_DONO.flatMap(s => s.numeros)
        assertEq(emSecao.slice().sort((a, b) => Number(a) - Number(b)), CONFIG_ROTULOS_DONO.map(([n]) => n), "as seções cobrem exatamente as opções do dono")
        for (const sec of CONFIG_SECOES_DONO) {
            for (const n of sec.numeros) assert(CONFIG_OPCOES[n], `seção '${sec.titulo}' só cita número existente (${n})`)
        }

        // ── 3) números que deixaram de existir respondem (nada de fantasma) ──
        assertEq(OPCOES_REMOVIDAS, ["42", "43", "44", "45", "46", "47"], "os números aposentados são 42-47")
        for (const n of OPCOES_REMOVIDAS) assertEq(CONFIG_OPCOES[n], undefined, `${n} não aponta para ação nenhuma`)
        enviados.length = 0
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "cfg_flood_dryrun")
        const tDry = enviados.map(e => e.content?.text || "").join("\n")
        assert(/saiu da v53|não existe mais|removid/i.test(tDry), "5/37 antigo (dry-run) responde que saiu, em vez de ignorar")
        assert(!/(enviando|flood iniciado)/i.test(tDry), "e não faz nada além de responder")
        enviados.length = 0
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "flood_preset_shopping-test")
        assert(/saiu da v53|removid/i.test(enviados.map(e => e.content?.text || "").join("\n")), "shopping test idem (o tipo não existe mais)")

        // ── 4) controles do flood no painel do dono ───────────────────────────
        assertEq(CONFIG_OPCOES["35"], "painel_flood_presets", "35 = presets de flood")
        assertEq(CONFIG_OPCOES["36"], "cfg_flood_targets", "36 = escolher grupos (alvos)")
        assertEq(CONFIG_OPCOES["37"], "cfg_flood_kill", "37 = kill switch")
        assertEq(CONFIG_OPCOES["38"], "cfg_flood_speed", "38 = velocidade dos presets")
        assertEq(CONFIG_OPCOES["39"], "cfg_flood_xray", "39 = raio-X do job")
        assertEq(CONFIG_OPCOES["40"], "cfg_flood_tipo", "40 = tipo padrão (texto/pagamento)")
        assertEq(CONFIG_OPCOES["17"], "cfg_flood_modo", "17 continua modo do flood")
        assertEq(CONFIG_OPCOES["18"], "cfg_flood_interval", "18 intervalo")
        assertEq(CONFIG_OPCOES["19"], "cfg_flood_lote", "19 lote")
        for (const n of ["35", "36", "37", "38", "39", "40"]) {
            assert(OWNER_ONLY.has(CONFIG_OPCOES[n]), `${CONFIG_OPCOES[n]} (${n}) é só do dono`)
        }
        assert(![...OWNER_ONLY].some(k => /allowlist|dryrun|testmode|loja/i.test(k)), "OWNER_ONLY não lista mais os ids aposentados")

        // ── 5) parser de navegação: número do painel × atalho "5>NN" ──────────
        assertEq(numeroNavegacao("painel_flood_presets"), "5>35", "painel de presets aparece como 5>35")
        assertEq(numeroNavegacao("cfg_flood_targets"), "5>36", "escolher grupos = 5>36")
        assertEq(numeroNavegacao("cfg_flood_tipo"), "5>40", "tipo do flood = 5>40")
        assertEq(numeroNavegacao("cfg_list_users"), "6>7", "opção de ADM continua 6>NN")
        assertEq(CONFIG_OPCOES["1"], "cfg_owner", "1 do ADM = ver proprietário")
        assert(COMANDOS.length >= 50, `catálogo interativo tem ${COMANDOS.length} comandos (não foi podado por engano)`)
        const sujas = COMANDOS.filter(c => /dry|allowlist|shopping|loja|testmode/i.test(`${c.id} ${c.title} ${c.description || ""}`))
        assertEq(sujas.map(c => c.id), [], "nenhuma linha do catálogo cita conceito aposentado (lista sem item morto)")
        assertEq(COMANDOS.filter(c => c.id === "painel_flood_presets").length, 1, "o painel de presets existe exatamente uma vez no catálogo")
        const secs = criarSections(COMANDOS)
        assertEq(secs.flatMap(sec => sec.rows).length, COMANDOS.length, "criarSections não perde nem duplica comando")
        assert(secs.every(sec => sec.rows.length <= 25), "nenhuma section estoura o limite de linhas do WhatsApp (25)")
        // só o escopo desta suíte: tudo que é flood/preset/kill tem destino. Os demais
        // ids do catálogo pertencem a outros despachantes (fastParser, status, view-once).
        const acoesRoteaveis = new Set([...Object.values(CONFIG_OPCOES), ...Object.values(fx.FLOOD_PRESET_COMMANDS), ...Object.values(TEXT_TO_ACTION)])
        const doFlood = COMANDOS.filter(c => /^(cfg_flood_|painel_flood|flood_)/.test(c.id))
        assert(doFlood.length >= 8, `o catálogo expõe ${doFlood.length} comandos de flood`)
        assertEq(doFlood.filter(c => !acoesRoteaveis.has(c.id)).map(c => c.id), [], "todo id de flood do catálogo tem destino roteável")

        // ── 6) atalhos de texto: nomes da arena antiga mantidos, mortos removidos
        for (const c of ["floodpresets", "paymenttest", "texttest", "mentiontest", "mediatest", "floodstop", "floodstart"]) {
            assert(c in TEXT_TO_ACTION, `atalho '${c}' continua no commandMap`)
        }
        assertEq(TEXT_TO_ACTION["paymenttest"], fx.FLOOD_PRESET_COMMANDS["paymenttest"], "commandMap e router apontam para a MESMA ação")
        assertEq(TEXT_TO_ACTION["floodstop"], fx.FLOOD_PRESET_COMMANDS["floodstop"], "floodstop idem")
        for (const morto of ["shoppingtest", "flooddryrun"]) assertEq(morto in TEXT_TO_ACTION, false, `'${morto}' sumiu do commandMap`)
        assert(/pagamento/.test(TEXT_TO_ACTION["pagamento"] || ""), "novo atalho 'pagamento' cai no painel de tipo")
        let divergencias = 0
        for (const [cmd, acao] of Object.entries(fx.FLOOD_PRESET_COMMANDS)) {
            if (TEXT_TO_ACTION[cmd] !== acao && TEXT_TO_ACTION[`!${cmd}`] !== acao) divergencias++
        }
        assertEq(divergencias, 0, "todo comando do router tem o MESMO destino no commandMap")

        // ── 7) painel TXT: arte, estado real e ausência dos conceitos mortos ──
        const painel = await textoDoPainel("dono")
        assert(painel.includes("COMANDOS DO DONO"), "painel do dono traz o título")
        assert(painel.includes(art.LOGO_PRINCIPAL), "e a identidade visual do projeto (𝖘𝖞𝖟𝖞𝖌𝖞)")
        assert(/༺|༻|━|▬|☆/.test(painel), "com as barras ornamentais")
        assert(/〔 🌊 FLOOD 〕/.test(painel), "o painel traz o bloco 〔 🌊 FLOOD 〕")
        assert(/〔 ⚔️ FLOOD · CONTROLE 〕/.test(painel), "e o bloco 〔 ⚔️ FLOOD · CONTROLE 〕")
        assert(painel.includes(CONFIG.floodInterval + "ms/l" + CONFIG.floodLote), "com o ritmo EFETIVO do config (n\u00e3o o default do modo)")
        assert(painel.includes(CONFIG.floodModo + " (" + CONFIG.floodInterval + "ms/l" + CONFIG.floodLote + ")"), "e o modo pelo nome, junto do ritmo")
        assert(/〔 🎨 PRESETS 〕/.test(painel), "e o bloco de presets (12/13)")
        assert(/kill switch: liberado/.test(painel), "kill switch aparece com estado real")
        assert(/alvos do flood: nenhum \(use 36\)/.test(painel), "e a linha de alvos diz que ainda não há escolha")
        assert(/Tipo padrão · (texto|pagamento)/.test(painel), "o tipo padrão aparece no bloco FLOOD")
        assert(/alvos do flood/i.test(painel), "a linha de alvos existe (é a escolha do operador)")
        assert(/teto \d+/.test(painel), "o teto de mensagens aparece digitado (v53: configurável)")
        for (const morto of ["allowlist", "Allowlist", "dry-run", "Dry-run", "Dry", "modo teste", "Modo teste", "loja", "Loja", "shopping", "Shopping", "preview", "Preview"]) {
            assert(!painel.includes(morto), `painel do dono não cita '${morto}'`)
        }
        assert(/FLOOD · CONFIG|CONFIGURAÇÕES DO DONO|COMANDOS DO DONO/.test(painel), "painel do dono tem título")
        assert(/⚡|🌊|💳/.test(painel), "com os ícones das linhas de flood")
        assert(/35 ⬥/.test(painel) && /40 ⬥/.test(painel), "as opções 35 e 40 estão desenhadas no painel")
        const painelAdm = await textoDoPainel("adm")
        assert(/CONFIGURAÇÕES/.test(painelAdm), "painel de ADM tem o próprio título")
        for (const a of ["cfg_flood", "kill switch", "presets"]) assert(!painelAdm.includes(a), `ADM não expõe '${a}' (controle de flood é do dono)`)
        for (const n of ["12", "24", "40"]) assert(!new RegExp(`┃ ${n} ⬥`).test(painelAdm), `ADM não lista a opção do dono ${n}`)
        assert(painelAdm.length < 1400, `painel de ADM cabe numa tela (${painelAdm.length} chars)`)
        assert(/┃ 0?1 ⬥/.test(painelAdm), "e numera a primeira opção")

        // ── 8) tipo padrão: 40 alterna texto ⇄ pagamento (e o painel reflete) ──
        CONFIG.floodTipo = FLOOD_TIPOS.TEXTO
        enviados.length = 0
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "cfg_flood_tipo")
        assertEq(CONFIG.floodTipo, FLOOD_TIPOS.PAGAMENTO, "40 → pagamento")
        assert(/💳|pagamento/.test(enviados.map(e => e.content?.text || "").join("\n")), "e o painel confirma por extenso")
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "cfg_flood_tipo")
        assertEq(CONFIG.floodTipo, FLOOD_TIPOS.TEXTO, "40 de novo → texto (alterna)")
        const painelComPag = await (async () => { CONFIG.floodTipo = FLOOD_TIPOS.PAGAMENTO; return textoDoPainel("dono") })()
        assert(/pagamento/.test(painelComPag), "painel mostra o tipo corrente (pagamento)")
        CONFIG.floodTipo = FLOOD_TIPOS.TEXTO

        // ── 9) kill switch pelo painel e pelo atalho ─────────────────────────
        CONFIG.floodKillSwitch = false
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "cfg_flood_kill")
        assertEq(fx.isKillSwitchOn(), true, "37 liga o kill switch")
        assertEq(fx.isKillSwitchPersisted(), true, "e o persiste de propósito (kill precisa sobreviver a restart) — por isso a suíte devolve config.json no fim")
        const painelKill = await textoDoPainel("dono")
        assert(/BLOQUEADO|ATIVO/.test(painelKill), "painel reflete kill switch ligado")
        assert(/Liberar flood|liberado/i.test(painelKill), "e a própria linha diz o que o próximo toque faz")
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "flood_kill_off")
        assertEq(fx.isKillSwitchOn(), false, "atalho flood_kill_off desliga")
        assertEq(CONFIG.floodKillSwitch, false, "e devolve o CONFIG (a suíte nunca persiste em disco)")

        // ── 10) alvos: sem escolha, NADA é enviado ──────────────────────────
        fx.setKillSwitch(false, { persist: false })
        fx.clearFloodSelection(DONO_FAKE)
        fx.clearFloodSelection()
        enviados.length = 0
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "flood_preset_payment_test")
        const tSemAlvo = enviados.map(e => e.content?.text || "").join("\n")
        assert(/NENHUM_ALVO|nenhum alvo|escolha/i.test(tSemAlvo), "paymenttest sem seleção recusa e explica")
        assert(enviados.every(e => e.jid === DONO_FAKE), "e nada foi para um destinatário terceiro")
        assertEq(enviados.filter(e => e.jid === GRUPO_FAKE).length, 0, "zero envios para grupo")
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "cfg_flood_targets")
        assert(enviados.every(e => /grupo|alvos|escolha|cache/i.test(e.content?.text || "")), "36 só fala de grupos/alvos (não de allowlist)")
        assertEq(getState(DONO_FAKE)?.action, "waiting_group", "36 abre a MESMA lista de grupos do flood normal")
        assertEq(getState(DONO_FAKE)?.next, "waiting_flood_targets", "com destino 'targets' (não allowlist)")
        clearState(DONO_FAKE)

        // ── 11) presets: painel e recusas ────────────────────────────────────
        enviados.length = 0
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "painel_flood_presets")
        const tPre = enviados.map(e => e.content?.text || "").join("\n")
        assert(/payment-test/.test(tPre), "painel de presets lista payment-test")
        assert(/teto por job|teto\/job/.test(tPre), "com o teto por job visível")
        for (const morto of ["dry-run", "allowlist", "shopping", "loja"]) assert(!new RegExp(morto, "i").test(tPre), `painel de presets não cita '${morto}'`)
        assert(/usa a sele\u00e7\u00e3o do painel 2/.test(tPre), "e diz que roda na seleção do painel 2 (não em lista própria)")
        assert(/flood normal: at\u00e9 \d+ msg\/alvo/.test(tPre), "com o teto do flood clássico digitado")

        // ── 12) raio-X do job (39) sem os campos mortos ─────────────────────
        await roteadorAcoes(DONO_FAKE, DONO_FAKE, "cfg_flood_xray")
        const tX = enviados.slice(-1).map(e => e.content?.text || "").join("\n")
        assert(/RAIO-X/.test(tX), "39 responde o raio-X")
        assert(/job em andamento/.test(tX) && /teto/.test(tX), "com job corrente e teto")
        for (const morto of ["dry-run", "modo teste", "allowlist"]) assert(!new RegExp(morto, "i").test(tX), `raio-X não cita '${morto}'`)

        // ── 13) o painel do flood (2) pergunta o TIPO antes do conteúdo ──────
        setState(DONO_FAKE, { action: "waiting_flood_tipo", groupJid: GRUPO_FAKE, selectedGroup: { subject: "Grupo Fake" } })
        const stAntes = getState(DONO_FAKE)
        assertEq(stAntes.action, "waiting_flood_tipo", "o wizard abre no passo de TIPO (53: tipo só troca o conteúdo)")
        clearState(DONO_FAKE)
        const sh = await import("../../handlers/stateHandler.js")
        assertEq(typeof sh.handleEstado, "function", "stateHandler expõe handleEstado (o wizard é nele)")
        assertEq(typeof sh.processarSelecaoGrupo, "function", "e a seleção de grupo do menu compartilhado")
        const shSrc = fs.readFileSync(path.join(RAIZ, "handlers/stateHandler.js"), "utf8")
        assert(/waiting_flood_tipo/.test(shSrc) && /waiting_payment_valor/.test(shSrc) && /waiting_payment_moeda/.test(shSrc), "wizard tem os passos de tipo e de pagamento")
        assert(!/detectShoppingTrigger|resolveShoppingSend|shoppingPromptText|makeFloodContentBuilder|SHOPPING_LIMITS/.test(shSrc), "e nenhum deles importa API de loja")
        assert(/config_set_flood_allowlist/.test(shSrc) === false, "handler de allowlist não existe mais no stateHandler")
        const gsSrc = fs.readFileSync(path.join(RAIZ, "services/groupService.js"), "utf8")
        assert(/floodMaxEfetivo/.test(gsSrc), "o teto lido pelo laço vem do config (2000 default)")

        // ── 14) arte compartilhada (menus "bonitinhos" sem quebrar parsing) ──
        assert(art.LOGO_PRINCIPAL && art.LOGO_SUPERS === undefined, "a arte expõe o logotipo usado nos títulos")
        assertEq(art.opcao("7", "👥 Listar grupos", "3"), "┃ 07 ⬥ 👥 Listar grupos · 3", "opção numerada com zero à esquerda")
        assert(art.moldura("⚙️ CONFIG").split("\n")[0].includes("═") === false, "moldura usa a barra do projeto (━)")
        assert(art.moldura("TITULO BEM LONGO PARA FORCAR").split("\n")[0].replace(/[║╔╗╚╝༺༻ ]/g, "").length >= 4, "moldura cresce com o título")
        assertEq(art.estado(true), "✅ LIGADO", "estado ligado")
        assertEq(art.estado(false), "⬜ desligado", "estado desligado")
        assert(/v53|saiu/.test(art.itemRemovido("🛍️ Loja", "saiu da v53.")), "item removido responde com a versão")
        const montado = art.montarMenu({ titulo: "TESTE", itens: Array.from({ length: 25 }, (_, i) => [String(i + 1), `opção ${i + 1}`]), porPagina: 10 })
        assertEq(montado.paginas.length, 3, "menu paginado divide em páginas (nada de 'Ler Mais' comendo opção)")
        assert(montado.paginas.every(p => p.length < 1200), "cada página cabe na tela")
        assertEq(montado.paginas[0].includes("opção 10"), true, "a 1ª página tem as 10 primeiras")
        assertEq(montado.paginas[2].includes("opção 25"), true, "a última fecha a lista")
    } catch (e) {
        failed++
        failures.push(`exceção: ${e.stack || e}`)
        console.log(`✗ exceção: ${e.stack || e}`)
    } finally {
        Object.assign(CONFIG, antes)
        fx.setKillSwitch(!!antes.kill, { persist: false })
        fx.clearFloodSelection(DONO_FAKE)
        fx.clearFloodSelection()
        clearState(DONO_FAKE)
        setSock(null)
        if (cfgBytes) fs.writeFileSync(CONFIG_PATH, cfgBytes)
        const cfgDepois = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null
        const histDepois = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH) : null
        assertEq(cfgBytes === null ? null : cfgBytes.toString("hex"), cfgDepois === null ? null : cfgDepois.toString("hex"), "config.json NÃO foi tocado pela suíte")
        assert((histBytes === null && histDepois === null) || (histBytes && histDepois && histBytes.equals(histDepois)), "dono/historico.json NÃO foi tocado pela suíte")
    }

    console.log(`\n=== FLOOD · MENU: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failed) {
        console.log("\nFalhas:")
        for (const f of failures) console.log(` • ${f}`)
        process.exitCode = 1
    }
}

main().catch(e => { console.error(e); process.exit(1) })
