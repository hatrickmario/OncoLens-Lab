# S5 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close S5` · 2026-11-04 · rama `sprint/S5-close` sobre `main` 4cedab28, con los 16 changes archivados el 2026-11-04 (`openspec/changes/archive/2026-11-04-*`, sin commit todavía) y sus deltas fusionados en `openspec/specs/`.
> - `openspec validate --specs --strict`: 28/28.
> - `openspec validate --changes --strict`: 14/14.
> - Capabilities nuevas: `case-timeline`, `manual-clinical-entry` y `terminology-reconciliation`.
>
> Insumos: [`S5-plan.md`](S5-plan.md), `S5-status.md` (local, ignorado por git), [`S5-deuda.md`](S5-deuda.md), [`S5-refinamiento.md`](S5-refinamiento.md), `docs/process/definition-of-done.md` («Historia cerrada»), `backlog/features/*.md`, `docs/PRD.md` v1.4 §17–§18, los PR #288…#334, *code scanning* y Linear (OncoLens-1).
>
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md) con el mismo método que en el S4, así que los conteos se pueden comparar.
>
> Las decisiones ya tomadas no cuentan como huecos nuevos: los traslados con ID destino (D5-xx, H-n, ADR-40), D-4 (US-098 AC-1 y AC-6 a Post-MVP), DEC-22 (el 403 por opt-out pasa al S6) y las decisiones del humano registradas en `S5-deuda.md`.
>
> **G-Demo:** el script `verify-g-demo --modo real` dice **«G-Demo no superado»** (`docs/gates/no-superados/`). El PO lo **aceptó con excepciones** (H-4, `docs/gates/aceptaciones-del-po/G-Demo-S5-aceptacion-del-po-2026-11-04.md`). Esa aceptación no verifica los AC de L1D-248 ni habilita datos reales.

## 1. Resumen del sprint

**Criterio de Done.** Se aplica la «Historia cerrada» de la DoD:
- AC verificados.
- CI en verde: 0 fallos, 0 pendientes y **0 alertas**.
- PR mergeado.
- `tasks.md` conciliado: cada tarea en `[x]` con evidencia, o con su ID destino.
- Change archivado.

Estado de la CI y de las alertas:
- La CI de `main` está en verde en e9306375 (`CI`, `E2E` y `CodeQL`). #333 y #334 solo tocan documentación; la `CI` de 4cedab28 seguía en curso al auditar.
- *Code scanning* tiene **2 alertas nuevas del sprint, abiertas**: #14 (de #315, L1D-80) y #15 (de #318, L1D-91), las dos `js/sensitive-get-query` sobre el UUID de la ruta.
- Las alertas #1 y #12 son anteriores al sprint (D4-23).

**Cierre:** 15 de las 25 tarjetas del plan cerradas (**60 %**, meta ≥ 80 %), y 54 de 90 puntos (60 %).

El status local contaba 17/25 (68 %) y 62/90 (69 %). La auditoría devuelve **L1D-80** y **L1D-91** a In Review por las alertas #14 y #15 (8 pts). Si el humano triagea las dos alertas, por corrección o descarte justificado, vuelven a Done y el cierre sube a 17/25 (68 %, 62 pts).

Las que no cierran:
- Movidas al S6, sin archivar: L1D-113, L1D-268, L1D-246, L1D-299, L1D-119 y L1D-248.
- Firmas del oncólogo: L1D-92 (DEC-01) y L1D-125 (DEC-11).
- Devueltas por la auditoría: L1D-80 y L1D-91.

### Cadena por historia

Formato de la columna AC: «AC con escenario en `openspec/specs/` · AC con test con su tag (n.º de tests)».

