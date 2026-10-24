# Design — l1d-116-ingesta-reanudable-licencia

## Context

En `main` existen, desde L1D-114 y L1D-115, el catálogo `corpus.*` (enum `status = pendiente | normalizado |
embebido | error | rechazado_licencia`), la colección `corpus_chunks` con `sparse_vector` (sin poblar en el S1) y el
cargador de la semilla `SeedCorpusLoader` (`app/application/seed_corpus/`) con sus reglas puras en
`app/domain/corpus_seed/` (`evaluar_admisibilidad`, `fragmentar`, `decidir_version`, `calcular_checksum`,
`resolver_criterios_poblacion`) y sus puertos (`PassageEmbedder`, `SourceFetcher`, `ChunkStoreDeIngesta`,
catálogo). `ChunkDelCorpus.sparse_vector` ya existe como `Mapping[int, float] | None`. El *sparse* de BGE-M3
(`sparse_linear`) solo está implementado en `app/evaluation/envoltorios.py` (ADR-39 fase A), no en
`app/infrastructure/embeddings/`. `CorpusSeedSettings` ya trae `CORPUS_ACCEPTED_LICENSES`,
`CORPUS_EXCLUDED_SOURCES`, `CORPUS_CHUNK_SIZE`/`OVERLAP` y el mapa de licencias. Motivación: ver `proposal.md`.

## Goals / Non-Goals

**Goals:** un servicio de aplicación de ingesta en lote, reanudable por documento, que reutilice las reglas de
dominio de la semilla sin duplicarlas y que deje el *sparse* poblado; un puerto *sparse* que US-117b reutilice para
`--reindex-sparse`.

**Non-Goals:** versionado de una versión nueva (US-117b), metadatos con LLM (US-118), PDF (US-082), reescribir
`load_seed_corpus`, paralelismo o colas (un lote es secuencial; no hay broker).

## Decisions

**D1 · `IngestionPipelineService` nuevo en `app/application/corpus_ingestion/`, que reutiliza `domain/corpus_seed`.**
El servicio orquesta admisibilidad → lectura → normalización → *checkpoint* → *chunking* → *dense* + *sparse* →
indexación → confirmación. Las reglas siguen en `domain/corpus_seed/` (un solo lugar para RN-21 y el *checksum*).
Descartadas: extender `SeedCorpusLoader` con banderas (mezcla dos responsabilidades y el cargador ya pasó su Gate 2);
copiar las reglas en un módulo nuevo (duplica RN-21, justo la deuda (1) de L1D-115).

**D2 · *Checkpoint* por documento en el catálogo, sin tabla nueva.** Tras admitir y normalizar un documento se
escribe (o se reutiliza) su fila con `status = normalizado`, `is_current = false` y el `checksum`; tras indexar sus
chunks en Milvus se confirma `embebido` con `is_current = true`. Al relanzar: fila `embebido` con el mismo `checksum`
→ `omitido` (regla `decidir_version` de la semilla); fila `pendiente`/`normalizado`/`error` con el mismo `checksum`
en el grupo → se reprocesa **con su mismo `document_id`**. `chunk_id = <document_id>:<chunk_index>` determinista y
`upsert_chunks` por `chunk_id` hacen que reprocesar reescriba, no duplique (AC-2). Extraer
`decidir_reanudacion()` en `domain/corpus_seed/versionado.py` (regla con nombre propio, testeada en unitarios).
Descartadas: un archivo de *checkpoint* local (se pierde con el contenedor y diverge del catálogo) y una tabla
`ingest_run` (cambia el esquema congelado sin necesidad).

**D3 · Puerto `SparsePassageEncoder` separado del `PassageEmbedder`.** `codificar(textos) -> list[dict[int,
float]]`. Adapter real `infrastructure/embeddings/bge_m3_sparse.py` sobre el mismo núcleo ONNX de BGE-M3
(`sparse_linear`, el mismo cálculo que `envoltorios.pesos_sparse`, que se mueve o se reutiliza sin duplicarlo) y un
fake determinista en `tests/support/`. Selección por `SPARSE_VECTOR_SOURCE` (`modelo_embeddings`; otro valor → falla
al arrancar nombrando la clave). Separado porque US-117b solo necesita el *sparse* y porque el *dense* de consulta no
lo usa. Descartada: un embedder combinado (obliga a re-embeber el *dense* en el reindexado de US-117b, cuyo AC-2 exige
que `dense_vector` no cambie).

