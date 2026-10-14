# Proposal — l1d-166-ci-build-contracts-scan

## Trazabilidad

L1D-166 · US-036 · FEAT-PL1 (L1D-30) · Sprint 1 · Estimación **5** · — (técnica, PRD §17) ·
RN-14 (dueña: FEAT-PL1), RN-13 (AC-5), RN-22 (formatos de PII en configuración), NFR-13, SEG-12 ·
OL-06 (datasets sintéticos) · readme §2.6 (contract testing), §6.0 (Definition of Done) ·
`[US-033 AC-16]` · Pre-S1 trazabilidad M-2 · Pre-S1 cierre P-6, P-8 · `[S1 resp. 3]` ·
US-036 AC-1…AC-7

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC
> se aceptan (AC-5: mensaje "dataset sin clase de datos `sintetico`" para un dataset de evaluación
> sin marca; AC-6: la protección de rama de `main` impide mergear con la CI en rojo). Fuente:
> `backlog/features/FEAT-PL1-plataforma-base.md` §US-036 y `backlog/sprints/S1-refinamiento.md` §1
> (fila de las 13 historias con supuestos) y §3 resp. 3.

## Why

El repositorio es público (RN-14) y los contratos están congelados desde el Pre-S1 (US-033): hoy
nada impide que un PR con una clave privada, un dato con forma de PII, un dataset sin clase de
datos o un cambio incompatible de un `openapi.yaml` llegue a `main`. La Definition of Done
(readme §6.0, `docs/process/definition-of-done.md`) exige `contracts:check`,
`contracts:generate:check`, tests en verde y "sin datos reales ni secretos", pero sin CI eso
depende de la disciplina de cada PR. Además, los changes del S1 (L1D-164 smoke y tests estáticos,
L1D-165 test de shell, L1D-193 `lint:lenguaje`, L1D-265 lint) necesitan un *workflow* común donde
colgar sus jobs.

## What Changes

- **`.github/workflows/ci.yml`** en `pull_request` y `push` a `main`, `permissions: contents: read`,
  acciones fijadas por SHA, sin secretos del repositorio. Jobs (design.md D1):
  - `build-test`: `npm ci`, build y tests de `web` y `clinical-api` (workspaces de L1D-164),
    `rag-orchestrator` (Pytest, con Node disponible en el mismo job: el *helper* de validación de
    respuestas de L1D-164 ejecuta `node scripts/contracts/bundle-json.mjs`), `vitest` raíz de
    `scripts/contracts`, `test:infra` y `test:secrets` (L1D-165).
  - `contracts`: `contracts:check`, venv con `scripts/contracts/requirements-codegen.txt` y
    `contracts:generate:check`, y comparación de incompatibilidades de ambos specs contra la base
    del PR con `oasdiff breaking --fail-on ERR` (AC-2, AC-7): solo los cambios de nivel `ERR`
    rompen; el aviso `response-body-wrapped-in-one-of-original-preserved` de los `oneOf` aditivos
    del S1 (L1D-106, L1D-180, L1D-203) se imprime y no rompe (design.md D3, ADR-26).
  - `secret-scan`: gitleaks con versión fija y `.gitleaks.toml` (AC-3).
  - `data-scan`: escáner de PII sobre **todo lo que lista `git ls-files`** (no solo `data/`:
    también `contracts/examples/`, los fixtures de `apps/*/test*`, `eval/`, `reports/` y `docs/`),
    con exclusiones explícitas y justificadas en `config/pii-scan.json`, los formatos de
    `config/pii-formats.json` y una allowlist de fixtures con PII sintética marcados
    `clase: sintetico` (p. ej. FX-T4a-a); y verificación de clase de datos de los datasets de
    evaluación (AC-4, AC-5). Ampliación decidida en el Gate 1 (2026-10-14).
  - `stack-smoke`: `npm run smoke:compose` de L1D-164 con `LLM_PROVIDER=fake` y secretos ficticios.
  - `ci-ok`: agregador `needs:` de todos los jobs; es el único *required status check* (AC-6).
- **Escáneres propios** en `scripts/ci/`: `pii-scan.mjs`, `dataset-class-check.mjs` y
  `contracts-breaking.sh` (*wrapper* de `oasdiff` sobre los specs empaquetados; lo sustituirá
  `contracts:breaking` de US-214).
- **Configuración** (RN-22): `config/pii-formats.json` (formatos de documento de identidad,
  teléfono y correo sin asumir país, con los dominios de correo reservados de RFC 2606/6761 exentos;
  **fuente única** de formatos de PII, que L1D-203 reutiliza para enmascarar en ejecución),
  `config/pii-scan.json` (raíz `git ls-files` + exclusiones solo de una lista cerrada: lockfiles y
  binarios), `config/pii-allowlist.json` (entradas por fixture y valor: `clase: sintetico`, globs de
  ruta acotados y `sha256` del valor normalizado, sin PII en claro), `config/dataset-roots.json`
  (`data/eval/`, `data/evaluation/`) y `.gitleaks.toml`.
