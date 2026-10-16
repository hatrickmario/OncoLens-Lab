# Proposal — l1d-139-bff-route-handler-analisis

## Trazabilidad

L1D-139 · US-060 · FEAT-10a (L1D-23) · Sprint 1 · Estimación **3** · HU-03 · FR-09 · SEG-01
(sesión y CSRF: `SameSite` + `Origin`) · SEG-09 (solo `web` publica puerto) · OL-04 · readme §2.1
(Route Handler, no Server Action) · readme §6.1 #8 (JSON completo, sin streaming) · CLAUDE.md ("El
navegador solo habla con `web`"; cookie opaca) · `[S1 resp. 4]` (ruta `/pacientes/[id]/analisis`) ·
`[S1 resp. 7]` (`LLM_PROVIDER=fake` en US-034, usado por los E2E) · `[S1 resp. 13]` (SDK generado de
`clinical-api`, L1D-105) · `[S1 resp. 14a]` (`verificarOrigen()` reutilizado por el login de L1D-197) ·
`[S1 resp. 17]` (*helper* de validación de L1D-164) · `[S1 resp. 18]` (dueño de
`evidence-analysis-request.json`; respuestas propias del BFF) · US-060 AC-1…AC-5

> **Nota de la historia:** la cookie que reenvía el Route Handler es la de la sesión mínima del S1
> (US-211: login, cookie opaca y guard); la expiración y el cierre de sesión llegan con US-044 en el S2.

> **Decidido (usuario, 2026-10-13, `[S1 resp. 4]`):** rutas en español del diseño aprobado. El panel
> que consume este Route Handler vive en `/pacientes/[id]/analisis` (`docs/ux/S1/pantallas-s1.md`,
> S1-08/09) y muestra el resultado en la misma página tras el `POST` (no hay
> `GET /platform/evidence-analyses/{id}` en el contrato). Es el recorrido que ejecuta el E2E de AC-3.

> **Decidido (usuario, 2026-10-13, `[S1 resp. 7]`):** `LLM_PROVIDER=fake` vive en US-034 (AC-6) y lo
> usan la CI y los E2E; el Playwright de AC-3 corre contra Compose en ese perfil.

> **Decidido (usuario, 2026-10-14, Gate 1, `backlog/sprints/S1-plan.md` §2):**
> - `[S1 resp. 13]` el Route Handler llama a `clinical-api` con el **SDK generado** por L1D-105
>   (`packages/api-contracts/src/client-web/clinical-api/`, `createClient({ baseUrl, fetch })`), con un
>   `fetch` inyectable que crea este change; no hay cliente propio (`crearClienteClinicalApi`).
> - `[S1 resp. 18]` este change es el **dueño único** de
>   `contracts/examples/evidence-analysis-request.json`. Las respuestas propias del BFF se declaran en
>   la spec `web-bff`: `403 PERMISO_DENEGADO` por `Origin` distinto **o ausente** (aprobado), con log
>   `motivo=origen`, y `502 ERROR_SERVICIO_IA` si `clinical-api` es inalcanzable.
> - `[S1 resp. 14a]` `verificarOrigen()` (`lib/server/origen.ts`) se **exporta** para que lo reutilice
>   el Route Handler de login de L1D-197.
> - El `X-Trace-Id` del navegador **no** se reenvía: `clinical-api` genera el suyo (L1D-103) y el
>   Route Handler retransmite el de la respuesta.
> - Un `401` de `clinical-api` se retransmite tal cual; la redirección a `/login` la hace el cliente
>   del panel (L1D-140). La spec `auth-session` de L1D-197 ("Guard de páginas en web") lo dice igual.

US-060 no tiene supuestos "(asumido)" en el Markdown; los que introducía este change quedaron
resueltos en el Gate 1 (`design.md` `## Pendiente de definir`).

## Why

El *walking skeleton* del S1 necesita que el panel del oncólogo pida el análisis de evidencia sin que
el navegador conozca ni alcance a `clinical-api` ni a `rag-orchestrator` (SEG-09, CLAUDE.md). El
análisis es una mutación costosa sobre datos clínicos: debe pasar por un Route Handler de `web`
(readme §2.1, no Server Action) que verifica `Origin` (SEG-01, CSRF además de `SameSite=Strict`),
reenvía la cookie opaca `oncolens_session` por la red interna y devuelve la respuesta de
`clinical-api` sin reinterpretarla, para que el panel (US-061, US-062) reciba exactamente el
contrato congelado (US-033).

