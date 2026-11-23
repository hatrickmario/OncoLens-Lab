# Proposal — l1d-337-contexto-documento-chunk

## Trazabilidad

L1D-337 · US-279 · FEAT-T5e · Sprint 7 · Estimación **5** · FR-09, FR-20 (OL-06), IA-02 · M-06.1 · RN-01, RN-02,
RN-04, RN-05, RN-12, RN-21, RN-22, RN-25 · ADR-39 (chunks de 1024 y solapamiento de 51; enmienda si se adopta) ·
ADR-45 (O7, brazo A5, P6) · US-279 AC-1…AC-6 · `backlog/sprints/S7-refinamiento.md` §4 (la decisión se toma sobre el
reporte de la corrida final) y §7 (un índice de Milvus por brazo, 3 índices) · `[S7 resp. 10]` (corpus de los brazos: la
ingesta de `l1d-119`) y `[S7 resp. 11]` (umbrales actuales)

## Why

Un fragmento del corpus que no nombra el procedimiento o la enfermedad de la que habla no se recupera con la pregunta
que sí los nombra (feedback de la Demo 6, prioridad 4 del análisis de mejoras del RAG). Indexar cada chunk junto al
contexto de su documento puede corregirlo, pero solo es aceptable si el texto que se cita sigue siendo el original
(RN-04) y si la mejora se mide antes de adoptarla.

## What Changes

- **Clave nueva `CORPUS_CHUNK_CONTEXT`** (`ninguno` | `determinista` | `llm`), con `ninguno` por defecto: con ese
  valor la ingesta produce los mismos vectores e identificadores que `main`.
- **Contexto determinista:** regla pura que construye un prefijo solo con metadatos del catálogo del corpus (título,
  tipo de fuente, tipo de cáncer) y la sección del chunk. El prefijo se antepone **solo al texto que entra al
  codificador** *dense* y *sparse*; `chunk_text` (lo que se cita y la premisa del NLI) no cambia.
- **Variante `llm` (solo brazo de medición):** el LLM **local** escribe una frase de contexto por chunk, con salida
  validada por esquema; una salida inválida o un LLM caído dejan el chunk con el contexto determinista y se cuentan.
- **Subcomando `ingest reindex-context`:** reconstruye el índice de una variante en una **colección propia** de Milvus
  a partir de los chunks ya indexados, con los mismos `chunk_id`, sin tocar la colección de origen ni el catálogo
  (RN-05). El nombre de la colección identifica la variante y la ingesta rechaza la combinación que no corresponde.
- **Medición:** la suite `evaluate` compara `ninguno`, `determinista` y `llm` en la misma corrida, con un índice por
  brazo y los pares de paráfrasis de US-276. El corpus es la ingesta de `l1d-119`, la misma de la corrida base
  (`[S7 resp. 10]`): el brazo `ninguno` lee su colección y los otros dos, las colecciones reindexadas desde ella. Todos
  los brazos corren con los umbrales actuales (`[S7 resp. 11]`). La variante por defecto **no cambia en este change**: la decide el
  usuario sobre el reporte de la corrida final, junto con la enmienda de ADR-39.
- Sin cambio de contrato HTTP, sin migración de Alembic y sin cambio del esquema de `corpus_chunks`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `corpus-ingestion`: requisitos nuevos (ADDED) para la variante de contexto por configuración, el prefijo
  determinista, la separación entre el texto que se embebe y el citable, la variante con LLM local y la reindexación
  por variante en colección propia.
- `ai-evaluation`: requisito nuevo (ADDED) para la comparación de las tres variantes de contexto en la misma corrida.

## Bounded contexts

- **ai-services:** `apps/rag-orchestrator` (dominio, ingesta, adapter de Milvus, CLI, suite `evaluate`, configuración
  y tests).
- **clinical-platform** y **frontend:** no se tocan.

## Dependencias

- ↪ `l1d-334-diagnostico-etapas-recuperacion` (US-276): produce los pares de paráfrasis que usa la medición (AC-5).
- ↪ `l1d-116-ingesta-reanudable-licencia` (US-117a): adapter *sparse* real (`bge_m3_sparse.py`, tarea 1.10) y el mismo
  `IngestionPipelineService`; debe estar en `main` antes de implementar.
- ↪ `l1d-119-corpus-ampliado-calibracion` (US-120): el corpus ampliado y la corrida base del S7 son el origen de la
  reindexación de cada brazo.
- 🔗 `l1d-336-reranker-ventanas-chunk` (US-278): comparte archivos de configuración y de la suite `evaluate`; se
  implementa antes. Este change **no** hace que el *reranker* puntúe el texto con contexto: el *reranker* recibe
  siempre el `chunk_text` original. Reutiliza la fuente del índice de la suite (colección de Milvus) que añade
  `l1d-336`.
- **Orden de los archivos de la suite** (propuesta de planificación, se aprueba con el plan): `l1d-334` → `l1d-329` →
  `l1d-331` (código) → `l1d-336` → `l1d-335` → **este change**, que va el último y rebasa sobre `l1d-335`.
- ⛔ Ninguna dura. US-230 (brazo A5) sigue en borrador y no bloquea.

## Fuera de alcance

- Multivector, BM25 nativo de Milvus y PageIndex (prioridades 5–8 del análisis).
- Cambiar el tamaño del chunk, el solapamiento o `RELEVANCE_THRESHOLD`.
- Cambiar el valor por defecto de `CORPUS_CHUNK_CONTEXT` o enmendar ADR-39: decisión del usuario tras la corrida final.
- Detectar encabezados de sección en el texto plano de las fuentes (ver «Pendiente de definir» en `design.md`).
- Que el *reranker* o el LLM de generación reciban el prefijo.

## Impact

- Código: `app/domain/corpus_seed/`, `app/application/corpus_ingestion/`, `app/application/seed_corpus/`,
  `app/infrastructure/milvus/repository.py`, `app/scripts/ingest.py`, `app/config/settings.py`, `app/evaluation/`,
  `eval/configs/`.
- CI: `CORPUS_CHUNK_CONTEXT` entra en `scripts/ci/eval-trigger-paths.yaml` (dispara `eval-required`).
- Operación: una reindexación por brazo (3 colecciones de Milvus en la máquina de referencia); la variante `llm`
  añade una llamada al LLM local por chunk.
- Evaluación: dispara la suite `evaluate` con modelos locales reales (cambio de corpus indexado).
