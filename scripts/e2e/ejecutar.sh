#!/usr/bin/env bash
# Ejecuta los E2E de Playwright (apps/web/e2e) contra Compose en perfil de test: LLM y modelos FINGIDOS, seed sintético.
#
#   scripts/e2e/ejecutar.sh [--mantener] [-- <args de playwright>]     # p. ej. -- --grep "US-061"
#
# Usa un proyecto de Compose PROPIO (`oncolens-e2e`: volúmenes y redes propios) y una carpeta de secretos temporal PROPIA,
# nunca los del entorno (COMPOSE_PROJECT_NAME, ONCOLENS_SECRETS_DIR): el trap hace `down -v` y `rm -rf`, y con los del
# desarrollador borraría su stack. Sin red ni modelos reales: responde con los ejemplos de contracts/examples/.
# Hace: secretos -> stack -> esquema clínico -> seed -> compilar clinical-language -> Chromium -> playwright test -> down.
# Con --mantener deja el stack y los secretos (para depurar). La contraseña de doc1 la genera setup-secrets.sh en esa
# carpeta temporal, llega a Playwright solo por entorno y nunca se imprime ni se versiona (RN-14).
# Modo CI (CI no vacía, p. ej. en GitHub Actions): rechaza --mantener, deja el informe `github` + `html` y trazas (config
# de Playwright) y acota la espera del stack con E2E_ESPERA_STACK_SEGUNDOS (por defecto 180) cada E2E_ESPERA_INTERVALO_SEGUNDOS (2).
set -euo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
mantener=0; args=(); en_ci=0
[ -n "${CI:-}" ] && en_ci=1
while [ $# -gt 0 ]; do
  case "$1" in
    --mantener) [ "$en_ci" = 0 ] || { echo "ejecutar: --mantener no se admite en la CI" >&2; exit 2; }; mantener=1 ;;
    --) shift; args=("$@"); break ;;
    *) echo "uso: $0 [--mantener] [-- args de playwright]" >&2; exit 2 ;;
  esac
  shift
done

# Crea un directorio temporal propio y falla si no queda un directorio real (SC2155: `export X="$(mktemp -d)"` oculta el error).
directorio_temporal_propio() {
  local directorio
  directorio="$(mktemp -d)"
  [ -n "$directorio" ] && [ -d "$directorio" ] || { echo "ejecutar: mktemp -d no creó un directorio" >&2; exit 1; }
  printf '%s' "$directorio"
}

