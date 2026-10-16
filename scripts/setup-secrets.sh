#!/usr/bin/env bash
# Genera los secretos del stack local (US-035, readme §1.4 paso 2). Solo bash y openssl.
#
#   scripts/setup-secrets.sh [--profile test] [--rotate <nombre>]...
#
# Destino: ${ONCOLENS_SECRETS_DIR} o infra/docker/secrets/ (ignorado por git). Nada de lo generado se versiona (RN-14).
# Idempotente: sin --rotate no sobrescribe nada y lo informa. Nunca imprime un valor; solo nombres y estados.
# Qué recibe cada servicio, respaldo y rotación: docs/operations/claves.md.
set -euo pipefail
umask 077

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=lib/pg-test-prefix.sh
source "$raiz/scripts/lib/pg-test-prefix.sh"
# shellcheck source=lib/catalogo-secretos.sh
source "$raiz/scripts/lib/catalogo-secretos.sh"

DOCUMENTO_DE_CLAVES="docs/operations/claves.md"
PLANTILLA_PG_HBA="$raiz/infra/docker/postgres/pg_hba.conf.template"
PLANTILLA_PG_HBA_TEST="$raiz/infra/docker/postgres/pg_hba.test.conf.template"
MARCA_REGLAS_TEST='# @REGLAS_PERFIL_TEST'

perfil=""
ROTAR=()
REEMITIR=() # derivados de una rotación: el certificado del servidor cuando se regenera la CA
destino=""
trabajo=""

fallar() { echo "setup-secrets: $*" >&2; exit 1; }

uso() {
  cat <<'USO'
Uso: scripts/setup-secrets.sh [--profile test] [--rotate <nombre>]...
  --profile test     añade pg_test_admin_password y pg_hba.test.conf (perfil test/CI)
  --rotate <nombre>  regenera solo ese archivo (y su pareja: par JWT o par TLS)
Variables: ONCOLENS_SECRETS_DIR; PG_TEST_DB_PREFIX, POSTGRES_DB, CLINICAL_NET_SUBNET, CORPUS_DB_NET_SUBNET,
PG_CA_VALID_DAYS, PG_CERT_VALID_DAYS (entorno, infra/docker/.env o infra/docker/.env.example).
USO
}

leer_argumentos() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --profile) [ $# -ge 2 ] || fallar "--profile necesita un valor"; perfil="$2"; shift 2 ;;
      --rotate) [ $# -ge 2 ] || fallar "--rotate necesita un nombre"; ROTAR+=("$2"); shift 2 ;;
      -h | --help) uso; exit 0 ;;
      *) uso >&2; fallar "argumento desconocido: $1" ;;
    esac
  done
  case "$perfil" in "" | test) ;; *) fallar "perfil desconocido: $perfil (solo existe: test)" ;; esac
}

# ---------- configuración (RN-22): entorno > infra/docker/.env > infra/docker/.env.example ----------

leer_configuracion() {
  local variable="$1" valor="" archivo
  if [ -n "${!variable:-}" ]; then
    printf '%s' "${!variable}"
    return
  fi
  for archivo in "$raiz/infra/docker/.env" "$raiz/infra/docker/.env.example"; do
    [ -f "$archivo" ] || continue
    valor="$(sed -n "s/^${variable}=//p" "$archivo" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/")"
    [ -n "$valor" ] && break
  done
  [ -n "$valor" ] || fallar "falta $variable (entorno, infra/docker/.env o infra/docker/.env.example)"
  printf '%s' "$valor"
}

exigir_formato() {
  local variable="$1" valor="$2" patron="$3"
  [[ "$valor" =~ $patron ]] || fallar "$variable no es válido: debe cumplir $patron"
}

cargar_configuracion() {
  POSTGRES_DB="$(leer_configuracion POSTGRES_DB)"
  CLINICAL_NET_SUBNET="$(leer_configuracion CLINICAL_NET_SUBNET)"
  CORPUS_DB_NET_SUBNET="$(leer_configuracion CORPUS_DB_NET_SUBNET)"
  PG_CA_VALID_DAYS="$(leer_configuracion PG_CA_VALID_DAYS)"
  PG_CERT_VALID_DAYS="$(leer_configuracion PG_CERT_VALID_DAYS)"
  PG_TEST_DB_PREFIX="$(leer_configuracion PG_TEST_DB_PREFIX)"

  # Estos valores acaban en pg_hba.conf: se validan para que ninguno pueda inyectar reglas.
  exigir_formato POSTGRES_DB "$POSTGRES_DB" '^[a-z][a-z0-9_]*$'
  exigir_formato CLINICAL_NET_SUBNET "$CLINICAL_NET_SUBNET" '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
  exigir_formato CORPUS_DB_NET_SUBNET "$CORPUS_DB_NET_SUBNET" '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$'
  exigir_formato PG_CA_VALID_DAYS "$PG_CA_VALID_DAYS" '^[0-9]+$'
  exigir_formato PG_CERT_VALID_DAYS "$PG_CERT_VALID_DAYS" '^[0-9]+$'
  validar_prefijo_test_db "$PG_TEST_DB_PREFIX" "$POSTGRES_DB" || exit 1
}

