# evidence-analysis Specification

## Purpose
Define las reglas verificables de la generación del análisis de evidencia en `rag-orchestrator`: cada afirmación y opción mostrada cita un chunk recuperado en esa consulta y copia sus metadatos del catálogo (RN-01, RN-04, RN-25), sin citar análisis previos (RN-24).

## Requirements

### Requirement: Campos de la cita copiados del corpus, nunca del texto generado
Cada `CitedSource` de una opción MUST construirse desde el catálogo del corpus y el chunk recuperado en esta consulta; el LLM SHALL aportar solo el `chunkId`. `title`, `sourceName`, `externalId`, `language`, `sourceType` y el resto de metadatos MUST copiarse del catálogo, y `chunkTextSnapshot` MUST ser el texto del chunk en el corpus (RN-04, AC-T1.3).

#### Scenario: La cita de una opción válida lleva los datos del corpus [US-063 AC-1] [AC-T1.3] [RN-04] [OL-02]
- **GIVEN** el corpus de prueba FX-06a-a, `Q-HER2` con contexto de mama y el generador falso `LLM-OK` (`FakeEvidenceGenerator`, FX-06a-b)
- **WHEN** `POST /rag/query` valida la respuesta del LLM
- **THEN** `evidenceOptions[0].citedSources[0]` tiene `title = "Breast Cancer Treatment (test)"`, `sourceName = "NCI PDQ"`, `externalId = "CDR-TEST-001"`, `language = en` y `sourceType = guideline`
- **AND** `chunkTextSnapshot` es igual al texto de `ch-m1-1` en el corpus
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Los metadatos factuales de la cita son las columnas del catálogo [US-127 AC-1] [AC-T1.3] [RN-25]
- **GIVEN** el schema `corpus` de test con `doc-a1` de FX-08b-a (ECA fase III, `metadata_source = fuente_estructurada`) con `study_design`, `trial_phase`, `primary_endpoint`, `sample_size`, `published_at`, `last_updated_at` y `guideline_version` sembrados con valores no nulos, y un generador falso cuya opción cita un chunk de `doc-a1`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** el `CitedSource` de esa opción trae `studyDesign`, `trialPhase`, `primaryEndpoint`, `sampleSize`, `publishedAt`, `lastUpdatedAt` y `guidelineVersion` iguales, campo a campo, a las columnas de `corpus_document` de `doc-a1`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

### Requirement: Metadatos de fuente inventados por el LLM se ignoran
Cualquier metadato de fuente incluido por el LLM en una cita MUST descartarse y SHALL NOT aparecer en ningún campo de la respuesta, incluidas `discardedOptions` (RN-04).

#### Scenario: Un título y una fuente inventados se reemplazan por los del corpus [US-063 AC-4] [AC-T1.3] [RN-04]
- **GIVEN** FX-06a-a, `Q-HER2` y el generador falso `LLM-TITULO-FALSO`, que cita `ch-m1-1` con `title = "Guía NCCN 2026"` y `sourceName = "NCCN"`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la cita conserva `title = "Breast Cancer Treatment (test)"` y `sourceName = "NCI PDQ"` del corpus
- **AND** la cadena "Guía NCCN 2026" no aparece en ninguna parte de la respuesta serializada

#### Scenario: Un tamaño de muestra y una fase inventados se reemplazan por los del catálogo [US-127 AC-2] [RN-25] [RN-04]
- **GIVEN** `doc-a1` de FX-08b-a en el schema `corpus` de test y un generador falso que cita un chunk de `doc-a1` e incluye en la cita `sampleSize = 9999` y `trialPhase = "IV"`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la cita conserva `sampleSize` y `trialPhase` de las columnas `sample_size` y `trial_phase` de `doc-a1`
- **AND** ni `9999` ni `"IV"` aparecen en ningún campo de la cita, de `evidenceOptions` ni de `discardedOptions`

### Requirement: Texto de la cita en su idioma original
`chunkTextSnapshot` y `language` MUST conservar el texto y el idioma del corpus, sin traducción, cualquiera que sea el idioma de la pregunta (RN-04; traducción fuera del MVP, `[S1 resp. 8]`).

#### Scenario: Una pregunta en español conserva la cita en inglés [US-063 AC-6] [RN-04]
- **GIVEN** FX-06a-a, `Q-HER2` formulada en español y el generador falso `LLM-OK`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `chunkTextSnapshot` es el texto en inglés de `ch-m1-1`, sin traducir, y `language = en`

### Requirement: Solo son citables los chunks recuperados en esta consulta
Una cita MUST apuntar a un `chunkId` del conjunto de chunks recuperados en esta consulta (sobre el umbral y entregados a la generación); toda cita fuera de ese conjunto SHALL quitarse de la opción. Una opción sin ninguna cita válida MUST ir a `discardedOptions` con `discardReason = cita_invalida` y no aparecer en `evidenceOptions` (RN-01, AC-T1.2). Regresión [RN-24] activa desde S4: un análisis previo nunca está en ese conjunto.

#### Scenario: Una opción que cita un chunk no recuperado se descarta [US-063 AC-2] [AC-T1.2] [RN-01] [OL-02]
- **GIVEN** FX-06a-a, `Q-HER2` y el generador falso `LLM-CITA-AJENA`, cuya única opción cita `ch-x-999` (no recuperado)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción no está en `evidenceOptions`
- **AND** aparece en `discardedOptions` con `discardReason = cita_invalida`

#### Scenario: Una cita mixta conserva la opción con solo la cita válida [US-063 AC-5] [RN-01] [OL-02]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso cuya opción cita `ch-m1-1` y `ch-x-999`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción queda en `evidenceOptions` con una sola cita, de `chunkId` `ch-m1-1`

### Requirement: Una opción sin citas se descarta
Una opción devuelta por el LLM con `citedSources` vacío MUST ir a `discardedOptions` con `discardReason = sin_citas` y SHALL NOT aparecer en `evidenceOptions` (RN-01, AC-10.4).

#### Scenario: Una opción con citedSources vacío va a descartadas [US-063 AC-3] [AC-10.4] [RN-01]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que devuelve una opción con `citedSources = []`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción está en `discardedOptions` con `discardReason = sin_citas` y no en `evidenceOptions`

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

### Requirement: Umbral de relevancia en configuración
El umbral que separa la evidencia relevante de la que no lo es MUST leerse de la clave de configuración `RELEVANCE_THRESHOLD` (RN-22, TBD-03), nunca de un literal en código, y SHALL aparecer en `meta.retrievalParams.relevanceThreshold` de cada respuesta.

#### Scenario: Un umbral más alto convierte una pregunta con evidencia en sin_evidencia [US-055 AC-5] [RN-22] [TBD-03]
- **GIVEN** FX-06a-a y `RELEVANCE_THRESHOLD = 0.90` en la configuración del test
- **WHEN** se procesa `Q-HER2` con contexto de mama
- **THEN** responde `status = sin_evidencia` con `meta.retrievalParams.relevanceThreshold = 0.90`
- **AND** el adapter del LLM registra cero invocaciones

### Requirement: Recuperación solo de chunks vigentes
La búsqueda en Milvus de `/rag/query` MUST filtrar `is_current == true`; un chunk no vigente SHALL quedar fuera de los candidatos del *reranker* y de las citas, aunque su similitud sea mayor (RN-05, ADR-5).

#### Scenario: La versión anterior de un documento no llega al reranker [US-055 AC-3] [RN-05] [ADR-5]
- **GIVEN** la colección de test con `ch-m1-1` (vigente) y `ch-m1v0-1` (mismo `version_group_id`, `is_current = false`, puntaje 0,91)
- **WHEN** se procesa `Q-HER2` y se ejecuta la búsqueda en Milvus
- **THEN** la expresión de filtro enviada a Milvus incluye `is_current == true`
- **AND** `ch-m1v0-1` no aparece entre los candidatos que recibe el *reranker* ni en ninguna cita de la respuesta

### Requirement: Recuperación filtrada por el tipo de cáncer del caso
La búsqueda en Milvus de `/rag/query` MUST filtrar por `cancer_type_tags` con el tipo de cáncer de `clinicalContext.diagnosis.cancerType`; un chunk de otro tipo de cáncer SHALL quedar fuera de los candidatos (OL-02, AC-06.1).

#### Scenario: Un chunk de próstata no es candidato para un caso de mama [US-055 AC-4] [AC-06.1] [OL-02]
- **GIVEN** FX-06a-a, con `ch-p1-1` etiquetado como próstata, y un `clinicalContext` sintético con `diagnosis.cancerType = "mama"`
- **WHEN** se procesa `Q-HER2`
- **THEN** la expresión de filtro enviada a Milvus restringe `cancer_type_tags` a mama
- **AND** `ch-p1-1` no aparece entre los candidatos que recibe el *reranker*

### Requirement: relevanceScore determinista, acotado y versionado
`relevanceScore` MUST ser el puntaje del *reranker* normalizado a [0,1], idéntico para la misma pregunta y los mismos chunks, y `meta.rerankerModel` SHALL registrar la versión exacta del *reranker* (RN-03, IA-07, ADR-8). Es un metadato secundario: no ordena opciones ni mide solidez clínica.

#### Scenario: Dos cálculos sobre la misma entrada dan el mismo puntaje y registran el reranker [US-055 AC-6] [IA-07] [ADR-8] [OL-02]
- **GIVEN** los mismos chunks de FX-06a-a, la misma pregunta `Q-HER2` y el *reranker* falso con puntajes fijos
- **WHEN** se calcula `relevanceScore` dos veces
- **THEN** ambos valores son idénticos y están en [0,1]
- **AND** la respuesta de `/rag/query` lleva en `meta.rerankerModel` la versión configurada del *reranker*

