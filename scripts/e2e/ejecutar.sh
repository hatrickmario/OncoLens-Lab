#!/usr/bin/env bash
# Ejecuta los E2E de Playwright (apps/web/e2e) contra Compose en perfil de test: LLM y modelos FINGIDOS, seed sintético.
#
#   scripts/e2e/ejecutar.sh [--mantener] [-- <args de playwright>]     # p. ej. -- --grep "US-061"
#
# Usa un proyecto de Compose aparte (`oncolens-e2e`: volúmenes y redes propios, no toca los datos del demo) y la
# misma carpeta de secretos del repo. Sin red ni modelos reales: responde con los ejemplos de contracts/examples/.
# Hace: secretos -> stack -> esquema clínico -> seed -> compilar workspaces -> Chromium -> playwright test -> down.
# Con --mantener deja el stack arriba (para depurar). La contraseña de doc1 llega solo por entorno, nunca se imprime.
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
mantener=0; args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --mantener) mantener=1 ;;
    --) shift; args=("$@"); break ;;
    *) echo "uso: $0 [--mantener] [-- args de playwright]" >&2; exit 2 ;;
  esac
  shift
done

export COMPOSE_PROJECT_NAME=oncolens-e2e APP_ENV=local LLM_PROVIDER=fake MODEL_PROVIDER=fake
modelos="$(mktemp -d)"; export MODEL_HOST_DIR="$modelos"
export WEB_HOME_PATH="/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis"   # paciente semilla (a)
export AI_DISCLAIMER_TEXT="Generado por IA; requiere validación clínica independiente por el oncólogo tratante."
export ANALYSIS_BASIS_S1_ASSUMPTION_TEXT="Supuesto fijo del S1 para pruebas: caso sintético."
compose=(docker compose -f "$raiz/infra/docker/docker-compose.yml")
limpiar() { [ "$mantener" = 1 ] || "${compose[@]}" --profile seed down -v >/dev/null 2>&1 || true; rm -rf "$modelos"; }
trap limpiar EXIT

paso() { printf '\n== %s\n' "$*"; }
docker info >/dev/null 2>&1 || { echo "ejecutar: Docker no responde" >&2; exit 1; }

paso "Secretos y stack fingido"
"$raiz/scripts/setup-secrets.sh" >/dev/null
"${compose[@]}" --profile seed down -v >/dev/null 2>&1 || true   # empezar limpio: las contraseñas del volumen deben ser las de esta carpeta de secretos
"${compose[@]}" up -d --build 2>&1 | tail -2

paso "Esquema clínico y seed"
red=$(docker network ls --filter "name=${COMPOSE_PROJECT_NAME}_clinical-net" --format '{{.Name}}' | head -1)
imagen_node=$(awk '/^FROM/{print $2; exit}' "$raiz/apps/clinical-api/Dockerfile")
version_prisma=$(python3 -c "import json;print(json.load(open('$raiz/apps/clinical-api/package.json'))['devDependencies']['prisma'])")
docker run --rm --network "$red" \
  -v "$raiz/apps/clinical-api/prisma:/w/prisma:ro" -v "$raiz/apps/clinical-api/prisma.config.ts:/w/prisma.config.ts:ro" -w /w \
  -e DATABASE_URL="postgresql://clinical_api:$(cat "${ONCOLENS_SECRETS_DIR:-$raiz/infra/docker/secrets}/pg_clinical_api_password")@postgres:5432/${POSTGRES_DB:-oncolens}?sslmode=require" \
  "$imagen_node" sh -c "npm init -y >/dev/null && npm i --silent prisma@${version_prisma} dotenv >/dev/null 2>&1; npx prisma migrate deploy" 2>&1 | tail -1
"${compose[@]}" --profile seed run --rm clinical-seed 2>&1 | tail -1 | cut -c1-80
"${compose[@]}" up -d 2>&1 | tail -1
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = "200" ] && break; sleep 2
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)" = "200" ] || { echo "ejecutar: el web no responde en /login" >&2; exit 1; }

paso "Playwright (Chromium)"
cd "$raiz"
[ -d node_modules ] || npm ci --ignore-scripts --silent
npm run build --workspaces --if-present >/dev/null 2>&1   # los E2E importan paquetes compilados (clinical-language)
cd apps/web
npx playwright install chromium >/dev/null 2>&1
E2E_DOC_CONTRASENA="$(cat "${ONCOLENS_SECRETS_DIR:-$raiz/infra/docker/secrets}/seed_doctor_password")" npx playwright test ${args[@]+"${args[@]}"}
