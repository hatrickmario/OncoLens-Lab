#!/usr/bin/env bash
# Un documento que el código lee, con un cambio de solo texto al final.
set -euo pipefail
printf '\nNota de prueba de la CI (fixture ac-detector-docs-leido-por-codigo).\n' >> docs/architecture/data-model.md
