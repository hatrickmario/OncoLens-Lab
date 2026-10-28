#!/usr/bin/env bash
# PreToolUse (Bash, solo `npm ci` / `npm install`): un `node_modules` enlazado por symlink a otro checkout se vacía con
# `npm ci` y rompe el repo principal (incidente del S3, 2026-10-24). Bloquea la instalación en un directorio así.
set -euo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
CMD="$(python3 -I "$HOOK_DIR/_input.py" tool_input.command)"
case "$CMD" in
  *"npm ci"*|*"npm install"*|*"npm i "*) ;;
  *) exit 0 ;;
esac
# Directorios candidatos: el actual y cada worktree que el comando nombre.
CANDIDATOS="$PWD"
while IFS= read -r linea; do
  ruta="${linea#worktree }"
  case "$CMD" in *"$ruta"*) CANDIDATOS="$CANDIDATOS"$'\n'"$ruta" ;; esac
done < <(git worktree list --porcelain 2>/dev/null | grep '^worktree ' || true)
while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  if [ -L "$dir/node_modules" ]; then
    echo "OncoLens · bloqueado: $dir/node_modules es un symlink; npm ci/install lo vaciaría en el checkout enlazado." >&2
    echo "Usa un worktree con su propio node_modules (npm ci en una copia real) o no instales dependencias ahí." >&2
    exit 2
  fi
done <<< "$CANDIDATOS"
exit 0
