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
# El usuario local empieza por alfanumérico: así `+@pytest.mark…` (marcador de diff + decorador) no cuenta como email.
# Se aceptan además los TLD reservados por la RFC 2606 (.invalid, .test, .example), que nunca resuelven.
if printf '%s' "$ADDED" | grep -oE '[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' \
   | grep -viE '@(example\.(com|org|net)|oncolens\.test|test\.local|anthropic\.com|users\.noreply\.github\.com)$|@[A-Za-z0-9.-]+\.(invalid|test|example)$' >/dev/null; then
  echo "OncoLens · email fuera de dominios de prueba en el commit. Usa @example.com, @oncolens.test o un dominio .invalid." >&2; FAIL=1
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
# Commit de merge real: MERGE_HEAD existe, NO es ancestro de HEAD (un MERGE_HEAD obsoleto o forjado no exime nada)
# y comparte una base con HEAD (un commit huérfano tampoco). Si no, el commit es normal.
# En un merge real un test solo cuenta como eliminado si su NOMBRE está en algún archivo de test de AMBOS padres
# (HEAD y MERGE_HEAD) y en ninguno del índice: lo que la otra rama ya trasladó, renombró o borró no lo elimina este merge.
MERGE_HEAD="$(git rev-parse -q --verify MERGE_HEAD 2>/dev/null || true)"
if [ -n "$MERGE_HEAD" ] && { git merge-base --is-ancestor "$MERGE_HEAD" HEAD 2>/dev/null \
    || ! git merge-base HEAD "$MERGE_HEAD" >/dev/null 2>&1; }; then
  MERGE_HEAD=""
fi
REMOVED="$( { if [ -z "$MERGE_HEAD" ]; then git diff --cached --name-only --diff-filter=D | grep -E "$TESTS_RE" | sed 's/$/ (archivo eliminado)/'; fi;
  git diff --cached -U0 --no-color | MERGE_HEAD="$MERGE_HEAD" TESTS_RE="$TESTS_RE" python3 -I -c '
import os, re, subprocess, sys
from collections import defaultdict
# Test eliminado = su nombre desaparece y no reaparece en lo añadido. Mover no es borrar, y renombrar
# tampoco: en cada archivo, tantos nombres nuevos como desaparecidos cuenta como renombrado.
pat = re.compile(r"""^\s*(?:(?:it|test|describe)(?:\.each\([^)]*\))?\(\s*([\x27"`])(.+?)\1|(?:async\s+)?def\s+(test_\w+))""")
rem, add = defaultdict(dict), defaultdict(set)
path = ""
for line in sys.stdin:
    if line.startswith("+++ "):
        path = line[6:].strip() if line.startswith("+++ b/") else path; continue
    if line.startswith("--- "): continue
    if line[:1] in "+-":
        m = pat.match(line[1:])
        if m:
            name = m.group(2) or m.group(3)
            if line[0] == "+": add[path].add(name)
            else: rem[path].setdefault(name, line[1:].strip())
all_added = set().union(*add.values()) if add else set()
merge_head = os.environ.get("MERGE_HEAD", "")
def git(*a): return subprocess.run(["git", *a], capture_output=True, text=True).stdout
def nombres_de(texto):
    out = {}
    for l in texto.splitlines():
        m = pat.match(l)
        if m: out.setdefault(m.group(2) or m.group(3), l.strip())
    return out
def arbol_de_tests(rev):  # rev vacío = índice
    rutas = git("ls-files", "-z") if not rev else git("ls-tree", "-r", "-z", "--name-only", rev)
    return {p: nombres_de(git("show", f"{rev}:{p}")) for p in rutas.split("\0")
            if p and re.search(os.environ["TESTS_RE"], p)}
if merge_head:
    # Merge real: por nombre, en todos los archivos de test de cada árbol.
    cabeza, otra, indice = arbol_de_tests("HEAD"), arbol_de_tests(merge_head), arbol_de_tests("")
    en_otra = set().union(*otra.values()) if otra else set()
    en_indice = set().union(*indice.values()) if indice else set()
    for f, names in cabeza.items():
        gone = [n for n in names if n in en_otra and n not in en_indice]
        new = [n for n in add.get(f, ()) if n not in en_otra]
        for n in gone[len(new):]:
            print(f"{f}: {names[n]}")
else:
    for f, names in rem.items():
        gone = [n for n in names if n not in all_added]
        new = [n for n in add.get(f, ()) if n not in set().union(*rem.values())]
        for n in gone[len(new):]:
            print(f"{f}: {names[n]}")
'; } || true)"
# El trailer puede venir en -m o en el archivo de -F/--file.
MSG="$CMD"
MSGFILE="$(printf '%s' "$CMD" | python3 -I -c '
import shlex, sys
try: a = shlex.split(sys.stdin.read())
except ValueError: a = []
for i, t in enumerate(a):
    if t in ("-F", "--file") and i + 1 < len(a): print(a[i + 1]); break
    if t.startswith("--file="): print(t.split("=", 1)[1]); break
')"
[ -n "$MSGFILE" ] && [ -f "$MSGFILE" ] && MSG="$MSG $(cat "$MSGFILE")"
if [ -n "$REMOVED" ] && ! printf '%s' "$MSG" | grep -q 'Test-Removal:'; then
  echo "OncoLens · el commit elimina tests (Política TDD). Si el AC cambió en la spec del change, o el test era" >&2
  echo "inestable, añade el trailer 'Test-Removal: <motivo>' al mensaje; el Gate 2 lo revisa. Eliminados:" >&2
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
# Lint y formato (ESLint, Prettier, Ruff): no se corren aquí; los cubre la CI (decisión 2026-10-20).

[ "$FAIL" = "1" ] && exit 2
exit 0
