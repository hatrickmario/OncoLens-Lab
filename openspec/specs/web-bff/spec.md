# web-bff Specification

## Purpose
Define cómo `web` actúa de BFF del análisis de evidencia: el Route Handler `POST /api/evidence-analyses` reenvía la sesión del doctor a `clinical-api` con el cliente generado, sin exponer a `rag-orchestrator` ni a `clinical-api` al navegador, con verificación de `Origin`, tope del cuerpo, una respuesta propia si `clinical-api` no responde y sin revelar la URL interna.

## Requirements

### Requirement: El análisis se pide a web por un Route Handler que reenvía la sesión
`web` MUST exponer `POST /api/evidence-analyses` como Route Handler (nunca Server Action) que SHALL reenviar, con el SDK generado de `clinical-api` (L1D-105, `[S1 resp. 13]`), el cuerpo sin modificar y la cookie `oncolens_session` a `POST /platform/evidence-analyses`, y devolver el mismo status y JSON, sin streaming. MUST NOT reenviar otras cookies, `Origin`, `Authorization`, el `X-Trace-Id` del navegador ni, en el S1, `Idempotency-Key` (design D2), ni devolver `Set-Cookie`.

#### Scenario: Un doctor autenticado recibe el mismo status y cuerpo que respondió clinical-api [US-060 AC-1] [OL-04] [HU-03]
- **GIVEN** un request a `POST /api/evidence-analyses` con `Origin` igual a `WEB_ALLOWED_ORIGIN`, la cookie `oncolens_session` de un doctor autenticado, una cookie ajena `otra=x`, las cabeceras `X-Trace-Id: trace-del-navegador` e `Idempotency-Key: 3f2b8c1e-0d4a-4e6b-9a7c-5b1d2e3f4a5b` y el cuerpo de `contracts/examples/evidence-analysis-request.json`, y `clinical-api` simulado con MSW respondiendo `200` con `contracts/examples/con-evidencia-s1.json`
- **WHEN** el Route Handler procesa el request
- **THEN** MSW registra exactamente un request a `${CLINICAL_API_URL}/platform/evidence-analyses` con el cuerpo idéntico al enviado y una cabecera `Cookie` que contiene solo `oncolens_session` con su valor original
- **AND** el request registrado no lleva el valor `trace-del-navegador` en ninguna cabecera ni la cabecera `Idempotency-Key`
- **AND** la respuesta al navegador es `200` con un cuerpo JSON idéntico a `con-evidencia-s1.json` y sin cabecera `Set-Cookie`

### Requirement: Verificación de Origin antes de contactar a clinical-api
Antes de leer el cuerpo o la cookie, el Route Handler MUST comparar `Origin` con `WEB_ALLOWED_ORIGIN` (exacta) mediante `verificarOrigen()`, que reutiliza el login (`[S1 resp. 14a]`). Si no coincide o falta `[S1 resp. 18]`, SHALL responder la respuesta propia del BFF `403` con forma `ErrorPermisoDenegado` (`PERMISO_DENEGADO`) y registrar `motivo=origen` sin el `Origin` recibido; MUST NOT emitir requests a `clinical-api`.

#### Scenario: Un POST desde otro origen responde 403 y clinical-api no recibe requests [US-060 AC-2] [SEG-01] [S1 resp. 18]
- **GIVEN** un `POST /api/evidence-analyses` con `Origin: https://otro-origen.test`, una cookie `oncolens_session` válida y un cuerpo válido, `clinical-api` simulado con MSW que cuenta requests y el logger de `web` capturado
- **WHEN** llega a `web`
- **THEN** la respuesta es `403` con `error = PERMISO_DENEGADO`, `message` y `traceId`, validada contra `ErrorPermisoDenegado` con el *helper* `assertMatchesSpec()` de L1D-164
- **AND** el contador de requests a `clinical-api` es cero
- **AND** el logger registró una línea con `status = 403` y `motivo=origen` que no contiene `otro-origen.test`

#### Scenario: Un POST sin cabecera Origin también se rechaza [US-060 AC-2] [SEG-01] [S1 resp. 18]
- **GIVEN** un `POST /api/evidence-analyses` sin cabecera `Origin`, con cookie y cuerpo válidos
- **WHEN** llega a `web`
- **THEN** la respuesta es `403` con `error = PERMISO_DENEGADO` y el contador de requests a `clinical-api` es cero

### Requirement: El navegador solo habla con el origen de web
Durante un análisis completo, todas las requests del navegador MUST ir al origen de `web`; ninguna SHALL dirigirse a `clinical-api` ni a `rag-orchestrator`, que no publican puerto al host.

