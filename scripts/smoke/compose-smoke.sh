#!/usr/bin/env bash
# Smoke del stack de Compose (US-034): `npm run smoke:compose`.
#   fase 1  secretos ausentes   -> el arranque falla nombrando el archivo ausente (AC-1, asumido)
#   fase 2  LLM_PROVIDER=fake   -> AC-1 (ocho healthy, /health entre contenedores), AC-3 (red y solo lectura), AC-6 (fixtures)
#   fase 3  LLM_PROVIDER=local con LLM_BASE_URL a un puerto sin escucha -> AC-4 (rag 503, clinical-api 200)
# Usa secretos ficticios en un directorio temporal (scripts/smoke/lib/fake-secrets.sh) o, si existe,
# scripts/setup-secrets.sh de L1D-165 (se invoca con ONCOLENS_SECRETS_DIR). Un proyecto de Compose propio
# y `down -v` al final, siempre. Variables: SMOKE_WAIT_TIMEOUT (s), SMOKE_COMPOSE_OVERRIDE (-f extra, p. ej. de la CI).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
proyecto="oncolens-smoke-$$"
espera="${SMOKE_WAIT_TIMEOUT:-900}"
temporal="$(mktemp -d)"
log="$temporal/compose.log"

archivos=(-f "$raiz/infra/docker/docker-compose.yml")
[ -n "${SMOKE_COMPOSE_OVERRIDE:-}" ] && archivos+=(-f "$SMOKE_COMPOSE_OVERRIDE")
compose() { docker compose -p "$proyecto" "${archivos[@]}" "$@"; }

fallo() { echo "FALLO: $*" >&2; [ -s "$log" ] && tail -n 20 "$log" >&2; exit 1; }
bien() { echo "OK    $*"; }

limpiar() {
  local codigo=$?
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$temporal"
  exit "$codigo"
}
trap limpiar EXIT

puerto_libre() { node -e "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"; }

# Ejecuta JavaScript dentro de un contenedor de Node: el código llega por argumento, el cuerpo opcional por stdin.
en_node() { local servicio="$1" codigo="$2"; shift 2; compose exec -T "$servicio" node -e "$codigo" "$@"; }

# GET {url} desde un contenedor: imprime "<status> <cuerpo>".
get_desde() { en_node "$1" "fetch(process.argv[1]).then(async r=>console.log(r.status,await r.text()))" "$2"; }

estado_de() { compose ps --format '{{.Service}}={{.Health}}' | sort; }

# Las imágenes se construyen una vez (la construcción no usa secretos); las fases siguientes no reconstruyen.
compose build >"$log" 2>&1 || fallo "no se pudieron construir las imágenes"

# ---------- fase 1: secretos ausentes ----------
vacio="$temporal/secretos-vacios"
mkdir -p "$vacio"
if ONCOLENS_SECRETS_DIR="$vacio" compose up -d --no-build --wait >"$log" 2>&1; then
  fallo "el arranque sin secretos debía fallar"
fi
grep -q "$vacio" "$log" || fallo "el arranque sin secretos no nombra el archivo ausente"
bien "sin secretos el arranque falla nombrando el archivo ausente"
compose down -v --remove-orphans >/dev/null 2>&1 || true
: >"$log"

# ---------- secretos de las fases siguientes ----------
secretos="$temporal/secretos"
if [ -x "$raiz/scripts/setup-secrets.sh" ]; then
  ONCOLENS_SECRETS_DIR="$secretos" "$raiz/scripts/setup-secrets.sh" >/dev/null
else
  "$raiz/scripts/smoke/lib/fake-secrets.sh" "$secretos" >/dev/null
fi
export ONCOLENS_SECRETS_DIR="$secretos"
export WEB_PORT="${WEB_PORT:-$(puerto_libre)}"

# ---------- fase 2: modo fake ----------
export LLM_PROVIDER=fake
compose up -d --no-build --wait --wait-timeout "$espera" >"$log" 2>&1 || fallo "el stack en modo fake no quedó healthy"

esperados="$(compose config --services | wc -l | tr -d ' ')"
saludables="$(estado_de | grep -c '=healthy$' || true)"
[ "$saludables" = "$esperados" ] || fallo "AC-1: $saludables de $esperados servicios healthy ($(estado_de | tr '\n' ' '))"
bien "AC-1 los $esperados servicios están healthy"

salida="$(get_desde web http://clinical-api:3000/health)"
[ "$salida" = '200 {"status":"ok"}' ] || fallo "AC-1: /health de clinical-api desde web respondió: $salida"
bien "AC-1 /health de clinical-api responde 200 desde web"

salida="$(get_desde clinical-api http://rag-orchestrator:8000/health)"
[ "$salida" = '200 {"status":"ok"}' ] || fallo "AC-1: /health de rag-orchestrator desde clinical-api respondió: $salida"
bien "AC-1 /health de rag-orchestrator responde 200 desde clinical-api (LLM_PROVIDER=fake)"

