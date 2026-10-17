#!/usr/bin/env bash
# Copia el fixture Python sin formatear al código de rag-orchestrator (el original está fuera del alcance de Ruff).
set -euo pipefail
cp ci/tests/quality/fixtures/formato/sin-formato.py apps/rag-orchestrator/app/sin-formato.py
