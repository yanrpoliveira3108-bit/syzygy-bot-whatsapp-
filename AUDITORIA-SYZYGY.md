# SYZYGY — Auditoria Técnica + Modularização

> Transferência de projeto concluída. Mesmo SYZYGY, agora modular, com botões
> nativos corrigidos, comandos e fluxos preservados. Nenhuma funcionalidade removida.

---

## 1. DIAGNÓSTICO

O projeto recebido concentrava ~1384 linhas em um único `index.js`, importando de
`utils/` e `menus/menutest.js`. Os arquivos `menu.js` e `groups.js` eram **código
legado** (usavam `sendInteractive()` de um `utils/menuBuilder.js` que sequer foi
enviado) e **não eram usados** pelo `index.js`.

### Problemas encontrados

| # | Tipo | Problema | Correção |
|---|------|----------|----------|
| 1 | **[CORREÇÃO]** | `enviarMensagemInterativa()` montava o Native Flow, mas com `messageParamsJson: ""` (string vazia). No Baileys 7.0.0-rc14 isso pode invalidar o render e cair no `catch` → **botão virava texto**. | `messageParamsJson: "{}"` (JSON válido) + normalização de cada botão + fallback textual só em falha REAL, com log do erro. |
| 2 | **[CORREÇÃO]** | Os botões de paginação `grp_page_N` eram **gerados** na lista, mas o roteador **não tinha handler** para eles. Clicar em "Próxima página" (botão nativo) não fazia nada — só o texto `pag 2`/`p2` funcionava. | Adicionado `if (actionId.startsWith("grp_page_"))` no roteador, espelhando o comportamento textual. |
| 3 | **[REORGANIZAÇÃO]** | Tudo num `index.js` gigante. | Separado em `connection/ handlers/ menus/ actions/ services/ commands/ utils/`. |
| 4 | **[COMPATIBILIDADE]** | Legado `menu.js`/`groups.js` referenciava módulo inexistente. | Movido para `legacy/` (preservado, desconectado — conforme sua escolha). |

### Confirmação técnica do formato de botões
Verificado no ambiente real: **Baileys 7.0.0-rc14** expõe
`proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton`. O caminho
`generateWAMessageFromContent` → `viewOnceMessage` → `interactiveMessage` →
`sock.relayMessage` é o formato nativo correto — foi **preservado** e corrigido,
não substituído.

---

## 2. MAPA DE ARQUITETURA


---

## 9. ATUALIZAÇÃO v40 — [2026-08-27]

Diagnóstico dirigido (roteador + estados + E2E com socket simulado) encontrou e corrigiu:

| # | Tipo | Problema | Correção |
|---|------|----------|----------|
| 1 | **[CORREÇÃO]** | Botões OFICIAIS do painel (`painel_registrar_nome`, `painel_registrar_bio`, `painel_nuke`, `painel_so_nome`, `painel_so_bio`, `painel_nome_bio`, `painel_foto_grupo`, `painel_foto_link`, `painel_remover_foto`) e legados (`owner_nome`, `owner_bio`, `owner_nome_bio`, `owner_nuke`, `owner_foto_arquivo`, `owner_foto_link`, `owner_remover_foto`, `owner_so_nome`, `owner_so_bio`) eram gerados pelos builders de `menus/menutest.js` (usados pelo painel admin e menu de ações do grupo), mas o `commandRouter` não tinha handler — clique não fazia NADA. Os estados `waiting_*`/`confirm_*` correspondentes sempre existiram no `stateHandler`. | Despachos restaurados no roteador via `pedirGrupo(next)` exatamente como no MAPA DE BOTÕES (seção 4). |
| 2 | **[CORREÇÃO]** | `cfg_list_presets` existia no menu interativo (categoria Presets) sem handler → clique silencioso. | Handler adicionado (`listarPresetsTexto()`). |
| 3 | **[CORREÇÃO]** | `group-participants.update` (bot removido): o `subject` era lido DEPOIS do `delete rt().cachedGroups[...]` → notificação anti-takeover sempre mostrava o JID cru em vez do nome do grupo. | Subject capturado antes do delete. |
| 4 | **[CORREÇÃO]** | Estado `group_agendar_tipo` sem `selectedGroup` → `Cannot read properties of undefined`. Estado `agendar_tempo` sem `tipo` → `job` indefinido → crash. | Fallbacks defensivos (mesmo padrão já usado em `group_action_menu`). |
| 5 | **[CORREÇÃO]** | `features/viewOnce/tests.js` desatualizado: assertava "usuário comum bloqueado", contrariando a regra v33 (qualquer viewOnce é processado; a proteção está nos DESTINOS). Também rodava os testes (mutando permissões globais) sempre que importado. | Assert alinhado à v33; testes só rodam como ponto de entrada. |
| 6 | **[MELHORIA]** | Clique em actionId desconhecido → silêncio total. | Fallback no roteador: "Comando não reconhecido" + dica do menu. |
| 7 | **[MELHORIA]** | `INSTALAR.sh` não buscava o ZIP em `~/downloadas` (pasta onde o dono salva o ZIP). | Caminho incluído na busca. |

**Validações v40 (todas passaram):**
- `node --check` em todos os arquivos ativos
- Grafo de imports/exports completo sem referências quebradas
- Testes ViewOnce (13 asserts)
- Roteador dirigido: 65 IDs (menu completo + oficiais + legados + fallback) → 0 erros, 0 silêncios
- Estados dirigidos: guardas `group_agendar_tipo`/`agendar_tempo` → 0 erros
- E2E via `messages.upsert` simulado: menu → listar → selecionar → flood-msg → cancelar → config → relatório → agendamentos → fast flood → status → presets → eco ignorado
- Fluxo botão oficial validado: `painel_registrar_nome` → `waiting_group` → `grp_select_1` → `waiting_name` ✓

---

## 10. ATUALIZAÇÃO v41 — 🫥 STATUS MANAGER [2026-08-27]

### Análise da Baileys 7.0.0-rc14 (verificada no fonte instalado — sem suposições)

| Recurso | Situação real | Onde no fonte |
|---------|---------------|---------------|
| Publicar status | `sock.sendMessage('status@broadcast', conteudo)` — texto/imagem/vídeo | `lib/Socket/messages-send.js` |
| **Audiência por publicação** | Opção documentada `statusJidList: string[]` em `sendMessage`/`relayMessage`. O status é cifrado (sender-key) e a distribuição acontece SOMENTE para os JIDs listados — mecanismo nativo "Somente compartilhar com..." | `lib/Types/Message.d.ts:240` · `lib/Socket/messages-send.js:527` |
| Texto estilizado | `opts.backgroundColor` ('#RRGGBB' → `backgroundArgb`) e `opts.font` (FontType 0,1,2,6,7,8,9,10) | `lib/Utils/messages.js:299-303` |
| Privacidade PADRÃO da conta | `sock.updateStatusPrivacy('all'\|'contacts'\|'contact_blacklist'\|'none')` — API pública | `lib/Socket/chats.js:119` |

### Limitações REAIS (informadas no módulo — sem contornos)
1. **Não é possível excluir um contato individual de um status** — o modo `contact_blacklist` ("contatos exceto...") tem lista editável apenas no app do telefone; a Baileys altera o modo, não a lista.
2. **Grupos não podem ser audiência de Status** — regra do produto WhatsApp (status é visível só para contatos individuais). O campo `statusJidList` aceita JIDs individuais.
3. **Não há API pública para apagar um status já publicado** nesta versão.
4. Vídeo: suportado, mas o servidor limita a duração (~30s).

### O que foi implementado (`features/statusManager/`)
- `config.js` — constantes, fontes reais do proto, cores, limites, paths (`dono/status_config.json`, `dono/status_erros.json`).
- `service.js` — fila de rascunhos, audiência (custom/contatos), `publicarStatus()` com `statusJidList`, `cancelarPublicacao()` (aborta em andamento + limpa fila), `definirPrivacidadePadrao()` (updateStatusPrivacy), **log de erros** (`dono/status_erros.json` + histórico do bot), **autorização** dono/ADM (extra ao gate global do messageHandler).
- `index.js` — `statusRouter()` (17 ações `status_*`) + menus numerados em texto (compatível com qualquer cliente).

