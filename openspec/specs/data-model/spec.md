# data-model Specification

## Purpose
Congela en `docs/architecture/data-model.md` el esquema de datos completo de OncoLens (PostgreSQL por schema, colección Milvus, diagrama, matriz de permisos por rol y aislamiento del rol `rag_corpus`) como la fuente única del modelo que implementan las migraciones, para que no haya migraciones de datos entre sprints.

## Requirements

### Requirement: Modelo de datos congelado, fuente única y trazable al readme
`docs/architecture/data-model.md` MUST contener el DDL completo por schema (`auth`, `identity`, `clinical`, `audit`, `research`, `corpus`), la colección Milvus y el diagrama del modelo (el mermaid de readme §3.1 se mueve allí), partiendo de readme §3.1, con cada desviación marcada como "vacío resuelto (US-033)" y su origen. El documento SHALL ser la **única** fuente del modelo: readme §3.1 solo enlaza al documento, sin DDL ni diagramas del modelo `[Pre-S1 resp. 29]`.

#### Scenario: El documento cubre todos los schemas del readme [US-033 AC-5]
- **WHEN** se revisa el documento contra readme §3.1 y `assertDataModelDocument()` lo inspecciona
- **THEN** toda tabla del readme está presente, el diagrama del modelo está en el documento y cada diferencia lleva la marca de vacío resuelto con su decisión de origen

