# S1 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close S1` · 2026-10-18 · rama `sprint/S1-close` sobre `main` (d4ad40d), con los 9 changes archivados el 2026-10-18 y sus deltas ya fusionados en `openspec/specs/`.
> Insumos: [`S1-plan.md`](S1-plan.md), `S1-status.md` (registro local del orquestador, sin versionar), [`S1-pendientes-humanos.md`](S1-pendientes-humanos.md), `openspec/changes/archive/2026-10-18-*`, los 17 changes sin archivar, `openspec/specs/**`, `backlog/features/*.md`, `docs/PRD.md` v1.4 §17–§18, los PR #23…#91 (`gh pr list --state merged`), la CI de `main` en d4ad40d y una ejecución local de la integración de `clinical-api`.
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md).

## 1. Resumen del sprint

**Criterio de Done de este cierre.** Una historia queda en Done si cumple los cinco criterios: (1) todos sus AC tienen al menos un test ejecutado y en verde; (2) Gate 2 en PASS; (3) PR mergeado; (4) change archivado; (5) tareas completas. Hay una excepción: cuando lo único abierto es el paso mecánico de archivar, o una tarea que pertenece a otra historia o que ya se cumple en `main`. Cuando falta verificación (E2E, `visual-check`, OL-06, tests de servicios reales o mediciones humanas), la historia vuelve a **In Review**. Volvería a **In Progress** si hubiera un bug o código sin terminar; este cierre no encontró ningún caso.

