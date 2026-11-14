## ADDED Requirements

### Requirement: La conversación se abre, se lee y recibe turnos por Route Handlers que reenvían la sesión
`web` MUST exponer `POST /api/patients/{patientId}/conversations`, `GET /api/conversations/{conversationId}` y
`POST /api/conversations/{conversationId}/turns` como Route Handlers (nunca Server Actions) que, tras `verificarOrigen()`
en los POST y el tope del cuerpo, SHALL reenviar con el SDK generado el cuerpo sin reserializar y solo la cookie
`oncolens_session`, y devolver el mismo status y cuerpo, sin streaming. Un id no UUID MUST responder `404` propio.

#### Scenario: Un doctor autenticado recibe el turno tal como lo respondió clinical-api [US-258 AC-2] (asumido)
- **GIVEN** un `POST /api/conversations/{conversationId}/turns` con `Origin` permitido, la cookie `oncolens_session`, una cookie ajena y el cuerpo de `contracts/examples/conversation-turn-create.json`, y `clinical-api` simulado con MSW respondiendo `201` con `conversation-turn.json`
- **WHEN** el Route Handler procesa el request
- **THEN** MSW registra un único request con el cuerpo idéntico y solo la cookie `oncolens_session`
- **AND** la respuesta es `201` con el cuerpo idéntico, validado contra `ConversationTurn`, y sin `Set-Cookie`

#### Scenario: Otro origen se rechaza sin contactar a clinical-api [US-258 AC-8] [SEG-01] (asumido)
- **GIVEN** un POST a cualquiera de las dos rutas de escritura con `Origin: https://otro-origen.test`
- **WHEN** llega a `web`
- **THEN** la respuesta es `403` `PERMISO_DENEGADO` y el contador de requests a `clinical-api` es cero

#### Scenario: Un id que no es UUID no llega a clinical-api [US-258 AC-8] (asumido)
- **GIVEN** un request a `/api/conversations/no-es-uuid` o `/api/patients/no-es-uuid/conversations` con sesión válida
- **WHEN** llega a `web`
- **THEN** la respuesta es `404` con forma `ErrorNoEncontrado` y el contador de requests a `clinical-api` es cero

#### Scenario: Los errores de clinical-api se retransmiten sin reinterpretar [US-258 AC-7] (asumido)
- **GIVEN** `clinical-api` simulado respondiendo `502` con `error = "ERROR_SERVICIO_IA"` y, en otro caso, `503` con `error = "LOCAL_LLM_UNAVAILABLE"`
- **WHEN** el Route Handler de turnos procesa un request válido
- **THEN** devuelve el mismo status y el mismo cuerpo en cada caso