#### Scenario: Quitar una tabla del modelo rompe la verificación [US-033 AC-5]
- **WHEN** un parche sobre una copia en memoria del documento elimina la sección de `clinical.diagnosis_grading`
- **THEN** `assertDataModelDocument()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: El readme enlaza al modelo sin diagramas propios [US-033 AC-5] [US-033 AC-18] [Pre-S1 resp. 29]
- **WHEN** se revisa readme §3.1 tras el change
- **THEN** contiene el enlace a `docs/architecture/data-model.md` y no contiene diagramas del modelo (bloques `mermaid` de entidades) ni bloques de DDL

### Requirement: Diagnóstico genérico con gradación estructurada
La entidad `Diagnosis` MUST declarar `staging_system`, `stage_value`, `histology`, `histology_code` y `grade`; el TNM SHALL ir a `staging_system`/`stage_value` y `grade` SHALL ser siempre texto canónico **derivado** de la gradación de referencia en la tabla hija `clinical.diagnosis_grading`, nunca escrito a mano: próstata `"Gleason 4+3=7 · ISUP 3"`, mama `"Nottingham grado 2"` (DEC-05, `[Pre-S1 resp. 18]`).

#### Scenario: Diagnosis y diagnosis_grading reflejan DEC-05 y Nottingham [US-033 AC-5] [Pre-S1 resp. 18]
- **WHEN** se revisa la entidad `Diagnosis` en el documento
- **THEN** declara los cinco campos, documenta los dos formatos canónicos de `grade` y la tabla `diagnosis_grading` con `grading_system` (`gleason_isup | nottingham`), `specimen_type` (`biopsia | prostatectomia`, nullable), `grade_scope` (`nucleo_sitio | peor | global`, nullable), `gleason_primary_pattern`, `gleason_secondary_pattern`, `gleason_score`, `isup_grade_group`, `nottingham_grade` (nullables según el sistema), `is_reference`, y procedencia y `review_status` propios (sin un segundo estado de revisión)

#### Scenario: La coherencia y la gradación de referencia están documentadas [US-033 AC-5] [DEC-05]
- **WHEN** se revisa `diagnosis_grading`
- **THEN** documenta los `CHECK` por sistema (columnas de Gleason obligatorias con `gleason_isup` y nulas con `nottingham`, y al revés; `nottingham_grade` entre 1 y 3), que `gleason_score` e `isup_grade_group` se guardan siempre derivados de los patrones (en la entrada son opcionales y, si llegan, se validan), la coherencia patrones → score → grupo ISUP, y que la gradación de referencia en próstata es la de prostatectomía `global` o, si no existe, la `peor` de la biopsia, y en mama la más reciente verificada (asumido, lo confirma US-110)

### Requirement: Colección Milvus con dimensión parametrizada
La colección `corpus_chunks` MUST declarar `dense_vector` con dimensión `EMBEDDING_DIM` (configuración, sin valor fijo), `sparse_vector` y los campos denormalizados `source_type`, `language`, `cancer_type_tags`, `population`, `study_design`, `published_year` e `is_current` (ADR-10, RN-22).

#### Scenario: corpus_chunks se congela sin fijar la dimensión [US-033 AC-6]
- **WHEN** se revisa el esquema de `corpus_chunks` en el documento y `assertDataModelDocument()` lo inspecciona
- **THEN** `dense_vector` usa `EMBEDDING_DIM` sin literal numérico, existen `sparse_vector` y los siete campos denormalizados, y el documento remite el valor y el origen del vector sparse a ADR-39 y US-058

#### Scenario: Un literal de dimensión rompe la verificación [US-033 AC-6]
- **WHEN** un parche sobre una copia en memoria del documento reemplaza `EMBEDDING_DIM` por `1024`
- **THEN** `assertDataModelDocument()` reporta el hallazgo y el comando termina con código distinto de 0

### Requirement: Licencia del corpus con cuatro clases
`corpus` MUST declarar `license_class` con exactamente los valores `dominio_publico | cc_by | cc_by_sa | cc_by_nc`, iguales al enum `licenseClass` del contrato; el documento SHALL indicar que el MVP solo acepta tres en la ingesta por `CORPUS_ACCEPTED_LICENSES` y que ND no existe como valor (RN-21, E-07, `[Pre-S1 resp. 21]`).

#### Scenario: license_class coincide con el contrato [US-033 AC-12] [Pre-S1 resp. 21]
- **WHEN** se revisa la tabla del catálogo del corpus en el documento
- **THEN** `license_class` tiene los cuatro valores del enum `licenseClass` y la nota de `CORPUS_ACCEPTED_LICENSES`

### Requirement: Aislamiento del rol rag_corpus
El documento MUST describir el aislamiento del rol `rag_corpus` (readme §2.5, OL-01): `USAGE` solo sobre `corpus`; `REVOKE ALL` sobre `auth`, `identity`, `clinical`, `audit` y `research`; `ALTER DEFAULT PRIVILEGES FOR ROLE <rol de migraciones>` en esos schemas; `REVOKE ALL ON SCHEMA public FROM PUBLIC`; `pg_hba` limitado a `corpus-db-net`; sin acceso a `clinical-minio`. Ninguna tabla nueva SHALL quedar accesible a `rag_corpus`.

#### Scenario: El aislamiento cubre las tablas nuevas [US-033 AC-18] [RN-10]
- **WHEN** se revisa la sección del rol `rag_corpus` en el documento y `assertDataModelDocument()` la inspecciona
- **THEN** están las seis medidas, `ALTER DEFAULT PRIVILEGES` nombra el rol de migraciones y cubre `clinical.diagnosis_grading` y `clinical.analysis_follow_up`; los tests de *permission denied* que lo prueban en ejecución llegan con US-038

#### Scenario: Quitar una medida de aislamiento rompe la verificación [US-033 AC-18]
- **WHEN** un parche sobre una copia en memoria del documento elimina la línea de `ALTER DEFAULT PRIVILEGES` o la de `pg_hba`
- **THEN** `assertDataModelDocument()` reporta el hallazgo y el comando termina con código distinto de 0

### Requirement: Persistencia de las preguntas de seguimiento
El modelo MUST declarar `clinical.analysis_follow_up`, ligada al análisis, con `turn_number` único por análisis, la respuesta validada, las citas con su marca de fuente nueva, las columnas de `meta` (modelos, `prompt_version`, `catalog_version`) y `trace_id` (FR-31, RN-06). `question_text` SHALL guardarse enmascarado, como `query_text`, y la tabla MUST quedar "sin pseudoPatientId ni identidad" (RN-10, RN-11, `[Pre-S1 resp. 23, 29]`).

#### Scenario: analysis_follow_up está en el modelo [US-033 AC-13]
- **WHEN** se revisa el schema `clinical` del documento y `assertDataModelDocument()` lo inspecciona
- **THEN** existe `analysis_follow_up` con referencia al análisis, `turn_number` único por análisis, los campos de `FollowUpTurn`, las columnas de `meta` y `trace_id`, y la frase "sin pseudoPatientId ni identidad"

#### Scenario: El seguimiento registra proveedor y clasificación, y el snapshot no guarda el seudónimo [US-033 AC-13] [Pre-S1 resp. 36 (D-7)] [RN-11] [RN-12]
- **WHEN** se revisan `clinical.analysis_follow_up` y `clinical.ai_analysis_record.clinical_context_snapshot`
- **THEN** el seguimiento declara `llm_provider` (`local | nube`, con `CHECK`) y `data_classification`, y la nota del snapshot dice que es desidentificado y sin `pseudoPatientId`

#### Scenario: Una columna de identidad en el seguimiento rompe la verificación [US-033 AC-13] [RN-10]
- **WHEN** un parche sobre una copia en memoria del documento añade `pseudo_patient_id` a `analysis_follow_up` o elimina `trace_id`
- **THEN** `assertDataModelDocument()` reporta el hallazgo y el comando termina con código distinto de 0

#### Scenario: La pregunta se guarda enmascarada [US-033 AC-13] [Pre-S1 resp. 23] [RN-11]
- **WHEN** se revisa `analysis_follow_up.question_text`
- **THEN** el documento dice "enmascarado si tenía PII", como `query_text`, y que el contrato devuelve esa versión en `FollowUpTurn.question`

### Requirement: Estado de la cuenta
`auth.user` MUST declarar `account_status` (`pendiente | activo | desactivado | rechazado`) en lugar de `is_active`. El documento SHALL indicar que `pendiente` y `rechazado` no inician sesión y que pasar a `desactivado` revoca las sesiones vivas (E-03, `[Pre-S1 resp. 16]`).

#### Scenario: account_status reemplaza a is_active [US-033 AC-15]
- **WHEN** se revisa `auth.user` en el documento y `assertDataModelDocument()` lo inspecciona
- **THEN** existe `account_status` con los cuatro valores y no existe `is_active` en `auth.user`

#### Scenario: Solo una cuenta activa tiene sesión [US-033 AC-15] [E-03]
- **WHEN** se revisa la descripción de `account_status`
- **THEN** documenta que `pendiente` y `rechazado` no inician sesión y que `desactivado` revoca las sesiones vivas

### Requirement: Matriz de permisos con códigos concretos
El documento MUST contener la matriz de permisos con un código concreto por acción (sin comodines) y sí/no por rol (`doctor`, `admin`), y todo código de `x-permission` del spec de `clinical-api` SHALL estar en esa matriz. Para el `admin`, toda lectura clínica y toda generación con IA SHALL responder `403`; `audit:read_patient` SHALL ser "no" para todos los roles hasta que una historia lo pida (E-04, `[Pre-S1 resp. 24, 27, 29]`, B-03).

#### Scenario: La matriz enumera todos los códigos con sí/no por rol [US-033 AC-15] [Pre-S1 resp. 29]
- **WHEN** se revisa la matriz de permisos
- **THEN** contiene, con `doctor`/`admin`: `session:logout` (sí/sí), `accounts:manage` (no/sí), `patients:create` (sí/sí), `patients:lookup` (sí/sí), `opt_outs:write` (no/sí), `clinical:read` (sí/no), `clinical:write` (sí/no), `documents:read` (sí/no), `documents:upload` (sí/no), `intake_drafts:read` (sí/no), `intake_drafts:write` (sí/no), `ai_analysis:create` (sí/no), `ai_analysis:read` (sí/no), `follow_ups:create` (sí/no), `follow_ups:read` (sí/no), `case_summary:create` (sí/no), `case_summary:read` (sí/no) y `audit:read_patient` (no/no), y no contiene comodines

#### Scenario: El administrador no tiene permiso de lectura clínica [US-033 AC-15] [Pre-S1 resp. 27]
- **WHEN** se revisa la matriz de permisos por rol
- **THEN** `admin` tiene `accounts:manage`, `patients:create`, `patients:lookup`, `opt_outs:write` y `session:logout`, y "no" en `clinical:read`, `clinical:write`, `documents:read`, `documents:upload`, `intake_drafts:read`, `intake_drafts:write`, `ai_analysis:create`, `ai_analysis:read`, `follow_ups:create`, `follow_ups:read`, `case_summary:create`, `case_summary:read` y `audit:read_patient`

#### Scenario: Un código usado por el spec y ausente de la matriz rompe la verificación [US-033 AC-17] [Pre-S1 resp. 29]
- **WHEN** un parche sobre una copia en memoria del documento elimina la fila `follow_ups:create`
- **THEN** `assertOperationsDeclarePermission()` reporta que `POST …/follow-ups` usa un código fuera de la matriz y el comando termina con código distinto de 0

#### Scenario: El descifrado completo de la identidad solo ocurre por la CLI, auditado [US-033 AC-15] [Pre-S1 resp. 27] [RN-10]
- **WHEN** se revisa la fila `patients:lookup`
- **THEN** documenta que el `admin` recibe la identificación enmascarada (`PatientAdminSummary`) y que el descifrado completo para registrar un opt-out solo ocurre por la CLI (B-05) y se registra en `audit`; la matriz no contiene `patients:reveal_identity`, que añadirá US-222 en el S6 como cambio aditivo

### Requirement: Rol de migraciones del corpus rag_corpus_migrator
El documento y el script de inicialización de roles MUST describir y crear el rol `rag_corpus_migrator` (`[S1 resp. 14b]`): `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, `USAGE, CREATE` **solo** sobre `corpus`, ningún privilegio sobre `auth`, `identity`, `clinical`, `audit`, `research` ni `public`, y `pg_hba` limitado a `hostssl` desde `corpus-db-net`. Su contraseña es un secreto `*_FILE` del *one-shot* de Alembic.

