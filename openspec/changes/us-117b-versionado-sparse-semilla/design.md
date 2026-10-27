# Design — us-117b-versionado-sparse-semilla

## Context

- **El versionado ya existe en `main`.** `domain/corpus_seed/versionado.py` aporta `decidir_version(checksum, existentes)` →
  `DecisionDeVersion` (`accion`, `anterior_id`, `a_apagar`, `a_encender`) y `decidir_retiro`; el catálogo expone
  `reemplazar_version(nuevo, anterior_id, superseded_at)` (fila nueva + anterior no vigente en **una** transacción) y
  `MilvusRepository.marcar_no_vigentes()` (relee y reescribe con `upsert` por `chunk_id`). Lo usan `SeedCorpusLoader` (L1D-115)
  e `IngestionPipelineService` (L1D-116). **No se crean `es_version_nueva` ni `reemplazar_version_vigente`:** serían un
  duplicado de `decidir_version`.
- Orden real de `IngestionPipelineService._ingerir_texto`: `guardar_documento` (normalizado) → embeber y *sparse* →
  `upsert_chunks` de la versión nueva → apagar los chunks de la anterior (`_apagar`) → `reemplazar_version` (catálogo). El
  catálogo es la verdad y se confirma al final.
- El *sparse* ya se puebla al ingerir (`SparsePassageEncoder.codificar(textos)`, adapter `CodificadorSparseBgeM3`); la semilla
  del S1 sigue con `sparse_vector` vacío (`ChunkDelCorpus.sparse_vector = None`). ADR-39 fase A: `SPARSE_VECTOR_SOURCE=modelo_embeddings`.
- pymilvus 3.0.2.

## Goals / Non-Goals

**Goals:** una sola regla de versionado compartida por cargador e ingesta; reindexación *sparse* que solo toca ese campo.

**Non-Goals:** recalcular *dense* (cambiar de modelo obliga a reindexar todo, ADR-39: fuera); reindexar no vigentes;
`CorpusRelease` nueva tras la ingesta (US-119); paralelismo o reanudación fina de la reindexación (es idempotente: se repite).

## Decisions

**D0 — Tarea 0: refactor previo del núcleo común (usuario, 2026-10-24 y 2026-10-27).** `SeedCorpusLoader` e
`IngestionPipelineService` comparten admisibilidad, rechazo/retiro, omisión y confirmación con código casi paralelo. Antes de
tocar el versionado se extrae un núcleo común (nombres del dominio, sin cambiar comportamiento), con la **cobertura del módulo
no menor que en `main`** (bloquea, DoD). Red de seguridad: `test_omitir_apaga_los_chunks_de_la_version_huerfana_de_otro_contenido`
(ya en `main`, 9ee3e1f5) en verde antes y después, más los menores m2–m4 de Gate 2 de L1D-116. Incluye las deudas de L1D-117
5.3 (el filtro `extraido_verificado` duplicado entre el adapter SQL y `CatalogoEnMemoria`: una sola definición) y 5.4
(`documentos_extraidos_de_la_release` engorda `CorpusCatalog`: puerto de lectura de la muestra separado, ISP). Commit
`refactor(US-117b)`, sin tocar prompts, umbrales ni catálogos. Va **antes** de AC-1.

**D1 — AC-1 es una caracterización; no hay regla nueva.** La tarea 1.2 escribe el test de aceptación del versionado sobre
`IngestionPipelineService` y lo ejecuta primero. Si pasa a la primera (lo esperado: la lógica existe), queda como **test de
regresión** con su salida registrada (patrón de `l1d-181` D4); solo si falla en la aserción va como `test(US-117b)` en rojo y su
`feat`. Se reutilizan `decidir_version` / `reemplazar_version`; no se duplican.
**Orden y fallo (el real, ratificado):** `upsert` de los chunks de la versión nueva → apagar los de la anterior →
`reemplazar_version` en el catálogo. Si **apagar falla**, los chunks vigentes de v1 **y** de v2 coexisten en Milvus, el catálogo
sigue con v1 vigente y v2 no confirmada (`error`), y el documento v2 se reporta `error`; no se borra nada. La siguiente ingesta
lo reconcilia (`es_reanudacion`: mismo `chunk_id` determinista, repite apagar y confirma). La ventana en la que ambas versiones
son recuperables hasta ese reintento es la contrapartida aceptada de no apagar antes de tener la nueva escrita (apagar primero
dejaría el grupo sin ninguna vigente si el `upsert` fallara). *Descartada:* apagar antes del `upsert`.

*(Decidido (usuario, 2026-10-27))* **D2 — Reindexación por relectura y `upsert` del registro completo.** Se leen los vigentes paginados por `chunk_id`
(`is_current == true and chunk_id > <último>`, `consistency_level="Strong"`, `output_fields=["*"]`), se calcula el *sparse*
por lote con `vectorizar_pasajes_sparse(chunk_text)` y se hace `upsert` de la fila leída con solo `sparse_vector` sustituido.
Así `dense_vector` y el resto viajan byte a byte desde Milvus. *Descartada:* `upsert(partial_update=True)` — depende de la
versión del servidor y del cliente; queda como optimización si se verifica en la CI. *Descartada:* recrear la colección
(rompe AC-2: cambia nada que no sea *sparse*, y viola la inicialización idempotente de US-058 AC-5).

