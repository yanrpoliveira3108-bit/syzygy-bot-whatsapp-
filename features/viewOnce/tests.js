// features/viewOnce/tests.js
// Camada de testes/verificações para View Once - conforme solicitado.

import { detectViewOnce } from "./handler.js"
import { canProcessViewOnce } from "./permissions.js"
import { resolveDestinations } from "./destinations.js"
import { VIEW_ONCE_CONFIG } from "./config.js"

function assert(cond, msg) {
    if (!cond) throw new Error(`FAIL: ${msg}`)
    console.log(`✓ ${msg}`)
}

export async function runViewOnceTests() {
    console.log("=== TESTES VIEW-ONCE SYZYGY ===")

    // Mock permissões
    const { setAuthorizedUsers, setAuthorizedGroups, setAuthorizedLids, setExtraOwners, setConfigOwner } = await import("../../utils/permissions.js")
    const { carregarConfig, CONFIG } = await import("../../utils/config.js")
    carregarConfig()
    setConfigOwner("5519981144235")
    setAuthorizedUsers(["5511999999999"])
    setAuthorizedGroups(["120363111111111111@g.us"])
    setAuthorizedLids([])
    setExtraOwners([])

    // 1. Mensagem normal não deve ser detectada
    const normal = { key: { id: "1", remoteJid: "5511999999999@s.whatsapp.net" }, message: { conversation: "oi" } }
    assert(detectViewOnce(normal) === null, "mensagem normal não é viewOnce")

    // 2. Imagem viewOnce
    const imgVO = { key: { id: "img1", remoteJid: "5511999999999@s.whatsapp.net" }, message: { viewOnceMessage: { message: { imageMessage: { mimetype: "image/jpeg" } } } } }
    const detImg = detectViewOnce(imgVO)
    assert(detImg && detImg.mediaType === "image", "imagem viewOnce detectada")

    // 3. Vídeo viewOnce V2
    const vidVO = { key: { id: "vid1", remoteJid: "120363111111111111@g.us" }, message: { viewOnceMessageV2: { message: { videoMessage: { mimetype: "video/mp4" } } } } }
    const detVid = detectViewOnce(vidVO)
    assert(detVid && detVid.mediaType === "video", "vídeo viewOnce V2 detectado")

    // 4. Grupo autorizado como destino
    const dest = resolveDestinations()
    assert(dest.groups.includes("120363111111111111@g.us"), "grupo autorizado resolvido como destino")

    // 5. Grupo não autorizado não deve aparecer como destino
    assert(!dest.groups.includes("120363999999999999@g.us"), "grupo não autorizado não é destino")

    // 6. Owner como destino
    assert(dest.owners.length >= 1, "owner resolvido como destino")

    // 7. Admin como destino
    assert(dest.all.some(d => d.type === "admin" || d.type === "owner"), "admin/owner como destino")

    // 8. Permissão owner
    const permOwner = canProcessViewOnce({ senderJid: "5519981144235@s.whatsapp.net", chatJid: "5519981144235@s.whatsapp.net", isGroup: false })
    assert(permOwner.allowed && permOwner.role === "owner", "owner pode processar viewOnce")

    // 9. Permissão admin
    const permAdmin = canProcessViewOnce({ senderJid: "5511999999999@s.whatsapp.net", chatJid: "5511999999999@s.whatsapp.net", isGroup: false })
    assert(permAdmin.allowed && permAdmin.role === "admin", "admin pode processar viewOnce")

    // 10. [v40] Usuário comum: desde a v33 QUALQUER viewOnce recebido pelo bot é
    // processado e encaminhado (role "user") — a proteção está nos DESTINOS, não na
    // origem. O teste antigo assertava bloqueio, contradizendo o comportamento vigente.
    const permComum = canProcessViewOnce({ senderJid: "5511888888888@s.whatsapp.net", chatJid: "5511888888888@s.whatsapp.net", isGroup: false })
    assert(permComum.allowed && permComum.role === "user", "usuário comum tem viewOnce processado (role user, destino protegido)")

    // 11. Destino inválido
    const { canReceiveAsDestination } = await import("./permissions.js")
    assert(!canReceiveAsDestination({ jid: "invalid", type: "group" }), "destino inválido bloqueado")
    assert(canReceiveAsDestination({ jid: "120363111111111111@g.us", type: "group" }), "destino grupo válido")

    // 12. Duplicação
    const { processViewOnce } = await import("./service.js")
    // Simula que já processou mensagem id duplicada
    // O serviço tem cache interno, vamos testar via função isDuplicated indireta: chama processViewOnce com mesmo id 2x e vê se segunda retorna DUPLICATED
    // Para isso precisamos mockar downloadMediaMessage, mas vamos testar cache size
    const { getProcessedCacheSize, clearProcessedCache } = await import("./service.js")
    clearProcessedCache()
    assert(getProcessedCacheSize() === 0, "cache duplicação limpo")

    // 13. Config
    assert(VIEW_ONCE_CONFIG.enabled === true, "config enabled true")
    assert(VIEW_ONCE_CONFIG.maxDestinations <= 50, "maxDestinations dentro do limite")

    console.log("=== TODOS TESTES VIEW-ONCE PASSARAM ===")
}

// Se rodar direto: node features/viewOnce/tests.js
// [v40] Só roda quando é o ponto de entrada (import não executa testes, evitando
// mutar o estado global de permissões ao importar a feature).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    runViewOnceTests().catch(e => { console.error(e); process.exit(1) })
}
