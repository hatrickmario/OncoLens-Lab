# Design — us-117b-versionado-sparse-semilla

## Context

- El cargador de la semilla (L1D-115, archivado) ya aplica la regla de versión nueva: fila nueva vigente, la anterior
  `is_current = false` + `superseded_at`, y `MilvusRepository.marcar_no_vigentes()` relee las entidades y las reescribe con
  `upsert` por `chunk_id` (Milvus no actualiza un campo suelto). El orden y la reconciliación ante fallos están en sus D3/M1/M2.
- El *sparse* existe en la colección desde US-058 (`sparse_vector`, índice `MILVUS_SPARSE_INDEX_TYPE`), pero el cargador del
  S1 inserta un vector vacío (`ChunkDelCorpus.sparse_vector = None`). ADR-39 fase A fija `SPARSE_VECTOR_SOURCE=modelo_embeddings`
  (BGE-M3, `sparse_linear`).
- US-117a (L1D-116, en paralelo) crea `IngestionPipelineService`, `app/scripts/ingest.py`, el *checkpoint* por documento,
  FX-06c-b y el puerto de *embeddings sparse*. Este change se monta encima; si al implementar el puerto *sparse* no existe aún,
  es un bloqueo de L1D-116, no se crea aquí otro.
- pymilvus 3.0.2.

## Goals / Non-Goals

**Goals:** una sola regla de versionado compartida por cargador e ingesta; reindexación *sparse* que solo toca ese campo.

**Non-Goals:** recalcular *dense* (cambiar de modelo obliga a reindexar todo, ADR-39: fuera); reindexar no vigentes;
`CorpusRelease` nueva tras la ingesta (US-119); paralelismo o reanudación fina de la reindexación (es idempotente: se repite).

## Decisions

**D1 — Extraer la regla de versión nueva a un método con nombre propio y reutilizarla.** `reemplazar_version_vigente()`
(en `app/application/`, reglas puras de decisión en `app/domain/` si hace falta: `es_version_nueva(vigente, entrante)` =
mismo `version_group_id` y distinto `checksum`) la usan el cargador de L1D-115 y `IngestionPipelineService`. Orden: apagar
chunks de la anterior en Milvus → confirmar en el catálogo (fila nueva + anterior no vigente en una transacción) → encender los
chunks nuevos; si Milvus falla al apagar, el documento queda `error` y nada cambia en el catálogo (mismo criterio que L1D-115).
*Descartada:* copiar la lógica en el pipeline (dos reglas RN-05 que divergirían, hallazgo típico del Gate 2).

**D2 — Reindexación por relectura y `upsert` del registro completo.** Se leen los vigentes paginados por `chunk_id`
(`is_current == true and chunk_id > <último>`, `consistency_level="Strong"`, `output_fields=["*"]`), se calcula el *sparse*
por lote con `vectorizar_pasajes_sparse(chunk_text)` y se hace `upsert` de la fila leída con solo `sparse_vector` sustituido.
Así `dense_vector` y el resto viajan byte a byte desde Milvus. *Descartada:* `upsert(partial_update=True)` — depende de la
versión del servidor y del cliente; queda como optimización si se verifica en la CI. *Descartada:* recrear la colección
(rompe AC-2: cambia nada que no sea *sparse*, y viola la inicialización idempotente de US-058 AC-5).

**D3 — Sin escritura en el catálogo durante `--reindex-sparse`.** El catálogo no guarda el *sparse*; el estado `embebido`
no cambia. El resumen reporta recuentos (leídos, reindexados) y nunca texto de chunks.

**D4 — Tamaño de lote en configuración** (`CORPUS_SPARSE_REINDEX_BATCH_SIZE`, RN-22) por debajo de `LIMITE_DE_CONSULTA`.

## Dependencias y colaboradores

- `IngestionPipelineService` (L1D-116) y `SeedCorpusLoader` (L1D-115) dependen del puerto de reemplazo de versión (catálogo +
  repositorio de chunks), nunca de `MilvusClient` ni de SQLAlchemy concretos.
- Nuevo caso de uso `ReindexarSparse` en `app/application/` que recibe por parámetro el puerto de chunks
  (`listar_vigentes_paginado`, `reescribir_sparse`) y el puerto *sparse* de *embeddings*.
- `MilvusRepository` (`app/infrastructure/milvus/`): `listar_vigentes_paginado()` y `reescribir_sparse()`; `_fila()` deja de
  forzar el vacío cuando el chunk trae *sparse*.
- Reglas extraídas: `es_version_nueva()` (RN-05) y `con_sparse_sustituido(fila, sparse)` (garantía de AC-2).

## Privacidad y ownership

Solo cruza el corpus público: textos de chunks del schema `corpus` y Milvus, con el rol `rag_corpus` (SEG-06). Ningún dato
clínico, ninguna frontera web → clinical-api → rag-orchestrator implicada, sin acceso a `clinical-minio`. Sin PHI que
desidentificar (RN-11 no aplica). Los *logs* y el resumen solo llevan recuentos e ids de documento; nunca texto ni URIs.

## Contratos

Sin cambios en `apps/rag-orchestrator/openapi.yaml` ni en `apps/clinical-api/openapi.yaml`; sin ejemplos nuevos en
`contracts/examples/`. La superficie es un CLI interno (`ingest --reindex-sparse`). Compatible con ADR-26.

## Evaluación

Toca el corpus indexado (*sparse*), no el *dense* ni prompts, umbrales ni modelos. La recuperación actual es *dense*: se
corre `run-ai-eval` (recall@10, MRR, «sin evidencia») para confirmar que no varía frente al baseline; la mejora del *sparse*
la mide US-112.

## Risks / Trade-offs

- [El `upsert` reescribe la entidad completa y una carrera con otra ingesta podría devolver un `is_current` viejo] → la
  reindexación y la ingesta no se ejecutan a la vez (runbook) y la lectura es `Strong`; la escritura reusa la fila recién leída.
- [Colección grande en memoria] → paginación por `chunk_id` y lote en configuración.
- [L1D-116 nombra distinto el puerto *sparse* o el servicio] → se adopta su nombre; este design no lo fija.

## Migration Plan

Tras mergear: `python -m app.scripts.ingest --reindex-sparse` una vez sobre la semilla en el Compose local. Reversible: el
*sparse* no se usa en la recuperación hasta US-112.
