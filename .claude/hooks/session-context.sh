#!/usr/bin/env bash
# SessionStart: inyecta el estado del sprint y los changes activos de OpenSpec como contexto.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
echo "## OncoLens · estado al iniciar la sesión"
if command -v openspec >/dev/null 2>&1; then
  echo "### Changes activos (openspec list)"; openspec list 2>/dev/null | head -40
else
  echo "### Changes activos"; ls -1 openspec/changes 2>/dev/null | grep -v '^archive$' | head -40 || echo "(ninguno)"
fi
LAST="$(ls -1t backlog/sprints/S*-status.md 2>/dev/null | head -1)"
if [ -n "$LAST" ]; then echo "### Último estado de sprint ($LAST)"; head -40 "$LAST"; fi
[ -f .claude/HOTFIX ] && echo "⚠️ Modo HOTFIX activo (.claude/HOTFIX): el hook de change activo está desactivado."
exit 0
