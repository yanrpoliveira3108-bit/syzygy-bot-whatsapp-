// menus/menutest.js
// Construtor puro de botões Native Flow — Sem dependências de envio.
// [REORGANIZAÇÃO] Agora usa o módulo genérico utils/botoes.js (criarBotao/criarBotoes)
// em vez de montar { name, buttonParamsJson } à mão. Mesmos IDs, mesmos textos.

import { criarBotao } from "../utils/botoes.js"

export function buildMainMenuButtons(prefix = "!") {
 return [
 criarBotao("single_select", {
 title: " SYZYGY MENU",
 text: "Selecione uma opção:",
 buttonText: " CATEGORIAS",
 sections: [
                {
 title: " ADMINISTRAÇÃO",
 rows: [
                        { title: "01 Registrar Nome", description: "Alterar o nome do bot", id: "painel_registrar_nome" },
                        { title: "02 Registrar Bio", description: "Alterar a descrição do bot", id: "painel_registrar_bio" },
                        { title: "03 Listar Grupos", description: "Ver grupos disponíveis", id: "painel_listar_grupos" },
                        { title: "12 Configurações", description: "Preferências do SYZYGY", id: "painel_config" }
                    ]
                },
                {
 title: " OPERAÇÕES DE GRUPO",
 rows: [
                        { title: "05 Só Nome", description: "Alterar apenas o nome do grupo", id: "painel_so_nome" },
                        { title: "06 Só Bio", description: "Alterar apenas a bio do grupo", id: "painel_so_bio" },
                        { title: "07 Nome + Bio", description: "Alterar nome e bio do grupo", id: "painel_nome_bio" },
                        { title: "13 Preset + NUKE", description: "Aplica preset (nome+bio+foto) + NUKE", id: "painel_tudo" }
                    ]
                },
                {
 title: " MÍDIA DO GRUPO",
 rows: [
                        { title: "09 Foto do Grupo (arquivo)", description: "Alterar foto via arquivo", id: "painel_foto_grupo" },
                        { title: "10 Foto por Link/URL", description: "Alterar foto via URL", id: "painel_foto_link" },
                        { title: "11 Remover Foto", description: "Remover foto do grupo", id: "painel_remover_foto" }
                    ]
                },
                {
 title: " AÇÕES DESTRUTIVAS",
 rows: [
                        { title: "04 NUKE", description: "Executar NUKE no grupo", id: "painel_nuke" },
                        { title: "08 FLOOD", description: "Envio massivo de mensagens", id: "painel_flood" },
                        { title: "14 Roubar Grupo", description: "Tira admin de todos, fecha e domina", id: "painel_roubar" }
                    ]
                }
            ]
        }),
 criarBotao("quick_reply", { displayText: " Painel Completo", id: "abrir_painel" }),
 criarBotao("quick_reply", { displayText: " Status", id: "cfg_status" }),
 criarBotao("cta_copy", { displayText: " Copiar Prefixo", copyCode: prefix })
    ]
}

export function buildAdminMenuButtons() {
 return [
 criarBotao("single_select", {
 title: " PAINEL SYZYGY",
 text: "Selecione uma função:",
 buttonText: " SELECIONAR",
 sections: [{
 title: " ADMINISTRAÇÃO",
 rows: [
                    { title: "01 Registrar Nome", description: "Alterar o nome do bot", id: "painel_registrar_nome" },
                    { title: "02 Registrar Bio", description: "Alterar a descrição do bot", id: "painel_registrar_bio" },
                    { title: "03 Listar Grupos", description: "Listar os grupos disponíveis", id: "painel_listar_grupos" },
                    { title: "04 NUKE", description: "Executar função NUKE existente", id: "painel_nuke" },
                    { title: "05 Só Nome", description: "Executar alteração somente de nome", id: "painel_so_nome" },
                    { title: "06 Só Bio", description: "Alterar a descrição do bot", id: "painel_so_bio" },
                    { title: "07 Nome + Bio", description: "Alterar nome e bio do bot", id: "painel_nome_bio" },
                    { title: "08 FLOOD", description: "Executar função FLOOD existente", id: "painel_flood" },
                    { title: "09 Foto do Grupo", description: "Alterar foto usando mídia", id: "painel_foto_grupo" },
                    { title: "10 Foto por Link", description: "Alterar foto usando URL", id: "painel_foto_link" },
                    { title: "11 Remover Foto", description: "Remover foto do grupo", id: "painel_remover_foto" },
                    { title: "12 Configurações", description: "Abrir configurações do SYZYGY", id: "painel_config" },
                    { title: "13 Preset + NUKE", description: "Aplica preset (nome+bio+foto) + NUKE", id: "painel_tudo" },
                    { title: "14 Roubar Grupo", description: "Tira admin de todos, fecha e domina", id: "painel_roubar" }
                ]
            }]
        })
    ]
}

export function buildConfigButtons() {
 return [
 criarBotao("single_select", {
 title: " CONFIG",
 text: "Configurações:",
 buttonText: " SELECIONAR",
 sections: [{
 title: "SISTEMA",
 rows: [
                    { title: " Alterar imagem do menu", description: "", id: "cfg_menuImage" },
                    { title: " Visualizar proprietário", description: "", id: "cfg_owner" },
                    { title: " Número conectado", description: "", id: "cfg_number" },
                    { title: " Status da conexão", description: "", id: "cfg_status" },
                    { title: " Atualizar menu", description: "", id: "cfg_restart" },
                    { title: " Voltar", description: "", id: "abrir_painel" }
                ]
            }]
        })
    ]
}

export function buildGroupActionsButtons(groupId, groupSubject, isAdmin) {
 return [
 criarBotao("single_select", {
 title: " AÇÕES DO GRUPO",
 text: groupSubject,
 buttonText: " EXECUTAR AÇÃO",
 sections: [{
 title: " AÇÕES DISPONÍVEIS",
 rows: [
                    { title: " Alterar Nome", description: "Mudar o nome do grupo", id: "painel_so_nome" },
                    { title: " Alterar Bio", description: "Mudar a descrição", id: "painel_so_bio" },
                    { title: " Nome + Bio", description: "Alterar ambos", id: "painel_nome_bio" },
                    { title: " Foto (arquivo)", description: "Enviar foto ou documento", id: "painel_foto_grupo" },
                    { title: " Foto (link/URL)", description: "Enviar URL da foto", id: "painel_foto_link" },
                    { title: " Remover Foto", description: "Remove a foto atual", id: "painel_remover_foto" },
                    { title: " NUKE", description: "Ação destrutiva", id: "painel_nuke" },
                    { title: " FLOOD", description: "Envio massivo", id: "painel_flood" },
                    { title: " Voltar ao Menu", description: "Painel principal", id: "abrir_painel" }
                ]
            }]
        }),
 criarBotao("quick_reply", { displayText: " Painel Principal", id: "abrir_painel" }),
 criarBotao("cta_copy", { displayText: " Copiar ID do Grupo", copyCode: groupId })
    ]
}
