# Design — l1d-114-corpus-catalog-milvus

## Context

- `apps/rag-orchestrator/` solo tiene `openapi.yaml` y los modelos Pydantic generados
  (`app/schemas/generated/`). El esqueleto de la app, Compose y Milvus llegan con el change de L1D-164;
  los roles `rag_corpus` y `rag_corpus_migrator`, el `pg_hba.conf` y el perfil test, con L1D-165; el
  schema `corpus` vacío y el contrato del arnés de PostgreSQL de test, con L1D-168.
- **Decidido `[S1 resp. 14b]`** (Gate 1, 2026-10-14): Alembic corre como `rag_corpus_migrator` en el
  *one-shot* `corpus-migrate`; el runtime usa `rag_corpus` con `USAGE` + DML, sin `CREATE`.
- El modelo está congelado en `docs/architecture/data-model.md` §4.6 (catálogo) y §4.7 (colección):
  este change **no decide nada nuevo del modelo**; lo transcribe.
- La dimensión de `dense_vector` es `EMBEDDING_DIM` (configuración). ADR-39 fase A (change de L1D-102)
  fija el valor real; la hipótesis aceptada es A: BGE-M3, 1024, sparse propio `[S1 resp. 5]`. Los
  tests usan `EMBEDDING_DIM=8` (FX-06c-a).
- Supuestos de AC-3 y AC-5 aceptados `[S1 resp. 3]`.

## Goals / Non-Goals

**Goals:**
- Catálogo `corpus` migrado con Alembic como `rag_corpus_migrator` (*one-shot*), con licencia
  obligatoria y clases cerradas; runtime `rag_corpus` con solo `USAGE` + DML.
- Colección `corpus_chunks` con esquema final (dense + sparse + denormalizados) e índices, creada de
  forma idempotente y con dimensión y parámetros desde configuración.
- Comandos de migración e inicialización que Compose, la CI y la carga de la semilla (L1D-115)
  reutilizan.

**Non-Goals:**
- Ingesta, chunking, *embeddings* reales, versionado de documentos nuevos (US-059, US-117).
- Poblar el sparse y búsqueda híbrida (S3). Lógica de `CorpusRelease` (US-119).
- Privilegios y *permission denied* de `rag_corpus` sobre los schemas clínicos (US-040, S2).

## Decisions

### D1. Alembic con SQLAlchemy Core y tabla de versiones en `corpus`
`alembic/env.py` con `version_table_schema="corpus"`, `include_schemas` limitado a `corpus` y
`search_path=corpus`; la migración usa `op.create_table(..., schema="corpus")`. `env.py` conecta con
`CORPUS_MIGRATOR_DATABASE_URL` (sin contraseña en la URL) y la contraseña de
`PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE`; nunca con las credenciales del runtime. `0001_corpus_catalog`
emite primero `ALTER DEFAULT PRIVILEGES IN SCHEMA corpus GRANT SELECT, INSERT, UPDATE, DELETE ON
TABLES TO rag_corpus` y `… GRANT USAGE, SELECT ON SEQUENCES TO rag_corpus` (el *migrator* sobre sus
propios objetos; los privilegios por defecto son por base, así que valen igual en cada base de test) y
luego crea las tablas `[S1 resp. 14b]`. Las tablas se
describen con `sqlalchemy.Table` (Core) en `infrastructure/catalog/tables.py`, fuente de
`alembic check`. Descartado: ORM declarativo (no hay lógica de dominio que lo justifique en el S1);
SQL crudo (pierde `alembic check`).

### D2. Dominios cerrados como `CHECK` con nombre, no tipos `ENUM` de PostgreSQL
`license_class`, `status`, `source_type`, `language`, `population`, `study_design`,
`metadata_source`, `original_format` y `trial_phase` (nullable) llevan `CHECK (col IN (...))` con
nombre `ck_corpus_document_<col>`, con los valores literales de `data-model.md` §4.6. `data-model.md`
admite "CHECK o tipo enumerado"; se elige `CHECK` porque habilitar o añadir un valor después es un
`DROP/ADD CONSTRAINT` en una migración de Alembic, sin `ALTER TYPE` (que no corre en transacción en
versiones antiguas) y sin acoplar el rol de migraciones a tipos compartidos. `license` y
`license_class` son `NOT NULL` (RN-21). Un test compara el `CHECK` de `license_class` con el enum
`LicenseClass` generado del contrato (no se edita a mano). Coste de revertir: bajo (una migración).
`cancer_type_tags` se mantiene `text` (lista separada por comas) como en el documento; el campo de
Milvus es el que filtra.