### Integrações (mínimas, sem tocar em nada existente)
- `commands/commandRouter.js` — delegação do prefixo `status_*` (1 bloco).
- `handlers/stateHandler.js` — 7 estados novos (`status_waiting_text/image/video/audience`, `status_menu_st`, `status_audiencia_menu`, `status_priv_menu`).
- `commands/commandMap.js` — aliases `status`/`st`/`statusconfig`/`statuspublicar`/`statuscancelar` + `7`. **Corrigida chave duplicada**: `"status"` existia 2x no objeto (a última vencia → `cfg_status`). Agora `status`/`!status` abrem o STATUS MANAGER (intenção atual do dono) e o status do bot continua acessível via `botstatus`/`!botstatus` (e config 5>4, e `relatorio`) — nenhuma funcionalidade perdida.
- `menus/menu.js` — categoria "Status" (9 comandos) + despacho `status_*` no clique de lista.
- `menus/mainMenu.js` — linha `7 · 🫥 Status` no painel principal.
- `handlers/messageHandler.js` — ignora `status@broadcast` recebido (status de contatos não são input; antes, um status de contato com texto "menu"/"1" poderia gerar resposta automática) + despacho `status_*` no fallback de lista.
- Sintaxe de texto: `Bom dia! #1a8f3c #6` → cor de fundo + fonte (extraídos no service, fonte única).

### Validações v41 (todas passaram)
- Unidade STATUS MANAGER: **28/28** (autorização dono/ADM/comum, parse de audiência com inválidos, drafts texto/imagem/vídeo/mídia inválida, publicação com `statusJidList` (2 destinatários) e sem lista (modo contatos), cor/fonte aplicadas, cancelamento, fila vazia, updateStatusPrivacy válido/inválido, log de erros, router bloqueia não autorizado, 18 ações respondem)
- E2E via `messages.upsert`: `status` → menu → `4` audiência → `2` lista → números → `1` texto → texto com `#cor #fonte` → `6` publicar (statusJidList com 2 destinatários confirmado) → `8` erros → `7` cancelar → `cancelar` sai do estado → `statusconfig` fora de estado → **status de contato ignorado** — 0 falhas
- Regressão: **83/83** IDs no roteador (menu completo + oficiais + legados + status + botstatus) — 0 erros, 0 silêncios
- Testes ViewOnce (15 asserts) ✓ · `node --check` em todos ✓ · grafo de imports/exports ✓ · `npm start` inalterado ✓

---

## 12. ATUALIZAÇÃO v43 — @lid direto, terminal monitor roxo, menu c/ imagem sempre [2026-08-27]

### 1. Correção do "❌ Nenhum membro com telefone conhecido"
Causa: `importarMembrosGrupo` descartava participantes que só têm `@lid` (grupos no modo de
endereçamento LID do WhatsApp) quando o mapa LID↔telefone estava vazio.
Correção REAL: o `@lid` é um endereço de entrega legítimo (é o que o próprio grupo usa) —
agora Telefones conhecidos têm prioridade e os `@lid` restantes entram DIRECTAMENTE no
`statusJidList`. O mapa continua sendo alimentado (`atualizarMapaDeParticipantes`) para
converter LID→telefone sempre que possível. Confirmação agora exibe:
`📱 Com telefone: N` + `🆔 Só @lid (direto): M`, e o terminal loga a quebra.

### 2. Logs no terminal (LIDs e viewOnce)
- Import de membros: `[STATUS] import <jid>: 30 membros -> 12 telefone(s) + 18 @lid direto (ex: ...)`
- Publicação: `[STATUS] <tipo> publicado -> N destinatário(s) [amostra]`
- ViewOnce: falhas agora logam no TERMINAL com motivo (`motivo=MEDIA_DOWNLOAD_FAILED ...`),
  além da mensagem no chat — antes o motivo só aparecia no WhatsApp.

### 3. Terminal → PAINEL MONITOR (roxo), comandos só no WhatsApp
- Menu `[01]-[12]` REMOVIDO do terminal (todas as funções já existem no WhatsApp).
- `handlers/terminal.js` reescrito: banner + painel de status roxos, linha de status
  compacta a cada 60s, `sair`/Ctrl+C encerra. O `readline` (`ask`) foi PRESERVADO porque
  o PAIRING CODE da 1ª conexão depende dele.
- `utils/terminalUI.js`: tema roxo (ANSI 256: violeta 141 / roxo 93 / lilás 183) em banner,
  painel, títulos e créditos. Funções e assinaturas mantidas.

### 4. Menu com imagem SEMPRE + mais bonito
- `menus/mainMenu.js`: painel reformulado (caixas ╭━━, seções 👤 SESSÃO / 🎛️ COMANDOS /
  ⚡ MODO RÁPIDO, rodapé ▬▬ + "⚔️ SYZYGY · NYX × ANTY DOMINA").
- Imagem anexada em TODAS as respostas de menu (PV **e** grupo) para quem tem ADM no bot —
  antes só PV. Falhas de imagem agora logam o motivo (raw → prepara → texto).
- `services/list.js`: mesma regra (imagem sempre).
- **Imagem padrão inclusa** no projeto (`dono/menus/Foto-menu/img-menu.jpg`, banner roxo
  SYZYGY gerado para o build) — o menu nunca mais fica sem imagem; a foto personalizada do
  dono continua sendo preservada pelo INSTALAR.sh.

### Validações v43 (todas passaram)
- Unidade **10/10**: grupo só-@lid importa 3/3 via LID direto · statusJidList contém os @lid ·
  grupo misto 2 tel + 2 lid (telefones primeiro) · img-menu.jpg padrão presente · menu em
  GRUPO com imagem · menu no PV imagem+caption · terminal exporta ask/menuTerminal sem
  comandos antigos · tema roxo aplicado
- Regressão **82/82** · ViewOnce 15 asserts ✓ · sintaxe ✓ · imports/exports ✓ ·
  `config.json` restaurado ✓ · `npm start` inalterado ✓

---

## 13. ATUALIZAÇÃO v44 — Status visível só para a lista escolhida (rotação de sender-key) [2026-08-29]

### Diagnóstico real (relato: "posta pra todo mundo")
Lido o fluxo completo de `relayMessage` para `status@broadcast` na Baileys 7.0.0-rc14
(`lib/Socket/messages-send.js:428-740`):
1. A mensagem de status é cifrada como **grupo** com UMA **sender-key** de
   `status@broadcast` — o MESMO ciphertext para todos.
2. `statusJidList` apenas define **quem recebe a SKDM** (a distribuição da chave).
3. Nada é declarado ao servidor sobre audiência — a entrega segue a privacidade da conta.

Conclusão: quem recebeu a chave em uma publicação anterior (ex.: testes em modo
"contatos do bot", que distribuiu a chave para todos os contatos conhecidos) continuava
capaz de **descriptografar publicações futuras com listas menores** → "aparece pra todo
mundo". Também explica a v41 ("não publica": sem `statusJidList`, ninguém recebeu a chave —
nem o próprio dono conseguia ver).

### Correção REAL (v44)
**Rotação da sender-key do status quando a audiência muda** (`rotacionarChaveStatus()`):
- Remove a sender-key de `status@broadcast` do key store (`'sender-key'`, variantes
  PN/LID — para status a Baileys assina com a identidade LID quando existe) e zera o
  `'sender-key-memory'` do grupo.
- A próxima publicação gera chave NOVA (a cifra recria o registro quando ausente —
  verificado em `libsignal.js:124` `ensureSenderKeyAndCreateSkdm`) e distribui a SKDM
  **apenas para a lista atual** → a audiência anterior não consegue abrir os NOVOS statuses.
- Gatilho: hash da audiência (`audienciaKeyUltima`, persistido em `dono/status_config.json`)
  diferente da última publicação. Mesma lista = sem rotação (sem reenvio de SKDM).
- A 1ª publicação após a v44 rotaciona automaticamente — limpa a chave distribuída
  largamente pelos testes anteriores.

### Limitações honestas (informadas no menu do módulo)
- Statuses ANTIGOS já entregues não são revogáveis (não existe API para apagar status).
- A entrega do ciphertext pelo servidor continua seguindo a privacidade da conta, mas o
  **conteúdo** só abre para quem tem a chave — ou seja, só a lista escolhida.
- Não há na rc14 API para audiência declarada no servidor (nó `<participants>` de
  audiência), e nenhuma API para excluir um contato individual de um status.

### Validações v44
- Rotação **7/7**: 1ª publicação rotaciona · limpa variantes PN+LID · zera memória de
  SKDM · chave antiga apagada do store · mesma audiência não rotaciona · lista menor
  rotaciona · hash persistido em disco
- Regressão **70/70** · ViewOnce ✓ · sintaxe ✓ · `config.json` original ✓ · `npm start` ✓

---

## 14. ATUALIZAÇÃO v45 — Menu reorganizado: Dono × Config × Status × Multi [2026-08-29]