export COMPOSE_PROJECT_NAME=oncolens-e2e APP_ENV=local LLM_PROVIDER=fake MODEL_PROVIDER=fake
modelos="$(directorio_temporal_propio)"; export MODEL_HOST_DIR="$modelos"
secretos="$(directorio_temporal_propio)"; export ONCOLENS_SECRETS_DIR="$secretos"
# Los secretos conservan el 0600 de quien los genera (uid del runner: 1001 en GitHub Actions) y los servicios corren con
# ONCOLENS_UID:ONCOLENS_GID (por defecto 1000:1000) para poder leerlos; sin esto clinical-api no arranca en la CI.
ONCOLENS_UID="$(id -u)"; ONCOLENS_GID="$(id -g)"; export ONCOLENS_UID ONCOLENS_GID
export WEB_HOME_PATH="/pacientes/0fd028e2-f8b0-56c7-a748-2a4e473d879d/analisis"   # paciente semilla (a)
# Inactividad corta solo en el E2E de la sesión inactiva (US-044 AC-4): 1 minuto; el toque de last_seen_at debe ser menor.
export SESSION_IDLE_MINUTES=1 SESSION_TOUCH_SECONDS=10
# Solo mama habilitada: el paciente semilla (b), de próstata, queda fuera del alcance (US-043 AC-3).
export ENABLED_CANCER_TYPES=mama
export AI_DISCLAIMER_TEXT="Generado por IA; requiere validación clínica independiente por el oncólogo tratante."
export ANALYSIS_BASIS_S1_ASSUMPTION_TEXT="Supuesto fijo del S1 para pruebas: caso sintético."
compose=(docker compose -f "$raiz/infra/docker/docker-compose.yml")
# Líneas de stdin que contienen un secreto generado (un valor por archivo de una línea) se descartan: los logs de un
# servicio caído se imprimen en el registro público de la CI.
sin_secretos() {
  local patrones archivo
  patrones="$(mktemp)"
  for archivo in "$secretos"/*; do
    [ -f "$archivo" ] && [ "$(wc -l < "$archivo")" -le 1 ] && [ "$(wc -c < "$archivo")" -ge 8 ] && printf '%s\n' "$(cat "$archivo")" >> "$patrones"
  done
  grep -v -F -f "$patrones" || true
  rm -f "$patrones"
}

# Diagnóstico en la CI: últimas líneas de los servicios que salieron con error, antes de bajar el stack.
mostrar_servicios_caidos() {
  local servicio codigo
  "${compose[@]}" ps -a --format '{{.Service}} {{.ExitCode}}' 2>/dev/null | while read -r servicio codigo; do
    [ -n "$servicio" ] && [ "${codigo:-0}" != 0 ] || continue
    echo "== logs de $servicio (salió con $codigo; últimas 80 líneas)" >&2
    "${compose[@]}" logs --no-color --tail=80 "$servicio" 2>&1 | sin_secretos >&2
  done
}

limpiar() {
  local estado=$?
  [ "$estado" = 0 ] || [ "$en_ci" = 0 ] || mostrar_servicios_caidos
  if [ "$mantener" = 1 ]; then echo "ejecutar: stack y secretos conservados en $secretos" >&2; return; fi
  "${compose[@]}" --profile seed down -v >/dev/null 2>&1 || true
  rm -rf "$modelos" "$secretos"
}
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
  -e DATABASE_URL="postgresql://clinical_api:$(cat "$secretos/pg_clinical_api_password")@postgres:5432/${POSTGRES_DB:-oncolens}?sslmode=require" \
  "$imagen_node" sh -c "npm init -y >/dev/null && npm i --silent prisma@${version_prisma} dotenv >/dev/null 2>&1; npx prisma migrate deploy" 2>&1 | tail -1
# --build: `up --build` no reconstruye los servicios del perfil `seed`; una imagen vieja siembra sin la identidad cifrada.
"${compose[@]}" --profile seed run --rm --build clinical-seed 2>&1 | tail -1 | cut -c1-80
"${compose[@]}" up -d 2>&1 | tail -1
espera="${E2E_ESPERA_STACK_SEGUNDOS:-180}"; intervalo="${E2E_ESPERA_INTERVALO_SEGUNDOS:-2}"
url_web="${E2E_BASE_URL:-http://127.0.0.1:3000}"   # la misma que usa playwright.config.ts
web_responde() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$url_web/login")" = "200" ]; }
transcurrido=0
until web_responde; do
  if [ "$transcurrido" -ge "$espera" ]; then
    echo "ejecutar: el web no responde en /login tras ${espera} s" >&2
    "${compose[@]}" ps 2>&1 | tail -15 >&2
    exit 1
  fi
  sleep "$intervalo"; transcurrido=$((transcurrido + intervalo))
done

paso "Playwright (Chromium)"
cd "$raiz"
[ -d node_modules ] || npm ci --ignore-scripts --silent
# Los E2E solo importan un paquete compilado (clinical-language); web y clinical-api se compilan en sus imágenes de Docker.
# Si el build falla se muestra su cola: en la CI no hay otra pista.
if ! salida_build="$(npm run build --workspace @oncolens/clinical-language 2>&1)"; then printf '%s\n' "$salida_build" | tail -30 >&2; echo "ejecutar: falló el build de @oncolens/clinical-language" >&2; exit 1; fi
cd apps/web
npx playwright install chromium >/dev/null 2>&1
E2E_DOC_CONTRASENA="$(cat "$secretos/seed_doctor_password")"
# En GitHub Actions, enmascara el valor en los registros del job (única línea donde se escribe, como orden del runner).
[ "$en_ci" = 0 ] || echo "::add-mask::$E2E_DOC_CONTRASENA"
export E2E_DOC_CONTRASENA
npx playwright test ${args[@]+"${args[@]}"}
