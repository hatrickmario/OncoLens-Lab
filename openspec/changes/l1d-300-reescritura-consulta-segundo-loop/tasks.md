# Tasks — l1d-300-reescritura-consulta-segundo-loop

> ⛔ **Orden de merge (cadenas de contratos: rag-orchestrator 291 → 109 → 295 → 144 → 300; clinical-api 291 → 95 → 295 → 144 → 300):** último eslabón; rebasar sobre `l1d-144-hasta-3-opciones-orden-aplicabilidad` (rag-orchestrator 1.9.0, clinical-api 1.14.0) y `l1d-109-busqueda-hibrida-retrieval-mode` (1.7.0, `fusion`/`fusionParam`) antes de la tarea 1.1. Misma política de `retrievalParams` (decisión D-c): claves obligatorias y sin `null`.

## contratos

- [ ] 1.1 `apps/rag-orchestrator/openapi.yaml` 1.9.0 → **1.10.0**: `RagMeta.retrievalParams.queryRewrite` (`{applied: boolean, reason: disparado | no_disparado | no_disponible | no_aplica}`, cerrado, en `required`, sin `null`, `if/then` `applied = true` ⇔ `disparado`); descripción de `/rag/follow-up` con `no_aplica` · commit `contract(L1D-300)` · test después (fixture)
- [ ] 1.2 Ejemplos de `rag-orchestrator`: `queryRewrite` en los `contracts/examples/rag-query-*.json` y `rag-follow-up-*.json` que traen `meta.retrievalParams` (solo esos; los requests y los que no tienen `meta` no cambian): `no_disparado` en las consultas, `disparado` en `rag-query-sin-evidencia.json`, `{applied: false, reason: "no_aplica"}` en seguimiento; nuevo `rag-query-reescritura-aplicada.json` con su request `rag-query-request-reescritura-aplicada.json` (`query` de `Q-TYPO-SIN-EVIDENCIA`, distinta de las demás), ambos en `index.json`; los ejemplos nuevos con target `RagQueryInternalResponse` llevan además todos los campos obligatorios vigentes al rebasar sobre 144 y 109 (`optionsNotShown`, `fusion`, `fusionParam`); fixture de PR que rompe con `reason = null` o `applied = true` + `no_disparado` · `contracts:check` (incl. `assertFixtureQueriesDistinct()`), `contracts:breaking` (sin incompatibles) · test después · commit `contract(L1D-300)`
- [ ] 1.3 `apps/clinical-api/openapi.yaml` 1.14.0 → **1.15.0** (rebasar sobre `l1d-144`): `AnalysisBasis.sourcesConsulted.queryRewritten` (`boolean`, en `required`, descripción normativa de design.md D8); `queryRewritten: false` en todos los ejemplos con `analysisBasis` y nuevo `con-evidencia-reescritura.json` (`true`) en `index.json` · `contracts:check`, `contracts:breaking`, `contracts:generate` (Pydantic, Zod, clientes TS; nada a mano) · test después · commit `contract(L1D-300)`

## ai-services

