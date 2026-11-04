#!/usr/bin/env bash
# PostToolUse (Bash, if "git push *" o "gh pr create *"): tras subir cambios, recuerda que un PR solo se anuncia
# listo para merge con la CI terminada y en verde (decisión del usuario, 2026-10-24). No bloquea: inyecta contexto.
set -uo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" cwd)"
CMD="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" tool_input.command)"
# El filtro `if` de settings.json no basta en PostToolUse: el propio script exige un push o la creación de un PR.
printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:]]|$)' || exit 0
[ -n "$CWD" ] && cd "$CWD" 2>/dev/null || true
git rev-parse --show-toplevel >/dev/null 2>&1 || exit 0

RAMA="$(git branch --show-current 2>/dev/null || true)"
PR=""
if [ -n "$RAMA" ] && command -v gh >/dev/null 2>&1; then
  PR="$(gh pr view "$RAMA" --json number -q .number 2>/dev/null || true)"
fi
OBJETIVO="${PR:+el PR #$PR}"
OBJETIVO="${OBJETIVO:-el PR de la rama ${RAMA:-actual}}"

MENSAJE="Verificación de CI obligatoria: antes de decir al humano que ${OBJETIVO} está listo para merge, espera a que la CI termine lanzando ahora, en segundo plano (Bash con run_in_background), el vigilante \`.claude/hooks/vigilar-pr.sh ${PR:-<n>}\` (sin esperar en primer plano); cuando termine, su última línea dice «#n listo para merge» (0 fallos, 0 pendientes, 0 alertas, CLEAN) o «#n falla <check> <url>». Avisa al humano con ese resultado. Si falla, lee el log del job (\`gh run view --job <id> --log-failed\`): un flake de infraestructura se relanza con \`gh run rerun --failed\` y se registra como deuda; un fallo real se corrige o se pregunta; luego vuelve a lanzar el vigilante. Nunca anuncies el merge con checks pendientes o en rojo."

python3 -I -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":sys.argv[1]}}))' "$MENSAJE"
exit 0
