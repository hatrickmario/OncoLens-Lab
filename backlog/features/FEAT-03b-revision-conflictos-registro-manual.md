# FEAT-03b — Revisión de datos, resolución de conflictos y registro manual de biomarcadores y diagnóstico

> Linear: [L1D-13](https://linear.app/l1der-lab-mjbc/issue/L1D-13)

**Talla:** L · **Sprint:** 4 (US-107, US-108, US-110, US-111) · `si-hay-capacidad` (US-109) · **Capacidad:** CAP-03 (AC-03.2 resolución, AC-03.3 revisión de mapeos, AC-03.4) · CAP-04 (AC-04.1: "registrarlo a mano") · T-3 (AC-T3.2) · **Recorrido principal:** sí (el registro manual completa los faltantes de la hipótesis 2; los conflictos son el 2.º punto de recorte del PRD) · no (US-109)
**Requisitos:** FR-08 (dueña, vía HU-09) · FR-22 (parte S3: conflictos y términos `no_mapeado`, vía HU-17) · registro manual de biomarcadores y campos de `Diagnosis` (Q-03, V-01: contrato a incorporar en readme §4.1) · ADR-33 (normalización final en Backend 1) · RN-07, RN-08, RN-27 (regresiones)
**Evidencia:** [→ PRD §5 FR-08, FR-22, FR-23], [→ PRD §6 RN-07, RN-08, RN-27], [→ PRD §10 (`PATCH …/clinical-data/{type}/{itemId}/review`)], [→ PRD §14 (orden de recorte)], [→ PRD §18.3.3 AC-03.2–AC-03.4], [→ PRD §18.3.4 AC-04.1], [→ PRD §18.4 AC-T3.2], [→ readme §5.6 HU-09, HU-17], [→ readme §3.3 #12, #25, #33], [→ backlog/01-requisitos.md §10 V-01, §14 Q-03, Q-04], [→ backlog/02-adrs.md DEC-05, DEC-09], [→ docs/AS-IS.md P3, P4]
**Dependencias:** ↪ US-099 (conflictos detectados), US-100 (diagnósticos en revisión), US-098 (normalización final), US-090 (vista de caso) · ⛔ DEC-09 · escenario más probable (US-107 AC-4) · ⛔ DEC-05 · escenario más probable (US-110 AC-3) · 🔗 Consumida por: FEAT-04 US-004 ("Registrar a mano"), US-124 (avisos por criterio) · 🔗 Regresión [AC-T3.2] → US-070 · 🔗 Regresión [RN-17] → US-198 (Post-MVP)
**Valor:** el oncólogo es quien decide qué dato vale (PP-6): con esta Feature confirma, corrige o rechaza lo que extrajo la IA, resuelve los valores que se contradicen y, desde un dato faltante, lo registra a mano sin esperar un documento (P3, P4).
**Workaround en el MVP (US-109):** el conflicto queda `requiere_revision` y visible, y el oncólogo rechaza uno de los valores en la revisión (US-107).
**Stories:** US-107, US-108, US-110, US-111 (16 puntos, S4) · US-109 (5 puntos, `si-hay-capacidad`)

## Fixtures

- Usa **FX-03a-a** (paciente F-REC) ya procesado por FEAT-03a: Ki-67 "20 %" y "30 %" del 2026-03-01 en conflicto; diagnóstico `TNM_8` "IIIA" del 2026-06-01 en `requiere_revision` con `conflicts_with_id` al vigente "IIA"; receptor de estrógeno "80 %" en `requiere_revision`.
- **FX-03b-a · Agregados a F-REC:** un biomarcador `original_name = "receptor hormonal X"` en `no_mapeado`; un `ClinicalEvent` `toxicidad` (`ocr`, `requiere_revision`); y el paciente **F-M2** de FEAT-04 US-002 (sin Ki-67 y con `grade = null`).
- Catálogo de test `test-s2-1.0.0` (FX-01b-b) ampliado con Ki-67 (`LOINC-T-KI67`), escalas `ECOG` 0–5 y sistemas `TNM_8`, montado en ambos backends.

---

## US-107 — El oncólogo verifica, corrige o rechaza un dato extraído y confirma o descarta un diagnóstico en conflicto

> Linear: [L1D-87](https://linear.app/l1der-lab-mjbc/issue/L1D-87)

`FEAT-03b` · Sprint 4 · Estimación **5** · HU-09 · FR-08 (dueña), RN-07, RN-08 · AC-03.4, AC-02.6, AC-T3.2 · ⛔ DEC-09 · escenario más probable (AC-4) · ↪ US-100, US-098 · 🔗 Regresión [RN-07] → US-065 · 🔗 Regresión [AC-T3.2] → US-070 · 🔗 Produce para: FEAT-11a (marca de desactualizado al cambiar datos usados, S6 si hay capacidad)

## Story
Como oncólogo, quiero verificar, corregir o rechazar cualquier dato que extrajo el
sistema, y decidir yo qué diagnóstico es el vigente, para que el caso de mi paciente
refleje mi criterio.

## AC (Given/When/Then)
- **AC-1 (happy path · verificar)** · Dado el receptor de estrógeno de F-REC en
  `requiere_revision`, cuando `doc1@test.local` envía
  `PATCH /platform/patients/{id}/clinical-data/biomarker/{itemId}/review` con
  `action = verificar`, entonces responde `200` y el dato queda `verificado` con
  `reviewed_by` y `reviewed_at`. `[FR-08]` `[HU-09]`
- **AC-2 (borde · corregir)** · Dado el mismo dato, cuando envía `action = corregir` con
  `value = "90 %"`, entonces se crea un dato nuevo con `review_status = corregido` y
  `provenance.entryMethod = manual_correction`, el original pasa a `reemplazado`, y
  `/case` y el contexto del análisis solo muestran "90 %". `[FR-08]` `[HU-09]` `[AC-02.6]`
- **AC-3 (borde · rechazar)** · Dado el `ClinicalEvent` `toxicidad`, cuando envía
  `action = rechazar`, entonces queda `rechazado` y desaparece de `/case` y del
  `clinicalContext` del siguiente análisis. `[FR-08]` `[RN-07]` `[AC-02.6]`
- **AC-4 (borde · diagnóstico en conflicto)** · Dado el diagnóstico "IIIA" en
  `requiere_revision`, cuando envía `action = confirmar`, entonces "IIIA" queda
  `is_active = true` y `verificado`, "IIA" pasa a histórico (`is_active = false`) y ambos
  pierden el vínculo de conflicto; y con `action = descartar`, "IIIA" queda `rechazado` y
  "IIA" sigue vigente. `[FR-08]` `[ADR-12]` `[RN-08]`
- **AC-5 (borde · item inválido)** · Dado un `itemId` de otro paciente, un `type` fuera
  de `biomarker | diagnosis | clinical_event | prior_treatment | clinical_attribute`, o
  una acción sobre un dato ya `rechazado`, cuando se envía, entonces responde `404`,
  `422` o `409` respectivamente, sin cambios. `[PRD §10]` (asumido el `409`)
- **AC-6 (invariante · nada se resuelve solo)** · Dado F-REC con datos en revisión,
  cuando pasan los procesos de fondo (*worker* y reproceso de documentos), entonces
  ningún `review_status` cambia sin un `PATCH …/review` de un usuario. `[AC-T3.2]` `[RN-08]`

## Contexto técnico
Módulo `clinical-data-review` de `clinical-api`: un `PATCH` por tipo de dato con Zod en
el borde. Toda corrección pasa por `ReconciliationService` (US-098) para normalizar el
valor nuevo. `Biomarker` no tiene `entry_method` propio (vive en `Exam`): la corrección
se marca con `review_status = corregido` y la `provenance` la expone como
`manual_correction`.

> Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: campo `Biomarker` / `Provenance.entryMethod`): ¿la corrección de un biomarcador crea un `Exam` nuevo con `entry_method = manual_correction` o se deriva el origen de `review_status = corregido`, dado que `Biomarker` no tiene `entry_method`? El esquema está congelado desde el Pre-S1 (US-033).

Tests: Vitest + Supertest con FX-03a-a y FX-03b-a.

## INVEST
**Small** ✓ un endpoint con cuatro acciones sobre estados que ya existen.
**Testable** ✓ seis tests de integración sobre filas y salidas.

---

## US-108 — En la vista de caso tengo una lista de pendientes de revisión con sus acciones

> Linear: [L1D-88](https://linear.app/l1der-lab-mjbc/issue/L1D-88)

`FEAT-03b` · Sprint 4 · Estimación **3** · HU-09 · FR-08 (UI), NFR-12 · AC-T1.1 · ↪ US-107, US-090 · 🔗 Regresión [RN-23] → US-068

## Story
Como oncólogo, quiero ver juntos los datos que esperan mi revisión, con su valor, su
origen y su confianza, y resolverlos ahí mismo, para no buscarlos por todo el caso.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado F-REC, cuando el oncólogo abre "Pendientes de revisión"
  en la vista de caso, entonces ve cada dato en `requiere_revision` con su valor, su
  origen, su confianza y la acción "Ver documento", y las acciones "Verificar",
  "Corregir" y "Rechazar"; al verificar uno, desaparece de la lista y el contador de
  pendientes de la ficha baja en 1. `[HU-09]` `[FR-08]` `[AC-T1.1]`
- **AC-2 (borde · corregir)** · Dado un pendiente, cuando elige "Corregir", entonces el
  formulario muestra el valor original y, al guardar, la lista y la vista de caso
  muestran el valor corregido con el origen "Corrección". `[FR-08]`
- **AC-3 (borde · diagnóstico en conflicto)** · Dado el diagnóstico "IIIA", cuando se
  muestra, entonces aparece junto al vigente "IIA" con ambas fechas y las acciones
  "Confirmar como vigente" y "Descartar". `[FR-08]` `[ADR-12]`
- **AC-4 (borde · accesibilidad)** · Dada la lista, cuando se navega con teclado,
  entonces se alcanzan todas las acciones, y cada estado y confianza se lee como texto.
  `[NFR-12]`
- **AC-5 (borde · error)** · Dado un `PATCH` que responde `409`, cuando ocurre, entonces
  se muestra "Este dato ya fue revisado" y la lista se recarga. (asumido)

## Contexto técnico
Organismo `ReviewQueue` en la vista de caso (US-090), alimentado por `CaseView` (filtrado
por `reviewStatus`) y vía Route Handler hacia `PATCH …/review`. Tests: Playwright contra
Compose en perfil de test con FX-03a-a sembrado.

## INVEST
**Small** ✓ un organismo con tres acciones sobre un endpoint existente.
**Testable** ✓ cinco tests E2E.

---

## US-109 — El oncólogo resuelve los valores en conflicto y mapea los términos no reconocidos

> Linear: [L1D-89](https://linear.app/l1der-lab-mjbc/issue/L1D-89)

`FEAT-03b` · Sprint si-hay-capacidad · Estimación **5** · HU-09, HU-17 · FR-08 (conflictos y `no_mapeado`), FR-22 (parte S3), RN-27 · AC-03.2 (resolución), AC-03.3 (revisión de mapeos) · ↪ US-107, US-099, US-098 · 🔗 Regresión [RN-27] → US-098 · 🔗 Consumida por: US-124 (el aviso `en_conflicto` desaparece al resolver), US-136 · **Recorrido principal:** no · **Workaround en el MVP:** el conflicto queda `requiere_revision` y visible (US-099) y el oncólogo rechaza uno de los valores en la revisión (US-107); los términos sin mapeo quedan `no_mapeado` (RN-27)

## Story
Como oncólogo, quiero elegir cuál de dos valores contradictorios es el correcto y
asignar el código a un término que el sistema no reconoció, para que el caso deje de
mostrar avisos que ya resolví.

## AC (Given/When/Then)
- **AC-1 (happy path · conflicto)** · Dados los Ki-67 "20 %" y "30 %" en conflicto,
  cuando el oncólogo envía `action = resolver_conflicto` con `keepId` del "30 %",
  entonces el "30 %" queda `verificado`, el "20 %" `rechazado`, ninguno conserva
  `conflicts_with_id` y la `provenance` de ambos trae `conflict = false`.
  `[FR-08]` `[AC-03.2]`
- **AC-2 (borde · aviso hasta resolver)** · Dado el conflicto sin resolver, cuando se
  leen la ficha, `/case` y el contexto de un análisis, entonces el Ki-67 trae
  `provenance.conflict = true`; y después del AC-1, `false`. `[AC-03.2]`
- **AC-3 (borde · mapear término)** · Dado "receptor hormonal X" en `no_mapeado`, cuando
  el oncólogo envía `action = mapear` con `code = LOINC-T-RE`, entonces queda
  `mapping_status = mapeado`, `name` canónico del catálogo y `original_name` intacto.
  `[FR-08]` `[AC-03.3]` `[RN-27]`
- **AC-4 (invariante · código fuera del catálogo)** · Dado `code = "99999-9"`, cuando se
  envía, entonces responde `422` y el dato sigue `no_mapeado`. `[RN-27]` `[M-03.5]`
- **AC-5 (borde · lista de términos sin mapear)** · Dada la vista de caso de F-REC,
  cuando el oncólogo abre "Términos sin mapear", entonces ve "receptor hormonal X" con
  un buscador sobre los términos del catálogo vigente. (asumido en la interacción)
- **AC-6 (invariante · sin resolución automática)** · Dado un conflicto, cuando se
  reprocesa cualquiera de sus documentos, entonces el conflicto sigue igual.
  `[AC-T3.2]`

## Contexto técnico
Acciones `resolver_conflicto` y `mapear` del mismo `PATCH …/review` (US-107); el mapeo
pasa por `ReconciliationService` con la versión de catálogo cargada `[ADR-33]`. Es el 2.º
punto de recorte del PRD (§14): si DEC-03 lo activa, el conflicto queda solo detectado y
visible (US-099) y esta historia pasa a Post-MVP. Tests: Supertest (AC-1 a AC-4, AC-6) y
Playwright (AC-5).

## INVEST
**Small** ✓ dos acciones más sobre un endpoint existente.
**Testable** ✓ seis tests de integración y E2E.

---

## US-110 — Registro a mano un biomarcador o un dato del diagnóstico y queda normalizado por Backend 1

> Linear: [L1D-90](https://linear.app/l1der-lab-mjbc/issue/L1D-90)

`FEAT-03b` · Sprint 4 · Estimación **5** · HU-18 (acceso desde el checklist), HU-09 · FR-23 (registrar a mano), FR-22 (datos manuales), RN-08 · AC-04.1, AC-03.3 (manuales) · ⛔ DEC-05 · escenario más probable (AC-3) · ↪ US-033 (contrato congelado, AC-10), US-098, US-107 · 🔗 Regresión [RN-27] → US-098 · 🔗 Regresión [RN-17] → US-198 (Post-MVP) · 🔗 Consumida por: FEAT-04 US-004

## Story
Como oncólogo, quiero registrar a mano un biomarcador (p. ej., Ki-67) o completar la
histología, el grado, el estadio o el ECOG de mi paciente, para cerrar un faltante sin
esperar un documento.

## AC (Given/When/Then)
- **AC-1 (happy path · biomarcador)** · Dado F-M2 (sin Ki-67), cuando el oncólogo envía
  `POST /platform/patients/{id}/biomarkers` con `name = "Ki-67"`, `value = "20 %"`,
  `resultType = cuantitativo` y `performedAt`, entonces responde `201`; existe un `Exam`
  con `entry_method = manual` y un `Biomarker` `verificado`, `extraction_confidence = n_a`,
  `loinc_code = LOINC-T-KI67`, `mapping_status = mapeado`; y en `GET …/completeness` el
  ítem `ki67` pasa a `presente_verificado`. `[AC-04.1]` `[ADR-33]` `[Q-03]` `[§15 resp. 4]`
- **AC-2 (borde · completar el diagnóstico)** · Dado F-M2 (`grade = null`), cuando el
  oncólogo envía `POST /platform/patients/{id}/diagnoses` con `grade = "2"`, entonces se
  crea un `Diagnosis` `manual_correction`, `verificado` y `is_active = true` con los
  valores del vigente más `grade = "2"`, y el anterior pasa a `reemplazado` e
  `is_active = false`. `[Q-03]` `[FR-08]` `[RN-08]` `[§15 resp. 4]`
- **AC-3 (borde · próstata)** · Dado un paciente de próstata, cuando se registra
  `grade = "ISUP 3"`, entonces queda en `Diagnosis.grade` y el TNM sigue en
  `staging_system`/`stage_value`. `[Q-04]` `[DEC-05]`
- **AC-4 (borde · término sin mapeo)** · Dado `name = "marcador XYZ"`, cuando se
  registra, entonces se guarda con `mapping_status = no_mapeado` y sin código.
  `[RN-27]` `[AC-03.3]`
- **AC-5 (borde · validación)** · Dados `performanceScale = ECOG` con
  `performanceValue = 7`, o un `stagingSystem` que no está en el catálogo, cuando se
  envía, entonces responde `422` sin crear filas. (asumido en la lista de valores
  válidos, que sale del catálogo)
- **AC-6 (borde · sin diagnóstico vigente)** · Dado un paciente sin `Diagnosis` activo,
  cuando se envía `POST …/diagnoses` con tipo de cáncer, estadio y fecha, entonces se
  crea un `Diagnosis` `manual`, `verificado` e `is_active = true`. (asumido)

## Contexto técnico
Contrato congelado en el Pre-S1 (US-033 AC-10; respuesta 4 del usuario, `01-requisitos.md`
§15) y que se incorpora a readme §4.1 como vacío V-01 resuelto:
- `POST /platform/patients/{id}/biomarkers` — `{ name, value, unit?, resultType,
  performedAt }` → `201 Biomarker`. Crea un `Exam` `manual` (`exam_type =
  registro_manual`).
- `POST /platform/patients/{id}/diagnoses` — `{ cancerType?, histology?, grade?,
  stagingSystem?, stageValue?, performanceScale?, performanceValue?, diagnosedAt? }` →
  `201 Diagnosis`. Con diagnóstico vigente, completar o cambiar campos es una corrección
  explícita del oncólogo (nunca silenciosa, RN-08); sin vigente, crea uno `manual`.
La normalización final (CIE-10, LOINC) es de `ReconciliationService` `[ADR-33]`. El
`409` por versión de catálogo no aplica (no se llama a Backend 2). Tests: Vitest +
Supertest con F-M2 y FX-03b-a.

## INVEST
**Small** ✓ dos endpoints de alta que reutilizan la normalización y la regla de corrección.
**Testable** ✓ seis tests de integración.

---

## US-111 — Formularios de registro manual de biomarcadores y diagnóstico, prellenables desde un faltante

> Linear: [L1D-91](https://linear.app/l1der-lab-mjbc/issue/L1D-91)

`FEAT-03b` · Sprint 4 · Estimación **3** · HU-18 · FR-23 (UI de registro), NFR-12 · AC-04.1 · ↪ US-110, US-090 · 🔗 Consumida por: FEAT-04 US-004 · 🔗 Regresión [RN-23] → US-068

## Story
Como oncólogo, quiero un formulario corto para registrar un biomarcador o completar el
diagnóstico, que se abra ya preparado cuando vengo desde un dato faltante, para cerrar
el faltante en pocos segundos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la vista de caso de F-M2, cuando el oncólogo abre
  "Registrar biomarcador", escribe "Ki-67" (el autocompletado ofrece el término del
  catálogo), "20 %" y la fecha, y guarda, entonces el Ki-67 aparece en la ficha y en la
  vista de caso con el origen "Registro manual". `[AC-04.1]` `[AC-T1.1]`
- **AC-2 (borde · prellenado desde el checklist)** · Dada la URL del formulario con
  `?item=ki67` (como la abre FEAT-04 US-004), cuando se carga, entonces el nombre "Ki-67"
  ya está seleccionado. `[AC-04.1]` (asumido en el mecanismo)
- **AC-3 (borde · diagnóstico)** · Dado el formulario "Completar diagnóstico", cuando se
  abre, entonces muestra los valores vigentes y el aviso "Guardar crea una corrección
  manual del diagnóstico vigente"; al guardar `grade = "2"`, la ficha muestra el grado.
  `[Q-03]` `[RN-08]` `[§15 resp. 4]`
- **AC-4 (borde · errores)** · Dado un `422` del servidor, cuando ocurre, entonces el
  mensaje aparece junto al campo correspondiente y nada se guarda. `[PRD §10]`
- **AC-5 (borde · accesibilidad)** · Dados los dos formularios, cuando se usan con
  teclado, entonces todos los campos tienen etiqueta y los errores se anuncian en
  `aria-live`. `[NFR-12]`

## Contexto técnico
Formularios `BiomarkerManualForm` y `DiagnosisManualForm` en `apps/web`, sobre el contrato
congelado en US-033 AC-10 (`POST …/biomarkers`, `POST …/diagnoses`), reutilizados
por la sección "Datos críticos" de FEAT-04 US-004. El autocompletado consulta los
términos del catálogo a través de un endpoint de lectura del catálogo en `clinical-api`
(asumido). Tests: Playwright contra Compose en perfil de test.

## INVEST
**Small** ✓ dos formularios sobre endpoints existentes.
**Testable** ✓ cinco tests E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| V-01 / Q-03 | readme §4.1 y PRD §10: sin endpoint de registro manual de biomarcadores ni de `Diagnosis` | PRD FR-23 / AC-04.1: desde un faltante se puede "registrarlo a mano"; ADR-33: normalización de datos manuales | Q-03: historia nueva en el S3 (US-110, US-111) con contrato propuesto, a incorporar en readme §4.1 |
| C-11 / Q-04 | readme §3.2 y CLAUDE.md: `stage_value` cubre el grupo ISUP en próstata | PRD FR-23: TNM **y** Gleason/ISUP en próstata | DEC-05 (escenario): TNM en `staging_system`/`stage_value`, ISUP en `Diagnosis.grade` (US-110 AC-3) |
| — | PRD §14: orden de recorte, 2.º punto = conflictos de CAP-03 | — | US-109 es la historia recortable; la detección (US-099) no se recorta |
| Slicing v2 | PRD §14 S3 y FR-08/FR-22: revisión y resolución de conflictos en el S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): revisión y registro manual en el S4; resolución de conflictos `si-hay-capacidad` (2.º punto de recorte del PRD) | Se siguió el slicing v2; AC-03.2 (resolución) queda en US-109 `si-hay-capacidad` |
