#!/usr/bin/env bash
# update.sh — atualiza o SYZYGY para a branch origin/arena/* mais recente.
# Termux/Android e Linux. Não apaga sessao/, .env nem arquivos ignorados.
# Não usa git reset --hard.

set -u

ORIGIN_URL="git@github.com:yanrpoliveira3108-bit/syzygy-bot-whatsapp-.git"
STASHED=0
STASH_REF=""
OK=0

log()  { printf '[SYZYGY] %s\n' "$*"; }
ok()   { printf '[SYZYGY] OK  %s\n' "$*"; }
warn() { printf '[SYZYGY] !   %s\n' "$*"; }
fail() { printf '[SYZYGY] ERRO %s\n' "$*"; }

die() {
  fail "$1"
  if [ "$STASHED" -eq 1 ] && [ -n "$STASH_REF" ]; then
    warn "Há um stash local preservado: $STASH_REF"
    warn "Recupere com: git stash pop"
  fi
  exit 1
}

resolve_root() {
  local src="${BASH_SOURCE[0]:-$0}"
  local dir
  dir=$(CDPATH= cd -- "$(dirname -- "$src")" && pwd) || return 1
  if [ -f "$dir/package.json" ]; then
    printf '%s\n' "$dir"
    return 0
  fi
  if [ -f "$HOME/syzygy/package.json" ]; then
    printf '%s\n' "$HOME/syzygy"
    return 0
  fi
  return 1
}

ROOT=$(resolve_root) || die "Não encontrei o projeto SYZYGY (package.json). Coloque update.sh na pasta do bot ou em ~/syzygy."
cd "$ROOT" || die "Não consegui entrar em $ROOT"
log "Diretório: $ROOT"

# Nunca toca nestes caminhos
if [ ! -d "$ROOT" ]; then
  die "Diretório do projeto inválido."
fi

command -v git >/dev/null 2>&1 || die "Git não encontrado. No Termux: pkg install git"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  die "Esta pasta não é um repositório Git."
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  log "Remote origin ausente — configurando $ORIGIN_URL"
  git remote add origin "$ORIGIN_URL" || die "Falha ao criar remote origin"
else
  log "origin: $(git remote get-url origin)"
fi

log "Buscando branches remotas..."
if ! git fetch origin '+refs/heads/*:refs/remotes/origin/*'; then
  die "git fetch falhou. Verifique a rede e o acesso ao GitHub."
fi

LATEST_REMOTE=$(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/remotes/origin/arena 2>/dev/null | head -n 1)
if [ -z "$LATEST_REMOTE" ]; then
  die "Nenhuma branch origin/arena/* encontrada. A Arena ainda não publicou uma branch arena/*."
fi

ARENA_BRANCH=${LATEST_REMOTE#origin/}
log "Branch Arena encontrada: $ARENA_BRANCH  ($LATEST_REMOTE)"

CURRENT=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'HEAD')
log "Branch local atual: $CURRENT"

# Preserva alterações em arquivos VERSIONADOS. Ignorados (sessao/, .env) não entram no stash.
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  log "Alterações locais versionadas detectadas — git stash"
  STASH_MSG="syzygy-update $(date +%Y%m%d-%H%M%S)"
  if git stash push -m "$STASH_MSG" --quiet; then
    STASHED=1
    STASH_REF=$(git stash list | head -n 1 | cut -d: -f1)
    ok "Stash criado ($STASH_REF)"
  else
    die "git stash falhou. Nenhuma atualização foi aplicada."
  fi
fi

# Checkout sem duplicar a branch se já existir
if [ "$CURRENT" != "$ARENA_BRANCH" ]; then
  if git show-ref --verify --quiet "refs/heads/$ARENA_BRANCH"; then
    log "Trocando para branch local existente: $ARENA_BRANCH"
    git checkout "$ARENA_BRANCH" || die "git checkout $ARENA_BRANCH falhou"
  else
    log "Criando branch local $ARENA_BRANCH a partir de $LATEST_REMOTE"
    git checkout -b "$ARENA_BRANCH" --track "$LATEST_REMOTE" || die "Falha ao criar/rastrear $ARENA_BRANCH"
  fi
else
  log "Já estamos em $ARENA_BRANCH — só sincronizar"
fi

# Garante tracking sem criar outra cópia
if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git branch --set-upstream-to="$LATEST_REMOTE" "$ARENA_BRANCH" >/dev/null 2>&1 || true
fi

log "Sincronizando (fast-forward only — sem reset --hard)..."
if git merge --ff-only "$LATEST_REMOTE"; then
  ok "Código sincronizado com $LATEST_REMOTE"
else
  die "Não foi possível fast-forward para $LATEST_REMOTE (histórico local divergente). Não executei reset --hard. Veja: git status"
fi

if [ "$STASHED" -eq 1 ]; then
  log "Restaurando alterações locais (stash pop)..."
  if git stash pop; then
    ok "Stash restaurado"
    STASHED=0
    STASH_REF=""
  else
    warn "stash pop teve conflito. Suas alterações continuam no stash."
    warn "Resolva e rode: git stash pop"
  fi
fi

if [ ! -f "$ROOT/package.json" ]; then
  die "package.json sumiu após a atualização."
fi

need_npm=0
if [ ! -d "$ROOT/node_modules" ]; then
  need_npm=1
  log "node_modules ausente"
elif [ -f "$ROOT/package.json" ] && [ "$ROOT/package.json" -nt "$ROOT/node_modules" ]; then
  need_npm=1
  log "package.json mais novo que node_modules"
elif [ -f "$ROOT/package-lock.json" ] && [ "$ROOT/package-lock.json" -nt "$ROOT/node_modules" ]; then
  need_npm=1
  log "package-lock.json mais novo que node_modules"
fi

if [ "$need_npm" -eq 1 ]; then
  command -v npm >/dev/null 2>&1 || die "npm não encontrado. No Termux: pkg install nodejs"
  log "Instalando dependências (npm install)..."
  if npm install; then
    ok "npm install concluído"
  else
    warn "npm install falhou — tentando de novo com --legacy-peer-deps"
    if npm install --legacy-peer-deps; then
      ok "npm install --legacy-peer-deps concluído"
    else
      die "npm install falhou. O código foi atualizado, mas as dependências não."
    fi
  fi
else
  log "Dependências OK — npm install não necessário"
fi

BRANCH_NOW=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf '?')
COMMIT_NOW=$(git rev-parse --short HEAD 2>/dev/null || printf '?')
CHANGES=$(git status --porcelain | wc -l | tr -d ' ')
DIRTY=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')
OK=1

printf '\n'
log "========== RESUMO =========="
log "Branch : $BRANCH_NOW"
log "Commit : $COMMIT_NOW"
log "Alterações visíveis: $CHANGES  (versionadas sujas: $DIRTY)"
log "sessao/ e .env NÃO foram tocados"
if [ "$OK" -eq 1 ]; then
  ok "Atualização concluída com sucesso"
  exit 0
fi
die "Atualização incompleta"
