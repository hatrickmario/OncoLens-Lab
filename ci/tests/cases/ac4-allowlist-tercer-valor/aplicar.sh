#!/usr/bin/env bash
set -euo pipefail
printf -- '- documento: %s\n' "$(printf '9%.0s' 1 2 3 4 5 6 7 8 9)" >> ci/tests/cases/ac4-allowlist/datos.md
