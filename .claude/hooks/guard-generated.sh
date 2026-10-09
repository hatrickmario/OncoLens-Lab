#!/usr/bin/env bash
# PreToolUse (Edit|Write|NotebookEdit): contract-first. Lo generado desde el openapi.yaml no se edita a mano.
# Se regenera con `npm run contracts:generate` (vía Bash, que este hook no intercepta).
set -euo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$(python3 -I "$HOOK_DIR/_input.py" tool_input.file_path)"
[ -z "$FILE" ] && exit 0
case "$FILE" in
  */packages/api-contracts/src/*|*/apps/rag-orchestrator/app/schemas/generated/*)
    echo "OncoLens · bloqueado: $FILE se genera desde el openapi.yaml del proveedor (contract-first)." >&2
    echo "Edita apps/<backend>/openapi.yaml y ejecuta npm run contracts:generate (skill sync-contracts)." >&2
    exit 2 ;;
esac
exit 0
