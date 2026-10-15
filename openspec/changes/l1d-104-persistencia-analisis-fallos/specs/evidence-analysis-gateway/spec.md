## ADDED Requirements

### Requirement: Análisis persistido antes de responder
Ante una respuesta válida de `rag-orchestrator`, `clinical-api` MUST persistir el `AIAnalysisRecord` en `clinical.ai_analysis_record` dentro de una transacción y SHALL enviar la respuesta `200` solo después del `COMMIT` (RN-06, readme §2.1). La respuesta MUST construirse desde el registro persistido, con `id`, `traceId`, `evidenceOptions`, `analysisBasis` y `topRelevanceScore` idénticos a lo guardado.

#### Scenario: El análisis con evidencia se responde con el mismo id y contenido que quedó registrado [US-053 AC-1] [AC-T1.4] [RN-06] [IA-09] [OL-03]
- **GIVEN** `doc1@test.local` con sesión válida, el paciente semilla (a) y `rag-orchestrator` simulado con MSW respondiendo `LLM-OK` (FX-06a-b) para `Q-HER2`, construido desde `contracts/examples/rag-query-con-evidencia.json`
- **WHEN** envía `POST /platform/evidence-analyses` con `Q-HER2`
- **THEN** la respuesta es `200` con un `EvidenceAnalysis` válido contra el spec de `clinical-api`
- **AND** su `id` existe en `clinical.ai_analysis_record` con el mismo `trace_id`, `analysis_type = analisis_evidencia`, `requested_by` igual al usuario de la sesión, `clinical_context_snapshot`, `context_fingerprint`, `corpus_release`, `catalog_version`, los cuatro modelos, `prompt_version`, `retrieval_params` y `top_relevance_score = 0.87`
- **AND** `evidenceOptions` de la respuesta es igual a `evidence_options` persistido y `analysisBasis` es igual a `analysis_basis` persistido

### Requirement: Contenido trazable del registro del análisis
El `AIAnalysisRecord` MUST incluir `trace_id`, `analysis_type = analisis_evidencia`, `requested_by`, `query_text` y `clinical_context_snapshot` desidentificados, `context_fingerprint`, `sources_selected`, `filters_applied`, `corpus_release`, `catalog_version`, los modelos y `llm_provider`, `prompt_version`, `retrieval_params`, `status` y `top_relevance_score` (IA-09, AC-T1.4); el `disclaimer` de la respuesta SHALL salir de la clave de configuración `AI_DISCLAIMER_TEXT`.

#### Scenario: Los filtros recibidos quedan persistidos con el análisis [US-052 AC-5] [AC-05.1] [OL-03]
- **GIVEN** el request del AC-1 de US-052 con `filtersApplied.ultimosSeisMeses = true` y `rag-orchestrator` simulado respondiendo con evidencia
- **WHEN** se envía
- **THEN** responde `200` y el `ai_analysis_record` de ese `id` tiene `filters_applied.ultimosSeisMeses = true`

#### Scenario: El trace_id persistido es el generado por clinical-api y no el X-Trace-Id entrante [US-053 AC-1] [RN-10] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** el análisis del AC-1 enviado con la cabecera `X-Trace-Id: req_Entrante01` y el generador de `traceId` inyectado con `req_TestGen0001`
- **WHEN** se lee el `ai_analysis_record` del `id` respondido
- **THEN** `trace_id = req_TestGen0001` y ninguna columna del registro contiene `req_Entrante01`

#### Scenario: La Base del análisis del S1 declara que el detalle de datos y faltantes no se evaluó [US-053 AC-1] [FR-27] (asumido: corrección del Gate 1, 2026-10-14)
- **GIVEN** `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` = "Datos del paciente recibidos como contexto. Esta versión no verifica su completitud ni la ausencia de datos clínicamente relevantes." en la configuración de test
- **WHEN** se completa el análisis del AC-1, y en otro caso el de `Q-SIN` sin evidencia
- **THEN** en ambos `analysisBasis.patientDataUsed = []`, `analysisBasis.missingCriticalData = []` y `analysisBasis.assumptions` contiene `{ text: <ese literal>, origin: regla_catalogo }`, igual en la respuesta y en `analysis_basis` persistido
- **AND** el literal no tiene hallazgos de `lint:lenguaje` (L1D-193)

#### Scenario: El snapshot persistido no lleva el seudónimo de la consulta [US-053 AC-1] [RN-11] (asumido: nota de data-model.md §4.3 "sin pseudoPatientId")
- **GIVEN** el análisis del AC-1
- **WHEN** se lee `clinical_context_snapshot` del registro persistido
- **THEN** no contiene la clave `pseudoPatientId` ni el valor enviado como seudónimo en el request capturado

