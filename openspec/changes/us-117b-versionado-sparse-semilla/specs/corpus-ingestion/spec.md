# Spec Delta — corpus-ingestion

## MODIFIED Requirements

### Requirement: Una versión nueva no borra el histórico
Cuando llega un documento con el mismo `version_group_id` que uno vigente y distinto `checksum`, el cargador de la semilla y la ingesta del corpus MUST insertarlo como nueva fila con `is_current = true`, marcar la versión anterior con `is_current = false` y `superseded_at` (reloj inyectado), marcar sus chunks con `is_current = false`, y SHALL NOT borrar ninguna fila ni ningún chunk (RN-05, ADR-5).

#### Scenario: La versión 2 de un documento lo reemplaza como vigente sin borrar la versión 1 [US-059 AC-6] [RN-05] [ADR-5]
- **GIVEN** `t-ok-1` cargado y vigente, y el reloj de test congelado
- **WHEN** se carga `t-ok-1-v2` (mismo `version_group_id`, contenido y `checksum` distintos)
- **THEN** `t-ok-1-v2` queda con `is_current = true` y `status = embebido`
- **AND** `t-ok-1` queda con `is_current = false` y `superseded_at` igual a la hora del reloj congelado, y todos sus chunks tienen `is_current = false`
- **AND** el número de filas de `corpus.corpus_document` aumentó exactamente en 1 y los chunks de `t-ok-1` siguen existiendo en `corpus_chunks`

#### Scenario: La ingesta de i-gl-1-v2 reemplaza a i-gl-1 como vigente sin borrarlo [US-117b AC-1] [RN-05] [ADR-5] [AC-06.1]
- **GIVEN** `i-gl-1` de FX-06c-b ingerido, `embebido` y vigente, el recuento de filas de `corpus.corpus_document` y de entidades de `corpus_chunks` anotado, y el reloj de test congelado
- **WHEN** se ejecuta la ingesta con un manifiesto que trae `i-gl-1-v2` (mismo `version_group_id`, contenido y `checksum` distintos)
- **THEN** `i-gl-1-v2` queda `embebido` con `is_current = true` y sus chunks son vigentes
- **AND** `i-gl-1` queda con `is_current = false` y `superseded_at` igual a la hora del reloj congelado, y todos sus chunks tienen `is_current = false` y siguen existiendo en `corpus_chunks`
- **AND** el total de filas de `corpus.corpus_document` creció exactamente en 1 y ninguna entidad de `corpus_chunks` desapareció

#### Scenario: Una búsqueda tras la ingesta de la versión nueva solo devuelve chunks de i-gl-1-v2 [US-117b AC-1] [RN-05]
- **GIVEN** `i-gl-1-v2` ingerido sobre `i-gl-1`
- **WHEN** se busca por *dense* con el vector de un chunk de `i-gl-1`
- **THEN** ningún resultado pertenece a `i-gl-1` y los de su grupo pertenecen a `i-gl-1-v2`

#### Scenario: Si apagar los chunks de la versión anterior falla la versión nueva no se confirma y un reintento la reconcilia [US-117b AC-1] [RN-05] (asumido)
- **GIVEN** `i-gl-1` vigente y Milvus que falla al marcar sus chunks no vigentes
- **WHEN** se ingiere `i-gl-1-v2`
- **THEN** `i-gl-1-v2` queda `error` en el resumen de la ingesta y `i-gl-1` sigue `is_current = true` con `superseded_at` nulo en el catálogo
- **AND** no se borra ninguna fila ni ningún chunk, y los chunks de `i-gl-1` y de `i-gl-1-v2` quedan vigentes en Milvus hasta el reintento
- **AND** la ingesta continúa con el resto del manifiesto
- **AND** al ingerir de nuevo `i-gl-1-v2` con Milvus disponible, `i-gl-1-v2` queda vigente, `i-gl-1` y sus chunks no vigentes y el grupo tiene una sola versión vigente

## ADDED Requirements

<!-- PENDIENTE de decisión del usuario (guarda RN-12 y separación de modos de la CLI) -->
### Requirement: La reindexación sparse puebla los chunks vigentes sin cambiar su dense
`ingest --reindex-sparse` MUST escribir un `sparse_vector` no vacío, calculado con el adapter de *embeddings* que fija `SPARSE_VECTOR_SOURCE`, en cada chunk vigente de `corpus_chunks`, y SHALL NOT cambiar su `chunk_id`, `dense_vector`, `is_current` ni ningún otro campo (OL-02, FR-19). Corre con el rol `rag_corpus` y solo sobre el schema `corpus` y Milvus (SEG-06).

#### Scenario: La semilla del S1 queda con sparse sin cambiar ids ni dense [US-117b AC-2] [OL-02] [FR-19]
- **GIVEN** la semilla de FX-06c-a cargada con el cargador del S1 (chunks vigentes con `sparse_vector` vacío), el adapter *sparse* falso determinista y anotados `chunk_id` y `dense_vector` de cada chunk
- **WHEN** se ejecuta `python -m app.scripts.ingest --reindex-sparse`
- **THEN** todos los chunks vigentes tienen `sparse_vector` no vacío e igual al que devuelve el adapter para su `chunk_text`
- **AND** el conjunto de `chunk_id` y el `dense_vector` de cada uno son idénticos a los anotados, y el número de entidades de `corpus_chunks` no cambió
- **AND** el proceso termina con código 0 y el resumen informa cuántos chunks se reindexaron

#### Scenario: Los chunks no vigentes no se reindexan [US-117b AC-2] [RN-05] (asumido)
- **GIVEN** la semilla con `t-ok-1` reemplazado por `t-ok-1-v2` (chunks de `t-ok-1` no vigentes y sin *sparse*)
- **WHEN** se ejecuta `ingest --reindex-sparse`
- **THEN** los chunks de `t-ok-1` siguen con `is_current = false` y `sparse_vector` vacío, y siguen existiendo

<!-- PENDIENTE de decisión del usuario (guarda RN-12 y separación de modos de la CLI) -->
### Requirement: La reindexación sparse es idempotente y falla sin dejar datos a medias
Volver a ejecutar `ingest --reindex-sparse` MUST dejar los mismos `sparse_vector`. Si Milvus o el adapter de *embeddings* fallan, el proceso MUST terminar con código distinto de 0, nombrando la etapa y sin texto de chunks, URI ni credenciales en su salida, y los chunks ya reescritos SHALL conservar intactos su `dense_vector` y su `is_current` (asumido).

#### Scenario: Una segunda reindexación no cambia los vectores [US-117b AC-2] (asumido)
- **GIVEN** la semilla ya reindexada con `--reindex-sparse`
- **WHEN** se ejecuta de nuevo `ingest --reindex-sparse`
- **THEN** cada chunk vigente conserva el mismo `sparse_vector`, `dense_vector` y `chunk_id`, y el recuento de entidades no cambia

#### Scenario: Milvus caído durante la reindexación termina con error sin alterar el dense [US-117b AC-2] (asumido)
- **GIVEN** la semilla del S1 sin *sparse* y Milvus que falla al reescribir el segundo lote
- **WHEN** se ejecuta `ingest --reindex-sparse`
- **THEN** el proceso termina con código distinto de 0 y su salida nombra la etapa sin URI, credenciales ni texto de chunks
- **AND** ningún chunk cambió su `dense_vector`, su `chunk_id` ni su `is_current`, y una nueva ejecución completa la reindexación

Regresión [RN-05] activa desde S1 (US-055 AC-3): la recuperación solo devuelve chunks `is_current`; la búsqueda híbrida que consume el *sparse* llega con US-112.
