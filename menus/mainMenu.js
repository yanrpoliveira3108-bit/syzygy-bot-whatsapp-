// menus/mainMenu.js
// [v35] Menu ultra rápido PV + listas interativas com categorias e paginação

import fs from "fs"
import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber } from "../utils/permissions.js"
import { formatUptime, ok, err, warn, info } from "../utils/terminalUI.js"
import { CONFIG, MENU_IMAGE_PATH, FLOOD_MODOS, FLOOD_TIPOS_LABEL, uiModoEfetivo, floodMaxEfetivo } from "../utils/config.js"
import { moldura, separador, opcao, bloco, rodape, LOGO, LOGO_PRINCIPAL, LOGO_ASSINATURA } from "../utils/menuArt.js"
import { safeSendMessage } from "../services/groupService.js"

const OWNER_NAME = "NYX"

/** Resumo do alvo selecionado (lido da feature; nunca quebra o menu se falhar). */
function alvosResumo() {
    try {
        const n = (rt().floodSelectionGlobal || []).length
        const porDono = rt().floodSelection || {}
        const total = n || Object.values(porDono).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0)
        return total ? `${total} alvo(s) selecionado(s)` : "sem alvo (2 → 36)"
    } catch { return "sem alvo" }
}

function menuTextoNumerico({ pushname, num, date, hora, uptime, ping, saude, ram, grupos, floodModo, floodTipo, kill, alvos }) {
    const mi = FLOOD_MODOS[floodModo]
    const modoInfo = mi ? `${mi.intervalo}ms/l${mi.lote}` : floodModo
    return [
        moldura(`${LOGO_PRINCIPAL} · ⚡ painel administrativo`, { largura: 27, enfeite: "༺༻" }),
        bloco("👤 SESSÃO", { largura: 26 }),
        `┃ 👤 Dono   ⬦ ${pushname}`,
        `┃ 📞 Num    ⬦ ${num}`,
        `┃ 📆 Data   ⬦ ${date} · ${hora}`,
        `┃ ⏱️ Up     ⬦ ${uptime} · 🏓 ${ping}ms`,
        `┃ ${saude.icone} Saúde   ⬦ ${saude.texto}`,
        `┃ 🧠 RAM    ⬦ ${ram}`,
        `┃ 👥 Grupos ⬦ ${grupos}`,
        `┃ 🌊 Flood  ⬦ ${floodModo} ${modoInfo} · ${floodTipo || "📝 texto"} · teto ${floodMaxEfetivo()}`,
        `┃ ${kill ? "🛑 Flood  ⬦ BLOQUEADO (kill switch)" : "▶️ Flood  ⬦ liberado · " + (alvos || "sem alvo")}`,
        separador(12, "flores"),
        bloco("⚔️ ATACAR", { largura: 26 }),
        opcao("1", "📋 Listar Grupos"),
        opcao("2", "🌊 FLOOD", "texto ou 💳 pagamento"),
        opcao("3", "💣 Preset + NUKE"),
        opcao("4", "👑 Roubar Grupo"),
        bloco("🧰 PAINEL", { largura: 26 }),
        opcao("5", "👑 Comandos do Dono"),
        opcao("6", "⚙️ Configurações"),
        opcao("7", "🫥 Status Manager"),
        opcao("8", "🔢 Multi (Lote)"),
        opcao("0", "🚪 Sair"),
        rodape({ dica: "ou digite direto: 2/01/Oi/20/1 · pagamento · floodalvos" }),
        `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n${LOGO_ASSINATURA}`
    ].join("\n")
}

