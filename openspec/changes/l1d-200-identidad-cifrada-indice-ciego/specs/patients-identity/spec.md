## ADDED Requirements

### Requirement: Identidad cifrada en la aplicación con AES-256-GCM
`clinical-api` MUST cifrar `national_id` y `full_name` de cada paciente con AES-256-GCM en la aplicación (nonce aleatorio por campo, AAD ligado al paciente, al campo y a la versión de clave) antes de escribir `identity.patient_identity`, y SHALL guardar la versión de la clave en `key_version`. Ninguna columna MUST contener el valor en claro.

#### Scenario: El SQL crudo no ve el documento ni el nombre y el servicio los descifra [US-046 AC-1] [NFR-09] [RN-10] [ADR-6] [OL-01]
- **GIVEN** FX-T4a-a guardado con `IdentityService`
- **WHEN** un test lee `identity.patient_identity` con SQL crudo
- **THEN** `national_id_ciphertext` y `full_name_ciphertext` no contienen `1234567` ni `Rondón` (ni en UTF-8 ni en hex) y `key_version = 1`
- **AND** `IdentityService.descifrar` devuelve `1234567` y "Lucía Fernanda Rondón Peña"

### Requirement: Índice ciego HMAC-SHA256 del documento
El índice ciego MUST ser `HMAC-SHA256` con una clave distinta de la de cifrado sobre `id_type` y el número normalizado (sin separadores); `issuing_country` MUST NOT entrar en el HMAC (la búsqueda no lo recibe) y sigue en su columna y en la restricción única. SHALL ser determinista para la misma entrada y distinto para números distintos.

#### Scenario: Mismo documento, mismo índice; otro número, otro índice [US-046 AC-2] [ADR-6] [FR-02]
- **GIVEN** dos cálculos del índice para `cedula_ciudadania` + `1234567` y uno para `cedula_ciudadania` + `123456`
- **WHEN** se comparan
- **THEN** los dos primeros son iguales, el tercero es distinto y ninguno contiene `1234567` ni `123456`

#### Scenario: Los separadores no cambian el índice [US-046 AC-2] (asumido)
- **WHEN** se calcula el índice de `cedula_ciudadania` + `1.234.567` y de `cedula_ciudadania` + `1234567`
- **THEN** ambos índices son iguales

#### Scenario: El país emisor no cambia el índice [US-046 AC-2] [FR-02] (Gate 1)
- **WHEN** se calcula el índice de `cedula_ciudadania` + `1234567` con `issuing_country = CO` y con `issuing_country` nulo
- **THEN** ambos índices son iguales

### Requirement: Error de integridad sin datos del paciente
Un texto cifrado alterado o con versión de clave desconocida MUST producir el error `IDENTITY_INTEGRITY_ERROR`; la respuesta HTTP SHALL ser `500 ErrorInterno` genérico sin datos del paciente y el log SHALL registrar solo el código y el `traceId`.

#### Scenario: Un byte alterado da 500 genérico y un log sin texto cifrado ni descifrado [US-046 AC-3] (asumido)
- **GIVEN** FX-T4a-a guardado y su `national_id_ciphertext` alterado en un byte con SQL crudo
- **WHEN** una operación de `clinical-api` descifra esa identidad
- **THEN** la respuesta es `500` con el cuerpo de `ErrorInterno` (`{ error, message, traceId }`), validado contra el spec, sin `1234567`, `Lucía` ni `Rondón`
- **AND** el log contiene `IDENTITY_INTEGRITY_ERROR` y no contiene bytes del cifrado ni el texto descifrado

### Requirement: La identidad nunca sale de clinical-api
El documento y el nombre del paciente MUST NOT aparecer en los *logs* de `web`, `clinical-api` ni `rag-orchestrator`, en `audit.*`, `research.*`, `clinical.ai_analysis_record` ni en el payload hacia `rag-orchestrator` (RN-10). El test de no-fuga es dueño de esta regla; cada salida nueva SHALL añadir su paso a ese test.

#### Scenario: Registrar y analizar no filtran la identidad [US-046 AC-4] [RN-10] [NFR-11] [AC-T4.2]
- **GIVEN** FX-T4a-a registrado con `IdentityService` y un análisis ejecutado sobre él con `rag-orchestrator` simulado por MSW que captura el payload
- **WHEN** el test busca `1234567`, `Lucía`, `Rondón`, la forma normalizada "lucia fernanda rondon pena" y los valores de `national_id_hmac` (y `full_name_hmac` cuando exista) de la fila en los logs de los tres servicios, en todas las columnas de texto y `jsonb` de `audit.*`, `research.*` y `clinical.ai_analysis_record`, y en el payload capturado
- **THEN** no aparece ninguno
- **AND** los pasos "consultar la ficha" (`l1d-72-ficha-minima-paciente`) y "buscarlo por documento" (`l1d-202-listado-busqueda-pacientes`) se añaden a este mismo test (`Regresión [RN-10] → US-046`)

### Requirement: Convivencia de versiones de clave
`clinical-api` MUST cifrar con la versión `IDENTITY_KEY_VERSION` y SHALL descifrar cualquier identidad cuya `key_version` tenga clave configurada; sin la clave activa MUST NOT arrancar.

#### Scenario: Una identidad v1 y una nueva v2 se descifran ambas [US-046 AC-5] (asumido)
- **GIVEN** una identidad cifrada con `key_version = 1` y la configuración con `IDENTITY_KEY_VERSION = 2`, la clave de la versión 2 activa y la de la versión 1 disponible
- **WHEN** se registra un paciente nuevo y se leen ambos
- **THEN** el nuevo tiene `key_version = 2` y los dos se descifran a sus valores originales

#### Scenario: Sin la clave activa clinical-api no arranca [US-046 AC-5] (asumido)
- **WHEN** `clinical-api` arranca con `IDENTITY_KEY_VERSION = 2` y sin la clave de la versión 2
- **THEN** termina con error que nombra la clave de configuración que falta y no contiene ningún valor de clave

### Requirement: Identidades cifradas en el seed sintético
El seed sintético MUST escribir la identidad de los pacientes semilla (a)–(e) con `IdentityService`, `id_type = sintetico`, sin columnas en claro.

#### Scenario: El seed deja identidades cifradas y descifrables [US-046 AC-6] [RN-10] [OL-01]
- **GIVEN** el seed sintético de US-039 aplicado con este change
- **WHEN** un test lee `identity.patient_identity` con SQL crudo
- **THEN** existen las identidades de los pacientes (a)–(e) con `id_type = sintetico`, ninguna columna contiene el número ni el nombre sintético en claro y `IdentityService` las descifra

#### Scenario: En entorno piloto el seed se niega antes de leer las claves [US-046 AC-6] [RN-13] (Gate 1)
- **GIVEN** el entorno marcado como piloto y los archivos de clave presentes
- **WHEN** se ejecuta `clinical-seed`
- **THEN** termina con error sin haber abierto `IDENTITY_AES_KEY_FILE` ni `BLIND_INDEX_HMAC_KEY_FILE` y sin escribir filas

#### Scenario: Volver a correr el seed no duplica ni recifra [US-046 AC-6] (asumido)
- **WHEN** el seed se ejecuta dos veces
- **THEN** sigue habiendo una identidad por paciente semilla y sus blobs no cambian
