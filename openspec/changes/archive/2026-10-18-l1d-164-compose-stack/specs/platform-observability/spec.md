## ADDED Requirements

### Requirement: Health check de clinical-api independiente de la IA
`clinical-api` MUST exponer `GET /health`, solo en la red interna y sin sesión, que responde `200` con `HealthStatus` (`{"status":"ok"}`) cuando el proceso está listo. MUST NOT consultar a `rag-orchestrator` ni al LLM, para que la caída de la IA no deje sin servicio a la ficha (readme §2.7). La respuesta SHALL validarse contra el spec de `clinical-api` en el test de integración.

#### Scenario: clinical-api responde 200 en su health [US-034 AC-1]
- **GIVEN** `clinical-api` arrancado
- **WHEN** el test de integración (Supertest) hace `GET /health`
- **THEN** la respuesta es `200`, cuerpo `{"status":"ok"}`, válida contra `HealthStatus` del spec de `clinical-api`

#### Scenario: clinical-api sigue en 200 con el LLM caído [US-034 AC-4]
- **GIVEN** el stack levantado con `LLM_PROVIDER=local` y el LLM nativo detenido (`LLM_BASE_URL` a un puerto sin escucha)
- **WHEN** el smoke test consulta `GET /health` de `clinical-api`
- **THEN** responde `200`, aunque `rag-orchestrator` responda `503`

### Requirement: Health check de rag-orchestrator con sonda del LLM nativo
`rag-orchestrator` MUST exponer `GET /health`. Con `LLM_PROVIDER=local` SHALL sondear `GET {LLM_BASE_URL}/models` con *timeout* `LLM_HEALTH_TIMEOUT_MS`: alcanzable → `200 HealthStatus`; conexión fallida, *timeout* o 5xx → `503 LOCAL_LLM_UNAVAILABLE` (`ErrorLlmLocalNoDisponible`), sin la URL del LLM en el cuerpo. Con `LLM_PROVIDER=fake` MUST NOT sondear y responde `200`.

#### Scenario: Con el LLM disponible responde 200 [US-034 AC-1]
- **GIVEN** `LLM_PROVIDER=local` y `respx` respondiendo `200` en `{LLM_BASE_URL}/models`
- **WHEN** el test (`TestClient`) hace `GET /health`
- **THEN** la respuesta es `200` y válida contra `HealthStatus` del spec de `rag-orchestrator`

#### Scenario: Con el LLM detenido responde 503 LOCAL_LLM_UNAVAILABLE [US-034 AC-4]
- **GIVEN** `LLM_PROVIDER=local` y `respx` simulando conexión rechazada (y, en otros casos, *timeout* y `502`) en `{LLM_BASE_URL}/models`
- **WHEN** el test hace `GET /health`
- **THEN** la respuesta es `503` con `error = "LOCAL_LLM_UNAVAILABLE"`, válida contra la respuesta `503` de `GET /health` del spec, y el cuerpo no contiene `LLM_BASE_URL`

#### Scenario: Con el LLM detenido en el stack el health es 503 [US-034 AC-4]
- **GIVEN** el stack levantado con `LLM_PROVIDER=local` y el LLM nativo detenido
- **WHEN** el smoke test consulta `GET /health` de `rag-orchestrator` desde `clinical-api`
- **THEN** responde `503` con `error = "LOCAL_LLM_UNAVAILABLE"`

#### Scenario: En modo fake responde 200 sin consultar al LLM [US-034 AC-6] [S1 resp. 7]
- **GIVEN** `LLM_PROVIDER=fake` y `respx` configurado para fallar ante cualquier petición a `LLM_BASE_URL`
- **WHEN** el test hace `GET /health`
- **THEN** la respuesta es `200` y `respx` no registró ninguna llamada

### Requirement: Health check de web para Compose
`web` MUST exponer el Route Handler `GET /api/health`, que responde `200` con `{"status":"ok"}` sin llamar a `clinical-api` ni leer la sesión, usado solo por el healthcheck de Compose.

#### Scenario: web queda healthy sin depender de la sesión [US-034 AC-1]
- **GIVEN** `web` arrancado sin cookie de sesión
- **WHEN** el healthcheck de Compose hace `GET /api/health`
- **THEN** la respuesta es `200` con `{"status":"ok"}` y no hay ninguna petición saliente hacia `clinical-api`