**D4 · Fallo aislado por documento; interrupción no capturada.** Cada etapa captura `Exception` en el borde de su
puerto y deja `error` con etapa y clase (sin mensaje). `KeyboardInterrupt`/`SystemExit` (`BaseException`) **no** se
capturan: así el test del AC-2 simula la interrupción "a la fuerza" con un embedder falso que lanza una interrupción
en el tercer documento admisible, y el *checkpoint* del catálogo es lo único que sobrevive. Etapas del resumen:
`obtener_texto`, `normalizacion`, `texto`, `embeddings`, `sparse`, `milvus`. La normalización falla con texto que no
es UTF-8 válido o vacío tras normalizar.

**D5 · CLI `app/scripts/ingest.py` como raíz de composición, con `CorpusIngestSettings`.** Comparte con la semilla
licencias, fuentes excluidas, mapa de licencias y *chunking* (se extrae una base común de *settings*, sin cambiar los
nombres de las claves); el manifiesto llega por `--manifest`. Reutiliza `leer_manifiesto` (mismo formato que
FX-06c-a, con texto en disco). Código de salida: 0 si no hubo `error`, 1 si lo hubo o la configuración es inválida.
Como `load_seed_corpus`, sin `MODEL_PROVIDER=local` no hay embedder: nunca se usa uno falso fuera de los tests. Al
terminar publica un `CorpusRelease` si cambió el conjunto vigente, con la misma regla `debe_publicar_release` de la
semilla (sin escenario propio: el uso de la release en la Base del análisis es de US-119).

**D6 · FX-06c-b se parte en dos manifiestos.** `ingest-manifest.yaml` lleva `i-ct-1`, `i-lit-1`, `i-lit-2`,
`i-gl-1`, `i-nd`, `i-esmo` (AC-1…AC-4); `i-gl-1-v2` va en `ingest-manifest-v2.yaml`, que crea y usa
`us-117b-versionado-sparse-semilla`. Con `i-gl-1-v2` en el mismo manifiesto, `i-gl-1` quedaría no vigente y el AC-1
("`is_current = true`") sería falso. Los textos sintéticos de los *fixtures* los crea este change.

## Dependencias y colaboradores

- Crea: `app/application/corpus_ingestion/{ingestion_pipeline_service,ports,reporte}.py`,
  `app/infrastructure/embeddings/bge_m3_sparse.py`, `app/scripts/ingest.py`, `CorpusIngestSettings`,
  `tests/fixtures/ingest-manifest.yaml` + textos, fake `SparsePassageEncoder` en `tests/support/`.
- Modifica: `app/domain/corpus_seed/versionado.py` (`decidir_reanudacion()`), `app/config/settings.py` (base común
  y `SPARSE_VECTOR_SOURCE`), el cálculo *sparse* de `app/evaluation/envoltorios.py` si se mueve a infraestructura.
- El servicio depende solo de puertos (`PassageEmbedder`, `SparsePassageEncoder`, `SourceFetcher`,
  `ChunkStoreDeIngesta`, catálogo, `Clock`, `IdGenerator`); nunca importa `pymilvus`, SQLAlchemy ni `onnxruntime`.
- Reglas con nombre propio: `evaluar_admisibilidad()` (RN-21, existente), `decidir_reanudacion()` (nueva),
  `fragmentar()`, `calcular_checksum()`.

## Privacidad y ownership

- Solo corpus público con licencia y *fixtures* sintéticos; ningún dato clínico ni PHI. No cruza ninguna frontera
  `web → clinical-api → rag-orchestrator`: es una CLI de `rag-orchestrator`.
- Conecta como `rag_corpus` (schema `corpus`) y a Milvus; no toca `auth`/`identity`/`clinical`/`audit`/`research`
  ni `clinical-minio` (SEG-06, RN-10).
