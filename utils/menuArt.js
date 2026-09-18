// utils/menuArt.js
// [v53 · AB7] Identidade visual ÚNICA dos menus. Antes cada painel desenhava a
// própria moldura no próprio arquivo (╭━━「 」, ┏┓, ╔═╗ misturados) — o resultado
// era menu bonito em um lugar e torto no outro. Agora: um só módulo, todos os
// painéis passam por aqui.
//
// Regras que este módulo aplica (e que os menus não podem contornar):
//  • cada página cabe em ~10 opções → nada de "Ler Mais" engolindo opção de menu
//    (utils/lerMais.js dobra o que passa do limite de exibição do app);
//  • número sempre na 2ª coluna com zero à esquerda (01…40) porque o cliente
//    digita `05`, `5`, `6>12` e os três têm de funcionar;
//  • nenhum caractere depende de fonte exótica para alinhar: as linhas de
//    separação são formadas por um glifo repetido, não por espaços contados.
//  • o logotipo em unicode decorado é ENFEITE, nunca chave de parsing — ninguém
//    compara texto de menu com string literal (os testes verificam ação roteada,
//    não arte).

/** Logotipo nas fontes decorativas que o projeto usa (só exibição). */
export const LOGO = {
    fraktur: "𝖘𝖞𝖟𝖞𝖌𝖞",
    sansBold: "𝗦𝗬𝗭𝗬𝗚𝗬",
    mono: "𝚜𝚢𝚣𝚢𝚐𝚢",
    italic: "𝘀𝘆𝘇𝘆𝗴𝘆",
    superscript: "ˢʸᶻʸᵍʸ",
    geometric: "ꇙꌦꁴꌦꍌꌦ"
}

/** Padrão do projeto: título em fraktur, subtítulo em superscript. */
export const LOGO_PRINCIPAL = LOGO.fraktur
export const LOGO_ASSINATURA = `⚔️ ${LOGO.fraktur} · 𝕹𝖁𝖝`

const LINHA = "━"
const FILETE = "─"

function linhaRep(glifo, n) {
    return String(glifo).repeat(Math.max(0, n))
}

/**
 * ╔═══════ ༺ ═══════╗
 *  𝖘𝖞𝖟𝖞𝖌𝖞 · TÍTULO
 * ╚═══════ ༻ ═══════╝
 * A moldura se DIMENSIONA sozinha pelo título (o lado esquerdo nunca fica menor
 * que o direito): menu com moldura torta era a reclamação estética nº 1.
 */
export function moldura(titulo, { largura = 0, enfeite = "༺༻" } = {}) {
    const t = String(titulo).trim()
    // cada lado da moldura cobre metade do título + folga, então a caixa nunca
    // fica menor que a linha do meio (era isto que tortava o cabeçalho)
    const lado = Math.max(4, Math.ceil((t.length - 1) / 2), Math.floor((Number(largura) || 0) / 2))
    const e1 = enfeite[0] || "❝"
    const e2 = enfeite[1] || e1
    const linha = `${linhaRep(LINHA, lado)} ${e1}`
    const fim = `${e2} ${linhaRep(LINHA, lado)}`
    return `╔${linha} ${linhaRep(LINHA, lado)}╗\n ${t}\n╚${linhaRep(LINHA, lado)} ${fim}╝`
}

/** ━━━━━━༺༻━━━━━━ (separador curto entre blocos do mesmo menu) */
export function separador(n = 14, estilo = "flores") {
    if (estilo === "laser") return `•❅──────✧❅✦❅✧──────❅•`
    if (estilo === "coracao") return `╭──────༺♡༻──────╮`
    if (estilo === "neve") return `————— ☆ • ♧ • ♤ • ♧ • ☆ —————`
    if (estilo === "trilho") return `▬▬ι${linhaRep("═", Math.max(6, n))}ι▬▬`
    if (estilo === "suave") return `${linhaRep(FILETE, n)}༺${linhaRep(FILETE, n)}`
    return `${linhaRep(LINHA, n)}༺༻${linhaRep(LINHA, n)}`
}

