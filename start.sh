#!/usr/bin/env bash
# start.sh — inicia o SYZYGY (npm start, conforme package.json).
# Não apaga sessao/, autenticação, banco ou configurações.
# Não inicia uma segunda instância se o bot já estiver rodando.

set -u

PIDFILE_NAME="tmp/syzygy.pid"

log()  { printf '[SYZYGY] %s\n' "$*"; }
ok()   { printf '[SYZYGY] OK  %s\n' "$*"; }
warn() { printf '[SYZYGY] !   %s\n' "$*"; }
fail() { printf '[SYZYGY] ERRO %s\n' "$*"; }
die()  { fail "$1"; exit 1; }

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

pid_alive() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

find_running_pid() {
  local pid cmd cwd
  if [ -f "$PIDFILE" ]; then
    pid=$(tr -d ' \t\r\n' < "$PIDFILE" 2>/dev/null || true)
    if pid_alive "$pid"; then
      printf '%s\n' "$pid"
      return 0
    fi
    rm -f "$PIDFILE" 2>/dev/null || true
  fi
  if [ -d /proc ]; then
    for dir in /proc/[0-9]*; do
      pid=${dir#/proc/}
      cmd=$(tr '\0' ' ' < "$dir/cmdline" 2>/dev/null || true)
      case "$cmd" in
        *node*index.js*|*npm\ start*)
          cwd=$(readlink "$dir/cwd" 2>/dev/null || true)
          if [ "$cwd" = "$ROOT" ]; then
            printf '%s\n' "$pid"
            return 0
          fi
          ;;
      esac
    done
  fi
  return 1
}

ROOT=$(resolve_root) || die "Não encontrei o projeto SYZYGY. Use ~/syzygy ou rode start.sh de dentro da pasta do bot."
cd "$ROOT" || die "Não consegui entrar em $ROOT"
PIDFILE="$ROOT/$PIDFILE_NAME"

log "Diretório: $ROOT"

if [ ! -f "$ROOT/package.json" ]; then
  die "package.json não encontrado em $ROOT"
fi

if [ ! -d "$ROOT/sessao" ]; then
  warn "Pasta sessao/ ainda não existe (será criada na primeira conexão). Não vou criá-la agora."
fi

command -v node >/dev/null 2>&1 || die "Node.js não encontrado. No Termux: pkg install nodejs"
command -v npm >/dev/null 2>&1 || die "npm não encontrado. No Termux: pkg install nodejs"

START_CMD=""
if START_CMD=$(node -e "const p=require('./package.json'); if(!p.scripts||!p.scripts.start) process.exit(2); process.stdout.write(String(p.scripts.start))" 2>/dev/null); then
  :
else
  die "package.json não define scripts.start. O SYZYGY espera \"start\": \"node index.js\"."
fi

# config.json é estado do aparelho (número do dono, grupos, ritmo), não código:
# ele saiu do git na v53. Clone novo começa do template — quem já tem o seu não
# é tocado em nada.
if [ ! -f "$ROOT/config.json" ] && [ -f "$ROOT/config.example.json" ]; then
  if cp "$ROOT/config.example.json" "$ROOT/config.json"; then
    log "criei config.json a partir de config.example.json — confira número do dono e grupos nele (ou ajuste depois pelo painel 12-41)"
  else
    warn "não consegui criar config.json; o bot vai rodar com os padrões embutidos"
  fi
fi

log "Comando de start (package.json): $START_CMD"

RUNNING=$(find_running_pid || true)
if [ -n "$RUNNING" ]; then
  warn "SYZYGY já está em execução (pid $RUNNING)"
  warn "Não vou iniciar outra instância."
  log "Para ver o processo: ps -p $RUNNING"
  exit 0
fi

mkdir -p "$ROOT/tmp" 2>/dev/null || true
printf '%s\n' "$$" > "$PIDFILE" || warn "Não consegui gravar $PIDFILE"

cleanup() {
  rm -f "$PIDFILE" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

ok "Iniciando SYZYGY com: npm start"
log "sessao/, .env e configs NÃO serão apagados."
log "Ctrl+C para encerrar."
printf '\n'

# npm start usa o script real do package.json (hoje: node index.js)
npm start
status=$?
if [ "$status" -ne 0 ]; then
  fail "npm start encerrou com código $status"
  exit "$status"
fi
ok "SYZYGY encerrou normalmente"
exit 0
