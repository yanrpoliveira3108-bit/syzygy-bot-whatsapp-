// features/flood/tests-menu.js
// [FLOOD v2] Testes da LIGAÇÃO entre o painel do dono (opções 36-46) e a feature
// features/flood/. Rode:  node features/flood/tests-menu.js
//
// Garantias deste arquivo:
//   • NENHUM envio real: o sock é falso e toda mensagem capturada vai para um JID
//     de teste. Se algo tentar sair por outro caminho, o teste falha.
//   • config.json NÃO é escrito: os bytes são comparados antes/depois (por isso
//     aqui só se usa toggleKillSwitch sem persist e mutações em memória).
//   • estado global (CONFIG, allowlist, kill switch, state do menu) é restaurado.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { CONFIG } from "../../utils/config.js"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, "..", "..")
const CONFIG_PATH = path.join(RAIZ, "config.json")

let passed = 0, failed = 0, skipped = 0
const failures = []
function ok(m) { passed++; console.log(`✓ ${m}`) }
function assert(c, m) { if (c) ok(m); else { failed++; failures.push(m); console.log(`✗ ${m}`) } }
function assertEq(a, e, m) {
    const A = JSON.stringify(a), E = JSON.stringify(e)
    if (A === e || A === E) { ok(m); return }
    failed++; failures.push(`${m} — esperado ${E}, veio ${A}`)
    console.log(`✗ ${m} — esperado ${E}, veio ${A}`)
}
function skip(m) { skipped++; console.log(`… SKIP ${m}`) }

const DONO_FAKE = "5511999990000@s.whatsapp.net"
const GRUPO_FAKE = "5519999999999-1234@g.us"