### Menu principal (nova ordem, sem "modo rápido")
```
⚔️ ATAQUE & GRUPOS   1 Listar · 2 FLOOD · 3 Preset+NUKE · 4 Roubar
🧰 PANEL             5 👑 Comandos do Dono · 6 ⚙️ Configurações ·
                    7 🫥 Status Manager · 8 🔢 Multi · 0 Sair
```
- Seção "MODO RÁPIDO (/)" REMOVIDA do menu (os comandos rápidos continuam
  funcionando — só não são mais exibidos; ajuda em categoria Rápido do menu 6>…).
- Alias textual `status`/`st`/`statusconfig`/`statuspublicar`/`statuscancelar`
  REMOVIDOS — Status Manager agora é exclusivamente a opção **7** (e o branch
  legado "status"→status-online do messageHandler foi removido; status do bot
  segue em `botstatus`, menu 6 > 3 e `relatorio`).

### Config separada em duas seções (renumerada)
- **6 ⚙️ Configurações — ADMs do bot (1-11)**: proprietário, número, status,
  histórico, relatório, agendamentos, listar ADMs/grupos autz/donos, fantasma.
- **5 👑 Comandos do Dono (12-34)**: presets (12-13), aparência (14-15), flood
  (16-18), sistema (19-22), permissões (23-28), ViewOnce (29-33). `0` volta.
- `painel_dono` adicionado ao OWNER_ONLY: **ADM não abre nem vê** a área do dono.
- Menu de config/dono agora é **PERSISTENTE**: após executar uma opção que não
  pede input, o usuário continua no menu (antes: single-shot, "morria" a cada
  ação). Opções que pedem input (add ADM, presets…) continuam com seu fluxo.
- Como o parser rápido (5/NN) lê `CONFIG_OPCOES` dinamicamente, a renumeração
  atualizou os comandos rápidos automaticamente; hints com números fixos foram
  corrigidos (router: presets 12/13, ADMs 23/24, grupos 25/26, fast_config_help;
  messageHandler: "5 > 23" p/ liberar; stateHandler: "menu 5 > 26").
- fastParser: `cfg_viewonce_*` blindados como owner-only (defesa em profundidade).

### Correção de bug encontrada nos testes
`stateHandler` usava `getState` sem importá-lo (ReferenceError silencioso) —
introduzido na v45 e corrigido na sequência (import restaurado).

### Validações v45
- E2E **22/22**: menu novo (5/7 presentes, modo rápido ausente) · 5 dono (12 criar
  preset, 23 add ADM) · 6 config (3 status, 9 donos, 10 fantasma — persistente) ·
  7 status · 8 multi · botstatus ✔ · palavra "status" não responde nada · ADM
  bloqueado no painel 5 com mensagem · ADM abre config 6
- Regressão **64/64** · ViewOnce ✓ · sintaxe ✓ · `config.json` original ✓ · `npm start` ✓

---

## 15. ATUALIZAÇÃO v46 — Marca limpa · PAINEL · Ler mais · Status com papéis [2026-08-29]

### Marca (remoção de "ANTY/ARCANJOS ATK/DOMINA")
- Rodapé do menu: `⚔️ SYZYGY · NYX × ANTY DOMINA` → `⚔️ SYZYGY · NYX`.
- Bio padrão (`config.json` + default): `Dominado por Anty & Nyx` → `⚔️ SYZYGY ⚡`.
- Rodapé das listas interativas: `© SYZYGY ZUCKERBERG ARCANJOS ATK` → `© SYZYGY ZUCKERBERG`.
- Terminal (monitor roxo): Credits `ANTY DOMINA` → `NYX`; watermark `ARCANJOS ATK` → `SYZYGY`;
  `credLine()` → `ZUCKERBERG • SYZYGY / NYX × ZUCKERBERG`.
- Únicos "domina" restantes são o VERBO na descrição do ataque Roubar Grupo
  ("fecha e domina" o grupo alvo) — sem relação com a marca antiga.

### Menu
- `🧰 𝗣𝗔𝗡𝗘𝗟` → `🧰 𝗣𝗔𝗜𝗡𝗡𝗘𝗟`... (`𝗣𝗔𝗜𝗡𝗘𝗟`, grafia pt-BR correta).

### 📖 LER MAIS (novo; dono, menu 5 > 16 / rápido 5/16/1|0)
- `CONFIG.lerMais` (default **desligado**, persistido em config.json).
- Aplicado no wrap ÚNICO de `sendMessage` (`instalarRastreioDeEnvios`, socket.js):
  toda mensagem longa do bot (texto OU caption de mídia — ex.: menu com imagem)
  recebe linhas invisíveis logo após a 1ª linha (o título ⚡ SYZYGY). Com isso o
  app do WhatsApp mostra o botão "Ler mais" já após a palavra SYZYGY.
- **Limitações informadas no menu**: o ponto exato do corte é decisão do cliente
  WhatsApp (sem API); mensagens curtas (<300 chars) não dobram; DESLIGADO =
  nada é acrescentado (mensagens muito longas ainda podem ser encolchadas pelo
  próprio app — comportamento do WhatsApp, sem API para veto).
- `status@broadcast` é ignorado pelo wrap (status nunca é dobrado).
- Renumereração do painel do dono: **12-35** (novo 16 = Ler mais; 17-19 flood,
  20-23 sistema, 24-29 permissões, 30-34 viewonce, 35 voltar). Hints com número
  fixo atualizados: fast_config_help (5/16…5/28), liberar ADM `5 > 24`,
  remover grupo `menu 5 > 27`, listas de ADM/grupos autorizados (24/25 e 26/27).

### 🫥 Status Manager com PAPÉIS (v46)
- **ADM do bot** (menu 7): cria rascunho (1 texto/2 imagem/3 vídeo), **4 posta
  preset salvo**, 5 PUBLICA, 6 cancela, 7 vê config, 8 erros. Menu informa que
  configurar é só do dono.
- **DONO** (mesmo menu + seção 🔐): 9 audiência, 10 privacidade, 11 gerenciar
  presets. Bloqueio de ADM nas ações de configuração (`STATUS_CONFIG_DONO` +
  defesa em profundidade nos estados `status_preset_*` do stateHandler).
- 🗂️ **PRESETS DE STATUS** (novo; `dono/status_presets.json`, máx 30): dono
  cria/apaga (7 > 11), ADM posta (7 > 4). Texto aceita a mesma sintaxe
  `#cor #fonte` (parsing único em `criarDraftTexto`).
