## ADDED Requirements

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