| L1D | US | Change | AC (esc. · test) | FR · RN · AC/M del PRD | PR | Linear (antes → después) |
|---|---|---|---|---|---|---|
| L1D-306 | US-250 | `2026-11-04-l1d-306-pregunta-nfc` (17/17) | 5/5 · 5/5 (13) | RN-06 | #293 | Done → Done |
| L1D-84 | US-098 | `2026-11-04-l1d-84-normalizacion-final-manual` (11/11) | 5/5 · 5/5 (16); AC-1 y AC-6 a Post-MVP (D-4) | FR-22 · RN-27 · AC-03.3, AC-03.5, M-03.4, M-03.5 | #290 | Done → Done |
| L1D-74 | US-088 | `2026-11-04-l1d-74-vista-caso-timeline` (10/13; D5-10/11/14) | 8/8 · 8/8 (22) | FR-18, FR-21 · RN-07 · AC-02.1, 02.2, 02.6, AC-04.1, AC-11.4, M-02.2, M-02.4 | #295 | Done → Done |
| L1D-305 | US-249 | `2026-11-04-l1d-305-rn23-voz-propia-nivel-b` (18/20; D5-05) | 5/5 · 5/5 (29); AC-4 real A = B = 0 **sin informe versionado** | RN-23 · AC-10.3, AC-T3.4, M-10.2 | #292, #326, #330 | Done → Done |
| L1D-90 | US-110 | `2026-11-04-l1d-90-registro-manual-biomarcador-diagnostico` (14/15; 3.1 → US-074) | 6/6 · 6/6 (41) | FR-08, FR-22, FR-23 · RN-08, RN-17, RN-27 · AC-03.3, AC-04.1 | #296 | Done → Done |
| L1D-76 | US-090 | `2026-11-04-l1d-76-vista-caso-pagina` (19/21; D5-19) | 6/6 · 6/6 (20) | FR-07, FR-21 · RN-23 · AC-02.1…02.4, AC-T1.1 | #301 | Done → Done |
| L1D-80 | US-094 | `2026-11-04-l1d-80-tratamientos-atributos-manuales` (21/29; D5-29…35, H-1, H-2) | 6/6 · 6/6 (52; AC-4 en un solo fichero) | FR-01, FR-21, FR-22 · RN-17, RN-27, RN-29 · AC-02.3, 02.6, 02.7, AC-03.3 | #315 | Done → **In Review** (alerta #14) |
| L1D-309 | US-253 | `2026-11-04-l1d-309-correccion-con-historico` (19/23; D5-21, ADR-40) | 6/6 · 6/6 (54) | RN-08, RN-11, RN-17, RN-26 · AC-04.1 | #306 | Done → Done |
| L1D-269 | US-219 | `2026-11-04-l1d-269-hilo-seguimiento-ui` (13/13) | 5/5 · 5/5 (25) | FR-31 · RN-01, RN-19, RN-23, RN-26 | #300 | Done → Done |
| L1D-79 | US-093 | `2026-11-04-l1d-79-contexto-trayectoria-caso` (7/8; D5-22) | 5/5 · 5/5 (8) | FR-09 · RN-07, RN-11 · AC-06.2, AC-T4.2, AC-T4.3 | #305 | Done → Done |
| L1D-91 | US-111 | `2026-11-04-l1d-91-formularios-registro-manual` (15/15) | 5/5 · 5/5 (41) | FR-23 · RN-08, RN-23 · AC-04.1, AC-T1.1 | #318 | Done → **In Review** (alerta #15) |
| L1D-310 | US-254 | `2026-11-04-l1d-310-pacientes-momentos-enfermedad` (23/26; H-2) | 5/5 · 5/5 (25) | RN-11, RN-13, RN-14 | #316 | Done → Done |
| L1D-195 | US-070 | `2026-11-04-l1d-195-analisis-sin-escrituras` (12/13; 2.3b ↔ D5-31) | 4/4 · 4/4 (6) | FR-10 · RN-06, RN-08, RN-09 · AC-T3.2 | #313 | Done → Done |
| L1D-196 | US-071 | `2026-11-04-l1d-196-avisos-no-bloquean` (16/17; D5-23) | 5/5 · 5/5 (5) | FR-11 · RN-15, RN-26 · AC-04.2, AC-08.6, AC-T3.3 | #309 | Done → Done |
| L1D-96 | US-004 | `2026-11-04-l1d-96-datos-criticos-vista-caso` (12/13; la 3.2 era el propio archivo) | 6/6 · 6/6 (23) | FR-07, FR-23 · RN-17, RN-23 · AC-04.1, AC-T1.1 | #320 | Done → Done |
| ARR-11 | — | `2026-11-04-arr-11-ci-rapida` (25/25; D5-51) | sin US: `ci-pipeline` y fixtures de CI | — | #291, #330 | sin issue |
| ARR-10 | — | sin change: archivó l1d-72, l1d-202 y l1d-194 | — | — | #299 | sin issue |
| L1D-113 | US-116 | `l1d-113-faltantes-desconocido-prompt` **activo, movida al S6** | 0/5 (5 en el delta) · 5/5 (12) | FR-09, FR-23 · RN-02, RN-11 · AC-04.3 | #307, #314 | In Review → In Review |
| L1D-268 | US-218 | `l1d-268-seguimiento-analisis` **activo, movida al S6** | 0/8 (8 en el delta) · 8/8 (37) | FR-09, FR-31 · RN-01, 02, 04, 06, 11, 15, 22, 23, 24 | #297 | In Review → In Review |
| L1D-246 | US-140 | `l1d-246-suite-hasta-3-opciones` **activo, movida al S6** | 0/6 (6 en el delta) · 6/6 (32) | FR-20 · RN-22, RN-28 · AC-08.8, AC-T5.1, AC-T5.3, M-07.2, M-10.1, M-10.2 | #310, #328 | In Review → In Review |
| L1D-299 | US-233b | `l1d-299-poblacion-dorado-suite` **activo, movida al S6** | 0/8 (8 en el delta) · 7/8 (+AC-9; AC-1 sin tag) | FR-20, FR-25 · RN-02, 14, 21, 22 · AC-T5.4, M-08.2…08.4 | #308 | In Review → In Review |
| L1D-119 | US-120 | `l1d-119-corpus-ampliado-calibracion` **activo, movida al S6** | 0/7 (7 en el delta) · 7/7 (24) | FR-19 · RN-14, RN-21, RN-22 · AC-06.1, M-06.1, M-06.2, M-08.3 | #302 | In Review → In Review |
| L1D-248 | US-142 | `l1d-248-g-demo-verificacion` **activo, movida al S6** | 0/7 (7 en el delta) · 7/7 (70); **G-Demo no superado por el script** | FR-20 · RN-13, RN-22 · AC-T1.5, AC-T3.3, AC-T5.1, AC-T5.3, M-02.3, M-06.2, M-10.1, M-10.2 | #322, #331, #332 | **Done** → Done (sin tocar: lo actualiza el humano; ver §4) |
| L1D-92 | DEC-01 | sin change (firma) | — | — | — | Backlog → Backlog |
| L1D-125 | US-021 · DEC-11 | sin change (firma) | — | — | — | Backlog → Backlog |

