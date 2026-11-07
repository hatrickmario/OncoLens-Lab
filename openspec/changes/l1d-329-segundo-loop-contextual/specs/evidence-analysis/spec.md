## ADDED Requirements

### Requirement: Una pregunta sin tema propio con el primer loop vacío dispara un único segundo loop contextual sin LLM
Con el indicador `QUERY_CONTEXT_EXPANSION_ENABLED` activo, el primer loop vacío y el gate G1 verdadero (sin palabra de
contenido tras quitar las vacías y de marco), `/rag/query` MUST ejecutar **una** nueva recuperación con la pregunta más
los términos del caso del catálogo (`terminos_del_caso`) y MUST NOT invocar a ningún LLM en ese loop. Las citas son solo
de los fragmentos recuperados en esa consulta (RN-02, RN-04).

#### Scenario: Una pregunta genérica recupera evidencia con los términos del caso [US-271 AC-1] [RN-02] [RN-04]
- **GIVEN** el corpus `s5-corpus-ampliado` (o su fixture de prueba), `QUERY_CONTEXT_EXPANSION_ENABLED = true`, adapters falsos con contadores y el contexto desidentificado del paciente semilla (a) (mama, estadio y biomarcador principal presentes)
- **WHEN** llega «¿Qué evidencia hay para este caso?» y el primer loop no supera el umbral
- **THEN** el retriever registra exactamente una llamada más y la consulta puntuada es la pregunta seguida de la etiqueta CIE-10 de mama, el estadio TNM y el biomarcador principal
- **AND** la respuesta es `con_evidencia` y cada cita apunta a un chunk recuperado en ese turno
- **AND** el LLM de reescritura registra cero invocaciones durante el segundo loop y `meta.retrievalParams.queryRewrite = { applied: true, reason: "contextual" }`

#### Scenario: En próstata los términos incluyen el grado [US-271 AC-1] [RN-27] (asumido) [ADR-52]
- **GIVEN** el contexto desidentificado de un paciente de próstata con `Diagnosis.grade` presente en el catálogo
- **WHEN** se procesa una pregunta sin tema propio con primer loop vacío
- **THEN** los términos añadidos incluyen ese grado además del tipo, el estadio y el biomarcador principal

### Requirement: Las preguntas con tema propio o fuera del corpus no cambian
El segundo loop contextual MUST NOT ejecutarse cuando el primer loop devuelve chunks sobre el umbral, ni cuando el gate G1
es falso. Una pregunta fuera del corpus con tema propio MUST seguir en `sin_evidencia` con `topRelevanceScore = null` y
cero invocaciones al LLM de generación y al agente (RN-02).

#### Scenario: Las preguntas adversarias y cruzadas de la medición siguen sin evidencia [US-271 AC-2] [RN-02]
- **GIVEN** las 24 preguntas con tema de la medición (melanoma, tiroides, cruzadas mama/próstata, glioblastoma, CRISPR, diabetes, CAR-T, vejiga) y `QUERY_CONTEXT_EXPANSION_ENABLED = true`
- **WHEN** se procesa cada una
- **THEN** ninguna dispara el segundo loop contextual (el gate G1 es falso) y las que no superan el umbral responden `sin_evidencia` con `topRelevanceScore = null` y 0 llamadas al LLM de generación

#### Scenario: Una genérica que sigue bajo el umbral tras el segundo loop responde sin evidencia [US-271 AC-3] [RN-02]
- **GIVEN** una pregunta genérica cuyo loop contextual tampoco supera `RELEVANCE_THRESHOLD = 0.30` (tipo sin documentos en el corpus de prueba)
- **WHEN** se procesa
- **THEN** responde `200` con `status = sin_evidencia`, `topRelevanceScore = null` (nunca `0.0`), `evidenceOptions = []` y 0 invocaciones al LLM de generación
- **AND** `meta.retrievalParams.queryRewrite = { applied: true, reason: "contextual" }`

#### Scenario: Con tema propio y primer loop con evidencia no hay segundo loop [US-271 AC-4] [RN-02]
- **GIVEN** una pregunta con tema propio cuyo primer loop devuelve chunks sobre el umbral
- **WHEN** se procesa con `QUERY_CONTEXT_EXPANSION_ENABLED = true`
- **THEN** el retriever registra una sola llamada, `queryRewrite = { applied: false, reason: "no_disparado" }` y la respuesta es idéntica byte a byte a la obtenida con el indicador en `false`

