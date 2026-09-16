// features/statusManager/service.js
// [v41] 🫥 STATUS MANAGER — núcleo: rascunhos, audiência, publicação, cancelamento,
// visualização e registro de erros. Usa SOMENTE APIs reais da Baileys 7.0.0-rc14:
//   - sock.sendMessage("status@broadcast", conteudo, { statusJidList, backgroundColor, font })
//   - sock.updateStatusPrivacy("all" | "contacts" | "contact_blacklist" | "none")

import fs from "fs"
import path from "path"
import { getSock, rt } from "../../connection/socket.js"
import { isOwner, isAuthorizedUser, isAuthorizedUserWithMap, normalizeNumber, getOwnerNumber, getAllOwners, getAuthorizedUsers } from "../../utils/permissions.js"
import { getLidMap } from "../../services/lidResolver.js"
import { safeSendMessage } from "../../services/groupService.js"
import { err as errLog, ok, info } from "../../utils/terminalUI.js"
import {
    STATUS_CONFIG_PATH, STATUS_ERROS_PATH, STATUS_JID, STATUS_LIMITS,
    FONTES_VALIDAS, FONTES_STATUS, CORES_STATUS, STATUS_CONFIG_PADRAO
} from "./config.js"

// ============================================================
// ESTADO
// ============================================================
let config = { ...STATUS_CONFIG_PADRAO }

// Fila de rascunhos a publicar: { tipo: "texto"|"imagem"|"video", texto?, buffer?, caption?, font?, backgroundColor? }
let filaStatus = []
let publicando = false
let cancelarFlag = false

// ============================================================
// PERSISTÊNCIA
// ============================================================
function garantirDir() {
    try {
        const dir = path.dirname(STATUS_CONFIG_PATH)
        try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    } catch {}
}

export function carregarStatusConfig() {
    try {
        if (fs.existsSync(STATUS_CONFIG_PATH)) {
            const parsed = JSON.parse(fs.readFileSync(STATUS_CONFIG_PATH, "utf-8"))
            config = { ...STATUS_CONFIG_PADRAO, ...parsed }
            if (!Array.isArray(config.audienciaCustom)) config.audienciaCustom = []
            if (config.audienciaModo !== "custom") config.audienciaModo = "contatos"
            if (typeof config.audienciaKeyUltima !== "string") config.audienciaKeyUltima = null
        }
    } catch (e) {
        console.log(errLog(`[STATUS] falha ao carregar config: ${e.message}`))
        config = { ...STATUS_CONFIG_PADRAO }
    }
    return config
}