**PR sin change (válidos):**
- Refinamiento y plan: #288 y #289.
- Documentación de oleada y cierre: #298, #299, #303, #304, #311, #319, #321, #325, #327, #329, #330, #331, #332, #333 y #334.
- Herramienta: #317 (vigilante de PR).
- Fixes con ID de deuda: #326 (D5-06/D5-28) y #328 (D5-28/D5-49).

No hay ningún change archivado sin PR, ni PR de historia sin change.

**Escenarios y tests sin AC de origen.** Ninguna historia del S5 tiene escenarios ni tests sin AC de origen. Siguen sin AC en el Markdown, igual que en el S4 (M2):
- `[US-242 AC-9]`: 1 escenario y 2 tests.
- `[US-233b AC-9]`: 2 tests.

`US-900*` son *fixtures* de la CI de higiene.

**RN citadas por las historias archivadas.** Todas tienen ≥ 1 test con el tag de un AC de la propia historia que la cita. Las dos citas de US-070 sin test propio son de contexto, no compromisos:
- FR-10 tiene 93 tests globales.
- FR-13 (vincular una decisión) es Post-MVP, FEAT-11b.

**Regresiones activas.** `🔗 Regresión [RN-28] → US-125 (activa desde S5)`: verificada. US-125 tiene tests de RN-28 y la suite `opciones` midió el orden de RN-28 en 12/12 tras #328. También quedan cubiertas `[RN-26] → US-071`, `[AC-T3.2] → US-070`, `[RN-27] → US-098` y `[RN-23] → US-068` (`lint:lenguaje` en cada PR de UI).

## 2. Cobertura por familia (cierre del S4 → cierre del S5)

