// features/statusManager/index.js
// [v42] 🫥 STATUS MANAGER — API pública + roteador de ações (status_*).
// v42: publicação SEMPRE com statusJidList (correção real do "não publica"),
// importar MEMBROS de grupo como audiência, menus reformulados.
// v45: alias textual "status" removido — acesso exclusivo pelo menu (opção 7).
// [v46] PAPÉIS SEPARADOS: ADM do bot CRIA e PUBLICA status (e posta presets);
// audiência, privacidade e gerência de presets continuam SÓ DO DONO.

import { getSock, rt } from "../../connection/socket.js"
import { setState } from "../../utils/stateManager.js"
import { info } from "../../utils/terminalUI.js"
import { isOwner } from "../../utils/permissions.js"
import { listarStatusPresets, statusPresetsTexto, menuPresetGerenciarTexto } from "./presets.js"
import { uiModoEfetivo } from "../../utils/config.js"
import { enviarMensagemInterativa } from "../../services/interactiveService.js"
import { criarBotao } from "../../utils/botoes.js"

// [v55] Rótulos do menu interativo — MESMOS títulos do menu TXT (paridade
// 1:1 com STATUS_MENU_MAP; o E2E valida toda row ↔ id roteado).
const STATUS_ROTULOS = {
    status_texto: "Texto (cor + fonte)",
    status_imagem: "Imagem (com legenda)",
    status_video: "Video (~30s)",
    status_preset_postar: "Postar preset salvo",
    status_publicar: "PUBLICAR agora",
    status_cancelar: "Cancelar publicacao",
    status_ver: "Ver configuracao",
    status_erros: "Ultimos erros",
    status_audiencia: "Definir audiencia",
    status_privacidade: "Privacidade padrao",
    status_preset_menu: "Gerenciar presets"
}

import {
    podeGerenciarStatus, obterStatusConfig, definirAudienciaCustom, usarAudienciaContatos,
    limparAudienciaCustom, definirPrivacidadePadrao, criarDraftTexto, criarDraftMidia,
    obterFila, limparFila, publicarStatus, cancelarPublicacao, statusEmAndamento,
    verConfigTexto, verErrosTexto, importarMembrosGrupo, construirListaContatos,
    totalContatosConhecidos, registrarContatos,
    STATUS_JID, FONTES_STATUS, CORES_STATUS
} from "./service.js"

export {
    podeGerenciarStatus,
    obterStatusConfig, definirAudienciaCustom, usarAudienciaContatos, limparAudienciaCustom,
    definirPrivacidadePadrao, importarMembrosGrupo, construirListaContatos,
    totalContatosConhecidos, registrarContatos,
    criarDraftTexto, criarDraftMidia, obterFila, limparFila,
    publicarStatus, cancelarPublicacao, statusEmAndamento,
    verConfigTexto, verErrosTexto,
    STATUS_JID, FONTES_STATUS, CORES_STATUS
}
export { listarStatusPresets, statusPresetsTexto }

// [v50] Mapa numérico do submenu Status (menu 7) — FONTE ÚNICA: usada pelo
// stateHandler (input de texto) e pela interface interativa (números reais).
export const STATUS_MENU_MAP = {
    "1": "status_texto", "2": "status_imagem", "3": "status_video",
    "4": "status_preset_postar", "5": "status_publicar", "6": "status_cancelar",
    "7": "status_ver", "8": "status_erros",
    "9": "status_audiencia", "10": "status_privacidade", "11": "status_preset_menu"
}

