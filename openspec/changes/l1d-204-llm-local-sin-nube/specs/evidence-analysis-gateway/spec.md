## ADDED Requirements

### Requirement: La clasificación de datos del request interno sale del paciente
`clinical-api` MUST fijar `dataClassification` de todo request hacia `rag-orchestrator` (`/rag/query` y `/chat/turn`) desde `Patient.data_origin`, mediante una única función con nombre propio, y MUST NOT tomarla del body público ni de la sesión (RN-12, OL-03).

#### Scenario: Un paciente real produce un request interno real aunque el body diga lo contrario [US-050 AC-4] [RN-12] [OL-03] [readme §2.5]
- **GIVEN** un paciente con `data_origin = real_identificado` en el repositorio falso del test unitario y una petición cuyo objeto de entrada trae `dataClassification = sintetico`
- **WHEN** el gateway arma el request interno
- **THEN** el request lleva `dataClassification = real_identificado`

#### Scenario: El body público con dataClassification se rechaza en el borde sin invocar a la IA [US-050 AC-4] [OL-03] (asumido: `EvidenceAnalysisRequest` tiene `additionalProperties: false`)
- **GIVEN** `doc1@test.local` con sesión válida y un cliente de `rag-orchestrator` que cuenta llamadas
- **WHEN** envía `POST /platform/evidence-analyses` con `Q-HER2` sobre el paciente semilla (a) y `dataClassification = sintetico` en el body
- **THEN** la respuesta es `400` válida contra el spec de `clinical-api`, el cliente registra cero llamadas y no se persiste ningún registro

### Requirement: Un proveedor de nube con datos reales nunca se acepta ni se persiste
Si la respuesta de `rag-orchestrator` declara `meta.llmProvider = nube` para un request con `dataClassification` real, `clinical-api` MUST responder `502 ERROR_SERVICIO_IA` sin persistir ningún `AIAnalysisRecord` y registrar el evento `proveedor_no_permitido` sin contenido clínico (RN-12, defensa en profundidad).

#### Scenario: Una respuesta con llmProvider nube para un paciente real se descarta [US-050 AC-5] [RN-12] (asumido: verificación de `RagMeta.llmProvider` contra `dataClassification` declarada en el contrato)
- **GIVEN** un paciente sintético de test con `data_origin = real_anonimizado` y `rag-orchestrator` simulado respondiendo `200` con `meta.llmProvider = nube`
- **WHEN** `doc1@test.local` solicita el análisis
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA`, sin cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: El 503 de LLM local caído con dato real se propaga sin detalles ni registro [US-050 AC-5] [FR-09] [AC-06.1] [readme §4.1]
- **GIVEN** un paciente de test con `data_origin = real_identificado` y `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-llm-local-no-disponible.json`
- **WHEN** `doc1@test.local` solicita el análisis
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, el `message` fijo y el `traceId`, válida contra el spec de `clinical-api`, sin texto interno de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

## MODIFIED Requirements

### Requirement: Una sola tabla de mapeo de fallos de rag-orchestrator
`clinical-api` MUST mapear cada fallo de `POST /rag/query` en una única función (`mapearFalloRag()`, `[S1 resp. 12]`): `503 LOCAL_LLM_UNAVAILABLE`, `503 LLM_OUTPUT_INVALID` (desde el S4, Q1) y `409 CATALOG_VERSION_MISMATCH` conservan su código; `503 RETRIEVAL_UNAVAILABLE`, `503 NLI_UNAVAILABLE`, otros `4xx`/`5xx`, errores de red y respuestas que no validan → `502 ERROR_SERVICIO_IA`. Ninguna fila SHALL persistir un `AIAnalysisRecord` ni reenviar cuerpo, `message` o cabeceras de rag.

#### Scenario: El LLM local no disponible se responde como 503 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-llm-local-no-disponible.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, el `message` fijo de `error-llm-local-no-disponible.json` y el `traceId` generado, válida contra el spec de `clinical-api` (*helper* de L1D-164)
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Una salida inválida del LLM se responde como 503 LLM_OUTPUT_INVALID sin registro [US-245 AC-1] [RN-06] (decisión Q1, 2026-10-30)
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-salida-llm-invalida.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `503` con `error = LLM_OUTPUT_INVALID`, el `message` fijo de `error-salida-llm-invalida.json` y el `traceId` generado, válida contra el spec de `clinical-api`, y nunca `LOCAL_LLM_UNAVAILABLE`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: La recuperación no disponible se responde como 502 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` con `error = RETRIEVAL_UNAVAILABLE` (ejemplo de L1D-106) y un `message` con texto interno sintético
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y el `message` fijo de `error-servicio-ia.json`, sin el texto interno
- **AND** no se persiste ningún registro

