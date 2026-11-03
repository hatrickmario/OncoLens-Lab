# Proposal — l1d-248-g-demo-verificacion

## Trazabilidad

L1D-248 · US-142 · FEAT-T5b (L1D-47) · Sprint 5 (cierre, oleada O4) · Estimación **5** · FR-20 · G-1, G-2, G-5, G-14 ·
AC-T5.1, AC-T5.3 · M-10.1, M-10.2, M-02.3 (solo si FEAT-02c se construyó), M-06.2 · VM-1, VM-2, VM-3, VM-4, VM-5 ·
RN-13, RN-14, RN-22 · PRD §13 (E2E), §14 G-Demo (redefinido por B-02, R-14 y E-17) · US-142 AC-1…AC-7 · Fuente:
`backlog/features/FEAT-T5b-ampliacion-evaluacion.md` §US-142; sprint: `backlog/sprints/S5-refinamiento.md` §2 (O4) y
**D-5** `[S5 resp. 4]` `[S5 resp. 5]`.

Decisiones que se respetan (no se reabren):

- **D-5 (usuario, 2026-11-03)**: AC-1 recorre login → listado → ficha (con una **corrección** de biomarcador) → **vista de
  caso mínima** con timeline y datos críticos → **registro a mano** de un faltante → análisis con hasta 3 opciones →
  **2 preguntas de seguimiento** con citas; **sin feedback** (FEAT-T5c pasa al S6). AC-2: las metas iniciales de
  `CLAUDE.md` son el escenario de DEC-07 (que pasa al S6), con US-140 como suite de opciones; las métricas no medidas se
  declaran. AC-5: el reporte de feedback de US-139 y DEC-14 figuran como «se miden en el piloto».
- **E-17 (PRD)**: G-Demo = «caso registrado y editado a mano → faltantes → análisis con debate»; el OCR es Post-MVP.
- **D-1 / D-8**: vista de caso mínima (US-088 + US-090), serie en tabla, sin enlace a documento.
- **D-12 `[S5 resp. 7]`**: PR individual (toca el registro del gate y la verificación de RN-13).
- «Lo que no se reabre» (`S5-refinamiento.md` §3): D-01, RN-23, RN-24, ADR-47 / DEC-11, ADR-40.

## Por qué

El PRD §14 exige cerrar el S5 con **G-Demo**: la hipótesis del MVP («caso registrado y editado a mano → faltantes →
análisis con debate») recorrida de punta a punta con datos sintéticos, las métricas técnicas en meta y un registro que
pueda revisar el product owner. Cada historia del S5 tiene su propio test; ninguna prueba el recorrido completo ni junta
las evidencias (E2E, suites, solo sintético, excepciones declaradas, p95) en un documento con resultado y commit. Sin
este change, el S6 (G-Piloto) arrancaría sin la línea base que lo precede.

## Qué cambia

- **E2E `apps/web/e2e/g-demo.spec.ts`** (Playwright contra Compose con seed sintético): un único recorrido del doctor
  sobre el paciente del gate (design D1): login → listado → ficha → **corrección** de un biomarcador con su histórico
  (`l1d-309`) → «Ver caso clínico» → vista de caso con **timeline** y columna **Datos críticos** (`l1d-76`, `l1d-96`) →
  **registro a mano** de un faltante crítico desde su acción (`l1d-91`/`l1d-90`), que deja de figurar como faltante →
  análisis (aviso de faltantes no bloqueante, `l1d-196`) con **≤ 3 opciones** ordenadas por aplicabilidad, cada una con
  citas, resumen de aplicabilidad, avisos y el criterio de orden visible → **Base del análisis** (lista los faltantes como
  desconocido) → **2 preguntas de
  seguimiento** respondidas con citas (`l1d-269`/`l1d-268`). Aserciones **estructurales** (conteos, presencia de citas,
  orden respecto de los resúmenes, avisos RN-19), no de texto generado, para que el mismo spec valga con el LLM
  **fingido** (CI) y con el **real** (demo). Sin feedback 1–5 (D-5).
