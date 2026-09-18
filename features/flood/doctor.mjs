// features/flood/doctor.mjs
// [v53] Diagnóstico da feature de flood — SOMENTE LEITURA. Não envia, não grava.
//
// Rode na raiz do projeto:
//   node features/flood/doctor.mjs
//   node features/flood/doctor.mjs --preset payment-test
//   node features/flood/doctor.mjs --only payment,media
//   node features/flood/doctor.mjs --target 120363...@g.us      (valida as porteiras)
//   node features/flood/doctor.mjs --qtd 5 --overlay-text "oi|25,90|BRL"
//
// O que ele faz: carrega o MESMO config.json do bot, imprime o estado efetivo
// (kill switch, teto, ritmo, alvos mascarados, hard caps) e MONTA o conteúdo de
// cada preset sem enviar nada. É a checagem de migração antes de ligar o bot.
//
// Por que não existe mais "--dry-run do job": na v53 o conceito de dry-run saiu
// (não há um segundo modo de execução). Aqui o que prova que nada sai é o próprio
// arquivo: ele não importa sock, não importa runPresetJob e não tem sendMessage.

import { carregarConfig, CONFIG, MAX_FLOOD, FLOOD_MODOS, floodMaxEfetivo, FLOOD_TIPOS } from "../../utils/config.js"
import * as fx from "./index.js"
import { alvosValidos } from "./targets.js"

carregarConfig()

const argv = process.argv.slice(2)
const argOf = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null
}
const presetArg = argOf("preset")
const targetArg = argOf("target")
const onlyArg = (argOf("only") || "").split(",").map(s => s.trim()).filter(Boolean)
const qtdArg = Number(argOf("qtd")) || 3
const overlayText = argOf("overlay-text")

const hr = (t = "─") => console.log(t.repeat(66))
const line = (k, v) => console.log(`${String(k).padEnd(22)} ${v}`)

let problemas = 0
const alerta = (msg) => { problemas++; console.log(`  ⚠️ ${msg}`) }

hr()
console.log("SYZYGY · flood (v53) — diagnóstico · NENHUM ENVIO ACONTECE AQUI")
hr()
line("flood clássico", `MAX_FLOOD ${MAX_FLOOD} · teto efetivo ${floodMaxEfetivo()} msg/alvo (config.json#floodMaxMensagens)`)
line("ritmo atual", `${CONFIG.floodModo || "normal"} · ${CONFIG.floodInterval}ms · lote ${CONFIG.floodLote} · jitter ${CONFIG.floodJitter === true ? "sim" : "não"}`)
line("FLOOD_MODOS", Object.values(FLOOD_MODOS).map(m => m.label).join(" | "))
line("tipo padrão", fx.floodTipoLabel(CONFIG.floodTipo || FLOOD_TIPOS.TEXTO))
line("kill switch", fx.isKillSwitchOn()
    ? `⛔ LIGADO${fx.isKillSwitchPersisted() ? " (persistido em config.json — sobrevive a restart)" : " (só nesta execução)"}`
    : "desligado")
const rt = fx.getFloodRuntimeConfig()
line("runtime dos presets", `retries=${rt.maxRetries} · timeout=${rt.timeoutMs}ms · para no ${rt.errorStop}º erro seguido · ritmo adaptativo ${rt.paceAdaptativo ? "ligado" : "desligado"}`)
line("hard caps", `≤${fx.FLOOD_PRESET_HARD_CAP.maxMessages} msg · intervalo ≥${fx.FLOOD_PRESET_HARD_CAP.minInterval}ms · conc ≤${fx.FLOOD_PRESET_HARD_CAP.maxConcurrency} · cooldown ≥${fx.FLOOD_PRESET_HARD_CAP.minCooldown}ms · retries ≤${fx.FLOOD_PRESET_HARD_CAP.maxRetries}`)
const sel = fx.getFloodSelection()
line("alvos da sessão", fx.resumoAlvosTexto(sel))
line("grupos protegidos", `${alvosValidos.length} autorizados (gruposAutorizados) — o flood NUNCA atira neles`)
if (fx.isFloodEngineRunning()) {
    const info = fx.currentJobInfo()
    line("job em andamento", `${info?.presetId || "?"} · ${info?.sent ?? 0}/${info?.planned ?? "?"} · alvos ${info?.targets?.length ?? 0}`)
} else {
    line("job em andamento", "nenhum")
}
if (!sel.length) {
    console.log("  ℹ️ sem alvos escolhidos: os atalhos (paymenttest, 2/preset/…) recusam com NENHUM_ALVO.")
    console.log("     Isso é de propósito — o flood não amplia alvo sozinho. Escolha em 36 ou 2 → grupos.")
}
hr()
console.log("PRESETS (built-in + custom)")
hr()
for (const p of fx.listPresets()) {
    const res = fx.remainingCooldown(p.id, p.cooldown) // ms que faltam (0 = livre)
    console.log(`  ${p.id.padEnd(18)} ${String(p.type).padEnd(8)} ${p.maxMessages}x · ${String(p.interval).padStart(5)}ms · conc ${p.concurrency} · cd ${Math.round(p.cooldown / 1000)}s · to ${p.timeout}ms${res ? ` · ⏳ cooldown faltando ${Math.ceil(res / 1000)}s` : " · cd livre"}`)
}
hr()
console.log("CONTEÚDO MONTADO POR PRESET (payload de send, zero rede)")
hr()

