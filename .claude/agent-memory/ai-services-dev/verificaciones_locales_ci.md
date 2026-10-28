---
name: verificaciones-locales-ci
description: Cómo reproducir en el worktree los jobs de la CI (generate:check, eval-required, quality, integration de clinical-api) y qué rompe un cambio en contracts/examples
metadata:
  type: feedback
---

Un cambio en `contracts/examples/*.json` (p. ej. renombrar un biomarcador) rompe tests de OTROS backends que fijan la etiqueta (`apps/clinical-api/tests/unit/evidence-analysis/base-del-analisis.test.ts`): corre `scripts/ci/integracion-clinical-api.sh` (su `vitest run` unitario va primero) antes de dar por bueno un cambio de ejemplos.

**Why:** en L1D-129 el cambio «Receptor de estrógeno» -> «RE» pasó pytest y `contracts:check` y solo falló en el unitario de clinical-api.

**How to apply:** `npm ci` en el worktree; `contracts:generate:check` necesita `CODEGEN_PYTHON=<venv con scripts/contracts/requirements-codegen.txt>` (venv en el scratchpad); `eval-required.mjs --base origin/main` necesita `EVAL_PYTHON=/tmp/venv116/bin/python`; `npm run quality` necesita `export PATH=/tmp/venv116/bin:$PATH` (ruff + lint-imports). Para esperar un job largo: `perl -e 'sleep 200'` en foreground (el `sleep` está bloqueado) o Monitor.
