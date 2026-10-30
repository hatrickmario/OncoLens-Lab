# FEAT-06b — Recuperación híbrida, expansión bilingüe, filtros reales y faltantes en la consulta

> Linear: [L1D-17](https://linear.app/l1der-lab-mjbc/issue/L1D-17)

**Talla:** L · **Sprint:** `si-hay-capacidad` (US-113…US-115) · 4 (US-112: híbrida detrás de `RETRIEVAL_MODE`, `[S4 resp. 17]`; US-238: reescritura condicional de la consulta, comprometida, `[S4 resp. 12]`) · 5 (US-116) · **Capacidad:** CAP-06 (AC-06.1 parte S3: híbrida, expansión, filtros) · CAP-05 (AC-05.1: fuentes y filtros reales) · CAP-04 (AC-04.3: faltantes como "desconocido" en Backend 2) · **Recorrido principal:** sí (US-116) · no (US-112…US-115, US-238)
**Requisitos:** FR-09 (parte S3: *sparse*, filtros, expansión bilingüe; técnica sin HU, Q-08) · IA-02, IA-03 · RN-03, RN-05 (regresiones) · RN-02 (regresión; **enmienda decidida el 2026-10-23 en US-238**) · RN-11 (regresión: notas enmascaradas)
**Evidencia:** [→ PRD §5 FR-09], [→ PRD §6 RN-02, RN-03, RN-05, RN-11], [→ PRD §12 Idioma, Recuperación], [→ PRD §18.3.4 AC-04.3], [→ PRD §18.3.5 AC-05.1], [→ PRD §18.3.6 AC-06.1, M-06.1], [→ readme §5.0 S3 KR1, KR2 ("enmascaramiento de las notas enviadas al LLM")], [→ readme §4.1 `sourcesSelected`, `filtersApplied`], [→ readme §4.2 `ClinicalContext.missingCriticalData`, `/rag/query`], [→ readme §6 OL-02 (no incluye: *sparse*, filtros), OL-04 (no incluye: selectores)], [→ readme §3.3 #10], [→ backlog/01-requisitos.md §10 V-04, §14 Q-08], [→ docs/AS-IS.md P5, JTBD 3]
**Dependencias:** ↪ US-055 (pipeline dense), US-052 (contexto), US-117b (*sparse* poblado; antes US-117), FEAT-04 US-006 (faltantes en el contexto) · ⛔ ADR-39 (modelo *sparse* y fusión; los AC usan adapters falsos) · 🔗 Medido en: US-133 (M-06.1 sin retroceso) · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-05] → US-055 · 🔗 Regresión [RN-11] → US-049
**Valor:** el oncólogo busca con términos exactos (un fármaco, un gen) que la búsqueda semántica sola pierde, en español sobre evidencia mayoritariamente en inglés, y necesita acotar a guías o ensayos (P5, JTBD 3). Con esta Feature la búsqueda combina ambas señales, se expande al otro idioma, respeta los filtros que el oncólogo ve en el panel y sabe qué datos del paciente faltan.
**Workaround en el MVP (US-113…US-115):** ADR-39 elige *embeddings* multilingües; la suite mide recall es→en ≥ 0,70 (US-072). US-112 y su medición (US-133, FEAT-T5b) entran en el S4; mientras US-133 no descarte un retroceso, `RETRIEVAL_MODE = dense` (US-055) sigue siendo el valor por defecto `[S4 resp. 17]`.
**Stories:** US-113, US-114, US-115, US-248 (13 puntos, `si-hay-capacidad`) · US-112, US-238 (10 puntos, S4) · US-116, US-220 (6 puntos, S5)

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

`FEAT-06b` · Sprint 4 *(desde `si-hay-capacidad`, `[S4 resp. 17]`)* · Estimación **5** · — (técnica, PRD §17; V-04) · FR-09 (S3: *sparse*), IA-03, RN-03, RN-05, RN-22 · AC-06.1 (híbrida) · ADR-39 (modelo *sparse*, decidido) · ADR-45 (brazos A2 y A2b) · ↪ US-055, US-117b · 🔗 Regresión [RN-02] → US-055 · 🔗 Regresión [RN-05] → US-055 · 🔗 Medido en: US-133 · **Recorrido principal:** no · **Valor por defecto:** `RETRIEVAL_MODE = dense` (recuperación de US-055) hasta que US-133 descarte un retroceso

> **Enmienda decidida (usuario, 2026-10-20, ADR-45):** la expansión bilingüe **no invoca al LLM local** (RN-02 se mantiene). Se resuelve con sinónimos del catálogo y/o un modelo de traducción dedicado, según el resultado de los brazos A3 y A4 de ADR-45. Los AC se ajustan en el refinamiento de la historia; el ID no cambia. **Linear: pendiente de sincronizar.**

> **Decidido (usuario, 2026-10-27, desde US-117b):** el *sparse* de la consulta sale del **mismo BGE-M3, los mismos pesos y el mismo `SPARSE_VECTOR_SOURCE`** que el del corpus (`reindex-sparse` y la ingesta lo escriben con esa configuración); si cabe, test de consistencia índice/consulta con la misma configuración. La búsqueda híbrida vive dentro de `RAGOrchestratorService`, no en el CLI ni en el agente.

> **Refinamiento del S4 (usuario, 2026-10-30):** entra en el S4 `[S4 resp. 17]` `[S4 resp. 18]`.
> - **Detrás de un flag, `dense` por defecto.** `RETRIEVAL_MODE` admite `dense | hibrida` (los mismos valores que el enum `retrievalMode` del contrato) y su valor por defecto es `dense`, el comportamiento actual (ADR-45, «Configuración»). La demo usa `hibrida` solo si US-133 no muestra retroceso frente a `dense`.
> - **Dos fusiones, RRF por defecto.** `RETRIEVAL_FUSION = rrf | ponderada`: RRF con `RRF_K = 60` (brazo A2 de ADR-45) o suma ponderada denso/*sparse* con `HYBRID_SPARSE_WEIGHT = 0,3` (brazo A2b, pesos del artículo de BGE-M3). Los hiperparámetros salen de la fuente y no se barren (ADR-45 P1).
> - La enmienda de ADR-45 que figura arriba (expansión bilingüe sin LLM) es de US-113, que sigue en `si-hay-capacidad`.

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
  hibrida`, `RETRIEVAL_FUSION = rrf` y `RRF_K = 60` en configuración, cuando se procesa
  cualquier consulta, entonces `meta.retrievalParams` registra `retrievalMode = hibrida`,
  la fusión y su parámetro, y quedan persistidos en `retrieval_params`. `[RN-22]`
  `[AC-T1.4]` `[S4 resp. 18]`
- **AC-6 (borde · valor por defecto y fusión ponderada)** · Dado `RETRIEVAL_MODE` sin
  definir, cuando se procesa `Q-KEYWORD`, entonces el recuperador *sparse* falso registra
  cero llamadas, `retrievalMode = dense` y `ch-m2-1` no llega al *reranker*; y dados
  `RETRIEVAL_MODE = hibrida`, `RETRIEVAL_FUSION = ponderada` y `HYBRID_SPARSE_WEIGHT = 0,3`,
  cuando se procesa `Q-KEYWORD`, entonces `ch-m2-1` llega al *reranker* y
  `meta.retrievalParams` registra la fusión ponderada y su peso. `[RN-22]` `[ADR-45]`
  `[S4 resp. 17]` `[S4 resp. 18]`

## Contexto técnico
`MilvusRepository.hybrid_search()` con el mismo filtro escalar (`is_current`,
`cancer_type_tags`, `population`, `source_type`) en ambas ramas y fusión de candidatos
antes del *reranker*; `relevance_score` sigue saliendo solo del *reranker*
`[readme §6.1 #4]`. Depende de que el *sparse* esté poblado (US-117b). La fusión es una
regla pura en `domain/` (RRF y ponderada) y el *sparse* de la consulta sale del mismo
BGE-M3 y del mismo `SPARSE_VECTOR_SOURCE` que el del corpus (decisión del 2026-10-27).
**Contrato:** cambio aditivo en `retrievalParams` (ADR-26) con la fusión y su parámetro
(`null` en modo `dense`), primero en el `openapi.yaml` de `rag-orchestrator`
(`sync-contracts`). Tests: Pytest con recuperadores falsos y un test contra Milvus de
test en la CI.

## INVEST
**Small** ✓ una búsqueda adicional y una fusión antes de un paso existente.
**Testable** ✓ seis tests con recuperadores falsos.

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

## US-248 · ADR-48 — Cuando una rama de la recuperación híbrida no devuelve candidatos, la fusión conserva la calidad de la otra o la degrada

> Linear: [L1D-304](https://linear.app/l1der-lab-mjbc/issue/L1D-304)

`FEAT-06b` · `si-hay-capacidad` *(nueva, usuario, 2026-10-30, desde la Q-1 de L1D-109)* · Estimación **2** · — (ADR, investigación) · FR-09 (S3: *sparse*), IA-03, RN-03, RN-05, RN-22 · ADR-45 (brazos A2 y A2b, P1 preinscripción) · Dueño: Ingeniería · ↪ US-112 (fusión implementada), US-133 (datos de la medición) · 🔗 Bloquea: poner `RETRIEVAL_MODE = hibrida` por defecto (no bloquea el MVP ni el G-Demo) · **Recorrido principal:** no

> **Decidido (usuario, 2026-10-30, Q-1 de L1D-109):** en el S4 se mantiene el **fallo cerrado** (`503 RETRIEVAL_UNAVAILABLE`) cuando la pregunta no produce ningún término con peso, sin degradar en silencio a `dense`; el modo `hibrida` no es el predeterminado y solo lo usa la medición de US-133. Esta historia investiga la pregunta de fondo antes de cambiar ese comportamiento. **Linear: L1D-304.**

## Story
Como responsable técnico, quiero saber si, cuando una de las dos ramas de la recuperación
híbrida no devuelve candidatos, la fusión (RRF o suma ponderada) conserva la calidad de
ordenación de la rama restante o introduce una degradación no buscada, para decidir con
datos si la consulta híbrida debe fallar cerrada, degradar a `dense` con constancia en
`meta`, o fusionar de otra forma, antes de que `hibrida` pase a ser el modo por defecto.

## Pregunta de investigación
*Cuando un componente de recuperación no devuelve candidatos, ¿el mecanismo de fusión
híbrida conserva la calidad de ordenación del otro, o introduce una degradación no
buscada?*

Se separan **tres casos** que hoy se confunden (el código de US-112 solo trata el primero
como fallo):

| Caso | Qué ocurre | Tratamiento actual (US-112) |
|---|---|---|
| **A. La consulta no produce vector *sparse*.** La pregunta no tiene ningún término con peso. | El codificador lanza `FalloDeInferencia`; la consulta híbrida devuelve `503 RETRIEVAL_UNAVAILABLE`. | Falla cerrado. Es un límite del codificador, no ausencia de evidencia. |
| **B. El *sparse* existe pero Milvus no devuelve ningún chunk.** | `search_sparse` devuelve `[]`; la fusión recibe una rama vacía. | Sin error; el log registra `sparse=0`. |
| **C. La rama *sparse* devuelve muy pocos candidatos (1 a 3).** | Pocos chunks suben posiciones en la lista fusionada. | Sin tratamiento especial. |

## Hipótesis (a preinscribir, ADR-45 P1; ninguna está verificada)
- **H1 · RRF con rama vacía.** El orden fusionado coincide con el de `dense`, porque cada
  candidato recibe solo `1/(k + posición_dense)`, monótono en la posición.
- **H2 · Suma ponderada con rama vacía.** El orden coincide con el de `dense` solo si la
  normalización de puntajes no depende de la rama vacía; hay que comprobar cómo se
  normalizan los dos puntajes en la implementación.
- **H3 · Rama casi vacía (caso C).** Es el riesgo real: unos pocos candidatos *sparse*
  que no están en `dense` pueden desplazar candidatos de `dense` antes del recorte a
  `RETRIEVAL_TOP_K` y del reranker, y bajar el acierto@10 del conjunto final.
- **H4 · Frecuencia.** El caso A es raro con preguntas reales; el conjunto dorado de
  US-133 permite contarlo.

## AC (Given/When/Then)
- **AC-1 (preinscripción)** · Dado el protocolo de ADR-45 P1, cuando se vaya a medir,
  entonces se commitea antes de ejecutar un documento con las hipótesis H1 a H4, los
  brazos, la métrica primaria (acierto@10 sobre el conjunto final de chunks tras el
  reranker; MRR secundaria), la comparación emparejada con IC por *bootstrap*, el margen de
  equivalencia y la regla de decisión. Los hiperparámetros salen de la fuente (RRF
  k = 60; pesos 1 : 0,3) y no se barren. `[ADR-45 P1]`
- **AC-2 (borde · rama vacía)** · Dado el conjunto dorado de US-133 y los mismos modelos,
  cuando se fuerce la rama *sparse* a 0 candidatos con RRF y con suma ponderada, entonces
  se informa si el orden y las métricas del conjunto final coinciden con `dense`, y por
  qué (H1, H2). `[FR-09]`
- **AC-3 (borde · rama casi vacía)** · Dado el mismo conjunto, cuando se fuerce la rama
  *sparse* a 1, 2 y 3 candidatos que no están en `dense`, entonces se informa la
  variación de acierto@10 y de MRR frente a `dense` y si el recorte previo al reranker
  expulsa candidatos de `dense` (H3). `[RN-03]`
- **AC-4 (frecuencia del caso A)** · Dado el conjunto dorado, cuando se codifiquen las
  preguntas, entonces se cuenta cuántas no producen ningún término con peso (H4). Si el
  recuento es 0, el ADR lo dice y no lo extrapola a preguntas reales. `[IA-03]`
- **AC-5 (decisión)** · Dado el resultado, cuando se cierre el ADR, entonces
  `docs/architecture/adr/ADR-48-fusion-con-rama-vacia.md` elige una opción: **(1)** mantener
  el fallo cerrado, **(2)** degradar a `dense` con constancia en `meta` (campo de modo
  efectivo, cambio de contrato aditivo con ADR-26) o **(3)** otra fusión; y registra las
  alternativas descartadas con su evidencia. `[RN-22]`
- **AC-6 (regresión)** · Dado el ADR aceptado, cuando implique cambiar el código, entonces
  se abre una historia aparte y esta no modifica `app/` ni los contratos. La
  investigación no cambia `RETRIEVAL_MODE = dense` por defecto. `[RN-02]` `[RN-05]`

## Contexto técnico

| Opción | A favor | En contra |
|---|---|---|
| **1. Mantener el fallo cerrado** | Sin cambio de contrato; la medición de US-133 queda limpia | Una pregunta degenerada falla aunque `dense` funcionaría; mezcla «sin señal léxica» con «motor caído» |
| **2. Degradar a `dense` con constancia** | La consulta responde; el orden es el de `dense` si H1 y H2 se cumplen | Exige un campo de modo efectivo en el contrato (versión nueva, ADR-26); hay que excluir esas consultas de la comparación |
| **3. Fusión que ignora la rama vacía o casi vacía** | Cubre el caso C si H3 se confirma | Más lógica y un hiperparámetro nuevo que justificar |

Datos: solo sintéticos y corpus público (RN-14); no hay datos reales. No usa el LLM (RN-02).
La implementación de la fusión vive en `RAGOrchestratorService` (US-112); la medición reutiliza
la corrida de US-133 con una rama forzada, sin reindexar.

## Non-goals
No cambiar el modo por defecto ni la lógica de la fusión (si el ADR lo pide, es otra
historia). No barrer `RRF_K` ni `HYBRID_SPARSE_WEIGHT`. No decidir el modelo *sparse*
(ADR-39) ni los brazos de ADR-45.

## INVEST
**Small** ✓ una medición acotada sobre datos que ya genera US-133 y un documento.
**Testable** ✓ los AC verifican la preinscripción, las cifras reportadas y el contenido del ADR.

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
| S4-2026-10-30 | US-112 `si-hay-capacidad`, con `mode = hybrid` en el AC-5 y la fusión sin decidir (⛔ ADR-39) | Refinamiento del S4 (usuario, 2026-10-30): entra en el S4 detrás de `RETRIEVAL_MODE` con `dense` por defecto; RRF (k = 60) por defecto y suma ponderada (0,3) como alternativa, ambas de ADR-45; el valor del modo sigue el enum del contrato (`hibrida`) `[S4 resp. 17]` `[S4 resp. 18]` | Decisión del usuario |
