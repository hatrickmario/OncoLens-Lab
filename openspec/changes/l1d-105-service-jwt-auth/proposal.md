# Proposal — l1d-105-service-jwt-auth

## Trazabilidad

L1D-105 · US-054 · FEAT-06a (L1D-16, sub-Feature 06a-B1 Gateway) · Sprint 1 · Estimación **5** (antes 3, `[S1 resp. 13]`) ·
— (técnica, PRD §17) · SEG-07 (dueña) · AC-T4.1 (PRD §11 #7) · OL-02, OL-03 · readme §2.5
("Credencial de servicio"), §6.1 #7 (algoritmo asimétrico fijado en el validador) · CLAUDE.md
("La sesión del doctor nunca llega a Backend 2") · ADR-26 (contrato estable: sin cambio de spec) ·
Nota del Gate 1 de US-033 (2026-10-11): `401` `TOKEN_SERVICIO_INVALIDO` ya congelado en el contrato ·
`[S1 resp. 3]` (supuestos "(asumido)" aceptados: AC-5) · `[S1 resp. 13]` (cliente HTTP generado, AC-6 nuevo) ·
`[S1 resp. 17]` (nombres canónicos de `rag-orchestrator`) · US-054 AC-1…AC-6

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC
> se aceptan. En esta historia afecta a AC-5 (vida máxima del JWT: un `exp` a 1 hora, mayor que
> `SERVICE_JWT_TTL_SECONDS`, se rechaza con `401`).

> **Decidido (usuario, 2026-10-14, Gate 1, `[S1 resp. 13]`):** el cliente HTTP generado se adelanta
> al S1 en esta historia, que pasa de **3 a 5 puntos** (el sprint queda en 98; el Markdown del
> backlog lo actualiza la sesión principal). Hey-api con `fetch` inyectable, para
> `web → clinical-api` y `clinical-api → rag-orchestrator`, dentro de `contracts:generate:check`
> (en `packages/api-contracts`, nunca editado a mano). El cliente de rag se construye sobre
> `createRagOrchestratorFetch()`; el servicio pasa `X-Request-Deadline` como parámetro tipado de la
> operación (el transporte no lo calcula). L1D-103, L1D-104, L1D-139 y L1D-197 usan solo esos
> clientes. Nuevo **US-054 AC-6**.

> **Decidido (`[S1 resp. 17]`):** nombres canónicos en `rag-orchestrator` — `app/api/rag_query.py`,
> `app/config/settings.py`, `app/bootstrap.py` y `EvidenceQueryPort`; `app/application/ports.py` lo
> crea L1D-164.

## Why

`rag-orchestrator` es el límite de seguridad del sistema: no accede a datos clínicos y solo debe
aceptar llamadas de `clinical-api`. Sin una credencial de servicio propia, cualquier contenedor de
`ai-net` podría invocar al LLM, y la tentación de reenviar la cookie del doctor mezclaría la sesión
con la credencial interna. Esta historia fija la credencial: un JWT de servicio firmado con la
clave privada ES256 que solo tiene `clinical-api`, validado en `rag-orchestrator` con la clave
pública y el algoritmo fijado (readme §6.1 #7), de vida corta y sin relación alguna con la sesión
(SEG-07).

## What Changes

- **`clinical-api` (firmador):** `src/infrastructure/service-jwt.ts` firma un JWT por request con
  la clave privada ES256 montada solo en `clinical-api` (secreto de L1D-165), `iss = clinical-api`,
  `aud = rag-orchestrator`, `iat` y `exp = iat + SERVICE_JWT_TTL_SECONDS`, sin identidad del doctor
  ni del paciente. Reloj inyectado.
- **`clinical-api` (transporte saliente):** `src/infrastructure/rag-orchestrator.http.ts` es el
  `fetch` con el que se construye el cliente generado de `packages/api-contracts` hacia
  `rag-orchestrator`: añade `Authorization: Bearer <jwt>` y, por construcción, no recibe ni reenvía
  cabeceras del request entrante (sin `Cookie`).
- **`rag-orchestrator` (validador):** dependencia de FastAPI aplicada al router de los endpoints
  internos (todos salvo `GET /health`, que es `security: []` desde L1D-164). Valida firma con la
  clave pública, algoritmo fijado `ES256` (rechaza `none`, `HS256` y cualquier otro), `iss`, `aud`,
  `exp`, `iat` obligatorio y vida máxima `SERVICE_JWT_TTL_SECONDS` con tolerancia
  `SERVICE_JWT_CLOCK_SKEW_SECONDS`. Cualquier fallo → `401` `ErrorTokenServicioInvalido` (mensaje
  fijo, sin eco), antes de validar el cuerpo y sin invocar al LLM. Ignora cookies; nunca registra
  `Authorization` ni `Cookie`.
- **Configuración:** `SERVICE_JWT_TTL_SECONDS` (propuesta 60), `SERVICE_JWT_CLOCK_SKEW_SECONDS`
  (propuesta 5), `SERVICE_JWT_PRIVATE_KEY_FILE` (solo `clinical-api`) y `SERVICE_JWT_PUBLIC_KEY_FILE`
  (solo `rag-orchestrator`) en `.env.example`; ambos servicios fallan al arrancar sin su clave.
- **Contrato:** sin cambios. El `401` y su ejemplo `rag-token-servicio-invalido.json` ya están en
  `apps/rag-orchestrator/openapi.yaml` (congelado en US-033); `info.version` no se toca.

- **Cliente HTTP generado (AC-6, `[S1 resp. 13]`):** `contracts:generate` añade los plugins
  `@hey-api/client-fetch` y `@hey-api/sdk` (incluidos en `@hey-api/openapi-ts`, cuya versión exacta
  se fija) y escribe en `packages/api-contracts/src/client/<spec>/`
  un SDK por proveedor (`clinical-api` para `web`, `rag-orchestrator` para `clinical-api`) cuyo
  cliente recibe `baseUrl` y `fetch` inyectados; `contracts:generate:check` vigila esa ruta.
  `clinical-api` expone `createRagOrchestratorClient()`, que instancia el SDK de rag con
  `createRagOrchestratorFetch()`; `X-Request-Deadline` es parámetro tipado de `ragQuery` (lo calcula
  el servicio llamador, L1D-103). El `fetch` de `web` (cookie hacia `clinical-api`) lo inyectan
  L1D-139/L1D-197.
- **Tests de L1D-164 adaptados al JWT:** los Pytest de `/rag/query` del modo `fake` y el paso AC-6
  del smoke de Compose pasan a enviar un JWT válido (`tests/support/service_jwt.py`; en el smoke,
  la llamada sale de `clinical-api` firmada con la clave de L1D-165).

## Capabilities

### New Capabilities

- `service-auth`: autenticación servicio a servicio entre `clinical-api` y `rag-orchestrator`
  (firma, validación, vida máxima, separación de la sesión). **Justificación:** `auth-session`
  (de `openspec/config.yaml`) describe la sesión del doctor (cookie opaca, `Session`, TTL, CSRF,
  US-211); mezclar ahí la credencial interna contradiría el invariante "sesión ≠ JWT de servicio"
  que esta capacidad protege. Ninguna otra capacidad listada cubre la frontera interna.

### Modified Capabilities

- `api-contracts`: se **añade** el requisito "Clientes HTTP generados con fetch inyectable"
  (US-054 AC-6, `[S1 resp. 13]`); los specs OpenAPI no cambian (el `401` ya existe). Los requisitos de `evidence-analysis`
  (L1D-106) y de `platform-stack` (L1D-164) no se modifican: solo se monta la dependencia en el
  router que ellos crean.

## Bounded contexts

- **ai-services:** dependencia de FastAPI, verificador del JWT, carga de la clave pública,
  higiene de logs de cabeceras, tests Pytest + `TestClient`.
- **clinical-platform:** firmador del JWT, transporte saliente hacia `rag-orchestrator`, carga de
  la clave privada, claves en `.env.example`, test Vitest + MSW de cabeceras salientes,
  `createRagOrchestratorClient()` sobre el SDK generado.
- **contratos (herramienta):** generación del SDK con hey-api en `scripts/contracts/generate.mjs` y
  su vigilancia en `contracts:generate:check`.
- **frontend:** no se toca.

## Dependencias

- ↪ **Depende de** el change de **L1D-165** (US-035): genera el par ES256 y el reparto de secretos
  (privada solo en `clinical-api`, pública solo en `rag-orchestrator`). Los tests no lo esperan:
  generan un par efímero en memoria; los nombres de archivo siguen L1D-164 D4
  (`jwt_service_private.pem`, `jwt_service_public.pem`) y, si L1D-165 fija otros, manda L1D-165.
- ↪ **Depende de** el change de **L1D-164** (US-034): esqueletos de ambas apps, router delgado de
  `/rag/query` (D6) y `GET /health` público. Este change añade la dependencia JWT a ese router
  para los dos enlaces (`fake` y real).
- 🔗 **Consumido por** el change de **L1D-106** (US-055): sus tests usan "JWT de servicio de test"
  y su router queda detrás de esta dependencia; aquí se publica el *helper* de tests
  (`tests/support/service_jwt.py`) que construye tokens válidos.
- 🔗 **Consumido por** los changes de **L1D-103**, **L1D-104**, **L1D-139** y **L1D-197**: usan solo
  los clientes generados de este change (`[S1 resp. 13]`).
- 🔗 **Consumido por** el change de **L1D-103** (US-052): el cliente tipado hacia
  `rag-orchestrator` MUST ser `createRagOrchestratorClient()` (sobre `createRagOrchestratorFetch()`); su test de
  integración del gateway re-afirma AC-4 a nivel de `POST /platform/evidence-analyses`.
  Coordinación de oleada: L1D-105 antes que L1D-103 y L1D-106.
- ⛔ Ninguno bloqueante.

## Fuera de alcance

- Generación de claves, rotación y reparto de secretos en Compose (L1D-165, US-035).
- Sesión del doctor, cookie `oncolens_session`, CSRF/`Origin` (US-211 y FEAT de acceso).
- Mapeo en `clinical-api` de un `401` de `rag-orchestrator` a un error del gateway (L1D-103/L1D-104).
- mTLS, rotación de claves con `kid`/JWKS y lista de revocación (`jti`): descartados en readme
  §6.1 #7 para el MVP local.
- Logs JSON y propagación de `traceId` completa (US-037, S2): aquí solo se garantiza que las
  cabeceras sensibles no se registren.
- Cambios en `openapi.yaml` (ninguno).
- El `fetch` de `web` hacia `clinical-api` (reenvío de la cookie, `Origin`): L1D-139/L1D-197.
