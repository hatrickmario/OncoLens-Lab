#!/usr/bin/env bash
# PreToolUse (Bash, if "git commit *"): escaneo de secretos y PII en lo staged + openspec validate --strict.
set -uo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" cwd)"
[ -n "$CWD" ] && cd "$CWD" 2>/dev/null || true
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT"

FAIL=0
ADDED="$(git diff --cached -U0 --no-color -- . ':(exclude).claude/hooks/*' | grep -E '^\+[^+]' || true)"

# 1) Secretos
if printf '%s' "$ADDED" | grep -nE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|(password|passwd|secret|api_?key|token)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'$<{]{8,}' >/dev/null; then
  echo "OncoLens · posible secreto en el commit (RN-14). Revisa: git diff --cached" >&2; FAIL=1
fi
# 2) PII: documentos de identidad colombianos y emails fuera de dominios de prueba
if printf '%s' "$ADDED" | grep -nEi '\b(C\.?C\.?|T\.?I\.?|c[eé]dula|documento)[[:space:]]*(n[o°º]\.?)?[[:space:]]*[:#]?[[:space:]]*[0-9]{6,10}\b' >/dev/null; then
  echo "OncoLens · posible documento de identidad en el commit (RN-13, RN-14). Usa identificadores sintéticos." >&2; FAIL=1
fi
if printf '%s' "$ADDED" | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
   | grep -viE '@(example\.(com|org|net)|oncolens\.test|test\.local|anthropic\.com|users\.noreply\.github\.com)$' >/dev/null; then
  echo "OncoLens · email fuera de dominios de prueba en el commit. Usa @example.com u @oncolens.test." >&2; FAIL=1
fi
# 3) OpenSpec
if git diff --cached --name-only | grep -q '^openspec/' && command -v openspec >/dev/null 2>&1; then
  TMP="$(mktemp)"
  if ! openspec validate --all --strict >"$TMP" 2>&1; then
    echo "OncoLens · openspec validate --all --strict falla:" >&2; tail -20 "$TMP" >&2; FAIL=1
  fi
  rm -f "$TMP"
fi

[ "$FAIL" = "1" ] && exit 2
exit 0
