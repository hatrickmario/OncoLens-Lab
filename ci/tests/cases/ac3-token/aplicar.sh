#!/usr/bin/env bash
# Token con forma de JWT generado ahora mismo, añadido en un commit y borrado en el siguiente: nunca se versiona.
set -euo pipefail
segmento() { head -c "$1" /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'; }
git_ci() { git -c user.name=ci-selftest -c user.email=ci-selftest@example.com -c commit.gpgsign=false "$@"; }

printf 'credencial = "eyJ%s.eyJ%s.%s"\n' "$(segmento 24)" "$(segmento 24)" "$(segmento 30)" > docs/ci-selftest-token.txt
git_ci add docs/ci-selftest-token.txt
git_ci commit --quiet -m "añade un token de prueba"
git_ci rm --quiet docs/ci-selftest-token.txt
git_ci commit --quiet -m "borra el token de prueba"
