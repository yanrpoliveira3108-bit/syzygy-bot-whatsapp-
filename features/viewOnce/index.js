// features/viewOnce/index.js
// Entry point da feature View Once - exporta API pública e integração.

import { VIEW_ONCE_CONFIG } from "./config.js"
import { detectViewOnce, handleViewOnceMessage } from "./handler.js"
import { processViewOnce, getProcessedCacheSize, clearProcessedCache } from "./service.js"
import { resolveDestinations, formatDestinationsTexto } from "./destinations.js"
import { canProcessViewOnce, canReceiveAsDestination } from "./permissions.js"

export {
    VIEW_ONCE_CONFIG,
    detectViewOnce,
    handleViewOnceMessage,
    processViewOnce,
    resolveDestinations,
    formatDestinationsTexto,
    canProcessViewOnce,
    canReceiveAsDestination,
    getProcessedCacheSize,
    clearProcessedCache
}

// Função principal para integração no messageHandler
export async function onMessageViewOnce({ chatJid, senderJid, isGroup, webMessageInfo }) {
    if (!VIEW_ONCE_CONFIG.enabled) return null
    const detection = detectViewOnce(webMessageInfo)
    if (!detection) return null
    return await handleViewOnceMessage({ chatJid, senderJid, isGroup, webMessageInfo })
}
