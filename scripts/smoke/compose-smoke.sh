#!/usr/bin/env bash
# Smoke del stack de Compose (US-034): `npm run smoke:compose`.
#   fase 1  secretos ausentes   -> el arranque falla nombrando el archivo ausente (AC-1, asumido)
#   fase 2  LLM_PROVIDER=fake   -> AC-1 (ocho healthy, /health entre contenedores), AC-3 (red y solo lectura), AC-6 (fixtures)
#   fase 3  LLM_PROVIDER=local con LLM_BASE_URL a un puerto sin escucha -> AC-4 (rag 503, clinical-api 200)
#   fase 2b PostgreSQL con TLS y roles (US-035 AC-4): sin TLS se rechaza, el superusuario no entra por red,
#           rag_corpus_migrator crea solo en corpus y rag_corpus no crea
#   fase 4  sin la clave AES montada clinical-api no queda healthy (US-035 AC-5)
#   fase 5  perfil test/CI: oncolens_test_admin solo con CREATEDB, sin acceso a la base clínica (US-035 AC-1, AC-4)
#   fase 6  un fallo del init de roles no deja ninguna contraseña en el log de postgres (US-035 AC-1)
# Usa los secretos reales de scripts/setup-secrets.sh (US-035) en un directorio temporal, con sus permisos 0600.
# Cada fase que arranca o recrea contenedores por su cuenta (1 y 6) usa un proyecto de Compose PROPIO (D4-18): un `down`
# lento o fallido de una fase no puede chocar por nombre de contenedor con el `up` de la siguiente. El trap baja todos
# los proyectos con `down -v` al final, siempre. Variables: SMOKE_WAIT_TIMEOUT (s), SMOKE_COMPOSE_OVERRIDE (-f extra, p. ej. de la CI).
set -euo pipefail

# APP_ENV es obligatorio en el servicio clinical-api (`${APP_ENV:?...}`, sin default en el Compose): el smoke corre con
# datos sintéticos y lo fija explícitamente, salvo que el llamador ya lo defina.
export APP_ENV="${APP_ENV:-test}"

# clinical-api rechaza arrancar sin los dos textos configurables del cierre del análisis (fallo cerrado, RN-22) y la CI no
# tiene .env: el smoke pasa textos SINTÉTICOS, salvo que el llamador ya los defina. No son los literales de producción.
export AI_DISCLAIMER_TEXT="${AI_DISCLAIMER_TEXT:-Aviso sintético de IA del smoke.}"
export ANALYSIS_BASIS_S1_ASSUMPTION_TEXT="${ANALYSIS_BASIS_S1_ASSUMPTION_TEXT:-Supuesto sintético de la Base del análisis del smoke.}"

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
proyecto_base="oncolens-smoke-$$"
proyecto="$proyecto_base"
proyectos=("$proyecto_base")
espera="${SMOKE_WAIT_TIMEOUT:-900}"
temporal="$(mktemp -d)"
log="$temporal/compose.log"

# US-231a: el smoke no tiene pesos de modelos reales (RN-14). Modelos en fake y un directorio vacío, fuera del repo, para el
# montaje de solo lectura que el Compose exige (MODEL_HOST_DIR no tiene valor por defecto).
mkdir -p "$temporal/modelos"
export MODEL_PROVIDER="${MODEL_PROVIDER:-fake}"
export MODEL_HOST_DIR="${MODEL_HOST_DIR:-$temporal/modelos}"

archivos=(-f "$raiz/infra/docker/docker-compose.yml")
[ -n "${SMOKE_COMPOSE_OVERRIDE:-}" ] && archivos+=(-f "$SMOKE_COMPOSE_OVERRIDE")
compose() { docker compose -p "$proyecto" "${archivos[@]}" "$@"; }

# Ante un fallo: el log completo del último `compose up`/`down` y el estado de TODOS los contenedores del proyecto activo,
# antes de que el trap los baje.
fallo() {
  echo "FALLO: $*" >&2
  if [ -s "$log" ]; then echo "--- log completo del último comando de compose ---" >&2; cat "$log" >&2; fi
  echo "--- compose ps -a del proyecto $proyecto ---" >&2
  compose ps -a >&2 2>&1 || true
  if declare -F compose_test >/dev/null; then echo "--- compose ps -a del proyecto $proyecto_test ---" >&2; compose_test ps -a >&2 2>&1 || true; fi
  exit 1
}
bien() { echo "OK    $*"; }

