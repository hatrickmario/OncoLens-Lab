#!/usr/bin/env bash
set -euo pipefail
mkdir -p data/eval/mini
printf '{"clase":"sintetico","nombre":"mini"}\n' > data/eval/mini/manifest.json
printf '{"pregunta":"¿Qué describe la evidencia sobre HER2?"}\n' > data/eval/mini/preguntas.jsonl