### Requirement: Como máximo un segundo loop; el contextual tiene prioridad sobre la reescritura
Con el primer loop vacío, `/rag/query` MUST ejecutar como máximo un segundo loop: el contextual si el gate G1 es
verdadero y el indicador está activo; si no, la reescritura de US-238 si está habilitada. Tras el loop contextual la
reescritura con LLM MUST NOT correr, aunque `QUERY_REWRITE_ENABLED = true` y `QUERY_REWRITE_MAX_ITERATIONS > 1` (RN-02
enmendada). Con la pregunta con tema propio y el primer loop vacío, SHALL aplicarse la reescritura como hoy.

#### Scenario: Con la reescritura habilitada solo corre el loop contextual [US-271 AC-5] [RN-02]
- **GIVEN** `QUERY_REWRITE_ENABLED = true`, `QUERY_CONTEXT_EXPANSION_ENABLED = true`, una pregunta sin tema propio y el primer loop vacío, con el fake de `QueryRewriter` con contador
- **WHEN** se procesa
- **THEN** hay a lo sumo un segundo loop (el contextual) y el contador de `QueryRewriter` es 0

#### Scenario: Una pregunta con tema propio sigue usando la reescritura [US-271 AC-5] [RN-02] (asumido)
- **GIVEN** `QUERY_REWRITE_ENABLED = true`, el indicador contextual activo, una pregunta con tema propio y el primer loop vacío
- **WHEN** se procesa
- **THEN** corre la reescritura de US-238 con `reason = "disparado"` y no el loop contextual

### Requirement: Los términos del segundo loop contextual provienen solo del catálogo
Los términos que `terminos_del_caso` añade a la consulta MUST existir en el catálogo versionado (`CLINICAL_CATALOG_PATH`);
un valor ausente MUST descartarse sin inventar código (RN-27). La consulta enviada al *reranker* y los *logs* MUST NOT
contener `pseudoPatientId`, identidad, fechas ni texto libre del expediente (RN-10, RN-11). Si no queda ningún término
admitido, no hay segunda recuperación.

#### Scenario: La consulta enriquecida y los logs solo llevan términos del catálogo [US-271 AC-6] [RN-27] [RN-10] [RN-11]
- **GIVEN** un contexto desidentificado con texto libre sembrado («seudónimo X», una fecha, un nombre sintético) en un atributo y un evento, y `QUERY_CONTEXT_EXPANSION_ENABLED = true`
- **WHEN** se procesa una pregunta sin tema propio y se capturan la consulta del *reranker* y los *logs*
- **THEN** cada término añadido es una cadena del catálogo versionado y no aparece nada del texto libre sembrado, ni `pseudoPatientId`, ni fecha, ni identidad
- **AND** los *logs* registran `reason`, el número de términos y el `traceId`, no los términos con su valor

#### Scenario: Sin términos admitidos no hay segunda recuperación [US-271 AC-6] [RN-27] (asumido)
- **GIVEN** un `clinicalContext` cuyos valores de estadio y biomarcador no están en el catálogo y un tipo de cáncer sin etiqueta resoluble
- **WHEN** se procesa una pregunta sin tema propio con primer loop vacío
- **THEN** no hay segunda búsqueda en Milvus y responde `sin_evidencia` con `topRelevanceScore = null`

### Requirement: El segundo loop contextual se configura y está desactivado por defecto
`QUERY_CONTEXT_EXPANSION_ENABLED` MUST valer `false` por defecto; `QUERY_CONTEXT_EXPANSION_FIELDS` (por defecto
`tipo,estadio,biomarcador_principal`) y `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT` (por defecto `plano`) SHALL leerse de
configuración (RN-22) y un valor fuera de su conjunto MUST abortar el arranque. Con el indicador activo el motivo queda en
`meta.retrievalParams.queryRewrite.reason = "contextual"`.

