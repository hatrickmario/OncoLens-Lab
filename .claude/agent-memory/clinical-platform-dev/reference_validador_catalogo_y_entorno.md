---
name: validador-catalogo-y-entorno
description: Dónde vive el validador del catálogo (L1D-93) y trampas de entorno al correr la CI local en un worktree
metadata:
  type: reference
---

- Validador: `packages/clinical-catalogs/validator/*.mjs` (núcleo puro) + `scripts/catalog/{validate,hash,generar-allowlist}.mjs`;
  clinical-api lo importa vía `allowJs` (tsc emite los .mjs en `dist/packages/...`; el Dockerfile copia validator y schemas).
- Ajv `strict: true` exige `properties` junto a `required` dentro de `if/then` (strictRequired).
- El hook del worktree rechaza comandos con `cd` a rutas calculadas, heredocs largos y bucles `for` con nombres dinámicos: usar Write/Edit y comandos simples.
- Root `npx vitest run` necesita `npm run build -w @oncolens/clinical-language` antes; `evalRequired` falla sin deps de Python
  (pydantic_settings); `/tmp/venv116/bin/python` tuvo las deps de rag-orchestrator para correr su Pytest.
- Subir la versión del catálogo rompe `apps/rag-orchestrator/tests/unit/test_catalogo_clinico.py` (lee el manifest real): es de ai-services.
