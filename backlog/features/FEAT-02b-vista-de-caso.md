# FEAT-02b — Vista de caso: timeline, tratamientos previos, series, tendencia y contexto ampliado

> Linear: [L1D-10](https://linear.app/l1der-lab-mjbc/issue/L1D-10)

**Talla:** XL (propone división) · **Sprint:** 3 (US-088, US-089, US-090, US-092, US-093) · `si-hay-capacidad` (US-091, US-094) · **Capacidad:** CAP-02 (AC-02.1, AC-02.2, AC-02.3, AC-02.4, AC-02.6, AC-02.7 en la vista) · CAP-06 (AC-06.2 completo) · CAP-11 (AC-11.4, parte de la vista) · T-1 (AC-T1.1) · T-4 (AC-T4.2, AC-T4.3 parte S2) · **Recorrido principal:** sí (hipótesis 1: reconstruir el caso) · no (US-091, US-094)
**Requisitos:** FR-21 (vista, dueña vía HU-15) · FR-04 (parte S2: tendencia y datos extraídos en la ficha, vía HU-02/HU-05) · NFR-03 (p95 de la vista ≤ 2 s, medido) · NFR-12 · registro manual de `PriorTreatment` y `ClinicalAttribute` (readme §4.1) · RN-07 (regresión) · RN-11 (regresión)
**Evidencia:** [→ PRD §5 FR-04, FR-21], [→ PRD §6 RN-07, RN-11], [→ PRD §7 NFR (vista de caso ≤ 2 s; accesibilidad)], [→ PRD §10 (`GET …/case`, `…/clinical-attributes`, `…/prior-treatments`)], [→ PRD §18.2 Evento derivado], [→ PRD §18.3.2 AC-02.1–AC-02.4, AC-02.6, AC-02.7, M-02.2, M-02.4], [→ PRD §18.3.6 AC-06.2], [→ PRD §18.3.11 AC-11.4], [→ PRD §18.4 AC-T1.1, AC-T4.2, AC-T4.3], [→ readme §5 HU-05, HU-15], [→ readme §4.1 `CaseView`, `Biomarker.trend`, endpoints adicionales], [→ readme §4.2 `ClinicalContext`], [→ readme §3.3 #24, #32, #33], [→ readme §6 OL-03 (contexto)], [→ backlog/02-adrs.md DEC-08], [→ docs/AS-IS.md P1, P10, JTBD 1 y 7]
**Dependencias:** ↪ US-087 (datos extraídos), US-051 (ficha), US-052 (constructor de contexto), US-053 (análisis como evento derivado) · ⛔ DEC-08 · escenario más probable (US-091) · 🔗 Consume: US-212 (descarga del PDF de origen, S3), US-080 (visor, `si-hay-capacidad`), US-098 (normalización final de lo manual) · 🔗 Consumida por: FEAT-04 US-003, US-004 (checklist en la vista) · 🔗 Regresión [FR-18] → US-102 (lectura de la vista de caso auditada) · 🔗 Regresión [RN-11] → US-049 · 🔗 Medido en: US-105 (M-02.1, M-02.2, M-02.4) · 🔗 Regresión [RN-17] → US-198 (Post-MVP, registro manual)
**Valor:** la reconstrucción manual del caso es el dolor "transversal más fuerte" del Discovery (P1; JTBD 1 y 7). Con esta Feature el oncólogo ve en una pantalla, en orden cronológico y con el origen de cada dato, el diagnóstico, los exámenes, las líneas de tratamiento previas, la evolución del PSA con su tendencia y los atributos clínicos, y el análisis de evidencia recibe ese mismo caso desidentificado.
**Workaround en el MVP:** tendencia (US-091) → la vista de caso muestra la serie fechada y el oncólogo lee la tendencia; registro manual de tratamientos previos y atributos (US-094) → cargar un documento; el registro manual cubre biomarcadores y diagnóstico (US-110, US-111).
**Stories:** US-088, US-089, US-090, US-092, US-093 (21 puntos, S3) · US-091, US-094 (8 puntos, `si-hay-capacidad`)

> **Propuesta de división (talla XL: 7 historias).** Publicar sin cambiar IDs como **02b-1 Vista de caso** (US-088, US-089, US-090) y **02b-2 Ficha, tendencia, contexto y registro manual** (US-091, US-092, US-093, US-094). 02b-1 es la que consume FEAT-04 en el S3.

## Fixtures

- **FX-02b-a · Paciente "P-CASO" (próstata, sintético)**, sembrado por `npm run seed:test -- FX-02b-a` (se niega a correr en el entorno `piloto`), con reloj de test fijo en **2026-10-01**:
  - `Patient` `sintetico`, activo, episodio abierto, convenio `CONV-TEST-01`.
  - Documentos `D1` (2025-10-05), `D2` (2026-04-12) y `D3` (2026-07-15), `completado`.
  - `Diagnosis` activo: `cancer_type = prostata`, `icd10_code = C61`, `histology = "adenocarcinoma acinar"`, `grade = "ISUP 3"` (DEC-05), `TNM_8` "T3aN0M1b", `ECOG 1`, `diagnosed_at = 2025-10-05`, `entry_method = ocr` (`D1`), `verificado`.
  - `PriorTreatment`: "Bicalutamida" (`line_number = null`, `setting = primera_linea_metastasica`, 2025-10-20 → 2025-11-15, `end_reason = completado`, `entry_method = manual`, `verificado`); "Leuprorelina" (`line_number = 1`, `atc_codes = [ATC-T-LEUP]`, inicio 2025-11-01, `ongoing = true`, `ocr` de `D1`, `verificado`).
  - `Exam` + PSA (ng/mL): 2026-01-10 = 4,1 (`D1`, `verificado`); 2026-04-12 = 6,8 (`D2`, `auto_aceptado`, con una segunda fuente `D3` en `ClinicalDataSource`); 2026-07-15 = 9,5 (`D3`, `requiere_revision`). Testosterona 2026-07-15 = 25 ng/dL (`D3`, `verificado`).
  - `ClinicalEvent`: `progresion` 2026-07-20 (`dia`, `D3`, `verificado`); `toxicidad` sin fecha (`incierta`, `D2`, `requiere_revision`, descripción "Toxicidad cutánea grado 2 en Juan Pérez CC 7654321"); `cirugia` 2025-12-01 (`D1`, **`rechazado`**).
  - `ClinicalAttribute`: `estado_castracion` = "castrado" (2026-07-15, `D3`, `auto_aceptado`); `sitios_metastasicos` = "oseo" (2025-10-05, `D1`, `verificado`).
  - `AIAnalysisRecord`: `analisis_evidencia` del 2026-08-01 y `resumen_caso` del 2026-08-02.
  - Catálogo de test `test-s2-1.0.0` (FX-01b-b) con umbral de tendencia del PSA `{ tipo: absoluto, valor: 0.5, unidad: "ng/mL" }`, montado en **ambos** backends (misma versión, para evitar el `409`).
- **Timeline esperado de P-CASO** (orden cronológico ascendente): diagnóstico 2025-10-05 · inicio de Bicalutamida 2025-10-20 · inicio de Leuprorelina 2025-11-01 · fin de Bicalutamida 2025-11-15 · examen 2026-01-10 · examen 2026-04-12 · examen 2026-07-15 · progresión 2026-07-20 · análisis de IA 2026-08-01 · resumen del caso 2026-08-02 (10 eventos fechados); "Sin fecha confiable": toxicidad.

---

## US-088 — `GET …/case` arma el timeline con eventos derivados, sin duplicados y sin datos rechazados

> Linear: [L1D-74](https://linear.app/l1der-lab-mjbc/issue/L1D-74)

`FEAT-02b` · Sprint 3 · Estimación **5** · HU-15 · FR-21 (timeline, dueña) · AC-02.1, AC-02.2, AC-02.6, AC-11.4 (vista) · ↪ US-087, US-053 · 🔗 Regresión [FR-18] → US-102 · 🔗 Medido en: US-105 (M-02.2, M-02.4)

## Story
Como oncólogo que recibe un caso complejo, quiero ver en orden cronológico todo lo que
le ha pasado a mi paciente, con el origen de cada evento, para entender rápidamente el
caso sin reconstruirlo a mano.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-CASO, cuando `doc1@test.local` llama a
  `GET /platform/patients/{id}/case`, entonces responde `200` con un `CaseView` cuyo
  `timeline` contiene los 10 eventos fechados del timeline esperado, en ese orden, cada
  uno con `eventType`, `eventDate`, `datePrecision` y `provenance` (`entryMethod`,
  `extractionConfidence`, `reviewStatus`, `sourceDocumentId`); `derived = true` en el
  diagnóstico, los tratamientos previos, los exámenes, el análisis y el resumen, y
  `derived = false` en la progresión. `[AC-02.1]` `[HU-15]` `[ADR-32]`
- **AC-2 (borde · sin duplicados)** · Dado P-CASO, cuando se arma el timeline, entonces
  cada evento derivado aparece una sola vez y la tabla `clinical_event` solo tiene filas
  de tipos sin tabla propia (`progresion`, `toxicidad`, `cirugia`). `[AC-02.1]` `[ADR-32]`
- **AC-3 (borde · sin fecha confiable)** · Dado el evento `toxicidad` con
  `datePrecision = incierta`, cuando se arma el timeline, entonces aparece con
  `eventDate = null` y `datePrecision = incierta` (la UI lo separa, US-090), y
  `pendingReviewCount` de la ficha lo cuenta aunque su revisión cambie a `verificado`.
  `[AC-02.2]` `[HU-15]`
- **AC-4 (invariante · excluidos)** · Dado P-CASO, cuando se arma el timeline, entonces
  la cirugía `rechazado` no aparece, y tampoco aparece ningún dato que un test marque
  `reemplazado`. `[AC-02.6]` `[RN-07]` `[HU-15]`
- **AC-5 (borde · análisis derivado)** · Dados los dos `AIAnalysisRecord` de P-CASO,
  cuando se arma el timeline, entonces aparecen como "Análisis de IA" y "Resumen del
  caso" con `derived = true` y no existe ninguna fila en `clinical_event` para ellos.
  `[AC-11.4]` `[readme §3.3 #32]`
- **AC-6 (borde · paciente inexistente)** · Dado un `patientId` que no existe, cuando se
  llama a `/case`, entonces responde `404` con `{ error, message }`. `[HU-15]` `[PRD §10]`
- **AC-7 (borde · paciente sin datos)** · Dado un paciente sintético sin documentos ni
  datos manuales, cuando se llama a `/case`, entonces responde `200` con
  `timeline = []`. (asumido)

## Contexto técnico
`CaseTimelineService` en `clinical-api` (determinista, sin IA) `[PRD §8]`: deriva eventos
de `Diagnosis` (`diagnosed_at`), `Exam` (`performed_at`), `PriorTreatment` (inicio y fin),
`Treatment` (S4+) y `AIAnalysisRecord` (`created_at`), y los une con `ClinicalEvent`;
excluye `rechazado`/`reemplazado`. `CaseView.completeness` viaja vacío hasta el S3
(FEAT-04 US-003) y `catalogVersion` con la versión cargada. Una consulta por entidad,
sin N+1 (M-02.4). Tests: Vitest + Supertest con FX-02b-a.

## INVEST
**Small** ✓ un servicio de lectura con una regla de derivación.
**Testable** ✓ siete tests de integración con un timeline esperado explícito.

---

## US-089 — La vista de caso agrupa los tratamientos previos por línea y muestra series de biomarcadores y atributos

> Linear: [L1D-75](https://linear.app/l1der-lab-mjbc/issue/L1D-75)

`FEAT-02b` · Sprint 3 · Estimación **5** · HU-15 · FR-21 (tratamientos, series, atributos) · AC-02.3, AC-02.4 (series), AC-02.6, AC-02.7 (vista) · ↪ US-088 · 🔗 Consume: US-099 (fuentes adicionales) · 🔗 Medido en: US-105 (M-02.2)

## Story
Como oncólogo, quiero ver las líneas de tratamiento previas agrupadas, la evolución de
cada biomarcador con todos sus valores y los atributos clínicos con su origen, para
entender la trayectoria del paciente en un vistazo.

## AC (Given/When/Then)
- **AC-1 (happy path · tratamientos)** · Dado P-CASO, cuando se llama a `/case`,
  entonces `priorTreatments` trae Leuprorelina con `lineNumber = 1`,
  `atcCodes = [ATC-T-LEUP]`, `ongoing = true` y `endedAt = null`, y Bicalutamida con
  `lineNumber = null`, `endedAt = 2025-11-15` y `endReason = completado`, cada uno con
  `provenance`; y ninguna decisión registrada en OncoLens (`Treatment`) aparece en
  `priorTreatments`. `[AC-02.3]` `[HU-15]`
- **AC-2 (borde · serie de PSA)** · Dado P-CASO, cuando se llama a `/case`, entonces
  `biomarkerSeries` trae PSA con 3 puntos en orden cronológico (4,1 · 6,8 · 9,5), cada
  uno con `unit`, `performedAt` y `provenance`, y el punto del 2026-04-12 trae
  `provenance.additionalSourceDocumentIds = [D3]`. `[AC-02.4]` `[HU-15]` `[AC-03.1]`
- **AC-3 (borde · PSA siempre serie)** · Dado un paciente de próstata con un solo PSA y
  un solo valor de testosterona, cuando se llama a `/case`, entonces `biomarkerSeries`
  incluye el PSA con 1 punto y no incluye la testosterona. `[AC-02.4]`
- **AC-4 (borde · atributos)** · Dado P-CASO, cuando se llama a `/case`, entonces
  `attributes` trae `estado_castracion` = "castrado" (`observedAt = 2026-07-15`,
  `reviewStatus = auto_aceptado`) y `sitios_metastasicos` = "oseo", con su `provenance`.
  `[AC-02.7]` `[FR-21]`
- **AC-5 (invariante · excluidos)** · Dado P-CASO con un cuarto PSA marcado `rechazado`
  por el test, cuando se llama a `/case`, entonces la serie sigue teniendo 3 puntos.
  `[AC-02.6]` `[RN-07]`

## Contexto técnico
Mismo `CaseTimelineService` (US-088), secciones `priorTreatments`, `attributes` y
`biomarkerSeries` del `CaseView` de readme §4.1. El agrupamiento por línea ordena por
`line_number` y deja al final las líneas sin número. Tests: Vitest + Supertest con
FX-02b-a.

## INVEST
**Small** ✓ tres proyecciones de lectura sobre el mismo servicio.
**Testable** ✓ cinco tests con valores esperados explícitos.

---

## US-090 — Veo la vista de caso con el timeline, la sección sin fecha confiable, los tratamientos y las series

> Linear: [L1D-76](https://linear.app/l1der-lab-mjbc/issue/L1D-76)

`FEAT-02b` · Sprint 3 · Estimación **5** · HU-15 · FR-21 (UI), NFR-12 · AC-02.1, AC-02.2, AC-02.3, AC-02.4, AC-T1.1 · ↪ US-088, US-089, US-212 (descarga del PDF de origen) · 🔗 Relacionada: US-080 (visor, `si-hay-capacidad`) · 🔗 Regresión [RN-23] → US-068 (textos nuevos) · 🔗 Consumida por: FEAT-04 US-004, US-079 (carga desde la vista)

## Story
Como oncólogo, quiero una página de vista de caso a la que llego desde la ficha, con
el timeline, los tratamientos previos, las series y los atributos, para reconstruir el
caso en una sola pantalla y abrir la fuente de cualquier dato.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el oncólogo en la ficha de P-CASO, cuando elige "Vista de
  caso", entonces ve los 10 eventos fechados en orden, cada uno con tipo, fecha, origen
  en texto ("Documento", "Registro manual", "Corrección" o "Carga inicial"), confianza y
  estado de revisión; una sección "Sin fecha confiable" con la toxicidad; los
  tratamientos previos agrupados por línea y rotulados "Tratamiento previo"; la serie del
  PSA en gráfico y en tabla; y los atributos. `[AC-02.1]` `[AC-02.2]` `[AC-02.3]` `[AC-02.4]`
- **AC-2 (borde · fuente visible)** · Dado el evento de progresión, cuando se muestra,
  entonces indica el documento `D3` y la página del valor como su fuente, con un enlace
  que descarga el PDF de `D3` por el endpoint de US-212. `[AC-02.1]` `[AC-T1.1]`
  `[FR-07]` (↪ US-212; el visor con resaltado es de US-080, `si-hay-capacidad`)
- **AC-3 (borde · origen manual)** · Dada Bicalutamida (`manual`), cuando se muestra,
  entonces lleva "Registro manual" y no ofrece "Ver documento". `[AC-T1.1]`
- **AC-4 (borde · accesibilidad)** · Dada la vista de caso, cuando se navega solo con
  teclado, entonces se alcanzan todas las secciones y acciones; la serie tiene su tabla
  equivalente al gráfico; y los estados de revisión se distinguen por texto, no solo por
  color. `[NFR-12]`
- **AC-5 (invariante · solo `web`)** · Dada la carga de la vista, cuando se inspeccionan
  las peticiones del navegador, entonces solo hay peticiones a `web`. `[CLAUDE.md]`
- **AC-6 (borde · error de carga)** · Dado `GET …/case` respondiendo `5xx`, cuando se
  abre la vista, entonces se muestra "No se pudo cargar la vista de caso" con "Reintentar"
  y sin datos parciales ni detalles internos. (asumido)

## Contexto técnico
Página `web/app/(dashboard)/patients/[patientId]/case/page.tsx` (ruta propuesta) con
organismos `CaseTimeline`, `UndatedEvents`, `PriorTreatmentsByLine`, `BiomarkerSeries`
(gráfico + tabla) y `ClinicalAttributes`; las decisiones registradas en OncoLens (S4+)
aparecerán como eventos derivados "Decisión registrada en OncoLens", distintos de
"Tratamiento previo". La sección "Datos críticos" la agrega FEAT-04 US-004 en el S3.
Tests: Playwright contra Compose en perfil de test con FX-02b-a sembrado y el mismo
catálogo de test montado en ambos backends.

## INVEST
**Small** ✓ una página con cinco organismos de lectura.
**Testable** ✓ seis tests E2E.

---

## US-091 — La tendencia de cada biomarcador se calcula con el umbral del catálogo y se muestra en la ficha, la vista de caso y el contexto

> Linear: [L1D-77](https://linear.app/l1der-lab-mjbc/issue/L1D-77)

`FEAT-02b` · Sprint si-hay-capacidad · Estimación **3** · HU-02, HU-15 · FR-04 (tendencia, S2), FR-09 (contexto con tendencia) · AC-02.4 (ficha con tendencia), AC-06.2 (tendencias) · ⛔ DEC-08 · escenario más probable · ↪ US-089, US-051, US-052 · **Recorrido principal:** no · **Workaround en el MVP:** la vista de caso muestra la serie fechada de cada biomarcador (US-089) y el oncólogo lee la tendencia; el contexto del análisis viaja sin `biomarkerTrends` calculadas

## Story
Como oncólogo, quiero ver si un biomarcador sube, baja o se mantiene respecto del valor
anterior, con un criterio de estabilidad clínico, para detectar de un vistazo una
progresión bioquímica.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-CASO y el umbral de PSA de 0,5 ng/mL, cuando se piden la
  ficha y la vista de caso, entonces el último PSA (9,5) trae `trend = sube` en
  `recentBiomarkers` y en la serie, y el análisis envía
  `clinicalContext.biomarkerTrends = [{ name: "PSA", trend: "sube", points: 3 }]`.
  `[FR-04]` `[AC-02.4]` `[AC-06.2]`
- **AC-2 (borde · estable)** · Dado un paciente con PSA 6,8 y luego 7,1, cuando se
  calcula, entonces `trend = estable` (diferencia menor que el umbral). `[FR-04]`
- **AC-3 (borde · un solo valor)** · Dado un biomarcador con un único valor, cuando se
  calcula, entonces `trend = null` y no aparece en `biomarkerTrends`. `[FR-04]`
- **AC-4 (borde · umbral desde el catálogo)** · Dado el mismo paciente del AC-2, cuando
  la misma build arranca con una versión de catálogo cuyo umbral de PSA es 0,2 ng/mL,
  entonces `trend = sube`. `[FR-04]` `[RN-22]`
- **AC-5 (borde · excluidos)** · Dado P-CASO con un PSA posterior de 2,0 marcado
  `rechazado`, cuando se calcula, entonces se ignora y la tendencia sigue en `sube`.
  `[AC-02.6]` `[RN-07]`
- **AC-6 (borde · sin umbral o cualitativo)** · Dado un biomarcador sin umbral en el
  catálogo, o cualitativo (HER2 "2+" → "3+"), cuando se calcula, entonces
  `trend = null`. (asumido)
  > Pendiente de definir en refinamiento (dueño: DEC-08 · afecta: AC-6): ¿los biomarcadores cualitativos (HER2, receptores) tienen tendencia, y con qué orden de valores?

## Contexto técnico
Regla pura `biomarker-trend.ts` en `clinical-api`, usada por la ficha (US-051), el
`CaseTimelineService` y el `ClinicalContextBuilder` (US-052) para que las tres salidas
coincidan. Compara el último valor con el anterior, ambos no `rechazado`/`reemplazado`,
con la unidad normalizada. El umbral vive en `packages/clinical-catalogs` `[FR-04]`
`[RN-22]`. Tests: Vitest unitarios de la regla y Supertest de las tres salidas.

## INVEST
**Small** ✓ una función pura usada en tres lugares.
**Testable** ✓ seis tests deterministas.

---

## US-092 — La ficha muestra los datos extraídos con su origen, confianza, revisión y semáforo

> Linear: [L1D-78](https://linear.app/l1der-lab-mjbc/issue/L1D-78)

`FEAT-02b` · Sprint 3 · Estimación **3** · HU-05 · FR-04 (parte S2: procedencia OCR y pendientes), FR-06 (origen del semáforo) · AC-T1.1 (ficha) · ↪ US-087, US-051, US-212 ("Ver documento" descarga el PDF de origen) · ⛔ DEC-09 · escenario más probable (AC-3)

## Story
Como oncólogo, quiero ver en la ficha los biomarcadores extraídos de los documentos
con su semáforo, su confianza y su estado de revisión, para revisar rápidamente al
paciente sin abrir el PDF y saber qué falta validar.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `mama-examen.pdf` del paciente semilla (a) ya
  `completado`, cuando el oncólogo abre la ficha, entonces el HER2 y el receptor de
  estrógeno extraídos muestran su `clinicalSignificance` como etiqueta con texto, su
  confianza, su estado de revisión, el origen "Documento" y la acción "Ver documento".
  `[HU-05]` `[FR-04]`
- **AC-2 (borde · pendiente de revisión)** · Dado un valor extraído con confianza `baja`
  (`requiere_revision`), cuando se abre la ficha, entonces se muestra "Pendiente de
  revisión" y `pendingReviewCount` aumenta en 1. `[HU-05]`
- **AC-3 (borde · semáforo inferido)** · Dado un biomarcador con
  `significanceSource = inferido_ia`, cuando se muestra, entonces lleva el aviso
  "Semáforo inferido por IA". `[FR-06]` `[DEC-09]`
- **AC-4 (borde · códigos)** · Dado el diagnóstico con `C50.9` y un biomarcador
  `no_mapeado`, cuando se muestra la ficha, entonces el diagnóstico muestra su código
  CIE-10 y el biomarcador muestra "No mapeado" en lugar de un código. `[FR-04]` `[RN-27]`

## Contexto técnico
Amplía `PatientSummary` y `PatientContextCard` (US-051) con la `provenance` completa de
readme §4.1. La definición de qué estados cuentan en `pendingReviewCount` sigue la nota
pendiente de US-051 AC-6. Tests: Supertest y Playwright con FX-01a-a procesado en perfil
de test.

## INVEST
**Small** ✓ ampliación de una tarjeta existente.
**Testable** ✓ cuatro tests de integración y E2E.

---

## US-093 — El contexto del análisis incluye las tendencias y los eventos extraídos, desidentificados

> Linear: [L1D-79](https://linear.app/l1der-lab-mjbc/issue/L1D-79)

`FEAT-02b` · Sprint 3 · Estimación **3** · HU-03, HU-15 · FR-09 (contexto con tendencias y eventos), RN-11, RN-07 · AC-06.2 (completo), AC-T4.2, AC-T4.3 (parte S2) · ↪ US-052, US-087 · 🔗 Relacionada: US-091 (tendencias, `si-hay-capacidad`) · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-07] → US-065

## Story
Como oncólogo, quiero que el análisis de evidencia reciba la trayectoria de mi paciente
(tendencias, eventos y líneas de tratamiento extraídos de sus documentos) sin ningún
dato que lo identifique, para que la evidencia se busque a la luz de su caso real.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado P-CASO, cuando se ejecuta un análisis con
  `rag-orchestrator` simulado, entonces el `clinicalContext` capturado trae
  `events` con la progresión (`monthsAgo = 2`) y
  sin la cirugía rechazada, `priorTreatments` con Leuprorelina y Bicalutamida con
  `monthsSinceStart`, y `currentLine = 1`. `[AC-06.2]` `[readme §4.2]`
- **AC-2 (invariante · descripción enmascarada)** · Dado el evento `toxicidad` de P-CASO
  con "Juan Pérez CC 7654321" en su descripción, cuando se captura el payload, entonces
  no contiene "Juan", "Pérez" ni "7654321", y la descripción conserva "Toxicidad cutánea
  grado 2" con marcadores de enmascaramiento. `[RN-11]` `[AC-T4.3]`
- **AC-3 (borde · etiquetas)** · Dado el PSA del 2026-07-15 en `requiere_revision`, cuando
  se captura el contexto, entonces viaja con `provenance.reviewStatus = requiere_revision`.
  `[RN-07]`
- **AC-4 (borde · fechas relativas)** · Dado el payload del AC-1, cuando se busca una
  fecha absoluta (`AAAA-MM-DD`) en `events`, `priorTreatments` o `attributes`, entonces
  no hay ninguna. `[RN-11]` `[AC-T4.2]`
- **AC-5 (borde · evento sin fecha)** · Dada la toxicidad sin fecha confiable, cuando se
  captura el contexto, entonces viaja con `monthsAgo = null`. `[readme §4.2]`

## Contexto técnico
Amplía `ClinicalContextBuilder` (US-052) con los datos que ahora llegan por OCR; las
tendencias (`biomarkerTrends`) se agregan solo si US-091 se construye (`si-hay-capacidad`),
y mientras tanto viajan vacías; la desidentificación de US-049 se aplica también a la descripción
de eventos y al esquema de tratamientos `[RN-11]`. `currentLine` = línea del
`PriorTreatment` en curso con número (asumido en la regla; si hay varias, la mayor). Tests:
Supertest con `rag-orchestrator` simulado que captura el payload, con FX-02b-a.

## INVEST
**Small** ✓ ampliación de un constructor existente con dos fuentes nuevas.
**Testable** ✓ cinco tests sobre el payload capturado.

---

## US-094 — Registro a mano tratamientos previos y atributos clínicos que no están en los documentos

> Linear: [L1D-80](https://linear.app/l1der-lab-mjbc/issue/L1D-80)

`FEAT-02b` · Sprint si-hay-capacidad · Estimación **5** · HU-15 · FR-21 (datos manuales), FR-22 (normalización de datos manuales) · AC-02.3, AC-02.7, AC-03.3 (manuales) · ↪ US-088, US-098 · 🔗 Regresión [RN-27] → US-098 · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · 🔗 Consumida por: FEAT-04 US-004 · **Recorrido principal:** no · **Workaround en el MVP:** cargar un documento con los tratamientos previos y atributos (US-076, US-085); el registro manual del MVP cubre biomarcadores y diagnóstico (US-110, US-111)

## Story
Como oncólogo, quiero registrar a mano una línea de tratamiento previa o un atributo
como el estado menopáusico cuando no viene en ningún documento, para completar el caso
de mi paciente sin esperar un informe.

## AC (Given/When/Then)
- **AC-1 (happy path · tratamiento previo)** · Dado P-CASO, cuando el oncólogo envía
  `POST /platform/patients/{id}/prior-treatments` con `lineNumber = 2`,
  `setting = segunda_linea_metastasica`, `regimenName = "Leuprorelina"`, `startedAt` y
  `ongoing = true`, entonces responde `201` con un `PriorTreatment` de
  `entry_method = manual`, `extraction_confidence = n_a`, `review_status = verificado`,
  `atc_codes = [ATC-T-LEUP]` y `mapping_status = mapeado`, y aparece en `/case`.
  `[readme §4.1]` `[ADR-33]` `[AC-02.3]`
- **AC-2 (borde · fármaco sin mapeo)** · Dado `regimenName = "Fármaco experimental X"`,
  cuando se registra, entonces se guarda con `mapping_status = no_mapeado` y sin código.
  `[RN-27]` `[AC-03.3]`
- **AC-3 (borde · atributo del catálogo)** · Dado un paciente de mama, cuando se envía
  `POST …/clinical-attributes` con `attributeKey = estado_menopausico` y
  `value = posmenopausica`, entonces responde `201`; y con `attributeKey = color_ojos`
  responde `422`. `[AC-02.7]` `[RN-29]`
- **AC-4 (borde · lectura)** · Dado un atributo marcado `reemplazado` por el test, cuando
  se llama a `GET …/clinical-attributes`, entonces no aparece. `[AC-02.6]`
- **AC-5 (borde · validación y acceso)** · Dado un body sin `regimenName`, un paciente
  inexistente o un request sin sesión, cuando se envía, entonces responde `422`, `404` o
  `401` respectivamente, sin crear filas. `[PRD §10]` `[FR-01]`
- **AC-6 (borde · desde la vista de caso)** · Dada la vista de caso, cuando el oncólogo
  usa "Agregar tratamiento previo" o "Registrar atributo" y guarda, entonces el dato
  aparece en su sección sin recargar la página. `[HU-15]` (asumido en la interacción)

## Contexto técnico
Módulos `prior-treatments` y `clinical-attributes` de `clinical-api` (Zod en el borde);
la normalización final pasa por `ReconciliationService` (US-098) con la misma versión de
catálogo `[ADR-33]`. Los valores permitidos de cada atributo vienen del catálogo; un
dato manual queda `verificado` (asumido: lo registra el propio oncólogo; DEC-01 Q1 decide
si cuenta como verificado en el checklist). Formularios reutilizables por FEAT-04 US-004.
Tests: Supertest (AC-1 a AC-5) y Playwright (AC-6).

## Non-goals
Registro manual de biomarcadores y campos de `Diagnosis` (US-110, S3). Registro de
evolución (`ClinicalEvent` manual, FEAT-11b, Post-MVP).

## INVEST
**Small** ✓ dos endpoints de alta y lectura con validación contra el catálogo.
**Testable** ✓ seis tests de integración y E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-02 | PRD §17 FR-21: "1–3" | PRD §5 FR-21: "1 (esquema), 2 (vista, extracción y resumen)"; PRD §14 S2 | PRD §5/§14: vista en el S2 |
| C-18 | readme §4.1: `POST/GET …/clinical-attributes` (S2) | PRD §10 no lo lista | readme lo complementa sin contradecir: US-094 lo implementa |
| C-05 | readme §3.2 / HU-12: la decisión crea un `ClinicalEvent` `decision_oncolens` | PRD FR-13, FR-21 (R-03), AC-11.4: evento **derivado**, sin `ClinicalEvent` | PRD: US-088 deriva el evento (cuando exista `Treatment`, FEAT-11b) |
| P-02 | readme HU-15: `403` sin pertenencia al equipo tratante (S5) | Decisión P-02: autorización por paciente fuera del MVP | P-02: sin `403` por equipo (US-204, Post-MVP) |
| — | readme §4.1 `CaseView`: sin campo propio para "Sin fecha confiable" | PRD AC-02.2: sección aparte | Sin cambio de contrato: la API marca `datePrecision = incierta` y la UI separa la sección (US-088 AC-3, US-090) |
| Slicing v2 | PRD §14 S2, FR-21 y FR-04 (tendencia en el S2); readme §5.0 S2 (HU-15) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): vista de caso en el S3; tendencia y registro manual de tratamientos y atributos `si-hay-capacidad` | Se siguió el slicing v2; AC-02.4 (tendencia) queda en US-091 `si-hay-capacidad`, con la serie visible en US-089 |