limpiar() {
  local codigo=$?
  local p
  for p in "${proyectos[@]}"; do
    docker compose -p "$p" "${archivos[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  done
  for p in "${proyectos[@]}"; do
    [ "$p" = "$proyecto_base" ] || docker image ls --format '{{.Repository}}' | grep "^$p-" | xargs -r docker rmi >/dev/null 2>&1 || true
  done
  if declare -F compose_test >/dev/null; then compose_test down -v --remove-orphans >/dev/null 2>&1 || true; fi
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
# Proyecto propio (D4-18): el `up` fallido deja contenedores creados (p. ej. milvus-etcd-1) y el `down` puede tardar; con otro
# nombre de proyecto la fase 2 nunca choca con "container name already in use". Como las imágenes de los servicios con
# `build` se nombran <proyecto>-<servicio>, se les añade la etiqueta del proyecto de la fase 1 (sin reconstruir: --no-build).
proyecto_fase1="$proyecto_base-f1"
proyectos+=("$proyecto_fase1")
for servicio in $(compose config --services); do
  if docker image inspect "$proyecto_base-$servicio" >/dev/null 2>&1; then docker tag "$proyecto_base-$servicio" "$proyecto_fase1-$servicio"; fi
done
proyecto="$proyecto_fase1"
vacio="$temporal/secretos-vacios"
mkdir -p "$vacio"
if ONCOLENS_SECRETS_DIR="$vacio" compose up -d --no-build --wait >"$log" 2>&1; then
  fallo "el arranque sin secretos debía fallar"
fi
grep -q "$vacio" "$log" || fallo "el arranque sin secretos no nombra el archivo ausente"
bien "sin secretos el arranque falla nombrando el archivo ausente"
# El `down` de la fase 1 puede fallar sin invalidar el smoke, pero su salida queda en el log (y en stderr si falla).
if ! compose down -v --remove-orphans >>"$log" 2>&1; then
  echo "AVISO: el down de la fase 1 falló; salida:" >&2
  cat "$log" >&2
fi
compose ps -a >>"$log" 2>&1 || true
proyecto="$proyecto_base"

# ---------- secretos de las fases siguientes ----------
secretos="$temporal/secretos"
ONCOLENS_SECRETS_DIR="$secretos" "$raiz/scripts/setup-secrets.sh" >/dev/null
# Los permisos de los secretos NO se relajan (0600 del dueño): clinical-api y rag-orchestrator corren con el uid que
# los posee (ONCOLENS_UID/ONCOLENS_GID) y postgres los copia a un tmpfs propio. Si un servicio no puede leer su
# secreto, el stack no queda healthy y el smoke falla.
export ONCOLENS_UID="$(id -u)" ONCOLENS_GID="$(id -g)"
export ONCOLENS_SECRETS_DIR="$secretos"
export WEB_PORT="${WEB_PORT:-$(puerto_libre)}"

# ---------- fase 2: modo fake ----------
export LLM_PROVIDER=fake
compose up -d --no-build --wait --wait-timeout "$espera" >"$log" 2>&1 || fallo "el stack en modo fake no quedó healthy"

# corpus-migrate es un one-shot (restart: "no", sin healthcheck): termina con éxito y su estado nunca es healthy.
esperados="$(compose config --services | grep -vx 'corpus-migrate' | wc -l | tr -d ' ')"
saludables="$(estado_de | grep -c '=healthy$' || true)"
[ "$saludables" = "$esperados" ] || fallo "AC-1: $saludables de $esperados servicios healthy ($(estado_de | tr '\n' ' '))"
bien "AC-1 los $esperados servicios están healthy"

# Healthy no basta para un one-shot: se comprueba que corpus-migrate terminó (exited) con código 0.
migracion="$(compose ps -a corpus-migrate --format '{{.State}} {{.ExitCode}}')"
[ "$migracion" = "exited 0" ] || fallo "AC-1: corpus-migrate no terminó con código 0 (estado: $migracion)"
bien "AC-1 corpus-migrate terminó con código 0"

# clinical-seed (L1D-169) pertenece al perfil `seed`: no arranca con `up`. Que termine con código 0 queda pendiente del
# one-shot clinical-migrate (hoy nada migra el esquema clínico en Compose); se consultó al usuario.

salida="$(get_desde web http://clinical-api:3000/health)"
# /health responde 200 y status ok; configKeys y serviceVersion (US-037) no se comparan: varían con la configuración.
case "$salida" in
  '200 {"status":"ok"'*) ;;
  *) fallo "AC-1: /health de clinical-api desde web respondió: $salida" ;;
