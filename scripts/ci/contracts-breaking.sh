#!/usr/bin/env bash
# AC-2 de US-036 (design.md D3, ADR-26): compara el openapi.yaml de cada proveedor de HEAD con el de la base del PR,
# ambos empaquetados con sus $ref a contracts/, con `oasdiff breaking --fail-on ERR`.
# Solo rompen los cambios de nivel ERR; los WARN (p. ej. response-body-wrapped-in-one-of-original-preserved de los
# oneOf aditivos) se imprimen y no rompen. Lo sustituirá `contracts:breaking` de US-214.
# Uso: scripts/ci/contracts-breaking.sh <base-ref>     (p. ej. origin/main o el SHA base del PR)
set -uo pipefail

if [ $# -ne 1 ]; then
  echo "uso: $0 <base-ref>" >&2
  exit 2
fi
base_ref="$1"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT

mkdir -p "$temporal/base"
if ! git -C "$raiz" archive "$base_ref" ':(glob)apps/*/openapi.yaml' contracts \
  | tar -x -C "$temporal/base"; then
  echo "contracts-breaking — no se pudo extraer la base $base_ref" >&2
  exit 2
fi
node "$raiz/scripts/ci/bundle-specs.mjs" "$temporal/base" "$temporal/base-out" >/dev/null || exit 2
# Los proveedores salen de PROVIDERS (scripts/contracts/lib/specs.mjs) a través de bundle-specs.mjs: no hay lista aquí.
proveedores=()
while IFS= read -r proveedor; do proveedores+=("$proveedor"); done < <(node "$raiz/scripts/ci/bundle-specs.mjs" "$raiz" "$temporal/head-out")
if [ "${#proveedores[@]}" -eq 0 ]; then
  echo "contracts-breaking — no se obtuvo ningún proveedor" >&2
  exit 2
fi

# ADR-26: un ERR solo se perdona si coincide EXACTO (proveedor, regla, operación, ruta y texto) con una excepción de
# scripts/ci/contracts-breaking-excepciones.json; cualquier otro ERR del mismo proveedor sigue rompiendo.
#
# Falla cerrado: solo perdona si el filtro IMPRIME la decisión explícita (al menos un ERR coincide con una excepción y
# ninguno queda sin declarar). Un filtro que no corre, que falla o que no emite nada deja el ERR en pie.
sin_err_no_declarados() {
  local json decision
  json="$(oasdiff breaking "$temporal/base-out/$1.json" "$temporal/head-out/$1.json" \
    --format json --allow-external-refs=false 2>/dev/null)" || return 1
  decision="$(printf '%s' "$json" | node "$raiz/scripts/ci/lib/excepcionesDeContrato.mjs" "$1")" || {
    printf '%s\n' "$decision" >&2
    return 1
  }
  [ "$decision" = "excepciones-declaradas-aplicadas" ]
}

fallo=0
for proveedor in "${proveedores[@]}"; do
  informe="$temporal/$proveedor.txt"
  oasdiff breaking "$temporal/base-out/$proveedor.json" "$temporal/head-out/$proveedor.json" \
    --fail-on ERR --allow-external-refs=false --color never >"$informe" 2>&1
  codigo=$?
  sed "s/^/$proveedor: /" "$informe"
  echo "$proveedor: comparado"
  if [ "$codigo" -ne 0 ] && sin_err_no_declarados "$proveedor"; then
    echo "$proveedor: los ERR son excepciones declaradas (ADR-26, scripts/ci/contracts-breaking-excepciones.json)"
    codigo=0
  fi
  if [ "$codigo" -ne 0 ]; then
    fallo=1
    echo "contracts-breaking — $proveedor: cambio incompatible de nivel ERR respecto de $base_ref" >&2
  fi
done

if [ "$fallo" -eq 0 ]; then
  echo "contracts-breaking — sin cambios incompatibles (nivel ERR) respecto de $base_ref"
fi
exit "$fallo"
