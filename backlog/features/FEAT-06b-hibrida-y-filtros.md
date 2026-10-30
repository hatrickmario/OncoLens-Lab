# FEAT-06b — Recuperación híbrida, expansión bilingüe, filtros reales y faltantes en la consulta

> Linear: [L1D-17](https://linear.app/l1der-lab-mjbc/issue/L1D-17)

**Talla:** L · **Sprint:** `si-hay-capacidad` (US-112…US-115) · 4 (US-238: reescritura condicional de la consulta, comprometida, `[S4 resp. 12]`) · 5 (US-116) · **Capacidad:** CAP-06 (AC-06.1 parte S3: híbrida, expansión, filtros) · CAP-05 (AC-05.1: fuentes y filtros reales) · CAP-04 (AC-04.3: faltantes como "desconocido" en Backend 2) · **Recorrido principal:** sí (US-116) · no (US-112…US-115, US-238)
**Requisitos:** FR-09 (parte S3: *sparse*, filtros, expansión bilingüe; técnica sin HU, Q-08) · IA-02, IA-03 · RN-03, RN-05 (regresiones) · RN-02 (regresión; **enmienda decidida el 2026-10-23 en US-238**) · RN-11 (regresión: notas enmascaradas)
**Evidencia:** [→ PRD §5 FR-09], [→ PRD §6 RN-02, RN-03, RN-05, RN-11], [→ PRD §12 Idioma, Recuperación], [→ PRD §18.3.4 AC-04.3], [→ PRD §18.3.5 AC-05.1], [→ PRD §18.3.6 AC-06.1, M-06.1], [→ readme §5.0 S3 KR1, KR2 ("enmascaramiento de las notas enviadas al LLM")], [→ readme §4.1 `sourcesSelected`, `filtersApplied`], [→ readme §4.2 `ClinicalContext.missingCriticalData`, `/rag/query`], [→ readme §6 OL-02 (no incluye: *sparse*, filtros), OL-04 (no incluye: selectores)], [→ readme §3.3 #10], [→ backlog/01-requisitos.md §10 V-04, §14 Q-08], [→ docs/AS-IS.md P5, JTBD 3]
**Dependencias:** ↪ US-055 (pipeline dense), US-052 (contexto), US-117b (*sparse* poblado; antes US-117), FEAT-04 US-006 (faltantes en el contexto) · ⛔ ADR-39 (modelo *sparse* y fusión; los AC usan adapters falsos) · 🔗 Medido en: US-133 (M-06.1 sin retroceso) · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-05] → US-055 · 🔗 Regresión [RN-11] → US-049
**Valor:** el oncólogo busca con términos exactos (un fármaco, un gen) que la búsqueda semántica sola pierde, en español sobre evidencia mayoritariamente en inglés, y necesita acotar a guías o ensayos (P5, JTBD 3). Con esta Feature la búsqueda combina ambas señales, se expande al otro idioma, respeta los filtros que el oncólogo ve en el panel y sabe qué datos del paciente faltan.
**Workaround en el MVP (US-112…US-115, y US-133 en FEAT-T5b):** ADR-39 elige *embeddings* multilingües; la recuperación sigue siendo *dense* + *reranker* (US-055) y la suite mide recall es→en ≥ 0,70 (US-072).
**Stories:** US-112, US-113, US-114, US-115 (16 puntos, `si-hay-capacidad`) · US-238 (5 puntos, S4) · US-116, US-220 (6 puntos, S5)

## Fixtures

- Usa **FX-06a-a** (corpus de prueba) y **FX-06a-b** (LLM y NLI falsos), ampliados:
  - `doc-m2` — mama, `source_type = clinical_trial`, chunk `ch-m2-1`: "Olaparib in patients with germline BRCA-mutated HER2-negative early breast cancer…". *Reranker* falso: `Q-KEYWORD` ("¿Qué describe la evidencia sobre olaparib en BRCA germinal?") → `ch-m2-1` 0,82. Recuperador *dense* falso: `ch-m2-1` fuera del top-k para `Q-KEYWORD`; recuperador *sparse* falso: `ch-m2-1` primero.
  - `doc-es-1` — mama, `language = es`, `source_type = literature`, chunk `ch-es-1` sobre terapia anti-HER2 en español.
  - `doc-g1` — mama, `source_type = guideline`, `population = adulto`; `doc-ped-1` — mama, `population = pediatrico`.
- Paciente **FX-T4a-a** (nota con PII) para el filtro `historiaCompleta`; **F-M2** (FEAT-04) para los faltantes.
- **FX-06b-a · Reescritura de la consulta (US-238).** `Q-TYPO-SIN-EVIDENCIA`: pregunta con ortografía degradada para la que el *reranker* falso da `ch-m1-1` = 0,12 (bajo el umbral 0,30); su reescritura `Q-TYPO-REESCRITA` (LLM falso de reescritura, con contador de llamadas) da `ch-m1-1` = 0,74. Catálogo de prueba con `ribociclib` y sin `farmaco-inventado-x`. `Q-SIN-RESPUESTA`: ninguna de las dos formas supera 0,30.

---

## US-112 — La recuperación combina *dense* y *sparse* y mantiene la relevancia del *reranker*

> Linear: [L1D-109](https://linear.app/l1der-lab-mjbc/issue/L1D-109)

`FEAT-06b` · Sprint si-hay-capacidad · Estimación **5** · — (técnica, PRD §17; V-04) · FR-09 (S3: *sparse*), IA-03, RN-03, RN-05 · AC-06.1 (híbrida) · ⛔ ADR-39 (modelo *sparse*) · ↪ US-055, US-117 · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-05] → US-055 · 🔗 Medido en: US-133 · **Recorrido principal:** no · **Workaround en el MVP:** ADR-39 elige *embeddings* multilingües y la recuperación sigue siendo *dense* + *reranker* (US-055); la suite mide recall es→en ≥ 0,70 (US-072)

> **Enmienda decidida (usuario, 2026-10-20, ADR-45):** la expansión bilingüe **no invoca al LLM local** (RN-02 se mantiene). Se resuelve con sinónimos del catálogo y/o un modelo de traducción dedicado, según el resultado de los brazos A3 y A4 de ADR-45. Los AC se ajustan en el refinamiento de la historia; el ID no cambia. **Linear: pendiente de sincronizar.**

> **Decidido (usuario, 2026-10-27, desde US-117b):** el *sparse* de la consulta sale del **mismo BGE-M3, los mismos pesos y el mismo `SPARSE_VECTOR_SOURCE`** que el del corpus (`reindex-sparse` y la ingesta lo escriben con esa configuración); si cabe, test de consistencia índice/consulta con la misma configuración. La búsqueda híbrida vive dentro de `RAGOrchestratorService`, no en el CLI ni en el agente.

## Story
Como oncólogo, quiero que la búsqueda encuentre también la evidencia que menciona
literalmente el fármaco o el gen que pregunto, para no perder un estudio relevante
porque la búsqueda semántica no lo ubicó.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `Q-KEYWORD`, cuando se procesa `POST /rag/query`,
  entonces `ch-m2-1` llega a los candidatos del *reranker* gracias a la rama *sparse*, la
  respuesta es `con_evidencia` y la opción cita `ch-m2-1`. `[AC-06.1]` `[FR-09]`
- **AC-2 (invariante · relevancia del *reranker*)** · Dada la respuesta del AC-1, cuando
  se inspecciona, entonces `relevanceScore = 0.82` (puntaje del *reranker*), no el
  puntaje de la fusión. `[RN-03]` `[ADR-8]`
- **AC-3 (invariante · solo vigentes y del tipo de cáncer)** · Dado `ch-m1v0-1`
  (`is_current = false`) devuelto primero por el recuperador *sparse* falso, cuando se
  procesa `Q-HER2`, entonces no llega al *reranker* ni a las citas, y tampoco `ch-p1-1`
  (próstata). `[RN-05]` `[AC-06.1]`
- **AC-4 (invariante · sin evidencia)** · Dado `Q-SIN` en modo híbrido, cuando se
  procesa, entonces responde `sin_evidencia` y el LLM registra cero invocaciones.
  `[RN-02]`
- **AC-5 (borde · parámetros en configuración y trazados)** · Dados `RETRIEVAL_MODE =
  hybrid` y los parámetros de fusión en configuración, cuando se procesa cualquier
  consulta, entonces `meta.retrievalParams` registra `mode = hybrid` y esos parámetros, y
  quedan persistidos en `retrieval_params`. `[RN-22]` `[AC-T1.4]`

## Contexto técnico
`MilvusRepository.hybrid_search()` con el mismo filtro escalar (`is_current`,
`cancer_type_tags`, `population`, `source_type`) en ambas ramas y fusión de candidatos
antes del *reranker*; `relevance_score` sigue saliendo solo del *reranker*
`[readme §6.1 #4]`. Depende de que el *sparse* esté poblado (US-117b). Tests: Pytest con
recuperadores falsos y un test contra Milvus de test en la CI.

## INVEST
**Small** ✓ una búsqueda adicional y una fusión antes de un paso existente.
**Testable** ✓ cinco tests con recuperadores falsos.

---

## US-113 — Una pregunta en español recupera también evidencia en inglés, y viceversa

> Linear: [L1D-110](https://linear.app/l1der-lab-mjbc/issue/L1D-110)

`FEAT-06b` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17; V-04) · FR-09 (expansión bilingüe), IA-02 · AC-06.1 (expansión) · ⛔ ADR-39 · ↪ US-112 · 🔗 Ver también: US-238 (reescritura con LLM solo tras un primer loop sin chunks sobre el umbral) · 🔗 Regresión [RN-04] → US-063 (citas en su idioma original) · 🔗 Medido en: US-133 (recall@10 de español a inglés) · **Recorrido principal:** no · **Workaround en el MVP:** ADR-39 elige *embeddings* multilingües (sin expansión bilingüe); la suite mide recall es→en ≥ 0,70 (US-072)

## Story
Como oncólogo que pregunta en español, quiero que la búsqueda incluya la evidencia
publicada en inglés, para no depender del idioma en que se escribió cada estudio.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada la pregunta "¿Qué describe la evidencia sobre terapia
  anti-HER2 adyuvante?", cuando se procesa, entonces la recuperación se ejecuta con la
  pregunta original y con su expansión en inglés, `ch-m1-1` (inglés) llega a los
  candidatos, y la respuesta trae `meta.queryLanguage = es` y el texto generado en
  español. `[IA-02]` `[FR-09]`
- **AC-2 (borde · inglés a español)** · Dada una pregunta en inglés sobre anti-HER2,
  cuando se procesa, entonces `ch-es-1` (español) llega a los candidatos. `[IA-02]`
- **AC-3 (invariante · cita en su idioma)** · Dada la respuesta del AC-1, cuando se
  inspecciona la cita, entonces `chunkTextSnapshot` está en inglés y `language = en`.
  `[RN-04]`
- **AC-4 (borde · términos del catálogo)** · Dada una pregunta con "receptor de
  estrógeno", cuando se expande, entonces la expansión contiene "estrogen receptor"
  tomado de los sinónimos del catálogo. `[FR-22]` (asumido en el método)
- **AC-5 (borde · expansión no disponible)** · Dado el componente de expansión fallando,
  cuando se procesa la pregunta, entonces la recuperación sigue con la pregunta original
  y `meta.retrievalParams.expansion = false`. (asumido)

## Contexto técnico
`QueryExpansionService` en `rag-orchestrator/application/` (sinónimos ES/EN del catálogo
más el LLM local para la traducción de la pregunta, según ADR-39); la respuesta se genera
en el idioma de la pregunta. Tests: Pytest con adapters falsos y FX-06a-a ampliado.

## INVEST
**Small** ✓ un paso previo a la recuperación.
**Testable** ✓ cinco tests con adapters falsos.

---

## US-114 — Las fuentes y los filtros del panel se aplican de verdad a la búsqueda y al contexto

> Linear: [L1D-111](https://linear.app/l1der-lab-mjbc/issue/L1D-111)

`FEAT-06b` · Sprint si-hay-capacidad · Estimación **5** · HU-03 · FR-09 (filtros reales), IA-03, RN-11 · AC-05.1 (fuentes y filtros), AC-06.1 (filtros) · ↪ US-052, US-112 · 🔗 Regresión [RN-11] → US-049 (notas enmascaradas) · 🔗 Regresión [FR-27 d] → US-066 · **Recorrido principal:** no · **Workaround en el MVP:** ADR-39 elige *embeddings* multilingües; el panel envía las tres fuentes en `true` sin filtros (US-061) y la suite mide recall es→en ≥ 0,70 (US-072)

## Story
Como oncólogo, quiero que al elegir solo guías, o solo los últimos seis meses del caso,
el análisis use exactamente eso, para que los filtros del panel no sean decorativos.

## AC (Given/When/Then)
- **AC-1 (happy path · fuentes)** · Dado `sourcesSelected = { guias: true, ensayos:
  false, publicaciones: false }`, cuando se procesa `Q-HER2`, entonces la expresión de
  filtro de Milvus incluye `source_type == "guideline"` y ningún chunk de `clinical_trial`
  ni `literature` llega a los candidatos. `[AC-05.1]` `[readme §4.1]`
- **AC-2 (borde · últimos seis meses)** · Dado `filtersApplied.ultimosSeisMeses = true`
  y P-CASO (FX-02b-a), cuando se arma el contexto, entonces solo viajan biomarcadores y
  eventos con `monthsAgo ≤ 6`. (asumido en la semántica)
- **AC-3 (borde · solo biomarcadores relevantes)** · Dado
  `filtersApplied.soloBiomarcadoresRelevantes = true`, cuando se arma el contexto,
  entonces solo viajan biomarcadores con `clinicalSignificance` `relevante` o `crítico`.
  (asumido en la semántica)
- **AC-4 (invariante · historia completa enmascarada)** · Dado
  `filtersApplied.historiaCompleta = true` y FX-T4a-a, cuando se captura el payload,
  entonces `clinicalNotes` trae la nota con "refiere dolor leve" y sin "Lucía", "Rondón",
  "1234567" ni "3001234567". `[RN-11]` `[readme §5.0 S3]` `[AC-T4.3]`
- **AC-5 (borde · población)** · Dado un paciente adulto, cuando se procesa `Q-HER2`,
  entonces `doc-ped-1` (`pediatrico`) no llega a los candidatos y `doc-g1` (`adulto`) sí.
  `[IA-03]` `[AC-06.1]`
- **AC-6 (borde · trazado en la Base)** · Dados los filtros del AC-1 y AC-2, cuando se
  arma la respuesta, entonces `analysisBasis.sourcesConsulted` trae `selected = ["guias"]`
  y `filters` con `ultimosSeisMeses = true`, igual a lo persistido. `[FR-27]` `[AC-T2.3]`

> Pendiente de definir en refinamiento (dueño: usuario + oncólogo · afecta: AC-2, AC-3 y el filtro `antecedentesFamiliares`): el readme §5.0 (KR2 del S3) exige conectar los filtros "según su tabla de verdad", pero ninguna fuente la define. ¿Qué incluye exactamente cada filtro (`ultimosSeisMeses` sobre qué fechas; `soloBiomarcadoresRelevantes` con qué niveles del semáforo; `antecedentesFamiliares` qué tipos de nota) y qué pasa al combinarlos?

## Contexto técnico
Los filtros de fuente y población se traducen a la expresión escalar de Milvus en
`rag-orchestrator` (`publicaciones` → `literature` y `genomic_study`, asumido); los filtros
del caso los aplica `ClinicalContextBuilder` en `clinical-api` antes de desidentificar
(US-049). Las notas solo viajan con `historiaCompleta` o `antecedentesFamiliares` y
siempre enmascaradas. Tests: Pytest (AC-1, AC-5) y Supertest con `rag-orchestrator`
simulado (AC-2 a AC-4, AC-6).

## INVEST
**Small** ✓ cinco reglas de filtrado en dos constructores existentes.
**Testable** ✓ seis tests sobre la expresión de filtro y el payload.

---

## US-115 — El panel ofrece los selectores de fuentes y filtros que el backend ya aplica

> Linear: [L1D-112](https://linear.app/l1der-lab-mjbc/issue/L1D-112)

`FEAT-06b` · Sprint si-hay-capacidad · Estimación **3** · HU-03 · FR-09 (UI de filtros), NFR-12 · AC-05.1 · ↪ US-114, US-061 · 🔗 Regresión [RN-23] → US-068 · **Recorrido principal:** no · **Workaround en el MVP:** ADR-39 elige *embeddings* multilingües; el panel no muestra selectores y envía las tres fuentes en `true` (US-061); la suite mide recall es→en ≥ 0,70 (US-072)

## Story
Como oncólogo, quiero elegir en el panel qué fuentes consultar y qué parte del caso
usar, para acotar el análisis a lo que necesito.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el panel de análisis, cuando se abre, entonces muestra
  "Guías", "Ensayos" y "Publicaciones" marcadas y los cuatro filtros del caso
  desmarcados; al desmarcar "Ensayos" y pulsar "Analizar evidencia", el request a
  `/api/evidence-analyses` lleva `ensayos = false`. `[AC-05.1]` `[readme §4.1]`
- **AC-2 (borde · ninguna fuente)** · Dadas las tres fuentes desmarcadas, cuando se
  intenta analizar, entonces el botón está deshabilitado y se lee "Seleccione al menos
  una fuente", sin enviar ningún request. `[AC-05.1]` `[OL-03]`
- **AC-3 (borde · Base del análisis)** · Dado un análisis con filtros, cuando se muestra
  el resultado, entonces la Base del análisis lista las fuentes y los filtros usados.
  `[AC-T2.3]` `[FR-27]`
- **AC-4 (borde · accesibilidad)** · Dados los selectores, cuando se navega con teclado,
  entonces cada uno tiene etiqueta y se puede marcar y desmarcar. `[NFR-12]`

## Contexto técnico
Organismo `SourceAndFilterSelector` en el `EvidenceQueryForm` de OL-04; antes del S3 no
se mostraba para no sugerir filtros que no se aplicaban `[OL-04]`. Tests: Playwright
contra Compose en perfil de test.

## INVEST
**Small** ✓ un organismo de formulario.
**Testable** ✓ cuatro tests E2E.

---

## US-116 — Los datos críticos faltantes viajan como "desconocido" al prompt y enriquecen la consulta

> Linear: [L1D-113](https://linear.app/l1der-lab-mjbc/issue/L1D-113)

`FEAT-06b` · Sprint 5 · Estimación **3** · HU-18 · FR-09 (contexto con faltantes), FR-23 ("desconocido"), IA-03 · AC-04.3 (parte de Backend 2) · ↪ FEAT-04 US-006, US-057 · 🔗 Regresión [RN-11] → US-049 · 🔗 Regresión [RN-02] → US-055

## Story
Como oncólogo, quiero que la IA sepa qué datos críticos de mi paciente no se conocen y
no los suponga, y que la búsqueda tenga en cuenta su línea de tratamiento, para que la
evidencia recuperada y su análisis partan del caso tal como está.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un `RagQueryInternalRequest` con
  `missingCriticalData = ["estado_menopausico", "ki67"]`, cuando `rag-orchestrator` arma el
  prompt, entonces el bloque de datos del paciente contiene "Estado menopáusico:
  desconocido" y "Ki-67: desconocido" (etiquetas del catálogo), dentro de los
  delimitadores de datos. `[AC-04.3]` `[readme §4.2]`
- **AC-2 (borde · consulta enriquecida)** · Dado `currentLine = 1` y los mismos
  faltantes, cuando se construye el texto de recuperación, entonces incluye la etiqueta de
  la línea actual y no incluye ningún valor para los datos faltantes. `[IA-03]` `[PRD §12]`
- **AC-3 (invariante · claves, no texto)** · Dado un `missingCriticalData` con un
  elemento que no cumple `^[a-z0-9_]+$` o no está en el catálogo, cuando llega, entonces
  `rag-orchestrator` responde `422`. `[RN-11]` (asumido en la validación)
- **AC-4 (invariante · sin evidencia)** · Dados faltantes y `Q-SIN`, cuando se procesa,
  entonces responde `sin_evidencia` y el LLM registra cero invocaciones. `[RN-02]`
- **AC-5 (borde · sin faltantes)** · Dado `missingCriticalData = []`, cuando se arma el
  prompt, entonces no aparece ninguna línea "desconocido". `[FR-23]`

## Contexto técnico
`PromptBuilder` (US-057) y `RetrievalQueryBuilder` en `rag-orchestrator`; las etiquetas
salen del catálogo montado (misma versión en ambos backends, `409` si difiere). El uso de
los faltantes en la aplicabilidad ("Desconocido: falta en el paciente") es de US-124.
Tests: Pytest unitarios del constructor de prompt y de la consulta.

## INVEST
**Small** ✓ dos constructores existentes con una entrada más.
**Testable** ✓ cinco tests sobre el prompt y la consulta.

---

---

## US-220 — El oncólogo filtra la evidencia por antigüedad y el filtro queda registrado en la Base del análisis

> Linear: [L1D-270](https://linear.app/l1der-lab-mjbc/issue/L1D-270)

`FEAT-06b` · Sprint 5 · Estimación **3** · — (técnica, PRD §17) · FR-09 (filtros), FR-27, RN-05, RN-22 · ↪ US-033 (AC-14), US-055, US-058 (`published_year` en Milvus) · Diseño: pantalla 08 · `[Pre-S1 resp. 15]`

## Story
Como oncólogo, quiero acotar la evidencia por año de publicación con un control deslizante,
para concentrarme en la evidencia reciente sin perder la opción de ver todo el corpus.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `filtersApplied.publishedFromYear = 2016`, cuando se ejecuta
  el análisis, entonces `rag-orchestrator` solo recupera chunks con `published_year ≥ 2016`
  (en guías NCI PDQ, por su fecha de última actualización) y la Base del análisis registra
  "Evidencia desde 2016". `[Pre-S1 resp. 15]` `[FR-27]`
- **AC-2 (borde · por defecto)** · Sin el parámetro, se aplica el valor por defecto de
  configuración (`EVIDENCE_DEFAULT_YEARS = 10`) y queda registrado igual. `[RN-22]`
- **AC-3 (borde · toda la evidencia)** · Con `publishedFromYear = null` ("Toda la
  evidencia"), no se filtra y la Base lo dice.
- **AC-4 (borde · sin evidencia por el filtro)** · Si el filtro deja cero chunks sobre el
  umbral, entonces la respuesta es `sin_evidencia` y la UI ofrece ampliar la antigüedad.
  `[RN-02]`
- **AC-5 (UI)** · El control deslizante (2000–año actual, atajos 5 y 10 años y "Toda la
  evidencia") es operable con teclado y anuncia el año elegido.

## Contexto técnico
Filtro escalar sobre `published_year` en Milvus (sin reindexar). Pytest con Milvus fingido,
Supertest para el registro en `analysis_basis`, Testing Library para el control.

## INVEST
**Small** ✓ un filtro de extremo a extremo.
**Testable** ✓ cinco AC.

---

## US-238 — Si el primer loop de recuperación no supera el umbral, un segundo loop con el LLM local reescribe la consulta solo para recuperar

> Linear: [L1D-300](https://linear.app/l1der-lab-mjbc/issue/L1D-300)

`FEAT-06b` · Sprint 4 *(comprometida en el refinamiento del S4, `[S4 resp. 12]`)* · Estimación **5** · — (técnica, PRD §17; V-04) · FR-09 (recuperación), IA-02, RN-02 (**enmienda decidida**), RN-03, RN-12, RN-22 · AC-06.1 · ✅ Enmienda a RN-02: resuelta en `docs/PRD.md` por la sesión principal `[S4 resp. 12]` · ⛔ ADR-39 (LLM local) · ↪ US-055, US-113 (no usa LLM; coexiste), US-226 (runner de variantes) · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-03] → US-055 · 🔗 Regresión [RN-10, RN-11, RN-12] → US-049 · 🔗 Medido en: US-133 · **Recorrido principal:** no · **Workaround en el MVP:** la recuperación sigue sin reescritura (US-055); si no hay chunks sobre el umbral el análisis responde "sin evidencia" y el oncólogo reformula a mano

> **Enmienda decidida (usuario, 2026-10-23), a aplicar al PRD en el refinamiento del S4:** RN-02 pasa de "sin chunks sobre el umbral → 'sin evidencia' sin invocar al LLM ni al agente" a **"sin chunks sobre el umbral tras el primer loop → un único segundo loop de reescritura de la consulta con el LLM local; si el segundo loop tampoco supera el umbral → 'sin evidencia' sin invocar al LLM de generación ni al agente"**. Es el único uso del LLM permitido antes de declarar "sin evidencia". Contradice la decisión de US-113 / ADR-45 (2026-10-20: la expansión bilingüe no usa el LLM); no la reemplaza: US-113 sigue resolviéndose con sinónimos del catálogo y/o un modelo de traducción dedicado, y esta historia solo actúa cuando el primer loop ya falló. **Linear: pendiente de sincronizar.**

> **Decidido (usuario, 2026-10-29):** se **compromete en el S4** con 5 pts; deja de estar «por confirmar». La enmienda a RN-02 la aplica la sesión principal en `docs/PRD.md` y el bloqueo queda resuelto. Con 9 AC supera el tope de 8 de la DoR: se registra como **excepción justificada**, igual que US-126, porque es una sola superficie (el loop de reescritura y sus invariantes: disparo, límite, términos del catálogo, pregunta original, privacidad y medición) y partirla separaría el paso de sus propias guardas `[S4 resp. 12]`.

> **Alcance honesto:** el caso del demo del 2026-10-23 («¿Cuándo se considera un inhibidor de CDK4/6 adyutante?») **no dispara este loop**: un chunk superó el umbral y lo que falló fue la copia del `chunkId` (US-236). Esta historia cubre las consultas con **cero** chunks sobre el umbral (ortografía muy degradada, siglas, nombres de fármacos fuera del vocabulario de la pregunta).

## Story
Como oncólogo, quiero que, si mi pregunta no encuentra ninguna evidencia por cómo está
escrita, el sistema la reformule una vez para la búsqueda y lo intente de nuevo, para que
un error de ortografía o una sigla no me deje con un "sin evidencia" que en realidad sí tenía
respuesta en el corpus.

## AC (Given/When/Then)
- **AC-1 (happy path · el segundo loop rescata)** · Dada la pregunta `Q-TYPO-SIN-EVIDENCIA`
  (FX-06b-a: reranker falso con puntaje por debajo del umbral para la pregunta
  original y por encima para su reescritura) y `QUERY_REWRITE_ENABLED = true`, cuando se
  procesa, entonces el primer loop no supera el umbral, se invoca la reescritura una vez, el
  segundo loop recupera al menos un chunk sobre el umbral y el pipeline continúa con la
  generación. `[RN-02 enmendado]` `[FR-09]`
- **AC-2 (invariante · solo tras un primer loop vacío)** · Dado un primer loop con al menos un
  chunk sobre el umbral, cuando se procesa, entonces el LLM de reescritura no se invoca
  (contador de llamadas del LLM falso = 0). `[RN-02 enmendado]`
- **AC-3 (borde · el segundo loop tampoco supera el umbral)** · Dada una pregunta sin respuesta
  en el corpus, cuando el segundo loop tampoco supera el umbral, entonces la respuesta es
  `status = sin_evidencia` con `topRelevanceScore = null`, el LLM de generación y el agente no
  se invocan y el LLM de reescritura se invocó exactamente una vez. `[RN-02 enmendado]`
- **AC-4 (invariante · acotado)** · Dado `QUERY_REWRITE_MAX_ITERATIONS = 1` y un LLM falso que
  siempre propone otra reformulación, cuando se procesa, entonces hay un solo segundo loop y
  no hay un tercero. Los valores `QUERY_REWRITE_ENABLED`, `QUERY_REWRITE_MAX_ITERATIONS` y
  `QUERY_REWRITE_DEADLINE_MS` viven en configuración (RN-22). `[RN-22]`
- **AC-5 (borde · reescritura no disponible o vencida)** · Dado el LLM local caído o vencido el
  `QUERY_REWRITE_DEADLINE_MS`, cuando se procesa una pregunta con el primer loop vacío,
  entonces la respuesta es `sin_evidencia` con la pregunta original (nunca un `5xx` por esto) y
  `meta.retrievalParams.queryRewrite = { applied: false, reason: "no_disponible" }`; sin
  fallback a la nube. `[RN-12]` (asumido: cae a "sin evidencia", no a error)
- **AC-6 (invariante · términos solo del catálogo)** · Dado un LLM falso que propone expandir
  `CDK4/6` con `ribociclib` (presente en el catálogo) y con `farmaco-inventado-x` (ausente),
  cuando se arma la consulta del segundo loop, entonces solo `ribociclib` se usa para recuperar
  y el término ausente se descarta. `[RN-27]`
- **AC-7 (invariante · la pregunta original manda)** · Dado el AC-1, cuando se completa la
  respuesta, entonces la pregunta mostrada y guardada en el `AIAnalysisRecord` es la original,
  el *reranker* puntúa los chunks del segundo loop contra la **pregunta original** (el umbral
  se compara con ese puntaje), y la reescritura solo cambió el vector que se envía a Milvus.
  `[RN-03]` `[RN-06]`
- **AC-8 (invariante · privacidad y proveedor local)** · Dada una pregunta con texto
  sembrado como PII, cuando se invoca la reescritura, entonces el prompt contiene solo la
  pregunta ya enmascarada (sin contexto clínico ni `pseudoPatientId`), el proveedor es local y
  los logs registran recuentos (`rewriteApplied`, `latencyMs`), nunca el texto de la pregunta
  ni de la reescritura. `[RN-10]` `[RN-11]` `[RN-12]`
- **AC-9 (medición · latencia y calidad, OL-06)** · Dada la suite `evaluate` con el runner de
  variantes (US-226) y el LLM local real, cuando se compara el brazo "reescritura" contra la
  referencia, entonces el reporte incluye (a) la latencia añadida por el segundo loop,
  mediana y p95, **solo en las consultas que lo disparan**, (b) el recall@10 y el MRR de esas
  consultas con y sin reescritura, y (c) que "sin evidencia" sobre las preguntas sin respuesta
  se mantiene ≥ 0,90 (el segundo loop no fabrica evidencia). Criterio de adopción: (b) mejora
  con IC pareado que excluye 0, (c) no baja y la latencia añadida p95 ≤ 3 s (asumido; se
  recalibra con la medición); si no se cumple, `QUERY_REWRITE_ENABLED` queda en `false` por
  defecto y la historia se cierra con la medición como entregable. `[OL-06]` `[TBD-02]`

## Contexto técnico
Paso `QueryRewriteStep` dentro de `RAGOrchestratorService` (Hexagonal; puerto `QueryRewriter`
con un Adapter sobre el LLM local en `infrastructure/llm/`), invocado entre el umbral del primer
loop y `_responder_sin_evidencia`. Es un bucle acotado de una iteración (razonar: no hubo
chunks sobre el umbral → actuar: reformular → observar: recuperar de nuevo), no el agente
acotado de FR-30 (Post-MVP), que sigue siendo independiente. La validación de términos contra el
catálogo versionado (`CLINICAL_CATALOG_PATH`) es regla pura de `domain/`. El prompt de
reescritura es un prompt nuevo con su propia versión: la suite `evaluate` es obligatoria. TDD
estricto en la regla de disparo, el límite de iteraciones y la validación de términos;
Pytest con adapters falsos (`LLM_PROVIDER=fake` con contador de llamadas) y FX-06a-a/FX-06a-b
ampliados. El contrato OpenAPI cambia de forma compatible (`meta.retrievalParams.queryRewrite`).

## INVEST
**Small** ✓ un paso condicional sobre un pipeline existente, con un límite fijo. **Excepción a la DoR (9 AC > 8), aceptada:** una sola superficie, el loop de reescritura y sus invariantes; no se parte `[S4 resp. 12]`.
**Testable** ✓ nueve AC: siete con adapters falsos y una medición en `evaluate`.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| V-04 / Q-08 | PRD §17: la recuperación híbrida y los filtros del S3 no tienen HU | — | Q-08: historias técnicas con HU "— (técnica, PRD §17)" (US-112, US-113); US-114 a US-116 se trazan a HU-03 y HU-18 |
| — | readme OL-03 (S1): `filtersApplied` se valida y persiste, sin aplicarse | readme §5.0 S3 KR2: filtros conectados a datos reales | S3 (US-114), sin cambio de contrato |
| Slicing v2 | PRD FR-09 y §14 S3: búsqueda híbrida, expansión bilingüe y filtros en el S3; AC-05.1 y AC-06.1 (parte S3) | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): híbrida, bilingüe y filtros `si-hay-capacidad`; faltantes en la consulta en el S5 | AC-05.1 (filtros reales) y la parte S3 de AC-06.1 quedan en historias `si-hay-capacidad` |
| C-Pre5 | Contrato de readme §4.1: `filtersApplied` sin filtro de antigüedad | Usuario, 2026-10-11: filtro por año de publicación | Usuario (`[Pre-S1 resp. 15]`): `publishedFromYear` en US-033 (AC-14) y US-220 en el S5 |
| S3-2026-10-23 | Dependencia del *sparse* poblado en US-117 | Refinamiento del S3 (2026-10-23): US-117 partida en US-117a y US-117b | El *sparse* de la semilla y el versionado son de US-117b (S3) `[S3 resp. 2]` |
| S4-2026-10-29 | US-238 «propuesta, capacidad por confirmar» y ⛔ enmienda a RN-02 pendiente de aplicar al PRD | Refinamiento del S4 (usuario, 2026-10-29): comprometida en el S4 con 5 pts; la sesión principal aplica la enmienda en el PRD; excepción a la DoR por 9 AC `[S4 resp. 12]` | Decisión del usuario |
