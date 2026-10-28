## ADDED Requirements

### Requirement: El log de citas cuenta las descartadas por motivo sin contenido
Tras validar las citas, `rag-orchestrator` MUST registrar en el evento `event=rag_query_citas`, además de
`traceId`, `opcionesAceptadas` y `opcionesDescartadas`, los campos `sinCitas=<n>` y `citaInvalida=<n>` (cero
cuando no hay descartadas por ese motivo). El evento MUST NOT registrar ningún `chunkId`, texto de opción, de
cita ni de la pregunta (RN-14). El contrato de `/rag/query` y de `/platform/evidence-analyses` MUST NOT
cambiar: el motivo ya viaja en `discardedOptions[].discardReason`.

#### Scenario: Recuento por motivo en el log de citas [US-237 AC-5] [RN-14]
- **GIVEN** una consulta con chunks sobre el umbral y un LLM fingido que genera una opción que cita un `chunkId` no recuperado y otra sin citas
- **WHEN** `rag-orchestrator` valida las citas
- **THEN** el log `event=rag_query_citas` registra `opcionesAceptadas=0 opcionesDescartadas=2 sinCitas=1 citaInvalida=1`
- **AND** el registro es una línea JSON válida del formateador de logs del servicio que contiene el `traceId` de la consulta
- **AND** ese registro no contiene ningún `chunkId` (recuperado ni inventado), ni el texto de las opciones, ni el de la pregunta

#### Scenario: Sin descartadas los recuentos por motivo son cero (asumido)
- **GIVEN** una consulta cuya única opción generada cita un chunk recuperado
- **WHEN** `rag-orchestrator` valida las citas
- **THEN** el log `event=rag_query_citas` registra `sinCitas=0 citaInvalida=0`

#### Scenario: Los openapi.yaml no cambian [US-237 AC-6] [ADR-26]
- **GIVEN** `apps/clinical-api/openapi.yaml` y `apps/rag-orchestrator/openapi.yaml` de la rama del change
- **WHEN** se ejecutan `contracts:check` y `contracts:breaking` contra `main`
- **THEN** ambos están en verde, ninguno de los dos `openapi.yaml` tiene diff y `discardedOptions[].discardReason` conserva su enum
