# Design — l1d-197-sesion-login-guard

## Contexto

US-211 adelanta al S1 la parte mínima de FR-01: login, cookie opaca y guard en los dos puntos donde
un request sin sesión podría tocar datos (páginas de `web` y `/platform/*` de `clinical-api`). El
contrato ya existe (US-033): `POST /platform/auth/login` (`204` + `Set-Cookie`, `401`
`CREDENCIALES_INVALIDAS`, `422`, `429`) y `NoAutenticado` en todas las rutas protegidas. Las tablas
`auth.user` y `auth.session` las crea L1D-168 según `docs/architecture/data-model.md`. Las rutas y
el campo del login siguen `[S1 resp. 4]` (decidido por el usuario, 2026-10-13). Decisiones del
Gate 1 aplicadas (usuario, 2026-10-14, `backlog/sprints/S1-plan.md` §2): `[S1 resp. 13]` (SDK
generado), `[S1 resp. 14a]` (`Origin` y `Content-Type` en el login), `[S1 resp. 14c]` (`expires_at`),
`[S1 resp. 17]` (*helper* de validación) y `[S1 resp. 18]` (dueño de `messages/es.json`).

```
navegador ──POST /api/auth/login──▶ web (Route Handler: verificarOrigen + Content-Type JSON; no → 403)
                                     ──SDK login (fetch de L1D-139)──▶ POST /platform/auth/login ──▶ clinical-api
          ◀── 204 + Set-Cookie ────                     ◀── 204 + Set-Cookie ─────── (auth.session: token_hash)
navegador ──GET /pacientes/[id]/analisis──▶ web proxy.ts: ¿cookie? no → 307 /login
web Route Handler ──Cookie──▶ clinical-api guard (no revocada, expires_at > ahora, usuario activo)
                                 ──401 NO_AUTENTICADO | req.sesion { userId, rol }──▶ controlador
clinical-api ──Authorization: Bearer <jwt servicio> (sin Cookie, L1D-105)──▶ rag-orchestrator
```

## Decisiones

**D1 · Token opaco y hash en BD.** `crypto.randomBytes(32)` (256 bits) en base64url, detrás de un
puerto `GeneradorDeToken` inyectado (determinismo en tests). En `auth.session.token_hash` se guarda
`SHA-256(token)` en hex: el token tiene entropía completa, así que un hash rápido basta y permite la
búsqueda exacta por la `UK` del guard; Argon2id se reserva para contraseñas. Descartado: guardar el
token cifrado (la clave viviría junto a la BD sin aportar nada) y JWT de sesión (prohibido por
readme §2.5 y CLAUDE.md).

**D2 · Argon2id con parámetros en configuración.** Librería `argon2` (versión exacta) con
`ARGON2_MEMORY_COST_KIB = 19456`, `ARGON2_TIME_COST = 2`, `ARGON2_PARALLELISM = 1` (mínimo de OWASP;
calibrables, RN-22). `src/modules/auth/password-hasher.ts` expone `createPasswordHasher(params)` con
`hash()` y `verify()`; el seed de L1D-169 lo importa para que ambos usen los mismos parámetros (cierra
el riesgo "choque con US-211" de su design). Este change añade la dependencia `argon2`; L1D-169 no
la duplica.

**D3 · Anti-enumeración por cuerpo y por tiempo.** El service resuelve los tres casos de AC-2 en un
solo camino: si el correo no existe, verifica contra un hash señuelo calculado al arrancar con los
mismos parámetros, y si la cuenta no está `activo` verifica igualmente antes de rechazar. Un único
`CredencialesInvalidasError` se mapea a `401` con `message` fijo. El correo se normaliza
(`trim` + minúsculas) antes de buscarlo y nunca se escribe en el error ni en el log. Extraído como
`autenticarCredenciales()`.

