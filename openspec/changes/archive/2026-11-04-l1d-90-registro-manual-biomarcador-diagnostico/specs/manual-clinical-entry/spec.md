## ADDED Requirements

### Requirement: Registro manual de un biomarcador normalizado por Backend 1
`POST /platform/patients/{patientId}/biomarkers` MUST crear, en una sola transacción, un `Exam` `entry_method = manual` con `exam_type = registro_manual` y su `Biomarker` `verificado` con `extraction_confidence = n_a`, y responder `201 Biomarker`. El término canónico, el código y `mapping_status` SHALL venir de `ReconciliationService` (ADR-33); el texto enviado se conserva como nombre original.

#### Scenario: Ki-67 registrado a mano queda verificado, mapeado y cierra el faltante [US-110 AC-1] [AC-04.1] [ADR-33] [Q-03]
- **GIVEN** el paciente sintético F-M2 (mama, sin Ki-67) y el catálogo de test `test-s2-1.0.0` montado
- **WHEN** un `doctor` envía `POST /platform/patients/{id}/biomarkers` con `name = "Ki-67"`, `value = "20"`, `unit = "%"`, `resultType = cuantitativo` y `performedAt = 2026-09-10`
- **THEN** responde `201` con un `Biomarker` válido contra el spec, `loincCode = LOINC-T-KI67`, `mappingStatus = mapeado` y `provenance` `{ entryMethod: manual, extractionConfidence: n_a, reviewStatus: verificado, conflict: false, sourceDocumentId: null }`
- **AND** existe un `Exam` del paciente con `entry_method = manual` y `exam_type = registro_manual`
- **AND** `GET /platform/patients/{id}/completeness` devuelve el ítem `ki67` en `presente_verificado`

#### Scenario: Con el catálogo real Ki-67 manual sale mapeado con su código LOINC [US-110 AC-1] [RN-27] [DEC-04] [S5 resp. 9]
- **GIVEN** F-M2 con el catálogo real 1.3.0 montado
- **WHEN** se registra `name = "Ki-67"`, `value = "20"`, `unit = "%"`, `resultType = cuantitativo`
- **THEN** responde `201` con `mappingStatus = mapeado` y `loincCode` igual al `codigo` de la entrada `loinc` de Ki-67 en `mama/codigos.json`

#### Scenario: Un sinónimo manual se guarda con el término canónico y el texto original [US-110 AC-1] [US-098 AC-3] [ADR-33] [S5 resp. 13]
- **WHEN** se registra `name = "ki 67"` sobre F-M2 con el catálogo de test
- **THEN** el `Biomarker` responde `name = "Ki-67"` y `loincCode = LOINC-T-KI67`, y la fila guarda `original_name = "ki 67"`

### Requirement: Término manual sin mapeo nunca se descarta ni recibe un código inventado
Un biomarcador manual cuyo término no está en el catálogo MUST guardarse con `mapping_status = no_mapeado`, sin código y con su texto original, y responder `201` (RN-27).

#### Scenario: Un marcador desconocido queda no_mapeado sin código [US-110 AC-4] [RN-27] [AC-03.3]
- **WHEN** se registra `name = "marcador XYZ"`, `value = "positivo"`, `resultType = cualitativo` sobre F-M2
- **THEN** responde `201` con `mappingStatus = no_mapeado`, `loincCode = null` y `name = "marcador XYZ"`, y la fila guarda `original_name = "marcador XYZ"`

### Requirement: Completar el diagnóstico vigente es una corrección explícita con histórico
`POST /platform/patients/{patientId}/diagnoses` con un `Diagnosis` vigente MUST crear, en una transacción, una fila nueva `manual_correction`, `verificado` e `is_active = true` con los valores del vigente más lo enviado, y pasar la anterior a `reemplazado` e `is_active = false`; nunca un `UPDATE` de los valores de la fila vigente (RN-08).

#### Scenario: Completar la gradación Nottingham crea un diagnóstico de corrección y reemplaza el anterior [US-110 AC-2] [FR-08] [RN-08] [Q-03] [Pre-S1 resp. 18]
- **GIVEN** F-M2 con un `Diagnosis` vigente de mama `TNM_8` sin gradación (`grade = null`)
- **WHEN** un `doctor` envía `POST …/diagnoses` con `grading = { gradingSystem: "nottingham", nottinghamGrade: 2 }`
- **THEN** responde `201` con un `Diagnosis` `isActive = true`, `provenance.entryMethod = manual_correction`, `provenance.reviewStatus = verificado`, el mismo `cancerType`, `stagingSystem`, `stageValue` y `diagnosedAt` del anterior, `grade = "Nottingham grado 2"` y una gradación `nottingham` con `isReference = true`
- **AND** el diagnóstico anterior queda con `review_status = reemplazado` e `is_active = false`, con sus valores intactos
- **AND** el paciente tiene exactamente un `Diagnosis` con `is_active = true`