if compose exec -T rag-orchestrator python -c "import socket; socket.create_connection(('clinical-minio', 9000), 3)" >/dev/null 2>&1; then
  fallo "AC-3: rag-orchestrator alcanzó clinical-minio:9000"
fi
bien "AC-3 rag-orchestrator no alcanza clinical-minio:9000"
en_node clinical-api "require('net').createConnection({host:'clinical-minio',port:9000,timeout:3000}).on('connect',function(){this.end()}).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))" \
  || fallo "AC-3: clinical-api no alcanzó clinical-minio:9000"
bien "AC-3 clinical-api alcanza clinical-minio:9000"

if compose exec -T rag-orchestrator python -c "open('/app/escritura-de-prueba', 'w')" >/dev/null 2>&1; then
  fallo "AC-3: rag-orchestrator pudo escribir en /app (sistema de archivos de lectura)"
fi
compose exec -T rag-orchestrator python -c "import os; open(os.path.join(os.environ['TMPDIR'], 'escritura-de-prueba'), 'w').close()" \
  || fallo "AC-3: rag-orchestrator no pudo escribir en TMPDIR"
bien "AC-3 rag-orchestrator no escribe en /app y sí en TMPDIR"

# AC-6: cada pregunta de fixture devuelve su ejemplo; una pregunta que no es de fixture devuelve "sin evidencia".
consulta='let c="";process.stdin.on("data",d=>c+=d).on("end",async()=>{const r=await fetch("http://rag-orchestrator:8000/rag/query",{method:"POST",headers:{"content-type":"application/json"},body:c});console.log(r.status+" "+await r.text())})'
# Consulta /rag/query desde clinical-api con el cuerpo de stdin: imprime "<status> <cuerpo>".
consultar_rag() { en_node clinical-api "$consulta"; }

# Éxito si "<status> <cuerpo>" es 200 y el cuerpo es idéntico al ejemplo de contracts/examples/.
es_respuesta_200_igual_a() {
  node -e "
const [estado, ...resto] = process.argv[1].split(' ');
require('assert').strictEqual(estado, '200');
require('assert').deepStrictEqual(JSON.parse(resto.join(' ')), require('$raiz/contracts/examples/' + process.argv[2]));
" "$1" "$2"
}

pares="$(node -e "
const i=require('$raiz/contracts/examples/index.json').examples;
for (const e of i.filter(e=>e.target==='#/components/schemas/RagQueryInternalResponse')) console.log(e.request+' '+e.file);
")"
while read -r peticion respuesta; do
  salida="$(consultar_rag <"$raiz/contracts/examples/$peticion")"
  es_respuesta_200_igual_a "$salida" "$respuesta" || fallo "AC-6: $peticion no devolvió $respuesta"
  bien "AC-6 $peticion devuelve $respuesta"
done <<< "$pares"
ajena="$(node -e "const b=require('$raiz/contracts/examples/rag-query-request.json');b.query='Pregunta que no es de fixture';console.log(JSON.stringify(b))")"
salida="$(printf '%s' "$ajena" | consultar_rag)"
es_respuesta_200_igual_a "$salida" rag-query-sin-evidencia.json || fallo "AC-6: una pregunta que no es de fixture no devolvió sin evidencia"
bien "AC-6 una pregunta que no es de fixture devuelve sin evidencia"

# ---------- fase 3: LLM nativo caído ----------
export LLM_PROVIDER=local
export LLM_BASE_URL="http://host.docker.internal:9/v1"
compose up -d rag-orchestrator >"$log" 2>&1 || fallo "no se pudo reiniciar rag-orchestrator con LLM_PROVIDER=local"
salida=""
for _ in $(seq 1 30); do
  salida="$(get_desde clinical-api http://rag-orchestrator:8000/health 2>/dev/null || true)"
  case "$salida" in 503*) break ;; esac
  sleep 2
done
case "$salida" in
  503*LOCAL_LLM_UNAVAILABLE*) ;;
  *) fallo "AC-4: /health de rag-orchestrator con el LLM caído respondió: $salida" ;;
esac
case "$salida" in *host.docker.internal*) fallo "AC-4: el cuerpo del 503 filtra LLM_BASE_URL" ;; esac
bien "AC-4 rag-orchestrator responde 503 LOCAL_LLM_UNAVAILABLE sin la URL del LLM"
salida="$(get_desde web http://clinical-api:3000/health)"
[ "$salida" = '200 {"status":"ok"}' ] || fallo "AC-4: clinical-api dejó de responder 200 con el LLM caído: $salida"
bien "AC-4 clinical-api sigue respondiendo 200"

echo "smoke:compose en verde"