### Requirement: Recuperación no disponible falla cerrada con RETRIEVAL_UNAVAILABLE
Si Milvus o el adapter de *embeddings* lanzan un error o no responden, `POST /rag/query` MUST responder `503` con `error = "RETRIEVAL_UNAVAILABLE"` (schema `ErrorRecuperacionNoDisponible`, alternativa del `oneOf` del `503`, código cerrado y sin eco) y SHALL NOT invocar al LLM ni devolver una respuesta parcial (`[S1 resp. 12]`). El `message` es genérico y no incluye URL, *host* ni detalle del motor.

#### Scenario: Milvus caído responde 503 RETRIEVAL_UNAVAILABLE sin invocar al LLM [S1 resp. 12]
- **GIVEN** FX-06a-a con el puerto de búsqueda (Milvus) configurado para lanzar un error y el adapter falso del LLM con contador de invocaciones (FX-06a-b)
- **WHEN** `clinical-api` envía `Q-HER2` con contexto de mama a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `503` con `error = "RETRIEVAL_UNAVAILABLE"`, `message` y `traceId`
- **AND** el adapter del LLM registra cero invocaciones
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

#### Scenario: El adapter de embeddings caído responde 503 RETRIEVAL_UNAVAILABLE [S1 resp. 12]
- **GIVEN** FX-06a-a con el adapter falso de *embeddings* configurado para lanzar un error
- **WHEN** se procesa `Q-HER2` con contexto de mama
- **THEN** responde `503` con `error = "RETRIEVAL_UNAVAILABLE"` y el cuerpo no contiene el texto de la pregunta

### Requirement: Contexto sin tipo de cáncer responde 422 sin buscar
Cuando `clinicalContext.diagnosis` es `null`, `POST /rag/query` MUST responder `422` con `error = TIPO_CANCER_NO_REGISTRADO` sin generar *embeddings*, consultar Milvus ni invocar al LLM, y SHALL NOT responder `sin_evidencia`: sin tipo de cáncer no hay filtro de `cancer_type_tags` (OL-02). Defensa en profundidad del corte de `clinical-api` (`[S1 resp. 35]`).

#### Scenario: Un contexto sin diagnóstico responde 422 TIPO_CANCER_NO_REGISTRADO sin buscar ni invocar al LLM [S1 resp. 35] [OL-02]
- **GIVEN** FX-06a-a, un `clinicalContext` sintético con `diagnosis = null` y los adapters falsos de *embeddings*, búsqueda y del LLM con contador de invocaciones
- **WHEN** se procesa `Q-HER2`
- **THEN** responde `422` con `error = "TIPO_CANCER_NO_REGISTRADO"`, `message` y `traceId`, y el cuerpo no contiene el texto de la pregunta
- **AND** el adapter de *embeddings*, el puerto de búsqueda y el adapter del LLM registran cero invocaciones
- **AND** la respuesta valida contra el `422` de `/rag/query` del `openapi.yaml` del proveedor y no es un `RagQueryInternalResponse` con `status = sin_evidencia`

### Requirement: Soporte NLI por afirmación contra los chunks citados
Cada afirmación atómica de una opción con citas válidas MUST evaluarse con el adapter NLI, con el `chunkTextSnapshot` de los chunks que ella cita como premisa y el texto de la afirmación sin el marco de atribución como hipótesis (RN-01, FR-10, IA-04). Una afirmación SHALL estar soportada solo si algún chunk citado da `entailment` con probabilidad ≥ umbral; `neutral` y `contradiction` nunca soportan.

#### Scenario: Una opción con su justificación implicada por el chunk citado queda en evidenceOptions [US-064 AC-1] [AC-T1.2] [RN-01] [FR-10]
- **GIVEN** el corpus de prueba FX-06a-a, `Q-HER2`, el LLM falso `LLM-OK` (opción que cita `ch-m1-1`) y el NLI falso en `entailment` (FX-06a-b), con `NLI_ENTAILMENT_THRESHOLD` en la configuración de test
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción queda en `evidenceOptions`
- **AND** el adapter NLI se invocó con el texto de `ch-m1-1` como premisa y cada afirmación de la justificación como hipótesis
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Una afirmación contradicha por el chunk citado descarta la opción [US-064 AC-4] [RN-01] [IA-04]
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK` y un NLI falso que devuelve `contradiction` para la afirmación `principal` de la opción (las demás en `entailment`)
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción no está en `evidenceOptions`
- **AND** está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`

#### Scenario: Regresiones activas del soporte NLI [RN-24] [RN-01]
- **GIVEN** la suite de regresión del soporte por afirmación
- **WHEN** se ejecuta
- **THEN** la Regresión [RN-24] está activa desde el S4
- **AND** la Regresión [RN-01] (datos del paciente, ADR-34) está activa desde el S2

### Requirement: Opción con una afirmación sin soporte va a descartadas
La verificación MUST aplicar la regla por papel: una afirmación `principal` o `salvedad` sin soporte lleva la opción a `discardedOptions` con `discardReason = afirmacion_sin_soporte`, sin aparecer en `evidenceOptions`, y `unsupportedClaims` lista su texto; una `secundaria` sin soporte se omite, suma 1 a `omittedClaims` y no aparece en ningún campo (RN-01, FR-10, AC-T1.2, AC-10.4, `[S4 resp. 2]`). La descartada es solo para revisión del oncólogo, no una opción.

#### Scenario: Una opción con una cifra que la fuente no respalda va a descartadas con su afirmación [US-064 AC-2] [AC-T1.2] [RN-01] [FR-10] [HU-03]
- **GIVEN** FX-06a-a, `Q-HER2` y el LLM falso `LLM-SIN-SOPORTE` (cita `ch-m1-1` con la afirmación principal "reduce la mortalidad a la mitad"), y el NLI falso en `neutral` para esa afirmación
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []`
- **AND** la opción está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["reduce la mortalidad a la mitad"]`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Una secundaria sin soporte se omite y la opción se conserva [US-245 AC-2] [RN-01] [AC-T1.2]
- **GIVEN** `Q-HER2` y `LLM-ATOM-SEC` (secundaria en `neutral`; principal y salvedad en `entailment`)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 sigue en `evidenceOptions` sin esa afirmación
- **AND** `omittedClaims = 1`
- **AND** el texto de la secundaria no aparece en ningún campo de la respuesta serializada

#### Scenario: Una principal sin soporte descarta la opción con su afirmación [US-245 AC-3] [FR-10] [AC-10.4]
- **GIVEN** `Q-HER2` y `LLM-ATOM-PRIN` (principal en `neutral`)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `evidenceOptions = []`
- **AND** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims` con la principal

#### Scenario: Una salvedad sin soporte descarta la opción [US-245 AC-4] [RN-01]
- **GIVEN** `Q-HER2` y `LLM-ATOM-SALV` (salvedad en `neutral`; principal y secundaria en `entailment`)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** la opción no aparece en `evidenceOptions`: una opción nunca se muestra más fuerte que su fuente

#### Scenario: Afirmación fuera de forma o con modal normativo [RN-01] [RN-23]
- **GIVEN** una afirmación sin soporte que está fuera de forma (alias, longitud o modal normativo)
- **WHEN** la verificación arma `unsupportedClaims`
- **THEN** lista el literal «(texto no mostrado)» en lugar de su texto
- **AND** una afirmación con modal normativo descarta la opción sea cual sea su papel (D-a)

### Requirement: Limitación propuesta sin soporte se omite y se cuenta
Si el generador propone una limitación (en el S1 el LLM no las genera, `[S1 resp. 11]`; la regla se prueba con un generador falso), MUST evaluarse con el NLI contra los chunks entregados a la generación; sin soporte SHALL omitirse por completo y MUST sumar 1 a `omittedClaims` (FR-10, RN-01, AC-T1.2). Una limitación soportada MUST conservarse con `origin = llm_verificado`.

#### Scenario: Una limitación sin soporte se omite y cuenta en omittedClaims [US-064 AC-3] [AC-T1.2] [FR-10] [RN-01]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que propone una limitación redactada sin soporte, con el NLI falso en `neutral` para ella
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `limitations = []`
- **AND** el texto de la limitación no aparece en ningún campo de la respuesta serializada
- **AND** `omittedClaims = 1`

### Requirement: Umbral de soporte NLI en configuración
La probabilidad mínima de `entailment` que cuenta como soporte MUST leerse de la clave de configuración `NLI_ENTAILMENT_THRESHOLD` (RN-22, IA-04), nunca de un literal en código; un `entailment` con probabilidad menor que el umbral SHALL tratarse como sin soporte.

#### Scenario: Un entailment por debajo del umbral no es soporte [US-064 AC-5] [RN-22] [IA-04]
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK`, `NLI_ENTAILMENT_THRESHOLD = 0.7` en la configuración de test y un NLI falso que devuelve `entailment` con probabilidad 0,55
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción no está en `evidenceOptions`
- **AND** está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`

### Requirement: NLI no disponible falla cerrado
Si el adapter NLI lanza un error o no responde, `POST /rag/query` MUST responder `503` con `error = "NLI_UNAVAILABLE"` (schema `ErrorNliNoDisponible`, alternativa del `oneOf` del `503` de L1D-106, código cerrado y sin eco, `[S1 resp. 12]`) y SHALL NOT devolver ninguna opción, afirmación ni respuesta parcial sin validar (RN-01; falla cerrada asumida y aceptada, `[S1 resp. 3]`). Sin *fallback* a otro proveedor (RN-12).

#### Scenario: Un fallo del NLI responde 503 NLI_UNAVAILABLE sin opciones [US-064 AC-6] [RN-01] (asumido: falla cerrada, aceptado [S1 resp. 3])
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK` y el adapter NLI falso configurado para lanzar un error
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la respuesta es `503` con `error = "NLI_UNAVAILABLE"`, `message` y `traceId`
- **AND** el cuerpo no contiene `evidenceOptions` ni el texto de la opción o de su justificación
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

