## MODIFIED Requirements

### Requirement: Seed sintético de demo con pacientes y usuarios de OL-01
`npx prisma db seed` SHALL cargar los usuarios de demo `doc1@test.local` (`doctor`) y `admin@test.local` (`admin`), activos, con hash Argon2id, y los pacientes sintéticos (a)–(e) de OL-01, cada uno con `data_origin = sintetico`, `agreement_reference` no nulo y un `care_episode` abierto, y sus datos clínicos con `entry_method = seed` y `review_status = verificado`. Desde el S2 MUST escribir en `identity.patient_identity` las identidades sintéticas de los cinco pacientes, cifradas con `IdentityService` (RN-10) y sin contraseñas ni datos reales en el repo (RN-14).

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
