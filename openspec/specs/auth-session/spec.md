# auth-session Specification

## Purpose
Define la sesión del doctor y del administrador en clinical-api: cookie opaca, expiración por inactividad, cierre de sesión, bloqueo por intentos fallidos y autorización por permisos del rol (RBAC), con usuarios gestionados por CLI (FR-01, RN-30).

## Requirements

### Requirement: Alta de usuarios por CLI con contraseña por stdin
`oncolens users create --email <correo> --role <rol>` MUST ejecutarse solo dentro del contenedor de `clinical-api` (sin ruta HTTP de gestión de usuarios), SHALL leer la contraseña de `stdin` y crear un `User` `activo` con `password_hash` Argon2id. `oncolens users set-role` SHALL cambiar el rol de un usuario existente.

#### Scenario: Un usuario creado por la CLI inicia sesión [US-045 AC-1] [readme §2.5] [V-02]
- **GIVEN** el contenedor de `clinical-api` con la BD de test
- **WHEN** se ejecuta `oncolens users create --email doc3@test.local --role doctor` con la contraseña por `stdin`
- **THEN** existe un `User` `activo` con `password_hash` que empieza por `$argon2id$`
- **AND** `POST /platform/auth/login` con esas credenciales responde `204`

#### Scenario: La CLI rechaza un rol inexistente [US-045 AC-1] (asumido)
- **WHEN** se ejecuta `oncolens users create --email doc4@test.local --role superusuario`
- **THEN** termina con código distinto de 0, no crea el usuario y el mensaje nombra la opción `--role`

### Requirement: La baja de un usuario revoca sus sesiones
`oncolens users deactivate --email <correo>` MUST poner `account_status = desactivado` y revocar en la misma transacción todas las sesiones vivas del usuario.

#### Scenario: Un usuario dado de baja pierde su sesión y no vuelve a entrar [US-045 AC-2] [readme §2.5] (asumido: la baja revoca las sesiones abiertas)
- **GIVEN** `doc3@test.local` con una sesión abierta
- **WHEN** se ejecuta `oncolens users deactivate --email doc3@test.local`
- **THEN** su siguiente request a `/platform/*` responde `401 NO_AUTENTICADO`
- **AND** un login nuevo con su contraseña correcta responde el `401` genérico de US-211 AC-2

### Requirement: Cada operación exige el permiso de su x-permission
Cada ruta de `/platform/*` salvo el login MUST montar `authorize()` con exactamente los códigos del `x-permission` de su operación en `apps/clinical-api/openapi.yaml` y SHALL responder `403 PERMISO_DENEGADO` antes de cualquier efecto si la sesión no tiene ninguno. Las operaciones con `x-view-by-permission` SHALL elegir la forma de la respuesta por permiso, no por rol.

#### Scenario: Un rol sin ai_analysis:create no llega a rag-orchestrator [US-045 AC-3] [ADR-1] [SEG-02]
- **GIVEN** `lector@test.local` con un rol de prueba que solo tiene `patients:lookup` (FX-T4a-b)
- **WHEN** hace `POST /platform/evidence-analyses` sobre el paciente semilla (a)
- **THEN** responde `403 PERMISO_DENEGADO`, validado contra el spec
- **AND** el cliente de `rag-orchestrator` (MSW) registra cero llamadas y `clinical.ai_analysis_record` no gana filas

#### Scenario: Toda ruta montada declara el permiso de su contrato [US-045 AC-3] [SEG-02]
- **WHEN** el test de coherencia recorre las operaciones del spec y el registro de rutas montadas
- **THEN** cada ruta montada usa en `authorize()` exactamente los códigos de su `x-permission`, y una ruta montada sin `authorize()` hace fallar el test nombrando su `operationId`

### Requirement: Sin autorización por paciente en el MVP
Con solo RBAC (P-02), un usuario con `clinical:read` MUST poder leer la ficha de cualquier paciente; la pertenencia al equipo tratante queda en el sistema externo.

#### Scenario: El doctor lee la ficha de cualquier paciente semilla [US-045 AC-4] [P-02] [HU-02]
- **GIVEN** `doc1@test.local`
- **WHEN** consulta `GET /platform/patients/{id}` de cada paciente semilla
- **THEN** todas responden `200` con la vista `doctor`, sin consultar `clinical.care_team_member`

