## ADDED Requirements

### Requirement: Una pregunta sin tema propio con el primer loop vacío dispara un único segundo loop contextual sin LLM
Con el indicador `QUERY_CONTEXT_EXPANSION_ENABLED` activo, el primer loop vacío, el gate G1 verdadero (sin palabra de
contenido tras quitar las vacías y de marco) y al menos un término admitido, `/rag/query` MUST ejecutar **una** nueva
recuperación con la pregunta más los términos del caso del catálogo (`terminos_del_caso`) y MUST NOT invocar a ningún LLM
en ese loop. Las citas son solo de los fragmentos recuperados en esa consulta (RN-02, RN-04).

#### Scenario: Una pregunta genérica recupera evidencia con los términos del caso [US-271 AC-1] [RN-02] [RN-04]
- **GIVEN** el corpus `s5-corpus-ampliado` (o su fixture de prueba), `QUERY_CONTEXT_EXPANSION_ENABLED = true`, adapters falsos con contadores y el contexto desidentificado del paciente semilla (a) (mama, estadio y biomarcador principal presentes)
- **WHEN** llega «¿Qué evidencia hay para este caso?» y el primer loop no supera el umbral
- **THEN** el retriever registra exactamente una llamada más y la consulta puntuada es la pregunta seguida de la etiqueta CIE-10 de mama, el estadio TNM y el biomarcador principal
- **AND** la respuesta es `con_evidencia` y cada cita apunta a un chunk recuperado en ese turno
- **AND** el LLM de reescritura registra cero invocaciones durante el segundo loop y `meta.retrievalParams.contextExpansion = { applied: true, fields: ["tipo", "estadio", "biomarcador_principal"] }`

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
- **THEN** ninguna dispara el segundo loop contextual (el gate G1 es falso, `contextExpansion` ausente) y las que no superan el umbral responden `sin_evidencia` con `topRelevanceScore = null` y 0 llamadas al LLM de generación

#### Scenario: Una genérica que sigue bajo el umbral tras el segundo loop responde sin evidencia [US-271 AC-3] [RN-02]
- **GIVEN** una pregunta genérica cuyo loop contextual tampoco supera `RELEVANCE_THRESHOLD = 0.30` (tipo sin documentos en el corpus de prueba)
- **WHEN** se procesa
- **THEN** responde `200` con `status = sin_evidencia`, `topRelevanceScore = null` (nunca `0.0`), `evidenceOptions = []` y 0 invocaciones al LLM de generación
- **AND** `meta.retrievalParams.contextExpansion.applied = true` (el loop corrió) y `queryRewrite = { applied: false, reason: "no_disparado" }`

#### Scenario: Con tema propio y primer loop con evidencia no hay segundo loop [US-271 AC-4] [RN-02]
- **GIVEN** una pregunta con tema propio cuyo primer loop devuelve chunks sobre el umbral
- **WHEN** se procesa con `QUERY_CONTEXT_EXPANSION_ENABLED = true`
- **THEN** el retriever registra una sola llamada, `queryRewrite = { applied: false, reason: "no_disparado" }`, la propiedad `contextExpansion` no aparece y la respuesta es idéntica byte a byte a la obtenida con el indicador en `false`

### Requirement: Como máximo un segundo loop; el contextual tiene prioridad sobre la reescritura
Con el primer loop vacío, `/rag/query` MUST ejecutar como máximo un segundo loop: el contextual si el gate G1 es
verdadero, el indicador está activo y hay al menos un término admitido; si no, la reescritura de US-238 si está
habilitada. Tras el loop contextual la reescritura con LLM MUST NOT correr, aunque `QUERY_REWRITE_ENABLED = true` y
`QUERY_REWRITE_MAX_ITERATIONS > 1` (RN-02 enmendada). Con la pregunta con tema propio y el primer loop vacío, SHALL
aplicarse la reescritura como hoy.

#### Scenario: Con la reescritura habilitada solo corre el loop contextual [US-271 AC-5] [RN-02]
- **GIVEN** `QUERY_REWRITE_ENABLED = true`, `QUERY_CONTEXT_EXPANSION_ENABLED = true`, una pregunta sin tema propio y el primer loop vacío, con el fake de `QueryRewriter` con contador
- **WHEN** se procesa
- **THEN** hay a lo sumo un segundo loop (el contextual) y el contador de `QueryRewriter` es 0

#### Scenario: Una pregunta con tema propio sigue usando la reescritura [US-271 AC-5] [RN-02] (asumido)
- **GIVEN** `QUERY_REWRITE_ENABLED = true`, el indicador contextual activo, una pregunta con tema propio y el primer loop vacío
- **WHEN** se procesa
- **THEN** corre la reescritura de US-238 con `queryRewrite.reason = "disparado"`, no el loop contextual y `contextExpansion` ausente

