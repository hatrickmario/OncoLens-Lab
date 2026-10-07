# FEAT-07 — Síntesis de evidencia: acuerdos y discrepancias explicadas

> Linear: [L1D-19](https://linear.app/l1der-lab-mjbc/issue/L1D-19)

**Talla:** L (5 historias; atraviesa `rag-orchestrator`, `clinical-api` y `web`, sin ADR nuevo) · **Sprint:** 6 · **Label:** `si-hay-capacidad` (**1.º punto de recorte** del PRD §14) · **Capacidad:** CAP-07 (AC-07.1…AC-07.5) · CAP-05 (AC-05.3: la pregunta no se limita a tratamiento) · T-1 (AC-T1.2: afirmaciones de síntesis) · **Recorrido principal:** no
**Requisitos:** FR-24 (dueña) · RN-01 (regresión: afirmaciones de síntesis; dueña US-064) · RN-25 (regresión; dueña US-127) · RN-23 (regresión; dueña US-068) · IA-06 · TBD-09 (sin puntaje de solidez)
**Evidencia:** [→ PRD §5 FR-24], [→ PRD §6 RN-01, RN-04, RN-23, RN-25], [→ PRD §3 No-objetivos (puntaje de solidez)], [→ PRD §12 IA-06], [→ PRD §14 capacidad (orden de recorte)], [→ PRD §16 TBD-09], [→ PRD §18.3.5 AC-05.3], [→ PRD §18.3.7 AC-07.1…AC-07.5, M-07.1…M-07.3], [→ PRD §18.4 AC-T1.2], [→ readme §4.1 `Synthesis`, `SupportedClaim`, `CitedSource`], [→ readme §5 HU-21], [→ readme §3.3 #7]
**Dependencias:** ↪ US-055 (recuperación y umbral), US-064 (validador de soporte), US-063, US-127 (citas y metadatos copiados), US-130 (limitaciones de la Base), US-061 (panel) · ⛔ ADR-39 (US-012; LLM y NLI reales; los AC usan adapters falsos) · 🔗 Medido en: US-157 (M-07.1, M-07.3), US-072 (M-07.2, fidelidad y precisión de citas, regresión) · 🔗 Relacionada: US-032 · ADR-7 (puntaje de solidez, futuro) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-25] → US-127 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069
**Valor:** cuando la evidencia se contradice, el oncólogo necesita entender por qué (JTBD 5, P7) antes de concluir. La síntesis pone lado a lado lo que las fuentes comparten y en qué difieren, con la diferencia de población, endpoint, fecha o diseño que lo explica, y sin ningún puntaje que la convierta en una indicación.
**Workaround en el MVP:** el contrato `Synthesis` existe desde el S1 y llega vacío (US-033); el oncólogo compara las fuentes con las tarjetas de opción (US-061, US-135), la tabla de aplicabilidad por fuente (US-126) y sus etiquetas factuales copiadas del catálogo (US-127). La Base del análisis ya declara "Síntesis basada en una sola fuente" como limitación estructural (US-130).
**Stories:** US-166 … US-170 (19 puntos)

## Fixtures

- **FX-07-a · Fuentes con discrepancia** (schema `corpus` y Milvus de test; *embeddings*, *reranker*, LLM y NLI falsos; `RELEVANCE_THRESHOLD = 0.30`):
  - `doc-s1` — ECA fase III, `study_design = eca`, `trial_phase = III`, `primary_endpoint = "supervivencia libre de enfermedad"`, `sample_size = 1200`, `published_at = 2020-04-01`, `population_criteria`: HER2 positivo, estadio I–III. Chunk `ch-s1-1`: "Adding anti-HER2 therapy improved disease-free survival (HR 0.70)."
  - `doc-s2` — ECA fase II, `study_design = eca`, `trial_phase = II`, `primary_endpoint = "supervivencia global"`, `sample_size = 200`, `published_at = 2015-02-01`, misma población. Chunk `ch-s2-1`: "No significant overall survival benefit was observed with anti-HER2 therapy."
  - `doc-s3` — guía sin `primary_endpoint` ni `sample_size`. Chunk `ch-s3-1`: "Anti-HER2 therapy is described for HER2-positive early breast cancer."
  - Puntajes del *reranker* para `Q-HER2`: `ch-s1-1` 0,82 · `ch-s2-1` 0,74 · `ch-s3-1` 0,70. Para `Q-UNA` (variante de `Q-HER2` con filtro de fuente "ensayos fase III"): solo `ch-s1-1` 0,82 sobre el umbral.
  - LLM falso de síntesis: `SINT-OK` (1 acuerdo "las tres fuentes describen terapia anti-HER2 en HER2 positivo" citando `ch-s1-1`, `ch-s3-1`; 1 discrepancia "beneficio en SLE vs. sin beneficio en SG" citando `ch-s1-1`, `ch-s2-1`, `explainedBy = endpoint`) · `SINT-SIN-SOPORTE` (agrega el acuerdo "reduce la mortalidad a la mitad" citando `ch-s1-1`; NLI `neutral`) · `SINT-CAUSA-INVENTADA` (discrepancia con `explainedBy = poblacion`, aunque las poblaciones del catálogo coinciden) · `SINT-PUNTAJE` (agrega `"evidenceLevel": "alto"` y el texto "evidencia de nivel alto") · `SINT-PRESCRIPTIVO` (acuerdo "es el mejor tratamiento para esta paciente").

---

## US-166 — Con dos o más fuentes sobre el umbral, `/rag/query` devuelve "Puntos de acuerdo" y "Discrepancias" y cada afirmación queda citada y con soporte

> Linear: [L1D-120](https://linear.app/l1der-lab-mjbc/issue/L1D-120)

`FEAT-07` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-21 · FR-24 (dueña), RN-01 · AC-07.1, AC-T1.2 (síntesis) · ↪ US-055, US-064 · ⛔ ADR-39 (US-012) · 🔗 Regresión [RN-01] → US-064 · 🔗 Regresión [RN-23] → US-064 (regla en ejecución) · 🔗 Regresión [RN-02] → US-055 · 🔗 Medido en: US-072 (M-07.2), US-157

## Story
Como oncólogo, quiero ver en qué coinciden y en qué difieren las fuentes recuperadas,
con una cita verificada en cada afirmación, para entender la evidencia antes de sacar una
conclusión.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `Q-HER2` sobre FX-07-a con `SINT-OK`, cuando responde
  `/rag/query`, entonces `synthesis.agreements` tiene 1 afirmación con citas a `ch-s1-1`
  y `ch-s3-1`, `synthesis.discrepancies` tiene 1 con citas a `ch-s1-1` y `ch-s2-1`, y
  todas las citas apuntan a chunks recuperados en esa consulta. `[AC-07.1]` `[FR-24]`
  `[RN-01]`
- **AC-2 (borde · sin soporte)** · Dado `SINT-SIN-SOPORTE`, cuando se valida, entonces
  "reduce la mortalidad a la mitad" no aparece en `synthesis` y `omittedClaims` aumenta
  en 1. `[RN-01]` `[AC-T1.2]` `[FR-10]`
- **AC-3 (borde · sin evidencia)** · Dado `Q-SIN`, cuando se procesa, entonces
  `synthesis` llega con ambas listas vacías y el adapter del LLM registra cero
  invocaciones. `[RN-02]`
- **AC-4 (borde · LLM caído)** · Dado el LLM falso `LLM-CAIDO` en la etapa de síntesis,
  cuando se procesa, entonces `/rag/query` responde `503` y ningún adapter de nube
  registra llamadas. `[RN-12]` `[AC-06.1]`
- **AC-5 (borde · JSON inválido)** · Dado un LLM falso que devuelve una síntesis que no
  valida contra el esquema, cuando se procesa, entonces se reintenta una vez y, si vuelve
  a fallar, `synthesis` llega vacía y la Base del análisis lo declara como limitación
  estructural "Síntesis no disponible". `[IA-06]` (asumido)
- **AC-6 (invariante · persistencia)** · Dado el AC-1 a través de `clinical-api`, cuando
  responde `POST /platform/evidence-analyses`, entonces `AIAnalysisRecord.synthesis` es
  idéntico a la respuesta. `[RN-06]` `[AC-T1.4]`
- **AC-7 (borde · lenguaje)** · Dada una afirmación de `synthesis.agreements` con NLI
  `entailment` que contiene "debe recibir", cuando se valida, entonces no aparece en
  `synthesis` y `omittedClaims` aumenta en 1. `[RN-23]` `[§15 resp. 2]`

## Contexto técnico
`SynthesisService` en `application/` de Backend 2, con salida JSON por esquema
(`Synthesis` de readme §4.1) validada con Pydantic; cada `SupportedClaim` pasa por el
validador de citas (US-063) y de soporte (US-064), igual que las opciones. Contexto
desidentificado del gateway, sin acceso a datos clínicos `[AC-T4.4]`. Presupuesto de
tokens del bloque síntesis según ADR-39. Tests: Pytest con FX-07-a y adapters falsos
(AC-1…AC-5) y Supertest de `clinical-api` con cliente de Backend 2 falso (AC-6).

## INVEST
**Small** ✓ un servicio de generación que reutiliza el validador existente.
**Testable** ✓ siete tests con adapters falsos.

---

## US-167 — Cada discrepancia explica la diferencia de contexto desde los metadatos, o dice "Causa de la discrepancia no identificada"

> Linear: [L1D-121](https://linear.app/l1der-lab-mjbc/issue/L1D-121)

`FEAT-07` · Sprint 6 (`si-hay-capacidad`) · Estimación **5** · HU-21 · FR-24 · AC-07.2 · ↪ US-166, US-127 · 🔗 Regresión [RN-25] → US-127 · 🔗 Medido en: US-157 (M-07.1)

## Story
Como oncólogo, quiero que cada discrepancia diga si la explica la población, el
endpoint, la fecha o el diseño de los estudios, tomado de sus metadatos, para no tener
que deducirlo leyendo cada fuente.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la discrepancia de `SINT-OK` entre `doc-s1` (SLE) y
  `doc-s2` (SG), cuando se valida, entonces `explainedBy = endpoint` y `explanation`
  contiene los dos endpoints copiados del catálogo. `[AC-07.2]` `[RN-25]`
- **AC-2 (borde · causa no respaldada por los metadatos)** · Dado `SINT-CAUSA-INVENTADA`
  (`poblacion`, pero ambas fuentes tienen la misma población en el catálogo), cuando se
  valida, entonces `explainedBy` se reemplaza por la diferencia que sí existe en los
  metadatos (`endpoint`) y, si no hubiera ninguna, por `no_identificada`. `[AC-07.2]`
  `[RN-25]` (asumido en el reemplazo)
- **AC-3 (borde · sin diferencia en metadatos)** · Dadas dos fuentes con los mismos
  diseño, endpoint, población y año, cuando el LLM reporta una discrepancia, entonces
  `explainedBy = no_identificada` y el panel muestra "Causa de la discrepancia no
  identificada". `[AC-07.2]`
- **AC-4 (borde · metadatos ausentes)** · Dada una discrepancia que involucra `doc-s3`
  (sin endpoint), cuando el único candidato es `endpoint`, entonces `explainedBy =
  no_identificada`. `[AC-07.2]` (asumido)
- **AC-5 (borde · varias diferencias)** · Dadas dos fuentes que difieren en endpoint y
  fecha, cuando se explica, entonces `explainedBy` toma la primera según el orden
  configurado (`DISCREPANCY_CAUSE_ORDER`, propuesta: población, endpoint, diseño, fecha)
  y `explanation` menciona ambas. (asumido)
  > Pendiente de definir en refinamiento (dueño: oncólogo · afecta: AC-5, campo `explainedBy`): cuando dos fuentes difieren en varios factores a la vez, ¿cuál se muestra como causa principal, o el contrato debe admitir varias causas?

## Contexto técnico
Regla determinista en `domain/discrepancy.py`: compara los metadatos de catálogo de las
fuentes citadas por la discrepancia y acepta la causa del LLM solo si la diferencia
existe en el catálogo. Tests: Pytest unitario de la regla y de integración con FX-07-a.

## INVEST
**Small** ✓ una regla pura sobre metadatos ya disponibles.
**Testable** ✓ cinco tests deterministas.

---

## US-168 — Las etiquetas factuales de cada fuente se copian del catálogo y no se muestra ningún puntaje de solidez

> Linear: [L1D-122](https://linear.app/l1der-lab-mjbc/issue/L1D-122)

`FEAT-07` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-21 · FR-24, RN-25 · AC-07.3, AC-07.5 · TBD-09 · ↪ US-127 · 🔗 Relacionada: US-032 · ADR-7 · 🔗 Medido en: US-157 (M-07.3)

## Story
Como oncólogo, quiero ver el tipo y diseño, el endpoint, el tamaño de muestra y la fecha
de cada fuente de la síntesis, tal como están en el catálogo, y ningún "nivel de
evidencia" calculado, para comparar fuentes con hechos y no con una calificación.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la síntesis de `SINT-OK`, cuando se responde, entonces
  cada fuente citada trae `studyDesign`, `trialPhase`, `primaryEndpoint`, `sampleSize` y
  `publishedAt` iguales a `corpus_document` (`doc-s1`: ECA, III, SLE, 1200, 2020-04-01).
  `[AC-07.3]` `[RN-25]`
- **AC-2 (borde · ausente)** · Dada `doc-s3`, cuando se muestra en el panel, entonces
  endpoint y tamaño de muestra dicen "No disponible". `[AC-07.3]` `[RN-25]`
- **AC-3 (borde · puntaje generado)** · Dado `SINT-PUNTAJE`, cuando se valida, entonces la
  respuesta no contiene `evidenceLevel` (rechazado por el esquema) y la frase "evidencia de
  nivel alto" se omite y cuenta en `omittedClaims`. `[AC-07.5]` `[TBD-09]`
- **AC-4 (invariante · campo reservado)** · Dado el contrato y la BD, cuando se inspeccionan
  en el test de contrato, entonces `clinical_evidence_score` no se escribe ni se lee en
  ningún módulo. `[AC-07.5]` `[readme §3.3 #7]`
- **AC-5 (borde · UI)** · Dado el panel con la síntesis, cuando se busca con Playwright
  cualquier texto "nivel de evidencia", "puntaje de solidez" o estrellas, entonces no hay
  coincidencias. `[AC-07.5]`

## Contexto técnico
Reutiliza la copia de metadatos de US-127 sobre las citas de `SupportedClaim`; el esquema
Pydantic de `Synthesis` prohíbe campos adicionales. Tests: Pytest (AC-1, AC-3), test de
contrato de `packages/api-contracts` y grep en CI (AC-4), Playwright (AC-2, AC-5).

## INVEST
**Small** ✓ reutiliza la copia de metadatos y agrega un rechazo por esquema.
**Testable** ✓ cinco tests.

---

## US-169 — Con una sola fuente no hay sección de discrepancias, y una pregunta que no es de tratamiento recibe síntesis sin opciones

> Linear: [L1D-123](https://linear.app/l1der-lab-mjbc/issue/L1D-123)

`FEAT-07` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-21 · FR-24, FR-27 (g) · AC-07.4, AC-05.3 (síntesis) · ↪ US-166, US-130 · 🔗 Consume: US-130 (limitación estructural "una sola fuente")

## Story
Como oncólogo, quiero que con una única fuente el sistema no simule un debate y lo
declare, y que una pregunta sobre toxicidad o secuencia reciba una síntesis aunque no
haya opciones terapéuticas, para que la forma del análisis se ajuste a lo que pregunté.

## AC (Given/When/Then)
- **AC-1 (happy path · una fuente)** · Dado `Q-UNA` (solo `ch-s1-1` sobre el umbral),
  cuando se responde, entonces `synthesis.discrepancies = []`, el panel no muestra la
  sección "Discrepancias" y `analysisBasis.limitations` contiene "Síntesis basada en una
  sola fuente" con `origin = estructural`. `[AC-07.4]` `[FR-27]`
- **AC-2 (borde · pregunta no terapéutica)** · Dado `Q-TOX` con un LLM falso que devuelve
  1 acuerdo sobre cardiotoxicidad citando `ch-m1-1` y ninguna opción, cuando se responde,
  entonces `synthesis.agreements` tiene 1 elemento, `evidenceOptions = []`, `status =
  "con_evidencia"` y el panel no muestra el encabezado "Opciones descritas en la
  evidencia". `[AC-05.3]` `[FR-24]`
- **AC-3 (borde · discrepancia con una fuente)** · Dado un LLM falso que reporta una
  discrepancia citando solo `ch-s1-1`, cuando se valida, entonces la discrepancia se
  descarta (necesita ≥ 2 fuentes distintas) y cuenta en `omittedClaims`. `[AC-07.4]`
  `[RN-01]` (asumido)
- **AC-4 (borde · sin evidencia)** · Dado `Q-SIN`, cuando se responde, entonces no se
  muestra la sección de síntesis y la Base del análisis explica qué se buscó.
  `[AC-T2.3]` `[RN-02]`

## Contexto técnico
Reglas en `domain/synthesis_rules.py` (número de fuentes distintas por discrepancia) y
reutilización de la limitación estructural de US-130. Fixtures: FX-07-a y FX-06a-a
(`Q-TOX`, `Q-SIN`). Tests: Pytest (AC-1…AC-4) y Playwright para la ausencia de secciones.

## INVEST
**Small** ✓ dos reglas de forma sobre la síntesis.
**Testable** ✓ cuatro tests.

---

## US-170 — El panel muestra la síntesis con sus citas, las etiquetas por fuente, el aviso de IA y lenguaje no prescriptivo

> Linear: [L1D-124](https://linear.app/l1der-lab-mjbc/issue/L1D-124)

`FEAT-07` · Sprint 6 (`si-hay-capacidad`) · Estimación **3** · HU-21 · FR-24, NFR-12 · AC-07.1, AC-07.3, AC-T3.1 · ↪ US-166, US-168, US-061 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069

## Story
Como oncólogo, quiero leer la síntesis en el panel, con cada afirmación enlazada a sus
citas y las etiquetas de cada fuente a mano, para verificar lo que dice sin perder el hilo
del análisis.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el análisis de `SINT-OK` en Playwright contra Compose,
  cuando se abre el panel, entonces aparecen las secciones "Puntos de acuerdo" y
  "Discrepancias", cada afirmación con sus citas desplegables y la discrepancia con
  "Explicada por: endpoint". `[AC-07.1]` `[AC-07.2]`
- **AC-2 (borde · aviso de IA)** · Dado el mismo panel, cuando se inspecciona la sección,
  entonces muestra "Análisis generado por IA — requiere validación clínica del oncólogo
  tratante" y "Uso académico/investigación". `[RN-19]` `[AC-T3.1]`
- **AC-3 (borde · lenguaje no prescriptivo)** · Dado `SINT-PRESCRIPTIVO`, cuando se valida
  y se muestra, entonces la afirmación "es el mejor tratamiento para esta paciente" no
  aparece y la lista de términos prohibidos de US-068 no encuentra coincidencias en el
  panel. `[RN-23]` `[AC-10.3]`
- **AC-4 (borde · accesibilidad)** · Dado el panel, cuando se navega con teclado,
  entonces cada afirmación y sus citas son alcanzables y las secciones tienen
  encabezados y etiquetas accesibles. `[NFR-12]`
- **AC-5 (borde · análisis previo no citable)** · Dado un análisis cuya síntesis intenta
  citar un `analysisId` de un análisis previo, cuando se valida, entonces esa cita se
  rechaza por no ser un chunk recuperado y la afirmación se omite. `[RN-24]` `[RN-01]`
  `[RN-04]`

## Contexto técnico
Organismo `SynthesisSection` en `apps/web`, con moléculas existentes de cita (US-061).
El rechazo del AC-5 lo hace el validador de citas de US-063 (solo `chunkId` recuperados);
la dueña de RN-24 es US-191 (FEAT-11c). Tests: Playwright con FX-07-a sembrado (AC-1,
AC-2, AC-4), Pytest con LLM falso (AC-3, AC-5).

## INVEST
**Small** ✓ un organismo de UI sobre un contrato estable.
**Testable** ✓ cinco tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | PRD §5 FR-24, §14 y §18.1.1 CAP-07: Sprint 4; readme §5.0 S4 (HU-21) | Slicing adoptado (`01-requisitos.md` §15): síntesis en el S6 si hay capacidad | Slicing: S6 `si-hay-capacidad`; coherente con el orden de recorte del PRD §14 (CAP-07 es el primer recorte) |
| — | PRD §14 G-Demo: "todos los criterios de CAP-01 a CAP-11 en verde" (incluye CAP-07) | Slicing adoptado: G-Demo redefinido sin CAP-07 | G-Demo redefinido (US-142 AC-4 la lista como diferida); se registra para enmendar el PRD |