#### Scenario: Un fallo del NLI con afirmaciones atómicas no devuelve ninguna opción [US-245 AC-8] [RN-01] (regresión de US-064 AC-6)
- **GIVEN** `Q-HER2`, `LLM-ATOM-OK` y el adapter NLI falso configurado para lanzar un error
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** responde `503` con `error = "NLI_UNAVAILABLE"`
- **AND** ninguna opción ni afirmación se devuelve sin validar

### Requirement: Términos prescriptivos generados nunca se devuelven
Antes de la validación de forma y del NLI, la `option`, cada afirmación atómica de la opción y cada limitación propuesta MUST pasar `checkProhibitedTerms` (nivel A, `[S1 resp. 15]`) solo sobre los campos generados de `CAMPOS_GENERADOS`. El texto se reemplaza siempre por el literal de retiro (RN-23, `[S1 resp. 16]`, `[S4 resp. 11]`). `lenguaje_no_permitido` queda reservado a los términos de esa lista; un modal normativo fuera de ella sigue la regla de forma (D-a).

#### Scenario: Una justificación prescriptiva descarta la opción y el término no sale en la respuesta [US-064 AC-7] [RN-23] [RN-01] [§15 resp. 2]
- **GIVEN** FX-06a-a, `Q-HER2`, un LLM falso cuya justificación de la opción contiene "recomendado para este paciente" y el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []`
- **AND** la opción está en `discardedOptions` con `discardReason = lenguaje_no_permitido` (desde S4, `[S4 resp. 11]`; antes `afirmacion_sin_soporte`)
- **AND** la afirmación retirada figura en `unsupportedClaims` y en la justificación de la descartada como "[afirmación retirada: formulación no permitida]"
- **AND** `checkProhibitedTerms` sobre los campos generados de la respuesta (`option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis`; `CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`, excluidos los copiados del corpus) devuelve cero coincidencias

#### Scenario: Una limitación prescriptiva se omite y cuenta en omittedClaims [US-064 AC-8] [RN-23] [§15 resp. 2]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que propone una limitación con "debe recibir", con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `limitations = []` y `omittedClaims = 1`
- **AND** `checkProhibitedTerms` sobre los campos generados de la respuesta (`CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`) devuelve cero coincidencias

#### Scenario: Una afirmación secundaria prescriptiva descarta la opción con lenguaje_no_permitido [US-245 AC-6] [RN-23] [§15 resp. 2]
- **GIVEN** `Q-HER2` y `LLM-ATOM-PRESC`, cuya secundaria contiene «recomendado para este paciente», con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = lenguaje_no_permitido`
- **AND** `checkProhibitedTerms` sobre la respuesta serializada completa devuelve cero coincidencias

#### Scenario: Término prohibido en una afirmación de la opción [RN-23]
- **GIVEN** una afirmación de la opción que contiene un término de la lista de términos prohibidos
- **WHEN** pasa `checkProhibitedTerms`
- **THEN** la opción va a `discardedOptions` con `discardReason = lenguaje_no_permitido`
- **AND** esa razón precede a `afirmacion_sin_soporte`, incluidos los modales que están en la lista

#### Scenario: Término prohibido en una limitación [RN-23]
- **GIVEN** una limitación propuesta que contiene un término de la lista de términos prohibidos
- **WHEN** pasa `checkProhibitedTerms`
- **THEN** la limitación se omite y se cuenta

#### Scenario: lenguaje_no_permitido queda reservado a la lista [RN-23]
- **GIVEN** un modal normativo que no está en la lista de términos prohibidos
- **WHEN** se valida la afirmación
- **THEN** sigue la regla de forma (D-a) y no produce `lenguaje_no_permitido`

### Requirement: El retiro por lenguaje se registra sin el texto retirado
Por cada fragmento retirado por términos prohibidos, `rag-orchestrator` MUST registrar en el log el `ruleId` de la regla coincidente y la versión de la política de lenguaje (`version` de `terminos-prohibidos.json`), y SHALL NOT registrar el texto retirado ni el término (`[S1 resp. 29]`). La traza completa persistida es de US-150 (S6).

#### Scenario: Un fragmento retirado por lenguaje registra ruleId y versión de la política sin su texto [S1 resp. 29] [RN-23] [RN-10]
- **GIVEN** FX-06a-a, `Q-HER2`, un LLM falso cuya justificación de la opción contiene "recomendado para este paciente", el NLI falso en `entailment` y la captura de logs activa
- **WHEN** `POST /rag/query` valida la opción
- **THEN** los logs contienen un evento `fragmento_retirado_lenguaje` con el `traceId`, `campo = rationale`, `ruleId` igual al `id` de la entrada coincidente de `terminos-prohibidos.json` y `languagePolicyVersion` igual a la `version` de `terminos-prohibidos.json`
- **AND** ningún registro de log contiene "recomendado para este paciente", el texto de la justificación, de la opción ni de la pregunta

### Requirement: Con evidencia sobre el umbral, respuesta con_evidencia en el contrato final
Cuando al menos un chunk supere `RELEVANCE_THRESHOLD`, `POST /rag/query` MUST invocar al LLM local vía `EvidenceGenerator`, validar las opciones antes de devolverlas (RN-01) y responder `200` con `status = con_evidencia` en la forma final de `RagQueryInternalResponse` (FR-25, ADR-26). Sin *fallback* a la nube (RN-12). Síntesis, `agentSteps`, `applicability` y `limitations` SHALL poblarse según el escenario de alcance.

#### Scenario: Una pregunta con evidencia devuelve una opción citada en el contrato final [US-225 AC-1] [AC-10.1] [OL-02] [FR-25] [ADR-26]
- **GIVEN** el corpus de prueba FX-06a-a con `RELEVANCE_THRESHOLD = 0.30`, `CorpusRelease rel-test-1` con `cutoff_date = 2026-09-30`, el LLM falso `LLM-OK` y el NLI falso en `entailment` (FX-06a-b), un `clinicalContext` sintético de mama y un catálogo clínico de test sin criterios de aplicabilidad (`items: []` en `aplicabilidad.json` de mama; cambio de spec declarado de L1D-127, no una relajación del test)
- **WHEN** `clinical-api` envía `Q-HER2` a `POST /rag/query` con un JWT de servicio válido y `maxOptions = 1`
- **THEN** responde `200` con `status = con_evidencia` y exactamente 1 elemento en `evidenceOptions`, con `citedSources[0].chunkId = "ch-m1-1"` y `relevanceScore = 0.87`
- **AND** `topRelevanceScore = 0.87` (máximo de los chunks sobre el umbral)
- **AND** `synthesis.agreements = []`, `synthesis.discrepancies = []`, `applicability = []`, `agentSteps = []` y `meta.corpusCutoffDate = 2026-09-30`
- **AND** con la salida del *fixture* `LLM-OK`, `limitations = []` y `omittedClaims = 0`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Alcance de los campos de la respuesta con evidencia [FR-25] [S1 resp. 11] [RN-12]
- **GIVEN** una respuesta `con_evidencia`
- **WHEN** se arma la respuesta final
- **THEN** en el S1 la síntesis y `agentSteps` van vacíos
- **AND** `applicability` va vacío solo si el catálogo clínico del tipo de cáncer no declara criterios de aplicabilidad; con el catálogo real (6 criterios por tipo desde L1D-126) trae la aplicabilidad por fuente de la capacidad `applicability` (L1D-127)
- **AND** `limitations` solo trae limitaciones de regla o verificadas: el LLM no las genera en el S1

### Requirement: relevanceScore de opción y topRelevanceScore con evidencia
`topRelevanceScore` MUST ser el máximo de los chunks sobre el umbral, calculado por `top_relevance_score()` (`[S1 resp. 18]`). El `relevanceScore` de cada opción SHALL ser el del *reranker* para su cita válida más relevante (la cita principal): un metadato de esa cita, no una medida de la opción ni de su solidez clínica (RN-03).

#### Scenario: La opción hereda el puntaje de su cita más relevante [RN-03] [S1 resp. 18]
- **GIVEN** FX-06a-a, `Q-HER2` con contexto de mama, el NLI falso en `entailment` y un LLM falso cuya única opción cita `ch-inj-1` (0,40) y `ch-m1-1` (0,87)
- **WHEN** se procesa la consulta
- **THEN** `evidenceOptions[0].relevanceScore = 0.87`
- **AND** `topRelevanceScore = 0.87`

### Requirement: Pregunta no terapéutica con evidencia responde con_evidencia sin opciones
Cuando hay chunks sobre el umbral pero el LLM no propone ninguna opción, `POST /rag/query` MUST responder `status = con_evidencia` con `evidenceOptions = []` y `topRelevanceScore` numérico; SHALL NOT responder `sin_evidencia`, porque hubo evidencia relevante y el LLM se invocó (AC-05.3).

