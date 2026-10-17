## ADDED Requirements

### Requirement: Inicio de sesión con cookie opaca rotada
`POST /platform/auth/login` (vía el Route Handler de `web`) MUST verificar la contraseña con Argon2id contra `password_hash` de un usuario `activo` y SHALL crear en `auth.session` una fila cuyo `token_hash` es el hash de un token opaco aleatorio de 256 bits nuevo (no JWT ni cookie previa), con `expires_at = ahora + SESSION_TTL_HOURS`. MUST responder `204` sin cuerpo con la cookie `oncolens_session` `HttpOnly; Secure; SameSite=Strict`; el token en claro MUST NOT guardarse.

#### Scenario: Login correcto crea la sesión hasheada y rota la cookie [US-211 AC-1] [HU-01] [FR-01]
- **GIVEN** `doc1@test.local` activo (FX-T4a-b; lo crea el *fixture* de test con `createPasswordHasher()` de este change y, en la demo, el seed de US-039, con hash Argon2id) y un request con una cookie `oncolens_session` previa de valor arbitrario
- **WHEN** se envían sus credenciales correctas a `POST /api/auth/login` de `web`
- **THEN** `web` llama a `POST /platform/auth/login` por su Route Handler y `auth.session` gana exactamente una fila del usuario con `token_hash` no nulo y `revoked = false`
- **AND** ninguna columna de esa fila contiene el valor del token en claro
- **AND** la respuesta es `204` sin cuerpo, validada contra `apps/clinical-api/openapi.yaml` con el *helper* `assertMatchesSpec()` de L1D-164 `[S1 resp. 17]`, con una cookie `oncolens_session` `HttpOnly`, `Secure`, `SameSite=Strict` cuyo valor es distinto del previo

### Requirement: Página de login y ruta de inicio configurada
La página `/login` de `web` MUST rotular el campo de usuario como "Correo electrónico" `[S1 resp. 4]`, con sus textos en `apps/web/messages/es.json` (claves `login.*`, archivo cuyo dueño es este change, `[S1 resp. 18]`) y, tras el `204`, SHALL llevar al navegador a la ruta de inicio configurada en `WEB_HOME_PATH` (en el S1, `/pacientes/[id]/analisis` del paciente semilla (a), `[S1 resp. 4]`).

#### Scenario: Tras el login el navegador queda en la ruta de inicio configurada [US-211 AC-1] [S1 resp. 4]
- **GIVEN** el stack de Compose en perfil de test con `WEB_HOME_PATH` apuntando a `/pacientes/<id del paciente semilla (a)>/analisis`
- **WHEN** el navegador abre `/login`, rellena "Correo electrónico" y "Contraseña" con las credenciales de `doc1@test.local` y pulsa "Iniciar sesión"
- **THEN** el navegador queda en la ruta configurada y tiene la cookie `oncolens_session` con `HttpOnly`, `Secure` y `SameSite=Strict`

### Requirement: Etiqueta de uso académico en el login con clave propia
La página `/login` MUST mostrar como texto visible "Uso académico/investigación" (RN-19, S1-01) desde la clave `app.academicUseLabel` de `apps/web/messages/es.json`, que este change crea (Gate 1, 2ª vuelta); `AppHeader` de L1D-194 SHALL consumir la misma clave, sin otra copia del literal en `apps/web` (los archivos de test quedan excluidos de ese chequeo).

#### Scenario: La página de login muestra la etiqueta de uso académico desde es.json [US-069 AC-3] [RN-19] [pantallas-s1 S1-01]
- **GIVEN** `apps/web/messages/es.json` con `app.academicUseLabel` = "Uso académico/investigación"
- **WHEN** se renderiza `/login` sin sesión
- **THEN** la página muestra el texto visible "Uso académico/investigación" (no solo color) leído de la clave `app.academicUseLabel`
- **AND** ningún archivo de `apps/web` fuera de `messages/es.json` y de los archivos de test (`*.test.ts`, `*.test.tsx` y `tests/`) contiene el literal "Uso académico/investigación"

### Requirement: Respuesta uniforme ante credenciales inválidas o cuenta no activa
Una contraseña incorrecta, un correo inexistente y una cuenta no `activo` MUST responder `401` con el mismo cuerpo `{ error: "CREDENCIALES_INVALIDAS", message, traceId }` (solo cambia `traceId`), sin eco del correo, y MUST NOT crear filas en `auth.session` `[Pre-S1 resp. 29]`. La verificación SHALL ejecutar Argon2id también si el correo no existe. `web` SHALL mostrar "Correo o contraseña incorrectos." en una región `role="alert"`, igual en los tres casos.

