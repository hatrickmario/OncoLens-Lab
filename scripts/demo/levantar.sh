#!/usr/bin/env bash
# Levanta el demo local de OncoLens con modelos reales (S1, datos SINTÉTICOS): stack de Compose, esquema clínico, seed,
# corpus semilla y el LLM de ADR-39 en Ollama. Idempotente. Nunca imprime secretos.
#
#   scripts/demo/levantar.sh [--continuar]
#
# Con volúmenes o contenedores de una instalación anterior (proyecto `oncolens_*`) AVISA con la lista y pide confirmación
# antes de continuar sobre ese estado (F-07): `--continuar`, `ONCOLENS_CONFIRMAR_ESTADO_PREVIO=si` o responder `si`. Sin
# confirmación no borra nada y sale con código 1 indicando `scripts/demo/apagar.sh --borrar-datos` (empezar de cero).
#
# Requisitos: Docker Desktop (>= 12 GB para la VM), Ollama con el modelo descargado (`ollama pull <LLM_MODEL>`) y los pesos
# ONNX en MODEL_HOST_DIR (por defecto ~/adr39-modelos; se generan con scripts/demo/exportar-modelos.py).
# Valores públicos de ADR-39 (modelos, chunking, índice) se leen del bloque de decisión del propio ADR: fuente única.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
export MODEL_HOST_DIR="${MODEL_HOST_DIR:-$HOME/adr39-modelos}"
export APP_ENV=local
export LLM_MODEL="${LLM_MODEL:-gemma4:26b-a4b-it-q4_K_M}"
# Puerto del Ollama que usa el demo (por defecto el 11434; otro puerto sirve para no tocar un Ollama ajeno).
puerto_ollama="${OLLAMA_PUERTO:-11434}"
export OLLAMA_HOST="127.0.0.1:${puerto_ollama}" LLM_BASE_URL="http://host.docker.internal:${puerto_ollama}/v1"
# Paciente semilla (a): idSembrado('paciente-a'); ruta de inicio tras el login.
PACIENTE_SEMILLA="0fd028e2-f8b0-56c7-a748-2a4e473d879d"
export WEB_HOME_PATH="/pacientes/${PACIENTE_SEMILLA}/analisis"
# Plazos del demo (RN-22): el p95 de 15 s del NFR no se cumple con consultas variadas (ADR-39 fase B) y una pregunta larga
# vence a los 30 s con DEADLINE_VENCIDO. El del web debe ser mayor que el de clinical-api hacia rag-orchestrator.
export RAG_TIMEOUT_MS="${RAG_TIMEOUT_MS:-90000}"
export WEB_UPSTREAM_TIMEOUT_MS="${WEB_UPSTREAM_TIMEOUT_MS:-100000}"
compose=(docker compose -f "$raiz/infra/docker/docker-compose.yml")
estado="${TMPDIR:-/tmp}/oncolens-demo"
mkdir -p "$estado"

paso() { printf '\n== %s\n' "$*"; }
fallar() { echo "levantar: $*" >&2; exit 1; }

paso "Requisitos"
docker info >/dev/null 2>&1 || fallar "Docker no responde"

paso "Estado previo (F-07)"
proyecto="${COMPOSE_PROJECT_NAME:-oncolens}"
previo="$( { docker volume ls --format '{{.Name}}' --filter "name=^${proyecto}_" 2>/dev/null || true
             docker ps -a --format '{{.Names}}' --filter "name=^${proyecto}-" 2>/dev/null || true; } | sort -u )"
if [ -n "$previo" ]; then
  echo "Hay restos de una instalación anterior (proyecto ${proyecto}):"
  printf '  - %s\n' $previo
  confirmado="no"
  if [ "${1:-}" = "--continuar" ] || [ "${ONCOLENS_CONFIRMAR_ESTADO_PREVIO:-}" = "si" ]; then confirmado="si"; fi
  if [ "$confirmado" != "si" ] && [ -t 0 ]; then
    printf '¿Continuar sobre ese estado (sin borrar nada)? Si las contraseñas cambiaron, falla. Escribe "si": '
    read -r respuesta || respuesta=""
    [ "$respuesta" = "si" ] && confirmado="si"
  fi
  if [ "$confirmado" != "si" ]; then
    echo "levantar: no se confirmó; no se borró nada. Para empezar de cero: scripts/demo/apagar.sh --borrar-datos" >&2
    echo "          para continuar sobre ese estado: scripts/demo/levantar.sh --continuar" >&2
    exit 1
  fi
