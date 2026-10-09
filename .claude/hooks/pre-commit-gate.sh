#!/usr/bin/env bash
# PreToolUse (Bash, if "git commit *"): escaneo de secretos y PII en lo staged, higiene de tests (TDD)
# y openspec validate --strict.
set -uo pipefail
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" cwd)"
CMD="$(printf '%s' "$INPUT" | python3 -I "$HOOK_DIR/_input.py" tool_input.command)"
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
# 3) Higiene de tests (Política TDD de CLAUDE.md): nunca desactivar ni borrar un test para pasar la suite.
TESTS_RE='(\.(test|spec)\.[cm]?[jt]sx?$|(^|/)test_[^/]*\.py$|_test\.py$|(^|/)(tests?|__tests__|e2e)/)'
TEST_FILES="$(git diff --cached --name-only --diff-filter=AM | grep -E "$TESTS_RE" || true)"
if [ -n "$TEST_FILES" ]; then
  DISABLED="$(printf '%s\n' "$TEST_FILES" | while IFS= read -r f; do
      git diff --cached -U0 --no-color -- "$f" | grep -E '^\+[^+]' \
        | grep -nE '\b(it|test|describe)\.(skip|only|todo)\b|\b(xit|xtest|xdescribe|fit|fdescribe)\(|@pytest\.mark\.(skip|skipif|xfail)\b|pytest\.(skip|xfail)\(' \
        | sed "s|^|$f: |"; done)"
  if [ -n "$DISABLED" ]; then
    echo "OncoLens · test desactivado o enfocado en el commit (Política TDD: nunca .skip/.only/xfail para pasar la suite):" >&2
    printf '%s\n' "$DISABLED" | head -10 >&2; FAIL=1
  fi
fi
REMOVED="$( { git diff --cached --name-only --diff-filter=D | grep -E "$TESTS_RE" | sed 's/$/ (archivo eliminado)/';
  git diff --cached -U0 --no-color | python3 -I -c '
import re, sys
# Un test cuenta como eliminado si su nombre desaparece y no reaparece en lo añadido (mover no es borrar).
pat = re.compile(r"""^\s*(?:(?:it|test|describe)(?:\.each\([^)]*\))?\(\s*([\x27"`])(.+?)\1|(?:async\s+)?def\s+(test_\w+))""")
rem, add = {}, set()
for line in sys.stdin:
    if line.startswith(("---", "+++")): continue
    if line[:1] in "+-":
        m = pat.match(line[1:])
        if m:
            name = m.group(2) or m.group(3)
            (add.add(name) if line[0] == "+" else rem.setdefault(name, line[1:].strip()))
for name, src in rem.items():
    if name not in add: print(src)
'; } || true)"
if [ -n "$REMOVED" ] && ! printf '%s' "$CMD" | grep -q 'Test-Removal:'; then
  echo "OncoLens · el commit elimina tests (Política TDD). Si el AC cambió en la spec del change, añade el trailer" >&2
  echo "'Test-Removal: <motivo>' al mensaje; el Gate 2 lo revisa. Eliminados:" >&2
  printf '%s\n' "$REMOVED" | head -10 >&2; FAIL=1
fi
# 4) OpenSpec
if git diff --cached --name-only | grep -q '^openspec/' && command -v openspec >/dev/null 2>&1; then
  TMP="$(mktemp)"
  if ! openspec validate --all --strict >"$TMP" 2>&1; then
    echo "OncoLens · openspec validate --all --strict falla:" >&2; tail -20 "$TMP" >&2; FAIL=1
  fi
  rm -f "$TMP"
fi

[ "$FAIL" = "1" ] && exit 2
exit 0
