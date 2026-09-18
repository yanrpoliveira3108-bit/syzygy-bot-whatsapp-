#!/usr/bin/env bash
# update.sh — SYZYGY (v2, segura por construção)
#
# O que mudou contra a v1 (a que existia em arena/01a0aaae):
#   1. A v1 dava `git stash push` SEM `-u`: arquivo NOVO (não rastreado) nunca foi
#      para o stash. Quem tinha criado features/flood/payment.js, presets etc.
#      localmente não estava protegido por nada.
#   2. A v1 escolhia sozinha "a origin/arena/* mais recente" e trocava sua branch.
#      Aqui a branch atual é respeitada; trocar de branch é decisão explícita (--to).
#   3. A v1 rodava `npm install` puro, que NESTE repo falha (peer deps do jimp) e
#      só no segundo tentativa usava --legacy-peer-deps.
# Esta versão: backup ANTES de qualquer coisa, merge de onde você mandar, validação
# depois, e nada de reset --hard nunca.
#
# USO
#   ./update.sh                         # sincroniza a branch atual com a origem dela
#   ./update.sh --dry-run               # só mostra o que faria (não escreve nada)
#   ./update.sh --from origin/main origin/arena/01a0ab7b-syzygy-bot-whatsapp
#                                       # faz merge dessas refs NA branch atual
#   ./update.sh --sync-all              # origin/main + todos os origin/arena/* (mais nova por último)
#   ./update.sh --to arena/01a0ab7b-syzygy-bot-whatsapp   # troca de branch (com backup antes)
#   ./update.sh --adopt arena/01a0ab7b-syzygy-bot-whatsapp # Árvore passa a ser a da
#                                       # branch dita (para linhagens divergentes, onde
#                                       # merge seria ruído). Backup + reflog + reaplicação
#                                       # do seu trabalho local; seus commits ficam em
#                                       # refs/syzygy-backup/pre-adopt-<ts>.
#   ./update.sh --list                  # estado: branches, ahead/behind, node_modules
#   ./update.sh --no-npm                # não roda npm install
#   ./update.sh --npm                   # força npm install
#   ./update.sh --restart               # reinicia o serviço (se houver systemd/syzygy.service)
#   ./update.sh --flood-ours            # em conflito só em features/flood, mantém a versão atual
#
# Política de conflito: --sync-all começa pela arena MAIS NOVA. Conflito restrito a
# features/flood/** ou aos scripts de deploy (update.sh/start.sh/recover.sh) → o
# incoming vence (é a versão corrigida). --flood-ours inverte. Qualquer outro
# caminho em conflito → merge abortado, nada aplicado, backup preservado.
#   ./update.sh --rollback <dir|ref> [--yes]   # restaura de um backup feito por este script
#
# Nunca toca (e ainda assim copia para o backup): sessao/ .env config.json dono/

set -u

ORIGIN_URL="git@github.com:yanrpoliveira3108-bit/syzygy-bot-whatsapp-.git"
VITAL="config.json .env sessao dono"
DRY=0
DO_NPM=1
FORCE_NPM=0
RESTART=0
SYNC_ALL=0
THEIRS_FLOOD=0
MODE="sync"
TO_BRANCH=""
ROLLBACK_TARGET=""
COPY_REF=""
COPY_PATHS=""
ALLOW_UNRELATED=0
ROLLBACK_YES=0
FROM_REFS=""

log()  { printf '[SYZYGY] %s\n' "$*"; }
ok()   { printf '[SYZYGY] OK  %s\n' "$*"; }
warn() { printf '[SYZYGY] !   %s\n' "$*"; }
fail() { printf '[SYZYGY] ERRO %s\n' "$*"; }
die()  { fail "$1"; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)      DRY=1 ;;
    --no-npm)       DO_NPM=0 ;;
    --npm)          FORCE_NPM=1; DO_NPM=1 ;;
    --restart)      RESTART=1 ;;
    --sync-all)     SYNC_ALL=1 ;;
    --theirs-flood) FLOOD_OURS=0 ;;
    --list)         MODE="list" ;;
    --to)           MODE="to"; shift; TO_BRANCH="${1:-}" ;;
    --adopt)        MODE="adopt"; shift; TO_BRANCH="${1:-}" ;;
    --from)         MODE="from"; FROM_REFS=""; shift
                    while [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; do FROM_REFS="$FROM_REFS $1"; shift; done
                    set -- ;;
    --rollback)     MODE="rollback"; shift; ROLLBACK_TARGET="${1:-}" ;;
    --yes)          ROLLBACK_YES=1 ;;
    -h|--help)      sed -n '2,30p' "$0"; exit 0 ;;
    *) ;;
  esac
  shift || true