esac
bien "AC-1 /health de clinical-api responde 200 desde web"

salida="$(get_desde clinical-api http://rag-orchestrator:8000/health)"
# /health responde 200 y status ok; configKeys y serviceVersion (US-037) no se comparan: varían con la configuración.
case "$salida" in
  '200 {"status":"ok"'*) ;;
  *) fallo "AC-1: /health de rag-orchestrator desde clinical-api respondió: $salida" ;;
esac
bien "AC-1 /health de rag-orchestrator responde 200 desde clinical-api (LLM_PROVIDER=fake)"

[ -z "$(find "$secretos" -type f \( -name '*password' -o -name '*_key' -o -name '*.key' -o -name jwt_service_private.pem \) ! -perm 600)" ] \
  || fallo "US-035 AC-2: los secretos del smoke no conservan el modo 0600"
for servicio_con_secretos in clinical-api rag-orchestrator; do
  [ "$(compose exec -T "$servicio_con_secretos" id -u)" = "$ONCOLENS_UID" ] \
    || fallo "US-035 AC-2: $servicio_con_secretos no corre con el uid dueño de los secretos"
done
bien "US-035 AC-2 con los secretos en 0600, clinical-api y rag-orchestrator corren con el uid que los posee y quedan healthy"

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

# US-041 AC-3: el catálogo clínico se monta de solo lectura en ambos backends; escribir en CLINICAL_CATALOG_PATH falla con
# EROFS (código de salida 7). Cada intento corre bajo `timeout 10` DENTRO del contenedor (un montaje colgado no cuelga el
# smoke; si vence sale 124 y falla). Si el montaje resultara rw, se borra el archivo de prueba antes de fallar, para no
# dejar `escritura-de-prueba` en packages/clinical-catalogs del host. La salida no nombra la ruta.
catalogo_es_de_solo_lectura() {
  local servicio="$1"
  shift
  local codigo=0
  compose exec -T "$servicio" timeout 10 "$@" >/dev/null 2>&1 || codigo=$?
  if [ "$codigo" = "0" ]; then
    compose exec -T "$servicio" sh -c 'rm -f "$CLINICAL_CATALOG_PATH/escritura-de-prueba"' >/dev/null 2>&1 || true
    fallo "US-041 AC-3: $servicio pudo escribir en el catálogo montado"
  fi
  [ "$codigo" = "7" ] || fallo "US-041 AC-3: la escritura de $servicio en el catálogo no falló por solo lectura (EROFS); salida $codigo"
}
catalogo_es_de_solo_lectura clinical-api node -e "try{require('fs').writeFileSync(require('path').join(process.env.CLINICAL_CATALOG_PATH,'escritura-de-prueba'),'x');process.exit(0)}catch(e){process.exit(e.code==='EROFS'?7:1)}"
catalogo_es_de_solo_lectura rag-orchestrator python -c "import errno,os,sys
try:
    open(os.path.join(os.environ['CLINICAL_CATALOG_PATH'], 'escritura-de-prueba'), 'w')
except OSError as e:
    sys.exit(7 if e.errno == errno.EROFS else 1)
sys.exit(0)"
bien "US-041 AC-3 el catálogo clínico es de solo lectura en clinical-api y rag-orchestrator"