#### Scenario: Un grade escrito a mano se rechaza [US-110 AC-2] [DEC-05] [Pre-S1 resp. 18]
- **WHEN** se envía `POST …/diagnoses` con `grade = "Nottingham grado 3"`
- **THEN** responde `422` con `error = CUERPO_INVALIDO` válido contra `ErrorDiagnosticoInvalido` y no se crea ni modifica ninguna fila

#### Scenario: Las gradaciones previas pasan al diagnóstico nuevo y la de referencia se recalcula [US-110 AC-2] [DEC-05] [S5 resp. 13]
- **GIVEN** un diagnóstico vigente de mama con una gradación `nottingham` grado 1 verificada
- **WHEN** se registra `grading = { gradingSystem: "nottingham", nottinghamGrade: 2 }`
- **THEN** el diagnóstico nuevo tiene las dos gradaciones, la manual es la de referencia (la más reciente verificada en mama) y `grade = "Nottingham grado 2"`

### Requirement: Gradación de próstata con Gleason e ISUP derivados
En próstata la gradación MUST registrarse como `gleason_isup`; `gleasonScore` e `isupGradeGroup` SHALL derivarse de los patrones y, si llegan en el cuerpo, validarse; `Diagnosis.grade` SHALL ser el texto derivado de la gradación de referencia y el TNM SHALL seguir en `staging_system`/`stage_value` (DEC-05).

#### Scenario: Gleason 4+3 deriva score 7 e ISUP 3 [US-110 AC-3] [Q-04] [DEC-05] [Pre-S1 resp. 18]
- **GIVEN** un paciente sintético de próstata con un diagnóstico vigente `TNM_8`
- **WHEN** se envía `grading = { gradingSystem: "gleason_isup", gleasonPrimaryPattern: 4, gleasonSecondaryPattern: 3, specimenType: "biopsia", gradeScope: "peor" }`
- **THEN** responde `201` con una gradación `gleasonScore = 7`, `isupGradeGroup = 3`, `isReference = true`, `grade = "Gleason 4+3=7 · ISUP 3"` y `stagingSystem`/`stageValue` sin cambios

#### Scenario: Un score o un grupo ISUP incoherentes se rechazan [US-110 AC-3] [DEC-05] [Pre-S1 resp. 29]
- **WHEN** se envían patrones 4 y 3 con `gleasonScore = 8`, o patrones 3 y 4 con `isupGradeGroup = 3`
- **THEN** responde `422` con `error = GRADACION_INCOHERENTE` y no se crea ninguna fila

#### Scenario: Score e ISUP coherentes enviados por el cliente se aceptan [US-110 AC-3] [Pre-S1 resp. 29]
- **WHEN** se envían patrones 4 y 3 con `gleasonScore = 7` e `isupGradeGroup = 3`
- **THEN** responde `201` con los mismos valores

#### Scenario: Una prostatectomía global gana como referencia a la biopsia nueva [US-110 AC-3] [DEC-05] [S5 resp. 13]
- **GIVEN** un diagnóstico vigente de próstata con una gradación `prostatectomia`/`global` 3+4
- **WHEN** se registra una gradación `biopsia`/`peor` 4+4
- **THEN** la de referencia sigue siendo la de prostatectomía y `grade = "Gleason 3+4=7 · ISUP 2"`

#### Scenario: Un sistema de gradación ajeno al tipo de cáncer se rechaza [US-110 AC-3] [DEC-05] [S5 resp. 13]
- **WHEN** se envía `grading.gradingSystem = nottingham` a un paciente de próstata
- **THEN** responde `422` con `error = VALOR_FUERA_DE_CATALOGO` y no se crea ninguna fila

### Requirement: Valores del diagnóstico validados contra el catálogo
`cancerType`, `stagingSystem` y `performanceScale` MUST pertenecer al catálogo montado (`escalas.json` y los tipos de cáncer habilitados) y `performanceValue` a su rango; si no, `422 VALOR_FUERA_DE_CATALOGO` sin crear filas. Un cuerpo que no cumple el schema responde `422 CUERPO_INVALIDO`.