/** ⌞⌝⌟⌜ — filete de rodapé/aviso curto */
export function filete(n = 12) {
    return linhaRep("⌞", Math.ceil(n / 4)) + linhaRep("⌝", Math.floor(n / 4))
}

/**
 * Linha de opção numerada. `numero` é string ou number; `direita` é um estado
 * curto (ON/OFF, "50ms/l8", "3 grupos"). Alinhamento por glifo, não por espaços
 * contados: em fonte de WhatsApp o espaçamento é proporcional.
 */
export function opcao(numero, rotulo, direita = "") {
    const n = String(numero).padStart(2, "0")
    return direita ? `┃ ${n} ⬥ ${rotulo} · ${direita}` : `┃ ${n} ⬥ ${rotulo}`
}

/** Cabeçalho de bloco dentro de um menu: ┃〔 🌊 FLOOD 〕────── */
export function bloco(titulo, { largura = 22 } = {}) {
    const t = `〔 ${String(titulo).trim()} 〕`
    return `┃${t}${linhaRep(FILETE, Math.max(2, largura - t.length))}`
}

/** Rodapé de menu: hint de digitação + paginação (uma linha só sublinhada). */
export function rodape({ pagina = null, totalPaginas = null, dica = "digite o número da opção" } = {}) {
    const pag = pagina && totalPaginas ? ` · ${pagina}/${totalPaginas} ("mais" avança, "menos" volta)` : ""
    return `╰${linhaRep(FILETE, 24)}\n_${dica}${pag}_`
}

/**
 * Monta um menu paginado a partir de [numero, rotulo, direita?].
 * @returns {{texto:string, paginas:Array<string>, linhaPorPagina:number}}
 */
export function montarMenu({ titulo, subtitulo = null, itens, porPagina = 12, secoes = null, rodapeOpts = {} }) {
    const grupos = []
    if (secoes && secoes.length) {
        for (const sec of secoes) {
            const seus = itens.filter(i => sec.numeros.includes(String(i[0])))
            if (seus.length) grupos.push({ titulo: sec.titulo, itens: seus })
        }
    } else {
        grupos.push({ titulo: null, itens })
    }

    // paginação respeitando bloco (uma seção nunca é cortada no meio)
    const blocos = []
    for (const g of grupos) {
        for (let i = 0; i < g.itens.length; i += porPagina) {
            blocos.push({ titulo: g.titulo, itens: g.itens.slice(i, i + porPagina), continua: i + porPagina < g.itens.length })
        }
    }

    const cabecalho = [moldura(`${LOGO_PRINCIPAL} · ${titulo}`), subtitulo ? `${subtitulo}` : null, separador(11)]
        .filter(x => x != null).join("\n")

    const paginas = blocos.map((b, idx) => {
        const corpo = []
        if (b.titulo) corpo.push(bloco(b.titulo))
        for (const [num, rot, dir] of b.itens) corpo.push(opcao(num, rot, dir))
        const rod = rodape({ ...rodapeOpts, pagina: blocos.length > 1 ? idx + 1 : null, totalPaginas: blocos.length > 1 ? blocos.length : null })
        return `${cabecalho}\n${corpo.join("\n")}\n${rod}`
    })

    return { texto: paginas[0], paginas, linhaPorPagina: porPagina }
}

/** Status de um toggle, no padrão dos painéis. */
export function estado(onOff, { on = "✅ LIGADO", off = "⬜ desligado" } = {}) {
    return onOff ? on : off
}

/** Sinalização de "item removido desta versão" (nunca número fantasma silencioso). */
export function itemRemovido(nome, motivo = "saiu desta versão") {
    return `⚠️ *${nome}* ${motivo}.\nUse o painel do flood (2) — o alvo é escolhido lá, igual ao flood de texto.`
}

export default { LOGO, moldura, separador, opcao, bloco, rodape, montarMenu, estado, itemRemovido }