# AC-6: cada pregunta de fixture devuelve su ejemplo; una pregunta que no es de fixture devuelve "sin evidencia".
# US-054: /rag/query exige el JWT de servicio ES256. Se firma DENTRO del contenedor clinical-api con el código
# compilado real (clave y TTL de su configuración, reloj del sistema, transporte createRagOrchestratorFetch):
# el smoke no reimplementa el firmador y el token nunca sale del contenedor ni viaja como argumento.
consulta='const D="./dist/apps/clinical-api/src";let c="";process.stdin.on("data",d=>c+=d).on("end",async()=>{const base="http://rag-orchestrator:8000";let f=fetch;if(process.argv[1]==="firmado"){const {readServiceJwtConfig}=await import(D+"/config/index.js");const j=await import(D+"/infrastructure/service-jwt.js");const h=await import(D+"/infrastructure/rag-orchestrator.http.js");const cfg=readServiceJwtConfig(process.env);const signer=j.createServiceTokenSigner({privateKey:await j.loadServicePrivateKey(cfg.privateKeyFile),clock:{now:()=>new Date()},ttlSeconds:cfg.ttlSeconds});f=h.createRagOrchestratorFetch({baseUrl:base,signer})}const r=await f(base+"/rag/query",{method:"POST",headers:{"content-type":"application/json"},body:c});console.log(r.status+" "+await r.text())})'
# Consulta /rag/query desde clinical-api con el cuerpo de stdin: "firmado" usa el firmador real, "sin-jwt" no envía token.
# Imprime "<status> <cuerpo>".
consultar_rag_con() { en_node clinical-api "$consulta" "$1"; }
consultar_rag() { consultar_rag_con firmado; }

# Éxito si "<status> <cuerpo>" es 200 y el cuerpo es idéntico al ejemplo de contracts/examples/.
es_respuesta_200_igual_a() {
  node -e "
const [estado, ...resto] = process.argv[1].split(' ');
require('assert').strictEqual(estado, '200');
require('assert').deepStrictEqual(JSON.parse(resto.join(' ')), require('$raiz/contracts/examples/' + process.argv[2]));
" "$1" "$2"
}

# El 409 de versión de catálogo (US-041) se aplica también al modo fake: los ejemplos de petición llevan catalogVersion
# "2026.10.0" y el catálogo montado es otro. El smoke sustituye SOLO ese campo por la versión del manifest.json montado
# (la misma fuente que lee rag-orchestrator); el ejemplo del contrato no cambia y el 409 no se relaja.
peticion_con_catalogo_montado() {
  node -e "
const fs = require('fs');
const manifiesto = JSON.parse(fs.readFileSync('$raiz/packages/clinical-catalogs/manifest.json', 'utf8'));
const cuerpo = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
cuerpo.catalogVersion = manifiesto.version;
process.stdout.write(JSON.stringify(cuerpo));
" "$1"
}

pares="$(node -e "
const i=require('$raiz/contracts/examples/index.json').examples;
for (const e of i.filter(e=>e.target==='#/components/schemas/RagQueryInternalResponse')) console.log(e.request+' '+e.file);
")"
while read -r peticion respuesta; do
  salida="$(peticion_con_catalogo_montado "$raiz/contracts/examples/$peticion" | consultar_rag)"
  es_respuesta_200_igual_a "$salida" "$respuesta" || fallo "AC-6: $peticion no devolvió $respuesta"
  bien "AC-6 $peticion devuelve $respuesta"
done <<< "$pares"
ajena="$(peticion_con_catalogo_montado "$raiz/contracts/examples/rag-query-request.json" | node -e "let c='';process.stdin.on('data',d=>c+=d).on('end',()=>{const b=JSON.parse(c);b.query='Pregunta que no es de fixture';console.log(JSON.stringify(b))})")"
salida="$(printf '%s' "$ajena" | consultar_rag)"
es_respuesta_200_igual_a "$salida" rag-query-sin-evidencia.json || fallo "AC-6: una pregunta que no es de fixture no devolvió sin evidencia"
bien "AC-6 una pregunta que no es de fixture devuelve sin evidencia"
# US-054 AC-1: las consultas de arriba (200 idéntico al ejemplo) ya van con el token del firmador real.
bien "US-054 AC-1 un token firmado por el firmador real de clinical-api devuelve 200"
# US-054 AC-2: sin JWT de servicio, /rag/query responde 401 con el cuerpo del contrato (y sin invocar al LLM).
salida="$(peticion_con_catalogo_montado "$raiz/contracts/examples/rag-query-request.json" | consultar_rag_con sin-jwt)"
case "$salida" in
  401*TOKEN_SERVICIO_INVALIDO*) ;;
  *) fallo "US-054: /rag/query sin JWT de servicio respondió: $salida" ;;
esac
bien "US-054 /rag/query sin JWT de servicio responde 401 TOKEN_SERVICIO_INVALIDO"

# ---------- fase 2b: PostgreSQL con TLS y roles (US-035 AC-4) ----------
imagen_postgres="$(compose config --format json | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).services.postgres.image)")"
base_clinica="${POSTGRES_DB:-oncolens}"

