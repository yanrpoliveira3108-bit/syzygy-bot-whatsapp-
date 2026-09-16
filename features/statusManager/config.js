// features/statusManager/config.js
// [v41] 🫥 STATUS MANAGER — configuração padrão e constantes.
//
// ANÁLISE TÉCNICA (Baileys 7.0.0-rc14 — verificada no fonte instalado):
//  - Publicação: sock.sendMessage('status@broadcast', conteudo, opts)
//  - Audiência POR PUBLICAÇÃO: opts.statusJidList = [jid1, jid2, ...]
//    (lib/Types/Message.d.ts:240 — API documentada. O status é cifrado com
//     sender-key e a distribuição acontece SOMENTE para os JIDs listados —
//     é o mecanismo nativo "Somente compartilhar com..." do WhatsApp.)
//  - Texto estilizado: opts.backgroundColor ('#RRGGBB' → backgroundArgb) e
//    opts.font (proto.Message.ExtendedTextMessage.FontType).
//  - Privacidade PADRÃO da conta: sock.updateStatusPrivacy('all'|'contacts'|
//    'contact_blacklist'|'none') — API pública (lib/Socket/chats.js:119).
//
// LIMITAÇÕES REAIS (sem contorno — informadas ao usuário):
//  1. Não existe API para EXCLUIR um contato individual de um status específico.
//     O modo 'contact_blacklist' ("contatos exceto...") usa lista que só pode
//     ser editada no aplicativo do telefone.
//  2. GRUPOS não podem ser audiência de Status (regra do produto WhatsApp:
//     status é visível apenas para contatos individuais). Alternativa REAL
//     oferecida: importar os MEMBROS de um grupo como lista individual.
//  3. Não há API pública para APAGAR um status já publicado.
//  4. Vídeo: suportado, mas o servidor do WhatsApp limita a duração (~30s).
//  5. [v42] Sem statusJidList o relayMessage para status@broadcast "sucede",
//     mas NENHUM dispositivo recebe a sender-key → ninguém vê o status.
//     Por isso o módulo SEMPRE publica com statusJidList (mesmo no modo
//     "contatos", usando o registro de contatos do bot).

// Armazenamento persistido
export const STATUS_CONFIG_PATH = "./dono/status_config.json"
export const STATUS_ERROS_PATH = "./dono/status_erros.json"

export const STATUS_JID = "status@broadcast"

// Fontes reais do proto (Message.ExtendedTextMessage.FontType) na rc14:
// 0 SYSTEM · 1 SYSTEM_TEXT · 2 FB_SCRIPT · 6 SYSTEM_BOLD · 7 MORNINGBREEZE_REGULAR
// 8 CALISTOGA_REGULAR · 9 EXO2_EXTRABOLD · 10 COURIERPRIME_BOLD
export const FONTES_STATUS = {
    0: "Sistema",
    1: "Sistema Texto",
    2: "Serifado (FB Script)",
    6: "Sistema Negrito",
    7: "Morning Breeze",
    8: "Calistoga",
    9: "Exo 2 Extra Bold",
    10: "Courier Prime Bold"
}
export const FONTES_VALIDAS = new Set(Object.keys(FONTES_STATUS).map(Number))

// Cores de fundo pré-definidas (hex #RRGGBB aceitos pelo assertColor da Baileys)
export const CORES_STATUS = {
    "vermelho": "#FF0000",
    "verde": "#008000",
    "azul": "#0000FF",
    "amarelo": "#FFFF00",
    "roxo": "#8000FF",
    "rosa": "#FF00FF",
    "laranja": "#FF8000",
    "ciano": "#00FFFF",
    "preto": "#000000",
    "branco": "#FFFFFF"
}

// Limites operacionais
export const STATUS_LIMITS = {
    maxAudiencia: 256,          // máx. destinatários por publicação (statusJidList)
    maxContatos: 5000,          // máx. contatos no registro do bot
    maxTexto: 700,              // limite prático de texto de status
    maxVideoBytes: 64 * 1024 * 1024, // 64 MB (limite prático do WhatsApp)
    maxImagemBytes: 10 * 1024 * 1024, // 10 MB
    delayEntreEnvios: 1500,     // ms entre status da mesma fila
    errosHistorico: 50          // máx. registros no log de erros
}

// Config persistida em dono/status_config.json
export const STATUS_CONFIG_PADRAO = {
    audienciaModo: "contatos",      // "contatos" (lista do bot) | "custom" (statusJidList manual)
    audienciaCustom: [],            // ["5511...@s.whatsapp.net", ...]
    privacidadePadrao: null,        // informativo: "all" | "contacts" | "none" (setado via updateStatusPrivacy)
    fontePadrao: 0,                 // FontType padrão para status de texto
    corPadrao: "#000000",           // cor de fundo padrão para status de texto
    contatosConhecidos: [],         // [v42] registro de contatos (contacts.upsert + participantes de grupos)
    audienciaKeyUltima: null        // [v44] hash da última audiência publicada (dispara rotação da sender-key)
}