| Familia | Universo | Con spec S4 → S5 | Solo en changes sin archivar S4 → S5 | Con test S4 → S5 |
|---|---|---|---|---|
| FR | 31 | 19 → 21 | 0 → 0 | 17 → 21 |
| RN | 30 | 26 → 28 | 0 → 0 | 26 → 28 |
| NFR | 14 | 9 → 9 | 0 → 0 | 9 → 9 |
| SEG | 13 | 10 → 10 | 0 → 0 | 10 → 10 |
| IA | 11 | 7 → 7 | 0 → 0 | 7 → 7 |
| CAP | 11 | 0 → 3 | 0 → 4 | 0 → 7 |
| T | 5 | 0 → 0 | 0 → 0 | 0 → 0 |
| AC | 54 | 27 → 34 | 1 → 0 | 27 → 33 |
| ACT | 23 | 17 → 20 | 1 → 1 | 18 → 21 |
| ACP | 2 | 0 → 0 | 0 → 0 | 0 → 0 |
| M | 36 | 14 → 19 | 2 → 1 | 13 → 17 |
| HU | 26 | 9 → 12 | 1 → 0 | 9 → 12 |
| OL | 6 | 6 → 6 | 0 → 0 | 6 → 6 |
| TBD | 21 | 7 → 7 | 1 → 1 | 7 → 7 |
| VM | 6 | 3 → 3 | 0 → 2 | 3 → 5 |
| G | 16 | 5 → 5 | 0 → 3 | 5 → 8 |

Todas las familias tienen historia para cada ID (TBD-05 es una exclusión). Ningún ID pierde spec ni test.

Volumen de la matriz: 925 → 1339 escenarios en la spec principal y 5220 → 6376 unidades de test.

**IDs que ganan spec en el S5:**
- FR-07 y FR-08.
- RN-08 y RN-09.
- CAP-02, CAP-04 y CAP-08.
- AC-02.1, 02.2, 02.3, 02.4, 02.7, AC-03.3 y AC-03.5.
- AC-T3.2, AC-T3.3 y AC-T5.1.
- M-02.2, M-03.4, M-03.5, M-08.3 y M-08.4.
- HU-06, HU-09 y HU-15.

Lo cubren el registro manual, la vista de caso, la normalización, el control humano y el archivo de arrastres.

**IDs que ganan test:** los anteriores, más FR-22, FR-31, CAP-05, CAP-07, CAP-09, CAP-11, AC-T1.5, M-02.3, HU-17, VM-3, VM-4, G-1, G-2 y G-14. De ellos, CAP, VM y G entran por los tests de G-Demo (L1D-248). Ese change no está archivado, así que su spec cuenta en «solo en changes sin archivar».

**RN sin test todavía:** RN-16 y RN-18, de Post-MVP y G-Piloto. RN-08 y RN-09 dejan de estar sin test.

## 3. Huecos priorizados

**Bloqueantes.** Son propuestas de historia o tarea para el S6; no se crea ningún issue.

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| B1 | **Alertas de *code scanning* #14 y #15, nuevas del S5 y abiertas** (`js/sensitive-get-query`, warning). Están en `clinical-attributes.controller.ts:41` (#315, L1D-80) y en `manual-entry.controller.ts:103` (#318, L1D-91). Rompen el criterio «0 alertas» de la DoD: el status anotó «0 alertas» en esos PR, pero la #14 ya existía en `refs/pull/315/head` antes del merge. Por esto, L1D-80 y L1D-91 vuelven a In Review. | `clinical-platform-dev` + humano | **Tarea S6 (hora 0): triage de las alertas de seguridad.** Corregir las alertas o descartarlas en GitHub como falso positivo con su justificación (el parámetro de ruta es un UUID validado con Zod, no un *query* sensible), junto con la #12 (D4-23). Después, L1D-80 y L1D-91 pasan a Done. Además, el vigilante de PR (`.claude/hooks/vigilar-pr.sh`) debería leer las alertas del `ref` del PR, no solo las del *check* `CodeQL`. |
| B2 | **L1D-248 (US-142) en Done en Linear**, con el change `l1d-248-g-demo-verificacion` activo y la historia movida al S6. El script dice «G-Demo no superado» y AC-1, AC-2, AC-3 y AC-6 no se verificaron. Es justo el caso «historia `movido-S<n+1>` aún Done en Linear». No la toco por instrucción (la actualiza el humano). Además, el defecto D5-53 (`banderas.mjs` lee `REAL_*_ENABLED` de `clinical-api`, que no las declara) **impide superar cualquier G-Demo real**. | humano (estado) · `clinical-platform-dev` (D5-53) | **Historia S6 «G-Demo real verificable»** (ya decidida como deuda PRIORITARIA): D5-53 con un test que use `docker compose config` real, más D5-55, D5-57 y D5-54 (calibrar las preguntas de seguimiento antes de la Demo 5). Volver a correr `verify-g-demo --modo real`. Hasta entonces, el humano decide si L1D-248 vuelve a In Review. La DoD exige AC verificados y la aceptación del PO no los sustituye. |

