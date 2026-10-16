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
proveedores=(clinical-api rag-orchestrator)
temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT

mkdir -p "$temporal/base"
if ! git -C "$raiz" archive "$base_ref" apps/clinical-api/openapi.yaml apps/rag-orchestrator/openapi.yaml contracts \
  | tar -x -C "$temporal/base"; then
  echo "contracts-breaking — no se pudo extraer la base $base_ref" >&2
  exit 2
fi
node "$raiz/scripts/ci/bundle-specs.mjs" "$temporal/base" "$temporal/base-out" || exit 2
node "$raiz/scripts/ci/bundle-specs.mjs" "$raiz" "$temporal/head-out" || exit 2

fallo=0
for proveedor in "${proveedores[@]}"; do
  informe="$temporal/$proveedor.txt"
  oasdiff breaking "$temporal/base-out/$proveedor.json" "$temporal/head-out/$proveedor.json" \
    --fail-on ERR --allow-external-refs=false --color never >"$informe" 2>&1
  codigo=$?
  sed "s/^/$proveedor: /" "$informe"
  if [ "$codigo" -ne 0 ]; then
    fallo=1
    echo "contracts-breaking — $proveedor: cambio incompatible de nivel ERR respecto de $base_ref" >&2
  fi
done

if [ "$fallo" -eq 0 ]; then
  echo "contracts-breaking — sin cambios incompatibles (nivel ERR) respecto de $base_ref"
fi
exit "$fallo"
