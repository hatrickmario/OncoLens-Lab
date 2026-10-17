## ADDED Requirements

### Requirement: Seed sintético de demo con pacientes y usuarios de OL-01
`npx prisma db seed` SHALL cargar los usuarios de demo `doc1@test.local` (`doctor`) y `admin@test.local` (`admin`), activos, con hash Argon2id, y los pacientes sintéticos (a)–(e) de OL-01, cada uno con `data_origin = sintetico`, `agreement_reference` no nulo y un `care_episode` abierto, y sus datos clínicos con `entry_method = seed` y `review_status = verificado`. En el S1 MUST NOT escribir `identity.patient_identity` (RN-14: sin contraseñas ni datos reales en el repo).

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

#### Scenario: El seed del S1 no escribe identidad [US-039 AC-1] (asumido)
- **WHEN** se ejecuta el seed y se cuentan las filas de `identity.patient_identity`
- **THEN** el conteo es 0

Regresión [RN-10] activa desde S2 (US-046 AC-6): identidades sintéticas del seed cifradas con la librería de la aplicación e índice ciego.

### Requirement: Contenido verificable de los pacientes semilla
Los pacientes semilla SHALL tener exactamente el contenido clínico de OL-01 que lista US-039 AC-2, y los AC de otras historias MUST afirmar solo ese contenido. La gradación MUST sembrarse en `clinical.diagnosis_grading` según DEC-05 (validada `[S1 resp. 1]`), con `Diagnosis.grade` igual al texto canónico derivado de la gradación de referencia (`is_reference = true`).

#### Scenario: La paciente (a) es mama TNM_8 IIA con HER2 3+, RE positivo, estado menopáusico, histología y grado [US-039 AC-2] [OL-01] [Q-04] [DEC-05]
- **WHEN** se consulta el diagnóstico activo, los biomarcadores y los atributos de (a)
- **THEN** el diagnóstico tiene `cancer_type` mama, `staging_system = TNM_8`, `stage_value = IIA`, `performance_scale = ECOG`, `performance_value = 1`, `histology` no nula, una gradación de referencia `nottingham` y `grade = "Nottingham grado 2"`; existen los biomarcadores HER2 con valor `3+` y receptor de estrógeno positivo, y un `clinical_attribute` con `attribute_key = estado_menopausico`

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
