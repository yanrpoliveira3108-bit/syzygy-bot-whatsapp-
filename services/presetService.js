// services/presetService.js
// [NOVO] Presets de configuração (nome + bio + foto) para o comando 13.
// - Persistidos em ./dono/presets/presets.json
// - Fotos salvas em ./dono/presets/preset_<id>.jpg
// - Criados AUTOMATICAMENTE quando o usuário usa o 13 informando nome/bio/foto.

import fs from "fs"
import path from "path"

const PRESET_DIR = "./dono/presets"
const PRESET_JSON = path.join(PRESET_DIR, "presets.json")

function garantirDir() {
 try { fs.mkdirSync(PRESET_DIR, { recursive: true }) } catch {}
}

export function carregarPresets() {
 garantirDir()
 try {
 if (fs.existsSync(PRESET_JSON)) {
 const data = JSON.parse(fs.readFileSync(PRESET_JSON, "utf-8"))
 if (Array.isArray(data)) return data
        }
    } catch {}
 return []
}

function salvarPresets(lista) {
 garantirDir()
 try { fs.writeFileSync(PRESET_JSON, JSON.stringify(lista, null, 2), "utf-8") } catch {}
}

// Retorna o preset pelo índice 1-based (como aparece na lista pro usuário).
export function getPreset(indice1) {
 const lista = carregarPresets()
 const p = lista[indice1 - 1]
 if (!p) return null
 return { ...p, index: indice1 }
}

// Caminho da foto de um preset (se existir).
export function fotoPresetPath(preset) {
 if (preset?.foto && fs.existsSync(preset.foto)) return preset.foto
 return null
}

// Cria/salva um novo preset. bufferFoto (opcional) é gravado em disco.
// Retorna o preset salvo (com index 1-based).
export function salvarNovoPreset({ nome, bio, bufferFoto, mensagem }) {
 garantirDir()
 const lista = carregarPresets()
 const id = Date.now().toString(36)
 let fotoPath = null
 if (bufferFoto) {
 fotoPath = path.join(PRESET_DIR, `preset_${id}.jpg`)
 try { fs.writeFileSync(fotoPath, bufferFoto) } catch { fotoPath = null }
    }
 // [v52] mensagem também é persistida (4º campo do preset)
 const novo = { id, nome: nome || "", bio: bio || "", foto: fotoPath, mensagem: (mensagem || "").trim() || null }
 lista.push(novo)
 salvarPresets(lista)
 return { ...novo, index: lista.length }
}

// [NOVO] Apaga um preset pelo índice 1-based. Remove também a foto do disco.
// Retorna o preset apagado, ou null se não existir.
export function apagarPreset(indice1) {
    const lista = carregarPresets()
    const i = indice1 - 1
    if (i < 0 || i >= lista.length) return null
    const [removido] = lista.splice(i, 1)
    try { if (removido?.foto && fs.existsSync(removido.foto)) fs.unlinkSync(removido.foto) } catch {}
    salvarPresets(lista)
    return removido
}

// Texto formatado da lista de presets (para mostrar no WhatsApp).
export function listarPresetsTexto() {
 const lista = carregarPresets()
 if (lista.length === 0) return "_(nenhum preset salvo ainda)_"
 let out = ""
 lista.forEach((p, i) => {
 const temFoto = p.foto && fs.existsSync(p.foto) ? "" : "—"
 const nome = (p.nome || "(sem nome)").substring(0, 30)
 out += `  *${i + 1}* ${nome} ${temFoto}\n`
    })
 return out.trimEnd()
}