#### Scenario: El NLI no disponible se responde como 502 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` con `error = NLI_UNAVAILABLE` (ejemplo de L1D-180)
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Un 422 de rag-orchestrator se responde como 502 sin eco [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `422` desde `contracts/examples/rag-validacion-422.json`
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no contiene el `message` ni los detalles del `422`
- **AND** no se persiste ningún registro

#### Scenario: Un 401 o un 500 de rag-orchestrator se responde como 502 sin detalles internos [US-053 AC-4] [OL-03]
- **GIVEN** `rag-orchestrator` simulado respondiendo `401` (desde `rag-token-servicio-invalido.json`) en un caso y `500` con un cuerpo con texto interno sintético en otro (desde el S2, el `409` de `CATALOG_VERSION_MISMATCH` tiene su propio escenario)
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA`, el `message` fijo de `error-servicio-ia.json` y `traceId`, válidas contra el spec de `clinical-api`
- **AND** ninguna contiene el texto del cuerpo ni del `message` de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con esos `trace_id`

#### Scenario: Un 503 con un código desconocido se responde como 502 [US-053 AC-4] [S1 resp. 12] (asumido: "cualquier otro 5xx")
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` con un `error` que no es ninguno de los declarados
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Una respuesta interna que no cumple el contrato se responde como 502 sin registro [US-053 AC-4] (asumido: defensa en el borde del Contexto técnico mapeada a 502)
- **GIVEN** `rag-orchestrator` simulado respondiendo `200` con `status = sin_evidencia` y `topRelevanceScore = 0.0`, y en otro caso con un `200` sin el bloque `meta`
- **WHEN** se envía `Q-HER2`
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Una conexión rechazada hacia rag-orchestrator se responde como 502 sin registro [US-053 AC-4] (asumido: error de red tratado como error entre servicios)
- **GIVEN** `rag-orchestrator` simulado que corta la conexión (error de red)
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `502` con `error = ERROR_SERVICIO_IA` y no se persiste ningún registro

#### Scenario: Un 409 de catálogo de rag-orchestrator se responde como 409 sin registro [US-041 AC-2] [NFR-14] [OL-02] [ADR-38]
- **GIVEN** `rag-orchestrator` simulado respondiendo `409` desde `contracts/examples/rag-catalog-version-mismatch.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, el `message` fijo de `error-catalog-version-mismatch.json` y `traceId`, válida contra el spec de `clinical-api`, sin el cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Un 409 o un 429 de rag-orchestrator se responde en el S1 como 502 sin registro [US-053 AC-4] [S1 resp. 12] (asumido: corrección del Gate 1, 2ª vuelta, 2026-10-14; sus códigos propios llegan con US-041 y US-056)
- **GIVEN** `rag-orchestrator` simulado respondiendo `429` con `Retry-After: 30` en un caso y `409` con un `error` distinto de `CATALOG_VERSION_MISMATCH` en otro (desde el S2, el `409` de `CATALOG_VERSION_MISMATCH` tiene su propio escenario)
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA`, el `message` fijo de `error-servicio-ia.json` y `traceId`, válidas contra el spec de `clinical-api`, sin `Retry-After` ni el cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con esos `trace_id`



Regresión [RN-30 429 con `Retry-After`] activa desde S4 (US-056).