#### Scenario: Una pregunta de toxicidad sin opciones terapéuticas responde con_evidencia vacío tras una invocación del LLM [US-225 AC-2] [AC-05.3]
- **GIVEN** FX-06a-a, `RELEVANCE_THRESHOLD = 0.30` y el LLM falso `LLM-SIN-OPCIONES` con contador de invocaciones
- **WHEN** se procesa `Q-TOX` ("¿Qué toxicidad cardiaca describe la evidencia con terapia anti-HER2?") con contexto de mama
- **THEN** responde `200` con `status = con_evidencia` y `evidenceOptions = []`
- **AND** el adapter del LLM registra exactamente una invocación
- **AND** la respuesta valida contra `RagQueryInternalResponse`

### Requirement: Recorte de opciones validadas a maxOptions
Tras la validación de citas (RN-01, RN-04) y de soporte NLI y lenguaje (RN-23), el pipeline MUST conservar como máximo `maxOptions` opciones (FR-09; 1 en S1–S3 y hasta 3 desde el S4), valor que `clinical-api` envía desde su configuración (RN-22). El orden SHALL aplicarse después de la validación y antes del recorte: una opción descartada (`discardedOptions`) nunca ocupa una posición.

#### Scenario: Con maxOptions 1 y dos opciones válidas queda la más relevante y la otra no es descartada [US-225 AC-3] [FR-09] [RN-28]
- **GIVEN** FX-06a-a, `maxOptions = 1`, el LLM falso `LLM-DOS` (opción que cita `ch-m1-1`, 0,87, y opción "Terapia anti-HER2 sola" que cita `ch-inj-1`, 0,40), el NLI falso en `entailment` y un pipeline sin aplicabilidad calculada (`applicability = []`)
- **WHEN** se procesa `Q-HER2` con contexto de mama
- **THEN** `evidenceOptions` tiene 1 elemento: la opción con `relevanceScore = 0.87`
- **AND** "Terapia anti-HER2 sola" no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igual relevanceScore el desempate es el chunkId de la cita principal [FR-09] [RN-28]
- **GIVEN** `recortar_a_max_opciones()` con `max_options = 1` y dos opciones validadas sin aplicabilidad (`aplicabilidad = None`) con `relevanceScore = 0.60`, cuyas citas principales son `ch-b` y `ch-a`, en ese orden de aparición
- **WHEN** se aplica el recorte
- **THEN** se conserva la opción cuya cita principal es `ch-a`, cualquiera que sea el orden de aparición

#### Scenario: Con maxOptions 1 la opción conservada es la más aplicable y no la más relevante [US-125 AC-5] [AC-10.1] [FR-09] [RN-28] [RN-22]
- **GIVEN** FX-08b-b con A-M1, `maxOptions = 1`, `RELEVANCE_THRESHOLD = 0.30`, el LLM falso `LLM-DOS-APL` (O-A cita `ch-a4-1`, 1 excluyente en No coincide, relevancia 0,92; O-B cita `ch-a1-1`, 0 excluyentes, relevancia 0,70) y el NLI falso en `entailment`
- **WHEN** `clinical-api` envía la consulta a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `200` con `evidenceOptions` de 1 elemento: O-B
- **AND** O-A no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** O-B trae `applicabilitySummary = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }` (`estadio` queda `desconocido` con `unknownReason = sin_regla_de_comparacion`: el catálogo de test no define cómo comparar el estadio) y `perSource` con `doc-a1`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igualdad de conteos la relevancia desempata la opción única [US-125 AC-6] [AC-10.1] [RN-28] [RN-03]
- **GIVEN** FX-08b-b, `maxOptions = 1` y el LLM falso `LLM-EMPATE-APL` (O-B cita `ch-a1-1` y O-D cita `ch-a6-1`, ambas con 0 excluyentes en No coincide y 2 en Coincide, `doc-a6` estructurado con la población de `doc-a1`; relevancia 0,70 y 0,60)
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` tiene 1 elemento: O-B

#### Scenario: Una opción descartada por soporte nunca ocupa la posición aunque sea la más aplicable [US-125 AC-7] [RN-01] [FR-10] [RN-28]
- **GIVEN** FX-08b-b, `maxOptions = 1` y el LLM falso `LLM-SIN-SOPORTE-APL` (O-B' cita `ch-a1-1`, más aplicable, con su afirmación `principal` en `neutral` según el NLI falso; O-A cita `ch-a4-1` con todas sus afirmaciones en `entailment`)
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` = [O-A]
- **AND** O-B' aparece en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** O-A conserva `populationNotComparable = true` y `warnings` con `poblacion_no_comparable` (el aviso no bloquea, RN-26)

#### Scenario: Criterio de orden previo al recorte, con y sin aplicabilidad [FR-09] [RN-28] [RN-03] [S1 resp. 3]
- **GIVEN** opciones validadas, con y sin aplicabilidad calculada (`applicability` no vacía, desde el S3)
- **WHEN** se aplica el recorte a `maxOptions`
- **THEN** con aplicabilidad se ordenan con el comparador de aplicabilidad de RN-28 sobre la fuente más aplicable de cada una (menos excluyentes en No coincide → más Coincide → mayor `relevanceScore` → menor `chunkId` de su cita principal) y se conservan las primeras
- **AND** la relevancia solo desempata a igualdad de conteos (RN-03)
- **AND** sin aplicabilidad se conservan las de mayor `relevanceScore`, a igualdad la de menor `chunkId` de su cita principal

#### Scenario: Con maxOptions 3 el excedente se declara solo como número [US-134 AC-3] [FR-09] [S4 resp. 7] [S4 resp. 11]
- **GIVEN** FX-10c-a, `ANALYSIS_MAX_OPTIONS = 3` y `LLM-CUATRO` (O-A con 1 excluyente fuera del tope; O-E con su afirmación `principal` sin soporte NLI)
- **WHEN** se procesa `Q-HER2` en `POST /rag/query`
- **THEN** `optionsNotShown = 1`
- **AND** O-A no aparece en `evidenceOptions` ni en `discardedOptions` y ningún campo de la respuesta ni de los logs contiene su título, justificación ni citas
- **AND** con `LLM-TRES` `optionsNotShown = 0`, presente en la respuesta y no ausente
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: El excedente se cuenta en optionsNotShown sin su contenido [US-134] [S4 resp. 7]
- **GIVEN** más opciones validadas que `maxOptions`
- **WHEN** el pipeline recorta
- **THEN** el excedente se omite sin listarlo en `discardedOptions`
- **AND** `optionsNotShown` (entero >= 0, emitido siempre por `rag-orchestrator`, `0` si no hubo recorte) lo cuenta sin ningún contenido de las opciones recortadas

### Requirement: Salida del LLM inválida responde 503 LLM_OUTPUT_INVALID
Si el LLM devuelve un JSON no parseable o que no valida el esquema interno (p. ej. dos `principal` o ninguna), `POST /rag/query` MUST responder `503` con `error = "LLM_OUTPUT_INVALID"` (`ErrorSalidaLlmInvalida`); si no responde, `503 LOCAL_LLM_UNAVAILABLE`. Sin reintento silencioso, respuesta parcial ni eco del texto generado; el log solo registra el tipo de error (`[S1 resp. 12]`, RN-12, Q1 2026-10-30).

#### Scenario: Una salida con dos afirmaciones principales responde 503 LLM_OUTPUT_INVALID [US-245 AC-1] [RN-01] (decisión Q1, 2026-10-30)
- **GIVEN** `Q-HER2` y un LLM falso cuya opción trae dos afirmaciones con `role = principal`
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, `message` y `traceId`, sin eco del texto generado y sin opciones
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor
- **AND** el log registra el tipo de error de validación y no contiene el texto de la salida del LLM

#### Scenario: Un LLM que no responde sigue respondiendo LOCAL_LLM_UNAVAILABLE [US-245 AC-1] [RN-12] (regresión, decisión Q1)
- **GIVEN** `Q-HER2` y el adapter LLM falso configurado para lanzar un error de conexión
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LOCAL_LLM_UNAVAILABLE"` y nunca `LLM_OUTPUT_INVALID`

#### Scenario: Un JSON fuera de esquema del LLM responde 503 sin opciones [S1 resp. 12]
- **GIVEN** FX-06a-a, `Q-HER2` con contexto de mama y un LLM falso que devuelve un JSON sin el campo `options`
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, `message` y `traceId`
- **AND** el cuerpo no contiene `evidenceOptions` ni texto generado
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

### Requirement: Plantilla del prompt sin lenguaje prescriptivo
La plantilla del prompt `rag-query@0.1.0` MUST redactar sus instrucciones en positivo (describir lo que reporta la evidencia citada) y SHALL NOT contener ningún término de nivel A ni la raíz de nivel B (`recomend*`/`recommend*`) de `terminos-prohibidos.json` 1.1.0 (RN-23, `[S1 resp. 15]`).

#### Scenario: La plantilla del prompt no contiene términos prohibidos de nivel A ni B [RN-23] [S1 resp. 15]
- **GIVEN** la plantilla de `rag-query@0.1.0` sin datos y la lista `terminos-prohibidos.json` 1.1.0 de L1D-193
- **WHEN** se aplica `check_prohibited_terms()` con los niveles A y B
- **THEN** devuelve cero coincidencias

### Requirement: El prompt exige población y escenario al describir una guía
La plantilla del prompt `rag-query@0.1.0` MUST incluir una instrucción, redactada en positivo y sin términos de nivel A ni la raíz de nivel B, que exige que toda mención de lo que establece una guía indique la población y el escenario ("…para pacientes con [condición] en [escenario]"), atribuida a la fuente citada y nunca dirigida al paciente (`[S1 resp. 34]`). El cumplimiento en las salidas se mide con `ai-eval-runner`, no con una regla determinista.

