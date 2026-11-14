## ADDED Requirements

### Requirement: El turno de evidencia devuelve un análisis de evidencia completo
El nodo `evidencia` SHALL reutilizar el caso de uso de `/rag/query` y MUST devolver en `/chat/turn` `intent = "evidencia"` y
`evidenceAnalysis` con el contrato `EvidenceAnalysis`, cuyas citas sean solo de chunks recuperados en ese turno, con
estados de aplicabilidad por criterio y opciones en el orden de RN-28 (FR-09, FR-25, RN-01, RN-28). El turno MUST rellenar
`structuredState.ultimaEvidencia` sin `analysisId` (Backend 1 es el dueño de los ids).

#### Scenario: Análisis con opciones citadas en el turno [US-265 AC-1] [FR-09] [RN-01] [AC-10.1]
- **GIVEN** el contexto desidentificado del paciente semilla (a), el corpus FX-06a-a y el LLM falso `LLM-OK`
- **WHEN** llega a `/chat/turn` la pregunta «¿Qué evidencia existe para pacientes con las características de este paciente?» sin `activeAnalysisId`
- **THEN** la respuesta tiene `intent = "evidencia"`, sin `subintent`, y `evidenceAnalysis` válido contra el spec con `evidenceOptions` ≥ 1
- **AND** cada cita de `evidenceAnalysis` y de los bloques `kind = evidencia` apunta a un chunk recuperado en ese turno
- **AND** `structuredState.ultimaEvidencia` tiene `query` (la pregunta enmascarada), `chunkIds` (los evaluados por el
  *reranker* en el turno) y `topRelevanceScore` igual al de `evidenceAnalysis`, y no tiene `analysisId`

#### Scenario: Aplicabilidad con un dato faltante en el paciente [US-265 AC-2] [AC-04.3] [RN-28]
- **GIVEN** el contexto desidentificado del paciente semilla (e), sin estado menopáusico
- **WHEN** se procesa la misma pregunta de evidencia
- **THEN** cada opción trae estados por criterio y el criterio de menopausia es «Desconocido» con causa «falta en el paciente»
- **AND** las opciones siguen el orden de RN-28 (menos «No coincide» excluyentes, más «Coincide», relevancia como desempate)

### Requirement: El seguimiento de un análisis vuelve a recuperar y no crea análisis
Con `activeAnalysisId` y una pregunta referida a ese resultado, el turno SHALL tener `subintent = "seguimiento_evidencia"`,
MUST volver a recuperar fragmentos, MUST citar solo chunks recuperados en ese turno y MUST NOT devolver `evidenceAnalysis`
(RN-04, ADR-51 §5). Sin `activeAnalysisId` el turno MUST NOT clasificarse como seguimiento. El seguimiento MUST actualizar
`structuredState.ultimaEvidencia` sin incluir `analysisId` ni `activeAnalysisId`.

#### Scenario: El seguimiento re-recupera y cita solo lo del turno [US-265 AC-3] [RN-04] [S6 resp. 6]
- **GIVEN** el hilo del turno de evidencia de AC-1 y un retriever falso que cuenta llamadas
- **WHEN** llega «¿En qué se diferencia la población del estudio de mi paciente?» con `activeAnalysisId` del turno anterior
- **THEN** el retriever registra una llamada más, la respuesta tiene `intent = "evidencia"`, `subintent = "seguimiento_evidencia"` y no trae `evidenceAnalysis`
- **AND** todas las citas de sus bloques son de chunks recuperados en ese turno

#### Scenario: Sin análisis activo no hay seguimiento [US-265 AC-3] (asumido)
- **GIVEN** un hilo sin turnos de evidencia y la petición sin `activeAnalysisId`
- **WHEN** llega «¿En qué se diferencia la población del estudio de mi paciente?»
- **THEN** la respuesta no tiene `subintent` y, si clasifica como evidencia, trae un `evidenceAnalysis` nuevo

### Requirement: El seguimiento sin chunks sobre el umbral responde sin evidencia sin invocar al LLM
Si en el seguimiento ningún chunk supera el umbral, el turno MUST responder «sin evidencia» con un bloque `limitacion`
determinista, MUST NOT invocar al LLM y MUST dejar `ultimaEvidencia.topRelevanceScore = null` (RN-02).

#### Scenario: Seguimiento sin chunks sobre el umbral responde sin evidencia sin LLM [US-265 AC-3] [RN-02]
- **GIVEN** el hilo de AC-1 con `activeAnalysisId`, un *reranker* falso que deja todos los chunks bajo el umbral y un LLM
  falso que cuenta llamadas
