#!/usr/bin/env bash
# recover.sh — caça trabalho perdido no git (stash, reflog, snapshots, objetos soltos).
#
# Por que este arquivo existe: o update.sh antigo fazia `git stash push` sem `-u`
# e trocava de branch sozinho. Alterações em arquivos RASTREADOS foram para o
# stash; arquivos NOVOS (ex.: um features/flood/payment.js criado na mão) não
# estavam protegidos por nada, e um merge/checkout mal-sucedido podia cobri-los.
# Quase sempre dá para recuperar — este script só LÊ (exceto --apply/--lost-found).
#
# USO
#   ./recover.sh                  # tudo: status + stash + reflog + snapshots + backup dirs
#   ./recover.sh --stash          # só os stashes (com o que há em cada um)
#   ./recover.sh --reflog         # reflog comentado (checkout/merge/reset)
#   ./recover.sh --snapshots      # refs/syzygy-backup/* criadas pelo update.sh novo
#   ./recover.sh --files          # conteúdo de .syzygy-backup/<ts>/ e como restaurar
#   ./recover.sh --blobs          # commits/blobs soltos (o ouro depois de stash perdido)
#   ./recover.sh --lost-found     # roda git fsck --lost-found (ESCREVE em .git/lost-found)
#   ./recover.sh --apply <ref>    # git stash apply <ref>  (não dropa: nada é apagado)
#   ./recover.sh --blob <sha> --out caminho   # salva um blob solto em um arquivo

set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd) || exit 1
cd "$ROOT" || exit 1
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf '[RECUPERA] isto não é um repositório git\n'; exit 1; }

hdr() { printf '\n──── %s ─────────────────────────────────────────\n' "$*"; }
note() { printf '  · %s\n' "$*"; }