# psql efímero en una red del proyecto: la contraseña llega por archivo montado, nunca por argumento ni entorno del host.
# Uso: psql_desde <red> <rol> <archivo-de-contraseña> <sslmode> <base> <sql>
proyecto_de_red="$proyecto"
psql_desde() {
  docker run --rm --network "${proyecto_de_red}_$1" -v "$3:/contrasena:ro" "$imagen_postgres" \
    sh -c 'PGPASSWORD="$(cat /contrasena)" PGCONNECT_TIMEOUT=10 psql -v ON_ERROR_STOP=1 -tA "host=postgres user=$1 dbname=$2 sslmode=$3" -c "$4"' _ "$2" "$5" "$4" "$6"
}
# Éxito si la consulta falla y su salida contiene el texto esperado.
debe_fallar_con() {
  local texto="$1"; shift
  local resultado
  if resultado="$("$@" 2>&1)"; then fallo "debía fallar y funcionó: ${*:2:3}"; fi
  case "$resultado" in *"$texto"*) ;; *) fallo "debía fallar con '$texto' y respondió: $resultado" ;; esac
}

debe_fallar_con "pg_hba.conf" psql_desde clinical-net clinical_api "$secretos/pg_clinical_api_password" disable "$base_clinica" 'SELECT 1'
bien "US-035 AC-4 con sslmode=disable la conexión se rechaza por pg_hba.conf"
[ "$(psql_desde clinical-net clinical_api "$secretos/pg_clinical_api_password" require "$base_clinica" 'SHOW ssl')" = on ] \
  || fallo "US-035 AC-4: con sslmode=require SHOW ssl no devolvió on"
bien "US-035 AC-4 con sslmode=require funciona y SHOW ssl devuelve on"

debe_fallar_con "pg_hba.conf" psql_desde clinical-net postgres "$secretos/pg_superuser_password" require "$base_clinica" 'SELECT 1'
[ "$(compose exec -T -u postgres postgres psql -U postgres -tAc 'SELECT 1')" = 1 ] || fallo "US-035 AC-4: postgres no entra por local peer"
bien "US-035 AC-4 postgres se rechaza por red y entra por local peer"

# El schema clinical lo crea la migración de L1D-168; aquí se simula para comprobar el aislamiento del rol de migraciones.
compose exec -T -u postgres postgres psql -v ON_ERROR_STOP=1 -U postgres -d "$base_clinica" -qc 'CREATE SCHEMA IF NOT EXISTS clinical AUTHORIZATION clinical_api' >/dev/null
psql_desde clinical-net clinical_api "$secretos/pg_clinical_api_password" require "$base_clinica" 'CREATE TABLE clinical.smoke_t(id int)' >/dev/null
# US-040: una tabla creada por clinical_api no es legible por los roles del corpus (consulta del catálogo como superusuario).
[ "$(compose exec -T -u postgres postgres psql -U postgres -d "$base_clinica" -tAc "SELECT has_table_privilege('rag_corpus', 'clinical.smoke_t', 'SELECT') OR has_table_privilege('rag_corpus_migrator', 'clinical.smoke_t', 'SELECT')")" = f ] \
  || fallo "US-040: una tabla creada por clinical_api es legible por rag_corpus o rag_corpus_migrator"
migrator="$secretos/pg_rag_corpus_migrator_password"
psql_desde corpus-db-net rag_corpus_migrator "$migrator" require "$base_clinica" 'CREATE TABLE corpus.smoke_t(id int); DROP TABLE corpus.smoke_t' >/dev/null \
  || fallo "US-035 AC-4: rag_corpus_migrator no pudo crear en corpus"
debe_fallar_con "permission denied" psql_desde corpus-db-net rag_corpus_migrator "$migrator" require "$base_clinica" 'CREATE TABLE clinical.smoke_t2(id int)'
debe_fallar_con "permission denied" psql_desde corpus-db-net rag_corpus_migrator "$migrator" require "$base_clinica" 'SELECT * FROM clinical.smoke_t'
debe_fallar_con "pg_hba.conf" psql_desde clinical-net rag_corpus_migrator "$migrator" require "$base_clinica" 'SELECT 1'
bien "US-035 AC-4 rag_corpus_migrator crea en corpus, recibe permission denied en clinical y no entra desde clinical-net"
debe_fallar_con "permission denied" psql_desde corpus-db-net rag_corpus "$secretos/pg_rag_corpus_password" require "$base_clinica" 'CREATE TABLE corpus.smoke_t(id int)'
bien "US-035 AC-4 rag_corpus no puede crear en corpus"

