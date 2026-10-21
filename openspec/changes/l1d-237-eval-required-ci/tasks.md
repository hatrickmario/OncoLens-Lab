# Tasks — l1d-237-eval-required-ci

> CI y configuración: **test después** (fixtures de PR en el mismo PR); la función pura de detección
> y el comparador: **test del AC primero**. Sin cambios de API.

## 1. clinical-platform (CI)

- [x] 1.1 Test en rojo de `tocaDisparador()` con diffs de prueba: prompt, `mama/codigos.json`,
      `RELEVANCE_THRESHOLD`/`LLM_MODEL` en `.env.example`, manifiesto de `data/raw/` y un diff de
      `apps/web` que no dispara `[US-074 AC-1…AC-3]` · Vitest/node:test, commit test(L1D-237)
- [x] 1.2 `scripts/ci/eval-trigger-paths.yaml` y `scripts/ci/eval-trigger.mjs`; commit feat(L1D-237)
- [x] 1.3 Job `eval-required` en `.github/workflows/ci.yml`: detección, `npm run evaluate -- --suite
      all --report json` con la configuración de CI, artefacto y comentario con tabla validada / no
      validada; `timeout-minutes` explícito · **test después** `[US-074 AC-1]` `[US-074 AC-6]`
      (hecho; el **comentario en el PR** queda diferido: la tabla va al resumen del job y al artefacto
      `eval-reporte`; ver design.md «Desviaciones»; sin ID de destino aún)
- [x] 1.4 Fixtures de PR (rama de prueba o `act` local) para AC-1…AC-6 con el resultado esperado
      registrado en el PR · **test después** (hecho como Vitest en `scripts/ci/__tests__/evalRequired.test.mjs`,
      que clona el repo y ejecuta el script; AC-4/AC-5 por `regression.yaml` son de la sección 2)
- [x] 1.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-237)

## 2. ai-services

- [ ] 2.1 Test en rojo "pasa con aviso cuando `regression.yaml` no tiene umbrales [US-074 AC-4]" y
      "falla nombrando `recall_at_10` cuando queda en 0,50 bajo 0,80 [US-074 AC-5]" · Pytest, commit
      test(L1D-237) · **test del AC primero**
- [ ] 2.2 `comparar_con_regresion()` y `eval/configs/regression.yaml` vacío; commit feat(L1D-237)
- [ ] 2.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de
      comportamiento, tests en verde antes y después, commit refactor(L1D-237)

## 3. Verificación

- [ ] 3.1 `openspec validate l1d-237-eval-required-ci --strict` en verde
- [ ] 3.2 Tests de los contextos en verde; sin `contracts:verify-provider`; `run-ai-eval` no aplica
      (no cambia la IA)