#### Scenario: Las requests del navegador en un análisis completo van solo al origen de web [US-060 AC-3] [OL-04] [S1 resp. 4] [S1 resp. 7]
- **GIVEN** el stack de Compose en perfil de test con `LLM_PROVIDER=fake`, `doc1@test.local` con sesión iniciada y el panel en `/pacientes/<id del paciente semilla (a)>/analisis`
- **WHEN** Playwright registra todas las requests del navegador mientras se envía una pregunta con "Analizar evidencia" y se muestra el resultado
- **THEN** todas las URLs registradas tienen el origen de `web` y el análisis se pidió a `/api/evidence-analyses`
- **AND** ninguna URL contiene el host ni el puerto de `clinical-api` o de `rag-orchestrator`

### Requirement: Errores de clinical-api retransmitidos sin reinterpretar
El Route Handler MUST devolver los errores de `clinical-api` con el mismo status y el mismo cuerpo, y SHALL conservar las cabeceras `Retry-After` y `X-Trace-Id` de la respuesta cuando vienen; MUST NOT traducir, agrupar ni enriquecer los códigos. Un `401` SHALL retransmitirse tal cual, sin redirección: la navegación a `/login` es del cliente del panel (L1D-140), coherente con el requisito "Guard de páginas en web" de `auth-session`.

#### Scenario: Un 429 con Retry-After y un 504 llegan al navegador iguales [US-060 AC-4] [OL-04]
- **GIVEN** `clinical-api` simulado con MSW respondiendo en un caso `429` con `Retry-After: 30` y el cuerpo de `contracts/examples/error-cola-inferencia-llena.json`, y en otro `504` con `contracts/examples/error-deadline-vencido.json`
- **WHEN** el Route Handler recibe cada respuesta para un request con `Origin` permitido y sesión
- **THEN** devuelve `429` con el mismo cuerpo y la cabecera `Retry-After: 30` en el primer caso
- **AND** devuelve `504` con el mismo cuerpo en el segundo

#### Scenario: Un 401 de clinical-api se retransmite sin redirección [US-060 AC-4] [FR-01]
- **GIVEN** `clinical-api` simulado con MSW respondiendo `401` con `contracts/examples/error-no-autenticado.json`
- **WHEN** el Route Handler procesa un request con `Origin` permitido
- **THEN** devuelve `401` con el mismo cuerpo, sin cabecera `Location` ni `Set-Cookie`

Regresión [RN-30] (`429` con `Retry-After` emitido por `clinical-api`) activa desde S4 (US-056); este change solo la retransmite.

### Requirement: Respuesta propia del BFF cuando clinical-api es inalcanzable
Si `clinical-api` no responde (error de red o sin respuesta dentro de `WEB_UPSTREAM_TIMEOUT_MS`), el Route Handler SHALL responder con la respuesta propia del BFF `502` con un cuerpo de la forma `ErrorServicioIa` del contrato (`error = ERROR_SERVICIO_IA`) y un `traceId` generado `[S1 resp. 18]`, y MUST NOT incluir la URL interna, el mensaje del error de red ni un cuerpo parcial.

#### Scenario: clinical-api inalcanzable devuelve 502 genérico sin detalles internos [US-060 AC-4] [S1 resp. 18]
- **GIVEN** `clinical-api` simulado con MSW devolviendo un error de red, o sin responder dentro de `WEB_UPSTREAM_TIMEOUT_MS`
- **WHEN** el Route Handler procesa un request con `Origin` permitido y sesión
- **THEN** responde `502` con `error = ERROR_SERVICIO_IA` y un `traceId`, validado contra `ErrorServicioIa` con el *helper* `assertMatchesSpec()` de L1D-164
- **AND** el cuerpo no contiene `CLINICAL_API_URL`, el mensaje del error de red ni ningún campo del análisis

### Requirement: La URL interna de clinical-api no llega al cliente
`CLINICAL_API_URL` MUST leerse solo en módulos `server-only` de `web` y MUST NOT exponerse con prefijo `NEXT_PUBLIC_` ni en `next.config`; su valor SHALL estar ausente de los archivos estáticos del cliente de la build de producción.

#### Scenario: El valor de CLINICAL_API_URL no aparece en .next/static [US-060 AC-5] [OL-04] [SEG-09]
- **GIVEN** la build de producción de `web` (`next build`) con `CLINICAL_API_URL` en un valor centinela sintético
- **WHEN** se busca ese valor en todos los archivos de `apps/web/.next/static`
- **THEN** no aparece ninguna coincidencia

### Requirement: Cuerpos reenviados sin reserializar
El Route Handler MUST reenviar el texto exacto de la respuesta de `clinical-api`, sin parsear ni reserializar (un cuerpo vacío sale vacío). SHALL responder `502` propio (`ErrorServicioIa`) si el cuerpo de una `2xx` no pudo leerse completo o si un error no `2xx` con cuerpo no es `application/json`, y MUST marcar `Cache-Control: no-store` en todas sus respuestas.

