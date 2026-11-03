## ADDED Requirements

### Requirement: La pregunta de seguimiento se envía por un Route Handler que reenvía la sesión
`web` MUST exponer `POST /api/evidence-analyses/{analysisId}/follow-ups` como Route Handler (nunca Server Action) que, tras `verificarOrigen()` y el tope del cuerpo, SHALL reenviar con el SDK generado el cuerpo sin reserializar y solo la cookie `oncolens_session` a `clinical-api`, y devolver el mismo status y cuerpo, sin streaming. Un `analysisId` no UUID MUST responder `404` propio sin llamar a `clinical-api`.

#### Scenario: Un doctor autenticado recibe el turno tal como lo respondió clinical-api [US-219 AC-2] [OL-04]
- **GIVEN** un `POST /api/evidence-analyses/b3d9f2a0-1c3e-4f9a-8b1a-9e2f0c3d9f2a/follow-ups` con `Origin` permitido, la cookie `oncolens_session`, una cookie ajena y el cuerpo de `contracts/examples/follow-up-create.json`, y `clinical-api` simulado con MSW respondiendo `201` con `follow-up-turn.json`
- **WHEN** el Route Handler procesa el request
- **THEN** MSW registra un único request a `${CLINICAL_API_URL}/platform/evidence-analyses/b3d9f2a0-1c3e-4f9a-8b1a-9e2f0c3d9f2a/follow-ups` con el cuerpo idéntico y solo la cookie `oncolens_session`
- **AND** la respuesta es `201` con el cuerpo idéntico, validado contra `FollowUpTurn` con `assertMatchesSpec()`, y sin `Set-Cookie`

#### Scenario: El 409 de límite se retransmite sin reinterpretar [US-219 AC-4]
- **GIVEN** `clinical-api` simulado respondiendo `409` con `contracts/examples/error-limite-seguimiento.json`
- **WHEN** el Route Handler procesa un request válido
- **THEN** devuelve `409` con el mismo cuerpo, validado contra `ErrorLimiteSeguimiento`

#### Scenario: Otro origen se rechaza sin contactar a clinical-api [US-219 AC-2] [SEG-01]
- **GIVEN** un POST con `Origin: https://otro-origen.test` y MSW que cuenta requests
- **WHEN** llega a `web`
- **THEN** la respuesta es `403` `PERMISO_DENEGADO` y el contador de requests a `clinical-api` es cero

#### Scenario: Un analysisId que no es UUID no llega a clinical-api (design D2; Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** un POST a `/api/evidence-analyses/no-es-uuid/follow-ups` con `Origin` y sesión válidos
- **WHEN** llega a `web`
- **THEN** la respuesta es `404` con forma `ErrorNoEncontrado` y el contador de requests a `clinical-api` es cero

#### Scenario: clinical-api inalcanzable da el 502 propio sin URL interna [US-219 AC-4] [TBD-08]
- **GIVEN** `clinical-api` que no responde dentro de `WEB_UPSTREAM_TIMEOUT_MS`
- **WHEN** el Route Handler procesa un request válido
- **THEN** responde `502` con `error = ERROR_SERVICIO_IA` y un `traceId` propio, sin la URL de `clinical-api` ni cuerpo parcial