#### Scenario: La plantilla del prompt contiene la instrucción de atribución con población y escenario [S1 resp. 34] [RN-23]
- **GIVEN** la plantilla del prompt `rag-query@0.1.0` sin datos
- **WHEN** se inspecciona su texto fijo
- **THEN** contiene la instrucción de indicar población y escenario y de atribuir a la fuente al describir lo que establece una guía
- **AND** `check_prohibited_terms()` con los niveles A y B de `terminos-prohibidos.json` sobre la plantilla devuelve cero coincidencias

### Requirement: Embeddings reales de consulta y de pasaje con BGE-M3
`rag-orchestrator` MUST disponer de un adapter local de BGE-M3 (int8, CPU/ONNX) que implemente `QueryEmbedder` y `PassageEmbedder` con el prefijo de pregunta o de pasaje del modelo, y que devuelva vectores *dense* de `EMBEDDING_DIM` dimensiones (ADR-39).

#### Scenario: Los vectores reales tienen 1024 dimensiones y el pasaje correcto queda primero por coseno [US-231a AC-1] [IA-01] [ADR-39]
- **GIVEN** FX-06a-c y los adapters reales de `QueryEmbedder` y `PassageEmbedder` con los pesos de `MODEL_CACHE_DIR`
- **WHEN** se embeben `Q-HER2` y sus tres pasajes
- **THEN** cada vector tiene 1024 dimensiones (`EMBEDDING_DIM`)
- **AND** por similitud coseno, `ch-m1-1` queda primero

#### Scenario: El adapter antepone el prefijo de pregunta o de pasaje según el puerto [US-231a AC-1]
- **GIVEN** el adapter de *embeddings* con una sesión de inferencia falsa que registra la entrada tokenizada
- **WHEN** se llama a `QueryEmbedder.embeber` y a `PassageEmbedder.embeber` con el mismo texto
- **THEN** las entradas enviadas al modelo difieren solo en el prefijo propio de cada puerto

### Requirement: Reranker real con puntaje normalizado a [0,1]
`rag-orchestrator` MUST disponer de un adapter local de bge-reranker-v2-m3 (int8, `RERANKER_MAX_LENGTH` = 512, hasta `RERANKER_MAX_PAIRS` = 12 pares) que implemente `Reranker`, devuelva un puntaje por candidato, en el mismo orden y normalizado a [0,1], y nunca `None` (RN-03, RN-02).

#### Scenario: Los puntajes están en [0,1] y el chunk pertinente supera al de otro tipo de cáncer [US-231a AC-2] [RN-03] [ADR-39]
- **GIVEN** FX-06a-c y el adapter real del *reranker*
- **WHEN** puntúa los pares de `Q-HER2`
- **THEN** cada `relevance_score` está en [0,1]
- **AND** `ch-m1-1` puntúa por encima de `ch-p1-1`

#### Scenario: Un logit de la sesión se normaliza con sigmoide y el exceso de pares se rechaza [US-231a AC-2]
- **GIVEN** el adapter del *reranker* con una sesión de inferencia falsa que devuelve logits fijos
- **WHEN** puntúa los candidatos
- **THEN** cada puntaje es la sigmoide del logit, en el orden de los candidatos
- **AND** más de `RERANKER_MAX_PAIRS` candidatos fallan con el error del puerto, sin truncar en silencio

### Requirement: Procedencia del reranker en meta.rerankerModel
`meta.rerankerModel` de `/rag/query` MUST contener el modelo, la versión y el *hash* SHA-256 del *reranker* iguales a los de la configuración, construidos a partir de ella y no del texto generado (FR-25, RN-03).

#### Scenario: La respuesta registra modelo, versión y hash del reranker configurados [US-231a AC-3] [FR-25] [RN-03]
- **GIVEN** `/rag/query` con el `Reranker` real cableado y `RERANKER_MODEL`, `RERANKER_MODEL_REVISION` y `RERANKER_MODEL_SHA256` definidos en la configuración
- **WHEN** se procesa `Q-HER2` con un JWT de servicio válido
- **THEN** `meta.rerankerModel` contiene el modelo, la versión y el SHA-256 de la configuración
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` (helper de validación de L1D-164)

### Requirement: Detector de idioma local y determinista
`rag-orchestrator` MUST disponer de un `LanguageDetector` local y determinista, sin red, que distinga `es` de `en` (ADR-39).

#### Scenario: Q-HER2 se detecta como español y ch-m1-1 como inglés [US-231a AC-4] [ADR-39]
- **GIVEN** los textos de idioma conocido de FX-06a-c
- **WHEN** el detector real los procesa
- **THEN** devuelve `es` para `Q-HER2`
- **AND** devuelve `en` para `ch-m1-1`

### Requirement: Los adapters reales cumplen el mismo contrato que los fakes
Los adapters reales y sus fakes MUST superar la misma batería de contrato: mismas firmas y mismos tipos de error, un puntaje ausente es `None` y nunca `0.0`, y el fallo de un modelo se traduce en `RETRIEVAL_UNAVAILABLE` (`[S1 resp. 12]`, RN-02).

#### Scenario: La misma batería pasa sobre el adapter real y sobre el fake [US-231a AC-5] [S1 resp. 12] [RN-02]
- **GIVEN** los cuatro adapters (`QueryEmbedder`, `PassageEmbedder`, `Reranker`, `LanguageDetector`) en su versión real y en su versión fake (FX-06a-a)
- **WHEN** se ejecuta sobre ambos la misma batería de contrato
- **THEN** cumplen las mismas firmas y los mismos tipos de error
- **AND** un puntaje ausente se representa con `None` y nunca con `0.0`
- **AND** el fallo de un modelo llega a `/rag/query` como `503` con `error = "RETRIEVAL_UNAVAILABLE"`

### Requirement: Puntaje reproducible entre procesos
Con los mismos pares y la misma configuración, el `relevance_score` MUST ser idéntico en cálculos sucesivos, también en procesos distintos (IA-07, ADR-8).

#### Scenario: Dos procesos distintos calculan el mismo relevance_score [US-231a AC-6] [IA-07] [ADR-8]
- **GIVEN** los mismos pares de FX-06a-c y la misma configuración
- **WHEN** se calcula el `relevance_score` dos veces en procesos distintos
- **THEN** los valores son idénticos

### Requirement: Modelo ausente o alterado impide el arranque
Con `MODEL_PROVIDER=local`, `rag-orchestrator` MUST verificar al arrancar la ruta y el SHA-256 de los modelos de *embeddings* y de *reranker*; si el archivo falta o el *hash* no coincide, el proceso MUST terminar con código distinto de 0 y el error SHALL nombrar la variable de configuración, nunca su contenido (RN-22).

#### Scenario: Un hash alterado termina el proceso nombrando la variable [US-231a AC-7] [RN-22]
- **GIVEN** un archivo de modelo de *reranker* cuyo SHA-256 no coincide con `RERANKER_MODEL_SHA256` y `MODEL_PROVIDER=local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `RERANKER_MODEL_SHA256` y no contienen la ruta, el hash esperado ni el calculado

