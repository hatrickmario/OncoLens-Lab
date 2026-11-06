# Proposal — l1d-285-higiene-tests-ci

## Trazabilidad

L1D-285 · **US-213b** (AC-8…AC-13) · FEAT-PL1 (L1D-30) · Sprint 3 · Estimación **3** (US-213 = 8, partida `[S2 resp. 1]`;
US-213a, AC-1…AC-7, archivada como `2026-10-22-l1d-263-calidad-capas-umbrales`) · — (técnica, PRD §17) · NFR-13 · RN-22 ·
RN-14 (Q-1, ejemplos sintéticos) · ADR-26 (handlers desde `contracts/examples/`) · `[CLAUDE.md Política TDD]` ·
`[Pre-S1 resp. 42]` `[Pre-S1 trazabilidad M-1]` (AC-12) · `[S3 resp. 14]` (AC-13) · Q-1 de `backlog/sprints/S2-deuda.md`
(`pattern` de `fullNameMasked` y exención en la regla AC-17) · `[S3 resp. 16]` (exención solo para la máscara sintética,
fixture de `web`, casos de `enmascararNombre()`, bump *patch*, verificación de `etcdctl`)

> Fuente: `backlog/features/FEAT-PL1-plataforma-base.md` §US-213 (solo AC-8…AC-13); DoR ✓ en
> `backlog/sprints/S3-refinamiento.md` §2.

## Why

La Política TDD de `CLAUDE.md` prohíbe desactivar o enfocar tests, mockear módulos propios y dejar un AC sin test de
aceptación, pero hoy solo lo comprueban el *hook* local `pre-commit-gate.sh` (quien no usa Claude Code lo salta) y el
criterio del Gate 2. Además, el job `integration-rag` del PR #189 falló porque `quay.io` respondió `503` al descargar etcd y
el script lo reportó como un *timeout* de salud de 420 s sin haber esperado: un fallo de infraestructura disfrazado de fallo
del producto. Y el ejemplo del listado de pacientes muestra `fullNameMasked = "Prueba Sintética 1"` en lugar de las
iniciales porque la regla de ejemplos sintéticos (AC-17) solo exime a `nationalIdMasked` (Q-1).

## What Changes

- **Higiene de tests en la CI (AC-8):** `@vitest/eslint-plugin` con `no-focused-tests`, `no-disabled-tests` y `valid-title` en
  `web` y `clinical-api`; Ruff `PT` y `scripts/quality/check-pytest-hygiene.py` (regla `tests-sin-desactivar`) en
  `rag-orchestrator`; ambos escriben en `reports/quality/latest.json` y hacen fallar el job `quality`.
- **AC sin test de aceptación (AC-9):** `scripts/quality/check-ac-coverage` lee los AC de las historias con change activo
  y emite una **alerta** (no error) por cada AC sin test tagueado `[US-xxx AC-n]` o `@pytest.mark.ac("US-xxx", n)`.
- **Mocks solo en los bordes (AC-10):** regla `mock-solo-en-bordes` (`vi.mock` de rutas relativas, alias propios o
  `@prisma/client` → error) y arnés de handlers MSW construidos desde `contracts/examples/` (`packages/test-support/msw/`)
  y de `respx` (`apps/rag-orchestrator/tests/support/http.py`) que fallan si un handler declara un campo ausente del ejemplo.
- **Cobertura de líneas cambiadas (AC-11):** `vitest --coverage` (v8), `pytest-cov` y `diff-cover` contra `origin/main`;
  porcentaje por archivo cambiado en el reporte y alerta bajo `coverage.changedLinesWarn` (`quality-thresholds.json`) en las
  rutas acotadas; el job **nunca** falla por cobertura.
- **Ejemplo enmascarado del listado (AC-12 + Q-1):** `pattern` de `fullNameMasked` en `PatientListItem`
  (`apps/clinical-api/openapi.yaml`, bump *patch* de `info.version`), ejemplo `patient-page-doctor.json` con las iniciales
  (`"P. S. 1."`), fixture `apps/web/tests/support/pacientes-ui.ts` migrado a `'P. S. 2.'` y exención en
  `assertExamplesSynthetic.mjs` que **solo** acepta la máscara sintética `^P\. S\.( \d\.)?$` (`[S3 resp. 16]`). **La exención es un control de seguridad
  (RN-14): la implementa la sesión principal o el humano, no un agente implementador** (tarea marcada `[SESIÓN PRINCIPAL]`).