### Requirement: Los términos del segundo loop contextual provienen solo del catálogo
Los términos que `terminos_del_caso` añade a la consulta MUST existir en el catálogo versionado (`CLINICAL_CATALOG_PATH`);
un valor ausente MUST descartarse sin inventar código (RN-27), y el valor de un biomarcador solo MUST entrar si pertenece
al conjunto de valores del catálogo. La consulta enviada al *reranker* y los *logs* MUST NOT contener `pseudoPatientId`,
identidad, fechas ni texto libre del expediente (RN-10, RN-11). Si no queda ningún término admitido, no hay segunda
recuperación.

#### Scenario: La consulta enriquecida y los logs solo llevan términos del catálogo [US-271 AC-6] [RN-27] [RN-10] [RN-11]
- **GIVEN** un contexto desidentificado con texto libre sembrado («seudónimo X», una fecha, un nombre sintético) en un atributo y un evento, y `QUERY_CONTEXT_EXPANSION_ENABLED = true`
- **WHEN** se procesa una pregunta sin tema propio y se capturan la consulta del *reranker* y los *logs*
- **THEN** cada término añadido es una cadena del catálogo versionado y no aparece nada del texto libre sembrado, ni `pseudoPatientId`, ni fecha, ni identidad
- **AND** los *logs* registran los campos usados, el número de términos y el `traceId`, no los términos con su valor

#### Scenario: Un valor de biomarcador fuera del conjunto del catálogo no entra a la consulta [US-271 AC-6] [RN-27] [RN-10]
- **GIVEN** un contexto desidentificado cuyo biomarcador principal tiene un valor libre fuera del conjunto de valores del catálogo
- **WHEN** se procesa una pregunta sin tema propio con primer loop vacío
- **THEN** la consulta del *reranker* no contiene ese valor y, a lo sumo, lleva el nombre canónico del biomarcador

#### Scenario: Sin términos admitidos no hay segunda recuperación y el motivo es no_disparado [US-271 AC-6] [RN-27] (asumido)
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true`, `QUERY_REWRITE_ENABLED = false`, el gate G1 verdadero y un `clinicalContext` cuyos valores de estadio y biomarcador no están en el catálogo y un tipo de cáncer sin etiqueta resoluble
- **WHEN** se procesa una pregunta sin tema propio con primer loop vacío
- **THEN** no hay segunda búsqueda en Milvus y responde `sin_evidencia` con `topRelevanceScore = null`
- **AND** `queryRewrite = { applied: false, reason: "no_disparado" }` y la propiedad `contextExpansion` no aparece

### Requirement: El segundo loop contextual se configura y está desactivado por defecto
`QUERY_CONTEXT_EXPANSION_ENABLED` MUST valer `false` por defecto; `QUERY_CONTEXT_EXPANSION_FIELDS` (por defecto
`tipo,estadio,biomarcador_principal`) y `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT` (por defecto `plano`) SHALL leerse de
configuración (RN-22) y un valor fuera de su conjunto MUST abortar el arranque.

#### Scenario: Por defecto el segundo loop contextual está apagado [US-271 AC-7] [RN-22]
- **GIVEN** el arranque de `rag-orchestrator` sin las variables `QUERY_CONTEXT_EXPANSION_*` en el entorno
- **WHEN** se procesa una pregunta sin tema propio con primer loop vacío
- **THEN** `Settings.query_context_expansion_enabled` es `false`, no hay loop contextual, `queryRewrite = { applied: false, reason: "no_disparado" }` y `contextExpansion` no aparece

#### Scenario: Un valor inválido de configuración aborta el arranque [US-271 AC-7] [RN-22] (asumido)
- **GIVEN** `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,nombre_del_paciente`
- **WHEN** arranca `rag-orchestrator`
- **THEN** el arranque falla con un error de configuración que nombra la variable y no el valor

### Requirement: contextExpansion declara el loop contextual sin alterar queryRewrite
`meta.retrievalParams.contextExpansion` SHALL ser una propiedad opcional `{applied, fields}` emitida solo cuando corrió el
loop contextual, con `fields` ⊂ `{tipo, estadio, biomarcador_principal}` y sin valores; MUST NOT emitirse con `null`.
`queryRewrite` MUST conservar su forma y sus valores: con el loop contextual vale `no_disparado`. El cambio SHALL ser
aditivo, sin excepciones ADR-26.

#### Scenario: El loop contextual se traza con contextExpansion y la respuesta valida contra el contrato [US-271 AC-7] [RN-22] [ADR-26]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true` y una pregunta sin tema propio con primer loop vacío
- **WHEN** se procesa la consulta
- **THEN** `meta.retrievalParams.contextExpansion = { applied: true, fields: [...] }` sin `null` y `queryRewrite = { applied: false, reason: "no_disparado" }`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor y coincide con el ejemplo `contracts/examples/rag-query-contextual.json`

