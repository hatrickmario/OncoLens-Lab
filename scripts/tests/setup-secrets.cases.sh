#!/usr/bin/env bash
# Casos de US-035 AC-1 y AC-3 sobre scripts/setup-secrets.sh. Corre DENTRO del contenedor efímero que lanza
# scripts/tests/setup-secrets.test.sh, con el clon limpio del repositorio montado en /repo. No usa secretos reales:
# todo lo que genera es aleatorio y desaparece con el contenedor.
set -uo pipefail

cd /repo
SECRETOS=infra/docker/secrets
SCRIPT=scripts/setup-secrets.sh
registro="$(mktemp)"
fallos=0

# ---------- utilidades de aserción (cada caso corre en un subshell: afirmar termina el caso) ----------

afirmar() {
  local descripcion="$1"; shift
  if ! "$@"; then
    echo "  no se cumple: $descripcion" >&2
    exit 1
  fi
}

no() { ! "$@"; }

restablecer() { rm -rf "$SECRETOS"; }

# Ejecuta el script y deja en $salida su salida combinada y en $codigo su código de salida.
ejecutar() {
  salida="$("$SCRIPT" "$@" 2>&1)"
  codigo=$?
}

archivos_de_secretos() { (cd "$SECRETOS" && ls -1A | sort); }

hash_de_cada_archivo() { (cd "$SECRETOS" && sha256sum -- * | sort); }

linea_de_reglas() { grep -E "$1" "$2" > /dev/null; }

# ---------- datos esperados ----------

DIECIOCHO="blind_index_hmac_key
clinical_minio_root_password
identity_aes_key
jwt_service_private.pem
jwt_service_public.pem
milvus_minio_root_password
pg_ca.crt
pg_ca.key
pg_clinical_api_password
pg_hba.conf
pg_rag_corpus_migrator_password
pg_rag_corpus_password
pg_research_writer_password
pg_server.crt
pg_server.key
pg_superuser_password
seed_admin_password
seed_doctor_password"

# ---------- casos ----------

caso_clon_limpio_genera_los_dieciocho() {
  restablecer
  afirmar "el clon no trae secretos" no test -e "$SECRETOS"
  ejecutar
  afirmar "el script termina con código 0 (código $codigo): $salida" test "$codigo" -eq 0
  afirmar "existen exactamente los dieciocho archivos" test "$(archivos_de_secretos)" = "$DIECIOCHO"

  afirmar "la privada del JWT es EC P-256" grep -q 'prime256v1' <(openssl pkey -in "$SECRETOS/jwt_service_private.pem" -text -noout)
  afirmar "la privada del JWT está en PKCS#8" grep -q 'BEGIN PRIVATE KEY' "$SECRETOS/jwt_service_private.pem"
  afirmar "la pública del JWT corresponde a la privada" test \
    "$(openssl pkey -in "$SECRETOS/jwt_service_private.pem" -pubout)" = "$(cat "$SECRETOS/jwt_service_public.pem")"
  afirmar "identity_aes_key decodifica a 32 bytes" test "$(base64 -d <"$SECRETOS/identity_aes_key" | wc -c | tr -d ' ')" = 32
  afirmar "blind_index_hmac_key decodifica a 32 bytes" test "$(base64 -d <"$SECRETOS/blind_index_hmac_key" | wc -c | tr -d ' ')" = 32

  afirmar "pg_server.crt está firmado por pg_ca.crt" openssl verify -CAfile "$SECRETOS/pg_ca.crt" "$SECRETOS/pg_server.crt"
  afirmar "pg_server.crt declara DNS:postgres en el SAN" grep -q 'DNS:postgres' <(openssl x509 -in "$SECRETOS/pg_server.crt" -noout -ext subjectAltName)

  local hba="$SECRETOS/pg_hba.conf"
  afirmar "regla hostssl de rag_corpus desde corpus-db-net" linea_de_reglas '^hostssl[[:space:]]+oncolens[[:space:]]+rag_corpus[[:space:]]+172\.28\.20\.0/24[[:space:]]+scram-sha-256' "$hba"
  afirmar "regla hostssl de rag_corpus_migrator desde corpus-db-net" linea_de_reglas '^hostssl[[:space:]]+oncolens[[:space:]]+rag_corpus_migrator[[:space:]]+172\.28\.20\.0/24[[:space:]]+scram-sha-256' "$hba"
  afirmar "ninguna regla de red admite a postgres" test -z "$(awk '$1 ~ /^host(ssl|nossl)?$/ && $3 ~ /(^|,)postgres(,|$)/ && $NF != "reject"' "$hba")"
  afirmar "postgres solo entra por local peer" linea_de_reglas '^local[[:space:]]+all[[:space:]]+postgres[[:space:]]+peer' "$hba"
  afirmar "pg_hba.conf no contiene el prefijo de test" no grep -q 'oltest_' "$hba"
  afirmar "pg_hba.conf rechaza antes cualquier conexión sin TLS" test \
    "$(grep -vE '^[[:space:]]*(#|$)' "$hba" | sed -n 3p | awk '{print $1, $NF}')" = 'hostnossl reject'

  afirmar "las privadas y contraseñas quedan con 0600" test -z "$(find "$SECRETOS" -type f \( -name '*password' -o -name '*_key' -o -name '*.key' -o -name 'jwt_service_private.pem' \) ! -perm 600)"
  afirmar "la pública del JWT y los certificados quedan con 0644" test -z "$(find "$SECRETOS" -type f \( -name 'jwt_service_public.pem' -o -name '*.crt' -o -name 'pg_hba.conf' \) ! -perm 644)"

  afirmar "git status queda vacío" test -z "$(git status --porcelain)"
}

