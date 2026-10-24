# corpus-ingestion Specification

## Purpose
Define el catálogo del corpus en PostgreSQL (schema corpus) y su repositorio en Milvus, con versionado sin borrado, licencia aceptada por documento y solo fragmentos vigentes recuperables (RN-05, RN-21).

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

### Requirement: Carga de la semilla solo con documentos de licencia aceptada
El cargador `python -m app.scripts.load_seed_corpus` MUST cargar cada documento admisible del manifiesto de `CORPUS_SEED_MANIFEST_PATH` con `status = embebido` e `is_current = true`, y sus chunks vigentes con los metadatos denormalizados copiados del documento. La admisibilidad SHALL evaluarse por documento con la licencia del manifiesto, nunca inferida de la revista (ADR-36, RN-21).

#### Scenario: La semilla real queda embebida y vigente [US-059 AC-1] [AC-06.1] [OL-02] [FR-19] [RN-21]
- **GIVEN** el manifiesto real `data/raw/seed/manifest.yaml` (~10 documentos de mama y próstata de NCI PDQ y PMC OA con licencia `dominio_publico`, `cc_by` o `cc_by_sa` verificada uno a uno), los *embeddings* y `EMBEDDING_DIM` fijados por ADR-39 y el catálogo y la colección vacíos
- **WHEN** se ejecuta `python -m app.scripts.load_seed_corpus`
- **THEN** cada documento del manifiesto queda con `status = embebido` e `is_current = true`
- **AND** cada uno de sus chunks está en `corpus_chunks` con `is_current = true` y los mismos `source_type`, `language` y `cancer_type_tags` que su documento

### Requirement: CorpusRelease de la semilla con fecha de corte y fuentes excluidas
Al terminar una carga que cambie el conjunto de documentos vigentes, el cargador MUST publicar un `CorpusRelease` con `cutoff_date` de `CORPUS_CUTOFF_DATE`, `excluded_sources` de `CORPUS_EXCLUDED_SOURCES` y una fila de `corpus_release_document` por documento vigente (RN-22, D-09).

#### Scenario: La carga de la semilla real publica un CorpusRelease con NCCN y ESMO excluidas [US-059 AC-1] [OL-02] [FR-19] [D-09]
- **GIVEN** el manifiesto real `data/raw/seed/manifest.yaml`, `CORPUS_EXCLUDED_SOURCES = ["NCCN", "ESMO"]` y el catálogo vacío
- **WHEN** se ejecuta `python -m app.scripts.load_seed_corpus`
- **THEN** existe un `CorpusRelease` con `cutoff_date = CORPUS_CUTOFF_DATE`, `excluded_sources = ["NCCN", "ESMO"]` y exactamente una fila de `corpus_release_document` por documento cargado

### Requirement: Rechazo de documentos con licencia no aceptada o ausente
Un documento cuya licencia esté ausente o no pertenezca a `CORPUS_ACCEPTED_LICENSES` MUST quedar con `status = rechazado_licencia`, SHALL NOT generar ningún chunk en Milvus ni entrar en el `CorpusRelease`, y el cargador SHALL continuar con el resto del manifiesto (RN-21, FR-19). Una licencia ND no existe como `license_class` y se rechaza siempre.

#### Scenario: Un documento CC BY-ND y uno sin licencia se rechazan sin detener la carga [US-059 AC-2] [RN-21] [FR-19]
- **GIVEN** el manifiesto FX-06c-a con `t-nd` (licencia `CC BY-ND`), `t-sin-licencia` (sin licencia) y `t-ok-1`, el adapter de *embeddings* falso determinista y `EMBEDDING_DIM = 8`
- **WHEN** se ejecuta el cargador sobre ese manifiesto
- **THEN** `t-nd` y `t-sin-licencia` quedan con `status = rechazado_licencia` y el reporte de la carga los lista con motivo `licencia_no_aceptada` y `sin_licencia`
- **AND** ningún chunk de `corpus_chunks` tiene el `document_id` de `t-nd` ni el de `t-sin-licencia`, y ninguno de los dos está en `corpus_release_document`
- **AND** `t-ok-1` queda con `status = embebido`