#### Scenario: Solo el rol de migraciones tiene CREATE, y solo en corpus [US-035 AC-1] [US-058 AC-1] [S1 resp. 14b]
- **WHEN** se revisan `docs/architecture/data-model.md` §9, `infra/docker/postgres/initdb/10-roles.sh` y `infra/docker/postgres/sql/corpus-schema-grants.sql`
- **THEN** conceden `USAGE, CREATE` a `rag_corpus_migrator` solo `ON SCHEMA corpus`, a `rag_corpus` solo `USAGE ON SCHEMA corpus`, y ningún `GRANT … CREATE` nombra a `rag_corpus` ni concede a `rag_corpus_migrator` privilegios sobre otro schema

#### Scenario: El rol de migraciones no puede crear ni leer fuera de corpus [US-035 AC-4] [RN-10] [S1 resp. 14b]
- **GIVEN** el stack levantado con los secretos de `scripts/setup-secrets.sh` y un cliente `psql` efímero en `corpus-db-net` con la contraseña de `rag_corpus_migrator` y `sslmode=require`
- **WHEN** el smoke test ejecuta `CREATE TABLE corpus.smoke_t(id int)`, `CREATE TABLE clinical.smoke_t(id int)` y `SELECT` sobre una tabla de `clinical`
- **THEN** la primera funciona (y el smoke la elimina), y las otras dos fallan con *permission denied*

### Requirement: El runtime rag_corpus no tiene privilegios DDL
`rag_corpus` MUST conservar solo `USAGE` + DML sobre `corpus` (requisito "Aislamiento del rol rag_corpus", sin cambios) y MUST NOT tener `CREATE` en ningún schema (`[S1 resp. 14b]`).

#### Scenario: El runtime rag_corpus no puede crear objetos [US-035 AC-4] [S1 resp. 14b]
- **GIVEN** el mismo stack y un cliente `psql` efímero en `corpus-db-net` como `rag_corpus` con `sslmode=require`
- **WHEN** el smoke test ejecuta `CREATE TABLE corpus.smoke_t(id int)`
- **THEN** falla con *permission denied* y el schema `corpus` no cambia

Regresión [RN-10] [SEG-06] activa desde S2 (US-040): con `rag_corpus` y con `rag_corpus_migrator`, `SELECT` sobre `auth`, `identity`, `clinical`, `audit` y `research` → *permission denied*.

### Requirement: Migración inicial con el esquema clínico completo
La migración de Prisma `init_full_schema` de `apps/clinical-api` MUST crear, sobre un PostgreSQL vacío, los schemas `auth`, `identity`, `clinical`, `audit` y `research` con todas las tablas, columnas, FKs, índices y restricciones de `docs/architecture/data-model.md` §4.1–§4.5 y §5 (OL-01), y SHALL crear el schema `corpus` vacío, sin tablas gestionadas por Prisma (US-058). MUST NOT crear `patient_consent` (ADR-18) ni tablas que el modelo no declare.

#### Scenario: La migración crea los cinco schemas con todas las tablas del modelo [US-038 AC-1] [OL-01]
- **WHEN** sobre un PostgreSQL de test vacío se ejecuta `npx prisma migrate deploy` con la migración `init_full_schema` y se consulta `information_schema.tables`
- **THEN** existen los schemas `auth`, `identity`, `clinical`, `audit` y `research`, y en ellos exactamente las 29 tablas de la tabla de schemas de `data-model.md` §1, incluidas `clinical_event`, `prior_treatment`, `clinical_attribute`, `clinical_data_source`, `analysis_feedback`, `patient_opt_out`, `care_team_member`, `diagnosis_grading` y `analysis_follow_up`

#### Scenario: El schema corpus existe y queda vacío para Backend 2 [US-038 AC-1] [OL-01]
- **WHEN** se inspecciona el catálogo tras aplicar la migración
- **THEN** el schema `corpus` existe, no contiene ninguna tabla y `schema.prisma` no lo declara en `schemas`

#### Scenario: Una tabla del modelo ausente en la migración se detecta [US-038 AC-1]
- **WHEN** la lista de tablas del catálogo de PostgreSQL se compara con la lista literal de `data-model.md` §1 y falta una de ellas (por ejemplo, `clinical.diagnosis_grading`)
- **THEN** el test de integración falla nombrando la tabla ausente