caso_destino_versionado_aborta_sin_cambiar_permisos() {
  restablecer
  local versionado=/repo/scripts/lib
  local permisos lista
  permisos="$(stat -c %a "$versionado")"
  lista="$(ls -1A "$versionado")"
  salida="$(ONCOLENS_SECRETS_DIR="$versionado" "$SCRIPT" 2>&1)"
  codigo=$?
  afirmar "aborta con código distinto de 0" test "$codigo" -ne 0
  afirmar "el mensaje nombra RN-14" grep -q 'RN-14' <<<"$salida"
  afirmar "no cambia los permisos del directorio versionado" test "$(stat -c %a "$versionado")" = "$permisos"
  afirmar "no escribe ningún archivo en el directorio versionado" test "$(ls -1A "$versionado")" = "$lista"
  afirmar "el estado del repositorio queda vacío" test -z "$(git status --porcelain)"
}

caso_perfil_test_agrega_el_rol_del_arnes() {
  restablecer
  ejecutar --profile test
  afirmar "el script termina con código 0 (código $codigo): $salida" test "$codigo" -eq 0
  afirmar "existen los veinte archivos" test "$(archivos_de_secretos)" = "$(printf '%s\npg_hba.test.conf\npg_test_admin_password' "$DIECIOCHO" | sort)"

  local reglas="$SECRETOS/pg_hba.test.conf"
  afirmar "oncolens_test_admin solo entra a postgres y a las bases con el prefijo" test \
    "$(awk '$3 == "oncolens_test_admin" {print $2}' "$reglas" | sort -u | tr '\n' ' ')" = 'postgres,/^oltest_ '
  afirmar "rag_corpus y rag_corpus_migrator entran a /^oltest_ solo desde corpus-db-net" linea_de_reglas '^hostssl[[:space:]]+/\^oltest_[[:space:]]+rag_corpus,rag_corpus_migrator[[:space:]]+172\.28\.20\.0/24[[:space:]]+scram-sha-256' "$reglas"
  afirmar "las reglas del prefijo van antes del rechazo de rag_corpus*" test \
    "$(grep -nE '^hostssl[[:space:]]+/\^oltest_' "$reglas" | head -1 | cut -d: -f1)" -lt "$(grep -nE '^host[[:space:]]+all[[:space:]]+rag_corpus,rag_corpus_migrator' "$reglas" | cut -d: -f1)"
  afirmar "pg_hba.conf sigue sin el prefijo" no grep -q 'oltest_' "$SECRETOS/pg_hba.conf"
  afirmar "pg_hba.test.conf conserva el rechazo sin TLS" linea_de_reglas '^hostnossl[[:space:]]+all[[:space:]]+all[[:space:]]+all[[:space:]]+reject' "$reglas"
}

