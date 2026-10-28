# Spec Delta — data-model

## ADDED Requirements

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

## MODIFIED Requirements


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
