# FEAT-T2a — Base del análisis: incisos del Sprint 1

> Linear: [L1D-36](https://linear.app/l1der-lab-mjbc/issue/L1D-36)

**Talla:** M · **Sprint:** 2 · **Capacidad:** T-2 (AC-T2.1 parte S1, AC-T2.3, AC-T2.4 parte de persistencia) · **Recorrido principal:** sí
**Requisitos:** FR-27 incisos (a) datos del paciente usados, (d) fuentes y filtros consultados, (e) fuentes no incluidas, (f) fecha de corte del corpus y afirmaciones omitidas (dueña de la parte S1, vía HU-20) · esquema `AnalysisBasis` final desde el S1
**Evidencia:** [→ PRD §5 FR-27], [→ PRD §18.4 T-2, AC-T2.1, AC-T2.3, AC-T2.4], [→ PRD §6 RN-02, RN-21], [→ readme §4.1 `AnalysisBasis`], [→ readme §6 OL-03 (alcance: incisos del S1)], [→ readme §6 OL-04 (bloque mínimo de Base del análisis)], [→ docs/AS-IS.md P12, JTBD 8]
**Dependencias:** ↪ US-033 (esquema), US-055 (`retrievalStats`, `meta`), US-059 (`CorpusRelease`), US-065 (procedencia del contexto) · 🔗 Relacionada: US-053 (persistencia) · 🔗 Consumida por: US-061, US-062 (panel) · 🔗 Produce para: US-128 (inciso b, S4), US-129 (inciso c, `si-hay-capacidad`), US-130 (inciso g, `si-hay-capacidad`) · 🔗 Regresión [RN-10] → US-046 (salida nueva con etiquetas de datos del paciente)
**Valor:** el oncólogo necesita saber sobre qué se construyó el análisis y qué no sabe, sobre todo cuando no hay evidencia (P12: confianza = trazabilidad + contexto + incertidumbre). Desde el primer análisis, la Base declara qué datos del paciente se usaron, dónde se buscó, qué fuentes no están en el corpus (NCCN, ESMO) y la fecha de corte.
**Stories:** US-066, US-067 (8 puntos, S2)

---

## US-066 — Todo análisis, incluido "sin evidencia", trae la Base del análisis con los incisos del S1

> Linear: [L1D-186](https://linear.app/l1der-lab-mjbc/issue/L1D-186)

`FEAT-T2a` · Sprint 2 · Estimación **5** · HU-20 · FR-27 (a, d, e, f, omitidas) · AC-T2.1 (S1), AC-T2.3, AC-T2.4 (persistencia) · ↪ US-055, US-059, US-065 · 🔗 Relacionada: US-053 (persiste la Base; AC-5)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** las etiquetas de procedencia del contexto (US-065) llegan en el S3. En el S2 el contexto solo lleva datos `seed` verificados; el inciso (a) los lista y las etiquetas por dato se suman cuando entran datos extraídos (S3).

## Story
Como oncólogo, quiero que cada análisis me diga con qué datos de mi paciente se hizo,
dónde se buscó, qué fuentes no están disponibles y hasta qué fecha llega el corpus,
para saber qué tan completo es lo que estoy leyendo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el paciente semilla (a), FX-06a-a y `LLM-OK`, cuando se
  ejecuta `Q-HER2` con las tres fuentes, entonces `analysisBasis` trae
  `patientDataUsed` con una etiqueta por dato del contexto (p. ej., "HER2 3+ (IHQ)") y
  su `reviewStatus` y `conflict`; `sourcesConsulted.selected = ["guias","ensayos","publicaciones"]`,
  `filters` iguales a los del request, `retrieved` y `aboveThreshold` iguales a
  `retrievalStats`; `sourcesNotIncluded = ["NCCN","ESMO"]`;
  `corpusCutoffDate = 2026-09-30`; y `missingCriticalData = []`, `assumptions = []`,
  `limitations = []`, `agentSteps = []`, `priorAnalysesUsed = []`.
  `[FR-27]` `[AC-T2.1]` `[readme §4.1]`
- **AC-2 (borde · sin evidencia)** · Dada `Q-SIN`, cuando se ejecuta, entonces la
  respuesta `sin_evidencia` trae `analysisBasis` con `sourcesConsulted` (fuentes
  seleccionadas, filtros, `retrieved` y `aboveThreshold = 0`), `sourcesNotIncluded`,
  `corpusCutoffDate` y `patientDataUsed`. `[AC-T2.3]` `[RN-02]` `[FR-27]`
- **AC-3 (borde · afirmaciones omitidas)** · Dado `rag-orchestrator` con
  `omittedClaims = 1` (escenario de US-064 AC-3), cuando se arma la Base, entonces
  `analysisBasis.omittedClaims = 1`. `[FR-27]` `[FR-10]`
- **AC-4 (borde · determinismo)** · Dados el mismo contexto y la misma respuesta
  interna, cuando `AnalysisBasisBuilder` se ejecuta dos veces, entonces ambas salidas son
  idénticas byte a byte. `[AC-T2.2]` `[FR-27]`
- **AC-5 (borde · persistida e idéntica)** · Dado el análisis del AC-1, cuando se lee
  `analysis_basis` del `AIAnalysisRecord`, entonces es igual al `analysisBasis` de la
  respuesta. `[AC-T2.4]` `[RN-06]`
- **AC-6 (borde · dato sin verificar en la Base)** · Dado FX-T1a-a, cuando se arma la
  Base, entonces el Ki-67 aparece en `patientDataUsed` con
  `reviewStatus = requiere_revision`, el receptor de estrógeno `90 %` con
  `conflict = true`, y ningún receptor de progesterona (rechazado o reemplazado).
  `[FR-27]` `[RN-07]`

## Contexto técnico
`AnalysisBasisBuilder` en el módulo `evidence-analysis` de `clinical-api` (determinista,
sin LLM) `[PRD §8]`: (a) desde el contexto etiquetado (US-065), con etiquetas
verbalizadas de forma determinista y sin identidad; (d) desde el request y
`retrievalStats`; (e) desde `meta.excludedSources` (que `rag-orchestrator` copia de
`CorpusRelease.excluded_sources`); (f) desde `meta.corpusCutoffDate` y
`meta.corpusRelease`; omitidas desde `omittedClaims`. Los campos de los incisos (b),
(c), (g), (h), (i) se devuelven vacíos con el esquema final (sin migración). Para
`tipo_no_habilitado` (sin llamada a Backend 2) la Base trae (a) y (d) y deja (e) y (f)
vacíos. Tests: Vitest unitarios del builder (AC-4, AC-6) y Supertest con
`rag-orchestrator` simulado (AC-1 a AC-3, AC-5).

## Non-goals
Inciso (b) faltantes y "Continuar con aviso" (S3, US-128). Supuestos (c) y
limitaciones (g) (S3, US-129 y US-130). Análisis previos (h) y búsqueda complementaria (i)
(Post-MVP por el slicing adoptado).

## INVEST
**Small** ✓ un constructor determinista con cinco fuentes de datos ya existentes.
**Testable** ✓ seis tests unitarios y de integración.

---

## US-067 — El panel muestra el resumen de la Base del análisis sin expandir y explica qué se buscó cuando no hay evidencia

> Linear: [L1D-187](https://linear.app/l1der-lab-mjbc/issue/L1D-187)

`FEAT-T2a` · Sprint 2 · Estimación **3** · HU-20 · FR-27 (UI del S1), NFR-12 · AC-T2.1 (resumen visible), AC-T2.3 (UI) · ↪ US-066, US-061

## Story
Como oncólogo, quiero ver de un vistazo cuántos faltantes, supuestos, fuentes no
incluidas y afirmaciones omitidas tiene el análisis, y poder abrir el detalle, para
juzgar su alcance sin leerlo todo.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la respuesta de US-066 AC-1, cuando se renderiza el
  panel, entonces sin expandir se lee el resumen "Faltantes: 0 · Supuestos: 0 · Fuentes
  no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0" y la fecha de corte del corpus
  `30/09/2026`. `[AC-T2.1]` `[FR-27]`
- **AC-2 (borde · detalle)** · Dado el panel del AC-1, cuando el doctor expande la Base,
  entonces ve la lista de datos del paciente usados con su estado de revisión en texto y
  las fuentes consultadas con el número de fragmentos recuperados y sobre el umbral.
  `[FR-27]`
- **AC-3 (borde · sin evidencia)** · Dada la respuesta de US-066 AC-2, cuando se
  renderiza, entonces sin expandir se lee qué se buscó: las fuentes seleccionadas, los
  filtros y "0 fragmentos sobre el umbral". `[AC-T2.3]`
- **AC-4 (borde · omitidas sin texto)** · Dada una respuesta con `omittedClaims = 1`,
  cuando se renderiza, entonces el resumen muestra "Afirmaciones omitidas: 1" y en
  ninguna parte del panel aparece el texto de la afirmación omitida. `[FR-10]` `[FR-27]`
- **AC-5 (borde · accesibilidad)** · Dado el control que expande la Base, cuando se usa
  con teclado, entonces es un botón con `aria-expanded` que cambia de `false` a `true`.
  `[NFR-12]`

## Contexto técnico
Organismo `AnalysisBasisPanel` (OL-04), con el resumen siempre visible y el detalle
colapsable; reserva los bloques de los incisos del S3 y S4. Tests: componente (Vitest +
Testing Library) con respuestas fijas y Playwright contra Compose en perfil de test
(AC-1, AC-3).

## INVEST
**Small** ✓ un organismo de presentación.
**Testable** ✓ cinco tests de componente y E2E.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-03 | PRD §17: FR-27 en el S3; PRD §14 lista FR-27 solo en el S3 | PRD §5 FR-27 (R-06): S1 (a, d, e, f, omitidas) · S3 (b, c, g) · S4 (h, i); readme OL-03 incluye los incisos del S1 | PRD §5 FR-27 (explícito y más reciente, R-06) |
| S-01 | PRD §5 FR-27: incisos (h) e (i) en el S4 | Slicing adoptado: memoria y agente en Post-MVP | Slicing adoptado; los campos existen vacíos desde el S1 y se llenarán con FEAT-T2c |
| Slicing v2 | PRD FR-27 y §14 S1: Base del análisis, incisos a, d, e, f, en el S1 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): Base del análisis en el S2 | En el S1 `analysisBasis` viaja con la forma del contrato (US-033) y los campos que ya produce US-055; el builder y su panel llegan en el S2 |
