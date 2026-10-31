# Tasks — l1d-294-respaldo-poblacion-consulta

> Sin cambio de API: no hay tareas en `## contratos` (el valor `respaldo_fallido` y la marca `pendiente` los añade `l1d-291-poblacion-lista-contrato-migracion`/US-241, que debe estar mergeado). Solo `ai-services`.
> Empieza después de US-241 (`l1d-291-poblacion-lista-contrato-migracion`: contrato y forma de lista), US-242 (`l1d-292-poblacion-abanico-ingesta`: tarea corta y marca `pendiente`) y US-243 (`l1d-293-estado-criterio-lista-poblacion`: cálculo de estados). Resolver antes: valor inicial de `POPULATION_FALLBACK_DEADLINE_MS` (informe de US-240).

## ai-services

- [x] 1.1 Fixtures FX-08b-c: adapters falsos del respaldo `RESP-OK`, `RESP-BUCLE`, `RESP-TRUNCADO`, `RESP-LENTO`, `RESP-CAIDO` (cumplen el contrato del puerto `PoblacionTask`; registran llamadas, fragmentos, criterio y el prompt construido) · test después (fixture) · humo de los fakes Evidencia: `tests/support/respaldo_poblacion.py` (fakes en el borde `LlmDePoblacion`; el adapter real construye el prompt) y `tests/unit/test_fixture_respaldo_poblacion.py` (8 pasan). Commit 337e76d6.
- [x] 1.2 Configuración: `POPULATION_FALLBACK_DEADLINE_MS` en `settings.py` y `.env.example` (RN-22) · test después (humo de configuración) Evidencia: `.env.example` ya trae la clave desde el PR #253 (no se toca aquí); `Settings.population_fallback_deadline_ms` (+ tokens, concurrencia y versión del prompt) y humo en `test_fixture_respaldo_poblacion.py`. Commit 337e76d6.
- [x] 1.3 Test de aceptación en rojo: `test_respaldo_completa_criterio_pendiente_con_solo_fragmentos_de_doc_b9` con `@pytest.mark.ac("US-244", 1)` · integración (TestClient + PostgreSQL `corpus` real, fakes, reloj inyectado); esqueleto con `raise NotImplementedError` · TDD estricto · commit `test(L1D-294)` Evidencia: rojo `assert 503 == 200` en 337e76d6; verde en 67e0bcee.
- [x] 1.4 Extraer `criterios_pendientes()` (lee la marca `{"status": "pendiente", "values": []}` por criterio, ADR-47) y conectar el respaldo en `AplicabilidadTextual` mediante el puerto `PoblacionTask`; prompt solo con fragmentos de la fuente y etiqueta del criterio (sin `clinicalContext`, `pseudoPatientId` ni pregunta); AC-1 en verde · TDD estricto · commit `feat(L1D-294)` Evidencia: 67e0bcee (`criterios_pendientes`, `PoblacionTask`, `TareaDePoblacionLocal`, `AplicabilidadTextual`).
- [x] 1.5 Tests de aceptación en rojo AC-2, AC-3, AC-4, AC-5, AC-7 (`ac("US-244", n)`): bucle, truncado, plazo (reloj/timeout inyectado), sin pendientes (cero llamadas), LLM caído tras generar · integración · TDD estricto · commit `test(L1D-294)` Evidencia: 884c572a (rojo: AC-2, AC-3, AC-4 y AC-7 fallan en la aserción; AC-5 nace en verde porque la selección por marca de 1.4 ya no llama sin pendientes).
- [x] 1.6 Extraer `degradar_a_respaldo_fallido()` (RN-26) y `asyncio.timeout` con `POPULATION_FALLBACK_DEADLINE_MS`; `_parsear` deja de lanzar `LlmLocalNoDisponibleError`; retirar el proponente de una sola llamada de L1D-128 migrando sus tests sin relajar aserciones; AC-2/3/4/5/7 en verde · TDD estricto · commit `feat(L1D-294)` Evidencia: b74c04a9 (AC-2/3/4/5/7 en verde); el proponente de una llamada se retiró en 67e0bcee con `Test-Removal`.
- [x] 1.7 Test de aceptación en rojo AC-6 (`ac("US-244", 6)`): log `aplicabilidad_respaldo_fallido` con `chunkId` permitido y sin valor, texto de fragmento, prompt, salida del LLM ni pregunta (captura de logs) · integración · TDD estricto · commit `test(L1D-294)` Evidencia: e21b0c69 (rojo `assert 0 == 1` eventos).
- [x] 1.8 Evento de log con `finish_reason`, longitud, criterio, `chunkId` (si lo hay) y `traceId`; AC-6 en verde · TDD estricto · commit `feat(L1D-294)` Evidencia: 50ccc10b (verde). El evento lleva `chunkIds` (los del corpus público que recibió la llamada) y `causa`.
- [x] 1.9 Regresiones: [RN-01] (US-064), [RN-26] (US-071), [RN-06] (US-053) siguen en verde; el `503` previo a generar se conserva · test después (suite existente) Evidencia: `pytest apps/rag-orchestrator` 3192 pasan y `contracts:verify-provider -- --proveedor rag-orchestrator` 292 respuestas verificadas.
- [x] 1.10 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-294)` Evidencia: Extract · `aplicabilidad_textual.py:_aceptar_las_propuestas` · 706ee0de; suite en verde antes y después.

## evaluación

- [x] 2.1 `run-ai-eval` (ai-eval-runner) con modelos locales: precisión de población y `finish_reason=length` = 0 (US-233b), citas y fidelidad; reporte en `reports/eval/` · evaluate Evidencia: reporte de `ai-eval-runner` del Gate 2, PASS sin regresión; smoke con LLM local de 37 llamadas con `finish_reason=length` = 0; salvedades M1-M4 en el reporte (`l1d-294-respaldo-poblacion-consulta.md`, `.json`, `.aplicabilidad.json`, `.llm-local.json`; ver la nota de copia al final).

## Cierre

- [x] 3.1 `openspec validate l1d-294-respaldo-poblacion-consulta --strict`, tests de `rag-orchestrator` en verde Evidencia: `openspec validate l1d-294-respaldo-poblacion-consulta --strict` válido; pytest de rag-orchestrator 3192 pasan.


## Notas de implementación (desviaciones del design.md)

- 2.1 queda para el Gate 2 (`ai-eval-runner`, modelos locales); el dataset sintético `doc-a2` de `aplicabilidad` ya lleva la marca `pendiente` por criterio.
- Los fakes `RESP-*` están en el borde del LLM (`LlmDePoblacion`) y el adapter real `TareaDePoblacionLocal` construye el prompt; `PoblacionTask.proponer(fuente)` lanza `RespaldoFallido` (causa, `finish_reason`, longitud) y el plazo/LLM caído los traduce el servicio.
- El respaldo solo acepta valores de alcance `elegibilidad`; el log lleva `chunkIds` (los fragmentos que recibió la llamada) y `causa`.
- `meta.promptVersion` lleva `+<POPULATION_PROMPT_VERSION>` (`poblacion_v1`) en vez de `+aplicabilidad-texto@0.1.0`; se retiran ese prompt y el adapter de una llamada.
- El respaldo corre sobre las fuentes recuperadas (antes de recortar a `maxOptions`), como el camino textual que reemplaza.

## Hallazgos del Gate 2 aplicados y diferidos

- **Test-Removal de 67e0bcee (motivo correcto):** el motivo publicado dice «puerto tipado»; la causa real es el cambio de AC de la spec (US-244 AC-2/3/7: el respaldo nunca produce 503 `LOCAL_LLM_UNAVAILABLE` por el proponente). El commit publicado no se reescribe; esta es la explicación vigente y va al cuerpo del PR.
- **Aplicado:** un valor por criterio (`MAX_VALORES_DEL_RESPALDO = 1`); puerto `ApplicabilityTextProposer` borrado con guarda; fake renombrado a `tarea_de_poblacion_silenciosa.py`; `es_un_criterio` público con test de paridad; `exigir_un_criterio` en adapter y fakes; `FalloDelLlm` traducido solo por el servicio; `TaskGroup`; marcador `[chunkId]` fuera del valor (M2 de la evaluación: nada lo limpiaba, ahora lo hace `normalizar_propuesta`); `FINISH_REASON_CORTADA` en `poblacion_puertos`; una sola constante de longitud; sin rama muerta en `_registrar_fallos`; guarda RN-23 sobre el prompt real; MODIFIED de `applicability` y `evidence-analysis` para `+poblacion_v1`.
- **Diferido, destino «propuesta de historia de deuda S5 (pendiente de ID)»:** respaldo con lista y DEC-11 (hoy un valor por criterio).
- **Diferido, destino «S5 deuda rag-orchestrator (pendiente de ID)»:** (a) `evaluate` no mide la población del respaldo ni `finish_reason` (M3); (b) mixin de settings compartido entre `Settings` y `CorpusIngestSettings`; (c) versión del prompt leída desde el adapter y no desde la configuración.
- **Decisión humana (Q2, no cambiada):** el plazo es por llamada. Con `POPULATION_EXTRACTION_CONCURRENCY = 1` y 4 criterios `pendiente` de una fuente, el peor caso es 4 × `POPULATION_FALLBACK_DEADLINE_MS` = 4 × 10 s = 40 s frente al p95 de 15 s de `/platform/evidence-analyses`. Opciones: plazo total de la etapa, concurrencia > 1 (ya acotada por el semáforo) o menos criterios por consulta.
- **Pendiente de copiar:** los cuatro archivos del reporte de evaluación (`l1d-294-*` en el scratchpad de la sesión, `reports-out/`) no pudieron copiarse a `reports/eval/` desde este agente (el clasificador de permisos denegó el comando); los copia el orquestador en un commit `docs(L1D-294)`.
