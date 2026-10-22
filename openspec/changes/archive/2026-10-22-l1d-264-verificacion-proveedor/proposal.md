# Proposal — l1d-264-verificacion-proveedor

## Trazabilidad

L1D-264 · US-214 · FEAT-PL1 (L1D-30) · Sprint 2 (desde S1, `[Pre-S1 resp. 9]`) · Estimación **3** ·
— (técnica, PRD §17) · NFR-13 · RN-02 (AC-2) · ADR-26 (AC-2, AC-5) · B-10 (AC-3) · readme §2.6,
§4.1, §4.2 · `[Pre-S1 resp. 20]` · `[Pre-S1 resp. 33]` · `[S1 resp. 13]` · `[S1 resp. 17]` ·
Pre-S1 trazabilidad M-1 · US-214 AC-1…AC-6

> **Decidido (usuario, 2026-10-11, Gate 1 de US-033, `[Pre-S1 resp. 20]`):** `contracts:generate` y
> `git diff --exit-code` pasaron a US-033; esta historia conserva `contracts:verify-provider`,
> `contracts:breaking` (AC-5) y la ampliación del AC-4 a la CI.
> **Decidido (usuario, 2026-10-14, `[S1 resp. 13]`):** los clientes HTTP generados (hey-api, `fetch`
> inyectable) pasaron a US-054 AC-6 (S1); aquí solo se verifica que los consumidores los usan.
> Fuente: `backlog/features/FEAT-PL1-plataforma-base.md` §US-214; DoR ✓ en
> `backlog/sprints/S2-refinamiento.md` §2.

## Why

Los specs están congelados desde el Pre-S1 y la CI ya detecta lo generado desactualizado y los
cambios incompatibles (L1D-166), pero la verificación del proveedor es opcional: cada test de
integración decide si llama a `assertMatchesSpec` (el *helper* provisional de `[S1 resp. 17]`) y
`rag-orchestrator` solo valida algunos cuerpos con `tests/support/contract.py`. Una respuesta fuera
de contrato (`topRelevanceScore: 0.0` en `sin_evidencia`, un campo no declarado, un error sin el
schema de error) puede pasar los tests y romper al consumidor. Además, el Zod generado no traduce
`if/then`, `anyOf` ni `allOf` con `unevaluatedProperties: false`, así que un consumidor que valida
con Zod acepta lo que el spec rechaza.

## What Changes

- **`npm run contracts:verify-provider`** (raíz): ejecuta las suites de integración de
  `clinical-api` (Supertest) y de `rag-orchestrator` (`TestClient`) con la verificación
  **automática** de cada respuesta (status declarado, cabeceras declaradas y cuerpo) contra el
  `openapi.yaml` de su servicio; un status o un cuerpo no declarado hace fallar el test nombrando
  ruta, código y ruta JSON del campo (AC-1…AC-3).
- **Verificación automática, no opt-in:** un *hook* del cliente de test (un `agent` de Supertest
  envuelto en `tests/support/` de `clinical-api`; un `event_hook` de respuesta del `TestClient` en
  `rag-orchestrator`) resuelve la operación del spec por método y ruta y valida con el mismo
  validador de `scripts/contracts` (Ajv2020, la configuración de `contracts:check`). El *helper*
  `assertMatchesSpec` queda como utilidad interna del *hook* (design.md D1).
- **`npm run contracts:breaking`**: alias de raíz de `scripts/ci/contracts-breaking.sh` (L1D-166)
  contra `origin/main`, con las excepciones declaradas de ADR-26 (AC-5).
- **Brechas del Zod generado (AC-6):** `contracts:generate` emite, junto al Zod estricto, los
  refinamientos generados de los `if/then`, `anyOf` y `allOf` con `unevaluatedProperties: false`
  conocidos (`sin_evidencia` ⇒ `topRelevanceScore: null`, `CitedSource`, `FollowUpCitedSource`) y
  falla cerrado si aparece una construcción que no sabe traducir (design.md D3).
- **Consumidores solo con clientes generados:** un check estático en `contracts:check` rechaza
  `fetch`/`axios` directos hacia `clinical-api` o `rag-orchestrator` fuera de los clientes generados.
- **CI:** `contracts:verify-provider` corre en cada PR (design.md D2) y queda en `ci-ok`.
- **ADR corto** en `docs/architecture/adr/` (número siguiente libre) con la decisión provider-driven sin
  Pact (Contexto técnico de la historia).

## Capabilities

### New Capabilities
- Ninguna.

### Modified Capabilities
- `api-contracts`: se modifica «Generación reproducible desde los specs» (incorpora
  `contracts:breaking`, `contracts:verify-provider` y los refinamientos del Zod) y se añaden la
  verificación automática del proveedor, los errores como contrato y el uso exclusivo de clientes
  generados.

## Bounded contexts

- **clinical-platform:** `scripts/contracts/`, `package.json` raíz, `apps/clinical-api/tests/support/`,
  `.github/workflows/ci.yml`.
- **ai-services:** `apps/rag-orchestrator/tests/support/contract.py` y `conftest.py`.
- **frontend:** ninguno (los tests de `apps/web/tests/api` siguen usando el *helper*; ver Fuera de alcance).

## Dependencias

- ↪ `l1d-273-bundle-redocly` (recomendado antes): cambia el empaquetado que usa el validador; hacerlo
  primero evita migrar dos veces el *helper* a la API asíncrona.
- ↪ `l1d-277-ci-integracion-servicios-reales`: la verificación del proveedor de `clinical-api` necesita
  el PostgreSQL de test en la CI (job `integration`); la de `rag-orchestrator` corre sin servicios
  reales (adapters falsos), salvo los tests `servicios_reales` que añade ARR-01.
- ↪ `l1d-166-ci-build-contracts-scan` (S1, activo): `contracts-breaking.sh`, excepciones de ADR-26 y
  `contracts:generate:check` ya existen; esta historia los reutiliza.

## Fuera de alcance

Pact o contratos dirigidos por el consumidor; fuzzing (`schemathesis`) o carga; versionado por URL.
La validación de las respuestas del BFF (`apps/web/app/api`) contra el spec de `clinical-api` no se
automatiza aquí (sigue el *helper* en sus tests). Generar clientes HTTP (US-054 AC-6, hecho en S1).

## Impact

`scripts/contracts/**`, `package.json` raíz, `apps/clinical-api/tests/support/**` y los tests de
integración que hoy llaman a `assertMatchesSpec` (pasan a la verificación automática sin cambiar
aserciones), `apps/rag-orchestrator/tests/support/contract.py`, `conftest.py`, `ci.yml`,
`packages/api-contracts/src/zod/**` (generado), `docs/architecture/adr/`.