#### Scenario: El JSON crudo no lleva contextExpansion cuando no corrió el loop [US-271 AC-7] [ADR-26]
- **GIVEN** una petición de `/rag/query` que no dispara el loop contextual, pasada como JSON crudo por `TestClient` y por `respx`
- **WHEN** se inspecciona el cuerpo de la respuesta sin pasar por el modelo Pydantic
- **THEN** la clave `contextExpansion` no existe (ni como `null`) y `queryRewrite` conserva su forma

#### Scenario: El contrato es aditivo y no requiere excepciones [US-271 AC-7] [ADR-26]
- **GIVEN** el `openapi.yaml` de `rag-orchestrator` con `contextExpansion` y el de `main` como base
- **WHEN** corre `contracts:breaking` contra `main`
- **THEN** oasdiff no reporta ERR ni WARN en `POST /rag/query`, `POST /rag/follow-up` ni `POST /chat/turn`, y la versión de rag es la siguiente menor libre respecto de `main`

### Requirement: Chunks recuperados con cero opciones soportadas responden con un mensaje determinista
Cuando el turno de evidencia del chat tiene chunks sobre el umbral y 0 opciones soportadas tras citas y NLI, la respuesta
MUST ser un único bloque `kind = limitacion` con el texto fijo «Evidencia recuperada sin opciones soportadas», sin texto del
LLM, más las limitaciones de US-266, y `notices[]` MUST contener los dos avisos de RN-19. No MUST confundirse con
`sin_evidencia` (RN-01, RN-19, RN-23).

#### Scenario: Con chunks y sin opciones soportadas el texto es el fijo [US-271 AC-10] [RN-01] [RN-23]
- **GIVEN** un retriever con chunks sobre el umbral y un NLI falso que devuelve `neutral` para todas las opciones propuestas
- **WHEN** se procesa el turno de evidencia
- **THEN** el bloque de limitación dice exactamente «Evidencia recuperada sin opciones soportadas», el texto no proviene del LLM y la respuesta no declara `sin_evidencia`
- **AND** las limitaciones de US-266 acompañan al bloque y `topRelevanceScore` es el del primer chunk (no `null`)

#### Scenario: El turno sin opciones soportadas lleva los dos avisos de IA [US-271 AC-10] [RN-19]
- **GIVEN** el mismo turno, servido como `contracts/examples/chat-turn-evidencia-sin-opciones.json`
- **WHEN** se inspecciona `notices[]`
- **THEN** contiene exactamente «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación»

## MODIFIED Requirements

### Requirement: Un segundo loop de reescritura rescata el primer loop vacío
Con cero chunks sobre el umbral en el primer loop y `QUERY_REWRITE_ENABLED = true`, el pipeline MUST invocar una vez la reescritura con el LLM local, recuperar de nuevo y, si algún chunk supera el umbral, continuar con la generación (FR-09). Con al menos un chunk sobre el umbral en el primer loop SHALL NOT invocarse. No corre si antes corrió el loop contextual de ADR-52 (US-271), que tiene prioridad para las preguntas sin tema propio.

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
El segundo loop MUST ejecutarse como máximo `QUERY_REWRITE_MAX_ITERATIONS` veces, sin tercer loop, y, junto con el loop contextual de ADR-52 (US-271), como máximo **un** segundo loop por consulta; y `QUERY_REWRITE_ENABLED`, `QUERY_REWRITE_MAX_ITERATIONS` y `QUERY_REWRITE_DEADLINE_MS` SHALL leerse de configuración (RN-22).

#### Scenario: Un LLM que siempre reformula produce un solo segundo loop [US-238 AC-4] [RN-22]
- **GIVEN** `QUERY_REWRITE_MAX_ITERATIONS = 1` y un LLM falso que siempre propone otra reformulación
- **WHEN** se procesa una pregunta con el primer loop vacío
- **THEN** hay un solo segundo loop y no hay un tercero
- **AND** las tres claves se leen de la configuración, sin literales en código

### Requirement: La pregunta original manda sobre la reescritura
Salvo el loop contextual de ADR-52 (US-271), que puntúa «pregunta + términos del catálogo» solo para preguntas sin tema propio, la reescritura MUST cambiar solo el vector enviado a Milvus: el reranker puntúa contra la pregunta original (el umbral se compara con ese puntaje) y la respuesta y el `AIAnalysisRecord` conservan siempre la pregunta original (RN-03, RN-06).

#### Scenario: Pregunta mostrada, guardada y puntuada es la original [US-238 AC-7] [RN-03] [RN-06]
- **GIVEN** el caso de `Q-TYPO-SIN-EVIDENCIA` rescatado por el segundo loop
- **WHEN** se completa la respuesta
- **THEN** la pregunta mostrada y guardada es la original y el reranker puntuó los chunks del segundo loop contra ella
- **AND** la reescritura solo cambió el vector enviado a Milvus
