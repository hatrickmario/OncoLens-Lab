# FEAT-06c — Corpus científico: semilla con licencias (S1) e ingesta con metadatos (S3)

> Linear: [L1D-18](https://linear.app/l1der-lab-mjbc/issue/L1D-18)

**Talla:** XL (Feature completa; propone división por sprint) · parte S1: **M** · parte S3: **L** · **Sprint:** 1 (semilla y esquema) · 4 (ingesta, metadatos y corpus mínimo) · `si-hay-capacidad` (US-119, `CorpusRelease`) · **Capacidad:** CAP-06 (prerrequisito de CAP-07, CAP-08 y CAP-09) · **Recorrido principal:** sí
**Requisitos:** FR-19 (S1: semilla y esquema de metadatos; S3: ingesta como entregable) · RN-21 (dueña) · RN-05 (parte de versionado: el histórico nunca se borra; la recuperación de chunks vigentes es de US-055) · M-08.3, M-08.4 (S3, medidos en US-132) · TBD-20 (CAL, US-118) · ADR-36 (S3)
**Evidencia:** [→ PRD §5 FR-19], [→ PRD §6 RN-05, RN-21, RN-25], [→ PRD §17 FR-19 → OL-02], [→ PRD §18.3.6 AC-06.1], [→ PRD §18.3.8 M-08.3, M-08.4], [→ readme §6 OL-02 (tareas 2, 7; alcance complementario: catálogo)], [→ readme §3.1 modelo del corpus], [→ readme §3.3 #5, #10, #17, #30, #36], [→ readme §1.4 paso 7], [→ backlog/02-adrs.md ADR-36, ADR-39]
**Dependencias:** ↪ US-033 (esquema congelado), US-034 (Milvus), US-040 (rol `rag_corpus`) · ⛔ ADR-39 (dimensión del vector dense y origen del sparse: US-058 AC-2; *embeddings* reales para indexar: US-059 AC-1) · ADR-36 no bloquea el S1 (licencia verificada documento a documento) · 🔗 Consumida por: US-055 · ⛔ ADR-36 (S4: US-117, US-120) · 🔗 Medido en (S5): US-132 (M-08.3, M-08.4)
**Valor:** el oncólogo solo puede confiar en una opción si la fuente es pública, con licencia que permite usarla, vigente y verificable (P5, P8, P12). La semilla del S1 permite demostrar el recorrido con evidencia real de acceso abierto de mama y próstata, sin NCCN ni ESMO, y deja el esquema de metadatos listo para la aplicabilidad.
**Workaround en el MVP (US-119):** la fecha de corte del corpus vive en configuración `[RN-22]` y la Base del análisis la toma de ahí.
**Stories:** parte S1: US-058, US-059 (10 puntos) · parte S4: US-117, US-118, US-120 (16 puntos) · US-119 (3 puntos, `si-hay-capacidad`) · total 29 puntos

> **Propuesta de división (talla XL).** Publicar como **06c-S1 Semilla y esquema** (US-058, US-059) y **06c-S3 Ingesta** (US-117…US-120), sin cambiar IDs, para que cada una cierre en su milestone.

## Fixtures

- **FX-06c-a · Manifiesto de semilla de test** (`apps/rag-orchestrator/tests/fixtures/seed-manifest.yaml`, textos sintéticos breves con metadatos de fuentes públicas):
  - `t-ok-1` — mama, `NCI PDQ`, `license_class = dominio_publico`, sin `population_criteria` estructurados.
  - `t-ok-2` — próstata, `ClinicalTrials.gov`, `license_class = dominio_publico`, con `population_criteria` estructurados (`estadio: metastasico`, `linea: primera`).
  - `t-nd` — mama, licencia `CC BY-ND`.
  - `t-sin-licencia` — mama, sin licencia.
  - `t-nccn` — `source_name = "NCCN"`, con licencia declarada.
  - `t-ok-1-v2` — mismo `version_group_id` que `t-ok-1`, con contenido y `checksum` distintos (para el test de versión nueva).
  - `EMBEDDING_DIM = 8` y adapter de *embeddings* falso determinista en los tests.

---

## Parte S1

## US-058 — El catálogo del corpus y la colección de Milvus se crean con su esquema final

> Linear: [L1D-114](https://linear.app/l1der-lab-mjbc/issue/L1D-114)

`FEAT-06c` · Sprint 1 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (esquema de metadatos), RN-21 · ↪ US-033, US-034, US-040 · ⛔ Bloqueada por: ADR-39 (solo AC-2: valor real de la dimensión)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** US-040 (`REVOKE ALL` y tests de *permission denied*) llega en el S2. En el S1 el rol `rag_corpus` lo crean los scripts de US-035 y solo hay datos sintéticos; las restricciones del rol se verifican desde el S2.

## Story
Como equipo de desarrollo, quiero crear desde el S1 el catálogo del corpus y la
colección de Milvus con su esquema final, incluidos los metadatos de población y el
vector sparse que se usarán después, para no tener que recrear la colección ni
reingestar el corpus cuando lleguen la búsqueda híbrida y la aplicabilidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PostgreSQL con el schema `corpus` vacío y Milvus de
  test, cuando se ejecuta `alembic upgrade head` como `rag_corpus` y el inicializador de
  la colección, entonces existen `corpus.corpus_document` (con `license`,
  `license_class`, `population_criteria` `jsonb`, `metadata_source`, `study_design`,
  `trial_phase`, `primary_endpoint`, `sample_size`, `guideline_version`,
  `version_group_id`, `is_current`, `superseded_at` y `status`),
  `corpus.corpus_release` y `corpus.corpus_release_document`, y la colección
  `corpus_chunks` con `dense_vector`, `sparse_vector` y los campos denormalizados
  `source_type`, `language`, `cancer_type_tags`, `population`, `study_design`,
  `published_year` e `is_current`. `[OL-02]` `[readme §3.1]` `[ADR-10]`
- **AC-2 (borde · dimensión desde configuración)** · Dado `EMBEDDING_DIM=8`, cuando se
  crea la colección, entonces `dense_vector` tiene dimensión 8 y una inserción con un
  vector de dimensión 1024 falla. `[ADR-10]` · ⛔ Bloqueada por: ADR-39 (dimensión real)
- **AC-3 (borde · sparse sin poblar)** · Dado un chunk con `dense_vector` y sin datos
  sparse, cuando se inserta y se busca por dense, entonces la inserción y la búsqueda
  funcionan. `[OL-02]` (asumido: riesgo declarado en OL-02; si la versión de Milvus no
  lo admite, se puebla el sparse desde el S1 sin cambiar el esquema)
- **AC-4 (borde · licencia obligatoria)** · Dado un `INSERT` en `corpus_document` con
  `license` nulo, o con `license_class = "cc_by_nd"`, cuando se ejecuta, entonces falla
  por restricción (`NOT NULL` o `CHECK`/enum). `[RN-21]` `[FR-19]`
- **AC-5 (borde · inicialización idempotente)** · Dada la colección ya creada con
  chunks, cuando se ejecuta de nuevo el inicializador, entonces no la borra ni la
  recrea y el número de entidades no cambia. (asumido)

## Contexto técnico
`rag-orchestrator/app/infrastructure/catalog/` (Alembic, rol `rag_corpus`) y
`infrastructure/milvus/` (`MilvusRepository.ensure_collection()` con índice escalar sobre
`is_current` y `cancer_type_tags`). Enum `status`: `pendiente | normalizado | embebido |
error | rechazado_licencia`; `license_class`: `dominio_publico | cc_by | cc_by_sa |
cc_by_nc`. Tests: Pytest contra PostgreSQL y Milvus de test en la CI.

## Non-goals
Ingesta automatizada y reanudable (S3). Poblar el sparse y búsqueda híbrida (S3).

## INVEST
**Small** ✓ una migración Alembic y un inicializador de colección.
**Testable** ✓ cinco tests de integración contra servicios de test.

---

## US-059 — El corpus semilla de mama y próstata se carga solo con documentos de licencia aceptada

> Linear: [L1D-115](https://linear.app/l1der-lab-mjbc/issue/L1D-115)

`FEAT-06c` · Sprint 1 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (semilla), RN-21 (dueña), RN-05 (versionado), RN-25 (metadatos `no_disponible`) · AC-06.1 (corpus abierto) · ↪ US-058 · ⛔ Bloqueada por: ADR-39 (solo AC-1 con *embeddings* reales; los tests usan el adapter falso) · 🔗 Relacionada: US-007 · ADR-36 (lista final de fuentes, no bloquea)

## Story
Como oncólogo, quiero que el corpus con el que se analiza a mi paciente contenga solo
fuentes públicas con licencia que permite usarlas y con sus metadatos registrados, para
que cada cita que reciba sea legítima y verificable.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el manifiesto real de la semilla (`data/raw/seed/manifest.yaml`,
  ~10 documentos de mama y próstata con licencia aceptada verificada uno a uno), cuando
  se ejecuta `python -m app.scripts.load_seed_corpus`, entonces cada documento queda con
  `status = embebido`, sus chunks están en `corpus_chunks` con `is_current = true` y
  `source_type`, `language` y `cancer_type_tags` copiados del documento, y existe un
  `CorpusRelease` con `cutoff_date`, `excluded_sources = ["NCCN", "ESMO"]` y una fila en
  `corpus_release_document` por documento. `[OL-02]` `[FR-19]` `[RN-21]`
- **AC-2 (borde · licencia no aceptada o ausente)** · Dados `t-nd` y `t-sin-licencia`
  (FX-06c-a), cuando se cargan, entonces quedan con `status = rechazado_licencia`, no
  generan ningún chunk en Milvus y el cargador continúa con el resto del manifiesto.
  `[RN-21]` `[FR-19]`
- **AC-3 (borde · fuente excluida)** · Dado `t-nccn`, cuando se carga, entonces se
  rechaza con motivo `fuente_excluida` aunque declare licencia, y no genera chunks.
  `[RN-21]` `[D-09]`
- **AC-4 (borde · metadatos)** · Dados `t-ok-1` y `t-ok-2`, cuando se cargan, entonces
  `t-ok-2` tiene `population_criteria` con `estadio` y `linea` y
  `metadata_source = fuente_estructurada`, y `t-ok-1` tiene cada criterio de población en
  `no_disponible` (en el S1 no hay extracción con LLM). `[FR-19]` `[RN-25]`
- **AC-5 (borde · recarga idempotente)** · Dada la semilla ya cargada, cuando se ejecuta
  de nuevo el cargador con el mismo manifiesto, entonces el número de documentos y de
  chunks no cambia (mismo `checksum`). (asumido)
- **AC-6 (invariante · el histórico no se borra)** · Dado `t-ok-1` cargado, cuando se
  carga `t-ok-1-v2`, entonces `t-ok-1-v2` queda `is_current = true`, `t-ok-1` queda
  `is_current = false` con `superseded_at`, sus chunks quedan `is_current = false`, y el
  número de filas de `corpus_document` aumenta en 1 (nada se borra). `[RN-05]` `[ADR-5]`

## Contexto técnico
Cargador manual (no `IngestionPipelineService`, que es del S3): normalización mínima,
*chunking*, *embedding* dense e inserción. La validación de licencia por documento usa
la lista de licencias aceptadas de #36 y la lista de fuentes excluidas, ambas en
configuración `[RN-22]`; ADR-36 la completa sin bloquear la semilla. En `data/raw/seed/`
solo textos públicos con licencia que permite redistribuirlos; si una licencia aceptada
no permite redistribuir el texto en el repo, el manifiesto guarda la URL y el cargador
lo descarga (nunca PHI en `data/`, RN-14). Tests: Pytest con FX-06c-a y adapter de
*embeddings* falso (AC-2 a AC-6); AC-1 es un smoke test con el manifiesto real y los
modelos de ADR-39.

## Non-goals
`extraido_verificado` (extracción de metadatos con LLM + NLI + muestra humana) y ≥ 20
documentos por tipo (S3). Traducción de citas (V-10).

## INVEST
**Small** ✓ un script de carga sobre un esquema ya creado.
**Testable** ✓ seis tests sobre un manifiesto de fixtures con resultados conocidos.

---

## Parte S3

## Fixtures (S3)

- **FX-06c-b · Manifiesto de ingesta de test** (`apps/rag-orchestrator/tests/fixtures/ingest-manifest.yaml`, textos sintéticos breves con metadatos de fuentes públicas): `i-ct-1` (próstata, `ClinicalTrials.gov`, `dominio_publico`, con criterios de elegibilidad estructurados: estadio metastásico, castración resistente, ECOG 0–1); `i-lit-1` (mama, PubMed Central OA, `cc_by`, ensayo fase III descrito solo en texto: "HER2-positive", "stage I–III", n = 500); `i-lit-2` (mama, `cc_by`, sin datos de población en el texto); `i-gl-1` (mama, guía pública, `dominio_publico`, `guideline_version = "2026.1"`); `i-nd` (`cc_by_nd`); `i-esmo` (`source_name = "ESMO"`); `i-gl-1-v2` (nueva versión de `i-gl-1`).
- LLM falso de metadatos: para `i-lit-1` devuelve `study_design = eca`, `trial_phase = III`, `sample_size = 500`, `estadio = I–III`, `her2 = positivo` y un `primary_endpoint` inventado; NLI falso: `entailment` para todo salvo el `primary_endpoint` (`neutral`).
- `CORPUS_METADATA_SAMPLE_PCT = 10` y `CORPUS_METADATA_SAMPLE_SEED` fijo en la configuración de test `[RN-22]` `[TBD-20]`.

---

## US-117 — La ingesta del corpus es reanudable, indexa *dense* y *sparse*, versiona sin borrar y rechaza lo que no tiene licencia

> Linear: [L1D-116](https://linear.app/l1der-lab-mjbc/issue/L1D-116)

`FEAT-06c` · Sprint 4 · Estimación **8** · — (técnica, PRD §17; OL-02) · FR-19 (ingesta como entregable), RN-05, RN-21 · AC-06.1 (corpus abierto) · ⛔ ADR-36 (lista final de fuentes y regla de PubMed sin licencia) · ⛔ ADR-39 (modelos *dense* y *sparse*) · ↪ US-058, US-059, US-082 (`TextExtractionService`) · 🔗 Regresión [RN-21] → US-059 · 🔗 Regresión [RN-05] → US-059 · 🔗 Consumida por: US-112 (*sparse* poblado)

## Story
Como responsable del corpus, quiero ingerir lotes de documentos públicos de forma
automática y reanudable, con versionado y control de licencia, para ampliar la evidencia
disponible sin borrar la historia ni dejar entrar una fuente que no podemos usar.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado FX-06c-b, cuando se ejecuta
  `python -m app.scripts.ingest --manifest tests/fixtures/ingest-manifest.yaml`, entonces
  `i-ct-1`, `i-lit-1`, `i-lit-2` e `i-gl-1` quedan `embebido`, cada chunk en Milvus tiene
  `dense_vector` y `sparse_vector` poblados, `is_current = true` y los metadatos
  denormalizados copiados del documento. `[FR-19]` `[OL-02]` `[readme §3.1]`
- **AC-2 (borde · reanudable)** · Dada una ingesta interrumpida a la fuerza después del
  segundo documento, cuando se ejecuta de nuevo, entonces solo procesa los restantes y el
  número de chunks por documento es el mismo que en una ingesta sin interrupción.
  `[FR-19]`
- **AC-3 (borde · licencia y fuente excluida)** · Dados `i-nd` e `i-esmo`, cuando se
  ingieren, entonces quedan `rechazado_licencia` y con motivo `fuente_excluida`
  respectivamente, sin chunks, y la ingesta continúa. `[RN-21]` `[FR-19]`
- **AC-4 (invariante · versionado sin borrado)** · Dado `i-gl-1` ingerido, cuando se
  ingiere `i-gl-1-v2`, entonces `i-gl-1` queda `is_current = false` con `superseded_at`,
  sus chunks `is_current = false`, y el total de filas de `corpus_document` crece en 1.
  `[RN-05]` `[ADR-5]`
- **AC-5 (borde · *sparse* de la semilla)** · Dada la semilla del S1 con chunks sin
  `sparse_vector`, cuando se ejecuta `ingest --reindex-sparse`, entonces todos los chunks
  vigentes tienen `sparse_vector` y sus `chunk_id` y `dense_vector` no cambian.
  `[OL-02]` `[FR-19]`
- **AC-6 (borde · fallo aislado)** · Dado un documento cuya normalización falla, cuando se
  ingiere el lote, entonces ese queda `error`, los demás terminan y el resumen final lista
  los contadores por estado. (asumido)

## Contexto técnico
`IngestionPipelineService` en `rag-orchestrator/application/` (normalización →
*chunking* → *embedding* dense y sparse → inserción → estado), con *checkpoint* por
documento en `corpus_document.status` y `checksum`. Reutiliza `TextExtractionService`
(US-082) en proceso para los PDF `[readme §4.2]`. Validación de licencia y fuentes
excluidas con las listas en configuración (ADR-36) `[RN-22]`. Corre con el rol
`rag_corpus` y nunca toca schemas clínicos `[SEG-06]`. Tests: Pytest con FX-06c-b,
*embeddings* falsos y Milvus de test en la CI.

## INVEST
**Small** ✓ 8 es el techo; si se complica, dividir en US-117a (pipeline y reanudación) y US-117b (versionado y *sparse* de la semilla).
**Testable** ✓ seis tests sobre estados, chunks y filas.
*(Estimable ⚠ el 8 asume ADR-36 cerrado ≤ S1 y ADR-39 con el modelo *sparse* fijado.)*

---

## US-118 — Los metadatos de población, diseño y endpoint se toman de la fuente o se extraen y verifican, y una muestra se revisa a mano

> Linear: [L1D-117](https://linear.app/l1der-lab-mjbc/issue/L1D-117)

`FEAT-06c` · Sprint 4 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (metadatos estructurados, `extraido_verificado`), RN-25 · TBD-20 (CAL) · ⛔ ADR-39 (LLM y NLI) · ↪ US-117 · 🔗 Regresión [RN-25] → US-127 · 🔗 Consumida por: US-122 (valor del estudio) · 🔗 Medido en: US-132 (M-08.3, M-08.4)

## Story
Como oncólogo, quiero que la población, el diseño y el endpoint de cada estudio salgan
de la fuente o de una extracción verificada contra su texto, para que la comparación con
mi paciente no se apoye en datos inventados.

## AC (Given/When/Then)
- **AC-1 (happy path · fuente estructurada)** · Dado `i-ct-1`, cuando se ingiere,
  entonces `population_criteria` trae los criterios de elegibilidad de la fuente,
  `metadata_source = fuente_estructurada` y el LLM de metadatos registra cero
  invocaciones para ese documento. `[FR-19]`
- **AC-2 (borde · extracción verificada)** · Dado `i-lit-1`, cuando se ingiere, entonces
  `study_design = eca`, `trial_phase = III`, `sample_size = 500` y
  `population_criteria` con estadio "I–III" y HER2 "positivo", con
  `metadata_source = extraido_verificado`. `[FR-19]` `[R-16]`
- **AC-3 (borde · no pasa el NLI)** · Dado el `primary_endpoint` inventado de `i-lit-1`,
  cuando se verifica, entonces queda `no_disponible` y los demás metadatos se conservan.
  `[FR-19]` `[RN-25]`
- **AC-4 (borde · sin datos en la fuente)** · Dado `i-lit-2`, cuando se ingiere, entonces
  cada criterio de población queda `no_disponible`. `[FR-19]`
- **AC-5 (borde · muestra humana)** · Dado un lote de 20 documentos con metadatos
  `extraido_verificado` y `CORPUS_METADATA_SAMPLE_PCT = 10`, cuando termina la ingesta,
  entonces se seleccionan 2 de forma reproducible (mismo *seed*, mismos documentos) y se
  escribe `data/evaluation/corpus-metadatos/<release>.yaml` con sus metadatos para que un
  revisor marque cada campo `correcto | incorrecto`. `[TBD-20]` `[FR-19]` `[M-08.4]`
- **AC-6 (borde · LLM no disponible)** · Dado el LLM de metadatos caído, cuando se
  ingiere `i-lit-1`, entonces el documento queda `embebido` con sus criterios en
  `no_disponible` y el resumen de la ingesta lo cuenta como "metadatos pendientes".
  (asumido: la falta de metadatos no impide indexar el texto)

## Contexto técnico
`MetadataExtractionService` en `rag-orchestrator/application/`: LLM local con salida JSON
por esquema y NLI de cada metadato contra el texto de la fuente; lo que no pasa queda
`no_disponible` `[FR-19]`. La revisión humana de la muestra es ejecución (Ingeniería con
el oncólogo asesor); sus resultados viven en un archivo versionado sin datos de pacientes
(corpus público) y los consume US-132. Tests: Pytest con FX-06c-b y adapters falsos.

## INVEST
**Small** ✓ un paso más del pipeline de ingesta.
**Testable** ✓ seis tests con LLM y NLI falsos.

---

## US-119 — Cada ingesta publica una `CorpusRelease` con su fecha de corte y la Base del análisis la usa

> Linear: [L1D-118](https://linear.app/l1der-lab-mjbc/issue/L1D-118)

`FEAT-06c` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17) · FR-19 (`CorpusRelease`), FR-27 (e, f) · AC-T1.4 (versión del corpus) · ↪ US-117 · 🔗 Regresión [FR-27] → US-066 · 🔗 Produce para: FEAT-09 (vigencia, S6 si hay capacidad), FEAT-11a (marca "Evidencia o catálogo más reciente") · **Recorrido principal:** no · **Workaround en el MVP:** la fecha de corte del corpus vive en configuración `[RN-22]` y la Base del análisis la toma de ahí, sin entidad `CorpusRelease` publicada por ingesta

## Story
Como oncólogo, quiero saber hasta qué fecha está actualizada la evidencia de cada
análisis y qué fuentes no incluye, para juzgar si algo reciente podría faltar.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una ingesta completa de FX-06c-b con
  `CORPUS_CUTOFF_DATE = 2026-11-30`, cuando termina, entonces existe una `CorpusRelease`
  nueva con `cutoff_date = 2026-11-30`, `document_count` igual al número de documentos
  vigentes, `excluded_sources` con "NCCN" y "ESMO", y una fila en
  `corpus_release_document` por documento vigente (con la versión `i-gl-1-v2`, no la
  anterior). `[FR-19]` `[readme §3.1]`
- **AC-2 (borde · la Base usa la nueva release)** · Dado un análisis posterior, cuando se
  responde, entonces `analysisBasis.corpusCutoffDate = 2026-11-30` y
  `meta.corpusRelease` es el id de la nueva release, igual a lo persistido en
  `corpus_release`. `[FR-27]` `[AC-T1.4]`
- **AC-3 (invariante · releases anteriores intactas)** · Dada la release del S1, cuando
  se publica la nueva, entonces la anterior conserva sus filas de
  `corpus_release_document`. `[RN-05]`
- **AC-4 (borde · ingesta abortada)** · Dada una ingesta que termina con error global,
  cuando se revisa el catálogo, entonces no se publicó ninguna release nueva y los
  análisis siguen usando la anterior. (asumido)

## Contexto técnico
La publicación de la release es el último paso del `IngestionPipelineService`, en una
transacción del schema `corpus`. `cutoff_date` sale de configuración del lote `[RN-22]`.
Tests: Pytest con PostgreSQL de test y Supertest de `clinical-api` para el AC-2.

## INVEST
**Small** ✓ una escritura transaccional al final de la ingesta.
**Testable** ✓ cuatro tests sobre filas y respuesta.

---

## US-120 — El corpus del S3 alcanza al menos 20 documentos por tipo de cáncer de al menos 3 fuentes abiertas

> Linear: [L1D-119](https://linear.app/l1der-lab-mjbc/issue/L1D-119)

`FEAT-06c` · Sprint 4 · Estimación **3** · — (técnica, PRD §17; OL-02) · FR-19, RN-21 · AC-06.1 (corpus abierto) · ⛔ ADR-36 · ↪ US-117, US-118 · 🔗 Relacionada: US-119 (`si-hay-capacidad`) · 🔗 Medido en: US-132 (M-08.3)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** US-119 (`CorpusRelease` por ingesta) es `si-hay-capacidad`; la fecha de corte del corpus sale de configuración `[RN-22]` y esta historia no depende de la release.

## Story
Como oncólogo, quiero que el corpus de mama y de próstata tenga evidencia suficiente y
variada de fuentes abiertas, para que la falta de evidencia no se deba a un corpus
demasiado pequeño.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado el manifiesto real `data/raw/s3/manifest.yaml`, cuando se
  ingiere, entonces mama y próstata tienen cada uno ≥ 20 documentos `embebido` y
  `is_current`, de ≥ 3 `source_name` distintos. `[readme §5.0 S3 KR3]` `[FR-19]`
- **AC-2 (invariante · licencia)** · Dado el resultado del AC-1, cuando se consulta el
  catálogo, entonces todos los documentos vigentes tienen `license`, `license_class` y
  `license_url`, y ninguno es de NCCN ni de ESMO. `[RN-21]`
- **AC-3 (borde · repositorio público)** · Dado `data/raw/s3/`, cuando corre la CI,
  entonces solo contiene textos públicos cuya licencia permite redistribuirlos o URLs para
  descargarlos, y el escaneo de PII no encuentra nada. `[RN-14]` `[RN-21]`
- **AC-4 (borde · fuentes del ADR)** · Dado el manifiesto, cuando se valida, entonces
  cada `source_name` está en la lista de fuentes de ADR-36. `[ADR-36]`

## Contexto técnico
Trabajo de curaduría más ejecución de la ingesta (US-117) sobre el manifiesto real. Las
fuentes del MVP son las de FR-19 (NCI PDQ, ClinicalTrials.gov, PubMed/PMC OA, guías
públicas, publicaciones de TCGA/GDC, cBioPortal y TCIA), acotadas por ADR-36. Tests: un
*smoke test* de conteo por tipo y fuente en la CI y el escaneo de US-036.

## INVEST
**Small** ✓ un manifiesto y una ejecución con verificación de conteos.
**Testable** ✓ cuatro chequeos automáticos.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | backlog/01-requisitos.md §3: dueña de RN-05 = FEAT-06c | Encargo del lote 1: FEAT-06a dueña de RN-05 (recuperación) | Reparto: la recuperación solo de chunks vigentes la verifica US-055 AC-3 (dueña); el versionado sin borrado, US-059 AC-6; la ingesta del S3 lleva regresión (US-117 AC-4). No es un conflicto de fuentes, se registra para trazabilidad |
| S-01 | PRD §14 / readme §5.0: ingesta en el S3 | Slicing adoptado: ingesta en el S3 | Sin cambio |
| C-16 | CLAUDE.md: ADR-36 pendiente | readme §3.3 #36 (licencias decididas; PubMed sin licencia pendiente, TBD-04) | La ingesta del S3 (US-117, US-120) queda `⛔ ADR-36` solo por la lista final de fuentes y la regla de PubMed; las licencias ya decididas se aplican desde el S1 |
| — | backlog/02-adrs.md §4.5: muestra humana de metadatos como CAL (TBD-20) | backlog/01-requisitos.md §8: DEC-14 para la muestra | 02-adrs.md: es configuración (`CORPUS_METADATA_SAMPLE_PCT`, US-118); DEC-14 quedó para la muestra de aplicabilidad (VM-3) |
| Slicing v2 | PRD §14 S3 y readme §5.0 S3: ingesta del corpus con metadatos en el S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): ingesta del corpus en el S4 (antes de la aplicabilidad del S5); `CorpusRelease` `si-hay-capacidad` | Se siguió el slicing v2; la aplicabilidad (S5) consume la ingesta del S4 (US-117, US-118, US-120) |
