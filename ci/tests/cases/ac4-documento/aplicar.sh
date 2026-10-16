#!/usr/bin/env bash
# Seis líneas neutras y, en la séptima, una palabra clave y un número sintético de nueve dígitos (compuesto aquí).
set -euo pipefail
mkdir -p data
{
  for n in 1 2 3 4 5 6; do echo "linea $n"; done
  printf '{ "nota": "documento: %s" }\n' "$(printf '8%.0s' 1 2 3 4 5 6 7 8 9)"
} > data/notas.json