**D4 · Rotación en cada login.** El login ignora la cookie entrante y siempre crea una sesión nueva
con un token nuevo (defensa contra fijación de sesión, AC-1). No revoca la sesión previa: revocar es
del logout (US-044). `expires_at = reloj.ahora() + SESSION_TTL_HOURS` (lo aplica el guard, D5) y `last_seen_at = ahora`;
`ip_address` y `user_agent` quedan `null` en el S1 (el bloqueo por IP de US-044 definirá cómo `web`
propaga la IP del cliente). Decidido (usuario, 2026-10-20): ambas columnas de `auth.session` son
**`nullable`** (`docs/architecture/data-model.md` corregido; migración en la tarea 2.0) y el valor
es `null`, **no** cadena vacía: esto revierte la nota de cadena vacía que se había planteado.

**D5 · Guard de `clinical-api`.** `src/middleware/auth.ts` (`requireSession`) se monta en el router
`/platform` después de declarar `POST /platform/auth/login` y antes de cualquier otro router, y
corre antes del `express.json()` de cada ruta para que un `401` llegue antes de validar el cuerpo
(AC-3). Consulta `auth.session` por `token_hash` con `revoked = false` y usuario `activo`, y
`resolverSesion(token)` rechaza la sesión si `expires_at <= reloj.now()` (reloj inyectado):
sesión caducada → `401 NO_AUTENTICADO`, igual que un token desconocido `[S1 resp. 14c]`. La
inactividad sigue en US-044 (S2), que la añadirá en `resolverSesion` sin tocar el middleware.
Adjunta `req.sesion = { userId, rol }`. El guard solo autentica: el `403` para un rol distinto de
`doctor` en `POST /platform/evidence-analyses` lo implementa L1D-103 con ese `rol`
(`[S1 resp. 14c]`, PRD E-04); este change solo garantiza que el rol llega adjunto.

**D6 · BFF del login en `web`.** `app/api/auth/login/route.ts` (`runtime = 'nodejs'`, módulo
`server-only`): **antes de leer el cuerpo**, llama a `verificarOrigen()` de L1D-139
(`lib/server/origen.ts`) y exige `Content-Type: application/json` (se acepta el parámetro
`charset`); si alguna falla responde la respuesta propia del BFF `403` con el cuerpo
`ErrorPermisoDenegado` del contrato (`error = PERMISO_DENEGADO`), registra `motivo=origen` o
`motivo=content_type` y no llama a `clinical-api` (login CSRF: un formulario de otro sitio no puede
enviar JSON sin *preflight*, `[S1 resp. 14a]`). Después valida con el schema Zod generado **`zLoginBody`**
(`packages/api-contracts/src/zod/clinical-api`; **no** `zLoginRequest`, que omite `password` por ser
`writeOnly`), llama a la operación `login` del **SDK generado**
de `clinical-api` (L1D-105, `packages/api-contracts/src/client-web/clinical-api/`,
`createClient({ baseUrl, fetch })`) con el `fetch` de `crearFetchJsonHaciaClinicalApi()` de L1D-139 (`crearSdkClinicalApi()` devuelve `{ client, cuerpoCrudo }`; `createClient` se importa de `.../client-web/clinical-api/client`), sin
cookie entrante `[S1 resp. 13]`, lee el `Set-Cookie` de `response.headers.getSetCookie()` y retransmite
**solo** la cabecera `Set-Cookie` de `oncolens_session` tal cual (los atributos los fija el
proveedor; sin `Domain`, el navegador la asocia al host de `web`) y el cuerpo de error del contrato.
El `422` local (Zod) y el remoto se muestran como el mismo error genérico. Si `clinical-api` es
inalcanzable o falla el transporte, el Route Handler responde `502` con `ErrorServicioAutenticacion`
(`error = ERROR_SERVICIO_AUTENTICACION`, mensaje fijo, `traceId` generado, sin URL ni cuerpo parcial); un
`500` de `clinical-api` se retransmite tal cual (`ErrorInterno`). El *helper* de fallos de transporte de L1D-139
recibe el **código de error por parámetro** (el login pasa `ERROR_SERVICIO_AUTENTICACION`, no
`ERROR_SERVICIO_IA`) o, si no lo admite, el login usa el suyo. Descartado: reconstruir
la cookie en `web` con `cookies().set()` (dos lugares que deciden los atributos de la misma cookie).
`Secure` funciona en el S1 porque Playwright y el navegador usan `localhost`, que es contexto seguro;
HTTPS completo llega en el S6 (VPN/HTTPS).

