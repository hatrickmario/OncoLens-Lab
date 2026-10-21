#!/usr/bin/env bash
# Auditoría de dependencias (US-217): npm audit del workspace y pip-audit de los requirements de rag-orchestrator,
# interpretados por auditar-dependencias.mjs con las excepciones vigentes de security/audit-exceptions.json.
# Las herramientas salen con 1 cuando hay avisos; el veredicto es del intérprete, que además falla si el informe
# no es válido (error de red, JSON vacío). Requiere pip-audit en el PATH (scripts/ci/requirements-audit.txt).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz"
salida="$(mktemp -d)"
trap 'rm -rf "$salida"' EXIT

# Sin umbral en la herramienta: el umbral (high y critical) vive en SEVERIDADES_BLOQUEANTES de auditar-dependencias.mjs.
npm audit --json > "$salida/npm.json" || test -s "$salida/npm.json"
req=apps/rag-orchestrator
pip-audit --no-deps --disable-pip -f json -o "$salida/pip.json" \
  -r "$req/requirements.txt" -r "$req/requirements-dev.txt" -r "$req/requirements-eval.txt" || test -s "$salida/pip.json"

node scripts/ci/auditar-dependencias.mjs --npm "$salida/npm.json" --pip "$salida/pip.json" "$@"
