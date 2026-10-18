#!/usr/bin/env bash
# Job `integration` de la CI (B-1 del S1): integración de clinical-api contra el PostgreSQL de test del Compose (US-038).
# Genera secretos ficticios de test, levanta solo postgres con el perfil de test y corre scripts/test-integration.sh.
# Los secretos viven en un directorio temporal y se borran al terminar; nada se versiona (RN-14).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$raiz"

export ONCOLENS_SECRETS_DIR="${ONCOLENS_SECRETS_DIR:-$(mktemp -d)}"
export MODEL_PROVIDER=fake
export MODEL_HOST_DIR="$(mktemp -d)"
export APP_ENV=test
trap 'docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml -f apps/clinical-api/tests/support/docker-compose.integration.yml down -v >/dev/null 2>&1 || true; rm -rf "$ONCOLENS_SECRETS_DIR" "$MODEL_HOST_DIR"' EXIT

scripts/setup-secrets.sh --profile test
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml \
  -f apps/clinical-api/tests/support/docker-compose.integration.yml up -d --wait postgres
scripts/test-integration.sh
