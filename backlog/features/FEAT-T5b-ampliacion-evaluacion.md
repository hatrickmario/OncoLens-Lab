# FEAT-T5b — Ampliación de la evaluación: ingesta, caso, reconciliación, faltantes, aplicabilidad y recuperación híbrida

> Linear: [L1D-47](https://linear.app/l1der-lab-mjbc/issue/L1D-47)

**Talla:** XL (Feature completa, propone división por sprint) · **Sprint:** 3 (US-103, US-105) · 4 (US-131) · 5 (US-132, US-140, US-142, → G-Demo) · `si-hay-capacidad` (US-104, US-106, US-133, US-141) · **Capacidad:** T-5 (AC-T5.1, AC-T5.3, AC-T5.4 por regresión) · **Recorrido principal:** sí (mide las hipótesis 1, 2 y 3) · no (US-104, US-106, US-133, US-141)
**Requisitos:** FR-20 (ampliación de datasets y métricas, OL-06) · TBD-03 (umbrales de confianza OCR, CAL) · medibles técnicos: M-01.1, M-01.2, M-01.3, M-02.1, M-02.2, M-02.3, M-02.4, M-03.1–M-03.5 (S2) · M-04.1, M-04.2, M-08.2, M-08.3, M-08.4, M-08.6, M-06.1 sin retroceso (S3) · M-10.1 y M-10.2 con hasta 3 opciones, M-07.2 con hasta 3 opciones, orden por aplicabilidad (RN-28), M-06.2 recalibrado (S5, en US-142) · verificación de G-Demo redefinido (S5) · G-6, G-7, G-8 (documentos), G-11, G-12, G-13
**Evidencia:** [→ PRD §5 FR-20], [→ PRD §2.1 G-6, G-7, G-8, G-11, G-12, G-13], [→ PRD §7 NFR (extracción ≤ 60 s; vista de caso ≤ 2 s)], [→ PRD §12 Evaluación], [→ PRD §16 TBD-02, TBD-03, TBD-20], [→ PRD §18.3.1 M-01.1–M-01.3], [→ PRD §18.3.2 M-02.1–M-02.4], [→ PRD §18.3.3 M-03.1–M-03.5], [→ PRD §18.3.4 M-04.1, M-04.2], [→ PRD §18.3.6 M-06.1], [→ PRD §18.3.8 M-08.2–M-08.4, M-08.6], [→ PRD §18.4 AC-T5.1, AC-T5.3, AC-T5.4], [→ readme §6 OL-05 (tests de exactitud), OL-06 (datasets v1.1 y v1.2)], [→ readme §5.0 S2 KR1–KR4, S3 KR1, KR3, KR4], [→ backlog/02-adrs.md §4.1 TBD-03, TBD-20], [→ PRD §18.3.10 M-10.1, M-10.2], [→ PRD §2.1 G-2, G-5, G-14], [→ PRD §14 G-Demo], [→ readme §5.0 S4 KR1], [→ backlog/01-requisitos.md §15 (slicing por hipótesis: G-Demo redefinido)]
**Dependencias:** ↪ US-072 (*runner* y reporte), US-074 (suite en la DoD), US-014 · ADR-41 · ⛔ ADR-39 (motores de OCR, LLM y NLI fijados para las mediciones reales) · ⛔ DEC-07 · escenario más probable (metas y umbrales de regresión) · 🔗 Mide a: FEAT-01b, FEAT-02b, FEAT-03a (S3) · FEAT-04, FEAT-06c (S4) · FEAT-08b (S5) · FEAT-10c, FEAT-10b (S5) · 🔗 Consume: US-139 (reporte de feedback), US-024 · DEC-14 (VM-3) para G-Demo
**Valor:** la hipótesis solo se valida con números: cuántos datos del documento se leen bien, si el caso reconstruido es fiel, si los faltantes se detectan y si la aplicabilidad no inventa nada. Esta Feature amplía la suite del S1 con los datasets sintéticos de cada capacidad nueva, para que todo cambio de modelo, prompt, umbral, catálogo o corpus se mida contra ellos.
**Workaround en el MVP:** US-104 → umbrales del OCR con valores iniciales en configuración; US-106 → invariantes en los tests de US-086, US-098 y US-099; US-133 → sin híbrida no hay retroceso que medir; US-141 → se integra en US-142 (AC-7).
**Stories:** S3: US-103, US-105 (10 puntos) · S4: US-131 (3 puntos) · S5: US-132, US-140, US-142 (15 puntos) · `si-hay-capacidad`: US-104, US-106, US-133, US-141 (14 puntos)

> **Propuesta de división (talla XL).** Publicar como una Feature por sprint sin cambiar IDs: **T5b-S3 Ingesta y caso** (US-103, US-105), **T5b-S4 Faltantes** (US-131) y **T5b-S5 Aplicabilidad, opciones y G-Demo** (US-132, US-140, US-142); US-104, US-106, US-133 y US-141 quedan `si-hay-capacidad` (slicing v2). Las discrepancias sembradas (M-07.1) y la búsqueda complementaria (M-08.5) quedan con sus Features diferidas (FEAT-07, S6; FEAT-08c, Post-MVP; lote 4).

## Fixtures

- **FX-T5b-a · Datasets sintéticos** en `data/evaluation/` (todos con `clase: sintetico` en su manifiesto; los reales anonimizados viven fuera del repo y se pasan por ruta local):
  - `ocr/` — PDFs sintéticos de mama y próstata (digitales y escaneados, en español) con la verdad por campo marcada `critico | no_critico`, y PDFs con PII sembrada.
  - `eventos/` — documentos con eventos, tratamientos previos y atributos de tipo y fecha conocidos.
  - `reconciliacion/` — pares de documentos con duplicados y conflictos sembrados y términos con su código esperado (incluidos sinónimos en español e inglés).
  - `faltantes/` — pacientes con faltantes sembrados y su checklist esperado por catálogo (se basan en F-M1…F-P1 de FEAT-04 US-002).
  - `aplicabilidad/` — pares paciente-fuente con el estado esperado por criterio.
  - `opciones/` (S4) — 12 casos sintéticos (6 de mama, 6 de próstata) con pregunta terapéutica, las opciones que describe el corpus de test y el orden esperado por RN-28 dado el resumen de aplicabilidad de cada opción; 4 de ellos marcados `revisada_por_oncologo` (DEC-06) y 2 con una opción cuya única fuente es no comparable.
- Configuración de test `eval/configs/test-fake.yaml` de FX-T5a-a, ampliada con adapters falsos de FX-01b-a, FX-02c-a y FX-08b-a.

---

## Parte S2

## US-103 — La suite mide la exactitud de la extracción, su p95, la calidad de `auto_aceptado` y el gate de PII en documentos

> Linear: [L1D-239](https://linear.app/l1der-lab-mjbc/issue/L1D-239)

`FEAT-T5b` · Sprint 3 · Estimación **5** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.1 (parte), AC-T5.3 · M-01.1, M-01.2, M-01.3, G-6, G-7, G-8 (documentos) · ↪ US-072, US-082, US-083, US-084 · ⛔ ADR-39 (mediciones reales) · 🔗 Regresión [AC-T5.4] → US-074 · 🔗 Mide a: FEAT-01b

## Story
Como responsable técnico, quiero medir sobre un set de referencia cuántos campos lee
bien la extracción, cuánto tarda y cuántos datos `auto_aceptado` son correctos, para
saber si el oncólogo puede apoyarse en lo extraído sin revisarlo todo.

## AC (Given/When/Then)
- **AC-1 (happy path)** `[NFR-02]` · Dado `data/evaluation/ocr/`, cuando se ejecuta
  `evaluate --suite extraccion --config eval/configs/s2.yaml`, entonces el reporte trae
  exactitud por campo crítico y no crítico, p95 de extracción por documento, exactitud de
  los datos `auto_aceptado` y sensibilidad del gate de PII sobre los documentos con PII
  sembrada, junto con la configuración (modelos, umbrales, `catalogVersion`).
  `[M-01.1]` `[M-01.2]` `[M-01.3]` `[G-8]` `[OL-06]`
- **AC-2 (borde · reproducible)** · Dada FX-T5a-a ampliada, cuando se ejecuta dos veces
  con la misma configuración, entonces las métricas deterministas son idénticas. `[OL-06]`
- **AC-3 (borde · metas en configuración)** · Dadas las metas 0,95 / 0,90 / 60 s / 0,98
  en la configuración de la suite, cuando una métrica no las alcanza, entonces el reporte
  la marca "fuera de meta" sin cambiar código. `[RN-22]` `[TBD-02]`
- **AC-4 (borde · validado vs. no validado)** · Dado un subconjunto marcado
  `revisada_por_oncologo`, cuando se genera el reporte, entonces cada métrica indica
  cuántos casos validados la componen. `[AC-T5.3]`
- **AC-5 (borde · DoD)** · Dado un PR que cambia el motor OCR, el prompt de
  estructuración o un umbral de confianza, cuando corre la CI, entonces ejecuta esta suite
  y adjunta el reporte. `[AC-T5.4]` `[FR-20]`

## Contexto técnico
Nueva suite en el *runner* de US-072 (`rag-orchestrator/app/evaluation/`) que invoca
`TextExtractionService` y `ClinicalStructuringService` en proceso, y un comando de
`clinical-api` para la confianza y el `review_status`. El tamaño del set de referencia
sintético se fija en la configuración de la suite (asumido). Tests: Pytest del *runner*
con adapters falsos.

## INVEST
**Small** ✓ una suite más sobre un *runner* existente.
**Testable** ✓ cinco tests sobre el reporte.

---

## US-104 — Los umbrales de confianza del OCR se calibran con el set de referencia y quedan en configuración

> Linear: [L1D-240](https://linear.app/l1der-lab-mjbc/issue/L1D-240)

`FEAT-T5b` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17) · TBD-03 (CAL de confianza OCR) · G-7, M-01.3 · ↪ US-103, US-084 · ⛔ ADR-39 (motor OCR fijado) · **Recorrido principal:** no · **Workaround en el MVP:** umbrales de confianza del OCR con valores iniciales en configuración `[RN-22]`, sin calibración formal; la exactitud la mide US-103

## Story
Como responsable técnico, quiero calibrar los umbrales de confianza alta y media con el
set de referencia, para que un dato `auto_aceptado` sea correcto al menos el 98 % de las
veces.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el set de referencia de US-103, cuando se ejecuta
  `evaluate --calibrate ocr`, entonces el reporte propone `OCR_CONFIDENCE_HIGH` y
  `OCR_CONFIDENCE_MEDIUM` con la exactitud de `auto_aceptado` y la proporción de datos
  que pasan a `requiere_revision` con cada valor. `[TBD-03]` `[G-7]`
- **AC-2 (borde · regla de G-7)** · Dado un umbral actual con exactitud de
  `auto_aceptado` < 0,98, cuando se calibra, entonces la propuesta sube el umbral alto y
  nunca lo baja. `[G-7]` `[backlog/02-adrs.md §4.1]`
- **AC-3 (borde · configuración)** · Dados los valores elegidos, cuando se aplican,
  entonces viven en variables de configuración validadas al arranque (US-037) y no en el
  código. `[RN-22]`
- **AC-4 (borde · datos reales fuera del repo)** · Dada una calibración con el set real
  anonimizado por ruta local, cuando termina, entonces solo se versionan métricas
  agregadas y los valores elegidos, nunca textos ni documentos. `[RN-13]` `[RN-14]`

## Contexto técnico
Mismo patrón que la calibración del umbral de relevancia (US-073). El registro de la
calibración se adjunta al PR que fija los valores (DoD de US-074). Tests: Pytest del
calibrador con un set falso de resultados conocidos.

## INVEST
**Small** ✓ un comando de calibración sobre métricas ya calculadas.
**Testable** ✓ cuatro tests con resultados conocidos.
*(Estimable ⚠ el 3 asume ADR-39 cerrado en el S1 para el motor OCR.)*

---

## US-105 — La suite mide la fidelidad del caso reconstruido, el origen de cada dato, el soporte del resumen y el p95 de la vista de caso

> Linear: [L1D-241](https://linear.app/l1der-lab-mjbc/issue/L1D-241)

`FEAT-T5b` · Sprint 3 · Estimación **5** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.1 (eventos y timeline) · M-02.1, M-02.2, M-02.3, M-02.4, G-11 · ↪ US-072, US-085, US-088 · 🔗 Relacionada: US-095 (resumen, `si-hay-capacidad`: AC-3 condicional) · 🔗 Mide a: FEAT-01b (eventos), FEAT-02b, FEAT-02c

## Story
Como responsable técnico, quiero medir si los eventos extraídos tienen el tipo y la
fecha correctos, si todo lo que se muestra tiene un origen que se puede abrir y si el
resumen solo muestra afirmaciones respaldadas, para demostrar que el caso reconstruido
es fiel.

## AC (Given/When/Then)
- **AC-1 (happy path · eventos)** · Dado `data/evaluation/eventos/`, cuando se ejecuta
  `evaluate --suite caso`, entonces el reporte trae el porcentaje de eventos con tipo y
  fecha correctos. `[M-02.1]` `[AC-T5.1]`
- **AC-2 (borde · origen resoluble)** · Dados los pacientes del dataset ya procesados,
  cuando la suite recorre su `CaseView`, entonces reporta el porcentaje de eventos y
  valores cuyo `sourceDocumentId` existe y cuya página está dentro del documento; meta
  100 %. `[M-02.2]`
- **AC-3 (borde · soporte del resumen; condicional: solo si FEAT-02c se construye)** · Dado el resumen de cada paciente del dataset,
  cuando se evalúa, entonces reporta el porcentaje de afirmaciones mostradas con al
  menos un enlace válido y soporte NLI; meta 100 %. `[M-02.3]` `[RN-01]`
- **AC-4 (borde · p95 de la vista de caso)** · Dado un paciente sintético de volumen
  (200 eventos, 50 valores de biomarcadores, 10 tratamientos previos), cuando se mide
  `GET …/case` 100 veces contra Compose, entonces el reporte trae el p95 frente a
  `CASE_VIEW_P95_TARGET_MS = 2000`. `[M-02.4]` `[NFR-03]` `[RN-22]`
- **AC-5 (borde · reproducible)** · Dada la configuración falsa, cuando se ejecuta dos
  veces, entonces las métricas deterministas son idénticas. `[OL-06]`

## Contexto técnico
Las métricas de M-02.2 y M-02.4 se calculan contra `clinical-api` en el perfil de test de
Compose con el dataset sembrado; M-02.1 y M-02.3, en proceso. Tests: Pytest del *runner*
con adapters falsos y un *seed* de volumen sintético.

## INVEST
**Small** ✓ una suite con cuatro métricas sobre servicios existentes.
**Testable** ✓ cinco tests sobre el reporte.

---

## US-106 — La suite mide duplicados fusionados, conflictos detectados, fusiones incorrectas y mapeo terminológico

> Linear: [L1D-242](https://linear.app/l1der-lab-mjbc/issue/L1D-242)

`FEAT-T5b` · Sprint si-hay-capacidad · Estimación **5** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.1 (duplicados y conflictos) · M-03.1, M-03.2, M-03.3, M-03.4, M-03.5, G-13 · ↪ US-072, US-086, US-098, US-099 · 🔗 Mide a: FEAT-01b (propuesta), FEAT-03a · **Recorrido principal:** no · **Workaround en el MVP:** la invariante de no inventar códigos la verifican US-086 AC-3 y US-098 AC-2, y la fusión de duplicados y la detección de conflictos, los tests de US-099; sin métrica agregada

## Story
Como responsable técnico, quiero medir con datos sembrados si el sistema fusiona los
duplicados, detecta todos los conflictos, no fusiona datos distintos y asigna el código
correcto, para sostener que el caso no mezcla ni pierde datos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `data/evaluation/reconciliacion/`, cuando se ejecuta
  `evaluate --suite reconciliacion`, entonces el reporte trae el porcentaje de duplicados
  fusionados, de conflictos detectados y el número de fusiones incorrectas.
  `[M-03.1]` `[M-03.2]` `[M-03.3]`
- **AC-2 (borde · mapeo)** · Dados los términos con código esperado (incluidos sinónimos
  en español e inglés), cuando se evalúan, entonces el reporte trae el porcentaje de
  conceptos con el código correcto por estándar. `[M-03.4]`
- **AC-3 (invariante · códigos inexistentes)** · Dado cualquier resultado de la suite,
  cuando hay al menos un código asignado que no existe en el catálogo, entonces la suite
  termina con código ≠ 0 (bloquea el PR). `[M-03.5]` `[RN-27]`
- **AC-4 (borde · fusiones incorrectas)** · Dado al menos un par de datos distintos
  fusionado, cuando se genera el reporte, entonces la suite termina con código ≠ 0.
  `[M-03.3]`
- **AC-5 (borde · reproducible)** · Dada la misma configuración, cuando se ejecuta dos
  veces, entonces las métricas son idénticas. `[OL-06]`

## Contexto técnico
Invoca en proceso la propuesta de códigos de Backend 2 (US-086) y, mediante un comando
de `clinical-api`, `ReconciliationService` (US-098, US-099) con PostgreSQL de test. Los
umbrales de bloqueo (0 para M-03.3 y M-03.5) no son calibrables `[PRD §18.3.3]`. Tests:
Pytest del *runner* y Vitest del comando.

## INVEST
**Small** ✓ una suite con cinco métricas sobre servicios existentes.
**Testable** ✓ cinco tests sobre el reporte y el código de salida.

---

## Parte S3

## US-131 — La suite mide la sensibilidad y la especificidad del checklist de faltantes con faltantes sembrados

> Linear: [L1D-243](https://linear.app/l1der-lab-mjbc/issue/L1D-243)

`FEAT-T5b` · Sprint 4 · Estimación **3** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.1 (faltantes) · M-04.1, M-04.2, G-12 · ↪ US-072, FEAT-04 US-002 · 🔗 Regresión [AC-T5.4] → US-074 (cambio de catálogo) · 🔗 Mide a: FEAT-04

## Story
Como responsable técnico, quiero medir sobre pacientes con faltantes sembrados cuántos
detecta el checklist y cuántos marca por error, para saber si el oncólogo puede confiar
en la lista de lo que le falta.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `data/evaluation/faltantes/` y el catálogo de datos
  críticos vigente, cuando se ejecuta `evaluate --suite faltantes`, entonces el reporte
  trae sensibilidad y especificidad por tipo de cáncer frente a las metas en
  configuración (0,95 y 0,90, propuestas). `[M-04.1]` `[M-04.2]` `[G-12]`
- **AC-2 (borde · determinismo)** · Dada la misma versión de catálogo y el mismo
  dataset, cuando se ejecuta dos veces, entonces los resultados son idénticos y el
  cliente de `rag-orchestrator` registra cero llamadas. `[AC-04.4]` `[OL-06]`
- **AC-3 (borde · cambio de catálogo)** · Dado un PR que modifica
  `packages/clinical-catalogs`, cuando corre la CI, entonces ejecuta esta suite y adjunta
  el reporte. `[AC-T5.4]`
- **AC-4 (borde · falsos faltantes conocidos)** · Dado un paciente del dataset con un
  biomarcador `no_mapeado` que corresponde a un ítem crítico, cuando se evalúa, entonces
  el reporte lo cuenta como falso positivo y lo lista por clave (sin datos del paciente).
  `[M-04.2]` (asumido: hace visible el efecto de la nota pendiente de FEAT-04 US-002)

## Contexto técnico
Comando de `clinical-api` (`npm run eval:completeness`) que ejecuta `CompletenessService`
(FEAT-04 US-002) sobre los pacientes del dataset en una BD de test y devuelve un JSON
que integra el reporte del *runner*. Tests: Vitest del comando y Pytest de la
integración en el reporte.

## INVEST
**Small** ✓ una suite determinista sobre un servicio puro.
**Testable** ✓ cuatro tests sobre el reporte.

---

## US-132 — La suite verifica que la aplicabilidad no inventa valores ni coincidencias y mide los metadatos del corpus

> Linear: [L1D-244](https://linear.app/l1der-lab-mjbc/issue/L1D-244)

`FEAT-T5b` · Sprint 5 · Estimación **5** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.1 (aplicabilidad con verdad conocida) · M-08.2, M-08.3, M-08.4, M-08.6 · ↪ US-072, US-122, US-123, US-124, US-118 · ⛔ ADR-39 (NLI y LLM reales para la medición final) · 🔗 Mide a: FEAT-08b, FEAT-06c

## Story
Como responsable técnico, quiero medir sobre pares paciente-fuente con verdad conocida
que la aplicabilidad nunca afirma una coincidencia sin cita ni inventa un valor del
paciente, y cuántas fuentes del corpus traen metadatos de población correctos, para
sostener la hipótesis de aplicabilidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `data/evaluation/aplicabilidad/`, cuando se ejecuta
  `evaluate --suite aplicabilidad`, entonces el reporte trae el porcentaje de criterios
  con el estado esperado, el número de criterios en "Coincide" sin cita y el número de
  valores del paciente que no coinciden con el contexto enviado. `[AC-T5.1]` `[M-08.2]` `[M-08.6]`
- **AC-2 (invariante · bloqueo)** · Dado un resultado con M-08.2 > 0 o M-08.6 > 0, cuando
  termina la suite, entonces sale con código ≠ 0. `[M-08.2]` `[M-08.6]`
- **AC-3 (borde · metadatos de población)** · Dada la `CorpusRelease` vigente, cuando se
  evalúa, entonces el reporte trae el porcentaje de documentos con `population_criteria`
  distintos de `no_disponible` frente a la meta en configuración (0,90, propuesta).
  `[M-08.3]`
- **AC-4 (borde · exactitud de `extraido_verificado`)** · Dado el archivo de revisión
  humana de la muestra de metadatos (US-118), cuando se evalúa, entonces el reporte trae
  la exactitud de los metadatos `extraido_verificado` frente a la meta (0,95, propuesta) y
  el tamaño de la muestra. `[M-08.4]` `[TBD-20]`
- **AC-5 (borde · reproducible)** · Dada la configuración falsa, cuando se ejecuta dos
  veces, entonces las métricas deterministas son idénticas. `[OL-06]`

## Contexto técnico
Invoca `ApplicabilityService` en proceso con contextos sintéticos del dataset; M-08.3 se
calcula con una consulta al catálogo del corpus (rol `rag_corpus`). La concordancia del
oncólogo (M-08.1, VM-3) no es de esta historia: es mixta y la mide FEAT-T5d con
US-024 · DEC-14 (FEAT-T5c, S5). Tests: Pytest del *runner* con FX-08b-a.

## INVEST
**Small** ✓ una suite con cuatro métricas y dos bloqueos.
**Testable** ✓ cinco tests sobre el reporte y el código de salida.

---

## US-133 — La recuperación híbrida no retrocede respecto del baseline del S1

> Linear: [L1D-245](https://linear.app/l1der-lab-mjbc/issue/L1D-245)

`FEAT-T5b` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17; OL-06) · FR-20 · M-06.1 · ↪ US-073 (baseline), US-112, US-113 · 🔗 Mide a: FEAT-06b · **Recorrido principal:** no · **Workaround en el MVP:** sin búsqueda híbrida no hay retroceso que medir; ADR-39 elige *embeddings* multilingües y la suite mide recall es→en ≥ 0,70 (US-072)

## Story
Como responsable técnico, quiero comparar la recuperación híbrida y la expansión
bilingüe con el baseline del S1, para que el cambio de recuperación no empeore lo que el
oncólogo ya recibía.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados el dataset del S1 y el reporte del baseline (US-073),
  cuando se ejecuta `evaluate --config eval/configs/s3.yaml`, entonces el reporte trae
  recall@10 total, recall@10 de español a inglés y MRR, con la diferencia frente al
  baseline. `[M-06.1]` `[readme §5.0 S3 KR1]`
- **AC-2 (borde · retroceso)** · Dada una diferencia peor que
  `RETRIEVAL_REGRESSION_TOLERANCE` en cualquiera de las tres métricas, cuando termina la
  suite, entonces sale con código ≠ 0. `[readme §5.0 S3 KR1]` `[RN-22]`
- **AC-3 (borde · modo híbrido en todas las consultas)** · Dado el reporte del AC-1,
  cuando se inspecciona `meta.retrievalParams` de cada consulta, entonces el 100 % trae
  `mode = hybrid`. `[readme §5.0 S3 KR1]`
- **AC-4 (borde · reproducible)** · Dada la configuración falsa, cuando se ejecuta dos
  veces, entonces las métricas son idénticas. `[OL-06]`

## Contexto técnico
Reutiliza el *runner* y el dataset de recuperación de US-072; el baseline del S1 se lee
del archivo versionado en `eval/results/`. Tests: Pytest con adapters falsos de
recuperación dense y sparse.

## INVEST
**Small** ✓ una comparación contra un reporte existente.
**Testable** ✓ cuatro tests sobre el reporte y el código de salida.

---

## Parte S4

## US-140 — La suite mide que hasta 3 opciones siguen citadas, con soporte, no prescriptivas y en el orden de RN-28

> Linear: [L1D-246](https://linear.app/l1der-lab-mjbc/issue/L1D-246)

`FEAT-T5b` · Sprint 5 · Estimación **5** · — (técnica, PRD §17; OL-06) · FR-20 · AC-T5.1 (opciones), AC-T5.3 · M-10.1, M-10.2, M-07.2 (con hasta 3 opciones), G-2, G-14 · ↪ US-072, US-074, US-134, US-136 · ⛔ ADR-39 (LLM y NLI reales para la medición final) · ⛔ DEC-07 · escenario más probable (metas y tolerancias) · 🔗 Mide a: FEAT-10c, FEAT-10b (S4)

## Story
Como responsable técnico, quiero medir sobre casos sintéticos con verdad conocida que
pasar de 1 a 3 opciones no degrada citas, soporte ni lenguaje y que el orden respeta
siempre la regla de aplicabilidad, para llegar a G-Demo con la hipótesis 3 respaldada
por números.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `data/evaluation/opciones/`, cuando se ejecuta
  `evaluate --suite opciones --config eval/configs/s4.yaml`, entonces el reporte trae:
  porcentaje de opciones mostradas con ≥ 1 cita y soporte, salidas con términos
  prohibidos, fidelidad y precisión de citas, número medio de opciones por análisis,
  porcentaje de análisis cuyo orden respeta RN-28 sobre sus propios resúmenes y
  porcentaje de opciones esperadas presentes entre las 3 mostradas.
  `[M-10.1]` `[M-10.2]` `[M-07.2]` `[AC-T5.1]` `[readme §5.0 S4 KR1]`
- **AC-2 (invariante · bloqueo)** · Dado un resultado con M-10.1 < 100 %, M-10.2 > 0 o
  algún análisis con orden que viole RN-28, cuando termina la suite, entonces sale con
  código ≠ 0 y el reporte nombra los casos. `[M-10.1]` `[M-10.2]` `[RN-28]` `[G-2]` `[G-14]`
- **AC-3 (borde · no comparable al final)** · Dados los 2 casos con una opción de fuente
  no comparable, cuando se evalúan, entonces el reporte verifica que esa opción, si se
  muestra, está después de toda opción comparable. `[RN-28]` `[AC-08.8]`
- **AC-4 (borde · retroceso de fidelidad)** · Dada una fidelidad o precisión de citas
  peor que la del reporte del S3 en más de `FAITHFULNESS_REGRESSION_TOLERANCE`, cuando
  termina la suite, entonces sale con código ≠ 0. `[M-07.2]` `[RN-22]` `[DEC-07]` (asumido
  en la tolerancia)
- **AC-5 (borde · validado vs. no validado)** · Dados los 4 casos
  `revisada_por_oncologo`, cuando se genera el reporte, entonces cada métrica indica
  cuántos casos validados y no validados la componen. `[AC-T5.3]`
- **AC-6 (borde · reproducible)** · Dada la configuración falsa (FX-T5a-a + FX-10c-a),
  cuando se ejecuta dos veces, entonces las métricas deterministas son idénticas.
  `[OL-06]`

## Contexto técnico
Reutiliza el *runner* de US-072 y el comparador puro `applicability_order` (US-125)
para verificar el orden sobre los resúmenes devueltos por cada análisis (no contra un
orden fijo, porque el LLM real puede describir otras opciones). La lista de términos
prohibidos es la de US-068. La suite entra en la DoD de US-074 para todo PR que cambie
modelo, prompt, umbral, catálogo o corpus. Tests: Pytest del *runner* con adapters falsos
(FX-10c-a) y del cálculo de cada métrica con reportes sintéticos.

## INVEST
**Small** ✓ una suite nueva sobre el *runner* existente con cuatro bloqueos.
**Testable** ✓ seis tests sobre el reporte y el código de salida.

---

## US-141 — El p95 del análisis se mide con aplicabilidad y hasta 3 opciones y la meta de G-5 se recalibra con ese dato

> Linear: [L1D-247](https://linear.app/l1der-lab-mjbc/issue/L1D-247)

`FEAT-T5b` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17; OL-06) · FR-20, NFR-01 · M-06.2, G-5 · ↪ US-073 (p95 del S2), US-134, US-122…US-125 · ⛔ ADR-39 (modelos fijados) · 🔗 Produce para: US-015 · ADR-42, DEC-07 (meta recalibrada) · **Recorrido principal:** no · **Workaround en el MVP:** se integra en US-142: la verificación de G-Demo registra el p95 del análisis con aplicabilidad y hasta 3 opciones (US-142 AC-7)

## Story
Como responsable técnico, quiero medir de punta a punta cuánto tarda el análisis con la
aplicabilidad y hasta tres opciones, etapa por etapa, para recalibrar la meta de G-5 y
decidir con datos si hace falta el streaming de progreso.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el stack de Compose con los modelos de ADR-39 y el
  dataset `opciones/`, cuando se ejecuta `evaluate --suite latencia --runs 30`, entonces
  el reporte trae p50 y p95 de `/platform/evidence-analyses` y por etapa (recuperación,
  *rerank*, generación, aplicabilidad, NLI, persistencia), con las versiones de modelos.
  `[M-06.2]` `[G-5]` `[PRD §12 Operación]`
- **AC-2 (borde · fuera de meta)** · Dado un p95 mayor que `ANALYSIS_P95_TARGET_MS`,
  cuando termina, entonces el reporte lo marca "fuera de meta" y lo enlaza como insumo de
  ADR-42, sin bloquear el PR. `[G-5]` `[TBD-08]` (asumido: la latencia no bloquea la CI)
- **AC-3 (borde · tokens por bloque)** · Dado el reporte del AC-1, cuando se inspecciona,
  entonces trae tokens de entrada y salida por bloque (contexto, aplicabilidad,
  opciones) frente al presupuesto fijado en ADR-39. `[NFR-04]` `[PRD §12 Operación]`
- **AC-4 (borde · *timeouts*)** · Dadas ejecuciones que terminan en `504`, cuando se
  calcula el p95, entonces cuentan como el *deadline* configurado y el reporte da su
  número aparte. (asumido)
- **AC-5 (borde · adapters falsos)** · Dada la configuración con adapters falsos, cuando
  se ejecuta la suite de latencia, entonces el reporte se rotula "no representativo" y
  no puede usarse como insumo de ADR-42. (asumido)

## Contexto técnico
Ejecución contra Compose con el LLM nativo fuera de Docker (readme §1.4), en serie para
no medir la cola del semáforo de inferencia (RN-30). La meta recalibrada se registra en
configuración (`ANALYSIS_P95_TARGET_MS`, RN-22) y como adenda de DEC-07. Tests: Pytest
del cálculo de percentiles y del rótulo con mediciones sintéticas (AC-2, AC-4, AC-5); la
medición real (AC-1, AC-3) es una ejecución registrada en `eval/results/`.

## INVEST
**Small** ✓ una suite de latencia sobre métricas por etapa que ya se emiten desde el S1.
**Testable** ✓ cinco verificaciones sobre el reporte.

---

## US-142 — G-Demo se verifica con el recorrido de la hipótesis sobre casos sintéticos y queda registrado

> Linear: [L1D-248](https://linear.app/l1der-lab-mjbc/issue/L1D-248)

`FEAT-T5b` · Sprint 5 (cierre) · Estimación **5** · — (técnica, PRD §17) · FR-20 · G-1, G-2, G-14 · AC-T5.1, AC-T5.3 · PRD §14 G-Demo (redefinido) · ↪ US-140, US-139, US-024 · DEC-14, US-071, US-134…US-136 · 🔗 Integra: US-141 (`si-hay-capacidad`; su medición de p95 es el AC-7) · ⛔ DEC-07 · escenario más probable (metas) · 🔗 Regresión [RN-13] → US-143

## Story
Como product owner, quiero verificar al cierre del S5 que el recorrido de la hipótesis
funciona de punta a punta con casos sintéticos y que las métricas están en meta, para
declarar G-Demo con evidencia y pasar al gate del piloto.

## AC (Given/When/Then)
- **AC-1 (happy path · recorrido)** · Dado Compose con el seed sintético de la demo,
  cuando se ejecuta el E2E `g-demo.spec.ts`, entonces el doctor recorre login → listado
  → ficha → vista de caso con timeline → checklist de faltantes → "Continuar con aviso"
  → análisis con hasta 3 opciones ordenadas, cada una con citas, resumen de
  aplicabilidad y avisos, y el criterio de orden visible → Base del análisis → feedback
  1–5 guardado, sin errores. `[G-1]` `[PRD §13 E2E]` `[PRD §14 G-Demo]`
- **AC-2 (borde · métricas en meta)** · Dado el reporte de todas las suites (`evaluate
  --all --config eval/configs/s5.yaml`), cuando se verifica, entonces G-2 = 100 %
  (M-10.1; M-02.3 solo si FEAT-02c se construyó), G-14 = 0 (M-10.2) y cada métrica
  técnica está en la meta de DEC-07;
  si alguna no lo está, el registro dice "G-Demo no superado" y la nombra.
  `[PRD §14 G-Demo]` `[G-2]` `[G-14]` `[DEC-07]`
- **AC-3 (invariante · solo sintético)** · Dada la BD de la demo, cuando se ejecuta la
  verificación, entonces comprueba que el 100 % de `patient.data_origin = sintetico` y
  que `REAL_ANONYMIZED_ENABLED` y `REAL_IDENTIFIED_ENABLED` son `false`; si no, el gate
  falla. `[RN-13]` `[PRD §14 G-Demo]`
- **AC-4 (borde · excepciones declaradas)** · Dado el registro de G-Demo, cuando se
  revisa, entonces lista AC-T1.5 y AC-T3.3 (bloqueos) como "se verifican en G-Piloto" y
  las capacidades diferidas por el slicing (CAP-05 plantillas, CAP-07, CAP-09, CAP-11,
  agente de CAP-08, y del slicing v2: resumen del caso, híbrida y filtros, visor,
  resolución de conflictos, supuestos y limitaciones) con su Feature y sprint, sin
  contarlas como fallos. `[PRD §14 G-Demo]` `[R-14]` `[01-requisitos §15]`
- **AC-5 (borde · validación clínica adjunta)** · Dado el registro, cuando se revisa,
  entonces adjunta el reporte de feedback de US-139 de la sesión con casos sintéticos y
  el registro de DEC-14 (VM-3); VM-1 y VM-2 con el sistema figuran como "se miden en el
  piloto (FEAT-T5d)". `[VM-3]` `[VM-4]` `[VM-5]` (asumido en VM-1 y VM-2, ver Conflictos)
- **AC-6 (borde · registro)** · Dada la verificación, cuando termina, entonces
  `docs/gates/G-Demo-<fecha>.md` registra resultado, commit, `catalogVersion`,
  `corpusRelease`, modelos, dueño (usuario, PO) y fecha. (asumido)
- **AC-7 (borde · p95 con aplicabilidad y hasta 3 opciones, integra US-141)** · Dado el
  set de preguntas de evaluación ejecutado contra Compose con los modelos de ADR-39,
  aplicabilidad y `maxOptions = 3`, cuando se verifica, entonces el registro trae el p95
  de `POST /platform/evidence-analyses` frente a la meta de G-5 en configuración y, si la
  supera, lo marca como insumo de ADR-42 sin bloquear G-Demo. `[M-06.2]` `[G-5]`
  `[RN-22]` (asumido en "sin bloquear")

## Contexto técnico
El E2E corre con Playwright contra Compose con el seed sintético de la demo (US-039
ampliado con los pacientes de FX-T3-a y FX-10b-a) y los modelos reales de ADR-39; los
reportes salen de `eval/results/`. La verificación (`scripts/verify-g-demo`) junta E2E,
suites, chequeo de datos sintéticos y los dos registros humanos (US-139, DEC-14) en un
documento. No es un gate de arranque: el gate que impide datos reales es US-143.

## Non-goals
Medir VM-1…VM-6 con casos reales (FEAT-T5d, S6). Bloqueos por opt-out (US-148, S6).

## INVEST
**Small** ✓ ensambla verificaciones existentes en un E2E y un registro.
**Testable** ✓ siete verificaciones con resultado observable (E2E, código de salida, registro).
*(Estimable ⚠ absorbe la medición de p95 de US-141 (3 puntos) sin cambiar el 5; si el S5 no la absorbe, re-estimar a 8.)*

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | backlog/01-requisitos.md §5.5: M-02.3 con dueña FEAT-02c y M-03.5 con dueña FEAT-03a | Regla de F3: las Features de capacidad no crean historias de evaluación | Se miden en US-105 y US-106; FEAT-02c y FEAT-03a citan `🔗 Medido en` y conservan los AC de invariante (US-095, US-098) |
| — | PRD §14: aplicabilidad (M-08.x) en el S4 | Slicing adoptado: aplicabilidad en el S3 | Slicing: US-132 en el S3 |
| M-13 (auditoría) | backlog/features/README.md (piloto): la historia de faltantes sembrados, hoy US-131, sin sprint | readme §5.0 S3 KR4: faltantes medidos en el S3 | US-131 en el S3 |
| — | PRD §14 G-Demo: todos los criterios de CAP-01 a CAP-11, T-1, T-2, T-3 y T-5 en verde (salvo AC-T1.5 y AC-T3.3); VM-1 a VM-3 medidas con el oncólogo asesor | Slicing adoptado (`01-requisitos.md` §15): G-Demo = caso + faltantes + aplicabilidad + opciones ordenadas + feedback, solo sintético; CAP-05 (plantillas), CAP-07, CAP-09 y CAP-11 pasan a S6 (si hay capacidad) y el agente a Post-MVP | Slicing (decisión del usuario): US-142 verifica el G-Demo redefinido y declara las capacidades diferidas; VM-3 con DEC-14 y VM-4/VM-5 con el feedback; VM-1/VM-2 con el sistema se miden en el piloto. Se registra para enmendar PRD §14 |
| — | `01-requisitos.md` §5.5: M-07.1 (discrepancias) en FEAT-T5b y M-08.5 (agente) en FEAT-T5b/FEAT-08c | Slicing adoptado: FEAT-07 en el S6 (si hay capacidad) y FEAT-08c Post-MVP | M-07.1 y M-08.5 se miden con sus Features diferidas en US-157 y US-161 (FEAT-T5d), no en el S4 |
| Slicing v2 | PRD §14 S2–S4: suites por sprint y G-Demo al cierre del S4 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): suites en S3–S5 y G-Demo al cierre del S5; calibración del OCR, M-03.x agregadas, no retroceso de la híbrida y p95 separado `si-hay-capacidad` | M-01 (calibración), M-03.1…M-03.5 y M-06.1 (sin retroceso) quedan en historias `si-hay-capacidad`; M-06.2 con hasta 3 opciones lo registra US-142 |
