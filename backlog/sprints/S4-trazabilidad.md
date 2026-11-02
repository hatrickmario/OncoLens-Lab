# S4 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close S4` · 2026-11-02 · rama `sprint/S4-close` sobre `main` db43e9ea, con los 15 changes archivados el 2026-11-02 (`openspec/changes/archive/2026-11-02-*`) y sus deltas fusionados en `openspec/specs/`. `openspec validate --specs --strict`: 25/25. Capability nueva en la spec principal: `demo-install`.
> Insumos: [`S4-plan.md`](S4-plan.md), [`S4-status.md`](S4-status.md) (el «Registro» y el «Orden de merge»; la tabla superior está desactualizada), [`S4-deuda.md`](S4-deuda.md), [`S4-refinamiento.md`](S4-refinamiento.md), `docs/process/definition-of-done.md` («Historia cerrada»), `backlog/features/*.md`, `docs/PRD.md` v1.4 §17–§18, PR #243…#281 y Linear (OncoLens-1).
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md) con el mismo método que en el S3: los conteos se pueden comparar.
> Las decisiones ya tomadas no cuentan como huecos nuevos: los traslados con ID de destino D4-xx registrados en los `tasks.md` y en `S4-deuda.md`, y las decisiones D-a…D-d, Q1 y Q2 de `S4-plan.md`.

## 1. Resumen del sprint

