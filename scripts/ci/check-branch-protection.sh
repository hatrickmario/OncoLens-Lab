#!/usr/bin/env bash
# AC-6 de US-036 (design.md D6): verifica, en solo lectura, que `main` exige PR y el check `ci-ok`, está al día y no
# admite bypass de administradores. La configuración la aplica el humano administrador; este script no cambia nada.
# Uso: scripts/ci/check-branch-protection.sh [--repo <dueño/repositorio>] [--from-file <respuesta.json>]
#   --from-file  JSON ya armado { protection, rules, rulesets } (fixture); sin él se consulta `gh api`.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
repo=""
archivo=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="${2:?--repo necesita dueño/repositorio}"; shift 2 ;;
    --from-file) archivo="${2:?--from-file necesita una ruta}"; shift 2 ;;
    *) echo "argumento desconocido: $1" >&2; exit 2 ;;
  esac
done

if [ -n "$archivo" ]; then
  respuesta="$(cat "$archivo")"
else
  if [ -z "$repo" ]; then
    repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  fi
  proteccion="$(gh api "repos/$repo/branches/main/protection" 2>/dev/null || echo null)"
  reglas="$(gh api "repos/$repo/rules/branches/main")"
  identificadores="$(gh api "repos/$repo/rulesets" --jq '.[].id' 2>/dev/null || true)"
  detalles="[]"
  for id in $identificadores; do
    detalles="$(gh api "repos/$repo/rulesets/$id" | jq -c --argjson previos "$detalles" '$previos + [.]')"
  done
  respuesta="$(jq -cn --argjson protection "$proteccion" --argjson rules "$reglas" --argjson rulesets "$detalles" \
    '{protection: $protection, rules: $rules, rulesets: $rulesets}')"
fi

printf '%s' "$respuesta" | node "$raiz/scripts/ci/proteccion-rama.mjs"
