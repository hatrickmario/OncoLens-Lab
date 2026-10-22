# corpus-ingestion Specification

## Purpose
TBD - created by archiving change l1d-114-corpus-catalog-milvus. Update Purpose after archive.

## Requirements

### Requirement: Catálogo del corpus con su esquema final
La migración Alembic `0001_corpus_catalog` de `apps/rag-orchestrator`, ejecutada como `rag_corpus_migrator` (`[S1 resp. 14b]`), MUST crear `corpus.corpus_document`, `corpus.corpus_release` y `corpus.corpus_release_document` con las columnas, tipos y nulabilidad de `data-model.md` §4.6 (FR-19, RN-05, ADR-10). Su tabla de versiones MUST vivir en `corpus` y la migración MUST NOT crear objetos fuera de ese schema.

#### Scenario: La migración crea las tres tablas del catálogo con los metadatos finales [US-058 AC-1] [OL-02] [readme §3.1]
- **WHEN** sobre una base de test `${PG_TEST_DB_PREFIX}<id>` del arnés (creada por `oncolens_test_admin`, con el schema `corpus` vacío y `corpus-schema-grants.sql` aplicado) se ejecuta `alembic upgrade head` conectado como `rag_corpus_migrator` y se consulta `information_schema.columns`
- **THEN** existen `corpus.corpus_document` (con `license`, `license_class`, `population_criteria` de tipo `jsonb`, `metadata_source`, `study_design`, `trial_phase`, `primary_endpoint`, `sample_size`, `guideline_version`, `version_group_id`, `is_current`, `superseded_at` y `status`), `corpus.corpus_release` y `corpus.corpus_release_document`, con los tipos y la nulabilidad de `data-model.md` §4.6

#### Scenario: La migración solo toca el schema corpus [US-058 AC-1] [RN-10]
- **WHEN** tras `alembic upgrade head` se listan las tablas de todos los schemas cuyo dueño es `rag_corpus_migrator` y la tabla de versiones de Alembic
- **THEN** todas están en el schema `corpus` (incluida `corpus.alembic_version`) y ninguna en `public`, `auth`, `identity`, `clinical`, `audit` ni `research`

#### Scenario: Reaplicar la migración no cambia el catálogo [US-058 AC-1] (asumido)
- **WHEN** sobre el catálogo ya migrado se vuelve a ejecutar `alembic upgrade head`
- **THEN** no se aplica ninguna revisión y `alembic check` no reporta diferencias entre los modelos y la base

#### Scenario: Un estado de ingesta fuera del enum se rechaza [US-058 AC-1] (asumido)
- **WHEN** se inserta un `corpus_document` sintético con `status = "indexado"`
- **THEN** la inserción falla por la restricción `CHECK` de `status`, cuyos valores son exactamente `pendiente | normalizado | embebido | error | rechazado_licencia`

Regresión [RN-10] [SEG-06] activa desde S2 (US-040): con el rol `rag_corpus`, `SELECT` sobre `auth`, `identity`, `clinical`, `audit` y `research` → *permission denied*.

### Requirement: El runtime rag_corpus solo tiene DML sobre el catálogo
Tras la migración, `rag_corpus` MUST poder leer y escribir filas de las tablas del catálogo (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, concedidos por `ALTER DEFAULT PRIVILEGES` del *migrator*) y MUST NOT poder crear, alterar ni borrar objetos en `corpus` (`[S1 resp. 14b]`).

#### Scenario: rag_corpus lee y escribe el catálogo migrado [US-058 AC-1] [S1 resp. 14b]
- **WHEN** tras `alembic upgrade head` como `rag_corpus_migrator`, una conexión como `rag_corpus` inserta un `corpus_document` sintético válido, lo lee y lo borra
- **THEN** las tres operaciones funcionan

#### Scenario: El runtime rag_corpus no puede migrar [US-058 AC-1] [S1 resp. 14b]
- **WHEN** sobre una base de test con el schema `corpus` vacío se ejecuta `alembic upgrade head` conectado como `rag_corpus`, y aparte `CREATE TABLE corpus.t(id int)` como `rag_corpus`
- **THEN** ambos fallan con *permission denied* y el schema `corpus` no tiene ninguna tabla nueva

### Requirement: Licencia obligatoria y con clase cerrada en el catálogo
`corpus.corpus_document` MUST declarar `license` como `NOT NULL` y `license_class` como `NOT NULL` con una restricción cuyos valores sean exactamente `dominio_publico | cc_by | cc_by_sa | cc_by_nc`, los mismos del enum `licenseClass` del contrato (`contracts/schemas/evidence.yaml`); ninguna licencia ND SHALL existir como valor (RN-21, ADR-36, `[Pre-S1 resp. 21]`). Qué clases se aceptan en la ingesta es configuración (`CORPUS_ACCEPTED_LICENSES`), no esquema.

#### Scenario: Un documento sin licencia se rechaza [US-058 AC-4] [RN-21] [FR-19]
- **WHEN** se ejecuta un `INSERT` sintético en `corpus.corpus_document` con `license` nulo
- **THEN** falla por la restricción `NOT NULL` de `license` y la tabla no cambia

#### Scenario: Una licencia ND se rechaza [US-058 AC-4] [RN-21] [ADR-36]
- **WHEN** se ejecuta un `INSERT` sintético en `corpus.corpus_document` con `license_class = "cc_by_nd"`
- **THEN** falla por la restricción `CHECK` de `license_class` y la tabla no cambia

