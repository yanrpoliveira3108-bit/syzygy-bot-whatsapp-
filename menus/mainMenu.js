// menus/mainMenu.js
// [v35] Menu ultra rápido PV + listas interativas com categorias e paginação

import fs from "fs"
import { getSock, rt } from "../connection/socket.js"
import { normalizeNumber, getOwnerNumber } from "../utils/permissions.js"
import { formatUptime, ok, err, warn, info } from "../utils/terminalUI.js"
import { CONFIG, MENU_IMAGE_PATH, FLOOD_MODOS, uiModoEfetivo } from "../utils/config.js"
import { safeSendMessage } from "../services/groupService.js"

const OWNER_NAME = "NYX"

function menuTextoNumerico({ pushname, num, date, hora, uptime, ping, saude, ram, grupos, floodModo }) {
    const modoInfo = FLOOD_MODOS[floodModo] ? `${FLOOD_MODOS[floodModo].intervalo}ms/l${FLOOD_MODOS[floodModo].lote}` : floodModo
    return `╭━━「 ⚡ 𝗦𝗬𝗭𝗬𝗚𝗬 」━━━━━━━╮\n` +
           `┃      painel administrativo     ⚡\n` +
           `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
           `╭─〔 👤 𝗦𝗘𝗦𝗦𝗔𝗢 〕────────────\n` +
           `┃ 👤 Dono   ⬦ ${pushname}\n` +
           `┃ 📞 Num    ⬦ ${num}\n` +
           `┃ 📆 Data   ⬦ ${date} · ${hora}\n` +
           `┃ ⏱️ Up     ⬦ ${uptime} · 🏓 ${ping}ms\n` +
           `┃ ${saude.icone} Saúde   ⬦ ${saude.texto}\n` +
           `┃ 🧠 RAM    ⬦ ${ram}\n` +
           `┃ 👥 Grupos ⬦ ${grupos}\n` +
           `┃ 🌊 Flood  ⬦ ${floodModo} ${modoInfo}\n` +
           `╰────────────────────────\n` +
           `╭─〔 ⚔️ 𝗔𝗧𝗔𝗤𝗨𝗘 & 𝗚𝗥𝗨𝗣𝗢𝗦 〕───────\n` +
           `┃ ⬥ 1 · 📋 Listar Grupos\n` +
           `┃ ⬥ 2 · 🌊 FLOOD\n` +
           `┃ ⬥ 3 · 💣 Preset + NUKE\n` +
           `┃ ⬥ 4 · 👑 Roubar Grupo\n` +
           `╰────────────────────────\n` +
           `╭─〔 🧰 𝗣𝗔𝗜𝗡𝗘𝗟 〕──────────────\n` +
           `┃ ⬥ 5 · 👑 Comandos do Dono\n` +
           `┃ ⬥ 6 · ⚙️ Configurações\n` +
           `┃ ⬥ 7 · 🫥 Status Manager\n` +
           `┃ ⬥ 8 · 🔢 Multi (Lote)\n` +
           `┃ ⬥ 0 · 🚪 Sair\n` +
           `╰────────────────────────\n` +
           `_Digite o número da opção_\n` +
           `▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n` +
           `⚔️ SYZYGY · NYX`
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
                floodModo: CONFIG.floodModo || "normal"
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
                floodModo: CONFIG.floodModo || "normal"
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
