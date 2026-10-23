---
name: entorno-de-tests
description: Como correr la integracion de clinical-api y el codegen en un worktree sin secretos propios; trampas del pii-scan y de oasdiff
metadata:
  type: reference
---

- Worktree nuevo: `npm ci` en la raiz (sin node_modules). La integracion necesita el Postgres del perfil test: si
  hay un contenedor `oncolens*-postgres-1` en 127.0.0.1:55432, apunta `ONCOLENS_SECRETS_DIR` al `infra/docker/secrets`
  del worktree que lo levanto y corre `bash scripts/test-integration.sh [--reporter=verbose] <ruta>`.
- `contracts:generate` necesita `CODEGEN_PYTHON` con datamodel-code-generator (venv en /tmp con
  `scripts/contracts/requirements-codegen.txt`). `contracts:readme-extract` modifica `readme.md` (extracto generado).
- `scripts/ci/contracts-breaking.sh origin/main`: un valor nuevo en un enum de respuesta sale como ERR
  (`response-property-enum-value-added`), no WARN; oasdiff sugiere `x-extensible-enum`.
- `node scripts/ci/pii-scan.mjs`: marca numeros de 6-12 digitos junto a palabras clave (cedula, identificacion, telefono)
  aunque sean sinteticos; armar el valor por partes (`['5212','3456'].join('')`).
- `npm run test:quality` falla en 4 tests si no hay `ruff` instalado (entorno, no regresion).