### Requirement: Rechazo de fuentes excluidas aunque declaren licencia
Un documento cuyo `source_name` pertenezca a `CORPUS_EXCLUDED_SOURCES` MUST rechazarse con motivo `fuente_excluida` antes de evaluar su licencia, aunque declare una licencia aceptada, y SHALL NOT generar chunks (RN-21, D-09). La exclusión se compara sin distinguir mayúsculas ni espacios de los extremos.

#### Scenario: Un documento de NCCN con licencia declarada se rechaza por fuente excluida [US-059 AC-3] [RN-21] [D-09]
- **GIVEN** el manifiesto FX-06c-a con `t-nccn` (`source_name = "NCCN"`, texto sintético, licencia declarada `dominio_publico`) y `CORPUS_EXCLUDED_SOURCES = ["NCCN", "ESMO"]`
- **WHEN** se ejecuta el cargador
- **THEN** el reporte de la carga lista `t-nccn` como rechazado con motivo `fuente_excluida`
- **AND** `t-nccn` queda con `status = rechazado_licencia`, sin chunks en `corpus_chunks` y fuera de `corpus_release_document`

### Requirement: Criterios de población desde la fuente estructurada o no disponibles
El cargador MUST copiar a `population_criteria` los criterios que el manifiesto trae de una fuente estructurada, con `metadata_source = fuente_estructurada`, y SHALL registrar cada criterio de población no publicado en forma estructurada como `no_disponible`; en el S1 no hay extracción con LLM y ningún criterio SHALL inferirse del texto (FR-19, RN-25).

#### Scenario: Un documento con criterios estructurados los conserva y uno sin ellos queda no_disponible [US-059 AC-4] [FR-19] [RN-25]
- **GIVEN** el manifiesto FX-06c-a con `t-ok-1` (mama, NCI PDQ, sin `population_criteria` estructurados) y `t-ok-2` (próstata, con `estadio: metastasico` y `linea: primera` estructurados)
- **WHEN** se ejecuta el cargador
- **THEN** `t-ok-2` tiene `population_criteria.estadio = metastasico`, `population_criteria.linea = primera` y `metadata_source = fuente_estructurada`
- **AND** en `t-ok-1` cada criterio de población (subtipo, estadio, línea, biomarcadores, edad, ECOG) vale `no_disponible`

### Requirement: Recarga idempotente por checksum
Volver a ejecutar el cargador con el mismo manifiesto MUST dejar sin cambios el número de documentos de `corpus.corpus_document` y el de chunks de `corpus_chunks`: un documento cuyo `checksum` ya existe en su `version_group_id` SHALL omitirse sin reinsertar ni re-embeber (asumido, aceptado `[S1 resp. 3]`).

#### Scenario: Una segunda carga con el mismo manifiesto no cambia los recuentos [US-059 AC-5] [S1 resp. 3]
- **GIVEN** la semilla de FX-06c-a ya cargada y el recuento de documentos y de chunks anotado
- **WHEN** se ejecuta de nuevo el cargador con el mismo manifiesto
- **THEN** el número de filas de `corpus.corpus_document` y el de entidades de `corpus_chunks` son los mismos que antes
- **AND** el adapter de *embeddings* falso registra cero invocaciones en la segunda carga

#### Scenario: Omitir reconcilia Milvus con el catálogo [US-059 AC-6] [RN-05] [M1]
- **GIVEN** `t-ok-1` vigente cuyo reemplazo por `t-ok-1-v2` falló al confirmar el catálogo y dejó los chunks de `t-ok-1` apagados
- **WHEN** se carga de nuevo el texto de `t-ok-1`
- **THEN** el resultado es `omitido`, los chunks vigentes de Milvus son solo los de `t-ok-1` y los de `t-ok-1-v2` quedan no vigentes
- **AND** una versión reemplazada puede reingresar si su grupo quedó sin vigente (M2, aceptado por el usuario)

