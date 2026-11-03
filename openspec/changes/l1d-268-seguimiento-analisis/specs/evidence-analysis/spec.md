## ADDED Requirements

### Requirement: Endpoint de seguimiento sin estado sobre el pipeline del análisis
`rag-orchestrator` MUST atender `POST /rag/follow-up` reutilizando los pasos de `/rag/query` (recuperación, *reranker*, umbral, generación, validación de citas, soporte NLI y filtro RN-23), con una plantilla de prompt propia versionada en `meta.promptVersion`, y responder `RagFollowUpResponse` válido contra su spec. Toda afirmación devuelta SHALL citar chunks recuperados **en este turno** o un `patientDataRef` (RN-01, RN-04, ADR-34).

#### Scenario: Respuesta con evidencia citada y validada [US-218 AC-1] [RN-01] [RN-04]
- **GIVEN** el perfil `RAG_ADAPTERS=fake`, `rag-follow-up-request.json`, chunks sobre el umbral y el LLM falso con guion de seguimiento que cita `C1` con una afirmación que el NLI falso marca `entailment`
- **WHEN** `clinical-api` (JWT de servicio de test) envía `POST /rag/follow-up`
- **THEN** responde `200` con `status = con_evidencia`, válido contra el spec de `rag-orchestrator`, cada afirmación con ≥ 1 cita cuyo `chunkId` está entre los recuperados en esta llamada y los campos de la cita copiados del corpus
- **AND** `meta.retrievalParams.queryRewrite = {applied: false, reason: "no_aplica"}` y `meta.promptVersion` es la versión de la plantilla de seguimiento

#### Scenario: La pregunta llega en NFD y el prompt la recibe en NFC [US-218 AC-1] [US-250 AC-4] [OUT-05]
- **GIVEN** el mismo contexto y el LLM falso que registra el prompt
- **WHEN** la `question` llega en NFD con espacios repetidos y, en otra llamada, en NFC
- **THEN** los dos prompts registrados tienen el mismo SHA-256 y la consulta que reciben recuperación y *reranker* es la misma
- **AND** una `question` formada solo por espacios responde `422` sin invocar ningún adapter

#### Scenario: El NLI caído falla cerrado sin respuesta parcial [US-218 AC-1] [RN-01]
- **GIVEN** el mismo contexto y el NLI falso configurado para fallar
- **WHEN** se procesa el seguimiento
- **THEN** responde `503` con `error = NLI_UNAVAILABLE`, válido contra el spec, sin afirmaciones ni texto generado

### Requirement: La memoria del análisis nunca es cita ni soporte en el seguimiento
`rag-orchestrator` MUST incluir `analysisMemory` en el prompt solo como bloque rotulado de contexto, separado de los fragmentos citables, y SHALL NOT usar su texto como premisa del NLI ni como cita. Una afirmación cuyo único sostén sea la memoria MUST omitirse y contarse en `omittedClaims` (RN-24).

#### Scenario: Una afirmación sostenida solo en la memoria se omite [US-218 AC-2] [RN-24]
- **GIVEN** el mismo contexto y un guion del LLM falso con dos afirmaciones: una que cita `C1` con `entailment`, y otra que copia la síntesis de `analysisMemory` y cita `C1`, que el NLI falso marca `neutral` frente a `C1`
- **WHEN** se procesa el seguimiento
- **THEN** `answer` contiene solo la primera afirmación y `omittedClaims = 1`
- **AND** las premisas registradas por el NLI falso son solo textos de chunks recuperados (y verbalizaciones de datos del paciente), nunca el texto de `analysisMemory`

#### Scenario: El prompt rotula la memoria como contexto no citable [US-218 AC-2] [RN-24]
- **GIVEN** el LLM falso que registra el prompt
- **WHEN** se procesa el seguimiento
- **THEN** el texto de `analysisMemory` aparece en el prompt dentro del bloque rotulado como contexto no citable y sin alias `C<n>`, y los fragmentos recuperados aparecen con sus alias en un bloque distinto

### Requirement: Seguimiento sin evidencia sin invocar al LLM
Si ningún chunk supera `RELEVANCE_THRESHOLD`, `/rag/follow-up` MUST responder `status = sin_evidencia` con `answer` y `citedSources` vacíos y `topRelevanceScore = null` (no `0.0`), sin invocar al LLM de generación ni la reescritura de la consulta (RN-02).

#### Scenario: Ningún chunk supera el umbral [US-218 AC-3] [RN-02]
- **GIVEN** el *reranker* falso con todos los puntajes bajo `RELEVANCE_THRESHOLD` y contadores en el LLM falso y en el `QueryRewriter` falso
- **WHEN** se procesa el seguimiento
- **THEN** responde `200` con `status = sin_evidencia`, `topRelevanceScore = null`, `answer` y `citedSources` vacíos, válido contra el spec
- **AND** el LLM falso y el `QueryRewriter` falso registran cero llamadas