| L1D | Historia | Change | Spec (openspec) | AC con escenario en la spec principal (+ delta sin archivar) | AC con test ejecutado | PR | Linear (antes → después) | Cadena |
|---|---|---|---|---|---|---|---|---|
| L1D-164 | US-034 · Compose | `2026-10-18-l1d-164-compose-stack` | `platform-stack`, `platform-observability`, `api-contracts` | 6/6 | 6/6 (28 CI) | #26 | Done → Done | **Completa** |
| L1D-102 | US-012 · ADR-39 fase A | `2026-10-18-l1d-102-adr39-embeddings-reranker-nli` | `ai-evaluation` | 10/10 | 10/10 (35 CI) | #33, #37, #39, #41, #52 | Done → Done | **Completa** (fase A aceptada, decisión 73) |
| L1D-165 | US-035 · secretos | `2026-10-18-l1d-165-secrets-setup-scripts` | `platform-stack`, `platform-observability`, `data-model` | 5/5 | 5/5 (37 CI, con `test:secrets`) | #27 | Done → Done | **Completa** |
| L1D-105 | US-054 · JWT de servicio | `2026-10-18-l1d-105-service-jwt-auth` | `service-auth`, `api-contracts`, `evidence-analysis-gateway` | 6/6 | 6/6 (14 CI + 1 integración) | #28 | Done → Done | **Completa** |
| L1D-168 | US-038 · migración inicial | `2026-10-18-l1d-168-initial-schema-migration` | `data-model` | 7/7 | 7/7 (35 de integración, **solo en local**) | #32 | Done → Done | Completa · B-1 y M-7 |
| L1D-169 | US-039 · seed sintético | `2026-10-18-l1d-169-synthetic-demo-seed` | `data-model` | 5/5 | 5/5 (8 CI + 20 integración) | #54 | Done → Done | Completa · B-1 |
| L1D-103 | US-052 · gateway | `2026-10-18-l1d-103-gateway-contexto-clinico` | `evidence-analysis-gateway` | 6/6 | 6/6 (12 integración) | #67 | Done → Done | Completa · B-1 |
| L1D-179 | US-063 · citas | `2026-10-18-l1d-179-citas-chunk-recuperado` | `evidence-analysis` | 6/6 | 6/6 (7 CI) | #73 | Done → Done | **Completa** |
| L1D-104 | US-053 · persistencia | `2026-10-18-l1d-104-persistencia-analisis-fallos` | `evidence-analysis-gateway` | 6/6 | 6/6 (20 integración) | #68, #71 | Done → Done | Completa · B-1 |
| L1D-106 | US-055 · recuperación y umbral | sin archivar | — | 0/5 (+5) | 5/5 (6 CI) | #59 | Done → Done | Completa salvo archivar: la 2.13b es el *smoke* de US-059 AC-1 (tarea 1.12 de US-231b). Ver m-6 |
| L1D-203 | US-049 · desidentificación | sin archivar | — | 0/7 (+7) | 7/7 (3 CI + 14 integración) | #79, #82 | Done → Done | Completa salvo archivar: la 4.1b ya se cumple (103 archivado). m-6 |
| L1D-265 | US-215 · lint y formato | sin archivar | — | 0/5 (+5) | 5/5 (30 CI) | #36, #38 | Done → Done | Completa salvo archivar: los dos subpuntos de la 4.2 (D-7) ya están en verde en `main`. m-6 |
| L1D-166 | US-036 · CI | sin archivar | — | 0/7 (+7) | 7/7 (132 CI) | #29, #34 | In Review → In Review | **Con huecos:** 4.1 y 4.2 (protección de `main`, solo el administrador) y 5.2; el AC-1 no se cumple del todo (B-1) |
| L1D-139 | US-060 · BFF | sin archivar | — | 0/5 (+5) | 4/5: **el AC-3 no tiene test escrito** (E2E 2.8, D-3) | #30, #35 | In Review → In Review | Con huecos (M-3) |
| L1D-197 | US-211 · login y guard | sin archivar | — | 1/6 (+6) | 6/6 (10 CI + 6 integración) | #49 | **Done → In Review** | Con huecos: 3.3, 3.5 y 4.2 (E2E del AC-1 en navegador y del AC-4 de punta a punta, y `visual-check`, D-3). La decisión 61 ya se cumple |
| L1D-114 | US-058 · catálogo y Milvus | sin archivar | `data-model` | 1/5 (+5) | **2/5:** AC-1, AC-3 y AC-4 solo tienen tests `servicios_reales`, que nunca corrieron | #42, #45 | **Done → In Review** | Con huecos (B-2) |
| L1D-115 | US-059 · semilla del corpus | sin archivar | — | 0/6 (+6) | **2/6:** AC-1, AC-3, AC-4 y AC-5 solo tienen tests `servicios_reales`/`models` | #55, #56 | **Done → In Review** | Con huecos (B-2): *smoke* AC-1 (US-231b 1.12), tarea 2.1 de evaluación |
| L1D-193 | US-068 · RN-23 | sin archivar | — | 0/5 (+5) | 4/5: **AC-4 solo E2E** (sin ejecutar) | #62, #65 | **Done → In Review** | Con huecos: 5.1 (M-10.2 manual), 6.1, 6.2 y E2E de AC-3/AC-4 (M-3, M-4) |
| L1D-238 | US-075 · baseline VM | sin archivar | — | 0/5 (+5) | 5/5 sobre el cálculo (23 CI); **sin baseline medido** | #66, #69 | **Done → In Review** | Con huecos: tareas humanas 3.1–3.5 (M-6). In Review por la decisión 81 |
| L1D-275 | US-225 · generación y `maxOptions` | sin archivar | — | 0/3 (+3) | 3/3 (3 CI) | #75 | **Done → In Review** | Con huecos: `tasks.md` con 0/16 marcadas; 3.1 (evaluación del prompt con el LLM real) sin hacer (M-2, M-4) |
| L1D-194 | US-069 · aviso de IA | sin archivar | — | 0/4 (+4) | 4/4 (10 CI + 3 integración); 4 E2E sin ejecutar | #72 | **Done → In Review** | Con huecos: `tasks.md` con 0/15 marcadas; 3.3 `visual-check` y E2E (D-3); 5.2 (prosa) (M-2, M-3) |
| L1D-180 | US-064 · soporte NLI | sin archivar | — | 0/8 (+8) | 8/8 (10 CI) | #84, #85, #87 | **Done → In Review** | Con huecos: 3.1 y 4.4 (OL-06 con el NLI real; diferidas a US-072 / L1D-235) (M-4) |
| L1D-140 | US-061 · panel | sin archivar | — | 0/6 (+6) | 6/6 (8 CI); 6 E2E sin ejecutar | #76, #78 | **Done → In Review** | Con huecos: 2.7/3.5 `visual-check`, 4.2 E2E (D-3) y 4.3 (M-3) |
| L1D-274 | US-224 · ADR-39 fase B | sin archivar (**sin delta de spec**) | — | **0/6** | 5/6 (el AC-1 no tiene test con tag) | #83, #86, #90 | **Done → In Review** | Con huecos: mediciones humanas 1.4–1.8; AC-1–AC-3 y AC-6 sin cifras (M-5) |
| — | US-231a · adapters de recuperación | sin archivar | — | 0/9 (+9) | 8/9: AC-9 solo `models` | #70 | sin issue | Con huecos: 3.2 y 3.3; sin issue en Linear (M-8) |
| — | US-231b · NLI y *smoke* | sin archivar | — | 0/9 (+9) | 7/9: AC-6 y AC-7 solo `models` | #80 | sin issue | Con huecos: 1.0, 1.11, 1.12, 2.1, 3.1, 4.2 y 4.4; sin issue en Linear (M-8) |

