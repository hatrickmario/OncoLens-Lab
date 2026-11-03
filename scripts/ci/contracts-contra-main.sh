#!/usr/bin/env bash
# D5-02 (ARR-11, design.md D8): un PR que toca ejemplos o specs de contrato se valida contra la punta ACTUAL de main.
# El checkout de un pull_request es el merge ref calculado cuando se disparó el evento: si después entra en main un cambio
# que vuelve requerido un campo, los ejemplos del PR seguían verdes (#271, #274, #276). Aquí se fusiona origin/main sobre el
# checkout y se ejecuta `contracts:check` sobre el resultado. Volver a ejecutar el job `contracts` revalida contra la punta
# de main de ese momento (el merge ref no cambia en un re-run; este paso sí).
#
# Sin credenciales (el checkout es persist-credentials: false y el repositorio es público). Un conflicto falla con un
# mensaje fijo y la lista de RUTAS en conflicto, nunca su contenido (RN-14).
# Fuera de un pull_request (GITHUB_EVENT_NAME distinto) o si el diff no toca contratos: `omitido: …` y código 0.
# Uso: scripts/ci/contracts-contra-main.sh <base-ref>     (el SHA base del PR; BASE_REF en ci.yml)
set -uo pipefail

if [ $# -ne 1 ]; then
  echo "uso: $0 <base-ref>" >&2
  exit 2
fi
base_ref="$1"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz" || exit 2

# Rutas cuyo cambio obliga a revalidar contra main: los ejemplos y los openapi.yaml de los proveedores (contract-first).
toca_contratos() {
  local ruta
  while IFS= read -r ruta; do
    case "$ruta" in
      contracts/examples/* | apps/*/openapi.yaml) return 0 ;;
    esac
  done
  return 1
}

if [ -n "${GITHUB_EVENT_NAME:-}" ] && [ "$GITHUB_EVENT_NAME" != "pull_request" ]; then
  echo "omitido: el evento $GITHUB_EVENT_NAME no es un pull_request"
  exit 0
fi
if [ -z "$base_ref" ] || [[ "$base_ref" =~ ^0+$ ]]; then
  echo "omitido: sin base del PR para comparar"
  exit 0
fi

if ! cambiados="$(git diff --no-renames --name-only "$base_ref" HEAD 2>/dev/null)"; then
  echo "contracts-contra-main — no se pudo calcular el diff contra la base $base_ref" >&2
  exit 2
fi
if ! toca_contratos <<<"$cambiados"; then
  echo "omitido: el PR no toca ejemplos ni specs"
  exit 0
fi

if ! git fetch --no-tags --quiet origin main; then
  echo "contracts-contra-main — no se pudo traer origin/main" >&2
  exit 2
fi
if ! git -c user.name=ci-contratos -c user.email=ci-contratos@example.invalid -c commit.gpgsign=false \
  merge --no-edit --no-ff origin/main >/dev/null 2>&1; then
  echo "el PR tiene conflictos con main: actualiza la rama" >&2
  git diff --name-only --diff-filter=U | sed 's/^/  conflicto: /' >&2
  git merge --abort >/dev/null 2>&1 || true
  exit 1
fi
echo "contracts-contra-main — origin/main fusionado sobre el PR; ejecutando contracts:check"
npm run contracts:check