#### Scenario: Por defecto el segundo loop contextual está apagado [US-271 AC-7] [RN-22]
- **GIVEN** el arranque de `rag-orchestrator` sin las variables `QUERY_CONTEXT_EXPANSION_*` en el entorno
- **WHEN** se procesa una pregunta sin tema propio con primer loop vacío
- **THEN** `Settings.query_context_expansion_enabled` es `false`, no hay loop contextual y `queryRewrite = { applied: false, reason: "no_disparado" }`

#### Scenario: Un valor inválido de configuración aborta el arranque [US-271 AC-7] [RN-22] (asumido)
- **GIVEN** `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,nombre_del_paciente`
- **WHEN** arranca `rag-orchestrator`
- **THEN** el arranque falla con un error de configuración que nombra la variable y no el valor

### Requirement: Chunks recuperados con cero opciones soportadas responden con un mensaje determinista
Cuando el turno de evidencia del chat tiene chunks sobre el umbral y 0 opciones soportadas tras citas y NLI, la respuesta
MUST ser un único bloque `kind = limitacion` con el texto fijo «Evidencia recuperada sin opciones soportadas», sin texto del
LLM, más las limitaciones de US-266, y MUST NOT confundirse con `sin_evidencia` (RN-01, RN-23).

#### Scenario: Con chunks y sin opciones soportadas el texto es el fijo [US-271 AC-10] [RN-01] [RN-23]
- **GIVEN** un retriever con chunks sobre el umbral y un NLI falso que devuelve `neutral` para todas las opciones propuestas
- **WHEN** se procesa el turno de evidencia
- **THEN** el bloque de limitación dice exactamente «Evidencia recuperada sin opciones soportadas», el texto no proviene del LLM y la respuesta no declara `sin_evidencia`
- **AND** las limitaciones de US-266 acompañan al bloque y `topRelevanceScore` es el del primer chunk (no `null`)

## MODIFIED Requirements

### Requirement: queryRewrite se emite siempre y sin nulos; el segundo loop solo corre en /rag/query
`meta.retrievalParams.queryRewrite` MUST emitirse sin `null` en toda respuesta de `/rag/query` y `/rag/follow-up`. El segundo loop SHALL correr solo en `/rag/query`; `/rag/follow-up` MUST emitir `{applied: false, reason: "no_aplica"}` sin invocar la reescritura, así la memoria rotulada nunca llega a ese *prompt* (RN-24). Con `QUERY_REWRITE_ENABLED = false` y sin loop contextual SHALL emitirse `no_disparado`. Cuando el segundo loop es el contextual sin LLM (US-271, ADR-52) SHALL emitirse `{applied: true, reason: "contextual"}`, haya rescatado o no.

#### Scenario: El seguimiento declara no_aplica y no invoca la reescritura [US-238] [RN-24] [decisión D-c]
- **GIVEN** el armado de `retrievalParams` para una respuesta de `/rag/follow-up` y el fake de `QueryRewriter` con contador
- **WHEN** se arma la respuesta (en integración si la ruta ya existe; si no, sobre `_armar_meta_de_recuperacion` y el ejemplo `rag-follow-up-response.json`)
- **THEN** `meta.retrievalParams.queryRewrite = { applied: false, reason: "no_aplica" }`
- **AND** el contador de `QueryRewriter` es 0

#### Scenario: Reescritura desactivada se traza como no disparada [US-238 AC-4] [RN-22]
- **GIVEN** `QUERY_REWRITE_ENABLED = false`, `QUERY_CONTEXT_EXPANSION_ENABLED = false` y un primer loop vacío
- **WHEN** se procesa la consulta
- **THEN** responde `sin_evidencia` con `queryRewrite = { applied: false, reason: "no_disparado" }` y el contador de `QueryRewriter` es 0

#### Scenario: El segundo loop contextual se traza como contextual y la respuesta valida contra el contrato [US-271 AC-7] [RN-22] [ADR-26]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true` y una pregunta sin tema propio con primer loop vacío
- **WHEN** se procesa la consulta
- **THEN** `meta.retrievalParams.queryRewrite = { applied: true, reason: "contextual" }` sin `null`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor y coincide con el ejemplo `contracts/examples/rag-query-contextual.json`

Regresión [RN-02] activa desde S3 (US-055): el escenario original de `Q-SIN` se conserva. Regresión [RN-03] (US-055) y [RN-10, RN-11, RN-12] (US-049) siguen en verde.
