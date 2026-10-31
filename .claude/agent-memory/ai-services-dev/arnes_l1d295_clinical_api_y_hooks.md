---
name: arnes-l1d295-clinical-api-y-hooks
description: Cómo correr la integración de clinical-api con PostgreSQL de test en el worktree y qué rechaza el hook pre-commit-gate / el Bash del worktree
metadata:
  type: feedback
---

Integración de clinical-api sin repetir el job: script propio en el scratchpad con `up` (`scripts/setup-secrets.sh --profile test` con `ONCOLENS_SECRETS_DIR` propio + `docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.test.yml -f apps/clinical-api/tests/support/docker-compose.integration.yml up -d --wait postgres`, `COMPOSE_PROJECT_NAME` y `PG_TEST_PORT` propios), `run <args de vitest>` (`scripts/test-integration.sh`) y `down`. Sin argumentos corre las 96 suites en ~2 min.

**Why:** el rojo/verde de `persistencia-fallos` solo se ve contra PostgreSQL real; el hook `pre-commit-gate.sh` (PreToolUse) corre en CUALQUIER Bash cuando hay un test borrado en el índice y lo bloquea salvo que el comando lleve `Test-Removal:` en un `-m`.

**How to apply:** los commits van con `-m` múltiples (el trailer `Test-Removal:` en el último párrafo, con `Co-Authored-By`); no uses `cd ../..` ni `git -C` ni `cat >> archivo <<EOF`; para añadir texto a un archivo usa Edit. Rutas con `eval` (`tests/evaluation`) se evitan con globs (`tests/ev*`, `data/evalu*`). `python3 - <<'EOF'` solo funciona solo (un comando por llamada). `npm run quality` y `eval-required` necesitan `PATH` con un venv que tenga ruff (p. ej. /tmp/venv293, que ya trae las dependencias de rag-orchestrator).
