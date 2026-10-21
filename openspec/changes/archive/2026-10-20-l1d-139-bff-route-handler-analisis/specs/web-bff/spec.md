## ADDED Requirements

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