caso_prefijo_invalido_aborta_sin_escribir() {
  local prefijo
  for prefijo in '.*' 'Ab' '1abc'; do
    restablecer
    salida="$(PG_TEST_DB_PREFIX="$prefijo" "$SCRIPT" 2>&1)"
    codigo=$?
    afirmar "'$prefijo' aborta con código distinto de 0" test "$codigo" -ne 0
    afirmar "'$prefijo': el mensaje nombra la variable" grep -q 'PG_TEST_DB_PREFIX' <<<"$salida"
    afirmar "'$prefijo': el mensaje nombra el patrón" grep -qF '^[a-z][a-z0-9_]{2,}$' <<<"$salida"
    afirmar "'$prefijo': no se crea ningún archivo de secretos" no test -e "$SECRETOS"
  done
}

caso_prefijo_que_casa_con_base_reservada_aborta_sin_escribir() {
  local prefijo reservada
  for par in 'oncolens:oncolens' 'pos:postgres' 'template_:template'; do
    prefijo="${par%%:*}"
    reservada="${par##*:}"
    restablecer
    salida="$(PG_TEST_DB_PREFIX="$prefijo" "$SCRIPT" --profile test 2>&1)"
    codigo=$?
    afirmar "'$prefijo' aborta con código distinto de 0" test "$codigo" -ne 0
    afirmar "'$prefijo': el mensaje nombra la variable" grep -q 'PG_TEST_DB_PREFIX' <<<"$salida"
    afirmar "'$prefijo': el mensaje nombra la base ($reservada)" grep -q "$reservada" <<<"$salida"
    afirmar "'$prefijo': no se crea ningún archivo de secretos" no test -e "$SECRETOS"
  done
}

