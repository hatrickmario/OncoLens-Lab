#!/usr/bin/env bash
# Piloto de TDD Guard (S1), solo en clinical-platform-dev (hook de su frontmatter, PreToolUse
# Write|Edit|MultiEdit|TodoWrite). Envuelve `tdd-guard` para medir el piloto sin cambiar su veredicto:
# registra decisión y latencia en reports/tdd-guard/pilot.jsonl (ignorado por git) para la retro.
# Si `tdd-guard` no está instalado (npm install -g tdd-guard), el piloto no está activo: deja pasar.
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
command -v tdd-guard >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
OUT="$(mktemp)"; ERR="$(mktemp)"
T0="$(python3 -I -c 'import time; print(time.time())')"
printf '%s' "$INPUT" | tdd-guard >"$OUT" 2>"$ERR"
RC=$?
T1="$(python3 -I -c 'import time; print(time.time())')"

mkdir -p "$ROOT/reports/tdd-guard"
printf '%s' "$INPUT" | python3 -I -c '
import json, sys
inp = json.load(sys.stdin)
ti = inp.get("tool_input", {}) or {}
rc, t0, t1, out, err = int(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
reason = (open(err).read() + open(out).read()).strip().replace("\n", " ")[:400]
print(json.dumps({
    "ts": t1, "tool": inp.get("tool_name"), "file": ti.get("file_path", ""),
    "decision": "block" if rc == 2 else ("allow" if rc == 0 else f"error:{rc}"),
    "latency_s": round(t1 - t0, 2), "reason": reason,
    "falsePositive": None,  # lo rellena el humano en la retro: true | false
}, ensure_ascii=False))
' "$RC" "$T0" "$T1" "$OUT" "$ERR" >>"$ROOT/reports/tdd-guard/pilot.jsonl" 2>/dev/null || true

cat "$OUT"; cat "$ERR" >&2
rm -f "$OUT" "$ERR"
exit "$RC"