#### Scenario: No existe la tabla de consentimiento reemplazada [US-038 AC-2] [ADR-18]
- **WHEN** con la migración aplicada se consulta `information_schema.tables` por `patient_consent` en cualquier schema
- **THEN** la consulta no devuelve ninguna fila

#### Scenario: Reaplicar la migración no cambia el esquema [US-038 AC-1] (asumido)
- **WHEN** sobre la base ya migrada se vuelve a ejecutar `npx prisma migrate deploy`
- **THEN** no se aplica ninguna migración y `prisma migrate diff` entre `schema.prisma` y la base no reporta diferencias

Regresión [RN-10] [SEG-06] activa desde S2 (US-040): con el rol `rag_corpus`, `SELECT` sobre `auth`, `identity`, `clinical`, `audit` y `research` → *permission denied*, incluidas las tablas creadas por esta migración.

### Requirement: Diagnóstico genérico y gradación DEC-05 materializados
La migración MUST crear `clinical.diagnosis` con el modelo genérico de ADR-21 y `clinical.diagnosis_grading` con el DDL literal de `data-model.md` §6 (DEC-05, validada `[S1 resp. 1]`): sus `CHECK` por sistema (`gleason_score = primario + secundario`, grupo ISUP derivado de los patrones, Nottingham 1–3) y el índice único parcial de la gradación de referencia por diagnóstico.

#### Scenario: Diagnosis y diagnosis_grading tienen las columnas de DEC-05 [US-038 AC-3] [ADR-21] [Q-04] [DEC-05]
- **WHEN** se inspeccionan las columnas de `clinical.diagnosis` y `clinical.diagnosis_grading` en `information_schema.columns`
- **THEN** `diagnosis` tiene `staging_system`, `stage_value`, `performance_scale`, `performance_value`, `histology`, `histology_code`, `grade`, `icd10_code` y `mapping_status`, y `diagnosis_grading` tiene `grading_system`, `specimen_type`, `grade_scope`, `gleason_primary_pattern`, `gleason_secondary_pattern`, `gleason_score`, `isup_grade_group`, `nottingham_grade`, `is_reference` y `review_status`, con los tipos y la nulabilidad de `data-model.md`

#### Scenario: Una gradación de Gleason coherente se guarda [US-038 AC-3] [DEC-05]
- **WHEN** se inserta en `clinical.diagnosis_grading`, sobre un diagnóstico sintético, `grading_system = gleason_isup`, `specimen_type = biopsia`, `grade_scope = peor`, patrones 4 y 3, `gleason_score = 7` e `isup_grade_group = 3`
- **THEN** la fila se guarda

#### Scenario: Un puntaje de Gleason que no suma los patrones se rechaza [US-038 AC-3] [DEC-05]
- **WHEN** se inserta una gradación `gleason_isup` con patrones 4 y 3 y `gleason_score = 8`
- **THEN** la inserción falla por el `CHECK` `diagnosis_grading_gleason_ck`

#### Scenario: Un grupo ISUP no derivado de los patrones se rechaza [US-038 AC-3] [DEC-05]
- **WHEN** se inserta una gradación `gleason_isup` con patrones 3 y 4, `gleason_score = 7` e `isup_grade_group = 3`
- **THEN** la inserción falla por el `CHECK` `diagnosis_grading_gleason_ck` (3+4 → ISUP 2)

#### Scenario: Una gradación Nottingham con columnas de Gleason se rechaza [US-038 AC-3] [DEC-05]
- **WHEN** se inserta una gradación `nottingham` con `nottingham_grade = 2` y `gleason_primary_pattern = 3`, o con `nottingham_grade = 4`
- **THEN** la inserción falla por el `CHECK` `diagnosis_grading_nottingham_ck`

#### Scenario: Solo una gradación de referencia por diagnóstico [US-038 AC-3] [DEC-05]
- **WHEN** se insertan dos gradaciones con `is_reference = true` para el mismo `diagnosis_id`
- **THEN** la segunda falla por el índice único parcial `diagnosis_grading_reference_uq`