### Requirement: La CLI no expone la contraseña
La contraseña MUST NOT aparecer en los argumentos, la salida estándar, la salida de error ni los *logs* de `clinical-api`.

#### Scenario: Ni la salida de la CLI ni los logs contienen la contraseña [US-045 AC-5] [NFR-11] (asumido)
- **GIVEN** la ejecución del alta de `doc3@test.local` con una contraseña `SINT-` aleatoria por `stdin`
- **WHEN** se leen su `stdout`, su `stderr` y los *logs* de `clinical-api`
- **THEN** ninguno contiene la contraseña

### Requirement: El administrador no recibe datos clínicos ni análisis
La matriz del rol `admin` MUST NOT incluir `clinical:read`, `documents:read`, `ai_analysis:create`, `ai_analysis:read` ni `follow_ups:*`; toda operación con esos permisos SHALL responder `403` al `admin`, y las operaciones con `x-view-by-permission` SHALL darle la vista `default` (`PatientAdminSummary`), nunca la del doctor.

#### Scenario: El admin recibe 403 en el análisis y en toda operación clínica montada [US-045 AC-6] [Pre-S1 resp. 17] [Pre-S1 resp. 27]
- **GIVEN** `admin@test.local` con sesión
- **WHEN** pide `POST /platform/evidence-analyses` y cada operación montada cuyo `x-permission` solo contiene códigos que el `admin` no tiene (excluidas las que listan `patients:lookup`, como `getPatient`, que le dan la vista `default`)
- **THEN** todas responden `403 PERMISO_DENEGADO` y `rag-orchestrator` no recibe llamadas

#### Scenario: La matriz sembrada del admin excluye los permisos clínicos [US-045 AC-6] [E-04]
- **WHEN** se leen los permisos del rol `admin` en `auth.role_permission`
- **THEN** no contienen `clinical:read`, `documents:read`, `ai_analysis:create`, `ai_analysis:read`, `follow_ups:create` ni `follow_ups:read`

#### Scenario: La vista por permiso elige PatientAdminSummary sin clinical:read [US-045 AC-6] [Pre-S1 resp. 27]
- **GIVEN** una sesión sin `clinical:read`
- **WHEN** `vistaSegunPermiso()` elige el mapeo de una operación con `x-view-by-permission`
- **THEN** usa el de `default` y el *repository* de esa vista no lee tablas de `clinical` ni de `identity` en claro (la verificación sobre `GET /platform/patients/{id}`, donde el admin recibe `200 PatientAdminSummary` y no `403`, es `Regresión [US-045 AC-6]` en `l1d-72-ficha-minima-paciente`)

### Requirement: Cierre de sesión que revoca la sesión
`POST /platform/auth/logout` MUST marcar `revoked = true` en la `Session` del token presentado, SHALL responder `204` sin cuerpo y borrar la cookie `oncolens_session`; cualquier request posterior con esa cookie MUST responder `401 NO_AUTENTICADO` en el guard de `/platform/*`.

#### Scenario: Cerrar sesión revoca la sesión y la cookie deja de servir [US-044 AC-1] [HU-01]
- **GIVEN** una sesión activa de `doc1@test.local` (FX-T4a-b)
- **WHEN** el usuario presiona "Cerrar sesión" y `web` llama a `POST /platform/auth/logout`
- **THEN** la `Session` queda con `revoked = true` y la respuesta es `204`, validada contra `apps/clinical-api/openapi.yaml`
- **AND** una request posterior con la misma cookie a `GET /platform/patients` responde `401 NO_AUTENTICADO`
- **AND** el navegador queda en `/login?motivo=cerrada` con el aviso "Cerraste sesión." en `role="status"`

#### Scenario: Sin sesión el logout responde 401 [US-044 AC-1] (asumido)
- **WHEN** se llama a `POST /platform/auth/logout` sin cookie o con una sesión ya revocada
- **THEN** responde `401 NO_AUTENTICADO` y no modifica ninguna sesión

### Requirement: Bloqueo de la cuenta por intentos fallidos
Tras `LOGIN_MAX_FAILED_ATTEMPTS` intentos fallidos consecutivos de una cuenta, `clinical-api` MUST rechazar todo login de esa cuenta, incluso con la contraseña correcta, durante `LOGIN_LOCKOUT_MINUTES`, con el mismo `401` genérico de US-211 AC-2 y sin crear `Session`; pasado el plazo, un login correcto SHALL responder `204` y reiniciar el contador. Ambos valores MUST vivir en configuración (RN-22).