function salvarStatusConfig() {
    try {
        garantirDir()
        fs.writeFileSync(STATUS_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8")
    } catch (e) {
        console.log(errLog(`[STATUS] falha ao salvar config: ${e.message}`))
    }
}

carregarStatusConfig()

// ============================================================
// REGISTRO DE ERROS (dono/status_erros.json + histórico do bot)
// ============================================================
export function registrarErroStatus(tipo, mensagem, contexto = {}) {
    const registro = { ts: Date.now(), tipo, erro: String(mensagem).slice(0, 300), ...contexto }
    console.log(errLog(`[STATUS] erro (${tipo}): ${registro.erro}`))
    let lista = []
    try {
        if (fs.existsSync(STATUS_ERROS_PATH)) {
            lista = JSON.parse(fs.readFileSync(STATUS_ERROS_PATH, "utf-8"))
            if (!Array.isArray(lista)) lista = []
        }
    } catch { lista = [] }
    lista.push(registro)
    if (lista.length > STATUS_LIMITS.errosHistorico) lista = lista.slice(-STATUS_LIMITS.errosHistorico)
    try {
        garantirDir()
        fs.writeFileSync(STATUS_ERROS_PATH, JSON.stringify(lista, null, 2), "utf-8")
    } catch {}
    try {
        import("../../services/historicoService.js").then(({ registrarAcao }) =>
            registrarAcao("status_erro", { subject: `status ${tipo}`, erro: registro.erro })
        ).catch(() => {})
    } catch {}
    return registro
}

export function listarErrosStatus(qtd = 10) {
    try {
        if (!fs.existsSync(STATUS_ERROS_PATH)) return []
        const lista = JSON.parse(fs.readFileSync(STATUS_ERROS_PATH, "utf-8"))
        return Array.isArray(lista) ? lista.slice(-qtd).reverse() : []
    } catch { return [] }
}

// ============================================================
// AUTORIZAÇÃO — dono ou ADM autorizado (camada extra ao gate do messageHandler)
// ============================================================
export function podeGerenciarStatus(senderKey) {
    if (!senderKey) return false
    if (isOwner(senderKey)) return true
    try {
        if (isAuthorizedUserWithMap(senderKey, getLidMap())) return true
    } catch {}
    try {
        if (isAuthorizedUser(senderKey)) return true
    } catch {}
    return false
}

// ============================================================
// AUDIÊNCIA (mecanismo oficial: statusJidList — "Somente compartilhar com...")
// ============================================================
export function obterStatusConfig() { return { ...config, audienciaCustom: [...config.audienciaCustom] } }

function normalizarParaJid(entry) {
    // Aceita "5511...", "5511...@s.whatsapp.net", "5511...:12@..." → JID limpo
    let num = String(entry || "").trim()
    if (!num) return null
    if (num.includes("@s.whatsapp.net")) num = num.split("@")[0]
    num = num.split(":")[0].replace(/\D/g, "")
    if (num.length < 10 || num.length > 15) return null
    return `${num}@s.whatsapp.net`
}

export function definirAudienciaCustom(entries) {
    const jids = []
    const invalidos = []
    for (const e of entries) {
        const jid = normalizarParaJid(e)
        if (jid) { if (!jids.includes(jid)) jids.push(jid) }
        else invalidos.push(String(e).slice(0, 20))
    }
    if (!jids.length) {
        return { ok: false, invalidos, motivo: "Nenhum destinatário válido (use números com DDI+DDD, ex: 5511999999999)" }
    }
    if (jids.length > STATUS_LIMITS.maxAudiencia) {
        return { ok: false, invalidos, motivo: `Máximo ${STATUS_LIMITS.maxAudiencia} destinatários por publicação (recebi ${jids.length})` }
    }
    config.audienciaModo = "custom"
    config.audienciaCustom = jids
    salvarStatusConfig()
    return { ok: true, total: jids.length, jids, invalidos }
}

// ============================================================
// [v42] REGISTRO DE CONTATOS DO BOT
// Alimentado por: contacts.upsert (Baileys), participantes de grupos
// (lidResolver) e ADMs/donos. É o que torna o modo "contatos" REAL:
// a publicação sempre precisa de statusJidList com destinatários.
// ============================================================
export function registrarContatos(lista) {
    if (!Array.isArray(lista)) return 0
    const set = new Set(config.contatosConhecidos || [])
    const antes = set.size
    for (const item of lista) {
        const bruto = typeof item === "object" ? (item.phoneNumber || item.id || "") : item
        const jid = normalizarParaJid(bruto)
        if (jid) set.add(jid)
    }
    let arr = [...set]
    if (arr.length > STATUS_LIMITS.maxContatos) arr = arr.slice(0, STATUS_LIMITS.maxContatos)
    config.contatosConhecidos = arr
    const novos = arr.length - antes
    if (novos > 0) salvarStatusConfig()
    return novos
}

export function construirListaContatos() {
    const set = new Set(config.contatosConhecidos || [])
    // Dono + donos extras + ADMs autorizados sempre entram
    try {
        set.add(`${getOwnerNumber()}@s.whatsapp.net`)
        for (const n of getAllOwners()) set.add(`${n}@s.whatsapp.net`)
        for (const n of getAuthorizedUsers()) set.add(`${n}@s.whatsapp.net`)
    } catch {}
    // Telefones mapeados via LID (participantes dos grupos do bot)
    try {
        const map = getLidMap()
        for (const phone of Object.keys(map.phoneToLid || {})) {
            const jid = normalizarParaJid(phone)
            if (jid) set.add(jid)
        }
    } catch {}
    return [...set].filter(Boolean).slice(0, STATUS_LIMITS.maxAudiencia)
}

export function totalContatosConhecidos() {
    return (config.contatosConhecidos || []).length
}

// ============================================================
// [v42] IMPORTAR MEMBROS DE UM GRUPO COMO AUDIÊNCIA
// GRUPOS não podem ser audiência de Status (regra do WhatsApp).
// Alternativa REAL: usar os MEMBROS do grupo (JIDs individuais)
// como lista personalizada via statusJidList.
// ============================================================
export async function importarMembrosGrupo(groupJid) {
    try {
        let participants = rt().cachedGroups?.[groupJid]?.participants
        if (!Array.isArray(participants) || !participants.length) {
            const meta = await getSock().groupMetadata(groupJid)
            participants = meta?.participants || []
            // guarda no cache p/ próximas importações
            try {
                if (rt().cachedGroups?.[groupJid]) rt().cachedGroups[groupJid].participants = participants
            } catch {}
        }
        if (!Array.isArray(participants) || !participants.length) {
            return { ok: false, motivo: "Não foi possível obter os participantes do grupo" }
        }
        const { resolverLidParaPhone, atualizarMapaDeParticipantes } = await import("../../services/lidResolver.js")
        // alimenta o mapa LID<->telefone com o que o grupo fornecer (id+lid juntos)
        try { atualizarMapaDeParticipantes(participants) } catch {}

        const comTelefone = []   // "55...@s.whatsapp.net"
        const soLid = []         // "NNNN@lid" — endereço REAL do WhatsApp (device LID)
        for (const p of participants) {
            const id = String(p?.id || p?.jid || "")
            const lid = typeof p?.lid === "string" && p.lid.endsWith("@lid") ? p.lid : (id.endsWith("@lid") ? id : "")
            const phoneJid = id.endsWith("@s.whatsapp.net") ? normalizarParaJid(id) : null
            if (phoneJid) {
                if (!comTelefone.includes(`${phoneJid}`)) comTelefone.push(`${phoneJid}`)
                continue
            }
            // Participante só com @lid: resolve pelo mapa; se não der, usa o @lid direto
            const phone = lid ? resolverLidParaPhone(lid) : null
            if (phone) {
                const jid = `${normalizarParaJid(phone)}`
                if (jid && !comTelefone.includes(jid)) comTelefone.push(jid)
            } else if (lid) {
                if (!soLid.includes(lid)) soLid.push(lid)
            }
        }

        const totalMembros = participants.length
        console.log(info("STATUS", `import ${groupJid}: ${totalMembros} membros -> ${comTelefone.length} telefone(s) + ${soLid.length} @lid direto${soLid.length ? ` (ex: ${soLid[0]})` : ""}`))

        // Prioriza telefones; @lid direto entra como destinatário real (o WhatsApp
        // entrega por LID — é o endereço que o próprio grupo usa no modo LID).
        const jids = [...comTelefone, ...soLid]
        if (!jids.length) {
            return { ok: false, motivo: "Grupo sem participantes utilizáveis" }
        }
        const truncado = jids.length > STATUS_LIMITS.maxAudiencia
        const final = truncado ? jids.slice(0, STATUS_LIMITS.maxAudiencia) : jids
        config.audienciaModo = "custom"
        config.audienciaCustom = final
        salvarStatusConfig()
        return { ok: true, total: final.length, totalMembros, comTelefone: comTelefone.length, apenasLid: Math.min(soLid.length, Math.max(0, STATUS_LIMITS.maxAudiencia - comTelefone.length)), truncado }
    } catch (e) {
        registrarErroStatus("importar_membros", e.message, { groupJid })
        return { ok: false, motivo: e.message }
    }
}

export function usarAudienciaContatos() {
    config.audienciaModo = "contatos"
    salvarStatusConfig()
    return { ok: true }
}

export function limparAudienciaCustom() {
    config.audienciaCustom = []
    if (config.audienciaModo === "custom") config.audienciaModo = "contatos"
    salvarStatusConfig()
    return { ok: true }
}

// ============================================================
// PRIVACIDADE PADRÃO DA CONTA (API pública updateStatusPrivacy)
// ============================================================
const PRIV_VALORES = new Set(["all", "contacts", "contact_blacklist", "none"])

export async function definirPrivacidadePadrao(valor) {
    if (!PRIV_VALORES.has(valor)) {
        return { ok: false, motivo: "Valor inválido. Use: all, contacts, contact_blacklist ou none" }
    }
    try {
        const sock = getSock()
        if (!sock?.updateStatusPrivacy) {
            return { ok: false, motivo: "Esta versão da Baileys não expõe updateStatusPrivacy" }
        }
        await sock.updateStatusPrivacy(valor)
        config.privacidadePadrao = valor
        salvarStatusConfig()
        return { ok: true, valor }
    } catch (e) {
        registrarErroStatus("privacidade", e.message, { valor })
        return { ok: false, motivo: e.message }
    }
}

// ============================================================
// RASCUNHOS (fila)
// ============================================================
function corValida(cor) {
    if (typeof cor !== "string") return null
    const c = cor.trim().toLowerCase()
    if (CORES_STATUS[c]) return CORES_STATUS[c]
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(cor.trim())) return cor.trim()
    return null
}

