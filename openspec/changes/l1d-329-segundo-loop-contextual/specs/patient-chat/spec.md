## ADDED Requirements

### Requirement: El turno de evidencia del chat usa el segundo loop contextual y lo declara en notices
Con una pregunta sin tema propio y el primer loop vacío, `/chat/turn` MUST reutilizar el segundo loop contextual y, si
corrió, `notices[]` MUST incluir «La búsqueda se amplió con datos del caso: » más los nombres de los campos usados. El
código escribe el aviso, nunca el LLM, y MUST NOT contener valores del caso (RN-19, RN-10, RN-11).

#### Scenario: Un turno de chat con pregunta genérica recupera evidencia y declara la ampliación [US-271 AC-1] [US-271 AC-6] [RN-19] [RN-02]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true`, la petición `contracts/examples/chat-turn-request-evidencia-contextual.json` (pregunta «¿Qué evidencia hay para este caso?», `clinicalContext` del paciente semilla (a)) y adapters falsos con contadores, sobre `TestClient`
- **WHEN** se procesa `POST /chat/turn`
- **THEN** el turno responde `200` con un bloque `evidencia` con cita a un chunk de ese turno, y `notices[]` contiene «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador» además de los dos avisos de RN-19
- **AND** el LLM de reescritura registra cero invocaciones y la respuesta coincide con el ejemplo `contracts/examples/chat-turn-evidencia-contextual.json`

#### Scenario: Sin loop contextual el aviso de ampliación no aparece [US-271 AC-4] [RN-19]
- **GIVEN** una pregunta con tema propio cuyo primer loop devuelve chunks sobre el umbral
- **WHEN** se procesa `POST /chat/turn`
- **THEN** `notices[]` no contiene ningún texto que empiece por «La búsqueda se amplió con datos del caso»

#### Scenario: El aviso nombra campos y nunca valores [US-271 AC-6] [RN-10] [RN-11]
- **GIVEN** un `clinicalContext` con un estadio y un biomarcador del catálogo y texto libre sintético sembrado
- **WHEN** se procesa el turno con el loop contextual
- **THEN** el aviso de ampliación contiene solo nombres de campo del conjunto cerrado y ni el estadio, ni el biomarcador, ni el texto sembrado

### Requirement: Un turno de evidencia con chunks y sin opciones soportadas se explica con texto fijo y avisos
El turno de evidencia del chat con chunks sobre el umbral y 0 opciones soportadas MUST responder con el bloque
`limitacion` «Evidencia recuperada sin opciones soportadas», las limitaciones de US-266 y los dos avisos de RN-19 en
`notices[]`, sin texto del LLM (RN-01, RN-19).

#### Scenario: El turno de chat «recuperado sin opciones soportadas» se valida de punta a punta [US-271 AC-10] [RN-01] [RN-19]
- **GIVEN** la petición `contracts/examples/chat-turn-request-evidencia-sin-opciones.json`, un retriever con chunks sobre el umbral y un NLI falso `neutral`, sobre `TestClient`
- **WHEN** se procesa `POST /chat/turn`
- **THEN** la respuesta coincide con `contracts/examples/chat-turn-evidencia-sin-opciones.json`: un bloque `limitacion` con el texto fijo, las limitaciones de US-266 y los dos avisos en `notices[]`
- **AND** no declara `sin_evidencia` y `topRelevanceScore` no es `null`

### Requirement: El seguimiento del chat nunca dispara el loop contextual
El seguimiento de una evidencia previa (`subintent = seguimiento_evidencia`) MUST NOT ejecutar el segundo loop contextual ni
declarar `contextExpansion`, aunque la pregunta no tenga tema propio (RN-24).

#### Scenario: Un seguimiento sin tema propio no amplía la búsqueda [US-271 AC-5] [RN-24]
- **GIVEN** `QUERY_CONTEXT_EXPANSION_ENABLED = true`, un `activeAnalysisId` y una pregunta de seguimiento sin tema propio («¿y qué más dice?») con el primer loop vacío, sobre `TestClient`
- **WHEN** se procesa `POST /chat/turn`
- **THEN** no hay segunda recuperación contextual, `contextExpansion` no aparece, `notices[]` no contiene «La búsqueda se amplió con datos del caso» y el turno responde sin evidencia con `topRelevanceScore = null`