- **Fixtures de PR** en `ci/tests/` y *workflow* `ci-selftest.yml`: cada AC es un caso que, sobre un
  clon local temporal, aplica un cambio sintético (clave PEM y token generados en tiempo de
  ejecución, PII sintética, dataset sin marca, campo `citedSources` eliminado) y comprueba que el
  job correspondiente falla con el mensaje y el archivo esperados, o pasa en el caso limpio.
- **Higiene del entorno de tests (AC-7, P-6, P-8):** `vitest.config.ts` raíz que excluye
  `.claude/**` y `**/node_modules/**`; versiones exactas en `.mcp.json`; test que prohíbe listas
  literales de nombres de identidad o rutas en `scripts/contracts/rules/`.
- **Protección de rama (AC-6):** `scripts/ci/check-branch-protection.sh` (solo lectura, `gh api`)
  que verifica que `main` exige `ci-ok` y PR; la configuración la aplica el humano administrador.
- **Docs:** `docs/process/ci.md` (jobs, cómo añadir uno, cómo correr los fixtures, allowlist) y una
  línea en `docs/process/definition-of-done.md` que remite a la CI.

## Capabilities

### New Capabilities

- `ci-pipeline` **(capacidad nueva; justificación):** ninguna de las capacidades de
  `openspec/config.yaml` cubre la puerta de calidad del repositorio. `platform-stack` (de
  `l1d-164-compose-stack`) describe la topología de ejecución; `api-contracts` describe los specs y
  su generación, y su requisito "Generación reproducible desde los specs" deja `contracts:breaking`
  a US-214, así que no se modifica. Los controles de un PR (build, contratos, secretos, PII, clase
  de datos, rama protegida) son un comportamiento propio y verificable que crecerá con US-213,
  US-214, US-215, US-217 y US-068; por eso viven en una capacidad aparte.

### Modified Capabilities

Ninguna. No se tocan `api-contracts` ni `data-model`; los deltas `platform-stack` y
`platform-observability` de L1D-164 y L1D-165 tampoco: este change solo **ejecuta** sus tests.

## Bounded contexts

- **clinical-platform:** `.github/workflows/`, `scripts/ci/`, `ci/tests/`, `config/`,
  `.gitleaks.toml`, `vitest.config.ts` raíz, `.mcp.json`, test de `scripts/contracts/rules/`, docs.
- **ai-services:** sin código; la CI instala `apps/rag-orchestrator/requirements.txt` y corre Pytest.
- **frontend:** sin código; la CI ejecuta el build y los tests de `apps/web`.

## Dependencias

- ↪ **Depende de** `archive/2026-10-13-l1d-55-contract-schema-freeze` (US-033, archivado):
  `contracts:check`, `contracts:generate:check`, `requirements-codegen.txt`, `lib/bundle.mjs`.
- ↪ **Depende de** `l1d-164-compose-stack` (L1D-164, US-034): `workspaces` y scripts `test:infra`
  y `smoke:compose`, esqueletos de las tres apps, modo `LLM_PROVIDER=fake`. Si no está mergeado,
  `build-test` y `stack-smoke` se implementan detrás de la existencia de los workspaces (design.md
  D1) y se activan cuando llegue.
- ↪ **Depende de** `l1d-165-secrets-setup-scripts` (L1D-165, US-035): `npm run test:secrets` debe
  correr en la CI (lo pide su tarea 4.3) y `scripts/smoke/lib/fake-secrets.sh`.
- ↪ **Depende (solo AC-2, mitad del build) de** `l1d-103-gateway-contexto-clinico` /
  `l1d-104-persistencia-analisis-fallos` (L1D-103/L1D-104): el fixture exige que `clinical-api`
  compile contra `EvidenceOption.citedSources` del tipo generado de `rag-orchestrator`.
- 🔗 **Consumido por** `l1d-193-terminos-prohibidos-rn23` (L1D-193, US-068: job `lint:lenguaje` y
  patrón de fixtures de PR) y por el change de **L1D-265** (US-215: job de lint). Cada uno añade su
  job a `ci.yml` y al `needs:` de `ci-ok` (design.md D1, punto de extensión).
- 🔗 Relacionadas: US-042 (estándares no permitidos), US-074 (suite `evaluate` en la DoD).

## Fuera de alcance

- Suite `evaluate` en PRs de modelo, prompt, umbral, catálogo o corpus: US-074.
- Umbrales de tamaño y complejidad, reglas de capas e higiene TDD (US-213, S2); `contracts:breaking`
  como script npm, `contracts:verify-provider` y clientes HTTP generados (US-214, S2); auditoría de
  dependencias y Dependabot (US-217, S2); lint y formato (US-215, L1D-265); *mutation testing* (S6).
- E2E Playwright en la CI: llegan con sus historias de UI; el *workflow* deja el punto de extensión.
- El detector de PII de ejecución de Backend 1 (ADR-40, US-049): este change solo fija el formato
  del archivo de formatos que ese detector debería reutilizar.