*(Decidido (usuario, 2026-10-27))* **D3 — Sin escritura en el catálogo durante `reindex-sparse`.** El catálogo no guarda el *sparse*; el estado `embebido`
no cambia. El resumen reporta recuentos (leídos, reindexados) y nunca texto de chunks.

*(Decidido (usuario, 2026-10-27))* **D4 — Tamaño de lote en configuración** (`CORPUS_SPARSE_REINDEX_BATCH_SIZE`, RN-22). El tope `LIMITE_DE_CONSULTA` es de infraestructura: `settings.py` no lo
importa; `MilvusRepository.listar_vigentes_paginado()` valida el lote y rechaza uno mayor.

**D5 — `reindex-sparse` es un subcomando aparte, con guarda de embeddings locales (Decidido (usuario, 2026-10-27), pregunta 6, opción A).**
El CLI de ingesta separa sus modos: `ingest` conserva `--manifest` obligatorio y su guarda de LLM; `ingest reindex-sparse` no usa
LLM ni escribe en el catálogo (D3), así que no lleva la guarda de LLM, pero **exige por código embeddings locales (RN-12)**:
`MODEL_PROVIDER=local`, pesos y *tokenizer* verificados por SHA-256 y `EMBEDDING_SPARSE_WEIGHTS_*` verificados. Si algo falla,
termina en cerrado (código ≠ 0) **nombrando la variable, nunca su valor**. Un test por modo (la guarda de `ingest` no cambia; la de
`reindex-sparse` falla cerrado con cada requisito ausente).
*Descartadas:* (a) flag `--reindex-sparse` con la guarda movida; (b) flag con la guarda de LLM siempre activa (exigiría un LLM
que no usa); (c) escape `--sin-guarda-llm` (un interruptor que apaga RN-12); (d) script de módulo separado (duplica el arranque y
la configuración del CLI).
*Condiciones a vigilar:* (1) el *sparse* de la consulta (US-112) saldrá del mismo BGE-M3, los mismos pesos y el mismo
`SPARSE_VECTOR_SOURCE` que el del corpus; se deja nota en US-112 y, si cabe, un test de consistencia índice/consulta con la misma
configuración; (2) la ingesta de documentos nuevos sigue escribiendo *dense* y *sparse*: `reindex-sparse` es solo el relleno de la
semilla; (3) la búsqueda híbrida vivirá dentro de `RAGOrchestratorService`, no en el CLI ni en el agente.

## Dependencias y colaboradores

- `IngestionPipelineService` y `SeedCorpusLoader` dependen de los puertos existentes (`CorpusCatalog`, almacén de chunks),
  nunca de `MilvusClient` ni de SQLAlchemy concretos; tras la tarea 0 comparten el núcleo común.
- *(Decidido (usuario, 2026-10-27))* Nuevo caso de uso `ReindexarSparse` en `app/application/` que recibe por parámetro el puerto de chunks
  (`listar_vigentes_paginado`, `reescribir_sparse`) y `SparsePassageEncoder` (`codificar(textos)`).
- `MilvusRepository` (`app/infrastructure/milvus/`): `listar_vigentes_paginado()` y `reescribir_sparse()`; `_fila()` deja de
  forzar el vacío cuando el chunk trae *sparse*.
- Regla extraída *(Decidido (usuario, 2026-10-27))*: `con_sparse_sustituido(fila, sparse)` (garantía de AC-2). El versionado reutiliza `decidir_version`.

## Privacidad y ownership

Solo cruza el corpus público: textos de chunks del schema `corpus` y Milvus, con el rol `rag_corpus` (SEG-06). Ningún dato
clínico, ninguna frontera web → clinical-api → rag-orchestrator implicada, sin acceso a `clinical-minio`. Sin PHI que
desidentificar (RN-11 no aplica). Los *logs* y el resumen solo llevan recuentos e ids de documento; nunca texto ni URIs.

## Contratos

Sin cambios en `apps/rag-orchestrator/openapi.yaml` ni en `apps/clinical-api/openapi.yaml`; sin ejemplos nuevos en
`contracts/examples/`. La superficie es un CLI interno (`ingest reindex-sparse`). Compatible con ADR-26.

## Evaluación

Toca el corpus indexado (*sparse*), no el *dense* ni prompts, umbrales ni modelos. La recuperación actual es *dense*: se
corre `run-ai-eval` (recall@10, MRR, «sin evidencia») para confirmar que no varía frente al baseline; la mejora del *sparse*
la mide US-112.

## Risks / Trade-offs

- [El `upsert` reescribe la entidad completa y una carrera con otra ingesta podría devolver un `is_current` viejo] → la
  reindexación y la ingesta no se ejecutan a la vez (runbook) y la lectura es `Strong`; la escritura reusa la fila recién leída.
- [Colección grande en memoria] → paginación por `chunk_id` y lote en configuración.

## Migration Plan

Tras mergear: `python -m app.scripts.ingest reindex-sparse` una vez sobre la semilla en el Compose local. Reversible: el
*sparse* no se usa en la recuperación hasta US-112.
