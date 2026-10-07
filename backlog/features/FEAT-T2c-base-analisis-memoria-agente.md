# FEAT-T2c — Base del análisis: análisis previos usados y búsqueda complementaria (incisos h, i)

> Linear: [L1D-38](https://linear.app/l1der-lab-mjbc/issue/L1D-38)

**Talla:** M (2 historias deterministas sobre un esquema que ya es final) · **Sprint:** Post-MVP · **Capacidad:** T-2 (AC-T2.1 incisos h e i, AC-T2.2, AC-T2.4) · CAP-08 (AC-08.7: la Base lista las sub-consultas) · CAP-11 (AC-11.6: la Base lista los análisis previos) · **Recorrido principal:** no
**Requisitos:** FR-27 (h, i; dueña) · RN-24 (regresión; dueña US-191)
**Evidencia:** [→ PRD §5 FR-27 (incisos h, i)], [→ PRD §6 RN-24], [→ PRD §18.3.8 AC-08.7], [→ PRD §18.3.11 AC-11.6], [→ PRD §18.4 AC-T2.1, AC-T2.2, AC-T2.4], [→ readme §4.1 `AnalysisBasis.priorAnalysesUsed`, `AnalysisBasis.agentSteps`], [→ readme §5 HU-20, HU-24, HU-26]
**Dependencias:** ↪ US-066, US-067 (Base del análisis y su resumen, S2), US-189 (memoria seleccionada, FEAT-11c), US-188 (`agent_steps`, FEAT-08c) · 🔗 Regresión [RN-24] → US-191 · 🔗 Regresión [RN-06] → US-053
**Valor:** el oncólogo debe saber sobre qué se apoyó cada análisis. Si la IA tuvo en cuenta análisis previos o buscó más evidencia, la Base del análisis lo declara, con la marca de que la memoria es contexto y no evidencia.
**Workaround en el MVP:** sin memoria ni agente (Post-MVP), `priorAnalysesUsed` y `agentSteps` llegan vacíos y la Base del análisis muestra los incisos del S1 y del S3 (US-066, US-128…US-130); no hay nada que declarar.
**Stories:** US-205, US-206 (6 puntos)

---

## US-205 — La Base del análisis lista los análisis previos usados como contexto, con la marca "contexto, no evidencia"

> Linear: [L1D-191](https://linear.app/l1der-lab-mjbc/issue/L1D-191)

`FEAT-T2c` · Post-MVP · Estimación **3** · HU-20, HU-24 · FR-27 (h, dueña) · AC-T2.1 (h), AC-T2.2 (h), AC-T2.4, AC-11.6 · ↪ US-189, US-066, US-067 · 🔗 Regresión [RN-24] → US-191

## Story
Como oncólogo, quiero ver en la Base del análisis qué análisis previos tuvo en cuenta la
IA y que estén marcados como contexto, para saber de dónde viene la continuidad con lo
anterior sin confundirla con evidencia.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el análisis nuevo de P-MEM (FX-11c-a), cuando se responde,
  entonces `analysisBasis.priorAnalysesUsed` lista `AN-M5`, `AN-M3` y `AN-M1` con su
  `analysisId` y `createdAt`, en el mismo orden que `prior_analyses_used`, y el panel los
  muestra bajo "Análisis previos usados (contexto, no evidencia)". `[AC-T2.1]`
  `[AC-11.6]` `[FR-27]`
- **AC-2 (borde · determinista)** · Dados dos análisis consecutivos sin cambios en los
  datos, cuando se comparan, entonces `priorAnalysesUsed` sale de `prior_analyses_used`
  persistido, nunca del texto del LLM. `[AC-T2.2]`
- **AC-3 (borde · sin memoria)** · Dado un paciente sin análisis previos, cuando se
  responde, entonces `priorAnalysesUsed = []` y la Base no muestra el inciso (h).
  `[AC-T2.1]`
- **AC-4 (borde · historial)** · Dado el análisis del AC-1, cuando se abre en el
  historial (US-174), entonces el inciso (h) es idéntico al mostrado al responder.
  `[AC-T2.4]`
- **AC-5 (borde · resumen sin expandir)** · Dado el panel, cuando la Base está colapsada,
  entonces el resumen incluye "3 análisis previos usados como contexto". `[AC-T2.1]`
  (asumido en el texto)

## Contexto técnico
`AnalysisBasisBuilder` de Backend 1 (US-066) agrega el inciso (h) desde
`prior_analyses_used`. Tests: Vitest del *builder*, Supertest con FX-11c-a (AC-1…AC-4) y
Playwright (AC-1, AC-5).

## INVEST
**Small** ✓ un inciso determinista en un *builder* existente.
**Testable** ✓ cinco tests.

---

## US-206 — La Base del análisis lista cada sub-consulta de la búsqueda complementaria, su objetivo y si encontró evidencia

> Linear: [L1D-192](https://linear.app/l1der-lab-mjbc/issue/L1D-192)

`FEAT-T2c` · Post-MVP · Estimación **3** · HU-20, HU-26 · FR-27 (i, dueña) · AC-T2.1 (i), AC-T2.2 (i), AC-08.7 (Base) · ↪ US-188, US-066, US-067

## Story
Como oncólogo, quiero ver qué buscó la IA por su cuenta y si encontró algo, para entender
por qué un criterio cambió de "Desconocido" o por qué sigue igual.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el análisis de A-M1 con `PLAN-OK` (FX-08c-a), cuando se
  responde, entonces `analysisBasis.agentSteps = [{subQuery, target:
  "linea_tratamiento", foundEvidence: true}]` igual a `ai_analysis_record.agent_steps`, y
  el panel lo muestra en "Búsqueda complementaria". `[AC-08.7]` `[AC-T2.1]` `[FR-27]`
- **AC-2 (borde · sin evidencia nueva)** · Dada una sub-consulta con `foundEvidence =
  false`, cuando se muestra, entonces dice "Sin evidencia nueva: el criterio sigue en
  Desconocido". `[FR-30]` `[AC-08.7]`
- **AC-3 (borde · "sin evidencia")** · Dado un análisis `sin_evidencia`, cuando se
  responde, entonces `agentSteps = []` y la Base dice que la búsqueda complementaria no se
  ejecutó porque no hubo evidencia. `[RN-02]` `[AC-08.7]` `[AC-T2.3]`
- **AC-4 (borde · determinista)** · Dado un LLM falso que, además, escribe en su texto
  "busqué en NCCN", cuando se arma la Base, entonces el inciso (i) solo contiene lo que
  registra `agent_steps`. `[AC-T2.2]` `[RN-21]`
- **AC-5 (borde · *deadline*)** · Dado `PLAN-LENTO`, cuando se muestra, entonces la
  sub-consulta cortada aparece con "Interrumpida por tiempo". `[FR-30]` (asumido en el
  texto)
  > Pendiente de definir en refinamiento (dueño: Ingeniería · afecta: AC-5, schema `AgentStep`): el esquema de readme §4.1 solo tiene `subQuery`, `target` y `foundEvidence`; ¿se agrega un campo `interrupted` para distinguir "cortada por *deadline*" de "sin evidencia nueva", o ambos casos se muestran igual?

## Contexto técnico
`AnalysisBasisBuilder` agrega el inciso (i) desde `agent_steps` (US-188). Tests: Vitest
del *builder*, Supertest con FX-08c-a y Playwright (AC-1…AC-5).

## INVEST
**Small** ✓ un inciso determinista.
**Testable** ✓ cinco tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-27 y §18.4 T-2: incisos (h) e (i) en el Sprint 4; AC-T2.1 "de (a) a (i) al final del S4" | Slicing adoptado: memoria y agente en Post-MVP | Slicing: incisos (h) e (i) en Post-MVP; G-Demo verifica la Base con los incisos del S1 y del S3 (US-142) |
