#!/usr/bin/env bash
# Genera secretos FICTICIOS en un directorio, solo para `docker compose config` en los tests estáticos: nunca para
# levantar el stack (el smoke usa scripts/setup-secrets.sh) ni para datos reales.
# Uso: fake-secrets.sh <directorio-destino>
# Los nombres salen del catálogo único scripts/lib/catalogo-secretos.sh (perfil test incluido). El par EC P-256 del
# JWT es real (openssl); el resto son valores aleatorios. No imprime ningún valor.
set -euo pipefail

destino="${1:?uso: fake-secrets.sh <directorio-destino>}"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# shellcheck source=../../lib/catalogo-secretos.sh
source "$raiz/scripts/lib/catalogo-secretos.sh"

mkdir -p "$destino"
umask 077

nombres="$(archivos_del_catalogo test)"

while IFS= read -r nombre; do
  [ -n "$nombre" ] || continue
  case "$nombre" in
    jwt_service_private.pem)
      openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$destino/$nombre" 2>/dev/null
      ;;
    jwt_service_public.pem)
      ;;
    *)
      openssl rand -hex 32 > "$destino/$nombre"
      ;;
  esac
done <<< "$nombres"

openssl pkey -in "$destino/jwt_service_private.pem" -pubout -out "$destino/jwt_service_public.pem"

echo "secretos ficticios generados en $destino: $(echo "$nombres" | wc -l | tr -d ' ') archivos"