- **`scripts/verify-g-demo`** (entrada) + `scripts/gates/g-demo/` (módulos `.mjs` con la lógica de decisión): junta
  (1) el resultado del E2E, (2) el reporte de la suite completa de `evaluate` con `eval/configs/s5.yaml` (`--suite all`,
  valor por defecto del runner; el `--all` de la historia es ese valor), (3) la comprobación de **solo sintético**
  (RN-13), (4) las **excepciones declaradas** y las capacidades diferidas, (5) la **validación clínica** declarada como
  «se mide en el piloto», (6) el **p95** de `POST /platform/evidence-analyses` frente a la meta de G-5, y escribe el
  registro. Sale con código ≠ 0 si el gate no se supera.
- **Registro `docs/gates/G-Demo-<fecha>.md`**: resultado («G-Demo superado» / «G-Demo no superado» con la lista de lo que
  falla), modo (fingido / real), commit, `catalogVersion`, `corpusRelease`, modelos (de ADR-39 en configuración),
  métricas con su meta y su origen (validado / no validado, AC-T5.3), métricas no medidas declaradas, excepciones, p95,
  dueño (usuario, PO) y fecha. Plantilla versionada en `docs/gates/plantilla-G-Demo.md`.
- **Excepciones y diferidas en datos, no en código**: `docs/gates/g-demo-excepciones.json` (ID, Feature, sprint de
  destino, motivo), que lee el script y vuelca el registro.
- **CI**: el `g-demo.spec.ts` corre en el workflow `e2e` existente (modo fingido) como regresión del recorrido; los tests
  de los módulos de `scripts/gates/` corren con Vitest en la CI raíz. El registro **real** se produce a mano en la
  máquina de referencia el día de la Demo 5 (`docs/demo/runbook-demo-S5.md`, sección G-Demo).
- **Contratos:** sin cambios en `openapi.yaml` ni en `contracts/examples/` (el modo fingido usa los ejemplos que añaden
  `l1d-268`, `l1d-269`, `l1d-310` y `l1d-246`).

## Capacidades

### Nuevas

- `demo-gate`: verificación y registro de G-Demo (recorrido E2E de la hipótesis, métricas en meta, solo sintético,
  excepciones declaradas, validación clínica declarada, p95 informativo, registro). **Justificación:** ninguna capacidad
  de `openspec/config.yaml` cubre un gate de producto: `real-data-gate` es el bloqueo de arranque con datos reales
  (G-Piloto, US-143) y `ai-evaluation` mide la IA, no decide un gate ni verifica el recorrido de la UI. G-Piloto
  (US-143) podrá reutilizar la misma estructura de registro sin mezclarse con `real-data-gate`.

### Modificadas

Ninguna (el change ensambla lo que entregan otros changes; no cambia su comportamiento).

## Bounded contexts

- **frontend**: `apps/web/e2e/g-demo.spec.ts` y su soporte (`apps/web/e2e/soporte.ts`, solo helpers nuevos).
- **clinical-platform**: `scripts/verify-g-demo`, `scripts/gates/g-demo/*.mjs` (verificación de solo sintético contra la
  BD y la configuración de Compose, ensamblado del registro), `docs/gates/`.
- **ai-services**: lectura del reporte de `evaluate` con `s5.yaml` y del p95 (sin cambio de modelo, prompt, umbral,
  catálogo ni corpus); la corrida real la hace `ai-eval-runner`.

## Dependencias

Todas del S5 (oleadas O1–O3); el E2E y el registro real necesitan su merge en `main`:

- ⛔ **`l1d-74-vista-caso-timeline`** (US-088) y **`l1d-76-vista-caso-pagina`** (US-090): `GET …/case` y la página
  `/pacientes/[id]/caso` con timeline.
- ⛔ **`l1d-96-datos-criticos-vista-caso`** (US-004): columna «Datos críticos» con acción manual por faltante (D-7).
- ⛔ **`l1d-91-formularios-registro-manual`** (US-111) y **`l1d-90-registro-manual-biomarcador-diagnostico`** (US-110):
  registro a mano del faltante. ↪ `l1d-84-normalizacion-final-manual` (US-098) y, si el faltante del paciente del gate es
  un atributo o un tratamiento, `l1d-80-tratamientos-atributos-manuales` (US-094).
- ⛔ **`l1d-309-correccion-con-historico`** (US-253): corrección de biomarcador con histórico en la ficha.
- ⛔ **`l1d-268-seguimiento-analisis`** (US-218) y **`l1d-269-hilo-seguimiento-ui`** (US-219): las 2 preguntas de
  seguimiento con citas (l1d-269 delega explícitamente este E2E a US-142).