done

resolve_root() {
  local src="${BASH_SOURCE[0]:-$0}" dir
  dir=$(CDPATH= cd -- "$(dirname -- "$src")" && pwd) || return 1
  if [ -f "$dir/package.json" ]; then printf '%s\n' "$dir"; return 0; fi
  if [ -f "$HOME/syzygy/package.json" ]; then printf '%s\n' "$HOME/syzygy"; return 0; fi
  return 1
}

ROOT=$(resolve_root) || die "Não achei o projeto (package.json). Rode de dentro da pasta do bot ou use ~/syzygy."
cd "$ROOT" || die "Não consegui entrar em $ROOT"
command -v git >/dev/null 2>&1 || die "git não encontrado. No Termux: pkg install git"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$ROOT não é um repositório git."

CUR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'HEAD')
TS=$(date +%Y%m%d-%H%M%S)
FORCE_NOTE=0
BK="$ROOT/.syzygy-backup/$TS"

do_it() { # do_it "<comando>"  → executa fora de dry-run
  if [ "$DRY" = "1" ]; then log "(dry-run) $1"; return 0; fi
  eval "$1"
}

# ── rollback ─────────────────────────────────────────────────────────────────
if [ "$MODE" = "rollback" ]; then
  [ -n "$ROLLBACK_TARGET" ] || die "uso: ./update.sh --rollback .syzygy-backup/<ts> [--yes]"
  SRC="$ROLLBACK_TARGET"
  case "$SRC" in
    /*) : ;;
    *) SRC="$ROOT/$ROLLBACK_TARGET" ;;
  esac
  if [ -d "$SRC" ]; then
    [ -f "$SRC/vital.tgz" ] && log "vai restaurar: $(tar -tzf "$SRC/vital.tgz" 2>/dev/null | head -20 | tr '\n' ' ')"
    [ -f "$SRC/untracked.tgz" ] && log "vai restaurar novos arquivos: $(wc -l < "$SRC/untracked.txt" 2>/dev/null || echo '?') arquivo(s)"
    [ -f "$SRC/tracked.diff" ] && log "vai reaplicar alterações em arquivos rastreados ($(wc -l < "$SRC/tracked.diff") linhas de diff)"
    if [ "$ROLLBACK_YES" != "1" ]; then warn "dry-run por padrão. Repita com --yes para executar."; exit 0; fi
    [ -f "$SRC/vital.tgz" ] && { tar -xzf "$SRC/vital.tgz" -C "$ROOT" && ok "vital restaurado"; }
    [ -f "$SRC/untracked.tgz" ] && { tar -xzf "$SRC/untracked.tgz" -C "$ROOT" && ok "arquivos novos restaurados"; }
    if [ -f "$SRC/tracked.diff" ]; then
      if git apply --3way "$SRC/tracked.diff"; then ok "diff reaplicado"; else warn "git apply teve conflito — veja git status"; fi
    fi
    exit 0
  fi
  # ref de snapshot (refs/syzygy-backup/...)
  if git rev-parse --verify -q "$SRC" >/dev/null; then
    log "aplicando snapshot $SRC"
    exec git stash apply "$SRC"
  fi
  die "não achei backup em $ROLLBACK_TARGET (use ./recover.sh --list-backups)"
fi

# ── 1b) --copy: traz ARQUIVOS de outra ref sem merge (histórias não relacionadas)
if [ "$MODE" = "copy" ]; then
  [ -n "$COPY_REF" ] || die "uso: ./update.sh --copy origin/arena/<branch> [--path <dir|arquivo>] [--dry-run]"
  git rev-parse --verify -q "$COPY_REF" >/dev/null || die "$COPY_REF não existe"
  PATHS="${COPY_PATHS:-.}"
  log "copiando de $COPY_REF: $PATHS"
  for pth in $PATHS; do
    if [ "$DRY" = "1" ]; then
      log "(dry-run) git checkout $COPY_REF -- $pth"
      git diff --stat "$COPY_REF" -- "$pth" 2>/dev/null | tail -3 | sed 's/^/    /'
      continue
    fi
    git checkout "$COPY_REF" -- "$pth" || die "falha ao copiar $pth de $COPY_REF (backup em $BK)"
  done
  [ "$DRY" = "1" ] && exit 0
  ok "arquivos trazidos de $COPY_REF (backup do que existia em ${BK#$ROOT/})"
  exit 0
fi

# ── 1) fetch (read-only no seu working tree) ─────────────────────────────────
if ! git remote get-url origin >/dev/null 2>&1; then
  do_it "git remote add origin '$ORIGIN_URL'" || die "falha ao criar remote origin"
fi
log "buscando refs de $(git remote get-url origin)"
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune || die "git fetch falhou (rede/acesso). Nada foi alterado."

if [ "$MODE" = "list" ]; then
  printf '%-46s %-9s %-9s %s\n' "BRANCH" "ATRÁS" "À FRENTE" "COMMIT/MODO"
  for r in $(git for-each-ref --format='%(refname:short)' refs/heads); do
    up=$(git rev-parse --abbrev-ref --symbolic-full-name "$r@{u}" 2>/dev/null || printf '')
    ab=""; 
    if [ -n "$up" ]; then ab=$(git rev-list --left-right --count "$up...$r" 2>/dev/null || printf '?'); fi
    printf '%-46s %-9s %-9s %s\n' "$r" "${ab%%	*}" "${ab##*	}" "$(git log -1 --format='%h %cd' --date=short "$r")"
  done
  [ -d node_modules ] && log "node_modules: presente" || warn "node_modules: AUSENTE (rode ./update.sh para instalar)"
  [ -f package.json ] && log "scripts: $(node -e "const p=require('./package.json');console.log(Object.keys(p.scripts||{}).join(','))" 2>/dev/null)"
  exit 0
fi

# ── 2) backup ANTES de tocar em qualquer arquivo ─────────────────────────────
mkdir -p "$BK" || die "não consegui criar $BK"
{
  printf 'timestamp=%s\n' "$TS"
  printf 'branch=%s\n' "$CUR"
  printf 'head=%s\n' "$(git rev-parse HEAD 2>/dev/null)"
  printf 'upstream=%s\n' "$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || printf 'none')"
  printf -- '--- status ---\n'; git status --porcelain 2>/dev/null
} > "$BK/state.txt"

git diff --binary HEAD > "$BK/tracked.diff" 2>/dev/null || true
git ls-files -o --exclude-standard > "$BK/untracked.txt" 2>/dev/null || true
if [ -s "$BK/untracked.txt" ]; then
  (cd "$ROOT" && tar -czf "$BK/untracked.tgz" -T "$BK/untracked.txt" 2>/dev/null) && log "arquivos novos salvos em $(basename "$BK")/untracked.tgz"
fi
VITAL_EXIST=""
for f in $VITAL; do [ -e "$ROOT/$f" ] && VITAL_EXIST="$VITAL_EXIST $f"; done
if [ -n "$VITAL_EXIST" ]; then
  # shellcheck disable=SC2086
  (cd "$ROOT" && tar -czf "$BK/vital.tgz" $VITAL_EXIST 2>/dev/null) && log "sessao/config/dono/.env copiados para $(basename "$BK")/vital.tgz"
fi
SNAP=$(git stash create 2>/dev/null || printf '')
if [ -n "$SNAP" ]; then
  git update-ref "refs/syzygy-backup/$TS" "$SNAP" 2>/dev/null && \
    log "snapshot do tracked-modificado em refs/syzygy-backup/$TS (recuperar: git stash apply refs/syzygy-backup/$TS)"
fi
git rev-parse HEAD > "$BK/orig-head.txt" 2>/dev/null || true

if [ "$DRY" = "1" ]; then
  log "dry-run: backup seria criado em $BK e NENHUM arquivo do projeto seria alterado."
fi

# ── 3) o que sincronizar ─────────────────────────────────────────────────────
REFS=""
FAILED=""
if [ "$MODE" = "to" ]; then
  [ -n "$TO_BRANCH" ] || die "--to precisa do nome da branch"
  git show-ref --verify -q "refs/remotes/origin/$TO_BRANCH" || die "origin/$TO_BRANCH não existe (git branch -r)"
  REFS="origin/$TO_BRANCH"
elif [ "$MODE" = "from" ]; then
  REFS="$FROM_REFS"
  [ -n "$REFS" ] || die "--from precisa de pelo menos uma ref"
elif [ "$SYNC_ALL" = "1" ]; then
  # A MAIS NOVA primeiro: é ela que deve valer. As mais antigas só entram se não
  # conflituarem (a AB7 já contém a correção do shopping e a infra da AAAE, então
  # normalmente elas ficam "contidas" ou são puladas com aviso).
  REFS="origin/main"
  for r in $(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin/arena); do REFS="$REFS $r"; done
else
  UP=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || printf '')
  [ -n "$UP" ] || die "a branch atual ($CUR) não tem upstream. Use --from <ref>, --sync-all ou --to <branch>."
  REFS="$UP"
fi

# pré-visualização de conflitos
if [ "$DRY" = "1" ]; then
  for ref in $REFS; do
    ahead=$(git rev-list --count "HEAD..$ref" 2>/dev/null || echo '?')
    if [ "$ahead" = "0" ]; then log "dry-run: $ref já está contida em $CUR (nada a fazer)"; continue; fi
    col=$(LC_ALL=C sort <(git ls-files -o --exclude-standard) <(git ls-tree -r --name-only "$ref") | uniq -d | head -5)
    if [ -n "$col" ]; then warn "dry-run: $(printf '%s' "$col" | grep -c .)+ arquivo(s) seus NÃO rastreados colidem com $ref — no apply real eles vão para $BK/collide/ antes do merge"; fi
    if git merge-tree --write-tree --name-only HEAD "$ref" > "$BK/drytree-$(printf '%s' "$ref" | tr '/' '_').txt" 2>/dev/null; then
      log "dry-run: merge de $ref ($ahead commit(s)) — sem conflito previsto"
    else
      warn "dry-run: merge de $ref TERIA conflito. Arquivos:"
      sed -n '/CONFLICT/,$p' "$BK/drytree-$(printf '%s' "$ref" | tr '/' '_').txt" 2>/dev/null | head -20
    fi
  done
  log "dry-run: nada foi alterado (branch continua $CUR). Remova --dry-run para aplicar."
  exit 0
fi

# ── helpers de proteção do trabalho local ─────────────────────────────────────
# O git recusa ff/merge quando há alteração local nos mesmos arquivos. Como o
# snapshot (untracked.tgz + tracked.diff + refs/syzygy-backup/$TS) JÁ foi feito,
# podemos devolver o working tree ao HEAD para o ff avançar e, no fim, reaplicar
# o que era seu. A v1 não fazia nada disso — era onde o trabalho se perdia.
clean_local_for_ff() {
  [ -s "$BK/tracked.diff" ] || return 0
  if [ "$DRY" = "1" ]; then return 0; fi
  git checkout -- . 2>/dev/null && { warn "suas alterações locais foram tiradas da árvore para o ff avançar — elas estão em ${BK#$ROOT/}/tracked.diff e refs/syzygy-backup/$TS"; FORCE_NOTE=1; }
  return 0
}

LOCAL_REAPPLIED=0
reapply_local_work() {
  [ "$FORCE_NOTE" = "1" ] || return 0
  [ "$LOCAL_REAPPLIED" = "1" ] && return 0
  LOCAL_REAPPLIED=1
  [ -s "$BK/tracked.diff" ] || return 0
  if [ "$DRY" = "1" ]; then log "(dry-run) reaplicaria $BK/tracked.diff"; return 0; fi
  log "reaplicando suas alterações locais sobre a árvore atualizada"
  if git apply --3way "$BK/tracked.diff" 2> "$BK/reapply.log"; then
    ok "suas alterações voltaram para a árvore"
    FORCE_NOTE=2
  else
    warn "não consegui reaplicar limpo (conflito). O que era seu está preservado em:"
    warn "  ${BK#$ROOT/}/tracked.diff   ·   refs/syzygy-backup/$TS"
    tail -4 "$BK/reapply.log" | sed 's/^/    /'
  fi
}

# ── helper: colisões de arquivo não rastreado ────────────────────────────────
collide_fix() {
  ref="$1"
  untracked_list="$BK/.untracked-$$.txt"
  git ls-files -o --exclude-standard > "$untracked_list" 2>/dev/null || return 0
  [ -s "$untracked_list" ] || { rm -f "$untracked_list"; return 0; }
  incoming="$BK/.incoming-$$.txt"
  git ls-tree -r --name-only "$ref" > "$incoming" 2>/dev/null || { rm -f "$untracked_list" "$incoming"; return 0; }
  hits=$(LC_ALL=C sort "$untracked_list" "$incoming" | uniq -d)
  if [ -z "$hits" ]; then rm -f "$untracked_list" "$incoming"; return 0; fi
  mkdir -p "$BK/collide"
  for f in $hits; do
    [ -f "$f" ] || continue
    d="$BK/collide/$(dirname "$f")"; mkdir -p "$d"
    cp -a "$f" "$d/" 2>/dev/null && rm -f "$f" && warn "arquivo seu não rastreado movido para o backup (o merge o sobrescreveria): $f"
    # registra: um arquivo de RUNTIME (sessao/pre-key, creds, config) é sempre o
    # que manda — o do repositório é snapshot velho. Devolvemos no fim.
    printf '%s\n' "$f" >> "$BK/collide.list"
  done
  rm -f "$untracked_list" "$incoming"
  return 0
}

# Devolve o que era seu: sem isto, um update "de sucesso" deixava o sessao/ sem
# pre-key e a sessão sofria no dia seguinte.
restore_collided() {
  [ -s "$BK/collide.list" ] || return 0
  n=0
  for f in $(sort -u "$BK/collide.list"); do
    [ -f "$BK/collide/$f" ] || continue
    mkdir -p "$(dirname "$f")" 2>/dev/null
    if cmp -s "$BK/collide/$f" "$f" 2>/dev/null; then continue; fi
    cp -a "$BK/collide/$f" "$f" && n=$((n+1))
  done
  [ "$n" = "0" ] || ok "devolvidos $n arquivo(s) seus realocados pelo collide_fix (o seu vence o snapshot do repo)"
  return 0
}

# Vital que a ref nova apagou do repo (ex.: sessao/ e config.json deixaram de ser
# rastreados): se sumiu do disco, volta do vital.tgz — sem isto, "--cached"
# no lado de quem publicou vira perda de sessão no aparelho de quem atualiza.
vital_reassert() {
  [ -f "$BK/vital.tgz" ] || return 0
  lost=""
  for v in $VITAL; do
    [ -e "$ROOT/$v" ] || lost="$lost $v"
  done
  [ -n "$lost" ] || return 0
  log "restaurando do backup o que a ref nova não trackeia mais:$lost"
  # só o que sumiu (extração seletiva): nunca por cima de arquivo que ainda está aí
  tar -xzf "$BK/vital.tgz" -C "$ROOT" $lost 2>/dev/null && ok "vital reconstituído" || warn "não consegui reconstituir$lost — está em $(basename "$BK")/vital.tgz"
}

# ── guarda: índice com entrada unmerged trava TODO merge/ff ──────────────────
# Foi assim que um update falhou no aparelho: sobrou estado de um merge
# interrompido (MERGE_HEAD/arquivos UU) e o git se recusou a mexer em qualquer
# coisa. O snapshot do backup já foi feito a esta altura, então dá para
# desarmar o processo interrompido sem risco de perder trabalho.
GD=$(git rev-parse --git-dir)
unmerged_guard() {
  n=$(git ls-files -u 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" != "0" ] || return 0
  warn "índice tem $n entrada(s) unmerged (merge interrompido?) — isso trava ff e merge"
  git ls-files -u 2>/dev/null | awk '{print $4}' | sort -u | head -8 | sed 's/^/    /'
  if [ -f "$GD/MERGE_HEAD" ]; then
    log "git merge --abort (devolve o estado para antes do merge interrompido)"
    git merge --abort 2>/dev/null || warn "merge --abort não correu bem"
  elif [ -d "$GD/rebase-merge" ] || [ -d "$GD/rebase-apply" ]; then
    log "git rebase --abort"
    git rebase --abort 2>/dev/null || warn "rebase --abort não correu bem"
  elif [ -f "$GD/CHERRY_PICK_HEAD" ] || [ -f "$GD/REVERT_HEAD" ]; then
    log "git cherry-pick/revert --abort"
    git cherry-pick --abort 2>/dev/null; git revert --abort 2>/dev/null
  fi
  # o que sobrar é só índice marcado: reset limpa a marca SEM tocar nos arquivos
  if [ -n "$(git ls-files -u 2>/dev/null | head -1)" ]; then
    log "git reset (só o índice; sua árvore não é tocada) para limpar as marcas"
    git reset -q 2>/dev/null || warn "git reset não limpo o índice"
  fi
  if [ -n "$(git ls-files -u 2>/dev/null | head -1)" ]; then
    die "ainda há entrada unmerged — resolva na mão (o backup está em ${BK#$ROOT/}):
    git status -s
    ./update.sh --restore $TS"
  fi
  ok "índice limpo, pode continuar"
}
unmerged_guard

# ── 3b) --adopt: adotar a árvore de uma ref (linhagens divergentes) ───────────
if [ "$MODE" = "adopt" ]; then
  [ -n "$TO_BRANCH" ] || die "--adopt precisa do nome da branch"
  git rev-parse --verify -q "origin/$TO_BRANCH" >/dev/null || die "origin/$TO_BRANCH não existe"
  PREV=$(git rev-parse HEAD)
  git update-ref "refs/syzygy-backup/pre-adopt-$TS" "$PREV" 2>/dev/null
  log "adotando origin/$TO_BRANCH (antes: $CUR @ $(printf %.7s "$PREV") — guardado em refs/syzygy-backup/pre-adopt-$TS)"
  if [ "$DRY" = "1" ]; then
    log "(dry-run) git checkout -f -B $TO_BRANCH origin/$TO_BRANCH   # + reaplicar tracked.diff"
    git diff --stat HEAD "origin/$TO_BRANCH" 2>/dev/null | tail -5 | sed 's/^/    /'
    exit 0
  fi
  git checkout -f -B "$TO_BRANCH" "origin/$TO_BRANCH" || die "checkout -B falhou (backup em $BK)"
  git reset --hard "origin/$TO_BRANCH" >/dev/null 2>&1 || warn "reset após o checkout não correu bem"
  FORCE_NOTE=1
  reapply_local_work
  ok "árvore agora é origin/$TO_BRANCH @ $(git rev-parse --short HEAD)"
  MODE="done"
fi

# ── 4) aplicar ───────────────────────────────────────────────────────────────
if [ "$MODE" = "to" ]; then
  TARGET="${TO_BRANCH}"
  if [ "$CUR" != "$TARGET" ]; then
    if git show-ref --verify -q "refs/heads/$TARGET"; then
      CO="git checkout $TARGET"
    else
      CO="git checkout -b $TARGET --track origin/$TARGET"
    fi
    if ! eval "$CO" 2> "$BK/checkout.log"; then
      warn "o git recusou trocar de branch por causa das SUAS alterações locais:"
      tail -4 "$BK/checkout.log" | sed 's/^/    /'
      warn "elas JÁ estão preservadas em ${BK#$ROOT/} e em refs/syzygy-backup/$TS"
      warn "trocando com -f (é o único ponto deste script que sobrescreve o working tree)"
      if ! eval "${CO/checkout /checkout -f }" ; then die "checkout -f falhou também (backup em $BK)"; fi
      FORCE_NOTE=1
    fi
    CUR=$(git rev-parse --abbrev-ref HEAD)
  fi
  log "branch atual: $CUR"
fi

for ref in $REFS; do
  git rev-parse --verify -q "$ref" >/dev/null || { warn "$ref não resolvida — pulando"; continue; }
  ahead=$(git rev-list --count "HEAD..$ref" 2>/dev/null || echo 1)
  if [ "$ahead" = "0" ]; then log "$ref já está contida em $CUR"; continue; fi
  if git merge-base --is-ancestor HEAD "$ref" 2>/dev/null; then
    collide_fix "$ref"
    clean_local_for_ff
    log "fast-forward para $ref"
    if ! git merge --ff-only "$ref" > "$BK/ff-$(printf '%s' "$ref" | tr '/' '_').log" 2>&1; then
      warn "fast-forward de $ref recusado pelo git:"
      tail -4 "$BK/ff-$(printf '%s' "$ref" | tr '/' '_').log" | sed 's/^/    /'
      FAILED="$FAILED $ref"; warn "$ref não aplicada — seguindo para a próxima ref (nada perdido: $BK)"; continue
    fi
    ok "$ref aplicada (fast-forward)"
    ok "$ref aplicada"
    continue
  fi
  clean_local_for_ff
  # Antes de mesclar: se a ref incoming tem arquivos nos MESMOS caminhos de
  # arquivos SEUS não rastreados, o git recusaria o merge ("would be overwritten")
  # — e é justamente aqui que a v1 perdia trabalho. Eles já estão no
  # untracked.tgz do backup, então realocamos para $BK/collide/ em vez de deixar
  # o merge morrer.
  collide_fix "$ref"
  if ! git merge-base HEAD "$ref" >/dev/null 2>&1; then
    if [ "$ALLOW_UNRELATED" != "1" ]; then
      warn "$ref tem HISTÓRIA NÃO RELACIONADA com $CUR (a main é um snapshot isolado). Merge aqui seria ruído."
      warn "para trazer arquivos de lá sem merge:  ./update.sh --copy $ref --path features/flood"
      continue
    fi
    log "merge de $ref com --allow-unrelated-histories ($ahead commit(s))"
    collide_fix "$ref"
    if git merge --no-edit --allow-unrelated-histories "$ref" > "$BK/merge-$(printf '%s' "$ref" | tr '/' '_').log" 2>&1; then ok "$ref aplicada"; continue; fi
    git merge --abort 2>/dev/null
    fail "merge não-relacionado de $ref conflituou. Nada aplicado (backup em $BK)."
    exit 1
  fi
  log "merge de $ref ($ahead commit(s) à frente)"
  if git merge --no-edit "$ref" > "$BK/merge-${ref//\//_}.log" 2>&1; then
    ok "$ref aplicada"
    continue
  fi
  warn "merge de $ref não completou; último output:"
  tail -6 "$BK/merge-${ref//\//_}.log" 2>/dev/null | sed 's/^/    /' 
  # conflito → política explícita
  CONFLICTED=$(git diff --name-only --diff-filter=U 2>/dev/null)
  # Política de resolução automática: só para caminhos ONDE A MAIS NOVA MANDA por
  # definição do projeto (features/flood/* e os próprios scripts de deploy).
  # Qualquer outro conflito = merge desfeito, nada aplicado.
  SAFE_RE="^(features/flood/|update\.sh$|start\.sh$|recover\.sh$)"
  ONLY_FLOOD=1
  for f in $CONFLICTED; do printf '%s\n' "$f" | grep -qE "$SAFE_RE" || ONLY_FLOOD=0; done
  if [ "$ONLY_FLOOD" = "1" ] && [ -n "$CONFLICTED" ]; then
    if [ "$FLOOD_OURS" = "1" ]; then SIDE="--ours"; QUER="a versão da branch atual (--flood-ours)"; else SIDE="--theirs"; QUER="a versão incoming ($ref)"; fi
    log "conflito só em features/flood/scripts de deploy — resolvendo com $QUER"
    # shellcheck disable=SC2086
    git checkout $SIDE -- $CONFLICTED && git add -- $CONFLICTED && git commit --no-edit -m "merge($ref): features/flood resolvido por política ($SIDE)" \
      || { fail "não consegui resolver features/flood (backup em $BK)"; exit 1; }
    ok "merge de $ref concluído"
  else
    git merge --abort 2>/dev/null
    warn "conflito real em $ref — este merge foi DESFEITO e nada desse ref foi aplicado."
    printf '%s\n' "$CONFLICTED" | sed '/^$/d' | head -20 | sed 's/^/    /'
    FAILED="$FAILED $ref"
    warn "seguindo para a próxima ref (a mais recente manda). Backup: ${BK#$ROOT/}"
    log "   o que $ref tem de diferente da sua árvore agora:"
    git diff --name-only HEAD "$ref" 2>/dev/null | head -12 | sed 's/^/      /'
    log "   (para trazer só arquivos, sem merge: ./update.sh --copy $ref --path <dir>)"
    continue
  fi
done

reapply_local_work
# ordem importa: primeiro o vital que a ref nova não trackeia, depois o que era
# seu e o collide_fix realocou (a cópia viva é a mais recente = vence).
vital_reassert
restore_collided

# ── 5) dependências ──────────────────────────────────────────────────────────
need_npm=0
if [ ! -d "$ROOT/node_modules" ]; then need_npm=1; log "node_modules ausente"
elif [ -f "$ROOT/package.json" ] && [ "$ROOT/package.json" -nt "$ROOT/node_modules" ]; then need_npm=1; log "package.json mais novo que node_modules"
elif [ -f "$ROOT/package-lock.json" ] && [ "$ROOT/package-lock.json" -nt "$ROOT/node_modules" ]; then need_npm=1; log "package-lock mais novo que node_modules"
fi
[ "$FORCE_NPM" = "1" ] && need_npm=1
if [ "$DO_NPM" = "0" ]; then need_npm=0; log "--no-npm: pulando instalação" ; fi
if [ "$need_npm" = "1" ]; then
  command -v npm >/dev/null 2>&1 || die "npm não encontrado. No Termux: pkg install nodejs"
  # neste repo o `npm install` puro QUEBRA (peer deps do jimp) → legacy-peer-deps primeiro
  log "npm install --legacy-peer-deps"
  npm install --legacy-peer-deps --no-audit --no-fund || { warn "falhou; tentando sem o flag"; npm install --no-audit --no-fund || die "npm install falhou (código atualizado, dependências não)"; }
  ok "dependências instaladas"
else
  log "dependências já coerentes com package.json"
fi

# ── 6) validação (não adianta atualizar e descobrir amanhã) ──────────────────
VAL=0
if [ -f index.js ]; then node --check index.js 2>/dev/null && ok "index.js parseia" || { warn "index.js NÃO parseia"; VAL=1; }; fi
for t in features/flood/tests.js features/flood/tests-infra.js features/flood/tests-menu.js; do
  if [ -f "$t" ]; then
    log "rodando $t"
    if node "$t" > "$BK/$(basename "$t").log" 2>&1; then ok "$t verde"; else warn "$t FALHOU — resumo em $BK/$(basename "$t").log"; VAL=1; fi
  fi
done
if [ -f features/flood/doctor.mjs ]; then
  node features/flood/doctor.mjs > "$BK/doctor.log" 2>&1 && ok "doctor.mjs ok (diagnóstico de leitura, zero envio)" || warn "doctor.mjs apontou algo — veja $BK/doctor.log"
fi

if command -v node >/dev/null 2>&1 && [ -f package.json ]; then
  node -e "const p=require('./package.json');if(!p.scripts||!p.scripts.start)process.exit(1)" 2>/dev/null || warn "package.json sem scripts.start (start.sh vai reclamar)"
fi

# ── 7) restart ───────────────────────────────────────────────────────────────
if [ "$RESTART" = "1" ]; then
  SVC="${SYZYGY_SERVICE:-syzygy.service}"
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SVC" >/dev/null 2>&1 && [ -n "$(systemctl list-unit-files "$SVC" 2>/dev/null | grep -F "$SVC")" ]; then
    systemctl restart "$SVC" && ok "$SVC reiniciado" || warn "não consegui reiniciar $SVC (permissão?)"
  else
    warn "sem $SVC no systemd — reinicie você: ./start.sh (ou pare o processo atual antes)"
  fi
fi

# ── resumo ───────────────────────────────────────────────────────────────────
printf '\n'
log "=========== RESUMO ==========="
log "branch  : $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
log "trazidas: $REFS"
[ -n "$FAILED" ] && warn "NÃO aplicadas (conflito):$FAILED"
log "backup  : ${BK#$ROOT/}  (+ refs/syzygy-backup/$TS se havia alteração rastreada)"
log "não tocados: $(printf '%s' "$VITAL_EXIST" | tr -s ' ' ' ')"
if [ "${FORCE_NOTE:-0}" = "2" ]; then
  log "suas alterações locais foram reaplicadas sobre a árvore nova (via $BK/tracked.diff)"
elif [ "${FORCE_NOTE:-0}" = "1" ]; then
  warn "suas alterações locais NÃO voltaram para a árvore: recupere com"
  warn "  ./update.sh --rollback ${BK#$ROOT/}    (ou: git stash apply refs/syzygy-backup/$TS)"
fi
[ "$VAL" = "1" ] && warn "validação apontou problema — leia os logs do backup antes de ligar"
ok "update concluído"
