# Tasks — l1d-292-poblacion-abanico-ingesta

> Sin cambio de API: no hay `## contratos` (ver `design.md`). Solo `ai-services`.
> ⛔ ADR-47 (aceptado) y ADR-39 (los AC usan adapters falsos). ↪ `l1d-117-metadatos-poblacion-verificados` (base),
> `l1d-291-poblacion-lista-contrato-migracion` (US-241: forma de lista, marca `pendiente` y migración 0005; apilar
> sobre su PR si no está en `main`) y US-240 (valores por defecto).

## ai-services

- [ ] 1.1 Configuración: `POPULATION_EXTRACTION_TOP_K`, `POPULATION_MAX_VALUES_PER_CRITERION`, `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`, `POPULATION_EXTRACTION_CONCURRENCY`, `POPULATION_EXTRACTION_RETRIES` (1), `POPULATION_PROMPT_VERSION` en `CorpusIngestSettings` y `.env.example` con los valores de US-240 (RN-22) · test después (humo de configuración)
- [ ] 1.2 Fixtures FX-06c-c en `apps/rag-orchestrator/tests/support/`: `doc-e1`, `doc-e2`, recuperador falso por documento, `FakePopulationLlm` (`EXT-OK`, `EXT-RELLENO`, `EXT-AJENO`, `EXT-NLI`, `EXT-DUP`, `EXT-CUATRO`, `EXT-CORTE`, `EXT-CORTE-2`, registro de llamadas y concurrencia), NLI falso; cumplen el contrato de los puertos · test después (humo de los fakes)
- [ ] 1.3 Test de aceptación en rojo `test_ingesta_doce_e1_seis_llamadas_valores_con_fragmento` con `@pytest.mark.ac("US-242", 1)`; esqueleto `PopulationFanoutExtractor` con `raise NotImplementedError` · integración (PostgreSQL `corpus` real, adapters falsos) · TDD estricto · commit `test(L1D-292)`
- [ ] 1.4 Orquestador `population_fanout.py` (D1–D3) con unitarios uno a uno; prompt `poblacion_v1.txt` y esquema cerrado con `maxItems` = `POPULATION_MAX_VALUES_PER_CRITERION`; escritura de la forma de lista y `extraido_verificado`; AC-1 en verde · TDD estricto · commit `feat(L1D-292)`
- [ ] 1.5 Tests de aceptación en rojo AC-2 (`valoresRechazados`) y AC-3 (`valoresSinSoporte`) · integración · TDD estricto · commit `test(L1D-292)`
- [ ] 1.6 Reglas puras `rechazar_relleno()`, `validar_chunk()`, `verificar_nli()` (sobre `soporta()`) y contadores en `reporte.py`; AC-2 y AC-3 en verde · TDD estricto · commit `feat(L1D-292)`
- [ ] 1.7 Tests de aceptación en rojo AC-4 (duplicados) y AC-5 (tope por fragmento y criterio, `truncado`, `valoresFueraDelTope`) · TDD estricto · commit `test(L1D-292)`
- [ ] 1.8 Reglas puras `deduplicar()` (sinónimos del catálogo, RN-27) y `aplicar_tope()` por `(criterio, chunkId)` con la clave de configuración (D4); AC-4 y AC-5 en verde · TDD estricto · commit `feat(L1D-292)`
- [ ] 1.9 Tests de aceptación en rojo AC-6 (`EXT-CORTE` y `EXT-CORTE-2`) y AC-7 (caché por versión) · TDD estricto · commit `test(L1D-292)`
- [ ] 1.10 Reintento único con otra semilla, marca `{"status": "pendiente", "values": []}` en el criterio sin bloquear `embebido` y caché por documento + criterio + versión (D5, D6); AC-6 y AC-7 en verde · TDD estricto · commit `feat(L1D-292)`
- [ ] 1.11 Test de aceptación en rojo AC-8 (semáforo, 12 llamadas, una fuente por llamada) y su implementación con `asyncio.Semaphore` · TDD estricto · commits `test(L1D-292)` y `feat(L1D-292)`
- [ ] 1.12 Integrar en `IngestionPipelineService`: `population_criteria` pasa al orquestador, los escalares siguen con `MetadataExtractionService` (D8); solo documentos de licencia aceptada; *logs* con criterio, `chunkId`, `finish_reason` y longitudes; test con `caplog` que comprueba que en los *logs* no
      aparecen el prompt, la salida del LLM, el texto de los fragmentos ni los valores (RN-14, regla común l1d-291…294) ·
      TDD estricto
- [ ] 1.12b (TDD estricto; Decidido (usuario, 2026-10-30)) Filtro RN-23 sobre `studyPopulationValues[].value`: la ingesta recorre cada valor con el filtro de lenguaje prescriptivo; un valor con término prohibido se omite y se cuenta (contador en `reporte.py`), nunca se sustituye. Test de aceptación en rojo con un valor prohibido sembrado en un fragmento citado: «omite y cuenta el valor con término prohibido y conserva los demás [US-242 AC-9]». Commits `test(L1D-292)` y `feat(L1D-292)`.
- [ ] 1.12c (TDD estricto; Decidido (usuario, 2026-10-30), resuelve P4, P5 y P6 de l1d-291) (P4) `population_form` la escribe este change, coherente con la forma real de cada criterio y validada frente a la estructura al escribir; es informativa y el lector sigue decidiendo por la forma del JSON. (P5) El escritor emite solo la lista o `{"status":"pendiente","values":[]}`, nunca `{"values":[…]}` sin `status`. (P6) El escritor recorta o descarta un `value` de más de 200 caracteres (`maxLength` del contrato) para que nunca tumbe el análisis. Tests: «escribe population_form coherente con la forma de la fila», «no emite {values} sin status», «recorta o descarta un value de 201 caracteres y cuenta el descarte». Commits `test(L1D-292)` y `feat(L1D-292)`.
- [ ] 1.13 Regresión: suites de `l1d-116`, `l1d-117`, semilla (US-059) y `app/evaluation` en verde sin cambiar aserciones salvo AC cambiado (con `Test-Removal:`) · verificación: Pytest `tests/integration` y `tests/evaluation`
- [ ] 1.14 Refactor: Extract Method en archivos tocados, sin cambio de comportamiento, commit `refactor(L1D-292)`

## evaluación

- [ ] 2.1 `ai-eval-runner` / `run-ai-eval` sobre la rama (prompt nuevo `poblacion_v1`); adjuntar el reporte al PR · evaluate

## cierre

- [ ] 3.1 `openspec validate l1d-292-poblacion-abanico-ingesta --strict`
- [ ] 3.2 Suite Pytest de `rag-orchestrator` en verde (unit e integration con PostgreSQL y Milvus de test)
