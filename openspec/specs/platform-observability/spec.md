# platform-observability Specification

## Purpose
Define lo que el stack local registra y expone para operarlo sin filtrar identidad, PHI, secretos ni contenido de documentos (RN-10, RN-14): logs estructurados con `traceId` y comprobaciones de salud de los servicios.

## Requirements

### Requirement: Health check de clinical-api independiente de la IA
`clinical-api` MUST exponer `GET /health`, solo en la red interna y sin sesión, que responde `200` con `HealthStatus` cuando el proceso está listo: `status = "ok"`, `configKeys`, `serviceVersion` (US-037) y `catalogVersion` (versión del `manifest.json` montado, US-041), sin otras propiedades y sin valores de configuración. MUST NOT consultar a `rag-orchestrator` ni al LLM, para que la caída de la IA no deje sin servicio a la ficha (readme §2.7). La respuesta SHALL validarse contra el spec de `clinical-api` en el test de integración.

#### Scenario: clinical-api responde 200 en su health [US-034 AC-1]
- **GIVEN** `clinical-api` arrancado con el catálogo `1.0.0` montado
- **WHEN** el test de integración (Supertest) hace `GET /health`
- **THEN** la respuesta es `200` con `status = "ok"`, `configKeys` y `serviceVersion` no vacíos y `catalogVersion = "1.0.0"`, válida contra `HealthStatus` (cerrado) del spec de `clinical-api`

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

### Requirement: clinical-api no queda listo sin sus claves de identidad
`clinical-api` MUST cargar sus secretos desde archivos indicados por variables `*_FILE`. Si `IDENTITY_AES_KEY_FILE` o `BLIND_INDEX_HMAC_KEY_FILE` no está definida, su archivo no existe o está vacío, el proceso MUST NOT quedar listo (`GET /health` ≠ `200`) y SHALL registrar el nombre de la variable ausente, nunca un valor (RN-10).

#### Scenario: Sin la clave AES el arranque falla nombrando la variable [US-035 AC-5] [RN-10] (asumido) [S1 resp. 3]
- **GIVEN** la configuración de `clinical-api` con `IDENTITY_AES_KEY_FILE` apuntando a un archivo inexistente en un directorio temporal y el resto de secretos ficticios presentes
- **WHEN** el test de integración arranca la aplicación con su *factory* y captura el log
- **THEN** el arranque falla antes de escuchar, el log contiene `IDENTITY_AES_KEY_FILE` y no contiene el contenido de ningún secreto ficticio

#### Scenario: Con la clave HMAC vacía el arranque falla nombrando la variable [US-035 AC-5] [RN-10] (asumido) [S1 resp. 3]
- **GIVEN** `BLIND_INDEX_HMAC_KEY_FILE` apuntando a un archivo vacío
- **WHEN** el test de integración arranca la aplicación
- **THEN** el arranque falla antes de escuchar y el log contiene `BLIND_INDEX_HMAC_KEY_FILE` sin ningún valor

#### Scenario: En el stack, sin la clave montada, clinical-api no queda healthy [US-035 AC-5] (asumido) [S1 resp. 3]
- **GIVEN** el stack levantado con un *override* que apunta `IDENTITY_AES_KEY_FILE` de `clinical-api` a una ruta sin montar
- **WHEN** el smoke test espera el healthcheck y consulta `GET /health` de `clinical-api` desde `web`
- **THEN** `clinical-api` no figura `healthy`, `/health` no responde `200` y `docker compose logs clinical-api` nombra `IDENTITY_AES_KEY_FILE` sin ningún valor

### Requirement: Health con nombres de configuración y versión, sin valores
El `GET /health` de `clinical-api` y de `rag-orchestrator` MUST incluir en su `200`, además de `status`, `configKeys` (nombres de las claves de configuración cargadas) y `serviceVersion`, válidos contra `HealthStatus` de su spec, y MUST NOT incluir ningún valor de configuración ni secreto.

#### Scenario: El health lista nombres de claves y ningún valor [US-037 AC-1] [RN-22] [RN-14]
- **GIVEN** ambos servicios arrancados con `RELEVANCE_THRESHOLD=0.42`, `SESSION_TTL_HOURS=8` y secretos ficticios
- **WHEN** el test de integración hace `GET /health` en cada uno
- **THEN** la respuesta es `200`, válida contra `HealthStatus` de su spec, `configKeys` incluye los nombres de las claves cargadas y `serviceVersion` no está vacío
- **AND** el cuerpo no contiene `0.42`, `8` como valor de configuración, ni el contenido de ningún archivo `*_FILE`