#### Scenario: Texto exacto y cuerpo vacío [US-060 AC-4]
- **GIVEN** `clinical-api` responde `422` con un JSON de espaciado y números no canónicos, y en otro caso `401` sin cuerpo
- **WHEN** el Route Handler las retransmite
- **THEN** el texto del primer cuerpo es idéntico y el segundo llega vacío y sin `Content-Type`

#### Scenario: Cuerpo cortado o error no JSON [US-060 AC-4]
- **GIVEN** una respuesta `200` cuyo cuerpo falla a mitad de lectura, o un `500` `text/html`
- **WHEN** el Route Handler la procesa
- **THEN** responde `502` `ERROR_SERVICIO_IA` sin eco del cuerpo recibido

### Requirement: Tope del cuerpo de la petición
El Route Handler MUST responder `413` con forma `ErrorCuerpoInvalido`, sin llamar a `clinical-api`, cuando el cuerpo supera `WEB_MAX_BODY_BYTES` (RN-22; por defecto 32768).

#### Scenario: Cuerpo excesivo [US-060 AC-4]
- **GIVEN** un `POST` con `Origin` permitido y un cuerpo mayor que `WEB_MAX_BODY_BYTES`
- **WHEN** llega a `web`
- **THEN** responde `413` `CUERPO_INVALIDO`, registra `motivo=cuerpo_excesivo` y `clinical-api` recibe cero requests

### Requirement: El checklist se lee por un Route Handler que reenvía la sesión
`web` MUST exponer `GET /api/patients/{id}/completeness` (creado en este change) que valida el UUID de la ruta, reenvía la cookie de sesión a `GET /platform/patients/{id}/completeness` de `clinical-api` y retransmite el `200` y los `4xx` con su cuerpo del contrato. MUST NOT llamar a `rag-orchestrator`.

#### Scenario: El checklist llega al navegador por el mismo origen [US-005 AC-1] [AC-04.2] [RN-10]
- **GIVEN** una sesión válida y `clinical-api` simulado con `completeness-f-m2.json`
- **WHEN** el navegador pide `GET /api/patients/{id}/completeness`
- **THEN** recibe el mismo cuerpo y estado, y no hay petición a otro origen

### Requirement: Un fallo de clinical-api llega saneado al navegador
Ante un `5xx` o un fallo de red de `clinical-api`, el Route Handler del checklist MUST interceptar la respuesta antes de retransmitirla y responder un `5xx` propio con cuerpo `{ error, message, traceId }` (código y mensaje fijos, `traceId` propio de `web`), sin pila, sin detalles internos y sin la URL de `clinical-api`.

#### Scenario: Un 5xx de clinical-api llega saneado [US-005 AC-5] [RN-26]
- **GIVEN** `clinical-api` responde `500` con un cuerpo que incluye detalles internos
- **WHEN** el navegador pide el checklist
- **THEN** recibe un `5xx` con forma `{ error, message }`
- **AND** el cuerpo no contiene la pila, los detalles internos ni la URL de `clinical-api`

### Requirement: La vista de caso se lee por un Route Handler que reenvía la sesión
`web` MUST exponer `GET /api/patients/{id}/case` que valida el UUID de la ruta, reenvía solo la cookie de sesión a `GET /platform/patients/{id}/case` de `clinical-api` con el cliente generado y retransmite el `200` y los `4xx` con su cuerpo del contrato, sin caché. Un id que no es UUID MUST responder `404` propio sin llamar a `clinical-api`. MUST NOT llamar a `rag-orchestrator`.

#### Scenario: El CaseView llega al navegador por el mismo origen [US-090 AC-5] [AC-02.1]
- **GIVEN** una sesión válida y `clinical-api` simulado (MSW) con `case-view-p-caso.json`
- **WHEN** el navegador pide `GET /api/patients/{id}/case`
- **THEN** recibe `200` con el mismo cuerpo, válido contra `CaseView`, con `Cache-Control: no-store`, sin `Set-Cookie` de `clinical-api`
- **AND** `clinical-api` recibe una sola petición con solo la cookie de sesión

#### Scenario: Los 4xx de clinical-api se retransmiten sin reinterpretar [US-090 AC-6]
- **GIVEN** `clinical-api` responde `401`, `403` o `404` con su cuerpo del contrato
- **WHEN** el navegador pide la vista de caso
- **THEN** recibe el mismo estado y cuerpo

#### Scenario: Un id que no es UUID no llega a clinical-api [S5 resp. 13]
- **GIVEN** la ruta `/api/patients/no-es-uuid/case`
- **WHEN** el navegador la pide
- **THEN** recibe `404` con `{ error, message, traceId }` y `clinical-api` recibe cero peticiones