# US-040 AC-4 (SEG-06): rag_corpus solo entra desde corpus-db-net, con TLS y SCRAM. Desde clinical-net (aun con TLS) y
# sin TLS lo rechaza pg_hba.conf; el superusuario comprueba que su contraseña está almacenada como SCRAM.
rag_corpus_clave="$secretos/pg_rag_corpus_password"
debe_fallar_con "pg_hba.conf" psql_desde clinical-net rag_corpus "$rag_corpus_clave" require "$base_clinica" 'SELECT 1'
debe_fallar_con "pg_hba.conf" psql_desde corpus-db-net rag_corpus "$rag_corpus_clave" disable "$base_clinica" 'SELECT 1'
[ "$(psql_desde corpus-db-net rag_corpus "$rag_corpus_clave" require "$base_clinica" 'SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')" = t ] \
  || fallo "US-040 AC-4: rag_corpus desde corpus-db-net con sslmode=require no quedó con TLS"
[ "$(compose exec -T -u postgres postgres psql -U postgres -tAc "SELECT left(rolpassword, 14) FROM pg_authid WHERE rolname = 'rag_corpus'")" = 'SCRAM-SHA-256$' ] \
  || fallo "US-040 AC-4: la contraseña de rag_corpus no está almacenada como SCRAM-SHA-256"
bien "US-040 AC-4 rag_corpus se rechaza desde clinical-net y sin TLS y se acepta desde corpus-db-net con TLS y SCRAM"

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
# /health responde 200 y status ok; configKeys y serviceVersion (US-037) no se comparan: varían con la configuración.
case "$salida" in
  '200 {"status":"ok"'*) ;;
  *) fallo "AC-4: clinical-api dejó de responder 200 con el LLM caído: $salida" ;;
esac
bien "AC-4 clinical-api sigue respondiendo 200"

# ---------- fase 4: sin la clave AES clinical-api no queda healthy (US-035 AC-5) ----------
sin_clave="$temporal/sin-clave-aes.yml"
printf 'services:\n  clinical-api:\n    environment:\n      IDENTITY_AES_KEY_FILE: /run/secrets/identity_aes_key_sin_montar\n' >"$sin_clave"
docker compose -p "$proyecto" "${archivos[@]}" -f "$sin_clave" up -d --no-build --no-deps --force-recreate clinical-api >"$log" 2>&1 \
  || fallo "US-035 AC-5: no se pudo recrear clinical-api con la clave AES sin montar"
estado=""
for _ in $(seq 1 30); do
  estado="$(compose ps -a --format '{{.Service}}={{.State}}' | grep '^clinical-api=' || true)"
  [ "$estado" = "clinical-api=running" ] || break
  sleep 2
done
[ "$estado" = "clinical-api=exited" ] || fallo "US-035 AC-5: clinical-api debía terminar sin la clave AES y está: $estado"
case "$(estado_de)" in *clinical-api=healthy*) fallo "US-035 AC-5: clinical-api figura healthy sin la clave AES" ;; esac
if get_desde web http://clinical-api:3000/health >/dev/null 2>&1; then fallo "US-035 AC-5: /health respondió sin la clave AES"; fi
registro="$(compose logs --no-log-prefix clinical-api 2>&1)"
case "$registro" in *IDENTITY_AES_KEY_FILE*) ;; *) fallo "US-035 AC-5: el log no nombra IDENTITY_AES_KEY_FILE: $registro" ;; esac
case "$registro" in *"$(cat "$secretos/identity_aes_key")"*) fallo "US-035 AC-5: el log contiene el valor de la clave AES" ;; esac
bien "US-035 AC-5 sin la clave AES clinical-api no queda healthy y el log nombra IDENTITY_AES_KEY_FILE sin ningún valor"

