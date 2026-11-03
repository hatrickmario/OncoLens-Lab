#!/usr/bin/env bash
# Cambio de documentación pura: un doc de proceso y una nota del backlog (ningún .md que el código lea).
set -euo pipefail
printf '\nNota de prueba de la CI (fixture ac-detector-solo-docs).\n' >> docs/process/definition-of-done.md
printf '# Nota de prueba\n' > backlog/nota-fixture-detector.md
