# FEAT-11a — Historial de análisis, marcas de desactualizado, re-ejecución y comparación

> Linear: [L1D-26](https://linear.app/l1der-lab-mjbc/issue/L1D-26)

**Talla:** XL (6 historias; la re-ejecución atraviesa `web` → `clinical-api` → `rag-orchestrator`). **Propone división** sin cambiar IDs: **FEAT-11a-1** historial y marcas (US-174, US-175, US-176, US-179 parte de lectura) · **FEAT-11a-2** re-ejecución y comparación (US-177, US-178, US-179 parte de acciones) · **Sprint:** 6 · **Label:** `si-hay-capacidad` · **Capacidad:** CAP-11 (AC-11.1 historial, AC-11.2, AC-11.2b, AC-11.3) · T-2 (AC-T2.4: Base idéntica en el historial) · T-1 (AC-T1.4, AC-T1.5: re-ejecución auditada) · **Recorrido principal:** no
**Requisitos:** FR-12 (dueña) · RN-06, RN-15, RN-30 (regresión en la re-ejecución) · FR-18 (regresión: auditar la re-ejecución) · FR-23 (la re-ejecución recalcula faltantes)
**Evidencia:** [→ PRD §5 FR-12], [→ PRD §6 RN-06, RN-15, RN-26, RN-30], [→ PRD §18.2 "Análisis desactualizado"], [→ PRD §18.3.11 AC-11.1, AC-11.2, AC-11.2b, AC-11.3, M-11.1, M-11.2], [→ PRD §18.4 AC-T1.4, AC-T1.5, AC-T2.4], [→ readme §3.1 `AI_ANALYSIS_RECORD` (`context_fingerprint`, `corpus_release`, `catalog_version`, tabla inmutable)], [→ readme §4.1 `GET …/analyses`, `POST …/rerun`, `GET …/compare`, `staleness`, `rerunOfAnalysisId`], [→ readme §5 HU-11, HU-24], [→ readme §2.6 (detector de desactualizados, dos marcas y cascada)]
**Dependencias:** ↪ US-053 (análisis persistido con contexto y huella), US-066 (Base del análisis), US-119 (`CorpusRelease`), US-041 (versión de catálogo), FEAT-04 US-006 (`missing_critical_data` persistido), US-107, US-110 (correcciones y registros que cambian datos), US-148 (guardia de opt-out), US-056 (*rate limit*), US-150 (auditoría) · ⛔ ADR-39 (US-012) · solo para la re-ejecución con LLM real (los AC usan adapters falsos) · 🔗 Medido en: US-159 (M-11.1, M-11.2) · 🔗 Produce para: US-165 (versión más reciente en la cita), US-192 (cascada por memoria, FEAT-11c), US-195 (la evolución marca análisis desactualizados, FEAT-11b) · 🔗 Regresión [RN-15] → US-148 · 🔗 Regresión [RN-30] → US-056 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [FR-18] → US-150
**Valor:** la investigación clínica es iterativa: el oncólogo vuelve sobre un caso cuando llegan resultados nuevos. El historial le muestra qué analizó, con qué datos y qué evidencia; le avisa cuando eso cambió y le deja re-ejecutar y comparar sin perder el análisis original.
**Workaround en el MVP:** cada análisis ya queda persistido con su contexto, sus faltantes, su Base del análisis y sus versiones de corpus y catálogo (US-053, FEAT-04 US-006, US-119) y aparece como evento derivado en el timeline (US-088); el oncólogo hace un análisis nuevo con los datos actuales en lugar de re-ejecutar, y la auditoría conserva la secuencia.
**Stories:** US-174 … US-179 (26 puntos)

## Fixtures

- **FX-11a-a · Historial con cambios sembrados** (BD de test de `clinical-api`, cliente de Backend 2 falso; reloj de test 2026-10-01; catálogo `test-1.0.0`, `CorpusRelease` `rel-test-1`):
  - Paciente **P-HIST** (mama, `sintetico`, activo). Datos: `B-1` HER2 "3+" `verificado` · `B-2` Ki-67 20 % `auto_aceptado` · `D-1` `TNM_8` "IIA" `verificado` · `E-1` ECOG 1 `requiere_revision`.
  - Análisis (`analisis_evidencia` salvo indicación; todos con `clinical_context_snapshot` que lista los ids y versiones de los datos usados): `AN-H1` (B-1, D-1; `missing_critical_data = ["estado_menopausico"]`) · `AN-H2` (B-1, E-1) · `AN-H3` (D-1) · `AN-H4` (B-2) · `AN-H5` (D-1, B-2) · `AN-H6` `resumen_caso` (B-1).
  - Cambios sembrados después de los análisis: (1) corrección de `E-1` a ECOG 2 (`manual_correction`, el original pasa a `reemplazado`); (2) rechazo de `B-2`; (3) alta manual de `estado_menopausico = "posmenopausica"`.
  - **Esperado:** "Desactualizado: datos del paciente" en `AN-H1` (cambió un faltante que usó), `AN-H2`, `AN-H4` y `AN-H5`; sin marca en `AN-H3` ni en `AN-H6`.
  - `AN-H1` tiene 1 opción ("Quimioterapia combinada con terapia anti-HER2", fuente `doc-a1`) y aplicabilidad de `doc-a1` con `estado_menopausico` desconocido (`falta_en_paciente`).
  - LLM falso de la re-ejecución `RERUN-OK`: 2 opciones ("Quimioterapia combinada con terapia anti-HER2" y "Terapia endocrina adyuvante", fuente `doc-a6`), y `estado_menopausico` de `doc-a1` en "coincide".

---

## US-174 — El historial lista y muestra cada análisis previo desde su snapshot, con su contexto, sus modelos, sus versiones y la Base del análisis idéntica

> Linear: [L1D-147](https://linear.app/l1der-lab-mjbc/issue/L1D-147)

`FEAT-11a` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-11 · FR-12 (dueña) · AC-11.1 (historial), AC-T2.4, AC-T1.4 · ↪ US-053, US-066 · 🔗 Regresión [FR-18] → US-150 · 🔗 Medido en: US-159 (M-11.2)

## Story
Como oncólogo, quiero ver la lista de análisis previos del paciente y abrir cualquiera
tal como se mostró, con sus citas, sus datos y su Base del análisis, para retomar el
razonamiento sin repetir el trabajo.

## AC (Given/When/Then)
- **AC-1 (happy path · lista)** · Dado P-HIST, cuando `doc1@test.local` llama a
  `GET /platform/patients/{id}/analyses`, entonces responde `200` con los 6 análisis en
  orden descendente por fecha, cada uno con `analysisType`, `queryText` enmascarado,
  `status`, `createdAt`, `requestedBy` (UUID) y `staleness`. `[AC-11.1]` `[FR-12]`
- **AC-2 (borde · detalle idéntico)** · Dado `AN-H1`, cuando se llama a
  `GET …/analyses/{AN-H1}`, entonces `evidenceOptions`, `discardedOptions`,
  `applicability` y `analysisBasis` son byte a byte los persistidos, y trae
  `clinicalContextSnapshot`, modelos, versión del prompt, `corpusRelease` y
  `catalogVersion`. `[AC-T2.4]` `[AC-T1.4]` `[AC-11.1]`
- **AC-3 (borde · citas desde el snapshot)** · Dado que `doc-a1` tiene hoy `is_current =
  false`, cuando se abre `AN-H1`, entonces la cita muestra título, fuente y
  `chunkTextSnapshot` guardados, sin consultar a Backend 2. `[AC-11.1]` `[RN-05]`
- **AC-4 (borde · análisis de otro paciente)** · Dado `AN-H1` pedido con la ruta de otro
  paciente, cuando se llama, entonces responde `404`. (asumido)
- **AC-5 (borde · lectura con opt-out)** · Dado P-HIST con una marca de opt-out
  `analisis_ia` registrada, cuando se consulta el historial, entonces responde `200` (la
  lectura no es generación con IA). `[FR-16]` `[DEC-16]`
- **AC-6 (borde · auditoría)** · Dada la apertura del AC-2, cuando se revisa `AuditLog`,
  entonces hay un evento `evidence_analysis.read` con el UUID del paciente y del análisis,
  sin texto de la pregunta. `[FR-18]` `[RN-10]`

## Contexto técnico
Módulo `evidence-analysis` (submódulo historial) de `clinical-api`: lectura de
`AIAnalysisRecord` (tabla inmutable) paginada por `(patient_id, created_at)` (índice de
readme §3.1); `staleness` lo calcula US-175/US-176 al leer. Tests: Supertest con
FX-11a-a (AC-1…AC-6).

## INVEST
**Small** ✓ dos lecturas de una tabla ya poblada.
**Testable** ✓ seis tests de integración.

---

## US-175 — Un análisis cuyos datos cambiaron se marca "Desactualizado: datos del paciente" con la lista de cambios

> Linear: [L1D-148](https://linear.app/l1der-lab-mjbc/issue/L1D-148)

`FEAT-11a` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-24, HU-11 · FR-12 · AC-11.2 · ↪ US-174, US-053 · 🔗 Produce para: US-192 (cascada por memoria), US-195 (evolución) · 🔗 Medido en: US-159 (M-11.1)

## Story
Como oncólogo, quiero saber qué análisis se hicieron con datos que después se
corrigieron, rechazaron o completaron, y cuáles cambiaron, para no apoyarme en una
conclusión construida sobre datos viejos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-11a-a con los tres cambios aplicados, cuando se lista
  el historial, entonces `AN-H1`, `AN-H2`, `AN-H4` y `AN-H5` traen `staleness.patientData
  = true` y `AN-H3`, `AN-H6` traen `false`. `[AC-11.2]` `[FR-12]` `[M-11.1]`
- **AC-2 (borde · lista de cambios)** · Dado `AN-H2`, cuando se abre, entonces
  `staleness.changedData = ["ECOG: corregido"]`; y en `AN-H5`, `["Ki-67: rechazado"]`.
  `[AC-11.2]`
- **AC-3 (borde · faltante completado)** · Dado `AN-H1`, cuando se abre, entonces
  `changedData = ["Estado menopáusico: agregado"]` porque estaba en su
  `missing_critical_data`. `[AC-11.2]` `[FR-23]`
- **AC-4 (borde · resumen del caso)** · Dada una corrección de `B-1`, cuando se lista,
  entonces `AN-H6` (`resumen_caso`) también queda marcado. `[FR-12]`
- **AC-5 (invariante · inmutable y no bloqueante)** · Dado `AN-H2` marcado, cuando se
  revisa la BD, entonces su fila de `ai_analysis_record` no cambió (la marca se calcula
  al leer) y se puede abrir y re-ejecutar sin bloqueo. `[RN-26]` `[readme §3.1]`
- **AC-6 (borde · falso positivo)** · Dado un cambio en un dato que ningún análisis usó,
  cuando se lista, entonces ninguna marca cambia. (asumido)

## Contexto técnico
`StaleAnalysisDetector` (submódulo `stale-detector`): compara la lista de `(tipo, id,
versión)` del `clinical_context_snapshot` y los `missing_critical_data` con el estado
actual de los datos del paciente; `context_fingerprint` sirve de atajo (si coincide, no
hay cambios). La cascada por memoria la agrega US-192 cuando exista
`prior_analyses_used` con contenido. Tests: Vitest unitario del detector (las tres ramas
y el falso positivo) y Supertest con FX-11a-a.

## INVEST
**Small** ✓ un detector puro sobre datos persistidos.
**Testable** ✓ seis tests deterministas.

---

## US-176 — Un análisis muestra "Evidencia o catálogo más reciente disponible" cuando cambió la `CorpusRelease` o la versión del catálogo

> Linear: [L1D-149](https://linear.app/l1der-lab-mjbc/issue/L1D-149)

`FEAT-11a` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-24 · FR-12 · AC-11.2b · ↪ US-174, US-119, US-041

## Story
Como oncólogo, quiero distinguir un análisis con datos del paciente viejos de uno que
solo podría beneficiarse de evidencia o criterios más nuevos, para decidir si vale la pena
re-ejecutarlo.

## AC (Given/When/Then)
- **AC-1 (happy path · corpus)** · Dado `AN-H3` ejecutado con `rel-test-1` y una
  `CorpusRelease` `rel-test-2` publicada después, cuando se abre, entonces
  `staleness.newerEvidenceOrCatalog = true` y `staleness.patientData = false`.
  `[AC-11.2b]`
- **AC-2 (borde · catálogo)** · Dado el catálogo vigente `test-1.1.0` y `AN-H3` con
  `catalog_version = test-1.0.0`, cuando se abre, entonces `newerEvidenceOrCatalog =
  true`. `[AC-11.2b]` `[NFR-14]`
- **AC-3 (borde · ambas marcas)** · Dado `AN-H2` (datos cambiados) y `rel-test-2`
  publicada, cuando se abre, entonces ambas marcas son `true` y la UI las muestra por
  separado. `[AC-11.2b]` `[AC-11.2]`
- **AC-4 (borde · nada nuevo)** · Dado un análisis ejecutado con la release y el catálogo
  vigentes, cuando se abre, entonces `newerEvidenceOrCatalog = false`. `[AC-11.2b]`

## Contexto técnico
`clinical-api` conoce la `CorpusRelease` vigente por la respuesta `meta.corpusRelease` del
último análisis o por la consulta interna de US-165 (ver su Pendiente), y su propia
`CLINICAL_CATALOG_VERSION`. Tests: Vitest del detector y Supertest con FX-11a-a.

## INVEST
**Small** ✓ dos comparaciones de versión.
**Testable** ✓ cuatro tests.

---

## US-177 — Re-ejecutar con datos actuales crea un análisis nuevo, recalcula los faltantes y deja el anterior intacto

> Linear: [L1D-150](https://linear.app/l1der-lab-mjbc/issue/L1D-150)

`FEAT-11a` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-24 · FR-12 (re-ejecución), FR-23 · AC-11.3 (re-ejecución), AC-T1.5 (re-ejecutar), AC-T1.4 · ↪ US-052, US-053, FEAT-04 US-002, US-006, US-174 · 🔗 Regresión [RN-15] → US-148 · 🔗 Regresión [RN-30] → US-056 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [FR-18] → US-150

## Story
Como oncólogo, quiero re-ejecutar un análisis desactualizado con los datos actuales del
paciente y la evidencia vigente, para ver qué cambia sin perder el análisis original.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `AN-H1` marcado y el LLM falso `RERUN-OK`, cuando se
  llama a `POST /platform/evidence-analyses/{AN-H1}/rerun`, entonces responde `201` con
  un análisis nuevo con `rerunOfAnalysisId = AN-H1`, la misma `queryText`,
  `sourcesSelected`, `filtersApplied` y `questionTemplateId`, el contexto actual
  (incluye `estado_menopausico`) y `missing_critical_data = []`; la fila de `AN-H1` no
  cambia. `[AC-11.3]` `[FR-12]` `[FR-23]`
- **AC-2 (borde · opt-out)** · Dado P-HIST con opt-out `analisis_ia` registrado, cuando
  se re-ejecuta, entonces responde `403` y el cliente de Backend 2 registra cero llamadas.
  `[RN-15]` `[AC-T4.6]`
- **AC-3 (borde · rate limit)** · Dado un análisis del mismo usuario y paciente en curso,
  cuando se re-ejecuta, entonces responde `429` con `Retry-After`. `[RN-30]`
- **AC-4 (borde · persistencia)** · Dado un fallo al persistir el análisis nuevo, cuando
  se re-ejecuta, entonces responde `500` sin opciones en el cuerpo y no queda ninguna
  fila nueva. `[RN-06]` `[NFR-08]`
- **AC-5 (borde · Backend 2 caído)** · Dado el LLM local no disponible, cuando se
  re-ejecuta, entonces responde `503` y ningún adapter de nube registra llamadas.
  `[RN-12]` `[AC-06.1]`
- **AC-6 (borde · auditoría)** · Dado el AC-1, cuando se revisa `AuditLog`, entonces hay
  un evento `evidence_analysis.rerun` con los UUID del paciente, del análisis original y
  del nuevo, sin texto de la pregunta. `[AC-T1.5]` `[FR-18]` `[RN-10]`
- **AC-7 (borde · faltantes que siguen faltando)** · Dado un análisis cuyo faltante sigue
  sin dato, cuando se re-ejecuta, entonces el nuevo análisis lo lleva en
  `missing_critical_data` con `continuedWithWarning = true`. `[FR-23]` (asumido: la
  re-ejecución equivale a "Continuar con aviso")

## Contexto técnico
El *endpoint* reutiliza el `EvidenceGatewayService` de US-052/US-053 con los parámetros
del análisis original y el contexto recalculado (`ContextBuilder`, `CompletenessService`
de FEAT-04); la ruta lleva la marca `generaIA`, así que el test de cobertura de US-148
AC-3 la incluye automáticamente, y comparte el *rate limit* y el semáforo de RN-30.
Tests: Supertest con FX-11a-a y el cliente de Backend 2 falso (AC-1…AC-7).

## INVEST
**Small** ✓ reutiliza el gateway completo; la novedad es tomar los parámetros del original.
**Testable** ✓ siete tests de integración.

---

## US-178 — La comparación muestra opciones nuevas, opciones eliminadas y criterios de aplicabilidad que cambiaron

> Linear: [L1D-151](https://linear.app/l1der-lab-mjbc/issue/L1D-151)

`FEAT-11a` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-24 · FR-12 (comparar) · AC-11.3 (comparación) · ↪ US-177, US-174

## Story
Como oncólogo, quiero comparar el análisis original con su re-ejecución y ver
exactamente qué opciones aparecieron o desaparecieron y qué criterios cambiaron, para
entender el efecto de los datos nuevos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `AN-H1` y su re-ejecución `AN-H1R` (`RERUN-OK`), cuando
  se llama a `GET /platform/evidence-analyses/{AN-H1R}/compare?with={AN-H1}`, entonces
  responde `200` con `newOptions = ["Terapia endocrina adyuvante"]`, `removedOptions =
  []` y `changedCriteria = [{externalId: doc-a1, criterion: estado_menopausico, from:
  desconocido, to: coincide}]`. `[AC-11.3]` `[FR-12]`
- **AC-2 (borde · pacientes distintos)** · Dados dos análisis de pacientes distintos,
  cuando se comparan, entonces responde `422` con `error =
  "comparacion_entre_pacientes"`. (asumido)
- **AC-3 (borde · sin cambios)** · Dados dos análisis con las mismas opciones y criterios,
  cuando se comparan, entonces las tres listas vienen vacías. `[AC-11.3]`
- **AC-4 (borde · lectura con opt-out)** · Dado P-HIST con opt-out `analisis_ia`, cuando
  se compara, entonces responde `200` (no genera con IA). `[FR-16]` `[DEC-16]`
- **AC-5 (borde · sin evidencia)** · Dado un análisis `sin_evidencia` comparado con uno
  `con_evidencia`, cuando se compara, entonces todas las opciones del segundo salen como
  nuevas y no hay error. (asumido)

## Contexto técnico
Comparación determinista en `clinical-api` sobre los JSON persistidos, sin llamar a
Backend 2. Tests: Vitest del comparador y Supertest con FX-11a-a.
> Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-1, campos `newOptions`/`removedOptions`): las opciones son texto generado; ¿dos opciones son "la misma" si coinciden en texto normalizado, en el conjunto de fuentes citadas (`externalId`) o en ambos?

## INVEST
**Small** ✓ un comparador puro sobre dos documentos JSON.
**Testable** ✓ cinco tests deterministas.

---

## US-179 — Veo el historial con sus marcas, abro un análisis previo, lo re-ejecuto y comparo el resultado

> Linear: [L1D-152](https://linear.app/l1der-lab-mjbc/issue/L1D-152)

`FEAT-11a` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-11, HU-24 · FR-12, NFR-12 · AC-11.1, AC-11.2, AC-11.2b, AC-11.3 · ↪ US-174…US-178 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-26] → US-071

## Story
Como oncólogo, quiero una pantalla de historial donde vea qué análisis están
desactualizados y por qué, pueda abrir uno, re-ejecutarlo y ver la comparación, para
investigar el caso de forma iterativa.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-HIST en Playwright contra Compose, cuando el doctor abre
  "Historial de análisis", entonces ve los 6 análisis, `AN-H2` con la etiqueta de texto
  "Desactualizado: datos del paciente" y su lista "ECOG: corregido", y `AN-H3` sin
  etiqueta. `[AC-11.2]` `[AC-11.1]`
- **AC-2 (borde · dos marcas distintas)** · Dada `rel-test-2` publicada, cuando abre el
  historial, entonces `AN-H3` muestra "Evidencia o catálogo más reciente disponible" con
  un texto distinto del de `AN-H2`. `[AC-11.2b]` `[NFR-12]`
- **AC-3 (borde · re-ejecutar y comparar)** · Dado `AN-H1`, cuando pulsa "Re-ejecutar con
  datos actuales", entonces tras el análisis ve la comparación con "Opción nueva: Terapia
  endocrina adyuvante" y "Estado menopáusico: Desconocido → Coincide". `[AC-11.3]`
- **AC-4 (borde · opt-out)** · Dado P-HIST con opt-out `analisis_ia`, cuando abre el
  historial, entonces lo ve completo y el botón "Re-ejecutar" está deshabilitado con "El
  análisis con IA no está disponible para este paciente". `[RN-15]` `[RN-26]`
- **AC-5 (borde · lenguaje y aviso)** · Dada la pantalla, cuando corre la lista de
  términos prohibidos de US-068, entonces no hay coincidencias, y cada análisis abierto
  muestra el aviso de RN-19. `[RN-23]` `[RN-19]`

## Contexto técnico
Página `app/patients/[id]/analyses` en `web`; la re-ejecución va por Route Handler
(`app/api/evidence-analyses/[id]/rerun/route.ts`), no Server Action, igual que el
análisis. Tests: Playwright con FX-11a-a sembrado y LLM falso en Compose (AC-1…AC-5).

## INVEST
**Small** ✓ una página y un Route Handler sobre endpoints ya probados.
**Testable** ✓ cinco tests E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-12, §14 y §18.1.1 CAP-11: Sprint 4; readme §5.0 S4 KR2 | Slicing adoptado (`01-requisitos.md` §15): historial y re-ejecución en el S6 si hay capacidad | Slicing: S6 `si-hay-capacidad`; los análisis ya quedan persistidos y visibles como eventos derivados (*workaround*) |
| — | PRD AC-11.2: cascada a los análisis que usaron uno desactualizado como memoria | Slicing: memoria (FEAT-11c) en Post-MVP | La cascada la implementa US-192 (FEAT-11c) cuando exista la memoria; sin memoria, `prior_analyses_used` está vacío y la cascada no aplica |