# ---------- fase 5: perfil test/CI (US-035 AC-1, AC-4) ----------
# Las subredes de los dos proyectos coinciden: se libera el stack normal antes de levantar solo postgres con el perfil test.
compose down -v --remove-orphans >"$log" 2>&1 || fallo "no se pudo bajar el stack antes del perfil test"
secretos_test="$temporal/secretos-test"
ONCOLENS_SECRETS_DIR="$secretos_test" "$raiz/scripts/setup-secrets.sh" --profile test >/dev/null
proyecto_test="$proyecto-test"
compose_test() {
  ONCOLENS_SECRETS_DIR="$secretos_test" docker compose -p "$proyecto_test" -f "$raiz/infra/docker/docker-compose.yml" -f "$raiz/infra/docker/docker-compose.test.yml" "$@"
}
compose_test up -d --no-build --wait --wait-timeout "$espera" postgres >"$log" 2>&1 || fallo "postgres con el perfil test no quedó healthy"
proyecto_de_red="$proyecto_test"
arnes="$secretos_test/pg_test_admin_password"
psql_desde clinical-net oncolens_test_admin "$arnes" require postgres 'CREATE DATABASE oltest_smoke' >/dev/null \
  || fallo "US-035 AC-1: oncolens_test_admin no pudo crear una base con el prefijo de test"
[ "$(psql_desde clinical-net oncolens_test_admin "$arnes" require oltest_smoke 'SELECT 1')" = 1 ] \
  || fallo "US-035 AC-1: oncolens_test_admin no entra a la base con el prefijo de test"
debe_fallar_con "pg_hba.conf" psql_desde clinical-net oncolens_test_admin "$arnes" require "$base_clinica" 'SELECT 1'
debe_fallar_con "permission denied" psql_desde clinical-net oncolens_test_admin "$arnes" require postgres 'CREATE ROLE rol_de_prueba'
psql_desde clinical-net oncolens_test_admin "$arnes" require postgres 'DROP DATABASE oltest_smoke' >/dev/null \
  || fallo "US-035 AC-1: oncolens_test_admin no pudo borrar su base de test"
debe_fallar_con "pg_hba.conf" psql_desde clinical-net postgres "$secretos_test/pg_superuser_password" require "$base_clinica" 'SELECT 1'
bien "US-035 AC-1 el perfil test crea y borra bases con el prefijo, no entra a la base clínica y postgres sigue sin entrar por red"

# ---------- fase 6: un fallo del init de roles no filtra contraseñas al log (US-035 AC-1) ----------
compose_test down -v --remove-orphans >"$log" 2>&1 || fallo "no se pudo bajar postgres del perfil test"
# Proyecto propio también aquí (D4-18): la fase 6 crea y destruye postgres seis veces.
proyecto="$proyecto_base-f6"
proyectos+=("$proyecto")
# Un límite numérico pero fuera de rango falla dentro de la sentencia que lleva la contraseña; uno no numérico lo
# rechaza el shell antes de llamar a psql. En ninguno de los dos casos el log de postgres puede contener un secreto.
for ajuste in PG_RAG_CORPUS_CONNECTION_LIMIT=99999999999 PG_RAG_CORPUS_CONNECTION_LIMIT=abc PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS=99999999999 PG_RAG_CORPUS_STATEMENT_TIMEOUT_MS=abc PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS=99999999999 PG_RAG_CORPUS_IDLE_TX_TIMEOUT_MS=abc; do
  variable="${ajuste%%=*}"
  export "$ajuste"
  compose up -d --no-build postgres >"$log" 2>&1 || fallo "no se pudo crear postgres con $ajuste"
  unset "$variable"
  estado=""
  for _ in $(seq 1 60); do
    estado="$(compose ps -a --format '{{.State}}' postgres)"
    [ "$estado" = running ] || break
    sleep 2
  done
  [ "$estado" = exited ] || fallo "US-035 AC-1: postgres debía fallar con $ajuste y está: $estado"
  registro="$(compose logs --no-log-prefix postgres 2>&1)"
  case "$registro" in *ERROR*|*"$variable"*) ;; *) fallo "US-035 AC-1: el log no muestra el fallo del init con $ajuste" ;; esac
  for archivo in "$secretos"/pg_*_password; do
    case "$registro" in *"$(cat "$archivo")"*) fallo "US-035 AC-1: el log de postgres contiene $(basename "$archivo") tras el fallo con $ajuste" ;; esac
  done
  compose down -v --remove-orphans >"$log" 2>&1 || fallo "no se pudo bajar postgres tras $ajuste"
done
bien "US-035 AC-1 un fallo del init de roles (límite de conexiones o timeouts fuera de rango o no numéricos, US-040) no deja ninguna contraseña en el log de postgres"

echo "smoke:compose en verde"
