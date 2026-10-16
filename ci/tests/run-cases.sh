#!/usr/bin/env bash
# Fixtures de PR de la CI (US-036, design.md D7): clona el repositorio a un directorio temporal por caso, aplica un
# cambio sintético y ejecuta el mismo comando que el job de ci.yml. Uso: ci/tests/run-cases.sh [--estricto] [--lista] [caso ...]
# Variables: PATH debe tener gitleaks y oasdiff (scripts/ci/install-tools.sh); CODEGEN_PYTHON, el Python con requirements-codegen.txt.
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$raiz/ci/tests/run-cases.mjs" "$@"
