#!/usr/bin/env bash
set -euo pipefail
# data/evaluation/ ya tiene manifest.json con clase sintetico (L1D-235): la violación va en una carpeta de data/eval/ sin manifiesto.
mkdir -p data/eval/sin-clase
printf '{"pregunta":"¿Qué describe la evidencia sobre HER2?"}\n' > data/eval/sin-clase/preguntas.jsonl
