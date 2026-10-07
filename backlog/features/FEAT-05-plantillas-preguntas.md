# FEAT-05 — Plantillas de preguntas clínicas por tipo de cáncer y escenario

> Linear: [L1D-15](https://linear.app/l1der-lab-mjbc/issue/L1D-15)

**Talla:** M (3 historias sin incertidumbre; `clinical-api` + `web`, sin pasar por `rag-orchestrator`) · **Sprint:** 6 · **Label:** `si-hay-capacidad` · **Capacidad:** CAP-05 (AC-05.2; M-05.1 de gobierno vía US-020 · DEC-10) · **Recorrido principal:** no
**Requisitos:** FR-28 (dueña) · RN-29 (regresión: todo marcador de plantilla tiene campo de destino; dueña US-001) · RN-11 (regresión; dueña US-049) · RN-22 · RN-23 (regresión; dueña US-068)
**Evidencia:** [→ PRD §5 FR-28], [→ PRD §6 RN-11, RN-23, RN-29], [→ PRD §18.3.5 AC-05.2, M-05.1], [→ PRD §17 FR-28 → HU-19, `…/question-templates`], [→ readme §4.1 `GET /platform/question-templates?cancerType=`, `questionTemplateId`], [→ readme §5 HU-19], [→ backlog/features/FEAT-T4d US-020 · DEC-10]
**Dependencias:** ↪ US-041 (catálogo montado en ambos backends; `plantillas.json`), US-042 (validador mínimo), US-043 (`ENABLED_CANCER_TYPES`), US-052 (gateway que recibe `questionTemplateId` y enmascara la pregunta), US-061, US-115 (panel con selectores) · ⛔ US-020 · DEC-10 · escenario más probable (plantillas `propuesta` sin firma mientras FEAT-05 no exista; firma cuando se construya) · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-29] → US-001
**Valor:** el oncólogo formula hoy la pregunta desde cero en cada caso (Discovery etapa 7). Una plantilla por escenario, ya completada con los datos del caso y editable, acorta ese paso y hace las preguntas comparables entre oncólogos.
**Workaround en el MVP:** pregunta libre en español o inglés (AC-05.1, US-052), que ya cubre el recorrido de la hipótesis; DEC-10 retira las plantillas firmadas de los criterios de G-Piloto (US-020 AC-3).
**Stories:** US-171, US-172, US-173 (9 puntos)

## Fixtures

- **FX-05-a · Catálogo de plantillas de test** (`plantillas.json` en el catálogo `test-tpl-1.0.0`, montado en **ambos** backends con la misma versión):
  - `mama.adyuvancia.her2` — escenario "adyuvancia", texto "¿Qué opciones adyuvantes describe la evidencia para cáncer de mama {subtipo} en estadio {estadio}?", marcadores `subtipo` → `Diagnosis.cancer_type` (subtipo), `estadio` → `Diagnosis.stage_value`; `status = propuesta`.
  - `mama.toxicidad.antiher2` — escenario "toxicidad", sin marcadores.
  - `prostata.mhspc` — escenario "enfermedad hormonosensible metastásica", marcador `estado_castracion` → `ClinicalAttribute.estado_castracion`.
  - Plantilla inválida `mama.mala` (solo en un catálogo de prueba aparte) con marcador `nombre` → `PatientIdentity.first_names`.
- Pacientes: A-M1 de FX-08b-a (mama, `TNM_8` "IIA" `verificado`, subtipo "HER2 positivo") y P-CASO de FX-02b-a (próstata, `estado_castracion = "castrado"`).

---

## US-171 — Las plantillas viven en el catálogo versionado, cada marcador tiene campo de destino y `GET /platform/question-templates` las sirve por tipo de cáncer