### Requirement: Registro de análisis inmutable y sin puntaje cuando no hay evidencia
La migración MUST crear `clinical.ai_analysis_record` según `data-model.md` §4.3, con `top_relevance_score` nullable sin valor por defecto y sin `updated_at`. La tabla SHALL ser inmutable: un *trigger* `BEFORE UPDATE` MUST rechazar toda actualización de cualquier fila (RN-06, ADR-8, readme §6.1 #1).

#### Scenario: Un análisis sin evidencia guarda el puntaje como nulo [US-038 AC-4] [ADR-8] [readme §6.1 #1] [RN-02]
- **WHEN** se inserta un `ai_analysis_record` sintético con `evidence_options = []`, `status = sin_evidencia` y `top_relevance_score = null`
- **THEN** la fila se guarda y `SELECT top_relevance_score IS NULL` devuelve verdadero (no `0.0`)

#### Scenario: Actualizar un análisis persistido falla [US-038 AC-4] [RN-06] [OL-01]
- **WHEN** se ejecuta un `UPDATE` sobre cualquier columna de una fila de `clinical.ai_analysis_record`
- **THEN** el *trigger* `BEFORE UPDATE` lanza un error, la sentencia falla y la fila no cambia

#### Scenario: La tabla de análisis no tiene columna de actualización [US-038 AC-4] [OL-01]
- **WHEN** se listan las columnas de `clinical.ai_analysis_record`
- **THEN** no existe `updated_at` y `top_relevance_score` es `double precision` nullable sin `DEFAULT`

### Requirement: Integridad referencial restrictiva en el schema clínico
Toda FK del schema `clinical` MUST declararse con `ON DELETE RESTRICT` (Prisma `onDelete: Restrict`), de modo que ningún borrado en cascada elimine datos clínicos; el borrado solo lo ejecuta el proceso de retención o de baja total (`data-model.md` §5).

#### Scenario: Borrar un paciente con diagnóstico falla [US-038 AC-5] [OL-01]
- **WHEN** sobre un `clinical.patient` sintético con un `clinical.diagnosis` asociado se ejecuta `DELETE` del paciente
- **THEN** la sentencia falla por violación de la FK y el paciente y su diagnóstico siguen existiendo

#### Scenario: Ninguna FK clínica borra en cascada [US-038 AC-5] [OL-01]
- **WHEN** se consultan en `pg_constraint` las FKs de las tablas del schema `clinical`
- **THEN** todas tienen la acción de borrado `RESTRICT` y ninguna `CASCADE` ni `SET NULL`

### Requirement: Índice ciego único de la identidad
`identity.patient_identity` MUST tener una restricción única sobre `(id_type, issuing_country, national_id_hmac)` y sus columnas de documento y nombre MUST ser `bytea` cifrables (`national_id_ciphertext`, `full_name_ciphertext`), sin ninguna columna con el dato en claro (ADR-6, RN-10).

#### Scenario: Una segunda identidad con el mismo índice ciego falla [US-038 AC-6] [ADR-6]
- **WHEN** se insertan en `identity.patient_identity` dos filas sintéticas (con `id_type = sintetico`, para dos pacientes sintéticos) con el mismo `id_type`, `issuing_country` y `national_id_hmac`
- **THEN** la segunda inserción falla por la restricción única

#### Scenario: El índice ciego choca también sin país emisor [US-038 AC-6] (asumido)
- **WHEN** las dos filas sintéticas tienen el mismo `id_type` y `national_id_hmac` y `issuing_country` nulo
- **THEN** la segunda inserción falla por la restricción única (`NULLS NOT DISTINCT`)

#### Scenario: La identidad no tiene columnas en claro [US-038 AC-6] [RN-10]
- **WHEN** se listan las columnas de `identity.patient_identity` y `identity.legal_representative`
- **THEN** el documento y el nombre solo existen como columnas `bytea` `*_ciphertext` y el índice ciego como `national_id_hmac`; no hay columnas de texto con el documento ni el nombre

### Requirement: Enums nativos con valores en español
Las columnas de `data-model.md` con lista cerrada de valores MUST materializarse como enums nativos de PostgreSQL con los valores en español (OL-01 tarea 3), mapeando las tildes con `@map` (`critico @map("crítico")`). Donde el documento fija un `CHECK` literal (`diagnosis_grading`, `llm_provider`) SHALL conservarse el `CHECK`; las listas abiertas o de catálogo SHALL quedar como `text`.

#### Scenario: Los enums contienen los valores en español del modelo [US-038 AC-7] [OL-01] [readme §3.2]
- **WHEN** con la migración aplicada se listan los valores de los enums en `pg_enum`
- **THEN** `entry_method` incluye `seed` y `manual`, `ocr_status` incluye `cuarentena_pii` y `requiere_revision_identidad`, `mapping_status` incluye `no_mapeado`, `data_origin` incluye `sintetico`, `opt_out_type` incluye `analisis_ia`, y `review_status` incluye `rechazado` y `reemplazado`

#### Scenario: Un valor fuera del enum se rechaza [US-038 AC-7] (asumido)
- **WHEN** se inserta un `clinical.patient` con `data_origin = 'synthetic'`
- **THEN** la inserción falla por valor inválido del enum

#### Scenario: Los valores con tilde se guardan con tilde [US-038 AC-7] [OL-01]
- **WHEN** se listan los valores del enum de `clinical_significance`
- **THEN** contiene `crítico` (con tilde) y el cliente de Prisma lo expone como `critico`

### Requirement: Seed sintético de demo con pacientes y usuarios de OL-01
`npx prisma db seed` SHALL cargar `doc1@test.local` (`doctor`) y `admin@test.local` (`admin`), activos y con hash Argon2id, y los pacientes sintéticos (a)–(e) de OL-01 con `data_origin = sintetico`, `agreement_reference` y un `care_episode` abierto, con datos clínicos `entry_method = seed` y `review_status = verificado`. Desde el S2 MUST escribir en `identity.patient_identity` sus cinco identidades cifradas con `IdentityService` (RN-10), sin datos reales (RN-14).

#### Scenario: El seed crea los cinco pacientes sintéticos con convenio y episodio abierto [US-039 AC-1] [OL-01] [RN-15]
- **WHEN** en un entorno `APP_ENV=local` con el esquema migrado se ejecuta `npx prisma db seed`
- **THEN** `clinical.patient` contiene los pacientes (a) a (e), todos con `data_origin = sintetico` y `agreement_reference` no nulo, cada uno con un único `care_episode` con `closed_at` nulo, y todos sus `diagnosis`, `diagnosis_grading`, `biomarker`, `prior_treatment`, `clinical_event` y `clinical_attribute` tienen `entry_method = seed` y `review_status = verificado`

#### Scenario: El seed crea los usuarios de demo con hash Argon2id y sin contraseña en claro [US-039 AC-1] (asumido)
- **WHEN** se ejecuta el seed con `SEED_DOCTOR_PASSWORD_FILE` y `SEED_ADMIN_PASSWORD_FILE` apuntando a archivos ficticios de un directorio temporal y se consulta `auth.user`
- **THEN** existen `doc1@test.local` con rol `doctor` y `admin@test.local` con rol `admin`, ambos `activo`, con `password_hash` que empieza por `$argon2id$`, y ninguna columna de `auth.user` contiene el contenido de los archivos

#### Scenario: Sin la contraseña de un usuario de demo el seed aborta sin escribir [US-039 AC-1] (asumido)
- **WHEN** se ejecuta el seed sin `SEED_DOCTOR_PASSWORD_FILE` ni `SEED_DOCTOR_PASSWORD`, y en otra ejecución con `SEED_DOCTOR_PASSWORD_FILE` apuntando a un archivo vacío
- **THEN** cada ejecución sale con código ≠ 0, el mensaje nombra la variable (`SEED_DOCTOR_PASSWORD_FILE`) sin mostrar ningún valor y el número de filas de `auth.user` y `clinical.patient` no cambia

#### Scenario: El archivo de contraseña tiene prioridad sobre la variable directa [US-039 AC-1] [S1 resp. 14b]
- **WHEN** se ejecuta el seed con `SEED_DOCTOR_PASSWORD_FILE` apuntando a un archivo ficticio y `SEED_DOCTOR_PASSWORD` con otro valor ficticio distinto
- **THEN** el `password_hash` de `doc1@test.local` verifica contra el contenido del archivo y no contra la variable directa

#### Scenario: Sin archivo, la variable directa sirve de respaldo local [US-039 AC-1] [S1 resp. 14b]
- **WHEN** fuera de Compose se ejecuta el seed con `SEED_DOCTOR_PASSWORD` y `SEED_ADMIN_PASSWORD` definidas y sin las variables `*_FILE`
- **THEN** el seed termina con código 0 y los `password_hash` verifican contra esos valores

#### Scenario: El seed escribe cinco identidades cifradas [US-039 AC-1] [US-046 AC-6] (asumido)
- **WHEN** se ejecuta el seed y se cuentan las filas de `identity.patient_identity`
- **THEN** el conteo es 5, con `id_type = sintetico` y sin el número ni el nombre sintético en claro

Regresión [RN-10] activa desde S2 (US-046 AC-6): identidades sintéticas del seed cifradas con la librería de la aplicación e índice ciego (l1d-200).

### Requirement: Contenido verificable de los pacientes semilla
Los pacientes semilla SHALL tener exactamente el contenido clínico de OL-01 que lista US-039 AC-2, y los AC de otras historias MUST afirmar solo ese contenido. La gradación MUST sembrarse en `clinical.diagnosis_grading` según DEC-05 (validada `[S1 resp. 1]`), con `Diagnosis.grade` igual al texto canónico derivado de la gradación de referencia (`is_reference = true`).

#### Scenario: La paciente (a) es mama TNM_8 IIA con HER2 3+, RE positivo, estado menopáusico, histología y grado [US-039 AC-2] [OL-01] [Q-04] [DEC-05]
- **WHEN** se consulta el diagnóstico activo, los biomarcadores y los atributos de (a)
- **THEN** el diagnóstico tiene `cancer_type` mama, `staging_system = TNM_8`, `stage_value = IIA`, `performance_scale = ECOG`, `performance_value = 1`, `histology` no nula, una gradación de referencia `nottingham` y `grade = "Nottingham grado 2"`; existen los biomarcadores `HER2` con valor `3+` y `RE` (receptor de estrógeno, nombre canónico del catálogo) positivo, y un `clinical_attribute` con `attribute_key = estado_menopausico`

#### Scenario: El paciente (b) es próstata ISUP 3 con tres PSA fechados, ADT y progresión [US-039 AC-2] [OL-01] [Q-04] [DEC-05]
- **WHEN** se consulta el diagnóstico activo, los biomarcadores, los tratamientos previos y los eventos de (b)
- **THEN** el diagnóstico tiene `cancer_type` próstata, una gradación de referencia `gleason_isup` con `specimen_type = biopsia`, `grade_scope = peor`, patrones 4 y 3, `gleason_score = 7`, `isup_grade_group = 3` y `grade = "Gleason 4+3=7 · ISUP 3"`; existen tres biomarcadores PSA con fechas distintas, un `prior_treatment` de ADT y un `clinical_event` con `event_type = progresion`

#### Scenario: El paciente (c) tiene un diagnóstico inactivo y uno activo [US-039 AC-2] [OL-01]
- **WHEN** se consultan los diagnósticos de (c)
- **THEN** tiene exactamente dos, uno con `is_active = false` y otro con `is_active = true`

#### Scenario: El paciente (d) tiene un opt-out de analisis_ia registrado [US-039 AC-2] [OL-01] [FR-16]
- **WHEN** se consulta `clinical.patient_opt_out` de (d)
- **THEN** existe una fila con `opt_out_type = analisis_ia` y `action = registrado`, con `recorded_by` igual al usuario `admin@test.local`

#### Scenario: La paciente (e) es mama sin estado menopáusico ni Ki-67 [US-039 AC-2] [OL-01]
- **WHEN** se consultan los atributos y biomarcadores de (e)
- **THEN** su diagnóstico activo tiene `cancer_type` mama, no existe ningún `clinical_attribute` con `attribute_key = estado_menopausico` y no existe ningún biomarcador Ki-67

Regresión [RN-15] activa desde S5/S6 (FEAT-T4c): toda generación con IA sobre (d) responde `403`.

### Requirement: Seed idempotente
El seed SHALL ser idempotente: ejecutarlo de nuevo sobre una base ya sembrada MUST NOT crear, duplicar ni borrar filas. Las claves de los registros sembrados MUST derivarse de forma determinista (reloj y generador inyectados, sin `Date.now()`, `Math.random()` ni `uuid()` directos).

#### Scenario: Una segunda ejecución no cambia el número de filas [US-039 AC-3] [OL-01]
- **WHEN** con el seed ya aplicado se ejecuta `npx prisma db seed` de nuevo
- **THEN** el número de filas de `clinical.patient`, `identity.patient_identity`, `clinical.diagnosis`, `clinical.biomarker` y `auth.user` es el mismo que tras la primera ejecución

#### Scenario: Una segunda ejecución no altera los identificadores sembrados [US-039 AC-3] (asumido)
- **WHEN** se comparan los `id` de los pacientes semilla y de sus diagnósticos tras la primera y la segunda ejecución
- **THEN** son idénticos

### Requirement: Códigos del seed solo desde el catálogo versionado
Todo código sembrado (CIE-10, LOINC, ATC) MUST tomarse de `packages/clinical-catalogs` `1.0.0`, que solo versiona estándares con su `NOTICE-<estándar>.txt` y nombres oficiales sin modificar (DEC-04). Un término sin entrada en el catálogo SHALL quedar con código nulo y `mapping_status = no_mapeado`; el seed MUST NOT contener ni inventar códigos (RN-27).

#### Scenario: Cada código sembrado existe en el catálogo con su nombre oficial [US-039 AC-4] [DEC-04] [RN-27] [TBD-17]
- **WHEN** se ejecuta el seed y se recorre cada `icd10_code`, `loinc_code` y `atc_codes` no nulo de los datos sembrados
- **THEN** cada código es el de la entrada del catálogo del término canónico sembrado (`biomarker.name`, `prior_treatment.regimen_name`, `diagnosis.cancer_type`), esa entrada conserva el nombre oficial del estándar sin modificar, el dato tiene `mapping_status = mapeado` y existe el `NOTICE-<estándar>.txt` de ese estándar en `packages/clinical-catalogs`

#### Scenario: Un término sin entrada en el catálogo queda no_mapeado y sin código [US-039 AC-4] [RN-27]
- **WHEN** el seed siembra un biomarcador o tratamiento cuyo término canónico no tiene entrada en el catálogo
- **THEN** el dato se guarda con el código nulo y `mapping_status = no_mapeado`, y no se descarta

#### Scenario: El seed no contiene códigos escritos a mano [US-039 AC-4] [RN-27] (asumido)
- **WHEN** se buscan en `apps/clinical-api/prisma/seed.ts` y `apps/clinical-api/prisma/seed/` literales con forma de código CIE-10, LOINC o ATC
- **THEN** no aparece ninguno: los datos del seed referencian términos canónicos y el código lo resuelve el catálogo

### Requirement: Seed bloqueado en el entorno piloto
El seed MUST abortar con código de salida ≠ 0 cuando `APP_ENV=piloto`, **antes** de abrir una conexión o transacción con la base, de modo que ninguna tabla cambie (RN-13; readme §6.1 #2). El valor del entorno MUST leerse de configuración (RN-22), nunca de un literal del código.

#### Scenario: Con APP_ENV=piloto el seed aborta y ninguna tabla cambia [US-039 AC-5] [OL-01] [RN-13]
- **WHEN** con `APP_ENV=piloto` se ejecuta `npx prisma db seed` sobre una base migrada
- **THEN** el proceso termina con código ≠ 0, el mensaje indica que el seed no corre en `piloto`, el número de filas de todas las tablas de `auth`, `identity`, `clinical`, `audit` y `research` es el mismo que antes, y no se abrió ninguna transacción

#### Scenario: La guarda de entorno decide antes de tocar la base [US-039 AC-5] [RN-13]
- **WHEN** se evalúa la función pura de guarda del seed con una configuración `APP_ENV=piloto`, antes de abrir la conexión a PostgreSQL
- **THEN** lanza el error de dominio de seed bloqueado y el punto de entrada del seed no llega a abrir la conexión

#### Scenario: Sin APP_ENV el seed no presume un entorno permitido [US-039 AC-5] [RN-13] (asumido)
- **WHEN** se ejecuta el seed sin `APP_ENV` definido
- **THEN** aborta con código ≠ 0 nombrando la variable ausente y ninguna tabla cambia

### Requirement: Seed bloqueado con datos reales habilitados
`assertSeedPermitido()` MUST rechazar el seed, antes de abrir conexión o transacción, cuando `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true`, sea cual sea `APP_ENV`; ausentes o `false` no bloquean (RN-13, `[S1 resp. 14b]`).

#### Scenario: Con REAL_ANONYMIZED_ENABLED=true el seed aborta sin tocar la base [US-039 AC-5] [RN-13] [S1 resp. 14b]
- **WHEN** con `APP_ENV=local` y `REAL_ANONYMIZED_ENABLED=true` se ejecuta `npx prisma db seed` sobre una base migrada
- **THEN** el proceso termina con código ≠ 0, el mensaje nombra `REAL_ANONYMIZED_ENABLED`, no se abre la conexión a PostgreSQL y ninguna tabla cambia de número de filas

#### Scenario: Con REAL_IDENTIFIED_ENABLED=true la guarda rechaza [US-039 AC-5] [RN-13] [S1 resp. 14b]
- **WHEN** se evalúa la función pura de guarda con `APP_ENV=test` y `REAL_IDENTIFIED_ENABLED=true`
- **THEN** lanza el error de dominio de seed bloqueado nombrando `REAL_IDENTIFIED_ENABLED`

### Requirement: El seed corre como proceso one-shot
En Compose, el seed MUST ejecutarse en el servicio *one-shot* `clinical-seed`, que recibe las contraseñas del seed solo como secretos `*_FILE` y termina; el servicio `clinical-api` de runtime MUST NOT montar `seed_doctor_password` ni `seed_admin_password` (`[S1 resp. 14b]`, L1D-165 D3).

#### Scenario: Las contraseñas del seed no quedan montadas en clinical-api [US-039 AC-1] [S1 resp. 14b]
- **WHEN** el test estático de Compose (`docker compose config --format json`, secretos ficticios) lista los secretos y el entorno de `clinical-api` y de `clinical-seed`
- **THEN** `seed_doctor_password` y `seed_admin_password` aparecen solo en `clinical-seed`, con `SEED_DOCTOR_PASSWORD_FILE` y `SEED_ADMIN_PASSWORD_FILE`; `clinical-seed` tiene `restart: "no"`; y ningún servicio declara `SEED_DOCTOR_PASSWORD` ni `SEED_ADMIN_PASSWORD` en `environment:`

### Requirement: El rol rag_corpus opera solo dentro del schema corpus
`rag_corpus` MUST poder hacer `INSERT` y `SELECT` sobre las tablas de `corpus` creadas por `rag_corpus_migrator`, y MUST recibir *permission denied* en `SELECT` sobre cualquier tabla de `auth`, `identity`, `clinical`, `audit` y `research`; la CI SHALL ejecutar esta batería en cada PR conectada como `rag_corpus` por TLS.

#### Scenario: Dentro de corpus crear, insertar y leer funciona con el reparto del S1 [US-040 AC-1] [readme §2.5] [ADR-17] (asumido: AC-1 adaptado a S1 resp. 14b)
- **GIVEN** la base de test con las migraciones aplicadas y conexiones TLS como `rag_corpus_migrator` y como `rag_corpus`
- **WHEN** `rag_corpus_migrator` ejecuta `CREATE TABLE corpus.permisos_t(id int)` y `rag_corpus` ejecuta `INSERT` y `SELECT` sobre ella
- **THEN** las tres operaciones funcionan
- **AND** `CREATE TABLE corpus.otra_t(id int)` ejecutado por `rag_corpus` falla con *permission denied*

#### Scenario: rag_corpus no puede leer ningún schema clínico [US-040 AC-2] [AC-T4.4] [OL-01] [RN-10]
- **GIVEN** la misma base de test y una conexión TLS como `rag_corpus`
- **WHEN** ejecuta `SELECT` sobre una tabla de cada schema `auth`, `identity`, `clinical`, `audit` y `research` (un caso de test por schema)
- **THEN** cada consulta falla con *permission denied* (`InsufficientPrivilege`) y no devuelve filas

#### Scenario: rag_corpus_migrator tampoco puede leer los schemas clínicos [US-040 AC-2] [S1 resp. 14b]
- **GIVEN** una conexión TLS como `rag_corpus_migrator`
- **WHEN** ejecuta `SELECT` sobre una tabla de cada uno de esos cinco schemas
- **THEN** cada consulta falla con *permission denied*

### Requirement: Las tablas futuras de los schemas clínicos nacen sin acceso para rag_corpus
La migración de privilegios MUST fijar `ALTER DEFAULT PRIVILEGES` para el rol que ejecuta las migraciones de `clinical-api` en `auth`, `identity`, `clinical`, `audit` y `research`, de modo que una tabla creada después no sea accesible a `rag_corpus`.

#### Scenario: Una tabla nueva en clinical no es legible por rag_corpus [US-040 AC-3] [readme §2.5]
- **GIVEN** la migración de privilegios aplicada
- **WHEN** el rol de migraciones de `clinical-api` crea `clinical.tabla_futura_t(id int)` y `rag_corpus` hace `SELECT` sobre ella
- **THEN** la consulta falla con *permission denied*

### Requirement: rag_corpus solo se conecta desde corpus-db-net con TLS y sin credenciales ajenas
`pg_hba` MUST rechazar a `rag_corpus` desde `clinical-net` o sin TLS y aceptarlo desde `corpus-db-net` con TLS y SCRAM; la definición resuelta del servicio `rag-orchestrator` MUST NOT contener credenciales del rol de `clinical-api` ni de `clinical-minio`.

#### Scenario: Desde clinical-net o sin TLS la conexión se rechaza y desde corpus-db-net con TLS se acepta [US-040 AC-4] [readme §2.4] [SEG-06]
- **GIVEN** el stack de Compose levantado con los secretos de `scripts/setup-secrets.sh`
- **WHEN** un cliente `psql` efímero con la contraseña de `rag_corpus` intenta conectarse desde `clinical-net` con TLS, desde `corpus-db-net` con `sslmode=disable`, y desde `corpus-db-net` con `sslmode=require`
- **THEN** las dos primeras son rechazadas por `pg_hba` y la tercera se acepta con autenticación SCRAM

#### Scenario: El servicio rag-orchestrator no tiene credenciales de clinical-api ni de clinical-minio [US-040 AC-5] [OL-01]
- **GIVEN** el Compose resuelto con `docker compose config --format json` y secretos ficticios
- **WHEN** el test estático lista `environment` y `secrets` del servicio `rag-orchestrator`
- **THEN** no hay ninguna variable ni secreto con la contraseña o la URL del rol `clinical_api`, ni credenciales de `clinical-minio`

### Requirement: research_writer solo inserta en research
`research_writer` MUST poder `INSERT` en `research.episode_snapshot` y MUST recibir *permission denied* en `SELECT` y `UPDATE` (ADR-19).

#### Scenario: research_writer inserta pero no lee ni modifica [US-040 AC-6] [OL-01] [ADR-19]
- **GIVEN** la base de test con la migración de privilegios y una conexión TLS como `research_writer`
- **WHEN** ejecuta `INSERT` de una fila sintética en `research.episode_snapshot`, y después `SELECT` y `UPDATE` sobre esa tabla
- **THEN** el `INSERT` funciona y el `SELECT` y el `UPDATE` fallan con *permission denied*

Regresión [ADR-43, base separada para el corpus] activa desde S6.

### Requirement: Los biomarcadores del seed usan los nombres del catálogo de datos críticos
El seed de `clinical-api` SHALL sembrar los biomarcadores de receptores hormonales con el nombre canónico del catálogo de datos críticos (`RE` y `RP`), no con una etiqueta libre, sin inventar códigos (RN-27) y con contenido solo sintético (RN-13, RN-14).

#### Scenario: El paciente semilla (a) siembra RE con el nombre del catálogo [US-003 AC-1] [RN-27]
- **GIVEN** el seed ejecutado en un entorno `APP_ENV=local`
- **WHEN** se consultan los biomarcadores del paciente (a)
- **THEN** son `HER2` y `RE` (con `RE` positivo 80 %), ninguno llamado `Receptor de estrógeno`
- **AND** `RE` tiene `loinc_code` nulo y `mapping_status = no_mapeado` porque el catálogo no tiene entrada

#### Scenario: El checklist con el catálogo real 1.1.0 deja re, rp y BRCA presentes sobre datos sembrados [US-003 AC-1] [FR-23] [RN-27]
- **GIVEN** el catálogo real `packages/clinical-catalogs` `1.1.0` montado y pacientes sintéticos sembrados con los nombres del catálogo (semilla (a) con `RE`, semilla (c) con `RP` y un paciente de test con `RE`, `RP` y `BRCA`)
- **WHEN** se calcula el checklist de cada uno con `CompletenessService`
- **THEN** `re` está presente en (a), `rp` está presente en (c) y `re`, `rp` y `brca_germinal` están presentes en el paciente de test
- **AND** `her2_ihq` está presente en (a) y (e) porque el seed siembra el examen con `exam_type = "IHQ"` del catálogo
- **AND** `catalogVersion = "1.1.0"`

#### Scenario: Un biomarcador con el nombre antiguo no cuenta como el dato crítico [US-003 AC-1] [RN-27]
- **GIVEN** el catálogo real `1.1.0` y un paciente de mama con un biomarcador llamado `Receptor de estrógeno`
- **WHEN** se calcula el checklist
- **THEN** `re` está en `faltante`: el emparejamiento es por nombre canónico y no se infiere por similitud
