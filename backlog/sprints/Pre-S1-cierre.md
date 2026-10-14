# Pre-S1 · Cierre: review, retro y propuestas

> `/sprint-close Pre-S1` · 2026-10-13 · Plan: [`Pre-S1-plan.md`](Pre-S1-plan.md) · Estado: [`Pre-S1-status.md`](Pre-S1-status.md) ·
> Trazabilidad: [`Pre-S1-trazabilidad.md`](Pre-S1-trazabilidad.md) · Insumos del humano: [`Pre-S1-retro-insumos.md`](Pre-S1-retro-insumos.md).
> Las mejoras de la sección 4 son **propuestas**. No se aplica ninguna sin aprobación.

## 1. Control y verificación global

| Grupo | L1D | Historia | Resultado |
|---|---|---|---|
| Archivado | L1D-55 | US-033 · contrato y esquema congelados | 18/18 tareas, PR #14 mergeado, `validate --strict` pasa. Archivado como `2026-10-13-l1d-55-contract-schema-freeze`; crea `openspec/specs/api-contracts` (27 requisitos) y `openspec/specs/data-model` (8), sin conflictos |
| Sin change (ADR/DEC) | L1D-50…54 | ADR-36, DEC-02…05 | Mergeadas (#10, #13). Done en Linear desde el 2026-10-12 |
| Movido al S1 | — | — | Ninguna |

**Verificación sobre `main` (a6c9c28):**
- **Tests:** 297 en verde en 11 archivos. Hay que excluir `.claude/worktrees/**`: sin esa exclusión, vitest recoge las copias de los worktrees y da 4 fallos falsos (ver P-7).
- **Contratos:**
  - `contracts:check` pasa sin hallazgos (31 reglas).
  - `contracts:generate:check` dice que lo generado está al día. Necesita `datamodel-code-generator` en un venv: `requirements-codegen.txt`.
  - `openspec validate --specs --strict` pasa (2/2).
- **Dependencias:** `npm audit` da 0 vulnerabilidades.
- **No aplican:**
  - `pytest`: `rag-orchestrator` solo tiene schemas generados.
  - `run-ai-eval`: no se tocó modelo, prompt, umbral, catálogo ni corpus.
- **`/opsx:verify` (L1D-55):**
  - Resultado: 18/18 tareas y 35 requisitos, con los 18 AC cubiertos por tests `[US-033 AC-n]`. Sin críticos.
  - Avisos: la brecha del Zod de `CitedSource` no está declarada en D6, y el `statement_timeout` de `rag_corpus` está en la prosa pero no en el SQL.
- **`/security-review`** (diff `364e518^..main`, 216 archivos): sin hallazgos con confianza ≥ 8.
  - Procesos hijos: usan `execFile` sin shell y con argumentos fijos.
  - YAML: se parsea con `yaml` 2.x.
  - Secretos: no hay.
  - Ejemplos: todos sintéticos (`SINT-`, `oncolens.test`).
  - Listados: la identidad va enmascarada.
  - Por debajo del umbral: `.mcp.json` usa `@latest` sin fijar versión (P-8).

## 2. Review · demo

El Pre-S1 no levanta la aplicación, así que la demo es del contrato congelado, solo con datos sintéticos:

1. `npm ci`, `npm run contracts:check` → `sin hallazgos (31 reglas)`.
2. Romper una regla aplicando un parche negativo de `scripts/contracts/__fixtures__/parches/` (por ejemplo, `sin_evidencia` con `topRelevanceScore: 0.0`). El comando falla con `ARCHIVO:ruta — regla — AC/RN — mensaje` (RN-02).
3. Ejecutar `npm run contracts:generate:check`. El TS, el Zod estricto y el Pydantic se regeneran y no hay diferencias.
4. Recorrer `contracts/examples/rag-query-con-evidencia.json` y `rag-query-sin-evidencia.json`:
   - el encabezado no es prescriptivo y lleva el aviso de RN-19;
   - cada cita copia sus metadatos del catálogo;
   - `sin_evidencia` lleva `topRelevanceScore: null`.
5. Abrir `docs/architecture/data-model.md`:
   - la tabla `diagnosis_grading` (DEC-05);
   - el aislamiento del rol `rag_corpus`;
   - `account_status` y la matriz de permisos;
   - el listado enmascarado.

**AC que el sprint acerca:**
- `AC-05.3`: forma congelada de `EvidenceAnalysis`.
- `AC-T2.1`: `AnalysisBasis` completo.
- `AC-11.4`: el análisis como evento derivado.
- La base contract-first de G-Demo. Desde aquí, cada mock (MSW/`respx`) sale de `contracts/examples/` (US-213).

## 3. Retro · resumen

| | Planificado | Completado |
|---|---|---|
| Historias | 6 (US-007…011, US-033) | 6 |
| Puntos | 17 | 17 |
| PRs | — | #10 (refinamiento + ADR-36), #11 (readme), #12 (planificación), #13 (DEC-02…05), #14 (L1D-55) |

- **Duración de L1D-55:** del 2026-10-12 al 2026-10-13, unos 3 días de reloj si se cuentan las esperas por límite de uso.
  - Volumen: 164 archivos, +20.4k/−1.6k líneas, 297 tests.
  - Cortes del implementador: **4** por límite de uso (3 de sesión y 1 semanal).
  - Cortes en total: el usuario contó **6** en la sesión del plan Pro, incluidos los del orquestador.
- **Gate 2 por guardián:**

| Guardián | Vuelta 1 | Vuelta 2 | Re-ejecución acotada (resp. 41) |
|---|---|---|---|
| privacy-guardian | FAIL (4 Mayores) | FAIL (1 Mayor: regresión introducida por una corrección de la vuelta 1) | PASS |
| contract-keeper | FAIL (5 Mayores) | PASS | n/a |
| design-principles-reviewer | FAIL (2 Bloqueantes, 8 Mayores) | PASS con 1 Mayor | PASS |
| clinical-language-auditor | PASS (2 Mayores) | PASS | PASS (solo ejemplos) |

- **Decisiones del refinamiento que cambiaron durante el sprint:**
  - D10 (`RagMeta` se separa de `CaseSummaryMeta`, resp. 32).
  - D2 (empaquetador propio, resp. 35).
  - D6 (Zod estricto y brecha `if/then` para US-214, resp. 33).
  - `CaseView` restituido (resp. 34).
  - Listado y búsqueda con identidad enmascarada (resp. 36).
  - Todas están registradas como resp. 30–43 en US-033.
- **design-principles-reviewer por prioridad:**
  - P1: 2 Bloqueantes en la vuelta 1 (lista muerta de RN-02 y detección de nombres reales), corregidos.
  - P2: 8 + 1 Mayores, todos refactorizados antes del PR.
  - P3: m-1…m-12 en el cuerpo del PR #14.
  - **Ninguna violación P1 se repitió** entre vueltas.
  - **Patrón repetido:** reglas con **listas literales propias** en lugar del vocabulario compartido de `lib/identity.mjs` (DPR M-1 y PG #1/#2) → P-6.
- **Deuda técnica:**
  - `bundleDocument` para el S2 (resp. 35) → historia nueva (sección 5).
  - Brechas del Zod → US-214.
  - Formato de la máscara → US-048.
  - Ejemplo de `PatientListItem` → US-213.
  - Timeout de `rag_corpus` → US-038.
- **TDD:**
  - No hubo `Test-Removal` ni tests debilitados.
  - El guard se desactivó de forma puntual tres veces, con aprobación (resp. 30, 38 y 41). Una desviación quedó fuera de la lista literal (`assertFollowUpContract.mjs`), dentro del alcance aprobado.
  - Hubo dos esquives (resp. 31): `.txt` + `mv`, que funciona porque `*.txt` está en `ignorePatterns`, y `sed -i`.
- **Piloto TDD Guard (datos preliminares).** La evaluación formal es en la retro del S1.
  - `reports/tdd-guard/pilot.jsonl` registra 328 decisiones, **todas `allow`**, con p50 0,16 s y p95 **5,52 s**, por encima del umbral de 5 s.
  - **Los bloqueos reales que vivió el implementador no quedaron registrados.** El hook resuelve `$CLAUDE_PROJECT_DIR` al checkout principal y lee el `test.json` de ahí, no el del worktree.
  - Así que el piloto **no se puede medir** tal como está → P-5.

## 4. Retro · mejoras propuestas (sin aplicar)

| # | Mejora | Origen | Cambio concreto |
|---|---|---|---|
| P-1 | Modelos por fase | Usuario (R-1) | El diff A, más fijar en `.claude/README.md` que `/sprint-refine` y `/sprint-start` se corren con Opus 5.5 y esfuerzo medio |
| P-2 | Definition of Done por tipo | Usuario (R-2) | Nuevo `docs/process/definition-of-done.md` para Feature, US, bug, refactor, ADR/DEC y *spike*. Consolida la matriz TDD, los gates, `contracts:check`, `openspec validate`, `evaluate` y el estado en Linear. Lo citan `gate-review` y `sprint-close` |
| P-3 | ADR en formato MADR | Usuario (R-3) | Plantilla `docs/architecture/adr/_plantilla-madr.md` y el diff C. Se aplica desde ADR-39; ADR-36 se mantiene |
| P-4 | Linear en curso | Usuario (R-4) | Diff B: el orquestador pasa la historia a In Progress al despacharla y a In Review al abrir el PR. Done sigue en `/sprint-close` |
| P-5 | Historias pequeñas y gates baratos | Usuario (R-5) + datos | Diff C: criterio de tamaño en la DoR (≤ 5 pts y ≤ 8 AC, o justificación). Gate 2 acotado al diff nuevo desde la vuelta 2. En `/sprint-refine S1`, partir US-012 (ADR-39), US-055 y US-072 si caen en el S1; US-082, US-117 y US-143 cuando lleguen |
| P-6 | Vocabulario compartido en reglas | P2 repetido | Regla en `openspec/config.yaml` (diff D): las reglas de `scripts/contracts` usan `lib/identity.mjs` y `lib/paths.mjs`, nunca listas literales propias |
| P-7 | Piloto TDD Guard medible en worktrees | Datos del piloto | Antes del S1: (a) `tdd-guard-pilot.sh` usa la raíz del worktree (`git rev-parse --show-toplevel`) para `test.json` y para el log; (b) quitar `*.txt` de `ignorePatterns`; (c) `tdd-guard-vitest` como devDependency del repo, no en `/tmp`. Sin (a), la retro del S1 no tendrá datos |
| P-8 | Higiene del entorno | Verificación | `vitest.config.ts` en la raíz con `exclude: ['.claude/**', '**/node_modules/**']`; fijar versiones en `.mcp.json`; documentar el venv de codegen en `.claude/README.md` |
| P-9 | Reanudar tras un límite de uso | 4 cortes | El orquestador y los implementadores hacen push tras cada commit, que ya se adoptó a mitad de sprint, y el reporte nombra el último commit pusheado. La sesión principal guarda en el archivo de estado los insumos que hoy van a `/tmp` (parches, rojo/verde), porque `/tmp` no persiste entre sesiones |

**Diff A · `.claude/agents/sprint-orchestrator.md` (P-1)**
```diff
-model: opus
-effort: high
+model: sonnet
+effort: medium
```
*A decidir aparte:* los guardianes en Opus con esfuerzo alto (privacy-guardian, design-principles-reviewer y traceability-auditor) gastaron entre 130k y 250k tokens por vuelta. Una opción es bajarlos a esfuerzo medio en las re-ejecuciones acotadas.

**Diff B · `.claude/agents/sprint-orchestrator.md` (P-4)**
```diff
+## Linear (solo estado)
+- Al despachar una historia: `save_issue(id, state: "In Progress")`.
+- Al abrir su PR: `save_issue(id, state: "In Review")`.
+- Nada más: sin comentarios, campos ni issues nuevos. Done lo pone traceability-auditor en /sprint-close.
```

**Diff C · `.claude/skills/sprint-refine/SKILL.md` (P-3, P-5)**
```diff
 | Estimación | Tiene puntos; ninguno `?` |
+| Tamaño | ≤ 5 pts y ≤ 8 AC; si no, se parte con aprobación o queda una justificación escrita |
@@
-- ADR → `docs/architecture/adr/ADR-<n>-<slug>.md` (contexto, opciones, decisión, consecuencias);
+- ADR → `docs/architecture/adr/ADR-<n>-<slug>.md` en formato MADR (`_plantilla-madr.md`);
```

**Diff D · `openspec/config.yaml` (P-6)**
```diff
+  - Las reglas de scripts/contracts toman nombres de identidad, campos enmascarados y rutas de
+    lib/identity.mjs y lib/paths.mjs; una lista literal propia en una regla es un hallazgo Mayor.
```

## 5. Historias propuestas para el backlog (no creadas)

- **Deuda técnica (S2), aprobada en la resp. 35:** "`scripts/contracts` empaqueta los specs con `bundleDocument` de `@redocly/openapi-core` en memoria, en lugar de `lib/bundle.mjs`, sin cambiar la salida". 2 pts, FEAT-PL1. Se crea con la aprobación del cierre, primero en Markdown y después en Linear.
- **Huecos Bloqueantes de trazabilidad:** ver `Pre-S1-trazabilidad.md`.

## 6. Pendiente fuera del repo

- **Q-1:** el oncólogo asesor debe validar DEC-05 antes de US-038 (S1).
- **Limpieza local:**
  - worktrees superados en `.claude/worktrees/` (`agent-ad4d…`, `agent-ae97…`, `agent-a07a…`, `agent-a64e…`);
  - temporales en `/tmp` (`l1d55-wip`, `d7-pendiente`, `l1d55-pr`).
  - `.claude/agent-memory/` decide el humano si se versiona.

## 7. Decisiones del cierre (usuario, 2026-10-13), aplicadas en este PR

| # | Decisión | Aplicado en |
|---|---|---|
| P-1 | Los implementadores siguen en Sonnet, porque con tareas bien definidas Sonnet basta. `/sprint-run` pasa a Sonnet con esfuerzo medio (R-1). Un sprint de una sola historia se corre con `/implement-story`, sin orquestador | `.claude/agents/sprint-orchestrator.md` (`model: sonnet`, `effort: medium`); `.claude/skills/sprint-run/SKILL.md` |
| P-2 | DoD por tipo de historia, con el texto del usuario más dos ajustes aprobados: contract-first en lugar de "OpenAPI auto-generada", y la cobertura que bloquea solo en un refactor. Se añaden ADR/DEC, *spike*, Feature y las condiciones comunes | `docs/process/definition-of-done.md`, `.github/pull_request_template.md`, `CLAUDE.md` (cobertura) |
| P-3 | MADR 4 mínima en español, índice de ADR y plantilla ligera de DEC | `docs/architecture/adr/_plantilla-madr.md`, `docs/architecture/adr/README.md`, `docs/decisions/_plantilla-dec.md`, `sprint-refine` |
| P-4 | Solo la integración GitHub–Linear (L1D-55 pasó a Done sola al mergear). El orquestador no toca Linear. **Pendiente del humano:** comprobar en Linear (Settings → Team L1D → Workflow → GitHub) que la rama pushea a In Progress y el PR abierto pasa a In Review | `sprint-orchestrator.md` (regla) |
| P-5 / P-9 / P-10 / P-11 | Límite de tamaño en la DoR (≤ 5 pts y ≤ 8 AC; partir por superficie). Gate 2 acotado desde la vuelta 2. Push tras cada commit y WIP en `wip/l1d-<nn>`, nunca en `/tmp`. Auto-revisión con los checklists de los guardianes. Los Menores no se escalan | `sprint-refine`, `gate-review`, `implement-story`, `sprint-orchestrator` |
| P-6 / P-8 | Pasan como tareas a US-036 (S1): `vitest.config.ts` en la raíz, versiones fijas en `.mcp.json` y un test que prohíbe listas literales en las reglas de `scripts/contracts` | `FEAT-PL1` US-036 (Markdown y Linear) |
| P-7 | **TDD Guard se retira ya.** La evidencia de TDD es el orden de commits `test → feat` que comprueba el Gate 2 | Hook, configuración y `.gitignore` eliminados; `clinical-platform-dev.md`, `.claude/README.md`, `CLAUDE.md`, `sprint-close`, `sprint-refine`, FEAT-PL1 |
| B-1 | L1D-54 (DEC-05) se reabre a In Progress hasta la firma del oncólogo; bloquea US-038 | FEAT-00 US-011 y Linear (estado y comentario) |
| M-1 | AC de la deuda en las historias dueñas: US-048 AC-7 (formato de máscara), US-213 AC-12 (ejemplo de `PatientListItem`) y US-214 AC-6 (brechas del Zod) | Markdown y Linear |
| M-2 | US-036 AC-7: la CI instala el venv de codegen y corre `contracts:generate:check` | Markdown y Linear |
| M-3 | FR-31 citado en US-218 y US-219 | Markdown y Linear |
| M-4 | US-223 (L1D-273), migrar a `bundleDocument`, FEAT-PL1, S2, 2 pts. S2 pasa a 93 + `?`, MVP a 525 y backlog a 815 | FEAT-PL1, `backlog/features/README.md`, `CLAUDE.md`, Linear |

**A vigilar en `/sprint-refine S1`:** con la nueva regla de tamaño, US-213 queda en 12 AC y su re-estimación propuesta es de 8 pts, así que **hay que partirla**. US-012 (ADR-39), US-055 y US-072 (8 pts) también se parten si entran en el sprint.
