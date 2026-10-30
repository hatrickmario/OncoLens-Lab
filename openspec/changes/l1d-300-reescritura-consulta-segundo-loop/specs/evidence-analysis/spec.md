## MODIFIED Requirements

### Requirement: Sin evidencia sobre el umbral, respuesta sin invocar al LLM
Cuando ningún chunk supere el umbral de relevancia tras el primer loop, `POST /rag/query` MUST intentar a lo sumo un segundo loop de reescritura (RN-02 enmendado); si tampoco supera el umbral MUST responder `200` con `status = sin_evidencia`, `evidenceOptions = []`, `retrievalStats.aboveThreshold = 0` y `topRelevanceScore = null` (nunca `0.0`), sin invocar al LLM de generación ni al agente. La respuesta MUST validar contra `RagQueryInternalResponse`.

#### Scenario: Una pregunta sin evidencia en el corpus responde sin_evidencia y el LLM no se invoca [US-055 AC-2] [AC-10.4] [RN-02]
- **GIVEN** el corpus de prueba FX-06a-a, `RELEVANCE_THRESHOLD = 0.30` en la configuración de test y el adapter falso del LLM con contador de invocaciones (FX-06a-b)
- **WHEN** `clinical-api` envía `Q-SIN` ("¿Qué describe la evidencia sobre melanoma uveal?") a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `200` con `status = sin_evidencia`, `evidenceOptions = []`, `retrievalStats.aboveThreshold = 0` y `topRelevanceScore = null`
- **AND** el adapter del LLM de generación registra cero invocaciones (el de reescritura, como mucho una, según `QUERY_REWRITE_ENABLED`)
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Sin respuesta en el corpus tras el segundo loop responde sin_evidencia con una sola reescritura [US-238 AC-3] [AC-06.1] [RN-02]
- **GIVEN** `Q-SIN-RESPUESTA` (FX-06b-a: ni la pregunta ni su reescritura superan el umbral) y `QUERY_REWRITE_ENABLED = true`
- **WHEN** se procesa la consulta
- **THEN** responde `status = sin_evidencia` con `topRelevanceScore = null`
- **AND** el LLM de generación y el agente registran cero invocaciones y el LLM de reescritura exactamente una
- **AND** `meta.retrievalParams.queryRewrite = { applied: true, reason: "disparado" }`

## ADDED Requirements

### Requirement: Un segundo loop de reescritura rescata el primer loop vacío
Con cero chunks sobre el umbral en el primer loop y `QUERY_REWRITE_ENABLED = true`, el pipeline MUST invocar una vez la reescritura con el LLM local, recuperar de nuevo y, si algún chunk supera el umbral, continuar con la generación (FR-09). Con al menos un chunk sobre el umbral en el primer loop SHALL NOT invocarse.

#### Scenario: El segundo loop recupera un chunk y el pipeline genera [US-238 AC-1] [AC-06.1] [RN-02] [FR-09]
- **GIVEN** `Q-TYPO-SIN-EVIDENCIA` (FX-06b-a: `ch-m1-1` = 0,12 con la original y 0,74 con la reescritura, umbral 0,30) y `QUERY_REWRITE_ENABLED = true`
- **WHEN** se procesa la consulta
- **THEN** el primer loop no supera el umbral, la reescritura se invoca una vez y el segundo loop recupera al menos un chunk sobre el umbral
- **AND** el pipeline continúa con la generación y `meta.retrievalParams.queryRewrite = { applied: true, reason: "disparado" }`

#### Scenario: Con un chunk sobre el umbral la reescritura no se invoca [US-238 AC-2] [RN-02]
- **GIVEN** un primer loop con al menos un chunk sobre el umbral y el LLM falso de reescritura con contador
- **WHEN** se procesa la consulta
- **THEN** el contador de llamadas del LLM de reescritura es 0
- **AND** `meta.retrievalParams.queryRewrite = { applied: false, reason: "no_disparado" }`

### Requirement: El segundo loop está acotado y se configura
El segundo loop MUST ejecutarse como máximo `QUERY_REWRITE_MAX_ITERATIONS` veces, sin tercer loop, y `QUERY_REWRITE_ENABLED`, `QUERY_REWRITE_MAX_ITERATIONS` y `QUERY_REWRITE_DEADLINE_MS` SHALL leerse de configuración (RN-22).

#### Scenario: Un LLM que siempre reformula produce un solo segundo loop [US-238 AC-4] [RN-22]
- **GIVEN** `QUERY_REWRITE_MAX_ITERATIONS = 1` y un LLM falso que siempre propone otra reformulación
- **WHEN** se procesa una pregunta con el primer loop vacío
- **THEN** hay un solo segundo loop y no hay un tercero
- **AND** las tres claves se leen de la configuración, sin literales en código

### Requirement: Reescritura no disponible cae a sin_evidencia sin error
Si el LLM local está caído o vence `QUERY_REWRITE_DEADLINE_MS`, el servicio MUST responder `sin_evidencia` con la pregunta original, `meta.retrievalParams.queryRewrite = { applied: false, reason: "no_disponible" }`, sin `5xx` por esto y sin *fallback* a la nube (RN-12).

#### Scenario: LLM caído o vencido responde sin_evidencia [US-238 AC-5] [RN-12] (asumido)
- **GIVEN** el LLM local caído o vencido el `QUERY_REWRITE_DEADLINE_MS` y un primer loop vacío
- **WHEN** se procesa la pregunta
- **THEN** la respuesta es `200 sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disponible" }`
- **AND** ningún proveedor de nube es invocado

