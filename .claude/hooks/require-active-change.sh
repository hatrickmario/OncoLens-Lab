#!/usr/bin/env bash
# PreToolUse (Edit|Write|NotebookEdit): "sin change activo no hay código".
# Bloquea ediciones en apps/, packages/ e infra/ si no existe ningún change activo en openspec/changes/.
# Escape para hotfix: crear el archivo .claude/HOTFIX (con el motivo) o exportar ONCOLENS_HOTFIX=1.
set -euo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$(python3 -I "$HOOK_DIR/_input.py" tool_input.file_path)"
[ -z "$FILE" ] && exit 0
[ "${ONCOLENS_HOTFIX:-0}" = "1" ] && exit 0

DIR="$(dirname "$FILE")"
while [ ! -d "$DIR" ] && [ "$DIR" != "/" ]; do DIR="$(dirname "$DIR")"; done
ROOT="$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$ROOT" ] && exit 0
REL="${FILE#"$ROOT"/}"

case "$REL" in
  apps/*|packages/*|infra/*) ;;
  *) exit 0 ;;
esac
[ -f "$ROOT/.claude/HOTFIX" ] && exit 0

ACTIVE="$(find "$ROOT/openspec/changes" -mindepth 1 -maxdepth 1 -type d ! -name archive 2>/dev/null | head -1 || true)"
if [ -z "$ACTIVE" ]; then
  echo "OncoLens · bloqueado: no hay ningún change activo en openspec/changes/ y $REL es código de producto." >&2
  echo "Crea el change primero (/opsx:propose o la skill backlog-to-change). Hotfix: crea .claude/HOTFIX con el motivo." >&2
  exit 2
fi
exit 0