**D7 · Usuarios de test de AC-2: los crea el test, no el seed (confirmado).** El seed de L1D-169
solo crea `doc1@test.local` y `admin@test.local` (US-039 AC-1). `doc2@test.local`
(`account_status = desactivado`) lo inserta el *builder* de test de este change
(`tests/support/usuarios.ts`, con `createPasswordHasher()` y contraseña desde
`TEST_DOC2_PASSWORD`), y el correo inexistente no se crea. Así el seed no crea cuentas que la demo
no usa y FX-T4a-b queda cubierto. Si el humano prefiere que lo siembre el seed, solo cambia el
*fixture*, no los AC. **`doc1@test.local` lo crea el *fixture*/*builder* de test con el *hasher* de 197; en
la demo, el seed de US-039** (decidido, usuario, 2026-10-20, ver abajo).

**Decidido (usuario, 2026-10-20), circularidad con L1D-169:** `doc1@test.local` tampoco sale del seed en
este change: el *builder* de `tests/support/usuarios.ts` lo inserta con `createPasswordHasher()`, igual que
a `doc2@test.local`. L1D-169 adopta después el *hasher* de este change y el usuario `doc1` en su seed. El
paciente semilla (a) que usan `WEB_HOME_PATH` y los tests de rutas sí llega del seed de L1D-169 solo en la
ruta de inicio (UUID determinista); ningún test de este change lo lee de la BD.

**D8 · Guard de páginas en `web` y AC-5 de punta a punta.** `apps/web/proxy.ts` (Next.js 16
renombró `middleware.ts` a `proxy.ts`) con `matcher: ['/pacientes/:path*']`: sin cookie →
`NextResponse.redirect('/login')`, sin renderizar nada (comprobación optimista; la verificación real
es el guard de `clinical-api`). La ruta `/login` no está en el `matcher`. En el S1 la página del
análisis no consulta la ficha (solo usa el parámetro `[id]`), así que una cookie falsa no expone
datos: el Route Handler de análisis (L1D-139) retransmite el `401` tal cual (un `fetch` JSON no
redirige) y es el cliente del panel (L1D-140) el que navega a `/login`.
**Decidido (usuario, 2026-10-20, opción b): la verificación del AC-5 (integración con cookie real y
logs de `rag-orchestrator`) pasa al change de L1D-103** (dueño del gateway); este change ya no
la contiene ni deja ningún test en rojo. Solo garantiza que el guard adjunta `userId` y `rol` y que la cookie termina en
`clinical-api`. El AC-5 de US-211 queda verificado cuando L1D-103 esté en `main`.

**D9 · Ruta de inicio configurada.** `WEB_HOME_PATH` (variable de servidor, no `NEXT_PUBLIC_`): la
página `/login` (RSC) la lee y la pasa al formulario cliente como prop; tras el `204`, el formulario
hace `router.replace(homePath)`. En el S1 vale `/pacientes/<UUID v5 del paciente semilla (a)>/analisis`
(UUID determinista del seed de L1D-169). El destino por rol y el listado llegan en US-048/US-222.

**D10 · `apps/web/messages/es.json`, dueño único `[S1 resp. 18]`.** Este change crea el archivo con
la estructura base: un objeto JSON por espacios de nombres de primer nivel (`app` y `login` aquí;
`evidence.*` lo añade L1D-140 y los ajustes de lenguaje L1D-193),
claves en `camelCase` y valores solo texto plano (sin HTML). Lo lee en servidor `lib/mensajes.ts`
(`mensajes()`: import tipado del JSON, sin librería de i18n; YAGNI hasta que haya un segundo idioma).
Claves de este change: `login.titulo`, `login.subtitulo`, `login.correo` ("Correo electrónico"),
`login.contrasena` ("Contraseña"), `login.enviar` ("Iniciar sesión"), `login.enviando`
("Entrando…"), `login.errorCredenciales` ("Correo o contraseña incorrectos."),
`login.errorServicio` ("No se pudo iniciar sesión en este momento. Inténtalo de nuevo.", aviso neutro para el
`502 ERROR_SERVICIO_AUTENTICACION` del Route Handler; fuente única `es.json`, sin copia del literal en componentes) y
**`app.academicUseLabel` ("Uso académico/investigación")** (Gate 1, 2ª vuelta: `/login` sí lleva la
etiqueta, S1-01 de `pantallas-s1.md`, RN-19). Este change crea la clave y la muestra en el login como
texto visible; L1D-194 la **consume** en `AppHeader` (cabecera del *dashboard*) sin crearla ni cambiar su
valor, de modo que hay una sola fuente del literal. Los demás changes añaden claves; no recrean el
archivo.

**D11 · Repository sobre `pg`, no Prisma Client (deuda D-1).** Decidido (usuario, 2026-10-20):
`auth.repository.ts` se implementa con el *driver* `pg` (consultas parametrizadas, pool inyectado
desde `server.ts`, tarea 2.6b), detrás del mismo puerto `AuthRepository`. Motivo: Prisma 7 exige
`@prisma/adapter-pg` y un cliente generado (`prisma generate`) que **no están en el repo** y
traerlos excede este change (3 pts). Los tests de integración siguen contra PostgreSQL real de
test, sin `vi.mock` del repository. La migración a Prisma Client queda como historia de deuda D-1
("`clinical-api`: repositories sobre Prisma Client (auth)", ID por asignar, `backlog/features/README.md`);
al migrarla solo cambia la implementación del puerto. Esto sustituye las menciones a Prisma de la
tabla de colaboradores.

**D12 · UI provisional con CSS Modules.** Decidido (usuario, 2026-10-20): `/login` se mergea con
**CSS Modules** y los tokens de `docs/ux/sistema-de-diseno.md` como variables CSS, **no** con
Tailwind v4 ni shadcn/ui. Es provisional: la deuda D-2 (chore pequeño, ID por asignar) instala
Tailwind v4 + shadcn/ui **antes de L1D-140** y migra `/login`. Sustituye la mención a
`components/ui` de shadcn en "Componentes y patrones". El `visual-check` y los E2E de este change
quedan pendientes hasta la deuda D-3 (Playwright y perfil de test en Compose).

**D13 · Otras decisiones de la Oleada 4 (usuario, 2026-10-20).** (a) **AC-5 de US-211 pasa a
L1D-103** (opción b, ver D8 y Riesgos): este change ya no contiene su test ni su escenario de spec.
(b) **Contrato:** se añaden un `500` genérico y un código propio de login para el `502` (tarea 1.2,
contract-first); la sección "Contratos" ya no dice "sin cambios". (c) **`WEB_HOME_PATH`** con el UUID
del paciente semilla en `/login` (D9) queda **aceptado como deuda hasta US-048**. (d) **CSP y
cabeceras anti-clickjacking en `/login`:** excepción nombrada hasta US-216 (S6); no se añaden aquí.

## Privacidad y ownership

- **Fronteras:** navegador → `web` (correo y contraseña en el cuerpo de `POST /api/auth/login`,
  nunca en la URL) → `clinical-api` (mismo cuerpo, red `clinical-net`). La contraseña solo existe en
  memoria durante el request; en BD solo `password_hash` Argon2id. El token solo existe en la cookie
  del navegador y como `SHA-256` en `auth.session`.
- **Sesión ≠ credencial de servicio:** la cookie termina en `clinical-api`. Hacia `rag-orchestrator`
  solo viaja el JWT de servicio de L1D-105 por `createRagOrchestratorFetch()`, que no recibe las
  cabeceras entrantes. Este change no toca `rag-orchestrator`, que sigue sin acceso a datos clínicos,
  a `auth` ni a `clinical-minio` (su rol `rag_corpus` tiene `REVOKE ALL` sobre `auth`).
- **Identidad del paciente (RN-10/RN-11):** no se toca; el login no maneja datos de pacientes.
- **Logs (NFR-11, AC-6):** redacción en el logger de `clinical-api` (`req.body.password`,
  `req.headers.cookie`, `res.headers["set-cookie"]`, `req.headers.authorization`) y en el de `web`;
  ni el correo ni la contraseña se registran en el login (solo `event`, `resultado`, `traceId`).
- **Datos:** solo usuarios sintéticos `@test.local`; contraseñas de test y de demo desde variables
  de entorno (`SEED_DOCTOR_PASSWORD`, `TEST_DOC2_PASSWORD`), nunca en el repo (RN-13, RN-14).

### Seguridad web

- **Validación:** el mismo schema Zod generado `zLoginBody` en el formulario cliente y en el
  Route Handler; `clinical-api` vuelve a validar en su borde.
- **Cookie:** `HttpOnly; Secure; SameSite=Strict; Path=/`, sin `Domain`; nunca accesible desde JS.
- **CSRF / `Origin`:** `SameSite=Strict` + `verificarOrigen()` de L1D-139 + `Content-Type:
  application/json` obligatorio en el login (D6, `[S1 resp. 14a]`). La del logout es de US-044.
- **`NEXT_PUBLIC_`:** ninguna nueva. `WEB_HOME_PATH` y `CLINICAL_API_URL` son de servidor.
- **Módulos `server-only`:** el Route Handler y el cliente hacia `clinical-api`.
- **Render:** solo textos fijos del diseño; el `message` del `401` no se pinta (se muestra el literal
  genérico), así que no hay HTML crudo.
- **CSP y cabeceras:** sin cambios en este change (las fija US-216, S6). **Excepción nombrada
  (usuario, 2026-10-20):** `/login` se mergea sin CSP ni cabeceras anti-clickjacking hasta US-216,
  antes de G-Piloto; el formulario no usa scripts inline propios.
- **Dependencias nuevas:** `argon2` en `clinical-api` (`npm audit` sin vulnerabilidades altas en el
  PR). `web` no añade dependencias.

## Contratos

- **Proveedor:** `clinical-api` (`apps/clinical-api/openapi.yaml`). **Consumidor:** `web` (cliente
  y schemas Zod generados en `packages/api-contracts`).
- **Diff propuesto del spec (literal; tarea 1.2, aditivo, contract-first).** `POST /platform/auth/login`
  (`security: []`, `x-permission: publico`, `204` con `Set-Cookie`, `401` `ErrorCredencialesInvalidas`,
  `422`, `429`), `components.securitySchemes.sessionCookie` (`oncolens_session`) y `responses.NoAutenticado`
  ya existen. Se añade:

  ```diff
   /platform/auth/login:
     post:
       responses:
  +      "500":
  +        $ref: '#/components/responses/ErrorInterno'
   components:
     responses:
  +    ErrorInterno:
  +      description: >-
  +        Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
  +      content:
  +        application/json:
  +          schema:
  +            $ref: '#/components/schemas/ErrorInterno'
     schemas:
  +    ErrorInterno:
  +      type: object
  +      additionalProperties: false
  +      required: [error, message, traceId]
  +      properties:
  +        error: { type: string, const: ERROR_INTERNO }
  +        message: { type: string }
  +        traceId: { type: string }
  +    ErrorServicioAutenticacion:
  +      type: object
  +      additionalProperties: false
  +      required: [error, message, traceId]
  +      properties:
  +        error: { type: string, const: ERROR_SERVICIO_AUTENTICACION }
  +        message: { type: string }
  +        traceId: { type: string }
  ```

  `ErrorServicioAutenticacion` va **solo** en `components.schemas` y **no** como `502` bajo
  `login.responses`: el `502` lo emite el BFF de `web` cuando `clinical-api` es inalcanzable, no
  `clinical-api` (precedente: `ErrorServicioIa` de L1D-139, validado con `assertMatchesSpec('clinical-api',
  '#/components/schemas/ErrorServicioAutenticacion', body)`). Ejemplos nombrados con su `target` en
  `contracts/examples/index.json`: `error-interno.json` (`#/paths/~1platform~1auth~1login/post/responses/500`)
  y `error-servicio-autenticacion.json` (`#/components/schemas/ErrorServicioAutenticacion`); mensajes fijos
  sin eco. Los demás ejemplos (`login-request.json`, `error-credenciales-invalidas.json`,
  `error-no-autenticado.json`) no cambian.
  **Pendiente de decisión humana:** `ErrorInterno` está también en el diff de L1D-104 (mismo `ERROR_INTERNO` y
  mensaje fijo); la recomendación del Gate 1 es que 197 (oleada 4) sea su dueño y 104 lo referencie. Hasta
  esa decisión este change conserva el texto de arriba y no se edita 104.
- **Compatibilidad:** los añadidos son aditivos (sin `ERR` de oasdiff; un `WARN` se declara en el PR); ADR-26 respetado. Comprobación con `contracts:breaking` de L1D-166 (↪ dependencia); si el script aún no existe, `oasdiff` manual contra `main`.
- **Verificación del proveedor:** los tests de integración validan `204`, `401` y `422` del login y
  el `401 NO_AUTENTICADO` del guard contra el spec con el *helper*
  `assertMatchesSpec('clinical-api', <puntero>, body)` de L1D-164 (D5b, `[S1 resp. 17]`);
  `contracts:verify-provider` llega con US-214. El `403` propio del Route Handler de login se valida
  igual contra `ErrorPermisoDenegado`.
- El Route Handler `web/app/api/auth/login` no tiene spec OpenAPI propio: es un proxy que reexpone
  la forma del contrato de `clinical-api`; sus respuestas propias (`403 PERMISO_DENEGADO`, `502
  ERROR_SERVICIO_AUTENTICACION` y el `500` retransmitido) se declaran como requisitos de `auth-session`.

## Componentes y patrones

- `app/login/page.tsx` (RSC): marca, etiqueta "Uso académico/investigación" (clave
  `app.academicUseLabel`), título y subtítulo de S1-01 desde `messages/es.json` (D10); lee `WEB_HOME_PATH` y monta el formulario.
- `components/organisms/login-form.tsx` (`'use client'`, único punto cliente): campos con
  CSS Modules provisionales (D12; `Input`, `Label` y `Button` de shadcn llegan con la deuda D-2), estado de carga "Entrando…" y región
  `role="alert"`. Previsto < 100 líneas; si las supera, se separa `login-error.tsx`.
- Sin custom hooks, providers ni compound components: un solo consumidor (YAGNI).
- `proxy.ts` no es un componente; sin providers nuevos.
- Referencia: `docs/ux/S1/pantallas-s1.md` S1-01 y `docs/ux/sistema-de-diseno.md` (tokens, tipografía,
  accesibilidad). Desviación única: no se muestran el pie de expiración ni "Solicitar registro"
  (fuera del S1, como dice la propia pantalla).

## Dependencias y colaboradores

| Módulo | Crea/mod. | Depende de | Reglas extraídas |
|---|---|---|---|
| `clinical-api/src/modules/auth/auth.controller.ts` | crea | `AuthService` (interfaz) | mapeo de error → `401` |
| `auth.service.ts` (`createAuthService({ repo, hasher, tokens, ids, reloj, config })`) | crea | puertos `AuthRepository`, `PasswordHasher`, `GeneradorDeToken`, `Clock` (`infrastructure/clock.ts`, método `now()`), `GeneradorDeIds` (`infrastructure/ids.ts`) | `autenticarCredenciales()`, `resolverSesion()` (con `expires_at`), `hashDeToken()` |
| `auth.repository.ts` | crea | `pg` (pool inyectado; `auth.user`, `auth.session`; D11) | — |
| `auth.schema.ts` | crea | Zod generado `zLoginBody` | — |
| `auth/password-hasher.ts` | crea | `argon2` | parámetros desde config |
| `src/middleware/auth.ts` | crea | `AuthService.resolverSesion` | — |
| `src/app.ts` / router `/platform` | mod. | guard | orden: login → guard → resto |
| `src/config.ts`, logger | mod. | — | claves nuevas, redacción |
| `web/app/api/auth/login/route.ts` | crea | `verificarOrigen(request, { config, nuevoTraceId, registrar, evento })` (el login pasa su propio evento; sin `ahora`) y `crearFetchJsonHaciaClinicalApi()` de L1D-139, operación `login` del SDK generado (L1D-105) | `reenviarCookieDeSesion()`, `exigirJson()` |
| `web/messages/es.json`, `web/lib/mensajes.ts` | crea (dueño) | — | — |
| `web/proxy.ts` | crea | — | `tieneCookieDeSesion()` |
| `web/app/login/page.tsx`, `components/organisms/login-form.tsx` | crea | Route Handler por `fetch('/api/auth/login')` | — |

Ningún service ni middleware importa `pg` ni `argon2` directamente: los reciben por la *factory*.

## Tests

- **Integración `clinical-api`** (Supertest + PostgreSQL real de test de US-038 + seed de test):
  AC-1 (fila, hash, cookie rotada), AC-2 (tres casos), AC-3 (guard + MSW contador, y sesión
  caducada con reloj congelado después de `expires_at`, `[S1 resp. 14c]`), AC-6 (logger capturado). Reloj y generador de token inyectados y congelados.
- **`web`** (Vitest + MSW desde `contracts/examples/`): Route Handler (cookie retransmitida, `401`,
  `403` por `Origin` distinto y por `Content-Type` no JSON sin request a `clinical-api`, logs sin
  secretos) y formulario con Testing Library (error genérico, estado de carga).
- **E2E** (Playwright contra Compose, perfil de test, `LLM_PROVIDER=fake`): AC-1 (redirección y
  atributos de cookie) y AC-4 (redirección y HTML sin datos), **pendientes hasta la deuda D-3**
  (decisión 49 del plan); el AC-5 (integración y logs de `rag-orchestrator`) lo verifica L1D-103.

## Riesgos

- **AC-5 fuera de este change (resuelto, usuario, 2026-10-20):** el riesgo de orden de la oleada
  (AC-5 dependía del gateway de L1D-103 y del Route Handler de L1D-139) se resuelve moviendo el
  test a L1D-103, con `Test-Removal:` en el commit de código de este change; no se mergea con test
  rojo. Efecto de orden: L1D-197 ya no espera a L1D-103 ni a L1D-139 por AC-5, y L1D-103 (que
  depende de L1D-197) hereda la verificación.
- **Parámetros Argon2id** demasiado caros en CI: son configuración (`.env` de test puede bajarlos).

## Pendiente de definir

Ninguno. Los dos pendientes de la versión anterior se resolvieron en el Gate 1 (usuario, 2026-10-14,
`backlog/sprints/S1-plan.md` §2):

1. **`Origin` en el login:** se verifica en el S1 con `verificarOrigen()` de L1D-139, junto con
   `Content-Type: application/json`, con escenario `403` (`[S1 resp. 14a]`; D6). Ya no se difiere a
   US-044.
2. **Login del administrador:** `admin@test.local` puede iniciar sesión; `POST
   /platform/evidence-analyses` le responde `403 PERMISO_DENEGADO` (L1D-103, `[S1 resp. 14c]`), usando
   el rol que adjunta el guard de este change (D5).
