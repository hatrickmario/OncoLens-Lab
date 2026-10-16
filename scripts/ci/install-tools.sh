#!/usr/bin/env bash
# Instala las herramientas de ci/tools.lock (gitleaks, oasdiff) en un directorio y lo añade al PATH de la CI.
# Uso: scripts/ci/install-tools.sh [directorio]   (por defecto $RUNNER_TEMP/oncolens-tools o ./.ci-tools)
# Se niega a instalar si la suma SHA-256 del archivo descargado no coincide con la del lock.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
destino="${1:-${RUNNER_TEMP:-$raiz/.ci-tools}/oncolens-tools}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) plataforma=linux_x64 ;;
  Darwin-arm64) plataforma=darwin_arm64 ;;
  *) echo "plataforma no soportada: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$destino"
while read -r herramienta version plat suma url; do
  case "$herramienta" in ''|\#*) continue ;; esac
  [ "$plat" = "$plataforma" ] || continue
  [ -x "$destino/$herramienta" ] && continue
  archivo="$(mktemp)"
  curl -fsSL "$url" -o "$archivo"
  obtenida="$(shasum -a 256 "$archivo" | cut -d' ' -f1)"
  if [ "$obtenida" != "$suma" ]; then
    rm -f "$archivo"
    echo "suma SHA-256 distinta para $herramienta $version ($plat): se esperaba $suma y se obtuvo $obtenida" >&2
    exit 1
  fi
  tar -xzf "$archivo" -C "$destino" "$herramienta"
  rm -f "$archivo"
  echo "instalado $herramienta $version en $destino"
done < "$raiz/ci/tools.lock"

if [ -n "${GITHUB_PATH:-}" ]; then echo "$destino" >> "$GITHUB_PATH"; fi
exit 0
