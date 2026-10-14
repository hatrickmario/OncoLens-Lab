# Pre-S1 · Auditoría de trazabilidad

> `traceability-auditor` · `/sprint-close Pre-S1` · 2026-10-13 · rama `sprint/Pre-S1-close` sobre `main` (a6c9c28).
> Insumos: [`Pre-S1-plan.md`](Pre-S1-plan.md), [`Pre-S1-status.md`](Pre-S1-status.md), `openspec/changes/archive/2026-10-13-l1d-55-contract-schema-freeze`, `openspec/specs/{api-contracts,data-model}`, `backlog/features/FEAT-00-decisiones-previas.md`, `docs/PRD.md` v1.4 §17–§18, la ejecución de Vitest sobre `scripts/contracts/__tests__` y `gh pr list`.
> La matriz completa se regeneró en [`../03-trazabilidad.md`](../03-trazabilidad.md).

## 1. Resumen del sprint

| L1D | Historia | Change archivado | Spec (openspec) | AC con escenario | AC con test | PR | Linear | Cadena |
|---|---|---|---|---|---|---|---|---|
| L1D-55 | US-033 · contrato y esquema congelados | `2026-10-13-l1d-55-contract-schema-freeze` | `api-contracts` (27 req.), `data-model` (8 req.); 98 escenarios | 18/18 | 18/18 (291 tests con tag) | #14 `[L1D-55]` mergeado el 2026-10-13 | Done | **Completa** |
| L1D-50 | US-007 · ADR-36 | — (ADR, sin change) | n/a | n/a | n/a (exento de TDD) | #10 (el título no lleva `[L1D-50]`) | Done | Completa: los AC-1…AC-7 están en `docs/architecture/adr/ADR-36-fuentes-y-licencias.md` |
| L1D-51 | US-008 · DEC-02 | — (DEC) | n/a | n/a | n/a | #13 (sin `[L1D-nn]`) | Done | Completa: `docs/decisions/DEC-02-protocolo-vm.md` |
| L1D-52 | US-009 · DEC-03 | — (DEC) | n/a | n/a | n/a | #13 | Done | Completa: `docs/decisions/DEC-03-capacidad.md` |
| L1D-53 | US-010 · DEC-04 | — (DEC) | n/a | n/a | n/a | #13 | Done | Completa: `docs/decisions/DEC-04-terminos-estandares.md` |
| L1D-54 | US-011 · DEC-05 | — (DEC) | n/a | n/a | n/a | #13 | Done | **Con hueco:** AC-1 exige la validación con firma y fecha del oncólogo, y sigue *pendiente* (ver B-1) |

- **Verificación (checkout principal):**
  - Vitest con `--exclude '.claude/**'`: 297 tests en 11 archivos, todos en verde.
  - `contracts:check`: sin hallazgos (31 reglas).
  - `openspec validate --specs --strict`: 2/2.
- **Dos verificaciones no se pudieron reproducir en este checkout** (ver M-2 y m-1):
  - `contracts:generate:check` sale con 1 porque falta `datamodel-code-generator` en el Python del sistema.
  - `npx vitest run` sin la exclusión recoge los 4 worktrees de `.claude/worktrees/`: da 1441 tests y 4 fallos.
- **Alcance inventado:** no hay.
  - Los 98 escenarios llevan su tag `[US-033 AC-n]`.
  - Los que van más allá del texto literal del AC se apoyan en decisiones registradas en US-033:
    - la vista de caso, `[resp. 34]`;
    - el login `204`, `[resp. 29]`;
    - la búsqueda `POST /patients/search`, `[resp. 22]`;
    - `CaseSummaryMeta`, `[resp. 32]`;
    - el enum `llmProvider`, `[resp. 36, 40]`.
  - 6 tests no llevan tag. Son unitarios de utilidades (`lib/pointer` y 3 de `empaquetado`), no de aceptación, así que no cuentan como alcance sin AC.
- **Regresiones 🔗 activas desde el Pre-S1:** ninguna.
- **Historias `movido-S1`:** ninguna.

### Cadena de US-033 por AC