- ⛔ **`l1d-246-suite-hasta-3-opciones`** (US-140): suite `opciones` y `eval/configs/s5.yaml` con las metas iniciales
  (M-10.1, M-10.2, orden RN-28).
- ⛔ **`l1d-310-pacientes-momentos-enfermedad`** (US-254): pacientes sintéticos y guía de la Demo 5 con la pregunta
  sugerida y los conteos del modo fingido; el paciente del gate sale de ahí o del seed existente (design D1).
- ⛔ **`l1d-119-corpus-ampliado-calibracion`** (US-120): corpus ampliado, `corpusRelease`, umbrales fijados y baseline
  por tipo con el p95 (mediana de 3 corridas), que alimentan AC-2 y AC-7 en modo real.
- ↪ `l1d-196-avisos-no-bloquean` (US-071, «Continuar con aviso»), `l1d-195-analisis-sin-escrituras` (US-070),
  `l1d-305-rn23-voz-propia-nivel-b` (US-249, G-14), `l1d-306-pregunta-nfc` (US-250), `l1d-113-faltantes-desconocido-prompt`
  (US-116). Ninguno bloquea el arranque; el recorrido real los ejerce.
- ↪ `arr-11-ci-rapida` (ARR-11): el workflow `e2e` lee el detector de cambios; este change no lo modifica.
- ↪ En `main`: sesión y login (`l1d-197`), listado (`l1d-202`), ficha (`l1d-72`), panel de hasta 3 opciones y Base del
  análisis (S4), `scripts/e2e/ejecutar.sh`, `scripts/demo/levantar.sh` y su verificación sin superusuario (L1D-297).
- ⛔ **DEC-07** (S6): escenario más probable = metas iniciales de `CLAUDE.md` (`metas-iniciales.yaml`), D-5.
- 🔗 Regresión [RN-13] → US-143 (G-Piloto, S6): el bloqueo de arranque con datos reales no es de este change.
- 🔗 Integra US-141 (`si-hay-capacidad`, no comprometida en el S5): su medición de p95 es AC-7 y se toma del baseline de
  `l1d-119` (ver design D5).

## Fuera de alcance

- **Feedback 1–5** (US-137…US-139, FEAT-T5c → S6, D-5): el paso final de AC-1 de la historia no se recorre; queda
  «Regresión [FR-20 feedback] activa desde S6».
- Medir VM-1…VM-6 con casos reales (FEAT-T5d, S6); VM-1/VM-2 con el sistema, VM-4/VM-5 y DEC-14 (VM-3) se declaran «se
  miden en el piloto».
- Bloqueos por opt-out (US-148, S6) y auditoría completa (AC-T1.5): excepciones declaradas de G-Piloto (R-14); el `403`
  por opt-out queda como «Regresión [RN-15] activa desde S6 (DEC-22)» (`[S5 resp. 8]`).
- El gate de arranque con datos reales (US-143, `real-data-gate`) y `oncolens preflight real-data`.
- Recalibrar metas (DEC-07, S6) o el p95 (US-141/ADR-42): el p95 fuera de meta se anota como insumo, sin bloquear.
- OCR, ingesta de documentos, visor y enlace al PDF (Post-MVP, E-17, D-8).

## Impact

- Nuevos: `apps/web/e2e/g-demo.spec.ts`; `scripts/verify-g-demo`; `scripts/gates/g-demo/*.mjs` y
  `scripts/gates/__tests__/`; `docs/gates/plantilla-G-Demo.md`, `docs/gates/g-demo-excepciones.json`,
  `docs/gates/README.md`; sección G-Demo en `docs/demo/runbook-demo-S5.md` (o el runbook de la demo vigente).
- Modificados: `apps/web/e2e/soporte.ts` (helpers del recorrido, sin cambiar los existentes) y
  `apps/clinical-api/prisma/seed/contar.ts` (clave aditiva de conteo por `data_origin`, design D4).
- Sin migración, sin cambio de API, sin dependencias nuevas, sin cambio de modelo, prompt, umbral, catálogo ni corpus
  (no dispara `eval-required`).