# ---------- comprobaciones previas: nada se escribe hasta que todas pasan ----------

comprobar_openssl() {
  command -v openssl >/dev/null 2>&1 || fallar "falta openssl (OpenSSL 3 o LibreSSL 3.3 o posterior)"
  local version; version="$(openssl version)"
  case "$version" in
    OpenSSL\ [3-9].*) ;;
    LibreSSL\ 3.[3-9]* | LibreSSL\ [4-9].*) ;;
    *) fallar "openssl no es compatible: $version (se necesita OpenSSL 3 o LibreSSL 3.3 o posterior)" ;;
  esac
}

archivos_conocidos() { archivos_del_catalogo "$perfil"; }

es_clave_de_identidad() {
  local nombre
  for nombre in "${CLAVES_DE_IDENTIDAD[@]}"; do [ "$nombre" = "$1" ] && return 0; done
  return 1
}

comprobar_rotaciones() {
  local pedido conocidos
  conocidos="$(archivos_conocidos)"
  for pedido in ${ROTAR[@]+"${ROTAR[@]}"}; do
    if es_clave_de_identidad "$pedido"; then
      fallar "$pedido no se rota: rotarla sin re-cifrar la identidad la pierde (OL-01). Ver $DOCUMENTO_DE_CLAVES"
    fi
    grep -qxF -- "$pedido" <<<"$conocidos" || fallar "no se puede rotar $pedido: no es un secreto de este perfil"
  done
}

