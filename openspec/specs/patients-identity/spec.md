# patients-identity Specification

## Purpose
Define la identidad del paciente en clinical-api: cifrado AES-256-GCM en el schema identity, índice ciego HMAC para la búsqueda exacta, listado enmascarado y ficha mínima, sin que la identidad salga hacia IA, logs ni auditoría (RN-10, FR-02, FR-04).

## Requirements

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

### Requirement: El contador de faltantes de la ficha sale del servicio de completitud
`PatientSummary.missingCriticalCount` MUST ser el número de ítems `faltante` que calcula el mismo servicio de completitud que `/completeness`, y SHALL NOT ser un valor fijo. Un faltante SHALL NOT bloquear la ficha (RN-26). Si el tipo no está habilitado o no hay `Diagnosis` activo, `missingCriticalCount` MUST ser `0`. Si el cálculo del checklist falla, la ficha MUST responder `200` con `missingCriticalCount = 0` y `completenessAvailable = false`, nunca `5xx`.

#### Scenario: F-M2 tiene seis faltantes en la ficha [US-003 AC-2] [AC-04.1]
- **GIVEN** el paciente F-M2 y el catálogo `test-1.0.0`
- **WHEN** se llama a `GET /platform/patients/{id}` con una sesión `clinical:read`
- **THEN** `PatientSummary.missingCriticalCount = 6`
- **AND** es igual al número de ítems `faltante` de `/completeness` para F-M2

#### Scenario: La ficha no cae si falla el checklist [US-003 AC-2] [RN-26] (decidido por defecto, Gate 1)
- **GIVEN** el paciente F-M2 y un fallo al calcular su checklist (servicio de la ficha armado por su *factory* con un puerto de catálogo que lanza)
- **WHEN** se llama a `GET /platform/patients/{id}` con una sesión `clinical:read`
- **THEN** la respuesta es `200` con `missingCriticalCount = 0` y `completenessAvailable = false`
- **AND** el log no contiene valores clínicos ni la identidad del paciente

### Requirement: El listado y la búsqueda no calculan el checklist en el S4
El listado y la búsqueda de pacientes MUST NOT invocar el servicio de completitud por fila en el S4: `PatientListItem` conserva su forma y su `missingCriticalCount` el valor actual, con cualquier sesión (decisión Q2, usuario, 2026-10-30; RN-26).

#### Scenario: El listado no invoca el servicio de completitud [US-003 AC-2] [RN-26] (decisión Q2, 2026-10-30)
- **GIVEN** un doctor con sesión `clinical:read` y el servicio de completitud armado por su *factory* con un fake que cuenta invocaciones
- **WHEN** llama al listado y a la búsqueda de pacientes
- **THEN** el fake no se invoca
- **AND** cada `PatientListItem` es igual al de `main` (sin `completenessAvailable`)

### Requirement: Anclas con foco en las secciones existentes de la ficha
Los encabezados `h2` de las secciones de diagnóstico y biomarcadores de la ficha MUST llevar `id="diagnostico"` y `id="biomarcadores"` con `tabindex="-1"`, y MUST recibir el foco al llegar con ese fragmento en la URL; MUST NOT crearse secciones nuevas. El componente que da el foco MUST aceptar solo los fragmentos de la lista permitida `{diagnostico, biomarcadores}` y resolverlos con `getElementById`; MUST NOT usar `querySelector` ni ningún selector armado con `location.hash` en crudo.

#### Scenario: El encabezado de destino recibe el foco [US-005 AC-3] [US-005 AC-7] [NFR-12] [S4 resp. 14]
- **GIVEN** la ficha de un paciente
- **WHEN** se abre `/pacientes/{id}#biomarcadores` (y, en otra prueba, `#diagnostico`)
- **THEN** el `h2` con ese `id` y `tabindex="-1"` es el elemento enfocado
- **AND** la ficha no tiene secciones nuevas respecto de la existente

#### Scenario: Un fragmento fuera de la lista permitida no mueve el foco [US-005 AC-3] [privacy Gate 1]
- **GIVEN** la ficha de un paciente
- **WHEN** se abre `/pacientes/{id}#x"],img` (o cualquier fragmento distinto de `diagnostico` y `biomarcadores`)
- **THEN** no se lanza ningún error, no se llama a `querySelector` y el foco no se mueve a ningún elemento por el fragmento

### Requirement: La ficha avisa si no se pudieron verificar los datos críticos
Si `PatientSummary.completenessAvailable` es `false`, la ficha MUST mostrar el aviso no bloqueante «No se pudieron verificar los datos críticos» con `role="status"` y MUST NOT mostrar un contador `0` ni «sin faltantes». El aviso SHALL NOT deshabilitar ni ocultar ninguna acción ni sección de la ficha (RN-26). Ausente o `true`, no se muestra (decisión Q2, usuario, 2026-10-30).

#### Scenario: Con el checklist no disponible la ficha muestra el aviso y no un cero [US-003 AC-2] [US-005 AC-5] [RN-26] (decisión Q2, 2026-10-30)
- **GIVEN** la ficha de un paciente cuyo `PatientSummary` es `contracts/examples/patient-summary-checklist-no-disponible.json` (`completenessAvailable = false`, `missingCriticalCount = 0`)
- **WHEN** el oncólogo abre `/pacientes/{id}`
- **THEN** se lee «No se pudieron verificar los datos críticos» en una región `role="status"`
- **AND** no aparece «0» como contador de faltantes ni «sin faltantes»
- **AND** las secciones y acciones de la ficha siguen disponibles, incluido el enlace al análisis

#### Scenario: Con el checklist disponible la ficha no muestra el aviso [US-003 AC-2] (decisión Q2, 2026-10-30)
- **GIVEN** la ficha de un paciente cuyo `PatientSummary` es `contracts/examples/patient-summary-doctor.json` (`completenessAvailable` ausente)
- **WHEN** el oncólogo abre `/pacientes/{id}`
- **THEN** no aparece «No se pudieron verificar los datos críticos»