### Requirement: Logs JSON con el mismo traceId en ambos servicios
Cada línea de log de `clinical-api` y de `rag-orchestrator` MUST ser JSON válido y llevar el `traceId` de la request; el `traceId` lo genera `clinical-api` (requisito "El traceId lo genera siempre clinical-api") y `rag-orchestrator` SHALL registrar el `traceId` que recibe en `X-Trace-Id` en todas las líneas de esa request.

#### Scenario: Una request con X-Trace-Id deja el mismo traceId generado en los logs de ambos servicios [US-037 AC-4] [NFR-10] [readme §2.7] (asumido: adaptado al requisito vigente del traceId, Gate 1 del S1)
- **GIVEN** `doc1@test.local` autenticado, el generador de `traceId` inyectado con `req_TestGen0001`, `rag-orchestrator` simulado que captura cabeceras en la integración de `clinical-api` y el `TestClient` de `rag-orchestrator` con su log capturado
- **WHEN** se envía `POST /platform/evidence-analyses` con `X-Trace-Id: t-123` y el request capturado se reenvía a `rag-orchestrator`
- **THEN** todas las líneas de log de esa request en ambos servicios son JSON válido con `traceId = req_TestGen0001`
- **AND** ninguna línea contiene `t-123` (no cumple el patrón, no se registra)

#### Scenario: Sin cabecera clinical-api genera el traceId y lo propaga [US-037 AC-4] [NFR-10]
- **GIVEN** el mismo contexto sin cabecera `X-Trace-Id`
- **WHEN** se envía la petición
- **THEN** el request hacia `rag-orchestrator` lleva `X-Trace-Id = req_TestGen0001` y todas las líneas de ambos servicios llevan ese `traceId`

### Requirement: Los logs no registran identidad, PHI ni cuerpos de request
El logger de `clinical-api` MUST descartar los cuerpos de request y, a cualquier profundidad, una lista de campos sensibles **cerrada en código** (`CAMPOS_SENSIBLES_BASE`, ver design D5); un paciente SHALL aparecer en los logs solo por UUID (RN-10, NFR-11).

#### Scenario: Una request inválida con identidad sembrada no deja rastro en los logs [US-037 AC-5] [NFR-11] [RN-10] (asumido: adaptado a un endpoint existente en el S2)
- **GIVEN** `doc1@test.local` autenticado y un logger capturado
- **WHEN** envía `POST /platform/evidence-analyses` con `patientId = "no-es-uuid"` y una `question` que contiene el documento `1234567` y el nombre "Lucía Fernanda Rondón Peña" (FX-T4a-a), y la respuesta es `422`
- **THEN** ninguna línea de log contiene `1234567`, `Lucía`, `Rondón` ni el cuerpo de la request

Regresión [RN-10, logs sin identidad] con la búsqueda por documento activa desde S2 (US-048) y con el alta de pacientes activa desde S4 (US-047).

### Requirement: La lista de campos redactados es cerrada, ampliable y nunca reducible
`CAMPOS_SENSIBLES_BASE` MUST incluir al menos `name`, `nationalId`, `originalFilename`, `email`, la IP del cliente, `cookie` y `Authorization` (sin distinguir mayúsculas). `LOG_REDACT_EXTRA_FIELDS` SHALL solo añadir campos; ninguna configuración MUST poder quitar uno de la base.

#### Scenario: La lista de campos redactados se amplía desde configuración pero nunca se reduce [US-037 AC-5] [RN-10] [RN-22] (asumido: Gate 1 del S2)
- **GIVEN** `LOG_REDACT_EXTRA_FIELDS=notaInterna` y un logger capturado
- **WHEN** se registra un objeto con `name`, `nationalId`, `originalFilename`, `email`, `ip`, `cookie`, `Authorization` y `notaInterna`, con valores sintéticos
- **THEN** ninguno de esos valores aparece en la línea de log
- **AND** con `LOG_REDACT_EXTRA_FIELDS` vacía los ocho campos base siguen redactados y no existe clave de configuración que quite un campo de la lista base
