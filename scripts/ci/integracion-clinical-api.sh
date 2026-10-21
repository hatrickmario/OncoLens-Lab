#!/usr/bin/env bash
# Job `integration` de la CI (B-1 del S1): integración de clinical-api contra el PostgreSQL de test del Compose (US-038).
# Genera secretos ficticios de test, levanta solo postgres con el perfil de test y corre scripts/test-integration.sh.
# Los secretos viven en un directorio temporal y se borran al terminar; nada se versiona (RN-14).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$raiz"

# Crea un directorio temporal propio y falla si no queda un directorio real (evita `export X="$(mktemp -d)"`, que oculta el error, SC2155).
directorio_temporal_propio() {
  local directorio
  directorio="$(mktemp -d)"
  [ -n "$directorio" ] && [ -d "$directorio" ] || { echo "integracion-clinical-api: mktemp -d no creó un directorio" >&2; exit 1; }
  printf '%s' "$directorio"
}

# Proyecto y directorios PROPIOS (nunca los del entorno): el trap hace `down -v` y `rm -rf`, y con el proyecto por defecto
# (`oncolens`) borraría los volúmenes del stack local del desarrollador.
export COMPOSE_PROJECT_NAME="oncolens-ci-clinical"
ONCOLENS_SECRETS_DIR="$(directorio_temporal_propio)"
MODEL_HOST_DIR="$(directorio_temporal_propio)"
export ONCOLENS_SECRETS_DIR MODEL_HOST_DIR
export MODEL_PROVIDER=fake
export APP_ENV=test
trap 'docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml -f apps/clinical-api/tests/support/docker-compose.integration.yml down -v >/dev/null 2>&1 || true; rm -rf "$ONCOLENS_SECRETS_DIR" "$MODEL_HOST_DIR"' EXIT

scripts/setup-secrets.sh --profile test
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml \
  -f apps/clinical-api/tests/support/docker-compose.integration.yml up -d --wait postgres
scripts/test-integration.sh
