# Design — l1d-237-eval-required-ci

## Context

`.github/workflows/ci.yml` ya instala `requirements-eval.txt` y corre `dataset-class-check`; falta
detección de disparadores y publicación del reporte. `npm run evaluate` lo crea
`l1d-235-suite-evaluate` (072a). ADR-41 (encuadre decidido, `[S2 resp. 3]`) fija: en CI, configuración de prueba sin modelos
pesados ni red; el reporte real se adjunta desde la máquina de referencia.

## Goals / Non-Goals

**Goals:** detección por rutas y claves, ejecución, artefacto + comentario, comparador de regresión.
**Non-Goals:** umbrales reales, modelos reales en CI.

## Decisions

- **D1 · Detección en un script propio** (`scripts/ci/eval-trigger.mjs`) que lee
  `scripts/ci/eval-trigger-paths.yaml` y el diff (`git diff --name-only` + diff de líneas para las claves de
  `.env.example`), en lugar de `paths:` del workflow: los `paths:` no detectan claves dentro de un
  archivo y dejan el *check* requerido en "pendiente". El job siempre corre y decide.
  Descartada en una línea: acción de terceros de filtros de rutas (dependencia extra, mismas
  limitaciones con claves).
- **D2 · Comparador** `comparar_con_regresion()` en `app/evaluation/` (Python, junto al reporte);
  sale con código ≠ 0 y lista de métricas.
- **D3 · Comentario** con `gh pr comment --edit-last` (un comentario por PR, actualizado), permisos
  mínimos `pull-requests: write` solo en ese job; acciones fijadas por SHA como el resto del
  workflow.

## Privacidad y ownership

El reporte es solo agregados y configuración (US-072 AC-5); la configuración de CI usa FX-T5a-a
sintética, sin red (RN-12). Ningún secreto nuevo; `GITHUB_TOKEN` con permisos mínimos.

## Contratos

Sin cambios de `openapi.yaml` ni de `contracts/examples/`.

## Evaluación

No cambia modelo, prompt, umbral, catálogo ni corpus: hace obligatoria la suite OL-06 en los PR que
sí lo hacen.

## Dependencias y colaboradores

- **Crea:** `scripts/ci/eval-trigger-paths.yaml`, `scripts/ci/eval-trigger.mjs` (función pura
  `tocaDisparador(diff, reglas)`), `eval/configs/regression.yaml` (vacío),
  `comparar_con_regresion()`.
- **Modifica:** `.github/workflows/ci.yml` (job `eval-required`).

## Risks / Trade-offs

- La CI no mide modelos reales → el reporte real se adjunta a mano (ADR-41 AC-5).
- Comentario en PR de forks sin permisos → solo artefacto (repo de un equipo).

## Open Questions

Ninguna propia; depende de P-3 (ADR-41).

## Desviaciones de la implementación de `clinical-platform` (CI)

- **Ubicación de las reglas:** `scripts/ci/eval-trigger-paths.yaml` (no `ci/`), por los paths permitidos del
  implementador; es un archivo de datos que cualquiera puede mover después.
- **Baseline de la CI (pregunta abierta 2 del ADR-41, cerrada):** `eval-required` compara contra
  `data/evaluation/baseline.json`, que `l1d-235` generó con **esta misma** configuración (`test-fake.yaml`, adapters
  falsos); la salida de `evaluate` es idéntica byte a byte, así que sin cambios la comparación es «igual». La
  comparación (`scripts/eval/comparar-baseline.mjs`) recorre las métricas numéricas del baseline (ignora `n`,
  `*_ic95` y `validacion`; en `violaciones*` menos es mejor) con la tolerancia `EVAL_MAX_REGRESSION` o, si no está,
  `regresion.tolerancia_maxima` del YAML (0: la suite es determinista). Una métrica ausente o `null` frente a un
  baseline numérico es regresión. Es **independiente** del comparador por umbrales mínimos de `regression.yaml`.
- **Comentario en el PR diferido:** publicar un comentario exige `pull-requests: write` en el job, y
  `ci/tests/workflow.test.mjs` prohíbe todo `permissions` a nivel de job (control de US-036 AC-1 que no se relaja
  aquí). Sustituto: la tabla con la marca validada / no validada va al **resumen del job**
  (`GITHUB_STEP_SUMMARY`) y al artefacto `eval-reporte` (`reporte.json` + `comentario.md`). Para el comentario hace
  falta una decisión del usuario: permitir un `permissions` acotado a `eval-required` en ese test (D3 de este diseño).
  Sin ID de destino todavía: el orquestador debe crear la historia o decidir.
- **Pendiente para `ai-services` (sección 2):** AC-4 y AC-5 por umbrales mínimos de `eval/configs/regression.yaml` y
  `comparar_con_regresion()` (Python). Cuando existan, `eval-required.mjs` debe invocarlos además de la comparación con
  el baseline; el aviso «Sin baseline de regresión: umbral no aplicado» ya se imprime hoy cuando falta
  `data/evaluation/baseline.json`.
- **Base ilegible → se ejecuta la suite** (push a una rama nueva, historial superficial): nunca se omite por error.

## Claves nuevas para el usuario (no se tocó `.env.example`)

- `EVAL_MAX_REGRESSION` (opcional, número ≥ 0): sustituye `regresion.tolerancia_maxima`. Valor definitivo: DEC-07.
- `EVAL_PYTHON`, `EVAL_TIMEOUT_S`: ya existen (`scripts/eval/evaluate.mjs`).
- Si DEC-07 o ADR-40 añaden claves de modelo, umbral o PII, se suman a `scripts/ci/eval-trigger-paths.yaml`.
