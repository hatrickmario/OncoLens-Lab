#!/usr/bin/env bash
# Genera secretos FICTICIOS en un directorio (solo para tests y smoke, nunca para datos reales).
# Uso: fake-secrets.sh <directorio-destino>
# Los nombres salen del propio Compose (una sola fuente): el par EC P-256 del JWT de servicio es real
# (openssl) para que rag-orchestrator pueda cargarlo y verificar un ES256; el resto son valores aleatorios.
# No imprime ningún valor.
set -euo pipefail

destino="${1:?uso: fake-secrets.sh <directorio-destino>}"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
compose="$raiz/infra/docker/docker-compose.yml"
compose_test="$raiz/infra/docker/docker-compose.test.yml"
# Secretos que genera scripts/setup-secrets.sh y ningún servicio de este Compose monta todavía.
SIN_SERVICIO=(pg_ca.crt pg_ca.key seed_doctor_password seed_admin_password)

mkdir -p "$destino"
umask 077

nombres="$(ONCOLENS_SECRETS_DIR="$destino" docker compose -f "$compose" -f "$compose_test" config --format json \
  | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(Object.values(c.secrets??{}).map(s=>require('path').basename(s.file)).join('\n'))")"
nombres="$(printf '%s\n' "$nombres" "${SIN_SERVICIO[@]}")"

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

# Los contenedores corren con un usuario no root: los archivos ficticios (en un directorio temporal) se leen sin restricción.
chmod 755 "$destino"
chmod 644 "$destino"/*
echo "secretos ficticios generados en $destino: $(echo "$nombres" | wc -l | tr -d ' ') archivos"
