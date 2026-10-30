# Tasks — l1d-294-respaldo-poblacion-consulta

> Sin cambio de API: no hay tareas en `## contratos` (el valor `respaldo_fallido` y la marca `pendiente` los añade `l1d-291-poblacion-lista-contrato-migracion`/US-241, que debe estar mergeado). Solo `ai-services`.
> Empieza después de US-241 (`l1d-291-poblacion-lista-contrato-migracion`: contrato y forma de lista), US-242 (`l1d-292-poblacion-abanico-ingesta`: tarea corta y marca `pendiente`) y US-243 (`l1d-293-estado-criterio-lista-poblacion`: cálculo de estados). Resolver antes: valor inicial de `POPULATION_FALLBACK_DEADLINE_MS` (informe de US-240).

## ai-services

- [ ] 1.1 Fixtures FX-08b-c: adapters falsos del respaldo `RESP-OK`, `RESP-BUCLE`, `RESP-TRUNCADO`, `RESP-LENTO`, `RESP-CAIDO` (cumplen el contrato del puerto `PoblacionTask`; registran llamadas, fragmentos, criterio y el prompt construido) · test después (fixture) · humo de los fakes
- [ ] 1.2 Configuración: `POPULATION_FALLBACK_DEADLINE_MS` en `settings.py` y `.env.example` (RN-22) · test después (humo de configuración)
- [ ] 1.3 Test de aceptación en rojo: `test_respaldo_completa_criterio_pendiente_con_solo_fragmentos_de_doc_b9` con `@pytest.mark.ac("US-244", 1)` · integración (TestClient + PostgreSQL `corpus` real, fakes, reloj inyectado); esqueleto con `raise NotImplementedError` · TDD estricto · commit `test(L1D-294)`
- [ ] 1.4 Extraer `criterios_pendientes()` (lee la marca `{"status": "pendiente", "values": []}` por criterio, ADR-47) y conectar el respaldo en `AplicabilidadTextual` mediante el puerto `PoblacionTask`; prompt solo con fragmentos de la fuente y etiqueta del criterio (sin `clinicalContext`, `pseudoPatientId` ni pregunta); AC-1 en verde · TDD estricto · commit `feat(L1D-294)`
- [ ] 1.5 Tests de aceptación en rojo AC-2, AC-3, AC-4, AC-5, AC-7 (`ac("US-244", n)`): bucle, truncado, plazo (reloj/timeout inyectado), sin pendientes (cero llamadas), LLM caído tras generar · integración · TDD estricto · commit `test(L1D-294)`
- [ ] 1.6 Extraer `degradar_a_respaldo_fallido()` (RN-26) y `asyncio.timeout` con `POPULATION_FALLBACK_DEADLINE_MS`; `_parsear` deja de lanzar `LlmLocalNoDisponibleError`; retirar el proponente de una sola llamada de L1D-128 migrando sus tests sin relajar aserciones; AC-2/3/4/5/7 en verde · TDD estricto · commit `feat(L1D-294)`
- [ ] 1.7 Test de aceptación en rojo AC-6 (`ac("US-244", 6)`): log `aplicabilidad_respaldo_fallido` con `chunkId` permitido y sin valor, texto de fragmento, prompt, salida del LLM ni pregunta (captura de logs) · integración · TDD estricto · commit `test(L1D-294)`
- [ ] 1.8 Evento de log con `finish_reason`, longitud, criterio, `chunkId` (si lo hay) y `traceId`; AC-6 en verde · TDD estricto · commit `feat(L1D-294)`
- [ ] 1.9 Regresiones: [RN-01] (US-064), [RN-26] (US-071), [RN-06] (US-053) siguen en verde; el `503` previo a generar se conserva · test después (suite existente)
- [ ] 1.10 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-294)`

## evaluación

- [ ] 2.1 `run-ai-eval` (ai-eval-runner) con modelos locales: precisión de población y `finish_reason=length` = 0 (US-233b), citas y fidelidad; reporte en `reports/eval/` · evaluate

## Cierre

- [ ] 3.1 `openspec validate l1d-294-respaldo-poblacion-consulta --strict`, tests de `rag-orchestrator` en verde