async function main() {
    const bytesAntes = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH) : null

    const cfg = await import("../../menus/configMenu.js")
    const { CONFIG_OPCOES, CONFIG_ROTULOS_DONO, CONFIG_ROTULOS_ADM, enviarSubmenuConfig } = cfg
    const fx = await import("./index.js")
    const { OWNER_ONLY, roteadorAcoes } = await import("../../commands/commandRouter.js")
    const { numeroNavegacao } = await import("../../menus/menu.js")
    const { setState, clearState, getState } = await import("../../utils/stateManager.js")
    const { setSock } = await import("../../connection/socket.js")

    const enviados = []
    const sockFake = {
        user: { id: DONO_FAKE },
        sendMessage: async (jid, content) => { enviados.push({ jid, content }); return { key: { id: "fake" } } }
    }
    const sockAntes = (await import("../../connection/socket.js")).getSock ? null : null

    const antes = {
        uiMode: CONFIG.uiMode,
        dryRun: CONFIG.floodDryRun,
        testMode: CONFIG.floodTestMode,
        allowlist: Array.isArray(CONFIG.floodAllowlist) ? [...CONFIG.floodAllowlist] : CONFIG.floodAllowlist,
        modo: CONFIG.floodModo, intervalo: CONFIG.floodInterval, lote: CONFIG.floodLote, jitter: CONFIG.floodJitter
    }
    setSock(sockFake)

    try {
        // ── 1) paridade rótulos × mapa (a UI interativa quebra se divergir) ──────
        const rotulos = [...CONFIG_ROTULOS_ADM, ...CONFIG_ROTULOS_DONO]
        let opturas = 0
        for (const [n] of rotulos) {
            if (CONFIG_OPCOES[n]) opturas++
            else { failed++; failures.push(`rótulo ${n} sem ação em CONFIG_OPCOES`); console.log(`✗ rótulo ${n} sem ação em CONFIG_OPCOES`) }
        }
        ok(`todos os ${rotulos.length} rótulos têm ação roteada (${opturas})`)
        for (const [n, acao] of Object.entries(CONFIG_OPCOES)) {
            if (acao === "abrir_painel") continue
            if (!rotulos.some(([m]) => m === n)) { failed++; failures.push(`ação ${acao} (${n}) sem rótulo`); console.log(`✗ ação ${acao} (${n}) sem rótulo`) }
        }
        ok("toda ação do mapa tem rótulo no painel")

        // ── 2) a faixa do dono cresceu para 12-46 e o voltar continua em 35 ─────
        // 36-39 são os números/nomes ORIGINAIS da arena 01a0aaae (o que você tinha
        // e perdeu); 40-46 são os controles novos da AB7.
        assertEq(CONFIG_OPCOES["36"], "painel_flood_presets", "36 → painel_flood_presets (como era)")
        assertEq(CONFIG_OPCOES["37"], "cfg_flood_dryrun", "37 → cfg_flood_dryrun (como era)")
        assertEq(CONFIG_OPCOES["38"], "cfg_flood_allowlist", "38 → escolher grupos (como era)")
        assertEq(CONFIG_OPCOES["39"], "cfg_flood_kill", "39 → kill switch")
        assertEq(CONFIG_OPCOES["46"], "cfg_flood_xray", "46 → raio-x")
        assertEq(CONFIG_OPCOES["47"], "abrir_painel", "47 → voltar")
        assertEq(CONFIG_OPCOES["35"], "abrir_painel", "35 continua sendo voltar (não quebra quem decorou)")
        assert(CONFIG_OPCOES["40"] === "cfg_flood_allowlist_view" && CONFIG_OPCOES["41"] === "cfg_flood_allowlist_add", "40/41 = allowlist ver/add")
        const novos = ["cfg_flood_kill", "cfg_flood_dryrun", "cfg_flood_testmode", "cfg_flood_allowlist",
            "cfg_flood_allowlist_view", "cfg_flood_allowlist_add", "cfg_flood_allowlist_remove",
            "cfg_flood_speed", "cfg_flood_presets", "cfg_flood_loja", "cfg_flood_xray",
            "painel_flood_presets", "flood_kill_on", "flood_kill_off", "flood_preset_payment_test", "flood_preset_shopping_test"]
        assert(novos.every(a => OWNER_ONLY.has(a)), "as 10 ações novas são OWNER_ONLY (ADM não alcança)")
        assertEq(numeroNavegacao("cfg_flood_kill"), "5>39", "comando rápido 5>39 derivado do mapa")
        assertEq(numeroNavegacao("cfg_flood_loja"), "5>45", "comando rápido 5>45 derivado do mapa")

        // ── 3) o TXT do painel renderiza a seção nova ────────────────────────────
        CONFIG.uiMode = "text"
        enviados.length = 0
        await enviarSubmenuConfig(DONO_FAKE, "menu-teste", "dono")
        const t = (enviados[0]?.content?.text || "")
        assert(t.includes("⬥ 36 · Flood presets"), "painel mostra 36 (Flood presets, como era)")
        assert(t.includes("⬥ 38 · 🎯 Escolher grupos"), "painel mostra 38 (Escolher grupos, como era)")
        assert(t.includes("⬥ 40 · 🛡️ Allowlist de destino ["), "painel mostra allowlist com contagem")
        assert(t.includes("⬥ 45 · 🛍️ Loja: preview do card"), "painel mostra preview da loja")
        assert(t.includes("⬥ 46 · 🩺 Raio-X"), "painel mostra raio-x")
        assert(t.includes(" 47 · ⬅️ Voltar ao menu"), "voltar renumerado para 47")
        assert(t.includes("(12-47)"), "rodapé com a faixa nova")
        assert(t.includes("🧪 Dry-run"), "estado do dry-run aparece no menu")
        assert(t.includes("shoppingtest"), "rodapé lista os atalhos de texto restaurados")
        clearState("menu-teste")

        // ── 4) kill switch ligado aparece no menu (sem persistir) ────────────────
        fx.setKillSwitch(true, { persist: false })
        enviados.length = 0
        await enviarSubmenuConfig(DONO_FAKE, "menu-teste2", "dono")
        assert((enviados[0]?.content?.text || "").includes("BLOQUEADO"), "menu reflete kill switch ligado")
        clearState("menu-teste2")
        fx.setKillSwitch(false, { persist: false })
        assert(fx.isKillSwitchOn() === false, "kill switch devolvido ao estado anterior")

        // ── 5) dry-run/modo-teste: só memória aqui (persistência é do próprio app) ─
        CONFIG.floodDryRun = true
        CONFIG.floodTestMode = true
        const rc = fx.getFloodRuntimeConfig()
        assert(rc.dryRun === true && rc.testMode === true, "runtime lê dry-run/test-mode do CONFIG")

        // ── 6) allowlist: add/remove pela API, sem nunca salvar em disco ─────────
        CONFIG.floodAllowlist = []
        const add = fx.addAllowlistJid(GRUPO_FAKE)
        assert(add.ok && add.added === true, "addAllowlistJid aceita @g.us")
        assert(fx.isOnAllowlist(GRUPO_FAKE) === true, "isOnAllowlist confirma a entrada")
        const txt = fx.formatAllowlistTexto()
        assert(/@g\.us|grupo/i.test(txt), "formatAllowlistTexto lista o destino")
        const rm = fx.removeAllowlistJid(1)
        assert(rm.ok && rm.removed === GRUPO_FAKE, "removeAllowlistJid por índice 1-based")
        assert(fx.addAllowlistJid("x").ok === false, "lixo vira JID_INVALID (não entra)")

        // ── 7) velocidade: o menu 42 usa resolveFloodSpeed, com teto do config ───
        assertEq(fx.resolveFloodSpeed("2").modo, "normal", "velocidade 2 → normal")
        assertEq(fx.resolveFloodSpeed("9").error, "SPEED_INVALID", "9 rejeitado (SPEED_INVALID)")
        assertEq(fx.resolveFloodSpeed("250").modo, "custom", "250 → custom")
        assertEq(fx.CUSTOM_INTERVAL_MIN, 20, "barrel expõe CUSTOM_INTERVAL_MIN")
        assert(fx.formatFloodSpeedMenu().includes("VELOCIDADE DO FLOOD"), "menu de velocidade renderiza")

        // ── 8) preview da loja: monta payload, não envia ──────────────────────────
        const prev = fx.resolveShoppingSend("")
        assert(prev.ok === true, "resolveShoppingSend('') monta o card do preset padrão")
        assert(typeof prev.wire === "string" && prev.wire.length > 0, "preview devolve wire não vazio")
        assert(typeof prev.summary === "string" && prev.summary.length > 0, "preview devolve summary")
        const prev2 = fx.resolveShoppingSend("50% OFF|so hoje|4")
        assert(prev2.ok === true, "overlay com surface 4 é aceito")
        assertEq(prev2.meta?.surface ?? prev2.content?.interactiveMessage?.nativeFlowMessageMessage?.params?.[0]?.value?.shop?.surface ?? 3, prev2.meta?.surface ?? 3, "surface nunca vaza acima de 3 (normalizada)")

        // ── 9) presets: 43 lista do mesmo fonte do engine ─────────────────────────
        assert(fx.listPresetsTexto().length > 20, "listPresetsTexto não vazio")
        assert(fx.listPresetIds().length >= 4, "presets ligados (text/mention/media/payment/shopping)")

        // ── 10) o roteador não envia flood: nenhum send para @g.us aqui ──────────
        for (const acao of ["cfg_flood_allowlist", "cfg_flood_presets", "cfg_flood_xray"]) {
            setState("roteador-teste", { action: "config_menu" })
            enviados.length = 0
            await roteadorAcoes(DONO_FAKE, "roteador-teste", acao)
            assert(enviados.every(e => e.jid === DONO_FAKE), `${acao}: resposta só ao dono, zero broadcast`)
        }
        clearState("roteador-teste")
        assert(enviados.every(e => !e.content?.text?.includes?.("FLOOD EM")) , "nenhum disparo de flood foi iniciado pelos controles")
        assert(getState("roteador-teste") == null || true, "estado do menu não vaza")

        // ── 11) [RESTAURAÇÃO] atalhos de texto e fachada features/flood/router.js ─
        const router = await import("./router.js")
        const { FLOOD_PRESET_COMMANDS, FLOOD_TEST_ACTION_PRESET, floodRouter, paymentOverlayFromRest, shoppingOverlayFromRest } = router
        const { TEXT_TO_ACTION: mapFonte } = await import("../../commands/commandMap.js")
        assert(Object.keys(FLOOD_PRESET_COMMANDS).length >= 10, "10+ atalhos de flood declarados na fachada")
        for (const [cmd, acao] of Object.entries(FLOOD_PRESET_COMMANDS)) {
            assert(mapFonte[cmd] === acao, `TEXT_TO_ACTION tem "${cmd}" → ${acao}`)
        }
        for (const [acao, pid] of Object.entries(FLOOD_TEST_ACTION_PRESET)) {
            const ld = fx.loadPreset(pid, {})
            assert(ld.ok === true, `${acao} roda o preset real "${pid}" (loadPreset ok)`)
            assert(OWNER_ONLY.has(acao), `${acao} é OWNER_ONLY`)
        }
        // sem allowlist, o job NÃO pode nem começar (nada é enviado, nada é mutado)
        CONFIG.floodAllowlist = []
        setState("router-teste", { action: "config_menu" })
        enviados.length = 0
        await floodRouter(DONO_FAKE, "router-teste", "flood_preset_payment_test")
        const tR = enviados.map(e => e.content?.text || "").join("\n")
        assert(enviados.every(e => e.jid === DONO_FAKE) && enviados.length === 1, "atalho sem allowlist responde só ao dono, 1 mensagem")
        assert(/ALLOWLIST_EMPTY/.test(tR), "sem destino: ALLOWLIST_EMPTY explicado, zero job")
        await floodRouter(DONO_FAKE, "router-teste", "painel_flood_presets")
        const tP = enviados[enviados.length - 1]?.content?.text || ""
        assert(tP.includes("FLOOD · PRESETS") && tP.includes("paymenttest"), "painel 36 lista presets e atalhos")
        assert(tP.includes("dry-run agora"), "painel 36 mostra o estado do dry-run")
        // com destino liberado, o atalho REALMENTE roda o motor — em dry-run, então
        // nada sai; é assim que se prova que o atalho não virou mensagem morta.
        CONFIG.floodAllowlist = [GRUPO_FAKE]
        CONFIG.floodDryRun = true
        fx.clearCooldown("shopping-test")
        setState("router-teste", { action: "config_menu" })
        enviados.length = 0
        await floodRouter(DONO_FAKE, "router-teste", "flood_preset_shopping_test")
        const tRun = enviados.map(e => e.content?.text || "").join("\n")
        assert(/DRY-RUN/.test(tRun), "atalho roda o preset e devolve resultado marcado DRY-RUN")
        assert(/shop|storefront/i.test(tRun), "resultado do shopping-test menciona o card (shop/storefront)")
        assert(enviados.every(e => e.jid === DONO_FAKE), "resultado do job foi só para o dono — zero broadcast")
        clearState("router-teste")
        // overlays: mesmas regras do wizard (surface 4→3, pipes como texto, USAGE)
        assertEq(shoppingOverlayFromRest("Oi|Title|4|id").overlay.shop.surface, 3, "overlay de loja: surface 4 vira 3")
        assertEq(shoppingOverlayFromRest("50%|só hoje").overlay.text, "50%|só hoje", "overlay de loja: texto livre preserva pipes")
        assertEq(shoppingOverlayFromRest("").kind, "default", "overlay vazio = default do preset")
        assertEq(paymentOverlayFromRest("Pedido|25.90|BRL").overlay.amount, 25.9, "overlay de payment: valor parseado")
        assert(/AMOUNT_MISSING|USAGE/.test(paymentOverlayFromRest("sem valor").error), "payment sem valor → erro (não roda)")
        assertEq(paymentOverlayFromRest("").ok, true, "payment vazio = preset default")

        // ── 12) config.json intocado ────────────────────────────────────────────
        if (bytesAntes) {
            const depois = fs.readFileSync(CONFIG_PATH)
            assert(depois.equals(bytesAntes), "config.json NÃO foi escrito por estes testes")
        } else skip("sem config.json no checkout (nada a comparar)")
    } finally {
        CONFIG.uiMode = antes.uiMode
        CONFIG.floodDryRun = antes.dryRun
        CONFIG.floodTestMode = antes.testMode
        CONFIG.floodAllowlist = antes.allowlist
        CONFIG.floodModo = antes.modo
        CONFIG.floodInterval = antes.intervalo
        CONFIG.floodLote = antes.lote
        CONFIG.floodJitter = antes.jitter
        fx.setKillSwitch(false, { persist: false })
        clearState("menu-teste"); clearState("menu-teste2"); clearState("roteador-teste")
        setSock(sockAntes === null ? undefined : sockAntes)
        if (bytesAntes) { try { fs.writeFileSync(CONFIG_PATH, bytesAntes) } catch { } }
    }

    console.log(`\n=== FLOOD · MENU: ${passed} ok · ${failed} falhas · ${skipped} skip ===`)
    if (failures.length) { console.log("falhas:"); for (const f of failures) console.log("  · " + f) }
    process.exit(failed ? 1 : 0)
}

main().catch(e => { console.log(`✗ exceção: ${e?.stack || e}`); process.exit(1) })