**Criterio de Done.** Se aplica la «Historia cerrada» de la DoD: los AC verificados, CI en verde (0 fallos, 0 pendientes, 0 alertas del sprint), PR mergeado, `tasks.md` conciliado (`[x]` con evidencia o con su ID destino) y change archivado.
- La CI de `main` está en verde en db43e9ea: `CI`, `E2E` y `Push on main` del 2026-11-01.
- Las 2 alertas abiertas de *code scanning* (#1 y #12) son anteriores al sprint y ya están registradas en D4-23.

**Cierre:** 15 de las 20 tarjetas del plan cerradas (**75 %**, meta ≥ 80 %), 58 de 73 puntos (79 %). Las 5 que no cierran:
- L1D-298 y L1D-299: movidas al S5.
- L1D-300 y L1D-245: solo falta la verificación empírica de un AC.
- L1D-125: falta la firma de DEC-11.

D4-18 y D4-19 (3 pts de bugs y deuda contados en el sprint) se entregaron en #263 y #269. Si el usuario aprueba D4-30 y D4-21 como destino de los AC empíricos (o enmienda esos AC), L1D-300 y L1D-245 pasan a Done y el cierre sube a 17/20 (85 %).

### Cadena por historia

| L1D | US | Change | AC (esc. / test) | FR · RN · AC/M del PRD | PR | Linear (antes → después) |
|---|---|---|---|---|---|---|
| L1D-291 | US-241 | `2026-11-02-l1d-291-poblacion-lista-contrato-migracion` (16/16) | 6/6 · 5/6 (AC-1 por `contracts:check`/oasdiff) | FR-25 · RN-06, RN-22, RN-25 · AC-08.9, AC-T4.4 | #245 | Done → Done |
| L1D-109 | US-112 | `2026-11-02-l1d-109-busqueda-hibrida-retrieval-mode` (14/14) | 6/6 · 6/6 | FR-09 · RN-02, RN-03, RN-05, RN-22 · AC-06.1 | #243, #246 | Done → Done |
| L1D-95 | US-003 | `2026-11-02-l1d-95-completeness-endpoint-ficha` (20/20) | 6/6 · 6/6 | FR-01, FR-15, FR-16, FR-18, FR-23 · RN-15 · AC-04.1, AC-T1.1, M-02.4 | #244 | Done → Done |
| L1D-292 | US-242 | `2026-11-02-l1d-292-poblacion-abanico-ingesta` (19/19) | 8/8 (+AC-9) · 8/8 (+AC-9) | FR-19 · RN-01, RN-04, RN-21, RN-22, RN-25, RN-27 · TBD-20 | #252, #253 | Done → Done |
| L1D-293 | US-243 | `2026-11-02-l1d-293-estado-criterio-lista-poblacion` (14/14) | 8/8 · 8/8 | FR-25 · RN-02, RN-22, RN-27, RN-28 · AC-08.1, AC-08.2, AC-08.9 | #250 | Done → Done |
| L1D-294 | US-244 | `2026-11-02-l1d-294-respaldo-poblacion-consulta` (12/12) | 7/7 · 7/7 | FR-25 · RN-01, RN-06, RN-14, RN-22, RN-26 · AC-08.3 | #257 | Done → Done |
| L1D-295 | US-245 | `2026-11-02-l1d-295-afirmaciones-atomicas-por-papel` (16/16) | 8/8 · 8/8 | FR-10 · RN-01, RN-04, RN-23, RN-24 · AC-10.4, AC-T1.2 | #264, #268 | Done → Done |
| L1D-144 | US-134 | `2026-11-02-l1d-144-hasta-3-opciones-orden-aplicabilidad` (10/12, D4-39) | 8/8 · 7/8 (AC-2 dentro del test de AC-1) | FR-09 · RN-01, RN-03, RN-06, RN-15, RN-22, RN-28 · AC-10.1, AC-08.8 | #271, #275 | In Review → **Done** |
| L1D-300 | US-238 | `2026-11-02-l1d-300-reescritura-consulta-segundo-loop` (19/23, D4-30) | 9/9 · 8/9 (**AC-9 sin verificar**) | FR-09 · RN-02, RN-03, RN-10, RN-11, RN-12, RN-22 · AC-06.1 | #274 → #279, #278, #280 | Done → **In Review** |
| L1D-296 | US-246 | `2026-11-02-l1d-296-motivo-descarte-separado` (8/9, D4-22/24) | 5/5 · 5/5 | FR-10 · RN-19, RN-23 · AC-10.4 | #267 | Done → Done |
| L1D-97 | US-005 | `2026-11-02-l1d-97-aviso-faltantes-panel` (19/19) | 7/7 · 7/7 | FR-23 · RN-23, RN-26 · AC-04.2 | #255, #256, #258 | Done → Done |
| L1D-131 | US-126 | `2026-11-02-l1d-131-tabla-aplicabilidad-fuente` (11/13, D4-35) | 9/10 (AC-7 sin escenario propio) · 10/10 | FR-25 · RN-23, RN-26, RN-28 · AC-08.1, 08.2, 08.4, 08.5, 08.6, 08.8, AC-10.1, 10.2 | #260 | Done → Done |
| L1D-245 | US-133 | `2026-11-02-l1d-245-hibrida-vs-dense-misma-corrida` (10/15, D4-21/D4-40) | 5/5 · 5/5 con adapters falsos (**AC-1 real sin ejecutar**) | FR-20 · M-06.1 | #261 | Done → **In Review** |
| L1D-297 | US-247 | `2026-11-02-l1d-297-demo-datos-levantar-verificacion` (11/17, D4-35) | 8/8 · 6/8 (AC-4 guía y AC-5 ejecución real, sin tag) | FR-19, FR-25 · RN-13, RN-14, RN-21, RN-25 | #276, #275, #280 | In Review → **Done** |
| L1D-145 | US-135 | `2026-11-02-l1d-145-panel-hasta-3-opciones` (8/10, D4-37) | 7/7 · 7/7 (Vitest; E2E en D4-37) | FR-09 · RN-03, RN-19, RN-23, RN-28 · AC-10.1, AC-10.2 | #272 → #279, #280 | Done → Done |
| L1D-298 | US-233a | `l1d-298-evaluate-modelos-locales` **activo** (14/19) | escenarios solo en el delta · 5/7 (AC-1 y AC-2 sin tag; **AC-2 y AC-7 no cumplidos**) | FR-20 · TBD-02 · M-07.2, M-10.1 | #251, #253 | Done → **In Progress** |
| L1D-299 | US-233b | `l1d-299-poblacion-dorado-suite` **activo** (13/21) | escenarios solo en el delta · 7/8 (+AC-9; AC-1 sin tag) | FR-20, FR-25 · TBD-02, TBD-20 · M-08.3, M-08.4, AC-T5.4 | #273 (parcial) | In Review → **In Progress** |
| L1D-290 | US-240 | sin change (*spike*; informe `reports/spikes/s4-capacidad-paralelismo.md`) | — (exento) | RN-13, RN-14, RN-22 | #249 | Done → Done |
| L1D-302 | US-117b | `2026-10-30-us-117b-versionado-sparse-semilla` | 2/2 (archivado en #248) | FR-19 · RN-05 · AC-06.1 | #248 | Done → Done |
| L1D-125 | US-021 · DEC-11 | sin change (firma de oncólogos) | — | FR-25 · VM-3, VM-4 | — | Backlog → Backlog |

Fuera de las 20 tarjetas, corregido en Linear:
- **L1D-305** (US-249, S5): Done → Backlog. La automatización la cerró con el PR documental #266.
- **L1D-117** (US-118) y **L1D-244** (US-132), arrastres del S3: Done → In Review. Sus changes siguen activos y no se archivaron en este cierre.

**PR sin change (válidos):**
- Docs y ajustes: #247 (ADR-48 / US-248), #248, #254, #258, #262, #266, #270, #277, #280 y #281.
- Entorno: #246, #253, #265 y #278.
- Bug D4-17: #259.
- Bug D4-18: #263.
- Deuda D4-19: #269.

No hay change archivado sin PR ni PR de historia sin change.

## 2. Cobertura por familia (cierre del S3 → cierre del S4)

| Familia | Universo | Con spec S3 → S4 | Solo en changes sin archivar S3 → S4 | Con test S3 → S4 |
|---|---|---|---|---|
| FR | 31 | 18 → 19 | 1 → 0 | 17 → 17 |
| RN | 30 | 26 → 26 | 0 → 0 | 26 → 26 |
| NFR | 14 | 9 → 9 | 0 → 0 | 9 → 9 |
| SEG | 13 | 10 → 10 | 0 → 0 | 10 → 10 |
| IA | 11 | 5 → 7 | 0 → 0 | 5 → 7 |
| CAP | 11 | 0 → 0 | 0 → 0 | 0 → 0 |
| T | 5 | 0 → 0 | 0 → 0 | 0 → 0 |
| AC | 54 | 27 → 27 | 1 → 1 | 27 → 27 |
| ACT | 23 | 17 → 17 | 1 → 1 | 18 → 18 |
| ACP | 2 | 0 → 0 | 0 → 0 | 0 → 0 |
| M | 36 | 14 → 14 | 2 → 2 | 13 → 13 |
| HU | 26 | 8 → 9 | 1 → 1 | 8 → 9 |
| OL | 6 | 6 → 6 | 0 → 0 | 6 → 6 |
| TBD | 21 | 6 → 7 | 2 → 1 | 7 → 7 |
| VM | 6 | 2 → 3 | 0 → 0 | 2 → 3 |
| G | 16 | 5 → 5 | 0 → 0 | 5 → 5 |

Todas las familias tienen historia para cada ID (TBD-05 es una exclusión).

El S4 profundiza IDs que ya estaban cubiertos más que abrir nuevos:
- FR-25: 82 → 89 escenarios en `api-contracts` y 26 → 45 en `applicability`.
- RN-28: 113 tests.
- FR-19: 25 → 46 escenarios en `corpus-ingestion`, más 9 en `demo-install`.

En la columna Historias, las filas de los IDs que no cita ninguna historia nueva coinciden con las de la matriz del S3: el método es el mismo, ahora también con los rangos escritos con «–».

**RN citadas por las historias del S4:** todas tienen ≥ 1 test que las verifica. La única cita sin spec ni test es FR-30 en US-238, una mención de no-alcance (el agente acotado), no un compromiso.

**Regresiones activas:** ninguna `🔗 Regresión … (activa desde S4)`. Las activas desde S1/S2 (RN-10 → US-046, US-217) ya se verificaron en cierres anteriores.

## 3. Huecos priorizados

**Bloqueantes** (propuestas de historia o tarea para el S5; no se crean issues):

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| B1 | **US-233a AC-2 y AC-7 no cumplidos** (juez A+B con el generador real; RSS en régimen estable) y change `l1d-298` sin archivar. | `ai-eval-runner` / usuario | AC-2 ya va a US-249 (L1D-305) y AC-7 a D4-35 (L1D-297 2.8). Hace falta **enmendar US-233a en FEAT-T5a** para quitar o trasladar formalmente esos AC, y archivar `l1d-298` al inicio del S5. Sin la enmienda, la historia no puede cerrarse. |
| B2 | **US-233b entrega parcial:** el dataset `poblacion-dorado/` (1.2), `dataset_poblacion.py` (1.11), la plantilla humana (1.1) y `evaluate --suite poblacion` con el proveedor local (2.1) siguen abiertos y **sin ID destino**. Las 4.3…4.5 van al S5 sin historia. | `ai-services-dev` + humano | Continuar L1D-299 en el S5 como primera historia de evaluación (precede al G-Demo, porque mide US-242/243/244). Escribir el ID destino en los `tasks.md` (D4-13, D4-07, D4-05 → L1D-299 S5). |
| B3 | **US-133 AC-1 (corrida real A0/A2/A2b) sin ejecutar.** La pregunta de la historia sigue abierta y la demo queda en `dense`. | `ai-eval-runner` | *Spike* D4-21 al inicio del S5 (`corpus.yaml` y `preguntas.yaml` de `adr39-mini`, preinscripción ADR-45 P1, `RETRIEVAL_REGRESSION_TOLERANCE`). Con su reporte, L1D-245 pasa a Done. |
| B4 | **US-238 AC-9 (medición del segundo loop con el LLM local) sin verificar**, y D4-30 solo «Propuesto». | usuario + `ai-eval-runner` | Aprobar D4-30 y correr el brazo «reescritura» del runner de variantes. Hasta entonces, `QUERY_REWRITE_ENABLED=false`. |
| B5 | **DEC-11 (L1D-125) sin firma.** Los estados F-20…F-24 de 291/293/297/131/144 se apoyan en supuestos `(asumido)`. | oncólogos | Sesión de firma antes del G-Demo. Si cambia alguna regla, abrir un change de ajuste sobre `applicability`. |

**Mayores** (trazabilidad documental):

| # | Hueco | Propuesta |
|---|---|---|
| M1 | US-126 AC-7: el Markdown pide el literal «Ordenadas por coincidencia con la población estudiada, no por eficacia». El código usa `evidence.orderCriterion.applicability` (design D9, unificación del Gate 1) y el test `[US-126 AC-7]` comprueba que el literal antiguo **no** aparece. El AC no tiene escenario propio. | Enmendar el AC-7 en FEAT-08b con el literal vigente y citar el escenario de US-062 AC-7 / l1d-145. |
| M2 | **Test sin AC de origen:** `[US-242 AC-9]` (filtro RN-23 sobre `studyPopulationValues[].value`) y `[US-233b AC-9]` (recolector de `evaluate`) tienen escenario y test, pero no existen en `backlog/features` (US-242 y US-233b llegan al AC-8). Vienen de la decisión del usuario del 2026-10-30. | Añadir los AC-9 a FEAT-06c y FEAT-T5a (Markdown primero; después el espejo en Linear). |
| M3 | Arrastres del S3 **L1D-117 (US-118)** y **L1D-244 (US-132)**: estaban en Done con el change activo. `l1d-117` debía archivarse antes que `l1d-292`, pero `l1d-292` se archivó y `l1d-117` no. La revisión humana de la muestra (AC-5 y AC-4) sigue pendiente. | Archivar `l1d-117` y `l1d-244` al inicio del S5 (sus tareas ya tienen destino en US-233a/b) y atar la revisión humana a L1D-299. |
| M4 | D4-16 sin aplicar: `openspec/specs/evidence-analysis-gateway/spec.md:349` cita `modules/patients/estados-de-revision.ts` (ahora `modules/compartido/`). | Corregirlo en el commit de cierre de `/sprint-close` (la tarea asignada a ese paso). |
| M5 | Las historias nuevas del S4 en Linear (L1D-290…300) no tienen Feature padre (`parentId` nulo). Por eso las Features 08b, 06c, T1a, T5a, 10a, 06b y 04 no reflejan su avance. | El humano enlaza los padres según `backlog/features` (este auditor solo cambia estados). |

**Menores:**
- m1 · US-241 AC-1: no hay test con `[US-241 AC-1]`; lo cubren `contracts:check` y `oasdiff`. Etiquetar un caso de `contracts:breaking`.
- m2 · US-134 AC-2: está verificado dentro del test de AC-1, sin `@pytest.mark.ac("US-134", 2)`.
- m3 · US-247 AC-4 (guía) y AC-5 (`levantar.sh` con metadatos y *sparse*): la evidencia es documental y de ejecución, sin tag.
- m4 · US-233a AC-1 y US-233b AC-1: no tienen test con tag.
- m5 · US-248 (L1D-304) es `si-hay-capacidad` y está en Linear, pero no figura en `V2-Post-MVP.md`. Es nueva (2026-10-30) y nadie la retiró. Decidir si se registra allí o si se queda en Linear por su ADR-48 (#247).
- m6 · D4-23 (alertas de *code scanning* #1 y #12) y D4-24, D4-25…D4-40 siguen «Propuesto». Su aprobación es del usuario.

## 4. Cambios en Linear (2026-11-02)

Antes de cada cambio se comprobó el estado actual. Solo se cambió el estado y se añadieron comentarios: no se creó, borró ni cambió estimación o milestone de ningún issue.

| Issue | Antes | Después | Motivo |
|---|---|---|---|
| L1D-144 | In Review | **Done** | Cadena completa; 3.3 y 4.1 con destino D4-39. |
| L1D-297 | In Review | **Done** | Cadena completa; pendientes con destino D4-35. |
| L1D-300 | Done | **In Review** | AC-9 sin verificar; D4-30 propuesto. |
| L1D-245 | Done | **In Review** | AC-1 sin corrida real; D4-21. |
| L1D-298 | Done | **In Progress** | AC-2 y AC-7 no cumplidos; change activo. |
| L1D-299 | In Review | **In Progress** | Entrega parcial; tareas sin ID destino. |
| L1D-305 | Done | **Backlog** | Cerrada por error con el PR #266 (docs); es del S5. |
| L1D-117 | Done | **In Review** | Change `l1d-117` activo, sin archivar. |
| L1D-244 | Done | **In Review** | Change `l1d-244` activo, sin archivar. |

**Done confirmados, con comentario:** L1D-291, 109, 95, 292, 293, 294, 295, 97, 296, 131 y 145.

**Sin cambio de estado:**
- L1D-125: Backlog, con comentario.
- L1D-290 y L1D-302: Done.

Ninguna Feature pasa a Done: FEAT-10c (L1D-25) tiene 144 y 145 en Done, pero conserva US-218/219 en el S5. El milestone Sprint 4 sigue abierto.
