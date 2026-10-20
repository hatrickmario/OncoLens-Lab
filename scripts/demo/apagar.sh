#!/usr/bin/env bash
# Apaga el demo: detiene el stack de Compose (conserva los volúmenes) y el Ollama que arrancó levantar.sh.
#   scripts/demo/apagar.sh [--borrar-datos]   # --borrar-datos elimina también los volúmenes (empezar de cero)
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
export APP_ENV=local MODEL_HOST_DIR="${MODEL_HOST_DIR:-$HOME/adr39-modelos}"
volumenes=()
[ "${1:-}" = "--borrar-datos" ] && volumenes=(-v)
docker compose -f "$raiz/infra/docker/docker-compose.yml" --profile seed down "${volumenes[@]}" 2>&1 | tail -2 || true
pid="${TMPDIR:-/tmp}/oncolens-demo/ollama.pid"
if [ -f "$pid" ]; then kill "$(cat "$pid")" 2>/dev/null || true; rm -f "$pid"; echo "Ollama detenido"; else echo "Ollama no lo arrancó este script: no se toca"; fi
