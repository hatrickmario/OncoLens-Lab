#!/usr/bin/env bash
# D5-02: main avanzó DESPUÉS de crearse el PR y volvió requerido un campo de EvidenceOption; el PR toca un ejemplo que
# seguía válido contra su base. El «origin» simulado vive dentro de .git del clon (se borra con él) y nunca toca el origen real.
set -euo pipefail
export GIT_AUTHOR_NAME=ci-selftest GIT_AUTHOR_EMAIL=ci-selftest@example.com GIT_COMMITTER_NAME=ci-selftest GIT_COMMITTER_EMAIL=ci-selftest@example.com
# Todo con HEAD separado y por SHA: no depende de qué rama (o ninguna, como en el checkout de un PR) tenga el clon activa
# ni de init.defaultBranch, y no crea ni borra ramas.
base="$(git rev-parse HEAD)"
remoto="$(git rev-parse --absolute-git-dir)/origen-simulado.git"

git checkout -q --detach
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
const archivo = 'contracts/schemas/evidence.yaml';
const documento = YAML.parse(readFileSync(archivo, 'utf8'));
const opcion = documento.components.schemas.EvidenceOption;
opcion.properties.campoNuevoObligatorio = { type: 'string' };
opcion.required = [...opcion.required, 'campoNuevoObligatorio'];
writeFileSync(archivo, YAML.stringify(documento, { lineWidth: 0 }));
"
git -c commit.gpgsign=false commit -q -am "main avanza: campoNuevoObligatorio"
git init -q --bare "$remoto"
# Sin gc automático en el origen simulado: receive-pack lo lanzaría en segundo plano y seguiría escribiendo mientras el runner borra el clon.
git -C "$remoto" config receive.autogc false
git -C "$remoto" config gc.auto 0
git push -q "$remoto" HEAD:refs/heads/main
git checkout -q --detach "$base"
git remote set-url origin "$remoto"

# El cambio del PR: toca un ejemplo (solo un salto de línea final; el JSON sigue válido contra la base).
printf '\n' >> contracts/examples/con-evidencia-s1.json
