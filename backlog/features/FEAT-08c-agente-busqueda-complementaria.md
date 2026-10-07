# FEAT-08c — Agente acotado: búsqueda complementaria sobre el corpus

> Linear: [L1D-21](https://linear.app/l1der-lab-mjbc/issue/L1D-21)

**Talla:** L (3 historias en `rag-orchestrator` con un límite de latencia sensible; G-5 se recalibra) · **Sprint:** Post-MVP · **Capacidad:** CAP-08 (AC-08.7) · T-2 (inciso i, vía FEAT-T2c) · **Recorrido principal:** no
**Requisitos:** FR-30 (dueña) · IA-05 · G-16 · TBD-18 (`AGENT_MAX_ITERATIONS`, `AGENT_MAX_SUBQUERIES`, `AGENT_DEADLINE_MS`; CAL) · RN-01, RN-02, RN-15, RN-24 (regresión)
**Evidencia:** [→ PRD §5 FR-30], [→ PRD §6 RN-01, RN-02, RN-15, RN-24], [→ PRD §2.1 G-5, G-16], [→ PRD §7 Capacidad (inferencias compartidas con la búsqueda complementaria)], [→ PRD §12 Agente acotado], [→ PRD §16 TBD-18], [→ PRD §18.3.8 AC-08.7, M-08.5], [→ readme §3.3 #37], [→ readme §4.1 `AnalysisBasis.agentSteps`], [→ readme §3.1 `agent_steps`], [→ readme §5 HU-26], [→ backlog/02-adrs.md §4.1 (TBD-18 como CAL)]
**Dependencias:** ↪ US-055 (recuperación con umbral y *reranker*), US-063, US-064 (validación de citas y soporte), US-122, US-123, US-124 (aplicabilidad y causa de Desconocido), US-056 (semáforo y *deadline*) · ⛔ ADR-39 (US-012; LLM real para planificar sub-consultas) · ⛔ DEC-11 (US-021) · escenario más probable (criterios de aplicabilidad) · 🔗 Produce para: US-206 (Base, inciso i) · 🔗 Medido en: US-161 (M-08.5, G-16, p95 con agente) · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-15] → US-148 (la búsqueda complementaria es parte del análisis) · 🔗 Regresión [RN-24] → US-191
**Valor:** muchas fuentes no reportan un criterio en el fragmento recuperado y la aplicabilidad queda "No reportado por la fuente". El agente busca una vez más, de forma dirigida y acotada, y solo cambia el estado si encuentra evidencia citada y verificada.
**Workaround en el MVP:** el criterio queda "Desconocido: no reportado por la fuente" con su causa visible (US-124); el oncólogo puede reformular la pregunta o filtrar por fuente y lanzar un análisis nuevo. `agentSteps` llega vacío (contrato final desde el S1, US-033).
**Stories:** US-186, US-187, US-188 (13 puntos)

## Fixtures

- **FX-08c-a · Búsqueda complementaria de test** (en `rag-orchestrator`; amplía FX-08b-a; configuración de test `AGENT_MAX_ITERATIONS = 1`, `AGENT_MAX_SUBQUERIES = 3`, `AGENT_DEADLINE_MS = 2000`):
  - Primer borrador de A-M1 con `doc-a1`: `linea_tratamiento` desconocido (`no_reportado_por_fuente`), `estado_menopausico` desconocido (`falta_en_paciente`).
  - Chunk adicional `ch-a1-2` (de `doc-a1`, no recuperado en la primera consulta): "Patients had not received prior systemic therapy for this disease." Puntaje del *reranker* falso para la sub-consulta de `linea_tratamiento`: 0,65 (umbral 0,30).
  - Planificador falso `PLAN-OK` (1 sub-consulta: `"doc-a1 prior systemic therapy line"`, `target = linea_tratamiento`) · `PLAN-5` (5 sub-consultas) · `PLAN-PACIENTE` (intenta una sub-consulta con `target = estado_menopausico`) · `PLAN-LENTO` (la segunda llamada al LLM supera el *deadline*).
  - NLI falso: `entailment` para "la población no recibió terapia sistémica previa" contra `ch-a1-2`; `neutral` para "la población recibió una línea previa".

---

## US-186 — Si quedan criterios "No reportado por la fuente", el agente planifica sub-consultas dirigidas sobre el corpus dentro de los límites de configuración

> Linear: [L1D-132](https://linear.app/l1der-lab-mjbc/issue/L1D-132)

`FEAT-08c` · Post-MVP · Estimación **5** · HU-26 · FR-30 (dueña) · AC-08.7 · TBD-18 · ↪ US-055, US-124 · ⛔ ADR-39 (US-012) · 🔗 Regresión [RN-02] → US-055 · 🔗 Medido en: US-161

## Story
Como oncólogo, quiero que cuando la evidencia no reporta un criterio de aplicabilidad el
sistema lo busque una vez más en el corpus antes de mostrarme el análisis, para tener
menos "Desconocido" sin que la IA invente nada.

## AC (Given/When/Then)
- **AC-1 (happy path)** `[IA-05]` · Dado FX-08c-a con `PLAN-OK`, cuando se procesa la consulta de
  A-M1, entonces el agente ejecuta 1 iteración con 1 sub-consulta cuyo `target =
  linea_tratamiento`, solo con la herramienta de recuperación y con los mismos filtros,
  umbral y *reranker* de la consulta. `[AC-08.7]` `[FR-30]`
- **AC-2 (borde · límite de sub-consultas)** · Dado `PLAN-5`, cuando se ejecuta,
  entonces se ejecutan solo las 3 primeras (`AGENT_MAX_SUBQUERIES`) y el registro dice
  "2 sub-consultas descartadas por límite". `[AC-08.7]` `[RN-22]` `[TBD-18]`
- **AC-3 (borde · "sin evidencia")** · Dada la pregunta `Q-SIN`, cuando se procesa,
  entonces el planificador y el adapter del LLM registran cero invocaciones. `[RN-02]`
  `[AC-08.7]`
- **AC-4 (borde · faltan datos del paciente)** · Dado `PLAN-PACIENTE`, cuando se
  planifica, entonces la sub-consulta sobre `estado_menopausico` (`falta_en_paciente`) se
  descarta: el agente solo busca criterios `no_reportado_por_fuente`. `[FR-30]` (asumido
  en la regla de descarte)
- **AC-5 (invariante · sin datos clínicos)** · Dado el agente en ejecución, cuando se
  inspeccionan las herramientas registradas y las conexiones, entonces solo existe
  `retrieve_corpus` y el proceso no tiene credenciales ni red hacia el almacén clínico.
  `[FR-30]` `[AC-T4.4]` `[SEG-06]`
- **AC-6 (borde · nada pendiente)** · Dado un primer borrador sin criterios
  `no_reportado_por_fuente`, cuando termina, entonces el agente no se ejecuta y
  `agentSteps = []`. `[FR-30]`

## Contexto técnico
`BoundedAgent` dentro de `RAGOrchestratorService` (`application/agent.py`), con una sola
herramienta (`retrieve_corpus`, el mismo puerto de recuperación de US-055). Límites desde
configuración (propuestas de TBD-18: 1 iteración, 3 sub-consultas). Tests: Pytest con
FX-08c-a y adapters falsos (AC-1…AC-4, AC-6) y el test de aislamiento de US-040 ampliado
(AC-5).

## INVEST
**Small** ✓ un planificador acotado sobre un puerto existente.
**Testable** ✓ seis tests con adapters falsos.

---

## US-187 — Lo que encuentra el agente pasa por la misma validación y solo regenera los bloques afectados

> Linear: [L1D-133](https://linear.app/l1der-lab-mjbc/issue/L1D-133)

`FEAT-08c` · Post-MVP · Estimación **5** · HU-26 · FR-30, RN-01 · AC-08.7, AC-T1.2 · ↪ US-186, US-063, US-064, US-123 · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-24] → US-191 · 🔗 Medido en: US-161

## Story
Como oncólogo, quiero que un criterio solo cambie de "Desconocido" si lo nuevo está
citado y verificado como todo lo demás, para que la búsqueda complementaria no sea una
puerta trasera para afirmaciones sin soporte.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `PLAN-OK` y el NLI `entailment` sobre `ch-a1-2`, cuando
  termina el análisis, entonces `linea_tratamiento` de `doc-a1` pasa a un estado evaluado
  con `studyPopulationValue` citando `ch-a1-2`, el resto de criterios y las opciones no se
  regeneran (mismo contenido que el primer borrador), y `agentSteps[0].foundEvidence =
  true`. `[AC-08.7]` `[FR-30]`
- **AC-2 (borde · sin soporte)** · Dado el NLI `neutral` para la afirmación nueva, cuando
  se valida, entonces el criterio sigue "Desconocido: no reportado por la fuente",
  `foundEvidence = false` y `omittedClaims` aumenta en 1. `[RN-01]` `[AC-08.3]`
- **AC-3 (borde · sin evidencia nueva)** · Dada una sub-consulta sin chunks sobre el
  umbral, cuando termina, entonces el criterio sigue en Desconocido y `foundEvidence =
  false`, sin invocar al LLM para ese bloque. `[FR-30]` `[RN-02]`
- **AC-4 (invariante · memoria no citable)** · Dado un contexto con un análisis previo
  rotulado que afirma la línea de tratamiento, cuando el agente regenera el bloque,
  entonces esa afirmación no cuenta como soporte y el criterio no cambia por ella.
  `[RN-24]`
- **AC-5 (borde · cita ajena)** · Dado un LLM falso que cita en el bloque regenerado un
  chunk que no recuperó ninguna sub-consulta ni la consulta original, cuando se valida,
  entonces la afirmación se rechaza. `[RN-01]` `[RN-04]`

## Contexto técnico
Las sub-consultas amplían el conjunto de chunks recuperados de **esa** consulta, que es
el que valida US-063; la regeneración se limita a los criterios y puntos de síntesis con
`target`. Tests: Pytest con FX-08c-a (AC-1…AC-5).

## INVEST
**Small** ✓ reutiliza el validador; la novedad es la regeneración parcial.
**Testable** ✓ cinco tests.

---

## US-188 — El agente respeta el *deadline*, devuelve el primer resultado validado si no alcanza y queda registrado en `agent_steps`

> Linear: [L1D-134](https://linear.app/l1der-lab-mjbc/issue/L1D-134)

`FEAT-08c` · Post-MVP · Estimación **3** · HU-26 · FR-30, NFR-01 · AC-08.7, AC-T1.4 · ↪ US-186, US-056, US-053 · 🔗 Produce para: US-206 (inciso i) · 🔗 Medido en: US-161 (p95 con agente)

## Story
Como oncólogo, quiero que la búsqueda complementaria nunca me deje esperando más de lo
previsto y que quede registrado qué buscó, para confiar en el tiempo de respuesta y poder
revisar el proceso.

## AC (Given/When/Then)
- **AC-1 (happy path · registro)** · Dado el AC-1 de US-187, cuando `clinical-api`
  persiste el análisis, entonces `ai_analysis_record.agent_steps` contiene `[{subQuery,
  target: linea_tratamiento, foundEvidence: true}]` sin datos del paciente en
  `subQuery`. `[AC-08.7]` `[AC-T1.4]` `[RN-11]`
- **AC-2 (borde · *deadline*)** · Dado `PLAN-LENTO`, cuando se supera `AGENT_DEADLINE_MS`,
  entonces la respuesta es el primer resultado validado (`200`), `agentSteps` registra la
  sub-consulta con `foundEvidence = false` y la métrica de *deadline* aumenta en 1.
  `[FR-30]` `[TBD-18]` `[readme §2.7]`
- **AC-3 (borde · semáforo compartido)** · Dado el semáforo de inferencia ocupado por
  otra extracción, cuando el agente pide una nueva inferencia, entonces espera dentro del
  mismo *deadline* y, si no obtiene turno, devuelve el primer resultado validado.
  `[RN-30]` `[NFR-04]` (asumido en la espera)
- **AC-4 (borde · tiempo total)** · Dado el *deadline* global del análisis (30 s hacia
  Backend 2), cuando el agente se ejecuta, entonces el análisis completo nunca lo supera
  por su causa. `[NFR-01]` `[FR-30]`
- **AC-5 (borde · configuración)** · Dado `AGENT_MAX_ITERATIONS = 0`, cuando se procesa,
  entonces el agente no se ejecuta y el análisis se comporta como sin FEAT-08c, sin
  cambiar código. `[RN-22]` (asumido)

## Contexto técnico
Presupuesto de tiempo propagado desde el gateway (`X-Deadline`); el agente consulta el
tiempo restante antes de cada inferencia. `subQuery` se construye solo con texto del
corpus y nombres de criterios del catálogo, nunca con valores del paciente. Tests: Pytest
con reloj y semáforo falsos (AC-2…AC-5) y Supertest de `clinical-api` para la
persistencia (AC-1).

## INVEST
**Small** ✓ control de tiempo y persistencia de un campo existente.
**Testable** ✓ cinco tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-30, §14 y §18.1.1 CAP-08: agente en el Sprint 4; readme §5.0 S4 KR4 (G-16) | Slicing adoptado (`01-requisitos.md` §15): agente en Post-MVP | Slicing: Post-MVP; la causa "No reportado por la fuente" queda visible (*workaround*) |
| — | PRD §2.1 G-5: el p95 se recalibra en el S4 "con … búsqueda complementaria" | Slicing: el p95 del S4 se recalibró sin agente (US-141) | La recalibración con agente queda en US-161 (Post-MVP) |
