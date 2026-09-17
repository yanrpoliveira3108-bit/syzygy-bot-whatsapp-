// features/flood/presets/shopping.js
// Presets do TIPO "shopping" do flood. Arquivo de DADOS: não importa nada do
// flood, não faz I/O, não conhece socket — assim config.js pode importá-lo sem
// ciclo e os testes validam cada preset com o adapter puro.
//
// Contrato (fonte: README "Shop Message" do fork + lib/Utils/messages.js:1020 —
//   no fork deste build, @lucasmod/boruto-vk7-baileys@2.1.0; no innovatorssoft
//   7.4.7 o mesmo ramo estava em ~1374):
//   sock.sendMessage(jid, { text, title, subtitle, footer, shop: { surface, id }, viewOnce? })
//     → interactiveMessage.shopStorefrontMessage { surface, id }
//
// Por que viewOnce: false aqui:
//   O README do fork mostra `viewOnce: true` em TODOS os exemplos de Shop
//   Message. Isso NÃO prova que o app do destinatário renderiza — e o wrap do
//   fork (viewOnceMessage { interactiveMessage }) é justamente o que produz
//   "mensagem indisponível" + "atualize o WhatsApp" sem atualização existir.
//   Por isso o preset vem com viewOnce: false e o adapter só manda a chave
//   quando o operador pedir true explicitamente.
//
// Por que surface: 1:
//   O proto só tem 0=UNKNOWN, 1=FB, 2=IG, 3=WA. O "4" do README não existe.

export const SHOPPING_PRESET_TEST = {
    id: "shopping-test",
    label: "🛍️ SYZYGY SHOP (teste)",
    type: "shopping",
    contentKind: "shopping",
    // format "text" = o corpo vai no atalho { text } (ramo 'text' in message do
    // ramo shop), não em caption/mídia.
    format: "text",
    // Corpo usado quando o operador responde "0" no wizard (default honesto,
    // sem depender do texto digitado).
    text: "🛍️ SYZYGY SHOP — novidades da semana",
    title: "SYZYGY SHOP",
    subtitle: "Catalog",
    footer: "SYZYGY",
    shop: {
        surface: 1,
        id: "https://en.wikipedia.org/wiki/Shopping_cart"
    },
    viewOnce: false,
    // 'puro' = ramo shop puro do fork (sem messageVersion).
    // 'flow' = mesmo card pelo ramo nativeFlow+shop, que seta messageVersion:1
    // (é o A/B para o caso "payload limpo e o app ainda diz indisponível").
    delivery: "puro"
}

export const SHOPPING_PRESETS = [SHOPPING_PRESET_TEST]

export default SHOPPING_PRESETS
