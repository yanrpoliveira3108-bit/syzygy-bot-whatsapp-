// handlers/interactionHandler.js
// [REORGANIZAÇÃO] Ponte entre a UI interativa e o roteador.
// INTERPRETA a interação (getInteractiveId) e a repassa ao roteador central.

// handlers/interactionHandler.js
// [REORGANIZAÇÃO] Camada de BOTÃO (button handler): identifica a interação,
// extrai o ID real e chama a AÇÃO existente (roteadorAcoes). NÃO trata clique
// como texto — origem separada por logs [BUTTON] e [ACTION].

import { getInteractiveId } from "../services/interactiveService.js"
import { roteadorAcoes } from "../commands/commandRouter.js"

export { getInteractiveId }

export async function tratarInteracao(chatJid, senderNum, interactionId) {
    // [BUTTON] = origem: clique/seleção nativa (não é texto digitado).
    console.log(`[BUTTON] interação recebida | id=${interactionId}`)
    try {
        // [v49] O transporte dedupa rowIds duplicados com "#2" — descarta sufixo.
        let id = String(interactionId || "").split("#")[0]
        // [v49] Navegação: "voltar_menu" não é ação do roteador — vira menu_inicial
        // (que o roteador conhece e reabre o painel). cat_*/comandos seguem direto.
        if (id === "voltar_menu" || id === "menu_inicial") id = "menu_inicial"
        console.log(`[ACTION] executando=${id}`)
        await roteadorAcoes(chatJid, senderNum, id)
    } catch (error) {
        console.error(`[BUTTON] erro ao processar interação:`, error?.message || error)
    }
}
