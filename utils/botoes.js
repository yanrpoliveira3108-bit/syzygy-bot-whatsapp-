// utils/botoes.js
// [IMPLEMENTAÇÃO] Módulo GENÉRICO e REUTILIZÁVEL de botões Native Flow.
//
// Responsabilidade ÚNICA: construir o payload de um botão e validar os dados.
// NÃO conhece "painel", "config", "menu" nem qualquer comando. Quem sabe o que
// cada id significa é o handler/roteador (commands/commandRouter.js).
//
// Formato de saída: { name, buttonParamsJson } — exatamente o que o projeto já
// usa e o que o Baileys 7.0.0-rc14 espera dentro de nativeFlowMessage.buttons.
//
// IMPORTANTE sobre as chaves do JSON interno (contrato do WhatsApp, não do Baileys):
//   quick_reply    -> { display_text, id }
//   cta_copy       -> { display_text, copy_code }
//   cta_url        -> { display_text, url }
//   single_select  -> { title, text, buttonText, sections:[{ title, rows:[{title,description,id,rowId}] }] }
//
// A API pública usa nomes amigáveis (displayText, copyCode, rowId) e este módulo
// traduz para o contrato acima — assim o resto do bot não repete JSON à mão.

// ------------------------------------------------------------------
// Normalização de rows do single_select.
// Aceita rowId OU id (o dispatcher do projeto lê "id" na resposta), e garante
// AMBOS presentes para máxima compatibilidade de renderização/seleção.
// ------------------------------------------------------------------
function normalizarRow(row) {
    if (!row || typeof row !== "object") return null
    const id = row.id ?? row.rowId ?? ""
    if (!id) throw new Error("[BUTTON] cada row do single_select exige 'id' (ou 'rowId')")
    return {
        title: row.title ?? "",
        description: row.description ?? "",
        id: String(id),
        rowId: String(id)
    }
}

function normalizarSections(sections) {
    if (!Array.isArray(sections)) {
        throw new Error("[BUTTON] single_select exige 'sections' (array)")
    }
    return sections.map(sec => ({
        title: sec.title ?? "",
        rows: Array.isArray(sec.rows) ? sec.rows.map(normalizarRow).filter(Boolean) : []
    }))
}

// ------------------------------------------------------------------
// criarBotao(tipo, dados) -> { name, buttonParamsJson }
// ------------------------------------------------------------------
export function criarBotao(tipo, dados = {}) {
    if (!tipo) throw new Error("[BUTTON] Tipo não informado")

    switch (tipo) {
        case "quick_reply": {
            if (!dados.id) throw new Error("[BUTTON] quick_reply exige um id")
            return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: dados.displayText ?? dados.display_text ?? "",
                    id: String(dados.id)
                })
            }
        }

        case "cta_copy": {
            const copy = dados.copyCode ?? dados.copy_code
            if (copy == null) throw new Error("[BUTTON] cta_copy exige copyCode")
            return {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: dados.displayText ?? dados.display_text ?? "",
                    copy_code: String(copy)
                })
            }
        }

        case "cta_url": {
            if (!dados.url) throw new Error("[BUTTON] cta_url exige url")
            return {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                    display_text: dados.displayText ?? dados.display_text ?? "",
                    url: String(dados.url)
                })
            }
        }

        case "single_select": {
            const sections = normalizarSections(dados.sections)
            const payload = {
                title: dados.title ?? "",
                text: dados.text ?? "",
                buttonText: dados.buttonText ?? "SELECIONAR",
                sections
            }
            return {
                name: "single_select",
                buttonParamsJson: JSON.stringify(payload)
            }
        }

        default:
            throw new Error(`[BUTTON] Tipo de botão não suportado: ${tipo}`)
    }
}

// ------------------------------------------------------------------
// criarBotoes(lista) -> [{name, buttonParamsJson}, ...]
// lista = [{ tipo, dados }, ...]
// ------------------------------------------------------------------
export function criarBotoes(lista = []) {
    if (!Array.isArray(lista)) throw new Error("[BUTTON] criarBotoes espera um array")
    return lista.map(b => criarBotao(b.tipo, b.dados)).filter(Boolean)
}

// ------------------------------------------------------------------
// Helper de conveniência: monta um único botão single_select a partir
// de uma descrição de lista { title, text, buttonText, sections }.
// ------------------------------------------------------------------
export function criarLista(dados = {}) {
    return criarBotao("single_select", dados)
}
