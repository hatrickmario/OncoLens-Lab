#!/usr/bin/env bash
# Levanta el demo local de OncoLens con modelos reales (S1, datos SINTÉTICOS): stack de Compose, esquema clínico, seed,
# corpus semilla y el LLM de ADR-39 en Ollama. Idempotente. Nunca imprime secretos.
#
#   scripts/demo/levantar.sh
#
# Requisitos: Docker Desktop (>= 12 GB para la VM), Ollama con el modelo descargado (`ollama pull <LLM_MODEL>`) y los pesos
# ONNX en MODEL_HOST_DIR (por defecto ~/adr39-modelos; se generan con scripts/demo/exportar-modelos.py).
# Valores públicos de ADR-39 (modelos, chunking, índice) se leen del bloque de decisión del propio ADR: fuente única.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
export MODEL_HOST_DIR="${MODEL_HOST_DIR:-$HOME/adr39-modelos}"
export APP_ENV=local
export LLM_MODEL="${LLM_MODEL:-gemma4:26b-a4b-it-q4_K_M}"
# Paciente semilla (a): idSembrado('paciente-a'); ruta de inicio tras el login.
PACIENTE_SEMILLA="0fd028e2-f8b0-56c7-a748-2a4e473d879d"
export WEB_HOME_PATH="/pacientes/${PACIENTE_SEMILLA}/analisis"
compose=(docker compose -f "$raiz/infra/docker/docker-compose.yml")
estado="${TMPDIR:-/tmp}/oncolens-demo"
mkdir -p "$estado"

paso() { printf '\n== %s\n' "$*"; }
fallar() { echo "levantar: $*" >&2; exit 1; }

paso "Requisitos"
docker info >/dev/null 2>&1 || fallar "Docker no responde"
command -v ollama >/dev/null || fallar "ollama no está instalado"
for m in embeddings reranker nli; do
  [ -f "$MODEL_HOST_DIR/$m/model.onnx" ] || fallar "faltan los pesos ONNX en $MODEL_HOST_DIR/$m (python scripts/demo/exportar-modelos.py)"
done
[ -f "$MODEL_HOST_DIR/modelos.env" ] || fallar "falta $MODEL_HOST_DIR/modelos.env (lo genera exportar-modelos.py)"
mem_docker_gb=$(docker info --format '{{.MemTotal}}' | awk '{printf "%d", $1/1073741824}')
[ "$mem_docker_gb" -ge 12 ] || echo "AVISO: la VM de Docker tiene ${mem_docker_gb} GB; se recomiendan >= 12 GB (Settings > Resources)"

paso "Ollama (contexto 8192, flash attention)"
if curl -fsS -m 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  echo "Ollama ya responde: debe haberse iniciado con OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 (ADR-39)"
else
  OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 nohup ollama serve >"$estado/ollama.log" 2>&1 &
  echo $! >"$estado/ollama.pid"
  for _ in $(seq 1 20); do curl -fsS -m 2 http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS -m 2 http://127.0.0.1:11434/api/version >/dev/null || fallar "Ollama no arrancó (ver $estado/ollama.log)"
fi
ollama list | awk 'NR>1{print $1}' | grep -qx "$LLM_MODEL" || fallar "falta el modelo: ollama pull $LLM_MODEL"

paso "Secretos y configuración"
"$raiz/scripts/setup-secrets.sh" >/dev/null
# shellcheck disable=SC1091
set -a; source "$MODEL_HOST_DIR/modelos.env"; set +a
# Bloque de decisión de ADR-39 (claves públicas) -> variables de entorno.
eval "$(python3 - "$raiz/docs/architecture/adr/ADR-39-modelos-locales.md" <<'PY'
import re, sys
t = open(sys.argv[1], encoding="utf-8").read()
bloque = t.split("<!-- adr39:decision:inicio -->")[1].split("<!-- adr39:decision:fin -->")[0]
for linea in bloque.splitlines():
    if re.match(r"^[A-Z_0-9]+: ", linea):
        k, v = linea.split(": ", 1)
        v = v.strip()
        if v[:1] == v[-1:] == "'":
            v = v[1:-1]
        print(f"export {k}='{v}'")