- El resumen y los *logs* llevan identificadores, resultados, motivos, etapa y clase de error; nunca texto, URLs,
  credenciales ni mensajes de excepción.
- Sin descargas nuevas: la entrada del S3 es texto en disco; las descargas, si las hubiera, siguen la lista
  `CORPUS_FETCH_ALLOWED_HOSTS` del cargador de la semilla.

## Contratos

Sin cambios en `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni `contracts/examples/`: la
ingesta es una CLI interna. Proveedor: ninguno nuevo; oasdiff sin diferencias; compatible con ADR-26.

## Evaluación

No cambia modelo, prompt, umbral ni el contenido del corpus versionado (solo *fixtures* de test): la recuperación
*dense* que mide OL-06 no cambia y el *sparse* no se usa en la recuperación hasta US-112. Sin embargo, `eval-required`
**sí se dispara** (`scripts/ci/eval-trigger-paths.yaml`: `SPARSE_VECTOR_SOURCE` en `app/config/**`, por
`CorpusIngestSettings` y `SPARSE_VECTOR_SOURCES_ADMITIDAS`). Resultado del Gate 2: neutro (baseline igual,
`ai-eval-runner` PASS). No hay medición con modelos reales hasta que se ingiera el corpus real (US-120) o se active la
híbrida (US-112).

## Risks / Trade-offs

- [Milvus rechaza un `sparse_vector` vacío para un chunk sin términos con peso] → el adapter real devuelve al menos
  el término de mayor peso; si un chunk queda vacío, el documento termina en `error` con etapa `sparse`, nunca se
  inserta sin *sparse* por la ingesta.
- [Ventana entre indexar en Milvus y confirmar en el catálogo] → misma estrategia que la semilla: la fila existe antes
  que los chunks, y el relanzamiento reprocesa con el mismo `document_id` (D2). La deuda "fallar cerrado" de L1D-115
  sigue abierta.
- [Coordinación con US-117b sobre el servicio, el adapter y FX-06c-b] → este change va primero; US-117b extiende el
  servicio y añade `ingest-manifest-v2.yaml`.
- [Mover el cálculo *sparse* de `envoltorios.py`] → si rompe la suite de ADR-39, se reutiliza por importación en vez
  de moverlo.

## Pendientes de definir

- **ClinicalTrials.gov en FX-06c-b (dueño: humano en `/sprint-start`; afecta: AC-1 y configuración).** ADR-36
  (Decisión 6) deja ClinicalTrials.gov **fuera del MVP**, pero el AC-1 espera `i-ct-1` (ClinicalTrials.gov,
  `dominio_publico`) `embebido`. Hoy la ingesta no tiene lista de fuentes admitidas (`CORPUS_ALLOWED_SOURCES`, ADR-36
  Decisión 7): sin ella `i-ct-1` entra y el AC-1 se cumple. Propuesta: no introducir `CORPUS_ALLOWED_SOURCES` en este
  change (la composición A se aplica curando el manifiesto real) y anotarlo como deuda; alternativa: introducirla y
  que la configuración de test incluya ClinicalTrials.gov, o cambiar `i-ct-1` a una fuente admitida (afecta a US-118,
  que usa sus criterios estructurados).

  > **Decidido (usuario, 2026-10-24, `[S3 resp. 19]`):** se admite ClinicalTrials.gov (ADR-36, Enmienda 1). `i-ct-1` sigue `embebido` en el AC-1. Si este change introduce `CORPUS_ALLOWED_SOURCES`, la lista incluye ClinicalTrials.gov; si no, queda como está.

## Desviaciones registradas en la implementación

- **D3 (pesos del sparse):** el adapter real necesita los pesos de `sparse_linear`, que no estaban en la configuración
  verificada de producción. `CorpusIngestSettings` añade `EMBEDDING_SPARSE_WEIGHTS_PATH` y
  `EMBEDDING_SPARSE_WEIGHTS_SHA256` (RN-22; los pesos no se versionan). **Pendiente de revisión humana** (adición fuera del design original). Detalle en `tasks.md`.