- **WHEN** llega «¿En qué se diferencia la población del estudio de mi paciente?»
- **THEN** la respuesta tiene `subintent = "seguimiento_evidencia"`, sin `evidenceAnalysis` ni bloques `evidencia`, y un
  bloque `limitacion` que dice que no se encontró evidencia
- **AND** el LLM falso registra cero llamadas (ni generación, ni reescritura, ni clasificación)
- **AND** `structuredState.ultimaEvidencia.topRelevanceScore` es `null` (nunca `0.0`)

### Requirement: Una afirmación del seguimiento sin soporte NLI se omite
En el seguimiento, una afirmación citada a un chunk del turno cuyo NLI no es `entailment` MUST omitirse de los bloques y
sumar 1 a `omittedClaims` (RN-01).

#### Scenario: Afirmación del seguimiento con NLI neutral se omite [US-265 AC-7] [RN-01]
- **GIVEN** el seguimiento de AC-3 con un LLM falso que devuelve dos afirmaciones citadas a chunks del turno y un NLI
  falso `entailment` para la primera y `neutral` para la segunda
- **WHEN** se valida la respuesta
- **THEN** solo la primera aparece en los bloques `evidencia` y `omittedClaims` aumenta en 1
- **AND** ningún bloque contiene el texto de la segunda

### Requirement: La respuesta anterior es memoria no citable en el seguimiento
En el seguimiento, la respuesta del turno anterior SHALL viajar al prompt dentro del bloque «memoria de la conversación, no
citable», armado con `PromptBuilder.memoria()` (L1D-108); una afirmación respaldada solo por esa respuesta MUST omitirse
y sumar 1 a `omittedClaims` (RN-24).

#### Scenario: Afirmación respaldada solo por el turno anterior [US-265 AC-4] [RN-24]
- **GIVEN** el seguimiento de AC-3 con el LLM falso `CHAT-MEMORIA`
- **WHEN** se valida la respuesta
- **THEN** la afirmación respaldada solo por la respuesta del turno anterior no aparece en los bloques y `omittedClaims` aumenta en 1
- **AND** el prompt capturado contiene esa respuesta dentro de `<memory citable="no">` y fuera de los bloques
  `<document>`, sin los rótulos `INICIO_DE_LA_MEMORIA` / `FIN_DE_LA_MEMORIA`

### Requirement: El turno de evidencia usa lenguaje no prescriptivo
Ante cualquier pregunta, el bloque de evidencia SHALL llevar el encabezado «Opciones descritas en la evidencia», ningún
texto mostrado MUST contener términos de la lista prohibida de RN-23 y `notices` MUST incluir los avisos de RN-19 desde
la configuración de Backend 2.

#### Scenario: Pregunta prescriptiva [US-265 AC-5] [RN-23] [RN-19]
- **GIVEN** el paciente semilla (a) y `LLM-OK`
- **WHEN** llega «¿Qué tratamiento debe recibir esta paciente?»
- **THEN** el bloque de evidencia lleva el encabezado «Opciones descritas en la evidencia» y ningún texto de bloques ni de `evidenceAnalysis` contiene un término de la lista prohibida
- **AND** `notices` incluye el aviso de IA y el de uso académico tomados de la configuración de Backend 2, con el literal
  sin punto final

### Requirement: LLM caído en el turno de evidencia sin nube
Si el LLM local no está disponible en el turno de evidencia, `/chat/turn` MUST responder `503` con el error tipado
existente `LOCAL_LLM_UNAVAILABLE` y MUST NOT invocar ningún adapter de nube (RN-12).

#### Scenario: LLM local caído [US-265 AC-6] [RN-12] [AC-06.1]
- **GIVEN** el LLM falso `LLM-CAIDO` y adapters de nube falsos que cuentan llamadas
- **WHEN** llega el turno de evidencia
- **THEN** `/chat/turn` responde `503` con `code = "LOCAL_LLM_UNAVAILABLE"`, igual a
  `contracts/examples/chat-turn-llm-local-no-disponible.json`, validado contra el spec y sin `evidenceAnalysis`
- **AND** los adapters de nube registran cero llamadas

### Requirement: Una opción sin soporte no se muestra en el turno
Una opción con una afirmación sin soporte NLI SHALL ir a `discardedOptions` del `evidenceAnalysis` y MUST NOT aparecer
entre las opciones ni en los bloques `kind = evidencia` del turno (FR-10, RN-01).

#### Scenario: Opción sin soporte descartada [US-265 AC-7] [FR-10] [RN-01]
- **GIVEN** el LLM falso `LLM-SIN-SOPORTE` y el NLI falso `neutral` para su afirmación
- **WHEN** se valida el turno de evidencia
- **THEN** la opción está en `evidenceAnalysis.discardedOptions` y no en `evidenceOptions`
- **AND** ningún bloque del turno contiene el texto «reduce la mortalidad a la mitad»
