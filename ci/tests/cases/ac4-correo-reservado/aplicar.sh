#!/usr/bin/env bash
# Cinco correos de dominios reservados y uno de un dominio ordinario (compuestos aquí).
set -euo pipefail
arroba='@'
{
  echo "usuario${arroba}example.com"
  echo "usuario${arroba}demo.test"
  echo "usuario${arroba}host.local"
  echo "usuario${arroba}x.invalid"
  echo "usuario${arroba}app.localhost"
  echo "ci-selftest-persona${arroba}clinica-ejemplo.org"
} > docs/ci-selftest-correos.md
