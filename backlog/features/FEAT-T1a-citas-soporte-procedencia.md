# FEAT-T1a — Trazabilidad: citas, soporte y procedencia verificados

> Linear: [L1D-34](https://linear.app/l1der-lab-mjbc/issue/L1D-34)

**Talla:** L · **Sprint:** 1 (US-063, US-064: citas y soporte) · 3 (US-065: procedencia del contexto; US-236: alias de chunks en la cita) · 3 (US-127: RN-25; antes S5, reordenamiento del 2026-10-23) · 4 (US-245: afirmaciones atómicas con marco de atribución determinista, OUT-08, `[S4 resp. 2]`) · las etapas siguientes de RN-01 las amplían sus Features con `🔗 Regresión [RN-01] → US-064`: aplicabilidad S5 (US-123); resumen (US-095), supuestos y limitaciones (US-129, US-130) y síntesis (FEAT-07), si hay capacidad · **Capacidad:** T-1 (AC-T1.2 parte S1, AC-T1.3), CAP-10 (AC-10.4) · **Recorrido principal:** sí
**Requisitos:** RN-01 (dueña: validador de citas y soporte para todo tipo de afirmación; en el S1, opciones y afirmaciones sueltas) · FR-10 (dueña, vía HU-03 escenario 3) · RN-04 (dueña) · RN-07 (dueña: etiquetas en el contexto y exclusión de rechazados) · RN-25 (dueña, S3: US-127) · IA-04
**Evidencia:** [→ PRD §6 RN-01, RN-04, RN-07, RN-24], [→ PRD §5 FR-10], [→ PRD §12 Grounding], [→ PRD §18.4 AC-T1.2, AC-T1.3], [→ PRD §18.3.10 AC-10.4, M-10.1], [→ PRD §18.3.2 AC-02.6], [→ readme §5 HU-03 escenario 3], [→ readme §6 OL-02 (tareas 5, 8; tests adicionales NLI)], [→ readme §6 OL-03 (tarea 2.3)], [→ readme §4.1 `CitedSource`, `DiscardedOption`, `Provenance`], [→ readme §3.3 #34], [→ docs/AS-IS.md P12], [→ backlog/sprints/S3-demo-outcomes.md OUT-08], [→ backlog/sprints/S3-demo-cierre.md §5]
**Dependencias:** ↪ US-055 (pipeline), US-052 (constructor de contexto) · ⛔ ADR-39 (modelo NLI real; los AC se verifican con el adapter falso) · 🔗 Medido en: US-072 (M-10.1 = 100 %, fidelidad y precisión de citas M-07.2, G-2) · 🔗 Consumida por: US-057 (última defensa ante inyección), US-061 (descartadas en la UI)
**Valor:** el oncólogo no puede verificar cada frase de la IA contra cada fuente; necesita que el sistema lo haga por él y que lo que no se pueda respaldar nunca se muestre como válido (P12, JTBD 8). Esta Feature es la garantía G-2: cero opciones sin cita a un chunk recuperado y sin soporte, y cada dato del paciente que viaja a la IA lleva su procedencia.
**Stories:** US-063, US-064 (10 puntos, S1) · US-065 (3 puntos, S3) · US-236 (3 puntos, S3) · US-127 (3 puntos, S3; reordenamiento del 2026-10-23) · US-245 (5 puntos, S4, `[S4 resp. 2]`)

## Fixtures

- Usa **FX-06a-a** (corpus de prueba) y **FX-06a-b** (LLM y NLI falsos), declarados en FEAT-06a.
- **FX-T1a-b · Afirmaciones atómicas** (US-245; extiende FX-06a-a y FX-06a-b, `Q-HER2` y `ch-m1-1`). LLM falsos con una opción O-1 que cita `ch-m1-1` y tres afirmaciones (principal P, secundaria S, salvedad V, cada una ≤ 20 palabras): `LLM-ATOM-OK` · `LLM-ATOM-SEC` (S en `neutral`) · `LLM-ATOM-PRIN` (P en `neutral`) · `LLM-ATOM-SALV` (V en `neutral`) · `LLM-ATOM-ALIAS` (S empieza por «El fragmento C1 reporta que…») · `LLM-ATOM-PRESC` (S contiene «recomendado para este paciente»). NLI falso: `entailment` salvo lo indicado.
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

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se aceptan.

> **Decidido (usuario, 2026-10-14, validación de los oncólogos asesores, `[S1 resp. 29, 34]`):** al retirar una frase por lenguaje no permitido, el log de `rag-orchestrator` registra el `ruleId` y la versión de la política, nunca el texto (la traza completa, con la frase original, pasa a US-150 AC-7, S6). La suite `evaluate` mide `false_positive_language_filter_rate` y se revisa periódicamente; es preferible descartar una opción a convertir una recomendación poblacional en una prescripción.


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
  > **Decidido (sesión principal, 2026-10-29, a confirmar por el usuario en la revisión del PR):** desde el S4 el motivo de esta descartada es `discardReason = lenguaje_no_permitido` (US-245 AC-6), para que la UI distinga el lenguaje no permitido de la falta de soporte (US-246); el texto prohibido sigue sin devolverse `[S4 resp. 11]`.
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
- **AC-4 (borde · conflicto sembrado)** · Dado FX-T1a-a, cuyo receptor de estrógeno `90 %`
  se siembra ya en conflicto (`requiere_revision` y `conflicts_with_id` hacia el del seed,
  insertados por el test, sin detección automática), cuando se arma el contexto, entonces
  ese receptor lleva `provenance.conflict = true`. `[readme §4.1]` `[RN-07]`
  > **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** el AC-4 se verifica sobre un conflicto sembrado, porque la detección real (US-099) pasó al S5. El AC original, con el conflicto detectado por la reconciliación al persistir una extracción, se traslada a US-099 AC-8 (FEAT-03a, S5).
- **AC-5 (borde · etiqueta en el prompt)** · Dado un `clinicalContext` con el Ki-67 en
  `requiere_revision`, cuando `rag-orchestrator` arma el prompt, entonces ese dato
  aparece acompañado de la etiqueta "(sin verificar)" dentro del bloque de datos del
  paciente. `[RN-07]` (asumido en el texto de la etiqueta)

## Contexto técnico
`ProvenanceLabeler` en el módulo `evidence-analysis` de `clinical-api` (aplica la misma
`Provenance` de readme §4.1 a cada elemento del contexto y filtra
`rechazado`/`reemplazado`); en `rag-orchestrator`, `PromptBuilder` (US-057) traduce la
procedencia a etiquetas legibles dentro del bloque de datos. Los estados existen en el
esquema desde el S1 (US-038 AC-7), así que el test los inserta directamente (también el
conflicto, `[S3 resp. 8]`); el flujo real de revisión llega en el S4 (FEAT-03b) y la
detección de conflictos al extraer, en el S5 (US-099). Tests: Supertest con `rag-orchestrator`
simulado (AC-1 a AC-4) y Pytest del constructor de prompt (AC-5).

## INVEST
**Small** ✓ un etiquetador y un filtro sobre el constructor de contexto.
**Testable** ✓ cinco tests sobre el payload y el prompt.

---

## Parte S3

## US-127 — Los metadatos factuales de cada fuente se copian del catálogo del corpus y lo ausente se muestra "No disponible"

> Linear: [L1D-182](https://linear.app/l1der-lab-mjbc/issue/L1D-182)
> **Decidido (usuario, 2026-10-24, cierre de la O1 del S3):** recibe la deuda del enum `guia` en la cita (L1D-287): el rótulo de fuente sale de los metadatos del catálogo, no del valor crudo del enum.

`FEAT-T1a` · Sprint 3 · Estimación **3** · HU-22, HU-20 · RN-25 (dueña) · AC-T1.3 (metadatos), AC-08.9 (valor del estudio) · ↪ US-063, US-118, US-122 · 🔗 Consumida por: FEAT-07 (etiquetas factuales, S6 si hay capacidad), FEAT-09 (vigencia, S6 si hay capacidad) · 🔗 Medido en: US-132 (metadatos del corpus)

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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

## US-236 — El LLM cita los chunks por un alias corto y el sistema lo traduce al `chunkId` real antes de validar la cita

> Linear: [L1D-287](https://linear.app/l1der-lab-mjbc/issue/L1D-287)

`FEAT-T1a` · Sprint 3 · Estimación **3** · HU-03 · RN-01 (regresión), RN-04 (dueña: la cita sale del corpus, no del texto generado) · AC-T1.2, AC-T1.3, AC-10.4 · ↪ US-063, US-055 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-04] → US-063 · 🔗 Medido en: US-072 (precisión de citas, M-07.2) · **Recorrido principal:** sí

> **Origen (demo del 2026-10-23, paciente de mama (a), LLM real `gemma4:26b-a4b-it-q4_K_M`):** con la pregunta «¿Cuándo se considera un inhibidor de CDK4/6 adyutante?» solo un chunk superó el umbral y el único `chunkId` citable era `pmc-mama-cdk46-guia@a3bb26468a32#0000`. El LLM lo copió mal en dos corridas seguidas: una con letras inventadas dentro del id y otra con LaTeX metido en medio. `validar_citas` (coincidencia exacta, RN-04) descartó la opción con `cita_invalida`. La misma pregunta bien escrita citó el id correcto. Es un fallo mecánico de copia, no de significado ni de evidencia; lo que el usuario ve es «No hay opciones descritas con soporte verificable…».

## Story
Como oncólogo, quiero que una opción respaldada por la evidencia recuperada no se descarte
porque el modelo copió mal un identificador largo, para que "sin soporte verificable"
signifique que de verdad no hay soporte y no que falló una transcripción.

## AC (Given/When/Then)
- **AC-1 (happy path · alias en el prompt)** · Dada una recuperación con cuatro chunks sobre el
  umbral (FX-06a-a) y `LLM-OK`, cuando se arma el prompt de generación, entonces cada chunk
  lleva un alias `C1…C4` asignado por orden de `relevance_score` descendente (desempate por
  `chunkId`) y el prompt no contiene ningún `chunkId` real. `[RN-04]`
- **AC-2 (happy path · traducción)** · Dado un LLM falso que cita `C2`, cuando se valida la
  respuesta, entonces la opción queda en `evidenceOptions` y su cita apunta al chunk real de
  `C2`, con `chunkTextSnapshot` igual al texto de ese chunk en el corpus. `[RN-04]` `[AC-T1.3]`
- **AC-3 (borde · alias inexistente)** · Dado un LLM falso que cita `C9` con solo cuatro
  chunks, cuando se valida, entonces la opción va a `discardedOptions` con
  `discardReason = cita_invalida`. `[RN-01]` `[AC-T1.2]`
- **AC-4 (borde · el LLM devuelve el id real)** · Dado un LLM falso que cita el `chunkId` real
  en vez del alias, cuando se valida, entonces la opción va a `discardedOptions` con
  `discardReason = cita_invalida`: el alias es el único formato aceptado y no se repara ningún
  id "parecido". `[RN-04]` (asumido: evita reintroducir una vía que acepte texto generado)
- **AC-5 (invariante · alias efímeros)** · Dados los mismos chunks en el mismo orden, cuando se
  arma el prompt dos veces, entonces los alias son idénticos; y en ningún lugar de la
  respuesta, de la persistencia (`AIAnalysisRecord`) ni de los logs aparece un alias como
  identificador: solo el `chunkId` real. `[RN-06]`
- **AC-6 (invariante · sin chunks nuevos)** · Dado un alias que corresponde a un chunk que no
  superó el umbral en esta consulta, cuando se valida, entonces no existe (los alias solo se
  asignan a los chunks entregados a la generación). `[RN-01]` `[RN-24]`
- **AC-7 (medición · OL-06)** · Dada la suite `evaluate` con el LLM real sobre el dataset de
  evaluación actual (`data/evaluation/`, US-072) y la pregunta del origen con el paciente de
  mama (a), cuando se compara
  contra la referencia, entonces la precisión de citas no baja de 0,90 (M-07.2), el recuento de
  `cita_invalida` no sube y la pregunta del origen produce `cita_invalida = 0` en 10 corridas
  (asumido: tamaño de la muestra; se recalibra en el refinamiento). El reporte de
  `ai-eval-runner` se adjunta al PR (cambia el prompt). `[OL-06]` `[M-07.2]`
  > **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** el AC-7 mide sobre el dataset de evaluación actual y no sobre la partición congelada de US-226 (FEAT-T5e, sin sprint comprometido). US-236 queda confirmada en el S3 (3 pts).

## Contexto técnico
Función pura nueva en `rag-orchestrator/app/domain/` (`alias_de_chunks`: asigna alias y los
traduce de vuelta); `LlmEvidenceGenerator` (`app/application/generation.py`) arma el prompt con
alias y traduce las citas antes de construir `OpcionGenerada`, de modo que `validar_citas`
(`domain/citations.py`) sigue comparando contra `chunkId` reales sin cambios. El prompt y su
`VERSION_DEL_PROMPT` (`app/prompts/rag_query.py`) cambian: la suite `evaluate` es obligatoria.
`FX-06a-b` (LLM falso) se actualiza para citar alias; el contrato OpenAPI no cambia. TDD
estricto (regla de dominio): commit `test(L1D-nn)` con el AC-2 en rojo antes del `feat`.

## INVEST
**Small** ✓ una función pura de alias y un cambio de prompt.
**Testable** ✓ seis tests deterministas con adapters falsos más una medición en `evaluate`.

---

## Parte S4

## US-245 — El generador escribe afirmaciones atómicas, el código añade el marco de atribución y cada afirmación se verifica según su papel

> Linear: [L1D-295](https://linear.app/l1der-lab-mjbc/issue/L1D-295)

`FEAT-T1a` · Sprint 4 · Estimación **5** · HU-03 · RN-01 (regresión, regla por papel), FR-10, RN-04, RN-23, RN-24, ADR-34 · AC-T1.2, AC-10.4 · ⛔ ADR-39 (LLM y NLI reales; los AC usan adapters falsos) · ↪ US-064, US-063, US-236 (alias de chunks), US-225 (generación) · 🔗 Produce para: US-246 (`discardReason = lenguaje_no_permitido`) · 🔗 Medido en: US-233a (fidelidad, precisión de citas y lenguaje con modelos locales) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-04] → US-063 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-24] → US-191 (Post-MVP: la memoria de análisis previos no existe aún en el pipeline)

> **Decidido (usuario, 2026-10-29):** arreglo de OUT-08 con **afirmaciones atómicas**: el LLM escribe oraciones declarativas cortas (≤ 20 palabras), sin modales normativos y sin el alias «El fragmento Cn»; el código añade el marco de atribución de forma determinista («La fuente reporta que…», como ADR-34); la opción se conserva si su afirmación **principal** tiene soporte NLI; una **secundaria** sin soporte se omite y cuenta en `omittedClaims` (RN-01); una afirmación marcada como **salvedad** sin soporte descarta la opción. Requiere validación clínica en la sesión de oncólogos del S4 (no bloquea). La suite `evaluate` (OL-06) es obligatoria `[S4 resp. 2]`.
> **Decidido (sesión principal, 2026-10-29, a confirmar por el usuario en la revisión del PR):** el lenguaje no permitido deja de compartir motivo con la falta de soporte: `DiscardedOption.discardReason` gana el valor `lenguaje_no_permitido`, que emite `rag-orchestrator` y consume US-246 (cambio aditivo, ADR-26) `[S4 resp. 11]`.

## Story
Como oncólogo, quiero que cada frase de una opción diga una sola cosa que la fuente respalda,
con la atribución a la fuente escrita por el sistema y no por la IA, para no perder opciones
correctas por frases largas que el verificador no sabe juzgar y para que ninguna salvedad de la
fuente desaparezca sin que la opción se aparte.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `Q-HER2`, `LLM-ATOM-OK` y el NLI falso en `entailment` de
  FX-T1a-b, cuando se valida, entonces O-1 queda en `evidenceOptions` con `rationale` =
  «La fuente reporta que » + la afirmación principal y cada afirmación secundaria y salvedad en
  `details` con el mismo marco; y el adapter NLI se invocó 3 veces, cada una con la afirmación
  sin el marco como hipótesis y solo el texto de `ch-m1-1` como premisa (nunca otra afirmación
  generada ni el marco). `[S4 resp. 2]` `[RN-01]` `[ADR-34]` `[RN-04]` `[RN-24]`
- **AC-2 (borde · secundaria sin soporte)** · Dado `LLM-ATOM-SEC` (secundaria en `neutral`),
  cuando se valida, entonces O-1 sigue en `evidenceOptions` sin esa afirmación,
  `omittedClaims = 1` y su texto no aparece en ningún campo de la respuesta. `[S4 resp. 2]`
  `[RN-01]` `[AC-T1.2]`
- **AC-3 (borde · principal sin soporte)** · Dado `LLM-ATOM-PRIN` (principal en `neutral`),
  cuando se valida, entonces `evidenceOptions = []` y O-1 está en `discardedOptions` con
  `discardReason = afirmacion_sin_soporte` y `unsupportedClaims` con la principal.
  `[S4 resp. 2]` `[FR-10]` `[AC-10.4]`
- **AC-4 (borde · salvedad sin soporte)** · Dado `LLM-ATOM-SALV` (salvedad en `neutral`,
  principal y secundaria en `entailment`), cuando se valida, entonces O-1 va a
  `discardedOptions` con `discardReason = afirmacion_sin_soporte`: una opción nunca se muestra
  más fuerte que su fuente. `[S4 resp. 2]` `[RN-01]`
- **AC-5 (borde · forma de la afirmación)** · Dado `LLM-ATOM-ALIAS`, cuya secundaria empieza
  por «El fragmento C1 reporta que…», cuando se valida, entonces esa secundaria se omite
  (`omittedClaims = 1`), la opción se conserva por su principal y la cadena «fragmento C» no
  aparece en la respuesta. `[S4 resp. 2]` `[OUT-08]` (asumido: una afirmación con alias, con
  modal normativo o de más de 20 palabras se trata como sin soporte antes del NLI, con la
  regla de su papel)
- **AC-6 (borde · lenguaje no permitido)** · Dado `LLM-ATOM-PRESC`, cuya secundaria contiene
  «recomendado para este paciente» con el NLI en `entailment`, cuando se valida, entonces O-1
  va a `discardedOptions` con `discardReason = lenguaje_no_permitido` y
  `checkProhibitedTerms` sobre la respuesta serializada completa devuelve cero
  coincidencias. `[RN-23]` `[S4 resp. 11]` `[§15 resp. 2]`
- **AC-7 (borde · contrato aditivo del motivo)** · Dado `contracts/schemas/evidence.yaml`
  con `lenguaje_no_permitido` añadido al enum de `DiscardedOption.discardReason`, cuando se
  ejecutan `sync-contracts`, `contracts:check` y `oasdiff`, entonces no hay cambio
  incompatible, existe el ejemplo `con-evidencia-solo-descartadas-lenguaje.json`, los mocks
  MSW/`respx` se construyen desde él y `clinical-api` lo valida con su cliente generado y lo
  persiste sin pérdida. `[ADR-26]` `[S4 resp. 11]` `[RN-06]`
- **AC-8 (borde · NLI no disponible)** · Dado el adapter NLI lanzando un error, cuando se
  valida, entonces `rag-orchestrator` responde `503` con `error = "NLI_UNAVAILABLE"` y ninguna
  opción se devuelve sin validar. `[RN-01]` (regresión de US-064 AC-6)

## Contexto técnico
Prompt de generación nuevo (versión en configuración): por opción, `claims[]` de 1 a 4
elementos `{text, role: principal | secundaria | salvedad, citations[]}`, exactamente una
`principal`, cada `text` ≤ 20 palabras, declarativo, sin modales normativos ni alias de
fragmento. Es el esquema **interno** de salida del LLM, no el contrato público: `rationale` y
`details` de `EvidenceOption` se componen en `domain/` con el marco determinista («La fuente
reporta que…» / «The source reports that…» según el idioma de la pregunta), igual que la
verbalización determinista de ADR-34. `SupportChecker` (US-064) pasa a verificar por
afirmación con la regla por papel; `checkProhibitedTerms` corre antes del NLI y, si una
afirmación de la opción tiene un término prohibido, la opción se descarta con
`lenguaje_no_permitido` (antes `afirmacion_sin_soporte`, US-064 AC-7). Las afirmaciones sueltas
(limitaciones) no cambian (US-064 AC-3, AC-8). **Obligatoria la suite `evaluate` (OL-06)**: el
PR adjunta el reporte de `ai-eval-runner` con la retención de opciones, la fidelidad, la
precisión de citas, las salidas prescriptivas (= 0) y la pregunta insignia de la guía §2.1.
Tests: Pytest unitarios del dominio (composición del marco, regla por papel) y Pytest +
TestClient de `/rag/query` con FX-T1a-b; `contracts:check` en la CI (AC-7); TDD estricto.

## Non-goals
Calibrar el umbral o cambiar el modelo NLI (US-233a, US-120). Solapamiento o corte por
oraciones de los fragmentos (requiere reindexar; ADR). Texto de la UI (US-246).

## INVEST
**Small** ✓ un prompt, un esquema interno y una regla por papel sobre el validador existente;
5 es el techo.
**Testable** ✓ ocho tests deterministas con LLM y NLI falsos, más el reporte de `evaluate`.
*(Valuable ⚠ la regla por papel requiere validación clínica en la sesión de oncólogos del S4;
no bloquea.)*

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | backlog/01-requisitos.md §3: RN-06 con dueña en FEAT-T1a | Encargo del lote 1: RN-06 con dueña en FEAT-06a | No es un conflicto de fuentes: la dueña de RN-06 es US-053 (FEAT-06a). Registrado para trazabilidad |
| Slicing v2 | readme OL-03 (S1): contexto etiquetado con procedencia en el S1; PRD §14 S3: metadatos de fuente (RN-25) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): US-065 en el S3 y US-127 en el S5 | En el S1–S2 el contexto solo lleva datos `seed` verificados; las etiquetas son necesarias desde que entran datos extraídos (S3) |
| S3-2026-10-23 | US-065 contexto técnico: revisión real en el S3 (FEAT-03b); US-065 AC-4 y US-236 AC-7 apoyados en historias que el reordenamiento movió (US-099 al S5, US-226 sin sprint) | Reordenamiento y refinamiento del S3 (2026-10-23): FEAT-03b en el S4, US-099 en el S5 | US-065 AC-4 sobre conflicto sembrado (original → US-099 AC-8); US-236 AC-7 sobre el dataset actual y confirmada en el S3 `[S3 resp. 8]` |
| S4-2026-10-29 | US-064 (S1) y `01-requisitos.md` §15 resp. 2: una opción con cualquier afirmación sin soporte o con término prohibido va a `discardedOptions` con `afirmacion_sin_soporte` | Refinamiento del S4 (usuario, 2026-10-29): regla por papel (principal y salvedad descartan; secundaria se omite y cuenta) `[S4 resp. 2]`; motivo propio `lenguaje_no_permitido` (sesión principal, `[S4 resp. 11]`, a confirmar en la revisión del PR) | Decisión del usuario; compatible con RN-01 porque la secundaria se trata como afirmación suelta (omitida y contada). US-245 amplía el validador de US-064 |