#### Scenario: Contraseña incorrecta, correo inexistente y cuenta desactivada responden igual [US-211 AC-2] [HU-01] [FR-01] [Pre-S1 resp. 29]
- **GIVEN** `doc1@test.local` con una contraseña incorrecta, un correo `inexistente@test.local` sin usuario, y `doc2@test.local` (`account_status = desactivado`, creado por el test) con su contraseña correcta
- **WHEN** se envía cada login a `POST /platform/auth/login`
- **THEN** los tres responden `401` con `error = CREDENCIALES_INVALIDAS`, el mismo `message` y un `traceId`, validados contra `ErrorCredencialesInvalidas` del spec
- **AND** ninguna respuesta lleva `Set-Cookie` y el número de filas de `auth.session` no cambia

#### Scenario: La página de login muestra el mismo error genérico en los tres casos [US-211 AC-2]
- **GIVEN** la página `/login` y el Route Handler respondiendo `401 CREDENCIALES_INVALIDAS` (MSW desde `contracts/examples/error-credenciales-invalidas.json`)
- **WHEN** se envía el formulario
- **THEN** aparece "Correo o contraseña incorrectos." en una región `role="alert"`, sin indicar qué campo falló, y el navegador sigue en `/login`

#### Scenario: La página de login muestra el aviso de servicio cuando el Route Handler responde 502 [US-211 AC-2] [Gate 1 2026-10-20]
- **GIVEN** la página `/login` y el Route Handler respondiendo `502` con `error = ERROR_SERVICIO_AUTENTICACION` (MSW desde su ejemplo en `contracts/examples/`)
- **WHEN** se envía el formulario
- **THEN** aparece el texto de la clave `login.errorServicio` ("No se pudo iniciar sesión en este momento. Inténtalo de nuevo.") en una región `role="alert"`, distinto de "Correo o contraseña incorrectos.", y el navegador sigue en `/login`

### Requirement: El login de web verifica Origin y Content-Type antes de contactar a clinical-api
Antes de leer el cuerpo, `POST /api/auth/login` de `web` MUST verificar `Origin` con `verificarOrigen()` de L1D-139 (ausente también falla) y exigir `Content-Type: application/json` `[S1 resp. 14a]`. Si falla, SHALL responder la respuesta propia del BFF `403` con forma `ErrorPermisoDenegado` (`PERMISO_DENEGADO`) y registrar `motivo=origen` o `motivo=content_type` sin credenciales; MUST NOT llamar a `clinical-api`.

#### Scenario: Un login desde otro origen o sin JSON responde 403 sin contactar a clinical-api [SEG-01] [S1 resp. 14a]
- **GIVEN** el Route Handler `app/api/auth/login` con `clinical-api` simulado con MSW que cuenta requests, y dos requests con las credenciales correctas de `doc1@test.local`: uno con `Origin: https://otro-origen.test` y `Content-Type: application/json`, y otro con `Origin` permitido y `Content-Type: application/x-www-form-urlencoded`
- **WHEN** llega cada request a `web`
- **THEN** ambos responden `403` con `error = PERMISO_DENEGADO`, validados contra `ErrorPermisoDenegado` con el *helper* `assertMatchesSpec()` de L1D-164
- **AND** ninguna respuesta lleva `Set-Cookie` y el contador de requests a `clinical-api` es cero

### Requirement: El login de web declara sus respuestas propias 502 y 500
Cuando `clinical-api` es inalcanzable o falla el transporte, `POST /api/auth/login` de `web` MUST responder `502` con `ErrorServicioAutenticacion` (`error = ERROR_SERVICIO_AUTENTICACION`, mensaje fijo, `traceId` generado) sin URL, cuerpo parcial ni detalle interno; y un `500` de `clinical-api` (`ErrorInterno`) SHALL retransmitirse sin cambios. Ninguno lleva `Set-Cookie`.

#### Scenario: Con clinical-api inalcanzable el login responde 502 ERROR_SERVICIO_AUTENTICACION sin detalle [Gate 1 2026-10-20]
- **GIVEN** el Route Handler `app/api/auth/login` con `clinical-api` simulado (MSW) que falla la conexión, y las credenciales correctas de `doc1@test.local`
- **WHEN** se envía el login
- **THEN** responde `502` con `error = ERROR_SERVICIO_AUTENTICACION`, `message` fijo y `traceId`, validado contra `#/components/schemas/ErrorServicioAutenticacion` con `assertMatchesSpec()`
- **AND** el cuerpo no contiene el hostname ni la causa de la excepción, `message` es fijo, no lleva `Set-Cookie`, y ninguna línea de log capturada contiene la contraseña enviada

#### Scenario: Un 500 de clinical-api se retransmite como ErrorInterno [Gate 1 2026-10-20]
- **GIVEN** `clinical-api` simulado con MSW desde `contracts/examples/error-interno.json` respondiendo `500`
- **WHEN** se envía el login
- **THEN** `web` responde `500` con el mismo cuerpo `ErrorInterno`, validado contra el spec, y sin `Set-Cookie`