comprobar_destino_no_versionado() {
  destino="$(cd "$destino" && pwd -P)"
  case "$destino/" in
    "$raiz"/*) ;;
    *) return 0 ;; # fuera del árbol del repositorio: no hay nada que versionar
  esac
  command -v git >/dev/null 2>&1 || fallar "falta git para comprobar que $destino está ignorado"
  if [ -n "$(git -C "$raiz" ls-files -- "$destino")" ]; then
    fallar "$destino contiene archivos versionados; los secretos nunca se versionan (RN-14)"
  fi
  git -C "$raiz" check-ignore -q -- "$destino/.secreto" || fallar "$destino está dentro del repositorio y no está en .gitignore (RN-14)"
}

preparar_destino() {
  destino="${ONCOLENS_SECRETS_DIR:-$raiz/infra/docker/secrets}"
  mkdir -p "$destino"
  chmod 700 "$destino"
  comprobar_destino_no_versionado
  trabajo="$(mktemp -d "$destino/.trabajo.XXXXXX")"
  trap 'rm -rf "$trabajo"' EXIT
}

# ---------- escritura idempotente ----------

esta_rotando() {
  local nombre
  for nombre in ${ROTAR[@]+"${ROTAR[@]}"} ${REEMITIR[@]+"${REEMITIR[@]}"}; do [ "$nombre" = "$1" ] && return 0; done
  return 1
}

fue_pedido_rotar() {
  local nombre
  for nombre in ${ROTAR[@]+"${ROTAR[@]}"}; do [ "$nombre" = "$1" ] && return 0; done
  return 1
}

# Éxito (y lo informa) si todos los archivos del grupo existen y ninguno se rota.
conservar_si_existen() {
  local nombre
  for nombre in "$@"; do
    if [ ! -e "$destino/$nombre" ] || esta_rotando "$nombre"; then return 1; fi
  done
  for nombre in "$@"; do echo "existe, sin cambios: $nombre"; done
}

informar_escritura() {
  local nombre
  for nombre in "$@"; do
    if fue_pedido_rotar "$nombre"; then echo "rotado: $nombre"; else echo "generado: $nombre"; fi
  done
}

# publicar <origen-en-trabajo> <nombre> <modo>
publicar() {
  chmod "$3" "$1"
  mv -f "$1" "$destino/$2"
}

# ---------- generadores (uno por tipo de secreto) ----------

clave_simetrica_de_32_bytes() { openssl rand -base64 32 | tr -d '\n'; }

# Base64 URL-safe sin relleno: válida dentro de una URL de conexión.
contrasena_aleatoria() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }

clave_privada_ec_p256() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1" 2>/dev/null; }

# generar_valor_aleatorio <nombre> <función-generadora>: un archivo de una línea con modo 0600.
generar_valor_aleatorio() {
  local nombre="$1" generador="$2"
  conservar_si_existen "$nombre" && return 0
  "$generador" >"$trabajo/$nombre"
  publicar "$trabajo/$nombre" "$nombre" 600
  informar_escritura "$nombre"
}

generar_par_jwt() {
  conservar_si_existen jwt_service_private.pem jwt_service_public.pem && return 0
  clave_privada_ec_p256 "$trabajo/jwt_private"
  openssl pkey -in "$trabajo/jwt_private" -pubout -out "$trabajo/jwt_public"
  publicar "$trabajo/jwt_private" jwt_service_private.pem 600
  publicar "$trabajo/jwt_public" jwt_service_public.pem 644
  informar_escritura jwt_service_private.pem jwt_service_public.pem
}

generar_autoridad_certificadora() {
  conservar_si_existen pg_ca.key pg_ca.crt && return 0
  clave_privada_ec_p256 "$trabajo/ca_key"
  openssl req -x509 -new -key "$trabajo/ca_key" -sha256 -days "$PG_CA_VALID_DAYS" \
    -subj "/CN=OncoLens PostgreSQL CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$trabajo/ca_crt"
  publicar "$trabajo/ca_key" pg_ca.key 600
  publicar "$trabajo/ca_crt" pg_ca.crt 644
  informar_escritura pg_ca.key pg_ca.crt
  # Un certificado firmado por la CA anterior ya no sirve: se reemite el del servidor.
  REEMITIR+=(pg_server.key)
}

generar_certificado_del_servidor() {
  conservar_si_existen pg_server.key pg_server.crt && return 0
  clave_privada_ec_p256 "$trabajo/server_key"
  openssl req -new -key "$trabajo/server_key" -subj "/CN=postgres" -out "$trabajo/server_csr"
  printf '%s\n' "subjectAltName=DNS:postgres" "basicConstraints=CA:FALSE" \
    "keyUsage=critical,digitalSignature" "extendedKeyUsage=serverAuth" >"$trabajo/server_ext"
  openssl x509 -req -in "$trabajo/server_csr" -CA "$destino/pg_ca.crt" -CAkey "$destino/pg_ca.key" \
    -set_serial "0x01$(openssl rand -hex 15)" -days "$PG_CERT_VALID_DAYS" -sha256 \
    -extfile "$trabajo/server_ext" -out "$trabajo/server_crt" 2>/dev/null
  publicar "$trabajo/server_key" pg_server.key 600
  publicar "$trabajo/server_crt" pg_server.crt 644
  informar_escritura pg_server.key pg_server.crt
}

# Sustituye los placeholders ${VARIABLE} de la entrada estándar con la configuración ya validada.
sustituir_configuracion() {
  local texto; texto="$(cat)"
  texto="${texto//'${POSTGRES_DB}'/$POSTGRES_DB}"
  texto="${texto//'${CLINICAL_NET_SUBNET}'/$CLINICAL_NET_SUBNET}"
  texto="${texto//'${CORPUS_DB_NET_SUBNET}'/$CORPUS_DB_NET_SUBNET}"
  texto="${texto//'${PG_TEST_DB_PREFIX}'/$PG_TEST_DB_PREFIX}"
  printf '%s\n' "$texto"
}

# Plantilla base con la marca de reglas del perfil test reemplazada por `$1` (archivo de reglas) o por nada.
plantilla_con_reglas() {
  local reglas="${1:-}" linea
  while IFS= read -r linea; do
    if [ "$linea" = "$MARCA_REGLAS_TEST" ]; then
      [ -z "$reglas" ] || cat "$reglas"
    else
      printf '%s\n' "$linea"
    fi
  done <"$PLANTILLA_PG_HBA"
}

generar_pg_hba() {
  local nombre="$1" reglas="${2:-}"
  conservar_si_existen "$nombre" && return 0
  plantilla_con_reglas "$reglas" | sustituir_configuracion >"$trabajo/$nombre"
  publicar "$trabajo/$nombre" "$nombre" 644
  informar_escritura "$nombre"
}

generar_secretos() {
  local nombre
  generar_par_jwt
  for nombre in "${CLAVES_DE_IDENTIDAD[@]}"; do generar_valor_aleatorio "$nombre" clave_simetrica_de_32_bytes; done
  for nombre in "${CONTRASENAS[@]}"; do generar_valor_aleatorio "$nombre" contrasena_aleatoria; done
  generar_autoridad_certificadora
  generar_certificado_del_servidor
  generar_pg_hba pg_hba.conf
  if [ "$perfil" = test ]; then
    for nombre in "${CONTRASENAS_PERFIL_TEST[@]}"; do generar_valor_aleatorio "$nombre" contrasena_aleatoria; done
    generar_pg_hba pg_hba.test.conf "$PLANTILLA_PG_HBA_TEST"
  fi
}

main() {
  leer_argumentos "$@"
  comprobar_openssl
  cargar_configuracion
  comprobar_rotaciones
  preparar_destino
  generar_secretos
}

main "$@"