### Requirement: Un fallo de la vista de caso llega saneado al navegador
Ante un `5xx`, un fallo de red o un timeout de `clinical-api`, el Route Handler de la vista de caso MUST responder `500` propio con `{ error: ERROR_INTERNO, message, traceId }` (código y mensaje fijos, `traceId` de `web`), sin pila, detalles internos, URL de `clinical-api` ni datos parciales, y registrar solo evento, estado, `traceId`, duración y motivo.

#### Scenario: Un 5xx de clinical-api llega saneado [US-090 AC-6] [S5 resp. 13]
- **GIVEN** `clinical-api` responde `500` con un cuerpo que incluye detalles internos
- **WHEN** el navegador pide la vista de caso
- **THEN** recibe `500` con forma `{ error, message, traceId }` y el cuerpo no contiene la pila, los detalles internos ni la URL de `clinical-api`

#### Scenario: clinical-api inalcanzable [S5 resp. 13]
- **GIVEN** `clinical-api` no responde (fallo de red)
- **WHEN** el navegador pide la vista de caso
- **THEN** recibe el mismo `500` saneado y el log registra `motivo=clinical_api_inalcanzable` sin el id del paciente ni contenido clínico

### Requirement: Las correcciones, el histórico y las notas pasan por Route Handlers de web
`web` MUST exponer Route Handlers bajo `app/api/patients/[id]/` para corregir biomarcadores y notas, leer notas y leer el histórico, que reenvían la sesión a `clinical-api`, verifican `Origin` en las mutaciones antes de contactarlo y retransmiten sus errores sin reinterpretar.

#### Scenario: Una corrección con Origin ajeno no llega a clinical-api [US-253 AC-1] (Decidido (usuario, 2026-11-03): regla vigente de web-bff, `[S5 resp. 13]`)
- **GIVEN** `clinical-api` simulado con MSW
- **WHEN** llega `POST /api/patients/{a}/biomarkers/{ki67}/corrections` con `Origin` de otro sitio
- **THEN** `web` responde `403` y MSW no registra ninguna llamada a `clinical-api`

#### Scenario: Los errores de la corrección se retransmiten tal cual [US-253 AC-3] [US-253 AC-4]
- **GIVEN** `clinical-api` simulado respondiendo `422` (`error-correccion-fecha-futura.json`), `422 PACIENTE_EGRESADO`, `403` o `409`
- **WHEN** el navegador envía la corrección por el Route Handler
- **THEN** recibe el mismo código y el mismo cuerpo, incluido `field` cuando viene

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

### Requirement: El registro manual y sus opciones pasan por Route Handlers de web
`web` MUST exponer `POST /api/patients/{id}/biomarkers`, `POST /api/patients/{id}/diagnoses` y `GET /api/patients/{id}/manual-entry-options`, que reenvían solo la cookie de sesión con el SDK generado, verifican `Origin` en los `POST`, retransmiten `2xx` y `4xx` sin reinterpretar y responden un `500 ERROR_INTERNO` saneado ante `5xx`, red caída o timeout.

#### Scenario: Un registro válido se retransmite con 201 [US-111 AC-1] [AC-04.1]
- **GIVEN** una sesión `doctor` y `clinical-api` (MSW desde `biomarker-manual.json`) que responde `201`
- **WHEN** el navegador envía `POST /api/patients/{id}/biomarkers` con `Origin` de `web`
- **THEN** `web` reenvía el cuerpo sin reserializar con la cookie de sesión y responde `201` con el mismo `Biomarker`

#### Scenario: Un 422 con field llega intacto al navegador [US-111 AC-4]
- **WHEN** `clinical-api` responde `422` con `error-valor-fuera-de-catalogo-campo.json`
- **THEN** `web` responde `422` con el mismo cuerpo, incluido `field`

#### Scenario: Origin ajeno se rechaza sin contactar a clinical-api [US-111 AC-4] [S5 resp. 13]
- **WHEN** llega `POST /api/patients/{id}/diagnoses` con un `Origin` distinto del de `web`
- **THEN** responde `403` y no se hace ninguna petición a `clinical-api`

#### Scenario: Un fallo de clinical-api llega saneado [US-111 AC-4] [S5 resp. 13]
- **WHEN** `clinical-api` responde `500` o no responde al pedir las opciones o al guardar
- **THEN** `web` responde `500` con `error = ERROR_INTERNO`, un `traceId` propio y sin detalle del proveedor, y el log del BFF no contiene el cuerpo ni el id del paciente

#### Scenario: Un id que no es UUID no llega a clinical-api [US-111 AC-1] [S5 resp. 13]
- **WHEN** se pide `GET /api/patients/no-es-uuid/manual-entry-options`
- **THEN** `web` responde `404` propio sin contactar a `clinical-api`