else
  echo "Sin estado previo"
fi
command -v ollama >/dev/null || fallar "ollama no está instalado"
for m in embeddings reranker nli; do
  [ -f "$MODEL_HOST_DIR/$m/model.onnx" ] || fallar "faltan los pesos ONNX en $MODEL_HOST_DIR/$m (python scripts/demo/exportar-modelos.py)"
done
[ -f "$MODEL_HOST_DIR/modelos.env" ] || fallar "falta $MODEL_HOST_DIR/modelos.env (lo genera exportar-modelos.py)"
mem_docker_gb=$(docker info --format '{{.MemTotal}}' | awk '{printf "%d", $1/1073741824}')
[ "$mem_docker_gb" -ge 12 ] || echo "AVISO: la VM de Docker tiene ${mem_docker_gb} GB; se recomiendan >= 12 GB (Settings > Resources)"

paso "Ollama (contexto 8192, flash attention)"
if curl -fsS -m 2 http://127.0.0.1:${puerto_ollama}/api/version >/dev/null 2>&1; then
  if [ "$puerto_ollama" = "11434" ] && pgrep -f "Ollama.app/Contents/Resources/ollama serve" >/dev/null; then
    fallar "la app de Ollama está abierta y usa su propio contexto (32768), no el de ADR-39 (8192): ciérrala (icono de la barra de menú > Quit Ollama) y repite"
  fi
  echo "Ollama ya responde: debe haberse iniciado con OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 (ADR-39)"
else
  OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1 nohup ollama serve >"$estado/ollama.log" 2>&1 &
  echo $! >"$estado/ollama.pid"
  for _ in $(seq 1 20); do curl -fsS -m 2 http://127.0.0.1:${puerto_ollama}/api/version >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS -m 2 http://127.0.0.1:${puerto_ollama}/api/version >/dev/null || fallar "Ollama no arrancó (ver $estado/ollama.log)"
fi
ollama list | awk 'NR>1{print $1}' | grep -qx "$LLM_MODEL" || fallar "falta el modelo: ollama pull $LLM_MODEL"

paso "Modelo en memoria (se comprueba el contexto de 8192)"
curl -fsS -m 300 http://127.0.0.1:${puerto_ollama}/api/generate \
  -d "{\"model\":\"$LLM_MODEL\",\"prompt\":\"hola\",\"stream\":false,\"think\":false,\"options\":{\"num_predict\":1}}" >/dev/null \
  || fallar "no pude cargar $LLM_MODEL en Ollama"
