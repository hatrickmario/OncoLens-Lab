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