#### Scenario: Un archivo ausente termina el proceso nombrando la variable de ruta [US-231a AC-7] [RN-22]
- **GIVEN** un modelo de *embeddings* cuya ruta (`EMBEDDING_MODEL_PATH`) no existe y `MODEL_PROVIDER=local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `EMBEDDING_MODEL_PATH` y no contienen la ruta

#### Scenario: Con el proveedor fake no se verifica ni se carga ningún modelo [US-231a AC-7]
- **GIVEN** el proveedor de modelos `fake` y sin archivos de modelo
- **WHEN** arranca `rag-orchestrator`
- **THEN** arranca sin error y sin importar ningún runtime de modelos

### Requirement: Matriz estricta de proveedores de modelos
`MODEL_PROVIDER` MUST ser exactamente `fake` o `local`; cualquier otro valor SHALL impedir el arranque nombrando la variable. La combinación `LLM_PROVIDER=local` con `MODEL_PROVIDER=fake` MUST fallar cerrado y, con `REAL_*_ENABLED=true`, `MODEL_PROVIDER=fake` MUST impedir el arranque (RN-12, RN-13).

#### Scenario: Un valor fuera del enum impide arrancar [US-231a AC-7] [RN-12]
- **GIVEN** `MODEL_PROVIDER` con un valor distinto de `fake` y `local`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `MODEL_PROVIDER` sin eco de su valor

#### Scenario: LLM local con modelos fake responde 503 fail-closed [US-231a AC-7] [RN-12]
- **GIVEN** `LLM_PROVIDER=local` y `MODEL_PROVIDER=fake`
- **WHEN** se envía `Q-HER2` a `/rag/query` con un JWT de servicio válido
- **THEN** responde `503` con `error = "RETRIEVAL_UNAVAILABLE"` sin recuperar con fakes ni invocar al LLM

#### Scenario: Datos reales habilitados con MODEL_PROVIDER fake impiden el arranque [US-231a AC-7] [RN-13]
- **GIVEN** `REAL_ANONYMIZED_ENABLED=true` y `MODEL_PROVIDER=fake`
- **WHEN** arranca `rag-orchestrator` como subproceso
- **THEN** el proceso termina con código distinto de 0
- **AND** stdout y stderr completos contienen `MODEL_PROVIDER`

### Requirement: Pesos fuera del repo y de la imagen, sin red en Compose
El Compose MUST montar los modelos como *bind mount* `read_only` desde un directorio del host fuera del repo y pasar las variables de proveedor, rutas, SHA-256 y modo sin conexión (RN-12, RN-14).

#### Scenario: El Compose monta los modelos de solo lectura y fuerza el modo sin conexión [US-231a AC-8] [RN-14]
- **GIVEN** `infra/docker/docker-compose.yml` y el `.dockerignore` del Dockerfile de `rag-orchestrator`
- **WHEN** se analiza la configuración del servicio `rag-orchestrator`
- **THEN** monta `MODEL_CACHE_DIR` como *bind mount* `read_only` desde fuera del repo
- **AND** define `MODEL_PROVIDER`, `*_MODEL_PATH`, `*_MODEL_SHA256`, `HF_HUB_OFFLINE=1` y `TRANSFORMERS_OFFLINE=1`
- **AND** la fuente resuelta del montaje (`MODEL_HOST_DIR`) queda fuera de la raíz del repo
- **AND** `.gitignore`, el `.dockerignore` raíz y `apps/rag-orchestrator/Dockerfile.dockerignore` excluyen los pesos

### Requirement: Adapters locales sin red
Los adapters reales MUST funcionar sin conexiones salientes y no SHALL importar un cliente de nube ni descargar pesos en ejecución (RN-12, NFR-05).

#### Scenario: Con la red bloqueada responden y no registran conexiones salientes [US-231a AC-8] [RN-12] [NFR-05]
- **GIVEN** los cuatro adapters reales y la red bloqueada en el test, con registro de conexiones salientes
- **WHEN** procesan FX-06a-c
- **THEN** responden sin error
- **AND** el registro de conexiones salientes queda vacío

#### Scenario: Ningún módulo de los adapters importa un cliente de nube o HTTP [US-231a AC-8] [RN-12]
- **GIVEN** los módulos de `app/infrastructure/{embeddings,reranker,language,models}`
- **WHEN** se inspeccionan sus importaciones
- **THEN** ninguno importa ni usa `huggingface_hub` (que solo existe como dependencia transitiva fijada de `tokenizers`), `transformers`, `requests`, `httpx`, `urllib.request`, `socket`, un SDK de nube, `from_pretrained` ni `hf_hub_download`
- **AND** la carga usa `Tokenizer.from_file` y `onnxruntime.InferenceSession` con rutas locales

### Requirement: Latencia por etapa medida y reportada
La latencia de los *embeddings* y del *reranker* con modelos reales MUST medirse por etapa (3 corridas, mediana) contra su presupuesto: *embeddings* ≤ 500 ms y *reranker* (12 pares) ≤ 4500 ms; un valor fuera de presupuesto SHALL reportarse y no ocultarse (NFR-01, ADR-39).

#### Scenario: La mediana de cada etapa se compara con su presupuesto y el exceso se reporta [US-231a AC-9] [NFR-01] [ADR-39]
- **GIVEN** FX-06a-c en la VM de Docker de ≥ 10 GB del ADR-39 y los adapters reales
- **WHEN** se mide cada etapa en 3 corridas y se toma la mediana
- **THEN** los *embeddings* quedan en ≤ 500 ms y el *reranker* (12 pares) en ≤ 4500 ms
- **AND** un valor fuera de presupuesto queda en el reporte de la medición para el refinamiento

### Requirement: El prompt etiqueta los datos del paciente sin verificar o en conflicto
El bloque de datos del paciente del prompt `rag-query@0.4.0` (`[S3 resp. 15]`) MUST etiquetar con "(sin verificar)" el dato `requiere_revision` y con "(en conflicto)", con precedencia (asumido), el dato con `provenance.conflict = true`; un dato verificado SHALL NOT llevar etiqueta y el texto embebido para la recuperación MUST NOT cambiar (RN-07).

#### Scenario: El Ki-67 sin verificar aparece etiquetado en el bloque de datos del paciente [US-065 AC-5] [RN-07] (asumido: texto de la etiqueta)
- **GIVEN** un `clinicalContext` con el Ki-67 `20 %` en `provenance.reviewStatus = requiere_revision` y el resto de los datos `verificado`
- **WHEN** `rag-orchestrator` arma el prompt de `/rag/query`
- **THEN** dentro del bloque de datos del paciente el Ki-67 `20 %` aparece acompañado de "(sin verificar)"
- **AND** ningún dato `verificado` del bloque lleva "(sin verificar)" ni "(en conflicto)"

#### Scenario: El dato en conflicto aparece etiquetado como en conflicto [US-065 AC-5] [RN-07] (asumido: etiqueta de conflicto y precedencia)
- **GIVEN** un `clinicalContext` con el receptor de estrógeno `90 %` en `requiere_revision` y `provenance.conflict = true`
- **WHEN** `rag-orchestrator` arma el prompt de `/rag/query`
- **THEN** el receptor de estrógeno `90 %` aparece acompañado de "(en conflicto)" y no de "(sin verificar)"

#### Scenario: El texto embebido para la recuperación no lleva etiquetas [US-065 AC-5] [RN-07]
- **GIVEN** el mismo `clinicalContext` con el Ki-67 en `requiere_revision`
- **WHEN** se calcula el resumen del contexto clínico que se embebe junto con la pregunta
- **THEN** el resumen es idéntico al de un contexto con el Ki-67 `verificado` y no contiene "(sin verificar)" ni "(en conflicto)"

### Requirement: En el S3 solo el diagnóstico y los biomarcadores se etiquetan en el prompt
Atributos, tratamientos previos y eventos MUST NOT etiquetarse en el bloque de datos del paciente del prompt en el S3 (Non-Goal explícito, decidido 2026-10-27); su `provenance` viaja en el payload.

#### Scenario: Los atributos, tratamientos y eventos no entran al bloque etiquetado [US-065 AC-5] [RN-07] (asumido: Non-Goal del S3)
- **GIVEN** un `clinicalContext` con un atributo, un tratamiento previo y un evento en `requiere_revision`
- **WHEN** `rag-orchestrator` arma el bloque de datos del paciente del prompt
- **THEN** el bloque no contiene ni el atributo, ni el tratamiento, ni el evento, ni la etiqueta "(sin verificar)" por ellos

### Requirement: Las etiquetas de procedencia del prompt no introducen lenguaje prescriptivo
El bloque de datos del paciente y sus etiquetas MUST NOT contener ningún `terminos` del nivel A ni `prefijos` del nivel B de `terminos-prohibidos.json` (RN-23), ni el `pseudoPatientId` ni identificadores de dato (`dataRef`) (RN-11).

#### Scenario: El prompt con datos etiquetados no contiene términos prohibidos ni identificadores [US-065 AC-5] [RN-23] [RN-11]
- **GIVEN** el prompt armado con el `clinicalContext` de FX-T1a-a (Ki-67 sin verificar y receptor de estrógeno en conflicto)
- **WHEN** se aplica `check_prohibited_terms()` con los niveles A (`terminos`) y B (`prefijos`) y se busca el `pseudoPatientId` y cada `dataRef` del contexto
- **THEN** devuelve cero coincidencias y no aparece ningún `pseudoPatientId` ni `dataRef`

### Requirement: La versión del prompt de generación queda registrada en meta
`meta.promptVersion` MUST comenzar por `rag-query@0.4.0`; cuando el respaldo de población de `l1d-294` invoca al LLM, MAY continuar con el sufijo `+poblacion_v1` (la versión de `POPULATION_PROMPT_VERSION`) sin espacios. Las comprobaciones SHALL usar un prefijo tolerante a ese sufijo, para no acoplar este change al de aplicabilidad.

#### Scenario: La versión del prompt empieza por rag-query@0.4.0 con o sin sufijo de aplicabilidad [US-065 AC-5] [RN-07] (asumido: sufijo de l1d-128)
- **GIVEN** una consulta a `/rag/query` con el contexto de FX-T1a-a y el LLM falso
- **WHEN** se lee `meta.promptVersion` de la respuesta
- **THEN** el valor coincide con `^rag-query@0\.4\.0(\+poblacion_v1)?$`

### Requirement: Metadato factual ausente del catálogo viaja como null
Si el catálogo no registra un metadato factual de la fuente (columna nula o texto vacío), el campo correspondiente de `CitedSource` MUST viajar `null`; SHALL NOT rellenarse con `""`, `0`, un valor por defecto, un centinela de texto ("No disponible" es solo texto de la UI) ni un valor de otra fuente o del texto generado (RN-25).

#### Scenario: Un documento sin endpoint ni tamaño de muestra devuelve esos campos en null [US-127 AC-3] [RN-25]
- **GIVEN** `doc-a3` de FX-08b-a en el schema `corpus` de test con `primary_endpoint` y `sample_size` nulos, y un generador falso cuya opción cita un chunk de `doc-a3`
- **WHEN** `POST /rag/query` responde
- **THEN** el `CitedSource` de esa opción trae `primaryEndpoint = null` y `sampleSize = null`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: El gateway persiste y devuelve los metadatos nulos sin alterarlos [US-127 AC-3] [RN-25] [RN-06]
- **GIVEN** `rag-orchestrator` simulado (MSW, respuesta construida desde `contracts/examples/`) con una cita de `primaryEndpoint = null` y `sampleSize = null`
- **WHEN** `POST /platform/evidence-analyses` completa el análisis
- **THEN** la respuesta de `clinical-api` y el `AIAnalysisRecord` persistido traen `primaryEndpoint = null` y `sampleSize = null` en esa cita
- **AND** la respuesta valida contra el `openapi.yaml` de `clinical-api`

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

### Requirement: Los fragmentos se entregan al LLM con un alias corto y sin su chunkId real
El prompt de generación de `POST /rag/query` MUST presentar cada chunk entregado a la generación con un alias `C1…Cn` asignado por orden de `relevanceScore` descendente, con desempate por `chunkId` ascendente, y SHALL NOT contener ningún `chunkId` real. La instrucción de citar MUST pedir el alias del fragmento (RN-04). Solo reciben alias los chunks sobre el umbral que caben en el presupuesto de fragmentos configurado (`LLM_FRAGMENTS_MAX_CHARS`, RN-22).

#### Scenario: Cuatro chunks sobre el umbral reciben C1…C4 por relevancia y el prompt no lleva ids reales [US-236 AC-1] [RN-04]
- **GIVEN** una recuperación con cuatro chunks sobre el umbral (FX-06a-a) y el LLM falso `LLM-OK` a nivel de cliente (FX-06a-b)
- **WHEN** se arma el prompt de generación
- **THEN** el chunk de mayor `relevanceScore` lleva `C1` y los siguientes `C2`, `C3`, `C4` en orden descendente, y dos chunks con el mismo puntaje se ordenan por `chunkId` ascendente
- **AND** el texto del prompt no contiene ninguno de los cuatro `chunkId` reales

#### Scenario: La misma entrada produce los mismos alias [US-236 AC-5] [RN-06]
- **GIVEN** los mismos chunks en el mismo orden
- **WHEN** se arma el prompt dos veces
- **THEN** los dos prompts asignan alias idénticos a cada chunk

### Requirement: El alias citado se traduce al chunkId real antes de validar la cita
Cada alias citado MUST traducirse al `chunkId` real de su chunk antes de validar la cita, que sigue comparando `chunkId` reales (RN-01, RN-04). El alias es el único formato aceptado: cualquier otro texto, incluido un `chunkId` real, SHALL ser cita inválida, sin reparación; una opción sin cita traducible MUST ir a `discardedOptions` con `discardReason = cita_invalida`.

#### Scenario: Una cita a C2 apunta al chunk real con su texto del corpus [US-236 AC-2] [RN-04] [AC-T1.3]
- **GIVEN** FX-06a-a con cuatro chunks sobre el umbral y un LLM falso cuya opción cita `C2`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción queda en `evidenceOptions` y su cita tiene el `chunkId` real del chunk al que se asignó `C2`
- **AND** `chunkTextSnapshot` es igual al texto de ese chunk en el corpus
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor

#### Scenario: Un alias inexistente descarta la opción por cita inválida [US-236 AC-3] [RN-01] [AC-T1.2]
- **GIVEN** FX-06a-a con cuatro chunks entregados a la generación y un LLM falso cuya opción cita solo `C9`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción no está en `evidenceOptions` y aparece en `discardedOptions` con `discardReason = cita_invalida`

#### Scenario: El chunkId real copiado por el LLM no se acepta [US-236 AC-4] [RN-04] (asumido)
- **GIVEN** FX-06a-a y un LLM falso cuya opción cita el `chunkId` real `ch-m1-1` en lugar de su alias
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la opción va a `discardedOptions` con `discardReason = cita_invalida`
- **AND** ningún id "parecido" a un `chunkId` real se repara ni se acepta

#### Scenario: Un alias de un chunk que no superó el umbral no existe [US-236 AC-6] [RN-01] [RN-24]
- **GIVEN** una recuperación donde tres chunks superan el umbral y un cuarto queda por debajo, y un LLM falso cuya opción cita `C4`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `C4` no corresponde a ningún chunk (solo existen `C1…C3`) y la opción va a `discardedOptions` con `discardReason = cita_invalida`
- **AND** el chunk bajo el umbral no aparece en ningún `citedSources` de la respuesta

### Requirement: Los alias nunca salen de la generación
Los alias MUST vivir solo dentro de una consulta de generación: la respuesta de `POST /rag/query`, el `AIAnalysisRecord` persistido por `clinical-api` y los logs de ambos servicios SHALL identificar los chunks solo por su `chunkId` real y SHALL NOT contener un alias como identificador (RN-06).

#### Scenario: Ni la respuesta, ni la persistencia, ni los logs llevan alias [US-236 AC-5] [RN-06]
- **GIVEN** FX-06a-a y un LLM falso cuya opción cita `C1` y `C2`
- **WHEN** se completa el análisis de punta a punta y se inspeccionan la respuesta serializada, el `AIAnalysisRecord` persistido y los logs capturados
- **THEN** cada `citedSources[].chunkId` es un `chunkId` real del corpus
- **AND** ninguna de las tres salidas contiene `C1` ni `C2` como identificador de chunk

### Requirement: La recuperación híbrida suma la rama sparse antes del reranker
Con `RETRIEVAL_MODE = hibrida`, `/rag/query` MUST ejecutar una búsqueda *dense* y una *sparse* (BGE-M3, mismo `SPARSE_VECTOR_SOURCE` que el corpus), fusionar sus candidatos con la regla de `RETRIEVAL_FUSION` y entregarlos al *reranker*; el `relevanceScore` MUST seguir saliendo solo del *reranker* (RN-03).

#### Scenario: Un chunk hallado solo por la rama sparse llega al reranker y se cita [US-112 AC-1] [AC-06.1] [FR-09]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, FX-06a-a con `ch-m2-1` fuera del top-k *dense* y primero en el recuperador *sparse* falso para `Q-KEYWORD`
- **WHEN** `clinical-api` envía `Q-KEYWORD` a `POST /rag/query` con un JWT de servicio válido
- **THEN** `ch-m2-1` llega a los candidatos del *reranker*, la respuesta es `con_evidencia` y la opción cita `ch-m2-1`

#### Scenario: La relevancia es la del reranker, no la de la fusión [US-112 AC-2] [RN-03] [ADR-8]
- **GIVEN** la respuesta del escenario anterior con el *reranker* falso dando 0,82 a `ch-m2-1`
- **WHEN** se inspecciona la respuesta
- **THEN** `relevanceScore = 0.82`
- **AND** no es el puntaje RRF ni el ponderado

### Requirement: Ambas ramas aplican el mismo filtro de vigencia y tipo de cáncer
La búsqueda *sparse* MUST usar el mismo filtro escalar que la *dense* (`is_current == true`, `cancer_type_tags`, `population`, `source_type`); un chunk no vigente o de otro tipo de cáncer SHALL quedar fuera de los candidatos del *reranker* y de las citas aunque la rama *sparse* lo devuelva primero (RN-05).

#### Scenario: Un chunk no vigente devuelto por el sparse no llega al reranker [US-112 AC-3] [RN-05] [AC-06.1]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, `ch-m1v0-1` (`is_current = false`) devuelto primero por el recuperador *sparse* falso y `ch-p1-1` (próstata)
- **WHEN** se procesa `Q-HER2` con un caso de mama
- **THEN** la expresión de filtro de ambas ramas incluye `is_current == true` y restringe `cancer_type_tags` a mama
- **AND** ni `ch-m1v0-1` ni `ch-p1-1` llegan al *reranker* ni a las citas

### Requirement: El modo híbrido no invoca al LLM sin evidencia
En modo híbrido, sin chunks sobre el umbral la respuesta MUST ser `sin_evidencia` con `topRelevanceScore = null` y cero invocaciones del LLM de generación y del agente (RN-02); el LLM de reescritura de consulta (RN-02 enmendada, E-14, l1d-300) se invoca como mucho una vez, según `QUERY_REWRITE_ENABLED`.

#### Scenario: Q-SIN en modo híbrido responde sin_evidencia [US-112 AC-4] [RN-02]
- **GIVEN** `RETRIEVAL_MODE = hibrida` y el adapter falso del LLM de generación con contador
- **WHEN** se procesa `Q-SIN`
- **THEN** responde `sin_evidencia` y el LLM de generación registra cero invocaciones

### Requirement: Modo, fusión y parámetros en configuración y trazados
`RETRIEVAL_MODE`, `RETRIEVAL_FUSION`, `RRF_K` y `HYBRID_SPARSE_WEIGHT` MUST leerse de configuración (RN-22), sin literales en código, y `meta.retrievalParams` SHALL registrar siempre `retrievalMode`, `fusion` y `fusionParam`, sin `null` (`fusion = ninguna` y `fusionParam = 0` en `dense`), en `/rag/query` y en `/rag/follow-up`, y persistirse en `retrieval_params` (AC-T1.4).

#### Scenario: Los parámetros de RRF quedan en meta y persistidos [US-112 AC-5] [RN-22] [AC-T1.4] [S4 resp. 18]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, `RETRIEVAL_FUSION = rrf` y `RRF_K = 60`
- **WHEN** se procesa cualquier consulta
- **THEN** `meta.retrievalParams` trae `retrievalMode = hibrida`, `fusion = rrf` y `fusionParam = 60`
- **AND** el mismo bloque se persiste en `retrieval_params` del `AIAnalysisRecord`

#### Scenario: Los logs de la recuperación híbrida no llevan texto [US-112 AC-5] [RN-10]
- **GIVEN** `RETRIEVAL_MODE = hibrida` y la captura de logs del servicio
- **WHEN** se procesa `Q-KEYWORD`
- **THEN** los logs pueden traer `retrievalMode`, `fusion`, `fusionParam`, recuentos por rama y `chunkId`
- **AND** no contienen el texto de la consulta, de ningún fragmento, del *prompt* ni de la salida del LLM

### Requirement: Por defecto la recuperación es dense y la fusión ponderada es alternativa
Sin `RETRIEVAL_MODE` definido el servicio MUST recuperar en `dense` sin invocar la rama *sparse*; con `RETRIEVAL_FUSION = ponderada` y `HYBRID_SPARSE_WEIGHT = 0,3` MUST fusionar por suma ponderada y trazar el peso.

#### Scenario: Sin configuración el modo es dense y el sparse no se llama [US-112 AC-6] [RN-22] [ADR-45] [S4 resp. 17]
- **GIVEN** `RETRIEVAL_MODE` sin definir y el recuperador *sparse* falso con contador
- **WHEN** se procesa `Q-KEYWORD`
- **THEN** el contador *sparse* es 0, `retrievalMode = dense` y `ch-m2-1` no llega al *reranker*
- **AND** `fusion = ninguna` y `fusionParam = 0`, sin ningún `null` en `meta.retrievalParams`

#### Scenario: La fusión ponderada recupera el chunk y traza su peso [US-112 AC-6] [RN-22] [ADR-45] [S4 resp. 18]
- **GIVEN** `RETRIEVAL_MODE = hibrida`, `RETRIEVAL_FUSION = ponderada` y `HYBRID_SPARSE_WEIGHT = 0,3`
- **WHEN** se procesa `Q-KEYWORD`
- **THEN** `ch-m2-1` llega al *reranker*
- **AND** `meta.retrievalParams` registra `fusion = ponderada` y `fusionParam = 0.3`

### Requirement: El generador escribe afirmaciones atómicas con papel
La generación de `POST /rag/query` MUST producir por opción de 1 a `CLAIMS_MAX_PER_OPTION` afirmaciones `{text, role, citations}` con `role` en `principal | secundaria | salvedad`, exactamente una `principal`, cada `text` de a lo sumo `CLAIM_MAX_WORDS` palabras (RN-22), declarativo y sin modal normativo ni alias de fragmento. Es el esquema interno del LLM, no del contrato público; la versión del prompt vive en configuración (FR-10, ADR-34, `[S4 resp. 2]`).

#### Scenario: Una salida con una principal y afirmaciones dentro del límite valida el esquema interno [US-245 AC-1] [RN-22]
- **GIVEN** `Q-HER2` y `LLM-ATOM-OK` (una `principal`, una `secundaria` y una `salvedad`, cada una ≤ `CLAIM_MAX_WORDS` palabras)
- **WHEN** se procesa la consulta
- **THEN** la salida valida el esquema interno y la respuesta es `200`
- **AND** el esquema `claims[]` no aparece en la respuesta serializada

### Requirement: El código compone el marco de atribución de la opción
`rag-orchestrator` MUST componer `rationale` como «La fuente reporta que » seguido de la afirmación principal, y cada afirmación secundaria y salvedad en `details` con el mismo marco, en el idioma de la pregunta («The source reports that…»), con una función pura de `domain/`; el LLM SHALL NOT escribir la atribución (ADR-34, `[S4 resp. 2]`).

#### Scenario: Con las tres afirmaciones implicadas O-1 queda en evidenceOptions con el marco y el NLI recibe solo la afirmación y su chunk [US-245 AC-1] [RN-01] [ADR-34] [RN-04] [RN-24]
- **GIVEN** `Q-HER2`, `LLM-ATOM-OK` y el NLI falso en `entailment` de FX-T1a-b
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `evidenceOptions` con `rationale` igual a «La fuente reporta que » más la afirmación principal
- **AND** cada afirmación secundaria y salvedad figura en `details` con el mismo marco
- **AND** el adapter NLI se invocó 3 veces, cada una con la afirmación sin el marco como hipótesis y solo el texto de `ch-m1-1` como premisa, nunca otra afirmación generada ni el marco
- **AND** ninguna cita es un análisis previo (regresión [RN-24] activa desde S4; control de la memoria en US-191, Post-MVP)

### Requirement: Una afirmación fuera de forma cuenta como sin soporte antes del NLI
Después de `checkProhibitedTerms` y sin invocar al NLI, una afirmación con alias de fragmento o con más de `CLAIM_MAX_WORDS` palabras MUST tratarse como sin soporte con la regla de su papel. Su texto SHALL NOT aparecer en ningún campo de la respuesta: si descarta la opción, `unsupportedClaims` recibe el literal «(texto no mostrado)» (RN-23, `[S4 resp. 2]`, OUT-08).

#### Scenario: Una secundaria con alias de fragmento se omite y la opción se conserva [US-245 AC-5] [OUT-08] [RN-01] (asumido: tratamiento previo al NLI)
- **GIVEN** `Q-HER2` y `LLM-ATOM-ALIAS`, cuya secundaria empieza por «El fragmento C1 reporta que…»
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** esa secundaria se omite y `omittedClaims = 1`
- **AND** O-1 se conserva en `evidenceOptions` por su principal
- **AND** la cadena «fragmento C» no aparece en la respuesta serializada

### Requirement: Una afirmación con modal normativo descarta la opción sin exponer su texto
Una afirmación con modal normativo fuera de la lista de términos prohibidos (p. ej. «debería») MUST descartar la opción con `afirmacion_sin_soporte` en cualquier papel, sin invocar al NLI (D-a, usuario, 2026-10-30). Su texto SHALL NOT exponerse: `unsupportedClaims` recibe «(texto no mostrado)» (RN-23). Los modales de la lista prohibida van antes a `lenguaje_no_permitido`.

#### Scenario: Una afirmación con modal normativo descarta la opción sin exponer su texto [US-245 AC-5] [RN-23] [RN-01] (decisión D-a, 2026-10-30)
- **GIVEN** `Q-HER2` y `LLM-ATOM-MODAL`, cuya secundaria contiene el modal normativo «debería» (fuera de la lista de términos prohibidos) y cuyas principal y salvedad están en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["(texto no mostrado)"]`
- **AND** el texto de esa afirmación no aparece en ningún campo de la respuesta serializada
- **AND** el adapter NLI no se invocó para esa afirmación

