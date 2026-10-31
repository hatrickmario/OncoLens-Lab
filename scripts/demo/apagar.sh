#!/usr/bin/env bash
# Apaga el demo: cierra Attu si quedó abierto, detiene el stack de Compose (conserva los volúmenes) y el Ollama que arrancó
# levantar.sh. OUT-05 / F-10: al terminar solo `web` publica puerto.
#   scripts/demo/apagar.sh [--borrar-datos]   # --borrar-datos elimina también los volúmenes (empezar de cero)
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
export APP_ENV=local MODEL_HOST_DIR="${MODEL_HOST_DIR:-$HOME/adr39-modelos}"
volumenes=()
[ "${1:-}" = "--borrar-datos" ] && volumenes=(-v)
# Attu (runbook §6) se abre a mano con `docker run --name attu`: se cierra siempre, exista o no.
docker rm -f attu >/dev/null 2>&1 && echo "attu cerrado" || true
docker compose -f "$raiz/infra/docker/docker-compose.yml" --profile seed down ${volumenes[@]+"${volumenes[@]}"} 2>&1 | tail -2 || true
pid="${TMPDIR:-/tmp}/oncolens-demo/ollama.pid"
if [ -f "$pid" ]; then kill "$(cat "$pid")" 2>/dev/null || true; rm -f "$pid"; echo "Ollama detenido"; else echo "Ollama no lo arrancó este script: no se toca"; fi