### Requirement: Guard de sesión en clinical-api
Toda ruta `/platform/*` salvo el login MUST pasar por el guard, que busca el hash del token de `oncolens_session` en `auth.session` no revocada, con `expires_at` futuro `[S1 resp. 14c]` y de un usuario `activo`. Sin cookie, con token desconocido o con sesión caducada, SHALL responder `401 NO_AUTENTICADO` antes del controlador y de validar el cuerpo, sin invocar a `rag-orchestrator`. Con sesión válida SHALL adjuntar `userId` y rol (el `403` de admin es de L1D-103).

#### Scenario: Un análisis sin cookie o con cookie desconocida responde 401 antes del controlador [US-211 AC-3] [FR-01] [OL-03]
- **GIVEN** un `POST /platform/evidence-analyses` sobre el paciente semilla (a) sin cookie, y otro con una cookie `oncolens_session` de valor aleatorio que no está en `auth.session`, y `rag-orchestrator` simulado con MSW que cuenta llamadas
- **WHEN** llegan a `clinical-api`
- **THEN** ambos responden `401` con `error = NO_AUTENTICADO`, validados contra `#/components/responses/NoAutenticado`
- **AND** el controlador no se ejecuta y el contador de llamadas a `rag-orchestrator` es cero

#### Scenario: Una sesión caducada responde 401 aunque el token exista [US-211 AC-3] [FR-01] [S1 resp. 14c]
- **GIVEN** una fila de `auth.session` de `doc1@test.local` no revocada con `expires_at` anterior al reloj inyectado congelado, y `rag-orchestrator` simulado con MSW que cuenta llamadas
- **WHEN** llega un `POST /platform/evidence-analyses` con la cookie `oncolens_session` de esa sesión
- **THEN** responde `401` con `error = NO_AUTENTICADO`, validado contra `#/components/responses/NoAutenticado`
- **AND** el controlador no se ejecuta y el contador de llamadas a `rag-orchestrator` es cero

Regresión [FR-01] (expiración por inactividad en el guard) activa desde S2 (US-044).
Regresión [SEG-02] (`403` por permiso según `x-permission`) activa desde S2 (US-045).

### Requirement: Guard de páginas en web
`web` MUST redirigir a `/login` toda ruta del *dashboard* (`/pacientes/:path*`) cuando el request no trae cookie `oncolens_session`, antes de renderizar cualquier Server Component, de modo que el HTML servido no contenga datos del paciente. Un `401` de `clinical-api` recibido por un Route Handler de `web` SHALL retransmitirse tal cual al navegador (spec `web-bff`, L1D-139) y el cliente que hizo el `fetch` (en el S1, el panel de L1D-140) SHALL tratarlo como "sin sesión" y navegar a `/login`.

#### Scenario: Abrir el análisis del paciente sin sesión redirige al login sin datos del paciente [US-211 AC-4] [FR-01]
- **GIVEN** un navegador sin cookie de sesión
- **WHEN** abre `/pacientes/<id del paciente semilla (a)>/analisis`
- **THEN** `web` responde con una redirección a `/login` y el navegador termina en la página de login
- **AND** el HTML servido no contiene el identificador del paciente ni ningún dato clínico o de identidad del seed

Nota (usuario, 2026-10-20, opción b): el requisito "La sesión del doctor nunca llega a rag-orchestrator" (AC-5 de US-211) y sus dos escenarios se movieron al delta de spec de L1D-103 (`evidence-analysis-gateway`); este change solo garantiza que el guard adjunta `userId` y `rol`.

### Requirement: Contraseñas y tokens de sesión fuera de los logs
Los logs de `web` y `clinical-api` MUST NOT contener la contraseña enviada en el login ni el valor del token de sesión (ni en cabeceras `Cookie`/`Set-Cookie` ni en cuerpos). El logger SHALL redactar `password`, `cookie`, `set-cookie` y `authorization`, y el cuerpo del login MUST NOT registrarse.

#### Scenario: Los logins exitoso y fallidos no dejan la contraseña ni el token en los logs [US-211 AC-6] [NFR-11]
- **GIVEN** los logins de AC-1 y AC-2 con contraseñas de test conocidas y el logger de `clinical-api` capturado en memoria
- **WHEN** se leen las líneas de log emitidas durante esos requests
- **THEN** ninguna contiene ninguna de las contraseñas enviadas ni el valor del token de la cookie emitida

#### Scenario: Los logs del Route Handler de login de web no contienen secretos [US-211 AC-6] [NFR-11]
- **GIVEN** el Route Handler `app/api/auth/login` con el logger de `web` capturado y `clinical-api` simulado con MSW respondiendo `204` con `Set-Cookie` y `401`
- **WHEN** se envían un login correcto y uno incorrecto
- **THEN** ninguna línea de log de `web` contiene la contraseña ni el valor del token