// ============================================================
// MENUS (identidade visual do SYZYGY — texto puro, funciona em qualquer cliente)
// ============================================================
// [v46] Um menu por papel: "adm" (cria/publica/posta preset) e "dono" (tudo).
export function menuStatusTexto(role = "adm") {
    const dono = role === "dono"
    const fila = obterFila()
    const cfg = obterStatusConfig()
    const presets = listarStatusPresets()
    const audi = cfg.audienciaModo === "custom"
        ? `𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 · ${cfg.audienciaCustom.length}`
        : `𝗖𝗢𝗡𝗧𝗔𝗧𝗢𝗦 𝗗𝗢 𝗕𝗢𝗧 · ${totalContatosConhecidos()}`
    let t = `╭━━「 🫥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥 」━━╮\n`
    t += `┃ ${dono ? "👑 Dono ⬦ controle total" : "👤 ADM ⬦ pode publicar"}\n`
    t += `┃ 👥 Audiência ⬦ ${audi}\n`
    t += `┃ 📋 Fila       ⬦ ${fila.length} rascunho(s)\n`
    t += `┃ 🗂️ Presets   ⬦ ${presets.length} salvo(s)\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━╯\n`
    t += `╭─〔 ✍️ 𝗖𝗥𝗜𝗔𝗥 〕───────────\n`
    t += `┃ ⬥ 1 · Texto  (cor + fonte)\n`
    t += `┃ ⬥ 2 · Imagem (com legenda)\n`
    t += `┃ ⬥ 3 · Vídeo  (~30s)\n`
    t += `╰───────────────────────\n`
    t += `╭─〔 🗂️ 𝗣𝗥𝗘𝗦𝗘𝗧𝗦 〕──────────\n`
    t += `┃ ⬥ 4 · 📤 Postar preset salvo\n`
    t += `╰───────────────────────\n`
    t += `╭─〔 ▶️ 𝗔𝗖̧𝗢𝗘𝗦 〕─────────────\n`
    t += `┃ ⬥ 5 · PUBLICAR agora\n`
    t += `┃ ⬥ 6 · ⛔ Cancelar publicação\n`
    t += `┃ ⬥ 7 · 👀 Ver configuração\n`
    t += `┃ ⬥ 8 · Últimos erros\n`
    t += `╰───────────────────────\n`
    if (dono) {
        t += `╭─〔 🔐 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗥 (👑 dono) 〕─\n`
        t += `┃ ⬥ 9 · 👥 Definir audiência\n`
        t += `┃ ⬥ 10 · 🔒 Privacidade padrão\n`
        t += `┃ ⬥ 11 · 🗂️ Gerenciar presets\n`
        t += `╰───────────────────────\n`
    } else {
        t += `╭─〔 🔐 𝗖𝗢𝗡𝗙𝗜𝗚𝗨𝗥𝗔𝗥 〕──────────\n`
        t += `┃ 🔒 Audiência, privacidade e\n`
        t += `┃ presets: somente o DONO\n`
        t += `╰───────────────────────\n`
    }
    t += `┃ ⬥ 0 · Voltar ao painel\n`
    t += `╰───────────────────────\n`
    t += `_Texto: "Bom dia! #1a8f3c #6"_\n`
    t += `_(#cor no final e #fonte)_\n`
    t += `▬▬▬▬▬▬▬▬▬▬▬▬▬\nSYZYGY`
    return t
}

