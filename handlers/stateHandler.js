// handlers/stateHandler.js
// [REORGANIZAÇÃO] Tratador de estados (input texto/imagem) + processarSelecaoGrupo.
// [v22] Multi-seleção, flood em ondas, agendamento, limpeza, histórico, anti-takeover.

import fs from "fs"
import path from "path"

import { getSock, rt } from "../connection/socket.js"
import { setState, clearState, getState } from "../utils/stateManager.js"
import { CONFIG, MENU_IMAGE_PATH, MAX_FLOOD, salvarConfig, FLOOD_MODOS } from "../utils/config.js"
import { info, ok, warn } from "../utils/terminalUI.js"
import { isOwner } from "../utils/permissions.js"
import { STATUS_MENU_MAP } from "../features/statusManager/index.js"
// [SHOPPING] TIPO de conteúdo do flood. Só conteúdo/validação/envio pontual:
// laço, fila, throttle e permissões continuam sendo os do flood existente.
import {
    detectShoppingTrigger,
    resolveShoppingSend,
    shoppingPromptText,
    makeFloodContentBuilder,
    describeSendWire,
    SHOPPING_LIMITS
} from "../features/flood/index.js"

import {
    alterarNomeGrupo, alterarBioGrupo,
    alterarFotoGrupoBuffer, alterarFotoGrupoURL,
    alterarTudoGrupo, executarNuke, removerFotoGrupo, executarFlood,
    executarFloodLote, nukeComPreset, nukeComPresetLote,
    roubarGrupo, roubarGrupoLote, getFloodConfig
} from "../services/groupService.js"
import {
    detectarImagem, validarTamanho, baixarMidiaMensagem,
    prepararFotoBuffer, isValidHttpUrl
} from "../services/mediaService.js"
import {
    enviarVoltar, enviarCancelavel, listarGruposInterativo, enviarMenuAcoesGrupo,
    enviarMenuMultiAcoes, enviarMenuFloodModos
} from "../menus/groupMenu.js"
import { enviarPainelInicial } from "../menus/mainMenu.js"

function resolveGrupoDeTexto(cache, raw) {
    const cacheKeys = Object.keys(cache).map(k => parseInt(k)).filter(k => !isNaN(k))
    const rawLower = (raw || "").toLowerCase()
    let entry = null, selectedIdx = null
    const numMatch = raw.match(/^0*(\d+)$/)
    if (numMatch) {
        const n = parseInt(numMatch[1])
        if (cache[n]) { entry = cache[n]; selectedIdx = n }
    }
    if (!entry && raw && raw.length >= 2) {
        const matches = []
        for (const idx of cacheKeys) {
            const g = cache[idx]
            if (g.subject && g.subject.toLowerCase().includes(rawLower)) matches.push({ idx, ...g })
        }
        if (matches.length === 1) {
            entry = matches[0]; selectedIdx = matches[0].idx
        } else if (matches.length > 1) {
            return { multiple: matches }
        }
    }
    if (!entry) return null
    return { entry, selectedIdx }
}

function parseMultiSelecao(cache, raw) {
    const txt = (raw || "").trim()
    if (!txt) return null
    // Se for só um número (com zeros à esquerda), não é multi
    if (/^0*\d+$/.test(txt)) return null
    // Precisa ter separador e só conter dígitos, vírgula, espaço, traço
    if (!/^[\d,\s-]+$/.test(txt)) return null
    // Precisa ter pelo menos 2 números ou um range
    const allNums = (txt.match(/\d+/g) || []).map(n => parseInt(n)).filter(n => !isNaN(n) && n > 0)
    if (allNums.length < 2) return null

    // Normaliza e expande ranges
    const normalized = txt.replace(/,/g, " ").replace(/\s+/g, " ").trim()
    const tokens = normalized.split(" ").filter(Boolean)
    const nums = new Set()
    for (const tok of tokens) {
        if (tok.includes("-")) {
            const parts = tok.split("-").map(s => s.trim()).filter(Boolean)
            if (parts.length === 2) {
                const a = parseInt(parts[0].replace(/\D/g, "")), b = parseInt(parts[1].replace(/\D/g, ""))
                if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
                    const start = Math.min(a, b), end = Math.max(a, b)
                    const limit = Math.min(end, start + 99) // max 100 por range
                    for (let i = start; i <= limit; i++) nums.add(i)
                }
            }
        } else {
            const n = parseInt(tok.replace(/\D/g, ""))
            if (!isNaN(n) && n > 0) nums.add(n)
        }
    }
    if (nums.size < 2) return null
    const entries = []
    const invalid = []
    for (const n of nums) {
        if (cache[n]) entries.push({ ...cache[n], index: n })
        else invalid.push(n)
    }
    const uniq = []
    const seen = new Set()
    for (const e of entries) {
        if (!seen.has(e.id)) { seen.add(e.id); uniq.push(e) }
    }
    if (uniq.length < 2) return null
    return { entries: uniq, invalid }
}

