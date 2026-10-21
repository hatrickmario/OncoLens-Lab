# Tasks — l1d-273-bundle-redocly

## 1. clinical-platform

- [x] 1.1 [Test después · scripts] Portar a `__tests__/empaquetado.test.mjs` los casos de los tests de `bundle.mjs` (internalización de `$ref` compartidas, `$ref` externa sin resolver con su puntero, spec crudo intacto) más el de schema repetido, contra la API nueva [US-223 AC-2, AC-3]
- [x] 1.2 `context.mjs#bundleSpecs()` con `bundleDocument` (asíncrono) y `verificarEmpaquetadoCerrado()` tras empaquetar (design.md D2) [US-223 AC-2]
- [x] 1.3 CLIs (`check.mjs`, `generate.mjs`, `bundle-json.mjs`, `scripts/ci/bundle-specs.mjs`) con `await`; `loadBundledSpecs()` síncrona sobre el precálculo de `prepararSpecsEmpaquetados()` y `globalSetup` de Vitest en raíz, `clinical-api` y `web` (design.md D1)
- [x] 1.4 Verificar igualdad: `contracts:check` sin hallazgos y `contracts:generate:check` sin diferencias (TS, Zod, Pydantic, extracto del readme); tiempo máximo explícito en los tests que lancen el CLI [US-223 AC-1]
- [x] 1.5 Borrar `lib/bundle.mjs` y sus tests en un commit con *trailer* `Test-Removal: sustituido por bundleDocument (US-223 AC-3)` [US-223 AC-3]
- [x] 1.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-273)`

## 2. Cierre

- [x] 2.1 `openspec validate l1d-273-bundle-redocly --strict`
- [x] 2.2 `npx vitest run` (raíz), tests de integración de `clinical-api` y `web` que usan el *helper*, y Pytest de `rag-orchestrator` en verde
