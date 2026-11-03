# Proposal — arr-11-ci-rapida

## Trazabilidad

ARR-11 · S5 · D-11, D-12 `[S5 resp. 6]` `[S5 resp. 7]` · D5-02 · US-036 (CI) · US-074 (eval-required) · US-213 AC-11

> Tarjeta de arrastre del S5 (5 pts, oleada O1, **primera tarea del sprint**), sin issue de Linear (como ARR-09). Fuentes:
> `backlog/sprints/S5-refinamiento.md` §3 **D-11** y **D-12** (diagnóstico de la CI de `main` 41581630153 y de los últimos
> 40 PR mergeados) y `backlog/sprints/S5-deuda.md` **D5-02** (Retro S4, M3). No es una historia de `backlog/features/`: no
> tiene AC numerados; los escenarios se derivan de los puntos 1–5 de D-12, de la decisión de D-11 y de D5-02, y se
> etiquetan `[D-12.n]`, `[D-11]` y `[D5-02]`.

## Why

Un PR tarda ~22 min en la CI. El camino crítico es `build-test` (15 m 25 s) → `quality` (5 m 05 s, con `needs: build-test`),
y **16 de 40 PR (40 %) solo tocan `backlog/`, `docs/`, `openspec/` o `*.md`** pero pagan la CI completa, porque `ci-ok`
(`scripts/ci/verificar-needs.mjs`) trata `skipped` como fallo. Además, en el PR #288 `eval-required` falló con
`No space left on device`: `torch==2.14.1` de PyPI para Linux arrastra ~4 GB de CUDA en un runner sin GPU, aunque solo lo
importa la exportación puntual a ONNX (`app/evaluation/exportar_onnx.py`). Y en el S4 los ejemplos de #276 quedaron fuera de
contrato frente a `main` (`optionsNotShown`, `queryRewrite`, requeridos desde #271 y #274) sin que la CI del PR lo viera.
El S5 abre ~25 PR: acelerar la CI primero abarata todo el sprint (D-12, `[S5 resp. 7]`).

## What Changes

- **Detector de cambios (D-12.1):** job `cambios` con `scripts/ci/detectar-cambios.mjs` y su configuración
  `scripts/ci/cambios-paths.yaml` (RN-22). Un PR que solo toca documentación (`backlog/`, `docs/`, `openspec/`, `*.md`,
  salvo los documentos que el código lee y los disparadores de `eval-required`) solo corre `secret-scan`, `data-scan`,
  `lint-lenguaje` y `higiene-proceso`. Los demás jobs se omiten con `if:` y el detector publica la lista de **omitibles**.
- **`ci-ok` acepta `skipped` solo si el detector lo declaró (D-12.1):** `verificar-needs.mjs` lee la salida de `cambios` del
  propio `needs`; cualquier otro `skipped`, `cancelled` o `failure` sigue siendo fallo, y un `cambios` fallido deja `ci-ok`
  en rojo (falla cerrado).
- **E2E lee el mismo detector (D-12.1):** `.github/workflows/e2e.yml` gana un job `cambios` y el job `e2e` se omite en los PR
  de documentación.
- **`build-test` partido (D-12.2):** `build-test-node` (build, test de build de `web`, tests de los workspaces, Vitest raíz,
  catálogo, `test:secrets`) y `build-test-rag` (`pip`, Pytest con cobertura, verificación del proveedor), en paralelo; ambos
  en los `needs` de `ci-ok`.
- **`quality` en paralelo (D-12.3):** `quality` pierde `needs: build-test`; la cobertura de líneas cambiadas de Python
  (US-213 AC-11) pasa a un job corto `cobertura-rag` (`needs: build-test-rag`) que consume el `coverage.xml` publicado por
  `build-test-rag` con la **misma** función de `scripts/quality/cobertura.mjs`.
- **Cachés (D-12.4):** `node_modules` (raíz, `apps/*` y `packages/*`) con clave del hash de `package-lock.json`, `.nvmrc` y
  el sistema; entorno virtual de Python con clave de `.python-version` y los `requirements*.txt` que instala la CI.
- **Títulos de lote (D-12.5):** `higiene-proceso` acepta varios `[L1D-nn]` en el título (`[L1D-1][L1D-2] …`,
  `[L1D-1] [L1D-2] …` y `[L1D-1, L1D-2] …`) y comprueba el `tasks.md` de cada historia.
- **D-11 (`[S5 resp. 6]`):** `torch` y `transformers` pasan de `requirements-eval.txt` a
  `apps/rag-orchestrator/requirements-export.txt` (nuevo, solo instalación manual para exportar modelos); se actualizan
  `adr39-medicion.Dockerfile`, `docs/demo/runbook-demo-S1.md`, `scripts/demo/exportar-modelos.py` (docstring),
  `docs/process/ci.md`, `tests/unit/test_dependencias_de_inferencia.py`, `ci/tests/workflow.test.mjs` y
  `scripts/ci/auditar-dependencias.sh` (`pip-audit --no-deps` también sobre el fichero nuevo).
- **D5-02:** paso del job `contracts` que, en un PR que toca `contracts/examples/**` o un `apps/*/openapi.yaml`, fusiona la
  punta **actual** de `origin/main` y ejecuta `contracts:check` sobre el resultado.
- Documentación: `docs/process/ci.md` (tabla de jobs, detector, cachés, partición, cómo añadir un job omitible).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `ci-pipeline`: requisitos nuevos (ADDED) del detector de cambios, el agregador con omitibles declarados, la partición de
  `build-test`, `quality` en paralelo con la cobertura de Python, cachés, títulos de lote, dependencias de exportación fuera
  de la CI y `contracts:check` contra `main` fusionado. El requisito «El agregador ci-ok solo queda en verde si todos los
  jobs pasan» vive aún en el change activo `l1d-166-ci-build-contracts-scan` (no está en `openspec/specs/`), así que no se
  puede usar MODIFIED: se añade «ci-ok acepta omitidos solo si el detector los declaró» y se anota el conflicto para el
  archivado (ver Dependencias).

## Bounded contexts

- **plataforma (CI)** — `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `scripts/ci/`, `ci/tests/`,
  `docs/process/ci.md`; lo implementa `clinical-platform-dev`.
- **ai-services (solo manifiestos de dependencias)** — `apps/rag-orchestrator/requirements-eval.txt`,
  `requirements-export.txt`, `eval/configs/adr39-medicion.Dockerfile`, `tests/unit/test_dependencias_de_inferencia.py`
  (D-11). Es configuración de dependencias sin lógica; va en la misma sección de tareas para que un solo PR deje la CI
  verde sin las ruedas CUDA.

## Dependencias

- ↪ `l1d-166-ci-build-contracts-scan` (activo, 24/25): define el `ci-ok` estricto y el `workflow.test.mjs`. Al archivar,
  el requisito «El agregador ci-ok solo queda en verde si todos los jobs pasan» y su escenario deben conciliarse con el de
  este change (los omitidos **declarados** por `cambios` dejan de contar como fallo). Lo resuelve ARR-10 al archivar.
- ↪ `l1d-285-higiene-tests-ci` (activo, 24/26): define la cobertura de líneas cambiadas (US-213 AC-11) en `quality`.
- **ARR-10 (Decidido, usuario, 2026-11-03, `[S5 resp. 14]`):** D-11 y D5-02 los implementa **este** change; ARR-10 queda
  solo con la conciliación con `l1d-166` y el archivado, sin repetirlos. Puntos sin cambio (ARR-10 sigue en 2).
- Sin dependencias de contrato, esquema ni datos.

## Fuera de alcance

- `pytest -n auto`, `eval-required` que decide antes del `pip install` y el pre-vuelo local `scripts/ci/preflight-local.sh`
  (D-12, «Fuera de ARR-11»).
- Runners de pago, mover integración o E2E solo al push de `main`, bajar la cobertura o desactivar suites (descartadas en D-12).
- Cambiar la protección de `main`: `ci-ok` sigue siendo el **único** check requerido; no se activa «Require branches to be
  up to date» (ver Pendientes en design).
- Hacer requerido el workflow E2E (sigue fuera de `ci-ok`, criterio de estabilidad de L1D-278).
- La regla de agrupación de PR del orquestador (D-12, «Agrupación de PR»): es proceso de `/sprint-start` y del
  `sprint-orchestrator`, no CI.
