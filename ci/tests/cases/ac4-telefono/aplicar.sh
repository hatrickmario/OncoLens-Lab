#!/usr/bin/env bash
set -euo pipefail
mkdir -p data
{
  echo "contacto de prueba"
  printf 'llamar al +%s\n' "$(printf '5%.0s' 1 2 3 4 5 6 7 8 9 10 11)"
} > data/contacto.txt