**Verificación (rama `sprint/S1-close`, mismo árbol que `main` d4ad40d):**
- **La CI de `main` está en verde** en d4ad40d: `build-test`, `contracts`, `quality`, `lint-lenguaje`, `data-scan`, `secret-scan`, `stack-smoke` y `ci-ok`. Ejecuta:
  - Vitest de los workspaces: 148 + 426 + 43 tests.
  - Vitest raíz: 673 tests.
  - El test de build de `web`.
  - `test:secrets`.
  - Pytest: 1521 en verde; deselecciona 103, los `servicios_reales` y `models`.
- **La integración de `clinical-api` contra PostgreSQL real no está en la CI.** Su configuración (`vitest.integration.config.ts`) la excluye de `npm test`, así que cubre `schema`, `auth`, `seed` y `evidence-analysis` solo en local. Este cierre la corrió con el perfil test de Compose (proyecto `olclose`, subredes libres, secretos de test generados y borrados al terminar): **199/199 en verde, 28 archivos**.
- **No se ejecutaron:**
  - Los E2E de Playwright: 12 tests en `apps/web/e2e/`, por la deuda D-3.
  - Pytest `servicios_reales` y `models`: 64 + 11 + 2 funciones, porque necesitan Milvus, PostgreSQL de corpus o pesos reales.
- **Alcance inventado:** no hay.
  - Hay 22 escenarios sin tag de AC: 4 en la spec principal (`evidence-analysis-gateway`) y 18 en deltas sin archivar. Todos se apoyan en una decisión registrada (`[S1 resp. 12]`, `[S1 resp. 14d]`, `[S1 resp. 15]`, `[S1 resp. 18]`, `[S1 resp. 29]`, `[S1 resp. 34]`, `[S1 resp. 35]`, decisión 64, Gate 1 del 2026-10-20, `pantallas-s1`) o llevan el tag de la historia sin número de AC (`[US-059]`, 3 escenarios de 115).
  - Un test lleva un tag que no es un AC: `@pytest.mark.ac("S1", 29)` en `apps/rag-orchestrator/tests/integration/test_rag_query_soporte_nli.py:223` (m-2).
  - Todos los demás tags `[US-xxx AC-n]` y `@pytest.mark.ac` apuntan a AC que existen.
