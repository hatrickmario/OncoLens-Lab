#!/usr/bin/env bash
# PreToolUse (mcp__playwright__*, mcp__chrome-devtools__*): el loop visual solo mira el stack local
# con datos sintéticos. Todo lo que ve el navegador (snapshot, capturas, consola, red) entra al
# contexto del modelo, que corre en la nube: con datos reales sería una fuga (RN-12, RN-14).
# Exit 2 = bloquear; el mensaje de stderr vuelve a Claude.
set -euo pipefail
INPUT="$(cat)"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

block() { echo "OncoLens · loop visual bloqueado: $1" >&2; echo "$2" >&2; exit 2; }

# 1. Datos reales habilitados en el entorno o en los .env del stack local → nada de navegador.
for var in REAL_ANONYMIZED_ENABLED REAL_IDENTIFIED_ENABLED; do
  val="$(printenv "$var" 2>/dev/null || true)"
  case "$(printf '%s' "$val" | tr '[:upper:]' '[:lower:]')" in
    true|1|yes|on) block "$var=$val en el entorno." "El loop visual solo corre con el seed sintético (RN-12, RN-14)." ;;
  esac
done
for f in "$ROOT/.env" "$ROOT/.env.local" "$ROOT/infra/docker/.env"; do
  [ -f "$f" ] || continue
  if grep -qiE '^[[:space:]]*(export[[:space:]]+)?REAL_(ANONYMIZED|IDENTIFIED)_ENABLED[[:space:]]*=[[:space:]]*"?(true|1|yes|on)' "$f"; then
    block "datos reales habilitados en ${f#"$ROOT"/}." "El loop visual solo corre con el seed sintético (RN-12, RN-14)."
  fi
done

# 2. Cualquier URL del input solo puede apuntar al stack local.
#    (--allowed-origins de Playwright MCP no es una frontera de seguridad: este hook sí.)
BAD="$(printf '%s' "$INPUT" | python3 -I -c '
import json, sys, re
from urllib.parse import urlparse
LOCAL = {"localhost", "127.0.0.1", "::1", "[::1]"}
def urls(x):
    if isinstance(x, dict):
        for v in x.values(): yield from urls(v)
    elif isinstance(x, list):
        for v in x: yield from urls(v)
    elif isinstance(x, str) and re.match(r"^\s*[a-zA-Z][a-zA-Z0-9+.-]*:", x):
        yield x.strip()
data = json.load(sys.stdin).get("tool_input", {})
for u in urls(data):
    p = urlparse(u)
    if p.scheme in ("http", "https") and (p.hostname or "") in LOCAL:
        continue
    if p.scheme in ("about",) and u.strip() == "about:blank":
        continue
    if p.scheme in ("http", "https", "file", "ws", "wss", "chrome", "javascript", "data"):
        print(u); break
')"
[ -n "$BAD" ] && block "URL fuera del stack local: $BAD" "Solo http://localhost o 127.0.0.1 (web del Compose local con seed sintético)."
exit 0