contexto=$(curl -fsS -m 5 http://127.0.0.1:${puerto_ollama}/api/ps | python3 -c "
import json, sys
modelos = [m for m in json.load(sys.stdin).get('models', []) if sys.argv[1] in (m.get('name'), m.get('model'))]
print(modelos[0].get('context_length', '') if modelos else '')" "$LLM_MODEL")
[ "$contexto" = "8192" ] || fallar "Ollama cargó $LLM_MODEL con contexto '${contexto:-desconocido}' y no 8192 (ADR-39): reinícialo con OLLAMA_CONTEXT_LENGTH=8192 OLLAMA_FLASH_ATTENTION=1"

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
# La URL con la contraseña viaja en un archivo temporal 0600 (--env-file), no en los argumentos de `docker run` (visibles en `ps`).
archivo_env="$(mktemp)"; chmod 600 "$archivo_env"; trap 'rm -f "$archivo_env"' EXIT
printf 'DATABASE_URL=postgresql://clinical_api:%s@postgres:5432/%s?sslmode=require\n' \
  "$(cat "${ONCOLENS_SECRETS_DIR:-$raiz/infra/docker/secrets}/pg_clinical_api_password")" "${POSTGRES_DB:-oncolens}" >"$archivo_env"
docker run --rm --network "$red" \
  -v "$raiz/apps/clinical-api/prisma:/w/prisma:ro" -v "$raiz/apps/clinical-api/prisma.config.ts:/w/prisma.config.ts:ro" -w /w \
  --env-file "$archivo_env" \
  "$imagen_node" sh -c "npm init -y >/dev/null && npm i --silent prisma@${version_prisma} dotenv >/dev/null 2>&1; npx prisma migrate deploy" 2>&1 | tail -2

paso "Seed clínico sintético (la imagen del perfil seed se reconstruye antes: una obsoleta sembraría datos viejos)"
"${compose[@]}" --profile seed build clinical-seed 2>&1 | tail -1
"${compose[@]}" --profile seed run --rm clinical-seed >"$estado/seed.log" 2>&1 || { tail -3 "$estado/seed.log" | cut -c1-200 >&2; fallar "el seed falló"; }
# El seed publica sus conteos (`seed_completo.filas`): son la fuente de la «Verificación del seed», no números fijos del script.
grep seed_completo "$estado/seed.log" | tail -1 | python3 -c "
import json, sys
filas = json.loads(sys.stdin.read()).get('filas', {})
json.dump(filas, open(sys.argv[1], 'w'))
claves = ('clinical.patient', 'identity.patient_identity', 'auth.\"user\"')
print('seed:', ', '.join(f'{t}={n}' for t, n in sorted(filas.items()) if t in claves))" "$estado/seed-conteos.json" \
  || fallar "el seed no publicó sus conteos (seed_completo)"

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

paso "Metadatos de población verificados (data/raw/seed/poblacion-verificada.json, US-242) y pesos sparse (US-117b)"
"${compose[@]}" run --rm -v "$raiz/data/raw/seed:/data/raw/seed:ro" rag-orchestrator \
  python -m app.scripts.poblacion_seed cargar --archivo /data/raw/seed/poblacion-verificada.json 2>&1 | tail -1
sha_sparse=$(shasum -a 256 "$MODEL_HOST_DIR/embeddings/sparse_linear.npz" | cut -d' ' -f1)
"${compose[@]}" run --rm -e EMBEDDING_SPARSE_WEIGHTS_PATH=/models/embeddings/sparse_linear.npz -e EMBEDDING_SPARSE_WEIGHTS_SHA256="$sha_sparse" \
  rag-orchestrator python -m app.scripts.ingest reindex-sparse 2>&1 | tail -1

paso "Arranque final"
"${compose[@]}" up -d 2>&1 | tail -2
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = "200" ] && break; sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = "200" ] || fallar "el web no responde en /login"

# --- verificacion-del-seed --- (D4b, privacy P2): solo `count(*)`, con el rol de cada servicio DENTRO de su contenedor.
# Nunca superusuario, ni filas, ni la cadena de conexión: este tramo no lee, no exporta ni imprime ninguna variable de conexión.
set +x
paso "Verificación del seed"
obtenido_clinico="$("${compose[@]}" exec -T clinical-api node dist/apps/clinical-api/prisma/seed/contar-en-proceso.js 2>/dev/null)" \
  || fallar "no pude contar las filas del seed con el rol de clinical-api"
obtenido_corpus="$("${compose[@]}" exec -T rag-orchestrator python -m app.scripts.poblacion_seed contar 2>/dev/null)" \
  || fallar "no pude contar los documentos del corpus con el rol rag_corpus"
documentos_manifiesto=$(grep -c '^- document_key:' "$raiz/data/raw/seed/manifest.yaml")
python3 "$raiz/scripts/demo/verificar-conteos.py" \
  --seed "$estado/seed-conteos.json" --clinico "$obtenido_clinico" --corpus "$obtenido_corpus" \
  --documentos "$documentos_manifiesto" --poblacion "$raiz/data/raw/seed/poblacion-verificada.json" \
  || fallar "la verificación del seed falló (ver el conteo nombrado arriba)"
# --- fin-verificacion-del-seed ---

paso "Listo"
cat <<FIN
Web:        http://127.0.0.1:3000/login
Usuario:    doc1@test.local   (médico)   ·   admin@test.local (administrador, no ve datos clínicos)
Contraseña: cat ${ONCOLENS_SECRETS_DIR:-infra/docker/secrets}/seed_doctor_password   (o seed_admin_password)
LLM:        $LLM_MODEL (Ollama, contexto 8192) · datos 100 % sintéticos
La primera consulta tarda más: carga el modelo en memoria (~15-25 s). Para apagar: scripts/demo/apagar.sh
FIN