### Requirement: Un fallo de persistencia nunca muestra el análisis
Si la escritura del `AIAnalysisRecord` falla, `clinical-api` MUST responder `500` con el cuerpo genérico `ErrorInterno` (`{ error = ERROR_INTERNO, message, traceId }`), declarado en el spec de `clinical-api`, SHALL NOT incluir `evidenceOptions`, texto de opciones ni ningún otro campo del análisis, y MUST registrar en el log el `traceId` sin la pregunta, el contexto, la respuesta de `rag-orchestrator` ni el mensaje del error de la base de datos (RN-06, NFR-08, PRD §10).

#### Scenario: Con la escritura del registro fallando, la respuesta es 500 genérico sin opciones [US-053 AC-2] [AC-10.4] [RN-06] [NFR-08]
- **GIVEN** `rag-orchestrator` simulado respondiendo `LLM-OK` para `Q-HER2` y un fallo provocado en la escritura de `clinical.ai_analysis_record` de la base de datos de test (*trigger* temporal `BEFORE INSERT` que lanza excepción)
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `500` con `error = ERROR_INTERNO`, `message` y `traceId`, válida contra el spec de `clinical-api`
- **AND** el cuerpo no contiene `evidenceOptions` ni el texto "Quimioterapia combinada con terapia anti-HER2"
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`
- **AND** el log capturado contiene ese `traceId` y no contiene la pregunta ni el texto de la opción

### Requirement: Deadline hacia rag-orchestrator sin registro persistido
`clinical-api` MUST enviar a `rag-orchestrator` la cabecera `X-Request-Deadline` (parámetro tipado de la operación del cliente generado de L1D-105, `[S1 resp. 13]`) con `ahora + RAG_TIMEOUT_MS` (clave de configuración, RN-22; reloj inyectado) y MUST abortar la llamada al vencer `RAG_TIMEOUT_MS`; entonces SHALL responder `504` con `ErrorDeadlineVencido` y no persistir ningún `AIAnalysisRecord` (FR-09).

#### Scenario: rag-orchestrator no responde a tiempo y la respuesta es 504 sin registro [US-053 AC-3] [FR-09] [OL-03]
- **GIVEN** `RAG_TIMEOUT_MS` de test, el reloj congelado y `rag-orchestrator` simulado que no responde dentro de ese plazo
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a) y el temporizador supera `RAG_TIMEOUT_MS`
- **THEN** la respuesta es `504` con `error = DEADLINE_VENCIDO` y `traceId`, válida contra el spec de `clinical-api`
- **AND** el request capturado llevó `X-Request-Deadline` igual al instante congelado más `RAG_TIMEOUT_MS`
- **AND** no existe fila en `clinical.ai_analysis_record` con ese `trace_id`

#### Scenario: Un 504 de rag-orchestrator por deadline vencido se responde como 504 sin registro [US-053 AC-3] [S1 resp. 12] (asumido: el 504 de rag es el deadline propagado que venció)
- **GIVEN** `rag-orchestrator` simulado respondiendo `504` desde `contracts/examples/rag-deadline-vencido.json`
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `504` con `error = DEADLINE_VENCIDO` y el `traceId` generado, sin el `message` de rag
- **AND** no se persiste ningún registro

### Requirement: Una sola tabla de mapeo de fallos de rag-orchestrator
`clinical-api` MUST mapear cada fallo de `POST /rag/query` en una única función (`mapearFalloRag()`, `[S1 resp. 12]`): `503 LOCAL_LLM_UNAVAILABLE` → `503 LOCAL_LLM_UNAVAILABLE`; `503 RETRIEVAL_UNAVAILABLE`, `503 NLI_UNAVAILABLE`, otros `422`, `401`, en el S1 también `409` y `429`, cualquier otro `5xx`, error de red o respuesta que no valida → `502 ERROR_SERVICIO_IA`. Ninguna fila SHALL persistir un `AIAnalysisRecord` ni reenviar el cuerpo, `message` o cabeceras de rag.

#### Scenario: El LLM local no disponible se responde como 503 sin registro [US-053 AC-4] [S1 resp. 12]
- **GIVEN** `rag-orchestrator` simulado respondiendo `503` desde `contracts/examples/rag-llm-local-no-disponible.json`
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** la respuesta es `503` con `error = LOCAL_LLM_UNAVAILABLE`, el `message` fijo de `error-llm-local-no-disponible.json` y el `traceId` generado, válida contra el spec de `clinical-api` (*helper* de L1D-164)
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
- **GIVEN** `rag-orchestrator` simulado respondiendo `401` (desde `rag-token-servicio-invalido.json`) en un caso y `500` con un cuerpo con texto interno sintético en otro
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

#### Scenario: Un 409 o un 429 de rag-orchestrator se responde en el S1 como 502 sin registro [US-053 AC-4] [S1 resp. 12] (asumido: corrección del Gate 1, 2ª vuelta, 2026-10-14; sus códigos propios llegan con US-041 y US-056)
- **GIVEN** `rag-orchestrator` simulado respondiendo `409` con un cuerpo sintético de catálogo en un caso y `429` con `Retry-After: 30` en otro
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre el paciente semilla (a)
- **THEN** ambas respuestas son `502` con `error = ERROR_SERVICIO_IA`, el `message` fijo de `error-servicio-ia.json` y `traceId`, válidas contra el spec de `clinical-api`, sin `Retry-After` ni el cuerpo de `rag-orchestrator`
- **AND** no existe fila en `clinical.ai_analysis_record` con esos `trace_id`

Regresión [409 de catálogo → 409] activa desde S2 (US-041). Regresión [RN-30 429 con `Retry-After`] activa desde S4 (US-056). Regresión [RN-12 503 y `llm_provider` local con datos reales] activa desde S6 (US-050).

### Requirement: Sin evidencia persistido con puntaje nulo
Cuando `rag-orchestrator` responde `status = sin_evidencia`, `clinical-api` MUST persistir el `AIAnalysisRecord` con `status = sin_evidencia`, `evidence_options = []` y `top_relevance_score IS NULL` (nunca `0.0`), y SHALL responder `200` con `topRelevanceScore = null`, `evidenceOptions = []` y `analysisBasis` presente (RN-02, readme §6.1 #1).

#### Scenario: Una pregunta sin evidencia responde 200 con puntaje nulo y queda registrada con NULL [US-053 AC-5] [RN-02] [readme §6.1 #1]
- **GIVEN** `rag-orchestrator` simulado respondiendo `status = sin_evidencia` para `Q-SIN`, construido desde `contracts/examples/rag-query-sin-evidencia.json`
- **WHEN** `doc1@test.local` envía `Q-SIN` sobre el paciente semilla (a)
- **THEN** la respuesta es `200` con `status = sin_evidencia`, `topRelevanceScore = null`, `evidenceOptions = []` y `analysisBasis` presente, válida contra el spec de `clinical-api`
- **AND** el registro persistido con ese `id` tiene `top_relevance_score IS NULL` y `analysis_basis` igual al `analysisBasis` respondido

### Requirement: El análisis no escribe eventos clínicos
Persistir un análisis de evidencia MUST NOT insertar filas en `clinical.clinical_event`: el análisis aparece en el timeline como evento derivado de `AIAnalysisRecord` (ADR-32, AC-11.4).

#### Scenario: El número de eventos clínicos del paciente no cambia tras un análisis [US-053 AC-6] [AC-11.4] [ADR-32]
- **GIVEN** el paciente semilla (a) y el recuento de sus filas en `clinical.clinical_event`
- **WHEN** se completa el análisis del AC-1 con respuesta `200`
- **THEN** el recuento de filas de `clinical.clinical_event` del paciente es el mismo que antes
- **AND** existe el `ai_analysis_record` del análisis

Regresión [AC-11.4 timeline con el evento derivado] activa desde S3 (US-088).

### Requirement: El 422 TIPO_CANCER_NO_REGISTRADO de rag-orchestrator conserva su código
`mapearFalloRag()` MUST traducir un `422` de `rag-orchestrator` con `error = TIPO_CANCER_NO_REGISTRADO` a `422 TIPO_CANCER_NO_REGISTRADO` de `clinical-api` con su mensaje fijo, no a `502`; SHALL NOT persistir un `AIAnalysisRecord` ni hacer eco del `message` de rag (`[S1 resp. 35]`).

#### Scenario: Un 422 TIPO_CANCER_NO_REGISTRADO de rag-orchestrator se responde como 422 con el mismo código y sin eco [US-053 AC-4] [S1 resp. 35]
- **GIVEN** `rag-orchestrator` simulado respondiendo `422` desde `contracts/examples/rag-tipo-cancer-no-registrado.json` (L1D-106) con un `message` con texto interno sintético
- **WHEN** se envía `Q-HER2`
- **THEN** la respuesta es `422` con `error = TIPO_CANCER_NO_REGISTRADO`, el `message` fijo de `error-tipo-cancer-no-registrado.json` y el `traceId` generado, válida contra el spec de `clinical-api` (*helper* de L1D-164), sin el texto interno de rag
- **AND** no se persiste ningún registro
