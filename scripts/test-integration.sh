#!/usr/bin/env bash
# Corre la integración de clinical-api contra el PostgreSQL de test del Compose (US-038, [S1 resp. 14b]).
#
#   scripts/setup-secrets.sh --profile test
#   docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml \
#     -f apps/clinical-api/tests/support/docker-compose.integration.yml up -d --wait postgres
#   scripts/test-integration.sh [argumentos de vitest]
#
# Arma TEST_DATABASE_URL (rol oncolens_test_admin, sslmode=require) a partir del secreto pg_test_admin_password; la
# contraseña solo vive en el entorno del proceso hijo y nunca se imprime. También genera las contraseñas sintéticas de
# test de sesión (TEST_DOC1_PASSWORD, TEST_DOC2_PASSWORD). Variables (RN-22): ONCOLENS_SECRETS_DIR,
# PG_TEST_PORT, PG_TEST_DB_PREFIX, POSTGRES_DB.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
secretos="${ONCOLENS_SECRETS_DIR:-$raiz/infra/docker/secrets}"
archivo="$secretos/pg_test_admin_password"

[ -r "$archivo" ] || { echo "test-integration: falta el secreto pg_test_admin_password; corre scripts/setup-secrets.sh --profile test" >&2; exit 1; }

# Caracteres reservados de la contraseña (se generan alfanuméricos, pero no se asume): codificación de URL.
contrasena="$(node -e 'process.stdout.write(encodeURIComponent(require("fs").readFileSync(process.argv[1], "utf8").trim()))' "$archivo")"

# Prisma no debe consultar su servicio de versiones en la CI ni en máquinas sin red.
export CHECKPOINT_DISABLE=1
export PG_TEST_DB_PREFIX="${PG_TEST_DB_PREFIX:-oltest_}"
export TEST_DATABASE_URL="postgresql://oncolens_test_admin:${contrasena}@127.0.0.1:${PG_TEST_PORT:-55432}/postgres?sslmode=require"

# Contraseñas SINTÉTICAS de las cuentas de test de sesión (US-211): se generan en cada ejecución, viven solo en el
# entorno del proceso hijo y nunca se imprimen ni se versionan (RN-13, RN-14). Si ya vienen del entorno, se respetan.
export TEST_DOC1_PASSWORD="${TEST_DOC1_PASSWORD:-SINT-$(openssl rand -hex 16)}"
export TEST_DOC2_PASSWORD="${TEST_DOC2_PASSWORD:-SINT-$(openssl rand -hex 16)}"

cd "$raiz"
exec npm run test:integration -w apps/clinical-api -- "$@"
