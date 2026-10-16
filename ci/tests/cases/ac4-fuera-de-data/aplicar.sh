#!/usr/bin/env bash
set -euo pipefail
numero="$(printf '6%.0s' 1 2 3 4 5 6 7 8 9)"
mkdir -p contracts/examples apps/clinical-api/test/fixtures
printf '{\n  "nota": "documento: %s"\n}\n' "$numero" > contracts/examples/ci-selftest-solicitud.json
printf '{\n  "nota": "documento: %s"\n}\n' "$numero" > apps/clinical-api/test/fixtures/ci-selftest-paciente.json