- **Descarga resiliente de imágenes en `integration-rag` (AC-13):** `milvus-etcd` pasa a
  `gcr.io/etcd-development/etcd:v3.5.34` (misma versión) en `infra/docker/docker-compose.yml`; `compose pull` previo a
  `up --no-build` con hasta 3 intentos y espera creciente (solo la descarga; los tests siguen sin reintentos); mensaje de
  fallo de descarga distinto del de salud; fixture hermético que lo comprueba. Se verifica antes que la imagen de gcr.io
  incluye `etcdctl`, que usa el *healthcheck* (`[S3 resp. 16]`).

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `code-quality`: se añaden los requisitos de higiene de tests, AC con test de aceptación, mocks en los bordes y cobertura de
  líneas cambiadas (ADDED).
- `api-contracts`: «Ejemplos sintéticos y no normativos» admite la máscara cerrada de `fullNameMasked` (MODIFIED); nuevo
  requisito del ejemplo enmascarado de `PatientListItem` con `pattern` en ambos campos (ADDED).
- `ci-pipeline`: nuevo requisito de descarga resiliente de imágenes en `integration-rag` (ADDED); el requisito vigente de
  `integration-rag` no cambia.

## Bounded contexts

- **clinical-platform:** raíz (`eslint.config.js`, `package.json`, `quality-thresholds.json`, `scripts/quality/**`,
  `scripts/ci/integracion-rag-orchestrator.sh`, `.github/workflows/ci.yml`, `ci/tests/**`, `infra/docker/docker-compose.yml`),
  `packages/test-support/msw/` (nuevo), `apps/clinical-api/openapi.yaml` y `contracts/examples/`, `apps/web` y
  `apps/clinical-api` (solo configuración de tests y cobertura).
- **ai-services:** `apps/rag-orchestrator/pyproject.toml` (Ruff `PT`, marcador `ac`, `pytest-cov`), `requirements-dev.txt`,
  `tests/support/http.py`.
- **frontend:** no se toca UI (solo la configuración de Vitest de `apps/web`, que es de clinical-platform, y el fixture de
  tests `apps/web/tests/support/pacientes-ui.ts`, migrado en la tarea 1.2).
- **Sesión principal / humano:** `scripts/contracts/rules/assertExamplesSynthetic.mjs` y su test (control de seguridad).

## Dependencias

- ↪ `l1d-263-calidad-capas-umbrales` (archivado): `npm run quality`, `quality:report`, `quality-thresholds.json` y el job
  `quality`; este change añade herramientas al mismo comando y al mismo reporte.
- ↪ `l1d-277-ci-integracion-servicios-reales` (archivado): job `integration-rag` y su test hermético con `docker` falso
  (`scripts/ci/__tests__/integracionRag.test.mjs`).
- ↪ `l1d-202-listado-busqueda-pacientes` (activo, In Review; código en `main`): formato de máscaras D2 y
  `enmascararNombre()`; este change solo fija el `pattern` en el contrato y el ejemplo.
- ↪ `l1d-264-verificacion-proveedor` (archivado): la respuesta del listado ya se valida contra el spec; el `pattern` nuevo
  queda cubierto por esos tests.
- 🔗 Relacionada: US-038 (PostgreSQL de test; no se duplica). Consumida por `design-principles-reviewer` y `gate-review`.
- Orden interno: la exención de la regla AC-17 (sesión principal) va **antes** del cambio del ejemplo a iniciales, o
  `contracts:check` queda en rojo.
- Conflicto de archivos con otros changes del S3: cualquiera que toque `.github/workflows/ci.yml` o `eslint.config.js`
  (ARR-09, sin change todavía); merge por oleadas.

## Fuera de alcance

*Mutation testing* (US-185). PostgreSQL de test (US-038). TDD Guard (retirado). Revisión de diseño no determinista
(`design-principles-reviewer`). ESLint base, Prettier y `ruff format` (US-215, archivada como `l1d-265`). Umbral global de
cobertura y bloqueo por cobertura (solo en refactor, DoD; no lo implementa este change). Reintentos de tests (prohibidos).
Migrar los mocks existentes que violen `mock-solo-en-bordes` más allá de dos operaciones: se registran como excepción con
caducidad y deuda (D5 de `l1d-263`). Las 16 excepciones de calidad (US-232).

## Impact

Dev-dependencies nuevas con versión exacta: `@vitest/eslint-plugin`, `@vitest/coverage-v8` (npm), `pytest-cov`,
`diff-cover` (pip, `requirements-dev.txt`); `respx==0.23.1` ya está en `requirements.txt`. El job `quality` tarda más (cobertura). Contrato:
`pattern` añadido a una propiedad de respuesta de `PatientListItem` (no incompatible para el consumidor; se confirma con
`contracts:breaking`). Compose: cambio de registro de una imagen, revisado por `privacy-guardian`.
