// features/flood/doctor.mjs
// [INFRA FLOOD] Diagnóstico da infraestrutura de presets — SOMENTE LEITURA.
//
// Rode no terminal, na raiz do projeto:
//   node features/flood/doctor.mjs
//   node features/flood/doctor.mjs --preset payment-test --qtd 3
//   node features/flood/doctor.mjs --target 120363...@g.us     (valida as porteiras dele)
//   node features/flood/doctor.mjs --only shopping,text
//
// O que ele faz: carrega o MESMO config.json do bot (carregarConfig), mostra o
// estado efetivo (kill switch, allowlist mascarada, limites, velocidade) e roda
// um DRY-RUN de cada tipo de preset. Não envia nada: sem sendMessage, sem
// sessão, sem escrita em disco. É a forma de conferir a migração antes de ligar
// o bot.
//
// Por que o dry-run usa um executor que ESTOURA se for chamado: assim o próprio
// doctor prova que nenhum caminho de envio foi tocado.

import { carregarConfig, CONFIG, MAX_FLOOD, FLOOD_MODOS } from "../../utils/config.js"
import { getAllowlist, maskJid } from "./allowlist.js"
import { isKillSwitchOn } from "./killswitch.js"
import { getFloodRuntimeConfig, FLOOD_PRESET_HARD_CAP, listPresetIds, getPresetDef, clampPresetLimits } from "./config.js"
import { listPresets } from "./presets/index.js"
import { formatFloodSpeedMenu } from "./speed.js"
import { runPresetJob } from "./presetEngine.js"
import { getAuthorizedGroups } from "../../utils/permissions.js"

carregarConfig()

const argv = process.argv.slice(2)
function argOf(name) {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null
}
const presetArg = argOf("preset")
const targetArg = argOf("target")
const qtdArg = Number(argOf("qtd")) || 3
const onlyArg = (argOf("only") || "").split(",").map(s => s.trim()).filter(Boolean)

const hr = (t = "─") => console.log(t.repeat(64))
const line = (k, v) => console.log(`${String(k).padEnd(22)} ${v}`)

hr()
console.log("SYZYGY · flood presets — diagnóstico (nenhum envio acontece aqui)")
hr()
line("MAX_FLOOD (clássico)", MAX_FLOOD)
line("velocidade atual", `${CONFIG.floodModo || "normal"} · ${CONFIG.floodInterval}ms · lote ${CONFIG.floodLote} · jitter ${CONFIG.floodJitter === true ? "sim" : "não"}`)
console.log(`FLOOD_MODOS            ${Object.values(FLOOD_MODOS).map(m => m.label).join(" | ")}`)
console.log(`kill switch            ${isKillSwitchOn() ? "⛔ LIGADO (nada é enviado)" : "desligado"}`)
const rt = getFloodRuntimeConfig()
console.log(`runtime                dryRun=${rt.dryRun} · testMode=${rt.testMode} · retries=${rt.maxRetries} · timeout=${rt.timeoutMs}ms`)
console.log(`hard caps              maxMessages=${FLOOD_PRESET_HARD_CAP.maxMessages} · intervalo≥${FLOOD_PRESET_HARD_CAP.minInterval}ms · conc≤${FLOOD_PRESET_HARD_CAP.maxConcurrency} · cooldown≥${FLOOD_PRESET_HARD_CAP.minCooldown}ms · retries≤${FLOOD_PRESET_HARD_CAP.maxRetries}`)
const al = getAllowlist()
console.log(`allowlist              ${al.length ? al.map(maskJid).join(", ") : "⚠️ VAZIA — todo destino de preset fica bloqueado"}`)
const gruposProtegidos = getAuthorizedGroups().length
console.log(`grupos protegidos      ${gruposProtegidos} (isAuthorizedGroup — preset nenhum dispara neles)`)
hr()
console.log("PRESETS")
hr()
for (const p of listPresets()) {
    console.log(`  ${p.id.padEnd(16)} ${String(p.type).padEnd(9)} ${p.maxMessages}x · ${p.interval}ms · conc ${p.concurrency} · cooldown ${Math.round(p.cooldown / 1000)}s · timeout ${p.timeout}ms`)
}
const custom = CONFIG.floodCustomPresets
if (Array.isArray(custom) && custom.length) {
    console.log(`  custom persistidos:  ${custom.map(c => `${c.id}(${c.type})`).join(", ")}`)
}
hr()
console.log("DRY-RUN (conteúdo validado, zero envio)")
hr()

const executorQueNaoDeveRodar = async () => {
    throw new Error("DRY-RUN TOCOU O EXECUTOR — bug grave")
}
const alvos = targetArg ? [targetArg] : (al.length ? [al[0]] : [])
const ids = presetArg ? [presetArg] : listPresetIds()
for (const id of ids) {
    const def = getPresetDef(id)
    if (!def) {
        console.log(`  ✗ ${id} — preset desconhecido`)
        continue
    }
    if (onlyArg.length && !onlyArg.includes(def.type)) continue
    const r = await runPresetJob({
        presetId: id,
        targets: alvos,
        qtd: qtdArg,
        dryRun: true,
        executor: executorQueNaoDeveRodar
    })
    if (!r.ok && r.error) {
        console.log(`  ⚠️ ${id.padEnd(16)} ${r.error}${r.remainingMs ? ` (faltam ${Math.ceil(r.remainingMs / 1000)}s)` : ""}${r.blocked?.length ? ` · bloqueados: ${r.blocked.join(", ")}` : ""}`)
        continue
    }
    const keys = r.results?.[0]?.keys || []
    const wire = r.results?.[0]?.wire ? ` · ${r.results[0].wire}` : ""
    console.log(`  ✓ ${id.padEnd(16)} tipo=${r.type} · payload=${JSON.stringify(keys)} · alvos=${r.targets.join(",") || "(nenhum)"} · planejado=${r.metrics.planned}x${wire}`)
    for (const w of r.presetExtra?.warnings || []) console.log(`     ⚠️ ${w}`)
}
hr()
console.log(formatFloodSpeedMenu())
hr()
console.log("Sem envio, sem escrita em disco. Para ligar de verdade: use o wizard")
console.log("flood do bot (o preset entra pelo mesmo executarFlood).")
process.exit(0)
