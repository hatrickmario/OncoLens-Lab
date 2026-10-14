## Purpose

Define el comportamiento verificable del pipeline de análisis de evidencia de OncoLens: qué evidencia del corpus se recupera para una pregunta, cuándo se responde "sin evidencia", cómo se generan y validan las opciones descritas en la evidencia y qué contrato final recibe `clinical-api`.

## ADDED Requirements

### Requirement: Sin evidencia sobre el umbral, respuesta sin invocar al LLM
Cuando ningún chunk recuperado supere el umbral de relevancia, `POST /rag/query` MUST responder `200` con `status = sin_evidencia`, `evidenceOptions = []`, `retrievalStats.aboveThreshold = 0` y `topRelevanceScore = null` (nunca `0.0`), y SHALL hacerlo sin invocar al LLM ni al agente (RN-02). La respuesta MUST validar contra `RagQueryInternalResponse`.

#### Scenario: Una pregunta sin evidencia en el corpus responde sin_evidencia y el LLM no se invoca [US-055 AC-2] [AC-10.4] [RN-02]
- **GIVEN** el corpus de prueba FX-06a-a, `RELEVANCE_THRESHOLD = 0.30` en la configuración de test y el adapter falso del LLM con contador de invocaciones (FX-06a-b)
- **WHEN** `clinical-api` envía `Q-SIN` ("¿Qué describe la evidencia sobre melanoma uveal?") a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `200` con `status = sin_evidencia`, `evidenceOptions = []`, `retrievalStats.aboveThreshold = 0` y `topRelevanceScore = null`
- **AND** el adapter del LLM registra cero invocaciones
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

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

### Requirement: Contexto sin diagnóstico responde sin_evidencia sin buscar
Cuando `clinicalContext.diagnosis` es `null`, `POST /rag/query` MUST responder `200` con `status = sin_evidencia`, `evidenceOptions = []`, `topRelevanceScore = null` y una limitación con `origin = estructural`, sin consultar Milvus ni invocar al LLM: sin tipo de cáncer no se puede aplicar el filtro de `cancer_type_tags` y no se mezclan tipos de cáncer (OL-02, RN-02). (asumido, pendiente de confirmación)

#### Scenario: Un contexto sin diagnóstico responde sin_evidencia con limitación estructural (asumido, pendiente de confirmación)
- **GIVEN** FX-06a-a, un `clinicalContext` sintético con `diagnosis = null` y los adapters falsos de búsqueda y del LLM con contador de invocaciones
- **WHEN** se procesa `Q-HER2`
- **THEN** responde `200` con `status = sin_evidencia`, `topRelevanceScore = null` y una entrada en `limitations` con `origin = estructural`
- **AND** el puerto de búsqueda y el adapter del LLM registran cero invocaciones
- **AND** la respuesta valida contra `RagQueryInternalResponse`