export async function handleEstado(chatJid, ownerKey, st, text, imgInfo, m) {
    const sock = getSock()

    // Config menu
    if (st.action === "config_menu" && text) {
        const { CONFIG_OPCOES } = await import("../menus/configMenu.js")
        const { roteadorAcoes } = await import("../commands/commandRouter.js")
        const escolha = text.trim().replace(/\D/g, "")
        const acao = CONFIG_OPCOES[escolha]
        if (acao) {
            clearState(ownerKey)
            await roteadorAcoes(chatJid, ownerKey, acao)
            // [v45] Menu de config/dono PERSISTENTE: se a ação executada não
            // definiu um novo estado (espera de input), o usuário volta ao menu
            // de configuração em vez de ficar "solto" (0/11/34 = sair p/ menu principal).
            if (acao !== "abrir_painel" && !getState(ownerKey)) {
                setState(ownerKey, { action: "config_menu" })
            }
            return true
        }
        if (!st.avisouConfig) {
            setState(ownerKey, { action: "config_menu", avisouConfig: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. Digite 1-11 (config), 12-35 (dono) ou 0 = voltar (cancelar = sair)." })
        }
        return true
    }

    // Nome/Bio simples
    if (st.action === "waiting_name" && text) {
        try { await alterarNomeGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Nome atualizado.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_both_name" && text) {
        try {
            await alterarNomeGrupo(st.groupJid, text)
            setState(ownerKey, { action: "waiting_both_bio", groupJid: st.groupJid })
            await enviarCancelavel(chatJid, "📄 Digite a nova bio:")
        } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`); clearState(ownerKey) }
        return true
    }
    if (st.action === "waiting_bio" && text) {
        try { await alterarBioGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Bio atualizada.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_both_bio" && text) {
        try { await alterarBioGrupo(st.groupJid, text); await enviarVoltar(chatJid, "✅ Nome + Bio atualizados.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        clearState(ownerKey); return true
    }
    if (st.action === "waiting_group_image") {
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Imagem muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (!raw || raw.length === 0) throw new Error("Vazia")
                await alterarFotoGrupoBuffer(st.groupJid, raw)
                await enviarVoltar(chatJid, "✅ Foto do grupo atualizada.")
            } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem JPG, PNG ou WEBP." }); return true }
        return true
    }
    if (st.action === "waiting_image_url") {
        if (text && isValidHttpUrl(text)) {
            try { await alterarFotoGrupoURL(st.groupJid, text); await enviarVoltar(chatJid, "✅ Foto atualizada.") }
            catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ URL inválida." }); return true }
        return true
    }
    if (st.action === "waiting_menu_image") {
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (!raw || raw.length === 0) throw new Error("Vazia")
                const buf = await prepararFotoBuffer(raw)
                try { fs.mkdirSync(path.dirname(MENU_IMAGE_PATH), { recursive: true }) } catch {}
                fs.writeFileSync(MENU_IMAGE_PATH, buf)
                CONFIG.menuImage = MENU_IMAGE_PATH; salvarConfig()
                await enviarVoltar(chatJid, "✅ Imagem do menu atualizada.")
            } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
            clearState(ownerKey); return true
        }
        if (text) { await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem." }); return true }
        return true
    }

    // Flood single - mensagem
    // [SHOPPING] "loja:" / "shop:" / "shopping:" escolhe o TIPO de conteúdo do
    // flood dentro do MESMO wizard (sem menu novo, sem fila, sem executor novo).
    // Sem gatilho, cada linha abaixo é o flood clássico de sempre.
    if (st.action === "waiting_flood_message" && text) {
        const loja = detectShoppingTrigger(text)
        if (loja.isShopping) {
            const r = resolveShoppingSend(loja.rest, { delivery: loja.delivery })
            if (!r.ok) {
                // 1ª tentativa errada: prompt completo da loja. Depois disso só o
                // erro — o dono precisa de resposta em TODA tentativa, senão o
                // wizard parece travado.
                if (!st.avisouLoja) {
                    setState(ownerKey, { ...st, avisouLoja: true })
                    await enviarCancelavel(chatJid, `⚠️ ${r.code}\n${r.message}\n\n${shoppingPromptText()}`)
                } else {
                    await sock.sendMessage(chatJid, { text: `⚠️ ${r.code}: ${r.message}` })
                }
                return true
            }
            setState(ownerKey, {
                action: "waiting_flood_amount",
                groupJid: st.groupJid,
                selectedGroup: st.selectedGroup,
                floodMessage: r.content.text,
                floodKind: "shopping",
                floodContent: r.content,
                floodWarnings: r.warnings || []
            })
            const av = (r.warnings || []).length ? `\n\n⚠️ ${r.warnings.join("\n⚠️ ")}` : ""
            await enviarCancelavel(chatJid, `🛍️ *TIPO LOJA pronto*\n${r.summary}${av}\n\nDigite a *quantidade* (máx ${MAX_FLOOD}):`)
            return true
        }
        setState(ownerKey, { action: "waiting_flood_amount", groupJid: st.groupJid, floodMessage: text, selectedGroup: st.selectedGroup })
        await enviarCancelavel(chatJid, `Digite a *quantidade* (máx ${MAX_FLOOD}):`)
        return true
    }
    // Flood single - quantidade -> vai para escolha de modo (ondas)
    if (st.action === "waiting_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Quantidade invalida." }); return true }
        const q = Math.min(qtd, MAX_FLOOD)
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: q, groupJid: st.groupJid, floodMessage: st.floodMessage, floodKind: st.floodKind, floodContent: st.floodContent, floodWarnings: st.floodWarnings })
        return true
    }
    // Flood single - modo
    if (st.action === "waiting_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido", "rápido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else {
                if (!st.avisouModo) {
                    setState(ownerKey, { ...st, avisouModo: true })
                    await sock.sendMessage(chatJid, { text: "Modo inválido. Digite 1-4 ou intervalo (ex: 200), ou 0 para usar config atual." })
                }
                return true
            }
        }
        clearState(ownerKey)
        // [SHOPPING] tipo de conteúdo: o mesmo executarFlood, com um builder de
        // conteúdo por iteração. floodKind ausente/text → comportamento idêntico ao
        // de sempre ({ text: corpo }).
        const ehLoja = st.floodKind === "shopping" && !!st.floodContent
        let msgFlood = st.floodMessage
        if (CONFIG.linkDivulgacao) {
            if (ehLoja) {
                const comLink = `${msgFlood} · ${CONFIG.linkDivulgacao}`
                // Link NA MESMA LINHA: o hook global de "Ler Mais" (connection/socket.js)
                // enche de ~4000 U+034F qualquer content.text multi-linha, e isso não
                // pode entrar no corpo de um card de loja. Se não couber no limite, o
                // link é omitido (o card é maior que o rodapé de divulgação).
                if (comLink.length <= SHOPPING_LIMITS.body) msgFlood = comLink
            } else {
                msgFlood += `\n${CONFIG.linkDivulgacao}`
            }
        }
        const builder = ehLoja ? makeFloodContentBuilder(st.floodContent) : null
        const avisosLoja = (st.floodWarnings || []).length ? `\n⚠️ ${st.floodWarnings.join("\n⚠️ ")}` : ""
        await sock.sendMessage(chatJid, { text: `Enviando ${st.floodQtd} msgs em modo ${cfg.modo} (${cfg.intervalo}ms/lote${cfg.lote})...${ehLoja ? `\nTIPO: 🛍️ loja (shopStorefrontMessage)` : ""}` })
        try {
            const r = await executarFlood(st.groupJid, msgFlood, st.floodQtd, cfg, builder)
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("flood", { id: st.groupJid, subject: st.selectedGroup?.subject || st.groupJid, qtd: r.total, modo: r.modo, ok: r.ok, tipo: ehLoja ? "shopping" : "text" })
            let resFlood = `Flood finalizado.\nModo: ${r.modo} | ${r.intervalo}ms/lote${r.lote}\nEnviadas: ${r.ok}/${r.total}${r.erros ? `\nFalhas: ${r.erros}` : ""}`
            if (ehLoja) resFlood += `\n${describeSendWire(st.floodContent)}${avisosLoja}`
            await enviarVoltar(chatJid, resFlood)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Link divulgação
    if (st.action === "config_set_link" && text) {
        const v = text.trim()
        if (v.toLowerCase() === "remover") {
            CONFIG.linkDivulgacao = ""; salvarConfig()
            await enviarVoltar(chatJid, "Link/numero removido.")
        } else {
            CONFIG.linkDivulgacao = v; salvarConfig()
            await enviarVoltar(chatJid, `Link/numero salvo:\n${v}`)
        }
        clearState(ownerKey); return true
    }

    // Preset apagar
    if (st.action === "preset_apagar" && text) {
        const n = parseInt(text.trim().replace(/\D/g, ""))
        const { apagarPreset } = await import("../services/presetService.js")
        const removido = isNaN(n) ? null : apagarPreset(n)
        if (removido) {
            await enviarVoltar(chatJid, `Preset ${n} apagado: ${removido.nome || "(sem nome)"}`)
        } else {
            await enviarVoltar(chatJid, "Preset invalido / nao encontrado.")
        }
        clearState(ownerKey); return true
    }

    // Criar preset
    if (st.action === "preset_novo_nome" && text) {
        setState(ownerKey, { action: "preset_novo_bio", presetNome: text })
        await enviarCancelavel(chatJid, "Digite a bio:")
        return true
    }
    if (st.action === "preset_novo_bio" && text) {
        setState(ownerKey, { action: "preset_novo_img", presetNome: st.presetNome, presetBio: text })
        await enviarCancelavel(chatJid, "Envie a imagem (ou digite PULAR):")
        return true
    }
    if (st.action === "preset_novo_img") {
        let bufferFoto = null
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "Imagem muito grande."); clearState(ownerKey); return true }
            // [v52] Falha no download NÃO é mais silenciosa (antes: preset era
            // salvo SEM foto sem avisar — causa da "imagem que não aplica").
            try {
                const raw = await baixarMidiaMensagem(m)
                if (raw && raw.length) bufferFoto = raw
                else { await sock.sendMessage(chatJid, { text: "⚠️ Não consegui baixar a imagem. Envie novamente ou digite PULAR." }); return true }
            } catch (e) {
                await sock.sendMessage(chatJid, { text: `⚠️ Falha ao baixar imagem (${e.message}). Envie novamente ou digite PULAR.` })
                return true
            }
        } else if (text && text.trim().toLowerCase() !== "pular") {
            await sock.sendMessage(chatJid, { text: "Envie uma imagem, ou digite PULAR." })
            return true
        }
        // [v52] 4º campo: MENSAGEM do preset (usada no ROUBAR/NUKE)
        setState(ownerKey, { action: "preset_novo_msg", presetNome: st.presetNome, presetBio: st.presetBio, presetBufferFoto: bufferFoto })
        await enviarCancelavel(chatJid, "Agora a MENSAGEM que o preset envia no grupo\n(usada no Roubar/Nuke):\n\nDigite a mensagem ou PULAR:")
        return true
    }
    if (st.action === "preset_novo_msg") {
        const mensagem = (text && text.trim().toLowerCase() === "pular") ? null : (text || "").trim() || null
        const bufferFoto = st.presetBufferFoto || null
        const nome = st.presetNome, bio = st.presetBio
        clearState(ownerKey)
        try {
            const { salvarNovoPreset } = await import("../services/presetService.js")
            const preset = salvarNovoPreset({ nome, bio, bufferFoto, mensagem })
            await enviarVoltar(chatJid, `Preset ${preset.index} criado e salvo.\nNome: ${nome}\nBio: ${bio}\nImagem: ${bufferFoto ? "OK" : "—"}\nMensagem: ${mensagem ? "OK" : "—"}\nUse no comando 3.`)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Roubar single preset
    if (st.action === "waiting_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (/^0+$/.test(text.trim()) || escolha === "0") {
            dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) {
                if (!st.avisouRP) {
                    setState(ownerKey, { action: "waiting_roubar_preset", groupJid: st.groupJid, grupoSubject: st.grupoSubject, avisouRP: true })
                    await sock.sendMessage(chatJid, { text: "Preset invalido. Digite o numero de um preset ou 0 para usar a config. (cancelar)" })
                }
                return true
            }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `Roubando o grupo: ${st.grupoSubject}...` })
        try {
            // [v52] mensagem: a do PRESET (se configurada) ou o link de divulgação
            const msgRoubar = dados.mensagem || CONFIG.linkDivulgacao || null
            if (msgRoubar) {
                try {
                    if (CONFIG.marcarFantasma) {
                        const { mencionarTodosFantasma } = await import("../services/groupService.js")
                        await mencionarTodosFantasma(st.groupJid, msgRoubar)
                    } else {
                        await sock.sendMessage(st.groupJid, { text: msgRoubar })
                    }
                    await new Promise(r => setTimeout(r, 120))
                } catch {}
            }
            const r = await roubarGrupo(st.groupJid, dados)
            const mk = (b) => b ? "OK" : "-"
            // [v58] motivo REAL dos erros no WhatsApp e no terminal (nada engolido)
            const detalhe = r.erros.length ? `\n⚠️ ${r.erros.slice(0, 3).join(" · ").slice(0, 220)}` : ""
            console.log(r.erros.length
                ? warn(`[ROUBAR] ${st.grupoSubject} · rebaixados=${r.rebaixados} · foto=${r.foto ? "OK" : "FALHA"} · nome=${r.nome ? "OK" : "-"} · bio=${r.bio ? "OK" : "-"} · erros: ${r.erros.join(" | ").slice(0, 160)}`)
                : ok(`[ROUBAR] ${st.grupoSubject} · rebaixados=${r.rebaixados} · foto=OK · nome=OK · bio=OK · trancado`))
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("roubar", { id: st.groupJid, subject: st.grupoSubject, rebaixados: r.rebaixados, ok: true })
            await enviarVoltar(chatJid,
                `Grupo ROUBADO: ${st.grupoSubject}\n` +
                `Admins rebaixados: ${r.rebaixados}\n` +
                `Fechado: ${mk(r.fechado)} | Edicao restrita: ${mk(r.editRestrito)}\n` +
                `Foto: ${mk(r.foto)} Nome: ${mk(r.nome)} Bio: ${mk(r.bio)}` +
                detalhe
            )
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Preset + Nuke single
    if (st.action === "waiting_tudo_preset" && text) {
        const escolha = text.trim()
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        if (/^0+$/.test(escolha)) {
            setState(ownerKey, { action: "waiting_tudo_name", groupJid: st.groupJid })
            await enviarCancelavel(chatJid, "🆕 NOVO PRESET\n\nDigite o *nome* do grupo:")
            return true
        }
        const n = parseInt(escolha.replace(/\D/g, ""))
        const preset = isNaN(n) ? null : getPreset(n)
        if (!preset) {
            if (!st.avisouPreset) {
                setState(ownerKey, { action: st.action, groupJid: st.groupJid, avisouPreset: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Preset inválido. Digite o *número* de um preset ou *0* para criar novo. (cancelar para sair)" })
            }
            return true
        }
        setState(ownerKey, {
            action: "waiting_tudo_msg",
            groupJid: st.groupJid,
            presetNome: preset.nome,
            presetBio: preset.bio,
            presetFoto: fotoPresetPath(preset),
            presetMensagem: preset.mensagem || null
        })
        const linkInfo = CONFIG.linkDivulgacao ? `\n(o link "${CONFIG.linkDivulgacao}" sera anexado)` : ""
        await enviarCancelavel(chatJid, `Digite a MENSAGEM para enviar no grupo ANTES de banir todos.${linkInfo}\n\nOu digite PULAR para nao enviar mensagem.`)
        return true
    }
    if (st.action === "waiting_tudo_msg") {
        clearState(ownerKey)
        const link = CONFIG.linkDivulgacao || ""
        const semMsg = text && text.trim().toLowerCase() === "pular"
        try {
            if (!semMsg) {
                const corpo = (text && text.trim().length ? text.trim() : "") + (link ? `\n\n${link}` : "")
                if (corpo.trim().length) {
                    if (CONFIG.marcarFantasma) {
                        const { mencionarTodosFantasma } = await import("../services/groupService.js")
                        await mencionarTodosFantasma(st.groupJid, corpo)
                    } else {
                        await sock.sendMessage(st.groupJid, { text: corpo })
                    }
                    await new Promise(r => setTimeout(r, 120))
                }
            }
            await sock.sendMessage(chatJid, { text: "Aplicando preset + NUKE..." })
            // [v52] mensagem do preset é enviada ANTES do nuke (igual ao lote)
            const msgPreset = st.presetMensagem || st.presetMsg || null
            if (msgPreset) {
                try {
                    if (CONFIG.marcarFantasma) { const { mencionarTodosFantasma } = await import("../services/groupService.js"); await mencionarTodosFantasma(st.groupJid, msgPreset) }
                    else await sock.sendMessage(st.groupJid, { text: msgPreset })
                    await new Promise(r => setTimeout(r, 120))
                } catch {}
            }
            const r = await nukeComPreset(st.groupJid, { nome: st.presetNome, bio: st.presetBio, fotoPath: st.presetFoto, bufferFoto: st.presetBufferFoto })
            const mk = (b) => b ? "OK" : "-"
            const detalheN = r.erros.length ? `\n⚠️ ${r.erros.slice(0, 3).join(" · ").slice(0, 220)}` : ""
            console.log(r.erros.length
                ? warn(`[NUKE] ${st.grupoSubject} · removidos=${r.removidos} · foto=${r.foto ? "OK" : "FALHA"} · erros: ${r.erros.join(" | ").slice(0, 160)}`)
                : ok(`[NUKE] ${st.grupoSubject} · removidos=${r.removidos} · foto=OK · nome=OK · bio=OK`))
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("nuke", { id: st.groupJid, preset: st.presetNome, removidos: r.removidos, ok: true })
            await enviarVoltar(chatJid, `Preset aplicado + NUKE\nFoto: ${mk(r.foto)} Nome: ${mk(r.nome)} Bio: ${mk(r.bio)}\nFechado: ${mk(r.fechado)} | Removidos: ${r.removidos}${detalheN}`)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }
    if (st.action === "waiting_tudo_name" && text) {
        setState(ownerKey, { action: "waiting_tudo_bio", groupJid: st.groupJid, tudoNome: text })
        await enviarCancelavel(chatJid, "📄 Agora digite a nova *bio*:")
        return true
    }
    if (st.action === "waiting_tudo_bio" && text) {
        setState(ownerKey, { action: "waiting_tudo_image", groupJid: st.groupJid, tudoNome: st.tudoNome, tudoBio: text })
        await enviarCancelavel(chatJid, "📷 Agora *envie a imagem* (ou digite PULAR para sem foto):")
        return true
    }
    if (st.action === "waiting_tudo_image") {
        let bufferFoto = null
        if (imgInfo) {
            if (!validarTamanho(imgInfo.size)) { await enviarVoltar(chatJid, "❌ Imagem muito grande."); clearState(ownerKey); return true }
            try {
                const raw = await baixarMidiaMensagem(m)
                if (raw && raw.length > 0) bufferFoto = raw
            } catch {}
        } else if (text && text.trim().toLowerCase() !== "pular") {
            await sock.sendMessage(chatJid, { text: "⚠️ Envie uma imagem, ou digite PULAR." })
            return true
        }
        try {
            const { salvarNovoPreset } = await import("../services/presetService.js")
            const preset = salvarNovoPreset({ nome: st.tudoNome, bio: st.tudoBio, bufferFoto })
            await sock.sendMessage(chatJid, { text: `Preset ${preset.index} salvo.` })
            setState(ownerKey, {
                action: "waiting_tudo_msg",
                groupJid: st.groupJid,
                presetNome: st.tudoNome,
                presetBio: st.tudoBio,
                presetBufferFoto: bufferFoto
            })
            const linkInfo = CONFIG.linkDivulgacao ? `\n(o link "${CONFIG.linkDivulgacao}" sera anexado)` : ""
            await enviarCancelavel(chatJid, `Digite a MENSAGEM para enviar no grupo ANTES de banir todos.${linkInfo}\n\nOu digite PULAR para nao enviar mensagem.`)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`); clearState(ownerKey) }
        return true
    }

    // [v22] MULTI-SELEÇÃO: group_menu agora aceita 1,3,5 ou 1-5
    if (st.action === "group_menu" && text) {
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const raw = text.trim()

        const pagMatch = raw.match(/^(?:pag|p)\s*(\d+)$/i)
        if (pagMatch) {
            const novoCache = await listarGruposInterativo(chatJid, parseInt(pagMatch[1]))
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }
        if (raw === "0") { clearState(ownerKey); await enviarPainelInicial(chatJid); return true }

        // Tenta multi primeiro (1,3,5 ou 1-5)
        const multi = parseMultiSelecao(cache, raw)
        if (multi && multi.entries && multi.entries.length >= 2) {
            if (multi.invalid && multi.invalid.length) {
                await sock.sendMessage(chatJid, { text: `⚠️ Alguns números não existem: ${multi.invalid.slice(0, 10).join(", ")}\nUsando só os válidos (${multi.entries.length}).` })
            }
            const { isAuthorizedGroup: isAuthG2 } = await import("../utils/permissions.js")
            const protegidos2 = multi.entries.filter(e => isAuthG2(e.id))
            const atacaveis2 = multi.entries.filter(e => !isAuthG2(e.id))
            if (protegidos2.length) {
                await sock.sendMessage(chatJid, { text: `🛡️ ${protegidos2.length} protegido(s) ignorado(s):\n${protegidos2.map(g => `• ${g.subject}`).join("\n")}` })
            }
            const alvo2 = atacaveis2.length ? atacaveis2 : multi.entries
            // Se todos protegidos, ainda mostra menu mas com aviso (o service vai bloquear)
            await enviarMenuMultiAcoes(chatJid, alvo2, ownerKey)
            return true
        }

        const res = resolveGrupoDeTexto(cache, raw)
        if (res && res.multiple) {
            let txt = `🔍 Encontrei ${res.multiple.length} grupos com "${raw}":\n\n`
            res.multiple.slice(0, 10).forEach(mm => {
                const b = mm.isAdmin ? "👑" : "👤"
                txt += `[${String(mm.idx).padStart(3, "0")}] ${b} ${mm.subject}\n`
            })
            txt += `\n_Digite o número exato do grupo desejado_\n_Para multi: 1,3,5 ou 1-5_`
            await sock.sendMessage(chatJid, { text: txt })
            return true
        }
        if (!res) {
            if (!st.avisouNaoEncontrado) {
                setState(ownerKey, { action: "group_menu", avisouNaoEncontrado: true })
                await sock.sendMessage(chatJid, {
                    text: `⚠️ Grupo não encontrado.\n\nDigite o *número* (ex: 01, 07), parte do *nome*, ou multi (1,3,5 / 1-5).\nDigite *cancelar* para sair.`
                })
            }
            return true
        }
        await enviarMenuAcoesGrupo(chatJid, res.entry, ownerKey)
        return true
    }

    if (st.action === "group_action_menu" && text) {
        const raw = text.trim()
        const escolha = raw.replace(/\D/g, "")
        const grupo = st.selectedGroup || { id: st.groupJid, subject: "?", isAdmin: false }
        if (escolha === "1") { await processarSelecaoGrupo(chatJid, ownerKey, "waiting_flood_message", grupo); return true }
        if (escolha === "2") { await processarSelecaoGrupo(chatJid, ownerKey, "waiting_tudo_name", grupo); return true }
        if (escolha === "3") { await processarSelecaoGrupo(chatJid, ownerKey, "roubar_grupo", grupo); return true }
        if (escolha === "4") {
            setState(ownerKey, { action: "group_agendar_tipo", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `⏰ AGENDAR AÇÃO\nGrupo: ${grupo.subject}\n\nO que agendar?\n  1 · FLOOD\n  2 · PRESET + NUKE\n  3 · ROUBAR GRUPO\n\n0 = voltar`)
            return true
        }
        if (escolha === "0" || raw.toLowerCase() === "voltar") { clearState(ownerKey); await enviarPainelInicial(chatJid); return true }
        if (!st.avisouAcao) {
            setState(ownerKey, { action: "group_action_menu", groupJid: st.groupJid, selectedGroup: st.selectedGroup, avisouAcao: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1=Flood · 2=Preset+NUKE · 3=Roubar · 4=Agendar · 0=Voltar" })
        }
        return true
    }

    // [v22] Multi ação menu
    if (st.action === "group_multi_action" && text) {
        const raw = text.trim()
        const escolha = raw.replace(/\D/g, "")
        const grupos = st.multiGroups || []
        if (!grupos.length) { clearState(ownerKey); await enviarVoltar(chatJid, "Seleção expirada."); return true }
        if (escolha === "1") {
            setState(ownerKey, { action: "multi_flood_message", multiGroups: grupos })
            await enviarCancelavel(chatJid, `Digite a mensagem para FLOOD em ${grupos.length} grupos. _Loja: loja:0 · loja:texto · loja:texto|title|surface|id_`)
            return true
        }
        if (escolha === "2") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_tudo_preset", multiGroups: grupos })
            await enviarCancelavel(chatJid, `💣 MULTI PRESET + NUKE\n${grupos.length} grupos\n\n${listarPresetsTexto()}\n\nDigite o número do preset ou 0 para config padrão:`)
            return true
        }
        if (escolha === "3") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_roubar_preset", multiGroups: grupos })
            await enviarCancelavel(chatJid, `ROUBAR EM LOTE\n${grupos.length} grupos\n\n${listarPresetsTexto()}\n\nDigite o número do preset ou 0 para config padrão:`)
            return true
        }
        if (escolha === "4") {
            setState(ownerKey, { action: "multi_agendar_tipo", multiGroups: grupos })
            await enviarCancelavel(chatJid, `⏰ AGENDAR EM LOTE\n${grupos.length} grupos\n\nO que agendar?\n  1 · FLOOD\n  2 · PRESET + NUKE\n  3 · ROUBAR\n\n0 = voltar`)
            return true
        }
        if (escolha === "0" || raw.toLowerCase() === "voltar") {
            const cache = rt().groupSelectionCache[ownerKey]
            if (cache) {
                setState(ownerKey, { action: "group_menu" })
                await listarGruposInterativo(chatJid)
            } else {
                clearState(ownerKey); await enviarPainelInicial(chatJid)
            }
            return true
        }
        if (!st.avisouMulti) {
            setState(ownerKey, { ...st, avisouMulti: true })
            await sock.sendMessage(chatJid, { text: "Opção inválida. 1=Flood lote · 2=Nuke lote · 3=Roubar lote · 4=Agendar lote · 0=Voltar" })
        }
        return true
    }

    // Multi flood
    if (st.action === "multi_flood_message" && text) {
        const loja = detectShoppingTrigger(text)
        if (loja.isShopping) {
            const r = resolveShoppingSend(loja.rest, { delivery: loja.delivery })
            if (!r.ok) {
                if (!st.avisouLoja) {
                    setState(ownerKey, { ...st, avisouLoja: true })
                    await enviarCancelavel(chatJid, `⚠️ ${r.code}\n${r.message}\n\n${shoppingPromptText()}`)
                } else {
                    await sock.sendMessage(chatJid, { text: `⚠️ ${r.code}: ${r.message}` })
                }
                return true
            }
            setState(ownerKey, {
                action: "multi_flood_amount",
                multiGroups: st.multiGroups,
                floodMessage: r.content.text,
                floodKind: "shopping",
                floodContent: r.content,
                floodWarnings: r.warnings || []
            })
            const av = (r.warnings || []).length ? `\n\n⚠️ ${r.warnings.join("\n⚠️ ")}` : ""
            await enviarCancelavel(chatJid, `🛍️ *TIPO LOJA pronto* (${st.multiGroups.length} grupos)\n${r.summary}${av}\n\nQtd para ${st.multiGroups.length} grupos (máx ${MAX_FLOOD} cada):`)
            return true
        }
        setState(ownerKey, { action: "multi_flood_amount", multiGroups: st.multiGroups, floodMessage: text })
        await enviarCancelavel(chatJid, `Qtd para ${st.multiGroups.length} grupos (máx ${MAX_FLOOD} cada):`)
        return true
    }
    if (st.action === "multi_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Quantidade invalida." }); return true }
        const q = Math.min(qtd, MAX_FLOOD)
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: q, multiGroups: st.multiGroups, floodMessage: st.floodMessage, multi: true, floodKind: st.floodKind, floodContent: st.floodContent, floodWarnings: st.floodWarnings })
        return true
    }
    if (st.action === "multi_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else {
                if (!st.avisouModo) {
                    setState(ownerKey, { ...st, avisouModo: true })
                    await sock.sendMessage(chatJid, { text: "Modo inválido. 1-4 ou intervalo custom, ou 0." })
                }
                return true
            }
        }
        const grupos = st.multiGroups
        clearState(ownerKey)
        const ehLoja = st.floodKind === "shopping" && !!st.floodContent
        let msgFlood = st.floodMessage
        if (CONFIG.linkDivulgacao) {
            if (ehLoja) {
                const comLink = `${msgFlood} · ${CONFIG.linkDivulgacao}`
                if (comLink.length <= SHOPPING_LIMITS.body) msgFlood = comLink
            } else {
                msgFlood += `\n${CONFIG.linkDivulgacao}`
            }
        }
        const builderLote = ehLoja ? makeFloodContentBuilder(st.floodContent) : null
        await sock.sendMessage(chatJid, { text: `Flood em lote: ${grupos.length} grupos, ${st.floodQtd} msgs cada, modo ${cfg.modo}...${ehLoja ? " [TIPO LOJA]" : ""}` })
        try {
            const resultados = await executarFloodLote(grupos, msgFlood, st.floodQtd, builderLote ? { ...cfg, buildContent: builderLote } : cfg)
            const okG = resultados.filter(r => r.ok).length
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("flood_lote", { grupos: grupos.length, qtd: st.floodQtd, modo: cfg.modo, okGrupos: okG })
            let txt = `Flood lote finalizado: ${okG}/${grupos.length} grupos OK\n`
            resultados.slice(0, 10).forEach(r => { txt += `${r.ok ? "✅" : "❌"} ${r.subject}: ${r.ok ? `${r.ok}/${r.total}` : r.erro}\n` })
            if (resultados.length > 10) txt += `... +${resultados.length - 10} outros\n`
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Multi nuke preset
    if (st.action === "multi_tudo_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) {
            dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) {
                if (!st.avisouPreset) {
                    setState(ownerKey, { ...st, avisouPreset: true })
                    await sock.sendMessage(chatJid, { text: "Preset inválido. Digite número válido ou 0." })
                }
                return true
            }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "multi_tudo_msg", multiGroups: st.multiGroups, presetDados: dados })
        const linkInfo = CONFIG.linkDivulgacao ? `\n(link "${CONFIG.linkDivulgacao}" será anexado)` : ""
        await enviarCancelavel(chatJid, `Mensagem para enviar ANTES do NUKE em ${st.multiGroups.length} grupos?${linkInfo}\n\nDigite a mensagem ou PULAR:`)
        return true
    }
    if (st.action === "multi_tudo_msg") {
        const semMsg = text && text.trim().toLowerCase() === "pular"
        // [v52] PULAR sem mensagem digitada → usa a MENSAGEM DO PRESET (se houver)
        const corpoBase = semMsg ? (st.presetDados?.mensagem || "") : (text?.trim() || "")
        const link = CONFIG.linkDivulgacao || ""
        const mensagemFinal = corpoBase + (corpoBase && link ? `\n\n${link}` : link ? link : "")
        const grupos = st.multiGroups
        const dados = st.presetDados
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `Aplicando PRESET + NUKE em ${grupos.length} grupos...` })
        try {
            const resultados = await nukeComPresetLote(grupos, dados, { mensagem: mensagemFinal || null })
            const okG = resultados.filter(r => r.ok).length
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("nuke_lote", { grupos: grupos.length, okGrupos: okG, preset: dados.nome })
            let txt = `NUKE lote: ${okG}/${grupos.length} OK\n`
            resultados.forEach(r => { txt += `${r.ok ? "✅" : "❌"} ${r.subject}: ${r.ok ? `removidos ${r.removidos}` : r.erro}\n` })
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // Multi roubar preset
    if (st.action === "multi_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) {
            dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        } else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) {
                if (!st.avisouRP) {
                    setState(ownerKey, { ...st, avisouRP: true })
                    await sock.sendMessage(chatJid, { text: "Preset inválido. Digite número ou 0." })
                }
                return true
            }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        const grupos = st.multiGroups
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `Roubando ${grupos.length} grupos...` })
        try {
            const resultados = await roubarGrupoLote(grupos, dados, { mensagem: dados.mensagem || CONFIG.linkDivulgacao || null })
            const okG = resultados.filter(r => r.ok).length
            const { registrarAcao } = await import("../services/historicoService.js")
            registrarAcao("roubar_lote", { grupos: grupos.length, okGrupos: okG, preset: dados.nome })
            let txt = `ROUBAR lote: ${okG}/${grupos.length} OK\n`
            resultados.forEach(r => { txt += `${r.ok ? "✅" : "❌"} ${r.subject}: ${r.ok ? `rebaixados ${r.rebaixados}` : r.erro}\n` })
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `Erro: ${e.message}`) }
        return true
    }

    // [v22] Agendamento single
    if (st.action === "group_agendar_tipo" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        // [v40] Fallback: estado sem selectedGroup não derruba o fluxo (usa groupJid).
        const grupo = st.selectedGroup || { id: st.groupJid, subject: st.groupJid, isAdmin: false }
        if (escolha === "1") {
            setState(ownerKey, { action: "agendar_flood_message", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `Agendar FLOOD em ${grupo.subject}\nDigite a mensagem:`)
            return true
        }
        if (escolha === "2") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "agendar_tudo_preset", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `Agendar NUKE em ${grupo.subject}\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
            return true
        }
        if (escolha === "3") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "agendar_roubar_preset", groupJid: grupo.id, selectedGroup: grupo })
            await enviarCancelavel(chatJid, `Agendar ROUBAR em ${grupo.subject}\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
            return true
        }
        if (escolha === "0") { await enviarMenuAcoesGrupo(chatJid, grupo, ownerKey); return true }
        await sock.sendMessage(chatJid, { text: "Opção inválida. 1=Flood 2=Nuke 3=Roubar 0=Voltar" })
        return true
    }

    if (st.action === "agendar_flood_message" && text) {
        setState(ownerKey, { action: "agendar_flood_amount", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: text })
        await enviarCancelavel(chatJid, `Qtd de mensagens (máx ${MAX_FLOOD}):`)
        return true
    }
    if (st.action === "agendar_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Qtd inválida." }); return true }
        setState(ownerKey, { action: "agendar_flood_modo", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: Math.min(qtd, MAX_FLOOD), groupJid: st.groupJid, floodMessage: st.floodMessage })
        // Reaproveita o handler de modo? Vamos tratar agendar_flood_modo separado
        // O estado já foi setado para agendar_flood_modo, mas enviarMenuFloodModos seta waiting_flood_modo. Corrige:
        setState(ownerKey, { action: "agendar_flood_modo", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        return true
    }
    if (st.action === "agendar_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else { await sock.sendMessage(chatJid, { text: "Modo inválido. 1-4 ou intervalo." }); return true }
        }
        setState(ownerKey, { action: "agendar_tempo", tipo: "flood", groupJid: st.groupJid, selectedGroup: st.selectedGroup, floodMessage: st.floodMessage, floodQtd: st.floodQtd, floodCfg: cfg })
        await enviarCancelavel(chatJid, `Quando executar?\nEx: 10m, 1h, 30s, 20:30, 25/08 20:00\n(cancelar para sair)`)
        return true
    }
    if (st.action === "agendar_tudo_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "agendar_tudo_msg", groupJid: st.groupJid, selectedGroup: st.selectedGroup, presetDados: dados })
        await enviarCancelavel(chatJid, `Mensagem antes do NUKE? Digite ou PULAR:`)
        return true
    }
    if (st.action === "agendar_tudo_msg") {
        const semMsg = text && text.trim().toLowerCase() === "pular"
        const corpo = semMsg ? (st.presetDados?.mensagem || "") : (text?.trim() || "")
        setState(ownerKey, { action: "agendar_tempo", tipo: "nuke", groupJid: st.groupJid, selectedGroup: st.selectedGroup, presetDados: st.presetDados, mensagem: corpo })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "agendar_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "agendar_tempo", tipo: "roubar", groupJid: st.groupJid, selectedGroup: st.selectedGroup, presetDados: dados })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "agendar_tempo" && text) {
        const { parseAgendamento, agendarAcao } = await import("../services/agendaService.js")
        const parsed = parseAgendamento(text.trim())
        if (!parsed) {
            await sock.sendMessage(chatJid, { text: "Formato inválido. Use: 10m, 1h, 30s, 20:30, 25/08 20:00" })
            return true
        }
        const grupo = { id: st.groupJid, subject: st.selectedGroup?.subject || st.groupJid }
        let job
        if (st.tipo === "flood") {
            job = agendarAcao({ tipo: "flood", grupos: [grupo], dados: { qtd: st.floodQtd, modo: st.floodCfg?.modo || "normal" }, mensagem: st.floodMessage, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "nuke") {
            job = agendarAcao({ tipo: "nuke", grupos: [grupo], dados: { preset: st.presetDados }, mensagem: st.mensagem, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "roubar") {
            job = agendarAcao({ tipo: "roubar", grupos: [grupo], dados: { preset: st.presetDados }, delayMs: parsed.delayMs, at: parsed.at })
        }
        // [v40] Sem tipo reconhecido: avisa em vez de quebrar (job indefinido).
        if (!job) {
            clearState(ownerKey)
            await sock.sendMessage(chatJid, { text: "⚠️ Tipo de agendamento perdido. Comece de novo pelo menu (4 · AGENDAR AÇÃO)." })
            return true
        }
        clearState(ownerKey)
        const d = new Date(parsed.at)
        const quando = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        await enviarVoltar(chatJid, `⏰ Agendado!\nTipo: ${st.tipo}\nGrupo: ${grupo.subject}\nQuando: ${quando}\nID: ${job.id.slice(0, 8)}\n\nUse "agendamentos" para ver todos.`)
        return true
    }

    // Multi agendar
    if (st.action === "multi_agendar_tipo" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "1") {
            setState(ownerKey, { action: "multi_agendar_flood_message", multiGroups: st.multiGroups })
            await enviarCancelavel(chatJid, `Agendar FLOOD em ${st.multiGroups.length} grupos\nMensagem:`)
            return true
        }
        if (escolha === "2") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_agendar_tudo_preset", multiGroups: st.multiGroups })
            await enviarCancelavel(chatJid, `Agendar NUKE em ${st.multiGroups.length} grupos\n${listarPresetsTexto()}\nPreset:`)
            return true
        }
        if (escolha === "3") {
            const { listarPresetsTexto } = await import("../services/presetService.js")
            setState(ownerKey, { action: "multi_agendar_roubar_preset", multiGroups: st.multiGroups })
            await enviarCancelavel(chatJid, `Agendar ROUBAR em ${st.multiGroups.length} grupos\n${listarPresetsTexto()}\nPreset:`)
            return true
        }
        if (escolha === "0") { await enviarMenuMultiAcoes(chatJid, st.multiGroups, ownerKey); return true }
        await sock.sendMessage(chatJid, { text: "Opção inválida. 1=Flood 2=Nuke 3=Roubar 0=Voltar" })
        return true
    }
    if (st.action === "multi_agendar_flood_message" && text) {
        setState(ownerKey, { action: "multi_agendar_flood_amount", multiGroups: st.multiGroups, floodMessage: text })
        await enviarCancelavel(chatJid, `Qtd (máx ${MAX_FLOOD} cada):`)
        return true
    }
    if (st.action === "multi_agendar_flood_amount" && text) {
        const qtd = parseInt(text.replace(/\D/g, ""))
        if (isNaN(qtd) || qtd < 1) { await sock.sendMessage(chatJid, { text: "Qtd inválida." }); return true }
        setState(ownerKey, { action: "multi_agendar_flood_modo", multiGroups: st.multiGroups, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        await enviarMenuFloodModos(chatJid, ownerKey, { qtd: Math.min(qtd, MAX_FLOOD), multiGroups: st.multiGroups, floodMessage: st.floodMessage, multi: true })
        setState(ownerKey, { action: "multi_agendar_flood_modo", multiGroups: st.multiGroups, floodMessage: st.floodMessage, floodQtd: Math.min(qtd, MAX_FLOOD) })
        return true
    }
    if (st.action === "multi_agendar_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        let cfg
        if (raw === "0") cfg = getFloodConfig(CONFIG.floodModo)
        else if (["1", "rapido"].includes(raw)) cfg = getFloodConfig("rapido")
        else if (["2", "normal"].includes(raw)) cfg = getFloodConfig("normal")
        else if (["3", "lento"].includes(raw)) cfg = getFloodConfig("lento")
        else if (["4", "seguro"].includes(raw)) cfg = getFloodConfig("seguro")
        else {
            const num = parseInt(raw.replace(/\D/g, ""))
            if (!isNaN(num) && num >= 20 && num <= 5000) cfg = getFloodConfig(num)
            else { await sock.sendMessage(chatJid, { text: "Modo inválido." }); return true }
        }
        setState(ownerKey, { action: "multi_agendar_tempo", tipo: "flood", multiGroups: st.multiGroups, floodMessage: st.floodMessage, floodQtd: st.floodQtd, floodCfg: cfg })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "multi_agendar_tudo_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "multi_agendar_tudo_msg", multiGroups: st.multiGroups, presetDados: dados })
        await enviarCancelavel(chatJid, `Mensagem antes do NUKE? PULAR ou digite:`)
        return true
    }
    if (st.action === "multi_agendar_tudo_msg") {
        const semMsg = text && text.trim().toLowerCase() === "pular"
        const corpo = semMsg ? "" : (text?.trim() || "")
        setState(ownerKey, { action: "multi_agendar_tempo", tipo: "nuke", multiGroups: st.multiGroups, presetDados: st.presetDados, mensagem: corpo })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "multi_agendar_roubar_preset" && text) {
        const escolha = text.trim().replace(/\D/g, "")
        const { getPreset, fotoPresetPath } = await import("../services/presetService.js")
        let dados
        if (escolha === "0" || /^0+$/.test(text.trim())) dados = { nome: CONFIG.nome, bio: CONFIG.bio }
        else {
            const preset = getPreset(parseInt(escolha))
            if (!preset) { await sock.sendMessage(chatJid, { text: "Preset inválido." }); return true }
            dados = { nome: preset.nome, bio: preset.bio, fotoPath: fotoPresetPath(preset), mensagem: preset.mensagem || null }
        }
        setState(ownerKey, { action: "multi_agendar_tempo", tipo: "roubar", multiGroups: st.multiGroups, presetDados: dados })
        await enviarCancelavel(chatJid, `Quando executar? Ex: 10m, 1h, 20:30`)
        return true
    }
    if (st.action === "multi_agendar_tempo" && text) {
        const { parseAgendamento, agendarAcao } = await import("../services/agendaService.js")
        const parsed = parseAgendamento(text.trim())
        if (!parsed) { await sock.sendMessage(chatJid, { text: "Formato inválido. Use 10m, 1h, 20:30, etc." }); return true }
        let job
        if (st.tipo === "flood") {
            job = agendarAcao({ tipo: "flood", grupos: st.multiGroups, dados: { qtd: st.floodQtd, modo: st.floodCfg?.modo || "normal" }, mensagem: st.floodMessage, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "nuke") {
            job = agendarAcao({ tipo: "nuke", grupos: st.multiGroups, dados: { preset: st.presetDados }, mensagem: st.mensagem, delayMs: parsed.delayMs, at: parsed.at })
        } else if (st.tipo === "roubar") {
            job = agendarAcao({ tipo: "roubar", grupos: st.multiGroups, dados: { preset: st.presetDados }, delayMs: parsed.delayMs, at: parsed.at })
        }
        clearState(ownerKey)
        const d = new Date(parsed.at)
        const quando = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
        await enviarVoltar(chatJid, `⏰ Agendado em lote!\nTipo: ${st.tipo}\nGrupos: ${st.multiGroups.length}\nQuando: ${quando}\nID: ${job.id.slice(0, 8)}`)
        return true
    }

    // Flood config set
    if (st.action === "config_set_flood_interval" && text) {
        const n = parseInt(text.replace(/\D/g, ""))
        if (isNaN(n) || n < 20 || n > 5000) { await sock.sendMessage(chatJid, { text: "Intervalo inválido. 20-5000ms." }); return true }
        CONFIG.floodInterval = n; salvarConfig()
        await enviarVoltar(chatJid, `Intervalo flood salvo: ${n}ms`)
        clearState(ownerKey); return true
    }
    if (st.action === "config_set_flood_lote" && text) {
        const n = parseInt(text.replace(/\D/g, ""))
        if (isNaN(n) || n < 1 || n > 10) { await sock.sendMessage(chatJid, { text: "Lote inválido. 1-10." }); return true }
        CONFIG.floodLote = n; salvarConfig()
        await enviarVoltar(chatJid, `Lote flood salvo: ${n}`)
        clearState(ownerKey); return true
    }
    if (st.action === "config_set_flood_modo" && text) {
        const raw = text.trim().toLowerCase()
        if (["rapido", "normal", "lento", "seguro"].includes(raw)) {
            CONFIG.floodModo = raw
            const modo = FLOOD_MODOS[raw]
            CONFIG.floodInterval = modo.intervalo
            CONFIG.floodLote = modo.lote
            CONFIG.floodJitter = raw === "seguro"
            salvarConfig()
            await enviarVoltar(chatJid, `Modo flood salvo: ${raw} (${modo.intervalo}ms/lote${modo.lote})`)
        } else {
            await sock.sendMessage(chatJid, { text: "Modo inválido. Use: rapido, normal, lento, seguro." })
            return true
        }
        clearState(ownerKey); return true
    }

    // [v24] Permissões - add/remove user
    if (st.action === "config_add_user" && text) {
        const { addAuthorizedUser } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const raw = text.trim()
        const nums = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
        let adicionados = [], jaExistiam = [], invalidos = [], lidsAdicionados = []
        for (const n of nums) {
            const res = addAuthorizedUser(n)
            if (!res) invalidos.push(n)
            else if (res.already || res.alreadyOwner) jaExistiam.push(res.num)
            else if (res.added) {
                adicionados.push(res.num)
                if (res.lids && res.lids.length) {
                    // já adicionou LID via mapa
                }
            }
        }
        // Busca ativa de LID para cada telefone adicionado (evita rate-limit fazendo em lote pequeno)
        try {
            const { buscarLidPorPhone } = await import("../services/lidResolver.js")
            const { addAuthorizedUser: addLid } = await import("../utils/permissions.js")
            for (const phone of adicionados) {
                try {
                    const lid = await buscarLidPorPhone(phone)
                    if (lid) {
                        const r2 = addLid(lid + "@lid")
                        if (r2?.added) lidsAdicionados.push(`${phone} -> ${lid}`)
                    }
                } catch {}
                await new Promise(r => setTimeout(r, 120))
            }
        } catch {}
        salvarConfig()
        let msg = ""
        if (adicionados.length) msg += `✅ Adicionados ${adicionados.length}: ${adicionados.join(", ")}\n`
        if (lidsAdicionados.length) msg += `🔗 LIDs encontrados: ${lidsAdicionados.join(", ")}\n`
        if (jaExistiam.length) msg += `⚠️ Já eram ADM ou dono: ${jaExistiam.join(", ")}\n`
        if (invalidos.length) msg += `❌ Inválidos: ${invalidos.join(", ")}\n`
        if (!msg) msg = "Nenhum número válido."
        msg += `\nDica: se o ADM usar @lid no PV, adicione o LID também (aparece no aviso de acesso negado).`
        await enviarVoltar(chatJid, msg.trim())
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_remove_user" && text) {
        const { removeAuthorizedUser } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const res = removeAuthorizedUser(text.trim())
        if (!res) {
            await sock.sendMessage(chatJid, { text: "Número/índice não encontrado." })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `✅ Removido ADM: ${res.removed}`)
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_add_group" && text) {
        const raw = text.trim()
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const { addAuthorizedGroup } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const { resolverGrupoInput } = await import("../services/groupService.js")

        // Tenta multi seleção da lista
        const multi = parseMultiSelecao(cache, raw)
        if (multi && multi.entries.length >= 1) {
            let adicionados = [], jaExistiam = []
            for (const e of multi.entries) {
                const res = addAuthorizedGroup(e.id)
                if (res?.already) jaExistiam.push(e.subject)
                else if (res?.added) adicionados.push(e.subject)
            }
            salvarConfig()
            let msg = ""
            if (adicionados.length) msg += `✅ Grupos autorizados adicionados (${adicionados.length}):\n${adicionados.map(s => `• ${s}`).join("\n")}\n`
            if (jaExistiam.length) msg += `\n⚠️ Já autorizados: ${jaExistiam.join(", ")}`
            if (multi.invalid?.length) msg += `\n❌ Inválidos: ${multi.invalid.join(", ")}`
            await enviarVoltar(chatJid, msg.trim() || "Nenhum grupo adicionado.")
            clearState(ownerKey)
            return true
        }

        // Tenta número único da lista
        const single = resolveGrupoDeTexto(cache, raw)
        if (single && single.entry) {
            const res = addAuthorizedGroup(single.entry.id)
            salvarConfig()
            if (res?.already) await enviarVoltar(chatJid, `⚠️ Grupo já autorizado: ${single.entry.subject}`)
            else await enviarVoltar(chatJid, `✅ Grupo autorizado: ${single.entry.subject}\nID: ${single.entry.id}`)
            clearState(ownerKey)
            return true
        }

        // Tenta JID direto ou link
        try {
            let jid = raw
            if (jid.includes("whatsapp.com") || jid.endsWith("@g.us")) {
                jid = await resolverGrupoInput(jid)
            } else if (!jid.endsWith("@g.us")) {
                // Pode ser ID sem @g.us? Tenta normalizar
                if (/^\d+@g\.us$/.test(jid) || /^\d+-/.test(jid)) {
                    // já é JID válido ou com sufixo
                } else {
                    throw new Error("Formato inválido")
                }
            }
            const res = addAuthorizedGroup(jid)
            if (!res) throw new Error("JID inválido")
            salvarConfig()
            const subj = rt().cachedGroups[jid]?.subject || jid
            if (res.already) await enviarVoltar(chatJid, `⚠️ Já autorizado: ${subj}`)
            else await enviarVoltar(chatJid, `✅ Grupo autorizado: ${subj}`)
            clearState(ownerKey)
            return true
        } catch (e) {
            await sock.sendMessage(chatJid, { text: `⚠️ Grupo não encontrado. Digite número da lista (ex: 01), ID @g.us ou link de convite.\nErro: ${e.message}` })
            return true
        }
    }
    if (st.action === "config_remove_group" && text) {
        const { removeAuthorizedGroup } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const res = removeAuthorizedGroup(text.trim())
        if (!res) {
            await sock.sendMessage(chatJid, { text: "Grupo/índice não encontrado." })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `✅ Grupo removido dos autorizados: ${res.removed}`)
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_add_owner" && text) {
        const { addExtraOwner } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const raw = text.trim()
        const nums = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
        let adicionados = [], jaExistiam = [], invalidos = []
        for (const n of nums) {
            const res = addExtraOwner(n)
            if (!res) invalidos.push(n)
            else if (res.already || res.alreadyOwner) jaExistiam.push(res.num)
            else if (res.added) adicionados.push(res.num)
        }
        salvarConfig()
        let msg = ""
        if (adicionados.length) msg += `✅ Donos extras adicionados: ${adicionados.join(", ")}\n`
        if (jaExistiam.length) msg += `⚠️ Já eram donos: ${jaExistiam.join(", ")}\n`
        if (invalidos.length) msg += `❌ Inválidos: ${invalidos.join(", ")}\n`
        if (!msg) msg = "Nenhum número válido."
        await enviarVoltar(chatJid, msg.trim())
        clearState(ownerKey)
        return true
    }
    if (st.action === "config_remove_owner" && text) {
        const { removeExtraOwner } = await import("../utils/permissions.js")
        const { salvarConfig } = await import("../utils/config.js")
        const res = removeExtraOwner(text.trim())
        if (!res) {
            await sock.sendMessage(chatJid, { text: "Dono extra não encontrado." })
            return true
        }
        salvarConfig()
        await enviarVoltar(chatJid, `✅ Dono extra removido: ${res.removed}`)
        clearState(ownerKey)
        return true
    }

    // Agendamento cancel
    if (st.action === "agendar_cancelar" && text) {
        const { cancelarAgendamento } = await import("../services/agendaService.js")
        const id = text.trim()
        const removido = cancelarAgendamento(id) || cancelarAgendamento(id.slice(0, 6)) // tenta por prefixo
        // Tenta buscar por prefixo se não achou exato
        if (!removido) {
            const { listarAgendamentos } = await import("../services/agendaService.js")
            const lista = listarAgendamentos()
            const found = lista.find(j => j.id.startsWith(id))
            if (found) {
                const { cancelarAgendamento: canc2 } = await import("../services/agendaService.js")
                const r2 = canc2(found.id)
                if (r2) { await enviarVoltar(chatJid, `Agendamento ${found.id.slice(0, 8)} cancelado.`); clearState(ownerKey); return true }
            }
            await enviarVoltar(chatJid, "ID não encontrado ou já executado.")
        } else {
            await enviarVoltar(chatJid, `Agendamento ${removido.id.slice(0, 8)} cancelado.`)
        }
        clearState(ownerKey); return true
    }

    if (st.action === "waiting_group" && text) {
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const cacheKeys = Object.keys(cache).map(k => parseInt(k)).filter(k => !isNaN(k))
        const raw = text.trim()

        const pagMatch = raw.match(/^(?:pag|p)\s*(\d+)$/i)
        if (pagMatch) {
            const nPag = parseInt(pagMatch[1])
            const novoCache = await listarGruposInterativo(chatJid, nPag)
            if (novoCache) rt().groupSelectionCache[ownerKey] = novoCache
            return true
        }

        const multi = parseMultiSelecao(cache, raw)
        if (multi && multi.entries && multi.entries.length >= 2) {
            if (multi.invalid && multi.invalid.length) {
                await sock.sendMessage(chatJid, { text: `⚠️ Ignorando inválidos: ${multi.invalid.slice(0, 10).join(", ")}` })
            }
            // Filtra grupos protegidos
            const { isAuthorizedGroup: isAuthG } = await import("../utils/permissions.js")
            const protegidos = multi.entries.filter(e => isAuthG(e.id))
            const atacaveis = multi.entries.filter(e => !isAuthG(e.id))
            if (protegidos.length) {
                await sock.sendMessage(chatJid, { text: `🛡️ ${protegidos.length} grupo(s) protegido(s) (autorizado) será(ão) ignorado(s):\n${protegidos.map(g => `• ${g.subject}`).join("\n")}` })
            }
            if (!atacaveis.length) {
                await sock.sendMessage(chatJid, { text: "❌ Todos os grupos selecionados são protegidos (autorizados)." })
                return true
            }
            const alvoMulti = atacaveis.length < multi.entries.length ? atacaveis : multi.entries
            if (st.next === "waiting_flood_message") {
                setState(ownerKey, { action: "multi_flood_message", multiGroups: alvoMulti })
                await enviarCancelavel(chatJid, `Multi FLOOD: ${alvoMulti.length} grupos\nDigite a mensagem:`)
                return true
            }
            if (st.next === "waiting_tudo_name") {
                const { listarPresetsTexto } = await import("../services/presetService.js")
                setState(ownerKey, { action: "multi_tudo_preset", multiGroups: alvoMulti })
                await enviarCancelavel(chatJid, `Multi PRESET+NUKE: ${alvoMulti.length} grupos\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
                return true
            }
            if (st.next === "roubar_grupo") {
                const { listarPresetsTexto } = await import("../services/presetService.js")
                setState(ownerKey, { action: "multi_roubar_preset", multiGroups: alvoMulti })
                await enviarCancelavel(chatJid, `Multi ROUBAR: ${alvoMulti.length} grupos\n${listarPresetsTexto()}\n\nPreset número ou 0:`)
                return true
            }
            await enviarMenuMultiAcoes(chatJid, alvoMulti, ownerKey)
            return true
        }

        const res = resolveGrupoDeTexto(cache, raw)
        if (res && res.multiple) {
            let txt = `🔍 Encontrei ${res.multiple.length} grupos com "${raw}":\n\n`
            res.multiple.slice(0, 10).forEach(mm => {
                const b = mm.isAdmin ? "👑" : "👤"
                txt += `[${String(mm.idx).padStart(3, "0")}] ${b} ${mm.subject}\n`
            })
            txt += `\n_Digite o número exato do grupo desejado_\n_Para multi: 1,3,5 ou 1-5_`
            await sock.sendMessage(chatJid, { text: txt })
            return true
        }
        if (!res) {
            if (!st.avisouNaoEncontrado) {
                setState(ownerKey, { action: st.action, next: st.next, avisouNaoEncontrado: true })
                await sock.sendMessage(chatJid, {
                    text: `⚠️ Grupo não encontrado.\n\nDigite o *número* (ex: 01, 07, 072), parte do *nome*, ou multi (1,3,5 / 1-5).\nDigite *cancelar* para sair.\n\nTotal disponível: ${cacheKeys.length} grupos.`
                })
            }
            return true
        }
        const { entry, selectedIdx } = res

        setState(ownerKey, {
            action: st.next,
            groupJid: entry.id,
            selectedGroup: { id: entry.id, name: entry.subject, isAdmin: entry.isAdmin, index: selectedIdx }
        })

        console.log(info("GRUPO", `Selecionado: [${selectedIdx}] ${entry.subject}`))
        await processarSelecaoGrupo(chatJid, ownerKey, st.next, entry)
        return true
    }

    // ============================================================
    // [v41] 🫥 STATUS MANAGER — estados de criação e audiência
    // ============================================================
    if (st.action === "status_waiting_text" && text) {
        // O parsing dos sufixos (#cor / #fonte) fica no service (fonte única da sintaxe)
        const { criarDraftTexto } = await import("../features/statusManager/index.js")
        const r = criarDraftTexto(text)
        if (!r.ok) { await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}` }); return true }
        setState(ownerKey, { action: "status_menu_st" })
        await sock.sendMessage(chatJid, { text: `✅ Rascunho de TEXTO adicionado à fila (${r.total} na fila).\n\n_5 = publicar agora · 4 = postar preset · 0 = voltar_` })
        return true
    }

    if (st.action === "status_waiting_image") {
        const imgMsg = m?.message?.imageMessage || m?.message?.documentMessage?.imageMessage
        const docImagem = m?.message?.documentMessage && m?.message?.documentMessage?.mimetype?.startsWith("image/")
        if (!imgMsg && !docImagem) {
            if (!st.avisouMidia) {
                setState(ownerKey, { action: "status_waiting_image", avisouMidia: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Envie uma IMAGEM (foto ou documento JPG/PNG/WEBP) ou digite cancelar." })
            }
            return true
        }
        try {
            const buffer = await baixarMidiaMensagem(m)
            const caption = m?.message?.imageMessage?.caption || m?.message?.documentMessage?.caption || ""
            const mimetype = m?.message?.imageMessage?.mimetype || (docImagem ? m?.message?.documentMessage?.mimetype : null)
            const { criarDraftMidia } = await import("../features/statusManager/index.js")
            const r = criarDraftMidia("imagem", buffer, caption, mimetype)
            if (!r.ok) { await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}` }); return true }
            setState(ownerKey, { action: "status_menu_st" })
            await sock.sendMessage(chatJid, { text: `✅ Rascunho de IMAGEM adicionado à fila (${r.total} na fila).\n\n_5 = publicar agora · 4 = postar preset · 0 = voltar_` })
        } catch (e) {
            const { registrarErroStatus } = await import("../features/statusManager/service.js")
            registrarErroStatus("download_imagem", e.message, {})
            await sock.sendMessage(chatJid, { text: `❌ Falha ao baixar a imagem: ${e.message}` })
        }
        return true
    }

    if (st.action === "status_waiting_video") {
        const vidMsg = m?.message?.videoMessage || (m?.message?.documentMessage && m?.message?.documentMessage?.mimetype?.startsWith("video/"))
        if (!vidMsg) {
            if (!st.avisouMidia) {
                setState(ownerKey, { action: "status_waiting_video", avisouMidia: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Envie um VÍDEO (ou digite cancelar). Limite do WhatsApp: ~30s." })
            }
            return true
        }
        try {
            const buffer = await baixarMidiaMensagem(m)
            const caption = m?.message?.videoMessage?.caption || m?.message?.documentMessage?.caption || ""
            const mimetype = m?.message?.videoMessage?.mimetype || m?.message?.documentMessage?.mimetype || null
            const { criarDraftMidia } = await import("../features/statusManager/index.js")
            const r = criarDraftMidia("video", buffer, caption, mimetype)
            if (!r.ok) { await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}` }); return true }
            setState(ownerKey, { action: "status_menu_st" })
            await sock.sendMessage(chatJid, { text: `✅ Rascunho de VÍDEO adicionado à fila (${r.total} na fila).\n\n_5 = publicar agora · 4 = postar preset · 0 = voltar_` })
        } catch (e) {
            const { registrarErroStatus } = await import("../features/statusManager/service.js")
            registrarErroStatus("download_video", e.message, {})
            await sock.sendMessage(chatJid, { text: `❌ Falha ao baixar o vídeo: ${e.message}` })
        }
        return true
    }

    if (st.action === "status_waiting_audience" && text) {
        const raw = text.trim().toLowerCase()
        const { definirAudienciaCustom, limparAudienciaCustom, statusRouter } = await import("../features/statusManager/index.js")
        if (raw === "limpar") {
            limparAudienciaCustom()
            await sock.sendMessage(chatJid, { text: "🧹 Lista personalizada apagada.\nAudiência voltou para: CONTATOS (padrão da conta)." })
            return true
        }
        const entries = text.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
        const r = definirAudienciaCustom(entries)
        if (!r.ok) {
            await sock.sendMessage(chatJid, { text: `⚠️ ${r.motivo}${r.invalidos?.length ? `\nInválidos: ${r.invalidos.join(", ")}` : ""}` })
            return true
        }
        setState(ownerKey, { action: "status_menu_st" })
        let t = `✅ Audiência definida: LISTA PERSONALIZADA\n${r.total} destinatário(s) — "Somente compartilhar com..."\n`
        if (r.invalidos?.length) t += `\n⚠️ Ignorados por inválidos: ${r.invalidos.join(", ")}`
        t += `\nSerá aplicada na próxima publicação.\n\n_5 = publicar agora · 1-3 = novo rascunho · 0 = voltar_`
        await sock.sendMessage(chatJid, { text: t })
        return true
    }

    // [v41] Submenus numéricos do STATUS MANAGER dentro do estado status_menu_st
    if (st.action === "status_menu_st" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        const mapa = STATUS_MENU_MAP // [v50] fonte única (statusManager)
        if (escolha === "0") { clearState(ownerKey); await enviarPainelInicial(chatJid); return true }
        if (mapa[escolha]) { await statusRouter(chatJid, ownerKey, mapa[escolha]); return true }
        if (!st.avisouStatus) {
            setState(ownerKey, { action: "status_menu_st", avisouStatus: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-8 (9-11 só dono) · 0 = voltar · cancelar = sair." })
        }
        return true
    }

    // [v46] 🗂️ POSTAR PRESET DE STATUS (dono E ADM — escolha do número da lista)
    if (st.action === "status_preset_select" && text) {
        const { obterStatusPreset } = await import("../features/statusManager/presets.js")
        const { criarDraftTexto } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "0") { const { statusRouter } = await import("../features/statusManager/index.js"); await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        const preset = obterStatusPreset(parseInt(escolha, 10))
        if (!preset) {
            if (!st.avisouPreset) {
                setState(ownerKey, { action: "status_preset_select", avisouPreset: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Preset inválido. Digite o NÚMERO da lista (0 = voltar)." })
            }
            return true
        }
        const r = criarDraftTexto(preset.texto)
        setState(ownerKey, { action: "status_menu_st" })
        if (!r.ok) { await sock.sendMessage(chatJid, { text: `❌ ${r.motivo}` }); return true }
        await sock.sendMessage(chatJid, { text: `╭━━「 ✅ 𝗣𝗥𝗘𝗦𝗘𝗧 𝗡𝗔 𝗙𝗜𝗟𝗔 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n🗂️ ${preset.nome}\n📋 Fila: ${r.total} rascunho(s)\n\n▶️ 5 = PUBLICAR agora\n0 = voltar` })
        return true
    }

    // [v46] 🗂️ GERENCIAR PRESETS (SÓ DONO — guarda nos estados abaixo)
    if (["status_preset_menu", "status_preset_criar_nome", "status_preset_criar_texto", "status_preset_apagar"].includes(st.action) && !isOwner(ownerKey)) {
        setState(ownerKey, { action: "status_menu_st" })
        await sock.sendMessage(chatJid, { text: "❌ Gerenciar presets de status é restrito ao DONO.\nADMs postam presets em: menu 7 > 4." })
        return true
    }

    if (st.action === "status_preset_menu" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const { statusPresetsTexto } = await import("../features/statusManager/presets.js")
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        if (escolha === "1") { await statusRouter(chatJid, ownerKey, "status_preset_criar"); return true }
        if (escolha === "2") { await statusRouter(chatJid, ownerKey, "status_preset_apagar"); return true }
        if (escolha === "3") { setState(ownerKey, { action: "status_preset_menu" }); await sock.sendMessage(chatJid, { text: statusPresetsTexto("listar") }); return true }
        if (!st.avisouPresetMenu) {
            setState(ownerKey, { action: "status_preset_menu", avisouPresetMenu: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-3 (ou 0 = voltar, cancelar = sair)." })
        }
        return true
    }

    if (st.action === "status_preset_criar_nome" && text) {
        const nome = text.trim()
        if (nome.length > 30) {
            if (!st.avisouNome) {
                setState(ownerKey, { action: "status_preset_criar_nome", avisouNome: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Nome muito longo (máx 30). Digite um nome curto:" })
            }
            return true
        }
        setState(ownerKey, { action: "status_preset_criar_texto", nomePreset: nome })
        await sock.sendMessage(chatJid, { text: `╭━━「 ➕ 𝗣𝗥𝗘𝗦𝗘𝗧 \${nome}\n╰━━━━━━━━━━━━━━━━━━━━━\n\nDigite o TEXTO do status salvo.\n\nAceita no final:\n• #1a8f3c → cor de fundo\n• #6 → fonte\n\nEx: Bom dia! Promo ativada #1a8f3c #6\n\n_(cancelar para sair)_` })
        return true
    }

    if (st.action === "status_preset_criar_texto" && text) {
        const { criarStatusPreset } = await import("../features/statusManager/presets.js")
        const r = criarStatusPreset(st.nomePreset, text)
        setState(ownerKey, { action: "status_preset_menu" })
        await sock.sendMessage(chatJid, { text: r.ok ? `✅ Preset "${st.nomePreset}" salvo (${r.total} no total).\n\nADMs podem postar em: menu 7 > 4.` : `❌ ${r.motivo}` })
        return true
    }

    if (st.action === "status_preset_apagar" && text) {
        const { apagarStatusPreset } = await import("../features/statusManager/presets.js")
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_preset_menu"); return true }
        const r = apagarStatusPreset(parseInt(escolha, 10))
        setState(ownerKey, { action: "status_preset_menu" })
        await sock.sendMessage(chatJid, { text: r.ok ? `🗑️ Preset "${r.nome}" apagado (${r.total} restante(s)).` : `❌ ${r.motivo}` })
        return true
    }

    // [v41] Submenu audiência numérico (após opção 4)
    if (st.action === "status_audiencia_menu" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        const mapa = { "1": "status_audiencia_contatos", "2": "status_audiencia_custom", "3": "status_audiencia_ver", "4": "status_import_grupo", "5": "status_privacidade" }
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        if (mapa[escolha]) { await statusRouter(chatJid, ownerKey, mapa[escolha]); return true }
        if (!st.avisouAudi) {
            setState(ownerKey, { action: "status_audiencia_menu", avisouAudi: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-5 (ou 0 = voltar, cancelar = sair)." })
        }
        return true
    }

    // [v42] Importar MEMBROS de um grupo como audiência do status
    if (st.action === "status_waiting_group_import" && text) {
        const cache = rt().groupSelectionCache[ownerKey] || {}
        const res = resolveGrupoDeTexto(cache, text.trim())
        if (!res) {
            if (!st.avisouImport) {
                setState(ownerKey, { action: "status_waiting_group_import", avisouImport: true })
                await sock.sendMessage(chatJid, { text: "⚠️ Grupo não encontrado. Digite o NÚMERO da lista (ou cancelar)." })
            }
            return true
        }
        if (res.multiple) {
            let t = `🔍 ${res.multiple.length} grupos com esse nome:\n\n`
            res.multiple.slice(0, 10).forEach(mm => { t += `[${String(mm.idx).padStart(3, "0")}] ${mm.isAdmin ? "👑" : "👤"} ${mm.subject}\n` })
            t += `\n_Digite o número exato_`
            await sock.sendMessage(chatJid, { text: t })
            return true
        }
        const { importarMembrosGrupo } = await import("../features/statusManager/index.js")
        const r = await importarMembrosGrupo(res.entry.id)
        setState(ownerKey, { action: "status_audiencia_menu" })
        if (!r.ok) {
            await sock.sendMessage(chatJid, { text: `❌ ${r.motivo}` })
            return true
        }
        let t = `╭━━「 🧲 𝗠𝗘𝗠𝗕𝗥𝗢𝗦 𝗜𝗠𝗣𝗢𝗥𝗧𝗔𝗗𝗢𝗦 」━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
        t += `Grupo: ${res.entry.subject}\n`
        t += `Membros: ${r.totalMembros}\n\n`
        t += `📱 Com telefone: ${r.comTelefone}\n`
        if (r.apenasLid) t += `🆔 Só @lid (direto): ${r.apenasLid}\n`
        t += `✅ Audiência agora: ${r.total} destinatário(s)\n`
        if (r.truncado) t += `⚠️ Lista cortada em ${r.total} (limite por publicação)\n`
        t += `\n_Publicar: menu 7 > 5 · 0 = voltar_`
        await sock.sendMessage(chatJid, { text: t })
        return true
    }

    // [v41] Submenu privacidade numérico
    if (st.action === "status_priv_menu" && text) {
        const { statusRouter } = await import("../features/statusManager/index.js")
        const escolha = text.trim().replace(/\D/g, "")
        const mapa = { "1": "status_priv_all", "2": "status_priv_contacts", "3": "status_priv_none" }
        if (escolha === "0") { await statusRouter(chatJid, ownerKey, "status_menu"); return true }
        if (mapa[escolha]) { await statusRouter(chatJid, ownerKey, mapa[escolha]); return true }
        if (!st.avisouPriv) {
            setState(ownerKey, { action: "status_priv_menu", avisouPriv: true })
            await sock.sendMessage(chatJid, { text: "⚠️ Opção inválida. 1-3 (ou 0 = voltar, cancelar = sair)." })
        }
        return true
    }

    return false
}

export async function processarSelecaoGrupo(chatJid, ownerKey, next, entry) {
    const sock = getSock()
    // [v24] Blindagem: grupos autorizados não podem ser alvo de flood/nuke/roubar
    const { isAuthorizedGroup } = await import("../utils/permissions.js")
    const protegido = isAuthorizedGroup(entry.id)
    if (protegido && ["waiting_flood_message", "waiting_tudo_name", "roubar_grupo", "confirm_nuke", "confirm_rmfoto"].includes(next)) {
        await sock.sendMessage(chatJid, { text: `🛡️ Grupo protegido (autorizado): ${entry.subject}\n\nEste grupo está blindado — não pode ser floodado, nukado ou roubado.\nRemova-o dos grupos autorizados (menu 5 > 27) se quiser atacar.` })
        clearState(ownerKey)
        const { enviarSubmenuConfig } = await import("../menus/configMenu.js")
        // volta pro menu principal para não travar
        await enviarPainelInicial(chatJid)
        return
    }
    if (next === "waiting_tudo_name") {
        const { listarPresetsTexto } = await import("../services/presetService.js")
        const lista = listarPresetsTexto()
        setState(ownerKey, { action: "waiting_tudo_preset", groupJid: entry.id })
        await enviarCancelavel(chatJid,
            `💣 *PRESET + NUKE*\nGrupo: ${entry.subject}\n\n` +
            `Escolha um preset (nome + bio + foto):\n\n${lista}\n\n` +
            `👉 Digite o *número* do preset\n👉 ou *0* para criar um novo\n_(cancelar para sair)_`
        )
        return
    }

    const map = {
        waiting_name: `📝 Digite o novo nome para:\n${entry.subject}`,
        waiting_bio: `📄 Digite a nova bio para:\n${entry.subject}`,
        waiting_both_name: `📝 Digite o nome (depois a bio):\n${entry.subject}`,
        waiting_group_image: `📷 Envie a imagem (foto ou documento).\nFormatos: JPG, PNG, WEBP.`,
        waiting_image_url: `🔗 Envie a URL direta da imagem:`,
        // Uma linha só de propósito: o hook global de "Ler Mais" dobra qualquer
        // content.text multi-linha (e o dono não precisa disso num prompt de flood).
        waiting_flood_message: `Digite a mensagem (1 linha). _Loja: loja:0 · loja:texto · loja:texto|title|surface|id — surface 1=FB, 2=IG, 3=WA_`,
    }
    if (map[next]) {
        setState(ownerKey, { action: next, groupJid: entry.id, selectedGroup: { id: entry.id, subject: entry.subject, isAdmin: entry.isAdmin } })
        await enviarCancelavel(chatJid, map[next])
        return
    }
    if (next === "roubar_grupo") {
        const { listarPresetsTexto } = await import("../services/presetService.js")
        const lista = listarPresetsTexto()
        setState(ownerKey, { action: "waiting_roubar_preset", groupJid: entry.id, grupoSubject: entry.subject })
        await enviarCancelavel(chatJid,
            `ROUBAR GRUPO\nGrupo: ${entry.subject}\n\n` +
            `Escolha um preset (nome + bio + foto):\n\n${lista}\n\n` +
            `Digite o numero do preset\nou 0 para usar a config padrao (sem preset)\n(cancelar para sair)`
        )
        return
    }

    if (next === "confirm_nuke") {
        clearState(ownerKey)
        await sock.sendMessage(chatJid, { text: `💣 Executando NUKE em: ${entry.subject}...` })
        try {
            const r = await executarNuke(entry.id)
            const mk = (b) => b ? "✔" : "✖"
            let txt = `✅ NUKE executado em: ${entry.subject}\n`
            txt += `• Foto: ${mk(r.foto)}  Nome: ${mk(r.nome)}  Bio: ${mk(r.bio)}\n`
            txt += `• Grupo fechado: ${mk(r.fechado)}\n`
            txt += `• Removidos: ${r.removidos}`
            if (r.erros.length) txt += `\n⚠️ ${r.erros.length} erro(s)`
            await enviarVoltar(chatJid, txt)
        } catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        return
    }
    if (next === "confirm_rmfoto") {
        clearState(ownerKey)
        try { const okRem = await removerFotoGrupo(entry.id); await enviarVoltar(chatJid, okRem ? "✅ Foto removida." : "⚠️ Sem suporte.") }
        catch (e) { await enviarVoltar(chatJid, `❌ ${e.message}`) }
        return
    }
}
