# Spec Delta — data-model

## Purpose

Congela en `docs/architecture/data-model.md` el esquema de datos completo de OncoLens (PostgreSQL por schema, colección Milvus, diagrama, matriz de permisos por rol y aislamiento del rol `rag_corpus`) como la fuente única del modelo que implementan las migraciones, para que no haya migraciones de datos entre sprints.

## ADDED Requirements

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
