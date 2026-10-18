# rag-orchestrator con modelos y LLM locales: arranque fail-closed del corpus

Operación del arranque de `rag-orchestrator` con `MODEL_PROVIDER=local` y `LLM_PROVIDER=local` (US-231b AC-9, RN-12, RN-22).
Este documento **no contiene ningún valor**: solo nombres de variables y procedimientos.

## Qué compone el arranque

Con `MODEL_PROVIDER=local` y `LLM_PROVIDER=local`, `app/main.py` construye los bordes reales del corpus: Milvus
(`MILVUS_URI`, colección `MILVUS_COLLECTION_NAME`) y los lectores del schema `corpus` con el rol `rag_corpus`
(`CORPUS_DATABASE_URL` sin contraseña y con `sslmode=require`; la contraseña viene de `PG_RAG_CORPUS_PASSWORD_FILE`).
Con cualquier otra combinación no se importa ni se construye ninguno (`MODEL_PROVIDER=fake` es el modo de la CI).

## Fail-closed: qué pasa si Milvus o PostgreSQL no responden

El arranque **sonda** ambos: `SELECT 1` con `rag_corpus` y `has_collection` (más `load_collection`) en Milvus. Si alguno falla, el
proceso termina con código distinto de 0 y **nunca** recurre a un corpus falso. El error nombra solo la variable:

| El error nombra | Causa |
|---|---|
| `CORPUS_DATABASE_URL` | PostgreSQL (schema `corpus`) no responde o rechaza al rol `rag_corpus` |
| `PG_RAG_CORPUS_PASSWORD_FILE` | el archivo del secreto no existe, no se lee o está vacío |
| `MILVUS_URI` | Milvus no responde o la conexión falla |
| `MILVUS_COLLECTION_NAME` | Milvus responde pero la colección no existe (¿falta `python -m app.scripts.init_corpus_store`?) |
| `MODEL_PROVIDER`, `NLI_MODEL_SHA256`, `NLI_LABEL_INDEX_*`, `EMBEDDING_*`, … | los pesos o el mapeo de clases no pasan la verificación |

El mensaje **no** lleva la URI, el host, el puerto, el DSN, la ruta ni los hashes: lee la variable nombrada y compara con tu
configuración. Los plazos de la sonda son `MILVUS_CONNECT_TIMEOUT_SECONDS` y `CORPUS_CONNECT_TIMEOUT_SECONDS`.

## Orden de arranque

1. `postgres` sano y `corpus-migrate` completado (crea el schema `corpus`).
2. `milvus-standalone` sano (depende de `milvus-etcd` y `milvus-minio`).
3. La colección `corpus_chunks` existe (`python -m app.scripts.init_corpus_store`, o la crea el cargador de la semilla).
4. Los pesos de los tres modelos están en `MODEL_HOST_DIR` y sus `*_PATH` / `*_SHA256` en la configuración.
5. `rag-orchestrator`. Si arranca antes que los pasos 1 a 3, termina nombrando la variable de arriba: reinícialo cuando estén sanos.

## Smoke de la semilla

Con el Compose, los pesos y el manifiesto real: `python -m app.scripts.load_seed_corpus` (todos los documentos `embebido` y
vigentes, `CorpusRelease` con `excluded_sources = ["NCCN", "ESMO"]`) y después `Q-HER2` a `/rag/query`: `200 sin_evidencia` o
`503 LOCAL_LLM_UNAVAILABLE` son aceptables; `503 RETRIEVAL_UNAVAILABLE` indica composición o recuperación rotas.
