# Design — l1d-294-respaldo-poblacion-consulta

## Context

`application/aplicabilidad_textual.py` (`AplicabilidadTextual.completar`, `_pedir_propuestas`) llama a `LlmApplicabilityTextProposer` (`infrastructure/llm/proponente_de_aplicabilidad.py`), que ante JSON inválido o fallo del cliente lanza `LlmLocalNoDisponibleError` (`503`). ADR-47 etapa C (decidida por el usuario, 2026-10-29) pide, en su lugar, la misma tarea corta de US-242 por fuente y criterio, con plazo propio y degradación a `respaldo_fallido`.

## Goals / Non-Goals

- Goals: completar criterios `pendiente` en la consulta; degradar sin perder el análisis; registrar la causa sin contenido; no llamar sin pendientes.
- Non-goals: persistir el resultado, reintentar, tocar la ingesta, la UI o el contrato.

## Decisions

1. **Reutilizar la tarea de US-242 mediante un puerto** `PoblacionTask` (dominio/aplicación), con un adapter por modelo en `infrastructure/llm/`; el servicio de aplicabilidad recibe el puerto por constructor (sin cliente concreto).
2. **Selección de pendientes** en una función pura `criterios_pendientes(fuentes_citadas)`: lee, por criterio, la marca `{"status": "pendiente", "values": []}` que US-242 escribe en `population_criteria` y que el lector de US-241 entrega al dominio (no `metadata_source`, que es por documento); vacía → el servicio no invoca nada (AC-5).
3. **Plazo propio**: `asyncio.timeout(POPULATION_FALLBACK_DEADLINE_MS / 1000)` por llamada; al vencer se cancela y el criterio queda `respaldo_fallido` (AC-4). Valor inicial según el informe de US-240; solo en configuración (RN-22).
4. **Fallo cerrado solo para lo secundario**: regla pura `degradar_a_respaldo_fallido(causa)` cubre `bucle (finish_reason=length)`, `truncado`, `plazo`, `caido`; el criterio queda `desconocido` + `respaldo_fallido` y `evidenceOptions` queda idéntica (AC-2, AC-3, AC-7). El NLI caído sigue `503 NLI_UNAVAILABLE` (US-123 AC-5, RN-12): no se toca.
5. **Validación**: `chunkId` debe ser un fragmento de esa fuente recuperado en la consulta, y el valor pasa NLI contra ese fragmento (RN-01, RN-04); aceptado → regla de US-243 calcula el estado.
6. **Log** `aplicabilidad_respaldo_fallido` con `finish_reason`, longitud de salida, criterio, `chunkId` (permitido: ID del corpus público) y `traceId`; nunca valor, texto de fragmento, prompt, salida del LLM ni pregunta (RN-14, regla común l1d-291…294) (AC-6).
8. **Prompt sin datos del paciente.** El adapter de `PoblacionTask` construye el prompt solo con los fragmentos de la fuente y la etiqueta del criterio; ningún campo de `clinicalContext`, ni `pseudoPatientId`, ni el texto de la pregunta (RN-11). Lo verifica AC-1 sobre el prompt registrado por el fake.
7. `_parsear` ya no convierte salida inválida en `LlmLocalNoDisponibleError`; se retira el proponente de una sola llamada de L1D-128 y su prompt (los tests de L1D-123/188 que lo usan se migran a los adapters de FX-08b-c sin cambiar aserciones de comportamiento).

Alternativas: una propuesta elegida (puerto + degradación) frente a (a) subir temperatura/penalizaciones (descartado por medición, OUT-06) y (b) reintentar en la consulta (descartado, aumenta la latencia p95 de 15 s).

## Dependencias y colaboradores

- `AplicabilidadTextual` (modificado): depende de los puertos `PoblacionTask`, `NliClassifier` y reloj/`timeout` inyectado; no depende de clientes concretos.
- Reglas con nombre propio: `criterios_pendientes()`, `degradar_a_respaldo_fallido()` en `app/domain/` (RN-26). El estado final lo calcula la función de US-243.
- Configuración nueva: `POPULATION_FALLBACK_DEADLINE_MS` (reutiliza `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS` de US-242).

## Privacidad y ownership

rag-orchestrator recibe ya los fragmentos del corpus y el contexto desidentificado (RN-11); el respaldo usa **solo fragmentos de la fuente y la etiqueta del criterio**, sin datos del paciente ni identidad: ni campos de `clinicalContext`, ni `pseudoPatientId`, ni el texto de la pregunta (D8, AC-1). No toca datos clínicos, `clinical-minio` ni schemas distintos de `corpus`. El resultado no se persiste. LLM local sin *fallback* a la nube (RN-12). Los logs pueden llevar `chunkId` (corpus público), nunca valores, texto de fragmentos, prompt, salida del LLM ni preguntas (RN-14); `traceId` por `X-Trace-Id`.

## Contratos

Sin diff propuesto del `openapi.yaml`: el valor `respaldo_fallido` de `unknownReason`, la forma de lista y la marca `pendiente` los añade US-241 (`l1d-291-poblacion-lista-contrato-migracion`). Proveedor: rag-orchestrator; consumidor: clinical-api (cliente generado). Compatible con ADR-26. Los tests de integración validan la respuesta `200` contra `RagQueryInternalResponse`. Si US-241 no está mergeada, este change se bloquea (↪).

## Evaluación

Toca prompt/modelo: afecta métricas OL-06 de precisión de población (US-233b: `finish_reason=length` = 0) y fidelidad/citas. Se mide con la suite `evaluate` (ai-eval-runner) con adapters reales; los AC usan adapters falsos.

## Risks / Trade-offs

- El respaldo suma latencia a la consulta: acotada por `POPULATION_FALLBACK_DEADLINE_MS` y solo con pendientes.
- Cruce con los changes de US-241/US-243 sobre `applicability`: ver deltas.

## Pendientes de definir

Ninguno de la historia. Ambigüedades menores: valor inicial de `POPULATION_FALLBACK_DEADLINE_MS` (informe de US-240); concurrencia de varias llamadas de respaldo en una consulta (secuencial vs. paralelo con `POPULATION_EXTRACTION_CONCURRENCY`; se propone paralelo acotado por ese semáforo).