caso_salida_sin_valores() {
  restablecer
  ejecutar --profile test
  afirmar "el script termina con código 0" test "$codigo" -eq 0
  afirmar "la salida solo nombra archivos y estados" test -z "$(grep -vE '^(generado|existe, sin cambios): [A-Za-z0-9_.]+$' <<<"$salida")"
  local archivo linea
  for archivo in "$SECRETOS"/*; do
    while IFS= read -r linea; do
      [ ${#linea} -ge 8 ] || continue
      afirmar "la salida contiene una línea de $(basename "$archivo")" no grep -qF -- "$linea" <<<"$salida"
    done <"$archivo"
  done
}

caso_segunda_ejecucion_no_cambia_nada() {
  restablecer
  ejecutar
  afirmar "la primera ejecución termina con código 0" test "$codigo" -eq 0
  local antes; antes="$(hash_de_cada_archivo)"
  ejecutar
  afirmar "la segunda ejecución termina con código 0" test "$codigo" -eq 0
  afirmar "los hashes son idénticos" test "$(hash_de_cada_archivo)" = "$antes"
  afirmar "informa existe, sin cambios para cada uno de los dieciocho" test "$(grep -c '^existe, sin cambios: ' <<<"$salida")" -eq 18
  afirmar "no informa ningún archivo como generado" no grep -q '^generado: ' <<<"$salida"
}

caso_rotar_clave_de_identidad_se_rechaza() {
  restablecer
  ejecutar
  local antes nombre; antes="$(hash_de_cada_archivo)"
  for nombre in identity_aes_key blind_index_hmac_key; do
    ejecutar --rotate "$nombre"
    afirmar "rotar $nombre termina con código distinto de 0" test "$codigo" -ne 0
    afirmar "el mensaje de $nombre remite a docs/operations/claves.md" grep -q 'docs/operations/claves.md' <<<"$salida"
    afirmar "el hash de $nombre no cambia" test "$(hash_de_cada_archivo)" = "$antes"
  done
}

caso_rotar_el_certificado_del_servidor_cambia_solo_su_par() {
  restablecer
  ejecutar
  local antes_servidor despues_servidor; antes_servidor="$(sha256sum "$SECRETOS/pg_server.key" "$SECRETOS/pg_server.crt")"
  local resto_antes; resto_antes="$(hash_de_cada_archivo | grep -v ' pg_server\.')"
  ejecutar --rotate pg_server.key
  afirmar "rotar pg_server.key termina con código 0 (código $codigo): $salida" test "$codigo" -eq 0
  despues_servidor="$(sha256sum "$SECRETOS/pg_server.key" "$SECRETOS/pg_server.crt")"
  afirmar "el par del servidor cambia" test "$despues_servidor" != "$antes_servidor"
  afirmar "el resto de archivos no cambia" test "$(hash_de_cada_archivo | grep -v ' pg_server\.')" = "$resto_antes"
  afirmar "el certificado nuevo sigue firmado por la CA" openssl verify -CAfile "$SECRETOS/pg_ca.crt" "$SECRETOS/pg_server.crt"
}

caso_rotar_la_ca_reemite_el_certificado_del_servidor() {
  restablecer
  ejecutar
  local ca_antes servidor_antes resto_antes
  ca_antes="$(sha256sum "$SECRETOS/pg_ca.key" "$SECRETOS/pg_ca.crt")"
  servidor_antes="$(sha256sum "$SECRETOS/pg_server.key" "$SECRETOS/pg_server.crt")"
  resto_antes="$(hash_de_cada_archivo | grep -vE ' pg_(ca|server)\.')"
  ejecutar --rotate pg_ca.key
  afirmar "rotar pg_ca.key termina con código 0 (código $codigo): $salida" test "$codigo" -eq 0
  afirmar "la CA cambia" test "$(sha256sum "$SECRETOS/pg_ca.key" "$SECRETOS/pg_ca.crt")" != "$ca_antes"
  afirmar "el par del servidor se reemite" test "$(sha256sum "$SECRETOS/pg_server.key" "$SECRETOS/pg_server.crt")" != "$servidor_antes"
  afirmar "pg_server.crt está firmado por la CA nueva" openssl verify -CAfile "$SECRETOS/pg_ca.crt" "$SECRETOS/pg_server.crt"
  afirmar "el resto de archivos no cambia" test "$(hash_de_cada_archivo | grep -vE ' pg_(ca|server)\.')" = "$resto_antes"
}

# ---------- ejecución ----------

correr() {
  local nombre="$1" funcion="$2"
  if ( "$funcion" ) >"$registro" 2>&1; then
    echo "ok     $nombre"
  else
    echo "FALLO  $nombre"
    sed 's/^/       /' "$registro"
    fallos=$((fallos + 1))
  fi
}

if [ ! -x "$SCRIPT" ]; then
  echo "FALLO  scripts/setup-secrets.sh no existe o no es ejecutable en el clon"
  fallos=1
fi

if [ "$fallos" -eq 0 ]; then
  correr "un clon limpio genera los dieciocho secretos (incluidos pg_rag_corpus_migrator_password, seed_doctor_password y seed_admin_password), pg_hba.conf no admite a postgres por red ni tiene el prefijo de test y git status queda vacío [US-035 AC-1]" caso_clon_limpio_genera_los_dieciocho
  correr "un ONCOLENS_SECRETS_DIR versionado aborta sin cambiar permisos ni escribir [US-035 AC-1]" caso_destino_versionado_aborta_sin_cambiar_permisos
  correr "con --profile test se generan además pg_test_admin_password y pg_hba.test.conf con las reglas del prefijo [US-035 AC-1]" caso_perfil_test_agrega_el_rol_del_arnes
  correr "un PG_TEST_DB_PREFIX inválido aborta sin escribir ningún archivo [US-035 AC-1]" caso_prefijo_invalido_aborta_sin_escribir
  correr "un PG_TEST_DB_PREFIX que casa con POSTGRES_DB, postgres o template aborta sin escribir ningún archivo [US-035 AC-1]" caso_prefijo_que_casa_con_base_reservada_aborta_sin_escribir
  correr "la salida no contiene ningún valor generado [US-035 AC-1]" caso_salida_sin_valores
  correr "una segunda ejecución sin --rotate deja los mismos hashes e informa existe sin cambios [US-035 AC-3]" caso_segunda_ejecucion_no_cambia_nada
  correr "rotar identity_aes_key o blind_index_hmac_key se rechaza y el hash no cambia [US-035 AC-3]" caso_rotar_clave_de_identidad_se_rechaza
  correr "rotar pg_server.key reemite solo el par del servidor firmado por la misma CA [US-035 AC-3]" caso_rotar_el_certificado_del_servidor_cambia_solo_su_par
  correr "rotar pg_ca.key reemite pg_server.crt firmado por la CA nueva y no cambia el resto [US-035 AC-3]" caso_rotar_la_ca_reemite_el_certificado_del_servidor
fi

rm -f "$registro"
[ "$fallos" -eq 0 ] && echo "setup-secrets: todos los casos en verde" || echo "setup-secrets: $fallos caso(s) fallaron"
exit "$fallos"
