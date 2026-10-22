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
  **Punto de entrada para la CI:** `python -m app.evaluation.comparar_regresion --reporte <reporte.json>
  --config eval/configs/regression.yaml` (desde `apps/rag-orchestrator`; las rutas pasan absolutas). Salida 0 con
  el aviso "Sin baseline de regresión: umbral no aplicado" en stdout si no hay umbrales, o si todos se cumplen; 1 y
  una línea `regresión en <metrica>: mínimo …, actual …` por métrica en stderr; 2 entrada inválida. Formato de
  `regression.yaml`: `<metrica>_min: <0..1>` (`recall_at_10`, `mrr`, `precision_citas`, `exactitud_sin_evidencia`,
  `opciones_con_cita_y_soporte`), medidas en `metricas.completa`; una métrica `null` incumple (no es 0).
  `scripts/ci/eval-required.mjs` DEBE invocarla además de la comparación con el baseline (cableado de
  plataforma, tarea 1.x; hasta entonces el CLI existe pero la CI no lo ejecuta). El aviso es el mismo literal
  que el de `AVISO_SIN_BASELINE` del `.mjs`; el `.mjs` debe reenviar el stdout del CLI para no duplicarlo. El
  mensaje de error del CLI solo trae el tipo de la excepción: no imprimir `str(error)` ni `__cause__` (RN-14).
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
- **Comentario en el PR descartado (usuario, 2026-10-22, `[S2 resp. 19]`):** no se da `pull-requests: write` a la CI; el resumen del job y el artefacto `eval-reporte` son la salida definitiva. Antecedente:  publicar un comentario exige `pull-requests: write` en el job, y
  `ci/tests/workflow.test.mjs` prohíbe todo `permissions` a nivel de job (control de US-036 AC-1 que no se relaja
  aquí). Sustituto: la tabla con la marca validada / no validada va al **resumen del job**
  (`GITHUB_STEP_SUMMARY`) y al artefacto `eval-reporte` (`reporte.json` + `comentario.md`). Para el comentario hace
  falta una decisión del usuario: permitir un `permissions` acotado a `eval-required` en ese test (D3 de este diseño).
  Sin ID de destino todavía: el orquestador debe crear la historia o decidir.
- **Umbrales mínimos (AC-4/AC-5):** `eval-required.mjs` invoca además `python -m app.evaluation.comparar_regresion`
  (ai-services) sobre el reporte con `eval/configs/regression.yaml`; reenvía su stdout/stderr, los incluye en el
  comentario y falla el job si alguno de los dos controles falla. No imprime excepciones (RN-14). El fixture de AC-5
  usa `precision_citas_min: 0.9` (el reporte de FX-T5a-a tiene recall 1,0, no 0,5).
- **Base ilegible → se ejecuta la suite** (push a una rama nueva, historial superficial): nunca se omite por error.

## Claves nuevas para el usuario (no se tocó `.env.example`)

- `EVAL_MAX_REGRESSION` (opcional, número ≥ 0): sustituye `regresion.tolerancia_maxima`. Valor definitivo: DEC-07.
- `EVAL_PYTHON`, `EVAL_TIMEOUT_S`: ya existen (`scripts/eval/evaluate.mjs`).
- Si DEC-07 o ADR-40 añaden claves de modelo, umbral o PII, se suman a `scripts/ci/eval-trigger-paths.yaml`.

## Ronda de Gate 2 (orquestador): decisiones y deuda

- **Los mínimos aplican al reporte con adapters falsos (FX-T5a-a), no a `metas-iniciales.yaml` (modelos reales).**
  Un `<m>_min` de `regression.yaml` por encima del valor del reporte de la CI haría fallar siempre el job.
- **Entrada ilegible:** un reporte o baseline mal formado, o sin `metricas`, da código 2 con el mensaje fijo
  «eval-required — reporte o baseline ilegible»; una configuración inválida imprime solo un mensaje fijo o el nombre del
  error, nunca su contenido (RN-14). `EVAL_MAX_REGRESSION` debe ser un decimal sin signo ni notación (`/^\d+(\.\d+)?$/`).
- **Escape del resumen:** `textoSeguro` (`\r \n \` | < >`) se aplica a rutas, métricas y rótulos del comentario.
- **Commits con comportamiento rotulados `refactor`** (se anotan como pidió el Gate 2): `d434e45e` (claves del YAML,
  `violaciones*` sin tolerancia, `detectar` ya no traga errores de las reglas, offline en el job), `a0d0b572` y `df384ccc`
  (ai-services). El orden test → feat sigue la política salvo en esos.
- **Fuera de mi ámbito, devuelto a `ai-services-dev` (archivos de `apps/rag-orchestrator`, no están en los paths de
  clinical-platform):** (4) `except Exception` final en `comparar_regresion.main` con `type(error).__name__` y código 2
  (`mrr_min: 2024-13-45`, config no UTF-8, `RecursionError`) con su aceptación; (5) loader de `regression.yaml` que falle
  ante claves repetidas; renombres `AVISO_SIN_BASELINE`→`AVISO_SIN_MINIMOS`, `cargar_umbrales`→`cargar_minimos`,
  `METRICAS_CON_UMBRAL`→`METRICAS_CON_MINIMO`; ruff I001 en `comparar_regresion.py`; nota sobre los mínimos en
  `regression.yaml`; y los tests de enlace C#3 (toda ruta de `METRICAS_CON_MINIMO` existe en `ESQUEMA_SUITE` y en el
  reporte de test-fake) y C#4 (ningún `<m>_min` supera el valor del baseline), que viven mejor en Pytest junto al
  diccionario que prueban.
- **Deuda (historia propuesta, sin ID):**
  - D1 · catálogo único de métricas (clave, ruta en el reporte, etiqueta, dirección, sección) que consuman
    `metricas_planas`, `METRICAS_CON_MINIMO`, el esquema del informe y `comparar-baseline.mjs` (hoy cuatro sitios; los
    nombres difieren: `fidelidad_proxy` frente a `opciones_con_cita_y_soporte`, `sin_evidencia` frente a
    `exactitud_sin_evidencia`).
  - D2 · dueño de la regresión y de la tolerancia (golden file de 235a frente a `EVAL_MAX_REGRESSION`); lo cierra DEC-07.
    Mover `regresion:` (`tolerancia_maxima`) fuera de `eval-trigger-paths.yaml` entra aquí.
  - Preguntas: disparador para `app/domain/relevance.py` (`supera_umbral`) y para `config/pii-formats.json` /
    desidentificación; `SECCION_DEL_UMBRAL` = `completa` frente a `revisada`; pregunta abierta 3 del ADR-41.

## Métricas de L1D-235b en el comparador

- `terminos_prohibidos.salida_mostrada`, `inyeccion.efectivas` y `privacidad.llamadas_nube_datos_reales` se tratan como
  `violaciones*`: menos es mejor y cualquier aumento es regresión, sin tolerancia. `terminos_prohibidos.propuesta_cruda`
  es informativa (se muestra, nunca es regresión). `n`, `casos`, `afirmaciones` y `soportadas` son conteos sin
  dirección y no entran en la comparación.
- El comparador lee todo lo que cuelgue de `metricas` del reporte, así que vigila `privacidad.llamadas_nube_datos_reales`
  solo si 235b lo coloca bajo `metricas`; si lo deja en otro bloque de la raíz, queda fuera (deuda de D1, sin ID; revisar
  al mergear 235b). La lista sigue siendo por nombre: D1 (catálogo único con la dirección de cada métrica) la sustituye.
