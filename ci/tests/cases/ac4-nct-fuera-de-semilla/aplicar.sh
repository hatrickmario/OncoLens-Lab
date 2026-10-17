#!/usr/bin/env bash
set -euo pipefail
mkdir -p data/otro apps/clinical-api/src
for ruta in data/otro/ci-selftest-nct.txt apps/clinical-api/src/ci-selftest-nct.txt; do
  printf 'the PERSEPHONE trial (%s%s), which enrolled 4,089\n' NCT 00712140 > "$ruta"
done
