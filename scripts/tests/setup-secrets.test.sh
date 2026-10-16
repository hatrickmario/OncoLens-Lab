#!/usr/bin/env bash
# Test de shell de scripts/setup-secrets.sh (US-035 AC-1 y AC-3): `npm run test:secrets`.
# Clona el repositorio a un directorio temporal y ejecuta scripts/tests/setup-secrets.cases.sh dentro de un
# contenedor efímero (imagen fijada por digest: bash, git y OpenSSL 3), de modo que el script se prueba en un
# clon limpio y sin tocar el árbol de trabajo. Variables: ONCOLENS_TEST_REF (commit que se clona; HEAD por defecto,
# así se prueba lo commiteado). Sin secretos reales: todo lo que se genera es aleatorio y se borra.
set -euo pipefail

IMAGEN='buildpack-deps:bookworm-scm@sha256:8ea58fbc817960cd62d512044956ff00cb94865e549eeec32c12139413262004'

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
referencia="${ONCOLENS_TEST_REF:-HEAD}"
temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT

commit="$(git -C "$raiz" rev-parse --verify "$referencia^{commit}")"
git clone -q --no-checkout --no-hardlinks "$raiz" "$temporal/repo"
git -C "$temporal/repo" fetch -q "$raiz" "$commit"
git -C "$temporal/repo" checkout -q --detach "$commit"

echo "setup-secrets: clon limpio de ${commit:0:12} en una imagen efímera"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' \
  -e GIT_AUTHOR_NAME=prueba -e GIT_AUTHOR_EMAIL=prueba@example.invalid \
  -v "$temporal/repo:/repo" \
  -v "$raiz/scripts/tests/setup-secrets.cases.sh:/casos.sh:ro" \
  "$IMAGEN" bash /casos.sh
