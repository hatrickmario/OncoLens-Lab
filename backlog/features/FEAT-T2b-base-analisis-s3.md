# FEAT-T2b — Base del análisis: faltantes, supuestos y limitaciones (incisos del S3)

> Linear: [L1D-37](https://linear.app/l1der-lab-mjbc/issue/L1D-37)

**Talla:** M · **Sprint:** 4 (US-128) · `si-hay-capacidad` (US-129, US-130) · **Capacidad:** T-2 (AC-T2.1 incisos del S3, AC-T2.2) · CAP-04 (AC-04.3: faltantes en la Base) · **Recorrido principal:** sí (US-128; hipótesis 2: el análisis declara lo que no sabe) · no (US-129, US-130)
**Requisitos:** FR-27 incisos (b) datos críticos faltantes, (c) supuestos, (g) limitaciones (dueña de la parte S3, vía HU-20) · ADR-34 (c) · RN-01 (regresión → US-064) · RN-23 (regresión → US-068)
**Evidencia:** [→ PRD §5 FR-27, FR-10], [→ PRD §6 RN-01, RN-23], [→ PRD §18.4 T-2, AC-T2.1, AC-T2.2, AC-T2.4], [→ PRD §18.3.4 AC-04.3], [→ readme §4.1 `AnalysisBasis` (`missingCriticalData`, `continuedWithWarning`, `assumptions`, `limitations`)], [→ readme §4.2 `RagQueryInternalResponse` (`assumptions`, `limitations`)], [→ readme §3.3 #34], [→ readme §5.0 S3 KR4], [→ docs/AS-IS.md P12, JTBD 8]
**Dependencias:** ↪ US-066, US-067 (Base del S2), FEAT-04 US-006 (faltantes persistidos), US-064 (validador), US-124 (población no comparable) · ⛔ ADR-39 (NLI real; los AC usan el adapter falso) · ⛔ DEC-01 · escenario más probable (reglas de supuestos del catálogo, US-129) · 🔗 Regresión [RN-06] → US-053
**Valor:** el oncólogo necesita saber qué no sabía el análisis: qué datos críticos faltaban, qué se supuso por eso y qué limita lo que dice la evidencia (P12, JTBD 8). Con esta Feature la Base del análisis lo declara en todo análisis, también en "sin evidencia", y lo resume sin tener que expandirla.
**Workaround en el MVP (US-129, US-130):** `assumptions` y `limitations` llegan vacías (el contrato ya las prevé, US-033 AC-4); la Base declara los faltantes y la continuación con aviso (US-128).
**Stories:** US-128 (3 puntos, S4) · US-129, US-130 (8 puntos, `si-hay-capacidad`)

## Fixtures

- Usa **F-M2** (FEAT-04 US-002, 6 faltantes en `test-1.0.0`), **FX-06a-a/b** y **FX-08b-a**.
- **FX-T2b-a · Reglas de supuestos de test** en el catálogo `test-1.0.0` ampliado: próstata — si falta `sitios_metastasicos` → "Se asume enfermedad no metastásica: no hay estudios de extensión registrados"; mama — si falta `estado_menopausico` → "No se asume estado menopáusico: el criterio se trata como desconocido". LLM falso `SUP-OK` propone "Se asume que no recibió tratamiento previo" anclado a `tratamientos_previos` (faltante); `SUP-CONTRADICHO` propone "Se asume estadio temprano" cuando el contexto trae `TNM_8` "IV" (NLI `contradiction`); `SUP-SIN-ANCLA` propone "Se asume buena adherencia" sin faltante asociado.

---

## US-128 — La Base del análisis declara los datos críticos faltantes y si el oncólogo continuó con aviso

> Linear: [L1D-188](https://linear.app/l1der-lab-mjbc/issue/L1D-188)

`FEAT-T2b` · Sprint 4 · Estimación **3** · HU-20 · FR-27 (b, dueña) · AC-T2.1 (inciso b), AC-T2.2 (b), AC-T2.4, AC-04.3 (Base) · ↪ FEAT-04 US-006, US-066, US-067 · 🔗 Regresión [RN-02] → US-055

## Story
Como oncólogo, quiero que cada análisis diga qué datos críticos de mi paciente faltaban
y si elegí continuar igual, para leer el resultado sabiendo con qué información se hizo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado F-M2 y el análisis enviado con `continueWithWarning =
  true`, cuando se responde, entonces `analysisBasis.missingCriticalData` trae las 6 claves
  del checklist en el orden del catálogo y `continuedWithWarning = true`, iguales a lo
  persistido en `missing_critical_data` y `continued_with_warning`.
  `[FR-27]` `[AC-T2.1]` `[AC-04.3]` `[AC-T2.4]`
- **AC-2 (borde · sin evidencia)** · Dado F-M2 y `Q-SIN`, cuando se responde
  `sin_evidencia`, entonces la Base trae igual las 6 claves y `continuedWithWarning`.
  `[AC-T2.1]` `[RN-02]`
- **AC-3 (borde · determinista)** · Dado un LLM falso que devuelve otra lista de
  faltantes, cuando se arma la Base, entonces el inciso (b) sigue siendo el calculado por
  `clinical-api`. `[AC-T2.2]`
- **AC-4 (borde · resumen visible)** · Dado el análisis del AC-1 en el panel, cuando se
  muestra el resultado, entonces el resumen de la Base, sin expandir, dice "6 datos
  críticos faltantes · continuó con aviso", y al expandir lista las etiquetas del
  catálogo. `[AC-T2.1]` `[FR-27]`

## Contexto técnico
`AnalysisBasisBuilder` (US-066) toma la lista y el flag que FEAT-04 US-006 ya calcula y
persiste; no hay nueva fuente de datos. El panel (US-067) agrega el contador al resumen
sin expandir. Tests: Supertest con `rag-orchestrator` simulado (AC-1 a AC-3) y
Playwright (AC-4).

## INVEST
**Small** ✓ un inciso más de un constructor existente y un contador en la UI.
**Testable** ✓ cuatro tests de integración y E2E.

---

## US-129 — Los supuestos del análisis salen de reglas del catálogo o, si los propone la IA, solo se aceptan si están anclados a un faltante y nada los contradice

> Linear: [L1D-189](https://linear.app/l1der-lab-mjbc/issue/L1D-189)

`FEAT-T2b` · Sprint si-hay-capacidad · Estimación **5** · HU-20 · FR-27 (c, dueña), ADR-34 (c) · AC-T2.2 (c) · ⛔ ADR-39 (NLI) · ⛔ DEC-01 · escenario más probable (contenido de las reglas) · ↪ US-128, US-064 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-23] → US-064 (regla en ejecución; dueña de RN-23: US-068) · 🔗 Regresión [RN-29] → US-001 (reglas de supuestos en el catálogo) · **Recorrido principal:** no · **Workaround en el MVP:** `assumptions` llega vacía (el contrato ya la prevé, US-033 AC-4); la Base declara los faltantes y la continuación con aviso (US-128)

## Story
Como oncólogo, quiero que el análisis me diga qué supuso porque faltaba un dato, rotulado
como supuesto y nunca como hecho, para saber qué parte de la conclusión depende de algo
que no está en el caso.

## AC (Given/When/Then)
- **AC-1 (happy path · regla del catálogo)** · Dado un paciente de próstata sin
  `sitios_metastasicos` y FX-T2b-a, cuando se arma la Base, entonces `assumptions` trae
  "Se asume enfermedad no metastásica: no hay estudios de extensión registrados" con
  `origin = regla_catalogo`. `[FR-27]` `[AC-T2.2]`
- **AC-2 (borde · propuesto por la IA y aceptado)** · Dado F-M2 y `SUP-OK` con NLI
  distinto de `contradiction`, cuando se valida, entonces el supuesto aparece con
  `origin = llm_verificado`. `[AC-T2.2]` `[ADR-34]`
- **AC-3 (borde · contradicho)** · Dado `SUP-CONTRADICHO`, cuando se valida, entonces no
  aparece en `assumptions` y `omittedClaims` aumenta en 1. `[AC-T2.2]` `[FR-10]`
- **AC-4 (borde · sin ancla)** · Dado `SUP-SIN-ANCLA`, cuando se valida, entonces no
  aparece y `omittedClaims` aumenta en 1. `[AC-T2.2]` `[ADR-34]`
- **AC-5 (borde · rotulado en la UI)** · Dado el análisis del AC-2, cuando se muestra la
  Base, entonces cada supuesto lleva el rótulo "Supuesto" y su origen ("Regla del
  catálogo" o "IA verificada"), y el resumen sin expandir cuenta los supuestos.
  `[AC-T2.1]` `[AC-T2.2]`
- **AC-6 (borde · lenguaje)** · Dado un supuesto del LLM anclado a un faltante y sin
  contradicción que contiene "debe recibir", cuando se valida, entonces no aparece en
  `assumptions` y `omittedClaims` aumenta en 1. `[RN-23]` `[§15 resp. 2]`

## Contexto técnico
Las reglas deterministas las agrega `clinical-api` (`AnalysisBasisBuilder`, desde el
catálogo y los faltantes); las del LLM las valida `rag-orchestrator` con NLI contra la
verbalización del contexto (no contradicción) y con el ancla a una clave de
`missingCriticalData` `[ADR-34]` `[readme §4.2]`. Las reglas viven en el catálogo de datos
críticos (contenido de DEC-01; cada regla apunta a un ítem existente, RN-29). Tests: Pytest
con FX-T2b-a (AC-2 a AC-4), Vitest del builder (AC-1) y Playwright (AC-5).

## INVEST
**Small** ✓ una regla determinista y un filtro de dos condiciones sobre el validador existente.
**Testable** ✓ seis tests con LLM y NLI falsos.

---

## US-130 — La Base del análisis declara las limitaciones estructurales y solo las redactadas por la IA que tienen soporte

> Linear: [L1D-190](https://linear.app/l1der-lab-mjbc/issue/L1D-190)

`FEAT-T2b` · Sprint si-hay-capacidad · Estimación **3** · HU-20 · FR-27 (g, dueña) · AC-T2.2 (g), AC-07.4 (parte: "una sola fuente" en la Base) · ⛔ ADR-39 (NLI) · ↪ US-128, US-124 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-23] → US-064 (regla en ejecución) · **Recorrido principal:** no · **Workaround en el MVP:** `limitations` llega vacía (el contrato ya la prevé, US-033 AC-4); la Base declara los faltantes y la continuación con aviso (US-128)

## Story
Como oncólogo, quiero que el análisis me diga qué limita su alcance (una sola fuente,
solo ensayos de fase II, una población no comparable), para no sobrestimar lo que dice
la evidencia sobre mi paciente.

## AC (Given/When/Then)
- **AC-1 (happy path · una sola fuente)** · Dado un análisis con una sola fuente sobre el
  umbral (`retrievalStats.aboveThreshold` de una sola fuente), cuando se arma la Base,
  entonces `limitations` incluye "Análisis basado en una sola fuente" con
  `origin = estructural`. `[FR-27]` `[AC-07.4]`
- **AC-2 (borde · solo fase II)** · Dado que todas las fuentes citadas tienen
  `trial_phase = II` en el catálogo, cuando se arma la Base, entonces incluye "Evidencia
  solo de ensayos fase II" (`estructural`). `[FR-27]` `[RN-25]`
- **AC-3 (borde · población no comparable)** · Dado `doc-a2` con
  `populationNotComparable = true` por `estado_her2` (US-124), cuando se arma la Base,
  entonces incluye "Población del estudio no comparable en el criterio estado HER2"
  (`estructural`). `[FR-27]` `[AC-08.6]`
- **AC-4 (borde · redactada por la IA)** · Dadas dos limitaciones del LLM, una con NLI
  `entailment` y otra `neutral`, cuando se validan, entonces la primera aparece con
  `origin = llm_verificado` y la segunda se omite y suma a `omittedClaims`.
  `[AC-T2.2]` `[RN-01]` `[FR-10]`
- **AC-5 (borde · lenguaje)** · Dada una limitación del LLM con NLI `entailment` que
  contiene "el mejor tratamiento", cuando se valida, entonces no aparece en `limitations`
  y suma a `omittedClaims`. `[RN-23]` `[§15 resp. 2]`

## Contexto técnico
Las estructurales las calcula `clinical-api` desde `retrievalStats`, los metadatos de las
citas (RN-25) y la aplicabilidad; las del LLM las valida `rag-orchestrator` (`SupportChecker`,
US-064) y llegan en `limitations` de la respuesta interna. Los literales de las
estructurales viven en configuración (sin términos prescriptivos, regresión de RN-23).
Tests: Vitest del builder (AC-1 a AC-3) y Pytest (AC-4).

## INVEST
**Small** ✓ tres reglas deterministas y un filtro existente.
**Testable** ✓ cinco tests deterministas.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-03 | PRD §17 FR-27: "3"; PRD §14: FR-27 solo en el S3 | PRD §5 FR-27 (R-06): S1 (a, d, e, f, omitidas) · S3 (b, c, g) · S4 (h, i) | PRD §5: esta Feature cubre (b), (c), (g); (h) e (i) quedan en FEAT-T2c (Post-MVP) |
| — | PRD AC-07.4: "Síntesis basada en una sola fuente" (CAP-07, S4) | Slicing adoptado: síntesis (FEAT-07) en el S6 si hay capacidad | La limitación estructural de una sola fuente se declara desde el S3 sin síntesis (US-130 AC-1, texto "Análisis basado en una sola fuente"); FEAT-07 agregará su variante |
| Slicing v2 | PRD FR-27 (b, c, g) y §14 S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): inciso b en el S4; supuestos (c) y limitaciones (g) `si-hay-capacidad` | AC-T2.2 (c, g) queda en historias `si-hay-capacidad` |
