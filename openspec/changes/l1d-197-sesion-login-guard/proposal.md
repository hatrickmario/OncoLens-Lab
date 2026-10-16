# Proposal — l1d-197-sesion-login-guard

## Trazabilidad

L1D-197 · US-211 · FEAT-T4a (L1D-40) · Sprint 1 · Estimación **3** · HU-01 (escenarios 1 y 2) ·
FR-01 (parte S1) · SEG-01 · AC-T4.1 (FR-01, parte S1) · NFR-11 · readme §2.5 (sesión opaca,
credencial de servicio) · OL-03 · CLAUDE.md ("La sesión del doctor nunca llega a Backend 2";
CSRF/`Origin`) · `[Pre-S1 resp. 29]` (anti-enumeración del `401`) · `[S1 resp. 4]` (rutas y campo
del login) · `[S1 resp. 13]` (SDK generado de L1D-105) · `[S1 resp. 14a]` (`Origin` y
`Content-Type` en el login) · `[S1 resp. 14c]` (`expires_at` en el guard; `403` de admin en L1D-103) ·
`[S1 resp. 17]` (*helper* de validación de L1D-164) · `[S1 resp. 18]` (dueño de
`apps/web/messages/es.json`) · US-211 AC-1…AC-6

> **División de US-044 (usuario, 2026-10-07, `backlog/01-requisitos.md` §15 "Ajustes al slicing
> v2"):** esta historia adelanta al S1 el login, la cookie opaca y el guard para que el *walking
> skeleton* corra con una sesión real; la expiración, el cierre de sesión y el bloqueo por intentos
> quedan en US-044 (S2).

> **Decidido (usuario, 2026-10-13, `[S1 resp. 4]`):** rutas en español del diseño aprobado
> (`docs/ux/flujo-e2e.md`): `/login` y `/pacientes/[id]/analisis` (en el S1 el resultado se muestra
> en esa misma página; `/pacientes/[id]/analisis/[analysisId]` llega con el historial). El campo de
> la página de login es "Correo electrónico". En el S1 la ruta de inicio configurada tras el login
> es `/pacientes/[id]/analisis` del paciente semilla (a) (`docs/ux/S1/pantallas-s1.md`).

> **Decidido (usuario, 2026-10-14, Gate 1, `backlog/sprints/S1-plan.md` §2):**
> - `[S1 resp. 14a]` el Route Handler de login reutiliza `verificarOrigen()` de L1D-139 y exige
>   `Content-Type: application/json`; si falla, `403 PERMISO_DENEGADO` sin llamar a `clinical-api`
>   (login CSRF). Ya **no** se difiere a US-044.
> - `[S1 resp. 14c]` `resolverSesion` aplica `expires_at`: sesión caducada → `401 NO_AUTENTICADO`.
>   El bloqueo del administrador en el análisis (`403` si rol ≠ `doctor`) lo implementa L1D-103; aquí
>   solo se garantiza que el guard adjunta el rol.
> - `[S1 resp. 13]` `web` llama a `clinical-api` con el SDK generado de L1D-105
>   (`packages/api-contracts/src/client-web/clinical-api/`), con el `fetch` inyectado de L1D-139.
> - `[S1 resp. 17]` las respuestas se validan contra el spec con el *helper* `assertMatchesSpec()` de
>   L1D-164 (no `contracts:verify-provider`, que llega con US-214).
> - `[S1 resp. 18]` este change es el **dueño** de `apps/web/messages/es.json`: crea las claves
>   `login.*`, la clave `app.academicUseLabel` ("Uso académico/investigación", que el login muestra y
>   L1D-194 consume en `AppHeader`; Gate 1, 2ª vuelta) y la estructura base que amplían L1D-193 y L1D-140.
> - Texto de error del login: "Correo o contraseña incorrectos." (alineado con el campo "Correo
>   electrónico").

## Why

El *walking skeleton* del S1 (login → análisis *dense* con una opción citada sobre el paciente
semilla) necesita que nadie sin sesión pueda ver datos de un paciente ni invocar a la IA desde el
primer sprint (HU-01, FR-01). La sesión es una cookie opaca `HttpOnly; Secure; SameSite=Strict`
cuyo token solo existe en el navegador y, como hash, en `auth.session`; nunca es un JWT ni se
reenvía más allá de `clinical-api` (readme §2.5). El contrato ya está congelado (US-033): esta
historia lo implementa con el mínimo que exige el S1.

## What Changes

- **`clinical-api`, módulo `auth`** (`src/modules/auth/auth.{controller,service,repository,schema}.ts`):
  `POST /platform/auth/login` verifica Argon2id contra `auth.user.password_hash`, exige
  `account_status = activo`, emite un token opaco aleatorio de 256 bits (generador inyectado), guarda
  solo su hash en `auth.session.token_hash` con `expires_at = ahora + SESSION_TTL_HOURS` (reloj
  inyectado; el guard lo aplica, `[S1 resp. 14c]`) y responde `204` con `Set-Cookie: oncolens_session`.
  Credenciales inválidas, correo inexistente y cuenta no activa → `401 CREDENCIALES_INVALIDAS` con
  cuerpo idéntico y sin crear filas.
- **`clinical-api`, guard** `src/middleware/auth.ts`: montado en todo `/platform/*` salvo el login;
  busca el hash del token en `auth.session` no revocada, **no caducada** (`expires_at > ahora`,
  `[S1 resp. 14c]`) y de un usuario `activo`, adjunta el usuario y su rol a la request o responde
  `401 NO_AUTENTICADO` antes del controlador.
- **`clinical-api`, higiene de logs:** redacción de `password`, `cookie`, `set-cookie` y
  `authorization` en el logger existente (de L1D-164); nunca se registra el cuerpo del login.
- **`web`, BFF:** Route Handler `app/api/auth/login/route.ts`: verifica `Origin` con
  `verificarOrigen()` de L1D-139 y exige `Content-Type: application/json` antes de leer el cuerpo
  (si no, `403 PERMISO_DENEGADO` propio del BFF, sin llamar a `clinical-api`, `[S1 resp. 14a]`); valida
  con el schema Zod generado de `LoginRequest`; llama a `clinical-api` con la operación `login` del
  SDK generado de L1D-105 `[S1 resp. 13]`; y retransmite solo el `Set-Cookie` de `oncolens_session` y
  el cuerpo de error del contrato.
- **`web`, guard de páginas:** `proxy.ts` (convención de Next.js 16, antes `middleware.ts`) redirige
  a `/login` toda ruta del *dashboard* (`/pacientes/:path*`) sin cookie, antes de renderizar.
- **`web`, pantalla S1-01** `app/login/page.tsx` (RSC) + formulario cliente según
  `docs/ux/S1/pantallas-s1.md`: "Correo electrónico", "Contraseña", "Iniciar sesión"/"Entrando…",
  error genérico "Correo o contraseña incorrectos." en `role="alert"`, y navegación a la ruta de
  inicio configurada (`WEB_HOME_PATH`). Textos en `apps/web/messages/es.json` (claves `login.*`).
- **`web`, mensajes** `apps/web/messages/es.json` (dueño, `[S1 resp. 18]`): estructura base por
  espacios de nombres (`app`, con `app.academicUseLabel`, y `login`; `evidence` y los ajustes de L1D-193
  los añaden sus changes) y un
  lector de servidor `lib/mensajes.ts`, sin librería de i18n.
- **Configuración** (RN-22): `SESSION_TTL_HOURS`, `ARGON2_MEMORY_COST_KIB`, `ARGON2_TIME_COST`,
  `ARGON2_PARALLELISM` (`clinical-api`) y `WEB_HOME_PATH` (`web`, servidor) en `.env.example`.
- **Contrato:** sin cambios. `POST /platform/auth/login`, `LoginRequest`,
  `ErrorCredencialesInvalidas`, `NoAutenticado` y sus ejemplos ya están en
  `apps/clinical-api/openapi.yaml` (US-033); `info.version` no se toca (la sube L1D-164).

## Capabilities

### New Capabilities

- `auth-session`: sesión del doctor — login, cookie opaca, guard en `web` y `clinical-api`, y
  separación de la sesión frente a la credencial de servicio. Está en la lista de capacidades de
  `openspec/config.yaml` y aún no existe en `openspec/specs/`. La credencial interna
  `clinical-api` → `rag-orchestrator` vive en `service-auth` (L1D-105) y **no** se mezcla aquí.

### Modified Capabilities

- Ninguna. `api-contracts` ("Login y cierre de sesión") ya describe la forma del endpoint; este
  change implementa su comportamiento sin cambiar el spec. `data-model` no cambia (`auth.user` y
  `auth.session` los crea L1D-168).

## Bounded contexts

- **clinical-platform:** módulo `auth` y guard de `clinical-api`; Route Handler
  `web/app/api/auth/login`; configuración y `.env.example`; E2E de Compose de AC-5.
- **frontend:** página `/login`, formulario y `proxy.ts` (guard de páginas de `web`).
- **ai-services:** no se toca (AC-5 se verifica leyendo sus logs; su validador es de L1D-105).

## Dependencias

- ↪ **Depende de** **l1d-168-initial-schema-migration** (US-038): tablas `auth.user`
  (`account_status`) y `auth.session` (`token_hash` UK, `expires_at`, `revoked`).
- ↪ **Depende de** **l1d-169-synthetic-demo-seed** (US-039): `doc1@test.local` (doctor, activo,
  Argon2id). El seed usa los parámetros Argon2id que fija este change (`createPasswordHasher()`).
  **`doc2@test.local` (desactivado) lo crea el test de este change, no el seed** (confirmado; ver
  design D7), igual que el correo inexistente de AC-2.
- ↪ **Depende de** **l1d-164-compose-stack** (US-034): esqueletos de `web` y `clinical-api`, logger,
  `LLM_PROVIDER=fake` y perfil de test de Compose para el Playwright de AC-1, AC-4 y AC-5.
- ↪ **Depende de** **l1d-165-secrets-setup-scripts** (US-035): `.env.example` y contraseñas de test
  por variables de entorno (sin secretos en el repo, RN-14).
- ↪ **Depende de** **l1d-105-service-jwt-auth** (US-054): SDK generado de `clinical-api`
  (design D4, `[S1 resp. 13]`) para el Route Handler de login; su transporte
  `createRagOrchestratorFetch()` es el que garantiza `Authorization: Bearer` sin `Cookie`, que AC-5
  verifica aquí de punta a punta con la cookie real.
- ↪ **Depende de** **l1d-139-bff-route-handler-analisis** (US-060), **solo en las tareas `web` del
  login**: `verificarOrigen()` (`lib/server/origen.ts`) y `crearFetchJsonHaciaClinicalApi()`
  (`lib/server/clinical-api.ts`) `[S1 resp. 14a]`. Las tareas de `clinical-api` no esperan.
- ↪ **Depende de** **l1d-164-compose-stack** para el *helper* `assertMatchesSpec()` (design D5b,
  `[S1 resp. 17]`).
- 🔗 **Consumido por** **l1d-103-gateway-contexto-clinico** (US-052 AC-6: el gateway se monta detrás
  de este guard, y su `403` para `admin` usa el rol que adjunta, `[S1 resp. 14c]`), el change de
  **L1D-139** (US-060, Route Handler de análisis: reenvía la cookie y retransmite el `401` tal cual) y
  el de **L1D-140** (US-061, panel en `/pacientes/[id]/analisis`: redirige a `/login` ante el `401`, y
  amplía `es.json`). L1D-193 y L1D-194 también amplían `es.json`. Coordinación de oleada: la parte
  `clinical-api` de L1D-197 antes de L1D-103; la parte `web` del login después de
  `lib/server/origen.ts` de L1D-139. AC-5 necesita el gateway de L1D-103:
  su test de punta a punta se completa en la misma oleada (design D8).
- ⛔ Ninguno bloqueante.

## Fuera de alcance

- Expiración por inactividad, cierre de sesión, bloqueo por cuenta y por IP y verificación de
  `Origin` del logout (US-044, S2). La expiración por `expires_at` sí entra (`[S1 resp. 14c]`). `POST /platform/auth/logout` sigue sin implementar.
- Gestión de usuarios por CLI (US-045, S2): en el S1 los usuarios salen del seed. RBAC por permiso
  (`x-permission`) también es de US-045: en el S1 el guard solo autentica; el `403` del
  administrador en el análisis es de L1D-103 `[S1 resp. 14c]`.
- Listado de pacientes como destino del login y destino por rol (US-048, S2; pantalla 14 del
  administrador, US-222, S6).
- Pie "La sesión expira…" y "Solicitar registro" de la pantalla de login (US-044, US-221).
- Logs JSON con `traceId` completo (US-037, S2): aquí solo se garantiza la redacción de secretos.
- Textos prohibidos de la página de login: regresión `[RN-23]` de US-068.