MODE="${1:-all}"
[ $# -gt 0 ] && shift || true

do_status() {
  hdr "estado atual"
  printf '  branch : %s @ %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" "$(git rev-parse --short HEAD 2>/dev/null)"
  printf '  sujo   : %s arquivo(s) versionado(s), %s novo(s)\n' \
    "$(git status --porcelain --untracked-files=no 2>/dev/null | wc -l | tr -d ' ')" \
    "$(git ls-files -o --exclude-standard 2>/dev/null | wc -l | tr -d ' ')"
  git status --short 2>/dev/null | head -30
}

do_stash() {
  hdr "stash (o update.sh antigo jogava suas alterações rastreadas aqui)"
  if [ -z "$(git stash list 2>/dev/null)" ]; then printf '  (nenhum stash)\n'; return 0; fi
  git stash list --format='  %gd · %cd · %gs' --date=iso 2>/dev/null
  for s in $(git stash list --format='%gd' 2>/dev/null); do
    printf '\n  conteúdo de %s:\n' "$s"
    git stash show --stat "$s" 2>/dev/null | sed 's/^/    /' | head -25
  done
  note "recuperar sem apagar:  git stash apply stash@{0}"
}

do_reflog() {
  hdr "reflog (cada linha é um ponto para onde dá para voltar)"
  git reflog --date=iso -n 30 2>/dev/null | sed 's/^/  /'
  note "ver um estado:      git show --stat 'HEAD@{5}'"
  note "arquivo de então:   git show 'HEAD@{5}:caminho/arquivo.js'"
}

do_snapshots() {
  hdr "snapshots do update.sh novo (refs/syzygy-backup/*)"
  local refs
  refs=$(git for-each-ref --format='%(refname)' refs/syzygy-backup 2>/dev/null)
  if [ -z "$refs" ]; then printf '  (nenhum)\n'; return 0; fi
  for r in $refs; do
    printf '\n  %s · %s\n' "$r" "$(git log -1 --format='%cd %s' --date=iso "$r" 2>/dev/null)"
    git show --stat --format='' "$r" 2>/dev/null | sed 's/^/    /' | head -20
    note "aplicar: git stash apply $r"
  done
}

do_files() {
  hdr "backups em .syzygy-backup/"
  if [ ! -d "$ROOT/.syzygy-backup" ]; then printf '  (nenhum diretório .syzygy-backup — o update.sh novo ainda não rodou aqui)\n'; return 0; fi
  for d in "$ROOT"/.syzygy-backup/*/; do
    [ -d "$d" ] || continue
    printf '\n  %s\n' "${d#$ROOT/}"
    [ -f "$d/state.txt" ] && sed -n '1,4p' "$d/state.txt" | sed 's/^/    /'
    [ -f "$d/untracked.txt" ] && note "arquivos novos: $(wc -l < "$d/untracked.txt") (untracked.tgz)"
    [ -f "$d/vital.tgz" ] && note "sessao/config/dono: $(tar -tzf "$d/vital.tgz" 2>/dev/null | wc -l) entradas (vital.tgz)"
    [ -f "$d/tracked.diff" ] && note "diff rastreado: $(wc -l < "$d/tracked.diff") linhas"
    note "restaurar: ./update.sh --rollback ${d#$ROOT/}"
  done
}

do_blobs() {
  hdr "objetos soltos (o que sobra depois de stash drop / checkout -f / merge ruim)"
  local out
  out=$(git fsck --unreachable --no-progress 2>/dev/null)
  [ -n "$out" ] || { printf '  (nada unreachable — bom sinal, ou já foi coletado pelo gc)\n'; return 0; }
  local commits blobs
  commits=$(printf '%s\n' "$out" | awk '/unreachable commit/{print $3}')
  blobs=$(printf '%s\n' "$out" | awk '/unreachable blob/{print $3}')
  printf '  commits soltos: %s · blobs soltos: %s\n' "$(printf '%s' "$commits" | grep -c . || true)" "$(printf '%s' "$blobs" | grep -c . || true)"
  for c in $commits; do
    [ -n "$c" ] || continue
    printf '\n  commit %s · %s\n' "${c:0:10}" "$(git log -1 --format='%cd %s' --date=iso "$c" 2>/dev/null)"
    git show --stat --format='' "$c" 2>/dev/null | sed 's/^/    /' | head -15
    note "ver:  git show $c"
  done
  local n=0
  for b in $blobs; do
    [ -n "$b" ] || continue
    n=$((n+1)); [ "$n" -gt 25 ] && { note "(mais $(printf '%s' "$blobs" | grep -c . ) blobs — use --blob <sha> --out arquivo)"; break; }
    size=$(git cat-file -s "$b" 2>/dev/null || echo 0)
    [ "$size" -lt 40 ] && continue
    if git cat-file -p "$b" 2>/dev/null | head -c 4000 | grep -qE 'export |function |=>|require\('; then
      printf '\n  blob %s · %s bytes · parece código JS:\n' "${b:0:10}" "$size"
      git cat-file -p "$b" 2>/dev/null | head -6 | sed 's/^/    /'
      note "salvar: ./recover.sh --blob $b --out recuperado_$(printf '%.10s' "$b").js"
    fi
  done
}

case "$MODE" in
  --stash)      do_stash ;;
  --reflog)     do_reflog ;;
  --snapshots)  do_snapshots ;;
  --files)      do_files ;;
  --blobs)      do_blobs ;;
  --lost-found) hdr "git fsck --lost-found (escreve em .git/lost-found/)"; git fsck --lost-found 2>&1 | sed 's/^/  /'; printf '\n  arquivos: .git/lost-found/commit/* e /other/*\n' ;;
  --apply)      target="${1:-}"; [ -n "$target" ] || { printf '  uso: ./recover.sh --apply stash@{0} | refs/syzygy-backup/<ts>\n'; exit 1; }
                printf '  aplicando %s (sem drop — nada é apagado)\n' "$target"; exec git stash apply "$target" ;;
  --blob)       sha="${1:-}"; out=""; [ "${2:-}" = "--out" ] && out="${3:-}"
                [ -n "$sha" ] && [ -n "$out" ] || { printf '  uso: ./recover.sh --blob <sha> --out <arquivo>\n'; exit 1; }
                git cat-file -p "$sha" > "$out" && printf '  salvo em %s (%s bytes)\n' "$out" "$(git cat-file -s "$sha")" ;;
  all)          do_status; do_stash; do_snapshots; do_files; do_reflog; do_blobs ;;
  *)            printf '  modo desconhecido: %s\n' "$MODE"; sed -n '2,20p' "$0"; exit 1 ;;
esac
