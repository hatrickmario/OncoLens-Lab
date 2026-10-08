#!/usr/bin/env bash
# PreToolUse (Edit|Write|NotebookEdit): bloquea escrituras en secretos y en datos reales (RN-13, RN-14).
# Exit 2 = bloquear; el mensaje de stderr vuelve a Claude.
set -euo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" tool_input.file_path)"
[ -z "$FILE" ] && FILE="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" tool_input.notebook_path)"
[ -z "$FILE" ] && exit 0

base="$(basename "$FILE")"
lower="$(printf '%s' "$FILE" | tr '[:upper:]' '[:lower:]')"

block() { echo "OncoLens · bloqueado: $1 ($FILE). $2" >&2; exit 2; }

case "$base" in
  .env.example|.env.sample|.env.template) ;;
  .env|.env.*) block "archivo de entorno con secretos" "Usa .env.example con valores ficticios (RN-14)." ;;
esac
case "$lower" in
  *.pem|*.key|*.p12|*.pfx|*id_rsa*|*/certs/*) block "certificado o clave privada" "Los certificados viven fuera del repo (scripts/ los genera)." ;;
  */data/*real*|*/data/*reales*|*/data/*anonimizad*|*/data/*identificad*|*pacientes-reales*|*real-data*.csv|*real-data*.json)
    block "posible dato real" "El repo es público: solo datos sintéticos y corpus público (RN-13, RN-14)." ;;
esac
exit 0
