## MODIFIED Requirements

### Requirement: Seed sintético de demo con pacientes y usuarios de OL-01
`npx prisma db seed` SHALL cargar `doc1@test.local` (`doctor`) y `admin@test.local` (`admin`), activos y con hash Argon2id, y los pacientes sintéticos (a)–(e) de OL-01 y (f)–(l) de US-254 con `data_origin = sintetico`, `agreement_reference` y un `care_episode` abierto, con datos clínicos `entry_method = seed` y `review_status = verificado`. MUST escribir en `identity.patient_identity` una identidad cifrada por paciente semilla con `IdentityService` (RN-10), sin datos reales (RN-14).

#### Scenario: El seed crea los cinco pacientes sintéticos con convenio y episodio abierto [US-039 AC-1] [OL-01] [RN-15]
- **WHEN** en un entorno `APP_ENV=local` con el esquema migrado se ejecuta `npx prisma db seed`
- **THEN** `clinical.patient` contiene los pacientes (a) a (e) y (f) a (l), todos con `data_origin = sintetico` y `agreement_reference` no nulo, cada uno con un único `care_episode` con `closed_at` nulo, y todos sus `diagnosis`, `diagnosis_grading`, `biomarker`, `prior_treatment`, `clinical_event` y `clinical_attribute` tienen `entry_method = seed` y `review_status = verificado`

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
- **THEN** el conteo es igual al de pacientes semilla (12: (a)–(e) y (f)–(l)), con `id_type = sintetico` y sin el número ni el nombre sintético en claro

Regresión [RN-10] activa desde S2 (US-046 AC-6): identidades sintéticas del seed cifradas con la librería de la aplicación e índice ciego (l1d-200).

## ADDED Requirements

### Requirement: Pacientes semilla en distintos momentos de la enfermedad
El seed MUST incluir 7 pacientes sintéticos nuevos (f)–(l): en mama, diagnóstico inicial sin tratar, adyuvante tras cirugía, recaída local, metastásico en primera línea y metastásico tras trastuzumab, pertuzumab y trastuzumab emtansina; en próstata, metastásico sensible y resistente a la castración. Sus atributos MUST usar valores del catálogo (RN-29) y sus códigos solo del catálogo (RN-27).

#### Scenario: El seed carga los siete momentos de la enfermedad [US-254 AC-1] [CAP-02]
- **GIVEN** el esquema migrado y el catálogo real montado
- **WHEN** se ejecuta el seed y el test de conteos consulta los pacientes (f)–(l) por su `idSembrado`
- **THEN** existen los 7, cada uno con un diagnóstico activo del tipo de cáncer de su momento (5 de mama y 2 de próstata) y `clinical.patient` cuenta 12 pacientes semilla
- **AND** (j) tiene tratamientos previos con trastuzumab, pertuzumab y trastuzumab emtansina; (k) tiene `estado_castracion = sensible_castracion` (valor que añade `l1d-80` en `atributos.json` 1.2.0 / manifest 1.4.0) y (l) `resistente_castracion`
- **AND** el régimen con leuprorelina de (k) y de (l) lleva `L02AE02` entre sus `atc_codes`, y ningún tratamiento sembrado lleva un código ATC que no esté en el subconjunto real del catálogo (nunca `ATC-T-LEUP`)

#### Scenario: Un régimen sin código en el catálogo queda no_mapeado [US-254 AC-1] [RN-27]
- **GIVEN** un tratamiento previo de (f)–(l) cuyo régimen no está en el subconjunto ATC del catálogo
- **WHEN** se ejecuta el seed
- **THEN** su `prior_treatment` tiene `atc_codes` vacío y `mapping_status = no_mapeado`, nunca un código escrito a mano

### Requirement: Historia de tratamientos y eventos coherente con el momento de la enfermedad
Cada paciente nuevo MUST tener sus tratamientos previos numerados por línea (1..n, sin huecos, inicio creciente; una línea terminada con fecha y motivo de fin) y sus eventos fechados en días relativos a `SEED_REFERENCE_DATE`, nunca antes del diagnóstico ni en el futuro. La regla MUST vivir en un único método con nombre (`historiaCoherente()`).

