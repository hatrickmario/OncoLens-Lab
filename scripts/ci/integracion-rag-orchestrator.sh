#!/usr/bin/env bash
# Job `integration-rag` de la CI (L1D-277, ARR-01 AC-2 y AC-3): `pytest -m servicios_reales` de rag-orchestrator contra el
# PostgreSQL de test y el Milvus de test del Compose. Pytest corre en un contenedor unido a corpus-db-net y ai-net
# (servicio `rag-pruebas` de infra/docker/docker-compose.test.yml, perfil `integracion-rag`): ningún servicio publica
# puerto al host y se usa el rol `rag_corpus` real (design D1).
#
#   scripts/ci/integracion-rag-orchestrator.sh
#
# Genera secretos ficticios en un directorio temporal (nada se versiona, RN-14) y los borra al terminar. El contenedor
# de Pytest recibe solo los secretos de SECRETOS_DEL_CONTENEDOR_DE_PRUEBAS y nada de clinical (design D1b, RN-10): el
# script lo comprueba dentro del contenedor antes de correr Pytest. Sin reintentos: un test que falla deja el job en rojo.
# Variables (RN-22): INTEGRACION_RAG_ESPERA_SEGUNDOS (espera de salud de postgres y Milvus), INTEGRACION_RAG_PYTEST_SEGUNDOS
# (tope de Pytest, si el sistema tiene `timeout`), PG_TEST_DB_PREFIX. El proyecto de Compose (oncolens-ci-rag) y el directorio de
# secretos (mktemp -d) son fijos y propios: ONCOLENS_SECRETS_DIR y COMPOSE_PROJECT_NAME del entorno se ignoran, de modo que el
# `down -v` y el `rm -rf` del final nunca alcanzan un directorio ni un stack ajenos.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$raiz"

readonly SERVICIO_DE_PRUEBAS="rag-pruebas"
readonly PERFIL="integracion-rag"
readonly SECRETOS_DEL_CONTENEDOR_DE_PRUEBAS=(pg_test_admin_password pg_rag_corpus_password pg_rag_corpus_migrator_password)
# Nada de lo clínico entra al contenedor: ni en el entorno ni en el árbol que ve (design D1b).
readonly PATRON_ENTORNO_CLINICO='CLINICAL|IDENTITY|BLIND_INDEX|AES|HMAC|JWT_PRIVATE|MINIO|SEED_|PG_SUPERUSER|PG_CLINICAL|PG_RESEARCH'
# Lo único del repositorio que leen los tests (rutas versionadas). Todo lo demás, incluidos los secretos y el .env locales, no existe en el contenedor.
readonly RUTAS_QUE_LEEN_LOS_TESTS=(
  package.json readme.md config contracts scripts/contracts scripts/ci/pytest_plugins packages/clinical-catalogs
  data/raw/seed docs/architecture/data-model.md infra/docker/postgres/sql
  apps/rag-orchestrator apps/clinical-api/openapi.yaml
)
# AC de US-058 y US-059 que no tenían ejecución (ARR-01 AC-3): el job falla si alguno no queda en verde.
readonly ACS_REQUERIDOS=(US-058:1 US-058:3 US-058:4 US-059:1 US-059:3 US-059:4 US-059:5)

espera_segundos="${INTEGRACION_RAG_ESPERA_SEGUNDOS:-420}"
pytest_segundos="${INTEGRACION_RAG_PYTEST_SEGUNDOS:-1500}"

fallar() { echo "integracion-rag: $*" >&2; exit 1; }

command -v docker > /dev/null || fallar "falta docker"
command -v node > /dev/null || fallar "falta node (empaqueta el spec y resume los AC)"
[ -d "$raiz/node_modules" ] || fallar "faltan node_modules en la raíz: corre npm ci antes (los tests empaquetan el spec con ellos)"

# Proyecto y directorio de secretos PROPIOS: nunca se leen del entorno, para que `limpiar` (down -v y rm -rf) solo borre lo que creó este script.
export COMPOSE_PROJECT_NAME="oncolens-ci-rag"
export ONCOLENS_SECRETS_DIR="$(mktemp -d)"
export MODEL_PROVIDER=fake
export MODEL_HOST_DIR="$(mktemp -d)"
export APP_ENV=test
export ONCOLENS_UID="$(id -u)" ONCOLENS_GID="$(id -g)"
export RAG_PRUEBAS_REPO_DIR="$(mktemp -d)"
export RAG_PRUEBAS_RESULTADOS_DIR="$(mktemp -d)"
export RAG_PRUEBAS_NODE_MODULES_DIR="$raiz/node_modules"

readonly ARCHIVOS_DE_COMPOSE=(--profile "$PERFIL" -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml)

compose() {
  docker compose "${ARCHIVOS_DE_COMPOSE[@]}" "$@"
}

limpiar() {
  compose down -v --remove-orphans > /dev/null 2>&1 || true
  rm -rf "$ONCOLENS_SECRETS_DIR" "$MODEL_HOST_DIR" "$RAG_PRUEBAS_REPO_DIR" "$RAG_PRUEBAS_RESULTADOS_DIR"
}
trap limpiar EXIT

# Copia solo los archivos versionados que leen los tests a un directorio temporal de solo lectura. Los nuevos sin versionar no
# se copian (podrían ser secretos o datos locales): se avisa por nombre de archivo.
preparar_arbol_de_pruebas() {
  local sin_versionar
  sin_versionar="$(git ls-files --others --exclude-standard -- "${RUTAS_QUE_LEEN_LOS_TESTS[@]}")"
  [ -z "$sin_versionar" ] || echo "integracion-rag: archivos sin versionar que NO se copian al contenedor: $(printf '%s' "$sin_versionar" | tr '\n' ' ')" >&2
  git ls-files -z --cached -- "${RUTAS_QUE_LEEN_LOS_TESTS[@]}" \
    | tar --null -T - -cf - | tar -xf - -C "$RAG_PRUEBAS_REPO_DIR"
  mkdir "$RAG_PRUEBAS_REPO_DIR/node_modules"
  # Lo monta el contenedor sin permisos de escritura; el uid del runner es el mismo con el que corre Pytest.
  chmod -R a+rX "$RAG_PRUEBAS_REPO_DIR"
}