#### Scenario: Las clases de licencia del esquema coinciden con el contrato [US-058 AC-4] [Pre-S1 resp. 21]
- **WHEN** se comparan los valores de la restricción de `license_class` en `pg_constraint` con el enum `LicenseClass` generado del contrato
- **THEN** son el mismo conjunto de cuatro valores

### Requirement: Colección corpus_chunks con esquema final y dimensión desde configuración
El inicializador `MilvusRepository.ensure_collection()` MUST crear la colección `corpus_chunks` con los campos de `data-model.md` §4.7 (dense de dimensión `EMBEDDING_DIM`, sparse y siete campos denormalizados), con índice en cada vector e índices escalares sobre `is_current` y `cancer_type_tags` (ADR-10). Dimensión, métrica e índices MUST leerse de configuración (RN-22); el valor real lo fija ADR-39 `[S1 resp. 5]`. SHALL admitir chunks sin sparse en el S1.

#### Scenario: La colección se crea con los vectores y los campos denormalizados [US-058 AC-1] [OL-02] [ADR-10]
- **WHEN** sobre un Milvus de test sin colecciones se ejecuta el inicializador y se describe `corpus_chunks`
- **THEN** la colección tiene `dense_vector` (vector *float*), `sparse_vector` (vector *sparse float*) y los campos `source_type`, `language`, `cancer_type_tags`, `population`, `study_design`, `published_year` e `is_current`, además de `chunk_id`, `document_id`, `chunk_text`, `chunk_index`, `section` y `created_at`, y hay índices escalares sobre `is_current` y `cancer_type_tags`

#### Scenario: La dimensión del vector dense sale de la configuración [US-058 AC-2] [ADR-10] [RN-22]
- **WHEN** con `EMBEDDING_DIM=8` se crea la colección y se inserta un chunk sintético con un `dense_vector` de dimensión 8 y otro con uno de dimensión 1024
- **THEN** `dense_vector` tiene dimensión 8, la primera inserción funciona y la segunda falla con error de dimensión sin insertar nada

#### Scenario: Un chunk sin datos sparse se inserta y se recupera por dense [US-058 AC-3] [OL-02] [S1 resp. 3]
- **WHEN** se inserta un chunk sintético con `dense_vector` y sin datos sparse, y se busca por `dense_vector` con el filtro `is_current == true`
- **THEN** la inserción funciona y la búsqueda devuelve ese chunk; si la versión de Milvus fijada no admite el sparse vacío, el chunk se inserta con el sparse poblado por el adapter de *embeddings* y el esquema de la colección no cambia

Regresión [RN-05] activa desde S1 en el change de L1D-106 (US-055 AC-3): la búsqueda filtra `is_current == true` sobre el campo denormalizado que crea este requisito.

### Requirement: Inicialización idempotente del almacenamiento del corpus
`ensure_collection()` MUST ser idempotente: si `corpus_chunks` ya existe con el esquema esperado, MUST NOT borrarla, recrearla ni alterar sus entidades; si existe con un esquema distinto del que da la configuración (otra dimensión u otro campo), MUST fallar con un error explícito que nombre la diferencia, sin borrarla, porque cambiar el esquema obliga a reindexar y lo decide ADR-39.

#### Scenario: Reejecutar el inicializador no toca una colección con chunks [US-058 AC-5] [S1 resp. 3]
- **WHEN** con `corpus_chunks` ya creada y con 3 chunks sintéticos se ejecuta de nuevo el inicializador
- **THEN** la colección no se borra ni se recrea (su identificador interno no cambia) y el número de entidades sigue siendo 3

#### Scenario: Una colección con otra dimensión falla sin borrarse [US-058 AC-5] [US-058 AC-2] (asumido)
- **WHEN** `corpus_chunks` existe con `dense_vector` de dimensión 8 y el inicializador se ejecuta con `EMBEDDING_DIM=16`
- **THEN** el inicializador falla con un error que nombra `dense_vector`, la dimensión esperada y la encontrada, y la colección y sus entidades siguen intactas

### Requirement: Métrica y tipo de índice del campo denso validados
`MILVUS_DENSE_METRIC_TYPE` MUST ser `COSINE` o `IP`; otro valor SHALL impedir el arranque con un error que nombra la clave y el conjunto aceptado, nunca el valor recibido. Una colección existente con otra métrica o tipo de índice denso MUST hacer fallar el inicializador sin modificarla (usuario, 2026-10-20; la comparación aplica si es barato).

#### Scenario: Una métrica L2 se rechaza al arrancar [US-058 AC-2] [RN-22]
- **GIVEN** una configuración con `MILVUS_DENSE_METRIC_TYPE=L2`
- **WHEN** arranca `rag-orchestrator` (o se cargan los `settings`)
- **THEN** falla con un error que nombra `MILVUS_DENSE_METRIC_TYPE` y el conjunto aceptado `COSINE`, `IP`, y no contiene el valor `L2`

#### Scenario: Una colección con otra métrica o índice falla sin borrarse [US-058 AC-5] (asumido)
- **GIVEN** `corpus_chunks` creada con métrica `IP` y el inicializador ejecutado con `MILVUS_DENSE_METRIC_TYPE=COSINE`
- **WHEN** se ejecuta el inicializador
- **THEN** lanza `CorpusCollectionSchemaMismatch` nombrando el campo, lo esperado y lo encontrado, y la colección y sus entidades siguen intactas
