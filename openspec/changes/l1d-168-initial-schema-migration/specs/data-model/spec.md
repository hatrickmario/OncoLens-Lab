## ADDED Requirements

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