#### Scenario: Las revistas de ESMO se rechazan como fuente excluida [US-059 AC-3] [D-09] [P1]
- **GIVEN** documentos cuyo nombre es «Annals of Oncology» o cuyo `external_id` es un DOI `10.1016/j.annonc…` o `10.1016/j.esmoop…`, o un host `esmoopen.com` / `annalsofoncology.org`
- **WHEN** se evalúa su admisibilidad con cualquier `CORPUS_EXCLUDED_SOURCES`
- **THEN** el motivo es `fuente_excluida`

### Requirement: Una versión nueva no borra el histórico
Cuando llega un documento con el mismo `version_group_id` que uno vigente y distinto `checksum`, el cargador MUST insertarlo como nueva fila con `is_current = true`, marcar la versión anterior con `is_current = false` y `superseded_at` (reloj inyectado), marcar sus chunks con `is_current = false`, y SHALL NOT borrar ninguna fila ni ningún chunk (RN-05, ADR-5).

#### Scenario: La versión 2 de un documento lo reemplaza como vigente sin borrar la versión 1 [US-059 AC-6] [RN-05] [ADR-5]
- **GIVEN** `t-ok-1` cargado y vigente, y el reloj de test congelado
- **WHEN** se carga `t-ok-1-v2` (mismo `version_group_id`, contenido y `checksum` distintos)
- **THEN** `t-ok-1-v2` queda con `is_current = true` y `status = embebido`
- **AND** `t-ok-1` queda con `is_current = false` y `superseded_at` igual a la hora del reloj congelado, y todos sus chunks tienen `is_current = false`
- **AND** el número de filas de `corpus.corpus_document` aumentó exactamente en 1 y los chunks de `t-ok-1` siguen existiendo en `corpus_chunks`

### Requirement: Un rechazo retira la versión vigente del grupo
Un documento rechazado por licencia o fuente excluida MUST retirar la versión `embebido` y vigente de su grupo (`version_group_id`) sin borrar nada, y si no puede retirarla su resultado SHALL ser `error`, no `rechazado` (RN-21, RN-05; decidido por el usuario, 2026-10-20).

#### Scenario: Un documento embebido que vuelve con CC BY-ND deja su grupo sin versión vigente [US-059] [RN-21] [RN-05]
- **GIVEN** `t-ok-1` cargado, `embebido` y vigente, y el reloj de test congelado
- **WHEN** el manifiesto trae el mismo documento (mismo `version_group_id`) con licencia `CC BY-ND 4.0` o con su fuente en `CORPUS_EXCLUDED_SOURCES`
- **THEN** el reporte lo marca `rechazado` con `retirada_de_vigente = true`
- **AND** la versión anterior queda con `is_current = false` y `superseded_at` igual a la hora del reloj, ninguno de sus chunks de `corpus_chunks` es vigente y todos siguen existiendo
- **AND** el número de filas de `corpus.corpus_document` solo aumenta (la fila del rechazo) y se publica una `CorpusRelease` nueva que no incluye la versión retirada

#### Scenario: Si apagar la versión vigente falla el resultado es error y nada cambia [US-059] [RN-05]
- **GIVEN** `t-ok-1` cargado y vigente, y Milvus caído al apagar chunks
- **WHEN** el mismo documento vuelve rechazado
- **THEN** el reporte lo marca `error` (no `rechazado`), la versión sigue vigente en el catálogo y no se escribe la fila de rechazo

#### Scenario: Un documento retirado que vuelve con el mismo texto y la licencia corregida queda vigente [US-059] [RN-21] [RN-05]
- **GIVEN** `t-ok-1` retirado por un rechazo (sin versión vigente en su grupo)
- **WHEN** el manifiesto trae el mismo texto con una licencia aceptada
- **THEN** `t-ok-1` vuelve a `is_current = true` con `superseded_at` nulo, sus chunks son vigentes y la `CorpusRelease` nueva lo incluye
