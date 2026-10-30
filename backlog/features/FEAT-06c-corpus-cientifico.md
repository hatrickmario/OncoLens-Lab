# FEAT-06c — Corpus científico: semilla con licencias (S1) e ingesta con metadatos (S3)

> Linear: [L1D-18](https://linear.app/l1der-lab-mjbc/issue/L1D-18)

**Talla:** XL (Feature completa; propone división por sprint) · parte S1: **M** · parte S3: **L** · **Sprint:** 1 (semilla y esquema) · 3 (US-117a, US-117b, US-118: la aplicabilidad los consume; reordenamiento del 2026-10-23; US-117 partida `[S3 resp. 2]`) · 4 (US-240 spike de capacidad, US-242 extractor en abanico, US-247 datos de demo e instalación; US-117b se archiva con 0 pts; refinamiento del S4, `[S4 resp. 3]`) · 5 (US-120, `[S4 resp. 1]`) · `si-hay-capacidad` (US-119, `CorpusRelease`) · **Capacidad:** CAP-06 (prerrequisito de CAP-07, CAP-08 y CAP-09) · **Recorrido principal:** sí
**Requisitos:** FR-19 (S1: semilla y esquema de metadatos; S3: ingesta como entregable) · RN-21 (dueña) · RN-05 (parte de versionado: el histórico nunca se borra; la recuperación de chunks vigentes es de US-055) · M-08.3, M-08.4 (S3, medidos en US-132) · TBD-20 (CAL, US-118) · ADR-36 (S3)
**Evidencia:** [→ PRD §5 FR-19], [→ PRD §6 RN-05, RN-21, RN-25], [→ PRD §17 FR-19 → OL-02], [→ PRD §18.3.6 AC-06.1], [→ PRD §18.3.8 M-08.3, M-08.4], [→ readme §6 OL-02 (tareas 2, 7; alcance complementario: catálogo)], [→ readme §3.1 modelo del corpus], [→ readme §3.3 #5, #10, #17, #30, #36], [→ readme §1.4 paso 7], [→ backlog/02-adrs.md ADR-36, ADR-39], [→ docs/architecture/adr/ADR-47-extraccion-poblacion-en-abanico.md], [→ docs/evidence/S3-demo3/S4-insumo-extraccion-poblacion.md §2.1, §5, §6], [→ docs/evidence/S3-demo3/S3-demo-outcomes.md OUT-02, OUT-04, OUT-05, OUT-06, OUT-07]
**Dependencias:** ↪ US-033 (esquema congelado), US-034 (Milvus), US-040 (rol `rag_corpus`) · ⛔ ADR-39 (dimensión del vector dense y origen del sparse: US-058 AC-2; *embeddings* reales para indexar: US-059 AC-1) · ADR-36 no bloquea el S1 (licencia verificada documento a documento) · 🔗 Consumida por: US-055 · ⛔ ADR-36 (S3: US-117a; S4: US-120) · 🔗 Medido en (S5): US-132 (M-08.3, M-08.4)
**Valor:** el oncólogo solo puede confiar en una opción si la fuente es pública, con licencia que permite usarla, vigente y verificable (P5, P8, P12). La semilla del S1 permite demostrar el recorrido con evidencia real de acceso abierto de mama y próstata, sin NCCN ni ESMO, y deja el esquema de metadatos listo para la aplicabilidad.
**Workaround en el MVP (US-119):** la fecha de corte del corpus vive en configuración `[RN-22]` y la Base del análisis la toma de ahí.
**Stories:** parte S1: US-058, US-059 (10 puntos) · parte S3: US-117a (5), US-117b (3), US-118 (5) (13 puntos) · parte S4: US-240 (2), US-242 (5), US-247 (5) (12 puntos; US-117b se archiva sin sumar) · parte S5: US-120 (3 puntos, `[S4 resp. 1]`) · US-119 (3 puntos, `si-hay-capacidad`) · total 41 puntos

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
- **FX-06c-c · Extracción de población en abanico** (US-242; perfil de test `RAG_ADAPTERS=fake`, catálogo `test-apl-1.2.0` de FX-08b-c con 6 criterios de mama):
  - `doc-e1` (ECA, mama, `license_class = cc_by`): `ch-e1-1` (Elegibilidad: "Eligible patients were premenopausal or postmenopausal women with HER2-positive early breast cancer"), `ch-e1-2` (Resultados: "In the triple-negative subgroup…"), `ch-e1-3` (Discusión). `doc-e2` (ECA, mama, `cc_by`): `ch-e2-1`.
  - Recuperador falso por criterio: devuelve los fragmentos de **ese** documento en el orden `ch-e1-1`, `ch-e1-2`, `ch-e1-3` (puntajes 0,9 · 0,6 · 0,4); `POPULATION_EXTRACTION_TOP_K = 2`.
  - LLM falso de extracción, por criterio: `EXT-OK` (`estado_menopausico` → [`premenopausal women` · `ch-e1-1` · elegibilidad, `postmenopausal women` · `ch-e1-1` · elegibilidad]; `estado_her2` → [`HER2-positive` · `ch-e1-1` · elegibilidad]; `receptores_hormonales` → [`triple-negative` · `ch-e1-2` · subgrupo]; el resto `[]`) · `EXT-RELLENO` (`ecog` → [`not found` · `none`]; `estadio` → [`no expresado` · `ch-e1-1`]) · `EXT-AJENO` (`estado_her2` → [`HER2-positive` · `ch-e2-1`]) · `EXT-NLI` (`estadio` → [`stage I–III` · `ch-e1-1`]) · `EXT-DUP` (`estado_menopausico` → [`postmenopausal women` · `ch-e1-1`, `Postmenopausal women` · `ch-e1-3`]) · `EXT-CUATRO` (`linea_tratamiento` → 4 valores: 2 de elegibilidad en `ch-e1-1` y 2 de mención en `ch-e1-2` y `ch-e1-3`) · `EXT-CORTE` (primera llamada con `finish_reason = length` y JSON truncado; la segunda, como `EXT-OK`) · `EXT-CORTE-2` (las dos llamadas truncadas).
  - NLI falso: `entailment` salvo `stage I–III` contra `ch-e1-1` (`neutral`).

---

## Parte S1

## US-058 — El catálogo del corpus y la colección de Milvus se crean con su esquema final

> Linear: [L1D-114](https://linear.app/l1der-lab-mjbc/issue/L1D-114)

`FEAT-06c` · Sprint 1 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (esquema de metadatos), RN-21 · ↪ US-033, US-034, US-040 · ⛔ Bloqueada por: ADR-39 (solo AC-2: valor real de la dimensión)

> **Dependencia hacia adelante (slicing v2, 2026-10-07):** US-040 (`REVOKE ALL` y tests de *permission denied*) llega en el S2. En el S1 el rol `rag_corpus` lo crean los scripts de US-035 y solo hay datos sintéticos; las restricciones del rol se verifican desde el S2.

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se aceptan.

## Story
Como equipo de desarrollo, quiero crear desde el S1 el catálogo del corpus y la
colección de Milvus con su esquema final, incluidos los metadatos de población y el
vector sparse que se usarán después, para no tener que recrear la colección ni
reingestar el corpus cuando lleguen la búsqueda híbrida y la aplicabilidad.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado un PostgreSQL con el schema `corpus` vacío y Milvus de
  test, cuando se ejecuta `alembic upgrade head` como `rag_corpus_migrator` (servicio *one-shot*; el runtime `rag_corpus` solo tiene `USAGE` + DML, `[S1 resp. 14]`) y el inicializador de
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

> **Decidido (usuario, 2026-10-13, `[S1 resp. 3]`):** los supuestos marcados "(asumido)" en los AC se aceptan.

> **Decidido (usuario, 2026-10-20):** un documento rechazado por licencia o fuente excluida **retira la versión vigente de su grupo** (catálogo `is_current = false` con `superseded_at`, chunks no vigentes en Milvus y release nueva), sin borrar nada (RN-21, RN-05); si el apagado falla, el resultado es `error`. Detalle en el change `l1d-115-seed-corpus-licensed` (D3 y requisito «Un rechazo retira la versión vigente del grupo»).
>
> **Deuda sin ID (L1D-115, 2026-10-20):** (1) unificar la regla de licencias del cargador de la semilla con `app/evaluation/dataset_loader.py`; (2) ingesta que falla cerrado (insertar con `is_current = false` hasta confirmar en el catálogo y reconciliar documentos quitados del manifiesto); (3) `license_class` nullable en los rechazados (hoy `cc_by_nc`; toda consulta por clase filtra `status = 'embebido'`).

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

## US-117a — La ingesta del corpus es reanudable, indexa *dense* y *sparse* y rechaza lo que no tiene licencia

> Linear: [L1D-116](https://linear.app/l1der-lab-mjbc/issue/L1D-116)

`FEAT-06c` · Sprint 3 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (ingesta como entregable), RN-21 · AC-06.1 (corpus abierto) · ⛔ ADR-36 (lista final de fuentes y regla de PubMed sin licencia) · ⛔ ADR-39 (modelos *dense* y *sparse*) · ↪ US-058, US-059 · ↪ US-082 (`TextExtractionService`, S5: solo para PDF reales) · 🔗 Regresión [RN-21] → US-059 · 🔗 Produce para: US-117b, US-118

> **Reordenamiento (usuario, 2026-10-23):** S4 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

> **Decidido (usuario, 2026-10-23, `[S3 resp. 2]`):** US-117 (8 pts) se parte por superficie, como proponía su INVEST: **US-117a** (5 pts: pipeline de ingesta y reanudación) y **US-117b** (3 pts: versionado sin borrado y *sparse* de la semilla), ambas en el S3. Esta historia conserva el issue L1D-116.

## Story
Como responsable del corpus, quiero ingerir lotes de documentos públicos de forma
automática y reanudable, con control de licencia, para ampliar la evidencia disponible
sin dejar entrar una fuente que no podemos usar.

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
- **AC-4 (borde · fallo aislado)** · Dado un documento cuya normalización falla, cuando se
  ingiere el lote, entonces ese queda `error`, los demás terminan y el resumen final lista
  los contadores por estado. (asumido; antes US-117 AC-6)

> **Nota `[S3 resp. 2]`:** con PDF reales, la ingesta necesita `TextExtractionService` (US-082, S5). En el S3 se prueba con el *fixture* de texto FX-06c-b (textos sintéticos breves); la entrada PDF queda para cuando exista US-082.

## Contexto técnico
`IngestionPipelineService` en `rag-orchestrator/application/` (normalización →
*chunking* → *embedding* dense y sparse → inserción → estado), con *checkpoint* por
documento en `corpus_document.status` y `checksum`. Para los PDF reutilizará
`TextExtractionService` (US-082, S5) en proceso `[readme §4.2]`; en el S3 la entrada es
texto. Validación de licencia y fuentes excluidas con las listas en configuración
(ADR-36) `[RN-22]`. Corre con el rol `rag_corpus` y nunca toca schemas clínicos
`[SEG-06]`. Tests: Pytest con FX-06c-b, *embeddings* falsos y Milvus de test en la CI.

## INVEST
**Small** ✓ 5 puntos: el pipeline, su *checkpoint* y el control de licencia.
**Testable** ✓ cuatro tests sobre estados, chunks y contadores.
*(Estimable ⚠ el 5 asume ADR-36 cerrado ≤ S1 y ADR-39 con el modelo *sparse* fijado.)*

---

## US-117b — La ingesta versiona sin borrar y puebla el *sparse* de la semilla

> Linear: [L1D-302](https://linear.app/l1der-lab-mjbc/issue/L1D-302)

`FEAT-06c` · Sprint 3 *(hecha en el S3, PR #218; se concilia y archiva en el S4 con 0 pts, `[S4 resp. 10]`)* · Estimación **3** · — (técnica, PRD §17; OL-02) · FR-19 (ingesta como entregable), RN-05 · AC-06.1 (corpus abierto) · ⛔ ADR-39 (modelo *sparse*) · ↪ US-117a · 🔗 Regresión [RN-05] → US-059 · 🔗 Consumida por: US-112 (*sparse* poblado)

> **Decidido (usuario, 2026-10-23, `[S3 resp. 2]`):** segunda mitad de la partición de US-117 (versionado sin borrado y *sparse* de la semilla), 3 pts, en el S3. Se crea en Linear cuando el workspace tenga cupo.
> **Decidido (usuario, 2026-10-24, cierre de la O1 del S3):** recibe como **tarea 0** el refactor del núcleo común de ingesta (`SeedCorpusLoader` e `IngestionPipelineService`, deuda de L1D-116), antes de tocar el *sparse*. Es un refactor: la cobertura del módulo no baja respecto de `main`. Absorbe también la tarea 1.10 de L1D-116 (smoke con pesos reales de BGE-M3, vía `EMBEDDING_SPARSE_WEIGHTS_*`).
> **Decidido (usuario, 2026-10-29):** la historia está **hecha** (PR #218). En el S4 cuenta **0 pts**: solo se concilia su `tasks.md` y se archiva el change; las tareas abiertas 0.4b y G2.* pasan a US-233a. Su AC-2 se lee con el subcomando `ingest reindex-sparse` `[S4 resp. 10]`.
> **Decidido (usuario, 2026-10-27):** `reindex-sparse` es un **subcomando** del CLI de ingesta (no un flag `--reindex-sparse`): sin guarda de LLM (no usa LLM ni escribe en el catálogo) pero con embeddings locales exigidos por código (`MODEL_PROVIDER=local`, pesos y *tokenizer* con SHA-256, `EMBEDDING_SPARSE_WEIGHTS_*`), falla en cerrado nombrando la variable. `ingest` conserva `--manifest` y su guarda. Absorbe además las deudas 5.3 y 5.4 de L1D-117 en la tarea 0. Ver `openspec/changes/us-117b-versionado-sparse-semilla/design.md` D5. El AC-2 se lee con `ingest reindex-sparse`.

## Story
Como responsable del corpus, quiero que una versión nueva de un documento reemplace a la
anterior sin borrarla y que la semilla del S1 tenga también su índice *sparse*, para
conservar la historia de la evidencia y poder usar la búsqueda híbrida sobre todo el
corpus.

## AC (Given/When/Then)
- **AC-1 (invariante · versionado sin borrado)** · Dado `i-gl-1` ingerido, cuando se
  ingiere `i-gl-1-v2`, entonces `i-gl-1` queda `is_current = false` con `superseded_at`,
  sus chunks `is_current = false`, y el total de filas de `corpus_document` crece en 1.
  `[RN-05]` `[ADR-5]` (antes US-117 AC-4)
- **AC-2 (borde · *sparse* de la semilla)** · Dada la semilla del S1 con chunks sin
  `sparse_vector`, cuando se ejecuta el subcomando `ingest reindex-sparse`, entonces todos los chunks
  vigentes tienen `sparse_vector` y sus `chunk_id` y `dense_vector` no cambian.
  `[OL-02]` `[FR-19]` (antes US-117 AC-5) `[S4 resp. 10]`

## Contexto técnico
Extiende `IngestionPipelineService` (US-117a): detecta la versión nueva por identificador
de fuente y `checksum`, marca la anterior `superseded_at` y sus chunks `is_current = false`
en la misma operación, sin borrar filas `[RN-05]`. El subcomando `ingest reindex-sparse` recorre los chunks
vigentes y solo escribe `sparse_vector`. Corre con el rol `rag_corpus` `[SEG-06]`. Tests:
Pytest con FX-06c-b, *embeddings* falsos y Milvus de test en la CI.

## INVEST
**Small** ✓ dos operaciones acotadas sobre el pipeline de US-117a.
**Testable** ✓ dos tests sobre filas y vectores.

---

## US-118 — Los metadatos de población, diseño y endpoint se toman de la fuente o se extraen y verifican, y una muestra se revisa a mano

> Linear: [L1D-117](https://linear.app/l1der-lab-mjbc/issue/L1D-117)

`FEAT-06c` · Sprint 3 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (metadatos estructurados, `extraido_verificado`), RN-25 · TBD-20 (CAL) · ⛔ ADR-39 (LLM y NLI) · ↪ US-117a · 🔗 Regresión [RN-25] → US-127 · 🔗 Consumida por: US-122 (valor del estudio) · 🔗 Medido en: US-132 (M-08.3, M-08.4)

> **Reordenamiento (usuario, 2026-10-23):** S4 → S3. Ver `README.md`, «Reordenamiento del 2026-10-23».

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
  > **Decidido (usuario, 2026-10-24, `[S3 resp. 13]`):** en el S3 el revisor es el usuario (tarea `[HUMANO]`, unos 20 min): el agente prepara la muestra y una plantilla de verificación por campo. La validación clínica de los criterios la hace después la sesión de oncólogos del S4. US-132 AC-4 consume esa revisión.
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

`FEAT-06c` · Sprint si-hay-capacidad · Estimación **3** · — (técnica, PRD §17) · FR-19 (`CorpusRelease`), FR-27 (e, f) · AC-T1.4 (versión del corpus) · ↪ US-117a · 🔗 Regresión [FR-27] → US-066 · 🔗 Produce para: FEAT-09 (vigencia, S6 si hay capacidad), FEAT-11a (marca "Evidencia o catálogo más reciente") · **Recorrido principal:** no · **Workaround en el MVP:** la fecha de corte del corpus vive en configuración `[RN-22]` y la Base del análisis la toma de ahí, sin entidad `CorpusRelease` publicada por ingesta

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
- **AC-5 (borde · la suite mide sobre la release)** · Dada la `CorpusRelease` vigente,
  cuando se ejecuta `evaluate --suite aplicabilidad` (US-132), entonces el reporte trae el
  porcentaje de documentos de esa release con `population_criteria` distintos de
  `no_disponible` frente a la meta en configuración (0,90, propuesta). `[M-08.3]`
  (trasladado de US-132 AC-3 `[S3 resp. 8]`: en el S3, US-132 mide sobre la versión del
  corpus por configuración)

## Contexto técnico
La publicación de la release es el último paso del `IngestionPipelineService`, en una
transacción del schema `corpus`. `cutoff_date` sale de configuración del lote `[RN-22]`.
Tests: Pytest con PostgreSQL de test y Supertest de `clinical-api` para el AC-2.

## INVEST
**Small** ✓ una escritura transaccional al final de la ingesta.
**Testable** ✓ cinco tests sobre filas, respuesta y reporte de la suite.

---

## US-120 — El corpus del S3 alcanza al menos 20 documentos por tipo de cáncer de al menos 3 fuentes abiertas

> Linear: [L1D-119](https://linear.app/l1der-lab-mjbc/issue/L1D-119)

`FEAT-06c` · Sprint 5 *(S4 → S5, `[S4 resp. 1]`)* · Estimación **3** · — (técnica, PRD §17; OL-02) · FR-19, RN-21 · AC-06.1 (corpus abierto) · ⛔ ADR-36 · ↪ US-117a, US-117b, US-118 · 🔗 Relacionada: US-119 (`si-hay-capacidad`) · 🔗 Medido en: US-132 (M-08.3)

> **Decidido (usuario, 2026-10-29):** pasa del S4 al **S5**. El S4 se compromete con ≈ 57 pts (núcleo del RAG de conocimiento, faltantes y etapa 2 de la población, ADR-47) y lo que no cabe se recorta de menor a mayor prioridad: gestión de usuarios → OCR → búsqueda por datos del paciente; el RAG de conocimiento nunca. El S5 queda sobrecargado y se recorta en su refinamiento `[S4 resp. 1]`.

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
- **AC-5 (borde · calibración sobre el corpus ampliado)** · Dado el corpus del AC-1 (≥ 20
  documentos por tipo), cuando se barren `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` con
  la suite `evaluate` y los modelos locales (US-233a), entonces los valores definitivos quedan
  en configuración con su justificación y el reporte del barrido, y los provisionales (0,7 y
  30) se sustituyen. `[ARR-03 AC-5]` `[RN-22]` (heredado de US-233 AC-3, `[S4 resp. 6]`)
- **AC-6 (baseline técnico por tipo de cáncer y umbral definitivo)** · Dados los modelos
  locales de ADR-39 y el stack de Compose sobre el corpus del AC-1, cuando se registra el
  baseline, entonces el reporte contiene recall@10, MRR, español → inglés, fidelidad,
  precisión de citas y «sin evidencia» para mama y para próstata (es/en), y el p95 de
  `/platform/evidence-analyses` de punta a punta como mediana de 3 corridas; y
  `RELEVANCE_THRESHOLD` queda fijado en configuración con el valor del barrido y su
  justificación. `[M-06.1]` `[M-06.2]` `[TBD-03]` `[RN-22]` (heredado de US-233 AC-8,
  `[S2 resp. 19]`, `[S4 resp. 6]`)
  > **Nota (usuario, 2026-10-29):** si US-245 no alcanza la meta en `evaluate`, valorar aquí contexto del fragmento para el NLI (solapamiento o vecinos; exige reindexar → ADR) y un NLI más fuerte es↔en o un umbral por tipo de afirmación (OUT-08, soluciones 3 y 4) `[S4 resp. 15]`.
  > **Decidido (usuario, 2026-10-29):** los AC de US-233 que dependen del corpus de ≥ 20 documentos por tipo (AC-3 y AC-8) pasan aquí, al S5, con el corpus `[S4 resp. 6]`. La estimación (3) se revisa en el refinamiento del S5.

## Contexto técnico
Trabajo de curaduría más ejecución de la ingesta (US-117a, US-117b) y de la extracción de población (US-242) sobre el manifiesto real; los AC-5 y AC-6 corren la suite `evaluate` con `proveedor: local` (US-233a) en el MacBook de referencia. Las
fuentes del MVP son las de FR-19 (NCI PDQ, ClinicalTrials.gov, PubMed/PMC OA, guías
públicas, publicaciones de TCGA/GDC, cBioPortal y TCIA), acotadas por ADR-36. Tests: un
*smoke test* de conteo por tipo y fuente en la CI y el escaneo de US-036.

## INVEST
**Small** ⚠ un manifiesto y una ejecución con verificación de conteos, más la calibración y el baseline heredados de US-233 (AC-5, AC-6); si no cabe en 3, se re-estima en el refinamiento del S5.
**Testable** ✓ cuatro chequeos automáticos y dos reportes de `evaluate`.

---

## Parte S4

## US-240 — El spike de capacidad mide cuántas tareas de extracción en paralelo aguanta el equipo de referencia y fija los valores por defecto

> Linear: [L1D-290](https://linear.app/l1der-lab-mjbc/issue/L1D-290)

`FEAT-06c` · Sprint 4 · Estimación **2** · — (*spike* técnico, PRD §17) · NFR (p95 ≤ 15 s, se recalibra en el S5), RN-22, RN-13, RN-14 · ⛔ ADR-47 (aceptado) · ⛔ ADR-39 (LLM, NLI y runtime reales) · 🔗 Produce para: US-242 (`POPULATION_EXTRACTION_CONCURRENCY`, `POPULATION_EXTRACTION_TOP_K`, tope de tokens), US-244 (`POPULATION_FALLBACK_DEADLINE_MS`), US-233a (RSS y latencia del NLI) · **Exento de TDD; su código no se mergea**

> **Decidido (usuario, 2026-10-29):** *spike* de capacidad y paralelismo en el equipo de referencia (1, 2 y 4 solicitudes simultáneas, `OLLAMA_NUM_PARALLEL`, memoria de Ollama, del NLI y de Docker; tiempo real por tarea corta). Entrega un informe en `reports/` y los valores por defecto de configuración; su código no se mergea `[S4 resp. 3]`.

## Story
Como responsable técnico, quiero medir en el equipo de referencia cuánto tarda una tarea corta
de extracción de población y cuántas puedo correr a la vez sin agotar la memoria, para fijar la
concurrencia, los topes y los plazos con cifras y no con estimaciones.

## AC (Given/When/Then)
- **AC-1 (happy path · tiempos por nivel)** · Dados el MacBook Pro M5 de 32 GB con el stack
  de Compose, Ollama con el LLM de ADR-39 y ≥ 10 tareas (documento × criterio) del corpus de
  la demo, cuando se ejecuta el *spike* con 1, 2 y 4 solicitudes simultáneas, entonces
  `reports/spikes/s4-capacidad-paralelismo.md` registra por nivel el p50 y el p95 del tiempo
  por tarea, las tareas por minuto y el `finish_reason` de cada tarea. `[S4 resp. 3]`
  `[S4-insumo §5]`
- **AC-2 (borde · memoria)** · Dado el *spike* del AC-1, cuando se lee el informe, entonces
  registra por nivel el valor de `OLLAMA_NUM_PARALLEL`, la memoria del modelo según
  `ollama ps` (`size` y `size_vram`), el RSS del NLI y de `rag-orchestrator` y la memoria de
  la VM de Docker, y marca si se supera el LLM ≤ 21 GB o el stack ≤ ~30 GB. `[ADR47-R7]`
  `[CLAUDE.md]`
- **AC-3 (borde · nivel que falla)** · Dado un nivel con OOM, uso de *swap* o un p95 más del
  doble que el del nivel 1, cuando se fija el valor por defecto, entonces el informe lo
  registra y el valor elegido para `POPULATION_EXTRACTION_CONCURRENCY` es el mayor nivel sin
  ese fallo. (asumido: criterio de corte)
- **AC-4 (happy path · valores por defecto)** · Dado el informe, cuando se cierra la historia,
  entonces `.env.example` y la configuración de Compose fijan
  `POPULATION_EXTRACTION_CONCURRENCY`, `OLLAMA_NUM_PARALLEL`, `POPULATION_EXTRACTION_TOP_K`,
  `POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS` y `POPULATION_FALLBACK_DEADLINE_MS`, cada uno con
  un comentario que cita la sección del informe que lo justifica. `[RN-22]` `[ADR-47]`
- **AC-5 (invariante · datos y contenido)** · Dado el *spike*, cuando se revisan sus
  entradas y su informe, entonces solo usa el corpus público de la demo (ningún paciente, ni
  sintético, en el prompt de extracción) y el informe contiene solo métricas agregadas, sin
  texto de fragmentos ni salidas del LLM. `[RN-13]` `[RN-14]`
- **AC-6 (invariante · no se mergea código)** · Dado el PR de la historia, cuando lo revisa
  el Gate 2, entonces solo añade el informe en `reports/` y los valores de configuración del
  AC-4; ningún archivo de `apps/` ni el *script* del *spike*. `[CLAUDE.md]` (política TDD:
  *spikes* exentos)

## Contexto técnico
Ejecución manual en el equipo de referencia (modelos en `~/adr39-modelos/`), con la demo
apagada salvo los servicios necesarios. La tarea medida es la de US-242 (una fuente por
llamada, esquema cerrado, `maxItems` 3, tope propio) llamada contra Ollama `/v1`. El *script*
vive fuera del repo o en una rama que no se mergea. Las cifras del ADR-47 marcadas
*(estimación)* se sustituyen por las medidas.

## INVEST
**Small** ✓ una medición con tres niveles y un informe.
**Testable** ✓ el informe y los valores de configuración se comprueban en el PR.
*(Independent ⚠ necesita el equipo de referencia y la tarea corta de US-242 en una rama.)*

---

## US-242 — La ingesta extrae la población de cada estudio en abanico, una tarea corta por documento y criterio, y solo guarda valores verificados

> Linear: [L1D-292](https://linear.app/l1der-lab-mjbc/issue/L1D-292)

`FEAT-06c` · Sprint 4 · Estimación **5** · — (técnica, PRD §17; OL-02) · FR-19 (metadatos `extraido_verificado`), RN-01, RN-04, RN-21, RN-22, RN-25, RN-27 · TBD-20 (CAL) · ⛔ ADR-47 (aceptado) · ⛔ ADR-39 (LLM y NLI reales; los AC usan adapters falsos) · ↪ US-118, US-241 (forma de lista), US-240 (valores por defecto) · 🔗 Consumida por: US-243, US-244 (misma tarea corta), US-247 · 🔗 Medido en: US-233b (precisión y cobertura por criterio, duplicados, `finish_reason=length` = 0) · 🔗 Regresión [RN-21] → US-059 · 🔗 Regresión [RN-25] → US-127

> **Decidido (usuario, 2026-10-29):** etapa A del ADR-47 (opción A): una tarea por (documento, criterio), **nunca dos documentos en una llamada**; k fragmentos por criterio en configuración; salida cerrada con `maxItems` 3, valor ≤ 200 caracteres y tope de tokens propio; rechazo de valores de relleno («not found», «no expresado», `chunkId` inexistente); `chunkId` validado contra el documento; NLI por valor; deduplicación por valor normalizado; reintento único; concurrencia con semáforo `POPULATION_EXTRACTION_CONCURRENCY`; caché por documento + criterio + versión; `metadata_source = extraido_verificado`; todo valor en configuración (RN-22). Se mide en US-233b `[S4 resp. 3]`.

## Story
Como oncólogo, quiero que la población de cada estudio salga de su texto, fragmento a
fragmento y comprobada contra él, para que la comparación con mi paciente use lo que el
estudio dice de verdad y no se rompa cuando una fuente describe varios grupos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dados `doc-e1`, `test-apl-1.2.0` (6 criterios),
  `POPULATION_EXTRACTION_TOP_K = 2` y `EXT-OK` de FX-06c-c, cuando se ingiere `doc-e1`,
  entonces el adapter de extracción registra 6 llamadas (una por criterio), cada prompt lleva
  como máximo 2 fragmentos y todos de `doc-e1`, y `population_criteria.estado_menopausico`
  guarda los dos valores con `chunkId = ch-e1-1`, `scope = elegibilidad`, las versiones de
  prompt, modelo y catálogo y `nliResult = entailment`, con
  `metadata_source = extraido_verificado`. `[S4 resp. 3]` `[ADR-47]` `[FR-19]`
- **AC-2 (borde · relleno y fragmento ajeno)** · Dados `EXT-RELLENO` y `EXT-AJENO`, cuando
  se ingiere `doc-e1`, entonces `ecog`, `estadio` y `estado_her2` quedan con lista vacía y el
  resumen de la ingesta cuenta `valoresRechazados = 3` (2 `relleno`, 1 `chunk_ajeno`).
  `[ADR47-R15]` `[ADR47-R16]` `[RN-04]`
- **AC-3 (borde · sin soporte NLI)** · Dado `EXT-NLI`, cuando se verifica `stage I–III`
  contra `ch-e1-1`, entonces `estadio` queda con lista vacía y el resumen cuenta
  `valoresSinSoporte = 1`. `[RN-01]` `[RN-25]`
- **AC-4 (borde · duplicados)** · Dado `EXT-DUP`, cuando se normaliza con los sinónimos del
  catálogo, entonces `estado_menopausico` guarda **un** valor (`postmenopausal women`, de
  `ch-e1-1`). `[S4 resp. 3]` `[RN-27]`
- **AC-5 (borde · más valores que el tope)** · Dados `EXT-CUATRO` y
  `POPULATION_MAX_VALUES_PER_CRITERION = 3`, cuando se guarda `linea_tratamiento`, entonces
  quedan 3 valores (primero los 2 de elegibilidad, después la mención del fragmento con
  mayor puntaje) y se registran `truncado = true` y `valoresFueraDelTope = 1`. `[RN-22]`
  `[S4-insumo §2.5]`
- **AC-6 (borde · salida cortada y reintento único)** · Dado `EXT-CORTE`, cuando se ingiere,
  entonces ese criterio tiene exactamente 2 llamadas (la segunda con otra semilla) y sus
  valores quedan guardados; y dado `EXT-CORTE-2`, ese criterio queda `pendiente`, los demás
  se guardan, el documento queda `embebido` y el resumen cuenta `finishReasonLength = 2`.
  `[ADR47-R4]` `[RN-26]`
- **AC-7 (borde · caché por versión)** · Dado `doc-e1` ya extraído, cuando se vuelve a
  ingerir con las mismas versiones, entonces el adapter registra 0 llamadas; y cuando cambia
  `POPULATION_PROMPT_VERSION`, registra 6. `[ADR-47]` `[ADR47-R8]`
- **AC-8 (invariante · concurrencia y una fuente por llamada)** · Dados `doc-e1` y `doc-e2`
  con `POPULATION_EXTRACTION_CONCURRENCY = 2`, cuando se ingieren, entonces el adapter
  registra 12 llamadas, nunca más de 2 simultáneas y ninguna con fragmentos de los dos
  documentos. `[RN-22]` `[ADR47-R16]` `[S4 resp. 3]`

## Contexto técnico
Extiende `application/corpus_metadata/` (US-118) con un orquestador determinista
(`asyncio.gather` + semáforo; sin agente). La selección de los k fragmentos usa la búsqueda
existente con la etiqueta del criterio, limitada al documento, más las secciones típicas
(Métodos, Elegibilidad, Población). Esquema de salida cerrado `{"values": [{"value",
"chunkId", "scope"}]}`; la fuente la fija el código al construir la tarea, nunca el modelo.
El `chunkId` se valida contra el documento y el valor contra el texto del fragmento
(subcadena normalizada) antes del NLI. El extractor solo corre sobre documentos con licencia
aceptada (RN-21, ADR-36) y su prompt nunca lleva datos de pacientes. Los logs registran
`finish_reason` y longitudes, sin contenido (RN-14). Configuración (RN-22, valores iniciales
de US-240): `POPULATION_EXTRACTION_TOP_K`, `POPULATION_MAX_VALUES_PER_CRITERION`,
`POPULATION_EXTRACTION_MAX_OUTPUT_TOKENS`, `POPULATION_EXTRACTION_CONCURRENCY`,
`POPULATION_EXTRACTION_RETRIES` (1), `POPULATION_PROMPT_VERSION`. Prompt nuevo: la suite
`evaluate` (OL-06) es obligatoria en el PR y el reporte de `ai-eval-runner` se adjunta. Tests:
Pytest con PostgreSQL `corpus` real y adapters falsos de FX-06c-c; TDD estricto en la
orquestación y en las reglas de rechazo, deduplicación y tope.

## Non-goals
Extracción doble con comparación y calibración de confianza (S6 / si hay capacidad). Herramienta
de revisión humana a escala (S5). Respaldo en la consulta (US-244).

## INVEST
**Small** ✓ un orquestador y reglas de filtrado sobre el pipeline de US-118; 5 es el techo.
**Testable** ✓ ocho tests con LLM, NLI y recuperador falsos.

---

## US-247 — La demo y la instalación traen metadatos de población verificados, pacientes que producen Coincide, Parcial y No coincide, y un `levantar.sh` que verifica el seed

> Linear: [L1D-297](https://linear.app/l1der-lab-mjbc/issue/L1D-297)

`FEAT-06c` · Sprint 4 · Estimación **5** · — (técnica, PRD §17; OL-01, OL-02) · FR-19, FR-25 (demo), RN-13, RN-14, RN-21, RN-25 · ⛔ ADR-47 (aceptado) · ⛔ DEC-11 (US-021) · escenario aceptado `[S4 resp. 8]` · ↪ US-242, US-243, US-039 (seed sintético) · 🔗 Consume: US-118 (muestra humana) · 🔗 Regresión [RN-13] → US-143 · 🔗 Regresión [RN-21] → US-059

> **Decidido (usuario, 2026-10-29):** datos de demo y de instalación de OUT-07, OUT-02, OUT-04 y OUT-05: metadatos de población extraídos y verificados con US-242 (no inventados, licencia RN-21) que den Coincide, Parcial y No coincide; pacientes sintéticos del seed que los produzcan; ≥ 2 pares paciente + pregunta documentados en la guía de demo con conteos esperados en `applicabilitySummary` y un caso con No coincide excluyente; prueba de aceptación sobre el seed; `scripts/demo/levantar.sh` carga metadatos y pesos *sparse*, verifica el seed con conteos mínimos (falla si hay 0 identidades) y, ante estado previo, avisa y ofrece borrar (decisión F-07) `[S4 resp. 1]` `[S4 resp. 3]`.

## Story
Como oncólogo que prueba OncoLens en una demo, quiero preguntas y pacientes de ejemplo con
los que se vean opciones que coinciden, que coinciden en parte y que no coinciden con mi
paciente, y una instalación que me avise si algo quedó mal cargado, para juzgar la
aplicabilidad con casos reales del sistema y no con conteos siempre en cero.

## AC (Given/When/Then)
- **AC-1 (happy path · metadatos verificados)** · Dado el corpus de la demo ingerido con
  US-242, cuando se consulta el catálogo del corpus, entonces al menos 3 documentos tienen
  valores de población con `metadata_source = extraido_verificado`, cada valor con un
  `chunkId` de su documento y `nliResult = entailment`, y todos tienen licencia aceptada.
  `[OUT-07]` `[RN-21]` `[RN-25]`
- **AC-2 (happy path · prueba de aceptación sobre el seed)** · Dados los pares paciente +
  pregunta de la guía de demo del S4 y `LLM_PROVIDER=fake` con respuestas que citan los
  fragmentos documentados, cuando se ejecuta la prueba de aceptación contra Compose con el
  seed, entonces cada par devuelve los conteos de `applicabilitySummary` escritos en la guía:
  al menos un par con `coincide > 0` y otro con `parcial > 0`. `[OUT-07]` `[S4 resp. 8]`
- **AC-3 (borde · No coincide excluyente)** · Dado el par de la guía con el criterio
  excluyente (HER2 en mama o estado de castración en próstata) en No coincide, cuando se
  ejecuta la prueba del AC-2, entonces esa opción trae `populationNotComparable = true` y
  `warnings` con `poblacion_no_comparable`. `[OUT-07]` `[AC-08.6]`
- **AC-4 (borde · guía de demo)** · Dado `docs/demo/guia-demo-S4.md`, cuando se revisa,
  entonces documenta ≥ 2 pares paciente sintético + pregunta, cada uno con los conteos
  esperados por estado, los fragmentos que los sustentan y el caso del AC-3. `[OUT-07]`
- **AC-5 (happy path · `levantar.sh` carga metadatos y *sparse*)** · Dada una instalación
  desde cero, cuando termina `scripts/demo/levantar.sh`, entonces los documentos del corpus
  de la demo tienen sus metadatos de población cargados (no todos en `no_disponible`) y
  todos los chunks vigentes tienen `sparse_vector`. `[OUT-07]` `[S3-cierre §7.7]`
- **AC-6 (borde · verificación del seed)** · Dado un seed que deja 5 pacientes y 0 filas en
  `identity.patient_identity` (imagen obsoleta del seed), cuando `levantar.sh` llega al paso
  «Verificación del seed», entonces termina con código ≠ 0 y un mensaje que nombra el conteo
  que falló; con el seed correcto, comprueba `clinical.patient` = identidades = pacientes del
  seed, `auth."user"` y documentos del corpus contra los conteos que publica el propio seed y
  reconstruye antes la imagen del perfil `seed`. `[OUT-02]` `[OUT-04]`
- **AC-7 (borde · estado previo)** · Dados contenedores o volúmenes `oncolens_*` de una
  instalación anterior, cuando se ejecuta `levantar.sh`, entonces avisa con la lista de lo
  encontrado y pide confirmación antes de borrar; sin confirmación no borra nada y termina
  con código ≠ 0 y la orden `apagar.sh --borrar-datos`. `[OUT-03]` `[OUT-05]` (decisión F-07)
- **AC-8 (invariante · nada inventado ni real)** · Dados los metadatos y los pacientes de la
  demo, cuando corre la CI, entonces ningún valor de población carece de `chunkId` o de
  `nliResult`, los pacientes son del seed sintético (el seed se niega a correr en `piloto`) y
  el escaneo de PII y secretos no encuentra nada. `[RN-13]` `[RN-14]` `[S4 resp. 3]`

## Contexto técnico
Los metadatos se generan ejecutando US-242 sobre el corpus de la demo y se revisan con la
muestra humana de US-118 (plantilla de US-233b); el resultado se versiona como datos del corpus
público (sin pacientes) y `levantar.sh` lo carga. Los pacientes nuevos o ajustados viven en el
seed sintético de `clinical-api` (US-039) y se diseñan contra esos metadatos y DEC-11. La
prueba de aceptación es Playwright o Supertest contra Compose con `LLM_PROVIDER=fake` y
respuestas fijas de `contracts/examples/` (CLAUDE.md, E2E). `levantar.sh`: `--profile seed
build clinical-seed` antes del seed, reporte `seed_completo` sin recortar y paso de
verificación con conteos que publica el seed (no números fijos en el *script*); detección de
estado previo con confirmación (nunca borrar sin avisar). Tests: humo de `levantar.sh` con una
imagen del seed obsoleta (AC-6) y con volúmenes previos (AC-7), en la CI o como *fixture* de
PR (test después: *scripts*).

**Tareas de instalación (sin AC nuevo; cubiertas por el AC-7 y la DoD) `[S4 resp. 15]`:**
`scripts/demo/apagar.sh` cierra `attu` al terminar (OUT-05 punto 3, F-10); y el runbook
`docs/demo/runbook-demo-S1.md` §2 (limpieza inicial antes de levantar) y §5 («Si algo falla»:
volúmenes de una instalación previa con otras contraseñas, `apagar.sh --borrar-datos`) se
actualizan (OUT-03, OUT-05).

## Non-goals
El aviso de permiso del `403` (OUT-09, US-222). Corpus de ≥ 20 documentos por tipo (US-120,
S5). Herramienta de revisión humana a escala (S5).

## INVEST
**Small** ✓ 5 es el techo: datos, seed, guía y dos pasos de `levantar.sh`; si la prueba del
AC-2 se complica, separar la instalación (AC-5…AC-7) en una historia hermana (requiere
aprobación y un ID nuevo).
**Testable** ✓ una prueba de aceptación, dos humos de `levantar.sh` y chequeos de CI.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| — | backlog/01-requisitos.md §3: dueña de RN-05 = FEAT-06c | Encargo del lote 1: FEAT-06a dueña de RN-05 (recuperación) | Reparto: la recuperación solo de chunks vigentes la verifica US-055 AC-3 (dueña); el versionado sin borrado, US-059 AC-6; la ingesta del S3 lleva regresión (US-117b AC-1). No es un conflicto de fuentes, se registra para trazabilidad |
| S-01 | PRD §14 / readme §5.0: ingesta en el S3 | Slicing adoptado: ingesta en el S3 | Sin cambio |
| C-16 | CLAUDE.md: ADR-36 pendiente | readme §3.3 #36 (licencias decididas; PubMed sin licencia pendiente, TBD-04) | La ingesta (US-117a, S3; US-120, S4) queda `⛔ ADR-36` solo por la lista final de fuentes y la regla de PubMed; las licencias ya decididas se aplican desde el S1 |
| — | backlog/02-adrs.md §4.5: muestra humana de metadatos como CAL (TBD-20) | backlog/01-requisitos.md §8: DEC-14 para la muestra | 02-adrs.md: es configuración (`CORPUS_METADATA_SAMPLE_PCT`, US-118); DEC-14 quedó para la muestra de aplicabilidad (VM-3) |
| Slicing v2 | PRD §14 S3 y readme §5.0 S3: ingesta del corpus con metadatos en el S3 | Slicing v2 aprobado por el usuario (`01-requisitos.md` §15, 2026-10-07): ingesta del corpus en el S4 (antes de la aplicabilidad del S5); `CorpusRelease` `si-hay-capacidad` | Se siguió el slicing v2; la aplicabilidad (S5) consume la ingesta del S4 (US-117, US-118, US-120) |
| S3-2026-10-23 | Slicing v2: ingesta (US-117, US-118) en el S4 | Reordenamiento del 2026-10-23: ingesta en el S3 porque la aplicabilidad la consume; en el refinamiento del S3, US-117 (8 pts) se parte en US-117a (5, L1D-116) y US-117b (3, sin issue en Linear hasta que haya cupo), y en el S3 se prueba con *fixture* de texto porque `TextExtractionService` (US-082) está en el S5 `[S3 resp. 2]` | Decisión del usuario (refinamiento del S3) |
| S4-2026-10-29 | Reordenamiento del 2026-10-23: US-120 en el S4; US-117b en el S3 con `--reindex-sparse`; insumo del S4 §7: datos de demo y verificación de `levantar.sh` repartidos entre S4 y S5 | Refinamiento del S4 (usuario, 2026-10-29): US-120 al S5 con los AC-3/AC-8 de US-233 `[S4 resp. 1]` `[S4 resp. 6]`; US-117b hecha y archivada con 0 pts, AC-2 como subcomando `[S4 resp. 10]`; etapa 2 completa en el S4 con US-240 y US-242 `[S4 resp. 3]`; US-247 reúne datos de demo e instalación (OUT-02, 04, 05, 07) en el S4 | Decisión del usuario |