PY
)"
export NLI_LABEL_INDEX_ENTAILMENT=0 NLI_LABEL_INDEX_NEUTRAL=1 NLI_LABEL_INDEX_CONTRADICTION=2
export MILVUS_DENSE_METRIC_TYPE=COSINE
export AI_DISCLAIMER_TEXT="Generado por IA; requiere validación clínica independiente por el oncólogo tratante."
export ANALYSIS_BASIS_S1_ASSUMPTION_TEXT="Supuesto fijo del S1 para el demo: caso sintético, sin datos reales."

paso "Stack de Compose (la primera vez construye las imágenes)"
# rag-orchestrator se niega a arrancar sin la colección de Milvus: este primer `up` puede terminar en error y se repite abajo.
"${compose[@]}" up -d --build 2>&1 | tail -3 || true

paso "Colección de Milvus"
"${compose[@]}" run --rm rag-orchestrator python -m app.scripts.init_corpus_store 2>&1 | tail -1

paso "Esquema clínico (prisma migrate deploy como clinical_api, dueño de la base)"
red=$(docker network ls --filter "name=clinical-net" --format '{{.Name}}' | head -1)
[ -n "$red" ] || fallar "no encuentro la red clinical-net"
imagen_node=$(awk '/^FROM/{print $2; exit}' "$raiz/apps/clinical-api/Dockerfile")
version_prisma=$(python3 -c "import json;print(json.load(open('$raiz/apps/clinical-api/package.json'))['devDependencies']['prisma'])")
docker run --rm --network "$red" \
  -v "$raiz/apps/clinical-api/prisma:/w/prisma:ro" -v "$raiz/apps/clinical-api/prisma.config.ts:/w/prisma.config.ts:ro" -w /w \
  -e DATABASE_URL="postgresql://clinical_api:$(cat "$raiz/infra/docker/secrets/pg_clinical_api_password")@postgres:5432/${POSTGRES_DB:-oncolens}?sslmode=require" \
  "$imagen_node" sh -c "npm init -y >/dev/null && npm i --silent prisma@${version_prisma} dotenv >/dev/null 2>&1; npx prisma migrate deploy" 2>&1 | tail -2

paso "Seed clínico sintético"
"${compose[@]}" --profile seed run --rm clinical-seed 2>&1 | tail -1 | cut -c1-120

paso "Corpus semilla (10 documentos públicos con licencia aceptada)"
"${compose[@]}" run --rm -v "$raiz/data/raw/seed:/data/raw/seed:ro" \
  -e CORPUS_SEED_MANIFEST_PATH=/data/raw/seed/manifest.yaml -e CORPUS_ACCEPTED_LICENSES=dominio_publico,cc_by,cc_by_sa \
  -e CORPUS_EXCLUDED_SOURCES=NCCN,ESMO -e CORPUS_CUTOFF_DATE=2026-10-16 \
  -e CORPUS_FETCH_ALLOWED_HOSTS=www.cancer.gov,pmc.ncbi.nlm.nih.gov,pmc-oa-opendata.s3.amazonaws.com \
  -e CORPUS_FETCH_TIMEOUT_SECONDS=30 -e CORPUS_FETCH_MAX_BYTES=5000000 -e CORPUS_FETCH_DEADLINE_SECONDS=60 \
  rag-orchestrator python -m app.scripts.load_seed_corpus 2>&1 | python3 -c "
import sys, json
t = sys.stdin.read(); i = t.find('{\"documentos\"')
print(json.dumps(json.loads(t[i:t.rfind('}')+1]).get('resumen')) if i >= 0 else 'sin reporte: ' + t[-300:])"

paso "Arranque final"
"${compose[@]}" up -d 2>&1 | tail -2
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = "200" ] && break; sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = "200" ] || fallar "el web no responde en /login"

paso "Listo"
cat <<FIN
Web:        http://127.0.0.1:3000/login
Usuario:    doc1@test.local   (médico)   ·   admin@test.local (administrador, no ve datos clínicos)
Contraseña: cat infra/docker/secrets/seed_doctor_password   (o seed_admin_password)
LLM:        $LLM_MODEL (Ollama, contexto 8192) · datos 100 % sintéticos
La primera consulta tarda más: carga el modelo en memoria (~15-25 s). Para apagar: scripts/demo/apagar.sh
FIN
