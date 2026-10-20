#!/usr/bin/env bash
# Pone el checkout principal al día con origin/main sin sorpresas. Solo avanza (fast-forward); nunca descarta nada.
#
#   scripts/dev/actualizar-main.sh
#
# Regla de trabajo: el checkout principal queda SIEMPRE en `main` y limpio; todo cambio se hace en una copia de trabajo:
#   git worktree add -b <rama> ../<carpeta> origin/main
# Si el checkout tiene cambios locales o está en otra rama, el script lo dice y se detiene sin tocar nada.
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$raiz"

git fetch --quiet origin
rama="$(git branch --show-current)"
if [ "$rama" != "main" ]; then
  echo "actualizar-main: estás en '$rama', no en main. Usa una copia de trabajo (git worktree) o vuelve a main." >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "actualizar-main: hay cambios locales sin guardar; no actualizo para no pisarlos:" >&2
  git status --short --untracked-files=no >&2
  echo "Guárdalos en una rama/PR (desde una copia de trabajo) o restáuralos, y repite." >&2
  exit 1
fi
atraso="$(git rev-list --count HEAD..origin/main)"
if [ "$atraso" = "0" ]; then
  echo "main ya está al día con origin/main."
  exit 0
fi
git pull --ff-only --quiet origin main
echo "main avanzó $atraso commit(s): ahora en $(git rev-parse --short HEAD)."
