---
name: entorno-integracion-worktree
description: Como correr la integracion de clinical-api (PostgreSQL real) desde un worktree sin chocar con otros agentes
metadata:
  type: reference
---

Pasos que funcionaron (L1D-104) para la suite `scripts/test-integration.sh` en un worktree:

- `npm ci` en el worktree (sin `node_modules` propio falla `tsc` de `packages/clinical-language`).
- `scripts/setup-secrets.sh --profile test`, luego Compose con `APP_ENV=test PG_TEST_PORT=<puerto libre> docker compose -p <proyecto propio> -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml -f apps/clinical-api/tests/support/docker-compose.integration.yml up -d --wait postgres`.
- Los otros agentes ya ocupan las subredes 172.28.x: un override en /tmp con `ipam.config: !override` (172.29.x) y `sed` de 172.28 a 172.29 en `infra/docker/secrets/pg_hba*.conf` (gitignored) y `--force-recreate`.
- `contracts:generate` necesita `datamodel-code-generator`: venv en /tmp y `CODEGEN_PYTHON=/tmp/.../bin/python`.
- El hook de worktree rechaza comandos con `cd` + git encadenados o pipes con git: separar en llamadas simples. `.env.example` esta bloqueado por regla de denegacion.

**Why:** perdi tiempo con los tres obstaculos (red, hba, python). **How to apply:** repetir esta receta al arrancar cualquier change que toque BD.