export async function enviarPainelInicial(from) {
    const sock = getSock()
    try {
        const start = Date.now()
        try { sock.sendPresenceUpdate("available", from).catch(() => {}) } catch {}
        const ping = Date.now() - start

        let saude
        if (ping < 50) saude = { icone: "🟢", texto: "Otima" }
        else if (ping < 300) saude = { icone: "🟡", texto: "Boa" }
        else if (ping < 800) saude = { icone: "🟠", texto: "Instavel" }
        else saude = { icone: "🔴", texto: "Lenta" }

        const memMB = Math.round((process.memoryUsage().rss / 1024 / 1024))
        const ram = `${memMB} MB`
        const grupos = Object.keys(rt().cachedGroups || {}).length

        const _num = normalizeNumber(sock?.user?.id || getOwnerNumber())
        const _d = new Date()
        const _date = String(_d.getDate()).padStart(2, "0") + "/" + String(_d.getMonth() + 1).padStart(2, "0") + "/" + _d.getFullYear()
        const _hora = `${String(_d.getHours()).padStart(2, "0")}:${String(_d.getMinutes()).padStart(2, "0")}`
        const _uptime = formatUptime(Date.now() - rt().bootTime)

        // Se modo texto, envia texto (com imagem se não for grupo)
        if (uiModoEfetivo() === "text") {
            const corpo = menuTextoNumerico({
                pushname: OWNER_NAME, num: _num, date: _date, hora: _hora, uptime: _uptime,
                ping, saude, ram, grupos,
                floodModo: CONFIG.floodModo || "normal",
                floodTipo: FLOOD_TIPOS_LABEL[CONFIG.floodTipo] || "📝 texto puro",
                kill: CONFIG.floodKillSwitch === true,
                alvos: alvosResumo()
            })
            // [v43] Imagem do menu AGORA SEMPRE anexa (PV e grupo) — antes só PV.
            const pathImg = CONFIG.menuImage || MENU_IMAGE_PATH
            let bufImg = null
            try {
                if (pathImg && fs.existsSync(pathImg)) {
                    const b = fs.readFileSync(pathImg)
                    if (b.length > 0 && b.length < 5 * 1024 * 1024) bufImg = b
                }
            } catch (eImg) {
                console.log(warn(`[UI] ler imagem menu falhou: ${eImg.message}`))
            }
            if (!bufImg) console.log(warn(`[UI] imagem do menu ausente (${pathImg}) — enviando só texto`))

            if (bufImg) {
                try {
                    await safeSendMessage(from, { image: bufImg, caption: corpo }, 0)
                    console.log(ok(`[UI] menu com imagem enviado -> ${from}`))
                    return
                } catch (eRaw) {
                    console.log(warn(`[UI] imagem falhou (${eRaw.message}), tentando preparar...`))
                    try {
                        const { prepararFotoBuffer } = await import("../services/mediaService.js")
                        const buf = await prepararFotoBuffer(bufImg)
                        await safeSendMessage(from, { image: buf, caption: corpo }, 0)
                        console.log(ok(`[UI] menu com imagem (prep) enviado -> ${from}`))
                        return
                    } catch (ePrep) {
                        console.log(warn(`[UI] imagem prep falhou (${ePrep.message}) — caindo para texto`))
                    }
                }
            }
            try {
                await safeSendMessage(from, { text: corpo }, 0)
            } catch {}
            console.log(ok(`[UI] menu texto enviado -> ${from}`))
            return
        }

        // Modo interativo: listas com categorias e paginação (suporta 100+ comandos)
        try {
            const { sendMainInteractiveMenu } = await import("./menu.js")
            await sendMainInteractiveMenu(from)
            console.log(ok(`[UI] menu lista interativa enviado -> ${from}`))
            return
        } catch (e) {
            console.log(warn(`[UI] falha lista interativa ${e.message}, fallback texto`))
            const corpo = menuTextoNumerico({
                pushname: OWNER_NAME, num: _num, date: _date, hora: _hora, uptime: _uptime,
                ping, saude, ram, grupos,
                floodModo: CONFIG.floodModo || "normal",
                floodTipo: FLOOD_TIPOS_LABEL[CONFIG.floodTipo] || "📝 texto puro",
                kill: CONFIG.floodKillSwitch === true,
                alvos: alvosResumo()
            })
            try { await safeSendMessage(from, { text: corpo }, 0) } catch {}
            return
        }
    } catch (e) {
        console.error("[MENU]", e)
        console.log(err(`[UI] Erro menu: ${e.message}`))
        try {
            await safeSendMessage(from, { text: " SYZYGY\n\n1 Listar Grupos 2 FLOOD 3 Preset+NUKE 4 Roubar 5 Config 6 Multi 0 Sair\n\n_Digite o número_" }, 0)
        } catch {}
    }
}