- [ ] 2.1 Test de aceptación en rojo: AC-1, AC-2, AC-3 (`… [US-238 AC-n]`): rescate (`disparado`), no invocación con chunk sobre el umbral (`no_disparado`), `sin_evidencia` con una sola reescritura (`disparado`) · integración (`TestClient` + fakes, FX-06b-a) · estricto · commit `test(L1D-300)`; esqueletos `QueryRewriter`/`QueryRewriteStep` solo si falta el símbolo
- [ ] 2.2 Implementar `QueryRewriteStep` + puerto `QueryRewriter` + fake con contador; extraer `debeReescribir()` (RN-02); `queryRewrite` en `_armar_meta_de_recuperacion` (sobre el de l1d-109); AC-1…AC-3 en verde · estricto · commit `feat(L1D-300)`
- [ ] 2.3 Test en rojo AC-4 (límite, claves de configuración, `QUERY_REWRITE_ENABLED = false` → `no_disparado`) y AC-5 (LLM caído o vencido → `sin_evidencia`, `reason = no_disponible`, sin nube), con captura de logs (caplog) en los tres caminos `no_disponible` (salida inválida del LLM, *deadline* vencido, LLM caído): el log lleva solo `reason` y el tipo de error (nombre de la clase), nunca el mensaje de la excepción (un `ValidationError` de Pydantic incluye `input_value` con la salida del LLM) ni la pregunta o la reformulación · integración · estricto · commit `test(L1D-300)`
- [ ] 2.4 Implementar `QUERY_REWRITE_*` en `settings.py` y `.env.example`, deadline y fallo cerrado (AC-4, AC-5) · estricto · commit `feat(L1D-300)`
- [ ] 2.5 Test en rojo AC-6 (términos del catálogo; cero términos admitidos → sin segunda búsqueda y `no_disponible`) y AC-7 (pregunta original puntuada y guardada) · integración + unitario de dominio · estricto · commit `test(L1D-300)`
- [ ] 2.6 Extraer `filtrarTerminosDelCatalogo()` (RN-27) y `conservarPreguntaOriginal()` (RN-03/RN-06); AC-6, AC-7 en verde · estricto · commit `feat(L1D-300)`
- [ ] 2.7 Test en rojo AC-8 en `rag-orchestrator`: el *prompt* capturado por el fake de `QueryRewriter` contiene exactamente la `query` recibida y nada de `clinicalContext`, `pseudoPatientId` ni memoria; solo proveedor local; logs con recuentos, `reason`, `latencyMs` y `chunkId` y sin texto de pregunta, reescritura, fragmento, *prompt* ni salida del LLM · integración (captura de *prompt* y de logs) · estricto · commit `test(L1D-300)`
- [ ] 2.8 Adapter real `infrastructure/llm/reescritor_de_consulta.py` y prompt versionado `app/prompts/reescritura_consulta.py`; AC-8 en verde; regresiones [RN-02] (US-055), [RN-03] y [RN-10, RN-11, RN-12] (US-049) en verde · estricto para el adapter / sin TDD para el prompt (evaluate) · commit `feat(L1D-300)`
- [ ] 2.9 Test de `/rag/follow-up`: `queryRewrite = {applied: false, reason: "no_aplica"}` y contador de `QueryRewriter` en 0 — en integración sobre la ruta si ya existe al implementar; si no, unitario sobre `_armar_meta_de_recuperacion` con el modo seguimiento y el ejemplo `rag-follow-up-response.json`, y la historia del endpoint lo hereda · estricto · commit `test(L1D-300)` antes de su `feat(L1D-300)`
- [ ] 2.10 `contracts:verify-provider` sobre las respuestas reales de `/rag/query` en rescate, sin rescate, primer loop con evidencia, reescritura desactivada y LLM caído (los cuatro valores de `reason` de `/rag/query`), y sobre `/rag/follow-up` si su ruta existe · integración · test después · commit `test(L1D-300)`
- [ ] 2.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-300)`

## clinical-platform

- [ ] 3.1 Test en rojo (equivalente a la 3.1 de l1d-109): con MSW sirviendo `rag-query-reescritura-aplicada.json`, `retrieval_params` del `AIAnalysisRecord` persiste `queryRewrite = {applied: true, reason: "disparado"}` y `query_text` es la original; con `rag-query-con-evidencia.json` y `rag-query-sin-evidencia.json`, persiste el valor recibido tal cual · integración (Supertest + PostgreSQL de test + MSW desde `contracts/examples/`) · estricto · commit `test(L1D-300)`
- [ ] 3.2 Test en rojo de la Base (D-d): `analysisBasis.sourcesConsulted.queryRewritten = true` solo con `applied = true` y `con_evidencia`; `false` con `no_disparado` y con `disparado` sin rescate · integración + unitario de la regla `declararReescrituraEnLaBase()` · estricto · commit `test(L1D-300)`
- [ ] 3.3 Implementar `declararReescrituraEnLaBase()` en el builder de la Base (`evidence-analysis`, sin LLM) y la persistencia (sin migración: `retrieval_params` ya es JSON); 3.1 y 3.2 en verde · estricto · commit `feat(L1D-300)`
- [ ] 3.4 Regresión de US-049 con PII sembrada en la pregunta: MSW captura el request saliente a `/rag/query` y su `query` llega enmascarada · integración (Supertest + MSW) · test después (regresión) · commit `test(L1D-300)`

## frontend

- [ ] 4.1 Test del AC primero (Testing Library + MSW con `con-evidencia-reescritura.json` y `con-evidencia-s1.json`): con `queryRewritten = true` se lee bajo «Qué se buscó», sin expandir, el texto exacto de design.md D8; con `false`, no · commit `test(L1D-300)`
- [ ] 4.2 Clave `evidence.base.reescrituraAplicada` en `apps/web/messages/es.json`; extender `apps/web/lib/evidence/describir-busqueda.ts` (hoy `null` en `con_evidencia`) y el montaje de `QueSeBusco` en `analysis-result.tsx` para que «Qué se buscó» aparezca en `con_evidencia` solo con `queryRewritten = true`; 4.1 en verde; `visual-check` (375 y 1280 px) · commit `feat(L1D-300)`

## evaluación

- [ ] 5.1 Brazo "reescritura" en el runner de variantes (US-226) con latencia añadida solo de las consultas que disparan el loop, recall@10/MRR con y sin reescritura y «sin evidencia» ≥ 0,90 (AC-9) · evaluate · reporte de `ai-eval-runner`
- [ ] 5.2 Decidir el valor por defecto de `QUERY_REWRITE_ENABLED` según el criterio de adopción de AC-9 y registrarlo en `.env.example` · evaluate

## Cierre

- [ ] 6.1 `openspec validate l1d-300-reescritura-consulta-segundo-loop --strict`, tests de `apps/rag-orchestrator`, `apps/clinical-api` y `apps/web` en verde, `contracts:check`, `contracts:breaking`, `contracts:verify-provider`, `run-ai-eval`