function fonteValida(f) {
    const n = parseInt(f)
    return FONTES_VALIDAS.has(n) ? n : null
}

export function criarDraftTexto(texto, { font, cor } = {}) {
    if (!texto || !String(texto).trim()) return { ok: false, motivo: "Texto vazio" }
    let corpo = String(texto).trim()
    // Sintaxe oficial do módulo: sufixos opcionais no final — "#1a8f3c" (cor) e "#2" (fonte).
    // O parsing vive AQUI (fonte única), o stateHandler apenas repassa o texto bruto.
    let corExtraida = cor
    let fonteExtraida = font
    // Ordem da sintaxe: "texto #cor #fonte" (fonte é sempre o último token).
    // Por isso extraímos a FONTE primeiro, depois a COR.
    const mFonte = corpo.match(/\s#(\d{1,2})\s*$/)
    if (mFonte) { fonteExtraida = mFonte[1]; corpo = corpo.slice(0, mFonte.index).trim() }
    const mCor = corpo.match(/\s(#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?)\s*$/)
    if (mCor) { corExtraida = mCor[1]; corpo = corpo.slice(0, mCor.index).trim() }
    if (corpo.length > STATUS_LIMITS.maxTexto) {
        return { ok: false, motivo: `Texto muito longo (máx ${STATUS_LIMITS.maxTexto} caracteres)` }
    }
    const fonte = fonteExtraida != null ? (fonteValida(fonteExtraida) ?? config.fontePadrao) : config.fontePadrao
    const fundo = (corExtraida != null && corValida(corExtraida)) || config.corPadrao
    filaStatus.push({ tipo: "texto", texto: corpo, font: fonte, backgroundColor: fundo })
    return { ok: true, total: filaStatus.length }
}

export function criarDraftMidia(tipo, buffer, caption = "", mimetype = null) {
    if (!["imagem", "video"].includes(tipo)) return { ok: false, motivo: "Tipo de mídia não suportado para status" }
    if (!buffer || !buffer.length) return { ok: false, motivo: "Mídia vazia" }
    const limite = tipo === "video" ? STATUS_LIMITS.maxVideoBytes : STATUS_LIMITS.maxImagemBytes
    if (buffer.length > limite) {
        return { ok: false, motivo: `Arquivo muito grande (${Math.round(buffer.length / 1024 / 1024)}MB, máx ${Math.round(limite / 1024 / 1024)}MB)` }
    }
    filaStatus.push({ tipo, buffer, caption: String(caption || "").slice(0, STATUS_LIMITS.maxTexto), mimetype: mimetype || null })
    return { ok: true, total: filaStatus.length }
}

export function obterFila() { return filaStatus.map(f => ({ ...f, buffer: undefined })) }

export function limparFila() {
    const total = filaStatus.length
    filaStatus = []
    return total
}

// ============================================================
// [v44] ROTAÇÃO DA CHAVE DO STATUS (sender-key de status@broadcast)
// POR QUÊ (verificado no fonte rc14): a mensagem de status é cifrada com UMA
// sender-key por conta; o statusJidList só controla quem recebe a SKDM (a
// chave). Quem já recebeu a chave numa publicação anterior (ex.: modo
// "contatos do bot") continuaria enxergando publicações futuras com listas
// menores — exatamente o "aparece pra todo mundo" relatado.
// Rotacionar a chave => só a audiência atual recebe a chave NOVA e consegue
// ver os NOVOS statuses (statuses antigos já entregues não têm como revogar).
// ============================================================
async function rotacionarChaveStatus() {
    try {
        const sock = getSock()
        const auth = sock?.authState
        if (!auth?.keys?.set || !auth?.creds?.me) return false
        const patch = { "sender-key": {}, "sender-key-memory": {} }
        const addVariant = (jid) => {
            if (!jid || typeof jid !== "string" || !jid.includes("@")) return
            const [userDev, domain] = jid.split("@")
            const [num, dev] = userDev.split(":")
            if (!num) return
            // variações (com/sem domínio, device real/0) — anular id inexistente é inofensivo
            for (const id of [num, domain ? `${num}@${domain}` : num]) {
                patch["sender-key"][`status@broadcast::${id}::${dev || 0}`] = null
                patch["sender-key"][`status@broadcast::${id}::0`] = null
            }
        }
        // Para status a Baileys usa a identidade LID quando existe (addressing mode),
        // senão o PN — cobrimos as duas.
        addVariant(auth.creds.me?.lid || sock?.user?.lid ? (auth.creds.me?.lid || sock?.user?.lid) : null)
        addVariant(auth.creds.me?.id || sock?.user?.id)
        patch["sender-key-memory"]["status@broadcast"] = {}
        await auth.keys.set(patch)
        console.log(info("STATUS", `chave do status ROTACIONADA (${Object.keys(patch["sender-key"]).length} variantes limpas) — audiência anterior perde acesso aos novos statuses`))
        return true
    } catch (e) {
        registrarErroStatus("rotacionar_chave", e.message, {})
        return false
    }
}

function hashAudiencia(lista) {
    return [...lista].sort().join("|")
}

// ============================================================
// PUBLICAR / CANCELAR
// ============================================================
function montarConteudo(item) {
    if (item.tipo === "texto") {
        const conteudo = { text: item.texto }
        return { conteudo, opts: { backgroundColor: item.backgroundColor, font: item.font } }
    }
    if (item.tipo === "imagem") {
        const conteudo = { image: item.buffer }
        if (item.mimetype) conteudo.mimetype = item.mimetype
        if (item.caption) conteudo.caption = item.caption
        return { conteudo, opts: {} }
    }
    if (item.tipo === "video") {
        const conteudo = { video: item.buffer }
        if (item.mimetype) conteudo.mimetype = item.mimetype
        if (item.caption) conteudo.caption = item.caption
        return { conteudo, opts: {} }
    }
    throw new Error(`Tipo de status desconhecido: ${item.tipo}`)
}

export async function publicarStatus() {
    const sock = getSock()
    if (!sock) return { ok: false, motivo: "Bot não conectado" }
    if (publicando) return { ok: false, motivo: "Já existe uma publicação em andamento" }
    if (!filaStatus.length) return { ok: false, motivo: "Nenhum status na fila. Crie um rascunho primeiro (opção 1, 2 ou 3)" }

    publicando = true
    cancelarFlag = false
    // [v42] CORREÇÃO REAL: sem statusJidList o relayMessage para status@broadcast
    // "sucede", mas nenhum dispositivo recebe a sender-key → ninguém vê o status.
    // Portanto SEMPRE publicamos com statusJidList:
    //  - modo custom  → lista definida pelo dono
    //  - modo contatos → registro de contatos do bot (+ dono/ADMs + mapa LID)
    let avisoAudiencia = null
    const audienciaCustom = config.audienciaModo === "custom" && config.audienciaCustom.length > 0
    let statusJidList
    if (audienciaCustom) {
        statusJidList = [...config.audienciaCustom]
    } else {
        statusJidList = construirListaContatos()
        if (!statusJidList.length) statusJidList = [`${getOwnerNumber()}@s.whatsapp.net`]
        // construirListaContatos sempre inclui dono/ADMs — o aviso é quando o
        // REGISTRO de contatos está vazio (audiência = só dono/ADMs):
        if (totalContatosConhecidos() === 0) {
            avisoAudiencia = "Registro de contatos vazio — publicando só para dono/ADMs. Importe membros de um grupo (menu 7 > 9 > 4) para ampliar a audiência."
        }
    }

    // [v44] Audiência mudou desde a última publicação => rotaciona a chave do
    // status para que a audiência ANTERIOR não veja os novos statuses.
    const chaveAtual = hashAudiencia(statusJidList)
    if (chaveAtual !== (config.audienciaKeyUltima ?? null)) {
        await rotacionarChaveStatus()
    }

    const resultados = []
    const filaAtual = [...filaStatus]
    try {
        for (let i = 0; i < filaAtual.length; i++) {
            if (cancelarFlag) {
                resultados.push({ tipo: filaAtual[i].tipo, ok: false, cancelado: true })
                continue
            }
            const item = filaAtual[i]
            try {
                const { conteudo, opts } = montarConteudo(item)
                const optsFinais = { ...opts }
                if (statusJidList) optsFinais.statusJidList = statusJidList
                await sock.sendMessage(STATUS_JID, conteudo, optsFinais)
                resultados.push({ tipo: item.tipo, ok: true })
                const amostra = statusJidList.slice(0, 3).join(", ")
                console.log(ok(`[STATUS] ${item.tipo} publicado -> ${statusJidList.length} destinatário(s) [${amostra}${statusJidList.length > 3 ? ", ..." : ""}]`))
                try {
                    const { registrarAcao } = await import("../../services/historicoService.js")
                    registrarAcao("status_publicado", { subject: `status ${item.tipo}`, audiencia: statusJidList ? `custom:${statusJidList.length}` : "contatos" })
                } catch {}
            } catch (e) {
                registrarErroStatus(item.tipo, e.message, { audiencia: statusJidList ? `custom:${statusJidList.length}` : "contatos" })
                resultados.push({ tipo: item.tipo, ok: false, erro: e.message })
            }
            if (i < filaAtual.length - 1 && !cancelarFlag) {
                await new Promise(r => setTimeout(r, STATUS_LIMITS.delayEntreEnvios))
            }
        }
    } finally {
        // Publicados (ok) saem da fila; cancelados/falhas também são descartados
        // (falhas ficam registradas no log de erros — recriar pelo menu se preciso).
        filaStatus = []
        publicando = false
        cancelarFlag = false
        // [v44] Guarda a audiência efetivamente usada (mesmo com falhas parciais,
        // a chave já foi distribuída para essa lista).
        config.audienciaKeyUltima = chaveAtual
        salvarStatusConfig()
    }

    const publicados = resultados.filter(r => r.ok).length
    const cancelados = resultados.filter(r => r.cancelado).length
    const falhas = resultados.filter(r => !r.ok && !r.cancelado).length
    return { ok: true, publicados, cancelados, falhas, resultados, aviso: avisoAudiencia, audiencia: audienciaCustom ? `custom:${statusJidList.length}` : `contatos:${statusJidList.length}` }
}

export function cancelarPublicacao() {
    let cancelouEmAndamento = false
    if (publicando) {
        cancelarFlag = true
        cancelouEmAndamento = true
    }
    const descartados = filaStatus.length
    filaStatus = []
    return { cancelouEmAndamento, descartados }
}

export function statusEmAndamento() { return publicando }

// ============================================================
// VISUALIZAÇÃO
// ============================================================
export function verConfigTexto() {
    const modoTxt = config.audienciaModo === "custom"
        ? `LISTA PERSONALIZADA (${config.audienciaCustom.length} destinatário(s))`
        : `CONTATOS DO BOT (${totalContatosConhecidos()} registrados)`
    let t = `╭━━「 🫥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 」\n`
    t += `┃ ⚑ CONFIGURAÇÃO ATUAL\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `👥 Audiência: ${modoTxt}\n`
    if (config.audienciaModo === "custom") {
        const mostra = config.audienciaCustom.slice(0, 8).map(j => `• ${j.split("@")[0]}`).join("\n")
        t += `${mostra}${config.audienciaCustom.length > 8 ? `\n• ... +${config.audienciaCustom.length - 8} outros` : ""}\n`
    }
    t += `🔒 Privacidade padrão da conta: ${config.privacidadePadrao || "(não alterada)"}\n`
    t += `🎨 Fonte padrão: ${FONTES_STATUS[config.fontePadrao] || config.fontePadrao} · Cor: ${config.corPadrao}\n`
    t += `📋 Fila de publicação: ${filaStatus.length} rascunho(s)${filaStatus.length ? ` (${filaStatus.map(f => f.tipo).join(", ")})` : ""}\n`
    t += `🔄 Publicação em andamento: ${publicando ? "SIM" : "NÃO"}\n\n`
    t += `⚙️ Publicação SEMPRE usa lista de destinatários\n   (statusJidList — mecanismo oficial do WhatsApp).\n\n`
    t += `_status · statusconfig · statuspublicar · statuscancelar_\n`
    t += `SYZYGY`
    return t
}

export function verErrosTexto(qtd = 5) {
    const lista = listarErrosStatus(qtd)
    if (!lista.length) return "🫥 STATUS MANAGER — ERROS\n━━━━━━━━━━━━━━━━━━━━\n✅ Nenhum erro registrado."
    let txt = `🫥 STATUS MANAGER — ÚLTIMOS ERROS\n━━━━━━━━━━━━━━━━━━━━\n`
    for (const e of lista) {
        const d = new Date(e.ts)
        const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
        txt += `⏱ ${hora} · ${e.tipo}: ${e.erro}\n`
    }
    txt += `\nLog completo: dono/status_erros.json`
    return txt
}

export { safeSendMessage, STATUS_JID, FONTES_STATUS, CORES_STATUS }
