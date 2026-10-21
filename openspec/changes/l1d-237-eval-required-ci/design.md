# Design — l1d-237-eval-required-ci

## Context

`.github/workflows/ci.yml` ya instala `requirements-eval.txt` y corre `dataset-class-check`; falta
detección de disparadores y publicación del reporte. `npm run evaluate` lo crea
`l1d-235-suite-evaluate` (072a). ADR-41 (propuesto) fija: en CI, configuración de prueba sin modelos
pesados ni red; el reporte real se adjunta desde la máquina de referencia.

## Goals / Non-Goals

**Goals:** detección por rutas y claves, ejecución, artefacto + comentario, comparador de regresión.
**Non-Goals:** umbrales reales, modelos reales en CI.

## Decisions

- **D1 · Detección en un script propio** (`scripts/ci/eval-trigger.mjs`) que lee
  `ci/eval-trigger-paths.yaml` y el diff (`git diff --name-only` + diff de líneas para las claves de
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

- **Crea:** `ci/eval-trigger-paths.yaml`, `scripts/ci/eval-trigger.mjs` (función pura
  `tocaDisparador(diff, reglas)`), `eval/configs/regression.yaml` (vacío),
  `comparar_con_regresion()`.
- **Modifica:** `.github/workflows/ci.yml` (job `eval-required`).

## Risks / Trade-offs

- La CI no mide modelos reales → el reporte real se adjunta a mano (ADR-41 AC-5).
- Comentario en PR de forks sin permisos → solo artefacto (repo de un equipo).

## Open Questions

Ninguna propia; depende de P-3 (ADR-41).
