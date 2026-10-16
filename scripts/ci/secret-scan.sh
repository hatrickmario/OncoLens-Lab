#!/usr/bin/env bash
# AC-3 de US-036 (design.md D4): gitleaks sobre el árbol y sobre los commits del PR (<base>..HEAD), de modo que un
# secreto añadido y borrado en el mismo PR también falla. `--redact` siempre: el informe nombra archivo, línea, regla
# y commit, nunca el valor (el log de la CI de un repositorio público es público, RN-14).
# Uso: scripts/ci/secret-scan.sh <base-ref>
set -uo pipefail

if [ $# -ne 1 ]; then
  echo "uso: $0 <base-ref>" >&2
  exit 2
fi
base_ref="$1"
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
configuracion="$raiz/.gitleaks.toml"

fallo=0
gitleaks dir "$raiz" --config "$configuracion" --redact --verbose --no-banner --no-color || fallo=1
gitleaks git "$raiz" --config "$configuracion" --redact --verbose --no-banner --no-color --log-opts="$base_ref..HEAD" || fallo=1

if [ "$fallo" -eq 0 ]; then
  echo "secret-scan — sin secretos en el árbol ni en los commits de $base_ref..HEAD"
else
  echo "secret-scan — gitleaks encontró secretos (valores redactados)" >&2
fi
exit "$fallo"