> Linear: [L1D-99](https://linear.app/l1der-lab-mjbc/issue/L1D-99)

`FEAT-05` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-19 · FR-28 (dueña) · AC-05.2 · ↪ US-041, US-042, US-043 · ⛔ US-020 · DEC-10 · escenario más probable · 🔗 Regresión [RN-29] → US-001

## Story
Como oncólogo asesor, quiero que las plantillas de preguntas vivan en el catálogo
versionado y que el sistema solo publique las que se pueden completar con datos reales
del modelo, para validarlas sin tocar código.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-05-a, cuando `doc1@test.local` llama a
  `GET /platform/question-templates?cancerType=mama`, entonces responde `200` con
  `mama.adyuvancia.her2` y `mama.toxicidad.antiher2`, cada una con `id`, `scenario`,
  `text`, `placeholders` y `status = propuesta`, y la versión del catálogo. `[AC-05.2]`
  `[FR-28]`
- **AC-2 (borde · marcador sin destino o con identidad)** · Dado el catálogo con
  `mama.mala`, cuando corre `catalog:validate`, entonces falla nombrando la plantilla y el
  marcador `nombre` ("los marcadores solo pueden apuntar a campos clínicos"), y el
  catálogo no se publica. `[RN-29]` `[RN-10]` (asumido en la regla de identidad)
- **AC-3 (borde · tipo no habilitado)** · Dado `cancerType=leucemia` (no está en
  `ENABLED_CANCER_TYPES`), cuando se consulta, entonces responde `200` con lista vacía y
  `cancerTypeEnabled = false`. `[RN-20]` (asumido en el código de estado)
- **AC-4 (borde · sin sesión)** · Dada una petición sin cookie de sesión, cuando se
  consulta, entonces responde `401`. `[FR-01]`
- **AC-5 (borde · versión distinta entre backends)** · Dado `rag-orchestrator` montado
  con `test-tpl-1.0.1`, cuando se ejecuta un análisis con `questionTemplateId`, entonces
  responde `409` por versión de catálogo distinta. `[NFR-14]` `[readme §3.3 #38]`

## Contexto técnico
`packages/clinical-catalogs/<version>/plantillas.json` con esquema JSON
(`id`, `cancerType`, `scenario`, `text`, `placeholders[{key, target}]`, `status`); el
validador de US-042 se amplía con la regla de marcadores (destino existente y nunca en
el schema `identity`). Endpoint en el módulo `question-templates` de `clinical-api`
(Controller → Service → Repository de catálogo, Zod en el borde). Al ser datos de
catálogo y no de paciente, no lo afectan el opt-out ni el egreso. Tests: unitarios del
validador (AC-2), Supertest con FX-05-a (AC-1, AC-3, AC-4) y de integración entre
backends (AC-5).

## INVEST
**Small** ✓ un fichero de catálogo, una regla de validación y un `GET`.
**Testable** ✓ cinco tests.

---

## US-172 — La plantilla se completa con los datos del caso, marca lo que falta y nunca inserta identidad

> Linear: [L1D-100](https://linear.app/l1der-lab-mjbc/issue/L1D-100)

`FEAT-05` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-19 · FR-28 · AC-05.2 · ↪ US-171, US-051, FEAT-04 US-002 · 🔗 Regresión [RN-11] → US-049

## Story
Como oncólogo, quiero que la plantilla llegue ya completada con el estadio, el subtipo u
otros datos del caso, y que me diga qué no pudo completar, para enviar una pregunta
precisa sin transcribir datos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado A-M1 y `mama.adyuvancia.her2`, cuando se llama a
  `GET /platform/patients/{id}/question-templates/mama.adyuvancia.her2/prefill`,
  entonces responde `200` con `text = "¿Qué opciones adyuvantes describe la evidencia
  para cáncer de mama HER2 positivo en estadio IIA?"` y `unresolved = []`. `[AC-05.2]`
  `[FR-28]`
- **AC-2 (borde · dato faltante)** · Dado un paciente sin `estado_castracion` y
  `prostata.mhspc`, cuando se completa, entonces el marcador queda como
  `[estado de castración: sin dato]`, `unresolved = ["estado_castracion"]` y nada se
  inventa. `[FR-28]` `[RN-26]` (asumido en el texto del marcador)
- **AC-3 (borde · dato sin verificar)** · Dado un valor de marcador en
  `requiere_revision`, cuando se completa, entonces se inserta y `unverified` lo lista
  para que el panel lo avise. `[FR-11]` (asumido)
- **AC-4 (invariante · identidad)** · Dado P-CASO con identidad cifrada, cuando se
  completa cualquier plantilla y se inspecciona la respuesta y el *log*, entonces no
  contienen nombre ni documento. `[RN-10]` `[RN-11]`
- **AC-5 (borde · plantilla de otro tipo)** · Dado A-M1 (mama) y `prostata.mhspc`, cuando
  se pide el prellenado, entonces responde `422` con `error =
  "plantilla_no_corresponde"`. (asumido)

## Contexto técnico
`TemplatePrefillService` en `clinical-api` resuelve cada marcador por su `target` con
los repositorios de datos clínicos (mismo criterio de "dato vigente" que la ficha, US-051)
y nunca consulta el schema `identity`. La pregunta resultante es texto libre normal: el
gateway la enmascara al enviarla (US-049) `[RN-11]`. Tests: Vitest del servicio y
Supertest con A-M1 y P-CASO (AC-1…AC-5).
> Pendiente de definir en refinamiento (dueño: usuario · afecta: AC-1, campo `prefill`): el endpoint de prellenado no figura en readme §4.1; ¿se agrega como ruta propia o el `GET /platform/question-templates` acepta `patientId` y devuelve el texto ya completado?

## INVEST
**Small** ✓ un servicio de sustitución sobre datos ya disponibles.
**Testable** ✓ cinco tests.

---

## US-173 — El panel ofrece las plantillas, permite editarlas antes de enviar y el análisis guarda qué plantilla se usó

> Linear: [L1D-101](https://linear.app/l1der-lab-mjbc/issue/L1D-101)

`FEAT-05` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-19 · FR-28, FR-09 · AC-05.2 · ↪ US-171, US-172, US-115, US-052 · 🔗 Regresión [RN-23] → US-068

## Story
Como oncólogo, quiero elegir una plantilla en el panel, ajustarla y enviarla como mi
pregunta, para empezar rápido sin perder el control de lo que pregunto.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado A-M1 en Playwright contra Compose, cuando el doctor elige
  "Adyuvancia" en el selector de plantillas, edita el texto y pulsa "Analizar evidencia",
  entonces la petición lleva el texto editado y `questionTemplateId =
  "mama.adyuvancia.her2"`, y `AIAnalysisRecord.question_template_id` lo guarda.
  `[AC-05.2]` `[readme §4.1]`
- **AC-2 (borde · faltantes en la plantilla)** · Dado un prellenado con `unresolved` no
  vacío, cuando se muestra, entonces el panel resalta el marcador sin dato con texto y
  permite enviar igual (no bloquea). `[RN-26]` `[NFR-12]`
- **AC-3 (borde · sin plantillas)** · Dado `cancerTypeEnabled = false` o una lista vacía,
  cuando se abre el panel, entonces el selector no aparece y la pregunta libre funciona
  igual. `[AC-05.1]`
- **AC-4 (borde · lenguaje)** · Dados los textos de las plantillas de FX-05-a y del
  selector, cuando corre la lista de términos prohibidos de US-068, entonces no hay
  coincidencias. `[RN-23]` `[AC-T3.4]`

## Contexto técnico
Molécula `TemplatePicker` en el panel (OL-04); el Route Handler de `web` reenvía
`questionTemplateId` (el contrato ya lo admite desde el S1). Tests: Playwright con
FX-05-a sembrado (AC-1…AC-3) y la lista de US-068 sobre el catálogo y la UI (AC-4).

## INVEST
**Small** ✓ un selector y un campo que el contrato ya admite.
**Testable** ✓ cuatro tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-28, §14 y §18.1.1 CAP-05: plantillas en el Sprint 3; readme §5.0 S3 (HU-19) | Slicing adoptado (`01-requisitos.md` §15): plantillas en el S6 si hay capacidad | Slicing: S6 `si-hay-capacidad`; la pregunta libre (AC-05.1) cubre el recorrido |
| — | PRD §14 G-Piloto y readme §5.0 S5 KR4: plantillas firmadas por el oncólogo | US-020 · DEC-10 (escenario): el PO retira el criterio del gate mientras FEAT-05 no exista | DEC-10: la firma (M-05.1) se registra cuando FEAT-05 se construya |
