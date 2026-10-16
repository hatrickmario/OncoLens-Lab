#!/usr/bin/env bash
set -euo pipefail
mkdir -p data/evaluation
printf '{"pregunta":"¿Qué describe la evidencia sobre HER2?"}\n' > data/evaluation/preguntas.jsonl