#### Scenario: Un ECOG fuera de rango se rechaza sin crear filas [US-110 AC-5] [S5 resp. 13]
- **WHEN** se envía `performanceScale = ECOG` con `performanceValue = 7`
- **THEN** responde `422` con `error = VALOR_FUERA_DE_CATALOGO`, válido contra el spec, y el número de filas de `diagnosis` y `diagnosis_grading` del paciente no cambia

#### Scenario: Un sistema de estadificación fuera del catálogo se rechaza [US-110 AC-5] [S5 resp. 13]
- **WHEN** se envía `stagingSystem = "TNM_5"`
- **THEN** responde `422` con `error = VALOR_FUERA_DE_CATALOGO` y no se crea ninguna fila

#### Scenario: Un biomarcador con cuerpo inválido no crea Exam ni Biomarker [US-110 AC-5] [S5 resp. 13]
- **WHEN** se envía `POST …/biomarkers` sin `performedAt` o con `resultType = "otro"`
- **THEN** responde `422` con `error = CUERPO_INVALIDO` y no se crea ningún `Exam` ni `Biomarker`

### Requirement: Diagnóstico manual cuando no hay uno vigente
Sin `Diagnosis` activo, `POST …/diagnoses` MUST exigir `cancerType`, `stagingSystem`, `stageValue` y `diagnosedAt` y crear un `Diagnosis` `entry_method = manual`, `verificado` e `is_active = true`, con `icd10_code` y `mapping_status` decididos por `ReconciliationService`.

#### Scenario: Se crea el primer diagnóstico a mano [US-110 AC-6] [S5 resp. 13]
- **GIVEN** un paciente sintético de mama activo sin `Diagnosis` activo
- **WHEN** se envía `{ cancerType: "mama", stagingSystem: "TNM_8", stageValue: "IIA", diagnosedAt: "2026-05-02" }`
- **THEN** responde `201` con `isActive = true`, `provenance.entryMethod = manual`, `provenance.reviewStatus = verificado`, `histology = null`, `grade = null` y `gradings = []`

#### Scenario: Sin vigente y sin los campos mínimos se rechaza [US-110 AC-6] [S5 resp. 13]
- **WHEN** se envía solo `{ histology: "carcinoma ductal" }` a un paciente sin diagnóstico activo
- **THEN** responde `422` con `error = CUERPO_INVALIDO` y no se crea ninguna fila

### Requirement: Solo el oncólogo registra y nunca sobre un paciente egresado
Ambos endpoints MUST exigir `clinical:write` (el `admin` recibe `403` antes de leer el cuerpo), responder `404` si el paciente no existe y `422 PACIENTE_EGRESADO` sin crear filas si el paciente está egresado (RN-17). Ningún *log* SHALL contener el nombre, el valor ni la histología registrados.

#### Scenario: El administrador recibe 403 [US-110 AC-1] [Pre-S1 resp. 27] [S5 resp. 13]
- **WHEN** una sesión `admin` envía `POST …/biomarkers` o `POST …/diagnoses` válidos
- **THEN** responde `403` `PERMISO_DENEGADO` válido contra el spec y no se crea ninguna fila

#### Scenario: Paciente egresado no admite registros [US-110 AC-1] [RN-17] [S5 resp. 13]
- **GIVEN** un paciente sintético con estado `egresado`
- **WHEN** un `doctor` envía un biomarcador o un diagnóstico válidos
- **THEN** responde `422` con `error = PACIENTE_EGRESADO` y no se crea ninguna fila

#### Scenario: Paciente inexistente responde 404 [US-110 AC-1] [S5 resp. 13]
- **WHEN** se envía a un `patientId` con formato UUID que no existe
- **THEN** responde `404` `NO_ENCONTRADO` válido contra el spec

#### Scenario: Sin sesión responde 401 [US-110 AC-1] [S5 resp. 13]
- **WHEN** se envía cualquiera de los dos endpoints sin cookie de sesión
- **THEN** responde `401` y no se crea ninguna fila

#### Scenario: Los logs no contienen el dato registrado [US-110 AC-1] [RN-10] [S5 resp. 13]
- **WHEN** se registra `name = "marcador XYZ"` con `value = "positivo"` y un diagnóstico con `histology = "carcinoma ductal"`
- **THEN** ninguna línea de *log* capturada contiene esos textos; solo `patientId` (UUID), la operación y el `traceId`
