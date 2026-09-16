// features/statusManager/presets.js
// [v46] 🗂️ PRESETS DE STATUS — textos salvos para publicar rápido.
// Regra de papel (v46): qualquer ADM do bot pode POSTAR um preset (7 > 4);
// criar/apagar é restrito ao DONO (7 > 11). Persistência: dono/status_presets.json.

import fs from "fs"
import path from "path"
import { STATUS_LIMITS } from "./config.js"

const PRESETS_PATH = "./dono/status_presets.json"
const MAX_PRESETS = 30

let cache = null

function carregar() {
    if (cache) return cache
    try {
        const arr = JSON.parse(fs.readFileSync(PRESETS_PATH, "utf-8"))
        cache = Array.isArray(arr) ? arr : []
    } catch {
        cache = []
    }
    return cache
}

function salvar() {
    try {
        fs.mkdirSync(path.dirname(PRESETS_PATH), { recursive: true })
        fs.writeFileSync(PRESETS_PATH, JSON.stringify(cache, null, 2), "utf-8")
    } catch {}
}

export function listarStatusPresets() {
    return carregar().slice()
}

export function obterStatusPreset(idx1) {
    const n = parseInt(idx1, 10)
    if (!n || n < 1) return null
    return carregar()[n - 1] || null
}

// O texto aceita a MESMA sintaxe do status de texto ("... #1a8f3c #6"),
// validada na hora de criar o rascunho (criarDraftTexto do service.js).
export function criarStatusPreset(nome, texto) {
    nome = String(nome || "").trim().slice(0, 30)
    texto = String(texto || "").trim()
    if (!nome) return { ok: false, motivo: "Nome vazio" }
    if (!texto) return { ok: false, motivo: "Texto vazio" }
    if (texto.length > STATUS_LIMITS.maxTexto) return { ok: false, motivo: `Texto muito longo (máx ${STATUS_LIMITS.maxTexto} caracteres)` }
    const l = carregar()
    if (l.some(p => (p.nome || "").toLowerCase() === nome.toLowerCase())) return { ok: false, motivo: `Já existe um preset chamado "${nome}"` }
    if (l.length >= MAX_PRESETS) return { ok: false, motivo: `Máximo de ${MAX_PRESETS} presets` }
    l.push({ nome, texto, criadoEm: new Date().toISOString() })
    salvar()
    return { ok: true, total: l.length }
}

export function apagarStatusPreset(idx1) {
    const l = carregar()
    const n = parseInt(idx1, 10)
    if (!n || n < 1 || n > l.length) return { ok: false, motivo: "Número inválido" }
    const [rem] = l.splice(n - 1, 1)
    salvar()
    return { ok: true, nome: rem?.nome || "?", total: l.length }
}

function preview(texto) {
    return (texto || "")
        .replace(/\s+#(?:[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|\d{1,2})\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 38)
}

// Lista numerada — usada tanto para postar (adm/dono) quanto para apagar (dono)
export function statusPresetsTexto(acao = "postar") {
    const l = carregar()
    let t = `╭━━「 🗂️ 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 𝗗𝗘 𝗦𝗧𝗔𝗧𝗨𝗦 」━\n`
    t += `┃ ${l.length} preset(s) salvo(s)\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    if (!l.length) t += `(nenhum preset salvo)\n\n`
    l.forEach((p, i) => {
        t += `${String(i + 1).padStart(2, "0")} · ${p.nome}\n`
        t += `     _${preview(p.texto)}_\n`
    })
    t += `\n`
    if (acao === "apagar") t += `Digite o NÚMERO do preset para APAGAR.\n\n_0 = voltar · cancelar = sair_`
    else t += `Digite o NÚMERO do preset para\nadicionar à fila (5 = publicar).\n\n_0 = voltar · cancelar = sair_`
    return t
}

export function menuPresetGerenciarTexto() {
    const l = carregar()
    let t = `╭━━「 🗂️ 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 𝗗𝗢 𝗦𝗧𝗔𝗧𝗨𝗦 」\n`
    t += `┃ ${l.length} salvo(s) · 🔒 só dono\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `  1 · ➕ Criar preset\n`
    t += `  2 · 🗑️ Apagar preset\n`
    t += `  3 · 📋 Listar\n`
    t += `  0 · Voltar\n\n`
    t += `Preset = texto salvo para publicar\nrápido (aceita #cor e #fonte).\n\n👤 ADMs podem POSTAR (menu 7 > 4),\nmas só o DONO cria/apaga aqui.\n\n_cancelar = sair_`
    return t
}
