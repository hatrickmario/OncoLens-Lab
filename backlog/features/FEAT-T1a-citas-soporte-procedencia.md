# FEAT-T1a — Trazabilidad: citas, soporte y procedencia verificados

> Linear: [L1D-34](https://linear.app/l1der-lab-mjbc/issue/L1D-34)

**Talla:** L · **Sprint:** 1 (US-063, US-064: citas y soporte) · 3 (US-065: procedencia del contexto) · 5 (US-127: RN-25) · las etapas siguientes de RN-01 las amplían sus Features con `🔗 Regresión [RN-01] → US-064`: aplicabilidad S5 (US-123); resumen (US-095), supuestos y limitaciones (US-129, US-130) y síntesis (FEAT-07), si hay capacidad · **Capacidad:** T-1 (AC-T1.2 parte S1, AC-T1.3), CAP-10 (AC-10.4) · **Recorrido principal:** sí
**Requisitos:** RN-01 (dueña: validador de citas y soporte para todo tipo de afirmación; en el S1, opciones y afirmaciones sueltas) · FR-10 (dueña, vía HU-03 escenario 3) · RN-04 (dueña) · RN-07 (dueña: etiquetas en el contexto y exclusión de rechazados) · RN-25 (dueña, S3: US-127) · IA-04
**Evidencia:** [→ PRD §6 RN-01, RN-04, RN-07, RN-24], [→ PRD §5 FR-10], [→ PRD §12 Grounding], [→ PRD §18.4 AC-T1.2, AC-T1.3], [→ PRD §18.3.10 AC-10.4, M-10.1], [→ PRD §18.3.2 AC-02.6], [→ readme §5 HU-03 escenario 3], [→ readme §6 OL-02 (tareas 5, 8; tests adicionales NLI)], [→ readme §6 OL-03 (tarea 2.3)], [→ readme §4.1 `CitedSource`, `DiscardedOption`, `Provenance`], [→ readme §3.3 #34], [→ docs/AS-IS.md P12]
**Dependencias:** ↪ US-055 (pipeline), US-052 (constructor de contexto) · ⛔ ADR-39 (modelo NLI real; los AC se verifican con el adapter falso) · 🔗 Medido en: US-072 (M-10.1 = 100 %, fidelidad y precisión de citas M-07.2, G-2) · 🔗 Consumida por: US-057 (última defensa ante inyección), US-061 (descartadas en la UI)
**Valor:** el oncólogo no puede verificar cada frase de la IA contra cada fuente; necesita que el sistema lo haga por él y que lo que no se pueda respaldar nunca se muestre como válido (P12, JTBD 8). Esta Feature es la garantía G-2: cero opciones sin cita a un chunk recuperado y sin soporte, y cada dato del paciente que viaja a la IA lleva su procedencia.
**Stories:** US-063, US-064 (10 puntos, S1) · US-065 (3 puntos, S3) · US-127 (3 puntos, S5)

## Fixtures

- Usa **FX-06a-a** (corpus de prueba) y **FX-06a-b** (LLM y NLI falsos), declarados en FEAT-06a.
- **FX-T1a-a · Paciente con datos en distintos estados.** Paciente semilla (a) más cuatro biomarcadores insertados por el test: Ki-67 `20 %` con `entry_method = ocr`, `extraction_confidence = media`, `review_status = requiere_revision`; receptor de progesterona `negativo` con `review_status = rechazado`; receptor de progesterona `positivo` con `review_status = reemplazado`; receptor de estrógeno `90 %` con `review_status = requiere_revision` y `conflicts_with_id` apuntando al receptor de estrógeno del seed.

---

## US-063 — Cada cita de una opción apunta a un chunk recuperado en esa consulta y copia sus datos del corpus

> Linear: [L1D-179](https://linear.app/l1der-lab-mjbc/issue/L1D-179)

`FEAT-T1a` · Sprint 1 · Estimación **5** · HU-03 · RN-01 (citas), RN-04 (dueña) · AC-T1.2 (parte S1), AC-T1.3, AC-10.4 · ↪ US-055 · 🔗 Medido en: US-072 (precisión de citas, M-10.1)

## Story
Como oncólogo, quiero que cada cita que acompaña una opción corresponda a un fragmento
que el sistema recuperó de verdad en mi consulta, con su título y su fuente tomados del
corpus, para poder abrir la fuente y encontrar exactamente lo que se cita.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada `Q-HER2` con `LLM-OK`, cuando se valida la respuesta,
  entonces `citedSources[0]` tiene `title = "Breast Cancer Treatment (test)"`,
  `sourceName = "NCI PDQ"`, `externalId = "CDR-TEST-001"`, `language = en`,
  `sourceType = guideline` y `chunkTextSnapshot` igual al texto de `ch-m1-1` en el corpus.
  `[RN-04]` `[AC-T1.3]` `[OL-02]`
- **AC-2 (borde · cita a un chunk no recuperado)** · Dado `LLM-CITA-AJENA`, cuando se
  valida, entonces la opción no está en `evidenceOptions` y aparece en
  `discardedOptions` con `discardReason = cita_invalida`. `[RN-01]` `[AC-T1.2]` `[OL-02]`
- **AC-3 (borde · opción sin citas)** · Dado un LLM falso que devuelve una opción con
  `citedSources = []`, cuando se valida, entonces va a `discardedOptions` con
  `discardReason = sin_citas`. `[RN-01]` `[AC-10.4]`
- **AC-4 (borde · metadatos inventados por el LLM)** · Dado `LLM-TITULO-FALSO`, cuando
  se valida, entonces la cita conserva `title = "Breast Cancer Treatment (test)"` y
  `sourceName = "NCI PDQ"` del corpus, y en ninguna parte de la respuesta aparece "Guía
  NCCN 2026". `[RN-04]` `[AC-T1.3]`
- **AC-5 (borde · cita mixta)** · Dado un LLM falso que cita `ch-m1-1` y `ch-x-999` en
  la misma opción, cuando se valida, entonces la opción queda en `evidenceOptions` con
  una sola cita (`ch-m1-1`). `[OL-02]` `[RN-01]`
- **AC-6 (borde · idioma original)** · Dada `Q-HER2` en español, cuando se valida,
  entonces `chunkTextSnapshot` conserva el texto en inglés y `language = en`, sin
  traducción. `[RN-04]`

## Contexto técnico
Regla pura en `rag-orchestrator/app/domain/citations.py`: el conjunto de `chunkId`
válidos es el devuelto por la recuperación de **esta** consulta; los campos de
`CitedSource` se completan desde `CorpusCatalogRepository` y el chunk de Milvus, nunca
desde el JSON del LLM (el LLM solo aporta `chunkId`). Un análisis previo nunca es
citable porque nunca está en el conjunto recuperado (RN-24, S4). Tests: Pytest
unitarios del dominio y de integración del endpoint con FX-06a-a y FX-06a-b.

## INVEST
**Small** ✓ una regla pura de validación y copia.
**Testable** ✓ seis tests deterministas con adapters falsos.

---

## US-064 — Las opciones sin soporte van a descartadas y las afirmaciones sueltas sin soporte se omiten y se cuentan

> Linear: [L1D-180](https://linear.app/l1der-lab-mjbc/issue/L1D-180)

`FEAT-T1a` · Sprint 1 · Estimación **5** · HU-03 · RN-01 (dueña), FR-10 (dueña), IA-04, RN-23 (términos prohibidos generados en ejecución, §15 resp. 2) · AC-T1.2 (parte S1), AC-10.4 · ↪ US-063, US-068 (lista y verificador `checkProhibitedTerms`) · ⛔ Bloqueada por: ADR-39 (modelo NLI real; los AC usan el adapter falso) · 🔗 Medido en: US-072 (fidelidad M-07.2, M-10.1)

## Story
Como oncólogo, quiero que toda afirmación que el sistema me muestra esté respaldada por
el texto de la fuente que cita, y que lo que no lo esté se aparte o se omita, para no
tomar por evidencia algo que la IA agregó por su cuenta.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `LLM-OK` y el NLI falso en `entailment`, cuando se
  valida la opción, entonces queda en `evidenceOptions`, y el adapter NLI se invocó con
  el texto de `ch-m1-1` como premisa y cada afirmación de la justificación como
  hipótesis. `[RN-01]` `[FR-10]`
- **AC-2 (borde · opción sin soporte)** · Dado `LLM-SIN-SOPORTE`, cuando se valida,
  entonces `evidenceOptions = []` y la opción está en `discardedOptions` con
  `discardReason = afirmacion_sin_soporte` y
  `unsupportedClaims = ["reduce la mortalidad a la mitad"]`.
  `[RN-01]` `[FR-10]` `[HU-03]` `[AC-T1.2]`
- **AC-3 (borde · afirmación suelta sin soporte)** · Dado un LLM falso que devuelve una
  limitación redactada sin soporte (NLI `neutral`), cuando se valida, entonces
  `limitations = []`, su texto no aparece en ningún campo de la respuesta y
  `omittedClaims = 1`. `[FR-10]` `[RN-01]` `[AC-T1.2]`
- **AC-4 (borde · contradicción)** · Dado un NLI falso que devuelve `contradiction`
  para una afirmación de la opción, cuando se valida, entonces la opción va a
  `discardedOptions` con `discardReason = afirmacion_sin_soporte`. `[RN-01]` `[IA-04]`
- **AC-5 (borde · umbral de soporte)** · Dado `NLI_ENTAILMENT_THRESHOLD=0.7` y un NLI
  falso que devuelve `entailment` con probabilidad 0,55, cuando se valida, entonces la
  opción va a `discardedOptions`. `[RN-22]` `[IA-04]`
- **AC-6 (borde · NLI no disponible)** · Dado el adapter NLI lanzando un error, cuando
  se valida, entonces `rag-orchestrator` responde `503` con `error = "NLI_UNAVAILABLE"`
  y ninguna opción se devuelve sin validar. (asumido: falla cerrada)
- **AC-7 (borde · justificación prescriptiva)** · Dado un LLM falso cuya justificación
  de la opción contiene "recomendado para este paciente" y el NLI falso en `entailment`,
  cuando se valida, entonces `evidenceOptions = []`, la opción está en
  `discardedOptions` con `discardReason = afirmacion_sin_soporte` y
  `checkProhibitedTerms` sobre la respuesta serializada completa (incluidos
  `unsupportedClaims` y la justificación de la descartada) devuelve cero coincidencias.
  `[RN-23]` `[RN-01]` `[§15 resp. 2]`
- **AC-8 (borde · afirmación suelta prescriptiva)** · Dado un LLM falso que devuelve una
  limitación con "debe recibir" y el NLI falso en `entailment`, cuando se valida,
  entonces `limitations = []`, `omittedClaims = 1` y `checkProhibitedTerms` sobre la
  respuesta serializada devuelve cero coincidencias. `[RN-23]` `[§15 resp. 2]`

## Contexto técnico
`rag-orchestrator/app/domain/support.py` (`SupportChecker`): divide la justificación en
afirmaciones, ejecuta NLI estricto por afirmación contra los chunks citados y decide
opción → descartada / afirmación suelta → omitida y contada. Antes del NLI aplica
`checkProhibitedTerms` (lista de US-068) a cada afirmación: un término prohibido cuenta
como "sin soporte" con la misma regla (opción → `discardedOptions` con
`afirmacion_sin_soporte`; afirmación suelta → omitida y sumada a `omittedClaims`), y el
texto prohibido nunca se devuelve, tampoco en la descartada (respuesta 2 del usuario,
`01-requisitos.md` §15; sin cambio de contrato). Las afirmaciones sobre
datos del paciente (verbalización determinista + NLI, ADR-34) llegan con el resumen del
caso (S2) y la aplicabilidad (S3): sus Features amplían este validador con
`🔗 Regresión [RN-01] → US-064`. Umbral en configuración `[RN-22]`. Tests: Pytest
unitarios del dominio y de integración con FX-06a-b.

## INVEST
**Small** ✓ un validador puro sobre un adapter con interfaz fija.
**Testable** ✓ ocho tests con NLI y LLM falsos de salida controlada.

---

## US-065 — Cada dato del contexto enviado a la IA viaja etiquetado con su procedencia y los rechazados nunca entran

> Linear: [L1D-181](https://linear.app/l1der-lab-mjbc/issue/L1D-181)

`FEAT-T1a` · Sprint 3 · Estimación **3** · HU-03 · RN-07 (dueña) · AC-02.6 (contexto), AC-T1.1 (contexto) · ↪ US-052 · 🔗 Consumida por: US-066 (inciso a de la Base del análisis)

## Story
Como oncólogo, quiero que la IA sepa qué datos de mi paciente están verificados, cuáles
no y cuáles están en conflicto, y que nunca use un dato que rechacé, para que el
análisis no se apoye en un dato dudoso como si fuera firme.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el paciente semilla (a), cuando se arma el
  `clinicalContext`, entonces el diagnóstico y cada biomarcador llevan `provenance` con
  `entryMethod = seed`, `reviewStatus = verificado` y `conflict = false`.
  `[RN-07]` `[readme §4.2]`
- **AC-2 (borde · dato sin verificar)** · Dado FX-T1a-a, cuando se arma el contexto,
  entonces el Ki-67 `20 %` está incluido con `entryMethod = ocr`,
  `extractionConfidence = media` y `reviewStatus = requiere_revision`. `[RN-07]`
- **AC-3 (invariante · rechazados y reemplazados)** · Dado FX-T1a-a, cuando se arma el
  contexto, entonces ninguno de los dos receptores de progesterona (`rechazado` y
  `reemplazado`) aparece en `clinicalContext` ni en `clinical_context_snapshot`.
  `[RN-07]` `[AC-02.6]`
- **AC-4 (borde · conflicto)** · Dado FX-T1a-a, cuando se arma el contexto, entonces el
  receptor de estrógeno `90 %` lleva `provenance.conflict = true`. `[readme §4.1]` `[RN-07]`
- **AC-5 (borde · etiqueta en el prompt)** · Dado un `clinicalContext` con el Ki-67 en
  `requiere_revision`, cuando `rag-orchestrator` arma el prompt, entonces ese dato
  aparece acompañado de la etiqueta "(sin verificar)" dentro del bloque de datos del
  paciente. `[RN-07]` (asumido en el texto de la etiqueta)

## Contexto técnico
`ProvenanceLabeler` en el módulo `evidence-analysis` de `clinical-api` (aplica la misma
`Provenance` de readme §4.1 a cada elemento del contexto y filtra
`rechazado`/`reemplazado`); en `rag-orchestrator`, `PromptBuilder` (US-057) traduce la
procedencia a etiquetas legibles dentro del bloque de datos. Los estados existen en el
esquema desde el S1 (US-038 AC-7), así que el test los inserta directamente; el flujo
real de revisión llega en el S3 (FEAT-03b). Tests: Supertest con `rag-orchestrator`
simulado (AC-1 a AC-4) y Pytest del constructor de prompt (AC-5).

## INVEST
**Small** ✓ un etiquetador y un filtro sobre el constructor de contexto.
**Testable** ✓ cinco tests sobre el payload y el prompt.

---

## Parte S3

## US-127 — Los metadatos factuales de cada fuente se copian del catálogo del corpus y lo ausente se muestra "No disponible"

> Linear: [L1D-182](https://linear.app/l1der-lab-mjbc/issue/L1D-182)

`FEAT-T1a` · Sprint 5 · Estimación **3** · HU-22, HU-20 · RN-25 (dueña) · AC-T1.3 (metadatos), AC-08.9 (valor del estudio) · ↪ US-063, US-118, US-122 · 🔗 Consumida por: FEAT-07 (etiquetas factuales, S6 si hay capacidad), FEAT-09 (vigencia, S6 si hay capacidad) · 🔗 Medido en: US-132 (metadatos del corpus)

## Story
Como oncólogo, quiero que el diseño, la fase, el endpoint, el tamaño de muestra, las
fechas, la versión y la población de cada fuente vengan del catálogo del corpus y no de
lo que redacte la IA, para poder confiar en esos datos al comparar fuentes.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una opción que cita `doc-a1` (FX-08b-a), cuando se valida
  la respuesta, entonces su `CitedSource` trae `studyDesign`, `trialPhase`,
  `primaryEndpoint`, `sampleSize`, `publishedAt`, `lastUpdatedAt` y `guidelineVersion`
  iguales a las columnas de `corpus_document`. `[RN-25]` `[AC-T1.3]` `[readme §4.1]`
- **AC-2 (invariante · nunca del texto generado)** · Dado un LLM falso que devuelve en la
  cita `sampleSize = 9999` y `trialPhase = "IV"`, cuando se valida, entonces la cita
  conserva los valores del catálogo. `[RN-25]` `[RN-04]`
- **AC-3 (borde · ausente)** · Dado `doc-a3` sin `primary_endpoint` ni `sample_size`,
  cuando se responde, entonces esos campos vienen `null` y el panel muestra "No
  disponible" en su lugar. `[RN-25]`
- **AC-4 (borde · población del estudio)** · Dado `doc-a1` con `population_criteria`
  estructurado, cuando se arma la aplicabilidad, entonces `studyPopulationValue` es el
  texto del catálogo para ese criterio, sin reformular. `[RN-25]` `[AC-08.9]`

## Contexto técnico
Amplía `citations.py` (US-063) para completar los metadatos factuales de `CitedSource`
desde `CorpusCatalogRepository`; el LLM solo aporta el `chunkId`. Dueña de RN-25: FEAT-07
(etiquetas factuales) y FEAT-09 (vigencia) llevarán `🔗 Regresión [RN-25] → US-127`.
Tests: Pytest unitarios del dominio con FX-06a-a y FX-08b-a, y Playwright para el texto
"No disponible".

## INVEST
**Small** ✓ una ampliación de la copia de metadatos que ya existe.
**Testable** ✓ cuatro tests deterministas.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | backlog/01-requisitos.md §3: RN-06 con dueña en FEAT-T1a | Encargo del lote 1: RN-06 con dueña en FEAT-06a | No es un conflicto de fuentes: la dueña de RN-06 es US-053 (FEAT-06a). Registrado para trazabilidad |
| Slicing v2 | readme OL-03 (S1): contexto etiquetado con procedencia en el S1; PRD §14 S3: metadatos de fuente (RN-25) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-065 en el S3 y US-127 en el S5 | En el S1–S2 el contexto solo lleva datos `seed` verificados; las etiquetas son necesarias desde que entran datos extraídos (S3) |
