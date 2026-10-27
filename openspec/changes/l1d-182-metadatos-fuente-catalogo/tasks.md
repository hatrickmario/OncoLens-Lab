# Tasks — l1d-182-metadatos-fuente-catalogo

> ↪ Se rebasa sobre **`l1d-127-estado-criterio-estructurado`** (FX-08b-a y `valor_del_estudio()`) y sobre
> **`l1d-140-panel-opcion-citas`** (`CitationDetails`). Sin cambio de API: no hay commit `contract(L1D-182)`
> salvo el ejemplo opcional de 1.1.
>
> Matriz TDD (CLAUDE.md): reglas RN y endpoints → **TDD estricto** (commit `test(L1D-182)` del AC antes de su
> `feat(L1D-182)`; si el AC ya pasa en verde por US-063, el commit `test` lo declara regresión, design D1);
> componente de `web` → **test del AC primero**; fixtures → **test después**. Mocks solo en los bordes (LLM,
> NLI, Milvus, *reranker*, MSW hacia `rag-orchestrator`); schema `corpus` y PostgreSQL reales en integración.
> Nunca `.skip`, `.only`, `skipif` ni `xfail`.

## 1. contratos

- [x] 1.1 (test después) Comprobar si algún ejemplo de `contracts/examples/` trae una cita con `primaryEndpoint = null` y `sampleSize = null`; si no, añadir `rag-query-con-evidencia-metadatos-nulos.json` (y su par de `clinical-api`) con una cita de `doc-a3`. Verificación: `npm run contracts:check` en verde; commit `contract(L1D-182)` solo si hubo ejemplo nuevo. **Hecho sin ejemplo nuevo:** `rag-query-con-evidencia.json`, `con-evidencia-s1.json` y `con-evidencia-s4.json` ya traen citas con `primaryEndpoint = null` y `sampleSize = null`; `contracts:check` sin hallazgos; sin commit `contract(L1D-182)`.

## 2. ai-services

- [x] 2.1 (test después) Ampliar FX-08b-a en `apps/rag-orchestrator/tests/fixtures/`: `doc-a1` con `study_design`, `trial_phase = "III"`, `primary_endpoint`, `sample_size`, `published_at`, `last_updated_at`, `guideline_version` no nulos y `population_criteria` con "I–III" en `estadio`; `doc-a3` con `primary_endpoint` y `sample_size` nulos. Si `l1d-127` no está en `main`, crear el fixture con su forma y conciliar al rebasar. Verificación: test de humo del fixture en verde.
- [x] 2.2 (test después) Escenario `LLM-METADATOS-FALSOS` en el generador falso (FX-06a-b): cita un chunk de `doc-a1` con `sampleSize = 9999` y `trialPhase = "IV"` dentro del JSON de generación. Verificación: test de humo del adapter falso.
- [x] 2.3 (TDD estricto) Test de aceptación: "trae los siete metadatos factuales iguales a las columnas de corpus_document cuando la opción cita doc-a1 [US-127 AC-1]" · integración (`TestClient` + JWT de servicio + `@pytest.mark.ac("US-127", 1)`), validado contra `RagQueryInternalResponse`. Commit `test(L1D-182)`.
- [x] 2.4 (TDD estricto) Test de aceptación: "conserva sampleSize y trialPhase del catálogo y no devuelve 9999 ni IV cuando el LLM los inventa en la cita [US-127 AC-2]" · integración. Commit `test(L1D-182)`.
- [x] 2.5 (TDD estricto) Test de aceptación: "devuelve primaryEndpoint y sampleSize en null cuando doc-a3 no los registra [US-127 AC-3]" · integración. Commit `test(L1D-182)`.
- [x] 2.6 (TDD estricto) Test de aceptación: "devuelve studyPopulationValue idéntico al texto de population_criteria de doc-a1, sin reformular [US-127 AC-4]" · integración. Commit `test(L1D-182)`.
- [x] 2.7 (TDD estricto) **Sin cambio de código de producción** (D1: AC-1..4 pasan en verde al escribirse, declarados regresión en el commit `test`; verificado por mutación `sampleSize=ficha.sample_size or 0` → rojo en AC-3; unitarios de `ficha_de_fila` en `tests/unit/test_lector_catalogo.py`). Implementación mínima que ponga 2.3–2.6 en verde (previsto: ninguna o un ajuste en `construir_cita()` / `ficha_de_fila()` / `valor_del_estudio()`), con unitarios uno a la vez en `tests/unit/` (columna de texto vacía → `None`; `sample_size = 0` → `0`, no `None`; campo ajeno del LLM ignorado). Verificación: suite de `rag-orchestrator` en verde. Commit `feat(L1D-182)`.
- [x] 2.8 **Refactor: sin cambios** (el diff solo toca tests y fixtures). Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-182)`.

## 3. clinical-platform

- [ ] 3.1 (TDD estricto) Test de aceptación: "persiste y devuelve primaryEndpoint y sampleSize en null cuando rag-orchestrator los devuelve null [US-127 AC-3]" · integración (Supertest + PostgreSQL real de test + MSW desde el ejemplo de 1.1), con la respuesta validada contra `apps/clinical-api/openapi.yaml`. Commit `test(L1D-182)` (regresión si pasa en verde, design D1).
- [ ] 3.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-182)` (o "sin cambios" en el PR si solo hubo test).

