# Proposal — l1d-294-respaldo-poblacion-consulta

## Trazabilidad

L1D-294 · US-244 · FEAT-08b (aplicabilidad) · Sprint 4 · Estimación **3** · HU-22 · FR-25 (valor textual) · RN-26 · RN-01 · RN-14 · RN-22 · AC-08.3 · ADR-47 (etapa C, aceptado) · OUT-06 · `[S4 resp. 3]` · US-244 AC-1…AC-7 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-06] → US-053 · 🔗 Medido en: US-233b (`finish_reason=length` = 0)

## Dependencias

- ⛔ ADR-47 (aceptado) · ⛔ ADR-39 (LLM real; los AC usan adapters falsos FX-08b-c: `RESP-OK`, `RESP-BUCLE`, `RESP-TRUNCADO`, `RESP-LENTO`, `RESP-CAIDO`).
- ↪ US-241 (`l1d-291-poblacion-lista-contrato-migracion`: contrato aditivo con `unknownReason = respaldo_fallido`, forma de lista y marca por criterio `{"status": "pendiente", "values": []}`) · ↪ US-242 (`l1d-292-poblacion-abanico-ingesta`: la misma tarea corta por fuente y criterio, y quien escribe la marca `pendiente`) · ↪ US-243 (`l1d-293-estado-criterio-lista-poblacion`: cálculo de estados sobre la lista) · ↪ US-123 (`l1d-188` archivado/en main: camino textual que este change reemplaza) · ↪ `l1d-126-criterios-aplicabilidad-catalogo` (catálogo y `studyKey`).
- Este change **no** edita `openapi.yaml`: consume el valor `respaldo_fallido` que añade US-241.

## Por qué

Hoy el proponente de una sola llamada (`LlmApplicabilityTextProposer`, L1D-128) convierte una salida inválida del LLM en `LlmLocalNoDisponibleError` (`503`) y descarta un análisis ya validado por un paso secundario. Con la población en lista por fragmento (ADR-47), un documento `pendiente` necesita un respaldo corto en la consulta que no pueda tumbar el análisis (RN-26).

## Qué cambia

- El servicio de aplicabilidad invoca, **solo para los criterios de las fuentes citadas que llevan la marca `{"status": "pendiente", "values": []}` en `population_criteria`** (por criterio; no `metadata_source`, que es por documento), la misma tarea corta de US-242 (una fuente y un criterio por llamada, solo fragmentos de esa fuente, esquema cerrado, tope `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`) con plazo propio `POPULATION_FALLBACK_DEADLINE_MS` (RN-22).
- El valor propuesto se acepta solo con cita a un fragmento recuperado y NLI `entailment` (RN-01); el estado lo calcula la regla pura de US-243.
- Cualquier fallo del respaldo (JSON truncado, bucle de repetición con `finish_reason = length`, plazo vencido, LLM caído después de generar) deja el criterio `desconocido` con `unknownReason = respaldo_fallido`; la respuesta sigue `200` y `evidenceOptions` no cambia. Nunca `LOCAL_LLM_UNAVAILABLE` por el respaldo.
- Sin criterios pendientes → cero llamadas al adapter de respaldo.
- El prompt del respaldo lleva solo los fragmentos de esa fuente y la etiqueta del criterio: ningún campo de `clinicalContext`, ni `pseudoPatientId`, ni el texto de la pregunta.
- Evento de log `aplicabilidad_respaldo_fallido` con `finish_reason`, longitud, criterio, `chunkId` (si lo hay) y `traceId`; nunca valor, texto del fragmento, prompt, salida del LLM ni pregunta (RN-14, regla común l1d-291…294).
- `_parsear` del proponente deja de lanzar `LlmLocalNoDisponibleError` por salida inválida; el proponente de una sola llamada de L1D-128 se retira.

## Capacidades afectadas y bounded contexts

- Capacidad: `applicability` (requisitos nuevos; ver `specs/applicability/spec.md`). Sin capacidad nueva.
- Bounded context: **ai-services** (`apps/rag-orchestrator`). Sin cambios en clinical-platform ni frontend.

## Fuera de alcance

Persistir en el corpus lo que obtenga el respaldo (lo hará la próxima ingesta). Reintentos en la consulta (solo en la ingesta, US-242). Subir temperatura o penalizaciones (descartado por medición, OUT-06). Mostrar `respaldo_fallido` en la UI (US-126). Si el LLM cae **antes** de generar las opciones sigue el `503` de US-053.

## Regresiones activas

- Regresión [RN-01] activa desde S1 (US-064): toda afirmación mostrada tiene cita y NLI.
- Regresión [RN-26] activa desde S3 (US-071): los avisos clínicos no bloquean.
- Regresión [RN-06] activa desde S1 (US-053): el `AIAnalysisRecord` se persiste antes de responder; el `503` previo a la generación se conserva.