| AC | Qué verifica | Escenarios (api-contracts / data-model) | Tests `[US-033 AC-n]` | Archivos de test | Requisitos del PRD citados |
|---|---|---|---|---|---|
| AC-1 | OpenAPI 3.1 y forma de `EvidenceAnalysis` | 10 / 0 | 30 | `check.test.mjs`, `reglas.test.mjs` | FR-09, AC-05.3, ADR-26 |
| AC-2 | Sin vocabulario v1.0 | 2 / 0 | 4 | `reglas.test.mjs` | D-01 |
| AC-3 | Ejemplos S1, sin evidencia, tipo no habilitado y S4 | 3 / 0 | 10 | `reglas.test.mjs` | FR-25, RN-02, AC-05.3 |
| AC-4 | `AnalysisBasis` (a)–(i) y `omittedClaims` | 2 / 0 | 4 | `reglas.test.mjs` | FR-27, AC-T2.1 |
| AC-5 | `Diagnosis` y `diagnosis_grading` (DEC-05) | 0 / 5 | 5 | `reglas.test.mjs` | Q-04, DEC-05 |
| AC-6 | Milvus con `EMBEDDING_DIM` parametrizada | 0 / 2 | 3 | `reglas.test.mjs` | ADR-10 |
| AC-7 | El análisis es un evento derivado | 2 / 0 | 3 | `reglas.test.mjs` | AC-11.4 |
| AC-8 | Ocho schemas compartidos con un solo origen | 3 / 0 | 8 | `empaquetado.test.mjs`, `reglas.test.mjs` | NFR-13 |
| AC-9 | `422 TIPO_NO_HABILITADO` en `/rag/query` | 2 / 0 | 4 | `reglas.test.mjs` | RN-20 |
| AC-10 | Registro manual de biomarcadores y diagnósticos | 2 / 0 | 4 | `reglas.test.mjs` | ADR-33 |
| AC-11 | Gradación en el contrato | 4 / 0 | 8 | `reglas.test.mjs` | DEC-05 |
| AC-12 | Atribución de `CitedSource` | 4 / 1 | 8 | `reglas.test.mjs` | RN-04, RN-25, ADR-36 |
| AC-13 | Seguimiento: `FollowUpTurn`, `/rag/follow-up` y `analysis_follow_up` | 13 / 4 | 30 | `reglas.test.mjs`, `rules/assertFollowUpContract.test.mjs` | RN-24, RN-12 (FR-31 está en la spec, no en la historia: M-3) |
| AC-14 | `publishedFromYear` | 2 / 0 | 4 | `reglas.test.mjs` | FR-27 |
| AC-15 | `account_status` y administrador sin lectura clínica | 1 / 5 | 8 | `reglas.test.mjs` | E-03/E-04 |
| AC-16 | Generado al día y Zod estricto | 6 / 0 | 17 | `generado`, `objetoEstricto`, `zodEstricto`, `lib/paths`, `reglas` | NFR-13 |
| AC-17 | Reglas transversales: lenguaje, aviso, anclaje, identidad, permisos y ejemplos sintéticos | 23 / 1 | 131 | `reglas.test.mjs`, `rules/assertViewByPermission.test.mjs` | RN-01, RN-03, RN-10, RN-11, RN-14, RN-19, RN-23, RN-28 |
| AC-18 | Aislamiento de `rag_corpus` en el modelo | 0 / 3 | 16 | `reglas.test.mjs`, `rules/assertDataModelDocument.test.mjs` | RN-10, readme §2.5 |

**RN citadas por US-033 y su test:**

| RN | Test |
|---|---|
| RN-01, RN-02, RN-03, RN-04, RN-10, RN-11, RN-12, RN-19, RN-20, RN-23, RN-24, RN-25, RN-28 | ≥ 1 test con su tag de AC o que nombra la RN |

**RN que la spec cita sin un test que las nombre:**

| RN | Situación | Hueco |
|---|---|---|
| RN-15 | La cubre el test de mutación del `403 OPT_OUT_ANALISIS_IA` (AC-13), aunque su nombre no cita la RN | — |
| RN-17 | `PACIENTE_EGRESADO` solo se verifica en la pasada sobre los contratos reales; no tiene parche de mutación | m-2 |
| RN-22, RN-06 | Se citan en el texto de los requisitos (configuración y persistencia antes de responder). Sus historias dueñas son posteriores al Pre-S1 | — |

## 2. Cobertura por familia (matriz regenerada)