**Mayores:**

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| M1 | **Evidencia de `evaluate` obligatoria sin versionar en `reports/eval/`** (CLAUDE.md: OL-06 es obligatoria en todo cambio de modelo, prompt, umbral, catálogo o corpus). Hay tres casos: (a) L1D-305 3.6 está en `[x]` con la atestación de la sesión principal y sin informe (D5-05), aunque la regla original decía «nunca [x] sin el informe»; (b) L1D-90 3.1 está «DIFERIDA -> US-074», que es una historia ya cerrada, sin fila de deuda propia, y el informe del `ai-eval-runner` posterior al merge (PASS) quedó en un *worktree*; (c) L1D-80 H-1, el informe del catálogo 1.4.0, tampoco está versionado. | humano + `ai-eval-runner` | Una sola tarea humana en el S6: escribir los tres informes en `reports/eval/` (D5-03 ya da el permiso) y abrir una fila D5 para L1D-90 3.1 en vez de US-074. |
| M2 | **D5-14: el checklist de faltantes no excluye los reflejos de análisis** (`completeness.repository.ts` lee `ClinicalEvent` sin `sqlEventoClinicoPropio()`, ADR-32). Hoy está latente, porque ningún dato crítico del catálogo real tiene `ClinicalEvent` como destino. En cuanto un ítem apunte a esa entidad, un evento generado por IA contaría como dato del paciente presente (RN-24 / ADR-32). | `clinical-platform-dev` | Test de caracterización con un evento con `analysis_id` y un ítem de catálogo de prueba con destino `ClinicalEvent`, más el predicado en la consulta. Bloquea cualquier cambio del catálogo que use esa entidad: añadir esa regla a `catalog:validate`. |
| M3 | **D5-31 en traslado circular.** L1D-195 2.3b apunta a US-094 / D5-31 y L1D-80 D5-31 apunta a L1D-195; los dos están archivados. El diff de tablas de US-070 no siembra un tratamiento previo ni un atributo manuales, aunque el refinamiento lo pedía. | `clinical-platform-dev` | Asignar D5-31 a una historia del S6 (p. ej., la de deuda de registro manual D5-29/D5-34/D5-40) y añadir el paso a `sembrarFilasManuales()`. |
| M4 | **Test retirado sin `Test-Removal`** (L1D-96, commit 40d65f16, dos `it`; documentado en #320 y D5-46). Viola la política TDD y la CI de higiene no lo detectó. | `design-principles-reviewer` + plataforma | Confirmar que AC-3 y AC-5 de US-004 no perdieron cobertura y añadir a `verificar-commits-tdd` la detección de `it(` borrados sin trailer. |
| M5 | **Arrastres sin archivar:** 8 changes con PR mergeado siguen en `openspec/changes/` (`l1d-116`, `l1d-126`, `l1d-166`, `l1d-173`, `l1d-197`, `l1d-205`, `l1d-285`, `us-231b`). ARR-10 los «cerró con ID destino» sin archivarlos. Sus issues (L1D-116, L1D-126, L1D-205, L1D-285) siguen In Review en el hito Sprint 5. | orquestador + humano | En el S6: archivarlos (con el delta revisado) o moverlos explícitamente con su historia destino. Contar sus puntos solo cuando se archiven. |
| M6 | US-242 AC-9 y US-233b AC-9 siguen sin existir en `backlog/features` (es la M2 del S4, sin resolver). | `backlog-writer` | Añadir los AC-9 a FEAT-06c y FEAT-T5a (primero el Markdown y después Linear). |

**Menores:**
- m1 · US-094 AC-4: un escenario y dos tests en un solo fichero de integración (`registro-clinico/atributos.test.ts`). Basta para el AC, pero no hay ningún caso que lea el atributo reemplazado desde `/case`. Añadir un `it` en `case-view` cuando se toque.
- m2 · `openspec/specs/data-model/spec.md:257`: el título del escenario dice «cinco pacientes», pero el `THEN` y el seed tienen 13 ((a)–(m)). Renombrarlo en el commit de cierre o en el primer change del S6 que toque `data-model`.
- m3 · «US-111 AC-6» no es un hueco: US-111 tiene AC-1…AC-5, en el Markdown y en Linear. El escenario de l1d-91 cita `[US-110 AC-6]`, que tiene 3 escenarios y 3 tests.
- m4 · Espejo de Linear desactualizado: L1D-91 dice «Sprint 4» y L1D-80 dice «Sprint si-hay-capacidad». El Markdown dice Sprint 5. Lo resincroniza el humano o `backlog-writer`.
- m5 · L1D-310: las tareas 2.9 y 6.1 apuntan a «H-2», una tarea humana del propio change y no un ID de deuda. El ensayo de `levantar.sh` desde cero choca con D5-56.
- m6 · Las tareas l1d-76 4.2 y l1d-96 3.2 («archivar después de…») quedaron en `[ ]` aunque el bulk-archive ya las cumplió.
- m7 · En el hito Sprint 5 de Linear hay issues fuera del plan: L1D-118 (US-119, Backlog) y L1D-286 (decisión sobre la excepción de *braces*). L1D-299 sigue sin Feature padre (la M5 del S4).
- m8 · Método: el detector de tests no ve un `it.each(...)` con paréntesis anidados en su argumento. Es el caso de `[US-070 AC-3]`, que se comprobó a mano; puede haber otros falsos «—».

## 4. Incoherencias entre el status local, `openspec` y Linear

1. **L1D-248:** Linear dice Done, mientras que el status dice «NO cuenta como cerrada» y el change sigue activo (movido al S6). Es el B2.
2. **Razón de cierre:** el status da 17/25 (0,68) y la auditoría 15/25 (0,60), por las alertas #14 y #15 de L1D-80 y L1D-91.
3. **ARR-10:** el plan y el status dicen que «cierra con ID destino 205, 285, 116, 126, us-231b, 197, 166, 173», pero esos 8 changes siguen activos en `openspec/changes/` y 4 de sus issues siguen In Review en el hito Sprint 5 (M5).
4. **Hito de las movidas:** las seis historias movidas al S6 (113, 268, 246, 299, 119 y 248) siguen en el hito «Sprint 5» de Linear. Cambiar el hito es del humano.
5. **«0 alertas»:** el status lo anotó en #315 y #318, pero *code scanning* tiene las alertas #14 y #15 en `refs/pull/315/head` y `refs/pull/318/head`.
6. **D5-31:** figura como «Propuesto» en `S5-deuda.md`, pero en los `tasks.md` archivados quedó como traslado circular entre L1D-80 y L1D-195 (M3).
7. **L1D-305:** el status lo da por cerrado con «A = B = 0 medido 0/0», pero el informe de esa medición no está en el repositorio (M1a).

## 5. Cambios en Linear (2026-11-04)

Antes de cada cambio comprobé el estado actual. Solo cambié estados y añadí comentarios: no creé ni borré ningún issue, ni cambié estimaciones ni hitos. Los comentarios no contienen datos personales ni secretos.

| Issue | Antes | Después | Motivo |
|---|---|---|---|
| L1D-80 | Done | **In Review** | Alerta #14 abierta (DoD: 0 alertas); el resto de la cadena está completa. |
| L1D-91 | Done | **In Review** | Alerta #15 abierta (DoD: 0 alertas); el resto de la cadena está completa. |
| L1D-39 (FEAT-T3) | In Progress | **Done** | Sus 5 historias (L1D-193, 194, 195, 196, 305) están en Done con la cadena verificada. |

**Done confirmados, con comentario:** L1D-306, 84, 74, 305, 90, 76, 309, 269, 79, 310, 195, 196 y 96. Los comentarios de L1D-74, 305, 90, 195 y 96 nombran sus huecos Mayores.

**Sin cambio:**
- L1D-248: queda en Done por instrucción, sin comentario de esta auditoría.
- L1D-113, 268, 246, 299 y 119: In Review (movidas).
- L1D-92 y L1D-125: Backlog.

**Features que no pasan a Done, porque les quedan historias sin Done:**
- FEAT-02b (L1D-10): L1D-75, 78 y 80.
- FEAT-03b (L1D-13): L1D-87, 88 y 91.
- FEAT-03a (L1D-12): L1D-85 y 86.
- FEAT-04 (L1D-14): L1D-92.
- FEAT-06a (L1D-16): L1D-289, 108 y 107.
- FEAT-06c (L1D-18): L1D-116, 118 y 119.
- FEAT-10c (L1D-25): L1D-268.
