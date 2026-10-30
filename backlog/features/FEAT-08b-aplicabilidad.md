# FEAT-08b — Aplicabilidad paciente ↔ evidencia

> Linear: [L1D-20](https://linear.app/l1der-lab-mjbc/issue/L1D-20)

**Talla:** XL (propone división) · **Sprint:** 3 (US-021, US-121…US-125) · 4 (US-126; reordenamiento del 2026-10-23, antes todo en el S5 · refinamiento del S4: cierre de US-021 · DEC-11 y etapa 2 de la población del estudio, US-241, US-243, US-244, ADR-47, `[S4 resp. 3]`) · **Capacidad:** CAP-08 (AC-08.1–AC-08.6, AC-08.8, AC-08.9) · CAP-04 (AC-04.3: "Desconocido: falta en el paciente") · CAP-10 (AC-10.2: resumen de aplicabilidad en la tarjeta) · T-1 (AC-T1.2 para afirmaciones sobre población) · **Recorrido principal:** sí (hipótesis 3: opciones más aplicables a las condiciones del paciente)
**Requisitos:** FR-25 (dueña, vía HU-22; funcionalidad completa salvo el agente) · RN-28 (dueña de la **agregación** por opción, del comparador y, desde el S3, de la selección por aplicabilidad antes del recorte a `maxOptions`, también con una sola opción; el orden visible de hasta 3 opciones es de US-134, S4) · IA-06 · TBD-13 (aplicabilidad: DEC-11) · ADR-47 (población del estudio en lista acotada por fragmento, S4) · RN-01, RN-02, RN-06, RN-25, RN-29 (regresiones)
**Evidencia:** [→ PRD §5 FR-25], [→ PRD §6 RN-01, RN-02, RN-25, RN-26, RN-28, RN-29], [→ PRD §7 NFR (estados de aplicabilidad por texto)], [→ PRD §12 Síntesis y aplicabilidad], [→ PRD §16 TBD-13], [→ PRD §18.2 Estado de aplicabilidad], [→ PRD §18.3.8 AC-08.1–AC-08.6, AC-08.8, AC-08.9, M-08.1–M-08.6], [→ PRD §18.3.10 AC-10.1 ("1 en los Sprints 1–3", ordenada por aplicabilidad)], [→ PRD §5 FR-09 (máximo 1 opción en los Sprints 1–3)], [→ PRD §18.3.4 AC-04.3], [→ readme §5 HU-22], [→ readme §4.1 `ApplicabilityCriterion`, `SourceApplicability`, `ApplicabilitySummary`, `EvidenceOption.perSource`], [→ readme §3.3 #27, #31, #34], [→ backlog/02-adrs.md DEC-11, P-03], [→ backlog/01-requisitos.md §15 (slicing por hipótesis)], [→ docs/AS-IS.md P6, JTBD 4], [→ docs/architecture/adr/ADR-47-extraccion-poblacion-en-abanico.md], [→ docs/decisions/DEC-11-aplicabilidad-lista-de-poblacion.md], [→ backlog/sprints/S3-demo-cierre.md §4 F-20…F-24], [→ backlog/sprints/S3-demo-outcomes.md OUT-06, OUT-07], [→ backlog/sprints/S4-insumo-extraccion-poblacion.md §2, §6 R1…R18]
**Dependencias:** ↪ US-055 (pipeline), US-063, US-064 (citas y soporte), US-118 (metadatos de población), FEAT-04 US-006 (faltantes en el contexto), US-099 (conflictos: detección real en el S5; en el S3, conflicto sembrado) · ⛔ DEC-11 (US-021) · escenario `propuesta_revisada` aceptado para el S3, cierre en la sesión de oncólogos del S4 `[S3 resp. 1]` · ⛔ ADR-39 (NLI y LLM reales; los AC usan adapters falsos) · ADR-47 (aceptado el 2026-10-29) · ↪ US-242 (extractor en abanico, FEAT-06c) · 🔗 Produce para: US-134 (orden de hasta 3 opciones, S4), US-130 (limitación "población no comparable"), US-071 (avisos que no bloquean) · 🔗 Medido en: US-132 (M-08.2, M-08.3, M-08.4, M-08.6) · M-08.1 (VM-3, mixto) → US-024 · DEC-14 (FEAT-T5c, S5) / FEAT-T5d (piloto) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-06] → US-053
**Valor:** el oncólogo encuentra evidencia, pero juzgar si la población del estudio se parece a su paciente le lleva tiempo y es fácil pasar por alto un criterio excluyente (P6, JTBD 4). Con esta Feature cada fuente trae, criterio a criterio, el valor del paciente, el del estudio y si coinciden, sin ningún puntaje clínico, y la opción hereda la aplicabilidad de su fuente más comparable.
**Stories:** US-021 · DEC-11, US-121, US-122, US-123, US-124, US-125, US-126, US-241, US-243, US-244 (40 puntos: 23 en el S3 —criterios, cálculo y herencia: US-121…US-125— y 17 en el S4 —cierre de DEC-11 (1), tabla y UI con varios valores (US-126, 5), contrato y migración (US-241, 3), dominio de estados con listas (US-243, 5) y respaldo en la consulta (US-244, 3)—; reordenamiento del 2026-10-23 y refinamiento del S4, `[S4 resp. 3]`, `[S4 resp. 6]`)

> **Propuesta de división (talla XL: 7 historias, atraviesa los tres servicios).** Publicar sin cambiar IDs como **08b-B2 Motor de aplicabilidad** (US-122, US-123, US-124, US-125) y **08b-catálogo y UI** (US-021 · DEC-11, US-121, US-126).

## Fixtures

- **FX-08b-a · Aplicabilidad de test** (en ambos backends):
  - Catálogo `test-apl-1.0.0` (mama), criterios: `estado_her2` (destino `Biomarker` HER2; **excluyente**; regla: "3+" o "2+ con ISH positivo" → positivo; coincide si el estudio es "positivo"); `estadio` (destino `Diagnosis.stage_value`; coincide si el estadio del paciente está dentro del rango del estudio); `ecog` (destino `Diagnosis.performance_value`; coincide si está en el rango; **parcial** si el estudio lo reporta solo para un subgrupo); `estado_menopausico` (destino `ClinicalAttribute`); `linea_tratamiento` (destino `PriorTreatment`).
  - Paciente **A-M1** (mama, sintético): HER2 "3+ (IHQ)" `verificado`; `TNM_8` "IIA" `verificado`; ECOG 1 `requiere_revision`; sin estado menopáusico (llega en `missingCriticalData`); sin tratamientos previos.
  - Corpus: `doc-a1` (ECA fase III, `metadata_source = fuente_estructurada`, `population_criteria`: HER2 positivo, estadio I–III, ECOG 0–1, estado menopáusico "ambos", línea no reportada); `doc-a2` (guía, sin `population_criteria`; chunk `ch-a2-1`: "This guidance applies to patients with HER2-negative disease"); `doc-a3` (sin información de población); `doc-a4` (estructurado, HER2 "negativo"); `doc-a5` (estructurado, ECOG 0–1 reportado solo para un subgrupo).
  - LLM falso de aplicabilidad: `APL-OK` (para `doc-a2` afirma "HER2 negativo" citando `ch-a2-1`); `APL-SIN-SOPORTE` (para `doc-a2` afirma "estadio I–III" sin respaldo en `ch-a2-1`); `APL-VALOR-PACIENTE` (devuelve `patientValue = "2+"` para `estado_her2`); `APL-CITA-AJENA` (cita `ch-x-999`). NLI falso: `entailment` para "HER2 negativo" contra `ch-a2-1`; `neutral` para "estadio I–III".
- **FX-08b-b · Dos opciones válidas para el recorte a una** (extiende FX-08b-a; perfil de test `RAG_ADAPTERS=fake`, mismo catálogo `test-apl-1.0.0` en ambos backends):
  - Chunks de test (`is_current = true`, mama): `ch-a4-1` (`doc-a4`), `ch-a1-1` (`doc-a1`), `ch-a6-1` (`doc-a6`, ECA estructurado con la misma población que `doc-a1`). Puntajes del *reranker* falso: `ch-a4-1` 0,92 · `ch-a1-1` 0,70 · `ch-a6-1` 0,60.
  - Resúmenes de aplicabilidad con A-M1: `doc-a4` → 1 excluyente (`estado_her2`) en No coincide, `{ coincide: 0, parcial: 0, noCoincide: 1, desconocido: 4 }`; `doc-a1` y `doc-a6` → 0 excluyentes, `{ 2, 0, 0, 3 }`.
  - > **Decidido (usuario, 2026-10-28):** con el catálogo 1.1.0 el `estadio` queda `desconocido` por falta de escala comparable en el catálogo, y el catálogo de test tiene 5 criterios; por eso A-M1 × `doc-a1` es `{ 2, 0, 0, 3 }` (antes `{ 3, 0, 0, 2 }`) y A-M1 × `doc-a4` es `{ 0, 0, 1, 4 }` (antes `{ 2, 0, 1, 2 }`). Alinea FX-08b-a, FX-08b-b, US-124 AC-5, US-125 AC-1 (el AC no nombra `doc-a4`; solo cambia `doc-a1`) y US-126 AC-1 con los conteos reales. FX-10c-a (`APL-FIJA`) es un adaptador falso de resúmenes fijos y no se toca.
  - LLM falso `LLM-DOS-APL` (en este orden de salida): **O-A** cita `ch-a4-1` · **O-B** cita `ch-a1-1`. `LLM-EMPATE-APL`: **O-B** cita `ch-a1-1` · **O-D** cita `ch-a6-1`. `LLM-SIN-SOPORTE-APL`: **O-B'** cita `ch-a1-1` con una afirmación que el NLI falso marca `neutral` · **O-A** cita `ch-a4-1` (`entailment`).
  - Configuración: `ANALYSIS_MAX_OPTIONS = 1`, `RELEVANCE_THRESHOLD = 0.30`.
- **FX-08b-c · Población del estudio en lista por fragmento** (ADR-47; extiende FX-08b-a; perfil de test `RAG_ADAPTERS=fake`). La comparten US-241, US-243, US-244 y US-126:
  - Catálogo `test-apl-1.2.0` (mama, en ambos backends): los criterios de `test-apl-1.0.0` más `receptores_hormonales` (destino `Biomarker` RE/RP, no excluyente), 6 en total; por criterio, la tabla de sinónimos es/en (`postmenopausal women` ≡ `posmenopáusica`; `premenopausal women` ≡ `premenopáusica`; `HER2-positive (IHC 3+)` ≡ `positivo`; `HER2-negative (IHC 2+, ISH not amplified)` ≡ `negativo`) y `restrictionMarkers` es/en (`solo`, `exclusivamente`, `only`, `exclusively`).
  - Paciente **A-M2** (mama, sintético): HER2 "3+ (IHQ)" `verificado`; RE y RP positivos `verificado`; `TNM_8` "IIA" `verificado`; ECOG 1 `verificado`; estado menopáusico "posmenopáusica" `verificado`; sin tratamientos previos. Paciente **A-M3**: igual que A-M2 salvo estado menopáusico "premenopáusica" `verificado`.
  - Corpus (`is_current = true`; `metadata_source = extraido_verificado` en la forma de lista de US-241, cada valor `{value, chunkId, scope}`):
    - `doc-b1` (ECA): `ch-b1-1` (Elegibilidad) → `estado_menopausico` = [`premenopausal women` · elegibilidad, `postmenopausal women` · elegibilidad].
    - `doc-b2` (ECA): `ch-b2-1` (Elegibilidad) → `estado_menopausico` = [`postmenopausal women only` · elegibilidad].
    - `doc-b3` (ECA): `ch-b3-1` (Elegibilidad) → `estado_menopausico` = [`postmenopausal women` · elegibilidad] (sin marcador de restricción).
    - `doc-b4` (ECA): `ch-b4-1` (Elegibilidad) → `estado_her2` = [`HER2-positive (IHC 3+)` · elegibilidad]; `ch-b4-2` (Elegibilidad) → `estado_her2` = [`HER2-negative (IHC 2+, ISH not amplified)` · elegibilidad].
    - `doc-b5` (guía, `study_design = guia`): `ch-b5-1` (Recomendaciones) → `estado_menopausico` = [`premenopausal women` · elegibilidad, `postmenopausal women` · elegibilidad].
    - `doc-b6` (ECA): `ch-b6-1` (Resultados) → `receptores_hormonales` = [`triple-negative (TNBC)` · subgrupo].
    - `doc-b7` (ECA con dos cohortes): `ch-b7-1` (Elegibilidad, cohorte A) → `estado_menopausico` = [`postmenopausal women only` · elegibilidad]; `ch-b7-2` (Elegibilidad, cohorte B) → `estado_menopausico` = [`premenopausal women only` · elegibilidad].
    - `doc-b10` (ECA): `ch-b10-1` (Elegibilidad) → `estado_menopausico` = [`premenopausal women` · elegibilidad, `perimenopausal women` · elegibilidad]; `ch-b10-2` (Elegibilidad) → `estado_menopausico` = [`postmenopausal women` · elegibilidad, `women aged 60 or older` · elegibilidad] (4 valores en total entre los dos fragmentos).
    - `doc-b9` (ECA): `estado_menopausico` en `pendiente` (la extracción no corrió); el resto de criterios, lista vacía. `ch-b9-1` (Elegibilidad): "Eligible patients were postmenopausal women with early breast cancer".
    - `doc-a1` de FX-08b-a se conserva en la **forma antigua** (un valor por criterio) para probar el lector doble de US-241.
  - LLM falso de opciones `LLM-POB`: O-P1 cita `ch-b1-1` · O-P2 cita `ch-b2-1` · O-P3 cita `ch-b3-1` · O-P4 cita `ch-b4-1` y `ch-b4-2` · O-P5 cita `ch-b5-1` · O-P6 cita `ch-b6-1` · O-P7 cita `ch-b7-1` · O-P8 cita `ch-b7-2` · O-P9 cita `ch-b9-1` · O-P10 cita `ch-b10-1` y `ch-b10-2`. NLI falso: `entailment` para todas las afirmaciones.
  - Adapters falsos del respaldo (US-244): `RESP-OK` (para `doc-b9` devuelve `estado_menopausico` = [`postmenopausal women` · elegibilidad] citando `ch-b9-1`, `finish_reason = stop`) · `RESP-BUCLE` (repite esa propuesta hasta agotar `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`, `finish_reason = length`) · `RESP-TRUNCADO` (JSON cortado a mitad) · `RESP-LENTO` (responde después de `POPULATION_FALLBACK_DEADLINE_MS`) · `RESP-CAIDO` (error de conexión).
  - Estados esperados (US-243):

    | Paciente × opción | Criterio | `status` | Motivo |
    |---|---|---|---|
    | A-M2 × O-P1 | `estado_menopausico` | `parcial` | `partialReason = inclusiva` |
    | A-M2 × O-P2 | `estado_menopausico` | `coincide` | — |
    | A-M3 × O-P2 | `estado_menopausico` | `no_coincide` | restricción explícita («only») |
    | A-M3 × O-P3 | `estado_menopausico` | `desconocido` | `no_reportado_por_fuente` (lista incompleta, sin restricción) |
    | A-M2 × O-P4 | `estado_her2` | `desconocido` | `valores_en_conflicto` |
    | A-M2 × O-P5 | `estado_menopausico` | `parcial` | `partialReason = mezclada` |
    | A-M2 × O-P6 | `receptores_hormonales` | `desconocido` | `no_reportado_por_fuente` (el valor de subgrupo se muestra como contexto) |
    | A-M2 × O-P7 / O-P8 | `estado_menopausico` | `coincide` / `no_coincide` | unidad = fragmento citado |
    | A-M2 × O-P9 con `RESP-OK` | `estado_menopausico` | `coincide` | valor del respaldo |

- **Resultado esperado de A-M1 con `doc-a1`:** `estado_her2` coincide · `estadio` desconocido (sin escala comparable en el catálogo 1.1.0) · `ecog` coincide con aviso `sin_verificar` · `estado_menopausico` desconocido (`falta_en_paciente`) · `linea_tratamiento` desconocido (`no_reportado_por_fuente`) → resumen `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`, `populationNotComparable = false`.

---

## US-021 · DEC-11 — Criterios de aplicabilidad, excluyentes y definición de "Parcial"

> Linear: [L1D-125](https://linear.app/l1der-lab-mjbc/issue/L1D-125)

`FEAT-08b` · Sprint 4 *(escenario aceptado en el S3; F-20…F-24 aceptadas y firma en la sesión de oncólogos del S4, `[S4 resp. 8]`)* · Estimación **1** · — (decisión) · TBD-13 (aplicabilidad), R-24 · RN-28, RN-29 · Dueño: oncólogo asesor · ⛔ DEC-05 (cerrada en el Pre-S1) · 🔗 Bloquea: US-121 (contenido real), US-122 (reglas), US-243 (semántica de la lista), US-126 (UI de varios valores), US-134, US-247, US-233b, US-132, DEC-19 (US-031) · Registro: `docs/decisions/DEC-11-aplicabilidad-lista-de-poblacion.md`

> **Decidido (usuario, 2026-10-29):** se aceptan las respuestas clínicas F-20…F-24 de la Demo 3 como escenario más probable de la semántica de la lista de población; la **firma formal** es en la sesión de oncólogos del S4 y, si cambia algo, el cambio va al catálogo JSON o a la configuración, no al código. Semántica: población inclusiva (varios grupos, el paciente es de uno) → Parcial (inclusiva); fragmento que mezcla poblaciones sin desagregar → Parcial (mezclada); Coincide solo si la población es específica del perfil; No coincide solo con restricción explícita; valor ausente sin restricción → Desconocido; unidad = fragmentos citados por la opción; hasta 3 valores con «ver más» `[S4 resp. 8]`. Valores en conflicto → Desconocido con `unknownReason = valores_en_conflicto`, ambos valores visibles con sus citas y el aviso «requiere validación clínica/patológica»; se respetan los 4 estados de RN-28 `[S4 resp. 9]`.

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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
- **AC-3** · Dado `docs/decisions/DEC-11-aplicabilidad-lista-de-poblacion.md`, cuando se
  registre, entonces declara el estado «escenario aceptado (firma pendiente)» hasta la
  sesión de oncólogos del S4 y que la validación también se mide con el feedback agregado
  de VM-4 (≥ 70 % con calificación ≥ 4, con muestra mínima) y con VM-3.
  `[P-03]` `[§15 resp. 5]` `[S4 resp. 8]`
  > **Decidido (usuario, 2026-10-29):** la ruta del registro es `DEC-11-aplicabilidad-lista-de-poblacion.md` (la escribió la sesión principal en el refinamiento del S4) y la sesión de oncólogos del S4 añade la firma formal que P-03 había retirado `[S4 resp. 8]`.
- **AC-4** · Dado un criterio que el oncólogo rechace, cuando se publique la versión,
  entonces ese criterio no está en ella. (asumido)
- **AC-5 (semántica de la lista)** · Dado el registro de DEC-11, cuando se lee, entonces
  contiene la tabla de la semántica de la lista con las ocho situaciones (específica →
  Coincide; inclusiva → Parcial; mezclada → Parcial; restricción explícita incumplida →
  No coincide; ausente sin restricción → Desconocido `no_reportado_por_fuente`; conflicto →
  Desconocido `valores_en_conflicto` con ambos valores visibles; subgrupo o mención → no
  cuentan; presentación: hasta 3 valores con «ver más»), la unidad de evaluación
  (fragmentos citados por la opción), el dueño y la fecha. `[S4 resp. 8]` `[S4 resp. 9]`
- **AC-6 (firma en la sesión del S4)** · Dada la sesión de oncólogos del S4, cuando el
  oncólogo asesor firme, entonces la versión del catálogo de aplicabilidad lleva el bloque
  `validation` con `scope = "aplicabilidad"`, el rol del firmante y la fecha, y el registro
  de DEC-11 pasa a «firmada»; sin firma, US-021 no pasa a Done, pero las historias que
  dependen de ella cierran sobre el escenario aceptado. `[S4 resp. 8]` (asumido el valor de
  `status` del bloque)

> **Decidido (usuario, 2026-10-23, `[S3 resp. 1]`):** no se espera a los oncólogos. Se implementa sobre la versión `propuesta_revisada` del escenario más probable (criterios de FR-25; HER2 en mama y estado de castración en próstata como excluyentes; "Parcial" según los ejemplos de FR-25), publicada en el catálogo versionado. Se valida en la sesión con oncólogos del S4 (junto a DEC-06, DEC-08, DEC-09 y ARR-05); un cambio que salga de ella solo toca el catálogo JSON. DEC-11 queda en DoR con el escenario aceptado y su cierre formal es en el S4.

## Contexto técnico
Ubicada en FEAT-08b, adelantada al S3 con la aplicabilidad (slicing adoptado). La
mecánica (validador del bloque `validation`, destino de cada criterio) es de US-121 y de
FEAT-04 US-001; esta historia solo registra la decisión. La parte técnica de la lista
(extracción, forma, contrato y reglas puras) está en ADR-47 y la implementan US-241,
US-242, US-243 y US-244.

## INVEST
**Small** ✓ una revisión de una lista corta de criterios.
**Testable** ✓ el catálogo y el documento contienen el bloque, la fecha y el revisor.

---

## US-121 — Los criterios de aplicabilidad de mama y próstata viven en el catálogo con destino, excluyentes y regla de "Parcial"

> Linear: [L1D-126](https://linear.app/l1der-lab-mjbc/issue/L1D-126)
> **Decidido (usuario, 2026-10-24, cierre de la O1 del S3):** `destination.match` del catálogo de datos críticos se amplía a arrays (compatible hacia atrás; deuda anotada en L1D-93 con destino esta historia). La allowlist de destinos de L1D-93 **excluye** `Biomarker.original_name`, `reference_range` y `Exam.source_lab` (privacidad); si un criterio los necesita, se reabre con el usuario.

`FEAT-08b` · Sprint 3 · Estimación **3** · HU-22 · FR-25 (criterios en el catálogo), RN-29, RN-28 · AC-08.1 (criterios del catálogo), AC-04.5 (aplicabilidad) · ⛔ DEC-11 · escenario más probable · ↪ US-041, FEAT-04 US-001 (validador del catálogo; US-042 es `si-hay-capacidad`) · 🔗 Regresión [RN-29] → US-001 · 🔗 Regresión [NFR-14] → US-041

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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

`FEAT-08b` · Sprint 3 · Estimación **5** · HU-22 · FR-25 (estado determinista), ADR-34 (b), RN-25 · AC-08.1, AC-08.9, AC-T4.4 · ⛔ DEC-11 · escenario más probable · ↪ US-121, US-118, US-055 · 🔗 Regresión [RN-25] → US-127 · 🔗 Medido en: US-132 (M-08.2, M-08.6)

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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
`population_criteria` (RN-25). `maxOptions` (`ANALYSIS_MAX_OPTIONS`) vale 1 hasta el S4;
desde el S3 esa opción única la elige el comparador de aplicabilidad de US-125 (AC-5),
no la relevancia, que solo desempata. Tests: Pytest con FX-08b-a.

## INVEST
**Small** ✓ una regla pura por criterio sobre datos ya presentes.
**Testable** ✓ seis tests deterministas.

---

## US-123 — Si la población del estudio solo está en el texto, el valor se acepta solo con cita y soporte; si no, queda "Desconocido"

> Linear: [L1D-128](https://linear.app/l1der-lab-mjbc/issue/L1D-128)

`FEAT-08b` · Sprint 3 · Estimación **5** · HU-22 · FR-25 (valor textual), RN-01, ADR-34 · AC-08.3, AC-T1.2 (aplicabilidad) · ⛔ ADR-39 (NLI) · ↪ US-122, US-063, US-064 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-04] → US-063

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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

`FEAT-08b` · Sprint 3 · Estimación **5** · HU-22 · FR-25 (causa, avisos, no comparable, conteo), FR-11 (avisos por criterio), RN-28 (conteo), RN-26 · AC-08.2, AC-08.4, AC-08.5, AC-08.6, AC-04.3 (aplicabilidad) · ↪ US-122, US-123, FEAT-04 US-006, US-099 · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [RN-26] → US-071

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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
- **AC-3 (borde · en conflicto)** · Dado un A-M1 cuyo seed sintético siembra dos HER2 en
  conflicto (`requiere_revision`, `conflicts_with_id` cruzados y `provenance.conflict = true`),
  cuando se evalúa, entonces `estado_her2` trae `patientDataWarning = en_conflicto`.
  `[AC-08.4]` `[AC-03.2]`
  > **Decidido (usuario, 2026-10-23, `[S3 resp. 8]`):** el AC-3 se reescribe sobre un conflicto HER2 sembrado en el seed, porque la detección real (US-099) pasó al S5 con el reordenamiento. El AC original, con el conflicto detectado por US-099, se traslada a US-099 AC-7 (FEAT-03a, S5).
- **AC-4 (borde · población no comparable)** · Dados A-M1, `doc-a2` y `APL-OK`, cuando se
  evalúa, entonces `applicability[doc-a2].populationNotComparable = true`. `[AC-08.6]` `[HU-22]`
- **AC-5 (invariante · conteo, nunca puntaje)** · Dados A-M1 y `doc-a1`, cuando se
  evalúa, entonces `summary = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`
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

`FEAT-08b` · Sprint 3 · Estimación **5** · HU-22 · FR-25 (aplicabilidad de una opción), FR-09 (S3: 1 opción), RN-28 (dueña de la agregación, del comparador y de la selección antes del recorte), RN-03, RN-22 · AC-08.8, AC-10.1 (opción única del S3) · ↪ US-124, US-055, US-064 · 🔗 Regresión [RN-01] → US-064 · 🔗 Produce para: US-134 (orden de hasta 3 opciones con el mismo comparador, S4), US-101 (`poblacion_no_comparable` en la tarjeta)

> **Reordenamiento (usuario, 2026-10-23):** S5 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

## Story
Como oncólogo, quiero que una opción respaldada por varias fuentes muestre la
aplicabilidad de la fuente más parecida a mi paciente y también la de cada una de las
demás, y que cuando solo se muestra una opción sea la más comparable con mi paciente y
no la de mayor puntaje de búsqueda, para no descartar ni preferir una opción por la
relevancia de la búsqueda.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una opción que cita `doc-a1` (0 excluyentes en No
  coincide, 2 coincide) y `doc-a2` (1 excluyente en No coincide), cuando se agrega,
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
  (configurable, `ANALYSIS_MAX_OPTIONS`) y `LLM-DOS-APL` de FX-08b-b con dos opciones
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
`clinical-api` desde `ANALYSIS_MAX_OPTIONS` (1 en el S3) `[RN-22]`; con aplicabilidad
presente la relevancia nunca es criterio principal (S1–S2: US-225 AC-3, ex US-055 AC-8). Tests: Pytest
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

`FEAT-08b` · Sprint 4 · Estimación **5** · HU-22 · FR-25 (UI), NFR-12 (estados por texto), RN-28 (texto del criterio desde el S3) · AC-08.1, AC-08.2, AC-08.4, AC-08.5, AC-08.6, AC-08.8 (UI), AC-10.2 (aplicabilidad en la tarjeta), AC-10.1 (texto del criterio, S3) · ↪ US-124, US-125, US-061 · 🔗 Consume: US-241 (`studyPopulationValues[]`, `partialReason`, motivos nuevos de `unknownReason`), US-243 (estados con listas), FEAT-04 US-003 (contador y enlace a la ficha en el S4) · ⛔ DEC-11 (US-021) · escenario aceptado `[S4 resp. 8]` · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-26] → US-071

> **Reordenamiento (usuario, 2026-10-23):** S5 → S4. Ver `README.md`, «Reordenamiento del 2026-10-23».

> **Decidido (usuario, 2026-10-29):** entra comprometida en el S4 y absorbe la UI de varios valores por criterio, con su alcance y «ver más» (F-24), sin cambiar su estimación `[S4 resp. 6]`.
> **Decidido (usuario, 2026-10-29):** se queda con **5 pts y 10 AC como excepción justificada a la DoR**: es una sola pantalla y un solo componente (`ApplicabilityTable`), y partirla duplicaría *fixtures* y `visual-check` `[S4 resp. 13]`. «Ver más» revela el resto de valores de elegibilidad de ese criterio (más allá de 3), con sus fragmentos, sin cargar nada nuevo del backend (`docs/ux/S4/pantallas-s4.md`, variante A) `[S4 resp. 13]`.
> **Decidido (usuario, 2026-10-29):** el enlace del Desconocido «falta en los datos registrados» lleva a la **sección ya existente de la ficha** donde vive el dato (diagnóstico o biomarcadores), con un ancla en su encabezado que recibe el foco; no se crea una sección nueva. Las anclas las añade US-005 `[S4 resp. 14]`. Los textos visibles siguen `docs/ux/S4/pantallas-s4.md` (variante A, elegida por el usuario).

## Story
Como oncólogo, quiero ver criterio a criterio cuánto se parece la población de cada
estudio a mi paciente, con las causas y los avisos en texto, para juzgar si la evidencia
aplica antes de considerarla.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el análisis de A-M1 con `doc-a1`, cuando el oncólogo abre
  el detalle de la fuente, entonces ve una tabla con criterio, valor del paciente, valor
  del estudio y estado en texto ("Coincide", "Parcial", "No coincide", "Desconocido"), y
  el resumen "2 coinciden · 3 desconocidos". `[AC-08.1]` `[AC-08.5]` `[NFR-12]`
- **AC-2 (borde · desconocido con causa)** · Dado `estado_menopausico`, cuando se
  muestra, entonces se lee «? Desconocido · falta en los datos registrados» con un enlace a
  la ficha del paciente (ancla de la sección existente donde vive el dato, US-005);
  `linea_tratamiento` muestra «? Desconocido · la fuente no reporta este dato»; y con
  `respaldo_fallido` se lee «? Desconocido · no se pudo determinar el valor del estudio; no
  indica que el criterio coincida ni que no coincida» (con `varios_valores_en_la_fuente` se
  muestran los valores, no un mensaje de fallo). `[AC-08.2]` `[HU-22]` `[S4 resp. 14]`
  `[S4 resp. 5]` `[docs/ux/S4 S4-01]` (asumido: `estado_menopausico` tiene destino
  `ClinicalAttribute`, sin sección propia en la ficha, y enlaza al encabezado de la ficha)
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
- **AC-8 (borde · varios valores y «ver más»)** · Dado A-M2 con la opción O-P10 de
  FX-08b-c (4 valores de elegibilidad en `ch-b10-1` y `ch-b10-2`), cuando el oncólogo
  despliega «Ver aplicabilidad por criterio», entonces la celda «Estudio (valores extraídos
  de la fuente por IA y verificados contra el fragmento)» de `estado_menopausico` muestra 3
  valores, cada uno con su «Fragmento [n]», y «+ 1 valor más ▸ ver más»; al pulsarlo aparece
  el cuarto con su fragmento, el botón pasa a «ver menos», el foco se queda en él y MSW
  registra **cero** peticiones nuevas. Solo se citan fragmentos recuperados en esta consulta
  y citados por la opción. `[S4 resp. 13]` `[S4 resp. 8]` `[F-24]` `[docs/ux/S4 S4-01]`
- **AC-9 (borde · valores en conflicto)** · Dado A-M2 con la opción O-P4, cuando se
  muestra `estado_her2`, entonces se lee «? Desconocido · los fragmentos citados muestran
  valores distintos; se muestran ambos. Conviene contrastarlos con la fuente y con la
  validación clínica/patológica», con los dos valores y sus fragmentos (`ch-b4-1` y
  `ch-b4-2`), sin que la UI elija uno. `[S4 resp. 9]` `[F-23]` `[RN-28]`
- **AC-10 (borde · por qué es Parcial)** · Dadas las opciones O-P1 y O-P5 de A-M2, cuando
  se muestra `estado_menopausico`, entonces se lee «◐ Parcial · el estudio incluyó varios
  grupos, entre ellos el del paciente» en `doc-b1` y «◐ Parcial · el fragmento mezcla
  poblaciones sin desagregarlas» en `doc-b5` (desde `partialReason`), y el valor de subgrupo
  de O-P6 aparece bajo «Contexto (no cuenta para el estado)» sin contar en el resumen.
  `[S4 resp. 11]` `[S4 resp. 8]` `[NFR-12]` `[docs/ux/S4 S4-01]`

## Contexto técnico
Organismos `ApplicabilityTable` y `ApplicabilityCount` (este último reservado desde el
S1, OL-04) en el panel de análisis; los textos de estado y causa son literales de UI en
español. El texto del criterio de orden sale del catálogo i18n de `web`
(`evidence.orderCriterion.applicability`; el neutro `evidence.orderCriterion.relevance` es
de US-061) y se elige por la respuesta: con `applicability` no vacía, el de aplicabilidad.
El orden visible de varias opciones llega en el S4 (US-134). Desde el S4 la celda del valor
del estudio lee `studyPopulationValues[]` (si viene) y cae a `studyPopulationValue`
(deprecado un sprint, US-241) para los análisis antiguos; los textos de `partialReason` y de
los motivos nuevos de `unknownReason` son literales de `apps/web/messages/es.json`, recorridos
por US-068 (RN-23). Tests: Playwright contra Compose en perfil de test con `rag-orchestrator`
en modo falso (FX-08b-a para AC-1…AC-7, FX-08b-c para AC-8…AC-10) y el mismo catálogo de test
montado en ambos backends; Testing Library + MSW con los ejemplos de `contracts/examples/` de
US-241 para la caída a la forma antigua y el recuento de peticiones del AC-8; `visual-check` a
320, 375 y 1280 px contra `docs/ux/S4/pantallas-s4.md` (variante A: tarjetas apiladas, tabla
plegada por opción y lista por criterio en contenedores < 560 px).

## INVEST
**Small** ✓ **Excepción a la DoR (10 AC > 8), aceptada:** una sola pantalla y un solo
componente (`ApplicabilityTable`); partirla duplicaría *fixtures* y `visual-check`. Los AC-8…AC-10
son presentación sobre campos ya poblados por US-241 y US-243 `[S4 resp. 13]`.
**Testable** ✓ diez tests E2E y de componente.

---

## US-241 — El contrato y el catálogo del corpus guardan la población del estudio como lista acotada por criterio, con su fragmento y su alcance

> Linear: [L1D-291](https://linear.app/l1der-lab-mjbc/issue/L1D-291)

`FEAT-08b` · Sprint 4 · Estimación **3** · — (técnica, PRD §17) · FR-25 (valor del estudio), RN-25, RN-22, RN-06 · AC-08.9, AC-T4.4 · ⛔ ADR-47 (aceptado) · ⛔ DEC-11 (US-021) · escenario aceptado `[S4 resp. 8]` · ↪ US-118, US-122 · 🔗 Consumida por: US-242 (escribe la forma nueva), US-243 (la lee), US-244, US-126, US-245 (comparte el PR de contrato si coinciden) · 🔗 Regresión [RN-06] → US-053 · 🔗 Regresión [AC-T4.4] → US-040

> **Decidido (usuario, 2026-10-29):** cambio **aditivo** del contrato (ADR-26), sin versión mayor: se añade `studyPopulationValues[]` (`{value, chunkId, scope: elegibilidad | subgrupo | mencion}`) y los valores `varios_valores_en_la_fuente`, `valores_en_conflicto` y `respaldo_fallido` de `unknownReason`; `studyPopulationValue` queda **deprecado un sprint** y se retira en el S5 `[S4 resp. 5]`. La extracción en abanico y la lista por fragmento son la opción A del ADR-47 `[S4 resp. 3]`.
> **Decidido (sesión principal, 2026-10-29, a confirmar por el usuario en la revisión del PR):** `ApplicabilityCriterion` añade también `partialReason` (`inclusiva | mezclada | rango_solapado | solo_subgrupo | null`) para que la UI explique por qué un criterio es Parcial. Como `ApplicabilityCriterion` tiene `additionalProperties: false` y todos sus campos actuales son obligatorios, los campos nuevos entran **opcionales** (fuera de `required`) y nulables, y se verifica que los consumidores generados los acepten `[S4 resp. 11]`.

## Story
Como responsable técnico, quiero que el contrato y el catálogo del corpus guarden, por cada
criterio, hasta tres valores de la población del estudio con el fragmento del que salen y su
alcance, para que la aplicabilidad se calcule sobre lo que el estudio dice en el fragmento que
cita la opción y no sobre un único valor elegido al azar.

## AC (Given/When/Then)
- **AC-1 (happy path · contrato aditivo)** · Dado `contracts/schemas/evidence.yaml` editado
  primero y propagado con `sync-contracts`, cuando se ejecutan `contracts:check` y `oasdiff`,
  entonces `ApplicabilityCriterion` declara `studyPopulationValues` (opcional; array sin
  `maxItems` en la respuesta, porque reúne los valores de todos los fragmentos citados por la
  opción; cada elemento con `value` ≤ 200 caracteres, `chunkId` y `scope` ∈
  `elegibilidad | subgrupo | mencion`) y `partialReason` (opcional y nulable), `unknownReason`
  incluye `varios_valores_en_la_fuente`, `valores_en_conflicto` y `respaldo_fallido`,
  `studyPopulationValue` lleva `deprecated: true`, y `oasdiff` no informa ningún cambio
  incompatible. `[S4 resp. 5]` `[S4 resp. 11]` `[ADR-26]` `[ADR-47]`
- **AC-2 (borde · consumidores generados)** · Dados el ejemplo nuevo
  `contracts/examples/con-evidencia-s4-poblacion-lista.json` (con los campos nuevos) y el
  ejemplo existente `con-evidencia-s3-aplicabilidad.json` (sin ellos), cuando
  `clinical-api` recibe cada uno desde el mock de `rag-orchestrator` construido con
  `contracts/examples/` (MSW/`respx`, US-213), entonces ambos validan con el cliente generado
  de `packages/api-contracts` y la respuesta y el `AIAnalysisRecord` conservan
  `studyPopulationValues` y `partialReason` tal como llegaron. `[ADR-26]` `[RN-06]` `[S4 resp. 11]`
- **AC-3 (happy path · migración)** · Dado un schema `corpus` con `doc-a1` en la forma
  antigua de `population_criteria`, cuando se aplica la migración Alembic 0005, entonces
  existe la forma nueva por criterio (lista de valores con `chunkId`, `scope`,
  `promptVersion`, `modelVersion`, `catalogVersion` y `nliResult`), las filas existentes no se
  borran ni pierden su valor, y `alembic downgrade -1` deja el schema como estaba.
  `[ADR-47]` `[RN-05]`
- **AC-4 (borde · lector de las dos formas)** · Dados `doc-a1` (forma antigua) y `doc-b1`
  (forma nueva) de FX-08b-c, cuando el repositorio del catálogo del corpus los lee, entonces
  ambos llegan al dominio como lista de valores, y con `test-apl-1.0.0` A-M1 × `doc-a1` sigue dando
  `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }`. `[ADR-47]` `[AC-08.9]`
- **AC-5 (borde · forma inválida en la base)** · Dada una fila de la forma nueva con 4
  valores de un mismo fragmento en un criterio o con un `scope` fuera del enum, cuando se lee en un análisis,
  entonces ese criterio queda `desconocido` con `unknownReason = no_reportado_por_fuente`, el
  análisis responde `200` y el log registra `poblacion_forma_invalida` con el criterio y el
  `traceId`, sin el valor ni el texto del fragmento. `[RN-26]` `[RN-14]` (asumido: degradar
  en vez de fallar)
- **AC-6 (invariante · frontera de `rag_corpus`)** · Dada la migración 0005, cuando corre la
  CI, entonces se aplica con el rol migrador del schema `corpus` y los tests de *permission
  denied* de `rag_corpus` sobre `auth`, `identity`, `clinical`, `audit` y `research` siguen
  en verde. `[AC-T4.4]` `[SEG-06]`

## Contexto técnico
Contract-first: primero `contracts/schemas/evidence.yaml`, después `sync-contracts`, los
`openapi.yaml` de ambos backends, el cliente de `packages/api-contracts`, los ejemplos de
`contracts/examples/` y los *handlers* MSW/`respx` que se construyen desde ellos (US-213), en
el mismo PR; `oasdiff` sin ERR. `docs/architecture/data-model.md` (fuente única desde US-033)
documenta la forma nueva de `corpus.corpus_document.population_criteria` en el mismo PR. La
migración es la Alembic 0005 de `rag-orchestrator` (catálogo del corpus); el lector acepta la
forma antigua (string o `{valor, alcance}`) y la nueva durante un sprint; la retirada de
`studyPopulationValue` y del lector antiguo es del S5. `clinical-api` conserva los análisis
históricos con la forma antigua en el JSON persistido. Configuración:
`POPULATION_MAX_VALUES_PER_CRITERION = 3` `[RN-22]`: el tope rige por fragmento y criterio en la
extracción y la persistencia; la respuesta une los valores de los fragmentos citados y la UI
muestra 3 más «ver más» (US-126 AC-8, `[S4 resp. 13]`). Tests: `contracts:check` en la CI (AC-1),
Supertest con MSW desde los ejemplos (AC-2), Pytest con PostgreSQL `corpus` real (AC-3, AC-4,
AC-6) y Pytest + TestClient (AC-5). TDD: test después para la migración; TDD estricto para el
lector (AC-4, AC-5).

## Non-goals
La extracción que llena la lista (US-242), las reglas de estado (US-243), el respaldo en la
consulta (US-244) y la UI (US-126). Retirar `studyPopulationValue` (S5).

## INVEST
**Small** ✓ un cambio aditivo de contrato, una migración y un lector.
**Testable** ✓ seis tests: contrato, consumidores, migración, lector y frontera del rol.

---

## US-243 — El estado de cada criterio se calcula con reglas puras sobre la lista de valores de los fragmentos que cita la opción

> Linear: [L1D-293](https://linear.app/l1der-lab-mjbc/issue/L1D-293)

`FEAT-08b` · Sprint 4 · Estimación **5** · HU-22 · FR-25 (estado determinista con listas), RN-28 (cuatro estados visibles, sin puntaje), RN-27, RN-22 · AC-08.1, AC-08.2, AC-08.9 · ⛔ ADR-47 (aceptado) · ⛔ DEC-11 (US-021) · escenario aceptado `[S4 resp. 8]` · ↪ US-241, US-122, US-125 · 🔗 Consumida por: US-126, US-134, US-247 · 🔗 Medido en: US-233b (concordancia de estados) · 🔗 Regresión [RN-28] → US-134 · 🔗 Regresión [RN-02] → US-055

> **Decidido (usuario, 2026-10-29):** reglas puras sobre los valores que provienen de **los fragmentos citados por la opción**: población inclusiva → Parcial (inclusiva); fragmento que mezcla poblaciones sin desagregar → Parcial (mezclada); Coincide solo si la población es específica del perfil; No coincide solo con restricción explícita; valor ausente sin restricción → Desconocido; los valores con `scope` subgrupo o mención no cuentan para el estado y se muestran como contexto; estados internos (exacto, inclusivo, mezclado, en conflicto) proyectados a los 4 visibles; rangos con las tablas del catálogo `[S4 resp. 8]`. Valores en conflicto → Desconocido con `valores_en_conflicto` y ambos valores visibles `[S4 resp. 9]`. `partialReason` lo emite esta historia `[S4 resp. 11]`. **TDD estricto, doble bucle.**

## Story
Como oncólogo, quiero que el estado de cada criterio refleje lo que el estudio dice en el
fragmento que respalda la opción, distinguiendo una población específica de mi paciente, una
inclusiva y una mezclada, para no tomar por coincidencia exacta lo que solo me incluye en
parte ni por exclusión lo que la fuente no dice.

## AC (Given/When/Then)
- **AC-1 (happy path · inclusiva)** · Dados A-M2 y la opción O-P1 de FX-08b-c, cuando se
  calcula la aplicabilidad de la opción, entonces `estado_menopausico` trae
  `status = parcial`, `partialReason = inclusiva` y `studyPopulationValues` con los dos
  valores de `ch-b1-1`. `[S4 resp. 8]` `[F-20]` `[FR-25]`
- **AC-2 (borde · población específica)** · Dados A-M2 y O-P2, cuando se calcula, entonces
  `estado_menopausico` trae `status = coincide` y `partialReason = null`. `[S4 resp. 8]`
  `[DEC-11]`
- **AC-3 (borde · restricción explícita)** · Dados A-M3 y O-P2 (`postmenopausal women
  only`), cuando se calcula, entonces `estado_menopausico` trae `status = no_coincide`.
  `[S4 resp. 8]` `[F-21]` (asumido: la restricción se reconoce por `restrictionMarkers` del
  catálogo)
- **AC-4 (borde · lista incompleta no excluye)** · Dados A-M3 y O-P3 (`postmenopausal
  women`, sin marcador de restricción), cuando se calcula, entonces `estado_menopausico`
  trae `status = desconocido` y `unknownReason = no_reportado_por_fuente`, nunca
  `no_coincide`. `[S4 resp. 8]` `[F-21]` `[R2]`
- **AC-5 (borde · valores en conflicto)** · Dados A-M2 y O-P4, cuando se calcula, entonces
  `estado_her2` trae `status = desconocido`, `unknownReason = valores_en_conflicto`,
  `studyPopulationValues` con los dos valores y sus `chunkId` (`ch-b4-1`, `ch-b4-2`) y
  `populationNotComparable = false` para la fuente. `[S4 resp. 9]` `[F-23]` `[RN-28]`
  (asumido: conflicto = códigos excluyentes entre sí en fragmentos distintos del mismo
  documento)
  > Pendiente de definir en refinamiento (dueño: oncólogo · DEC-11 · afecta: AC-3, AC-5, campo `partialReason`): ¿qué señal determinista de la fuente distingue «restricción explícita» de un valor único, y «valores en conflicto sobre la misma cohorte» de «cohortes o brazos distintos» cuando la opción cita los dos fragmentos? Escenario implementado: marcadores de restricción del catálogo (es/en) y conflicto = códigos excluyentes en fragmentos distintos del mismo documento; el cambio de la sesión va al catálogo.
- **AC-6 (borde · subgrupo y mención no cuentan)** · Dados A-M2 y O-P6, cuando se calcula,
  entonces `receptores_hormonales` trae `status = desconocido`
  (`no_reportado_por_fuente`), `studyPopulationValues` conserva el valor con
  `scope = subgrupo` como contexto y el resumen de la fuente no lo cuenta como `coincide`
  ni como `parcial`. `[S4 resp. 3]` `[S4 resp. 8]` `[R1]`
- **AC-7 (invariante · unidad = fragmento citado)** · Dados A-M2 y las opciones O-P7
  (`ch-b7-1`) y O-P8 (`ch-b7-2`) del mismo `doc-b7`, cuando se calcula cada una, entonces
  O-P7 da `estado_menopausico = coincide` y O-P8 `no_coincide`: ningún valor de un fragmento
  que la opción no cita entra en su estado. `[S4 resp. 8]` `[F-22]` `[R18]`
- **AC-8 (invariante · tabla de casos y determinismo)** · Dada la tabla de casos de la
  función pura (exacto, inclusivo, mezclado —fragmento de `study_design` guía o revisión con
  varios valores—, rango solapado con las tablas del catálogo, `solo_subgrupo` de la forma
  antigua, en conflicto, ausente y restricción), cuando se evalúa dos veces, entonces cada
  caso proyecta al estado visible y al `partialReason` esperados, el resultado es idéntico, el
  LLM registra cero invocaciones y la salida no contiene ningún puntaje ni porcentaje.
  `[RN-28]` `[AC-08.9]` `[ADR-34]` `[S4 resp. 11]`
  > Pendiente de definir en refinamiento (dueño: oncólogo · DEC-11 · afecta: AC-8, `partialReason = solo_subgrupo`, US-122 AC-4): con la lista, los valores `scope = subgrupo` no cuentan para el estado (`[S4 resp. 8]`), pero US-122 AC-4 calcula `parcial` cuando la fuente estructurada reporta el criterio solo para un subgrupo. Escenario implementado: `solo_subgrupo` se conserva solo para la forma antigua (`fuente_estructurada` con alcance de subgrupo) hasta el S5; ¿se mantiene después o pasa a Desconocido?

## Contexto técnico
Reglas puras en `rag-orchestrator/app/domain/applicability_rules.py` (y sus tipos en
`aplicabilidad_tipos.py`): estados internos `exacto | inclusivo | mezclado | en_conflicto |
ausente | restringido` proyectados a los cuatro de RN-28 y a `partialReason`. La entrada es,
por opción, la unión de los valores cuyos `chunkId` cita la opción (o de su misma sección,
según ADR-47), más el valor del paciente copiado del contexto (ADR-34); los rangos y escalas
salen de las tablas del catálogo (`valor_fuera_de_tabla`, `sin_escala`,
`forma_no_comparable`), nunca de texto libre; la normalización usa los sinónimos del catálogo
y lo que no mapea queda `no_mapeado` (RN-27). El comparador de US-125 y el orden de US-134 no
cambian: siguen contando por estado. Sin LLM en este paso. Tests: TDD estricto, doble bucle;
test de aceptación de cada AC en Pytest + TestClient con FX-08b-c (`@pytest.mark.ac("US-243", n)`),
unitarios de la función pura uno a uno (AC-8 como tabla parametrizada).

## Non-goals
La extracción (US-242), la forma de datos y el contrato (US-241), el respaldo en la consulta
(US-244) y la UI (US-126). Cualquier ponderación de criterios (RN-28).

## INVEST
**Small** ✓ reglas puras sobre datos ya presentes, con un fixture cerrado.
**Testable** ✓ ocho tests de aceptación deterministas y la tabla de casos.
*(Estimable ⚠ el 5 asume que la sesión de oncólogos no cambia la semántica; si la cambia, el
ajuste va al catálogo y se re-estima solo si toca la proyección.)*

---

## US-244 — Si falta la población de una fuente, un respaldo corto en la consulta la completa con plazo propio y, si falla, el criterio queda Desconocido sin perder el análisis

> Linear: [L1D-294](https://linear.app/l1der-lab-mjbc/issue/L1D-294)

`FEAT-08b` · Sprint 4 · Estimación **3** · HU-22 · FR-25 (valor textual), RN-26, RN-01, RN-14, RN-22 · AC-08.3 · ⛔ ADR-47 (aceptado) · ⛔ ADR-39 (LLM real; los AC usan adapters falsos) · ↪ US-241, US-242 (misma tarea corta), US-243, US-123 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-26] → US-071 · 🔗 Regresión [RN-06] → US-053 · 🔗 Medido en: US-233b (`finish_reason=length` = 0)

> **Decidido (usuario, 2026-10-29):** etapa C del ADR-47 (OUT-06): si un documento está `pendiente`, se ejecuta en la consulta **la misma tarea corta** por fuente para los criterios que faltan, con *deadline* propio; si falla o vence, el criterio queda Desconocido con `respaldo_fallido`, el análisis **no** se descarta (RN-26) y nunca responde `503 LOCAL_LLM_UNAVAILABLE` por una salida inválida del proponente; se registran `finish_reason` y la longitud sin contenido (RN-14) y el proponente se salta cuando no hay criterios pendientes `[S4 resp. 3]`. Sustituye al proponente de una sola llamada de L1D-128.

## Story
Como oncólogo, quiero que, si a una fuente le falta la población del estudio, el sistema
intente completarla en el momento sin hacerme esperar de más y que, si no puede, me lo diga
en ese criterio, para no perder un análisis ya validado por un fallo de un paso secundario.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados A-M2, `LLM-POB` limitado a O-P9 y el adapter de respaldo
  `RESP-OK` de FX-08b-c, cuando se procesa el análisis, entonces el adapter de respaldo
  registra **una** llamada, con solo los fragmentos de `doc-b9` y solo el criterio
  `estado_menopausico`, el valor pasa el NLI contra `ch-b9-1` y el criterio queda
  `coincide`. `[ADR-47]` `[AC-08.3]` `[RN-01]`
- **AC-2 (borde · bucle de repetición)** · Dado `RESP-BUCLE`, cuando se procesa, entonces la
  respuesta es `200`, `estado_menopausico` queda `desconocido` con
  `unknownReason = respaldo_fallido` y `evidenceOptions` es igual a la del mismo análisis sin
  respaldo. `[S4 resp. 3]` `[RN-26]` `[OUT-06]`
- **AC-3 (borde · JSON truncado)** · Dado `RESP-TRUNCADO`, cuando se procesa, entonces la
  respuesta es `200`, el criterio queda `respaldo_fallido` y ningún código de error de la
  respuesta es `LOCAL_LLM_UNAVAILABLE`. `[S4 resp. 3]` `[OUT-06]`
- **AC-4 (borde · plazo vencido)** · Dados `RESP-LENTO` y
  `POPULATION_FALLBACK_DEADLINE_MS` en configuración, cuando se procesa, entonces el
  respaldo se cancela al vencer el plazo, el criterio queda `respaldo_fallido` y la respuesta
  es `200`. `[RN-22]` `[RN-26]`
- **AC-5 (borde · sin criterios pendientes)** · Dado un análisis cuyas fuentes citadas
  tienen todas `metadata_source = extraido_verificado` (O-P1…O-P8), cuando se procesa,
  entonces el adapter de respaldo registra **cero** llamadas. `[S4 resp. 3]` `[ADR-47]`
- **AC-6 (invariante · log sin contenido)** · Dado el análisis del AC-2, cuando se leen los
  logs de `rag-orchestrator`, entonces hay un evento `aplicabilidad_respaldo_fallido` con
  `finish_reason = length`, la longitud de la salida, el criterio y el `traceId`, y ningún
  valor, texto de fragmento, `chunkId` ni pregunta. `[RN-14]` `[S4 resp. 3]`
- **AC-7 (borde · LLM caído durante el respaldo)** · Dado `RESP-CAIDO` después de una
  generación de opciones correcta, cuando se procesa, entonces la respuesta es `200` con las
  opciones validadas y el criterio en `respaldo_fallido`. `[RN-26]` (asumido: el respaldo es
  un paso secundario y degrada también ante el LLM caído; si el LLM cae antes de generar,
  sigue el `503` de US-053)

## Contexto técnico
Reemplaza el proponente de una sola llamada (`infrastructure/llm/proponente_de_aplicabilidad.py`,
L1D-128) por la tarea corta de US-242 (una fuente por llamada, esquema cerrado con `maxItems`,
tope de tokens `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`) invocada desde el servicio de
aplicabilidad solo para los criterios en `pendiente` de las fuentes citadas, con
`POPULATION_FALLBACK_DEADLINE_MS` (RN-22, valor inicial según el informe de US-240). El
resultado del respaldo no se persiste en el catálogo del corpus (lo hará la próxima ingesta).
`_parsear` deja de convertir una salida inválida en `LlmLocalNoDisponibleError`. Tests:
Pytest + TestClient con los adapters falsos de FX-08b-c, incluido el que repite una propuesta
hasta el tope (AC-2) y el de JSON truncado (AC-3); TDD estricto (orquestación con adapters
falsos).

## Non-goals
Persistir en el corpus lo que obtenga el respaldo. Reintentos en la consulta (solo en la
ingesta, US-242). Subir la temperatura o las penalizaciones (descartado por medición, OUT-06).

## INVEST
**Small** ✓ reutiliza la tarea de US-242 dentro del servicio existente y cambia su manejo de
errores.
**Testable** ✓ siete tests con adapters falsos de salida controlada.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD FR-25 y §14: aplicabilidad en el S4; readme §5.0: HU-22 en el S4 | Slicing adoptado (`01-requisitos.md` §15, usuario 2026-10-06): aplicabilidad en el S3 | Slicing adoptado: FEAT-08b en el S3; el agente (AC-08.7) sigue en FEAT-08c (Post-MVP) y el orden de hasta 3 opciones en el S4 |
| P-03 | PRD §14 G-Piloto y RN-20: criterios de aplicabilidad firmados por el oncólogo | Decisión P-03: sin firma formal; catálogo `propuesta` revisado y validación por feedback agregado | P-03 (US-021 AC-1, AC-3); se registra para enmendar el PRD |
| — | backlog/01-requisitos.md §3: dueña de RN-28 = FEAT-10c (orden), regresión en FEAT-08b (agregación) | — | FEAT-08b es dueña de la agregación y del comparador (US-125); US-134 (S4) es dueña del orden visible de hasta 3 opciones |
| — | readme HU-22 escenario 4: "las opciones que se basan en ella quedan después" | PRD FR-09: 1 opción en los Sprints 1–3 | PRD: con una sola opción no hay orden visible en el S3; se verifica en el S4 (US-134) |
| Slicing v2 | PRD FR-25 y §14 S4; slicing "por hipótesis" (2026-10-06): S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): aplicabilidad en el S5 (G-Demo al cierre del S5), sobre la ingesta del corpus del S4 | Reemplazado por el reordenamiento del 2026-10-23 (fila siguiente) |
| S3-2026-10-23 | Slicing v2: aplicabilidad en el S5; DEC-11 cerrada por el oncólogo antes de implementar | Reordenamiento y refinamiento del S3 (2026-10-23): criterios, cálculo y herencia (DEC-11, US-121…US-125) en el S3; tabla y UI (US-126) en el S4 con las hasta 3 opciones (US-134); DEC-11 en DoR con escenario `propuesta_revisada` aceptado y cierre en la sesión de oncólogos del S4 `[S3 resp. 1]`; US-124 AC-3 sobre un conflicto sembrado `[S3 resp. 8]` | Decisión del usuario (refinamiento del S3) |
| S4-2026-10-29 | P-03 (US-021 AC-1, AC-3): sin firma formal de DEC-11; US-122 AC-4: `parcial` cuando la fuente estructurada reporta un criterio solo para un subgrupo; insumo del S4 §2.2/§2.5: «cumple alguno → Coincide» | Refinamiento del S4 (usuario, 2026-10-29): F-20…F-24 aceptadas y firma formal en la sesión de oncólogos del S4 `[S4 resp. 8]`; conflicto → Desconocido `valores_en_conflicto` `[S4 resp. 9]`; valores de subgrupo no cuentan para el estado `[S4 resp. 8]`; etapa 2 de la población (ADR-47, opción A) en el S4 con US-241, US-243, US-244 `[S4 resp. 3]`; contrato aditivo `[S4 resp. 5]` más `partialReason` (sesión principal, `[S4 resp. 11]`, a confirmar en la revisión del PR); US-126 absorbe la UI de varios valores `[S4 resp. 6]` | Decisión del usuario; `solo_subgrupo` se conserva solo para la forma antigua hasta el S5 (nota pendiente en US-243 AC-8) |
| S4-2026-10-29 · vista de caso | US-126 AC-2: el enlace de «falta en el paciente» lleva a la vista de caso | Refinamiento del S4: la vista de caso (US-088…US-093) pasa al S5 `[S4 resp. 1]` | Enlace a la sección de datos críticos de la ficha mientras tanto, como US-005 AC-3 `[S4 resp. 6]` |
| S4-2026-10-29 · «ver más» | ADR-47 y `[S4 resp. 3]`/`[S4 resp. 5]`: lista acotada ≤ 3 `{value, chunkId, scope}` por criterio (US-241 AC-1 tenía `maxItems: 3` en el contrato) | `[S4 resp. 13]` y `docs/ux/S4/pantallas-s4.md`: «ver más» revela los valores de elegibilidad más allá de 3, sin pedir nada al backend | El tope de 3 rige por fragmento y criterio (extracción y persistencia); la respuesta une los valores de los fragmentos citados y no lleva `maxItems` |
| S4-2026-10-29 · ancla | `docs/ux/S4/pantallas-s4.md` S4-03: enlace a `/pacientes/[id]#datos-criticos` | `[S4 resp. 14]`: sección ya existente de la ficha donde vive el dato (diagnóstico o biomarcadores), sin sección nueva | Usuario (más reciente) |