#### Scenario: La cuenta bloqueada responde el 401 genérico y se desbloquea al vencer el plazo [US-044 AC-2] [HU-01] [FR-01]
- **GIVEN** `LOGIN_MAX_FAILED_ATTEMPTS = 5` y `LOGIN_LOCKOUT_MINUTES = 15` en la configuración de test, un reloj de test fijo y `doc1@test.local` con 5 intentos fallidos consecutivos
- **WHEN** se intenta el login con la contraseña correcta a los 14 minutos del quinto fallo
- **THEN** responde el mismo `401 ErrorCredencialesInvalidas` de US-211 AC-2 (mismo cuerpo) y `auth.session` no gana filas
- **AND** cuando el reloj avanza a los 15 minutos, el mismo login responde `204`, crea la `Session` y deja `failed_login_count = 0` y `locked_until = null`

#### Scenario: El bloqueo no se revela en la UI [US-044 AC-2] [S2-01]
- **GIVEN** la cuenta bloqueada del escenario anterior
- **WHEN** el usuario envía sus credenciales correctas en `/login`
- **THEN** la página muestra "Correo o contraseña incorrectos." en `role="alert"`, el mismo texto que ante una contraseña errónea

### Requirement: Bloqueo por IP ante intentos fallidos sobre cuentas distintas
`clinical-api` MUST contar los intentos fallidos por IP de origen del cliente y, al llegar a `LOGIN_MAX_FAILED_ATTEMPTS` dentro de `LOGIN_LOCKOUT_MINUTES`, SHALL rechazar cualquier login desde esa IP con el `401` genérico hasta que venza el plazo. La IP MUST NOT aparecer en los *logs*.

#### Scenario: Una IP con cinco fallos no inicia sesión ni con credenciales correctas de otra cuenta [US-044 AC-3] [readme §2.5] (asumido: mismo umbral y plazo configurables que por cuenta)
- **GIVEN** 5 intentos fallidos desde la IP `198.51.100.7` sobre cinco cuentas distintas, con reloj de test fijo
- **WHEN** esa IP intenta un sexto login con las credenciales correctas de `admin@test.local` dentro del plazo
- **THEN** responde el mismo `401` genérico, no se crea `Session` y el `failed_login_count` de `admin@test.local` no cambia
- **AND** el log del intento registra `motivo=bloqueo_ip` y no contiene `198.51.100.7` ni el correo

### Requirement: IP del cliente fijada por web
`web` MUST descartar el `X-Forwarded-For` que envíe el cliente y escribir la IP real del socket; `clinical-api` SHALL confiar solo en `TRUST_PROXY_HOPS` saltos (1 sin proxy delante de `web`; 2 con el proxy HTTPS del S6).

#### Scenario: Solo se confía en el salto de web para la IP [US-044 AC-3] (asumido)
- **GIVEN** `TRUST_PROXY_HOPS = 1` y la IP bloqueada del escenario anterior
- **WHEN** un request llega con `X-Forwarded-For: 203.0.113.9, 198.51.100.7` (la primera inyectada por el cliente)
- **THEN** `clinical-api` atribuye el intento a `198.51.100.7` y responde el `401` genérico

#### Scenario: web descarta el X-Forwarded-For del cliente y reenvía la IP del socket [US-044 AC-3] (Gate 1)
- **GIVEN** un cliente conectado a `web` desde la IP de socket `198.51.100.7`
- **WHEN** envía `POST /api/auth/login` con la cabecera falsificada `X-Forwarded-For: 203.0.113.9`
- **THEN** la request que `web` hace a `clinical-api` lleva `X-Forwarded-For: 198.51.100.7` y no contiene `203.0.113.9`

### Requirement: Expiración por TTL e inactividad configurables
El guard de `clinical-api` MUST rechazar con `401 NO_AUTENTICADO` una sesión con `expires_at ≤ ahora` o con `ahora − last_seen_at ≥ SESSION_IDLE_MINUTES`, y SHALL actualizar `last_seen_at` al aceptar una sesión (como mucho una escritura cada `SESSION_TOUCH_SECONDS`). Ante un `401` en una página, `web` MUST redirigir a `/login?motivo=expirada` sin renderizar datos del paciente. `SESSION_IDLE_MINUTES`, `SESSION_TTL_HOURS` y `SESSION_TOUCH_SECONDS` MUST vivir en configuración (RN-22).

