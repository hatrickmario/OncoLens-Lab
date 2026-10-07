# FEAT-08b — Aplicabilidad paciente ↔ evidencia

> Linear: [L1D-20](https://linear.app/l1der-lab-mjbc/issue/L1D-20)

**Talla:** XL (propone división) · **Sprint:** 5 · **Capacidad:** CAP-08 (AC-08.1–AC-08.6, AC-08.8, AC-08.9) · CAP-04 (AC-04.3: "Desconocido: falta en el paciente") · CAP-10 (AC-10.2: resumen de aplicabilidad en la tarjeta) · T-1 (AC-T1.2 para afirmaciones sobre población) · **Recorrido principal:** sí (hipótesis 3: opciones más aplicables a las condiciones del paciente)
**Requisitos:** FR-25 (dueña, vía HU-22; funcionalidad completa salvo el agente) · RN-28 (dueña de la **agregación** por opción, del comparador y, desde el S3, de la selección por aplicabilidad antes del recorte a `maxOptions`, también con una sola opción; el orden visible de hasta 3 opciones es de US-134, S4) · IA-06 · TBD-13 (aplicabilidad: DEC-11) · RN-01, RN-02, RN-06, RN-25, RN-29 (regresiones)
**Evidencia:** [→ PRD §5 FR-25], [→ PRD §6 RN-01, RN-02, RN-25, RN-26, RN-28, RN-29], [→ PRD §7 NFR (estados de aplicabilidad por texto)], [→ PRD §12 Síntesis y aplicabilidad], [→ PRD §16 TBD-13], [→ PRD §18.2 Estado de aplicabilidad], [→ PRD §18.3.8 AC-08.1–AC-08.6, AC-08.8, AC-08.9, M-08.1–M-08.6], [→ PRD §18.3.10 AC-10.1 ("1 en los Sprints 1–3", ordenada por aplicabilidad)], [→ PRD §5 FR-09 (máximo 1 opción en los Sprints 1–3)], [→ PRD §18.3.4 AC-04.3], [→ readme §5 HU-22], [→ readme §4.1 `ApplicabilityCriterion`, `SourceApplicability`, `ApplicabilitySummary`, `EvidenceOption.perSource`], [→ readme §3.3 #27, #31, #34], [→ backlog/02-adrs.md DEC-11, P-03], [→ backlog/01-requisitos.md §15 (slicing por hipótesis)], [→ docs/AS-IS.md P6, JTBD 4]
**Dependencias:** ↪ US-055 (pipeline), US-063, US-064 (citas y soporte), US-118 (metadatos de población), FEAT-04 US-006 (faltantes en el contexto), US-099 (conflictos) · ⛔ DEC-11 (US-021) · escenario más probable · ⛔ ADR-39 (NLI y LLM reales; los AC usan adapters falsos) · 🔗 Produce para: US-134 (orden de hasta 3 opciones, S5), US-130 (limitación "población no comparable"), US-071 (avisos que no bloquean) · 🔗 Medido en: US-132 (M-08.2, M-08.3, M-08.4, M-08.6) · M-08.1 (VM-3, mixto) → US-024 · DEC-14 (FEAT-T5c, S5) / FEAT-T5d (piloto) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-06] → US-053
**Valor:** el oncólogo encuentra evidencia, pero juzgar si la población del estudio se parece a su paciente le lleva tiempo y es fácil pasar por alto un criterio excluyente (P6, JTBD 4). Con esta Feature cada fuente trae, criterio a criterio, el valor del paciente, el del estudio y si coinciden, sin ningún puntaje clínico, y la opción hereda la aplicabilidad de su fuente más comparable.
**Stories:** US-021 · DEC-11, US-121, US-122, US-123, US-124, US-125, US-126 (29 puntos, S5)

> **Propuesta de división (talla XL: 7 historias, atraviesa los tres servicios).** Publicar sin cambiar IDs como **08b-B2 Motor de aplicabilidad** (US-122, US-123, US-124, US-125) y **08b-catálogo y UI** (US-021 · DEC-11, US-121, US-126).

## Fixtures

- **FX-08b-a · Aplicabilidad de test** (en ambos backends):
  - Catálogo `test-apl-1.0.0` (mama), criterios: `estado_her2` (destino `Biomarker` HER2; **excluyente**; regla: "3+" o "2+ con ISH positivo" → positivo; coincide si el estudio es "positivo"); `estadio` (destino `Diagnosis.stage_value`; coincide si el estadio del paciente está dentro del rango del estudio); `ecog` (destino `Diagnosis.performance_value`; coincide si está en el rango; **parcial** si el estudio lo reporta solo para un subgrupo); `estado_menopausico` (destino `ClinicalAttribute`); `linea_tratamiento` (destino `PriorTreatment`).
  - Paciente **A-M1** (mama, sintético): HER2 "3+ (IHQ)" `verificado`; `TNM_8` "IIA" `verificado`; ECOG 1 `requiere_revision`; sin estado menopáusico (llega en `missingCriticalData`); sin tratamientos previos.
  - Corpus: `doc-a1` (ECA fase III, `metadata_source = fuente_estructurada`, `population_criteria`: HER2 positivo, estadio I–III, ECOG 0–1, estado menopáusico "ambos", línea no reportada); `doc-a2` (guía, sin `population_criteria`; chunk `ch-a2-1`: "This guidance applies to patients with HER2-negative disease"); `doc-a3` (sin información de población); `doc-a4` (estructurado, HER2 "negativo"); `doc-a5` (estructurado, ECOG 0–1 reportado solo para un subgrupo).
  - LLM falso de aplicabilidad: `APL-OK` (para `doc-a2` afirma "HER2 negativo" citando `ch-a2-1`); `APL-SIN-SOPORTE` (para `doc-a2` afirma "estadio I–III" sin respaldo en `ch-a2-1`); `APL-VALOR-PACIENTE` (devuelve `patientValue = "2+"` para `estado_her2`); `APL-CITA-AJENA` (cita `ch-x-999`). NLI falso: `entailment` para "HER2 negativo" contra `ch-a2-1`; `neutral` para "estadio I–III".
- **FX-08b-b · Dos opciones válidas para el recorte a una** (extiende FX-08b-a; perfil de test `RAG_ADAPTERS=fake`, mismo catálogo `test-apl-1.0.0` en ambos backends):
  - Chunks de test (`is_current = true`, mama): `ch-a4-1` (`doc-a4`), `ch-a1-1` (`doc-a1`), `ch-a6-1` (`doc-a6`, ECA estructurado con la misma población que `doc-a1`). Puntajes del *reranker* falso: `ch-a4-1` 0,92 · `ch-a1-1` 0,70 · `ch-a6-1` 0,60.
  - Resúmenes de aplicabilidad con A-M1: `doc-a4` → 1 excluyente (`estado_her2`) en No coincide, `{ coincide: 2, parcial: 0, noCoincide: 1, desconocido: 2 }`; `doc-a1` y `doc-a6` → 0 excluyentes, `{ 3, 0, 0, 2 }`.
  - LLM falso `LLM-DOS-APL` (en este orden de salida): **O-A** cita `ch-a4-1` · **O-B** cita `ch-a1-1`. `LLM-EMPATE-APL`: **O-B** cita `ch-a1-1` · **O-D** cita `ch-a6-1`. `LLM-SIN-SOPORTE-APL`: **O-B'** cita `ch-a1-1` con una afirmación que el NLI falso marca `neutral` · **O-A** cita `ch-a4-1` (`entailment`).
  - Configuración: `EVIDENCE_MAX_OPTIONS = 1`, `RELEVANCE_THRESHOLD = 0.30`.
- **Resultado esperado de A-M1 con `doc-a1`:** `estado_her2` coincide · `estadio` coincide · `ecog` coincide con aviso `sin_verificar` · `estado_menopausico` desconocido (`falta_en_paciente`) · `linea_tratamiento` desconocido (`no_reportado_por_fuente`) → resumen `{ coincide: 3, parcial: 0, noCoincide: 0, desconocido: 2 }`, `populationNotComparable = false`.

---

## US-021 · DEC-11 — Criterios de aplicabilidad, excluyentes y definición de "Parcial"

> Linear: [L1D-125](https://linear.app/l1der-lab-mjbc/issue/L1D-125)

`FEAT-08b` · Sprint 5 (antes de US-121…US-126) · Estimación **1** · — (decisión) · TBD-13 (aplicabilidad), R-24 · RN-28, RN-29 · Dueño: oncólogo asesor · ⛔ DEC-05 (cerrada en el Pre-S1) · 🔗 Bloquea: US-121 (contenido real), US-122 (reglas), US-134, US-132, DEC-19 (US-031)

## Story
Como oncólogo asesor, quiero revisar los criterios de aplicabilidad de cada tipo de
cáncer, cuáles son excluyentes y qué significa "Parcial" en cada uno, para que el estado
por criterio sea reproducible y el orden de las opciones no oculte un juicio clínico.

> Escenario más probable (a refinar en sprint planning): se adoptan los criterios de FR-25 (subtipo, estadio o extensión, línea o tratamiento previo, biomarcadores clave, edad o estado menopáusico, estado funcional), con HER2 en mama y estado de castración en próstata como excluyentes, porque son los ejemplos de AC-08.6; "Parcial" sigue los ejemplos de FR-25. Por **P-03**, el catálogo se publica como `propuesta` revisada por el oncólogo, sin sesión de firma, y su validación se mide con el feedback agregado de cada análisis (VM-4: ≥ 70 % de análisis con calificación ≥ 4, con muestra mínima; respuesta 5 del usuario, §15; US-139) y con la concordancia de VM-3 (DEC-14).

## AC (Given/When/Then)
- **AC-1** · Dados los criterios, cuando el oncólogo los revise, entonces la versión del
  catálogo lleva un bloque `validation` con `scope = "aplicabilidad"`,
  `status = "propuesta_revisada"`, el rol del revisor y la fecha; y cada criterio tiene
  campo de destino, marca de excluyente y regla de "Parcial". `[TBD-13]` `[RN-29]` `[P-03]` (asumido)
- **AC-2** · Dada la decisión, cuando se registre, entonces no introduce ningún puntaje ni
  ponderación clínica de criterios. `[RN-28]`
- **AC-3** · Dado `docs/decisions/DEC-11-criterios-aplicabilidad.md`, cuando se registre,
  entonces declara que no hay firma formal (P-03) y que la validación se mide con el
  feedback agregado de VM-4 (≥ 70 % con calificación ≥ 4, con muestra mínima) y con
  VM-3. `[P-03]` `[§15 resp. 5]`
- **AC-4** · Dado un criterio que el oncólogo rechace, cuando se publique la versión,
  entonces ese criterio no está en ella. (asumido)

## Contexto técnico
Ubicada en FEAT-08b, adelantada al S3 con la aplicabilidad (slicing adoptado). La
mecánica (validador del bloque `validation`, destino de cada criterio) es de US-121 y de
FEAT-04 US-001; esta historia solo registra la decisión.

## INVEST
**Small** ✓ una revisión de una lista corta de criterios.
**Testable** ✓ el catálogo y el documento contienen el bloque, la fecha y el revisor.

---

## US-121 — Los criterios de aplicabilidad de mama y próstata viven en el catálogo con destino, excluyentes y regla de "Parcial"

> Linear: [L1D-126](https://linear.app/l1der-lab-mjbc/issue/L1D-126)

`FEAT-08b` · Sprint 5 · Estimación **3** · HU-22 · FR-25 (criterios en el catálogo), RN-29, RN-28 · AC-08.1 (criterios del catálogo), AC-04.5 (aplicabilidad) · ⛔ DEC-11 · escenario más probable · ↪ US-041, FEAT-04 US-001 (validador del catálogo; US-042 es `si-hay-capacidad`) · 🔗 Regresión [RN-29] → US-001 · 🔗 Regresión [NFR-14] → US-041

## Story
Como oncólogo, quiero que los criterios con los que se compara a mi paciente con cada
estudio estén escritos en un catálogo versionado, cada uno ligado a un dato real del
caso, para que la comparación sea siempre la misma y se pueda revisar.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la versión de catálogo del S3, cuando se listan sus
  criterios de aplicabilidad, entonces mama trae `estado_her2`, `receptores_hormonales`,
  `estadio`, `linea_tratamiento`, `estado_menopausico` y `ecog`, y próstata trae
  `estado_castracion`, `extension`, `isup`, `linea_tratamiento`, `ecog` y `hrr_brca`;
  cada uno con `destination`, `isExclusionary` y `rule`, y `estado_her2` y
  `estado_castracion` con `isExclusionary = true`. `[FR-25]` `[AC-08.6]` (asumido en las
  claves, escenario de DEC-11)
- **AC-2 (borde · sin destino)** · Dado un criterio sin `destination`, cuando se ejecuta
  `catalog:validate`, entonces termina con código ≠ 0 y nombra el criterio.
  `[RN-29]` `[AC-04.5]`
- **AC-3 (invariante · sin puntaje)** · Dado un criterio con un campo `peso`, `score` o
  `weight`, cuando se ejecuta `catalog:validate`, entonces termina con código ≠ 0.
  `[RN-28]` (asumido en el mecanismo)
- **AC-4 (borde · misma versión en ambos backends)** · Dado `rag-orchestrator` con una
  versión de catálogo distinta, cuando `clinical-api` pide un análisis, entonces recibe
  `409 CATALOG_VERSION_MISMATCH` y no se persiste ningún registro. `[NFR-14]` `[ADR-38]`
- **AC-5 (borde · regla declarativa)** · Dado el paciente A-M1 y `doc-a1`, cuando la
  misma build arranca con una versión de catálogo cuyo rango de `ecog` del criterio
  cambia, entonces el estado calculado cambia sin desplegar código. `[RN-22]` `[NFR-14]`

## Contexto técnico
`packages/clinical-catalogs/<tipo>/aplicabilidad.json`: datos, no código `[ADR-29]`; reglas
declarativas (igualdad, pertenencia a una lista, rango) sobre valores estructurados. El
validador de destinos es el de FEAT-04 US-001 (dueña de RN-29), que ya recorre los
criterios de aplicabilidad. Tests: tests del validador sobre fixtures y Pytest de carga
del catálogo en `rag-orchestrator`.

## INVEST
**Small** ✓ contenido de catálogo más dos reglas del validador.
**Testable** ✓ cinco tests sobre el catálogo y el validador.

---

## US-122 — Con valores estructurados, el estado de cada criterio se calcula con la regla del catálogo y el valor del paciente se copia del contexto

> Linear: [L1D-127](https://linear.app/l1der-lab-mjbc/issue/L1D-127)

`FEAT-08b` · Sprint 5 · Estimación **5** · HU-22 · FR-25 (estado determinista), ADR-34 (b), RN-25 · AC-08.1, AC-08.9, AC-T4.4 · ⛔ DEC-11 · escenario más probable · ↪ US-121, US-118, US-055 · 🔗 Regresión [RN-25] → US-127 · 🔗 Medido en: US-132 (M-08.2, M-08.6)

## Story
Como oncólogo, quiero que cuando el estudio publica su población de forma estructurada
el sistema compare criterio a criterio con una regla fija y con los datos reales de mi
paciente, para que la comparación no dependa de lo que interprete el modelo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados A-M1, `doc-a1` y `test-apl-1.0.0`, cuando se procesa un
  análisis que recupera `doc-a1`, entonces `applicability[doc-a1].criteria` trae
  `estado_her2` con `patientValue = "3+ (IHQ)"`, `studyPopulationValue = "HER2
  positivo"`, `status = coincide`, `isExclusionary = true` y `citedSources` con la fuente
  `doc-a1`; y `estadio` y `ecog` en `coincide`. `[AC-08.1]` `[AC-08.9]` `[HU-22]`
- **AC-2 (invariante · valor del paciente copiado)** · Dado `APL-VALOR-PACIENTE`, cuando
  se procesa, entonces `patientValue` de `estado_her2` sigue siendo "3+ (IHQ)", igual al
  valor del `clinicalContext` enviado. `[AC-08.9]` `[M-08.6]` `[ADR-34]`
- **AC-3 (borde · no coincide)** · Dado un `doc-a4` estructurado con HER2 "negativo",
  cuando se evalúa, entonces `estado_her2` queda `no_coincide`. `[FR-25]`
- **AC-4 (borde · parcial)** · Dado un `doc-a5` cuyo ECOG 0–1 se reporta solo para un
  subgrupo, cuando se evalúa `ecog`, entonces queda `parcial` según la regla del
  catálogo. `[FR-25]` `[DEC-11]`
- **AC-5 (borde · metadato ausente)** · Dado `doc-a3`, cuando se evalúa, entonces cada
  criterio queda `desconocido` con `unknownReason = no_reportado_por_fuente` y
  `studyPopulationValue = null`, sin inferir nada. `[AC-08.3]` `[RN-25]`
- **AC-6 (borde · determinismo sin LLM)** · Dados A-M1 y `doc-a1`, cuando se calcula dos
  veces, entonces el resultado es idéntico y el LLM no se invoca para ningún criterio
  estructurado. `[AC-08.9]` `[ADR-34]`

## Contexto técnico
`ApplicabilityService` en `rag-orchestrator/application/` con la regla pura en
`domain/applicability_rules.py`; trabaja solo con el `clinicalContext` desidentificado y
con el catálogo del corpus `[AC-T4.4]` `[SEG-06]`. El valor del estudio se copia de
`population_criteria` (RN-25). `maxOptions` (`EVIDENCE_MAX_OPTIONS`) vale 1 hasta el S4;
desde el S3 esa opción única la elige el comparador de aplicabilidad de US-125 (AC-5),
no la relevancia, que solo desempata. Tests: Pytest con FX-08b-a.

## INVEST
**Small** ✓ una regla pura por criterio sobre datos ya presentes.
**Testable** ✓ seis tests deterministas.

---

## US-123 — Si la población del estudio solo está en el texto, el valor se acepta solo con cita y soporte; si no, queda "Desconocido"

> Linear: [L1D-128](https://linear.app/l1der-lab-mjbc/issue/L1D-128)

`FEAT-08b` · Sprint 5 · Estimación **5** · HU-22 · FR-25 (valor textual), RN-01, ADR-34 · AC-08.3, AC-T1.2 (aplicabilidad) · ⛔ ADR-39 (NLI) · ↪ US-122, US-063, US-064 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-04] → US-063

## Story
Como oncólogo, quiero que lo que el sistema afirma sobre la población de un estudio
esté citado y comprobado contra el texto, y que si no lo está me lo diga como
desconocido, para no tomar por cierta una característica del estudio que nadie verificó.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados A-M1, `doc-a2` y `APL-OK`, cuando se evalúa, entonces
  `estado_her2` trae `studyPopulationValue = "HER2 negativo"`, `citedSources` con
  `ch-a2-1`, `status = no_coincide` y el NLI se invocó con `ch-a2-1` como premisa.
  `[AC-08.3]` `[FR-25]` `[ADR-34]`
- **AC-2 (borde · sin soporte)** · Dado `APL-SIN-SOPORTE`, cuando se evalúa `estadio`,
  entonces queda `desconocido` con `unknownReason = no_reportado_por_fuente`, la
  afirmación no aparece en la respuesta y `omittedClaims` aumenta en 1.
  `[AC-08.3]` `[HU-22]` `[RN-01]`
- **AC-3 (borde · cita ajena)** · Dado `APL-CITA-AJENA`, cuando se evalúa, entonces el
  criterio queda `desconocido` (`no_reportado_por_fuente`). `[RN-01]` `[AC-T1.2]`
- **AC-4 (invariante · nunca se infiere)** · Dado un LLM falso que no dice nada sobre
  `linea_tratamiento` de `doc-a2`, cuando se evalúa, entonces el criterio queda
  `desconocido` (`no_reportado_por_fuente`). `[AC-08.3]` `[FR-25]`
- **AC-5 (borde · NLI no disponible)** · Dado el adapter NLI lanzando un error durante la
  aplicabilidad, cuando se procesa el análisis, entonces `rag-orchestrator` responde `503`
  y no devuelve ninguna aplicabilidad sin validar. (asumido: falla cerrada, igual que
  US-064 AC-6)

## Contexto técnico
El LLM solo propone el valor del estudio cuando no hay metadato estructurado; el estado
lo asigna la regla del catálogo sobre el valor validado o, si el valor es textual sin
regla, el LLM, y esa asignación se valida con NLI `[ADR-34]`. Reutiliza
`citations.py` (US-063) y `SupportChecker` (US-064). Tests: Pytest con FX-08b-a.

## INVEST
**Small** ✓ un camino más del servicio que reutiliza los validadores existentes.
**Testable** ✓ cinco tests con LLM y NLI falsos.

---

## US-124 — Cada criterio desconocido dice su causa, avisa si el dato del paciente no está verificado, y un excluyente en "No coincide" marca la población como no comparable

> Linear: [L1D-129](https://linear.app/l1der-lab-mjbc/issue/L1D-129)

`FEAT-08b` · Sprint 5 · Estimación **5** · HU-22 · FR-25 (causa, avisos, no comparable, conteo), FR-11 (avisos por criterio), RN-28 (conteo), RN-26 · AC-08.2, AC-08.4, AC-08.5, AC-08.6, AC-04.3 (aplicabilidad) · ↪ US-122, US-123, FEAT-04 US-006, US-099 · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-26] → US-071

## Story
Como oncólogo, quiero saber por qué un criterio quedó sin evaluar, si el dato de mi
paciente que se comparó es provisional y si la población de un estudio no es comparable
por un criterio excluyente, para pesar cada fuente con esa información a la vista.

## AC (Given/When/Then)
- **AC-1 (happy path · falta en el paciente)** · Dados A-M1 y `doc-a1`, cuando se
  evalúa, entonces `estado_menopausico` trae `status = desconocido`,
  `unknownReason = falta_en_paciente`, `patientValue = null` y
  `patientDataWarning = faltante`. `[AC-08.2]` `[AC-04.3]` `[HU-22]`
- **AC-2 (borde · sin verificar)** · Dado el ECOG de A-M1 en `requiere_revision`, cuando
  se evalúa, entonces `ecog` trae su estado calculado y
  `patientDataWarning = sin_verificar`. `[AC-08.4]` `[HU-22]`
- **AC-3 (borde · en conflicto)** · Dado un A-M1 con dos HER2 en conflicto (US-099),
  cuando se evalúa, entonces `estado_her2` trae `patientDataWarning = en_conflicto`.
  `[AC-08.4]` `[AC-03.2]`
- **AC-4 (borde · población no comparable)** · Dados A-M1, `doc-a2` y `APL-OK`, cuando se
  evalúa, entonces `applicability[doc-a2].populationNotComparable = true`. `[AC-08.6]` `[HU-22]`
- **AC-5 (invariante · conteo, nunca puntaje)** · Dados A-M1 y `doc-a1`, cuando se
  evalúa, entonces `summary = { coincide: 3, parcial: 0, noCoincide: 0, desconocido: 2 }`
  y la respuesta valida contra el esquema sin ningún campo numérico de puntaje o
  porcentaje de aplicabilidad. `[AC-08.5]` `[RN-28]`
- **AC-6 (invariante · sin evidencia)** · Dado `Q-SIN`, cuando se procesa, entonces
  `applicability = []` y el LLM registra cero invocaciones. `[RN-02]`
- **AC-7 (borde · persistida)** · Dado el análisis del AC-1, cuando se lee el
  `AIAnalysisRecord`, entonces `applicability` es igual a la de la respuesta. `[RN-06]` `[AC-T1.4]`

## Contexto técnico
`ApplicabilityService` (B2) marca `falta_en_paciente` a partir de
`clinicalContext.missingCriticalData` (FEAT-04 US-006) y `patientDataWarning` a partir de
la `provenance` del dato (`reviewStatus`, `conflict`) `[RN-07]`. El aviso por criterio no
bloquea (RN-26). Tests: Pytest con FX-08b-a (AC-1 a AC-6) y Supertest de persistencia
(AC-7).

## INVEST
**Small** ✓ tres marcas deterministas y un conteo sobre la salida del servicio.
**Testable** ✓ siete tests deterministas.

---

## US-125 — Una opción con varias fuentes hereda la aplicabilidad de la más comparable, y con una sola opción se elige la más aplicable

> Linear: [L1D-130](https://linear.app/l1der-lab-mjbc/issue/L1D-130)

`FEAT-08b` · Sprint 5 · Estimación **5** · HU-22 · FR-25 (aplicabilidad de una opción), FR-09 (S3: 1 opción), RN-28 (dueña de la agregación, del comparador y de la selección antes del recorte), RN-03, RN-22 · AC-08.8, AC-10.1 (opción única del S3) · ↪ US-124, US-055, US-064 · 🔗 Regresión [RN-01] → US-064 · 🔗 Produce para: US-134 (orden de hasta 3 opciones con el mismo comparador, S5), US-101 (`poblacion_no_comparable` en la tarjeta)

## Story
Como oncólogo, quiero que una opción respaldada por varias fuentes muestre la
aplicabilidad de la fuente más parecida a mi paciente y también la de cada una de las
demás, y que cuando solo se muestra una opción sea la más comparable con mi paciente y
no la de mayor puntaje de búsqueda, para no descartar ni preferir una opción por la
relevancia de la búsqueda.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una opción que cita `doc-a1` (0 excluyentes en No
  coincide, 3 coincide) y `doc-a2` (1 excluyente en No coincide), cuando se agrega,
  entonces `applicabilitySummary` es el de `doc-a1`, `perSource` trae ambas fuentes con
  su propio resumen y `populationNotComparable = false`. `[AC-08.8]` `[HU-22]` `[ADR-31]`
- **AC-2 (borde · todas no comparables)** · Dada una opción cuyas dos fuentes tienen un
  excluyente en No coincide, cuando se agrega, entonces
  `populationNotComparable = true` y `warnings` incluye `poblacion_no_comparable`.
  `[AC-08.8]` `[readme §4.1]`
- **AC-3 (borde · empate)** · Dadas dos fuentes con los mismos conteos, cuando se
  agrega, entonces la más aplicable es la de mayor `relevanceScore`. `[RN-28]`
- **AC-4 (invariante · comparador determinista)** · Dada la tabla de casos del
  comparador (excluyentes en No coincide ascendente → Coincide descendente → relevancia
  descendente), cuando se evalúa la función pura, entonces devuelve el orden esperado en
  todos los casos y nunca usa un puntaje combinado. `[RN-28]` `[ADR-27]`
- **AC-5 (invariante · recorte a una opción por aplicabilidad)** · Dado `maxOptions = 1`
  (configurable, `EVIDENCE_MAX_OPTIONS`) y `LLM-DOS-APL` de FX-08b-b con dos opciones
  válidas, O-A con 1 excluyente en No coincide y relevancia 0,92 y O-B con 0 excluyentes
  y relevancia 0,70, cuando se recorta, entonces la opción devuelta en `evidenceOptions`
  es O-B; la relevancia solo desempata a igualdad de conteos. `[RN-28]` `[AC-10.1]`
  `[FR-09]` `[RN-22]`
- **AC-6 (borde · desempate por relevancia con una opción)** · Dado `maxOptions = 1` y
  `LLM-EMPATE-APL` (O-B y O-D con 0 excluyentes y 3 en Coincide; relevancia 0,70 y 0,60),
  cuando se recorta, entonces la opción devuelta es O-B. `[RN-28]` `[RN-03]` `[AC-10.1]`
- **AC-7 (borde · se ordena después de validar y antes de recortar)** · Dado
  `maxOptions = 1` y `LLM-SIN-SOPORTE-APL` (O-B' más aplicable pero sin soporte NLI,
  O-A con soporte), cuando se procesa, entonces `evidenceOptions` = [O-A] y O-B' aparece
  en `discardedOptions` con `discardReason = afirmacion_sin_soporte`: una descartada nunca
  ocupa la posición. `[RN-01]` `[FR-10]` `[RN-28]`

## Contexto técnico
Función pura `applicability_order` en `rag-orchestrator/app/domain/` (comparador de
RN-28), usada aquí para elegir la fuente más aplicable de cada opción y para ordenar las
opciones antes del recorte; en el S4 US-134 reutiliza el mismo paso con
`maxOptions = 3`. En `RAGOrchestratorService` el orden es: validación de citas (US-063) y
soporte (US-064) → agregación por opción → orden con `applicability_order` → recorte a
`maxOptions`. El orden se aplica **antes** del recorte y **después** de la validación de
citas y soporte, para que una descartada nunca ocupe posición. `maxOptions` llega de
`clinical-api` desde `EVIDENCE_MAX_OPTIONS` (1 en el S3) `[RN-22]`; con aplicabilidad
presente la relevancia nunca es criterio principal (S1–S2: US-055 AC-8). Tests: Pytest
unitarios del comparador y de la agregación (AC-1…AC-4) y Pytest + TestClient de
`/rag/query` con adapters falsos de FX-08b-b (AC-5…AC-7).

## INVEST
**Small** ✓ un comparador puro, una agregación y un paso de orden antes del recorte ya
existente (+2 puntos respecto del 3 original por la integración en el pipeline).
**Testable** ✓ siete tests deterministas: cuatro unitarios con tabla de casos y tres de
`/rag/query` con adapters falsos.

---

## US-126 — Veo la tabla de aplicabilidad de cada fuente y el resumen de la opción, con estados en texto y los avisos visibles

> Linear: [L1D-131](https://linear.app/l1der-lab-mjbc/issue/L1D-131)

`FEAT-08b` · Sprint 5 · Estimación **5** · HU-22 · FR-25 (UI), NFR-12 (estados por texto), RN-28 (texto del criterio desde el S3) · AC-08.1, AC-08.2, AC-08.4, AC-08.5, AC-08.6, AC-08.8 (UI), AC-10.2 (aplicabilidad en la tarjeta), AC-10.1 (texto del criterio, S3) · ↪ US-124, US-125, US-061 · 🔗 Consume: FEAT-04 US-004 (enlace al checklist) · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-26] → US-071

## Story
Como oncólogo, quiero ver criterio a criterio cuánto se parece la población de cada
estudio a mi paciente, con las causas y los avisos en texto, para juzgar si la evidencia
aplica antes de considerarla.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el análisis de A-M1 con `doc-a1`, cuando el oncólogo abre
  el detalle de la fuente, entonces ve una tabla con criterio, valor del paciente, valor
  del estudio y estado en texto ("Coincide", "Parcial", "No coincide", "Desconocido"), y
  el resumen "3 coinciden · 2 desconocidos". `[AC-08.1]` `[AC-08.5]` `[NFR-12]`
- **AC-2 (borde · desconocido con causa)** · Dado `estado_menopausico`, cuando se
  muestra, entonces se lee "Desconocido: falta en el paciente" con un enlace a la sección
  "Datos críticos" de la vista de caso; y `linea_tratamiento` muestra "Desconocido: no
  reportado por la fuente". `[AC-08.2]` `[HU-22]`
- **AC-3 (borde · no comparable)** · Dada `doc-a2`, cuando se muestra, entonces la fuente
  lleva la etiqueta visible "Población no comparable". `[AC-08.6]` `[HU-22]`
- **AC-4 (borde · aviso del dato del paciente)** · Dado `ecog`, cuando se muestra,
  entonces el criterio lleva "Dato del paciente sin verificar". `[AC-08.4]` `[HU-22]`
- **AC-5 (borde · opción con varias fuentes)** · Dada la opción de US-125 AC-1, cuando se
  muestra la tarjeta, entonces trae el resumen de `doc-a1` y, al expandir, el de cada
  fuente. `[AC-08.8]` `[AC-10.2]`
- **AC-6 (invariante · sin puntaje visible)** · Dada la pantalla del AC-1, cuando se
  inspecciona, entonces no hay ningún porcentaje ni número de aplicabilidad distinto de
  los conteos por estado. `[AC-08.5]` `[RN-28]`
- **AC-7 (borde · criterio de orden real)** · Dada una respuesta con
  `evidenceOptions` de 1 elemento y `applicability` no vacía (FX-08b-b, AC-5 de US-125),
  cuando se renderiza el panel, entonces encima de la opción se lee "Ordenadas por
  coincidencia con la población estudiada, no por eficacia" y no aparece el texto neutro
  de US-061 AC-3. `[RN-28]` `[AC-10.1]` `[§15 resp. 7]`

## Contexto técnico
Organismos `ApplicabilityTable` y `ApplicabilityCount` (este último reservado desde el
S1, OL-04) en el panel de análisis; los textos de estado y causa son literales de UI en
español. El texto del criterio de orden sale del catálogo i18n de `web`
(`evidence.orderCriterion.applicability`; el neutro `evidence.orderCriterion.relevance` es
de US-061) y se elige por la respuesta: con `applicability` no vacía, el de aplicabilidad.
El orden visible de varias opciones llega en el S4 (US-134). Tests:
Playwright contra Compose en perfil de test con `rag-orchestrator` en modo falso
(FX-08b-a) y el mismo catálogo de test montado en ambos backends.

## INVEST
**Small** ✓ dos organismos de presentación sobre un contrato ya poblado y un literal.
**Testable** ✓ siete tests E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD FR-25 y §14: aplicabilidad en el S4; readme §5.0: HU-22 en el S4 | Slicing adoptado (`01-requisitos.md` §15, usuario 2026-10-06): aplicabilidad en el S3 | Slicing adoptado: FEAT-08b en el S3; el agente (AC-08.7) sigue en FEAT-08c (Post-MVP) y el orden de hasta 3 opciones en el S4 |
| P-03 | PRD §14 G-Piloto y RN-20: criterios de aplicabilidad firmados por el oncólogo | Decisión P-03: sin firma formal; catálogo `propuesta` revisado y validación por feedback agregado | P-03 (US-021 AC-1, AC-3); se registra para enmendar el PRD |
| — | backlog/01-requisitos.md §3: dueña de RN-28 = FEAT-10c (orden), regresión en FEAT-08b (agregación) | — | FEAT-08b es dueña de la agregación y del comparador (US-125); US-134 (S4) es dueña del orden visible de hasta 3 opciones |
| — | readme HU-22 escenario 4: "las opciones que se basan en ella quedan después" | PRD FR-09: 1 opción en los Sprints 1–3 | PRD: con una sola opción no hay orden visible en el S3; se verifica en el S4 (US-134) |
| Slicing v2 | PRD FR-25 y §14 S4; slicing "por hipótesis" (2026-10-06): S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): aplicabilidad en el S5 (G-Demo al cierre del S5), sobre la ingesta del corpus del S4 | Se siguió el slicing v2 |