### Requirement: Preguntas fuera del contexto del análisis
`/rag/follow-up` MUST clasificar `fuera_de_contexto` la pregunta ajena al análisis con una regla determinista previa a recuperar (identidad de otra persona u otro cáncer sin el del contexto; design D7) y con la regla del prompt; una comparativa que nombra ambos cánceres MUST NOT quedar fuera. La respuesta SHALL tener `answer` y `citedSources` vacíos y `topRelevanceScore = null` `[S5 resp. 13]`.

#### Scenario: Pregunta sobre otro paciente o de otro tipo de cáncer [US-218 AC-5] [Pre-S1 resp. 14] (señales del clasificador: Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** un contexto de mama y contadores en todos los adapters falsos
- **WHEN** la `question` contiene un marcador de identidad de otra persona (enmascarado por ADR-40) o nombra, por un sinónimo del catálogo, el cáncer de próstata sin nombrar el de mama
- **THEN** responde `200` con `status = fuera_de_contexto`, `answer` y `citedSources` vacíos y `topRelevanceScore = null`, válido contra el spec
- **AND** los adapters de embeddings, recuperación, *reranker*, LLM y NLI registran cero llamadas

#### Scenario: Una pregunta comparativa legítima que menciona otro cáncer no queda fuera de contexto [US-218 AC-5] [S5 resp. 13]
- **GIVEN** un contexto de mama, chunks de mama sobre el umbral y el LLM falso con un guion que cita `C1` con `entailment`
- **WHEN** la `question` es «¿La evidencia de este análisis compara el resultado en cáncer de mama con lo descrito en cáncer de próstata?»
- **THEN** el clasificador determinista no la marca `fuera_de_contexto` y la respuesta es `200` con `status = con_evidencia`, válida contra el spec
- **AND** la recuperación recibió el filtro `cancerType` del contexto (mama) y cada afirmación cita un chunk recuperado en esta llamada

#### Scenario: El LLM marca la pregunta como ajena según la regla del prompt [US-218 AC-5] [Pre-S1 resp. 14]
- **GIVEN** una pregunta que pasa el clasificador determinista y el LLM falso que devuelve el marcador estructurado `fuera_de_contexto`
- **WHEN** se procesa el seguimiento
- **THEN** responde `status = fuera_de_contexto` sin afirmaciones ni citas y `topRelevanceScore = null`

#### Scenario: Una salida del LLM que no parsea no se convierte en fuera de contexto [US-218 AC-5] (Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** el LLM falso que devuelve una salida inválida
- **WHEN** se procesa el seguimiento
- **THEN** responde el error de salida inválida existente (`ErrorSalidaLlmInvalida`), nunca `fuera_de_contexto`

### Requirement: Lenguaje prohibido omitido en el seguimiento
`/rag/follow-up` MUST aplicar a cada afirmación el verificador común de términos prescriptivos de RN-23 (el mismo de `/rag/query`); una afirmación con un término de la lista MUST omitirse, contarse en `omittedClaims` y no aparecer en la respuesta.

#### Scenario: Una afirmación con un término prohibido nunca se muestra [US-218 AC-7] [RN-23] [§15 resp. 2]
- **GIVEN** un guion del LLM falso con una afirmación válida y otra que contiene «debe recibir», ambas citando `C1` con `entailment`
- **WHEN** se procesa el seguimiento
- **THEN** `answer` contiene solo la afirmación válida, `omittedClaims = 1` y ningún campo de la respuesta contiene el término

### Requirement: Backend 2 no guarda estado del seguimiento
`rag-orchestrator` MUST NOT escribir turnos, preguntas, memoria ni contexto del seguimiento en disco, caché, Milvus, el schema `corpus` ni los logs; cada llamada se resuelve solo con su cuerpo (FR-31, `[Pre-S1 resp. 29]`).

#### Scenario: Dos turnos no dejan rastro en Backend 2 [US-218 AC-8] [RN-11] [Pre-S1 resp. 29]
- **GIVEN** un directorio temporal vigilado como directorio de trabajo, el fake de Milvus que registra escrituras, la sesión de `corpus` sin permisos de escritura y los logs capturados
- **WHEN** se procesan dos seguimientos con `pseudoPatientId`, `traceId` y una frase sintética marcada distintos
- **THEN** el directorio no tiene ficheros nuevos, Milvus registra cero escrituras, no hay escrituras en `corpus`, y ninguna línea de log contiene la pregunta, la memoria, la frase marcada ni el `pseudoPatientId`
- **AND** el segundo turno no recibe ningún dato del primero (respuesta idéntica a procesarlo solo)