#### Scenario: La vista de caso muestra los tratamientos por línea y los eventos de cada paciente nuevo [US-254 AC-2] [RN-11]
- **GIVEN** el seed aplicado y `doc1@test.local` con sesión válida
- **WHEN** pide `GET /platform/patients/{id}/case` para cada paciente (f)–(l)
- **THEN** `priorTreatments` trae sus líneas en orden con `setting` y fechas de inicio y fin, y `timeline` trae sus eventos (`cirugia`, `recaida`, `progresion`) en orden cronológico, validados contra el spec

#### Scenario: Las fechas de la historia son coherentes con su momento [US-254 AC-2] (Decidido, usuario, 2026-11-03)
- **GIVEN** los 12 pacientes semilla
- **WHEN** el test aplica `historiaCoherente()` a cada uno
- **THEN** ninguno tiene una línea que empiece antes del diagnóstico, una línea que termine antes de empezar o después del inicio de la siguiente, un evento anterior al diagnóstico ni una fecha posterior a `SEED_REFERENCE_DATE`

#### Scenario: Una historia incoherente se detecta [US-254 AC-2] (Decidido, usuario, 2026-11-03)
- **GIVEN** una copia de (j) cuya línea 2 empieza antes del fin de la línea 1
- **WHEN** el test aplica `historiaCoherente()`
- **THEN** la regla devuelve el incumplimiento nombrando la clave del tratamiento

Regresión [RN-11] activa desde S2 (US-049): el contexto hacia la IA lleva fechas relativas y seudónimo por consulta; este change no lo altera.

### Requirement: Faltantes críticos variados entre los pacientes nuevos
Entre los pacientes (f)–(l), el checklist de faltantes calculado por el servicio de completitud con el catálogo montado MUST dar al menos dos pacientes con conjuntos de faltantes críticos distintos y no vacíos y al menos uno sin ninguno.

#### Scenario: Dos pacientes con faltantes distintos y uno sin faltantes [US-254 AC-3] [CAP-04]
- **GIVEN** el seed aplicado y el catálogo real
- **WHEN** se calcula `GET /platform/patients/{id}/completeness` para (f)–(l)
- **THEN** al menos dos pacientes tienen conjuntos de claves `faltante` distintos y no vacíos (p. ej. (f) y (k))
- **AND** al menos uno ((j)) no tiene ningún ítem `faltante`, y ningún faltante bloquea la ficha (RN-26)

### Requirement: Identificadores sintéticos y deterministas de los pacientes nuevos
Los pacientes (f)–(l) y todas sus filas MUST tener identificadores `idSembrado(<clave natural>)` estables entre ejecuciones e identidades sintéticas `SINT-0000006`…`SINT-0000012` de tipo `sintetico`; el escaneo de PII y secretos de la CI MUST NOT encontrar nada en el seed ni en los ejemplos (RN-13, RN-14).

#### Scenario: Los identificadores son sintéticos, deterministas e idempotentes [US-254 AC-5] [RN-13] [RN-14]
- **GIVEN** el seed ampliado ejecutado dos veces
- **WHEN** el test compara los `id` de (f)–(l) y de sus filas tras cada ejecución y lee sus identidades con `IdentityService`
- **THEN** los `id` son idénticos y coinciden con `idSembrado`, los conteos por tabla no cambian, y las identidades son `SINT-0000006`…`SINT-0000012` con `id_type = sintetico`

#### Scenario: El escaneo de la CI no encuentra PII ni secretos [US-254 AC-5] [RN-14]
- **GIVEN** el PR con los ficheros del seed, la guía y los ejemplos nuevos
- **WHEN** corren los jobs de escaneo de secretos y de PII de la CI
- **THEN** no reportan ningún hallazgo

#### Scenario: En entorno piloto el seed ampliado se niega [US-254 AC-5] [RN-13]
- **GIVEN** el entorno marcado como piloto
- **WHEN** se ejecuta `clinical-seed`
- **THEN** termina con error sin escribir ninguna fila de (a)–(l)
