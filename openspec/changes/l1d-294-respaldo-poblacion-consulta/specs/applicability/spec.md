## ADDED Requirements

### Requirement: Respaldo en la consulta solo para criterios de población pendientes
Si una fuente citada tiene un criterio con la marca `pendiente` en `population_criteria` (forma de US-241), el servicio de aplicabilidad MUST ejecutar la tarea corta de US-242 (una fuente y un criterio por llamada; prompt sin `clinicalContext`, `pseudoPatientId` ni pregunta) y aceptar el valor solo con cita a un fragmento recuperado y NLI `entailment` (RN-01, ADR-47). Sin criterios pendientes MUST NOT invocar el adapter de respaldo.

#### Scenario: El respaldo completa el criterio pendiente de doc-b9 [US-244 AC-1] [AC-08.3] [RN-01] [ADR-47]
- **GIVEN** el paciente A-M2, el catálogo `test-apl-1.2.0`, el LLM de opciones `LLM-POB` limitado a O-P9 y el adapter de respaldo `RESP-OK` (FX-08b-c)
- **WHEN** se procesa el análisis
- **THEN** el adapter de respaldo registra una llamada, con solo los fragmentos de `doc-b9` y solo el criterio `estado_menopausico` (el único con la marca `pendiente`)
- **AND** el prompt registrado no contiene ningún campo de `clinicalContext`, ni el `pseudoPatientId`, ni el texto de la pregunta
- **AND** el valor pasa el NLI contra `ch-b9-1` y el criterio queda `coincide`

#### Scenario: Sin criterios pendientes no hay llamadas al respaldo [US-244 AC-5] [ADR-47]
- **GIVEN** un análisis cuyas fuentes citadas (O-P1…O-P8) no tienen ningún criterio con la marca `pendiente` en `population_criteria`
- **WHEN** se procesa el análisis
- **THEN** el adapter de respaldo registra cero llamadas

### Requirement: Un respaldo fallido degrada el criterio sin descartar el análisis
Si el respaldo falla por salida truncada, bucle de repetición, plazo vencido o LLM caído tras generar las opciones, el criterio MUST quedar `desconocido` con `unknownReason = respaldo_fallido`; la respuesta MUST ser `200`, con `evidenceOptions` igual a la del análisis sin respaldo, y MUST NOT incluir `LOCAL_LLM_UNAVAILABLE` por esa causa (RN-26).

#### Scenario: Un bucle de repetición deja el criterio respaldo_fallido y conserva las opciones [US-244 AC-2] [RN-26] [S4 resp. 3]
- **GIVEN** el adapter `RESP-BUCLE` (repite hasta `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`, `finish_reason = length`)
- **WHEN** se procesa el análisis
- **THEN** la respuesta es `200` y `estado_menopausico` queda `desconocido` con `unknownReason = respaldo_fallido`
- **AND** `evidenceOptions` es igual a la del mismo análisis sin respaldo

#### Scenario: Un JSON truncado no produce LOCAL_LLM_UNAVAILABLE [US-244 AC-3] [S4 resp. 3]
- **GIVEN** el adapter `RESP-TRUNCADO`
- **WHEN** se procesa el análisis
- **THEN** la respuesta es `200` y el criterio queda `respaldo_fallido`
- **AND** ningún código de error de la respuesta es `LOCAL_LLM_UNAVAILABLE`

#### Scenario: El LLM caído durante el respaldo conserva las opciones validadas [US-244 AC-7] [RN-26] (asumido: el respaldo degrada también ante el LLM caído; si cae antes de generar sigue el 503 de US-053)
- **GIVEN** el adapter `RESP-CAIDO` tras una generación de opciones correcta
- **WHEN** se procesa el análisis
- **THEN** la respuesta es `200` con las opciones validadas y el criterio en `respaldo_fallido`

### Requirement: El respaldo tiene un plazo propio configurable
Cada llamada de respaldo MUST cancelarse al superar `POPULATION_FALLBACK_DEADLINE_MS` (configuración, RN-22) y dejar su criterio `respaldo_fallido`, sin literal en el código.

#### Scenario: Un respaldo lento se cancela al vencer el plazo [US-244 AC-4] [RN-22] [RN-26]
- **GIVEN** el adapter `RESP-LENTO` y `POPULATION_FALLBACK_DEADLINE_MS` en configuración
- **WHEN** se procesa el análisis
- **THEN** el respaldo se cancela al vencer el plazo, el criterio queda `respaldo_fallido` y la respuesta es `200`

### Requirement: El fallo del respaldo se registra sin contenido
Ante un respaldo fallido, `rag-orchestrator` MUST registrar el evento `aplicabilidad_respaldo_fallido` con `finish_reason`, la longitud de la salida, el criterio y el `traceId` (el `chunkId` está permitido), y MUST NOT registrar valores, texto de fragmento, prompt, salida del LLM ni la pregunta (RN-14).

#### Scenario: El log del bucle no contiene contenido [US-244 AC-6] [RN-14] [S4 resp. 3]
- **GIVEN** el análisis del escenario de `RESP-BUCLE`
- **WHEN** se leen los logs de `rag-orchestrator`
- **THEN** hay un evento `aplicabilidad_respaldo_fallido` con `finish_reason = length`, la longitud de la salida, el criterio y el `traceId`
- **AND** ningún valor, texto de fragmento, prompt, salida del LLM ni pregunta aparece en los logs