### Requirement: La consulta reescrita solo usa términos del catálogo
Los términos que la reescritura agregue MUST existir en el catálogo versionado (`CLINICAL_CATALOG_PATH`); los ausentes SHALL descartarse sin inventar códigos (RN-27). Si no queda ningún término admitido, no hay segunda recuperación y la respuesta es `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disponible" }`.

#### Scenario: Solo el término presente en el catálogo se usa [US-238 AC-6] [RN-27]
- **GIVEN** un LLM falso que propone expandir `CDK4/6` con `ribociclib` (en el catálogo) y `farmaco-inventado-x` (ausente)
- **WHEN** se arma la consulta del segundo loop
- **THEN** solo `ribociclib` se usa para recuperar y `farmaco-inventado-x` se descarta

#### Scenario: Sin términos del catálogo no hay segunda recuperación [US-238 AC-6] [RN-27]
- **GIVEN** un primer loop vacío y un LLM falso que solo propone `farmaco-inventado-x`
- **WHEN** se procesa la consulta
- **THEN** no hay segunda búsqueda en Milvus y responde `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disponible" }`

### Requirement: La pregunta original manda sobre la reescritura
La reescritura MUST cambiar solo el vector enviado a Milvus: el reranker puntúa contra la pregunta original (el umbral se compara con ese puntaje) y la respuesta y el `AIAnalysisRecord` conservan la pregunta original (RN-03, RN-06).

#### Scenario: Pregunta mostrada, guardada y puntuada es la original [US-238 AC-7] [RN-03] [RN-06]
- **GIVEN** el caso de `Q-TYPO-SIN-EVIDENCIA` rescatado por el segundo loop
- **WHEN** se completa la respuesta
- **THEN** la pregunta mostrada y guardada es la original y el reranker puntuó los chunks del segundo loop contra ella
- **AND** la reescritura solo cambió el vector enviado a Milvus

### Requirement: La reescritura no filtra PII ni usa proveedores no locales
El prompt de reescritura MUST contener exactamente la pregunta recibida por `rag-orchestrator` (ya enmascarada por `clinical-api`, RN-11), sin `clinicalContext`, `pseudoPatientId` ni memoria rotulada; el proveedor SHALL ser local y los logs MAY registrar recuentos, `rewriteApplied`, `reason`, `latencyMs` y `chunkId`, pero MUST NOT registrar el texto de la pregunta, de la consulta reescrita, de un fragmento, del *prompt* ni la salida del LLM (RN-10, RN-12).

#### Scenario: El prompt de reescritura es solo la pregunta recibida y los logs no llevan texto [US-238 AC-8] [RN-10] [RN-11] [RN-12]
- **GIVEN** una petición a `/rag/query` con `clinicalContext` y `pseudoPatientId` no vacíos, primer loop vacío, proveedor local y el fake de `QueryRewriter` que captura su *prompt*
- **WHEN** se invoca la reescritura
- **THEN** la pregunta incluida en el *prompt* capturado es exactamente la `query` recibida, y el *prompt* no contiene `clinicalContext`, el `pseudoPatientId` ni memoria rotulada
- **AND** ningún proveedor de nube es invocado
- **AND** los logs contienen `rewriteApplied`, `reason` y `latencyMs` y ningún texto de pregunta, reescritura, fragmento, *prompt* ni salida del LLM

#### Scenario: La PII sembrada en la pregunta llega enmascarada a rag-orchestrator [US-238 AC-8] [US-049] [RN-11]
- **GIVEN** `clinical-api` con una pregunta del doctor que contiene PII sembrada y MSW capturando el request saliente a `POST /rag/query`
- **WHEN** se ejecuta el análisis
- **THEN** la `query` capturada trae la PII enmascarada (regresión de US-049 en `clinical-api`, que es quien enmascara)

### Requirement: queryRewrite se emite siempre y sin nulos; el segundo loop solo corre en /rag/query
`meta.retrievalParams.queryRewrite` MUST emitirse sin `null` en toda respuesta de `/rag/query` y `/rag/follow-up`. El segundo loop SHALL correr solo en `/rag/query`; `/rag/follow-up` MUST emitir `{applied: false, reason: "no_aplica"}` sin invocar la reescritura, así la memoria rotulada nunca llega a ese *prompt* (RN-24). Con `QUERY_REWRITE_ENABLED = false` SHALL emitirse `no_disparado`.

#### Scenario: El seguimiento declara no_aplica y no invoca la reescritura [US-238] [RN-24] [decisión D-c]
- **GIVEN** el armado de `retrievalParams` para una respuesta de `/rag/follow-up` y el fake de `QueryRewriter` con contador
- **WHEN** se arma la respuesta (en integración si la ruta ya existe; si no, sobre `_armar_meta_de_recuperacion` y el ejemplo `rag-follow-up-response.json`)
- **THEN** `meta.retrievalParams.queryRewrite = { applied: false, reason: "no_aplica" }`
- **AND** el contador de `QueryRewriter` es 0

#### Scenario: Reescritura desactivada se traza como no disparada [US-238 AC-4] [RN-22]
- **GIVEN** `QUERY_REWRITE_ENABLED = false` y un primer loop vacío
- **WHEN** se procesa la consulta
- **THEN** responde `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disparado" }` y el contador de `QueryRewriter` es 0

Regresión [RN-02] activa desde S3 (US-055): el escenario original de `Q-SIN` se conserva. Regresión [RN-03] (US-055) y [RN-10, RN-11, RN-12] (US-049) siguen en verde.