#### Scenario: Una sesión inactiva 31 minutos lleva al login sin mostrar datos [US-044 AC-4] [FR-01] [readme §2.5] [RN-22]
- **GIVEN** `SESSION_IDLE_MINUTES = 30` y `SESSION_TTL_HOURS = 8` en la configuración de test y una sesión con `last_seen_at` hace 31 minutos
- **WHEN** el navegador abre la ficha de un paciente
- **THEN** `clinical-api` responde `401 NO_AUTENTICADO` y `web` redirige a `/login?motivo=expirada`, que muestra "Tu sesión expiró. Vuelve a iniciar sesión." en `role="status"`
- **AND** el HTML servido no contiene el nombre ni el documento del paciente

#### Scenario: Una sesión con expires_at vencido también expira [US-044 AC-4] [FR-01]
- **GIVEN** una sesión con `last_seen_at` hace 1 minuto y `expires_at` en el pasado
- **WHEN** se pide cualquier ruta protegida de `/platform/*`
- **THEN** responde `401 NO_AUTENTICADO`

#### Scenario: Una sesión usada hace 29 minutos sigue viva y se renueva [US-044 AC-4] [RN-22]
- **GIVEN** la misma configuración y una sesión con `last_seen_at` hace 29 minutos
- **WHEN** se pide la ficha del paciente
- **THEN** la respuesta es `200` y `last_seen_at` queda igual al instante del reloj de test

#### Scenario: El parámetro motivo solo admite valores cerrados [US-044 AC-4] [S2-01]
- **WHEN** se abre `/login?motivo=<script>` o `/login?motivo=/pacientes/123`
- **THEN** la página no muestra ningún aviso de sesión ni pinta el valor recibido

### Requirement: El logout de web verifica Origin antes de contactar a clinical-api
`POST /api/auth/logout` de `web` MUST rechazar con `403 PERMISO_DENEGADO` una request cuyo `Origin` no sea el origen configurado, sin llamar a `clinical-api` y sin revocar la sesión.

#### Scenario: Un logout con Origin ajeno responde 403 y la sesión sigue activa [US-044 AC-5] [SEG-01] [PRD §10]
- **GIVEN** una sesión activa de `doc1@test.local`
- **WHEN** llega `POST /api/auth/logout` a `web` con `Origin: https://evil.example`
- **THEN** responde `403 PERMISO_DENEGADO` (validado contra `ErrorPermisoDenegado`), `clinical-api` no recibe ninguna request y la sesión sigue con `revoked = false`

### Requirement: La página de login usa el sistema de diseño sin cambiar su comportamiento
La página `/login` de `apps/web` MUST construirse con Tailwind v4 y los componentes de shadcn/ui (`Card`, `Input`, `Label`, `Button`, `Alert`) usando los tokens de `docs/ux/sistema-de-diseno.md`, sin CSS Modules propios, y MUST conservar sus textos, nombres accesibles, roles y comportamiento. A 375 y 1280 px MUST NOT haber errores de consola ni violaciones de CSP, ni *scroll* horizontal de página.

#### Scenario: El login migrado pasa el visual-check a 375 y 1280 px [ARR-02 AC-3]
- **GIVEN** el Compose fingido con el seed sintético y `/login` migrado a Tailwind v4 + shadcn/ui
- **WHEN** `visual-check` recorre `/login` (vacío, error de credenciales, enviando) a 375 y 1280 px
- **THEN** no hay errores de consola ni violaciones de CSP, no hay *scroll* horizontal, el foco es visible y los controles miden al menos 44 × 44 px

#### Scenario: El login migrado conserva textos y comportamiento [ARR-02 AC-3]
- **GIVEN** los tests de UI de login y los E2E de login y `sesion-y-origen.spec.ts`
- **WHEN** se ejecutan contra la página migrada
- **THEN** pasan sin cambiar sus aserciones y `apps/web/app/login/` no contiene archivos `.module.css`

#### Scenario: Credenciales inválidas muestran el error genérico con el componente Alert [ARR-02 AC-3]
- **GIVEN** la página migrada
- **WHEN** el usuario envía credenciales inválidas y el BFF responde `401`
- **THEN** se muestra «Correo o contraseña incorrectos.» en un `Alert` con `role="alert"`, sin revelar si la cuenta existe

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