#### Scenario: Una principal con modal normativo descarta la opción y su texto no aparece en ningún campo [US-245 AC-5] [RN-23] (decisión D-a, 2026-10-30)
- **GIVEN** `Q-HER2` y `LLM-ATOM-MODAL-PRIN`, cuya principal contiene el modal normativo «debería»
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["(texto no mostrado)"]`
- **AND** el texto de la principal no aparece en `rationale`, `details` ni en ningún otro campo de la respuesta serializada

### Requirement: Hasta tres opciones en orden determinista por aplicabilidad
Con `maxOptions = 3`, `evidenceOptions` MUST salir en el orden del comparador de aplicabilidad (RN-28, ADR-27) sobre la fuente más aplicable de cada opción validada, sin campo `rank` ni puntaje; la relevancia (RN-03) SHALL solo desempatar a igualdad de conteos, y el orden SHALL ser independiente del orden de salida del LLM. Una opción de población no comparable queda ordenada al final pero visible, con `populationNotComparable = true` y el aviso `poblacion_no_comparable` (RN-26).

#### Scenario: Tres opciones ordenadas por aplicabilidad y no por relevancia [US-134 AC-1] [US-134 AC-2] [AC-10.1] [RN-28] [RN-03] [HU-10] [FR-09]
- **GIVEN** FX-10c-a (A-M1, `Q-HER2`, `RELEVANCE_THRESHOLD = 0.30`, `test-apl-1.0.0`, `APL-FIJA`), `LLM-CUATRO` y `maxOptions = 3`
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` = [O-B, O-D, O-C] en ese orden
- **AND** O-C (relevancia 0,85) queda detrás de O-D (0,60) por tener menos criterios en Coincide, y O-B precede a O-D solo por relevancia (mismos conteos)