| Familia | Universo | Con historia | Con spec (openspec) | Con test | Nota |
|---|---|---|---|---|---|
| FR | 31 | 30 | 4 (FR-09, FR-25, FR-27, FR-31) | 3 | **FR-31 sin historia que lo cite** (M-3) |
| RN | 30 | 30 | 19 | 15 | Las 15 con test son contractuales (US-033). El resto llega con sus sprints |
| NFR | 14 | 14 | 1 (NFR-13) | 1 | |
| SEG | 13 | 13 | 0 | 0 | Empiezan en el S1 (US-034, US-040…) |
| IA | 11 | 11 | 0 | 0 | |
| CAP | 11 | 11 | 0 | 0 | |
| T | 5 | 5 | 0 | 0 | |
| AC (PRD §18.3) | 54 | 54 | 2 (AC-05.3, AC-11.4) | 2 | |
| ACT | 23 | 23 | 1 (AC-T2.1) | 1 | |
| ACP | 2 | 2 | 0 | 0 | |
| M | 36 | 36 | 0 | 0 | |
| HU | 26 | 26 | 0 | 0 | |
| OL | 6 | 6 | 1 (OL-01) | 0 | |
| TBD | 21 | 21 (TBD-05 como exclusión) | 0 | 0 | |
| VM | 6 | 6 | 0 | 0 | |
| G | 16 | 16 | 0 | 0 | |

**Cambios de método respecto de la matriz de F5:**
- **Universo:** se pasa a PRD v1.4, y por eso entra FR-31.
- **Tablas "Conflictos de fuentes":** ya no se atribuyen a la última historia de su Feature. Por eso RN-29 deja de listar US-033, que solo la nombraba en la fila C-11.
- **Rangos:** `VM-1…VM-6` cuenta para cada ID del rango.
- **Tabla de historias:** se corrigió el parseo, que mezclaba texto en la columna de sprint, y se añadieron las columnas `Linear` y `Change archivado`.
- **Script:** el generador es temporal, fuera del repo (`/tmp/l1d-trace/gen.mjs`). Ver la propuesta m-5.

## 3. Huecos priorizados

### Bloqueante

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| B-1 | **US-011 · DEC-05: AC-1 sin cumplir con L1D-54 en Done.** `DEC-05-tnm-isup.md` registra la validación clínica como *pendiente* (sin firma ni fecha del oncólogo asesor). Q-1 del plan la exige **antes de US-038**, la migración inicial del S1. Si el oncólogo la rechaza, cambian `diagnosis_grading` y el contrato ya congelado de AC-5/AC-11 | Usuario + oncólogo asesor | **Propuesta de historia para el S1** (no creada; la decide el humano en `/sprint-refine S1`): *"[S1] El oncólogo asesor valida DEC-05 y su firma queda registrada antes de la migración inicial"*, 1 pt, FEAT-00, bloquea US-038. AC: (1) `DEC-05-tnm-isup.md` registra el resultado, la firma y la fecha; (2) si la rechaza, el documento registra el motivo y se abre un change de enmienda de `data-model` y `api-contracts` antes de US-038, sin diferirlo al S3 (equivale a US-011 AC-3); (3) US-038 no pasa a `en-curso` sin (1). **Alternativa más barata:** reabrir L1D-54 (US-011) en Linear hasta que haya firma, sin crear una historia, porque los IDs son inmutables y el AC ya existe |

### Mayor

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| M-1 | **Deudas que solo están anotadas en US-033 y no en su historia dueña:** el formato de `fullNameMasked`/`nationalIdMasked` (US-048, `x-pending-owner`, resp. 42); el ejemplo `SINT-` de `PatientListItem` (US-213, resp. 42); las brechas del Zod generado: `if/then`, `anyOf` y `CitedSource`/`FollowUpCitedSource` abiertos por `allOf`+`unevaluatedProperties` (US-214, resp. 33 y contract-keeper M-1). Las secciones de US-048, US-213 y US-214 no las mencionan, así que se pueden perder en su refinamiento | `/sprint-refine` del S1/S2 | **AC a añadir:** US-048, "el formato de enmascarado de `fullNameMasked` y `nationalIdMasked` queda definido y `x-pending-owner` desaparece del spec"; US-213, "existe el ejemplo `SINT-` de `PatientListItem` y `contracts:check` lo valida"; US-214, "el Zod traduce `if/then`, `anyOf` y `allOf`+`unevaluatedProperties`, o lo declara con un test que lo demuestra" |
| M-2 | **AC-16 no se puede reproducir fuera del entorno del implementador ni está en CI.** `contracts:generate:check` falla en el checkout principal sin `datamodel-code-generator` (`requirements-codegen.txt`). Hasta que llegue US-036, nada impide que lo generado diverja del spec | US-036 (S1, CI) | **AC a añadir en US-036:** la CI instala `scripts/contracts/requirements-codegen.txt` en un venv con versión fija y ejecuta `contracts:check` y `contracts:generate:check` en todo PR; el job falla si lo generado difiere |
| M-3 | **FR-31 (preguntas de seguimiento, PRD v1.4) no lo cita ninguna historia.** El PRD §17 lo mapea a US-218 y US-219, y `openspec/specs` ya lo implementa a nivel de contrato (US-033 AC-13), pero ni US-218 ni US-219 ni US-033 lo citan, y la matriz lo da como "sin historia" | Backlog (Markdown) | Añadir `FR-31` a la línea de metadatos de US-218 y US-219 (y a US-033 AC-13, junto a `[Pre-S1 resp. 14]`). Es solo trazabilidad, sin cambio de alcance: Markdown primero y Linear después, con aprobación |
| M-4 | **Deuda técnica de `lib/bundle.mjs` → `bundleDocument`** (resp. 35): el status dice "la historia se crea en `/sprint-close`" | Sesión principal (`/sprint-close`) | **Historia nueva, S2** (la crea la sesión principal, no este agente): migrar `scripts/contracts/lib/bundle.mjs` a `bundleDocument` de `@redocly/openapi-core`, con `empaquetado.test.mjs` como red de equivalencia |

