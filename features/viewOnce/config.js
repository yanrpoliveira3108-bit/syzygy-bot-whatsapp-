// features/viewOnce/config.js
// [v33] Config ViewOnce com modo sem salvar em disco + destinos por origem

export const VIEW_ONCE_CONFIG = {
    enabled: true,

    sendToAuthorizedGroups: true,
    sendToOwner: true,
    sendToAdmins: true,

    maxDestinations: 50,
    maxGroups: 30,
    maxAdmins: 20,

    allowedTypes: ["image", "video", "audio", "document", "sticker", "ptt"],

    logEvents: true,

    dedupTtlMs: 5 * 60 * 1000,

    captionPrefix: "👁️ Visualização Única aberta\n",
    keepOriginalCaption: true,
    sendAsViewOnce: false,

    processFromProtectedGroups: true,

    // [v33] Destinos por origem: PV -> só owner, Grupo -> só grupos autorizados
    pvToOwnerOnly: true,
    groupToGroupsOnly: true,

    // [v33] Não salvar em disco: baixa em buffer, envia, apaga (se salvar temp, apaga depois)
    saveToDisk: false,
    tempDir: "./temp",
    deleteAfterSend: true
}