#### Scenario: La opción no comparable queda última y visible [US-134 AC-4] [RN-28] [RN-26] [AC-08.8]
- **GIVEN** FX-10c-a, `LLM-TRES` y `maxOptions = 3`
- **WHEN** se procesa la consulta
- **THEN** `evidenceOptions` = [O-B, O-C, O-A]
- **AND** O-A trae `populationNotComparable = true` y `warnings` con `poblacion_no_comparable`

#### Scenario: Una opción sin soporte no ocupa ninguna de las tres posiciones [US-134 AC-5] [RN-01] [FR-10] [AC-10.4]
- **GIVEN** FX-10c-a, `LLM-CUATRO` (NLI falso `neutral` para la afirmación `principal` de O-E, "duplica la supervivencia") y `maxOptions = 3`
- **WHEN** se valida
- **THEN** O-E aparece en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** `evidenceOptions` no contiene a O-E

#### Scenario: El orden no depende del orden de salida del LLM [US-134 AC-6] [RN-28] [ADR-27]
- **GIVEN** FX-10c-a y las 24 permutaciones del orden de salida de O-A…O-D del LLM falso
- **WHEN** se procesa cada una con `maxOptions = 3`
- **THEN** `evidenceOptions` es siempre [O-B, O-D, O-C]

#### Scenario: Una opción con varias fuentes se compara con su fuente más aplicable [US-134 AC-7] [AC-08.8] [RN-28]
- **GIVEN** FX-10c-a y `LLM-MULTIFUENTE` (O-F cita `ch-a4-1` y `ch-a1-1`)
- **WHEN** se ordena
- **THEN** O-F se compara con el resumen de `doc-a1` y no con el de `doc-a4`

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