## What Changes

- **`web`, Route Handler** `apps/web/app/api/evidence-analyses/route.ts` (`POST`, `runtime = 'nodejs'`,
  `dynamic = 'force-dynamic'`, módulo `server-only`):
  - verifica `Origin` contra `WEB_ALLOWED_ORIGIN` (variable de servidor) antes de leer el cuerpo;
    distinto o ausente → `403 PERMISO_DENEGADO` sin llamar a `clinical-api`, con log `motivo=origen`
    `[S1 resp. 18]`;
  - reenvía el cuerpo tal cual y **solo** la cookie `oncolens_session` (más `Content-Type`; **nunca** el
    `X-Trace-Id` del navegador ni, en el S1, `Idempotency-Key`: ninguna historia del S1 lo implementa en
    `clinical-api` — FEAT-06a, "no se implementa en el S1" — y se reenviará, validado como UUID, cuando
    llegue la historia que lo implemente; Gate 1, 2ª vuelta) a
    `${CLINICAL_API_URL}/platform/evidence-analyses` con la operación `createEvidenceAnalysis` del SDK
    generado de L1D-105 `[S1 resp. 13]`;
  - devuelve el mismo status, el mismo cuerpo JSON y las cabeceras `Content-Type`, `Retry-After` y
    `X-Trace-Id` de `clinical-api`, sin `Set-Cookie` ni otras cabeceras internas;
  - si `clinical-api` es inalcanzable, `502 ERROR_SERVICIO_IA` genérico `[S1 resp. 18]`;
  - JSON completo, sin streaming (readme §6.1 #8, TBD-08).
- **`web`, transporte interno** `apps/web/lib/server/clinical-api.ts` (`server-only`): resuelve
  `CLINICAL_API_URL` y el *timeout* `WEB_UPSTREAM_TIMEOUT_MS` (RN-22) en el servidor y crea la
  instancia del SDK generado con un `fetch` inyectable (`crearFetchHaciaClinicalApi()`) que construye
  las cabeceras salientes desde cero (lista blanca, design D2) `[S1 resp. 13]`. L1D-197 lo reutiliza
  para el login.
- **`web`, CSRF** `apps/web/lib/server/origen.ts` (`server-only`): `verificarOrigen()` exportado y
  reutilizado por el login de L1D-197 `[S1 resp. 14a]`.
- **Verificación de build:** script de test que busca el valor de `CLINICAL_API_URL` en
  `apps/web/.next/static/**` tras `next build` (AC-5).
- **E2E:** Playwright contra Compose (perfil de test, `LLM_PROVIDER=fake`) que registra todas las
  requests del navegador durante un análisis completo (AC-3).
- **Configuración** (RN-22): `WEB_ALLOWED_ORIGIN` y `WEB_UPSTREAM_TIMEOUT_MS` en `.env.example` de
  `web` (sin `NEXT_PUBLIC_`); `CLINICAL_API_URL` ya existe desde L1D-164.
- **Contrato:** sin cambios en `apps/clinical-api/openapi.yaml`. Este change **crea** (dueño único,
  `[S1 resp. 18]`) `contracts/examples/evidence-analysis-request.json` (sintético) mapeado en
  `index.json` al `requestBody` de `createEvidenceAnalysis`, para que MSW construya el request desde
  el contrato. Los cuerpos `403`/`502` propios del BFF se validan contra `ErrorPermisoDenegado` y
  `ErrorServicioIa` con el *helper* `assertMatchesSpec()` de L1D-164 `[S1 resp. 17]`.

## Capabilities

### New Capabilities

- `web-bff`: comportamiento del BFF de `web` como único punto de entrada del navegador — Route
  Handlers de `app/api/*` que verifican `Origin`, reenvían la sesión a `clinical-api` por su URL
  interna, retransmiten su respuesta sin reinterpretarla y mantienen la URL interna fuera del
  cliente. **Justificación:** no está en la lista de capacidades de `openspec/config.yaml`; ninguna
  existente cubre el BFF: `auth-session` (L1D-197) es la sesión y el login, y
  `evidence-analysis-gateway` (L1D-103/L1D-104) es el comportamiento de `clinical-api`. Los futuros
  Route Handlers (ficha, documentos, revisión) añadirán aquí sus requisitos; el de login sigue en
  `auth-session`.

### Modified Capabilities

- Ninguna. No se modifican requisitos de `auth-session` (L1D-197) ni de
  `evidence-analysis-gateway` (L1D-103/L1D-104): se consumen. `api-contracts` no cambia (solo se
  añade un ejemplo no normativo).

## Bounded contexts

- **clinical-platform:** Route Handler `apps/web/app/api/evidence-analyses/route.ts`, transporte
  `lib/server/clinical-api.ts`, configuración, test de build y E2E de red (dueño:
  `clinical-platform-dev`).
- **frontend:** no se toca; el panel que lo llama es de L1D-140.
- **ai-services:** no se toca.

## Dependencias

- ↪ **Depende de** **l1d-105-service-jwt-auth** (US-054): SDK generado de `clinical-api` en
  `packages/api-contracts/src/client-web/clinical-api/` con `fetch` inyectable (design D4,
  `[S1 resp. 13]`).
- ↪ **Depende de** **l1d-197-sesion-login-guard** (US-211) **solo para el E2E de AC-3**: login de
  `doc1@test.local` y `proxy.ts` que protege la página del panel. Los tests de AC-1, AC-2, AC-4 y
  AC-5 no lo necesitan (la cookie `oncolens_session` es del contrato).
- 🔗 **Consumido por** **l1d-197-sesion-login-guard**: su Route Handler de login reutiliza
  `verificarOrigen()` y `crearFetchHaciaClinicalApi()` `[S1 resp. 14a]`. Orden de la oleada:
  `lib/server/origen.ts` y `lib/server/clinical-api.ts` de este change en `main` antes de las tareas
  `web` del login de L1D-197; las de `clinical-api` de L1D-197 no esperan.
- ↪ **Depende de** **l1d-104-persistencia-analisis-fallos** (US-053) y **l1d-103-gateway-contexto-clinico**
  (US-052): `POST /platform/evidence-analyses` real con sus `401/404/422/500/502/504`. Los tests de
  AC-1, AC-2 y AC-4 no los necesitan (MSW desde `contracts/examples/`); el E2E de AC-3 sí.
- ↪ **Depende de** **l1d-164-compose-stack** (US-034): esqueleto de `web`, `CLINICAL_API_URL`,
  Compose con solo `web` publicado, perfil `LLM_PROVIDER=fake` `[S1 resp. 7]` y el *helper*
  `assertMatchesSpec()` de validación de respuestas (design D5b, `[S1 resp. 17]`).
- ↪ **Depende de** **l1d-169-synthetic-demo-seed** (US-039): `doc1@test.local` y paciente semilla (a)
  para el E2E.
- 🔗 **Consumido por** el change de **L1D-140** (US-061, panel en `/pacientes/[id]/analisis`): llama a
  `POST /api/evidence-analyses` y resuelve el `401` como redirección a `/login` en el cliente. El E2E
  de AC-3 usa ese panel: se cierra en la misma oleada que L1D-140, nunca con `.skip`.
- 🔗 **Consumido por** US-062 (L1D-141, S3): estados de espera y error del panel sobre los códigos
  que este Route Handler retransmite.
- ⛔ Ninguno bloqueante.

## Fuera de alcance

- La UI del panel, sus estados y la redirección del cliente ante `401` (L1D-140, S1; US-062, S3).
- La lógica del gateway y sus códigos de error (L1D-103, L1D-104): aquí solo se retransmiten.
- Verificación de `Origin` en el login (la aplica L1D-197 con `verificarOrigen()` de este change,
  `[S1 resp. 14a]`) y en el logout (US-044, S2); un `middleware/origin-check` común a todos los
  Route Handlers que mutan (readme §2.3) llegará con el tercer consumidor (ver design D3).
- Cabeceras de seguridad y CSP (US-216); *rate limit* (US-056, S4: aquí solo se retransmite
  `Retry-After`).
- Streaming de progreso (TBD-08, ADR-42).