- Hints de status corrigidos: `_5 = publicar · 4 = postar preset_` (era "6 =
  publicar · 4 = audiência"), dica de importar membros `menu 7 > 9 > 4`,
  textos que ainda mandavam digitar "status"/"statuscancelar" reescritos.

### 🔢 Multi (lote) para ADMs
- Confirmado por teste: `painel_multi` (menu 8) e os comandos rápidos `6/…`
  continuam acessíveis a ADMs autorizados (nunca foram owner-only); as
  CONFIGURAÇÕES de flood/lote continuam só do dono (5 > 17-19).

### Validações v46
- E2E **34/34**: menu (PAINEL, sem ANTY, rodapé) · ADM bloqueado no 5 · ADM no
  status (posta/sem configurar/bloqueio 9/reabertura) · dono cria preset · ADM
  posta preset + rascunho + PUBLICA · estado preset_menu bloqueado p/ ADM ·
  5>16 liga/desliga + unit `aplicarLerMais` (dobra após título, preserva
  conteúdo, ignora curtos) · fast 5/16/1|0 · ADM bloqueado em 5/16 · ADM no
  Multi 8 · ADM na config 6 · "status" morta · botstatus vivo
- Regressão **74/74** (incl. `cfg_ler_mais`, `status_preset_*`, gates ADM) ·
  ViewOnce ✓ · sintaxe ✓ · `config.json` = original só em bio/lerMais ✓

### 15.1. CORREÇÃO v46.1 — Ler mais com caracteres invisíveis [2026-08-29]
- **Sintoma real do teste do dono**: linhas em branco apareceram como um espaço
  gigante e o WhatsApp NÃO dobrou — o app só cria o "Ler mais" quando a
  mensagem excede o LIMITE DE CARACTERES do cliente (~1.000-2.200 conforme
  versão/aparelho); o menu tem ~1.000 chars e as 12 linhas em branco (+12
  chars) não passaram do limite.
- **Correção na origem** (`utils/lerMais.js` reescrito): em vez de linhas em
  branco, a mensagem é preenchida com **U+034F COMBINING GRAPHEME JOINER**
  (bytes CD 8F — caractere invisível confirmado empiricamente no Android) logo
  após a 1ª linha, até a mensagem atingir **4.000 chars** — passa do limite de
  exibição com folga, a prévia mostra só o título (⚡ SYZYGY) e o resto fica
  atrás do "Ler mais". Zero espaço visível.
- Idempotente (guard contra duplo pad), ignora mensagens de 1 linha e mantém
  `status@broadcast` fora (wrap do socket). Mensagens curtas multilinha
  ("✅ Feito\n_Digite o número_") também dobram — dono pediu "qualquer comando
  ou menu".
- **Limitações informadas nos menus (5 > 16)**: o corte exato é do app do
  WhatsApp (sem API) e relatos apontam que no IPHONE o truque do caractere
  invisível não dobra; quem copiar a mensagem cola os invisíveis junto.
- Unit **8/8** (dobra após a 1ª linha, ≥4.000 chars, sem brancos visíveis,
  conteúdo preservado, idempotente, 1 linha intocada, curta multilinha dobra,
  desligado não mexe) · router `cfg_ler_mais` ✓ · sintaxe ✓.

---

## 16. ATUALIZAÇÃO v47 — MAX_FLOOD 1000 + Server Inspector (!bloks) com dados reais [2026-08-29]

### 🌊 MAX_FLOOD 100 → 1000
- Fonte única (`utils/config.js`), usada por stateHandler/fastParser/groupService —
  todos os limites e avisos ("máx 1000") acompanham automaticamente.

### 🖥️ SERVER INSPECTOR — `!bloks` (ou `bloks`)
- **Contexto honesto**: este código-base (nem o bundle original) continha o
  comando `bloks`/A2UI — ele vem de outro bot. Foi CRIADO aqui seguindo
  EXATAMENTE a estrutura especificada (layouts hero, system, resources,
  node_memory, swap, network, runtime; Text/Divider/Slider; catalogId fixo
  `414487363153356`; `bloksWidget type: "im_a2ui"`; envio por
  `generateWAMessageFromContent` + `relayMessage` — mesmo mecanismo das listas
  interativas já usadas).
- **Arquitetura** (`services/serverInspector.js`): `collectServerInfo()` →
  `formatServerInfo()` → `createServerInspectorData()` → `sendServerInspector()`.
  Comando ligado no commandMap (`bloks`/`!bloks` → `server_inspector`) e no
  router — sem tocar menus, handlers existentes, permissões ou conexão.
- **Dados 100% REAIS (nada aleatório/demo)**:
  - CPU%: medição real por TEMPOS de CPU (duas amostras, 400ms) → idle/total;
    não usa nº de núcleos como %. loadavg real (1/5/15).
  - RAM: /proc/meminfo (MemTotal/MemAvailable; fallback os.totalmem/freemem).
  - SSD: `fs.statfsSync(process.cwd())` — filesystem ONDE o bot roda.
  - Node.js Memory: process.memoryUsage() (RSS/HeapTotal/HeapUsed/External/ArrayBuffers).
  - Swap: /proc/meminfo (SwapTotal/SwapFree); sem swap → N/A (não inventa).
  - Network: os.networkInterfaces() (IPv4/IPv6 reais; ausente → N/A).
  - System Info: os.type/release/arch/cpus()[0].model/hostname/userInfo/endianness.
  - Runtime: detecção real (Node.js ou Bun), versão, compat Node, engine (V8),
    PID (process.pid), Bot Uptime (process.uptime), System Uptime (os.uptime),
    Executable (process.execPath).
  - Formatação: bytes B/KB/MB/GB/TB (2 casas), % (1 casa), uptime pt-BR
    ("5 minutos, 21 segundos" / "46 dias, 23 horas, 1 minuto").
- **Robustez**: cada métrica isolada em try/catch — falha vira "N/A" e NUNCA
  derruba o painel; falha total → mensagem de erro do próprio bot (conexão intacta).
- **UI FIXA**: IDs de layouts/rows são constantes (estáveis entre execuções,
  testado); sliders recebem só o valor numérico real (0-100); nenhum texto
  fixo/componente/ordem além dos especificados.
- **Validações v47**: serverInspector **35/35** (valores reais == os/process no
  sandbox; estrutura 7 layouts na ordem; 4 sliders numéricos; sem estáticos
  "bangsul/42%/1.4.0/1089344"; IDs estáveis; relayMessage 1x com params JSON
  im_a2ui) · E2E `!bloks`/`bloks` pelo messageHandler **6/6** · regressão
  **75/75** (incl. ADM recebe o inspector) · viewOnce ✓ · sintaxe ✓ · menu ✓.
- **Limitação informada**: nomes de campos internos do A2UI (FlexComponent/
  TextComponent/SliderComponent/DividerComponent, button "bloks_widget") seguem
  o padrão público do im_a2ui; se o painel não renderizar no cliente, envie o
  arquivo bloks original do outro bot que os valores reais são enxertados na
  estrutura exata dele (a coleta/formatação é independente da UI).

---

## 17. ATUALIZAÇÃO v48 — MIGRAÇÃO para @innovatorssoft/baileys + BLOKS/A2UI corrigido [2026-08-29]

### Migração da biblioteca (migração, não reescrita)
- `@whiskeysockets/baileys 7.0.0-rc14` → **`@innovatorsoft/baileys 7.4.7`** (package.json
  pinado; INSTALAR.sh usa `npm install --legacy-peer-deps` — o fork declara
  `jimp ^0.22` como peerOptional e o projeto usa jimp 1.6).
- **Camada compat ÚNICA** (`connection/baileysCompat.js`): único ponto de import
  da lib; 9 arquivos migrados (whatsapp.js, viewOnce handler/service, buttons,
  list, interactiveList, interactiveService, mediaService, serverInspector).
  Comandos/menus/handlers/permissões/fluxos: **intocados** (regressão 75/75).
- Diferenças REAIS do fork encontradas e tratadas na camada:
  1. default export do fork é o NAMESPACE (objeto), não a função makeWASocket
     → compat exporta default = função (contrato original preservado).
  2. `generateWAMessageFromContent` do fork NÃO gera `key.id` (retorna `key:{}`)
     → o transporte BLOKS gera `messageId` com `generateMessageID` do fork.
  3. `patchMessageForMdIfRequired` do fork testa `nativeFlowMesaage` (typo
     interno) → interactiveMessage/nativeFlowMessage NUNCA recebem o
     `messageContextInfo{deviceListMetadata}` que o cliente espera.
- APIs verificadas em runtime (357 exports): makeWASocket,
  useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason,
  jidNormalizedUser, areJidsSameUser, downloadMediaMessage,
  normalizeMessageContent, getContentType, generateWAMessageFromContent,
  prepareWAMessageMedia, generateForwardMessageContent, generateWAMessage,
  proto — todas presentes. Sessão: mesmo formato multi-file auth (linha v7),
  `sessao/` existente continua válida.

### BLOKS/A2UI — causa da "mensagem incompatível" e correção (na camada)
- **Causas identificadas (v47)**: (a) faltava o
  `messageContextInfo{deviceListMetadataVersion:2, deviceListMetadata:{}}` (o
  patch da lib não o injeta por causa do typo acima); (b) nome de botão
  `bloks_widget` não é reconhecido pelo cliente — o identificador A2 é o
  PRÓPRIO nome do botão native-flow: **`im_a2ui`**, com o documento A2UI
  (`{version, catalogId, layouts}`) como `buttonParamsJson`.
- **Helper central** `services/bloksTransport.js` — `sendBloksMessage(sock,
  jid, payload, opts)`: única fonte de verdade do transporte. Monta
  `viewOnceMessage → message{ messageContextInfo, interactiveMessage{ header/
  body/footer, nativeFlowMessage{ buttons[0] = im_a2ui + payload } } }`,
  serializa com `generateWAMessageFromContent` (proto real do fork) e envia por
  `relayMessage(jid, msg.message, { messageId })`. Valida o payload (erro
  claro, nunca silencioso), aceita `additionalNodes` opcional (nenhum nó é
  comprovadamente necessário — nada adicionado "por tentativa"), logs
  `[A2UI]/[BLOKS]/[RELAY]` atrás de `uiDebug`.
- **Payload do Server Inspector: INTACTO** (`createServerInspectorData`
  inalterado — mesmos layouts/IDs/catalogId/componentes; apenas serializado
  como JSON no botão). Coleta de dados reais inalterada (v47).

### UI selecionável pelo config.json ("uiMode" — nome existente preservado)
- `"text"` → TXT: tudo texto como hoje (painel vira texto puro com dica). 
- `"buttons"` → painel via camada de botões existente (quick_reply Atualizar,
  id `server_inspector`).
- `"list"` → painel via camada de listas existente (single_select).
- `"bloks"` → **padrão v48**: menu/botões/grupos seguem em TXT
  (`uiModoEfetivo()` trata "bloks" como "text" — identidade visual
  preservada) e o Server Inspector (!bloks) é enviado como BLOKS/A2UI.
- TXT permanece o fallback manual: 1 edit no config.json + restart.

### Validações v48 (fork REAL instalado no sandbox)
- Serialização REAL (§39/40/58): **28/28** — round-trip
  `proto.Message.encode/decode`: viewOnceMessage+interactiveMessage+
  messageContextInfo v2 + botão `im_a2ui` + catalogId/7 layouts/IDs/sliders/
  textos dinâmicos preservados nos bytes protobuf; relay mock recebe a mesma
  estrutura; payload inválido rejeitado com motivo.
- E2E messageHandler **8/8**: !bloks em modo bloks → relay im_a2ui com
  messageContextInfo + messageId; menu segue TXT; uiMode=text → painel TXT.
- Regressão roteador **75/75** · viewOnce ✓ · sintaxe ✓ · sem imports da lib
  antiga (grep limpo; lock regenerado).

### Limitação informada (§45/§77 da especificação)
- A serialização/transporte foi verificada até os bytes protobuf (tudo
  preservado) — mas a RENDERIZAÇÃO do A2UI só pode ser confirmada em cliente
  real. Se ainda aparecer "não compatível" no seu WhatsApp: a estrutura
  gerada está correta por construção (im_a2ui + contexto MD + proto validado);
  o ponto único de ajuste do formato é `services/bloksTransport.js`
  (constante `A2UI_BUTTON_NAME` + montagem), e o modo TXT continua a 1 edit de
  distância ("uiMode": "text"). Painéis A2UI exigem cliente atualizado
  (recurso experimental do WhatsApp).

---

## 18. ATUALIZAÇÃO v49 — Menu interativo FUNCIONAL (o "Mostrar lista" clicável) [2026-08-29]

### Causa real do botão "morto" (análise §1/§9 do pedido)
O menu já renderizava ("Mostrar lista") porque o transporte (services/list.js,
usado por menus/menu.js com os 56 comandos/8 categorias REAIS) monta
interactiveMessage + nativeFlowMessage single_select + messageContextInfo.
Mas dois defeitos matavam a interação:
1. **`relayMessage(..., { messageId: msg.key.id })` com `key.id` INDEFINIDO** —
   o `generateWAMessageFromContent` do fork retorna `key:{}` (mesma diferença
   real corrigida no A2UI v48). Sem messageId o WhatsApp RENDERIZA o botão,
   mas a interação nasce morta (não clicável). Idem services/buttons.js.
2. **rowId DUPLICADO** — `cfg_list_groups` existe em 2 categorias (fonte real);
   rowIds repetidos na mesma lista derrubam o seletor no cliente.

### Correções (camada de transporte/ponte — comandos intocados)
- `services/list.js` + `services/buttons.js`: messageId gerado com
  `generateMessageID` do próprio fork (logs agora mostram `id INOV…`) e dedupe
  de rowIds no transporte (duplicado ganha sufixo `#2`; handlers descartam).
- `handlers/interactionHandler.js` (ponte ÚNICA das interações): descarta
  sufixo `#` e mapeia `voltar_menu` → `menu_inicial` (o roteador já conhece);
  `cat_*` (categorias, com paginação page_N) e comandos reais seguem ao
  roteador existente; id desconhecido → resposta segura do próprio roteador
  ("não reconhecido"), sem crash (log [BUTTON]).
- `menus/menu.js` handleListClick (caminho secundário): mesma regra do sufixo
  + **correção de segurança**: ownerKey agora é o SENDER real da interação
  (era o número do BOT — bypass de OWNER_ONLY para ADM em cliques) + id
  desconhecido responde aviso seguro em vez de vaziar.
- Estrutura preservada: 56 comandos e 8 categorias vindos DINAMICAMENTE de
  `COMANDOS` (menus/menu.js — fonte da truth); contagem no título
  (`Total: ${COMANDOS.length}`) continua automática; navegação
  menu → categorias → comandos → ação real via roteador (IDs idênticos).

### Validações v49
- E2E **15/15**: T1 menu (relay + messageId válido + 8 seções + 56 rows +
  rowIds únicos com cfg_list_groups#2 + messageContextInfo) · T2 clique
  executa comando real (cfg_status) · T3 cat_grupos abre sub-lista real com
  Voltar · T4 voltar_menu reabre painel · T5 sufixo #2 roteia como id original
  · T6 ADM bloqueado em owner-only via clique · T7 id desconhecido → resposta
  segura · T8 comandos de texto normais intactos.
- Regressão roteador **84/84** (incl. cat_* de todas as 8 categorias +
  voltar_menu) · viewOnce ✓ · sintaxe ✓.
- Modo TXT (uiMode text/bloks) inalterado; UI continua selecionável pelo
  config.json (text/buttons/list/bloks).

---

## 19. ATUALIZAÇÃO v50 — Menu interativo: números reais + imagem do config.json [2026-08-29]

### Números REAIS como identificadores de navegação (descobertos, não inventados)
- `menus/menu.js` → `numeroNavegacao(id)`: resolve o número de cada comando a
  partir das FONTES REAIS do sistema: commandMap numérico (painel 1-8 → `[2]`),
  `CONFIG_OPCOES` (config ADM 1-11 → `[6>3]` · dono 12-35 → `[5>16]`) e
  `STATUS_MENU_MAP` (status → `[7>5]`). Comando sem número no sistema (ex.:
  `fast_flood_help`) NÃO ganha número. 47→48 dos 57 comandos têm número real.
- `STATUS_MENU_MAP` agora é exportado de `features/statusManager/index.js`
  (FONTE ÚNICA) — o stateHandler passou a usá-lo no lugar do mapa inline.
- Descoberta de lacuna: `cfg_ler_mais` existia no roteador mas não estava no
  registro `COMANDOS` → adicionado seguindo o padrão (total do menu virou 57
  sozinho — contagem continua dinâmica).

### Imagem do menu (config.json) no menu INTERATIVO
- `services/list.js`: header do interactiveMessage agora recebe a imagem de
  `CONFIG.menuImage` (`./dono/menus/Foto-menu/img-menu.jpg`) via
  `prepareWAMessageMedia({image}, {upload: sock.waUploadToServer})` — a MESMA
  chamada que já funciona neste fork (interactiveService). `hasMediaAttachment:
  true` + `imageMessage`. Qualquer falha (arquivo ausente/upload off) → header
  sem mídia com log `[LIST]` — a imagem NUNCA impede a interação.

### Paginação (análise real)
- Não existe "P2/P3" literal no projeto. Os padrões REAIS são `grp_page_N`
  (menus/groupMenu — lista de grupos) e `cat_x_page_N` (roteador — categorias
  com Próxima/Anterior). Ambos preservados e o fluxo interativo os utiliza
  (`cat_grupos_page_2` coberto na regressão).

### Validações v50
- E2E **17/17**: menu com imagem do config no header · fallback sem mídia com
  upload off (lista continua interativa) · 8 seções/57 rows · números reais
  `[2]/[6>3]/[5>16]/[7>5]` · sem número onde não existe · clique em
  1·Listar Grupos inicia fluxo real · números por texto (`7`, `01`) intactos ·
  submenu de categoria · estado POR USUÁRIO isolado (A no status, B em
  categoria, sem vazamento) · `botstatus` por texto ✓.
- Regressão roteador **85/85** (incl. `cat_*_page_2`) · viewOnce ✓ · sintaxe ✓.

---

## 20. ATUALIZAÇÃO v51 — Correção DEFINITIVA da cliquabilidade + bloks sem IP [2026-08-29]

### Causa raiz real do "abre mas não seleciona" (análise do código instalado)
1. **IMPLEMENTAÇÃO DUPLICADA ZOMBIE**: existiam DOIS `sendInteractiveList` —
   `services/list.js` (corrigido na v49: messageId real) e
   `services/interactiveList.js` (ainda relayava com `msg.key.id` = undefined
   no fork → mensagem renderiza, interação nasce morta). O MENU PRINCIPAL usava
   o vivo, mas as PÁGINAS DE CATEGORIA (`cat_*`, commandRouter:142) usavam o
   zombie → usuário abria a lista, tocava numa categoria e a segunda lista
   não selecionava. Eliminada: `interactiveList.js` virou camada de
   reexportação da fonte única (`list.js`). Não existem mais duas
   implementações competindo.
2. **ENVELOPE**: list/buttons agora usam `viewOnceMessage → message →
   messageContextInfo{deviceListMetadata v2} → interactiveMessage` — o MESMO
   envelope do painel BLOKS/A2UI, confirmado FUNCIONANDO no aparelho do dono
   (a versão anterior sem wrapper, decisão da era whiskeysockets/@lid,
   renderizava mas a seleção não gerava resposta utilizável).
3. Verificado no código do fork 7.4.7: o nó biz/quality_control é adicionado
   pelo PRÓPRIO relayMessage (messages-send.js:1186) — nada a mais necessário.
   Parser de respostas unificado em `getListId` (interactive native flow,
   list clássica, buttons, template).
4. [DEBUG gated] resposta interativa sem id → dump `[MENU-DEBUG]` com
   `"uiDebug": true` no config.json.

### Server Inspector sem IP (pedido)
- Removida a seção Network INTEIRA (Primary IP, interfaces, IPv4/IPv6) do
  painel A2UI (agora 6 layouts: hero/system/resources/node_memory/swap/
  runtime), da versão TXT e da coleta (`coletarRede` apagada). Nenhum
  endereço IP aparece em nenhuma saída do !bloks (verificado por teste).

### Validações v51
- E2E **15/15**: envelope no menu principal (com imagem do config) · ★ cat_*
  pelo roteador AGORA VIVA (messageId + envelope + 8 comandos + navegação +
  números reais) · taps pelas 2 formas de resposta (interactive + list
  clássica) executam comandos reais · bloks sem IP (A2UI 6 layouts + TXT) ·
  buttons com envelope · 'menu' por texto e voltar_menu intactos.
- Regressão roteador **85/85** · viewOnce ✓ · sintaxe ✓ · round-trip protobuf
  do envelope viewOnce confirmado (encode/decode).
- Limite real: renderização/clique finais dependem do cliente; estrutura =
  idêntica à do BLOKS que já funciona no aparelho do dono.

---

## 21. ATUALIZAÇÃO v52 — "Mostrar lista" real + dedupe + PRESETS com 4 campos [2026-08-29]

### PARTE 1 — Menu interativo
- **Causa da lista não aparecer**: clientes que não abrem o picker nativo do
  `single_select` devolvem a `interactiveResponseMessage` SEM id parseável → o
  bot reconhecia "chegou interação" mas não gerava nada (nenhum id → nenhum
  handler). Correção: resposta interativa sem id = "o usuário pediu a lista" →
  ação `mostrar_lista` no roteador → `enviarListaComandos(jid)` envia a LISTA
  REAL (mesma fonte: COMANDOS/57, 8 categorias, números reais, imagem do
  config.json no header). Fluxo exato pedido: tap → handler → gera lista → envia.
- **Causa da duplicação**: (a) dois parsers quase iguais
  (`getInteractiveId() || getListId()`) em pontos diferentes do pipeline;
  (b) o WhatsApp pode entregar a MESMA interação 2x (retry). Correção: parser
  ÚNICO (`getListId`) + registro dedupe de interações processadas (cap 500,
  padrão do registro de envios) — mesma interação 2x executa 1x (testado).
- Interação processada NUNCA cai no parser tradicional (return após
  tratarInteracao — preservado; dump [MENU-DEBUG] continua gated uiDebug).

### PARTE 2 — Presets MULTI/ROUBAR/NUKE (4 campos)
- **Causa da imagem não aplicar**: no wizard, falha do download da mídia era
  ENGOLIDA por `catch {}` → preset salvo SEM foto, silenciosamente (fotoPath
  null → execução não tinha o que aplicar). Correção: falha agora AVISA e
  re-pede ("envie novamente ou PULAR") — nunca mais salva sem foto por acidente.
- **Causa da mensagem não existir**: o modelo do preset era {id, nome, bio,
  foto} — mensagem NÃO era campo nem era perguntada. Correção: 4º campo
  `mensagem` (wizard: nome → bio → imagem → **mensagem** → salvar;
  persistido em presets.json; `salvarNovoPreset({...,mensagem})`).
- **Execução usa os 4 campos** (verificado ROUBAR e NUKE separadamente):
  - NUKE single: mensagem do preset enviada ANTES do nuke (mesmo ponto do
    lote: marcarFantasma ou texto); nome+bio+foto via `nukeComPreset` (foto:
  lê o arquivo do disco → prepararFoto → updateProfilePicture).
  - ROUBAR single: mensagem = **a do preset** (antes: só linkDivulgacao);
    nome+bio+foto aplicados.
  - MULTI nuke/roubar e AGENDAR: `mensagem` do preset vira o PADRÃO quando o
    usuário digita PULAR no passo de mensagem (7 call sites atualizados).
- Presets antigos continuam válidos (mensagem ausente = null = não envia,
  comportamento anterior).

### Validações v52
- E2E **20/20**: T1 menu · T2 ★ tap sem id → lista real (57 rows) · T3 1
  interação=1 resposta · T4 texto ok · T5 ★ mesma interação 2x = 1 execução ·
  P1-P7 wizard 4 campos + persistência real da imagem em disco · N1-N5 ★ nuke
  aplica nome+bio+IMAGEM (updateProfilePicture com bytes) + mensagem no grupo ·
  R1-R2 ★ roubar usa mensagem do preset + nome/bio/foto · E reload mantém os
  4 campos.
- Regressão roteador **78/78** (incl. `mostrar_lista`) · viewOnce ✓ · sintaxe ✓.

---

## 22. ATUALIZAÇÃO v53 — FIM da duplicação GLOBAL "texto + botões" [2026-08-29]

### Causa estrutural (comprovada no código e em execução)
`enviarMensagemInterativa` (services/interactiveService.js) enviava, POR DESIGN,
**DUAS mensagens** em modo interativo: "ETAPA 1" — `sock.sendMessage(texto)`
separado — e "ETAPA 2" — a mensagem interativa com botões via relay. A ETAPA 1
era um workaround da era em que o relay não renderizava (sem messageId). Com o
transporte corrigido (v49/v51), ela virou a **causa global** de toda ação que
termina em `enviarVoltar`/`enviarMensagemInterativa` responder TEXTO + BOTÕES
(cfg_owner/cfg_number/cfg_status/flood/etc.). Agravante: a ETAPA 2 ainda usava
`msg.key.id` (undefined no fork — botão morto).

### Correções (estruturais, pontos únicos)
1. `interactiveService.enviarMensagemInterativa`: **UMA mensagem** — o texto vai
   DENTRO do `interactiveMessage.body.text` (renderiza junto); ETAPA 1 removida;
   texto simples virou **FALLBACK** (só se o relay falhar, com log); envelope
   `viewOnceMessage + messageContextInfo{deviceListMetadata v2}`; `messageId`
   gerado com `generateMessageID` do fork; usa `uiModoEfetivo()` (bloks/text =
   texto — identidade TXT preservada).
2. `messageHandler`: bloco v36 (`handleListClick` + fallback inline — um
   SEGUNDO despachante de interações com lógica própria) REMOVIDO. Despacho
   único: `tratarInteracao` → roteador → return.
3. `messageHandler`: **dedupe semântico** — o mesmo toque entregue 2-3x com
   key.ids DIFERENTES (retry/eco do WhatsApp) dentro de 1,5s na mesma conversa =
   1 execução (além do dedupe por key.id da v52).

### Validações v53
- Baseline por ação (buttons): `cfg_owner → send 0 | relay 1` com messageId real
  (INOVF68D) + ctx v2 — UMA resposta.
- E2E **21/21**: 9 ações (cfg_owner/cfg_status/cfg_number/painel_config/
  painel_dono/painel_multi/status_menu/mostrar_lista/cat_ataque) — cada uma com
  baseline ≤2; ★ 3 entregas do MESMO toque = mesma contagem da base (não 3×);
  texto manual ok; 2 usuários simultâneos ok (dedupe não vaza entre usuários);
  modo text = 1 texto simples.
- (log cosmético de id no interactiveService também alinhado ao messageId real)
- Regressão roteador **79/79** · viewOnce ✓ · sintaxe ✓.
- "Mostrar lista" (v52) re-verificado no E2E (lista real entregue).

---

## §23 — v54: render dos botões + prova anti-duplicação (GRUPOS DO SYZYGY)

**Relato:** grupos chegando 2x (TXT + BUTTON) e botão do menu sem render/click.

### Investigação (antes de alterar — §9 do prompt)
1. **Listeners `messages.upsert`**: exatamente **1 ativo** (messageHandler.js:56). `legacy/index.original.js` é backup morto (não importado — verificado). `conectar()` sempre fecha o socket atual antes de registrar no novo → sem listener acumulado.
2. **Handlers de comando**: pipeline único — `tratarInteracao` → `return`; texto → TEXT_TO_ACTION → `roteadorAcoes` → `return`; estados → `handleEstado` (todos os branches exigem `text` não-vazio); fastParser só para comandos com "/".
3. **Funções de envio mapeadas**: interactiveService (botões), list.js (listas — PROVADO no aparelho), safeSendMessage (TXT), relayMessage (transporte interativo).
4. **Baileys instalado**: `@innovatorssoft/baileys` **7.4.7** (package.json conferido). `sendMessage` do fork **não** trata `interactiveMessage` (só `interactiveResponseMessage` como atributo) → relayMessage manual é o transporte correto. `relayMessage(jid, message, {messageId, ...})` confirmado na fonte; gera id se ausente.
5. **Proto do fork** (WAProto/E2E): `NativeFlowMessage.messageParamsJson` é **opcional** (`string|null`). `buttonsMessage`/`templateMessage` são legados (cliente atual não renderiza); o formato suportado e comprovado é `viewOnceMessage → messageContextInfo(v2) + interactiveMessage{header/body/footer + nativeFlowMessage}`.

### Problema 1 — duplicação TXT+BUTTON
E2E de reprodução (13 checagens, /tmp/e54a.mjs): **todos** os caminhos de grupos (listar p1/p2, painel_listar_grupos, owner_grupos, pedirGrupo/nuke, owner_multi, grp_page, grp_select, tap via upsert completo, entrega dupla, listener dobrado, cliques distintos) enviam **exatamente 1 mensagem** — send=0/relay=1 (pares legítimos documentados: owner_multi = lista+instruções; painéis numerados config/dono/status = TXT por design). A assinatura vista no aparelho (TXT puro + cópia com rodapé ©) é **exatamente a "ETAPA 1 + ETAPA 2"** que o interactiveService tinha **até a v52** e a v53 removeu. Conclusão: **build antiga rodando no aparelho**. Proteções ativas em qualquer build: dedupe por key.id (cap 500) + dedupe semântico chatJid|interação 1,5s + handler ignora `chatUpdate.type !== "notify"`.

### Problema 2 — botão sem render (causa REAL, corrigida)
A reescrita v53 do interactiveService desviou do envelope comprovado em 3 pontos:
| campo | v53 (quebrado) | list.js (renderiza no aparelho) | v54 |
|---|---|---|---|
| `messageParamsJson` | `""` (string vazia — proto permite, mas o cliente falha o parse do flow; o próprio cabeçalho do arquivo já documentava isso de fix antigo) | **ausente** | **ausente** |
| `contextInfo` | `{mentionedJid:[jid]}` | não envia (proto materializa `{expiration:0}`) | idêntico ao list.js |
| construção | objeto cru | `proto.Message.InteractiveMessage.create()` (+Body/Footer/Header/NativeFlowMessage) | idêntico ao list.js |

Diff de chaves do payload v54 vs list.js: **vazio** — mesmas chaves, mesmos defaults, `nativeFlowMessage` só com `buttons`, header SEMPRE com `title`, `messageId = generateMessageID()` real, `generateWAMessageFromContent(jid, content, {})`.

### Arquitetura final (1 comando → 1 processamento → 1 renderer → 1 mensagem)
- **Camada de conteúdo**: comandos/menus produzem `{texto, botões}` (ex.: `montarListaGrupos` intocado — textos/emojis/paginação/92 grupos/© preservados).
- **Camada de decisão (única)**: `uiModoEfetivo()` — text/bloks → TXT (identidade preservada); buttons → interativo. Decisão exclusiva: **nunca** os dois.
- **Renderer interativo único**: interactiveService (botões) e list.js (listas) — mesmo envelope, mesmo transporte.
- **Fallback**: SÓ se `relayMessage` lançar — substitui por 1 TXT (montarFallbackTexto), nunca acompanha (R5 da regressão).

### Testes v54
- e54a (duplicação/grupos/upsert/dedupe/listener dobrado): **13/13** — send=0 relay=1 em todos os caminhos de grupos.
- e54b/e54c (envelope): **24/24** — payload idêntico ao list.js, encode proto OK, contratos quick_reply/single_select íntegros.
- r54 (regressão): **31/31** — R1 botões/TXT-por-design, R2 comandos digitados (menu/1/5), R3 modo text, R4 bloks, R5 fallback exclusivo, R6 dedupe (2x e 3x entregas → 1 resposta), R7 mostrar_lista = lista real (8+ seções, 50+ rows, COMANDOS=57), R8 estados, R9 paginação de grupos intacta (32/60, 1/10, 11-20 por página), R10 envelope.
- `node --check` em todos os .js: OK.

### Como confirmar no aparelho que é a build nova
O console do Termux imprime no boot: `BUILD: v54 — RENDER DOS BOTÕES...`. Se aparecer v53 ou anterior → pasta antiga rodando.

---

## §24 — v55: config.json controla TUDO (txt|buttons) + paridade botão=texto

**Config existente preservada:** `uiMode` no config.json (NENHUMA segunda chave criada). Valores: `text`|`txt` (alias novo)|`bloks`|`buttons`. A autoridade ÚNICA é `uiModoEfetivo()` (utils/config.js).

### Decisão central de modo (mapa completo de senders)
| Sender | Decisão | v55 |
|---|---|---|
| interactiveService (botões/enviarVoltar/cancelável) | uiModoEfetivo | já ok |
| **list.js (todas as listas/cat_*/mostrar_lista)** | ~~CONFIG.uiMode local~~ → **uiModoEfetivo** | **corrigido** |
| mainMenu (painel inicial) | uiModoEfetivo | já ok |
| groupMenu (lista de grupos) | uiModoEfetivo | já ok |
| **configMenu (painel config 1-11 / dono 12-35)** | topo de enviarSubmenuConfig | **novo branch buttons** |
| **groupMenu (menu de ações de grupo)** | topo de enviarMenuAcoesGrupo | **novo branch buttons** |
| **statusManager (menu status 1-11)** | case status_menu | **novo branch buttons** |
| Wizards numéricos por estado (multi-ações, flood-modos, agendar-tipo, presets) | — | TXT oficial em ambos (input numérico é a interface; sem contraparte interativa) |

### Paridade botão = texto (mesma lógica, zero implementação dupla)
- **Painel dono (5)**: lista interativa 12-35 gerada de CONFIG_OPCOES (mesmos ids cfg_*; estado config_menu setado → digitar número funciona igual).
- **Config (6)**: lista 1-11 idem.
- **Status (7)**: lista 1-11 de STATUS_MENU_MAP (ids status_*; estado status_menu_st setado).
- **Menu de ações de grupo**: FLOOD/PRESET+NUKE/ROUBAR/AGENDAR/VOLTAR com ids painel_flood/painel_tudo/painel_roubar/painel_agendar/abrir_painel. Bridge no router: com estado group_action_menu, despacham por **processarSelecaoGrupo** (a MESMA função do número digitado 1/2/3/4) — testado: prompt e estado resultante idênticos.
- Aliases adicionados ao router: painel_so_nome/painel_so_bio (botões 05/06 do painel admin estavam sem handler) + painel_agendar (contexto GA).

### Dedupe global (v55)
`key.id` de **QUALQUER** mensagem (texto, botão, lista) registrada no Set (cap 500) — mesma entrega 2x com o mesmo id = 1 execução. Mantido o dedupe semântico 1,5s (mesmo toque com ids diferentes) e o gate `type!=="notify"`.

### Testes
- **E2E v55: 50/50** — txt(“text” e alias “txt”): TODOS os menus 1 TXT/0 interativo (menu, 1, 5, painel_config, owner_config, painel_dono, status_menu, cat_ataque, mostrar_lista, painel_nuke, grp_select→menu de ações); buttons: TODOS com representação interativa → 1 interativo/0 TXT (incl. painel dono 24 rows cfg_*, config 11 rows, status 11 rows status_*, menu de ações 5 rows); paridade FLOOD/AGENDAR (prompt+estado iguais ao número digitado); owner_multi par legítimo; dupla entrega interação E texto → 1 resposta.
- **Regressão: 31/31** (expectativas atualizadas para a spec v55: config/dono/status/grp_select agora interativos em buttons).
- `node --check` todos os .js OK.

### Regras respeitadas
UI TXT intocada (ártes/títulos/emojis/paginação ©); nenhum comando removido; números dos menus preservados e CONTINUAM funcionando em ambos os modos (estados setados junto às listas); nenhum handler paralelo (botão e número convergem no mesmo router → mesma função); fallback substitui, nunca acompanha.

---

## §25 — v56: Native Flow como camada interativa única (auditoria de conformidade)

**Prompt:** Native Flow é a tecnologia interativa oficial do modo buttons; proibido substituir por listMessage/quick_reply-buttonsMessage/legados; sem fallback silencioso de protocolo; 1 mensagem; 1 execução; ids = mesmas ações.

### Auditoria (o que já era conforme — nada reescrito, helpers reaproveitados)
- **Senders vivos (6)**: interactiveService.js, list.js, buttons.js, bloksTransport.js (Inspector), serverInspector.js, utils/botoes.js (builder) — **TODOS** montam `viewOnceMessage → messageContextInfo v2 → interactiveMessage → nativeFlowMessage.buttons[{name, buttonParamsJson}]` via relayMessage com messageId real. `single_select` e `quick_reply` aqui são NOMES de botão dentro do `nativeFlowMessage` (Native Flow), NÃO os protos legados `listMessage`/`buttonsMessage`.
- **Zero senders legados**: grep em código vivo (fora legacy/) não encontra `listMessage`/`buttonsMessage`/`templateMessage` como ENVIO. `listResponseMessage`/`buttonsResponseMessage`/`templateButtonReplyMessage` existem apenas no PARSER RECEPTOR (getListId) para clientes que rebaixam a mensagem — recebimento, não envio.
- **Fallback**: Native Flow falha → log alto + texto simples (decisão explícita, nunca listMessage/quick_reply). Nunca acompanha a interativa (r56 re-verificado).
- **Modo**: uiMode (config.json) → uiModoEfetivo() decide TUDO (v55).

### Remoções (código MORO, zero chamadas — verificado por grep)
- `handleListClick` (menus/menu.js): 2º despachante da era v36 — despacho paralelo morto desde a v53. Risco de duplo consumo eliminado definitivamente.
- `getButtonId` (services/buttons.js): parser duplicado morto — parser único = getListId (list.js).

### Testes
- **E2E v56 (pureza): 40/40** — walker recursivo em TODOS os payloads interativos (12 ações por router + menu/1/5/6/7 digitados + grp_select): 18/18 payloads com nativeFlowMessage e **zero** chaves proibidas em qualquer profundidade; clique Native Flow entregue 3x (id igual + diferente) → 1 resposta; cfg_owner por botão → resposta única; txt (text e alias) → 0 interativo em 9 fluxos.
- **r56 (regressão consolidada e55+r54): 50/50** — modos exclusivos, paridade botão=número (prompt+estado), owner_multi par legítimo, aliases, dedupe (interação+texto), fallback exclusivo, lista real (8+ seções/50+ rows, COMANDOS=57), envelope v54, paginação de grupos, config numérico sobre painel interativo.
- `node --check` OK; fork @innovatorssoft/baileys 7.4.7 (node_modules reinstalado no workspace — ZIP não inclui node_modules; INSTALAR.sh faz npm install).

---

## §26 — v57: menu principal não clicável (comparação empírica de payloads)

**Relato:** `menu` renderiza botão mas não abre o picker; `1` (lista de grupos) funciona e clica.

### Diagnóstico (dump do objeto final antes do relayMessage — /tmp/d57.mjs)
| | `menu` (enviarMenuPrincipal → list.js) ❌ | `1` grupos (listarGruposInterativo → interactiveService) ✅ |
|---|---|---|
| buttonParamsJson | `{title, sections}` | `{title, text, buttonText, sections}` |
| rows | `{title, description, rowId}` (sem `id`) | `{title, description, id, rowId}` |
| demais | envelope igual (viewOnce + ctx v2 + single_select + messageId INOV) | idem |

O menu era o ÚNICO menu principal ainda no transporte antigo do list.js — os painéis 5/6/7 e ações de grupo já usavam o interactiveService (v55).

### Correção (mínima, só no MENU PRINCIPAL — referência funcional reaproveitada)
- `enviarMenuPrincipal` (menus/menu.js) agora usa `enviarMensagemInterativa` + `criarBotao("single_select")` — a MESMA implementação da lista de grupos; só os DADOS mudam (sections de `criarSections(COMANDOS)`: 57 comandos, 8 categorias, mesmos ids painel_*/cfg_*/cat_*; branch >100 categorias idem; navegação numérica preservada).
- **Dedupe de rowIds no transporte** (interactiveService/normalizarBotao): `cfg_list_groups` existe legitimamente em 2 categorias → 2 rows com o mesmo rowId confundem o picker (lição v49); transporte agora suffixa `#n` e o handler já descarta (split `#`).
- **Dedupe semântico 1,5s estendido a comandos de texto** (messageHandler): mesmo comando roteado entregue 2x com key.ids diferentes (eco multi-device) = 1 execução — mesma política das interações (v53).
- NÃO tocados: lista de grupos, cat_*/mostrar_lista (list.js), TXT, config.json, arquitetura TXT/BUTTONS, handlers.

### Testes
- **t57: 16/16** — T1 `menu` → 1 relay, botão no formato da referência ({title,text,buttonText,sections}, 57 rows id+rowId, 0 duplicados); T2 clique em "Listar Grupos" do menu → MESMA ação do `1`; T3 `1` intocado; T4 `2`-`8` como antes (8 = par legítimo); duplicação: menu 2x (ids iguais E diferentes) → 1 menu; TXT → painel de arte.
- Dump pós-fix: payload do menu formato-idêntico ao grupos (diff = apenas dados); rowIds duplicados 0.
- **r56: 50/50** · **e56 pureza: 40/40** · `node --check` OK.

---

## §27 — v58: foto dos grupos parando + terminal limpo

### Causa raiz da foto ("chegou uma hora não muda mais")
`updateProfilePicture` é o único passo de roubar/nuke que depende da **conexão de mídia** (upload HTTP). No fork (@innovatorssoft/baileys 7.4.7, lib/Socket/messages-send.js:41): `refreshMediaConn` faz `await mediaConn` ANTES do `forceGet` — se UMA busca de media_conn falhar (rede oscilou), a **promise rejeitada fica no cache** e TODOS os uploads seguintes falham até reconectar. Nome/bio/fechar/trancar seguem funcionando (canal de sinal) — exatamente o relato. O ZIP não carrega node_modules (patch do fork não persiste) → correção no projeto.

### Correções
1. **`trocarFotoComRetry`** (groupService): 3 tentativas + backoff (1,5s/3s) + `sock.refreshMediaConn(true)` entre tentativas; se o refresh lançar (cache envenenado) → erro claro "conexão de mídia morta — REINICIE o bot". Aplicado em TODOS os caminhos: roubarGrupo, executarNuke, nukeComPreset (via roubar/executar), alterarFotoGrupoArquivo/URL/Buffer, alterarTudoGrupo.
2. **Fim de erros sem explicação**: relatórios de ROUBAR/NUKE (single, lote, confirmarNuke) mostram o MOTIVO (`⚠️ foto: Media upload failed...`), não mais "1 erro(s)". Foto "-" sem imagem configurada também ganha motivo ("sem imagem configurada").
3. **catch vazio removido** de alterarTudoGrupo (retorna `{fotoErro}`) — regra do projeto.
4. **Terminal**: carimbo `HH:MM:SS` dim em TODAS as linhas (ok/err/warn/info/boot); [UI] colapsada de 5 linhas para 1 (`✓ [UI] interativa → …235 · botão(s) 1 [single_select] · img · INOVCD9B…`); verboso só com `uiDebug`; resumo `[ROUBAR]`/`[NUKE]` no terminal com resultado por etapa.

### Testes
- **f58 7/7**: retry recupera na 3ª (3 calls/2 refresh); veneno do fork → erro com instrução de reinício; falha persistente → motivo real (429); nuke com foto fora → erros com motivo + nome/bio/fechar OK; confirmarNuke → relatório com ⚠️+motivo; estado limpo.
- **s58 14/14** (regressão): buttons menu/1/5/6/7 + cat/mostrar/painéis = 1 interativo/0 TXT; menu = 57 rows id+rowId únicos no formato da referência; dedupe menu 2x; txt mode só TXT.
- `node --check` OK.