### D3. Colección de Milvus: esquema explícito, índices y parámetros desde configuración
`MilvusRepository.ensure_collection()` en `infrastructure/milvus/` construye un `CollectionSchema`
con los campos de §4.7: `chunk_id` VARCHAR PK, `document_id` VARCHAR, `dense_vector`
FLOAT_VECTOR(`EMBEDDING_DIM`), `sparse_vector` SPARSE_FLOAT_VECTOR, `chunk_text` VARCHAR,
`chunk_index` INT64, `section` VARCHAR, `source_type`/`language`/`cancer_type_tags`/`population`/
`study_design` VARCHAR, `published_year` INT64, `is_current` BOOL, `created_at` INT64 (epoch en ms;
Milvus no tiene tipo fecha). Índices: dense con `MILVUS_DENSE_INDEX_TYPE` y `MILVUS_DENSE_METRIC_TYPE`
(configuración; valor por defecto propuesto `HNSW` + `IP` sobre vectores normalizados, que el ADR-39
puede cambiar), sparse con `MILVUS_SPARSE_INDEX_TYPE` (por defecto `SPARSE_INVERTED_INDEX`, métrica
`IP`) e índices escalares (`INVERTED`) sobre `is_current` y `cancer_type_tags`. Milvus exige índice en
todos los vectores para cargar la colección, por eso el sparse se indexa aunque esté vacío. Las
longitudes máximas de los VARCHAR también van en configuración (RN-22). Alternativas de esquema
(colección por fuente, particiones, búsqueda en dos pasos) ya descartadas en ADR-10 (readme §3.3 #5).

### D4. Sparse sin poblar en el S1 = vector *sparse* vacío
El repositorio inserta `{}` en `sparse_vector` cuando el chunk no trae sparse (AC-3, `[S1 resp. 3]`).
Si la versión de Milvus que fija L1D-164 rechaza el sparse vacío, el *fallback* aceptado es poblarlo
desde el S1 con el sparse del adapter de *embeddings* (BGE-M3 lo trae; el adapter falso de los tests
devuelve uno determinista), **sin cambiar el esquema**. El test de AC-3 deja constancia de qué rama
aplica, sin `skip` ni `xfail`.

### D5. Idempotencia por comparación de esquema, nunca `drop_collection`
`ensure_collection()`: si la colección no existe, la crea con índices y la carga; si existe, compara
nombre, tipo y dimensión de cada campo con el esquema esperado: igual → no hace nada (devuelve
"existente"); distinto → lanza `CorpusCollectionSchemaMismatch` con el campo, lo esperado y lo
encontrado. El código no contiene ninguna llamada a `drop_collection` (lo comprueba un test de humo).
Reindexar por cambio de modelo es una operación manual gobernada por ADR-39.

**Ampliación (decidido, usuario, 2026-10-20, revisión del PR de este change):** (a) `settings.py` valida que
`MILVUS_DENSE_METRIC_TYPE ∈ {COSINE, IP}` al arrancar (cualquier otro valor → error que nombra la clave y el
conjunto permitido, nunca otros valores); (b) si es barato con la API de `pymilvus` de la versión fijada,
`assert_schema_matches()` compara además la **métrica** y el **tipo de índice** del campo denso con la configuración
y lanza `CorpusCollectionSchemaMismatch` si difieren, también sin `drop_collection`. Si la API no expone la métrica
o el tipo de índice sin una llamada costosa o inestable, (b) se omite y el PR lo declara; (a) no es opcional.

### D6. Comandos de migración e inicialización
- `python -m app.scripts.migrate_corpus_catalog`: `alembic upgrade head` como `rag_corpus_migrator`.
  Lo ejecuta el servicio *one-shot* `corpus-migrate` de Compose (imagen de `rag-orchestrator`,
  `restart: "no"`, solo en `corpus-db-net`, único secreto `pg_rag_corpus_migrator_password` según
  L1D-165 D3); `rag-orchestrator` depende de él con `service_completed_successfully`, y su contraseña
  nunca se monta en `rag-orchestrator` `[S1 resp. 14b]`.
- `python -m app.scripts.init_corpus_store`: `ensure_collection()` (Milvus en `ai-net`), sin
  credenciales de PostgreSQL; lo ejecuta el arranque de `rag-orchestrator` (el *hook* exacto lo
  coordina L1D-164) y la CI antes de los tests de integración.
- Salida de ambos: solo tablas, colección y resultado (nunca credenciales ni contenido).

### D7. Arnés Pytest de PostgreSQL (contrato de L1D-165/L1D-168)
`tests/support/pg.py` conecta como `oncolens_test_admin` (`TEST_DATABASE_URL`, solo `CREATEDB`, desde
`corpus-db-net`, perfil test con `pg_hba.test.conf`), crea `${PG_TEST_DB_PREFIX}<id>` con sufijo
inyectado, crea el schema `corpus` vacío (equivalente al bloque de L1D-168), aplica
`infra/docker/postgres/sql/corpus-schema-grants.sql`, ejecuta Alembic como `rag_corpus_migrator` y
abre la conexión de los tests de runtime como `rag_corpus`; elimina la base al final. Nunca usa el
superusuario. Contraseñas ficticias por `*_FILE` del perfil test.

**Revalidación del prefijo (Gate 1, 2ª vuelta).** Igual que el arnés de L1D-168: antes de conectar, `pg.py`
MUST revalidar `PG_TEST_DB_PREFIX` con la misma regex que L1D-165 (`^[a-z][a-z0-9_]{2,}$`) y abortar si
`^${PG_TEST_DB_PREFIX}` casa con `${POSTGRES_DB}`, con `postgres` o con cualquier `template*` (`template0`,
`template1` o un prefijo que empiece por `template`); la misma comprobación se repite sobre el nombre generado
antes del `CREATE DATABASE` y del `DROP DATABASE`. El mensaje nombra la variable, nunca la URL de conexión.

## Privacidad y ownership

- **Fronteras:** nada cruza `web → clinical-api → rag-orchestrator` en este change. Solo
  `rag-orchestrator` toca el schema `corpus` (DDL por `rag_corpus_migrator` en el *one-shot*, DML por
  `rag_corpus` en runtime) y Milvus. No recibe ni guarda datos
  clínicos; sin credenciales ni ruta hacia `clinical-minio`.
- **Desidentificación (RN-11):** no aplica: el corpus es literatura pública, sin datos de pacientes.
  Ninguna columna del catálogo ni campo de la colección admite identidad o PHI.
- **Roles del corpus `[S1 resp. 14b]`:** la migración corre como `rag_corpus_migrator` y solo crea
  objetos en `corpus` (escenario "La migración solo toca el schema corpus"); el runtime `rag_corpus`
  tiene `USAGE` + DML y ningún `CREATE` (escenario "El runtime rag_corpus no puede migrar"). Los `REVOKE` sobre los schemas clínicos y su test de *permission
  denied* llegan con US-040 (S2); riesgo aceptado en el slicing v2 porque el S1 solo usa datos
  sintéticos.
- **Datos (RN-13, RN-14, RN-21):** los tests insertan solo filas y chunks sintéticos de FX-06c-a; no
  hay NCCN ni ESMO con contenido (solo el nombre en `t-nccn` como caso de rechazo, que usa L1D-115).
- **Logs:** sin URLs ni contenido de documentos; solo nombres de tablas, colección, conteos y errores
  de esquema.

### Pendiente de definir (para el humano en /sprint-start)

- ~~**Privilegio DDL de `rag_corpus` sobre `corpus`.**~~ **Resuelto `[S1 resp. 14b]`** (usuario,
  2026-10-14): rol separado `rag_corpus_migrator` (L1D-165) para Alembic en el *one-shot*
  `corpus-migrate`; `rag_corpus` queda con `USAGE` + DML, como dice `data-model.md` §9. Sin
  pendientes abiertos en este change.

## Contratos

Sin cambios en `apps/rag-orchestrator/openapi.yaml`, `apps/clinical-api/openapi.yaml` ni
`contracts/`. El catálogo materializa los metadatos que el contrato ya expone (`licenseClass`,
`sourceType`, …, US-033); el enum `LicenseClass` se **consume** desde los modelos Pydantic generados
para verificar el `CHECK`, nunca al revés. Proveedor/consumidor: n/a. Compatibilidad ADR-26: sin
efecto; `oasdiff` sin diferencias.

## Evaluación

No cambia modelo, prompt, umbral, catálogo clínico ni contenido del corpus: no corre `evaluate`.
Efecto indirecto: fija la estructura de indexación (dimensión, métrica e índice dense), que condiciona
recall@10 y MRR medidos desde que L1D-115 cargue la semilla. La métrica y el índice viven en
configuración para que ADR-39 los ajuste sin tocar el código.

## Dependencias y colaboradores

| Módulo | Acción | Depende de |
|---|---|---|
| `app/config/settings.py` (claves nuevas; nombre canónico `[S1 resp. 17]`) | modifica/crea | `EMBEDDING_DIM` (de L1D-102), `MILVUS_*`, `CORPUS_DATABASE_URL` + `PG_RAG_CORPUS_PASSWORD_FILE` (runtime), `CORPUS_MIGRATOR_DATABASE_URL` + `PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE` (solo Alembic) |
| `app/infrastructure/catalog/tables.py` | crea | SQLAlchemy Core; `data-model.md` §4.6 |
| `app/infrastructure/catalog/alembic/` (`env.py`, `versions/0001_corpus_catalog.py`) | crea | `tables.py`, settings |
| `app/infrastructure/milvus/schema.py` (`build_corpus_chunks_schema(settings)`) | crea | `pymilvus`, settings |
| `app/infrastructure/milvus/repository.py` (`MilvusRepository.ensure_collection()`, `insert_chunks()`, `search_dense()` mínimos) | crea | cliente `pymilvus` inyectado, `schema.py` |
| `app/scripts/migrate_corpus_catalog.py` | crea | Alembic (como `rag_corpus_migrator`) |
| `app/scripts/init_corpus_store.py` | crea | `MilvusRepository` |
| servicio `corpus-migrate` en `infra/docker/docker-compose.yml` | crea | imagen de `rag-orchestrator`, secreto de L1D-165 D3 |
| `tests/support/pg.py` | crea | contrato de arnés de L1D-165/L1D-168 (D7) |
| `tests/integration/corpus_store/` | crea | `tests/support/pg.py`, Milvus de test de L1D-164 |

- `MilvusRepository` es el adapter de un puerto `CorpusChunkStore` en `application/ports/` (lo
  consumen L1D-106 y L1D-115); aquí solo se define la parte que el AC necesita (crear, insertar,
  buscar dense), sin anticipar la híbrida.
- Reglas con nombre propio: `build_corpus_chunks_schema()` (único lugar del esquema esperado) y
  `assert_schema_matches()` (comparación de D5). Sin reglas de dominio RN puras: no hay métodos en
  `domain/`.
- Milvus es real en integración (servicio de test); no se mockea en estos tests porque lo verificado
  es el propio esquema.

## Risks / Trade-offs

- **Versión de Milvus y sparse vacío** (D4): riesgo declarado en OL-02; mitigado por el *fallback*
  aceptado sin cambio de esquema.
- **Orden de arranque** (`[S1 resp. 14b]`): si `corpus-migrate` falla, `rag-orchestrator` no arranca
  (`service_completed_successfully`); el log del *one-shot* nombra la revisión y el error, sin
  credenciales.
- **Dimensión real antes de ADR-39**: si se crea la colección del entorno de demo antes de que L1D-102
  publique `EMBEDDING_DIM`, habría que recrearla; D5 lo detecta y falla en lugar de borrar.
- **Milvus en la CI**: añade tiempo (etcd + MinIO + standalone); se reutiliza el servicio de Compose
  de L1D-164 en un solo job de integración.