- **PR y changes:**
  - Los 9 changes archivados tienen su PR `[L1D-nn]` mergeado.
  - Toda historia del sprint tiene PR. Los de US-231a/US-231b se titulan `[US-231a]`/`[US-231b]` porque no hay issue en Linear.
  - Los PR sin change son chores, `fix` de CI o decisiones (#23–#25, #31, #34, #35, #40, #43, #44, #46–#48, #50–#53, #57, #58, #60, #61, #63, #64, #69, #71, #74, #77, #78, #81, #85, #88–#91) y no implementan AC.
- **Regresiones 🔗 cuyo sprint ya llegó:**
  - RN-23 → US-068 (textos de `/login`, desde US-211) la cubre `lint:lenguaje` sobre `apps/web/messages/*.json`, que corre en la CI.
  - RN-11 → US-049 y RN-01 → US-064 las verifican sus dueñas.
  - Las demás marcas de las historias del S1 se activan en el S2 o más tarde: RN-10 → US-046 (S2), RN-28 → US-125 (S5), RN-15 → US-148 (S6) y RN-17 → US-198 (Post-MVP).
- **Historias `movido-S2` en Done:** el cierre movió al S2 los 17 changes sin archivar. 11 de sus historias estaban en Done en Linear; 8 vuelven a In Review (más L1D-274, sin change archivado, y L1D-238). L1D-106, L1D-203 y L1D-265 siguen en Done por la excepción de §1.

### RN citadas por las historias del S1 sin un test que las verifique

| RN | Historia | Situación | Hueco |
|---|---|---|---|
| RN-06 | US-038 / US-053 | La inmutabilidad de `ai_analysis_record` solo bloquea `UPDATE`; nada impide `DELETE` ni `TRUNCATE`. La deuda está anotada en FEAT-PL2 sin ID ni sprint | M-7 |
| RN-11 | US-231b | "El NLI recibe solo premisa e hipótesis, nunca `clinicalContext` ni `pseudoPatientId`": hoy lo garantiza solo la firma del puerto, sin test | m-4 |
| RN-22 | US-036 (formatos de PII configurables), US-049 (patrones sin asumir país), US-053 (`RAG_TIMEOUT_MS`), US-059 (listas de licencias y fuentes excluidas) | La configuración existe y se usa en los tests de sus AC, pero ningún test afirma que el valor sale de la configuración | m-4 |
| RN-21, RN-05, RN-25 | US-058, US-059 | Sus tests de aceptación son `servicios_reales` y no se ejecutaron | B-2 |

## 2. Cobertura por familia (matriz regenerada)

| Familia | Universo | Con historia | Con spec (openspec) | Solo en changes sin archivar | Con test ejecutado | Pre-S1 (spec / test) |
|---|---|---|---|---|---|---|
| FR | 31 | 31 | 9 | 2 | 10 | 4 / 3 |
| RN | 30 | 30 | 24 | 1 | 21 | 19 / 15 |
| NFR | 14 | 14 | 5 | 2 | 7 | 1 / 1 |
| SEG | 13 | 13 | 5 | 3 | 7 | 0 / 0 |
| IA | 11 | 11 | 2 | 2 | 4 | 0 / 0 |
| CAP | 11 | 11 | 0 | 0 | 0 | 0 / 0 |
| T | 5 | 5 | 0 | 0 | 0 | 0 / 0 |
| AC (PRD §18.3) | 54 | 54 | 5 | 4 | 9 | 2 / 2 |
| ACT | 23 | 23 | 5 | 5 | 10 | 1 / 1 |
| ACP | 2 | 2 | 0 | 0 | 0 | 0 / 0 |
| M | 36 | 36 | 2 | 4 | 6 | 0 / 0 |
| HU | 26 | 26 | 2 | 0 | 2 | 0 / 0 |
| OL | 6 | 6 | 4 | 1 | 5 | 1 / 0 |
| TBD | 21 | 21 (TBD-05 como exclusión) | 2 | 1 | 3 | 0 / 0 |
| VM | 6 | 6 | 0 | 2 | 2 | 0 / 0 |
| G | 16 | 16 | 3 | 1 | 4 | 0 / 0 |

**Cambios de método respecto del Pre-S1:**
- **Universo:** el mismo, porque el PRD sigue en v1.4. FR-31 ya tiene historia: US-218 y US-219 la citan (M-3 del Pre-S1, cerrado).
- **Columna nueva** "Solo en changes sin archivar": cuenta los IDs que solo tienen escenarios en un delta no fusionado.
- **"Test":** cuenta solo los tests ejecutados y en verde: los de la CI más la integración local de este cierre. Los escritos pero no ejecutados aparecen como "(+n sin ejecutar)".
- **Nuevos orígenes de tests:** los casos de `scripts/tests/*.cases.sh` (`test:secrets`) y los fixtures `ci/tests/cases/*/case.json`.
- **Cortes del texto de una historia:** las secciones de nivel 2 que no son de la historia (`Parte S3`, `Dependencias externas`, `Conflictos de fuentes`) cortan su texto, y `DEC-01` cuenta como un elemento propio, igual que en F5.
- **Tabla de historias:** gana US-224…US-231b y una nota `— (abierto: <change>)` para los changes sin archivar.
- **Script:** el generador sigue siendo temporal y vive fuera del repo (m-5).

## 3. Huecos priorizados

### Bloqueante

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| B-1 | **La CI no ejecuta los tests de aceptación de integración.** La integración de `clinical-api` contra PostgreSQL (199 tests, nivel principal de los backends según CLAUDE.md) se excluye de `npm test`, y Pytest deselecciona `servicios_reales`. Los AC de US-038, US-039, US-052, US-053, US-049 y US-211 solo tienen evidencia local (Gate 2 y este cierre). Nada impide que una regresión del S2, que trae identidad cifrada e índice ciego sobre esta misma base, llegue a `main`. US-036 AC-1 ("ejecuta build y tests de `web`, `clinical-api` y `rag-orchestrator`") no se cumple del todo, y la tarea 2.4 de L1D-114 (job de `servicios_reales`), diferida a L1D-103/106, se perdió: ambas cerraron sin ella | L1D-166 (US-036) · planning del S2 | **Historia propuesta (Linear lleno; no creada):** *"[S2] La CI ejecuta la integración de `clinical-api` con PostgreSQL de test y los tests `servicios_reales` de `rag-orchestrator` con PostgreSQL de corpus y Milvus de test"*, 3 pts, FEAT-PL1, antes de US-046. AC: (1) un job levanta el perfil test de Compose, corre `scripts/setup-secrets.sh --profile test` y `scripts/test-integration.sh`, y falla si algún test falla; (2) un job corre `pytest -m servicios_reales` dentro de `corpus-db-net`; (3) `ci-ok` depende de ambos; (4) los secretos de test se generan en el job y nunca se versionan (RN-14). **Alternativa:** añadirlo como AC-8 de US-036 (L1D-166, que sigue en In Review) |
| B-2 | **US-058 y US-059 tienen AC sin ningún test ejecutado:** US-058 AC-1, AC-3 y AC-4 (esquema del catálogo, colección de Milvus y licencia `cc_by_nd` rechazada, RN-21) y US-059 AC-1, AC-3, AC-4 y AC-5 (carga de la semilla, vigencia, RN-05 y RN-21). Sus tests son `servicios_reales`/`models` y no corrieron en la CI, en este cierre ni, según `S1-pendientes-humanos.md` §C, en la sesión. El *smoke* AC-1 (US-231b 1.12) tampoco corrió. Es el corpus de la demo | Usuario (sesión principal) + L1D-114 / L1D-115 | Correr una vez sobre `main`, con el Compose de test, `pytest -m servicios_reales` y el *smoke* de US-231b 1.12 con `MODEL_HOST_DIR`, y adjuntar la salida a L1D-114 y L1D-115. Si pasa, ambas cumplen la cadena y salen a Done al archivar sus changes. B-1 evita que vuelva a pasar |

### Mayor

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| M-1 | **17 changes sin archivar:** la spec principal no tiene los escenarios de 17 historias del S1 (US-036, 215, 060, 058, 059, 055, 068, 231a, 231b, 075, 225, 069, 064, 049, 061, 224 y 5 de los 6 AC de US-211); solo están en sus deltas | Sesión principal (`/sprint-close`, S2) | Archivar ya `l1d-106`, `l1d-203` y `l1d-265` (m-6). El resto, cuando cierre sus tareas: no se archiva con tareas abiertas (decisión 60) |
| M-2 | **`tasks.md` sin conciliar en dos changes mergeados:** `l1d-194` tiene 0/15 tareas marcadas y `l1d-275`, 0/16. El código y los tests de sus AC están en `main` (#72, #75), pero el Gate 2 no puede distinguir lo hecho de lo pendiente: `visual-check` 3.3 y 5.2 en 194, y la evaluación del prompt 3.1 en 275 | Implementador de cada change (S2) | Marcar lo hecho con la evidencia del PR, dejar abierto o diferido por escrito con ID lo que falta, y archivar |
| M-3 | **E2E y `visual-check` del S1 sin ejecutar** (deuda D-3, sin ID ni sprint). Hay 12 tests Playwright escritos en `apps/web/e2e/`. US-060 AC-3 ni siquiera tiene test escrito (2.8 de L1D-139). Faltan los E2E de US-211 AC-1 (navegador) y AC-4, y US-068 AC-4 solo tiene E2E. Afecta a L1D-139, 140, 193, 194 y 197 | Planning del S2 (D-3) | **Historia propuesta:** *"[S2] Playwright corre contra Compose en perfil de test con `LLM_PROVIDER=fake` y `MODEL_PROVIDER=fake` y el seed de `doc1@test.local`, en local y en la CI"*, FEAT-PL1. AC: los E2E de `apps/web/e2e/` en verde; 2.8 de L1D-139 escrito y en verde; `visual-check` de `/login` y del panel con evidencia en el PR |
| M-4 | **OL-06 sin ejecutar en changes que la exigen:** el umbral NLI y el modelo (L1D-180 3.1/4.4), el prompt (L1D-275 3.1), el corpus (L1D-115 2.1) y el catálogo RN-23 (L1D-193 5.1, M-10.2). Todas quedan NO-EJECUTABLES hasta US-072 (L1D-235, S2) o hasta que haya LLM real (L1D-274). CLAUDE.md la declara obligatoria en cada PR de este tipo | US-072 (L1D-235) · `ai-eval-runner` | Hacer la primera corrida de `run-ai-eval` del S2 sobre `main` con esos cuatro cambios y anotarla en cada issue. Hasta entonces, las cuatro historias siguen en In Review |
| M-5 | **US-224 (L1D-274): faltan las cifras de AC-1–AC-3 y AC-6** (mediciones humanas 1.4–1.8 en el MacBook de referencia). Además, el change no tiene delta de spec, así que ningún AC tiene escenario | Usuario (mediciones) · implementador del change | Medir con `app.scripts.adr39` tras #86 y completar el ADR-39 fase B. Antes de archivar, añadir un delta `ai-evaluation` con un escenario por AC, como hizo `l1d-102` |
| M-6 | **US-075 (L1D-238): el baseline VM-1/VM-2 no se midió antes de `/sprint-close`** (tareas 3.1–3.5; el AC-3 al AC-5 exigen `eval/vm/baseline-S1.md`). La decisión 81 lo permite sin plazo, pero el título de la historia dice "antes de cerrar el S1" y G-Demo compara contra este baseline | Usuario con los oncólogos (`S1-pendientes-humanos.md` §A) | Agendar 3.1 → 3.2/3.3 → 3.3b → 3.4/3.5. Si el planning del S2 acepta que pase al S2, registrarlo como decisión |
| M-7 | **RN-06 incompleta en la base:** `clinical.ai_analysis_record` no bloquea `DELETE` ni `TRUNCATE`. La deuda está en FEAT-PL2 sin ID ni sprint | Planning del S2 | **Historia propuesta:** *"Los registros de análisis no se pueden borrar ni truncar en la base"*, 1–2 pts, FEAT-PL2. AC: `DELETE` y `TRUNCATE` sobre `ai_analysis_record` fallan con error, y un test de integración lo verifica (`[RN-06]`) |
| M-8 | **US-231a y US-231b no tienen issue en Linear** (límite del plan gratuito), y US-231b tiene 7 tareas abiertas: el AC-6 y el AC-7 (latencia y memoria, `models`) y el AC-9 (*smoke*) sin ejecutar. Su trazabilidad solo existe en el Markdown | Usuario (Linear) · implementador de US-231b | Crear los issues cuando haya cupo (Markdown primero). Correr 1.11 y 1.12 en la VM ≥ 10 GB junto con B-2 |
| M-9 | **Deuda D-1…D-9 sin ID:** D-2 (Tailwind + shadcn) **no se hizo antes de L1D-140**, contra la decisión 47 (el panel se mergeó sin ella). D-3 bloquea M-3. D-7 ya se cumple en `main` (`quality` y Pytest completos en verde) y sigue abierta en el registro | Planning del S2 | Asignar ID a D-2, D-3 y D-9 (condición previa a G-Piloto) en el planning, y cerrar D-7 en `backlog/features/README.md` |

### Menor

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| m-1 | 22 escenarios sin tag de AC (4 en la spec principal, 18 en deltas). Todos con decisión registrada, así que no hay alcance inventado | Implementadores | Al archivar, añadir el `[US-xxx AC-n]` del AC más cercano o dejar la decisión como única cita |
| m-2 | `@pytest.mark.ac("S1", 29)` en `test_rag_query_soporte_nli.py:223`: el marcador no es `US-xxx` | L1D-180 | Usar `@pytest.mark.ac("US-064", n)` si es un AC, o quitar el marcador y citar `[S1 resp. 29]` en el docstring |
| m-3 | US-224 AC-1 (runtime): `test_medir_runtime_*` existen sin tag de AC | L1D-274 | Añadir `@pytest.mark.ac("US-224", 1)` |
| m-4 | Faltan tests para RN-11 en US-231b (el NLI nunca recibe contexto clínico) y para RN-22 en US-036, US-049, US-053 y US-059 (valores tomados de la configuración) | Cada historia | **Tests a escribir:** "el NLI no recibe `clinicalContext` ni `pseudoPatientId` cuando clasifica los pares [US-231b AC-3]"; y, por cada RN-22, uno que cambie la clave y observe el efecto |
| m-5 | La matriz se sigue regenerando con un script temporal fuera del repo (m-5 del Pre-S1) | `traceability-auditor` | Versionar el generador (`scripts/backlog/trazabilidad.py`) con aprobación |
| m-6 | Tres changes se pueden archivar ya. `l1d-106`: la 2.13b es US-231b 1.12. `l1d-203`: la 4.1b se cumple. `l1d-265`: los subpuntos de la 4.2 están en verde en `main` | Sesión principal | Marcarlas (diferida con ID / cumplida) y `openspec archive` en este cierre o en el primer chore del S2 |
| m-7 | La automatización GitHub → Linear sigue pasando a Done al mergear: este cierre devolvió 10 historias | Usuario | Desactivarla o limitarla a In Review (`S1-pendientes-humanos.md` §C) |
| m-8 | Las Features L1D-34 (FEAT-T1a), L1D-39 (FEAT-T3) y L1D-46 (FEAT-T5a) siguen en Backlog en Linear aunque tienen historias del S1 mergeadas | Orquestador / usuario | Pasarlas a In Progress en la reconciliación del S2 |

### Huecos del Pre-S1

| # | Estado |
|---|---|
| B-1 (DEC-05) | Cerrado: PR #50 (cierre de DEC-05, L1D-54) |
| M-2 (`contracts:generate:check` en CI) | Cerrado: job `contracts` en verde |
| M-3 (FR-31 sin historia) | Cerrado: lo citan US-218 y US-219 |
| M-4 (`bundleDocument`) | Historia US-223 (L1D-273, S2) |
| m-1 (`vitest.config.ts` raíz) | Cerrado (L1D-139, #35) |
| m-4 (`[L1D-nn]` en los títulos) | Cerrado para las historias; los PR de chores y decisiones no lo llevan, como corresponde |
| m-5 (generador versionado) | Abierto (m-5) |

## 4. Linear

Solo se cambió el estado y se añadió un comentario con la cadena (change, PR y tests) o con el hueco. No se crearon ni borraron issues, ni se cambiaron estimaciones ni milestones.

| Issue | Antes | Después | Motivo |
|---|---|---|---|
| L1D-197 (US-211) | Done | **In Review** | E2E del AC-1 y del AC-4 y `visual-check` (D-3); change sin archivar |
| L1D-115 (US-059) | Done | **In Review** | AC-1, AC-3, AC-4 y AC-5 sin test ejecutado (B-2); *smoke* de US-231b y evaluación 2.1 |
| L1D-193 (US-068) | Done | **In Review** | AC-4 solo E2E; tareas 5.1, 6.1 y 6.2 |
| L1D-238 (US-075) | Done | **In Review** | Baseline sin medir (tareas humanas 3.1–3.5; decisión 81) |
| L1D-180 (US-064) | Done | **In Review** | OL-06 con el NLI real (3.1 y 4.4, diferidas a L1D-235) |
| L1D-114 (US-058) | Done | **In Review** | AC-1, AC-3 y AC-4 sin test ejecutado; job de CI de la 2.4 perdido (B-1, B-2) |
| L1D-194 (US-069) | Done | **In Review** | `tasks.md` sin conciliar (0/15); `visual-check` y E2E (D-3) |
| L1D-275 (US-225) | Done | **In Review** | `tasks.md` sin conciliar (0/16); evaluación 3.1 del prompt |
| L1D-140 (US-061) | Done | **In Review** | `visual-check` y E2E (D-3); tarea 4.3 |
| L1D-274 (US-224) | Done | **In Review** | Mediciones 1.4–1.8; AC sin cifras ni escenarios |
| L1D-164, 102, 165, 105, 168, 169, 103, 179, 104 | Done | Done (confirmado) | Cadena completa con el change archivado |
| L1D-106, 203, 265 | Done | Done (confirmado) | Cadena completa; solo falta archivar (m-6) |
| L1D-139, L1D-166 | In Review | In Review | Comentario del hueco (M-3; B-1 y tareas 4.1, 4.2 y 5.2) |
| Features L1D-16, 18, 23, 30, 31, 40 | In Progress | Sin cambios | Ninguna tiene todas sus historias en Done: todas tienen historias de sprints posteriores o devueltas a In Review |
| Features L1D-34 (FEAT-T1a), L1D-39 (FEAT-T3), L1D-46 (FEAT-T5a) | Backlog | Sin cambios | Siguen en Backlog aunque tienen historias del S1 trabajadas: es un desfase del espejo (m-8). La regla de este agente solo cubre el paso a Done; el paso a In Progress lo decide el orquestador o el usuario |
