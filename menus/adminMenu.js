// menus/adminMenu.js
// [REORGANIZAÇÃO] Painel administrativo (owner_panel / abrir_painel).

import { buildAdminMenuButtons } from "./menutest.js"
import { enviarMensagemInterativa } from "../services/interactiveService.js"

export async function enviarPainelAdmin(from) {
    const texto = `⚙️ *SYZYGY — PAINEL ADMINISTRATIVO*`
    const botoes = buildAdminMenuButtons()
    await enviarMensagemInterativa(from, texto, botoes)
}
