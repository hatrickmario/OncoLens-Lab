#!/usr/bin/env bash
set -euo pipefail
mkdir -p data/raw/seed/docs
printf 'the PERSEPHONE trial (%s%s), which enrolled 4,089\n' NCT 00712140 > data/raw/seed/docs/ci-selftest-nct.txt