# Servicios de los que depende el contenedor de Pytest, leídos del Compose de test (no se repite la lista aquí).
servicios_de_los_que_depende_pytest() {
  compose config --format json | node -e '
    const compose = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const servicio = compose.services[process.argv[1]];
    if (!servicio) { console.error(`el Compose de test no define ${process.argv[1]}`); process.exit(1); }
    console.log(Object.keys(servicio.depends_on ?? {}).join("\n"));
  ' "$SERVICIO_DE_PRUEBAS"
}

# Si algo no queda sano en el tiempo máximo, el job falla nombrando el servicio (nunca se ejecuta Pytest con tests omitidos).
levantar_servicios_reales() {
  local servicios=() servicio estado
  while IFS= read -r servicio; do servicios+=("$servicio"); done < <(servicios_de_los_que_depende_pytest)
  [ "${#servicios[@]}" -gt 0 ] || fallar "$SERVICIO_DE_PRUEBAS no declara servicios de los que depende"
  if ! compose up -d --wait --wait-timeout "$espera_segundos" --no-build "${servicios[@]}" > /dev/null; then
    for servicio in "${servicios[@]}" milvus-etcd milvus-minio; do
      estado="$(compose ps --all --format '{{.Service}} {{.Health}} {{.State}}' "$servicio" 2> /dev/null || true)"
      case "$estado" in *" healthy "*) ;; *) echo "integracion-rag: servicio sin salud: ${estado:-$servicio (sin estado)}" >&2 ;; esac
    done
    fallar "los servicios reales no quedaron sanos en ${espera_segundos}s (${servicios[*]})"
  fi
}

# Comprobación REAL (no solo del archivo): dentro del contenedor, los secretos montados son exactamente los permitidos, el
# entorno no tiene variables clínicas y el árbol que ve no contiene secretos ni .env (design D1b).
verificar_que_pytest_no_ve_nada_de_clinical() {
  local salida montados esperados entorno arbol
  salida="$(compose run --rm --no-deps --entrypoint sh "$SERVICIO_DE_PRUEBAS" -c \
    'ls -1 /run/secrets; echo "--entorno--"; env | cut -d= -f1; echo "--arbol--"; find /repo -path /repo/node_modules -prune -o \( -name "*.pem" -o -name "*.key" -o -name "*.crt" -o -name "*_password" -o -name "*_key" -o -name "pg_hba*" -o -name ".env*" -o -name secrets \) -print')" \
    || fallar "no se pudo inspeccionar el contenedor de Pytest"
  montados="$(printf '%s\n' "$salida" | sed '/^--entorno--$/,$d' | sort)"
  esperados="$(printf '%s\n' "${SECRETOS_DEL_CONTENEDOR_DE_PRUEBAS[@]}" | sort)"
  [ "$montados" = "$esperados" ] || fallar "el contenedor de Pytest monta secretos distintos de los permitidos: $(printf '%s' "$montados" | tr '\n' ' ')"
  entorno="$(printf '%s\n' "$salida" | sed -n '/^--entorno--$/,/^--arbol--$/p' | grep -E "$PATRON_ENTORNO_CLINICO" || true)"
  [ -z "$entorno" ] || fallar "el contenedor de Pytest tiene variables de entorno clínicas: $(printf '%s' "$entorno" | tr '\n' ' ')"
  arbol="$(printf '%s\n' "$salida" | sed -n '/^--arbol--$/,$p' | sed '1d' | grep -v '\.env\.example$' || true)"
  [ -z "$arbol" ] || fallar "el árbol que ve el contenedor de Pytest contiene secretos o .env: $(printf '%s' "$arbol" | tr '\n' ' ')"
  echo "integracion-rag: el contenedor de Pytest solo monta ${SECRETOS_DEL_CONTENEDOR_DE_PRUEBAS[*]} y no ve nada de clinical"
}

correr_pytest() {
  local limite=()
  if command -v timeout > /dev/null; then limite=(timeout "$pytest_segundos"); else echo "integracion-rag: sin 'timeout' en el sistema; el tope lo pone el job" >&2; fi
  # `timeout` no ejecuta funciones de bash: la llamada completa a docker compose se repite aquí con las mismas opciones.
  ${limite[@]+"${limite[@]}"} docker compose "${ARCHIVOS_DE_COMPOSE[@]}" run --rm --no-deps "$SERVICIO_DE_PRUEBAS"
}

scripts/setup-secrets.sh --profile test
preparar_arbol_de_pruebas
compose build "$SERVICIO_DE_PRUEBAS"
levantar_servicios_reales
verificar_que_pytest_no_ve_nada_de_clinical

codigo=0
correr_pytest || codigo=$?
[ -f "$RAG_PRUEBAS_RESULTADOS_DIR/resumen-ac.json" ] || fallar "Pytest no dejó el resumen por AC (terminó antes de ejecutar los tests)"
node scripts/ci/verificar-acs-rag.mjs "$RAG_PRUEBAS_RESULTADOS_DIR/resumen-ac.json" "${ACS_REQUERIDOS[@]}" || codigo=$?
[ "$codigo" -eq 0 ] || fallar "falló (código $codigo); ver la salida de Pytest arriba"
echo "integracion-rag: OK (Pytest y los AC requeridos en verde)"
