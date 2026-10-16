#!/bin/sh
# Entrypoint de postgres (US-035): instala los secretos que PostgreSQL debe leer con el usuario `postgres`
# y delega en el entrypoint de la imagen.
#
# Los `secrets` de Compose de tipo file conservan el uid y los permisos del host: PostgreSQL rechaza una clave
# privada que no sea suya con 0600, y el usuario `postgres` no puede leer un 0600 de otro uid. Este script corre
# como root, copia la clave TLS y las contraseñas a un tmpfs propiedad de `postgres` (nunca a una capa de imagen)
# y apunta a esa copia. No imprime ningún valor.
set -eu

origen=/run/secrets
destino=/run/pg-secrets

install -d -m 0700 -o postgres -g postgres "$destino"
for archivo in pg_server.key "$origen"/pg_*_password; do
  nombre="$(basename "$archivo")"
  [ -f "$origen/$nombre" ] || continue
  install -m 0400 -o postgres -g postgres "$origen/$nombre" "$destino/$nombre"
done

export PG_SECRETS_DIR="$destino"
export POSTGRES_PASSWORD_FILE="$destino/pg_superuser_password"

# Perfil test/CI: otro pg_hba.conf (el último -c hba_file gana). Lo monta infra/docker/docker-compose.test.yml.
if [ "${ONCOLENS_PG_PROFILE:-}" = "test" ]; then
  set -- "$@" -c hba_file="$origen/pg_hba.test.conf"
fi

exec docker-entrypoint.sh "$@"