function menuAudienciaTexto() {
    const cfg = obterStatusConfig()
    const atual = cfg.audienciaModo === "custom"
        ? `𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 (${cfg.audienciaCustom.length})`
        : `𝗖𝗢𝗡𝗧𝗔𝗧𝗢𝗦 𝗗𝗢 𝗕𝗢𝗧 (${totalContatosConhecidos()} registrados)`
    let t = `╭━━「 👥 𝗔𝗨𝗗𝗜Ê𝗡𝗖𝗜𝗔 𝗗𝗢 𝗦𝗧𝗔𝗧𝗨𝗦 」\n`
    t += `┃ ⚑ ${atual}\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `  1 · 📇 Contatos do bot\n`
    t += `      (todos que o bot conhece)\n`
    t += `  2 · ✍️ Lista personalizada\n`
    t += `      (digitar números DDI+DDD)\n`
    t += `  3 · 👀 Ver lista atual\n`
    t += `  4 · 🧲 Importar MEMBROS de um grupo\n`
    t += `  5 · 🔒 Privacidade padrão da conta\n`
    t += `  0 · Voltar\n\n`
    t += `╭─〔 ℹ️ 𝗖𝗢𝗠𝗢 𝗙𝗨𝗡𝗖𝗜𝗢𝗡𝗔 〕────\n`
    t += `┃ Publicação usa o mecanismo oficial\n`
    t += `┃ "Somente compartilhar com..."\n`
    t += `┃ (statusJidList — Baileys/WhatsApp).\n`
    t += `╰───────────────────────\n`
    t += `⚠️ O WhatsApp NÃO aceita grupo como\naudiência de status. Na opção 4,\nimportamos os MEMBROS do grupo\n(destinatários individuais reais).\n\n`
    t += `⚠️ Não é possível EXCLUIR um contato\nindividual de um status (limitação\nreal do WhatsApp).\n\n`
    t += `🔐 PRIVACIDADE REAL: quando a lista\nmuda, o bot TROCA a chave do status —\nquem estava na lista anterior não vê os\nNOVOS statuses (statuses antigos já\nentregues não são revogáveis).\n\n`
    t += `_cancelar = sair_`
    return t
}

function menuPrivacidadeTexto() {
    const cfg = obterStatusConfig()
    let t = `╭━━「 🔒 𝗣𝗥𝗜𝗩𝗔𝗖𝗜𝗗𝗔𝗗𝗘 𝗗𝗢 𝗦𝗧𝗔𝗧𝗨𝗦 」\n`
    t += `┃ Padrão da conta (API oficial\n`
    t += `┃ updateStatusPrivacy da Baileys)\n`
    t += `╰━━━━━━━━━━━━━━━━━━━━━\n\n`
    t += `  1 · 🌐 all — TODOS\n`
    t += `  2 · 📇 contacts — MEUS CONTATOS\n`
    t += `  3 · 🚫 none — NINGUÉM\n`
    t += `  0 · Voltar\n\n`
    t += `Atual: ${cfg.privacidadePadrao || "(não alterada)"}\n\n`
    t += `⚠️ "Contatos exceto..." (contact_blacklist)\nsó tem lista editável no app do telefone.\nA lista por publicação (statusJidList)\nnão depende disso.\n\n`
    t += `_cancelar = sair_`
    return t
}

function fontesTexto() {
    return Object.entries(FONTES_STATUS).map(([n, nome]) => `  ${n} · ${nome}`).join("\n")
}

// ============================================================
// ROTEADOR DE AÇÕES status_*
// ============================================================
// [v46] Ações de CONFIGURAÇÃO do status — restritas ao DONO.
// (ADM cria rascunhos e publica, mas não muda audiência/privacidade/presets.)
const STATUS_CONFIG_DONO = new Set([
    "status_audiencia", "status_audiencia_contatos", "status_audiencia_custom", "status_audiencia_ver",
    "status_import_grupo",
    "status_privacidade", "status_priv_all", "status_priv_contacts", "status_priv_none",
    "status_preset_menu", "status_preset_criar", "status_preset_apagar"
])

export async function statusRouter(chatJid, senderKey, actionId) {
    const sock = getSock()
    const send = (text) => sock.sendMessage(chatJid, { text }).catch(() => {})

    // [SEGURANÇA] Só dono/ADM autorizado (extra ao gate global do messageHandler)
    if (!podeGerenciarStatus(senderKey)) {
        console.log(info("STATUS", `acesso negado para ${senderKey} (${actionId})`))
        await send(`❌ Apenas o DONO ou ADM autorizado pode usar o STATUS MANAGER.\nSeu ID: ${senderKey || "?"}`)
        return
    }

    // [SEGURANÇA v46] Configurar status é coisa do DONO. ADM publica (1-6),
    // vê a configuração (7) e os erros (8) — mas não muda nada.
    if (STATUS_CONFIG_DONO.has(actionId) && !isOwner(senderKey)) {
        console.log(info("STATUS", `config negada p/ ADM ${senderKey} (${actionId})`))
        setState(senderKey, { action: "status_menu_st" })
        await send(`❌ Configurar o status é restrito ao DONO.\n\nVocê (ADM) pode criar e publicar:\n1 Texto · 2 Imagem · 3 Vídeo ·\n4 Postar preset · 5 PUBLICAR · 6 Cancelar`)
        await send(menuStatusTexto("adm"))
        return
    }

    switch (actionId) {
        case "status_menu": {
            setState(senderKey, { action: "status_menu_st" })
            // [v55] DECISÃO CENTRAL DE MODO: buttons → SOMENTE interativo
            // (mesmas opções 1-11 do TXT, ids status_* já roteados abaixo;
            // estado continua setado — digitar o número funciona em qualquer modo).
            if (uiModoEfetivo() === "buttons") {
                const dono = isOwner(senderKey)
                const rows = Object.entries(STATUS_MENU_MAP)
                    .filter(([n, id]) => dono || Number(n) <= 8 || Number(n) === 0)
                    .map(([n, id]) => ({ title: `${n.padStart(2, "0")} ${STATUS_ROTULOS[id]}`, description: "", id }))
                const botoes = [criarBotao("single_select", {
                    title: " STATUS",
                    text: dono ? "Controle total (1-11)" : "Publicar (1-8)",
                    buttonText: " SELECIONAR",
                    sections: [{ title: dono ? "🫥 STATUS MANAGER (DONO)" : "🫥 STATUS MANAGER", rows }]
                })]
                await enviarMensagemInterativa(chatJid, `🫥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗠𝗔𝗡𝗔𝗚𝗘𝗥

_Toque em uma opção ou digite o número_`, botoes)
                return
            }
            await send(menuStatusTexto(isOwner(senderKey) ? "dono" : "adm"))
            return
        }

        case "status_texto":
            setState(senderKey, { action: "status_waiting_text" })
            await send(`╭━━「 ✍️ 𝗦𝗧𝗔𝗧𝗨𝗦 𝗗𝗘 𝗧𝗘𝗫𝗧𝗢 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nEnvie o texto do status.\n\nOpcional, no final:\n• #1a8f3c → cor de fundo\n• #6 → fonte\n\nFontes:\n${fontesTexto()}\n\nEx: \`Bom dia galera #1a8f3c #6\`\n\n_(cancelar para sair)_`)
            return

        case "status_imagem":
            setState(senderKey, { action: "status_waiting_image" })
            await send(`╭━━「 🖼️ 𝗦𝗧𝗔𝗧𝗨𝗦 𝗖𝗢𝗠 𝗜𝗠𝗔𝗚𝗘𝗠 」━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nEnvie a imagem (foto ou documento\nJPG/PNG/WEBP). A legenda vai como\ncaption da imagem.\n\nMáx: 10MB.\n\n_(cancelar para sair)_`)
            return

        case "status_video":
            setState(senderKey, { action: "status_waiting_video" })
            await send(`╭━━「 🎬 𝗦𝗧𝗔𝗧𝗨𝗦 𝗖𝗢𝗠 𝗩𝗜𝗗𝗘𝗢 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nEnvie o vídeo (legenda vai como caption).\n\n⚠️ O WhatsApp limita status de vídeo\na ~30 segundos.\nMáx: 64MB.\n\n_(cancelar para sair)_`)
            return

        // [v46] 🗂️ PRESETS — postar (adm/dono) e gerenciar (dono)
        case "status_preset_postar": {
            const presets = listarStatusPresets()
            if (!presets.length) {
                setState(senderKey, { action: "status_menu_st" })
                await send(`🗂️ Nenhum preset de status salvo.\nO DONO cria em: menu 7 > 11 > 1.`)
                return
            }
            setState(senderKey, { action: "status_preset_select" })
            await send(statusPresetsTexto("postar"))
            return
        }

        case "status_preset_menu":
            setState(senderKey, { action: "status_preset_menu" })
            await send(menuPresetGerenciarTexto())
            return

        case "status_preset_criar":
            setState(senderKey, { action: "status_preset_criar_nome" })
            await send(`╭━━「 ➕ 𝗡𝗢𝗩𝗢 𝗣𝗥𝗘𝗦𝗘𝗧 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nDigite o NOME do preset (até 30\n caracteres — ex: Promo Day).\n\n_(cancelar para sair)_`)
            return

        case "status_preset_apagar": {
            const presets = listarStatusPresets()
            if (!presets.length) {
                setState(senderKey, { action: "status_preset_menu" })
                await send(`Nenhum preset salvo para apagar.`)
                return
            }
            setState(senderKey, { action: "status_preset_apagar" })
            await send(statusPresetsTexto("apagar"))
            return
        }

        case "status_audiencia":
            setState(senderKey, { action: "status_audiencia_menu" })
            await send(menuAudienciaTexto())
            return

        case "status_audiencia_contatos": {
            usarAudienciaContatos()
            const total = totalContatosConhecidos()
            const lista = construirListaContatos()
            setState(senderKey, { action: "status_audiencia_menu" })
            await send(`╭━━「 ✅ 𝗔𝗨𝗗𝗜Ê𝗡𝗖𝗜𝗔 𝗔𝗧𝗨𝗔𝗟𝗜𝗭𝗔𝗗𝗔 」━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n📇 CONTATOS DO BOT\n\nA publicação irá para ${lista.length} destinatário(s)\n(contatos registrados + dono + ADMs +\ntelefones mapeados nos grupos).\n\nRegistrados agora: ${total}\n\n_0 = voltar · cancelar = sair_`)
            return
        }

        case "status_audiencia_custom":
            setState(senderKey, { action: "status_waiting_audience" })
            await send(`╭━━「 ✍️ 𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 」\n╰━━━━━━━━━━━━━━━━━━━━━\n\n"Somente compartilhar com..."\n\nEnvie os números com DDI+DDD,\nseparados por vírgula ou espaço:\n\n5511999999999, 5511888888888\n\nA lista substitui a atual e vale\npara a próxima publicação.\n\n_limpar = apagar lista_\n_cancelar = sair_`)
            return

        case "status_audiencia_ver": {
            setState(senderKey, { action: "status_audiencia_menu" })
            const cfg = obterStatusConfig()
            if (cfg.audienciaModo !== "custom" || !cfg.audienciaCustom.length) {
                const lista = construirListaContatos()
                await send(`╭━━「 👀 𝗔𝗨𝗗𝗜Ê𝗡𝗖𝗜𝗔 𝗔𝗧𝗨𝗔𝗟 」━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n📇 CONTATOS DO BOT\nDestinatários da publicação: ${lista.length}\nRegistrados: ${totalContatosConhecidos()}\n\nDefina uma lista personalizada (opção 2)\npara visualizar número por número.`)
                return
            }
            let t = `╭━━「 👀 𝗟𝗜𝗦𝗧𝗔 𝗣𝗘𝗥𝗦𝗢𝗡𝗔𝗟𝗜𝗭𝗔𝗗𝗔 」\n┃ ${cfg.audienciaCustom.length} destinatário(s)\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
            cfg.audienciaCustom.slice(0, 30).forEach((j, i) => { t += `${String(i + 1).padStart(2, "0")} · ${j.split("@")[0]}\n` })
            if (cfg.audienciaCustom.length > 30) t += `... +${cfg.audienciaCustom.length - 30} outros\n`
            t += `\n_0 = voltar · cancelar = sair_`
            await send(t)
            return
        }

        // [v42] Importar MEMBROS de um grupo como lista personalizada
        case "status_import_grupo": {
            setState(senderKey, { action: "status_waiting_group_import" })
            const cache = rt().groupSelectionCache[senderKey] || {}
            const grupos = Object.values(rt().cachedGroups || {})
            const admin = grupos.filter(g => g.isAdmin).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
            const membro = grupos.filter(g => !g.isAdmin).sort((a, b) => (a.subject || "").localeCompare(b.subject || ""))
            const arr = [...admin, ...membro]
            if (!arr.length) {
                await send(`⚠️ O bot não está em nenhum grupo.\nCancelar e tente mais tarde.`)
                return
            }
            arr.forEach((g, i) => { cache[i + 1] = { id: g.id || Object.keys(rt().cachedGroups).find(k => rt().cachedGroups[k] === g), subject: g.subject, isAdmin: g.isAdmin } })
            rt().groupSelectionCache[senderKey] = cache
            let t = `╭━━「 🧲 𝗜𝗠𝗣𝗢𝗥𝗧𝗔𝗥 𝗠𝗘𝗠𝗕𝗥𝗢𝗦 」━━\n┃ ${arr.length} grupos disponíveis\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
            if (admin.length) {
                t += `👑 𝗦𝗢𝗨 𝗔𝗗𝗠𝗜𝗡 (${admin.length})\n`
                admin.slice(0, 15).forEach((g, i) => { t += `  ${String(i + 1).padStart(2, "0")} · ${(g.subject || "").slice(0, 30)}\n` })
                t += `\n`
            }
            const off = admin.length
            if (membro.length) {
                t += `👤 𝗦𝗢́ 𝗠𝗘𝗠𝗕𝗥𝗢 (${membro.length})\n`
                membro.slice(0, 15).forEach((g, i) => { t += `  ${String(off + i + 1).padStart(2, "0")} · ${(g.subject || "").slice(0, 30)}\n` })
                t += `\n`
            }
            if (arr.length > 30) t += `... lista cortada em 30 — use o número global do grupo (1 a ${arr.length})\n\n`
            t += `Digite o NÚMERO do grupo para importar\ntodos os MEMBROS como audiência.\n\n⚠️ WhatsApp não aceita grupo como\naudiência de status — importamos os\nmembros (destinatários individuais).\n\n_cancelar = sair_`
            await send(t)
            return
        }

        case "status_privacidade":
            setState(senderKey, { action: "status_priv_menu" })
            await send(menuPrivacidadeTexto())
            return

        case "status_priv_all":
        case "status_priv_contacts":
        case "status_priv_none": {
            const mapa = { status_priv_all: "all", status_priv_contacts: "contacts", status_priv_none: "none" }
            const valor = mapa[actionId]
            setState(senderKey, { action: "status_priv_menu" })
            const r = await definirPrivacidadePadrao(valor)
            if (r.ok) await send(`╭━━「 🔒 𝗣𝗥𝗜𝗩𝗔𝗖𝗜𝗗𝗔𝗗𝗘 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n✅ Padrão do status alterado para:\n*${valor}*\n\n(válido para a conta — a lista por\npublicação continua sendo statusJidList)\n\n_0 = voltar_`)
            else await send(`❌ Falha ao alterar privacidade: ${r.motivo}\n\nO erro foi registrado no log do módulo.`)
            return
        }

        case "status_ver":
            setState(senderKey, { action: "status_menu_st" })
            await send(verConfigTexto())
            return

        case "status_erros":
            setState(senderKey, { action: "status_menu_st" })
            await send(verErrosTexto(5))
            return

        case "status_publicar": {
            if (statusEmAndamento()) {
                await send(`⏳ Já existe uma publicação em andamento.\nUse a opção 6 para abortar.`)
                return
            }
            const fila = obterFila()
            if (!fila.length) {
                await send(`⚠️ Nenhum status na fila.\nCrie um rascunho primeiro (menu 7 → 1, 2, 3 ou 4).`)
                return
            }
            const cfg = obterStatusConfig()
            let destino
            if (cfg.audienciaModo === "custom" && cfg.audienciaCustom.length) {
                destino = `lista personalizada (${cfg.audienciaCustom.length} destinatário(s))`
            } else {
                destino = `contatos do bot (${construirListaContatos().length} destinatário(s))`
            }
            await send(`╭━━「 ▶️ 𝗣𝗨𝗕𝗟𝗜𝗖𝗔𝗡𝗗𝗢 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n📋 ${fila.length} status na fila\n👥 ${destino}`)
            const r = await publicarStatus()
            setState(senderKey, { action: "status_menu_st" })
            let t = `╭━━「 ✅ 𝗣𝗨𝗕𝗟𝗜𝗖𝗔𝗗𝗢 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\n`
            t += `✅ Publicados: ${r.publicados}\n`
            if (r.cancelados) t += `⛔ Cancelados: ${r.cancelados}\n`
            if (r.falhas) t += `❌ Falhas: ${r.falhas} (log em 7 > 8)\n`
            t += `👥 Audiência: ${r.audiencia.replace("custom:", "lista personalizada · ").replace("contatos:", "contatos do bot · ")} destinatário(s)\n`
            if (r.aviso) t += `\n⚠️ ${r.aviso}\n`
            t += `\n_0 = menu principal · cancelar = sair_`
            await send(t)
            return
        }

        case "status_cancelar": {
            setState(senderKey, { action: "status_menu_st" })
            const r = cancelarPublicacao()
            if (r.cancelouEmAndamento) {
                await send(`╭━━「 ⛔ 𝗖𝗔𝗡𝗖𝗘𝗟𝗔𝗗𝗢 」━━━━\n╰━━━━━━━━━━━━━━━━━━━━━\n\nPublicação em andamento ABORTADA.\nRascunhos descartados: ${r.descartados}`)
            } else if (r.descartados > 0) {
                await send(`⛔ Fila limpa.\n${r.descartados} rascunho(s) descartado(s).`)
            } else {
                await send(`Nada para cancelar: fila vazia e\nnenhuma publicação em andamento.`)
            }
            return
        }

        case "status_limpar_fila": {
            const n = limparFila()
            await send(n ? `🧹 ${n} rascunho(s) removido(s) da fila.` : `Fila já está vazia.`)
            return
        }

        default:
            await send(`⚠️ Ação de status desconhecida: ${actionId}\nAbra o STATUS MANAGER pelo menu (opção 7).`)
    }
}
