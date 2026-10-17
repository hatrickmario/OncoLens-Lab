#!/usr/bin/env bash
# Copia el fixture sin formatear al código de clinical-api (el fixture original está fuera del alcance de Prettier).
set -euo pipefail
cp ci/tests/quality/fixtures/formato/sin-formato.ts apps/clinical-api/src/sin-formato.ts