## 4. frontend

- [ ] 4.1 (test del AC primero) Test con Testing Library + MSW sobre `/api/*`: "muestra No disponible en Endpoint principal y Tamaño de muestra cuando la cita los trae en null [US-127 AC-3]" y "muestra fase, endpoint, tamaño y versión con el valor del ejemplo [US-127 AC-1]", incluyendo que los rótulos "No disponible" no llevan `data-origen`. Commit `test(L1D-182)` en rojo.
- [ ] 4.2 (test del AC primero) Filas `trialPhase`, `primaryEndpoint`, `sampleSize`, `guidelineVersion` en `components/molecules/citation-details.tsx` tras "Diseño del estudio"; rótulos en `messages/es.json` (design, Componentes y patrones); `valorONoDisponible` para `number | null` sin tratar `0` como ausente (design D3). Verificación: 4.1 en verde y `tsc`/lint sin errores. Commit `feat(L1D-182)`.
- [ ] 4.3 (test del AC primero) E2E Playwright en `apps/web/e2e/panel-analisis.spec.ts` contra Compose con seed sintético y `LLM_PROVIDER=fake`: "muestra No disponible en endpoint y tamaño de muestra de la cita de doc-a3 [US-127 AC-3]". Verificación: E2E en verde con *trace*.
- [ ] 4.4 Loop visual (visual-check): estados, consola sin errores ni violaciones de CSP, red solo /api/* sin PII en URLs, accesibilidad y teclado, rendimiento y capturas a 375 y 1280 px; cada fallo se convierte primero en un test en rojo.
- [ ] 4.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-182)`.

## 5. evaluación

- [ ] 5.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo real ni corpus: `run-ai-eval` no aplica; la calidad de los metadatos del corpus se mide en US-132 (L1D-244). Verificación: nota en el PR.

## 6. Verificación

- [x] 6.1 `openspec validate l1d-182-metadatos-fuente-catalogo --strict` en verde.
- [ ] 6.2 Suites en verde: Pytest de `apps/rag-orchestrator`, Vitest de `apps/clinical-api` y `apps/web`, E2E de 4.3.
- [ ] 6.3 `contracts:check` en verde y respuestas de `/rag/query` y `/platform/evidence-analyses` validadas contra el spec del proveedor en la integración (sin cambio de schema: `contracts:verify-provider` y `contracts:breaking` sin diferencias). **ai-services verificado** (rag-orchestrator: `verify-provider` 218 respuestas, `breaking` y `generate:check` sin diferencias); pendiente lo de `clinical-api` y `web`.

## Workflow follow-up

- Archivar después de `l1d-140-panel-opcion-citas` (crea `evidence-panel`) y, en `applicability`, en el orden 127 → 128 → 129 → 130 → **182** (`[S3 resp. 16]`): el delta es `MODIFIED` del requisito de `studyPopulationValue` de l1d-127.

- **Deuda «Enum `guia` en la cita»** (`S3-deuda.md`, decisión del 2026-10-24): `studyDesign` viaja como código del catálogo (`guia`, `eca`, …) y `CitationDetails` lo muestra crudo. Resolverlo es de `frontend` (rótulo legible por código en `messages/es.json`, con «No disponible» si es `null` o desconocido) y no cambia el contrato; un rótulo servido por `rag-orchestrator` exigiría un campo nuevo en `CitedSourceFields` (contrato, decisión del orquestador/humano). Pendiente de decidir al arrancar la sección 4.