### Menor

| # | Hueco | Dueño | Propuesta |
|---|---|---|---|
| m-1 | `npx vitest run` en la raíz recoge `.claude/worktrees/**` (1441 tests, 4 fallos falsos). No hay `vitest.config` en la raíz, aunque CLAUDE.md prevé uno compartido. Los 4 worktrees siguen en el disco | US-034/US-036 (monorepo y CI) · `/sprint-close` | Crear `vitest.config.ts` con `exclude: ['.claude/**', '**/node_modules/**']`. Limpiar los worktrees en este cierre |
| m-2 | **RN-17 sin test de mutación:** el `422 PACIENTE_EGRESADO` de `POST …/follow-ups` solo se verifica sobre los contratos reales; ningún parche lo quita. AC-17 pide un parche de mutación por regla, y esa rama de `assertFollowUpContract` no lo tiene. Lo mismo ocurre con `429/502/503/504` del mismo endpoint | US-214 (S2) o US-218 (S5) | **Test a escribir:** fixture en `ac-13-*.json`, *"reporta el hallazgo cuando un parche quita PACIENTE_EGRESADO del 422 de POST …/follow-ups [US-033 AC-13]"* |
| m-3 | El tag con varios AC `[US-033 AC-5 AC-6 AC-12 AC-13 AC-15 AC-18]` (test de `assertDataModelDocument` sobre los contratos reales) se aparta de la convención `[US-xxx AC-n]`. El parseo funciona, pero una herramienta que busque un solo AC no lo ve | Implementadores (convención) | Documentar en CLAUDE.md "Nombres de tests" que se admite `[US-xxx AC-a AC-b]`, o partir el test en un caso por AC |
| m-4 | Los PR #10 (ADR-36) y #13 (DEC-02…05) no llevan `[L1D-nn]` en el título: `gh pr list --search "[L1D-"` no los encuentra, aunque los cuerpos sí nombran L1D-50…54 | Sesión principal (PR de decisiones) | Desde el S1, todo PR de una historia, también los de ADR o DEC, lleva `[L1D-nn]` en el título |
| m-5 | La matriz se regenera con un script temporal fuera del repo, porque el de F5 no está versionado | `traceability-auditor` | Versionar el generador (p. ej., `scripts/backlog/trazabilidad.mjs`) con aprobación, para que cada cierre lo ejecute igual |
| m-6 | Menores residuales del Gate 2 con dueño: la prosa de `data-model.md:1315` y `readme.md:518` pide *timeouts* de `rag_corpus` que el SQL no fija (lo cubre US-040 en la migración, FEAT-PL2:167); el estado `parcial` de estadio IIA frente a "I" (regla de aplicabilidad, US-126); el aviso RN-19 en `/case/summary` (su historia); DPR m-10…m-12 | Las historias citadas | Sin acción nueva: verificar en su refinamiento |

## 4. Linear

| Issue | Antes | Después | Acción |
|---|---|---|---|
| L1D-55 | Done (cerrada por la integración al mergear el #14) | Done | Comentario de cierre con el change archivado, el PR y los tests. El estado no se tocó |
| L1D-50…54 | Done | Done | Sin cambios, según la instrucción del cierre. B-1 (L1D-54) queda para la decisión del humano |