const ctx = { from: CONFIG.ownerOverride ? `${String(CONFIG.ownerOverride).replace(/\D/g, "")}@s.whatsapp.net` : "0@s.whatsapp.net" }
const ids = presetArg ? [presetArg] : fx.listPresetIds()
for (const id of ids) {
    const def = fx.getPresetDef(id)
    if (!def) { alerta(`preset desconhecido: ${id}`); continue }
    if (onlyArg.length && !onlyArg.includes(def.type)) continue
    const overlay = overlayText ? { text: overlayText } : {}
    const carrega = fx.loadPreset(id, overlay)
    if (!carrega.ok) { alerta(`${id} → ${carrega.error}`); continue }
    let conteudo, erro = null
    try {
        conteudo = fx.buildPresetContent(carrega.preset, ctx)
    } catch (e) {
        erro = e?.code || e?.message || String(e)
    }
    if (erro) { alerta(`${id} → conteúdo não montou: ${erro}`); continue }
    const chaves = Object.keys(conteudo || {})
    const resumido = JSON.stringify(conteudo, (k, v) => (["image", "video", "document", "mimetype"].includes(k) ? `[${k} ${Buffer.isBuffer(v) ? `${v.length}B` : typeof v}]` : v))?.slice(0, 150)
    console.log(`  ✓ ${id.padEnd(18)} tipo=${def.type} · chaves=${chaves.join("+") || "—"} · ${qtdArg}x/${def.maxMessages} máx`)
    if (def.type === "mention") console.log("     (as menções entram no contextInfo por iteração — makeIterationBuilder — não no conteúdo base)")
    console.log(`     ${resumido}${resumido.length >= 150 ? "…" : ""}`)
    for (const w of carrega.warnings || []) console.log(`     ⚠️ ${w}`)
}
hr()
console.log("PORTEIRAS DE ALVO")
hr()
if (targetArg) {
    const norm = fx.normalizeTargetJid(targetArg)
    console.log(`  normalizeTargetJid(${targetArg}) → ${norm ? fx.maskJid(norm) : "null (formato inválido)"}`)
    if (norm) {
        const f = fx.filterTargets([norm])
        console.log(`  filterTargets → ${f.ok ? `APROVADO (${f.allowed.length})` : `BARRADO (${f.error})`}${f.blocked?.length ? ` · bloqueados: ${f.blocked.map(b => b.reason).join(",")}` : ""}`)
        console.log(`  protegido? ${fx.isProtectedGroupJid(norm) ? "SIM (bloqueado — é o grupo autorizado do dono)" : "não"}`)
    }
} else {
    console.log("  passe --target <jid> para conferir as porteiras de um destino específico.")
}
const dup = fx.extractTargetJids(["120363000000000000@g.us", { id: "120363000000000000@g.us" }, null])
console.log(`  extractTargetJids deduplica objeto/string e descarta vazio: ${dup.length === 1 ? "ok" : "FALHOU"}`)
hr()
console.log(fx.formatFloodSpeedMenu())
hr()
console.log("Nada foi enviado e nada foi escrito em disco. Para rodar de verdade:")
console.log("2 → flood no menu (wizard) ou paymenttest/2/preset/<id> no painel do dono (35-41).")
console.log("O envio é sempre executarFlood()/executarFloodLote() — a mesma porta do flood de texto.")
if (problemas) {
    console.log(`\n⚠️ ${problemas} problema(s) acima.`)
    process.exitCode = 1
}
